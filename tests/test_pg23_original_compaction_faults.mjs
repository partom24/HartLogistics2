import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const original=fs.readFileSync(
  new URL("../addon/behavior_pack/scripts/main.js",import.meta.url),"utf8");
const begin="function compactSourceHopper(container) {";
const stop="\nfunction processColumn(col, globalRemaining) {";
const a=original.indexOf(begin),b=original.indexOf(stop,a+begin.length);
assert(a>=0&&b>a,"protected 1.4.1 compaction must be exact");
const functionBody=original.slice(a,b);
assert.match(functionBody,/container\.setItem\(write, item\)/);
assert.match(functionBody,/container\.setItem\(read, undefined\)/);

function setup({cutAt=0,before=false}={}){
  const items=[undefined,{typeId:"minecraft:enchanted_book",amount:1,tag:"Protection I"},
               undefined,undefined,undefined];
  let writes=0;
  const c={
    size:5,
    getItem:i=>items[i]===undefined?undefined:{...items[i]},
    setItem:(i,item)=>{
      if(before&&writes===0)throw Error("FAULT_BEFORE_FIRST_WRITE");
      items[i]=item===undefined?undefined:{...item};
      writes++;
      if(writes===cutAt)throw Error("FAULT_AFTER_EARLY_WRITE");
    }
  };
  const context={};
  vm.runInNewContext(functionBody,context);
  return {c,items,context,count:()=>writes,run:()=>context.compactSourceHopper(c)};
}

test("protected original two-write compaction has no journal or native move at all",()=>{
  assert.doesNotMatch(functionBody,/saveJournal\(/);
  assert.doesNotMatch(functionBody,/\.moveItem\(/);
  assert.equal((functionBody.match(/container\.setItem\(/g)||[]).length,2);
});
test("legacy same-Hopper gap compaction completes normally but performs two physical writes",()=>{
  const h=setup();h.run();
  assert.equal(h.count(),2);
  assert.equal(h.items[0].typeId,"minecraft:enchanted_book");
  assert.equal(h.items[1],undefined);
});
test("injected exception immediately after first original write leaves two live ItemStacks",()=>{
  const h=setup({cutAt:1});
  assert.throws(()=>h.run(),/FAULT_AFTER_EARLY_WRITE/);
  assert.equal(h.count(),1);
  assert.deepEqual(h.items[0],h.items[1]);
  assert.equal(h.items[0].tag,"Protection I");
  // This proves a source-level intermediate duplicate, NOT that BDS disk
  // save actually persisted it during the owner's emergency kill.
});
test("pre-write exception preserves original source ItemStack and empty target",()=>{
  const h=setup({before:true});
  assert.throws(()=>h.run(),/FAULT_BEFORE_FIRST_WRITE/);
  assert.equal(h.count(),0);
  assert.equal(h.items[0],undefined);
  assert.equal(h.items[1].typeId,"minecraft:enchanted_book");
});
