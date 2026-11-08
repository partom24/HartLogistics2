import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_ENTRY_POINTS,FUTURE_ENTRY_POINTS,ALL_ENTRY_POINTS,
  auditUnifiedWriterCensus,auditRestartReservation,currentPg20WriterGaps
} from "../candidates/transport/unified_writer_adoption_audit.mjs";

const all=()=>ALL_ENTRY_POINTS.map(path=>({
  path,state:CURRENT_ENTRY_POINTS.includes(path)?"COORDINATED":"NOT_IMPLEMENTED"
}));
const census=()=>({entries:all()});
const boot=()=>({generation:12,worldEpoch:7,
  scanAllKnownJournals:true,resumedFromRestart:true,legacyRoutingFrozen:true});
const claim=()=>({operationId:"tx-23",path:"COLLECTOR_NATIVE_DIRECT",worldEpoch:7});
const scenario=()=>({census:census(),boot:boot(),records:[],
                        retiredIds:["tx-1","tx-22"],claim:claim()});
const deny=r=>{
  assert.equal(Object.isFrozen(r),true);
  for(const k of ["mayRunTransfer","mayDebitQueue","mayDebitBulk","mayReplay",
                  "maySettle","mayClearJournal","mayReleaseCapacity",
                  "mayStartMigration","mayCertifyDurability","mayPromoteToProduction"])
    assert.equal(r[k],false,k);
};

test("current PG20 cannot be called integrated merely because its local journal is clear",()=>{
  const gaps=currentPg20WriterGaps();
  assert.equal(gaps.length,6);
  assert.equal(new Set(gaps.map(x=>x.path)).size,6);
  assert.ok(gaps.every(x=>x.integration==="NOT_IN_UNIFIED_RUNTIME_COORDINATOR"));
  assert.ok(gaps.every(x=>x.canTransfer===false));
});

