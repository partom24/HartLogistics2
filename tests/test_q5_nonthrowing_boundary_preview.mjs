import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q5_GUARD_MARKER_KEY,Q5_GUARD_HISTORY_KEY,
  Q5_GUARD_MARKER_SCHEMA,Q5_GUARD_HISTORY_SCHEMA
} from '../candidates/transport/q5_world_guard_read.mjs';
import {
  Q5_LEGACY_FENCE_SITES
} from '../candidates/transport/q5_legacy_precommit_fence.mjs';
import {
  createQ5NonThrowingBoundaryPreview
} from '../candidates/transport/q5_nonthrowing_boundary_preview.mjs';

const worldId='minecraft:overworld-fixture';
const readonlyFields=[
  'canInstall','canFreezeWorld','canRoute','canMigrate','canResume',
  'canDebitQ4','canWriteQ5','canWriteWorld','canClearJournal',
  'wouldCallHartHandler','wouldInvokeNativeEffect',
  'abaExcluded','crashAtomicityProven'
];
function noAuthority(result) {
  for (const field of readonlyFields) assert.equal(result[field],false,field);
}
function fixture(phase='LEGACY',epoch=0) {
  const raw=new Map();
  const setPhase=(next,number)=>{
    raw.set(Q5_GUARD_MARKER_KEY,JSON.stringify({
      schema:Q5_GUARD_MARKER_SCHEMA,worldId,phase:next,epoch:number,
      revision:number,authority:'Q4_ONLY'
    }));
    raw.set(Q5_GUARD_HISTORY_KEY,JSON.stringify({
      schema:Q5_GUARD_HISTORY_SCHEMA,worldId,highestEpoch:number,
      revision:number,everEntered:number>0
    }));
  };
  setPhase(phase,epoch);
  let reads=0,writes=0;
  const world={
    getDynamicProperty:key=>{reads++;return raw.get(key);},
    setDynamicProperty:()=>{writes++;throw Error('read-only model wrote world');}
  };
  return {raw,world,setPhase,get reads(){return reads;},get writes(){return writes;}};
}
const before=(gate,f,extra={})=>gate.captureEvent({
  world:f.world,worldId,eventKind:'before_interact_block',
  ownership:'hart',targetKind:'receiver',managed:true,
  handlerId:'sorter_physical',sourceKey:'sorter:fixture:1',
  ...extra
});
const commit=(gate,ticket,f,extra={})=>gate.previewPrecommit({
  ticket,world:f.world,worldId,handlerId:'sorter_physical',
  sourceKey:'sorter:fixture:1',mutationSite:'physical_inventory_move',
  ...extra
});

test('LEGACY beforeEvent capture and physical precommit are two read-only decisions',()=>{
  const f=fixture(),gate=createQ5NonThrowingBoundaryPreview();
  const first=before(gate,f);
  assert.equal(first.status,'LEGACY_EVENT_CAPTURE_MODEL_ONLY');
  assert.equal(first.ok,true);
  assert.equal(first.wouldRequestManagedBeforeCancellation,false);
  noAuthority(first);
  const result=commit(gate,first.ticket,f);
  assert.equal(result.status,'LEGACY_PRECOMMIT_ELIGIBILITY_MODEL_ONLY');
  assert.equal(result.ok,true);
  assert.equal(result.externalIsolationRequired,true);
  noAuthority(result);
  assert.ok(f.reads>=16);
  assert.equal(f.writes,0);
});

test('all seven reviewed fence mutation families remain model-only',()=>{
  for (const mutationSite of Q5_LEGACY_FENCE_SITES) {
    const f=fixture(),gate=createQ5NonThrowingBoundaryPreview();
    const first=before(gate,f);
    assert.equal(first.ok,true,mutationSite);
    const result=commit(gate,first.ticket,f,{mutationSite});
    assert.equal(result.ok,true,mutationSite);
    noAuthority(result);
    assert.equal(f.writes,0,mutationSite);
  }
});

test('maintenance phase stops managed beforeEvent without throwing',()=>{
  const f=fixture('REQUESTED',1),gate=createQ5NonThrowingBoundaryPreview();
  const result=before(gate,f);
  assert.equal(result.ok,false);
  assert.equal(result.status,'HOLD');
  assert.equal(result.wouldRequestManagedBeforeCancellation,true);
  assert.equal(result.wouldCallHartHandler,false);
  noAuthority(result);
  assert.equal(f.writes,0);
});

