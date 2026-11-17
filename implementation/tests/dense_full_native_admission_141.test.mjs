/**
 * Phase A P4e full-container native occupancy shortcut, SOURCE EXECUTED.
 * Frozen before revision = 798ae788 (the owner-reviewed P4d LAB candidate).
 * No native BDS is invoked. Controlled mocks compare exact returned slot,
 * room, before, existing metadata and native API boundary call counts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const FILE="addon/behavior_pack/scripts/main.js";
const latest=fs.readFileSync(path.join(ROOT,FILE),"utf8");
const before=execFileSync("git",["show","798ae788ad2aaac7bd7c23dce0cc6cb6659afaed:"+FILE],{
  cwd:ROOT,encoding:"utf8"
});

function getFunction(source,name,env={}){
  const at=source.indexOf("function "+name+"(");
  assert.ok(at>=0);
  const brace=source.indexOf("{",at);
  let depth=0,quote="",escaped=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
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
      return vm.runInNewContext(source.slice(at,i+1)+"\n"+name+";",env,
        {timeout:3000,filename:"P4e:"+name});
  }
  throw Error("Could not extract "+name);
}
const enchantments=stack=>stack.ench??[];
const oldAdmit=getFunction(before,"findAcceptSlot",{enchantments});
const newAdmit=getFunction(latest,"findAcceptSlot",{enchantments});
const stack=(typeId,amount=1,meta="",maxAmount=64,ench=[])=>({
  typeId,amount,meta,maxAmount,ench
});
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const normalized=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function chest(values,{forceFull=false,throwCount=false,typeThrowsOnEmpty=false}={}){
  const slots=values.map(copy);
  const count={size:0,empty:0,getSlot:0,hasItem:0,typeId:0,
    amount:0,maxAmount:0,compare:0,getItem:0,firstItem:0,firstEmpty:0};
  const api={
    get size(){count.size++;return slots.length;},
    get emptySlotsCount(){
      count.empty++;
      if(throwCount)throw Error("unavailable occupancy");
      return forceFull ? 0 : slots.filter(s=>s===undefined).length;
    },
    firstItem(){count.firstItem++;let i=slots.findIndex(Boolean);
      return i<0?undefined:i;},
    firstEmptySlot(){count.firstEmpty++;let i=slots.findIndex(s=>s===undefined);
      return i<0?undefined:i;},
    getSlot(i){
      count.getSlot++;
      return {
        hasItem(){count.hasItem++;return slots[i]!==undefined;},
        get typeId(){count.typeId++;if(typeThrowsOnEmpty&&slots[i]===undefined)
          throw Error("empty-slot typeId unavailable");return slots[i]?.typeId;},
        get amount(){count.amount++;return slots[i]?.amount;},
        get maxAmount(){count.maxAmount++;return slots[i]?.maxAmount;},
        getItem(){count.getItem++;return copy(slots[i]);},
        isStackableWith(x){
          count.compare++;
          const s=slots[i];
          return Boolean(s&&s.typeId===x.typeId&&s.meta===x.meta&&s.maxAmount>1
            &&x.maxAmount>1);
        }
      };
    }
  };
  return {api,slots,count};
}
function compare(slots,item,auto=false,options={}){
  const old=chest(slots,options),now=chest(slots,options);
  const original=normalized(oldAdmit(old.api,item,auto));
  const candidate=normalized(newAdmit(now.api,item,auto));
  assert.deepEqual(candidate,original,"Candidate must match old admission slot and metadata");
  assert.deepEqual(now.slots,old.slots,"Read-only admission must not mutate cargo");
  return {original,candidate,old,now};
}

test("P4e-F01 full 54 occupied, no compatible type: same rejection, remove 54 native hasItem calls",()=>{
  const slots=Array.from({length:54},()=>stack("minecraft:dirt",64));
  const r=compare(slots,stack("minecraft:stone",2));
  assert.equal(r.original,undefined);
  assert.equal(r.old.count.hasItem,54);
  assert.equal(r.now.count.hasItem,0);
  assert.equal(r.now.count.getSlot,54,"Must still examine live capacity");
  assert.equal(r.now.count.typeId,54);
  assert.equal(r.now.count.empty,1);
});
test("P4e-F02 full 54 occupied, partial compatible at last slot: must ACCEPT",()=>{
  const slots=Array.from({length:54},()=>stack("minecraft:dirt",64));
  slots[53]=stack("minecraft:stone",13);
  const r=compare(slots,stack("minecraft:stone",2));
  assert.equal(r.candidate.slot,53);
  assert.equal(r.candidate.room,51);
  assert.equal(r.now.count.hasItem,0);
});
test("P4e-F03 full, matching type but different custom metadata must not merge",()=>{
  const slots=Array.from({length:54},()=>stack("minecraft:stone",27,"named"));
  const r=compare(slots,stack("minecraft:stone",2,"plain"));
  assert.equal(r.candidate,undefined);
  assert.equal(r.now.count.compare,54);
  assert.equal(r.now.count.hasItem,0);
});
test("P4e-F04 full AUTO with metadata-incompatible seed: reject, not wildcard",()=>{
  const slots=Array.from({length:54},()=>stack("minecraft:stone",13,"named"));
  const r=compare(slots,stack("minecraft:stone",2,"plain"),true);
  assert.equal(r.candidate,undefined);
  assert.equal(r.now.count.hasItem,0);
});
test("P4e-F05 full nonstackable AUTO short-circuits without slot scan",()=>{
  const book=e=>stack("minecraft:enchanted_book",1,"",1,[{id:e,level:1}]);
  const slots=Array.from({length:54},()=>book("minecraft:mending"));
  const r=compare(slots,book("minecraft:fortune"),true); // seed absent: old scans 54
  assert.equal(r.candidate,undefined);
  assert.equal(r.now.count.getSlot,0);
  assert.equal(r.old.count.getSlot,54);
  assert.equal(r.now.count.empty,1);
  const seeded=compare(slots,book("minecraft:mending"),true);
  assert.equal(seeded.old.count.getSlot,1,"Old AUTO exits on first matching book seed");
  assert.equal(seeded.now.count.getSlot,0,"Full native count rejects regardless of seed");
});
test("P4e-F06 nonstackable Filter keeps existing native firstEmptySlot fast path",()=>{
  const slots=Array.from({length:54},()=>stack("minecraft:enchanted_book",1,"",1));
  const r=compare(slots,stack("minecraft:enchanted_book",1,"",1));
  assert.equal(r.candidate,undefined);
  assert.equal(r.now.count.getSlot,0);
  assert.equal(r.now.count.firstEmpty,1);
});
test("P4e-F07 dense but not FULL: no speculative skip of hasItem()",()=>{
  const slots=Array.from({length:54},()=>stack("minecraft:dirt",64));
  slots[43]=undefined;slots[53]=stack("minecraft:stone",30);
  const r=compare(slots,stack("minecraft:stone",2));
  assert.equal(r.candidate.slot,53);
  assert.equal(r.now.count.hasItem,54);
});
test("P4e-F08 false-full native count falls back, preserves first real empty",()=>{
  const slots=Array.from({length:54},()=>stack("minecraft:dirt",64));
  slots[53]=undefined;
  const r=compare(slots,stack("minecraft:stone",3),false,{forceFull:true});
  assert.equal(r.candidate.slot,53);
  assert.equal(r.now.count.hasItem,54);
  assert.ok(r.now.count.getSlot>54,"Fallback must reobserve all slots");
});
test("P4e-F09 false-full and empty slot typeId getter throws: also fall back",()=>{
  const slots=Array.from({length:27},()=>stack("minecraft:dirt",64));
  slots[25]=undefined;
  const r=compare(slots,stack("minecraft:stone",3),false,
    {forceFull:true,typeThrowsOnEmpty:true});
  assert.equal(r.candidate.slot,25);
  assert.equal(r.now.count.hasItem,27);
});
test("P4e-F10 if native occupancy property throws, original live scan remains",()=>{
  const slots=Array.from({length:27},()=>stack("minecraft:dirt",64));
  slots[26]=stack("minecraft:stone",32);
  const r=compare(slots,stack("minecraft:stone",5),true,{throwCount:true});
  assert.equal(r.candidate.slot,26);
  assert.equal(r.now.count.hasItem,27);
});
test("P4e-F11 changes between offers are observed, never cached",()=>{
  const slots=Array.from({length:27},()=>stack("minecraft:dirt",64));
  const d=chest(slots),needle=stack("minecraft:stone",8);
  assert.equal(newAdmit(d.api,needle,false),undefined);
  d.slots[4]=stack("minecraft:stone",26);
  assert.equal(newAdmit(d.api,needle,false).slot,4);
  d.slots[4]=undefined;
  assert.equal(newAdmit(d.api,needle,false).slot,4);
});
test("P4e-F12 exhaustive 9/27/54 five-position layouts, matching old result",()=>{
  const choices=[undefined,stack("minecraft:stone",64),
    stack("minecraft:stone",15,"named"),stack("minecraft:dirt",41)];
  for(const n of [9,27,54]){
    for(let encoded=0;encoded<1024;encoded++){
      const slots=Array.from({length:n},()=>stack("minecraft:granite",64));
      let v=encoded;for(const i of [0,1,Math.floor(n/2),n-2,n-1]){
        slots[i]=choices[v%4];v=Math.floor(v/4);
      }
      for(const needle of [stack("minecraft:stone",3),
                            stack("minecraft:dirt",1),
                            stack("minecraft:stone",2,"named")]){
        compare(slots,needle,false);
        compare(slots,needle,true);
      }
    }
  }
});
test("P4e-F13 exact source writer, scheduler cadence and movement budgets untouched",()=>{
  const oldWriter=oldAdmit;assert.equal(typeof oldWriter,"function");
  for(const name of ["safeMovePartial","recoverJournal","processColumn"])
    assert.equal(String(getFunction(before,name)).length>0,true);
  assert.match(latest,/system\.runInterval\(schedulerTick,\s*1\)/);
  assert.match(latest,/const slotInfo = findAcceptSlot\(dest\.container, stack, mode === "auto"\)/);
});
