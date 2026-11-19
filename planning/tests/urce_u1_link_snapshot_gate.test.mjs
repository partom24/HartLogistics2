import test from "node:test";
import assert from "node:assert/strict";
import {inspectCandidateSupplyLink} from "../src/urce_u1_link_snapshot_gate.mjs";

const key=(d,p)=>d+"|"+p.x+"|"+p.y+"|"+p.z;
const block=(type,face=5)=>({
  typeId:type,permutation:{getState(name){
    if(name!=="facing_direction")throw Error("bad facing field");
    return face;
  }}
});
const worlds=(n=2,{move=0,branched=false}={})=>{
  const d="minecraft:overworld",world=new Map(),
    collectors=[],receivers=[];
  for(let i=0;i<n;i++){
    const x=move+i*12;
    const r={id:"R"+i,d,x,y:66,z:0},
      c={id:"C"+i,d,x:x+5,y:66,z:0,link:i<n-1?"R"+(i+1):null};
    receivers.push(r);collectors.push(c);
    world.set(key(d,r),block("hartsorter:receiver"));
    world.set(key(d,c),block("hartsorter:collector"));
    for(let dx=1;dx<=4;dx++)
      world.set(key(d,{x:x+dx,y:66,z:0}),block("hartsorter:transporter"));
  }
  if(branched)
    world.set(key(d,{x:move+2,y:67,z:0}),block("hartsorter:transporter"));
  const getBlock=(dim,pos)=>world.get(key(dim,pos))||block("minecraft:air");
  return {collectors,receivers,getBlock,world,d};
};
const plan=(f,c,r,extra={})=>inspectCandidateSupplyLink({
  ...f,fromCollector:c,toReceiver:r,...extra
});
const shape=x=>[x.decision,x.reason,x.persistPermitted,x.executePermitted];

test("LINK-01 owner 13-bank physical array without installed HL blocks is not a network",()=>{
  const f={receivers:[],collectors:[],
    getBlock:()=>block("minecraft:air")};
  const result=plan(f,"C12","R0");
  assert.deepEqual(shape(result),["HOLD","unknown_link_endpoint",false,false]);
});

test("LINK-02 both possible two-bank back-edges are REJECTED in the managed bank model",()=>{
  for(const move of [0,-924,100024]){
    const f=worlds(2,{move});
    const r=plan(f,"C1","R0");
    assert.deepEqual(shape(r),["REJECT","cycle",false,false]);
    const reverse=worlds(2,{move});
    reverse.collectors[0].link=null;
    reverse.collectors[1].link="R0";
    assert.deepEqual(shape(plan(reverse,"C0","R1")),
      ["REJECT","cycle",false,false]);
  }
});

test("LINK-03 first legal forward bank link is a safe snapshot, not write permission",()=>{
  const f=worlds(2);
  f.collectors[0].link=null;
  const result=plan(f,"C0","R1");
  assert.equal(result.decision,"SAFE_SNAPSHOT");
  assert.equal(result.persistPermitted,false);
  assert.equal(result.executePermitted,false);
  assert.equal(result.observedBanks,2);
});

test("LINK-04 13 banks remain individually recognized, not one giant controller",()=>{
  const f=worlds(13);
  const result=plan(f,"C12","R0");
  assert.deepEqual(shape(result),["REJECT","cycle",false,false]);
  const alreadyValid=plan(f,"C11","R12");
  assert.equal(alreadyValid.decision,"SAFE_SNAPSHOT");
  assert.equal(alreadyValid.observedBanks,13);
});

test("LINK-05 pre-existing prohibited closed loop is rejected without mutating links",()=>{
  const f=worlds(2);f.collectors[1].link="R0";
  const before=JSON.stringify(f.collectors);
  const result=plan(f,"C0","R1");
  assert.equal(result.decision,"REJECT");
  assert.equal(JSON.stringify(f.collectors),before);
});

test("LINK-06 unknown/unloaded chunk prevents a positive safe decision",()=>{
  const f=worlds(2);
  const missing=key(f.d,{x:12+2,y:66,z:0});
  const getBlock=(d,p)=>key(d,p)===missing?undefined:f.getBlock(d,p);
  const result=plan({...f,getBlock},"C0","R1");
  assert.equal(result.decision,"HOLD");
  assert.equal(result.persistPermitted,false);
});

test("LINK-07 ambiguous branching pipe cannot create false safe path",()=>{
  const f=worlds(2);f.collectors[0].link=null;
  // Branch the *target Receiver 1* component; unrelated branches do not
  // invalidate a known disconnected source-specific route.
  f.world.set(key(f.d,{x:14,y:67,z:0}),block("hartsorter:transporter"));
  const result=plan(f,"C0","R1");
  assert.equal(result.decision,"HOLD");
  assert.equal(result.persistPermitted,false);
});

test("LINK-08 native unknown output Hopper is not ignored as visual missing-Hopper",()=>{
  const f=worlds(2);
  f.collectors[0].link=null;
  const reader=(d,p)=>p.x===f.receivers[1].x &&
    p.y===f.receivers[1].y-1&&p.z===f.receivers[1].z
    ?undefined:f.getBlock(d,p);
  const result=plan({...f,getBlock:reader},"C0","R1");
  assert.equal(result.decision,"HOLD");
  assert.equal(result.persistPermitted,false);
  assert.match(result.reason,/unverified|incomplete/);
});

test("LINK-09 read limits make a prospective link HOLD",()=>{
  const f=worlds(13);f.collectors[0].link=null;
  const result=plan(f,"C0","R1",{maxTransporterReads:10});
  assert.equal(result.decision,"HOLD");
  assert.equal(result.persistPermitted,false);
});

test("LINK-10 relink checking changes no saved Q4/Collector links",()=>{
  const f=worlds(2);
  const before=JSON.stringify(f.collectors);
  assert.equal(plan(f,"C0","R1").decision,"SAFE_SNAPSHOT");
  assert.equal(JSON.stringify(f.collectors),before);
});
