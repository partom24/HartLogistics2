import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_FROZEN_HANDLERS} from '../candidates/transport/q5_shadow_staging.mjs';
import {
  Q5_GUARD_MARKER_KEY,Q5_GUARD_HISTORY_KEY,
  Q5_GUARD_MARKER_SCHEMA,Q5_GUARD_HISTORY_SCHEMA
} from '../candidates/transport/q5_world_guard_read.mjs';
import {
  Q5_LEGACY_FENCE_SITES,createQ5LegacyFenceSession
} from '../candidates/transport/q5_legacy_precommit_fence.mjs';

const worldId='minecraft:overworld-test';
const handlerId='sorter_physical';
const sourceKey='sorter:123,70,-45';
const version=(phase='LEGACY',epoch=0,revision=0)=>({
  marker:{schema:Q5_GUARD_MARKER_SCHEMA,worldId,epoch,revision,
    authority:'Q4_ONLY',phase},
  history:{schema:Q5_GUARD_HISTORY_SCHEMA,worldId,revision,
    highestEpoch:epoch,everEntered:epoch>0}
});
function fixture(phase='LEGACY',epoch=0){
  const {marker,history}=version(phase,epoch,epoch);
  const records=new Map([
    [Q5_GUARD_MARKER_KEY,JSON.stringify(marker)],
    [Q5_GUARD_HISTORY_KEY,JSON.stringify(history)]
  ]);
  const readLog=[];
  let writes=0;
  const world={
    getDynamicProperty:key=>{readLog.push(key);return records.get(key);},
    setDynamicProperty:()=>{writes++;},
    get writes(){return writes;}
  };
  return {world,records,readLog};
}
const args=f=>({world:f.world,worldId,handlerId,sourceKey});
const commitArgs=(f,token,mutationSite='physical_inventory_move')=>({
  ...args(f),token,mutationSite
});
function assertNoPermission(r) {
  for(const key of ['canRoute','canMigrate','canResume','canDebitQ4',
    'canWriteQ5','canWriteWorld','canClearJournal']) {
    assert.equal(r[key],false,key);
  }
}
function hold(r,reason){
  assert.equal(r.ok,false);
  assert.equal(r.status,'HOLD');
  assert.equal(r.wouldPassLegacyFence,false);
  if(reason)assert.equal(r.reason,reason);
  assertNoPermission(r);
}
function mutate(f,phase,epoch,revision=epoch){
  const v=version(phase,epoch,revision);
  f.records.set(Q5_GUARD_MARKER_KEY,JSON.stringify(v.marker));
  f.records.set(Q5_GUARD_HISTORY_KEY,JSON.stringify(v.history));
}

