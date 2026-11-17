/**
 * P4b source-executed native compaction equivalence vs verified P4.
 * Ensures the packed prefix can be skipped with Container.firstEmptySlot()
 * without changing ordering, exact item objects or mutations.
 * Source-only; not evidence of BDS/TPS performance.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const PATH="addon/behavior_pack/scripts/main.js";
const candidate=fs.readFileSync(path.join(ROOT,PATH),"utf8");
const deployed=execFileSync("git",["show","d3dc28aa4c9ffbbf5861aa35af6f001e131ec773:"+PATH],{cwd:ROOT,encoding:"utf8"});

function extract(js,name) {
  const start=js.indexOf("function "+name+"(");
  assert.ok(start>=0);
  const begin=js.indexOf("{",start);
  let depth=0,line=false,block=false,quote="",escaped=false;
  for(let i=begin;i<js.length;i++){
    const c=js[i],n=js[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;}if(c==="\\"){escaped=true;continue;}
      if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c==="\x60"){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)
      return vm.runInNewContext(js.slice(start,i+1)+"\n"+name+";",{}, {timeout:3000});
  }
  throw Error("Source function not closed");
}
const old=extract(deployed,"compactSourceHopper");
const now=extract(candidate,"compactSourceHopper");
function model(values) {
  const slots=values.map(v=>v?structuredClone(v):undefined);
  const log={reads:0,writes:0,firstEmpty:0,size:0};
  return {slots,log,container:{
    get size(){log.size++;return slots.length;},
    firstEmptySlot(){log.firstEmpty++;const idx=slots.findIndex(v=>v===undefined);
      return idx<0?undefined:idx;},
    getItem(i){log.reads++;return slots[i]?structuredClone(slots[i]):undefined;},
    setItem(i,item){log.writes++;slots[i]=item?structuredClone(item):undefined;}
  }};
}
function compare(values) {
  const a=model(values),b=model(values);
  old(a.container);now(b.container);
  assert.deepEqual(b.slots,a.slots,"Inventory order/metadata must match");
  return {a,b};
}
const block=(type,slot)=>({typeId:type,amount:slot+1,maxAmount:64,
  nameTag:"item-"+slot,lore:["unique-"+slot],dur:slot*2});
test("HOPPER-01 full five-slot Hopper never clones or mutates",()=>{
  const r=compare(Array.from({length:5},(_,i)=>block("stone",i)));
  assert.equal(r.a.log.reads,5);assert.equal(r.b.log.reads,0);
  assert.equal(r.b.log.writes,0);assert.equal(r.b.log.firstEmpty,1);
});
test("HOPPER-02 packed prefix and trailing gap avoid reading prefix",()=>{
  const r=compare([block("stone",0),block("dirt",1),block("feather",2),undefined,undefined]);
  assert.equal(r.a.log.reads,5);assert.equal(r.b.log.reads,1);
  assert.equal(r.b.log.writes,0);
});
test("HOPPER-03 interior gap moves metadata-rich stacks exactly",()=>{
  const r=compare([block("stone",0),undefined,block("dirt",2),block("feather",3),undefined]);
  assert.equal(r.b.log.reads,3);
  assert.equal(r.b.log.writes,4);
  assert.equal(r.b.slots[1].nameTag,"item-2");
  assert.equal(r.b.slots[2].nameTag,"item-3");
});
test("HOPPER-04 empty Hopper needs no item reads",()=>{
  const r=compare(Array(5).fill(undefined));
  assert.equal(r.b.log.reads,4);
  assert.equal(r.b.log.writes,0);
});
test("HOPPER-05 exhaustive 5-slot metadata order differential",()=>{
  const choices=[null,"stone","dirt","custom"];
  for(let n=0;n<Math.pow(choices.length,5);n++) {
    let k=n,slots=[];
    for(let i=0;i<5;i++){const choice=choices[k%choices.length];k=Math.floor(k/choices.length);
      slots.push(choice?block(choice,i):undefined);}
    compare(slots);
  }
});
