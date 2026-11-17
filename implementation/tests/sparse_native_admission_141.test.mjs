/**
 * P4: real engine-source native sparse-inventory optimization.
 * Compare against frozen deployed P3 function for exact admission semantics,
 * under direct in-memory Native-shaped Container and ContainerSlot models.
 * These tests prove source logic, not BDS performance.
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
const current=fs.readFileSync(path.join(ROOT,FILE),"utf8");
const before=execFileSync("git",["show",
  "f564b8777d698445450ee7d314039a756f967a82:"+FILE],{cwd:ROOT,encoding:"utf8"});

function getFunction(source,name,env={}) {
  const at=source.indexOf("function "+name+"(");
  assert.ok(at>=0,"missing "+name);
  const brace=source.indexOf("{",at);
  let depth=0,quote="",escaped=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;}if(c==="\\"){escaped=true;continue;}
      if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c==="\x60"){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0){
      return vm.runInNewContext(source.slice(at,i+1)+"\n"+name+";",env,{timeout:2500});
    }
  }
  throw Error("missing close: "+name);
}
const ench=s=>s.ench??[];
const p3=getFunction(before,"findAcceptSlot",{enchantments:ench});
const p4=getFunction(current,"findAcceptSlot",{enchantments:ench});
const item=(typeId,amount=1,meta="",maxAmount=64,enh=[])=>({
  typeId,amount,meta,maxAmount,ench:enh
});
function native(slots,{throwOccupancy=false,wrongFirst=false}={}){
  const calls={size:0,emptyCount:0,first:0,firstEmpty:0,slots:0,has:0,reads:0,compare:0};
  const container={
    isValid:true,
    get size(){calls.size++;return slots.length;},
    get emptySlotsCount(){calls.emptyCount++;if(throwOccupancy)throw Error("unavailable");
      return slots.filter(x=>!x).length;},
    firstItem(){calls.first++;if(wrongFirst)return slots.length+1;
      const i=slots.findIndex(Boolean);return i<0?undefined:i;},
    firstEmptySlot(){calls.firstEmpty++;const i=slots.findIndex(x=>!x);
      return i<0?undefined:i;},
    getSlot(i){calls.slots++;return {
      hasItem(){calls.has++;return !!slots[i];},
      get typeId(){return slots[i]?.typeId;},
      get amount(){return slots[i]?.amount;},
      get maxAmount(){return slots[i]?.maxAmount;},
      getItem(){calls.reads++;return slots[i]&&{...slots[i]};},
      isStackableWith(stack){calls.compare++;
        const cur=slots[i];return cur.typeId===stack.typeId&&cur.meta===stack.meta&&cur.maxAmount>1;}
    };}
  };
  return {container,slots,calls};
}
function same(positions,stack,auto=false,opts={}){
  const old=native(positions.map(x=>x&&{...x}),opts);
  const now=native(positions.map(x=>x&&{...x}),opts);
  const baseline=p3(old.container,stack,auto);
  const candidate=p4(now.container,stack,auto);
  assert.deepEqual(JSON.parse(JSON.stringify(candidate??null)),
    JSON.parse(JSON.stringify(baseline??null)));
  return {old,now,candidate};
}
test("P4-01 empty wildcard chest native occupancy: no per-slot reads",()=>{
  const r=same(Array(54).fill(undefined),item("minecraft:stone"));
  assert.equal(r.candidate.slot,0);
  assert.equal(r.old.calls.slots,54);assert.equal(r.now.calls.slots,0);
  assert.equal(r.now.calls.emptyCount,1);assert.equal(r.now.calls.first,0);
});
test("P4-02 empty AUTO chest remains ineligible and read-free",()=>{
  const r=same(Array(27).fill(undefined),item("minecraft:feather"),true);
  assert.equal(r.candidate,undefined);assert.equal(r.now.calls.slots,0);
});
test("P4-03 one matching partial AFTER an early empty: compatible before empty",()=>{
  const slots=Array(54).fill(undefined);slots[53]=item("minecraft:feather",24);
  const r=same(slots,item("minecraft:feather",2),true);
  assert.equal(r.candidate.slot,53);assert.equal(r.candidate.room,40);
  assert.equal(r.old.calls.slots,54);assert.equal(r.now.calls.slots,1);
  assert.equal(r.now.calls.compare,1);
});
test("P4-04 one wrong-type AUTO seed: reject before any empty admission",()=>{
  const slots=Array(54).fill(undefined);slots[53]=item("minecraft:dirt",4);
  const r=same(slots,item("minecraft:feather"),true);
  assert.equal(r.candidate,undefined);assert.equal(r.now.calls.slots,1);
});
test("P4-05 one full matching AUTO seed: choose first empty",()=>{
  const slots=Array(54).fill(undefined);slots[53]=item("minecraft:feather",64);
  const r=same(slots,item("minecraft:feather"),true);
  assert.equal(r.candidate.slot,0);assert.equal(r.now.calls.slots,1);
});
test("P4-06 one metadata-incompatible AUTO seed: never merge",()=>{
  const slots=Array(54).fill(undefined);slots[53]=item("minecraft:feather",12,"named");
  const r=same(slots,item("minecraft:feather",3,"plain"),true);
  assert.equal(r.candidate.slot,0);assert.equal(r.candidate.before,0);
  assert.equal(r.now.calls.compare,1);assert.equal(r.now.calls.slots,1);
});
test("P4-07 one AUTO enchanted-book seed: compare type-set, not level",()=>{
  const slots=Array(27).fill(undefined);
  slots[26]=item("minecraft:enchanted_book",1,"",1,[{id:"mending",level:1}]);
  let r=same(slots,item("minecraft:enchanted_book",1,"",1,[{id:"mending",level:3}]),true);
  assert.equal(r.candidate.slot,0);assert.equal(r.now.calls.slots,1);
  assert.equal(r.now.calls.reads,1);
  r=same(slots,item("minecraft:enchanted_book",1,"",1,[{id:"fortune",level:1}]),true);
  assert.equal(r.candidate,undefined);
});
test("P4-08 last seed removal affects next live AUTO decision",()=>{
  const slots=Array(27).fill(undefined);slots[26]=item("minecraft:feather",12);
  const v=native(slots);
  assert.equal(p4(v.container,item("minecraft:feather"),true).slot,26);
  slots[26]=undefined;
  assert.equal(p4(v.container,item("minecraft:feather"),true),undefined);
  assert.equal(v.calls.emptyCount,2);
});
test("P4-09 one occupied nonstackable uses native first-empty safely",()=>{
  const slots=Array(27).fill(undefined);slots[26]=item("minecraft:diamond_sword",1,"named",1);
  const r=same(slots,item("minecraft:diamond_sword",1,"different",1),true);
  assert.equal(r.candidate.slot,0);assert.equal(r.now.calls.compare,0);
});
test("P4-10 dense target stays on original full-slot scan",()=>{
  const slots=Array(54).fill(undefined);slots[0]=item("minecraft:stone",64);
  slots[53]=item("minecraft:feather",55);
  const r=same(slots,item("minecraft:feather",1),true);
  assert.equal(r.candidate.slot,53);
  assert.equal(r.now.calls.slots,54);
});
test("P4-11 inconsistent native firstItem falls back to full live scan",()=>{
  const slots=Array(27).fill(undefined);slots[26]=item("minecraft:feather",5);
  const r=same(slots,item("minecraft:feather",2),true,{wrongFirst:true});
  assert.equal(r.candidate.slot,26);assert.equal(r.now.calls.slots,27);
});
test("P4-12 throwing occupancy property falls back to original scan",()=>{
  const slots=Array(27).fill(undefined);slots[26]=item("minecraft:feather",5);
  const r=same(slots,item("minecraft:feather",2),true,{throwOccupancy:true});
  assert.equal(r.candidate.slot,26);assert.equal(r.now.calls.slots,27);
});
test("P4-13 differential many sparse layouts and seed/metadata combinations",()=>{
  const types=["minecraft:feather","minecraft:stone","minecraft:egg","minecraft:enchanted_book"];
  for(let size of [9,27,54])for(let target of [0,size-1])for(let type of types)
  for(let incoming of types)for(let auto of [false,true])for(let occupied of [0,1]){
    const slots=Array(size).fill(undefined);
    if(occupied)slots[target]=item(type,type==="minecraft:enchanted_book"?1:13,
      "",type==="minecraft:enchanted_book"?1:64,[]);
    const stack=item(incoming,1,"",incoming==="minecraft:enchanted_book"?1:64,[]);
    same(slots,stack,auto);
  }
});
