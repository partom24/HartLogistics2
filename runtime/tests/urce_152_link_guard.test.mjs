import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createLiveLinkGuard} from "../../addon/behavior_pack/scripts/urce_152_live_link_guard.js";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>readFileSync(resolve(ROOT,p),"utf8");
const loc=(d,p)=>d+"|"+p.x+"|"+p.y+"|"+p.z;
const block=(type,face=5)=>({
 typeId:type,permutation:{getState(k){
   if(k!=="facing_direction")throw Error("unrecognized direction");
   return face;
 }}
});
function fixture(n=2) {
 const d="minecraft:overworld",world=new Map(),collectors=[],receivers=[];
 for(let i=0;i<n;i++){
   const x=i*20;
   const r={id:"R"+i,d,x,y:80,z:0},c={
     id:"C"+i,d,x:x+5,y:80,z:0,
     link:i+1<n?"R"+(i+1):null
   };
   collectors.push(c);receivers.push(r);
   world.set(loc(d,r),block("hartsorter:receiver"));
   world.set(loc(d,c),block("hartsorter:collector"));
   for(let dx=1;dx<=4;dx++)
     world.set(loc(d,{x:x+dx,y:80,z:0}),block("hartsorter:transporter"));
 }
 let reads=0;
 const getBlock=(d,p)=>{
   reads++;
   return world.get(loc(d,p))||block("minecraft:air");
 };
 return {world,collectors,receivers,getBlock,
   get reads(){return reads;}
 };
}
function request(guard,f,c,r,tick=5,forceFresh=false){
 return guard.check({collector:f.collectors[c],receiver:f.receivers[r],
   collectors:f.collectors,receivers:f.receivers,getBlock:f.getBlock,
   currentTick:tick,forceFresh});
}

test("LIVE-01 runtime source imports exact reviewed pure routing models",()=>{
 const expected=[
 ["planning/src/urce_u1_route_model.mjs",
  "addon/behavior_pack/scripts/urce_152_route_model.js",s=>s.replace(/\.mjs/g,".js")],
 ["planning/src/urce_u1_native_hopper_witness.mjs",
  "addon/behavior_pack/scripts/urce_152_native_hopper_witness.js",
  s=>s.replace("./urce_u1_route_model.mjs","./urce_152_route_model.js")],
 ["planning/src/urce_u1_transporter_bank_probe.mjs",
  "addon/behavior_pack/scripts/urce_152_transporter_bank_probe.js",s=>s],
 ["planning/src/urce_u1_link_snapshot_gate.mjs",
  "addon/behavior_pack/scripts/urce_152_link_snapshot_gate.js",
  s=>s.replace("./urce_u1_route_model.mjs","./urce_152_route_model.js")
    .replace("./urce_u1_native_hopper_witness.mjs","./urce_152_native_hopper_witness.js")
    .replace("./urce_u1_transporter_bank_probe.mjs","./urce_152_transporter_bank_probe.js")]
 ];
 for(const [from,to,transform] of expected)
  assert.equal(read(to),transform(read(from)),
    "Runtime topology code must match reviewed U1 source: "+to);
});

test("LIVE-02 first interbank link is snapshot safe but not yet custody authority",()=>{
 const f=fixture(2),g=createLiveLinkGuard();
 f.collectors[0].link=null;
 const result=request(g,f,0,1);
 assert.equal(result.decision,"SAFE_SNAPSHOT");
 assert.equal(result.persistPermitted,false);
 assert.equal(result.executePermitted,false);
});

test("LIVE-03 proposed two-bank return is REJECTED before any saved link mutation",()=>{
 const f=fixture(2),g=createLiveLinkGuard();
 const before=JSON.stringify(f.collectors);
 const result=request(g,f,1,0);
 assert.equal(result.decision,"REJECT");
 assert.equal(result.reason,"cycle");
 assert.equal(JSON.stringify(f.collectors),before);
});

test("LIVE-04 a pre-existing saved cycle cannot ingest by revalidating its link",()=>{
 const f=fixture(2),g=createLiveLinkGuard();
 f.collectors[1].link="R0";
 assert.equal(request(g,f,0,1).decision,"REJECT");
 assert.equal(request(g,f,1,0).decision,"REJECT");
});

