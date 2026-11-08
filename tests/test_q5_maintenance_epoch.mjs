import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q5_MAINTENANCE_SCHEMA, Q5_MAINTENANCE_HANDLERS,
  inspectQ5MaintenanceEpoch, previewQ5MaintenanceOperation,
  previewQ5BlockOnLoad, previewQ5PhaseTransition
} from '../candidates/transport/q5_maintenance_epoch.mjs';
import { stageQ4OrdinaryDraft } from '../candidates/transport/q5_bucket_core.mjs';
import { planQ5ShadowWrites } from '../candidates/transport/q5_shadow_staging.mjs';

const epoch = 7;
function fixture() {
  return {
    record: {schema:Q5_MAINTENANCE_SCHEMA,epoch,phase:'FROZEN',
      authority:'Q4_ONLY',hartRoutingStopped:true,maintenanceClaimPersisted:true},
    observedWorldEpoch:epoch,
    handlers:Q5_MAINTENANCE_HANDLERS.map(id=>({
      id,gated:true,checkedEpoch:epoch,inFlight:0,rechecksBeforeCommit:true
    })),
    blocks:[
      {id:'sorter-1',kind:'sorter',loaded:true,phase:'VERIFIED',
        observedEpoch:epoch,identityVerified:true,sourceUnchanged:true},
      {id:'receiver-1',kind:'receiver',loaded:true,phase:'VERIFIED',
        observedEpoch:epoch,identityVerified:true,sourceUnchanged:true}
    ],
    registryComplete:true,
    journals:{sorterClear:true,queueClear:true,physicalClear:true},
    externalIngress:'isolated'
  };
}
function clone() { return structuredClone(fixture()); }
const fields=['canRoute','canMigrate','canResume','canDebitQ4',
  'canWriteQ5','canSettle','canClearJournal','canWriteWorld'];
