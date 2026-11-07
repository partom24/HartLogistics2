import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileOrdinaryCustody, classifySlots, REQUIRED_SLOTS, KNOWN_SETTLEMENT
} from "../candidates/transport/physical_reconciliation_core.mjs";
const ID = "minecraft:cobblestone";
const C = Object.freeze({typeId:ID,amount:1,metadataFree:true,losslessIdentity:true});
const empty = () => Array(REQUIRED_SLOTS).fill(null);
const aItem = () => {
  const a=empty();
  a[0]={...C};
  return a;
};
const expected = () => ({networkId:"network-alpha",txId:"tx-1",epoch:7,itemId:ID,
  count:1,sourceId:"minecraft:overworld|-955|69|-804",
  destinationId:"minecraft:overworld|-951|69|-804"});
const authority = (e=expected()) => ({
  loaded:true,exclusive:true,networkId:e.networkId,epoch:e.epoch,
  sourceId:e.sourceId,destinationId:e.destinationId
});
const chest = (blockId,slots=empty()) => ({
  loaded:true,blockType:"minecraft:chest",blockId,containerSize:27,
  isolated:true,slots
});
const receipt = (e=expected()) => ({
  txId:e.txId,networkId:e.networkId,epoch:e.epoch,sourceId:e.sourceId,
  destinationId:e.destinationId,itemId:e.itemId,count:1,
  physicalReadback:"A_EMPTY_B_ONE"
});
const journal = (phase="SETTLED",e=expected()) => ({
  ...e,phase,receipt:phase==="SETTLED"?receipt(e):null
});
const scenario = (phase="SETTLED",isAfter=true) => {
  const e=expected();
  return {
    expected:e,journal:journal(phase,e),authority:authority(e),
    source:chest(e.sourceId,isAfter?empty():aItem()),
    destination:chest(e.destinationId,isAfter?aItem():empty())
  };
};
const check = (arg) => reconcileOrdinaryCustody(arg);
function assertNoAutomation(r) {
  assert.equal(r.canMoveItem,false);
  assert.equal(r.canRetry,false);
  assert.equal(r.canReleaseReservation,false);
  assert.equal(r.canAutoSettle,false);
  assert.equal(r.canAutoClear,false);
}

