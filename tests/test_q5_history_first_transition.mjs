import test from 'node:test';
import assert from 'node:assert/strict';
import {
 Q5_GUARD_MARKER_KEY,Q5_GUARD_HISTORY_KEY,
 Q5_GUARD_MARKER_SCHEMA,Q5_GUARD_HISTORY_SCHEMA,
 inspectQ5MaintenanceMarker
} from '../candidates/transport/q5_world_guard_read.mjs';
import {
 planQ5MaintenanceRecordTransition,
 Q5_MAINTENANCE_TRANSITIONS,Q5_QUIESCENCE_FIELDS
} from '../candidates/transport/q5_history_first_transition.mjs';

const worldId='minecraft:overworld:offline';
function fixture(phase='LEGACY',epoch=0,revision=0) {
  const records=new Map([
    [Q5_GUARD_MARKER_KEY,JSON.stringify({
      schema:Q5_GUARD_MARKER_SCHEMA,worldId,epoch,revision,phase,
      authority:'Q4_ONLY'
    })],
    [Q5_GUARD_HISTORY_KEY,JSON.stringify({
      schema:Q5_GUARD_HISTORY_SCHEMA,worldId,highestEpoch:epoch,
      revision,everEntered:epoch>0
    })]
  ]);
  let writes=0;
  const world={
    getDynamicProperty:key=>records.get(key),
    setDynamicProperty:()=>{writes++;}
  };
  return {world,records,get writes(){return writes;}};
}
const claims=()=>Object.fromEntries(Q5_QUIESCENCE_FIELDS.map(x=>[x,true]));
const plan=(f,targetPhase,more={})=>planQ5MaintenanceRecordTransition({
  world:f.world,worldId,targetPhase,quiescenceClaims:claims(),...more
});
const noPermission=r=>{
  for(const name of ['canRoute','canMigrate','canResume','canDebitQ4',
    'canWriteQ5','canWriteWorld','canClearJournal','canSettle']){
    assert.equal(r[name],false,name);
  }
};
const hold=(r,reason)=>{
  assert.equal(r.ok,false);
  assert.equal(r.status,'HOLD');
  if(reason)assert.equal(r.reason,reason);
  noPermission(r);
};
const inspect=f=>inspectQ5MaintenanceMarker({world:f.world,worldId});
const apply=(f,write)=>f.records.set(write.key,write.value);
const complete=(f,targetPhase)=>{
  const r=plan(f,targetPhase);
  assert.equal(r.ok,true,JSON.stringify(r));
  for(const write of r.writes)apply(f,write);
  return r;
};
test('LEGACY to REQUESTED yields immutable two-record history-first plan only',()=>{
  const f=fixture(),raw=JSON.stringify([...f.records]),r=plan(f,'REQUESTED');
  assert.equal(r.ok,true);
  assert.equal(r.status,'HISTORY_FIRST_WRITE_PLAN_ONLY');
  assert.equal(r.previousPhase,'LEGACY');
  assert.equal(r.targetPhase,'REQUESTED');
  assert.equal(r.epoch,1);assert.equal(r.revision,1);
  assert.deepEqual(r.writes.map(w=>w.key),
    [Q5_GUARD_HISTORY_KEY,Q5_GUARD_MARKER_KEY]);
  assert.equal(r.historyFirst,true);
  assert.equal(r.oldQ4RemainsAuthoritative,true);
  assert.equal(r.crashAtomicityProven,false);
  assert.equal(r.assertionsAreRuntimeProof,false);
  assert.ok(Object.isFrozen(r.writes));
  assert.ok(Object.isFrozen(r.writes[0]));
  assert.ok(Object.isFrozen(r.writes[1]));
  noPermission(r);
  assert.equal(JSON.stringify([...f.records]),raw);
  assert.equal(f.writes,0);
});
test('crash before first write leaves LEGACY; this is NOT global stop proof',()=>{
  const f=fixture(),p=plan(f,'REQUESTED');
  assert.equal(p.ok,true);
  const r=inspect(f);
  assert.equal(r.status,'LEGACY_MODEL_READ_ONLY');
  assert.equal(r.wouldPermitLegacy,true);
  noPermission(r);
});
test('crash after HISTORY write, before marker, is HOLD not legacy routing',()=>{
  const f=fixture(),p=plan(f,'REQUESTED');
  apply(f,p.writes[0]);
  const r=inspect(f);
  hold(r,'inconsistent_maintenance_marker');
  hold(plan(f,'REQUESTED'));
  assert.equal(f.writes,0);
});
test('the finished two-write plan reports requested global stop MODEL, never cutover',()=>{
  const f=fixture(),p=complete(f,'REQUESTED');
  const r=inspect(f);
  assert.equal(r.status,'MAINTENANCE_STOP_MODEL_ONLY');
  assert.equal(r.phase,'REQUESTED');
  assert.equal(r.epoch,p.epoch);
  noPermission(r);
  assert.equal(f.writes,0);
});
test('erroneous marker-first first write is equally HOLD',()=>{
  const f=fixture(),p=plan(f,'REQUESTED');
  apply(f,p.writes[1]);
  hold(inspect(f),'inconsistent_maintenance_marker');
});
test('every recognized maintenance transition increments revision once, not epoch',()=>{
  const f=fixture();
  const steps=['REQUESTED','FROZEN','STAGING','VERIFYING',
    'RESUME_PENDING','BLOCKED'];
  let revision=0;
  for(const next of steps){
    const r=complete(f,next);
    revision++;
    assert.equal(r.epoch,1);
    assert.equal(r.revision,revision);
    assert.equal(inspect(f).phase,next);
    noPermission(inspect(f));
  }
  hold(plan(f,'REQUESTED'),'illegal_maintenance_transition');
  assert.equal(f.writes,0);
});
test('no model transition ever produces Q5 ownership or a real world writer',()=>{
  const f=fixture();
  for(const next of ['REQUESTED','FROZEN','STAGING','VERIFYING',
                     'RESUME_PENDING','BLOCKED']){
    const r=complete(f,next);
    const m=JSON.parse(r.writes[1].value);
    const h=JSON.parse(r.writes[0].value);
    assert.equal(m.authority,'Q4_ONLY');
    assert.equal(h.everEntered,true);
    assert.equal(h.highestEpoch,m.epoch);
    assert.equal(h.revision,m.revision);
    noPermission(r);
  }
});
test('REQUESTED->FROZEN and later phase proposals require full claimed quiescence',()=>{
  const f=fixture();complete(f,'REQUESTED');
  for(const key of Q5_QUIESCENCE_FIELDS){
    const c=claims();delete c[key];
    hold(plan(f,'FROZEN',{quiescenceClaims:c}),'world_quiescence_claims_missing');
    const d=claims();d[key]='yes';
    hold(plan(f,'FROZEN',{quiescenceClaims:d}),'world_quiescence_claims_missing');
    const e=claims();e[key]=false;
    hold(plan(f,'FROZEN',{quiescenceClaims:e}),'world_quiescence_claims_missing');
  }
  assert.equal(inspect(f).phase,'REQUESTED');
});
test('REQUESTED can enter BLOCKED without inventing freeze evidence',()=>{
  const f=fixture();complete(f,'REQUESTED');
  const r=plan(f,'BLOCKED',{quiescenceClaims:null});
  assert.equal(r.ok,true);
  noPermission(r);
  apply(f,r.writes[0]);
  hold(inspect(f),'inconsistent_maintenance_marker');
  apply(f,r.writes[1]);
  assert.equal(inspect(f).phase,'BLOCKED');
});
test('each phase crash between writes denies all routing and cutover',()=>{
  for(const target of ['FROZEN','STAGING','VERIFYING','RESUME_PENDING','BLOCKED']){
    const f=fixture();
    for(const step of ['REQUESTED','FROZEN','STAGING','VERIFYING',
      'RESUME_PENDING']){
      if(step===target)break;
      complete(f,step);
    }
    const r=plan(f,target);
    assert.equal(r.ok,true,target);
    apply(f,r.writes[0]);
    hold(inspect(f),'inconsistent_maintenance_marker');
    hold(plan(f,target));
    apply(f,r.writes[1]);
    assert.equal(inspect(f).phase,target);
  }
});
test('broken state after crash does NOT automatically replay the remaining write',()=>{
  const f=fixture(),p=plan(f,'REQUESTED');
  apply(f,p.writes[0]);
  hold(plan(f,'FROZEN'));
  assert.equal(f.records.get(Q5_GUARD_MARKER_KEY),p.previousRaw[0]);
  assert.equal(f.records.get(Q5_GUARD_HISTORY_KEY),p.writes[0].value);
});
test('forbid skipped phases, reversal and Q5/LEGACY resumption proposals',()=>{
  const f=fixture();
  for(const next of ['FROZEN','STAGING','VERIFYING','RESUME_PENDING',
    'BLOCKED','Q5_ONLY','LEGACY',null,'constructor','__proto__']){
    hold(plan(f,next),'illegal_maintenance_transition');
  }
  complete(f,'REQUESTED');
  for(const next of ['STAGING','VERIFYING','RESUME_PENDING',
    'LEGACY','Q5_ONLY','REQUESTED']){
    hold(plan(f,next),'illegal_maintenance_transition');
  }
});
test('missing either marker/history refuses planning rather than bootstrapping',()=>{
  for(const keys of [
    [Q5_GUARD_MARKER_KEY],[Q5_GUARD_HISTORY_KEY],
    [Q5_GUARD_MARKER_KEY,Q5_GUARD_HISTORY_KEY]]){
    const f=fixture();for(const key of keys)f.records.delete(key);
    hold(plan(f,'REQUESTED'));
  }
});
test('unreadable world or a property exception is HOLD without writes',()=>{
  const f=fixture();
  hold(planQ5MaintenanceRecordTransition({
    world:{},worldId,targetPhase:'REQUESTED'
  }),'world_read_unavailable');
  f.world.getDynamicProperty=()=>{throw Error('unloaded');};
  hold(plan(f,'REQUESTED'),'world_read_failed');
  assert.equal(f.writes,0);
});
test('marker or history drift between raw-read passes refuses a plan',()=>{
  for(const changed of [Q5_GUARD_MARKER_KEY,Q5_GUARD_HISTORY_KEY]){
    const f=fixture();const original=f.world.getDynamicProperty;
    let n=0;
    f.world.getDynamicProperty=key=>{
      const value=original(key);n++;
      if(n===2){
        f.records.set(changed,' '+f.records.get(changed));
      }
      return value;
    };
    hold(plan(f,'REQUESTED'),'marker_changed_while_reading');
  }
});
test('drift after stable pre-read but before final observation holds',()=>{
  const f=fixture();const original=f.world.getDynamicProperty;
  let n=0;
  f.world.getDynamicProperty=key=>{
    const result=original(key);n++;
    if(n===8)f.records.set(Q5_GUARD_HISTORY_KEY,
      ' '+f.records.get(Q5_GUARD_HISTORY_KEY));
    return result;
  };
  hold(plan(f,'REQUESTED'),'maintenance_changed_during_validation');
});
test('metadata key extension is held rather than discarded during migration',()=>{
  const f=fixture();
  const raw=JSON.parse(f.records.get(Q5_GUARD_MARKER_KEY));
  raw.newAuthoritativeField='not-mapped';
  f.records.set(Q5_GUARD_MARKER_KEY,JSON.stringify(raw));
  hold(plan(f,'REQUESTED'),'unrecognized_maintenance_record_shape');
  assert.equal(f.writes,0);
});
test('history key extension is held rather than overwritten',()=>{
  const f=fixture();
  const raw=JSON.parse(f.records.get(Q5_GUARD_HISTORY_KEY));
  raw.futureEpochWitness=123;
  f.records.set(Q5_GUARD_HISTORY_KEY,JSON.stringify(raw));
  hold(plan(f,'REQUESTED'),'unrecognized_maintenance_record_shape');
});
test('old LEGACY revisions >0 are not silently treated as initial bootstrap',()=>{
  const f=fixture('LEGACY',0,2);
  hold(plan(f,'REQUESTED'),'legacy_bootstrap_not_fully_verified');
});
test('world mismatch and unknown world identity always refuse',()=>{
  const f=fixture();
  hold(plan(f,'REQUESTED',{worldId:'another'}));
  hold(plan(f,'REQUESTED',{worldId:''}),'invalid_world_identity');
});
test('invalid authority or nonboolean history never plans writes',()=>{
  const f=fixture();
  const marker=JSON.parse(f.records.get(Q5_GUARD_MARKER_KEY));
  marker.authority='Q5_ONLY';
  f.records.set(Q5_GUARD_MARKER_KEY,JSON.stringify(marker));
  hold(plan(f,'REQUESTED'));
  const g=fixture();
  const h=JSON.parse(g.records.get(Q5_GUARD_HISTORY_KEY));
  h.everEntered='false';
  g.records.set(Q5_GUARD_HISTORY_KEY,JSON.stringify(h));
  hold(plan(g,'REQUESTED'));
});
test('safe integer revision/epoch overflow refuses rollover',()=>{
  const f=fixture('REQUESTED',1,Number.MAX_SAFE_INTEGER);
  hold(plan(f,'FROZEN'),'maintenance_counter_exhausted');
  const g=fixture('REQUESTED',Number.MAX_SAFE_INTEGER,5);
  hold(plan(g,'FROZEN'),'maintenance_counter_exhausted');
});
test('monotonic history prevents simple marker-only rollback to LEGACY',()=>{
  const f=fixture();
  complete(f,'REQUESTED');
  const originalMarker=fixture().records.get(Q5_GUARD_MARKER_KEY);
  f.records.set(Q5_GUARD_MARKER_KEY,originalMarker);
  hold(inspect(f));
  hold(plan(f,'REQUESTED'));
});
test('entire BOTH-key rollback is undetectable; no real permission is given',()=>{
  const f=fixture(),before=[...f.records];
  complete(f,'REQUESTED');
  for(const [key,raw] of before)f.records.set(key,raw);
  const status=inspect(f);
  assert.equal(status.status,'LEGACY_MODEL_READ_ONLY');
  noPermission(status);
  const p=plan(f,'REQUESTED');
  assert.equal(p.ok,true);
  noPermission(p);
  // Requires an independent durable monotonic witness / rollback policy.
  // MUST NOT be interpreted as a safe gameplay restart.
});
test('replay of same history+marker is only a stopped MODEL, never resume',()=>{
  const f=fixture(),p=complete(f,'REQUESTED');
  apply(f,p.writes[0]);apply(f,p.writes[1]);
  assert.equal(inspect(f).status,'MAINTENANCE_STOP_MODEL_ONLY');
  noPermission(inspect(f));
  hold(plan(f,'REQUESTED'),'illegal_maintenance_transition');
});
test('all transition tables and quiescence field lists are immutable',()=>{
  assert.ok(Object.isFrozen(Q5_MAINTENANCE_TRANSITIONS));
  for(const steps of Object.values(Q5_MAINTENANCE_TRANSITIONS)){
    assert.ok(Object.isFrozen(steps));
  }
  assert.ok(Object.isFrozen(Q5_QUIESCENCE_FIELDS));
  assert.throws(()=>Q5_MAINTENANCE_TRANSITIONS.LEGACY.push('Q5_ONLY'),TypeError);
});
test('a malicious inherited phase cannot bypass explicit transition ownership',()=>{
  const f=fixture();
  for(const target of ['toString','constructor','valueOf','__proto__']){
    hold(plan(f,target),'illegal_maintenance_transition');
  }
});
test('simulation never invokes a world writer or changes caller objects',()=>{
  const f=fixture(),before=JSON.stringify([...f.records]),c=claims();
  for(let i=0;i<25;i++){
    const r=plan(f,'REQUESTED',{quiescenceClaims:c});
    assert.equal(r.ok,true);
    noPermission(r);
  }
  assert.equal(JSON.stringify([...f.records]),before);
  assert.equal(JSON.stringify(c),JSON.stringify(claims()));
  assert.equal(f.writes,0);
});
