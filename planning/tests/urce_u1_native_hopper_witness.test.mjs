import test from "node:test";
import assert from "node:assert/strict";
import {
  observeNativeHopperWitness,evaluateProposedLinkWitness
} from "../src/urce_u1_native_hopper_witness.mjs";
import {sourceReachability} from "../src/urce_u1_route_model.mjs";

const key=(d,p)=>d+"|"+p.x+"|"+p.y+"|"+p.z;
const block=(type,face=5)=>({
  typeId:type,permutation:{getState(k) {
    if(k!=="facing_direction")throw Error("wrong property");
    return face;
  }}
});
function fixture({bankCount=2,shiftX=0,shiftY=0,shiftZ=0,face=5}={}) {
  const world=new Map(),receivers=[],collectors=[];
  const offs={2:{x:0,z:-1},3:{x:0,z:1},
    4:{x:-1,z:0},5:{x:1,z:0}}[face];
  assert.ok(offs);
  for(let i=0;i<bankCount;i++) {
    const origin={x:shiftX+i*20,y:shiftY,z:shiftZ};
    const receiver={id:"R"+i,d:"overworld",x:origin.x,y:origin.y+2,z:origin.z};
    const collector={id:"C"+i,d:"overworld",
      x:origin.x+offs.x*3,y:origin.y+1,z:origin.z+offs.z*3,
      link:i+1<bankCount?"R"+(i+1):null};
    receivers.push(receiver);collectors.push(collector);
    world.set(key(receiver.d,receiver),block("hartsorter:receiver"));
    world.set(key(collector.d,collector),block("hartsorter:collector"));
    for(let k=0;k<3;k++) world.set(key(receiver.d,{
      x:origin.x+offs.x*k,y:origin.y+1,z:origin.z+offs.z*k
    }),block("minecraft:hopper",face));
  }
  const getBlock=(d,p)=>world.get(key(d,p))||block("minecraft:air");
  return {world,receivers,collectors,getBlock};
}
const inspect=f=>observeNativeHopperWitness(f);
const proposal=(obs,c,r)=>evaluateProposedLinkWitness(obs,c,r);

test("NATIVE-01 positive native Hopper witness refuses the owner two-bank return link",()=>{
  for(const face of [2,3,4,5]){
    const f=fixture({face});
    const obs=inspect(f);
    assert.equal(obs.status,"OBSERVED");
    assert.equal(obs.edges.filter(e=>e.kind==="hopper").length,2);
    assert.equal(obs.edges.filter(e=>e.kind==="collector_receiver").length,1);
    assert.equal(obs.metrics.steps,6);
    assert.deepEqual(proposal(obs,"C1","R0"),{
      decision:"REJECT",reason:"cycle",persistPermitted:false,
      executePermitted:false
    });
  }
});

test("NATIVE-02 saved two-link cycle is detected without editing saved links",()=>{
  const f=fixture();
  f.collectors[1].link="R0";
  const prior=JSON.stringify(f.collectors);
  const obs=inspect(f);
  assert.equal(obs.status,"CYCLE");
  assert.equal(obs.graph.status,"CYCLE");
  assert.deepEqual(proposal(obs,"C1","R0"),{
    decision:"REJECT",reason:"existing_verified_supply_cycle",
    persistPermitted:false,executePermitted:false
  });
  assert.equal(JSON.stringify(f.collectors),prior);
});

test("NATIVE-03 no observed reverse hop is NOT proof a link can be allowed",()=>{
  const f=fixture({bankCount:1,shiftX:280,shiftY:77,shiftZ:-511});
  const obs=inspect(f);
  assert.equal(obs.graph.status,"OK");
  assert.equal(obs.coverageComplete,false);
  assert.equal(obs.mayAuthorizeLink,false);
  assert.equal(proposal(obs,"C0","R0").decision,"REJECT");
  const extra={...f,collectors:[...f.collectors,
    {id:"Cunknown",d:"overworld",x:999,y:999,z:999}]};
  const o2=inspect(extra);
  assert.equal(proposal(o2,"C0","R0").decision,"REJECT");
  // A separate loaded endpoint with no known reverse is still HOLD:
  const f2=fixture({bankCount:2});
  assert.deepEqual(proposal(inspect(f2),"C0","R1"),{
    decision:"HOLD",reason:"incomplete_native_supply_coverage",
    persistPermitted:false,executePermitted:false
  });
});

test("NATIVE-04 unknown/unloaded hopper never becomes a false disconnected leg",()=>{
  const f=fixture();
  const at={x:f.receivers[1].x+1,y:f.receivers[1].y-1,z:f.receivers[1].z};
  const getBlock=(d,p)=>key(d,p)===key(d,at)?undefined:f.getBlock(d,p);
  const obs=inspect({...f,getBlock});
  assert.equal(obs.status,"OBSERVED");
  assert.equal(obs.unknown.some(x=>x.from==="R1" &&
    x.reason==="unloaded_or_unavailable"),true);
  assert.equal(obs.edges.filter(e=>e.kind==="hopper").length,1);
  assert.equal(proposal(obs,"C1","R0").decision,"HOLD");
});

