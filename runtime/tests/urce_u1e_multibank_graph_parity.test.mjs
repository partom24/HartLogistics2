/**
 * U1-E multibank differential: the same active link guard and read-only
 * projection over native Hopper bank chains, with NO Transporters.
 *
 * A disconnected unknown must not block a verified source route. A reachable
 * unknown still HOLDs. Every projected graph remains NONAUTHORITATIVE and
 * reports item-claim coverage UNKNOWN.
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
const SCRIPTS=path.join(ROOT,"addon/behavior_pack/scripts");

async function load(){
  const ctx=vm.createContext({}),cache=new Map();
  const make=file=>{
    if(cache.has(file))return cache.get(file);
    const mod=new vm.SourceTextModule(fs.readFileSync(path.join(SCRIPTS,file),"utf8"),
      {context:ctx,identifier:file});
    cache.set(file,mod);return mod;
  };
  const guard=make("urce_152_live_link_guard.js");
  await guard.link(s=>make(path.basename(s)));
  await guard.evaluate();
  return {
    create:guard.namespace.createLiveLinkGuard,
    walk:make("urce_152_route_model.js").namespace.sourceReachability
  };
}
const DIM="minecraft:overworld";
const pos=(x,y,z=0)=>({x,y,z}),key=p=>p.x+"|"+p.y+"|"+p.z;

function banks({cycle=false,reachableUnknown=false,disconnectedUnknown=false}={}){
  const collectors=[
    {id:"C1",d:DIM,x:0,y:61,z:0,present:true,link:"R2"},
    {id:"C2",d:DIM,x:10,y:61,z:0,present:true,link:"R3"},
    {id:"C3",d:DIM,x:20,y:61,z:0,present:true,link:cycle?"R2":null}
  ];
  const receivers=[
    {id:"R2",d:DIM,x:10,y:64,z:0,present:true},
    {id:"R3",d:DIM,x:20,y:64,z:0,present:true}
  ];
  if(disconnectedUnknown){
    receivers.push({id:"R4",d:DIM,x:40,y:64,z:0,present:true});
  }
  const blocks=new Map();
  const put=(p,typeId)=>blocks.set(key(p),{
    typeId,dimension:{id:DIM},location:{...p},
    permutation:{getState(){return 0;}}
  });
  for(const c of collectors)put(pos(c.x,c.y),"hartsorter:collector");
  for(const r of receivers)put(pos(r.x,r.y),"hartsorter:receiver");
  // R2 output → Hopper down → C2; R3 output → Hopper down → C3.
  // A legal real bank layout does NOT require visual Transporter blocks.
  for(const x of [10,20]){
    put(pos(x,63),"minecraft:hopper");
    put(pos(x,62),"minecraft:hopper");
  }
  let reads=0;
  const reader=(d,p)=>{
    reads++;
    if((reachableUnknown&&p.x===20&&p.y===63)||
       (disconnectedUnknown&&p.x===40&&p.y===63)){
      throw Error("chunk unavailable");
    }
    return blocks.get(key(p))??{
      typeId:"minecraft:air",dimension:{id:d},location:{...p}
    };
  };
  return {collectors,receivers,reader,get reads(){return reads;}};
}
function context(f){
  return {
    collector:f.collectors[0],receiver:f.receivers[0],
    collectors:f.collectors,receivers:f.receivers,
    getBlock:f.reader,currentTick:20
  };
}
const cases=[
  {label:"verified-chain",input:{},expected:"SAFE_SNAPSHOT",
    projected:"OBSERVED",reachable:["R2","C2","R3","C3"]},
  {label:"directed-return-cycle",input:{cycle:true},expected:"REJECT",
    projected:"CYCLE"},
  {label:"reachable-unloaded-native-boundary",input:{reachableUnknown:true},
    expected:"HOLD",projected:"PARTIAL"},
  {label:"disconnected-unknown-bank",input:{disconnectedUnknown:true},
    expected:"SAFE_SNAPSHOT",projected:"PARTIAL",
    reachable:["R2","C2","R3","C3"]}
];
for(const scenario of cases){
  test("U1-E multibank: "+scenario.label,async()=>{
    const {create,walk}=await load();
    const f=banks(scenario.input),guard=create(),request=context(f);
    const active=guard.check(request);
    assert.equal(active.decision,scenario.expected);
    const before=f.reads;
    const shadow=guard.peekShadowEvidence(request);
    assert.equal(shadow.status,scenario.projected);
    assert.equal(f.reads,before,"Projection MUST NOT rescan world blocks");
    assert.equal(shadow.sourceClaimCoverage,"UNKNOWN");
    assert.equal(shadow.worldCoverage,"UNKNOWN");
    assert.equal(shadow.executePermitted,false);
    assert.equal(shadow.persistPermitted,false);
    assert.equal(shadow.mayAuthorizeCargo,false);
    if(scenario.reachable){
      assert.deepEqual(Array.from(walk(shadow.graph,"R2").reached.keys()),
        scenario.reachable);
    }
    if(scenario.expected==="REJECT")assert.equal(shadow.graph,undefined);
    if(scenario.projected==="PARTIAL"){
      assert.ok(shadow.issues.includes("native_boundary_unknown"));
    }
    const again=guard.peekShadowEvidence(request);
    assert.equal(f.reads,before);
    assert.equal(again.status,shadow.status);
  });
}

test("U1-E non-authoritative projection never changes Collector/Receiver registry links",async()=>{
  const {create}=await load();
  const f=banks(),guard=create(),original=f.collectors.map(c=>c.link);
  guard.check(context(f));
  const projection=guard.peekShadowEvidence(context(f));
  assert.ok(projection.graph);
  projection.graph.outgoing.get("C2")[0].verified=false;
  assert.deepEqual(f.collectors.map(c=>c.link),original);
  assert.equal(guard.check(context(f)).decision,"SAFE_SNAPSHOT");
});
