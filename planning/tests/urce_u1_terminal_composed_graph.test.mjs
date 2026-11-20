import test from "node:test";
import assert from "node:assert/strict";
import {reviewNativeDirectedTerminal} from "../src/urce_u1_terminal_graph_review.mjs";

const D="minecraft:overworld",key=(d,p)=>d+"|"+p.x+"|"+p.y+"|"+p.z;
const B=(typeId,face=5)=>({typeId,permutation:{getState(name){
  if(name!=="facing_direction")throw Error("unexpected state");
  return face;
}}});
function makeChain({count=3,offset=0,terminus="minecraft:cobbled_deepslate"}={}) {
  const world=new Map(),receivers=[],collectors=[];
  const put=(p,type,face=5)=>world.set(key(D,p),B(type,face));
  for(let i=0;i<count;i++){
    const x=offset+i*10;
    const r={id:"R"+i,d:D,x,y:73,z:0};
    receivers.push(r);put(r,"hartsorter:receiver");
    const last=i===count-1;
    if(!last) {
      const c={id:"C"+i,d:D,x:x+4,y:72,z:0,
        link:i===count-2?"R"+(i+1):"R"+(i+1)};
      collectors.push(c);put(c,"hartsorter:collector");
    } else put({x:x+4,y:72,z:0},terminus);
    for(let j=0;j<4;j++){
      put({x:x+j,y:72,z:0},"minecraft:hopper",5);
      put({x:x+j,y:71,z:0},"minecraft:cobbled_deepslate");
    }
  }
  const reader=(d,p)=>world.get(key(d,p))??B("minecraft:air");
  const check=(extra={})=>reviewNativeDirectedTerminal({
    receivers,collectors,getBlock:reader,sourceReceiverId:"R0",...extra
  });
  return {world,receivers,collectors,reader,check,put};
}
test("DIRECTED-TERMINAL-01 arbitrary three-bank Receiver -> Hopper -> Collector chain ends in valid inert solid",()=>{
  const f=makeChain(),prior=JSON.stringify({r:f.receivers,c:f.collectors});
  const result=f.check();
  assert.equal(result.decision,"LOCAL_TERMINALS_PROVED");
  assert.equal(result.native.graph.status,"OK");
  assert.equal(result.native.edges.filter(x=>x.kind==="hopper").length,2);
  assert.equal(result.native.edges.filter(x=>x.kind==="collector_receiver").length,2);
  assert.equal(result.provenTerminals.length,1);
  assert.equal(result.provenTerminals[0].receiverId,"R2");
  assert.deepEqual(result.provenTerminals[0].at,{x:24,y:72,z:0});
  assert.equal(result.mayTransferCargo,false);
  assert.equal(result.mayAuthorizeLink,false);
  assert.equal(result.persistPermitted,false);
  assert.equal(result.coverageComplete,false);
  assert.ok(result.uniqueReads<=64);
  assert.equal(JSON.stringify({r:f.receivers,c:f.collectors}),prior);
});
test("DIRECTED-TERMINAL-02 actual owner diagnostic coordinates can be observed as a local solid end",()=>{
  const world=new Map(),r={id:"minecraft:overworld|448|73|-523",
    d:D,x:448,y:73,z:-523};
  const put=(p,type,face=3)=>world.set(key(D,p),B(type,face));
  put(r,"hartsorter:receiver");
  for(let z=-523;z<=-479;z++){
    put({x:448,y:72,z},"minecraft:hopper",3);
    put({x:448,y:71,z},"minecraft:deepslate");
  }
  put({x:448,y:72,z:-478},"minecraft:cobbled_deepslate");
  const out=reviewNativeDirectedTerminal({
    collectors:[],receivers:[r],sourceReceiverId:r.id,
    getBlock:(d,p)=>world.get(key(d,p))??B("minecraft:air")
  });
  assert.equal(out.decision,"LOCAL_TERMINALS_PROVED");
  assert.deepEqual(out.provenTerminals[0].at,{x:448,y:72,z:-478});
  assert.equal(out.provenTerminals[0].blockType,"minecraft:cobbled_deepslate");
  assert.equal(out.mayTransferCargo,false);
  assert.ok(out.uniqueReads<=120,"One source-limited read budget, not a full room scan");
});
test("DIRECTED-TERMINAL-03 a Collector link returning to the original Receiver is still a real cycle",()=>{
  const f=makeChain();
  f.collectors.push({id:"C2",d:D,x:24,y:72,z:0,link:"R0"});
  f.put({x:24,y:72,z:0},"hartsorter:collector");
  const result=f.check();
  assert.equal(result.decision,"REJECT");
  assert.equal(result.reason,"existing_directed_cycle");
  assert.equal(result.persistPermitted,false);
  assert.equal(result.mayTransferCargo,false);
});
test("DIRECTED-TERMINAL-04 a lower Hopper pulling from a horizontal route makes the solid end unproven",()=>{
  const f=makeChain();
  f.put({x:21,y:71,z:0},"minecraft:hopper");
  const result=f.check();
  assert.equal(result.decision,"HOLD");
  assert.equal(result.reason,"source_branch_unverified");
  assert.equal(result.blockers[0].reason,"possible_native_pull_branch");
});
test("DIRECTED-TERMINAL-05 a final chest, barrel, Sorter or other inventory block never becomes an inert terminal",()=>{
  for(const type of ["minecraft:chest","minecraft:barrel","hartsorter:sorter",
    "minecraft:dispenser","foreign:storage"]){
    const f=makeChain({terminus:type}),r=f.check();
    assert.equal(r.decision,"HOLD",type);
    assert.equal(r.provenTerminals.length,0,type);
    assert.equal(r.mayTransferCargo,false,type);
  }
});
test("DIRECTED-TERMINAL-06 unknown chunk, unsupported support, or invalid hopper direction cannot authorize",()=>{
  const f=makeChain();
  const absent=f.check({getBlock:(d,p)=>
    p.x===24&&p.y===72?undefined:f.reader(d,p)});
  assert.equal(absent.decision,"HOLD");
  const support=makeChain();
  support.put({x:23,y:71,z:0},"hartsorter:collector");
  assert.equal(support.check().decision,"HOLD");
  const direction=makeChain();
  direction.put({x:22,y:72,z:0},"minecraft:hopper",47);
  assert.equal(direction.check().decision,"HOLD");
});
test("DIRECTED-TERMINAL-07 native total read cap cannot fabricate inert terminus",()=>{
  const f=makeChain();
  for(const n of [1,5,10,20]){
    const result=f.check({maxUniqueReads:n});
    assert.equal(result.decision,"HOLD","budget "+n);
    assert.ok(result.uniqueReads<=n,"budget "+n);
    assert.equal(result.persistPermitted,false);
  }
});
test("DIRECTED-TERMINAL-08 disconnected unknown path does not poison the verified source-local terminal",()=>{
  const f=makeChain();
  f.receivers.push({id:"R-unrelated",d:D,x:2000,y:73,z:0});
  const out=f.check();
  assert.equal(out.decision,"LOCAL_TERMINALS_PROVED");
  assert.equal(out.native.unknown.some(x=>x.from==="R-unrelated"),true);
  assert.equal(out.provenTerminals[0].receiverId,"R2");
});