test("NATIVE-05 a visual Transporter is not a Hopper pass-through witness",()=>{
  const f=fixture();
  const at={x:f.receivers[1].x+1,y:f.receivers[1].y-1,z:f.receivers[1].z};
  f.world.set(key("overworld",at),block("hartsorter:transporter"));
  const obs=inspect(f);
  assert.equal(obs.edges.filter(e=>e.kind==="hopper").length,1);
  assert.equal(obs.unknown.some(x=>x.reason==="unsupported_native_boundary"),true);
  assert.equal(proposal(obs,"C1","R0").decision,"HOLD");
});

test("NATIVE-06 output facing away from Collector does not create a supply link",()=>{
  const f=fixture();
  const at={x:f.receivers[1].x,y:f.receivers[1].y-1,z:f.receivers[1].z};
  f.world.set(key("overworld",at),block("minecraft:hopper",4));
  const obs=inspect(f);
  assert.equal(obs.edges.filter(e=>e.kind==="hopper").length,1);
  assert.equal(proposal(obs,"C1","R0").decision,"HOLD");
});

test("NATIVE-07 capped reads and unloaded source cannot pass as safe link",()=>{
  const f=fixture({bankCount:13});
  const capped=observeNativeHopperWitness({...f,maxReads:4});
  assert.ok(capped.metrics.reads<=4);
  assert.equal(capped.coverageComplete,false);
  assert.equal(proposal(capped,"C12","R0").decision,"HOLD");
  const absent=observeNativeHopperWitness({...f,
    getBlock:(d,p)=>key(d,p)===key(d,f.receivers[0])
      ?undefined:f.getBlock(d,p)});
  assert.equal(absent.unknown.some(x=>x.from==="R0"),true);
  assert.equal(proposal(absent,"C12","R0").decision,"HOLD");
});

test("NATIVE-08 thirteen physical bank-shaped Hopper legs stay distinct",()=>{
  const f=fixture({bankCount:13,shiftX:-830,shiftY:30,shiftZ:144});
  const obs=inspect(f);
  assert.equal(obs.status,"OBSERVED");
  assert.equal(obs.edges.filter(e=>e.kind==="hopper").length,13);
  assert.equal(obs.edges.filter(e=>e.kind==="collector_receiver").length,12);
  const reach=sourceReachability(obs.graph,"R0");
  assert.equal(reach.unknown,false);
  assert.equal(reach.reached.get("C12")?.path.length,26);
  assert.equal(proposal(obs,"C12","R0").decision,"REJECT");
  // This is a translated synthetic witness fixture. The real owner system's
  // 13 bank lengths, Hopper facings and link registrations remain unobserved.
});

test("NATIVE-09 invalid registry, face, hop cap or reader failure fail closed",()=>{
  const f=fixture();
  const duplicated=observeNativeHopperWitness({...f,
    collectors:[f.collectors[0],f.collectors[0]]});
  assert.equal(duplicated.status,"INVALID");
  const invalidFace={...f,getBlock:(d,p)=>{
    const b=f.getBlock(d,p);
    return b.typeId==="minecraft:hopper" ? block("minecraft:hopper",42) : b;
  }};
  const missing=inspect(invalidFace);
  assert.equal(missing.edges.filter(e=>e.kind==="hopper").length,0);
  assert.equal(missing.unknown.some(x=>x.reason==="hopper_direction_unverified"),true);
  const truncated=observeNativeHopperWitness({...f,maxHopsPerReceiver:1});
  assert.equal(truncated.unknown.some(x=>x.reason==="hop_limit"),true);
  const failed=observeNativeHopperWitness({...f,getBlock:()=>{throw Error("unload");}});
  assert.equal(failed.status,"OBSERVED");
  assert.equal(failed.unknown.some(x=>x.reason==="get_block_failed"),true);
  assert.equal(proposal(failed,"C1","R0").decision,"HOLD");
});

test("NATIVE-10 native Hopper witness never touches inventory or persistence",()=>{
  const f=fixture();
  let reads=0;
  const out=observeNativeHopperWitness({...f,getBlock:(d,p)=>{
    reads++;
    return f.getBlock(d,p);
  }});
  assert.ok(reads>0);
  assert.equal(out.metrics.reads,reads);
  assert.equal(out.coverageComplete,false);
  for(const e of out.edges) {
    assert.equal(e.kind==="hopper"||e.kind==="collector_receiver",true);
    assert.equal(e.verified,true);
  }
});