function noAuthority(result) {
  for (const field of fields) assert.equal(result[field],false,field);
}
function hold(result, expected) {
  assert.equal(result.ok,false);
  assert.equal(result.status,'HOLD');
  if(expected) assert.equal(result.reason,expected);
  noAuthority(result);
}
test('complete synthetic maintenance census is an offline MODEL, not runtime freeze evidence',()=>{
  const f=fixture(),before=JSON.stringify(f);
  const v=inspectQ5MaintenanceEpoch(f);
  assert.equal(v.ok,true);
  assert.equal(v.status,'MAINTENANCE_MODEL_ONLY');
  assert.equal(v.census.verified,2);
  assert.equal(v.census.pending,0);
  assert.equal(v.modelReadyForShadow,true);
  assert.equal(v.modelReadyForResumeReview,false);
  noAuthority(v);
  assert.equal(JSON.stringify(f),before);
});
test('all required writer and scheduler handlers must be distinct and guarded',()=>{
  const f=fixture();
  for(const id of Q5_MAINTENANCE_HANDLERS){
    const s=clone();
    s.handlers=s.handlers.filter(h=>h.id!==id);
    hold(inspectQ5MaintenanceEpoch(s),'handler_coverage_incomplete');
  }
  assert.equal(f.handlers.length,Q5_MAINTENANCE_HANDLERS.length);
});
test('unknown, duplicated, stale and in-flight callbacks deny world-wide stop',()=>{
  const changes=[
    handlers=>handlers.push({...handlers[0]}),
    handlers=>handlers[0].id='unknown-new-writer',
    handlers=>handlers[0].checkedEpoch=6,
    handlers=>handlers[0].gated=false,
    handlers=>handlers[0].inFlight=1,
    handlers=>handlers[0].inFlight=-1,
    handlers=>handlers[0].rechecksBeforeCommit=false,
    handlers=>handlers[0].inFlight=NaN
  ];
  for(const change of changes){
    const f=clone();change(f.handlers);
    hold(inspectQ5MaintenanceEpoch(f),'handler_coverage_incomplete');
  }
});
test('an epoch mismatch or missing persisted maintenance claim is not accepted',()=>{
  const changes=[
    s=>s.observedWorldEpoch=8,
    s=>s.record.epoch=8,
    s=>s.record.epoch=0,
    s=>s.record.authority='Q5_ONLY',
    s=>s.record.hartRoutingStopped=false,
    s=>s.record.maintenanceClaimPersisted=false,
    s=>s.record.phase='RUNNING',
    s=>s.record.schema='unknown',
    s=>s.record=null
  ];
  for(const edit of changes){
    const f=clone();edit(f);
    hold(inspectQ5MaintenanceEpoch(f),'maintenance_epoch_unverified');
  }
});
test('unknown or missing global registry and journals HOLD',()=>{
  for(const edit of [
    s=>s.registryComplete=false,
    s=>s.registryComplete=undefined
  ]){
    const f=clone();edit(f);hold(inspectQ5MaintenanceEpoch(f),'block_registry_not_complete');
  }
  for(const k of ['sorterClear','queueClear','physicalClear']){
    for(const v of [false,undefined,'clear']){
      const f=clone();f.journals[k]=v;
      hold(inspectQ5MaintenanceEpoch(f),'journal_state_not_clear');
    }
  }
});
test('unknown vanilla or foreign ingress never certifies shadow eligibility',()=>{
  for(const ingress of ['active','unknown']){
    const f=clone();f.externalIngress=ingress;
    const v=inspectQ5MaintenanceEpoch(f);
    assert.equal(v.ok,true);
    assert.equal(v.modelReadyForShadow,false);
    noAuthority(v);
  }
  const f=clone();f.externalIngress='unchecked';
  hold(inspectQ5MaintenanceEpoch(f),'external_ingress_unclassified');
});
test('PENDING unloaded legacy block stays pending, never automatically marked migrated',()=>{
  const f=clone();
  f.blocks.push({id:'collector-unloaded',kind:'collector',
    loaded:false,phase:'PENDING',observedEpoch:0});
  const check=inspectQ5MaintenanceEpoch(f);
  assert.equal(check.ok,true);
  assert.equal(check.census.pending,1);
  assert.equal(check.modelReadyForShadow,false);
  noAuthority(check);
  const onload=previewQ5BlockOnLoad({state:f,blockId:'collector-unloaded',observedEpoch:epoch});
  assert.equal(onload.status,'PENDING_LOADED_BLOCK_VERIFICATION');
  noAuthority(onload);
});
test('a crashed MIGRATING block is never resumed as VERIFIED',()=>{
  const f=clone();
  f.blocks[0]={...f.blocks[0],phase:'MIGRATING'};
  const v=inspectQ5MaintenanceEpoch(f);
  assert.equal(v.ok,true);
  assert.equal(v.census.migrating,1);
  assert.equal(v.modelReadyForShadow,false);
  noAuthority(v);
  hold(previewQ5PhaseTransition({state:f,targetPhase:'STAGING'}),
    'shadow_prerequisites_unresolved');
});
test('BLOCKED block is visible in census and does not allow routing',()=>{
  const f=clone();
  f.blocks[0]={...f.blocks[0],phase:'BLOCKED'};
  const v=inspectQ5MaintenanceEpoch(f);
  assert.equal(v.census.blocked,1);
  assert.equal(v.modelReadyForShadow,false);
  noAuthority(v);
});
test('unloaded block cannot falsely claim verified or migrating custody',()=>{
  for(const phase of ['VERIFIED','MIGRATING']){
    const f=clone();f.blocks[0].loaded=false;f.blocks[0].phase=phase;
    hold(inspectQ5MaintenanceEpoch(f));
  }
});
test('stale or unverified VERIFIED block is not counted',()=>{
  for(const mutate of [
    b=>b.identityVerified=false,
    b=>b.sourceUnchanged=false,
    b=>b.observedEpoch=epoch-1,
    b=>b.loaded=false
  ]){
    const f=clone();mutate(f.blocks[0]);
    hold(inspectQ5MaintenanceEpoch(f),'unverified_block_claim');
  }
});
test('duplicate, unknown kind and future-epoch registry entries refuse',()=>{
  for(const mutate of [
    b=>b.id='receiver-1',
    b=>b.kind='foreign-chest',
    b=>b.phase='DONE',
    b=>b.observedEpoch=epoch+1
  ]){
    const f=clone();mutate(f.blocks[0]);
    hold(inspectQ5MaintenanceEpoch(f));
  }
});
test('all registered handlers remain blocked across maintenance phases',()=>{
  for(const phase of ['REQUESTED','FROZEN','STAGING','VERIFYING','BLOCKED','RESUME_PENDING']){
    const f=clone();f.record.phase=phase;
    for(const id of Q5_MAINTENANCE_HANDLERS){
      const v=previewQ5MaintenanceOperation({state:f,handlerId:id,capturedEpoch:epoch});
      assert.equal(v.ok,true);
      assert.equal(v.status,'OPERATION_BLOCKED_BY_MAINTENANCE');
      noAuthority(v);
    }
  }
});
test('stale queued callback cannot perform a commit after maintenance epoch advances',()=>{
  const f=clone();
  hold(previewQ5MaintenanceOperation({state:f,handlerId:Q5_MAINTENANCE_HANDLERS[0],
    capturedEpoch:6}),'stale_or_invalid_callback_epoch');
  hold(previewQ5MaintenanceOperation({state:f,handlerId:Q5_MAINTENANCE_HANDLERS[0],
    capturedEpoch:0}),'stale_or_invalid_callback_epoch');
});
test('unknown writer and unregistered block refuse even with otherwise valid epoch',()=>{
  const f=clone();
  hold(previewQ5MaintenanceOperation({state:f,handlerId:'foreign_writer',
    capturedEpoch:epoch}),'unknown_hart_handler');
  hold(previewQ5MaintenanceOperation({state:f,handlerId:Q5_MAINTENANCE_HANDLERS[0],
    capturedEpoch:epoch,blockId:'unseen'}),'unregistered_block');
});
test('on-load reinspection is still read-only for registered previously verified block',()=>{
  const f=clone();
  const r=previewQ5BlockOnLoad({state:f,blockId:'sorter-1',observedEpoch:epoch});
  assert.equal(r.status,'VERIFIED_MODEL_OBSERVATION_ONLY');
  noAuthority(r);
  hold(previewQ5BlockOnLoad({state:f,blockId:'sorter-1',observedEpoch:epoch-1}),
    'stale_onload_epoch');
  hold(previewQ5BlockOnLoad({state:f,blockId:'unknown',observedEpoch:epoch}),
    'unregistered_block');
});
test('phase proposals never write world or clear old Q4 ownership',()=>{
  const a=clone();a.record.phase='REQUESTED';
  const first=previewQ5PhaseTransition({state:a,targetPhase:'FROZEN'});
  assert.equal(first.status,'PHASE_PREVIEW_ONLY');
  assert.equal(first.proposedRecord.phase,'FROZEN');
  assert.equal(first.proposedRecord.authority,'Q4_ONLY');
  assert.equal(a.record.phase,'REQUESTED');
  noAuthority(first);
  const second=previewQ5PhaseTransition({state:fixture(),targetPhase:'STAGING'});
  assert.equal(second.status,'PHASE_PREVIEW_ONLY');
  noAuthority(second);
});
test('phase machine refuses skipped, reversed and ungoverned transitions',()=>{
  for(const [from,to] of [
    ['REQUESTED','STAGING'],['FROZEN','RESUME_PENDING'],
    ['STAGING','REQUESTED'],['VERIFYING','FROZEN'],
    ['RESUME_PENDING','RUNNING'],['RESUME_PENDING','FROZEN'],
    ['BLOCKED','FROZEN'],['FROZEN','RUNNING']
  ]){
    const f=clone();f.record.phase=from;
    hold(previewQ5PhaseTransition({state:f,targetPhase:to}),
      'illegal_maintenance_transition');
  }
});
test('resume candidate cannot be proposed with pending, blocked or active ingress',()=>{
  for(const edit of [
    f=>f.blocks[0].phase='PENDING',
    f=>f.blocks[0].phase='MIGRATING',
    f=>f.blocks[0].phase='BLOCKED',
    f=>f.externalIngress='unknown',
    f=>f.externalIngress='active'
  ]){
    const f=clone();f.record.phase='VERIFYING';edit(f);
    hold(previewQ5PhaseTransition({state:f,targetPhase:'RESUME_PENDING'}),
      'resume_prerequisites_unresolved');
  }
});
test('RESUME_PENDING only enables model review, never a real gameplay resume',()=>{
  const f=clone();f.record.phase='RESUME_PENDING';
  const v=inspectQ5MaintenanceEpoch(f);
  assert.equal(v.modelReadyForResumeReview,true);
  noAuthority(v);
  hold(previewQ5PhaseTransition({state:f,targetPhase:'RUNNING'}),
    'illegal_maintenance_transition');
});
test('offline freeze assertions alone are not accepted by existing shadow planner',()=>{
  const f=fixture(),v=inspectQ5MaintenanceEpoch(f);
  assert.equal(v.ok,true);
  const one=stageQ4OrdinaryDraft({
    receiverId:'receiver-1',epoch,entries:[{
      definition:{typeId:'minecraft:stone'},amount:8,
      classification:'ordinary',losslessIdentity:true,metadataFree:true
    }],declaredTotal:8,complete:true,journalClear:true
  });
  assert.equal(one.ok,true);
  // No verifiedAllHartHandlers proof from this model; do not invent it.
  const freeze={active:true,worldEpoch:epoch,
    coveredHandlers:Q5_MAINTENANCE_HANDLERS};
  const q4={receiverId:'receiver-1',snapshotFingerprint:'synthetic',revision:1,
    completeSnapshot:true,queueJournalClear:true,physicalJournalClear:true,
    sourceUnchanged:true,total:8};
  const plan=planQ5ShadowWrites({draft:one.draft,q4,freeze});
  assert.equal(plan.ok,false);
  assert.equal(plan.status,'HOLD');
  assert.equal(plan.reason,'global_freeze_unproven');
  for(const field of ['canRoute','canMigrate','canClearQ4','canSettle','canRetry','canWriteWorld'])
    assert.equal(plan[field],false,field);
});
test('read-only inspection never mutates census, blocks or original phase',()=>{
  const f=clone(),before=JSON.stringify(f);
  for(let i=0;i<15;i++){
    inspectQ5MaintenanceEpoch(f);
    previewQ5MaintenanceOperation({state:f,handlerId:Q5_MAINTENANCE_HANDLERS[0],
      capturedEpoch:epoch});
    previewQ5PhaseTransition({state:f,targetPhase:'STAGING'});
  }
  assert.equal(JSON.stringify(f),before);
});