test('stable explicit LEGACY pair gets model eligibility only, NEVER write permission',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const before=JSON.stringify([...f.records]);
  const started=session.capture(args(f));
  assert.equal(started.ok,true);
  assert.equal(started.status,'CAPTURED_LEGACY_MODEL_ONLY');
  assert.equal(started.wouldPassLegacyFence,false);
  assertNoPermission(started);
  const checked=session.precommit(commitArgs(f,started.token));
  assert.equal(checked.ok,true);
  assert.equal(checked.status,'LEGACY_PRECOMMIT_MODEL_ONLY');
  assert.equal(checked.wouldPassLegacyFence,true);
  assertNoPermission(checked);
  assert.equal(JSON.stringify([...f.records]),before);
  assert.equal(f.world.writes,0);
});
test('all known physical, entity, queue, journal and registry sites are classified',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  assert.equal(new Set(Q5_LEGACY_FENCE_SITES).size,Q5_LEGACY_FENCE_SITES.length);
  for(const mutationSite of Q5_LEGACY_FENCE_SITES) {
    const token=session.capture(args(f)).token;
    const result=session.precommit(commitArgs(f,token,mutationSite));
    assert.equal(result.wouldPassLegacyFence,true,mutationSite);
    assertNoPermission(result);
  }
  assert.equal(f.world.writes,0);
});
test('every approved handler category is explicitly checked and cannot write',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  for(const name of REQUIRED_FROZEN_HANDLERS) {
    const token=session.capture({...args(f),handlerId:name}).token;
    const result=session.precommit({...commitArgs(f,token),handlerId:name});
    assert.equal(result.ok,true,name);
    assertNoPermission(result);
  }
});
test('every positive maintenance phase REFUSES initial Q4 operation',()=>{
  for(const phase of ['REQUESTED','FROZEN','STAGING','VERIFYING',
                       'RESUME_PENDING','BLOCKED']) {
    const f=fixture(phase,9),session=createQ5LegacyFenceSession();
    hold(session.capture(args(f)),'maintenance_active_or_unknown');
  }
});
test('request for maintenance after callback capture blocks precommit and consumes token',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const token=session.capture(args(f)).token;
  mutate(f,'REQUESTED',1);
  hold(session.precommit(commitArgs(f,token)),'maintenance_active_or_unknown');
  mutate(f,'LEGACY',0);
  hold(session.precommit(commitArgs(f,token)),'fence_token_replayed');
  assert.equal(f.world.writes,0);
});
test('changed marker revision with still-LEGACY status blocks original callback',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const token=session.capture(args(f)).token;
  mutate(f,'LEGACY',0,1);
  hold(session.precommit(commitArgs(f,token)),'marker_or_history_changed_after_capture');
});
test('changed marker bytes without semantic change also invalidate captured token',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const token=session.capture(args(f)).token;
  const raw=f.records.get(Q5_GUARD_MARKER_KEY);
  f.records.set(Q5_GUARD_MARKER_KEY,'  '+raw);
  hold(session.precommit(commitArgs(f,token)),'marker_or_history_changed_after_capture');
});
test('changed history bytes invalidate captured token even with matching marker',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const token=session.capture(args(f)).token;
  const raw=f.records.get(Q5_GUARD_HISTORY_KEY);
  f.records.set(Q5_GUARD_HISTORY_KEY,raw+' ');
  hold(session.precommit(commitArgs(f,token)),'marker_or_history_changed_after_capture');
});
test('missing/unbootstrapped or single-record world refuses capture',()=>{
  for(const missing of [
    [Q5_GUARD_MARKER_KEY,Q5_GUARD_HISTORY_KEY],
    [Q5_GUARD_MARKER_KEY],[Q5_GUARD_HISTORY_KEY]
  ]) {
    const f=fixture(),session=createQ5LegacyFenceSession();
    for(const key of missing)f.records.delete(key);
    hold(session.capture(args(f)));
  }
});
test('malformed, wrong world ID and untrusted maintenance history refuse',()=>{
  for(const corrupt of [
    f=>f.records.set(Q5_GUARD_MARKER_KEY,'{'),
    f=>f.records.set(Q5_GUARD_HISTORY_KEY,'false'),
    f=>{const history=JSON.parse(f.records.get(Q5_GUARD_HISTORY_KEY));
      history.worldId='foreign';f.records.set(Q5_GUARD_HISTORY_KEY,JSON.stringify(history));},
    f=>{const history=JSON.parse(f.records.get(Q5_GUARD_HISTORY_KEY));
      history.everEntered=true;f.records.set(Q5_GUARD_HISTORY_KEY,JSON.stringify(history));}
  ]) {
    const f=fixture(),session=createQ5LegacyFenceSession();
    corrupt(f);hold(session.capture(args(f)));
  }
});
test('read failure during capture or final commit returns HOLD, never a fallback',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const get=f.world.getDynamicProperty;
  f.world.getDynamicProperty=()=>{throw Error('unloaded');};
  hold(session.capture(args(f)),'marker_read_failed');
  f.world.getDynamicProperty=get;
  const token=session.capture(args(f)).token;
  f.world.getDynamicProperty=()=>{throw Error('unloaded');};
  hold(session.precommit(commitArgs(f,token)),'marker_read_failed');
  assert.equal(f.world.writes,0);
});
test('mid-pass property drift is a HOLD at both start and precommit',()=>{
  for(const inPrecommit of [false,true]) {
    const f=fixture(),session=createQ5LegacyFenceSession();
    const token=inPrecommit?session.capture(args(f)).token:null;
    const get=f.world.getDynamicProperty;
    let calls=0;
    f.world.getDynamicProperty=key=>{
      const value=get(key);calls++;
      if(calls===2)mutate(f,'REQUESTED',1);
      return value;
    };
    if(inPrecommit)hold(session.precommit(commitArgs(f,token)),
      'marker_changed_within_pass');
    else hold(session.capture(args(f)),'marker_changed_within_pass');
  }
});
test('drift between initial observation and marker validation is detected',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const get=f.world.getDynamicProperty;
  let calls=0;
  f.world.getDynamicProperty=key=>{
    const value=get(key);calls++;
    if(calls===4)mutate(f,'REQUESTED',2);
    return value;
  };
  hold(session.capture(args(f)));
});
test('drift after validator, before final raw read is detected',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const get=f.world.getDynamicProperty;
  let calls=0;
  f.world.getDynamicProperty=key=>{
    const value=get(key);calls++;
    if(calls===8)f.records.set(Q5_GUARD_MARKER_KEY,
      ' '+f.records.get(Q5_GUARD_MARKER_KEY));
    return value;
  };
  hold(session.capture(args(f)),'marker_changed_during_validation');
});
test('unknown or stale handler never receives a token or mutable permission',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  hold(session.capture({...args(f),handlerId:'unknown_new_writer'}),
    'unknown_hart_handler');
  hold(session.capture({...args(f),worldId:''}),'unknown_world_or_source');
  hold(session.capture({...args(f),sourceKey:''}),'unknown_world_or_source');
});
test('unknown mutation site consumes the one-use token',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const token=session.capture(args(f)).token;
  hold(session.precommit(commitArgs(f,token,'new_unclassified_writer')),
    'unclassified_mutation_site');
  hold(session.precommit(commitArgs(f,token)),'fence_token_replayed');
});
test('world, handler, source and world-id swaps all invalidate the token',()=>{
  for(const mutateArgs of [
    arg=>({...arg,world:{getDynamicProperty:key=>arg.world.getDynamicProperty(key)}}),
    arg=>({...arg,handlerId:'collector_q4_ingress'}),
    arg=>({...arg,sourceKey:'other-sorter'}),
    arg=>({...arg,worldId:'another-world'})
  ]) {
    const f=fixture(),session=createQ5LegacyFenceSession();
    const token=session.capture(args(f)).token;
    hold(session.precommit(mutateArgs(commitArgs(f,token))),'fence_context_changed');
    hold(session.precommit(commitArgs(f,token)),'fence_token_replayed');
  }
});
test('JSON copy or forged token cannot acquire a session issuance record',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const token=session.capture(args(f)).token;
  hold(session.precommit(commitArgs(f,JSON.parse(JSON.stringify(token)))),
    'unknown_or_restarted_fence_token');
  hold(session.precommit(commitArgs(f,{...token})),
    'unknown_or_restarted_fence_token');
  assert.equal(session.precommit(commitArgs(f,token)).ok,true);
});
test('replayed success and failed token cannot be used twice',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const token=session.capture(args(f)).token;
  assert.equal(session.precommit(commitArgs(f,token)).ok,true);
  hold(session.precommit(commitArgs(f,token)),'fence_token_replayed');
  const bad=session.capture(args(f)).token;
  hold(session.precommit(commitArgs(f,bad,'unsupported')),
    'unclassified_mutation_site');
  hold(session.precommit(commitArgs(f,bad)),'fence_token_replayed');
});
test('restart (new session) cannot accept old transient callback token',()=>{
  const f=fixture(),before=createQ5LegacyFenceSession();
  const token=before.capture(args(f)).token;
  const restarted=createQ5LegacyFenceSession();
  hold(restarted.precommit(commitArgs(f,token)),
    'unknown_or_restarted_fence_token');
  const fresh=restarted.capture(args(f)).token;
  assert.equal(restarted.precommit(commitArgs(f,fresh)).ok,true);
});
test('a token is frozen and does not carry executable source or Q4 authority',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const r=session.capture(args(f));
  assert.equal(Object.isFrozen(r.token),true);
  assert.deepEqual(Object.keys(r.token).sort(),
    ['handlerId','kind','sourceKey','worldId'].sort());
  assert.equal('canWriteWorld' in r.token,false);
  assert.equal('commit' in r.token,false);
  assertNoPermission(r);
});
test('all inspections are synchronous, no mutation callback is executed',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  let callCount=0;
  const token=session.capture({...args(f), writer:()=>callCount++}).token;
  const result=session.precommit({...commitArgs(f,token),
    beforeWrite:()=>callCount++,write:()=>callCount++});
  assert.equal(result.ok,true);
  assert.equal(callCount,0);
  assert.equal(f.world.writes,0);
});
test('ABA restoration cannot be detected by model and never grants live write permission',()=>{
  const f=fixture(),session=createQ5LegacyFenceSession();
  const before=JSON.stringify([...f.records]);
  const token=session.capture(args(f)).token;
  mutate(f,'REQUESTED',1);
  f.records.clear();
  for(const [key,raw] of JSON.parse(before))f.records.set(key,raw);
  const result=session.precommit(commitArgs(f,token));
  assert.equal(result.status,'LEGACY_PRECOMMIT_MODEL_ONLY');
  assertNoPermission(result);
  // This limitation MUST be solved by a monotonic durable epoch/history
  // witness before real routing integration. Do not use this as authorization.
});
test('source state is unchanged by dozens of legal and refused attempts',()=>{
  const f=fixture(),before=JSON.stringify([...f.records]);
  const session=createQ5LegacyFenceSession();
  for(let i=0;i<30;i++){
    const token=session.capture(args(f)).token;
    session.precommit(commitArgs(f,token));
    hold(session.precommit(commitArgs(f,token)),'fence_token_replayed');
  }
  assert.equal(JSON.stringify([...f.records]),before);
  assert.equal(f.world.writes,0);
});