test("LIVE-05 same-tick memo is invalidated on block changes and next tick",()=>{
 const f=fixture(1),g=createLiveLinkGuard();
 const first=request(g,f,0,0);
 assert.equal(first.decision,"REJECT");
 const reads=f.reads;
 const memo=request(g,f,0,0);
 assert.equal(memo.decision,"REJECT");
 assert.equal(f.reads,reads);
 g.invalidate();
 request(g,f,0,0);
 assert.ok(f.reads>reads);
 const reads2=f.reads;
 request(g,f,0,0,6);
 assert.ok(f.reads>reads2);
});

test("LIVE-06 unavailable source or invalid parameter always HOLDS",()=>{
 const f=fixture(1),g=createLiveLinkGuard();
 const missing=(d,p)=>p.x===0&&p.y===80?undefined:f.getBlock(d,p);
 const result=g.check({
  collector:f.collectors[0],receiver:f.receivers[0],
  collectors:f.collectors,receivers:f.receivers,
  getBlock:missing,currentTick:12,forceFresh:true
 });
 assert.equal(result.decision,"HOLD");
 assert.equal(g.check({collector:f.collectors[0],
  receiver:f.receivers[0],getBlock:f.getBlock}).decision,"HOLD");
});

test("LIVE-07 distinct links in the same tick share one bounded native world scan",()=>{
 const f=fixture(13),g=createLiveLinkGuard();
 f.collectors[12].link=null;
 const first=request(g,f,0,1,13);
 assert.equal(first.decision,"SAFE_SNAPSHOT");
 const reads=f.reads;
 const second=request(g,f,1,2,13);
 assert.equal(second.decision,"SAFE_SNAPSHOT");
 assert.equal(f.reads,reads,"Per-link graph evaluation must not rescan the world");
 assert.equal(g.stats().worldScans,1);
 assert.equal(g.stats().decisions,2);
 assert.equal(g.stats().hasSnapshot,true);
});

test("LIVE-08 map and topology snapshot do not retain previous tick entries",()=>{
 const f=fixture(2),g=createLiveLinkGuard();
 f.collectors[0].link=null;
 for(let tick=0;tick<240;tick++){
   assert.equal(request(g,f,0,1,tick).decision,"SAFE_SNAPSHOT");
   assert.equal(g.stats().decisions,1);
   assert.equal(g.stats().tick,tick);
 }
 assert.equal(g.stats().worldScans,240);
 g.invalidate();
 assert.equal(g.stats().decisions,0);
 assert.equal(g.stats().hasSnapshot,false);
});

test("LIVE-09 in-place registry mutation cannot reuse previous safe decision",()=>{
 const f=fixture(2),g=createLiveLinkGuard();
 f.collectors[0].link=null;
 assert.equal(request(g,f,0,1,22).decision,"SAFE_SNAPSHOT");
 const reads=f.reads;
 f.collectors[1].link="R0";
 assert.equal(request(g,f,0,1,22).decision,"REJECT");
 assert.ok(f.reads>reads);
 assert.equal(g.stats().worldScans,2);
});

test("LIVE-10 forced fresh check drops same-tick memo and reobserves",()=>{
 const f=fixture(2),g=createLiveLinkGuard();
 f.collectors[0].link=null;
 assert.equal(request(g,f,0,1,50).decision,"SAFE_SNAPSHOT");
 assert.equal(g.stats().decisions,1);
 assert.equal(request(g,f,0,1,50,true).decision,"SAFE_SNAPSHOT");
 assert.equal(g.stats().decisions,0);
 assert.equal(g.stats().worldScans,2);
});

test("LIVE-11 source read-provider change triggers re-observation",()=>{
 const f=fixture(2),g=createLiveLinkGuard();
 f.collectors[0].link=null;
 assert.equal(request(g,f,0,1,70).decision,"SAFE_SNAPSHOT");
 const baseline=g.stats().worldScans;
 const other=(d,p)=>p.x===22&&p.y===80&&p.z===0
   ?undefined:f.getBlock(d,p);
 const result=g.check({collector:f.collectors[0],receiver:f.receivers[1],
   collectors:f.collectors,receivers:f.receivers,getBlock:other,
   currentTick:70});
 assert.equal(result.decision,"HOLD");
 assert.equal(g.stats().worldScans,baseline+1);
});
