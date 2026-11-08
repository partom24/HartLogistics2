import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q5_GUARD_MARKER_KEY,Q5_GUARD_HISTORY_KEY,
  Q5_GUARD_MARKER_SCHEMA,Q5_GUARD_HISTORY_SCHEMA
} from '../candidates/transport/q5_world_guard_read.mjs';
import {
  Q5_EVENT_KINDS,Q5_EVENT_POLICY,previewQ5EventBoundary
} from '../candidates/transport/q5_event_boundary_policy.mjs';

const worldId='minecraft:overworld-fixture';
function fixture(phase='LEGACY',epoch=0){
  const raw=new Map([
    [Q5_GUARD_MARKER_KEY,JSON.stringify({
      schema:Q5_GUARD_MARKER_SCHEMA,worldId,phase,epoch,revision:epoch,
      authority:'Q4_ONLY'
    })],
    [Q5_GUARD_HISTORY_KEY,JSON.stringify({
      schema:Q5_GUARD_HISTORY_SCHEMA,worldId,highestEpoch:epoch,
      revision:epoch,everEntered:epoch>0
    })]
  ]);
  const reads=[];let writes=0;
  const world={
    getDynamicProperty:key=>{reads.push(key);return raw.get(key);},
    setDynamicProperty:()=>{writes++;}
  };
  return {raw,reads,world,get writes(){return writes}};
}
const op=(f,eventKind,targetKind,extra={})=>previewQ5EventBoundary({
  world:f.world,worldId,eventKind,targetKind,ownership:'hart',
  managed:true,...extra
});
const noAuthority =r=>{
  for(const field of ['canRoute','canMigrate','canResume','canDebitQ4',
    'canWriteQ5','canWriteWorld','canClearJournal'])
    assert.equal(r[field],false,field);
};
function held(r,reason){
  assert.equal(r.status,'HOLD');assert.equal(r.ok,false);
  if(reason)assert.equal(r.reason,reason);
  assert.equal(r.wouldRunHartCallback,false);
  noAuthority(r);
}
test('all explicitly named PG27 event seams have phase and supported target sets',()=>{
  assert.equal(Q5_EVENT_KINDS.length,11);
  for(const eventKind of Q5_EVENT_KINDS) {
    const rule=Q5_EVENT_POLICY[eventKind];
    assert.ok(['before','after','deferred'].includes(rule.phase));
    assert.ok(Array.isArray(rule.targets));
    assert.ok(rule.targets.length>=1);
  }
});
test('each managed BEFORE event is canceled in maintenance, without running Hart',()=>{
  const f=fixture('FROZEN',8);
  for(const [eventKind,rule] of Object.entries(Q5_EVENT_POLICY)){
    if(rule.phase!=='before')continue;
    for(const target of rule.targets){
      const r=op(f,eventKind,target);
      assert.equal(r.ok,true);
      assert.equal(r.status,'MAINTENANCE_HART_EVENT_BLOCKED_MODEL_ONLY');
      assert.equal(r.wouldCancelBeforeEvent,true);
      assert.equal(r.wouldRunHartCallback,false);
      assert.equal(r.wouldScheduleRetry,false);
      assert.equal(r.externalIsolationRequired,true);
      noAuthority(r);
    }
  }
  assert.equal(f.writes,0);
});
test('each managed AFTER event suppresses Hart effect but cannot cancel vanilla',()=>{
  const f=fixture('FROZEN',8);
  for(const [eventKind,rule] of Object.entries(Q5_EVENT_POLICY)){
    if(rule.phase!=='after')continue;
    for(const target of rule.targets){
      const r=op(f,eventKind,target);
      assert.equal(r.ok,true);
      assert.equal(r.wouldCancelBeforeEvent,false);
      assert.equal(r.wouldRunHartCallback,false);
      assert.equal(r.wouldScheduleRetry,false);
      assert.equal(r.externalIsolationRequired,true);
      noAuthority(r);
    }
  }
});
test('deferred retries after a maintenance transition never re-ingest ejected items',()=>{
  const f=fixture('REQUESTED',5);
  const r=op(f,'deferred_entity_ingress','ejected_item',{capturedEpoch:5});
  assert.equal(r.status,'MAINTENANCE_HART_EVENT_BLOCKED_MODEL_ONLY');
  assert.equal(r.wouldRunHartCallback,false);
  assert.equal(r.wouldScheduleRetry,false);
  assert.equal(r.wouldCancelBeforeEvent,false);
});
test('stale deferred callback epoch refuses before Q4 or physical mutation',()=>{
  const f=fixture('REQUESTED',5);
  for(const kind of ['deferred_entity_ingress','deferred_player_mutation',
                     'deferred_frame_mutation']){
    const target=Q5_EVENT_POLICY[kind].targets[0];
    held(op(f,kind,target,{capturedEpoch:0}),'deferred_epoch_stale');
    held(op(f,kind,target,{capturedEpoch:4}),'deferred_epoch_stale');
    held(op(f,kind,target),'deferred_epoch_stale');
  }
});
test('known legacy managed interactions are only source-eligible, NOT authorized',()=>{
  const f=fixture();
  for(const [kind,rule] of Object.entries(Q5_EVENT_POLICY)){
    const r=op(f,kind,rule.targets[0],
      rule.phase==='deferred'?{capturedEpoch:0}:{});
    assert.equal(r.ok,true,kind);
    assert.equal(r.status,'LEGACY_EVENT_ELIGIBILITY_MODEL_ONLY');
    assert.equal(r.wouldRunHartCallback,true);
    assert.equal(r.wouldCancelBeforeEvent,rule.phase==='before');
    assert.equal(r.requiresPrecommitFence,true);
    noAuthority(r);
  }
});
test('unmanaged vanilla sneak-placement edge is never indiscriminately canceled',()=>{
  const f=fixture('STAGING',10);
  const r=op(f,'before_interact_block','receiver',{managed:false});
  assert.equal(r.status,'VANILLA_TOPOLOGY_EDGE_UNRESOLVED');
  assert.equal(r.wouldCancelBeforeEvent,false);
  assert.equal(r.wouldRunHartCallback,false);
  assert.equal(r.externalIsolationRequired,true);
  noAuthority(r);
});
test('same unmanaged native-face placement remains vanilla under LEGACY',()=>{
  const f=fixture();
  const r=op(f,'before_interact_block','sorter_service_face',{managed:false});
  assert.equal(r.status,'VANILLA_TOPOLOGY_EDGE_UNRESOLVED');
  assert.equal(r.wouldCancelBeforeEvent,false);
  noAuthority(r);
});
test('foreign vanilla interaction is untouched even while Q5 marker is invalid',()=>{
  const f=fixture();f.raw.clear();
  const r=previewQ5EventBoundary({
    world:f.world,worldId,eventKind:'before_interact_block',
    ownership:'foreign',targetKind:'vanilla_chest',managed:false
  });
  assert.equal(r.status,'FOREIGN_EVENT_UNTOUCHED_MODEL_ONLY');
  assert.equal(r.wouldCancelBeforeEvent,false);
  assert.equal(r.wouldRunHartCallback,false);
  assert.equal(r.externalIsolationRequired,false);
  assert.equal(f.reads.length,0);
  noAuthority(r);
});
test('unknown ownership is a HOLD, not an invented safe cancellation',()=>{
  const f=fixture();
  held(op(f,'before_interact_block','receiver',{ownership:'unknown'}),
    'event_ownership_unverified');
  held(op(f,'after_entity_spawn','ejected_item',{ownership:'unknown'}),
    'event_ownership_unverified');
});
test('unknown target or event kind cannot bypass required source review',()=>{
  const f=fixture();
  held(op(f,'before_interact_block','foreign_chest'),'event_target_not_catalogued');
  held(op(f,'brand_new_event','sorter_service_face'),'unknown_event_entrypoint');
});
test('missing managed-face proof is held instead of enabling callbacks',()=>{
  const f=fixture();
  for(const managed of [null,undefined,'yes',0]){
    held(op(f,'before_interact_block','sorter_service_face',{managed}),
      'event_face_or_action_unverified');
  }
});
test('no cross-target event-kind borrowing can authorize a callback',()=>{
  const f=fixture();
  held(op(f,'after_entity_spawn','owned_filter_frame'),'event_target_not_catalogued');
  held(op(f,'before_item_use','receiver'),'event_target_not_catalogued');
  held(op(f,'after_break_block','ejected_item'),'event_target_not_catalogued');
});
test('unbootstrapped marker cancels managed beforeEvents and suppresses afterEvents',()=>{
  const f=fixture();f.raw.clear();
  const a=op(f,'before_player_break_block','sorter'); // invalid kind intentionally below
  held(a,'unknown_event_entrypoint');
  const b=op(f,'before_break_block','sorter');
  held(b,'maintenance_marker_hold:maintenance_marker_not_bootstrapped');
  assert.equal(b.wouldCancelBeforeEvent,true);
  const c=op(f,'after_entity_spawn','ejected_item');
  held(c,'maintenance_marker_hold:maintenance_marker_not_bootstrapped');
  assert.equal(c.wouldCancelBeforeEvent,false);
  assert.equal(f.writes,0);
});
test('torn Q5 marker and unreadable world cause fail-closed Hart event',()=>{
  for(const mutate of [
    f=>f.raw.delete(Q5_GUARD_HISTORY_KEY),
    f=>f.raw.set(Q5_GUARD_MARKER_KEY,'not-json'),
    f=>{f.world.getDynamicProperty=()=>{throw Error('unavailable');};}
  ]){
    const f=fixture();mutate(f);
    const r=op(f,'before_interact_block','collector');
    held(r);
    assert.equal(r.wouldCancelBeforeEvent,true);
    assert.equal(r.externalIsolationRequired,true);
  }
});
test('every maintenance phase preserves no Hart callback, Q4 debit or world-write rights',()=>{
  for(const phase of ['REQUESTED','FROZEN','STAGING','VERIFYING',
                       'RESUME_PENDING','BLOCKED']){
    const f=fixture(phase,6);
    for(const kind of Q5_EVENT_KINDS){
      const rule=Q5_EVENT_POLICY[kind];
      const r=op(f,kind,rule.targets[0],
        rule.phase==='deferred'?{capturedEpoch:6}:{});
      assert.equal(r.ok,true,kind);
      assert.equal(r.wouldRunHartCallback,false);
      noAuthority(r);
    }
  }
});
test('wrong worldId or malformed ownership never permits a managed event',()=>{
  const f=fixture();
  held(op(f,'before_interact_block','collector',{worldId:'other'}),
    'maintenance_marker_hold:inconsistent_maintenance_marker');
  held(op(f,'before_interact_block','collector',{worldId:''}),
    'unknown_world_identity');
  held(op(f,'before_interact_block','collector',{ownership:'unclassified'}),
    'unclassified_event_owner');
});
test('no events, items, dynamic properties or cancellation flags are mutated',()=>{
  const f=fixture('STAGING',8);
  const original=JSON.stringify([...f.raw]);
  const event={cancel:false,entity:{typeId:'minecraft:item'},amount:12};
  for(const kind of Q5_EVENT_KINDS){
    const rule=Q5_EVENT_POLICY[kind];
    previewQ5EventBoundary({
      ...opArgs(f,kind,rule.targets[0],rule.phase==='deferred'?8:undefined),
      event
    });
  }
  function opArgs(f,eventKind,targetKind,capturedEpoch) {
    return {world:f.world,worldId,eventKind,targetKind,ownership:'hart',
      managed:true,capturedEpoch};
  }
  assert.equal(event.cancel,false);
  assert.equal(event.entity.typeId,'minecraft:item');
  assert.equal(JSON.stringify([...f.raw]),original);
  assert.equal(f.writes,0);
});
test('model never returns an executable callback or Q5 cutover permit',()=>{
  const f=fixture('REQUESTED',4);
  const r=op(f,'before_interact_entity','owned_filter_display');
  assert.equal(r.ok,true);
  assert.equal(Object.keys(r).includes('callback'),false);
  assert.equal(Object.keys(r).includes('writes'),false);
  assert.equal(Object.keys(r).includes('permit'),false);
  noAuthority(r);
});
