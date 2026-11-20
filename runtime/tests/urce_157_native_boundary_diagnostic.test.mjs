import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import {inspectCandidateSupplyLink,observeSupplyLinkSnapshot}
  from "../../addon/behavior_pack/scripts/urce_152_link_snapshot_gate.js";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const key=(d,p)=>d+"|"+p.x+"|"+p.y+"|"+p.z;
const block=(type,face=5)=>({typeId:type,
  permutation:{getState(name){
    if(name!=="facing_direction")throw Error("unexpected state");
    return face;
  }}
});
function fixture(type="minecraft:chest"){
  const d="minecraft:overworld",world=new Map();
  const receiver={id:"R-supply",d,x:100,y:73,z:-420};
  const collector={id:"C-downstream",d,x:115,y:73,z:-420,link:receiver.id};
  const put=(p,typeId,face=5)=>world.set(key(d,p),block(typeId,face));
  put(receiver,"hartsorter:receiver");put(collector,"hartsorter:collector");
  put({x:100,y:72,z:-420},"minecraft:hopper",5);
  put({x:101,y:72,z:-420},"minecraft:hopper",5);
  put({x:102,y:72,z:-420},type);
  const read=(dimension,p)=>world.get(key(dimension,p))||block("minecraft:air");
  return {d,world,receiver,collector,receivers:[receiver],
    collectors:[collector],getBlock:read};
}
const check=f=>inspectCandidateSupplyLink({
  collectors:f.collectors,receivers:f.receivers,getBlock:f.getBlock,
  fromCollector:f.collector.id,toReceiver:f.receiver.id
});
test("BOUNDARY-01 chest at end of a directed Hopper chain is explicit HOLD, not speculative terminal",()=>{
  const f=fixture("minecraft:chest");
  const result=check(f);
  assert.equal(result.decision,"HOLD");
  assert.equal(result.reason,"unverified_native_supply_boundary");
  assert.match(result.observationReason,/unsupported_native_boundary/);
  assert.match(result.observationReason,/minecraft:chest/);
  assert.match(result.observationReason,/minecraft:overworld 102,72,-420/);
  assert.match(result.observationReason,/from receiver R-supply/);
  assert.equal(result.persistPermitted,false);
  assert.equal(result.executePermitted,false);
});
test("BOUNDARY-02 Sorter, chest, barrel, dispenser and other unsupported terminals HOLD",()=>{
  for(const type of ["hartsorter:sorter","minecraft:chest",
    "minecraft:barrel","minecraft:dispenser"]){
    const f=fixture(type),r=check(f);
    assert.equal(r.decision,"HOLD",type);
    assert.match(r.observationReason,new RegExp(type),type);
    assert.equal(r.persistPermitted,false,type);
  }
});
test("BOUNDARY-03 native witness retains exact origin and coordinate without touching Q4",()=>{
  const f=fixture();
  const before=JSON.stringify({collectors:f.collectors,receivers:f.receivers});
  const observation=observeSupplyLinkSnapshot(f);
  const boundary=observation.native.unknown.find(u=>u.reason==="unsupported_native_boundary");
  assert.deepEqual(boundary.position,{x:102,y:72,z:-420});
  assert.equal(boundary.receiverId,"R-supply");
  assert.equal(boundary.dimension,f.d);
  assert.equal(boundary.blockType,"minecraft:chest");
  assert.equal(JSON.stringify({collectors:f.collectors,receivers:f.receivers}),before);
});
test("BOUNDARY-04 air-only end is not fabricated as unknown boundary",()=>{
  const f=fixture();
  f.world.delete(key(f.d,{x:102,y:72,z:-420}));
  const r=check(f);
  assert.equal(r.decision,"SAFE_SNAPSHOT");
  assert.equal(r.persistPermitted,false);
});
test("BOUNDARY-05 unavailable native boundary stays HOLD, not mistaken for air or chest",()=>{
  const f=fixture();
  const prior=f.getBlock;
  f.getBlock=(d,p)=>p.x===102&&p.y===72?undefined:prior(d,p);
  const r=check(f);
  assert.equal(r.decision,"HOLD");
  assert.equal(r.reason,"unverified_native_supply_boundary");
  assert.match(r.observationReason,/unloaded_or_unavailable/);
  assert.doesNotMatch(r.observationReason,/minecraft:chest/);
});
test("BOUNDARY-06 valid verified direct Hopper cycle is still REJECTED",()=>{
  const f=fixture();
  f.world.set(key(f.d,{x:102,y:72,z:-420}),
    block("hartsorter:collector"));
  f.collector.x=102;f.collector.y=72;
  const r=check(f);
  assert.equal(r.decision,"REJECT");
  assert.match(r.reason,/cycle/);
});
test("BOUNDARY-07 Receiver status forwards nested native observation reason",()=>{
  const source=readFileSync(resolve(ROOT,
    "addon/behavior_pack/scripts/main.js"),"utf8");
  const start=source.indexOf("function receiverLinkSafety(receiver) {");
  const end=source.indexOf("// Human-readable state uses",start);
  assert.ok(start>=0&&end>start);
  const details="unsupported_native_boundary [minecraft:chest @ "+
    "minecraft:overworld 102,72,-420 from receiver R-supply]";
  const scope={logistics:{collectors:[{id:"C-downstream",link:"R-supply"}]},
    liveLinkCheck:()=>({decision:"HOLD",
      reason:"unverified_native_supply_boundary",observationReason:details})};
  const get=vm.runInNewContext(source.slice(start,end)+
    "\nreceiverLinkSafety",scope);
  const result=get({id:"R-supply"});
  assert.equal(result.decision,"HOLD");
  assert.equal(result.observationReason,details);
});
test("BOUNDARY-08 pure native witness and gate contain no cargo writers",()=>{
 for(const p of ["urce_152_native_hopper_witness.js",
   "urce_152_link_snapshot_gate.js"]){
   const src=readFileSync(resolve(ROOT,
     "addon/behavior_pack/scripts",p),"utf8");
   for(const forbidden of [".setDynamicProperty(",".setItem(",
      ".addItem(",".spawnItem(",".runInterval("])
     assert.equal(src.includes(forbidden),false,p+" added "+forbidden);
 }
});