test("DIRECTED-TERMINAL-09 native Hopper ring feeding back into its own earlier Hopper is a verified loop, never terminal",()=>{
  const f=makeChain();
  // Receiver R2 enters the horizontal ring at (20,72,0).
  // Every Hopper orientation and every return block are positively loaded.
  f.put({x:20,y:72,z:0},"minecraft:hopper",5);
  f.put({x:21,y:72,z:0},"minecraft:hopper",3);
  f.put({x:21,y:72,z:1},"minecraft:hopper",4);
  f.put({x:20,y:72,z:1},"minecraft:hopper",2);
  const result=f.check();
  assert.equal(result.decision,"REJECT");
  assert.equal(result.reason,"verified_native_hopper_output_cycle");
  assert.equal(result.cycleFrom,"R2");
  assert.equal(result.persistPermitted,false);
  assert.equal(result.mayTransferCargo,false);
});
test("DIRECTED-TERMINAL-10 a disconnected native Hopper loop does not fabricate a return to the live source",()=>{
  const f=makeChain();
  const remote={id:"R-remote",d:D,x:1000,y:73,z:0};
  f.receivers.push(remote);
  f.put(remote,"hartsorter:receiver");
  f.put({x:1000,y:72,z:0},"minecraft:hopper",5);
  f.put({x:1001,y:72,z:0},"minecraft:hopper",3);
  f.put({x:1001,y:72,z:1},"minecraft:hopper",4);
  f.put({x:1000,y:72,z:1},"minecraft:hopper",2);
  const result=f.check();
  assert.equal(result.decision,"LOCAL_TERMINALS_PROVED");
  assert.equal(result.provenTerminals[0].receiverId,"R2");
  assert.equal(result.native.unknown.some(x=>
    x.from==="R-remote"&&x.reason==="native_hopper_cycle"),true);
  assert.equal(result.mayTransferCargo,false);
});
