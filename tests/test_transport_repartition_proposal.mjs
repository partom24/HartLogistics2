import test from "node:test";
import assert from "node:assert/strict";
import {proposeRegionRepartition} from "../candidates/transport/region_repartition_proposal.mjs";

const a="0,0,0",b="1,0,0",c="2,0,0",d="3,0,0";
const noRights=r=>{
  for(const field of [
    "canMoveItems","canDebitQueue","canCreditDestination","canCreditBulk",
    "canReplay","canSettle","canReleaseReservation","canClearJournal",
    "canAssumeControllerAuthority","canCommitEpoch","productionAuthorized"
  ]) assert.equal(r[field],false,field);
};
const base=()=>({
  networkId:"network-1",dimensionId:"minecraft:overworld",previousEpoch:12,
  freeze:{state:"FROZEN",scope:"ALL_HART_SCRIPT_ROUTING",
          persistedReadback:true,epoch:12},
  globalWriterScanComplete:true,pendingOperations:[],
  expectedNodes:[a,b,c],loadedNodes:[a,b,c],unknownBoundary:false,
  predecessorInventoryComplete:true,
  predecessorClaims:[{controllerId:"bulk-a",regionId:"old-r1",
                      networkId:"network-1",epoch:12}],
  fencedControllerIds:["bulk-a"],
  controllers:[{id:"bulk-a",node:a,networkId:"network-1",
                dimensionId:"minecraft:overworld",live:true}]
});
const testHold=(name,edit,reason)=>test(name,()=>{
  const s=base();edit(s);
  const r=proposeRegionRepartition(s);
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,reason);
  noRights(r);
});
const candidate=(id,node,s)=>({id,node,networkId:s.networkId,
                                dimensionId:s.dimensionId,live:true});
