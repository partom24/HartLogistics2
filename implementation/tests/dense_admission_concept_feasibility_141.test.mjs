/**
 * P4e CODE-ONLY FEASIBILITY SPIKE — no gameplay source or BDS modification.
 *
 * Runs current 1.4.1 findAcceptSlot() (extracted from the actual engine)
 * against a Sorter-owned admission coordinator that still uses the native
 * chest as the only occupancy and item authority. Also records counterexamples
 * to tempting native find/contains/full-count shortcuts.
 *
 * The narrowly proved full-nonstackable-AUTO shortcut is now implemented by
 * the P4e source; this suite continues to compare the coordinator to it.
 * Does NOT assert real-world native find/contains equality semantics or speed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=fs.readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");

function sourceFunction(name, globals={}) {
  const start=SRC.indexOf("function "+name+"(");
  assert.ok(start>=0, "Source function missing: "+name);
  const brace=SRC.indexOf("{",start);
  let depth=0,line=false,block=false,quote="",escaped=false;
  for(let i=brace;i<SRC.length;i++){
    const c=SRC[i],n=SRC[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){
      if(escaped){escaped=false;continue;}
      if(c==="\\"){escaped=true;continue;}
      if(c===quote)quote="";
      continue;
    }
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)
      return vm.runInNewContext(SRC.slice(start,i+1)+"\n"+name+";",globals,{timeout:3000});
  }
  throw Error("Unbalanced source function "+name);
}

const findAcceptSlot=sourceFunction("findAcceptSlot",{enchantments:s=>s.ench??[]});
const item=(typeId,amount=1,meta="",maxAmount=64,ench=[])=>({
  typeId, amount, meta, maxAmount, ench
});
const dup=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const out=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function nativeChest(values,{throwsOccupancy=false}={}){
  const slots=values.map(dup);
  const calls={getSlot:0,hasItem:0,typeId:0,amount:0,maxAmount:0,
    getItem:0,compare:0,size:0,emptySlotsCount:0,firstItem:0,firstEmptySlot:0,find:0,contains:0};
  return {
    slots,calls,
    container:{
      isValid:true,
      get size(){calls.size++;return slots.length;},
      get emptySlotsCount(){
        calls.emptySlotsCount++;
        if(throwsOccupancy)throw Error("native occupancy unavailable");
        return slots.filter(x=>x===undefined).length;
      },
      firstItem(){calls.firstItem++;const i=slots.findIndex(x=>x!==undefined);return i<0?undefined:i;},
      firstEmptySlot(){calls.firstEmptySlot++;const i=slots.findIndex(x=>x===undefined);return i<0?undefined:i;},
      getSlot(index){
        calls.getSlot++;
        return {
          hasItem(){calls.hasItem++;return slots[index]!==undefined;},
          get typeId(){calls.typeId++;return slots[index]?.typeId;},
          get amount(){calls.amount++;return slots[index]?.amount;},
          get maxAmount(){calls.maxAmount++;return slots[index]?.maxAmount;},
          getItem(){calls.getItem++;return dup(slots[index]);},
          isStackableWith(stack){
            calls.compare++;
            const v=slots[index];
            return Boolean(v&&v.typeId===stack.typeId&&v.meta===stack.meta&&
              v.maxAmount>1&&stack.maxAmount>1);
          }
        };
      },
      // This is an illustrative "first matching ItemStack" interpretation,
      // NOT a claim about unmeasured Bedrock find() equality behavior.
      find(needle){
        calls.find++;
        const i=slots.findIndex(v=>v&&v.typeId===needle.typeId&&v.meta===needle.meta);
        return i<0?undefined:i;
      },
      contains(needle){calls.contains++;return slots.some(v=>v&&v.typeId===needle.typeId&&v.meta===needle.meta);}
    }
  };
}

// Only native chest contents decide capacity. The Sorter may pick the mode
// and call the existing authoritative admission function synchronously.
// This one proven-negative P4e illustration is safe: a FULL inventory cannot
// admit a nonstackable AUTO item, regardless of whether a live seed exists.
// Deliberately keep the more complex stackable/dense path unchanged.
function proposedAdmission(container,stack,mode){
  const requireAutoSeed=mode==="auto";
  if(requireAutoSeed&&stack.maxAmount<=1){
    try {
      if(container.emptySlotsCount===0)return undefined;
    } catch(_){/* Unknown native result: continue exact original path. */}
  }
  return findAcceptSlot(container,stack,requireAutoSeed);
}

