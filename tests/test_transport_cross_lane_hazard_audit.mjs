import test from "node:test";
import assert from "node:assert/strict";
import {
  ROUTES,PHASES,validateObservedLeg,explainOverlap,
  auditObservedConcurrency,reviewRouteDesign,inspectInterruptedPath
} from "../candidates/transport/cross_lane_hazard_audit.mjs";
const zeroRights = r => {
  for(const right of [
    "canMoveItems","canDebitQueue","canCreditDestination","canCreditBulk",
    "canReplay","canSettle","canReleaseReservation","canClearJournal",
    "productionAuthorized"
  ]) assert.equal(r[right],false,right+" must stay disabled");
};
function leg(route=ROUTES[0],i=0) {
  return {
    route,operation:"tx-"+i,writer:"writer-"+i,
    source:"minecraft:overworld|-955|69|-804",
    destination:"minecraft:overworld|-951|69|-804",
    network:"network-1",journal:"world:j-"+i,epoch:10,phase:"PREPARED"
  };
}
const snapshot=(legs=[],pendingMarkers=[],scanComplete=true)=>
  ({legs,pendingMarkers,scanComplete});
const marker=(id="one",phase="PREPARED")=>({id,owner:"writer-1",phase});

test("six conceptual routes are distinct",()=>{
  assert.equal(ROUTES.length,6);
  assert.equal(new Set(ROUTES).size,6);
  assert.equal(PHASES.length,4);
  assert.equal(new Set(PHASES).size,4);
});
test("valid observation is NEVER an execution permit",()=>{
  const r=validateObservedLeg(leg());
  assert.equal(r.status,"OBSERVATION_ONLY");
  zeroRights(r);
});
test("malformed transaction inputs fail observation checks",()=>{
  for(const prop of [
    "operation","writer","network","source","destination","journal",
    "route","phase","epoch"
  ]) {
    const entry=leg();
    entry[prop]=undefined;
    assert.equal(validateObservedLeg(entry).status,"INVALID",prop);
  }
  for(const value of [null,undefined,[],{},false,1]) {
    assert.equal(validateObservedLeg(value).status,"INVALID");
  }
});
test("unknown route and untracked phase do not pass",()=>{
  const a=leg();a.route="AGENT_WRITER";
  assert.equal(validateObservedLeg(a).reason,"invalid_or_incomplete_leg");
  const b=leg();b.phase="AUTO_RETRY";
  assert.equal(validateObservedLeg(b).status,"INVALID");
});
test("same physical source and destination is refused",()=>{
  const a=leg();a.destination=a.source;
  assert.equal(validateObservedLeg(a).status,"INVALID");
});
test("IDs that escape canonical key grammar are refused",()=>{
  for(const invalid of ["","../outside","bad//id","space key","\n","xyz".repeat(100)]){
    const a=leg();a.operation=invalid;
    assert.equal(validateObservedLeg(a).status,"INVALID");
  }
});
test("all 36 ordered route combinations are globally serialized, even disjoint",()=>{
  let checks=0;
  for(const first of ROUTES){
    for(const second of ROUTES){
      const a=leg(first,1),b=leg(second,2);
      b.source="minecraft:nether|100|80|100";
      b.destination="minecraft:nether|101|80|100";
      b.network="network-2";
      const r=explainOverlap(a,b);
      assert.equal(r.status,"HOLD",first+second);
      assert(r.flags.includes("COOPERATIVE_GLOBAL_WRITER_COLLISION"));
      assert(r.flags.includes("CROSS_NETWORK_IN_FLIGHT"));
      assert(!r.flags.includes("SAME_PHYSICAL_ENDPOINT"));
      assert.equal(r.flags.includes("CROSS_LANE_IN_FLIGHT"),first!==second);
      zeroRights(r);
      checks++;
    }
  }
  assert.equal(checks,36);
});
test("shared source is reported regardless of conceptual route",()=>{
  const a=leg("LEGACY_Q4",1),b=leg("NATIVE_DIRECT",2);
  b.destination="minecraft:overworld|-949|69|-804";
  const r=explainOverlap(a,b);
  assert(r.flags.includes("SAME_PHYSICAL_ENDPOINT"));
  assert(r.flags.includes("CROSS_LANE_IN_FLIGHT"));
  zeroRights(r);
});
test("crossed endpoints are detected",()=>{
  const a=leg("BULK_DEPOSIT",1),b=leg("BULK_WITHDRAW",2);
  b.source=a.destination;
  b.destination=a.source;
  assert(explainOverlap(a,b).flags.includes("SAME_PHYSICAL_ENDPOINT"));
});
test("same journal key is reported even with disjoint physical endpoints",()=>{
  const a=leg("LEGACY_Q4",1),b=leg("Q5_OUTPUT",2);
  b.source="minecraft:nether|1|2|3";
  b.destination="minecraft:nether|4|5|6";
  b.journal=a.journal;
  const r=explainOverlap(a,b);
  assert(r.flags.includes("SAME_JOURNAL_KEY"));
  assert(!r.flags.includes("SAME_PHYSICAL_ENDPOINT"));
});
test("same writer, shared region, stale epoch and changed route reported",()=>{
  const a=leg("NATIVE_DIRECT",1),b=leg("BULK_DEPOSIT",2);
  b.writer=a.writer;b.epoch=11;
  const flags=explainOverlap(a,b).flags;
  for(const f of [
    "SAME_WRITER_ID","MIXED_NETWORK_EPOCH",
    "SAME_PHYSICAL_ENDPOINT","CROSS_LANE_IN_FLIGHT"
  ])assert(flags.includes(f));
});
test("invalid comparison stays untrusted rather than raising",()=>{
  const r=explainOverlap(null,leg());
  assert.equal(r.status,"INVALID");
  assert.deepEqual(r.flags,[]);
  zeroRights(r);
});
test("missing complete scan or arrays never mean idle",()=>{
  for(const s of [undefined,null,{},snapshot([],[],false),
    {legs:[],scanComplete:true},{pendingMarkers:[],scanComplete:true}
  ]){
    const r=auditObservedConcurrency(s);
    assert.equal(r.status,"HOLD");
    assert.equal(r.reason,"incomplete_global_writer_inventory");
    zeroRights(r);
  }
});
test("complete empty scan only states model idle",()=>{
  const r=auditObservedConcurrency(snapshot());
  assert.equal(r.status,"MODEL_IDLE_ONLY");
  assert.equal(r.liveCount,0);
  assert.equal(r.pendingCount,0);
  zeroRights(r);
});
test("one active leg is held even if no visible journal",()=>{
  const r=auditObservedConcurrency(snapshot([leg()]));
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"inflight_or_committed_still_requires_operator_proof");
  zeroRights(r);
});
test("pending PREPARED marker blocks new work with zero active legs",()=>{
  const r=auditObservedConcurrency(snapshot([],[marker()]));
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"unresolved_journal_no_replay");
  zeroRights(r);
});
test("pending MOVED marker blocks new work",()=>{
  const r=auditObservedConcurrency(snapshot([],[marker("one","MOVED")]));
  assert.equal(r.reason,"unresolved_journal_no_replay");
});
test("COMMITTED marker remains read-only without separate release proof",()=>{
  const r=auditObservedConcurrency(snapshot([],[marker("one","COMMITTED")]));
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"inflight_or_committed_still_requires_operator_proof");
  zeroRights(r);
});
test("unreadable marker blocks new work, never erased",()=>{
  const r=auditObservedConcurrency(snapshot([],[marker("one","UNREADABLE")]));
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"unresolved_journal_no_replay");
  zeroRights(r);
});
test("malformed journal marker refuses a false clean scan",()=>{
  for(const p of [null,{},[],{id:"x",owner:"o",phase:"new"},
                    {id:"bad space",owner:"o",phase:"PREPARED"}]){
    const r=auditObservedConcurrency(snapshot([],[p]));
    assert.equal(r.status,"HOLD");
    assert.equal(r.reason,"invalid_or_unreadable_pending_marker");
  }
});
test("duplicate id or duplicate journal markers fail closed",()=>{
  const a=leg("LEGACY_Q4",1),b=leg("Q5_OUTPUT",1);
  assert.equal(auditObservedConcurrency(snapshot([a,b])).reason,
    "duplicate_observed_operation");
  assert.equal(auditObservedConcurrency(snapshot([],[marker(),marker()])).reason,
    "duplicate_pending_marker");
});
test("pair audit returns all edges for three simultaneously reported legs",()=>{
  const r=auditObservedConcurrency(snapshot([
    leg("LEGACY_Q4",1),leg("NATIVE_DIRECT",2),leg("Q5_OUTPUT",3)
  ]));
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"inflight_global_writer_conflict");
  assert.equal(r.overlaps.length,3);
  assert(r.overlaps.every(x=>x.flags.includes("COOPERATIVE_GLOBAL_WRITER_COLLISION")));
  zeroRights(r);
});
test("observation scan with one invalid leg cannot silently drop it",()=>{
  const broken=leg();broken.phase="SETTLED_WRONG";
  const r=auditObservedConcurrency(snapshot([leg("LEGACY_Q4",1),broken]));
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"invalid_observed_leg");
});
test("every conceptual route remains non-authorizing in design review",()=>{
  for(const route of ROUTES){
    const r=reviewRouteDesign({route});
    assert.notEqual(r.status,undefined);
    zeroRights(r);
  }
});
test("protected Q4 remains out of new runtime authorization",()=>{
  const r=reviewRouteDesign({route:"LEGACY_Q4"});
  assert.equal(r.status,"EXISTING_SCOPE_ONLY");
  zeroRights(r);
});
test("whole native item stack move to known empty is only a design possibility",()=>{
  const r=reviewRouteDesign({
    route:"NATIVE_DIRECT",shape:"WHOLE_STACK_NATIVE_MOVE",
    sourceItem:{typeId:"minecraft:enchanted_book",amount:1,
                classification:"METADATA_BEARING"},
    destinationEmpty:true,hasIndependentPhysicalCustody:true
  });
  assert.equal(r.status,"MODEL_DESIGN_ONLY");
  zeroRights(r);
});
test("metadata-uninspectable whole stack can only be a non-executable design note",()=>{
  const r=reviewRouteDesign({
    route:"NATIVE_DIRECT",shape:"WHOLE_STACK_NATIVE_MOVE",
    sourceItem:{typeId:"minecraft:shulker_box",amount:1,
                classification:"UNINSPECTABLE"},
    destinationEmpty:true,hasIndependentPhysicalCustody:true
  });
  assert.equal(r.status,"MODEL_DESIGN_ONLY");
  zeroRights(r);
});
test("native whole stack without independent custody is always HOLD",()=>{
  const r=reviewRouteDesign({
    route:"NATIVE_DIRECT",shape:"WHOLE_STACK_NATIVE_MOVE",
    sourceItem:{typeId:"minecraft:cobblestone",amount:1,
                classification:"PLAIN"},
    destinationEmpty:true,hasIndependentPhysicalCustody:false
  });
  assert.equal(r.reason,"native_item_identity_does_not_exclude_external_writers");
  zeroRights(r);
});
test("whole native move with target occupied must not be treated as merge",()=>{
  const r=reviewRouteDesign({
    route:"NATIVE_DIRECT",shape:"WHOLE_STACK_NATIVE_MOVE",
    sourceItem:{typeId:"minecraft:cobblestone",amount:3,
                classification:"PLAIN"},
    destinationEmpty:false,hasIndependentPhysicalCustody:true
  });
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"native_transfer_input_incomplete");
});
test("partial merge or serial reconstruction is not a proven one-step handoff",()=>{
  for(const shape of ["CLONE_SETITEM","MUTATE_TWO_SLOTS","BATCH_MERGE",undefined]){
    const r=reviewRouteDesign({route:"NATIVE_DIRECT",shape});
    assert.equal(r.status,"HOLD");
    assert.equal(r.reason,"partial_merge_or_reconstruction_not_proved");
    zeroRights(r);
  }
});
test("wrong native quantity, item type, or classification refuses",()=>{
  for(const sourceItem of [
    null,{typeId:"minecraft:cobblestone",amount:0,classification:"PLAIN"},
    {typeId:"invalid type",amount:1,classification:"PLAIN"},
    {typeId:"minecraft:cobblestone",amount:1,classification:"UNKNOWN"}
  ]){
    const r=reviewRouteDesign({
      route:"NATIVE_DIRECT",shape:"WHOLE_STACK_NATIVE_MOVE",
      sourceItem,destinationEmpty:true,hasIndependentPhysicalCustody:true
    });
    assert.equal(r.status,"HOLD");
  }
});
test("Q5 to physical output remains blocked regardless of item class",()=>{
  for(const shape of ["WHOLE_STACK_NATIVE_MOVE","VIRTUAL_TO_CHEST"]){
    const r=reviewRouteDesign({route:"Q5_OUTPUT",shape,
      hasIndependentPhysicalCustody:true});
    assert.equal(r.reason,"virtual_debit_and_physical_credit_not_atomic");
    zeroRights(r);
  }
});
test("any proposal for physically spendable Bulk stays blocked",()=>{
  for(const route of ROUTES.filter(x=>x.startsWith("BULK_"))){
    const r=reviewRouteDesign({route,
      hasIndependentPhysicalCustody:true,
      sourceItem:{typeId:"minecraft:cobblestone",amount:1,classification:"PLAIN"}});
    assert.equal(r.status,"HOLD");
    assert.equal(r.reason,"bulk_storage_spendable_custody_unproven");
    zeroRights(r);
  }
});
test("every interrupted cross-domain window is unresolved even with alleged receipt",()=>{
  const phases=["BEFORE_MOVE","AFTER_PHYSICAL_MOVE",
               "AFTER_LOGICAL_DEBIT","AFTER_RECEIPT"];
  for(const phase of phases){
    for(const receiptPersisted of [true,false,"UNKNOWN"]){
      const r=inspectInterruptedPath({
        phase,sourceBefore:"EMPTY",destinationAfter:"ONE",
        queueAfter:"DEBITED",receiptPersisted
      });
      assert.equal(r.status,"HOLD");
      zeroRights(r);
    }
  }
});
test("readback receipt cannot imply crash-atomic settlement",()=>{
  const r=inspectInterruptedPath({
    phase:"AFTER_RECEIPT",sourceBefore:"EMPTY",
    destinationAfter:"ONE",queueAfter:"DEBITED",receiptPersisted:true
  });
  assert.equal(r.reason,"receipt_not_exclusive_cross_domain_durability_proof");
});
test("unreadable physical states keep HOLD, not success by absence",()=>{
  const r=inspectInterruptedPath({
    phase:"AFTER_LOGICAL_DEBIT",sourceBefore:"UNREADABLE",
    destinationAfter:"UNREADABLE",queueAfter:"UNREADABLE",
    receiptPersisted:"UNKNOWN"
  });
  assert.equal(r.status,"HOLD");
  zeroRights(r);
});
test("unknown interruption phase or malformed observation refuses",()=>{
  for(const a of [
    {},
    {phase:"SUDDEN_SETTLEMENT",sourceBefore:"ONE",destinationAfter:"EMPTY",
     queueAfter:"UNCHANGED",receiptPersisted:true},
    {phase:"BEFORE_MOVE",sourceBefore:0,destinationAfter:"EMPTY",
     queueAfter:"UNCHANGED",receiptPersisted:false}
  ]){
    const r=inspectInterruptedPath(a);
    assert.equal(r.status,"HOLD");
    zeroRights(r);
  }
});
test("no caller override can change the permission contract",()=>{
  for(const r of [
    auditObservedConcurrency({legs:[],pendingMarkers:[],scanComplete:true,
                              productionAuthorized:true}),
    reviewRouteDesign({route:"Q5_OUTPUT",canCreditBulk:true}),
    inspectInterruptedPath({phase:"AFTER_RECEIPT",sourceBefore:"ONE",
      destinationAfter:"EMPTY",queueAfter:"UNCHANGED",
      receiptPersisted:true,canReplay:true})
  ]){
    zeroRights(r);
    assert(Object.isFrozen(r));
  }
});