test("fully asserted frozen graph returns only a nonexecutable proposal",()=>{
  const r=proposeRegionRepartition(base());
  assert.equal(r.status,"PLAN_ONLY");
  assert.equal(r.suggestedEpoch,13);
  assert.equal(r.regions.length,1);
  assert.deepEqual(r.regions[0].nodes,[a,b,c]);
  assert.equal(r.regions[0].proposedControllerId,"bulk-a");
  assert.equal(r.regions[0].proposedRegionId,"network-1:e13:r1");
  assert.equal(r.externallyAuthenticated,false);
  assert.equal(r.physicalCustodyProven,false);
  noRights(r);
});
test("same-component smallest durable ID ranks first without granting authority",()=>{
  const s=base();s.controllers.push(candidate("bulk-0",c,s));
  const r=proposeRegionRepartition(s);
  assert.equal(r.regions[0].proposedControllerId,"bulk-0");
  assert.deepEqual(r.regions[0].alternateControllerIds,["bulk-a"]);
  noRights(r);
});
test("all input order permutations yield one identical proposed graph",()=>{
  const s=base();s.controllers.push(candidate("bulk-b",c,s));
  const expected=proposeRegionRepartition(s);
  const perm=(xs)=>xs.length===0?[[]]:perm(xs.slice(1)).flatMap(p=>
    Array.from({length:p.length+1},(_,i)=>[...p.slice(0,i),xs[0],...p.slice(i)]));
  let n=0;
  for(const expectedNodes of perm([a,b,c]))
    for(const loadedNodes of perm([a,b,c]))
      for(const controllers of [s.controllers,[...s.controllers].reverse()]){
        assert.deepEqual(proposeRegionRepartition({...s,expectedNodes,loadedNodes,controllers}),
                         expected);n++;
      }
  assert.equal(n,72);noRights(expected);
});
test("verified removed bridge splits into two proposed controller regions",()=>{
  const s=base();s.expectedNodes=[a,c];s.loadedNodes=[c,a];
  s.controllers.push(candidate("bulk-b",c,s));
  const r=proposeRegionRepartition(s);
  assert.equal(r.status,"PLAN_ONLY");
  assert.deepEqual(r.regions.map(x=>x.nodes),[[a],[c]]);
  assert.deepEqual(r.regions.map(x=>x.proposedControllerId),["bulk-a","bulk-b"]);
  noRights(r);
});
test("six-neighbor loop stays one region",()=>{
  const s=base();s.expectedNodes=[a,b,"1,0,1","0,0,1"];
  s.loadedNodes=[...s.expectedNodes].reverse();
  assert.equal(proposeRegionRepartition(s).regions.length,1);
});
test("diagonal blocks are separate regions, never connected implicitly",()=>{
  const s=base();s.expectedNodes=[a,"1,0,1"];s.loadedNodes=[...s.expectedNodes];
  s.controllers.push(candidate("bulk-b","1,0,1",s));
  const r=proposeRegionRepartition(s);
  assert.equal(r.regions.length,2);noRights(r);
});
test("two predecessor regions must both be fenced before proposed merge",()=>{
  const s=base();s.controllers.push(candidate("bulk-b",c,s));
  s.predecessorClaims.push({controllerId:"bulk-b",regionId:"old-r2",
                            networkId:s.networkId,epoch:12});
  assert.equal(proposeRegionRepartition(s).reason,
               "predecessor_ownership_or_fencing_unproven");
  s.fencedControllerIds.push("bulk-b");
  const r=proposeRegionRepartition(s);
  assert.equal(r.status,"PLAN_ONLY");assert.equal(r.regions.length,1);noRights(r);
});
test("fence and predecessor permutations do not change candidate regions",()=>{
  const s=base();s.expectedNodes=[a,c];s.loadedNodes=[c,a];
  s.controllers.push(candidate("bulk-b",c,s));
  s.predecessorClaims.push({controllerId:"bulk-b",regionId:"old-r2",
                            networkId:s.networkId,epoch:12});
  s.fencedControllerIds.push("bulk-b");
  const expected=proposeRegionRepartition(s);
  const reordered=structuredClone(s);
  for(const key of ["expectedNodes","loadedNodes","controllers",
                    "predecessorClaims","fencedControllerIds"])
    reordered[key].reverse();
  assert.deepEqual(proposeRegionRepartition(reordered),expected);noRights(expected);
});
test("large connected synthetic graph has no fabricated partitions",()=>{
  const s=base();s.expectedNodes=Array.from({length:300},(_,i)=>i+",0,0");
  s.loadedNodes=[...s.expectedNodes].reverse();
  const r=proposeRegionRepartition(s);
  assert.equal(r.status,"PLAN_ONLY");
  assert.equal(r.regions.length,1);assert.equal(r.regions[0].nodes.length,300);
  noRights(r);
});
test("model is pure and freezes returned plan arrays",()=>{
  const s=base(),before=structuredClone(s),r=proposeRegionRepartition(s);
  assert.deepEqual(s,before);
  for(const x of [r,r.regions,r.regions[0],r.regions[0].nodes,
                  r.regions[0].alternateControllerIds])
    assert(Object.isFrozen(x));
});
test("forged permissions in model input never flow to output",()=>{
  const r=proposeRegionRepartition({...base(),canMoveItems:true,
                                   canCommitEpoch:true,productionAuthorized:true});
  assert.equal(r.status,"PLAN_ONLY");noRights(r);
});
test("malformed nonobjects never throw or grant rights",()=>{
  for(const v of [null,undefined,false,3,"x",[],{}, {networkId:"network-1"}]){
    const r=proposeRegionRepartition(v);
    assert.equal(r.status,"HOLD");noRights(r);
  }
});
testHold("network name missing",s=>s.networkId="","invalid_network_dimension_or_epoch");
testHold("dimension identity missing",s=>s.dimensionId="","invalid_network_dimension_or_epoch");
testHold("epoch zero",s=>s.previousEpoch=0,"invalid_network_dimension_or_epoch");
testHold("epoch maximum safe overflow",s=>s.previousEpoch=Number.MAX_SAFE_INTEGER,
         "invalid_network_dimension_or_epoch");
testHold("string epoch rejected",s=>s.previousEpoch="12","invalid_network_dimension_or_epoch");
testHold("network identifier path escape rejected",s=>s.networkId="../bad",
         "invalid_network_dimension_or_epoch");
