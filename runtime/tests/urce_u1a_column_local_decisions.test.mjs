/**
 * U1-A local Column Coordinator differential tests.
 * Run with node --experimental-vm-modules --test.
 * No BDS timing, migration or adaptive polling claim follows from these tests.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const MODULE=path.join(ROOT,"addon/behavior_pack/scripts/urce_column_local_decisions.js");
const MAIN=path.join(ROOT,"addon/behavior_pack/scripts/main.js");
async function load(){
  const mod=new vm.SourceTextModule(fs.readFileSync(MODULE,"utf8"),{identifier:MODULE});
  await mod.link(()=>{throw Error("local read-only module cannot import another module");});
  await mod.evaluate();
  return mod.namespace;
}
const e=(mode,f,id)=>({mode,f:f?{typeId:f}:null,id});
const modeOf=x=>x.mode;
const matches=(stack,f)=>stack.typeId===f.typeId;
const source=(items,fail=-1)=>({size:items.length,getItem(i){if(i===fail)throw Error("inventory unreadable");return items[i];}});
const stack=id=>id?{typeId:id,amount:1}:undefined;
function baselineTransit(sorters,src,modeOf,matchesFilter){
  let provenTransit=true,hasFilter=false;
  for(const entry of sorters){
    const mode=modeOf(entry);
    if(mode!=="filter"&&mode!=="bypass"){provenTransit=false;break;}
    if(mode==="filter")hasFilter=true;
  }
  if(provenTransit&&hasFilter){
    let observedItem=false;
    try{
      const sourceSize=src.size;
      for(let si=0;si<sourceSize&&provenTransit;si++){
        const item=src.getItem(si);
        if(!item)continue;
        observedItem=true;
        for(const entry of sorters){
          if(modeOf(entry)==="filter"&&entry.f&&matchesFilter(item,entry.f)){
            provenTransit=false;break;
          }
        }
      }
      if(!observedItem)provenTransit=false;
    }catch(_){provenTransit=false;}
  }
  return provenTransit;
}
function baselineCandidates(active,stack,modeOf,matchesFilter){
  const specific=active.filter(x=>modeOf(x)==="filter"&&x.f&&matchesFilter(stack,x.f));
  const auto=active.filter(x=>modeOf(x)==="auto");
  const wildcard=active.filter(x=>modeOf(x)==="wildcard");
  return [...specific,...auto,...wildcard];
}
function baselineKind(typeId,collectorId){
  if(typeId===collectorId)return "collector";
  if(typeId==="minecraft:chest"||typeId==="minecraft:trapped_chest"||typeId==="minecraft:barrel")return "storage";
  if(typeId==="minecraft:shulker_box"||typeId.endsWith("_shulker_box"))return "storage";
  return undefined;
}
test("U1-A destination classification matches existing supported storage",async()=>{
  const {classifySorterDestinationType}=await load();
  const collector="hartsorter:collector";
  for(const type of [collector,"minecraft:chest","minecraft:barrel","minecraft:trapped_chest",
    "minecraft:shulker_box","minecraft:blue_shulker_box","minecraft:hopper",
    "minecraft:air","minecraft:ender_chest","minecraft:stone"]){
    assert.equal(classifySorterDestinationType(type,collector),baselineKind(type,collector),type);
  }
  assert.equal(classifySorterDestinationType(undefined,collector),undefined);
});
test("U1-A matches 1.5.8 transit decisions across 1024 mode combinations and sparse slots",async()=>{
  const {proveLocalColumnTransit}=await load();
  const modes=["filter","bypass","auto","wildcard"];
  const patterns=[
    [],[stack("minecraft:cobblestone")],
    [undefined,stack("minecraft:dirt")],
    [stack("minecraft:stone"),undefined,stack("minecraft:cobblestone")],
    [undefined,undefined,stack("minecraft:sand"),undefined,stack("minecraft:dirt")],
    ["dirt","cobblestone","sand","stone","gravel"].map(x=>stack("minecraft:"+x))
  ];
  for(let code=0;code<1024;code++){
    let n=code;const sorters=[];
    for(let i=0;i<5;i++){
      sorters.push(e(modes[n%4],i%2===0?"minecraft:cobblestone":null,"s"+i));
      n=Math.floor(n/4);
    }
    for(const items of patterns){
      assert.equal(proveLocalColumnTransit(sorters,source(items),modeOf,matches),
        baselineTransit(sorters,source(items),modeOf,matches),
        "mode="+code+" slots="+items.map(s=>s?.typeId||"-").join(","));
    }
  }
});
test("U1-A unreadable slot, matching cargo or unknown mode cannot be known transit",async()=>{
  const {proveLocalColumnTransit}=await load();
  const filter=[e("filter","minecraft:stone","s0")];
  assert.equal(proveLocalColumnTransit(filter,source([stack("minecraft:dirt")],0),modeOf,matches),false);
  assert.equal(proveLocalColumnTransit(filter,source([stack("minecraft:dirt")]),modeOf,()=>{throw Error("metadata");}),false);
  assert.equal(proveLocalColumnTransit(filter,source([stack("minecraft:stone")]),modeOf,matches),false);
  assert.equal(proveLocalColumnTransit([e("mystery",null,"s")],source([stack("minecraft:dirt")]),modeOf,matches),false);
  assert.equal(proveLocalColumnTransit([e("bypass",null,"s")],source([stack("minecraft:dirt")]),modeOf,matches),true);
});
test("U1-A preserves Filter/Auto/Wildcard order with bottom-to-top stability",async()=>{
  const {orderedLocalSorterCandidates}=await load();
  const list=[
    e("wildcard",null,"w0"),e("auto",null,"a0"),
    e("filter","minecraft:cobblestone","f0"),e("bypass",null,"b0"),
    e("filter","minecraft:stone","f1"),
    e("filter","minecraft:cobblestone","f2"),
    e("auto",null,"a1"),e("wildcard",null,"w1")
  ];
  for(const type of ["minecraft:cobblestone","minecraft:stone","minecraft:dirt"]){
    assert.deepEqual(
      Array.from(orderedLocalSorterCandidates(list,stack(type),modeOf,matches),x=>x.id),
      baselineCandidates(list,stack(type),modeOf,matches).map(x=>x.id));
  }
  assert.deepEqual(Array.from(orderedLocalSorterCandidates(list,stack("minecraft:cobblestone"),modeOf,matches),x=>x.id),
    ["f0","f2","a0","a1","w0","w1"]);
});
test("U1-B live destination probe is read-only and equivalent across loaded/unloaded kinds",async()=>{
  const {observeSorterDestination}=await load();
  const types=["hartsorter:collector","minecraft:chest","minecraft:barrel",
    "minecraft:shulker_box","minecraft:blue_shulker_box",
    "minecraft:air","minecraft:hopper",null];
  const offsets=[{x:1,y:0,z:0},{x:0,y:0,z:1},{x:-1,y:0,z:0},null];
  for(const kind of types)for(const off of offsets)for(const unavailable of [false,true]){
    let lookupCount=0;
    const block=kind?{typeId:kind,dimension:{id:"minecraft:overworld"},
      location:{x:2,y:65,z:3}}:undefined;
    const sorter={location:{x:1,y:65,z:3},dimension:{getBlock(){
      lookupCount++;
      if(unavailable)throw Error("chunk unloaded");
      return block;
    }}};
    const sorterAt=()=>sorter,offset=()=>off;
    const target=observeSorterDestination({},sorterAt,offset,"hartsorter:collector");
    let expected;
    if(off&&!unavailable&&block){
      const type=kind==="hartsorter:collector"?"collector":
        (kind==="minecraft:chest"||kind==="minecraft:barrel"||
        kind==="minecraft:shulker_box"||kind.endsWith("_shulker_box")?"storage":undefined);
      if(type)expected=type;
    }
    assert.equal(target?.kind,expected,"kind="+kind+" unavailable="+unavailable);
    assert.equal(target?.block,expected?block:undefined);
    assert.equal(lookupCount,off?1:0,"No world read without a facing direction");
  }
  assert.equal(observeSorterDestination({},()=>undefined,()=>({x:1,y:0,z:0}),"hartsorter:collector"),undefined);
});

test("U1-A is read-only, actually integrated, and leaves existing custody writers",()=>{
  const src=fs.readFileSync(MODULE,"utf8"),main=fs.readFileSync(MAIN,"utf8");
  assert.match(main,/from "\.\/urce_column_local_decisions\.js"/);
  assert.match(main,/proveLocalColumnTransit\(col\.sorters, src, sorterMode, matchesFilter\)/);
  assert.match(main,/prepareLocalColumnFrame\(\{/);
  assert.match(main,/const targets = frame\.targets/);
  assert.match(main,/observeSorterDestination\(entry, sorterAt, facingOffset, COLLECTOR_ID\)/);
  assert.match(src,/classifySorterDestinationType\(dest\.typeId, collectorId\)/);
  assert.match(main,/function destinationFor\(entry\)[\s\S]*?registerCollector\(dest\)/);
  assert.match(main,/function processColumn\(col, globalRemaining\)[\s\S]*?enqueueFromSource\(/);
  assert.match(main,/function processColumn\(col, globalRemaining\)[\s\S]*?safeMovePartial\(/);
  for(const forbidden of [/from\s*["']@minecraft\/server/,/setItem\s*\(/,
    /setDynamicProperty\s*\(/,/saveRegistry\s*\(/,/registerCollector\s*\(/,
    /loadReceiverQueue\s*\(/,/saveJournal\s*\(/,/saveQueueJournal\s*\(/,
    /system\.runInterval\s*\(/]){
    assert.doesNotMatch(src,forbidden);
  }
});