test("concrete old entry paths and future route kinds appear exactly once",()=>{
  assert.equal(CURRENT_ENTRY_POINTS.length,6);
  assert.equal(FUTURE_ENTRY_POINTS.length,5);
  assert.equal(ALL_ENTRY_POINTS.length,11);
  assert.equal(new Set(ALL_ENTRY_POINTS).size,11);
});
test("fully claimed cooperative census remains model-only, with no transfer authority",()=>{
  const r=auditUnifiedWriterCensus(census());
  assert.equal(r.status,"CENSUS_MODEL_ONLY");deny(r);
});
test("every single uncoordinated existing path blocks common writer transition",()=>{
  for(const path of CURRENT_ENTRY_POINTS){
    const data=census();
    data.entries.find(x=>x.path===path).state="BYPASSES_COORDINATOR";
    const r=auditUnifiedWriterCensus(data);
    assert.equal(r.status,"HOLD",path);
    assert.ok(r.bypassed.includes(path));deny(r);
  }
});
test("missing a legacy recovery entry does not silently count as safe",()=>{
  const data=census();
  data.entries=data.entries.filter(e=>e.path!=="PHYSICAL_JOURNAL_RECOVERY");
  const r=auditUnifiedWriterCensus(data);
  assert.equal(r.reason,"entry_point_census_incomplete_or_invalid");deny(r);
});
test("duplicated route declaration is not a second authenticated writer",()=>{
  const data=census();data.entries[0]={...data.entries[1]};
  const r=auditUnifiedWriterCensus(data);
  assert.equal(r.reason,"entry_point_census_incomplete_or_invalid");deny(r);
});
test("future Q5 or Bulk handler cannot bypass central coordinator",()=>{
  for(const path of FUTURE_ENTRY_POINTS){
    const data=census();
    data.entries.find(e=>e.path===path).state="BYPASSES_COORDINATOR";
    const r=auditUnifiedWriterCensus(data);
    assert.equal(r.status,"HOLD");assert.ok(r.bypassed.includes(path));deny(r);
  }
});
test("future lanes may remain not implemented without contaminating existing scope",()=>{
  const r=auditUnifiedWriterCensus(census());
  assert.equal(r.status,"CENSUS_MODEL_ONLY");deny(r);
});
test("unreadable or unknown future lane is not treated as not installed",()=>{
  const data=census();
  data.entries.find(e=>e.path==="Q5_ORDINARY_OUTPUT").state="UNKNOWN";
  const r=auditUnifiedWriterCensus(data);
  assert.equal(r.status,"HOLD");deny(r);
});
test("no invented permission on a clean startup with fully asserted routes",()=>{
  const r=auditRestartReservation(scenario());
  assert.equal(r.status,"MODEL_IDLE_ONLY");
  assert.equal(r.acknowledgedGeneration,12);
  deny(r);
});
test("none of the old six physical and logical writers may stay outside coordination",()=>{
  const d=scenario();
  d.census.entries.find(e=>e.path==="RECEIVER_Q4_EGRESS").state="BYPASSES_COORDINATOR";
  const r=auditRestartReservation(d);
  assert.equal(r.reason,"writer_census_not_proven");deny(r);
});
test("missing freeze or journal census refuses even a clean-looking live startup",()=>{
  for(const property of ["scanAllKnownJournals","resumedFromRestart","legacyRoutingFrozen"]){
    const d=scenario();d.boot[property]=false;
    const r=auditRestartReservation(d);
    assert.equal(r.reason,"startup_freeze_or_complete_scan_unverified",property);deny(r);
  }
});
test("incomplete boot epoch and generation refuse",()=>{
  for(const property of ["worldEpoch","generation"]){
    for(const n of [0,-1,null,1.2]){
      const d=scenario();d.boot[property]=n;
      const r=auditRestartReservation(d);
      assert.equal(r.status,"HOLD");deny(r);
    }
  }
});
test("any PREPARED/MOVED/RECEIPT/COMMITTED/UNREADABLE record survives as HOLD",()=>{
  for(const phase of ["PREPARED","PHYSICAL_TOUCHED","RECEIPT_PENDING","COMMITTED","UNREADABLE"]){
    const d=scenario();
    d.records=[{path:"COLLECTOR_NATIVE_DIRECT",operationId:"tx-2",worldEpoch:7,phase}];
    const r=auditRestartReservation(d);
    assert.equal(r.status,"HOLD");deny(r);
  }
});
test("reader must not erase complete journal marker merely because it is COMMITTED",()=>{
  const d=scenario();d.records=[{path:"COLLECTOR_Q4_INGRESS",
    operationId:"tx-2",worldEpoch:7,phase:"COMMITTED"}];
  const r=auditRestartReservation(d);
  assert.equal(r.reason,"persisted_or_ambiguous_intent_requires_manual_custody_audit");
  deny(r);
});
test("stale controller epoch must never inherit a prior writer's authority",()=>{
  const d=scenario();
  d.records=[{path:"SORTER_PHYSICAL_MOVE",operationId:"tx-2",worldEpoch:6,phase:"PREPARED"}];
  const r=auditRestartReservation(d);
  assert.equal(r.reason,"stale_controller_epoch_requires_audit");deny(r);
});
test("replayed transaction ID from a completed durable ledger is blocked",()=>{
  const d=scenario();d.claim.operationId="tx-1";
  const r=auditRestartReservation(d);
  assert.equal(r.reason,"operation_id_cannot_be_replayed_after_restart");deny(r);
});
test("duplicated or truncated persisted retired-ID histories are HOLD",()=>{
  for(const list of [["tx-1","tx-1"],["tx-1",null],"bad id"]){
    const d=scenario();d.retiredIds=list;
    const r=auditRestartReservation(d);
    assert.equal(r.status,"HOLD");deny(r);
  }
});
test("two journal entries claiming same operation are never assumed idempotent",()=>{
  const d=scenario();
  d.records=[
    {path:"COLLECTOR_NATIVE_DIRECT",operationId:"tx-2",worldEpoch:7,phase:"PREPARED"},
    {path:"RECEIVER_Q4_EGRESS",operationId:"tx-2",worldEpoch:7,phase:"COMMITTED"}
  ];
  const r=auditRestartReservation(d);
  assert.equal(r.reason,"multiple_records_for_one_operation");deny(r);
});
test("unsupported route identity, unknown marker, bad epoch or missing audit data HOLD",()=>{
  for(const change of [
    d=>d.claim.path="IMAGINARY",
    d=>d.claim.operationId="bad id",
    d=>d.claim.worldEpoch=6,
    d=>d.records=[{path:"IMAGINARY",operationId:"tx-2",worldEpoch:7,phase:"PREPARED"}],
    d=>d.records=null,
    d=>d.retiredIds=null
  ]){
    const d=scenario();change(d);
    const r=auditRestartReservation(d);
    assert.equal(r.status,"HOLD");deny(r);
  }
});
test("a requested new Q5 lane with no installed code must HOLD",()=>{
  const d=scenario();d.claim.path="Q5_ORDINARY_OUTPUT";
  const r=auditRestartReservation(d);
  assert.equal(r.reason,"proposed_lane_not_integrated");deny(r);
});
test("caller claims of external-writer exclusion cannot create an engine permit",()=>{
  const d=scenario();
  d.externalWritersBlocked=true;
  d.worldPropertyDiskAtomicityGuaranteed=true;
  d.census.entries.forEach(e=>e.state="COORDINATED");
  const r=auditRestartReservation(d);
  assert.equal(r.status,"MODEL_IDLE_ONLY");deny(r);
});
test("a process-local token is not used as an authenticated durable generation",()=>{
  const d=scenario();d.processToken=Symbol("owner");d.boot.processLockRestored=true;
  const r=auditRestartReservation(d);
  assert.equal(r.status,"MODEL_IDLE_ONLY");deny(r);
});
test("deterministic immutable reports cannot modify source journal or claim",()=>{
  const d=scenario();const before=structuredClone(d);
  for(let i=0;i<10;i++){
    const r=auditRestartReservation(d);
    assert.equal(r.status,"MODEL_IDLE_ONLY");deny(r);
  }
  assert.deepEqual(d,before);
});
