/**
 * U0 source-only writer/callback census. Conservatively tracks all known
 * directly mutating calls and named function reachability in the immutable
 * 1.4.2 engine; this is NOT a Bedrock runtime trace.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SCRIPT=fs.readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");
assert.equal(createHash("sha256").update(SCRIPT).digest("hex"),
  "2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411",
  "Census must use pinned 1.4.2 source");
function endFunction(start) {
 const pos=SCRIPT.indexOf("{",start);
 assert.ok(pos>=0);
 let depth=0,q="",escape=false,line=false,block=false;
 for(let i=pos;i<SCRIPT.length;i++){
  const c=SCRIPT[i],n=SCRIPT[i+1];
  if(line){if(c==="\n")line=false;continue;}
  if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
  if(q){if(escape){escape=false;continue;}
   if(c==="\\"){escape=true;continue;}
   if(c===q)q="";continue;}
  if(c==="/"&&n==="/"){line=true;i++;continue;}
  if(c==="/"&&n==="*"){block=true;i++;continue;}
  if(c==="'"||c==='"'||c.charCodeAt(0)===96){q=c;continue;}
  if(c==="{")depth++;
  if(c==="}"&&--depth===0)return i+1;
 }
 throw Error("Unterminated function");
}
const functions=[...SCRIPT.matchAll(/^function\s+([a-zA-Z_$][\w$]*)\s*\(/gm)]
 .map(m=>({name:m[1],start:m.index,end:endFunction(m.index)}));
const byName=new Map(functions.map(f=>[f.name,f]));
const names=new Set(byName.keys());
const mutation=/\.\s*(setItem|addItem|transferItem|moveItem|swapItems|setDynamicProperty|spawnItem|spawnEntity|remove|kill|setEquipment|setType|setPermutation|runCommand|setLore|setProperty)\s*\(/g;
function directCalls(body) {return [...body.matchAll(mutation)].map(m=>m[1]);}
const direct=new Map(functions.map(f=>[f.name,directCalls(SCRIPT.slice(f.start,f.end))]));
const adjacency=new Map(functions.map(f=>[f.name,[]]));
for(const f of functions){
 const body=SCRIPT.slice(f.start,f.end);
 const calls=adjacency.get(f.name);
 // Overapproximations may include words in comments/strings, never grant
 // permission to write solely from a static callgraph.
 for(const name of names){
  if(name===f.name)continue;
  const escaped=name.replace(/[.*+?^$()|[\]{}\\]/g,"\\$&");
  if(new RegExp("\\b"+escaped+"\\s*\\(").test(body))calls.push(name);
 }
}
function transitive(start){
 const seen=new Set(),pending=[start];
 while(pending.length){
  const name=pending.pop();
  if(seen.has(name)||!byName.has(name))continue;
  seen.add(name);
  pending.push(...adjacency.get(name));
 }
 return [...seen];
}
const intervalNames=[...SCRIPT.matchAll(/system\.runInterval\s*\(\s*(\w+)\s*,/g)].map(m=>m[1]);
const expectedIntervals=["schedulerTick","logisticsTick","reconcileDisplays",
 "reconcileModeVisuals","recoverJournal","recoverQueueJournal","flushLogistics"];
const ownerTypes={
 compactSourceHopper:"HOPPER_COMPACT_UNJOURNALED",
 safeMovePartial:"PHYSICAL_JOURNAL",
 enqueueFromSource:"Q4_SOURCE_DEBIT",
 enqueueFromEjectedEntity:"Q4_ENTITY_REMOVAL",
 dequeueToReceiver:"Q4_OUTPUT_CREDIT",
 recoverJournal:"PHYSICAL_REPLAY",
 recoverQueueJournal:"Q4_REPLAY",
 setFilter:"PLAYER_ITEM_CHANGE",
 giveOrDrop:"PLAYER_INVENTORY_OR_DROP",
 syncDisplay:"VISUAL_ENTITY",
 equipDisplayEntity:"VISUAL_ENTITY",
 removeDisplay:"VISUAL_ENTITY",
 reconcileDisplays:"VISUAL_ENTITY",
 reconcileLoadedDisplay:"VISUAL_ENTITY",
 syncSorterModeVisual:"BLOCK_VISUAL",
 plantEmptyNativeFrame:"FRAME_BLOCK_CHANGE",
 eraseOwnedFrame:"FRAME_BLOCK_CHANGE",
 showNativeFrameUpgradeNotice:"WORLD_UI_PROPERTY",
 setWorldDynamic:"WORLD_REGISTRY_OR_JOURNAL",
 rebuildItem:"NATIVE_ITEM_BUILD",
 rebuildQueueItem:"NATIVE_ITEM_BUILD"
};
const directNames=functions.filter(f=>direct.get(f.name).length).map(f=>f.name);
test("U0-01 exact immutable baseline and 175 named functions",()=>{
 assert.equal(functions.length,175);
 assert.deepEqual(new Set(directNames),new Set(Object.keys(ownerTypes)));
});
test("U0-02 all seven scheduled roots are explicit",()=>{
 assert.deepEqual(intervalNames,expectedIntervals);
 for(const n of intervalNames)assert.ok(byName.has(n));
});
test("U0-03 two anonymous direct block writes identified in break handler",()=>{
 const anonymous=[];
 for(const m of SCRIPT.matchAll(mutation)){
  if(!functions.some(f=>m.index>=f.start&&m.index<f.end)){
   anonymous.push({line:SCRIPT.slice(0,m.index).split("\n").length,method:m[1]});
  }
 }
 assert.deepEqual(anonymous,[{line:4305,method:"setType"},{line:4306,method:"runCommand"}]);
});
test("U0-04 scheduled routes transitively touch physical and Q4 writers",()=>{
 const scheduler=new Set(transitive("schedulerTick"));
 const logistics=new Set(transitive("logisticsTick"));
 for(const n of ["compactSourceHopper","safeMovePartial","enqueueFromSource"])
   assert.ok(scheduler.has(n),"scheduler should reach "+n);
 for(const n of ["enqueueFromSource","dequeueToReceiver","recoverQueueJournal"])
   assert.ok(logistics.has(n),"logistics should reach "+n);
 assert.ok(new Set(transitive("recoverJournal")).has("recoverJournal"));
 assert.ok(new Set(transitive("recoverQueueJournal")).has("recoverQueueJournal"));
});
test("U0-05 player/display/block mutations remain explicitly classified",()=>{
 for(const n of ["setFilter","giveOrDrop","syncDisplay","equipDisplayEntity",
 "removeDisplay","syncSorterModeVisual","plantEmptyNativeFrame","eraseOwnedFrame"]){
  assert.ok(direct.get(n)?.length,n+" direct effect exists");
  assert.notEqual(ownerTypes[n],"Q4_SOURCE_DEBIT");
 }
});
test("U0-06 new mutation methods/callbacks require a deliberate review",()=>{
 for(const f of directNames)assert.ok(ownerTypes[f],f+" needs classification");
 assert.ok(SCRIPT.includes("world.afterEvents.entitySpawn.subscribe"));
 assert.ok(SCRIPT.includes("world.beforeEvents.playerInteractWithBlock.subscribe"));
 assert.ok(SCRIPT.includes("world.beforeEvents.playerBreakBlock.subscribe"));
});