test('absent or torn startup marker stops managed beforeEvent',()=>{
  for (const mode of ['missing','torn']) {
    const f=fixture(),gate=createQ5NonThrowingBoundaryPreview();
    if(mode==='missing') f.raw.delete(Q5_GUARD_HISTORY_KEY);
    else f.raw.set(Q5_GUARD_HISTORY_KEY,'{');
    const result=before(gate,f);
    assert.equal(result.ok,false,mode);
    assert.equal(result.wouldRequestManagedBeforeCancellation,true,mode);
    noAuthority(result);
    assert.equal(f.writes,0);
  }
});

test('foreign beforeEvents are untouched even during maintenance',()=>{
  const f=fixture('FROZEN',1),gate=createQ5NonThrowingBoundaryPreview();
  const result=before(gate,f,{ownership:'foreign',managed:false});
  assert.equal(result.status,'FOREIGN_UNTOUCHED_MODEL_ONLY');
  assert.equal(result.wouldRequestManagedBeforeCancellation,false);
  assert.equal(result.externalIsolationRequired,true);
  assert.equal(f.reads,0);
  noAuthority(result);
});

test('unmanaged vanilla topology edge requires external isolation, not cancellation',()=>{
  const f=fixture('FROZEN',1),gate=createQ5NonThrowingBoundaryPreview();
  const result=before(gate,f,{managed:false});
  assert.equal(result.ok,false);
  assert.match(result.reason,/vanilla_topology/);
  assert.equal(result.wouldRequestManagedBeforeCancellation,false);
  assert.equal(result.externalIsolationRequired,true);
  noAuthority(result);
});

test('unknown ownership, target and callback never acquire cancellation authority',()=>{
  for(const extra of [
    {ownership:'unknown'}, {eventKind:'unreviewed_new_callback'},
    {targetKind:'vanilla_chest'}, {managed:undefined}
  ]) {
    const f=fixture('FROZEN',1),gate=createQ5NonThrowingBoundaryPreview();
    const result=before(gate,f,extra);
    assert.equal(result.ok,false);
    assert.equal(result.wouldRequestManagedBeforeCancellation,false);
    noAuthority(result);
  }
});

test('afterEvent cannot pretend to retroactively isolate vanilla physical effects',()=>{
  const f=fixture(),gate=createQ5NonThrowingBoundaryPreview();
  const result=before(gate,f,{
    eventKind:'after_entity_spawn',targetKind:'ejected_item',
    handlerId:'entity_q4_ingress'
  });
  assert.equal(result.ok,false);
  assert.equal(result.reason,'after_event_external_effect_not_isolated');
  assert.equal(result.wouldRequestManagedBeforeCancellation,false);
  assert.equal(result.externalIsolationRequired,true);
  noAuthority(result);
});

test('deferred callback can only capture same legacy epoch; still no world writer',()=>{
  const f=fixture();
  const args={
    eventKind:'deferred_entity_ingress',targetKind:'ejected_item',
    handlerId:'entity_q4_ingress',capturedEpoch:0
  };
  const gate=createQ5NonThrowingBoundaryPreview();
  const captured=before(gate,f,args);
  assert.equal(captured.ok,true);
  const result=commit(gate,captured.ticket,f,{
    handlerId:'entity_q4_ingress',mutationSite:'q4_queue_append'
  });
  assert.equal(result.ok,true);
  noAuthority(result);
  const stale=before(gate,f,{...args,capturedEpoch:1});
  assert.equal(stale.ok,false);
  assert.equal(stale.wouldRequestManagedBeforeCancellation,false);
  noAuthority(stale);
});

test('maintenance transition between callback and native cutpoint refuses and latches',()=>{
  const f=fixture(),gate=createQ5NonThrowingBoundaryPreview();
  const captured=before(gate,f);
  assert.equal(captured.ok,true);
  f.setPhase('REQUESTED',1);
  const refused=commit(gate,captured.ticket,f);
  assert.equal(refused.ok,false);
  assert.match(refused.reason,/precommit_hold/);
  noAuthority(refused);
  f.setPhase('LEGACY',0);
  const again=before(gate,f);
  assert.equal(again.ok,false);
  assert.match(again.reason,/fence_capture_hold/);
  noAuthority(again);
  assert.equal(f.writes,0);
});

