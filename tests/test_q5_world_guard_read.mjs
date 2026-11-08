import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_FROZEN_HANDLERS} from '../candidates/transport/q5_shadow_staging.mjs';
import {
  Q5_GUARD_MARKER_KEY,Q5_GUARD_HISTORY_KEY,
  Q5_GUARD_MARKER_SCHEMA,Q5_GUARD_HISTORY_SCHEMA,
  inspectQ5MaintenanceMarker,previewQ5GuardedHandler
} from '../candidates/transport/q5_world_guard_read.mjs';

const worldId='overworld-test';
const marker=(phase='LEGACY',epoch=0,revision=0)=>({
  schema:Q5_GUARD_MARKER_SCHEMA,worldId,epoch,phase,revision,authority:'Q4_ONLY'
});
const history=(epoch=0,revision=0,everEntered=false)=>({
  schema:Q5_GUARD_HISTORY_SCHEMA,worldId,highestEpoch:epoch,
  revision,everEntered
});
function fixture(phase='LEGACY',epoch=0){
  const records=new Map([
    [Q5_GUARD_MARKER_KEY,JSON.stringify(marker(phase,epoch,epoch))],
    [Q5_GUARD_HISTORY_KEY,JSON.stringify(history(epoch,epoch,epoch>0))]
  ]);
  const reads=[];
  let writes=0;
  const world={
    getDynamicProperty:key=>{reads.push(key);return records.get(key)},
    setDynamicProperty:()=>{writes++}
  };
  return {records,reads,world,get writes(){return writes}};
}
const inspect=(f,overrides={})=>inspectQ5MaintenanceMarker({
  world:f.world,worldId,...overrides
});
const action=(f,overrides={})=>previewQ5GuardedHandler({
  world:f.world,worldId,handlerId:'sorter_physical',
  capturedEpoch:0,...overrides
});
const allDenied=['canRoute','canMigrate','canResume','canDebitQ4',
  'canWriteQ5','canWriteWorld','canClearJournal'];
