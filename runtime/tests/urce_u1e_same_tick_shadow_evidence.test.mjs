/**
 * U1-E: reuse existing guard's SAME-TICK native/visual topology snapshot.
 *
 * The guarded projection is a detached, read-only graph, and is never a
 * claim-coverage certificate, cargo admission, item receipt or Q4 writer.
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

async function modules(){
  const cache=new Map(),context=vm.createContext({});
  const make=file=>{
    if(cache.has(file))return cache.get(file);
    const mod=new vm.SourceTextModule(fs.readFileSync(path.join(SCRIPT,file),"utf8"),
      {context,identifier:file});
    cache.set(file,mod);return mod;
  };
  const guard=make("urce_152_live_link_guard.js");
  await guard.link(specifier=>make(path.basename(specifier)));
  await guard.evaluate();
  return {
    create:guard.namespace.createLiveLinkGuard,
    graph:make("urce_152_route_model.js").namespace.sourceReachability
  };
}

function world({cycle=false,missingHopper=false,unloaded=false}={}){
  const d="minecraft:overworld";
  const c={id:"C",d,x:0,y:61,z:0,present:true,link:"R"};
  const r={id:"R",d,x:0,y:64,z:0,present:true,queueKey:"q1"};
  const blocks=new Map();
  const key=(dim,p)=>dim+"|"+p.x+"|"+p.y+"|"+p.z;
  const put=(p,typeId,facing=0)=>blocks.set(key(d,p),{
    typeId,dimension:{id:d},location:{...p},
    permutation:{getState(s){return s==="facing_direction"?facing:undefined;}}
  });
  put({x:c.x,y:c.y,z:c.z},"hartsorter:collector");
  put({x:r.x,y:r.y,z:r.z},"hartsorter:receiver");
  if(!missingHopper){
    put({x:0,y:63,z:0},"minecraft:hopper");
    // Hopper's default direction is DOWN, toward y-1.
    if(cycle)put({x:0,y:62,z:0},"minecraft:hopper");
    else put({x:0,y:62,z:0},"minecraft:air");
  }else if(!unloaded){
    put({x:0,y:63,z:0},"minecraft:air");
  }
  let reads=0;
  const reader=(dim,p)=>{
    reads++;
    if(unloaded && p.x===0 && p.y===63 && p.z===0)
      throw Error("chunk not loaded");
    return blocks.get(key(dim,p))??{
      typeId:"minecraft:air",dimension:{id:dim},location:{...p}
    };
  };
  return {c,r,collectors:[c],receivers:[r],reader,get reads(){return reads;}};
}
function args(w,tick=10){
  return {collector:w.c,receiver:w.r,
    collectors:w.collectors,receivers:w.receivers,
    getBlock:w.reader,currentTick:tick};
}

test("same-tick guarded projection uses zero extra native block reads",async()=>{
  const {create,graph}=await modules();
  const w=world();
  const guard=create();
  const safety=guard.check(args(w));
  assert.equal(safety.decision,"SAFE_SNAPSHOT",
    "A linked Collector/Receiver pair needs no Transporters in this fixture");
  const readCount=w.reads;
  assert.ok(readCount>0,"Active link guard must have physically observed the world");
  const projected=guard.peekShadowEvidence(args(w));
  assert.equal(w.reads,readCount,"Projection must not call getBlock again");
  assert.equal(projected.status,"OBSERVED");
  assert.equal(projected.sourceClaimCoverage,"UNKNOWN");
  assert.equal(projected.worldCoverage,"UNKNOWN");
  assert.equal(projected.executePermitted,false);
  assert.equal(projected.persistPermitted,false);
  assert.equal(projected.mayAuthorizeCargo,false);
  assert.equal(projected.graph.status,"OK");
  assert.deepEqual(Array.from(graph(projected.graph,"C").reached.keys()),["C","R"]);
  const again=guard.peekShadowEvidence(args(w));
  assert.equal(w.reads,readCount);
  assert.notEqual(again.graph,projected.graph,"Graph is detached per projection");
});

test("mutating the returned graph cannot affect live safety evidence",async()=>{
  const {create}=await modules();
  const w=world(),guard=create();
  guard.check(args(w));
  const first=guard.peekShadowEvidence(args(w));
  first.graph.outgoing.get("C")[0].verified=false;
  first.graph.byId.get("R").loaded=false;
  const next=guard.peekShadowEvidence(args(w));
  assert.equal(next.graph.byId.get("R").loaded,true);
  assert.equal(next.graph.outgoing.get("C")[0].verified,true);
  assert.equal(guard.check(args(w)).decision,"SAFE_SNAPSHOT");
});

test("new tick, explicit invalidation, changed link and reader identity cannot borrow old evidence",async()=>{
  const {create}=await modules();
  const w=world(),guard=create();
  const base=args(w);
  assert.equal(guard.peekShadowEvidence(base).status,"HOLD",
    "No shadow proof before actual link check");
  guard.check(base);
  const reads=w.reads;
  assert.equal(guard.peekShadowEvidence({...base,currentTick:11}).status,"HOLD");
  assert.equal(w.reads,reads,"No new world reads from a rejected peek");
  assert.equal(guard.peekShadowEvidence({...base,getBlock:(d,p)=>w.reader(d,p)}).status,"HOLD");
  w.c.link="other-receiver";
  assert.equal(guard.peekShadowEvidence(base).status,"HOLD");
  w.c.link="R";
  guard.invalidate();
  assert.equal(guard.peekShadowEvidence(base).status,"HOLD");
  assert.equal(w.reads,reads);
  assert.equal(guard.check(args(w,11)).decision,"SAFE_SNAPSHOT");
  assert.ok(w.reads>reads,"Next-tick safety must refresh physical evidence");
});

test("verified Hopper supply cycle is rejected and cannot create positive shadow authority",async()=>{
  const {create}=await modules();
  const w=world({cycle:true}),guard=create();
  const verdict=guard.check(args(w));
  assert.equal(verdict.decision,"REJECT");
  const seen=w.reads;
  const projected=guard.peekShadowEvidence(args(w));
  assert.equal(projected.status,"CYCLE");
  assert.equal(projected.executePermitted,false);
  assert.equal(projected.graph,undefined);
  assert.equal(w.reads,seen);
});

test("unavailable Hopper boundary remains UNKNOWN, never no route or no remote claim",async()=>{
  const {create}=await modules();
  const w=world({unloaded:true}),guard=create();
  const verdict=guard.check(args(w));
  assert.equal(verdict.decision,"HOLD");
  const reads=w.reads;
  const projected=guard.peekShadowEvidence(args(w));
  assert.equal(projected.status,"PARTIAL");
  assert.equal(projected.sourceClaimCoverage,"UNKNOWN");
  assert.equal(projected.executePermitted,false);
  assert.ok(projected.issues.includes("native_boundary_unknown"));
  assert.equal(w.reads,reads);
});

test("U1-E diagnostics cannot import the Bedrock API or any custody writer",()=>{
  const projection=fs.readFileSync(path.join(SCRIPT,"urce_152_shadow_evidence_bridge.js"),"utf8");
  const guard=fs.readFileSync(path.join(SCRIPT,"urce_152_live_link_guard.js"),"utf8");
  for(const text of [projection,guard]){
    for(const forbidden of [/from\s*["']@minecraft\/server/,/\bsetItem\s*\(/,
      /\bloadReceiverQueue\s*\(/,/\bsaveQueueJournal\s*\(/,
      /\bsaveJournal\s*\(/,/\bregisterCollector\s*\(/,
      /\bsystem\.runInterval\s*\(/]){
      assert.doesNotMatch(text,forbidden);
    }
  }
  const main=fs.readFileSync(path.join(SCRIPT,"main.js"),"utf8");
  assert.doesNotMatch(main,/peekShadowEvidence\s*\(/,
    "Observer projection must remain opt-in; no extra legacy column tick work");
});
