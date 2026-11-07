import test from "node:test";
import assert from "node:assert/strict";
import {
  CUTS, JOURNAL_STATES, enumerateCrashOutcomes,
  classifyCrashObservation, provenanceCollisionWitness,
  evaluateCustodyAdmission, evaluateEvidenceClaim
} from "../candidates/transport/custody_crash_gate.mjs";

function data(){
  const tx={networkId:"network-1",txId:"transaction-1",epoch:7,count:1,
    sourceId:"minecraft:overworld|-955|69|-804",
    destinationId:"minecraft:overworld|-951|69|-804",
    itemId:"minecraft:cobblestone"};
  const endpoint=(id,isSource)=>({
    id,typeId:"minecraft:chest",loaded:true,isSingleInventory:true,
    size:27,exactOrdinarySingleItem:isSource,exactlyEmpty:!isSource,
    playerWritable:true,automationWritable:false,foreignAddonsBlocked:false
  });
  return {
    tx,
    region:{networkId:tx.networkId,epoch:tx.epoch,fullTopologyKnown:true,
      unknownBoundary:false,sameLoadedRegion:true,ownerCount:1,
      controllerId:"controller-1",claimedControllerId:"controller-1"},
    source:endpoint(tx.sourceId,true),destination:endpoint(tx.destinationId,false),
    fence:{networkId:tx.networkId,epoch:tx.epoch,controllerId:"controller-1",
      compareAndSwapAttested:true,liveAtExecution:true,
      blocksCompetingWriters:true},
    persistence:{atomicJournalInventoryCommitAttested:true,
      recoversBothEndpointsWithoutSplit:true,replayProtectionAttested:true}
  };
}
function assertNeverAutomates(r){
  assert.equal(r.canMoveItem,false);
  assert.equal(r.canRetry,false);
  assert.equal(r.canSettle,false);
  assert.equal(r.canCreditBulk,false);
  assert.equal(r.canReleaseReservation,false);
  assert.equal(r.canClearJournal,false);
}
const syntheticSealed=()=>{
  const d=data();
  for (const endpoint of [d.source,d.destination]){
    endpoint.typeId="hypothetical:sealed_engine_container";
    endpoint.playerWritable=false;
    endpoint.automationWritable=false;
    endpoint.foreignAddonsBlocked=true;
  }
  return d;
};
const classify=(journal,sourceCount,destinationCount,moveCalls=1)=>
  classifyCrashObservation({journal,sourceCount,destinationCount,moveCalls});