function denied(r){
  for(const field of allDenied)assert.equal(r[field],false,field);
}
function hold(r,reason){
  assert.equal(r.ok,false);assert.equal(r.status,'HOLD');
  if(reason)assert.equal(r.reason,reason);
  assert.equal(r.wouldPermitLegacy,false);
  denied(r);
}
function update(f,key,change){
  const obj=JSON.parse(f.records.get(key));
  Object.assign(obj,change);
  f.records.set(key,JSON.stringify(obj));
}
test('explicit two-record legacy bootstrap is preview-only, never an authority permit',()=>{
  const f=fixture(),before=JSON.stringify([...f.records]);
  const r=inspect(f);
  assert.equal(r.ok,true);
  assert.equal(r.status,'LEGACY_MODEL_READ_ONLY');
  assert.equal(r.wouldPermitLegacy,true);
  denied(r);
  assert.equal(f.reads.length,4);
  assert.equal(JSON.stringify([...f.records]),before);
  assert.equal(f.writes,0);
});
test('every maintenance phase blocks all Hart writer categories',()=>{
  for(const phase of ['REQUESTED','FROZEN','STAGING','VERIFYING',
                       'RESUME_PENDING','BLOCKED']){
    const f=fixture(phase,9);
    for(const name of REQUIRED_FROZEN_HANDLERS){
      const r=action(f,{handlerId:name,capturedEpoch:9});
      assert.equal(r.ok,true);
      assert.equal(r.status,'HANDLER_STOPPED_BY_MAINTENANCE');
      assert.equal(r.wouldPermitLegacy,false);
      denied(r);
    }
    assert.equal(f.writes,0);
  }
});
test('a legacy handler may be considered only on same epoch, with no live permit',()=>{
  const f=fixture();
  const r=action(f);
  assert.equal(r.status,'LEGACY_ADMISSION_PREVIEW_ONLY');
  denied(r);
});
test('no Q5-aware bootstrap and half-persisted records are a HOLD, not open',()=>{
  const f=fixture();
  f.records.clear();
  hold(inspect(f),'maintenance_marker_not_bootstrapped');
  f.records.set(Q5_GUARD_MARKER_KEY,JSON.stringify(marker()));
  hold(inspect(f),'partial_maintenance_marker');
  f.records.clear();
  f.records.set(Q5_GUARD_HISTORY_KEY,JSON.stringify(history()));
  hold(inspect(f),'partial_maintenance_marker');
});
test('malformed marker, null property, wrong schema or oversized value HOLD',()=>{
  for(const [key,bad] of [
    [Q5_GUARD_MARKER_KEY,'not json'],
    [Q5_GUARD_HISTORY_KEY,'null'],
    [Q5_GUARD_MARKER_KEY,null],
    [Q5_GUARD_HISTORY_KEY,'x'.repeat(8193)],
    [Q5_GUARD_HISTORY_KEY,'{"schema":"wrong"}']
  ]){
    const f=fixture();f.records.set(key,bad);
    hold(inspect(f),'invalid_maintenance_marker');
  }
});
test('world identity mismatch or unknown world cannot provide admission',()=>{
  const f=fixture();
  hold(inspect(f,{worldId:'unrelated'}),'inconsistent_maintenance_marker');
  hold(inspect(f,{worldId:''}),'unknown_world_identity');
  update(f,Q5_GUARD_HISTORY_KEY,{worldId:'another-world'});
  hold(inspect(f),'inconsistent_maintenance_marker');
});
test('history that has ever entered migration forbids silent return to LEGACY',()=>{
  const f=fixture();
  update(f,Q5_GUARD_HISTORY_KEY,{highestEpoch:1,everEntered:true});
  hold(inspect(f),'unsafe_legacy_resumption');
  update(f,Q5_GUARD_HISTORY_KEY,{highestEpoch:0});
  hold(inspect(f),'unsafe_legacy_resumption');
});
test('a positive phase without durable history or epoch refuses',()=>{
  for(const change of [
    {epoch:0},{authority:'Q5_ONLY'},{phase:'UNKNOWN'},
    {revision:1.5},{phase:'LEGACY'}
  ]){
    const f=fixture('FROZEN',3);
    update(f,Q5_GUARD_MARKER_KEY,change);
    hold(inspect(f));
  }
  const f=fixture('FROZEN',3);
  update(f,Q5_GUARD_HISTORY_KEY,{everEntered:false});
  hold(inspect(f),'missing_maintenance_history');
});
test('stale control marker vs advanced history refuses rather than resuming stale state',()=>{
  const f=fixture('STAGING',5);
  update(f,Q5_GUARD_HISTORY_KEY,{highestEpoch:6});
  hold(inspect(f),'stale_marker_vs_history');
});
test('mismatched revisions refuse both partial write orders',()=>{
  const f=fixture('FROZEN',4);
  update(f,Q5_GUARD_MARKER_KEY,{revision:5});
  hold(inspect(f),'inconsistent_maintenance_marker');
  const g=fixture('FROZEN',4);
  update(g,Q5_GUARD_HISTORY_KEY,{revision:5});
  hold(inspect(g),'inconsistent_maintenance_marker');
});
test('a marker change between read passes blocks snapshot observation',()=>{
  const f=fixture(),original=f.world.getDynamicProperty;
  let count=0;
  f.world.getDynamicProperty=key=>{
    const v=original(key);count++;
    if(count===2)update(f,Q5_GUARD_MARKER_KEY,{phase:'REQUESTED',epoch:2});
    return v;
  };
  hold(inspect(f),'maintenance_marker_changed_during_read');
});
test('history drift between passes blocks otherwise matching marker',()=>{
  const f=fixture(),original=f.world.getDynamicProperty;
  let count=0;
  f.world.getDynamicProperty=key=>{
    const v=original(key);count++;
    if(count===2)update(f,Q5_GUARD_HISTORY_KEY,{revision:1});
    return v;
  };
  hold(inspect(f),'maintenance_marker_changed_during_read');
});
test('unreadable world or throws are HOLD rather than assumption of no migration',()=>{
  const f=fixture();
  hold(inspect(f,{world:{}}),'read_interface_unavailable');
  hold(inspect(f,{world:null}),'read_interface_unavailable');
  f.world.getDynamicProperty=()=>{throw Error('unloaded')};
  hold(inspect(f),'maintenance_marker_read_failed');
});
test('captured callback epoch is rechecked against current control state',()=>{
  const f=fixture('REQUESTED',3);
  hold(action(f,{capturedEpoch:2}),'stale_handler_epoch');
  hold(action(f,{capturedEpoch:0}),'stale_handler_epoch');
  const ok=action(f,{capturedEpoch:3});
  assert.equal(ok.status,'HANDLER_STOPPED_BY_MAINTENANCE');
  denied(ok);
});
test('unknown Hart writer handler is refused rather than silently admitted',()=>{
  const f=fixture();
  hold(action(f,{handlerId:'unregistered_new_writer'}),'unregistered_hart_handler');
});
test('both markers may be stable but still cannot enable Q5 ownership',()=>{
  const f=fixture('RESUME_PENDING',17);
  for(let i=0;i<20;i++){
    const r=inspect(f);
    assert.equal(r.ok,true);
    assert.equal(r.phase,'RESUME_PENDING');
    assert.equal(r.canMigrate,false);
    denied(r);
  }
  assert.equal(f.writes,0);
});
test('read-only sampling preserves exact stored bytes and world map across restart',()=>{
  const f=fixture('BLOCKED',14);
  const before=JSON.stringify([...f.records]);
  const snapshot=inspect(f);
  const restartedWorld={
    getDynamicProperty:key=>f.records.get(key)
  };
  const after=inspectQ5MaintenanceMarker({world:restartedWorld,worldId});
  assert.deepEqual(snapshot,after);
  assert.equal(JSON.stringify([...f.records]),before);
});
test('overwriting a matching phase cannot forge a migration resume permit',()=>{
  const f=fixture('FROZEN',2);
  const first=inspect(f);
  assert.equal(first.status,'MAINTENANCE_STOP_MODEL_ONLY');
  update(f,Q5_GUARD_MARKER_KEY,{phase:'RESUME_PENDING'});
  const next=inspect(f);
  assert.equal(next.status,'MAINTENANCE_STOP_MODEL_ONLY');
  denied(next);
});
