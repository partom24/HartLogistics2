/**
 * PG-19 SOURCE-EXECUTED FAULT WITNESS, NOT a Bedrock runtime or crash test.
 *
 * Calls unchanged 1.4.1 functions extracted from addon/ at test runtime.
 * The mocked slot/journal save order is a *possible application exception
 * window*, not a claim that a particular BDS hard-crash disk order occurred.
 *
 * No source code or metadata from addon/ is imported into a build product.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../addon/behavior_pack/scripts/main.js", import.meta.url), "utf8"
);
function original(name) {
  const anchor = "function " + name + "(";
  const begin = source.indexOf(anchor);
  assert(begin >= 0, "missing unchanged 1.4.1 " + name);
  const next = source.indexOf("\nfunction ", begin + anchor.length);
  return source.slice(begin, next < 0 ? undefined : next);
}

const names = [
  "safeJsonParse", "saveJournal", "serializeQueueItem",
  "serializeFilterItem", "serializeTransport", "rebuildItem",
  "rebuildTransportItem", "exactStackSig", "slotState",
  "safeMovePartial", "recoverJournal"
];

class Item {
  constructor(typeId, amount=1) {
    this.typeId=typeId; this.amount=amount;
    this.maxAmount=typeId==="minecraft:diamond_sword"?1:64;
    this.nameTag=""; this.lore=[]; this.dyn={};
    this.canDestroy=[]; this.canPlaceOn=[];
    this.keepOnDeath=false; this.lockMode="none";
  }
  clone() {
    const item=new Item(this.typeId,this.amount);
    Object.assign(item,structuredClone({
      maxAmount:this.maxAmount,nameTag:this.nameTag,lore:this.lore,
      dyn:this.dyn,canDestroy:this.canDestroy,canPlaceOn:this.canPlaceOn,
      keepOnDeath:this.keepOnDeath,lockMode:this.lockMode
    }));
    return item;
  }
  getLore(){return [...this.lore]}
  setLore(lore){this.lore=[...lore]}
  getCanDestroy(){return [...this.canDestroy]}
  getCanPlaceOn(){return [...this.canPlaceOn]}
  getDynamicPropertyIds(){return Object.keys(this.dyn)}
  getDynamicProperty(id){return this.dyn[id]}
  setDynamicProperty(id,v){this.dyn[id]=v}
  getComponent(){return undefined}
}

class Container {
  constructor(item) { this.slot=item?.clone(); this.failNextSet=false; this.size=1; this.isValid=true; }
  getItem(slot) {
    assert.equal(slot,0);
    return this.slot?.clone();
  }
  setItem(slot,item) {
    assert.equal(slot,0);
    if (this.failNextSet) {
      this.failNextSet=false;
      throw new Error("INJECTED_SLOT_WRITE_FAILURE");
    }
    this.slot=item?.clone();
  }
}

function richSword() {
  const s=new Item("minecraft:diamond_sword");
  s.nameTag="do not flatten";
  s.lore=["owner's original equipment"];
  s.dyn={"hart:nonce":"unique-owner-data"};
  s.canDestroy=["minecraft:obsidian"];
  s.canPlaceOn=["minecraft:stone"];
  s.keepOnDeath=true;
  s.lockMode="slot";
  return s;
}
function rig(item=richSword()) {
  const sourceSlot=new Container(item),destinationSlot=new Container();
  const journal=new Map(), logs=[];
  let refuseJournalClear=false;
  const location={x:0,y:64,z:0},toLocation={x:4,y:64,z:0};
  const sb={dimension:{id:"minecraft:overworld"},location};
  const db={dimension:{id:"minecraft:overworld"},location:toLocation};
  const context={
    ItemStack:Item,
    JOURNAL_KEY:"hartsorter:journal_v1",
    POTION_ITEM_IDS:new Set(["minecraft:potion","minecraft:splash_potion","minecraft:lingering_potion"]),
    queueKnownVanillaNonstack:()=>false,
    enchantments:()=>[],
    dynamicProps:s=>({...s.dyn}),
    filterRoundTripSafe:()=>true,
    log:s=>logs.push(s),
    setWorldDynamic:(key,value)=>{
      if (value===undefined && refuseJournalClear) throw new Error("INJECTED_JOURNAL_CLEAR_FAILURE");
      if (value===undefined)journal.delete(key);
      else journal.set(key,value);
    },
    world:{getDynamicProperty:key=>journal.get(key)},
    getContainerAt:(_dim,loc)=>loc.x===location.x?sourceSlot:
      loc.x===toLocation.x?destinationSlot:undefined
  };
  vm.runInNewContext(names.map(original).join("\n"), context);
  const move=()=>context.safeMovePartial(
    sourceSlot,sb,0,destinationSlot,db,{slot:0,before:0,room:1},1
  );
  return {sourceSlot,destinationSlot,journal,logs,context,move,
    setFailJournalClear:value=>{refuseJournalClear=value},
    pending:()=>journal.has("hartsorter:journal_v1"),
    recover:()=>context.recoverJournal()};
}
function details(item) {
  if(!item)return null;
  return {
    typeId:item.typeId,amount:item.amount,nameTag:item.nameTag,lore:item.lore,
    dyn:item.dyn,canDestroy:item.canDestroy,canPlaceOn:item.canPlaceOn,
    keepOnDeath:item.keepOnDeath,lockMode:item.lockMode
  };
}

test("original direct-only nonstackable is refused by the Q4 queue",()=>{
  const h=rig();
  assert.equal(h.context.serializeQueueItem(h.sourceSlot.getItem(0)),undefined);
});
test("uninterrupted legacy native clone preserves tested opaque metadata",()=>{
  const h=rig(),before=details(h.sourceSlot.getItem(0));
  assert.equal(h.move(),1);
  assert.equal(h.sourceSlot.getItem(0),undefined);
  assert.deepEqual(details(h.destinationSlot.getItem(0)),before);
  assert.equal(h.pending(),false);
});
test("pre-debit failure leaves original native stack at source and recover clears idle journal",()=>{
  const h=rig(),before=details(h.sourceSlot.getItem(0));
  h.sourceSlot.failNextSet=true;
  assert.throws(()=>h.move(),/INJECTED_SLOT_WRITE_FAILURE/);
  assert.equal(h.pending(),true);
  assert.deepEqual(details(h.sourceSlot.getItem(0)),before);
  assert.equal(h.destinationSlot.getItem(0),undefined);
  h.recover();
  assert.equal(h.pending(),false);
  assert.deepEqual(details(h.sourceSlot.getItem(0)),before);
  assert.equal(h.destinationSlot.getItem(0),undefined);
});
test("post-debit exception recovers from a *partial* serialized witness and loses unrecorded metadata",()=>{
  const h=rig(),before=details(h.sourceSlot.getItem(0));
  h.destinationSlot.failNextSet=true;
  assert.throws(()=>h.move(),/INJECTED_SLOT_WRITE_FAILURE/);
  assert.equal(h.pending(),true);
  assert.equal(h.sourceSlot.getItem(0),undefined);
  assert.equal(h.destinationSlot.getItem(0),undefined);
  h.recover();
  const after=details(h.destinationSlot.getItem(0));
  assert(after,"recovery should synthesize destination item");
  assert.equal(h.pending(),false,"original implementation clears pending journal");
  assert.equal(after.typeId,before.typeId);
  assert.equal(after.nameTag,before.nameTag);
  assert.deepEqual(after.lore,before.lore);
  assert.deepEqual(after.dyn,before.dyn);
  assert.notDeepEqual(after,before,"some original ItemStack fields were not serialized");
  assert.deepEqual(after.canDestroy,[]);
  assert.deepEqual(after.canPlaceOn,[]);
  assert.equal(after.keepOnDeath,false);
  assert.equal(after.lockMode,"none");
});
test("the physical completed move survives a failed terminal journal clear in this mock",()=>{
  const h=rig(),before=details(h.sourceSlot.getItem(0));
  h.setFailJournalClear(true);
  assert.throws(()=>h.move(),/INJECTED_JOURNAL_CLEAR_FAILURE/);
  assert.equal(h.pending(),true);
  assert.equal(h.sourceSlot.getItem(0),undefined);
  assert.deepEqual(details(h.destinationSlot.getItem(0)),before);
  h.setFailJournalClear(false);
  h.recover();
  assert.equal(h.pending(),false);
  assert.deepEqual(details(h.destinationSlot.getItem(0)),before);
});
test("exactStackSig has identical fingerprints for distinct owner/Adventure data",()=>{
  const h=rig(),first=h.sourceSlot.getItem(0),other=first.clone();
  other.dyn={"hart:nonce":"foreign-replacement"};
  other.canDestroy=["minecraft:bedrock"];
  other.canPlaceOn=["minecraft:dirt"];
  other.keepOnDeath=false;other.lockMode="none";
  assert.notDeepEqual(details(other),details(first));
  assert.equal(h.context.exactStackSig(first),h.context.exactStackSig(other));
});
test("legacy filter snapshot used by recovery omits several native ItemStack fields",()=>{
  const h=rig(),item=h.sourceSlot.getItem(0);
  const data=h.context.serializeTransport(item);
  for(const key of ["canDestroy","canPlaceOn","keepOnDeath","lockMode"]){
    assert.equal(Object.hasOwn(data,key),false,key+" cannot be authenticated by the saved journal");
  }
  assert.equal(Object.hasOwn(data,"dyn"),true);
});
test("fault witness does not modify 1.4.1 source or confer an item transfer permission",()=>{
  assert.match(source,/const VERSION = "1\.4\.1"/);
  assert.match(source,/function safeMovePartial\(/);
  assert.match(source,/function recoverJournal\(/);
  assert(!source.includes("PG-19 SOURCE-EXECUTED FAULT WITNESS"));
});
