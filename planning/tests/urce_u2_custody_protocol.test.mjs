import test from "node:test";
import assert from "node:assert/strict";
import {proposeCustodyIntent,classifyCustodyRecovery,densityCounterfactual}
  from "../src/urce_u2_custody_protocol.mjs";

const base=()=>({transactionId:"nonce-1",source:{id:"source",kind:"hopper"},
 target:{id:"receiver-5",kind:"receiver"},identityKind:"ordinary",
 identityRef:"capability-proved:mod:item",quantity:32,sourceCount:64,
 availableCapacity:80,routeVerified:true,nativeAdmissionVerified:true,
 sourceLoaded:true,targetLoaded:true,sourceAuthorityVerified:true,
 targetAuthorityVerified:true,nativeItemOriginalPresent:false,
 existingJournal:null});
const approve=props=>proposeCustodyIntent({...base(),...props});
test("U2-01 candidate proof alone cannot issue a native writer permit",()=>{
 const x=approve({});
 assert.equal(x.decision,"PLAN_ONLY");
 assert.equal(x.intent.executePermitted,false);
 assert.equal(x.intent.autoCommitPermitted,false);
 assert.equal(x.intent.replayPermitted,false);
});
test("U2-02 unknown route, unload and native admission each HOLD",()=>{
 for(const [key,val] of [["routeVerified",false],["sourceLoaded",false],
   ["targetLoaded",false],["nativeAdmissionVerified",false],
   ["sourceAuthorityVerified",false],["targetAuthorityVerified",false]]) {
  assert.equal(approve({[key]:val}).decision,"HOLD",key);
 }
});
test("U2-03 no double writer may proceed while a journal is pending",()=>{
 assert.equal(approve({existingJournal:{phase:"PREPARED"}}).reason,"pending_journal");
});
test("U2-04 never overdraw native source or exceeded dest capacity",()=>{
 assert.equal(approve({quantity:65}).reason,"insufficient_verified_quantity");
 assert.equal(approve({availableCapacity:31}).reason,"insufficient_verified_quantity");
});
test("U2-05 arbitrary ordinary identity accepted if external classifier proved it",()=>{
 for(let i=0;i<32;i++){
  const x=approve({identityRef:"external:"+i});
  assert.equal(x.decision,"PLAN_ONLY");
 }
});
test("U2-06 MR must preserve one original native stack, no counted Bulk",()=>{
 const mr={identityKind:"mr",identityRef:"opaque-native-slot-ref",
   quantity:1,nativeItemOriginalPresent:true};
 const x=approve(mr);
 assert.equal(x.decision,"PLAN_ONLY");
 assert.equal(approve({...mr,target:{id:"bulk-7",kind:"bulk"}}).reason,"mr_cannot_enter_counted_bulk");
 assert.equal(approve({...mr,nativeItemOriginalPresent:false}).reason,"original_native_item_required");
 assert.equal(approve({...mr,quantity:2}).reason,"mr_requires_whole_native_stack_handoff");
});
test("U2-07 source and target cannot be the same custodian",()=>{
 assert.equal(approve({target:{id:"source",kind:"receiver"}}).reason,"invalid_intent");
});
test("U2-08 all interrupted states HOLD even when counts appear conserved",()=>{
 const intent=approve({}).intent;
 const args={intent,phase:"PREPARED",sourceObserved:{loaded:true,qty:32},
   targetObserved:{loaded:true,qty:32},exclusiveNativeOwnership:true,
   sourceReceipt:{authenticated:true,transactionId:intent.transactionId},
   targetReceipt:{authenticated:true,transactionId:intent.transactionId},
   journalReadable:true};
 for(const phase of ["PREPARED","DEBIT_RECORDED","CREDIT_RECORDED","COMMITTED"]) {
   const x=classifyCustodyRecovery({...args,phase});
   assert.equal(x.status,"HOLD");
   assert.equal(x.retryPermitted,false);
   assert.equal(x.creditPermitted,false);
   assert.equal(x.settlePermitted,false);
 }
});
test("U2-09 foreign writers, missing receipts and unloaded chunks HOLD",()=>{
 const intent=approve({}).intent;
 const x=classifyCustodyRecovery({intent,phase:"COMMITTED",
   journalReadable:true,sourceObserved:{loaded:true},targetObserved:{loaded:true},
   exclusiveNativeOwnership:false});
 assert.equal(x.reason,"foreign_writer_possible");
 assert.equal(classifyCustodyRecovery({intent,phase:"COMMITTED",
   journalReadable:true,sourceObserved:{loaded:false},targetObserved:{loaded:true},
   exclusiveNativeOwnership:true}).reason,"custodian_unavailable");
 assert.equal(classifyCustodyRecovery({intent,phase:"COMMITTED",
   journalReadable:true,sourceObserved:{loaded:true},targetObserved:{loaded:true},
   exclusiveNativeOwnership:true}).reason,"missing_exact_receipt");
});
test("U2-10 16/32/64 scenarios separate item throughput from fixed transaction cost",()=>{
 const a=densityCounterfactual(64,16),b=densityCounterfactual(64,32),
       c=densityCounterfactual(64,64);
 assert.deepEqual([a.transactions,b.transactions,c.transactions],[4,2,1]);
 assert.deepEqual([a.modeledPhysicalInventoryWrites,b.modeledPhysicalInventoryWrites,c.modeledPhysicalInventoryWrites],[8,4,2]);
 assert.equal(c.nativeCapacityUnverified,true);
});
test("U2-11 malformed quantities never acquire transfer rights",()=>{
 for(const count of [-1,0,1.4,NaN,Infinity]) {
  assert.equal(approve({quantity:count}).decision,"HOLD");
 }
});