test("plain player-accessible vanilla single chests ALWAYS fail physical custody admission",()=>{
  const a=data();
  const r=evaluateCustodyAdmission(a);
  assert.equal(r.status,"REFUSE");
  assert.equal(r.reason,"exclusive_physical_custody_not_demonstrated");
  assertNeverAutomates(r);
});
test("a chest cannot be made exclusive by merely claiming playerWritable false",()=>{
  const a=data();
  for(const x of [a.source,a.destination]){
    x.playerWritable=false;x.automationWritable=false;x.foreignAddonsBlocked=true;
  }
  assert.equal(evaluateCustodyAdmission(a).reason,"exclusive_physical_custody_not_demonstrated");
});
test("neither source-only nor destination-only physical protection suffices",()=>{
  for(const k of ["source","destination"]){
    const a=syntheticSealed();
    a[k].typeId="minecraft:chest";
    assert.equal(evaluateCustodyAdmission(a).reason,"exclusive_physical_custody_not_demonstrated");
  }
});
test("synthetic perfect proof may satisfy model but never issues a runtime transfer permit",()=>{
  const r=evaluateCustodyAdmission(syntheticSealed());
  assert.equal(r.status,"MODEL_PREREQUISITES_ONLY");
  assertNeverAutomates(r);
});
test("no object or transaction ID means no admission",()=>{
  for(const tx of [undefined,null,{},0,[],{...data().tx,txId:""},
    {...data().tx,sourceId:"same",destinationId:"same"},
    {...data().tx,count:2},{...data().tx,epoch:0},
    {...data().tx,itemId:"minecraft:enchanted_book"},
    {...data().tx,sourceId:"../world"}]){
    const a=data();a.tx=tx;
    assert.equal(evaluateCustodyAdmission(a).reason,"invalid_transaction_identity");
  }
});
test("unknown, stale, contested, or split topology prevents custody even in model",()=>{
  for(const edit of [
    {networkId:"foreign"},{epoch:6},{fullTopologyKnown:false},
    {unknownBoundary:true},{sameLoadedRegion:false},{ownerCount:0},
    {ownerCount:2},{controllerId:""},{claimedControllerId:"stale"}
  ]){
    const a=syntheticSealed();
    a.region={...a.region,...edit};
    assert.equal(evaluateCustodyAdmission(a).reason,"region_authority_not_established");
  }
});
test("unknown region object and removed owner cannot be guessed",()=>{
  for(const region of [undefined,null,{},false]){
    const a=syntheticSealed();a.region=region;
    assert.equal(evaluateCustodyAdmission(a).status,"REFUSE");
  }
});
test("unknown, double, unloaded, or modified physical endpoints fail",()=>{
  for(const which of ["source","destination"]){
    for(const edit of [
      {loaded:false},{size:54},{size:0},{isSingleInventory:false},
      {id:"stale-chest"},
      ...(which==="source" ? [{exactOrdinarySingleItem:false},{exactlyEmpty:true}] :
           [{exactOrdinarySingleItem:true},{exactlyEmpty:false}])
    ]){
      const a=syntheticSealed();a[which]={...a[which],...edit};
      assert.equal(evaluateCustodyAdmission(a).reason,"physical_endpoint_snapshot_untrusted");
    }
    const a=syntheticSealed();a[which]=null;
    assert.equal(evaluateCustodyAdmission(a).reason,"physical_endpoint_snapshot_untrusted");
  }
});
test("player access, ordinary automation, or foreign addon writability each block admission",()=>{
  for(const key of ["playerWritable","automationWritable","foreignAddonsBlocked"]){
    const a=syntheticSealed();
    a.source[key]=key==="foreignAddonsBlocked"?false:true;
    assert.equal(evaluateCustodyAdmission(a).reason,"exclusive_physical_custody_not_demonstrated");
    const b=syntheticSealed();
    b.destination[key]=key==="foreignAddonsBlocked"?false:true;
    assert.equal(evaluateCustodyAdmission(b).reason,"exclusive_physical_custody_not_demonstrated");
  }
});
test("claimed but unfenced world ownership refuses even fully sealed synthetic inventories",()=>{
  for(const edit of [
    {epoch:2},{networkId:"other"},{controllerId:"foreign"},
    {compareAndSwapAttested:false},{liveAtExecution:false},
    {blocksCompetingWriters:false}
  ]){
    const a=syntheticSealed();a.fence={...a.fence,...edit};
    assert.equal(evaluateCustodyAdmission(a).reason,"persistent_fencing_not_demonstrated");
  }
});
test("missing fence entirely fails",()=>{
  const a=syntheticSealed();delete a.fence;
  assert.equal(evaluateCustodyAdmission(a).reason,"persistent_fencing_not_demonstrated");
});
test("unproven atomic persistence, split-save risk, or no replay fence blocks custody",()=>{
  for(const k of [
    "atomicJournalInventoryCommitAttested",
    "recoversBothEndpointsWithoutSplit","replayProtectionAttested"]){
    for(const v of [false,undefined]){
      const a=syntheticSealed();a.persistence[k]=v;
      assert.equal(evaluateCustodyAdmission(a).reason,"cross_domain_crash_commit_not_demonstrated");
    }
  }
});
test("no persistence object fails",()=>{
  const a=syntheticSealed();delete a.persistence;
  assert.equal(evaluateCustodyAdmission(a).reason,"cross_domain_crash_commit_not_demonstrated");
});
test("enumerate all conservative storage windows with stable unique cut IDs",()=>{
  const out=enumerateCrashOutcomes();
  assert.equal(out.length,20);
  assert.equal(new Set(CUTS).size,4);
  assert.equal(new Set(JOURNAL_STATES).size,4);
  assert.deepEqual(out.map(x=>x.cut).filter((v,i,a)=>a.indexOf(v)===i),CUTS);
  assert(out.every(x=>Object.isFrozen(x)));
});
test("before INTENT the model has no native move, item still at source",()=>{
  for(const x of enumerateCrashOutcomes().filter(x=>x.cut===CUTS[0])){
    assert.equal(x.moveCalls,0);
    assert.equal(x.sourceCount,1);
    assert.equal(x.destinationCount,0);
    assert.equal(x.conservation,"MATCHES_ONE");
    assertNeverAutomates(x.recovery);
  }
});
test("INTENT readback but no item move still cannot be retried after crash",()=>{
  const x=enumerateCrashOutcomes().filter(x=>x.cut===CUTS[1]);
  assert.equal(x.length,2);
  assert(x.some(o=>o.journal==="HANDOFF_INTENT"));
  for(const o of x){
    assert.equal(o.sourceCount,1);
    assert.equal(o.destinationCount,0);
    assert.equal(o.moveCalls,0);
    assert.equal(o.recovery.status,"HOLD");
    assertNeverAutomates(o.recovery);
  }
});
test("after native move, independent endpoint saves include missing and duplicate possibilities",()=>{
  const xs=enumerateCrashOutcomes().filter(x=>x.cut===CUTS[2]);
  assert.equal(xs.length,8);
  assert(xs.some(x=>x.conservation==="MISSING"));
  assert(xs.some(x=>x.conservation==="DUPLICATE"));
  assert(xs.some(x=>x.conservation==="MATCHES_ONE"));
  assert(xs.every(x=>x.moveCalls===1));
});
test("after journal SETTLED, possible unsynchronized endpoint outcomes still cannot auto-credit",()=>{
  const xs=enumerateCrashOutcomes().filter(x=>x.cut===CUTS[3]);
  assert.equal(xs.length,8);
  assert(xs.some(x=>x.journal==="SETTLED"&&x.conservation==="MISSING"));
  assert(xs.some(x=>x.journal==="SETTLED"&&x.conservation==="DUPLICATE"));
  assert(xs.every(x=>x.recovery.canCreditBulk===false));
});
test("whole crash-state space has zero permissions to move, retry, settle, clear, or credit",()=>{
  for(const x of enumerateCrashOutcomes()){
    assertNeverAutomates(x.recovery);
  }
});
test("INTENT with original at source remains HOLD even if native move never called",()=>{
  const r=classify("HANDOFF_INTENT",1,0,0);
  assert.equal(r.reason,"ambiguous_intent_no_replay");
  assertNeverAutomates(r);
});
test("INTENT with item apparently at destination remains HOLD even after native move",()=>{
  const r=classify("HANDOFF_INTENT",0,1,1);
  assert.equal(r.reason,"ambiguous_intent_no_replay");
  assertNeverAutomates(r);
});
test("even a matching SETTLED journal plus destination item is OBSERVATION_ONLY",()=>{
  const r=classify("SETTLED",0,1,1);
  assert.equal(r.status,"OBSERVATION_ONLY");
  assertNeverAutomates(r);
});
test("SETTLED but item still at source is contradictory and stays HOLD",()=>{
  const r=classify("SETTLED",1,0,1);
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"journal_vs_physical_state_conflict");
});
test("empty journal or reservation never permits filling synthetic Bulk counter",()=>{
  for(const journal of ["EMPTY","RESERVED"]){
    for(const state of [[0,1],[1,0]]){
      const r=classify(journal,...state);
      assert.equal(r.status,"HOLD");
      assertNeverAutomates(r);
    }
  }
});
test("neither chest holding the item is conservatively MISSING after crash",()=>{
  const r=classify("HANDOFF_INTENT",0,0);
  assert.equal(r.reason,"apparent_item_missing_after_crash");
});
test("both chests holding the item is conservatively DUPLICATE after crash",()=>{
  const r=classify("HANDOFF_INTENT",1,1);
  assert.equal(r.reason,"apparent_item_duplicate_after_crash");
});
test("invalid or unloaded observations reject every mutation",()=>{
  for(const value of [
    null,{},[],{journal:"INTENT",sourceCount:1,destinationCount:0,moveCalls:0},
    {journal:"HANDOFF_INTENT",sourceCount:null,destinationCount:0,moveCalls:0},
    {journal:"HANDOFF_INTENT",sourceCount:2,destinationCount:0,moveCalls:0},
    {journal:"HANDOFF_INTENT",sourceCount:0,destinationCount:1,moveCalls:-1}
  ]){
    const r=classifyCrashObservation(value);
    assert.equal(r.status,"HOLD");
    assert.equal(r.reason,"invalid_or_unloaded_physical_observation");
    assertNeverAutomates(r);
  }
});
test("foreign cobblestone substitution and legitimate move have same visible evidence",()=>{
  const w=provenanceCollisionWitness();
  assert.equal(w.indistinguishable,true);
  assert.equal(w.distinctCustody,true);
  assert.equal(w.histories.length,2);
  assert.deepEqual(w.histories[0].observable,w.histories[1].observable);
  assert.equal(w.recovery.status,"HOLD");
  assertNeverAutomates(w.recovery);
});
test("a clean restart alone is not forced-crash or unique custody evidence",()=>{
  const r=evaluateEvidenceClaim({cleanRestart:true});
  assert.equal(r.cleanRestartObserved,true);
  assert.equal(r.productionApproved,false);
  assert.equal(r.missing.length,5);
  assertNeverAutomates(r);
});
test("all asserted evidence flags still need independent authentication",()=>{
  const r=evaluateEvidenceClaim({
    cleanRestart:true,forcedCrash:true,physicalConservation:true,
    uniqueProvenance:true,externalWriterExclusion:true,atomicCommitProof:true
  });
  assert.equal(r.missing.length,0);
  assert.equal(r.status,"EVIDENCE_ONLY");
  assert.equal(r.productionApproved,false);
  assertNeverAutomates(r);
});
test("cold evidence result never mutates caller objects or yields runtime authorization",()=>{
  const d=syntheticSealed();
  const before=structuredClone(d);
  for(let n=0;n<25;n++)assertNeverAutomates(evaluateCustodyAdmission(d));
  assert.deepEqual(d,before);
});
test("identical observations cannot be promoted into a settlement by later snapshots",()=>{
  const witness=provenanceCollisionWitness();
  const observed=witness.histories[0].observable;
  for(let n=0;n<5;n++){
    const r=classifyCrashObservation({...observed,moveCalls:1});
    assert.equal(r.status,"HOLD");
    assertNeverAutomates(r);
  }
});