function compare(values,stack,mode="filter",opts={}){
  const a=nativeChest(values,opts),b=nativeChest(values,opts);
  const before=out(findAcceptSlot(a.container,stack,mode==="auto"));
  const after=out(proposedAdmission(b.container,stack,mode));
  assert.deepEqual(after,before,"Candidate must select identical slot, before, room and existing metadata");
  assert.deepEqual(b.slots,a.slots,"Qualification must not alter native chest");
  return {before,after,a,b};
}

test("CONCEPT-01 native 54-slot occupancy counts do not establish exact capacity",()=>{
  const full=Array.from({length:54},()=>item("minecraft:dirt",64));
  full[53]=item("minecraft:stone",20);
  const r=compare(full,item("minecraft:stone",5));
  assert.equal(r.a.container.emptySlotsCount,0);
  assert.equal(r.after.slot,53);
  assert.equal(r.after.room,44);
});
test("CONCEPT-02 compatible partial stack wins over earlier empty position",()=>{
  const slots=Array(54).fill(undefined);
  slots[53]=item("minecraft:stone",20);
  const r=compare(slots,item("minecraft:stone",8));
  assert.equal(r.after.slot,53);
  assert.equal(r.after.before,20);
});
test("CONCEPT-03 full dense mismatch examines every slot in current source",()=>{
  const full=Array.from({length:54},(_,i)=>item(i%2?"minecraft:dirt":"minecraft:granite",64));
  const r=compare(full,item("minecraft:stone",4));
  assert.equal(r.before,undefined);
  assert.equal(r.a.calls.getSlot,54);
  assert.equal(r.b.calls.getSlot,54);
  assert.equal(r.b.calls.getItem,0,"No ItemStack cloning required to reject a full chest");
});
test("CONCEPT-04 native find first match cannot establish admissibility",()=>{
  const full=Array.from({length:54},()=>item("minecraft:dirt",64));
  full[0]=item("minecraft:stone",64);
  full[53]=item("minecraft:stone",15);
  const chest=nativeChest(full),incoming=item("minecraft:stone",8);
  assert.equal(chest.container.find(incoming),0,"An ordinary first-match query can find a full stack");
  const actual=findAcceptSlot(chest.container,incoming);
  assert.equal(actual.slot,53,"Later compatible partial must still be found");
  assert.equal(actual.room,49);
});
test("CONCEPT-05 native contains true is not evidence of free capacity",()=>{
  const allFull=Array.from({length:54},()=>item("minecraft:stone",64));
  const chest=nativeChest(allFull);
  assert.equal(chest.container.contains(item("minecraft:stone",64)),true);
  assert.equal(findAcceptSlot(chest.container,item("minecraft:stone",1)),undefined);
});
test("CONCEPT-06 AUTO is seeded by type even when stack metadata cannot merge",()=>{
  const slots=[item("minecraft:stone",12,"different-name"),undefined,item("minecraft:dirt",40)];
  const chest=nativeChest(slots),incoming=item("minecraft:stone",4,"incoming-name");
  assert.equal(chest.container.find(incoming),undefined,
    "A metadata-exact find could miss a valid Auto seed");
  const r=findAcceptSlot(chest.container,incoming,true);
  assert.equal(r.slot,1,"Auto may accept an empty slot after a live type-only seed");
  assert.equal(r.before,0);
});
test("CONCEPT-07 enchanted-book AUTO seed uses enchantment TYPE set, ignoring level",()=>{
  const book=(type,level)=>item("minecraft:enchanted_book",1,"",1,[{id:type,level}]);
  const slots=[book("minecraft:mending",1),undefined];
  const match=compare(slots,book("minecraft:mending",3),"auto");
  assert.equal(match.after.slot,1);
  const miss=compare(slots,book("minecraft:fortune",3),"auto");
  assert.equal(miss.after,undefined);
});
test("CONCEPT-08 the narrow full nonstackable AUTO rejection needs no slot iteration",()=>{
  const full=Array.from({length:54},()=>item("minecraft:enchanted_book",1,"",1,
    [{id:"minecraft:mending",level:1}]));
  const incoming=item("minecraft:enchanted_book",1,"",1,[{id:"minecraft:mending",level:3}]);
  const r=compare(full,incoming,"auto");
  assert.equal(r.before,undefined);
  assert.equal(r.a.calls.getSlot,0,"Current P4e source now implements the proved full-count rejection");
  assert.equal(r.b.calls.getSlot,0,"Coordinator remains equivalent to the source fast path");
  assert.equal(r.b.calls.emptySlotsCount,1);
});
test("CONCEPT-09 native occupancy failure degrades to unchanged live scan",()=>{
  const full=Array.from({length:54},()=>item("minecraft:enchanted_book",1,"",1));
  const r=compare(full,item("minecraft:enchanted_book",1,"",1),"auto",
                  {throwsOccupancy:true});
  assert.equal(r.after,undefined);
  assert.ok(r.b.calls.getSlot>0);
});
test("CONCEPT-10 a cached full-chest conclusion is stale immediately after external mutation",()=>{
  const chest=nativeChest(Array.from({length:27},()=>item("minecraft:dirt",64)));
  const incoming=item("minecraft:stone",3);
  assert.equal(findAcceptSlot(chest.container,incoming),undefined);
  chest.slots[17]=undefined; // player, Hopper or other script modifies chest
  const next=findAcceptSlot(chest.container,incoming);
  assert.equal(next.slot,17,"Current live chest can accept cargo after an unrelated writer changed it");
});
test("CONCEPT-11 zero empty slots is safe to reject only for nonstackable items",()=>{
  for(const n of [1,9,27,54]){
    const full=Array.from({length:n},()=>item("minecraft:stone",64));
    assert.equal(compare(full,item("minecraft:diamond_sword",1,"",1),"auto").after,undefined);
    if(n>1){
      full[n-1]=item("minecraft:stone",1);
      assert.equal(compare(full,item("minecraft:stone",5),"auto").after.slot,n-1);
    }
  }
});
test("CONCEPT-12 exhaustive 1,024 five-position patterns in varied container sizes",()=>{
  const choices=[
    undefined,item("minecraft:stone",64),
    item("minecraft:stone",12,"named"),item("minecraft:dirt",48)
  ];
  for(const n of [9,27,54]){
    for(let x=0;x<1024;x++){
      const values=Array.from({length:n},()=>item("minecraft:granite",64));
      let value=x;
      const places=[0,1,Math.floor(n/2),n-2,n-1];
      for(const i of places){values[i]=choices[value%4];value=Math.floor(value/4);}
      for(const incoming of [item("minecraft:stone",3),item("minecraft:dirt",4),
        item("minecraft:stone",1,"named")]){
        compare(values,incoming,"filter");
        compare(values,incoming,"auto");
      }
    }
  }
});
test("CONCEPT-13 no new custody writer, tick cadence or persistent chest ledger",()=>{
  assert.match(SRC,/function findAcceptSlot\(container, stack, requireAutoSeed=false\)/);
  assert.match(SRC,/function safeMovePartial\(src, srcBlock, srcSlot, dst, dstBlock, dstSlotInfo, amount\)/);
  assert.match(SRC,/system\.runInterval\(schedulerTick,\s*1\)/);
  assert.doesNotMatch(SRC,/knownChestCapacityCache|authoritativeSorterChestCount/);
});
