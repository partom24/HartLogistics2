/**
 * URCE U1-C/D: real ESM read-only offer bridge + source-scoped shadow policy.
 * node --experimental-vm-modules --test runtime/tests/urce_u1cd_shadow_contract.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SCRIPTS=path.join(ROOT,"addon/behavior_pack/scripts");
async function modules(){
  const cache=new Map();
  const make=name=>{
    if(cache.has(name))return cache.get(name);
    const m=new vm.SourceTextModule(fs.readFileSync(path.join(SCRIPTS,name),"utf8"),
      {identifier:name});cache.set(name,m);return m;
  };
  const top=make("urce_source_scoped_shadow.js");
  await top.link((specifier,ref)=>make(path.basename(specifier)));
  await top.evaluate();
  const bridge=make("urce_column_offer_bridge.js");
  if(bridge.status==="unlinked"){
    await bridge.link((specifier,ref)=>make(path.basename(specifier)));
    await bridge.evaluate();
  }
  return {frame:bridge.namespace.prepareLocalColumnFrame,
    shadow:top.namespace.evaluateSourceScopedShadow,
    graph:make("urce_152_route_model.js").namespace.buildReadOnlyGraph,
    plan:make("urce_152_route_model.js").namespace.planReadOnlyCandidates};
}
const type=id=>({typeId:id});
const entry=(mode,y,match)=>({
  d:"minecraft:overworld",x:44,y,z:0,m:mode,
  f:match?{match:{typeId:match}}:null
});
const modeOf=e=>e.m;
const matches=(stack,f)=>stack.typeId===f?.match?.typeId;
const ordered=(list,item)=>[
  ...list.filter(e=>modeOf(e)==="filter"&&e.f&&matches(item,e.f)),
  ...list.filter(e=>modeOf(e)==="auto"),
  ...list.filter(e=>modeOf(e)==="wildcard")
];

test("U1-C default live bridge preserves legacy order without building shadow evidence",async()=>{
  const {frame}=await modules();
  const modes=["filter","bypass","auto","wildcard"];
  let comparisons=0;
  for(let code=0;code<1024;code++){
    let n=code;
    const sorters=[];
    for(let i=0;i<5;i++){
      sorters.push(entry(modes[n%4],64+i,i%2===0?"minecraft:cobblestone":"minecraft:diamond"));
      n=Math.floor(n/4);
    }
    for(const itemId of ["minecraft:cobblestone","minecraft:dirt","minecraft:gravel","minecraft:stone","minecraft:sand"]){
      const incoming=type(itemId);
      const result=frame({activeSorters:sorters,stack:incoming,
        modeOf,matches,columnId:"col-11"});
      assert.deepEqual(Array.from(result.targets,x=>x.y),ordered(sorters,incoming).map(x=>x.y));
      assert.equal(result.captured,false);
      assert.equal(result.offers.length,0);
      assert.equal(result.executePermitted,false);
      comparisons++;
    }
  }
  assert.equal(comparisons,5120);
});

test("U1-C opt-in captured offers preserve tier, bottom-up, Auto uncertainty and no route permission",async()=>{
  const {frame}=await modules();
  const sorters=[
    entry("wildcard",64),entry("filter",65,"minecraft:stone"),
    entry("auto",66),entry("filter",67,"minecraft:stone"),
    entry("bypass",68)
  ];
  const result=frame({activeSorters:sorters,stack:type("minecraft:stone"),
    modeOf,matches,columnId:"column-1",captureOffers:true});
  assert.deepEqual(Array.from(result.offers,x=>x.tier),["filter","filter","auto","wildcard"]);
  assert.deepEqual(Array.from(result.offers,x=>x.bottomUp),[1,3,2,0]);
  assert.deepEqual(Array.from(result.offers,x=>x.claim),["yes","yes","unknown","yes"]);
  assert.ok(result.offers.every(x=>x.verified===false));
  assert.equal(result.executePermitted,false);
});

test("U1-D standalone no claim is LOCAL_TRANSIT, not governed HOLD",async()=>{
  const {frame,shadow}=await modules();
  const local=frame({activeSorters:[entry("filter",64,"minecraft:diamond")],
    stack:type("minecraft:stone"),modeOf,matches,columnId:"c0",captureOffers:true});
  assert.equal(shadow({scope:"STANDALONE_LOCAL",frame:local}).decision,"LOCAL_TRANSIT");
  assert.equal(shadow({scope:"GOVERNED_SOURCE",frame:local}).decision,"SHADOW_HOLD");
});

test("U1-D governed planner requires explicit source coverage and refuses cycles and unknown claims",async()=>{
  const {frame,shadow,graph}=await modules();
  const sorters=[entry("filter",64,"minecraft:stone"),
    entry("auto",65),entry("wildcard",66)];
  const local=frame({activeSorters:sorters,stack:type("minecraft:stone"),
    modeOf,matches,columnId:"col-11",captureOffers:true});
  const nodes=[{id:"source",kind:"source",loaded:true},
    ...local.offers.map(x=>({id:x.nodeId,kind:"sorter",loaded:true}))];
  const links=local.offers.map(x=>({
    from:"source",to:x.nodeId,kind:"local",loaded:true,verified:true
  }));
  const g=graph(nodes,links);
  assert.equal(g.status,"OK");
  const args={scope:"GOVERNED_SOURCE",frame:local,graph:g,
    source:"source",itemClass:"ordinary",existingBulkHome:"no",
    applicableBulkState:"full",verifiedNodes:local.offers.map(x=>x.nodeId)};
  assert.equal(shadow({...args,coverage:"UNKNOWN"}).decision,"SHADOW_HOLD");
  const proposed=shadow({...args,coverage:"COMPLETE"});
  assert.equal(proposed.decision,"SHADOW_CANDIDATES");
  assert.equal(proposed.executePermitted,false);
  assert.equal(proposed.persistPermitted,false);
  assert.equal(proposed.plan.stages[0].tier,"filter");
  assert.equal(proposed.plan.unresolved,true,"unproven native Auto seed blocks unsafe fallback");
  const cycle=graph(nodes,[...links,{
    from:local.offers[0].nodeId,to:"source",kind:"hopper",verified:true,loaded:true
  }]);
  assert.equal(cycle.status,"CYCLE");
  assert.equal(shadow({...args,graph:cycle,coverage:"COMPLETE"}).decision,"SHADOW_HOLD");
});

test("U1-D external reachable claims stay source-scoped and are not permission to move",async()=>{
  const {frame,shadow,graph}=await modules();
  const local=frame({activeSorters:[],stack:type("minecraft:dirt"),
    modeOf,matches,columnId:"none",captureOffers:true});
  const g=graph([
    {id:"src",kind:"source",loaded:true},
    {id:"remote",kind:"sorter",loaded:true},
    {id:"unreachable",kind:"sorter",loaded:true}
  ],[{from:"src",to:"remote",kind:"transporter",loaded:true,verified:true}]);
  const result=shadow({scope:"GOVERNED_SOURCE",frame:local,graph:g,source:"src",
    itemClass:"ordinary",coverage:"COMPLETE",existingBulkHome:"no",
    applicableBulkState:"full",externalOffers:[
      {nodeId:"remote",columnId:"r",tier:"filter",claim:"yes",verified:true,bottomUp:0},
      {nodeId:"unreachable",columnId:"u",tier:"filter",claim:"yes",verified:true,bottomUp:0}
    ]});
  assert.equal(result.decision,"SHADOW_CANDIDATES");
  assert.deepEqual(Array.from(result.plan.stages[0].candidates,x=>x.nodeId),["remote"]);
  assert.equal(result.executePermitted,false);
});

test("U1-C/D new modules expose no native custody/persistence API",()=>{
  for(const name of ["urce_column_offer_bridge.js","urce_source_scoped_shadow.js"]){
    const body=fs.readFileSync(path.join(SCRIPTS,name),"utf8");
    for(const expr of [/from\s*["']@minecraft\/server/,/\bsetItem\s*\(/,
      /\bsetDynamicProperty\s*\(/,/\bloadReceiverQueue\s*\(/,
      /\bregisterCollector\s*\(/,/\bsaveJournal\s*\(/,
      /\bsaveQueueJournal\s*\(/,/\bsystem\.runInterval\s*\(/]){
      assert.doesNotMatch(body,expr,name);
    }
  }
  const main=fs.readFileSync(path.join(SCRIPTS,"main.js"),"utf8");
  assert.match(main,/prepareLocalColumnFrame\(/);
  assert.doesNotMatch(main,/evaluateSourceScopedShadow\(/,
    "The governed shadow requires source-verified graph evidence and must not run on every legacy column tick");
});