test("exact 27-slot source-empty/destination-one with settled receipt is observed",()=>{
  const got=check(scenario());
  assert.equal(got.status,KNOWN_SETTLEMENT);
  assert.equal(got.reason,"recorded_receipt_matches_live_vanilla_chests");
  assertNoAutomation(got);
});
test("settled proof with source still holding the item is HOLD, never success",()=>{
  const r=check(scenario("SETTLED",false));
  assert.equal(r.reason,"settlement_vs_physical_mismatch");
  assertNoAutomation(r);
});
test("pre-handoff RESERVED and source still holding one remains frozen",()=>{
  const r=check(scenario("RESERVED",false));
  assert.equal(r.reason,"pre_handoff_reservation");
  assertNoAutomation(r);
});
test("RESERVED but physical item at destination is inconsistent",()=>{
  const r=check(scenario("RESERVED",true));
  assert.equal(r.reason,"reservation_vs_physical_mismatch");
  assertNoAutomation(r);
});
test("INTENT + unchanged physical source holds and forbids automatic retry",()=>{
  const r=check(scenario("HANDOFF_INTENT",false));
  assert.equal(r.reason,"ambiguous_intent_source_retains_item");
  assertNoAutomation(r);
});
test("INTENT + destination already credited still holds and cannot auto-settle",()=>{
  const r=check(scenario("HANDOFF_INTENT",true));
  assert.equal(r.reason,"ambiguous_intent_destination_contains_item");
  assertNoAutomation(r);
});
test("aborted with source item stays held for operator review",()=>{
  const r=check(scenario("ABORTED",false));
  assert.equal(r.reason,"aborted_no_move_observed");
  assertNoAutomation(r);
});
test("aborted record and destination item is a suspicious mismatch",()=>{
  const r=check(scenario("ABORTED",true));
  assert.equal(r.reason,"abort_vs_physical_mismatch");
  assertNoAutomation(r);
});
test("unknown state never invents a transition",()=>{
  const r=check(scenario("UNKNOWN",true));
  assert.equal(r.reason,"unknown_journal_phase");
  assertNoAutomation(r);
});
test("missing or invalid expected transaction identity always holds",()=>{
  for(const bad of [
    null,{}, {...expected(),txId:""}, {...expected(),count:0},
    {...expected(),count:2}, {...expected(),epoch:0},
    {...expected(),sourceId:expected().destinationId}
  ]){
    const s=scenario();
    s.expected=bad;
    assert.equal(check(s).status,"HOLD");
  }
});
test("stale epoch, foreign network, absent exclusive claim or unloaded controller holds",()=>{
  for(const edit of [
    {exclusive:false},{exclusive:undefined},{loaded:false},{epoch:6},
    {networkId:"network-beta"},{sourceId:"foreign"},{destinationId:"foreign"}
  ]){
    const s=scenario();
    s.authority={...s.authority,...edit};
    const r=check(s);
    assert.equal(r.reason,"missing_live_authority");
    assertNoAutomation(r);
  }
});
test("missing, wrong, duplicated transaction identity and stale journal epoch hold",()=>{
  for(const edit of [
    null,{txId:"tx-other"},{epoch:6},{sourceId:"elsewhere"},
    {destinationId:"elsewhere"},{count:2},{itemId:"minecraft:dirt"},
    {networkId:"network-foreign"}
  ]){
    const s=scenario();
    s.journal=edit===null?null:{...s.journal,...edit};
    assert.equal(check(s).reason,"missing_or_conflicting_journal");
  }
});
test("missing, unloaded, wrong-size or wrong-type source/dest refuse",()=>{
  for(const kind of ["source","destination"]) {
    for(const edit of [
      null,{loaded:false},{containerSize:54},{containerSize:0},
      {blockType:"minecraft:barrel"},{blockId:"other"},
      {isolated:false}
    ]){
      const s=scenario();
      s[kind]=edit===null?null:{...s[kind],...edit};
      assert.equal(check(s).reason,"missing_or_unverified_chest");
    }
  }
});
test("empty-array and abbreviated snapshots are incomplete",()=>{
  for(const bad of [null,[],Array(26).fill(null),Array(28).fill(null)]) {
    assert.equal(classifySlots(bad,ID).ok,false);
    const s=scenario();
    s.destination.slots=bad;
    assert.equal(check(s).reason,"untrusted_inventory_readback");
  }
});
test("sparse arrays are untrusted and never counted as empty",()=>{
  const s=scenario();
  s.source.slots=Array(27);
  assert.equal(check(s).reason,"untrusted_inventory_readback");
  assert.equal(classifySlots(s.source.slots,ID).reason,"slot_unobserved");
});
test("undefined, false or unrecognized empty slot is never guessed as null",()=>{
  for(const bad of [undefined,false,0,"empty",{},[]]){
    const s=scenario();
    s.source.slots[1]=bad;
    assert.equal(check(s).reason,"untrusted_inventory_readback");
  }
});
test("metadata-rich, unnamed or unknown item class is held",()=>{
  for(const edit of [
    {metadataFree:false},{metadataFree:undefined},{losslessIdentity:false},
    {losslessIdentity:undefined},{typeId:"minecraft:enchanted_book"},
    {typeId:undefined},{amount:2},{amount:1.5},
    {amount:0},{amount:-1},{amount:Infinity},{amount:65}
  ]){
    const s=scenario();
    s.destination.slots[0]={...C,...edit};
    assert.equal(check(s).reason,"untrusted_inventory_readback");
  }
});
test("extra source or destination items, duplicate stacks and wrong slot hold",()=>{
  for(const setup of [
    s=>{s.source.slots[0]={...C};},
    s=>{s.destination.slots[1]={...C};},
    s=>{s.destination.slots[0]=null;s.destination.slots[2]={...C};},
    s=>{s.source.slots[4]={...C};s.destination.slots[0]=null;},
    s=>{s.destination.slots[0]=null;}
  ]) {
    const s=scenario();
    setup(s);
    assert.equal(check(s).status,"HOLD");
  }
});
test("settled receipt absent or malformed cannot be inferred from matching slots",()=>{
  const e=expected();
  for(const bad of [
    null,{}, { ...receipt(e),txId:"other" },
    {...receipt(e),sourceId:"foreign"},{...receipt(e),destinationId:"foreign"},
    {...receipt(e),networkId:"foreign"},{...receipt(e),epoch:9},
    {...receipt(e),itemId:"minecraft:dirt"},{...receipt(e),count:2},
    {...receipt(e),physicalReadback:"ASSERTED"},
    {...receipt(e),unexpectedField:true}
  ]) {
    const s=scenario();
    s.journal.receipt=bad;
    assert.equal(check(s).reason,"missing_or_conflicting_settlement_receipt");
  }
});
test("intact SETTLED record does not override foreign chest item ID",()=>{
  const s=scenario();
  s.destination.slots[0]={...C,typeId:"minecraft:diamond"};
  assert.equal(check(s).reason,"untrusted_inventory_readback");
});
test("total 0, 2 and split inventories remain a hold",()=>{
  for(const [from,to]of [
    [empty(),empty()],[aItem(),aItem()]
  ]) {
    const s=scenario();
    s.source.slots=from;
    s.destination.slots=to;
    assert.equal(check(s).reason,"inventory_conflict");
    assertNoAutomation(check(s));
  }
});
test("valid observation never permits a future physical move or bank mutation",()=>{
  for(const phase of ["RESERVED","HANDOFF_INTENT","ABORTED","SETTLED","UNKNOWN"]){
    for(const after of [true,false]) {
      const r=check(scenario(phase,after));
      assertNoAutomation(r);
    }
  }
});
test("must not treat same item type and count as unique provenance",()=>{
  const s=scenario("HANDOFF_INTENT",true);
  s.destination.slots[0]={...C};
  const r=check(s);
  assert.equal(r.status,"HOLD");
  assert.equal(r.canAutoSettle,false);
});
test("repeated observations are deterministic and do not mutate snapshots",()=>{
  const s=scenario();
  const original=structuredClone(s);
  const first=check(s),second=check(s);
  assert.deepEqual(first,second);
  assert.deepEqual(s,original);
});
test("conflicting source/destination authoritative IDs refuse even if all slots match",()=>{
  const s=scenario();
  s.source.blockId=s.destination.blockId;
  assert.equal(check(s).reason,"missing_or_unverified_chest");
});
test("multiple receipt metadata fields cannot be quietly ignored",()=>{
  const s=scenario();
  s.journal.receipt.sourceSlot=0;
  assert.equal(check(s).status,"HOLD");
});
