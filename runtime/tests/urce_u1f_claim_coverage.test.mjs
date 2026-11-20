/**
 * U1-F: source-specific item-claim census and governed shadow proof gate.
 *
 * The closed-world census is a SYNTHETIC fixture. No current Bedrock observer
 * produces one. An OBSERVED Collector/Receiver topology snapshot alone must
 * never be promoted to COMPLETE item-home coverage.
 *
 * Execute: node --experimental-vm-modules --test
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SCRIPT=path.join(ROOT,"addon/behavior_pack/scripts");
async function load(){
  const context=vm.createContext({}),cache=new Map();
  const make=file=>{
    if(cache.has(file))return cache.get(file);
    const mod=new vm.SourceTextModule(fs.readFileSync(path.join(SCRIPT,file),"utf8"),
      {context,identifier:file});
    cache.set(file,mod);return mod;
  };
  const root=make("urce_source_claim_coverage.js");
  await root.link(specifier=>make(path.basename(specifier)));
  await root.evaluate();
  return {
    audit:root.namespace.auditSourceClaimCoverage,
    evaluate:root.namespace.evaluateAuditedGovernedShadow,
    graph:make("urce_152_route_model.js").namespace.buildReadOnlyGraph,
    project:make("urce_152_shadow_evidence_bridge.js").namespace.projectObservedShadowGraph
  };
}
const TICK=36;
const closure=()=>({
  networkBoundary:true,sorterDiscovery:true,destinationDiscovery:true,
  externalNativeBoundary:true,itemIdentity:true
});
function fixture(build,{unknownAuto=false}={}){
  const graph=build([
    {id:"source",kind:"collector",loaded:true},
    {id:"filter",kind:"sorter",loaded:true},
    {id:"auto",kind:"sorter",loaded:true},
    {id:"wildcard",kind:"sorter",loaded:true},
    // Not reachable from source: does NOT obligate this source's census.
    {id:"distant",kind:"sorter",loaded:true}
  ],[
    {from:"source",to:"filter",kind:"local",loaded:true,verified:true},
    {from:"source",to:"auto",kind:"local",loaded:true,verified:true},
    {from:"source",to:"wildcard",kind:"local",loaded:true,verified:true}
  ]);
  const projection={status:"OBSERVED",graph,
    sourceClaimCoverage:"UNKNOWN",executePermitted:false,
    mayAuthorizeCargo:false};
  const enumeration={kind:"independent_item_claim_census",
    status:"CLOSED",source:"source",observedTick:TICK,
    closure:closure(),claimantNodeIds:["filter","auto","wildcard"]};
  const observations=[
    {nodeId:"filter",tier:"filter",columnId:"c0",bottomUp:0,
      claim:"yes",evidenceKind:"filter_config",observedTick:TICK},
    {nodeId:"auto",tier:"auto",columnId:"c1",bottomUp:0,
      claim:unknownAuto?"unknown":"no",
      evidenceKind:unknownAuto?"unknown":"native_auto_seed",
      observedTick:TICK},
    {nodeId:"wildcard",tier:"wildcard",columnId:"c2",bottomUp:0,
      claim:"yes",evidenceKind:"wildcard_config",observedTick:TICK}
  ];
  const frame={status:"NO_LOCAL_CLAIM",captured:true,
    targets:[],offers:[],executePermitted:false};
  return {projection,source:"source",currentTick:TICK,
    enumeration,observations,frame,itemClass:"ordinary"};
}
const auditArgs=f=>({
  projection:f.projection,source:f.source,currentTick:f.currentTick,
  enumeration:f.enumeration,observations:f.observations,itemClass:f.itemClass
});
function verifyNoAuthority(result){
  assert.equal(result.executePermitted,false);
  assert.equal(result.persistPermitted,false);
  if("mayAuthorizeCargo" in result)assert.equal(result.mayAuthorizeCargo,false);
}

test("U1-F E-observed endpoint topology alone does not certify item claims",async()=>{
  const {audit,graph,project}=await load();
  const f=fixture(graph);
  // This is the actual U1-E projection over endpoint-only observations.
  const nodes=[
    {id:"C",kind:"collector",loaded:true},
    {id:"R",kind:"receiver",loaded:true}
  ];
  const edge={from:"C",to:"R",kind:"collector_receiver",
    verified:true,loaded:true};
  const g=graph(nodes,[edge]);
  const observation={
    status:"OBSERVED",
    native:{status:"OBSERVED",graph:g,edges:[edge],unknown:[]},
    visual:{status:"OBSERVED",components:[],unresolved:[]},
    normalized:{conflicts:[]}
  };
  const projected=project(observation);
  assert.equal(projected.status,"OBSERVED");
  assert.equal(projected.sourceClaimCoverage,"UNKNOWN");
  assert.equal(audit({
    projection:projected,source:"C",currentTick:TICK,
    enumeration:undefined,observations:[]
  }).status,"HOLD");
  verifyNoAuthority(projected);
  assert.equal(audit({...auditArgs(f),enumeration:undefined}).status,"HOLD");
});

test("U1-F explicitly closed synthetic source census accounts for every reachable claim, never writes",async()=>{
  const {audit,evaluate,graph}=await load();
  const f=fixture(graph);
  const evidence=audit(auditArgs(f));
  assert.equal(evidence.status,"COMPLETE_FOR_SHADOW");
  assert.equal(evidence.claimResolution,"OBSERVED");
  assert.equal(evidence.claimantCount,3);
  assert.deepEqual(Array.from(evidence.offers,x=>x.nodeId),["filter","auto","wildcard"]);
  assert.equal(evidence.coverage,"COMPLETE");
  verifyNoAuthority(evidence);
  const shadow=evaluate({...f,existingBulkHome:"no",applicableBulkState:"full"});
  assert.equal(shadow.decision,"SHADOW_CANDIDATES");
  assert.deepEqual(Array.from(shadow.plan.stages,x=>x.tier),["filter","wildcard"]);
  verifyNoAuthority(shadow);
});

test("U1-F unseeded Auto is UNKNOWN and cannot trigger unclaimed fallback",async()=>{
  const {audit,evaluate,graph}=await load();
  const f=fixture(graph,{unknownAuto:true});
  const evidence=audit(auditArgs(f));
  assert.equal(evidence.status,"COMPLETE_FOR_SHADOW");
  assert.equal(evidence.claimResolution,"UNKNOWN");
  assert.deepEqual(Array.from(evidence.unresolvedOwners),["auto"]);
  const result=evaluate({...f,existingBulkHome:"no",applicableBulkState:"full"});
  assert.equal(result.decision,"SHADOW_CANDIDATES");
  assert.equal(result.plan.unresolved,true);
  assert.deepEqual(Array.from(result.plan.stages,x=>x.tier),["filter"]);
  verifyNoAuthority(result);
});

test("U1-F missing/duplicate/unreachable and stale observations fail closed",async()=>{
  const {audit,graph}=await load();
  const f=fixture(graph);
  const bad=[
    {name:"incomplete scope",patch:{enumeration:{...f.enumeration,
      closure:{...closure(),sorterDiscovery:false}}}},
    {name:"wrong tick",patch:{currentTick:TICK+1}},
    {name:"missing owner",patch:{enumeration:{...f.enumeration,
      claimantNodeIds:["filter","auto"]},observations:f.observations.slice(0,2)}},
    {name:"unexpected disconnected owner",patch:{enumeration:{...f.enumeration,
      claimantNodeIds:["filter","auto","wildcard","distant"]},
      observations:[...f.observations,{
        nodeId:"distant",tier:"filter",columnId:"x",bottomUp:0,
        claim:"yes",evidenceKind:"filter_config",observedTick:TICK}]}},
    {name:"duplicate observation",patch:{observations:[
      f.observations[0],f.observations[0],f.observations[2]]}},
    {name:"stale Auto seed",patch:{observations:[
      f.observations[0],{...f.observations[1],observedTick:TICK-1},
      f.observations[2]]}},
    {name:"cached full interpreted as Auto negative",patch:{observations:[
      f.observations[0],{...f.observations[1],evidenceKind:"cache_full"},
      f.observations[2]]}},
    {name:"partial U1-E projection",patch:{projection:{
      ...f.projection,status:"PARTIAL"}}},
    {name:"no named source",patch:{source:"missing"}}
  ];
  for(const x of bad){
    const result=audit({...auditArgs(f),...x.patch});
    assert.equal(result.status,"HOLD",x.name);
    assert.equal(result.coverage,"UNKNOWN",x.name);
    verifyNoAuthority(result);
  }
});

test("U1-F unverified source-reachable branch holds even if census says closed",async()=>{
  const {audit,graph}=await load();
  const f=fixture(graph);
  const g=graph([...f.projection.graph.byId.values()],
    [...f.projection.graph.outgoing.values()].flat().map(e=>({...e})).concat({
      from:"source",to:"distant",kind:"hopper",
      loaded:false,verified:false
    }));
  const result=audit({...auditArgs(f),projection:{
    ...f.projection,graph:g}});
  assert.equal(result.status,"HOLD");
  assert.equal(result.reason,"source_reachable_graph_incomplete");
  verifyNoAuthority(result);
});

test("U1-F local claim frame and independently audited candidates must agree",async()=>{
  const {evaluate,graph}=await load();
  const f=fixture(graph);
  const mismatching={
    ...f,frame:{...f.frame,offers:[{
      nodeId:"filter",tier:"auto",claim:"yes"
    }]}
  };
  const result=evaluate(mismatching);
  assert.equal(result.decision,"SHADOW_HOLD");
  assert.equal(result.reason,"local_offer_not_reconciled");
  verifyNoAuthority(result);
});

test("U1-F module has no live runtime import, native API or persistent writer",()=>{
  const src=fs.readFileSync(path.join(SCRIPT,"urce_source_claim_coverage.js"),"utf8");
  const main=fs.readFileSync(path.join(SCRIPT,"main.js"),"utf8");
  for(const forbidden of [/from\s*["']@minecraft\/server/,
    /\bsetItem\s*\(/,/\bsetDynamicProperty\s*\(/,
    /\bloadReceiverQueue\s*\(/,/\bregisterCollector\s*\(/,
    /\bsaveJournal\s*\(/,/\bsaveQueueJournal\s*\(/,
    /\bsystem\.runInterval\s*\(/]){
    assert.doesNotMatch(src,forbidden);
  }
  assert.doesNotMatch(main,/urce_source_claim_coverage\.js/);
});
