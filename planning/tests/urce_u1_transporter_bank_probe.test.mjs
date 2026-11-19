import test from "node:test";
import assert from "node:assert/strict";
import {
  observeTransporterComponents,evaluateVisualBankLoopRisk
} from "../src/urce_u1_transporter_bank_probe.mjs";

const loc=(d,p)=>d+"|"+p.x+"|"+p.y+"|"+p.z;
const block=t=>({typeId:t});
function rig(n=2,{x=0,y=45,z=0,axis="x"}={}){
  const world=new Map(),anchors=[],links=[];
  for(let i=0;i<n;i++){
    const base=i*12,position=t=>({
      x:x+(axis==="x"?base+t:0),
      y,z:z+(axis==="z"?base+t:0)
    });
    const r={id:"R"+i,kind:"receiver",d:"minecraft:overworld",...position(0)};
    const c={id:"C"+i,kind:"collector",d:"minecraft:overworld",...position(5)};
    anchors.push(r,c);
    world.set(loc(r.d,r),block("hartsorter:receiver"));
    world.set(loc(c.d,c),block("hartsorter:collector"));
    for(let p=1;p<5;p++)
      world.set(loc(r.d,position(p)),block("hartsorter:transporter"));
    if(i<n-1)links.push({from:c.id,to:"R"+(i+1)});
  }
  const getBlock=(d,p)=>world.get(loc(d,p))||block("minecraft:air");
  return {world,anchors,links,getBlock};
}
const inspect=f=>observeTransporterComponents(f);
const risk=(f,from,to)=>evaluateVisualBankLoopRisk({
  observation:inspect(f),collectorId:from,receiverId:to,links:f.links
});

test("BANKVIS-01 two physical Transporter runs are two potential banks",()=>{
  const f=rig(2),obs=inspect(f);
  assert.equal(obs.status,"OBSERVED");
  assert.equal(obs.components.length,2);
  assert.equal(obs.components.every(c=>c.classification==="CANDIDATE_SINGLE_BANK"),true);
  assert.equal(obs.components.every(c=>c.transporters===4),true);
  assert.equal(obs.coverageComplete,false);
  assert.equal(obs.mayAuthorizeLink,false);
  assert.deepEqual(obs.components.map(c=>c.endpointIds),[
    ["C0","R0"],["C1","R1"]
  ]);
});

test("BANKVIS-02 owner's two-bank return is risky but visuals cannot prove a cycle",()=>{
  const f=rig(2);
  assert.deepEqual(risk(f,"C1","R0"),{
    decision:"HOLD",reason:"potential_supply_cycle",persistPermitted:false
  });
  f.links.push({from:"C1",to:"R0"});
  assert.equal(risk(f,"C0","R1").reason,"potential_supply_cycle");
});

test("BANKVIS-03 13 existing physical-bank-shaped runs do not become a single bank",()=>{
  const f=rig(13,{x:-799,y:39,z:201,axis:"z"}),obs=inspect(f);
  assert.equal(obs.status,"OBSERVED");
  assert.equal(obs.components.length,13);
  assert.equal(obs.components.reduce((n,c)=>n+c.transporters,0),52);
  assert.equal(f.links.length,12);
  assert.equal(risk(f,"C12","R0").reason,"potential_supply_cycle");
  // The real owner's 13 banks already exist. This source-only generated
  // fixture checks shape-invariance, not their actual Minecraft coordinates.
});

test("BANKVIS-04 an open chain still cannot grant new link authority",()=>{
  const f=rig(2);
  const result=risk(f,"C0","R1");
  assert.deepEqual(result,{
    decision:"HOLD",reason:"visual_topology_not_directed_cargo_proof",
    persistPermitted:false
  });
});

test("BANKVIS-05 a disconnected Transporter cell is not magically connected",()=>{
  const f=rig(2);
  f.world.delete(loc("minecraft:overworld",{x:3,y:45,z:0}));
  const obs=inspect(f);
  assert.equal(obs.components.length,3);
  assert.equal(obs.components.some(c=>c.classification==="CANDIDATE_SINGLE_BANK"),true);
  assert.equal(obs.components.filter(c=>c.classification==="CANDIDATE_SINGLE_BANK").length,1);
  assert.equal(obs.mayAuthorizeLink,false);
});

test("BANKVIS-06 unknown neighboring blocks do not count as known empty",()=>{
  const f=rig(2),lost={x:3,y:45,z:0};
  const obs=observeTransporterComponents({...f,getBlock:(d,p)=>
    loc(d,p)===loc(d,lost)?undefined:f.getBlock(d,p)});
  assert.equal(obs.status,"INCOMPLETE");
  assert.equal(obs.coverageComplete,false);
  assert.equal(obs.unresolved.some(x=>x.reason==="chunk_unavailable"),true);
});

test("BANKVIS-07 branch/merge components are not forced into one-bank identity",()=>{
  const f=rig(1);
  const d="minecraft:overworld";
  f.world.set(loc(d,{x:2,y:46,z:0}),block("hartsorter:transporter"));
  f.world.set(loc(d,{x:2,y:47,z:0}),block("hartsorter:transporter"));
  const obs=inspect(f);
  assert.equal(obs.components.length,1);
  assert.equal(obs.components[0].branching,true);
  assert.equal(obs.components[0].classification,"UNCLASSIFIED_COMPONENT");
});

test("BANKVIS-08 unknown anchors, hard caps and invalid input fail closed",()=>{
  const f=rig(13);
  const capped=observeTransporterComponents({...f,maxReads:7});
  assert.ok(capped.reads<=7);
  assert.equal(capped.coverageComplete,false);
  assert.equal(capped.status,"INCOMPLETE");
  const limited=observeTransporterComponents({...f,maxTransporters:1});
  assert.equal(limited.status,"INCOMPLETE");
  assert.equal(limited.unresolved.some(x=>x.reason==="transporter_budget"),true);
  assert.equal(observeTransporterComponents({...f,anchors:[f.anchors[0],f.anchors[0]]}).status,"INVALID");
  assert.equal(evaluateVisualBankLoopRisk({
    observation:limited,collectorId:"C0",receiverId:"R1",
    links:[{from:12,to:0}]
  }).decision,"HOLD");
});
