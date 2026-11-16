/**
 * 1.4.1-only source differential tests for the native-first engine.
 * Read original source via git show at the pinned immutable commit, never 1.5.
 * These controlled JS container models do not establish Bedrock runtime behavior.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC="addon/behavior_pack/scripts/main.js";
const CANON="0ea3000651c116b0fa1acc2836ab7e1bcfbc6269";
const baseline=execFileSync("git",["show",CANON+":"+SRC],{cwd:ROOT,encoding:"utf8"});
const candidate=fs.readFileSync(path.join(ROOT,SRC),"utf8");
assert.notEqual(baseline,candidate,"Candidate must differ from pinned original 1.4.1 source");

function extract(text,name){
  const decl=new RegExp("(^|\\n)[ \\t]*(?:async\\s+)?function\\s+"+name+"\\s*\\(","g").exec(text);
  assert.ok(decl,"Missing "+name);
  const start=text.indexOf("function "+name,decl.index),begin=text.indexOf("{",start);
  let depth=0,quote="",esc=false,line=false,block=false;
  for(let i=begin;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(esc){esc=false;continue;}if(c==="\\"){esc=true;continue;}if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c==="\x60"){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)return text.slice(start,i+1);
  }
  throw Error("Unbalanced source function "+name);
}
function evaluate(code,name,env){
  return vm.runInNewContext(code+"\n"+name+";",env,{filename:name,timeout:2500});
}
const srcBody={
  baseline:{processColumn:extract(baseline,"processColumn"),
    processCollectorIngress:extract(baseline,"processCollectorIngress"),
    compactSourceHopper:extract(baseline,"compactSourceHopper")},
  candidate:{processColumn:extract(candidate,"processColumn"),
    processCollectorIngress:extract(candidate,"processCollectorIngress"),
    compactSourceHopper:extract(candidate,"compactSourceHopper")}
};
const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const stack=(id,amount)=>({typeId:id,amount,maxAmount:64});
function random(seed){
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
function container(items){
  const slots=items.map(copy);
  return {
    isValid:true,get size(){return slots.length;},
    firstItem(){const i=slots.findIndex(x=>x!==undefined);return i<0?undefined:i;},
    getItem(i){return copy(slots[i]);},
    setItem(i,value){slots[i]=copy(value);},
    snapshot(){return copy(slots.map(x=>x??null));}
  };
}
function acceptSlot(dest,item){
  let empty;
  for(let i=0;i<dest.size;i++){
    const other=dest.getItem(i);
    if(!other){if(empty===undefined)empty=i;continue;}
    if(other.typeId===item.typeId && other.amount<64)
      return {slot:i,before:other.amount,room:64-other.amount};
  }
  return empty===undefined?undefined:{slot:empty,before:0,room:64};
}
function transfer(source,from,dest,slotInfo,want){
  const cargo=source.getItem(from);
  if(!cargo)return 0;
  const amount=Math.min(want,cargo.amount,slotInfo.room);
  if(amount<=0)return 0;
  const inDest=dest.getItem(slotInfo.slot);
  dest.setItem(slotInfo.slot,stack(cargo.typeId,(inDest?.amount??0)+amount));
  if(cargo.amount===amount)source.setItem(from,undefined);
  else source.setItem(from,stack(cargo.typeId,cargo.amount-amount));
  return amount;
}
const ids=["minecraft:stone","minecraft:dirt","minecraft:oak_log","minecraft:cobblestone"];
const modes=["filter","auto","wildcard","bypass"];
function sorterScenario(seed){
  const rnd=random(seed);
  const slots=Array.from({length:5},()=>rnd()<.5?undefined:stack(ids[Math.floor(rnd()*ids.length)],1+Math.floor(rnd()*36)));
  const sorters=Array.from({length:1+Math.floor(rnd()*4)},(_,i)=>({
    id:"s"+i,m:modes[Math.floor(rnd()*modes.length)],powered:rnd()<.12,
    f:{typeId:"minecraft:stone"}
  }));
  const destinations={};
  for(const e of sorters)destinations[e.id]=[undefined,undefined,
    rnd()<.3?stack("minecraft:stone",60):undefined];
  return {slots,sorters,destinations,locked:rnd()<.08};
}
function runSorter(version,scenario){
  const input=container(scenario.slots);
  const to=Object.fromEntries(Object.entries(scenario.destinations).map(([k,v])=>[k,container(v)]));
  const hopper={typeId:"minecraft:hopper",getComponent:()=>({container:input})};
  const env={
    PER_COLUMN_BATCH:16,getDimension:()=>({getBlock:()=>hopper}),
    hopperIsRedstoneLocked:()=>scenario.locked,
    sorterAt:e=>({powered:e.powered}),
    blockIsRedstonePowered:b=>b.powered,
    sorterMode:e=>e.m,
    matchesFilter:(s,f)=>s.typeId===f.typeId,
    // Both original and optimized AUTO decisions use the actual live
    // destination seed. The candidate resolves that seed together with slot
    // admission; the original checks seed separately before slot admission.
    autoSorterMatches:(s,e)=>to[e.id].snapshot().some(x=>x?.typeId===s.typeId),
    compactSourceHopper:evaluate(srcBody[version].compactSourceHopper,"compactSourceHopper",{}),
    destinationFor:e=>({kind:"storage",container:to[e.id],block:{id:e.id}}),
    findAcceptSlot:(dst,item,requireAutoSeed=false)=>{
      if(requireAutoSeed && !dst.snapshot().some(x=>x?.typeId===item.typeId)) return undefined;
      return acceptSlot(dst,item);
    },
    safeMovePartial:(src,_source,slot,dest,_block,slotInfo,want)=>transfer(src,slot,dest,slotInfo,want),
    log:()=>{}
  };
  const fn=evaluate(srcBody[version].processColumn,"processColumn",env);
  const used=fn({d:"overworld",source:{x:0,y:65,z:0},sorters:scenario.sorters},256);
  return {used,input:input.snapshot(),destinations:Object.fromEntries(Object.entries(to).map(([k,v])=>[k,v.snapshot()]))};
}
test("DIFF-01 192 physical Sorter scenarios retain original outputs and inventory states",()=>{
  for(let i=1;i<=192;i++){
    const scenario=sorterScenario((i*1103515245)>>>0);
    const old=runSorter("baseline",scenario),next=runSorter("candidate",scenario);
    assert.deepEqual(next,old,"Sorter scenario "+i+" must preserve original item state");
  }
});
function collectorScenario(seed){
  const rand=random(seed);
  const slots=Array.from({length:5},()=>rand()<.55?undefined:stack(rand()<.65?"minecraft:stone":"custom:opaque",1+Math.floor(rand()*8)));
  return{slots,locked:rand()<.15,collectorPowered:rand()<.15,
    receiverPowered:rand()<.15,outputLocked:rand()<.15,
    queue:rand()<.3?12:0,hasLink:rand()>=.1};
}
function runCollector(version,scenario){
  const input=container(scenario.slots);
  const output=container([undefined,undefined]);
  let queued=scenario.queue,moved=0;
  const collector={id:"C",link:scenario.hasLink?"R":undefined,accepted:0};
  const receiver={id:"R",queued,received:0,delivered:0};
  const env={
    COLLECTOR_BATCH:16,QUEUE_CAPACITY:250000,
    collectorAt:()=>({powered:scenario.collectorPowered}),
    blockIsRedstonePowered:b=>Boolean(b?.powered),
    findReceiverById:()=>receiver,
    collectorInputSources:()=>[{kind:"hopper",locked:scenario.locked,
      container:input,block:{typeId:"minecraft:hopper"}}],
    serializeQueueItem:s=>s?.typeId.startsWith("minecraft:")?{typeId:s.typeId}:undefined,
    loadReceiverQueue:()=>({total:queued}),
    enqueueFromSource:(_recv,_coll,src,slot,want)=>{
      const item=src.container.getItem(slot);if(!item)return 0;
      const n=Math.min(want,item.amount);queued+=n;
      src.container.setItem(slot,item.amount===n?undefined:stack(item.typeId,item.amount-n));moved+=n;return n;},
    receiverAt:()=>({powered:scenario.receiverPowered}),
    receiverOutputHopper:()=>({locked:scenario.outputLocked,container:output,block:{}}),
    findAcceptSlot:acceptSlot,
    safeMovePartial:(src,_block,slot,dest,_dest,slotInfo,want)=>{
      const n=transfer(src,slot,dest,slotInfo,want);moved+=n;return n;},
    recordDirectReceiverTransfer:()=>{},
    markLogisticsDirty:()=>{},
    queueRejectSeen:new Set(),
    log:()=>{}
  };
  const fn=evaluate(srcBody[version].processCollectorIngress,"processCollectorIngress",env);
  const used=fn(collector,256);
  return {used,moved,queued,input:input.snapshot(),output:output.snapshot(),accepted:collector.accepted};
}
test("DIFF-02 96 Collector states retain baseline custody and physical outcomes",()=>{
  for(let i=1;i<=96;i++){
    const scenario=collectorScenario((i*2654435761)>>>0);
    const old=runCollector("baseline",scenario),next=runCollector("candidate",scenario);
    assert.deepEqual(next,old,"Collector scenario "+i+" must preserve known-queue result");
  }
});