test('event ticket is single-use; source/handler/world mismatch consumes it',()=>{
  const f=fixture(),gate=createQ5NonThrowingBoundaryPreview();
  const captured=before(gate,f);
  assert.equal(commit(gate,captured.ticket,f,{handlerId:'q4_recovery'}).ok,false);
  const replay=commit(gate,captured.ticket,f);
  assert.equal(replay.ok,false);
  assert.equal(replay.reason,'event_ticket_replayed');
  noAuthority(replay);
});

test('old process tickets are rejected by fresh preview session',()=>{
  const f=fixture();
  const first=createQ5NonThrowingBoundaryPreview();
  const captured=before(first,f);
  const fresh=createQ5NonThrowingBoundaryPreview();
  const result=commit(fresh,captured.ticket,f);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'unknown_or_restarted_event_ticket');
  noAuthority(result);
});

test('unknown native mutation family fails closed and prevents subsequent capture',()=>{
  const f=fixture(),gate=createQ5NonThrowingBoundaryPreview();
  const captured=before(gate,f);
  const rejected=commit(gate,captured.ticket,f,{mutationSite:'unreviewed_native_alias'});
  assert.equal(rejected.ok,false);
  noAuthority(rejected);
  const next=before(gate,f);
  assert.equal(next.ok,false);
  assert.match(next.reason,/fence_capture_hold/);
});

test('read exception returns no-throw HOLD with managed beforeEvent cancellation request',()=>{
  const gate=createQ5NonThrowingBoundaryPreview();
  const f={world:{getDynamicProperty(){throw Error('BDS unavailable')}}};
  const result=before(gate,f);
  assert.equal(result.ok,false);
  assert.equal(result.wouldRequestManagedBeforeCancellation,true);
  noAuthority(result);
});

test('ABA history restoration is an explicit unresolved limitation, never authority',()=>{
  const f=fixture(),gate=createQ5NonThrowingBoundaryPreview();
  const captured=before(gate,f);
  f.setPhase('REQUESTED',1);
  f.setPhase('LEGACY',0);
  const result=commit(gate,captured.ticket,f);
  // An undetected change-then-revert can fool raw pair comparisons.
  // This test MUST NOT be misreported as Bedrock-atomic or ABA-safe.
  assert.equal(result.ok,true);
  assert.equal(result.abaExcluded,false);
  assert.equal(result.crashAtomicityProven,false);
  noAuthority(result);
});

test('no actual Bedrock event or native API is invoked by preview',()=>{
  const f=fixture(),gate=createQ5NonThrowingBoundaryPreview();
  const ev={cancel:false};
  const first=before(gate,f);
  const second=commit(gate,first.ticket,f);
  assert.equal(first.ok,true);
  assert.equal(second.ok,true);
  assert.equal(ev.cancel,false);
  assert.equal(f.writes,0);
  noAuthority(second);
});

test('null, malformed and empty inputs return HOLD without throwing',()=>{
  const gate=createQ5NonThrowingBoundaryPreview();
  for (const value of [null,42,'bad',[],undefined,{}]) {
    const first=gate.captureEvent(value);
    assert.equal(first.ok,false);
    noAuthority(first);
    const second=gate.previewPrecommit(value);
    assert.equal(second.ok,false);
    noAuthority(second);
  }
});

test('marker transition between event read and capture refuses before callback',()=>{
  const f=fixture(),gate=createQ5NonThrowingBoundaryPreview();
  const originalRead=f.world.getDynamicProperty;
  let reads=0;
  f.world.getDynamicProperty=key=>{
    reads++;
    if(reads===5) f.setPhase('REQUESTED',1);
    return originalRead(key);
  };
  const result=before(gate,f);
  assert.equal(result.ok,false);
  assert.equal(result.wouldRequestManagedBeforeCancellation,true);
  assert.match(result.reason,/fence_capture_hold/);
  noAuthority(result);
  assert.equal(f.writes,0);
});
