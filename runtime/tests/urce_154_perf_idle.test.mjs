import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const main=readFileSync(resolve(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");
const begin=main.indexOf("const dimensionHandleCache = new Map();");
const end=main.indexOf("// Keep the Bedrock reader identity stable",begin);
assert.ok(begin>=0&&end>begin);
const actualSource=main.slice(begin,end);

function harness(){
 let handles=0,blocks=0;
 const dims=new Map();
 const world={
  getDimension(id){
   handles++;
   if(id==="minecraft:invalid")throw Error("native dimension unavailable");
   if(id==="minecraft:retry"&&handles<2)throw Error("first lookup failed");
   if(!dims.has(id))dims.set(id,{
    getBlock(p){
     blocks++;
     if(p.x===999)throw Error("unloaded");
     return {typeId:p.x%2?"minecraft:stone":"minecraft:air",location:p};
    }
   });
   return dims.get(id);
  }
 };
 const env=vm.runInNewContext(actualSource+
  "\n({getDimension,getBlock,dimensionHandleCache})",{world});
 return {env,world,get handles(){return handles;},get blocks(){return blocks;}};
}

test("IDLE-01 repeated loaded blocks call native world.getDimension only once per dimension",()=>{
 const h=harness();
 for(let i=0;i<10000;i++){
  const b=h.env.getBlock("minecraft:overworld",i%15,64,0);
  assert.ok(b);
 }
 assert.equal(h.handles,1,"Never re-query the permanent Dimension handle per Block");
 assert.equal(h.blocks,10000,
  "Native Block content is NOT cached; every read stays current");
 assert.equal(h.env.dimensionHandleCache.size,1);
});

test("IDLE-02 dimension reuse works across vanilla dimensions without cross-talk",()=>{
 const h=harness();
 for(const d of ["minecraft:overworld","minecraft:nether","minecraft:the_end"]){
  for(let i=0;i<120;i++)assert.ok(h.env.getBlock(d,i,64,0));
 }
 assert.equal(h.handles,3);
 assert.equal(h.env.dimensionHandleCache.size,3);
});

test("IDLE-03 failed dimension lookups are retried, not cached as proven absence",()=>{
 const h=harness();
 assert.equal(h.env.getBlock("minecraft:invalid",4,64,0),undefined);
 assert.equal(h.env.getBlock("minecraft:invalid",4,64,0),undefined);
 assert.equal(h.handles,2);
 assert.equal(h.env.dimensionHandleCache.has("minecraft:invalid"),false);
});

test("IDLE-04 a loaded Dimension does not turn unavailable Block into air",()=>{
 const h=harness();
 assert.ok(h.env.getBlock("minecraft:overworld",1,64,0));
 assert.equal(h.env.getBlock("minecraft:overworld",999,64,0),undefined);
 assert.ok(h.env.getBlock("minecraft:overworld",2,64,0));
 assert.equal(h.handles,1);
 assert.equal(h.blocks,3);
});

test("IDLE-05 graph safety still checks native cargo source each eligible tick",()=>{
 const guard=readFileSync(resolve(ROOT,
 "addon/behavior_pack/scripts/urce_152_live_link_guard.js"),"utf8");
 assert.match(guard,/NEGATIVE_TTL_TICKS=20/);
 assert.match(guard,/result\.decision==="HOLD"\|\|result\.decision==="REJECT"/);
 assert.match(guard,/forceFresh\)\{reset\(\);negativeMemo\.clear\(\);\}/);
 assert.match(guard,/tick>=cached\.bornTick&&tick<cached\.untilTick/);
 // This is a lexical guard; real decision behavior is exercised by LIVE tests.
});
