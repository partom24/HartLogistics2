/**
 * Phase A P4g SOURCE-ONLY duplicate-negative-admission exploration.
 * Executes current 1.4.1 processColumn, compactSourceHopper, and findAcceptSlot
 * from the actual candidate source. Counterfactual in-callback rejection reuse
 * is a standalone wrapper NOT installed in gameplay.
 *
 * No BDS performance claim. A synthetic repeated-offer example does not tell
 * us how often owner-world Sorters actually repeat identical rejects.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const JS=fs.readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");

function source(name,env={}){
  const at=JS.indexOf("function "+name+"(");
  assert.ok(at>=0,"missing actual engine function "+name);
  const brace=JS.indexOf("{",at);
  let depth=0,quote="",escaped=false,line=false,block=false;
  for(let i=brace;i<JS.length;i++){
    const c=JS[i],n=JS[i+1];
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
      return vm.runInNewContext(JS.slice(at,i+1)+"\n"+name+";",env,
        {timeout:3000,filename:"source:"+name});
  }
  throw Error("unbalanced "+name);
}
const ench=s=>s.ench??[];
const find=source("findAcceptSlot",{enchantments:ench});
const compact=source("compactSourceHopper");
function item(typeId,amount=1,meta=""){
  return {
    typeId,amount,meta,maxAmount:64,
    isStackableWith(x){return x?.typeId===this.typeId&&x?.meta===this.meta&&x.maxAmount>1;}
  };
}
const clone=x=>x===undefined?undefined:item(x.typeId,x.amount,x.meta);
function nativeDestination(initial){
  const slots=initial.map(clone);
  const calls={getSlot:0,hasItem:0,typeId:0,compare:0};
  const container={
    isValid:true,
    get size(){return slots.length;},
    get emptySlotsCount(){return slots.filter(x=>x===undefined).length;},
    firstItem(){let i=slots.findIndex(Boolean);return i<0?undefined:i;},
    firstEmptySlot(){let i=slots.findIndex(x=>x===undefined);return i<0?undefined:i;},
    getItem(i){return clone(slots[i]);},
    setItem(i,v){slots[i]=clone(v);},
    getSlot(i){
      calls.getSlot++;
      return {
        hasItem(){calls.hasItem++;return slots[i]!==undefined;},
        get typeId(){calls.typeId++;return slots[i]?.typeId;},
        get amount(){return slots[i]?.amount;},
        get maxAmount(){return slots[i]?.maxAmount;},
        getItem(){return clone(slots[i]);},
        isStackableWith(s){calls.compare++;return slots[i]?.isStackableWith(s)??false;}
      };
    }
  };
  return {slots,calls,container};
}
function inputHopper(initial){
  const slots=initial.map(clone);
  return {
    slots,
    container:{
      isValid:true,
      get size(){return slots.length;},
      firstItem(){const i=slots.findIndex(Boolean);return i<0?undefined:i;},
      firstEmptySlot(){const i=slots.findIndex(x=>x===undefined);return i<0?undefined:i;},
      getItem(i){return clone(slots[i]);},
      setItem(i,x){slots[i]=clone(x);}
    }
  };
}
function run(initialSource,initialDest,{memo=false}={}){
  const src=inputHopper(initialSource);
  const dest=nativeDestination(initialDest);
  const stats={offers:0,reused:0,moved:0};
  const negatives=new Map(); // exists only inside this modeled invocation
  function candidate(container,stack,auto){
    stats.offers++;
    const prev=negatives.get(container);
    if(memo&&prev&&prev.auto===auto&&prev.stack.isStackableWith(stack)){
      stats.reused++;return undefined;
    }
    const result=find(container,stack,auto);
    if(memo){
      if(result)negatives.delete(container);
      else negatives.set(container,{stack,auto});
    }
    return result;
  }
  const block={typeId:"minecraft:hopper",
    getComponent:()=>({container:src.container})};
  const env={
    getDimension:()=>({getBlock:()=>block}),
    hopperIsRedstoneLocked:()=>false,
    sorterAt:()=>({}),blockIsRedstonePowered:()=>false,
    sorterMode:s=>s.mode,
    matchesFilter:(s,f)=>s.typeId===f.typeId,
    compactSourceHopper:compact,
    destinationFor:()=>({kind:"storage",container:dest.container,block:{}}),
    findAcceptSlot:candidate,
    safeMovePartial:(source,_sourceBlock,srcSlot,target,_destBlock,info,want)=>{
      const incoming=source.getItem(srcSlot),old=target.getItem(info.slot);
      const move=Math.min(want,incoming.amount,info.room);
      target.setItem(info.slot,item(incoming.typeId,(old?.amount??0)+move,incoming.meta));
      source.setItem(srcSlot,incoming.amount===move?undefined:
        item(incoming.typeId,incoming.amount-move,incoming.meta));
      stats.moved+=move;
      negatives.clear(); // hypothetical: invalidate on Hart-controlled writes
      return move;
    },
    sorterCollectorRoute:()=>{throw Error("not in test scope");},
    enqueueFromSource:()=>{throw Error("not in test scope");},
    PER_COLUMN_BATCH:16,
    log:()=>{}
  };
  const process=source("processColumn",env);
  const moved=process({d:"overworld",x:0,z:0,source:{x:0,y:70,z:0},
    sorters:[{id:"single-filter",mode:"filter",f:{typeId:"minecraft:stone"}}]},256);
  return {src,dest,stats,moved};
}
function state(r){
  return {
    source:r.src.slots.map(x=>x?{typeId:x.typeId,amount:x.amount,meta:x.meta}:null),
    destination:r.dest.slots.map(x=>x?{typeId:x.typeId,amount:x.amount,meta:x.meta}:null),
    moved:r.moved
  };
}
test("REPEAT-01 actual processColumn scans same FULL chest once per identical source slot",()=>{
  const sourceSlots=Array.from({length:5},()=>item("minecraft:stone",1));
  const full=Array.from({length:54},()=>item("minecraft:dirt",64));
  const base=run(sourceSlots,full);
  assert.equal(base.stats.offers,5);
  assert.equal(base.dest.calls.getSlot,270);
  assert.equal(base.moved,0);
  assert.equal(base.dest.calls.hasItem,0,"P4e full-native occupancy fast path preserved");
});
test("REPEAT-02 exact-type and metadata guarded synchronous reuse could avoid repeated negative scans in modeled case",()=>{
  const sourceSlots=Array.from({length:5},()=>item("minecraft:stone",1));
  const full=Array.from({length:54},()=>item("minecraft:dirt",64));
  const baseline=run(sourceSlots,full);
  const modeled=run(sourceSlots,full,{memo:true});
  assert.deepEqual(state(modeled),state(baseline));
  assert.equal(modeled.stats.reused,4);
  assert.equal(modeled.dest.calls.getSlot,54);
  assert.equal(baseline.dest.calls.getSlot,270);
});
test("REPEAT-03 type-only rejection reuse would be wrong when incoming stack metadata differs",()=>{
  const full=Array.from({length:54},()=>item("minecraft:dirt",64));
  full[53]=item("minecraft:stone",20,"named");
  const sourceSlots=[item("minecraft:stone",1,"plain"),item("minecraft:stone",1,"named")];
  const baseline=run(sourceSlots,full);
  const modeled=run(sourceSlots,full,{memo:true});
  assert.deepEqual(state(modeled),state(baseline));
  assert.equal(modeled.moved,1,"Second metadata-compatible item must be accepted");
  assert.equal(modeled.stats.reused,0,"Exact native equivalence rejects unsound reuse");
  assert.equal(modeled.dest.calls.getSlot,108);
});
test("REPEAT-04 a cross-tick negative cache is unsafe after an external chest mutation",()=>{
  const full=Array.from({length:54},()=>item("minecraft:dirt",64));
  const d=nativeDestination(full);
  const offered=item("minecraft:stone",1);
  assert.equal(find(d.container,offered),undefined);
  d.slots[30]=undefined; // external Hopper/player removed item
  assert.equal(find(d.container,offered).slot,30,
    "Fresh admission must observe changed native chest immediately");
});
test("REPEAT-05 nonstackable and unmatched metadata are not covered by hypothetical stackable memo",()=>{
  const a=item("minecraft:stone",1,"plain");
  const b=item("minecraft:stone",1,"named");
  assert.equal(a.isStackableWith(b),false);
  const nonstackable={typeId:"minecraft:enchanted_book",maxAmount:1,meta:""};
  assert.equal(a.isStackableWith(nonstackable),false);
});
