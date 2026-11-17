/**
 * P4g code-only differential against the last green P4e source.
 * The fourth findAcceptSlot parameter is a write-only, call-local NEGATIVE
 * witness. Only full native inventory with no partial stack of the item type
 * can produce it; all admission decisions must match original 1.4.1.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const FILE="addon/behavior_pack/scripts/main.js";
const current=fs.readFileSync(path.join(ROOT,FILE),"utf8");
const before=execFileSync("git",["show",
  "5c974dd62696708dfa0d8ae35607cacfcdb17346:"+FILE],{
  cwd:ROOT,encoding:"utf8"
});
function extract(src,name,env={}){
  const at=src.indexOf("function "+name+"(");assert.ok(at>=0);
  const brace=src.indexOf("{",at);
  let depth=0,quote="",escaped=false,line=false,block=false;
  for(let i=brace;i<src.length;i++){
    const c=src[i],n=src[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;}
      if(c==="\\"){escaped=true;continue;}
      if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)
      return vm.runInNewContext(src.slice(at,i+1)+"\n"+name+";",env,
        {timeout:2500,filename:name});
  }
  throw Error("unclosed "+name);
}
const ench=s=>s.ench??[];
const prior=extract(before,"findAcceptSlot",{enchantments:ench});
const candidate=extract(current,"findAcceptSlot",{enchantments:ench});
const item=(typeId,amount=1,meta="",maxAmount=64,ench=[])=>({
  typeId,amount,meta,maxAmount,ench
});
const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function chest(initial,{forceFull=false,throwsCount=false,throwsTypeOnEmpty=false,
  throwingComparison=false,partialAmountBroken=false}={}){
  const slots=initial.map(copy),calls={getSlot:0,typeId:0,hasItem:0,compare:0};
  const api={
    get size(){return slots.length;},
    get emptySlotsCount(){
      if(throwsCount)throw Error("unavailable count");
      return forceFull?0:slots.filter(x=>x===undefined).length;
    },
    firstItem(){const i=slots.findIndex(Boolean);return i<0?undefined:i;},
    firstEmptySlot(){const i=slots.findIndex(x=>x===undefined);return i<0?undefined:i;},
    getSlot(i){
      calls.getSlot++;
      return {
        hasItem(){calls.hasItem++;return slots[i]!==undefined;},
        get typeId(){
          calls.typeId++;
          if(throwsTypeOnEmpty&&slots[i]===undefined)
            throw Error("invalid empty slot type");
          return slots[i]?.typeId;
        },
        get amount(){
          return partialAmountBroken&&slots[i]?.typeId==="minecraft:stone"
            ? undefined:slots[i]?.amount;
        },
        get maxAmount(){return slots[i]?.maxAmount;},
        getItem(){return copy(slots[i]);},
        isStackableWith(incoming){
          calls.compare++;
          if(throwingComparison)throw Error("native comparison failed");
          const s=slots[i];
          return Boolean(s&&s.typeId===incoming.typeId&&s.meta===incoming.meta
            &&s.maxAmount>1&&incoming.maxAmount>1);
        }
      };
    }
  };
  return {api,slots,calls};
}
function compare(values,incoming,auto=false,options={}){
  const a=chest(values,options),b=chest(values,options),proof={};
  const old=copy(prior(a.api,incoming,auto));
  const next=copy(candidate(b.api,incoming,auto,proof));
  assert.deepEqual(next,old,"P4g cannot change admission choice or metadata");
  assert.deepEqual(b.slots,a.slots,"P4g preflight must not mutate chest");
  return {old,next,proof,a,b};
}
test("P4g-01 full 54, no incoming type: certified rejection",()=>{
  const r=compare(Array.from({length:54},()=>item("minecraft:dirt",64)),
    item("minecraft:stone",5));
  assert.equal(r.next,undefined);
  assert.equal(r.proof.fullNoTypeCapacity,true);
  assert.equal(r.b.calls.getSlot,54);
});
test("P4g-02 full same type 64/64: certificate even across different incoming metadata",()=>{
  const r=compare(Array.from({length:54},()=>item("minecraft:stone",64,"named")),
    item("minecraft:stone",2,"unnamed"));
  assert.equal(r.proof.fullNoTypeCapacity,true);
  assert.equal(r.next,undefined);
});
test("P4g-03 full SAME type partial metadata mismatch: NO certificate",()=>{
  const a=Array.from({length:54},()=>item("minecraft:dirt",64));
  a[53]=item("minecraft:stone",16,"named");
  const r=compare(a,item("minecraft:stone",3,"plain"));
  assert.equal(r.next,undefined);
  assert.equal(r.proof.fullNoTypeCapacity,undefined);
  assert.equal(r.b.calls.compare,1);
});
test("P4g-04 full compatible partial ACCEPT, no certificate",()=>{
  const a=Array.from({length:54},()=>item("minecraft:dirt",64));
  a[53]=item("minecraft:stone",16,"named");
  const r=compare(a,item("minecraft:stone",3,"named"));
  assert.equal(r.next.slot,53);
  assert.equal(r.proof.fullNoTypeCapacity,undefined);
});
test("P4g-05 sparse target misses: no reusable rejection",()=>{
  const a=Array.from({length:54},()=>item("minecraft:dirt",64));
  a[3]=undefined;
  const r=compare(a,item("minecraft:stone",3),false);
  assert.equal(r.proof.fullNoTypeCapacity,undefined);
  assert.equal(r.next.slot,3);
});
test("P4g-06 AUTO full with nonmatching types: certified type-no-capacity",()=>{
  const r=compare(Array.from({length:27},()=>item("minecraft:dirt",64)),
    item("minecraft:stone",3),true);
  assert.equal(r.next,undefined);
  assert.equal(r.proof.fullNoTypeCapacity,true);
});
test("P4g-07 nonstackable AUTO full: no certificate or native slot scans",()=>{
  const r=compare(Array.from({length:54},()=>item("minecraft:enchanted_book",1,"",1)),
    item("minecraft:enchanted_book",1,"",1),true);
  assert.equal(r.next,undefined);
  assert.equal(r.proof.fullNoTypeCapacity,undefined);
  assert.equal(r.b.calls.getSlot,0);
});
test("P4g-08 contradicted occupancy count forces fallback, no certificate",()=>{
  const a=Array.from({length:27},()=>item("minecraft:dirt",64));
  a[7]=undefined;
  const r=compare(a,item("minecraft:stone",2),false,{forceFull:true});
  assert.equal(r.next.slot,7);
  assert.equal(r.proof.fullNoTypeCapacity,undefined);
});
test("P4g-09 throwing type getter on contradicted full count also no certificate",()=>{
  const a=Array.from({length:27},()=>item("minecraft:dirt",64));
  a[7]=undefined;
  const r=compare(a,item("minecraft:stone",2),false,
    {forceFull:true,throwsTypeOnEmpty:true});
  assert.equal(r.next.slot,7);
  assert.equal(r.proof.fullNoTypeCapacity,undefined);
});
test("P4g-10 unavailable count uses live scan but never certifies",()=>{
  const r=compare(Array.from({length:27},()=>item("minecraft:dirt",64)),
    item("minecraft:stone",2),false,{throwsCount:true});
  assert.equal(r.next,undefined);
  assert.equal(r.proof.fullNoTypeCapacity,undefined);
});
test("P4g-11 native partial comparison fails: no certificate",()=>{
  const a=Array.from({length:54},()=>item("minecraft:dirt",64));
  a[15]=item("minecraft:stone",12);
  const r=compare(a,item("minecraft:stone",1),false,{throwingComparison:true});
  assert.equal(r.next,undefined);
  assert.equal(r.proof.fullNoTypeCapacity,undefined);
});
test("P4g-12 suspect native amount never certifies a false rejection",()=>{
  const a=Array.from({length:27},()=>item("minecraft:stone",64));
  const r=compare(a,item("minecraft:stone",1),false,{partialAmountBroken:true});
  assert.equal(r.next,undefined);
  assert.equal(r.proof.fullNoTypeCapacity,undefined);
});
test("P4g-13 18,432 full/partial/sparse differential cases across 9/27/54 and AUTO/Filter",()=>{
  const choices=[
    undefined,item("minecraft:stone",64),
    item("minecraft:stone",12,"named"),item("minecraft:dirt",48)
  ];
  for(const n of [9,27,54]){
    for(let id=0;id<1024;id++){
      let v=id;
      const a=Array.from({length:n},()=>item("minecraft:granite",64));
      for(const i of [0,1,Math.floor(n/2),n-2,n-1]){
        a[i]=choices[v%4];v=Math.floor(v/4);
      }
      for(const incoming of [item("minecraft:stone",4),
          item("minecraft:dirt",2),item("minecraft:stone",3,"named")]){
        compare(a,incoming,false);
        compare(a,incoming,true);
      }
    }
  }
});
test("P4g-14 custody and observation cadence unchanged",()=>{
  assert.equal(
    extract(current,"safeMovePartial").toString().length>0,true);
  assert.match(current,/system\.runInterval\(schedulerTick,\s*1\)/);
  assert.match(current,/const rejectedFullTypes = new Map\(\)/);
  assert.match(current,/rejectedFullTypes\.clear\(\)/);
  assert.match(current,/findAcceptSlot\(dest\.container, stack, mode === "auto", proof\)/);
  assert.match(current,/const PER_COLUMN_BATCH = 16/);
  assert.match(current,/const GLOBAL_MOVE_BUDGET = 256/);
});
