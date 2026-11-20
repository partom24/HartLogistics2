import test from "node:test";
import assert from "node:assert/strict";
import {probeNativeHopperTerminal}
  from "../../planning/src/urce_u1_solid_terminal_probe.mjs";

const D="minecraft:overworld",R={x:100,y:74,z:0};
const key=p=>p.x+"|"+p.y+"|"+p.z;
const B=(typeId,face=5)=>({
  typeId,permutation:{getState(name){
    assert.equal(name,"facing_direction");return face;
  }}
});
function path({face=5,terminal="minecraft:cobbled_deepslate"}={}) {
  const directions={
    0:{x:0,y:-1,z:0},1:{x:0,y:-1,z:0},
    2:{x:0,y:0,z:-1},3:{x:0,y:0,z:1},
    4:{x:-1,y:0,z:0},5:{x:1,y:0,z:0}
  };
  const world=new Map(),hopper={x:100,y:73,z:0},v=directions[face];
  const next={x:hopper.x+v.x,y:hopper.y+v.y,z:hopper.z+v.z};
  world.set(key(hopper),B("minecraft:hopper",face));
  world.set(key(next),B(terminal));
  if(v.y===0)world.set(key({x:100,y:72,z:0}),B("minecraft:cobbled_deepslate"));
  let reads=0,writes=0;
  const getBlock=(d,p)=>{
    assert.equal(d,D);reads++;
    return world.get(key(p))||B("minecraft:air");
  };
  const probe=(options={})=>probeNativeHopperTerminal({
    dimension:D,receiver:R,getBlock,...options
  });
  return {world,next,probe, get reads(){return reads;},
    get writes(){return writes;}};
}
test("SOLID-01 actual cobbled deepslate stopper proves an inert local end, never link or cargo permission",()=>{
  const f=path(),r=f.probe();
  assert.equal(r.classification,"TERMINAL_INERT");
  assert.equal(r.reason,"verified_inert_vanilla_stopper");
  assert.equal(r.blockType,"minecraft:cobbled_deepslate");
  assert.deepEqual(r.at,{x:101,y:73,z:0});
  assert.equal(r.metrics.hops,1);
  assert.equal(r.metrics.reads,3,"Hopper, support below, and outlet");
  assert.equal(r.mayAuthorizeLink,false);
  assert.equal(r.mayTransferCargo,false);
  assert.equal(r.coverageComplete,false);
  assert.equal(r.persistPermitted,false);
});
test("SOLID-02 rotated horizontal and down-facing native output are classified by facing, not map coordinates",()=>{
  for(const face of [0,1,2,3,4,5]){
    const f=path({face}),r=f.probe();
    assert.equal(r.classification,"TERMINAL_INERT","face "+face);
    assert.deepEqual(r.at,f.next);
    assert.ok(r.metrics.reads<=3,"bounded native reads face "+face);
  }
});
test("SOLID-03 other inert structural blocks are terminals; air is a separate verified non-transport outlet",()=>{
  for(const type of ["minecraft:stone","minecraft:cobblestone","minecraft:deepslate","minecraft:dirt"]){
    assert.equal(path({terminal:type}).probe().classification,"TERMINAL_INERT",type);
  }
  const air=path({terminal:"minecraft:air"}).probe();
  assert.equal(air.classification,"TERMINAL_AIR");
  assert.equal(air.mayTransferCargo,false);
});
test("SOLID-04 chest, barrel, Sorter, dispenser, Transporter and foreign blocks stay HOLD",()=>{
  for(const type of ["minecraft:chest","minecraft:barrel","hartsorter:sorter",
    "minecraft:dispenser","hartsorter:transporter","foreign:magic_pipe"]){
    const r=path({terminal:type}).probe();
    assert.equal(r.classification,"HOLD",type);
    assert.equal(r.reason,"unverified_native_output_boundary",type);
  }
});
test("SOLID-05 Hopper BELOW a horizontal Hopper may PULL regardless of its facing: HOLD",()=>{
  const f=path();
  f.world.set(key({x:100,y:72,z:0}),B("minecraft:hopper",5));
  const r=f.probe();
  assert.equal(r.classification,"HOLD");
  assert.equal(r.reason,"possible_native_pull_branch");
  assert.equal(r.blockType,"minecraft:hopper");
});
test("SOLID-06 container, unrecognized support, or missing below block remain HOLD",()=>{
  for(const type of ["minecraft:chest","hartsorter:collector","minecraft:rail"]){
    const f=path();
    f.world.set(key({x:100,y:72,z:0}),B(type));
    assert.equal(f.probe().reason,"possible_native_pull_branch",type);
  }
  const missing=path();
  const dPos={x:100,y:72,z:0};
  const getBlock=(d,p)=>key(p)===key(dPos)?undefined:
    missing.world.get(key(p))||B("minecraft:air");
  const held=missing.probe({getBlock});
  assert.equal(held.classification,"HOLD");
  assert.equal(held.reason,"unverified_pull_below_hopper");
  const thrown=missing.probe({getBlock:(d,p)=>{
    if(key(p)===key(dPos))throw Error("unloaded");
    return missing.world.get(key(p))||B("minecraft:air");
  }});
  assert.equal(thrown.classification,"HOLD");
});
test("SOLID-07 a witnessed Hopper-output cycle cannot become a terminal",()=>{
  const f=path({terminal:"minecraft:hopper"});
  f.world.set(key(f.next),B("minecraft:hopper",4));
  f.world.set(key({x:101,y:72,z:0}),B("minecraft:deepslate"));
  const r=f.probe();
  assert.equal(r.classification,"CYCLE");
  assert.equal(r.reason,"verified_hopper_output_cycle");
  assert.equal(r.mayAuthorizeLink,false);
});
test("SOLID-08 bounded output read budget/hops fail closed",()=>{
  const f=path({terminal:"minecraft:hopper"});
  f.world.set(key(f.next),B("minecraft:hopper",5));
  f.world.set(key({x:101,y:72,z:0}),B("minecraft:cobbled_deepslate"));
  assert.equal(f.probe({maxReads:2}).classification,"HOLD");
  assert.equal(f.probe({maxHops:1}).reason,"hop_limit");
  assert.equal(f.probe({maxReads:0}).reason,"invalid_probe_context");
});
test("SOLID-09 unknown output and missing orientation never imply terminus",()=>{
  const f=path();
  const missing=f.probe({getBlock:(d,p)=>
    key(p)===key(f.next)?undefined:f.world.get(key(p))||B("minecraft:air")});
  assert.equal(missing.classification,"HOLD");
  f.world.set(key({x:100,y:73,z:0}),B("minecraft:hopper",undefined));
  // Construct an explicitly invalid facing state, rather than defaulting.
  f.world.set(key({x:100,y:73,z:0}),B("minecraft:hopper",9));
  assert.equal(f.probe().reason,"hopper_direction_unverified");
});
test("SOLID-10 multiple straight native Hoppers remain source-local and reveal an intermediate pull branch",()=>{
  const f=path({terminal:"minecraft:hopper"});
  f.world.set(key(f.next),B("minecraft:hopper",5));
  f.world.set(key({x:101,y:72,z:0}),B("minecraft:cobbled_deepslate"));
  f.world.set(key({x:102,y:73,z:0}),B("minecraft:cobbled_deepslate"));
  assert.equal(f.probe().classification,"TERMINAL_INERT");
  f.world.set(key({x:101,y:72,z:0}),B("minecraft:hopper",5));
  assert.equal(f.probe().reason,"possible_native_pull_branch");
});