testHold("freeze absent",s=>s.freeze=null,"global_freeze_unverified");
testHold("freeze not FROZEN",s=>s.freeze.state="RUNNING","global_freeze_unverified");
testHold("freeze only NETWORK not global",s=>s.freeze.scope="NETWORK_ONLY","global_freeze_unverified");
testHold("freeze not read back",s=>s.freeze.persistedReadback=false,"global_freeze_unverified");
testHold("freeze belongs to wrong epoch",s=>s.freeze.epoch=11,"global_freeze_unverified");
testHold("incomplete writer scan",s=>s.globalWriterScanComplete=false,
         "pending_or_unobserved_operations");
testHold("unresolved handoff blocks plan",s=>s.pendingOperations.push({phase:"HANDOFF_INTENT"}),
         "pending_or_unobserved_operations");
testHold("missing pending marker collection",s=>delete s.pendingOperations,
         "pending_or_unobserved_operations");
testHold("unloaded bridge is unknown, not split",s=>s.loadedNodes=[a,c],
         "incomplete_or_unknown_topology");
testHold("unknown boundary blocks full local visible region",s=>s.unknownBoundary=true,
         "incomplete_or_unknown_topology");
testHold("missing expected graph node",s=>s.expectedNodes=[a,b],
         "incomplete_or_unknown_topology");
testHold("extra loaded node",s=>s.loadedNodes=[a,b,c,d],
         "incomplete_or_unknown_topology");
testHold("duplicate expected node",s=>s.expectedNodes=[a,a,b,c],
         "incomplete_or_unknown_topology");
testHold("noncanonical coordinate rejected",s=>s.expectedNodes=[a,"01,0,0"],
         "incomplete_or_unknown_topology");
testHold("out of range coordinate rejected",s=>s.expectedNodes=[a,"30000001,0,0"],
         "incomplete_or_unknown_topology");
testHold("split without second controller cannot borrow region owner",
         s=>{s.expectedNodes=[a,c];s.loadedNodes=[a,c]},
         "region_without_live_candidate_controller");
testHold("duplicate controller ID",s=>s.controllers.push(candidate("bulk-a",b,s)),
         "invalid_or_unavailable_candidate_controller");
testHold("two controllers on one node",s=>s.controllers.push(candidate("bulk-b",a,s)),
         "invalid_or_unavailable_candidate_controller");
testHold("candidate controller in foreign network",s=>s.controllers[0].networkId="network-2",
         "invalid_or_unavailable_candidate_controller");
testHold("candidate controller in foreign dimension",
         s=>s.controllers[0].dimensionId="minecraft:nether",
         "invalid_or_unavailable_candidate_controller");
testHold("candidate controller cannot be outside topology",
         s=>s.controllers[0].node="99,0,0",
         "invalid_or_unavailable_candidate_controller");
testHold("unloaded controller cannot take authority",s=>s.controllers[0].live=false,
         "invalid_or_unavailable_candidate_controller");
testHold("unknown predecessor inventory",s=>s.predecessorInventoryComplete=false,
         "predecessor_ownership_or_fencing_unproven");
testHold("missing predecessor fences",s=>s.fencedControllerIds=[],
         "predecessor_ownership_or_fencing_unproven");
testHold("duplicate fence ACK cannot substitute for different owner",
         s=>s.fencedControllerIds=["bulk-a","bulk-a"],
         "predecessor_ownership_or_fencing_unproven");
testHold("foreign fence ACK cannot establish original owner's retirement",
         s=>s.fencedControllerIds=["bulk-other"],
         "predecessor_ownership_or_fencing_unproven");
testHold("predecessor stale epoch",s=>s.predecessorClaims[0].epoch=11,
         "predecessor_ownership_or_fencing_unproven");
testHold("predecessor foreign network",s=>s.predecessorClaims[0].networkId="other",
         "predecessor_ownership_or_fencing_unproven");
testHold("duplicate predecessor region",s=>s.predecessorClaims.push({
  controllerId:"bulk-b",regionId:"old-r1",networkId:"network-1",epoch:12}),
  "predecessor_ownership_or_fencing_unproven");
testHold("same predecessor claimant listed twice",s=>s.predecessorClaims.push({
  controllerId:"bulk-a",regionId:"old-r2",networkId:"network-1",epoch:12}),
  "predecessor_ownership_or_fencing_unproven");
testHold("no automatic genesis election from absent predecessor",
         s=>{s.predecessorClaims=[];s.fencedControllerIds=[]},
         "predecessor_ownership_or_fencing_unproven");
