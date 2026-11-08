import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const compiledPath=new URL("../build/pg20-lab/behavior_pack/scripts/main.js",import.meta.url);
if(!fs.existsSync(compiledPath)){
  throw new Error("PG20 build must run first: python candidates/pg20/prepare_candidate.py");
}
const src=fs.readFileSync(compiledPath,"utf8");
function body(name){
  const anchor="function "+name+"(";
  const start=src.indexOf(anchor);
  assert(start>=0,name+" missing in derived build");
  const end=src.indexOf("\nfunction ",start+anchor.length);
  return src.slice(start,end<0?undefined:end);
}
const selectors=[
  "safeJsonParse","saveJournal","serializeTransport","safeMovePartial",
  "recoverJournal","slotState","exactStackSig",
  "pg20ReportHold","pg20InspectableNativeFingerprint","pg20MoveOpaqueNative"
];
const originalCode=selectors.map(body).join("\n");

class Stack {
  constructor(typeId="minecraft:diamond_sword",amount=1){
    this.typeId=typeId;this.amount=amount;
    this.maxAmount=typeId==="minecraft:cobblestone"?64:1;
    this.nameTag="PG20 test-owned";
    this.lore=["unflattened evidence"];
    this.dyn={"hart:identity":"native-opaque-source"};
    this.destroy=["minecraft:obsidian"];
    this.place=["minecraft:stone"];
    this.keepOnDeath=true;
    this.lockMode="slot";
    this.durability={damage:23,unbreakable:false};
  }
  clone(){
    const s=new Stack(this.typeId,this.amount);
    Object.assign(s,structuredClone({
      maxAmount:this.maxAmount,nameTag:this.nameTag,lore:this.lore,
      dyn:this.dyn,destroy:this.destroy,place:this.place,
      keepOnDeath:this.keepOnDeath,lockMode:this.lockMode,
      durability:this.durability
    }));
    return s;
  }
  getLore(){return [...this.lore]}
  getCanDestroy(){return [...this.destroy]}
  getCanPlaceOn(){return [...this.place]}
  getDynamicPropertyIds(){return Object.keys(this.dyn)}
  getDynamicProperty(id){return this.dyn[id]}
  getComponent(id){
    if(id==="minecraft:durability")return {...this.durability};
    return undefined;
  }
}
class Container{
  constructor(item){this.items=[item?.clone()];this.isValid=true;this.size=1;
    this.moves=0;this.sets=0;this.moveFault="";this.afterMoveMutation=null;}
  getItem(slot){assert.equal(slot,0);return this.items[0]?.clone()}
  setItem(slot,item){assert.equal(slot,0);this.sets++;this.items[0]=item?.clone()}
  moveItem(from,to,destination){
    assert.equal(from,0);assert.equal(to,0);
    this.moves++;
    if(this.moveFault==="before")throw Error("FAULT_BEFORE_NATIVE");
    if(!this.items[0]||destination.items[0])throw Error("INVALID_NATIVE_SHAPE");
    destination.items[0]=this.items[0].clone();
    this.items[0]=undefined;
    if(this.afterMoveMutation)this.afterMoveMutation(destination.items[0]);
    if(this.moveFault==="after")throw Error("FAULT_AFTER_NATIVE");
  }
}
function allFields(item){
  if(!item)return null;
  return {typeId:item.typeId,amount:item.amount,nameTag:item.nameTag,
    lore:item.lore,dyn:item.dyn,destroy:item.destroy,place:item.place,
    keepOnDeath:item.keepOnDeath,lockMode:item.lockMode,durability:item.durability};
}
function setup(item=new Stack()){
  const from=new Container(item),to=new Container(),journal=new Map(),logs=[];
  const sblock={dimension:{id:"minecraft:overworld"},location:{x:1,y:70,z:1}};
  const dblock={dimension:{id:"minecraft:overworld"},location:{x:3,y:70,z:1}};
  const key="hartsorter:journal_v1";
  let writeFault="",getFault="",clearFault=false;
  const context={
    JOURNAL_KEY:key,system:{currentTick:100},log:msg=>logs.push(msg),
    enchantments:()=>[],filterRoundTripSafe:()=>true,
    serializeFilterItem:x=>({typeId:x.typeId,nameTag:x.nameTag,lore:x.lore,
                             dyn:x.dyn,match:{typeId:x.typeId}}),
    POTION_ITEM_IDS:new Set(),
    setWorldDynamic:(k,v)=>{
      if(v===undefined && clearFault)throw Error("FAULT_CLEAR_JOURNAL");
      if(writeFault==="before"&&v!==undefined)throw Error("FAULT_BEFORE_JOURNAL");
      if(v===undefined)journal.delete(k); else journal.set(k,v);
    },
    world:{getDynamicProperty:k=>{
      const value=journal.get(k);
      return getFault==="wrong"&&value!==undefined?"corrupt":value;
    }},
    getContainerAt:(dim,loc)=>dim!=="minecraft:overworld"?undefined:
        loc.x===1?from:loc.x===3?to:undefined
  };
  const js=`const PG20_OPAQUE_JOURNAL="pg20-native-opaque-v1";\n`+
      `let pg20LastHold="";let pg20LastHoldTick=-100000;\n`+originalCode;
  vm.runInNewContext(js,context);
  const move=(amount=1,opaque=true,info={slot:0,before:0,room:64})=>
    context.safeMovePartial(from,sblock,0,to,dblock,info,amount,opaque);
  return {from,to,journal,logs,context,sblock,dblock,move,key,
    setWriteFault:v=>{writeFault=v},setGetFault:v=>{getFault=v},
    setClearFault:v=>{clearFault=v},recover:()=>context.recoverJournal(),
    pending:()=>journal.has(key)};
}

test("PG20 is derived from exact accepted PG08 with no obsolete PG13/14/15 commands",()=>{
  assert.match(src,/const VERSION = "1\.5\.5-LAB-PG20"/);
  assert.match(src,/pg08CommitLink\(/);
  assert.doesNotMatch(src, /const PG13_A|const PG14_RESERVE|const PG15_KEY/);
  assert.doesNotMatch(src,/hartlogistics:(?:custodytransfer|cutpost|shadowbegin)/);
  assert.match(src,/function recoverQueueJournal\(/);
});
test("one complete native MR move preserves all modeled metadata and clears journal",()=>{
  const h=setup(),original=allFields(h.from.getItem(0));
  assert.equal(h.move(),1);
  assert.equal(h.from.moves,1);
  assert.equal(h.from.sets,0);
  assert.equal(h.to.sets,0);
  assert.equal(h.from.getItem(0),undefined);
  assert.deepEqual(allFields(h.to.getItem(0)),original);
  assert.equal(h.pending(),false);
});
test("successful direct-only native route never builds or serializes ItemStack",()=>{
  const h=setup();h.context.serializeFilterItem=()=>{throw Error("MUST NOT SERIALIZE MR")};
  assert.equal(h.move(),1);
  assert.equal(h.from.moves,1);
});
test("metadata variation survives full native route without JSON recreation",()=>{
  for(const modify of [
    s=>s.dyn={"hart:vector":{x:12,y:1,z:-2}},
    s=>{s.nameTag="§5custom name";s.lore=["lore α","lore β"]},
    s=>{s.keepOnDeath=false;s.lockMode="inventory";s.durability.damage=0},
    s=>{s.destroy=[];s.place=["minecraft:granite"]},
    s=>{s.typeId="minecraft:enchanted_book";s.maxAmount=1}
  ]){
    const item=new Stack();modify(item);
    const h=setup(item);assert.equal(h.move(),1);
    assert.deepEqual(allFields(h.to.getItem(0)),allFields(item));
  }
});
test("non-Q4-safe stackable partial move does not lose or flatten items",()=>{
  const s=new Stack("minecraft:cobblestone",5),h=setup(s);
  assert.equal(h.move(2),0);assert.equal(h.pending(),false);
  assert.deepEqual(allFields(h.from.getItem(0)),allFields(s));
  assert.equal(h.to.getItem(0),undefined);assert.equal(h.from.moves,0);
});
test("occupied destination refuses opaque merge without writing a journal",()=>{
  const h=setup();h.to.items[0]=new Stack();
  const was=allFields(h.from.getItem(0));
  assert.equal(h.move(),0);
  assert.equal(h.pending(),false);
  assert.deepEqual(allFields(h.from.getItem(0)),was);
  assert.equal(h.from.moves,0);
});
test("pre-existing unresolved ordinary journal blocks new direct-only move",()=>{
  const h=setup();h.journal.set(h.key,JSON.stringify({legacy:true}));
  assert.equal(h.move(),0);
  assert.equal(h.from.moves,0);
  assert.equal(h.pending(),true);
});
test("malformed non-JSON physical journal also blocks new move and survives recovery",()=>{
  const h=setup();h.journal.set(h.key,"broken");
  assert.equal(h.move(),0);h.recover();
  assert.equal(h.pending(),true);assert.equal(h.journal.get(h.key),"broken");
  assert.equal(h.from.moves,0);
});
test("failed intent property write before physical move never touches source",()=>{
  const h=setup(),expected=allFields(h.from.getItem(0));
  h.setWriteFault("before");
  assert.throws(()=>h.move(),/FAULT_BEFORE_JOURNAL/);
  assert.equal(h.from.moves,0);
  assert.equal(h.pending(),false);
  assert.deepEqual(allFields(h.from.getItem(0)),expected);
});
test("journal readback mismatch leaves native transfer untouched and marker held",()=>{
  const h=setup(),expected=allFields(h.from.getItem(0));
  h.setGetFault("wrong");
  assert.throws(()=>h.move(),/intent write\/readback uncertain/);
  h.setGetFault("");
  assert.equal(h.pending(),true);
  assert.equal(h.from.moves,0);
  assert.deepEqual(allFields(h.from.getItem(0)),expected);
  h.recover();assert.equal(h.pending(),true);
});
test("before-native-move injected fault leaves source and journal for operator HOLD",()=>{
  const h=setup(),original=allFields(h.from.getItem(0));
  h.from.moveFault="before";
  assert.throws(()=>h.move(),/FAULT_BEFORE_NATIVE/);
  assert.equal(h.pending(),true);
  assert.deepEqual(allFields(h.from.getItem(0)),original);
  assert.equal(h.to.getItem(0),undefined);
  h.recover();
  assert.equal(h.pending(),true);
  assert.deepEqual(allFields(h.from.getItem(0)),original);
  assert.equal(h.to.getItem(0),undefined);
});
test("after-native-move exception leaves fully preserved destination and opaque marker",()=>{
  const h=setup(),original=allFields(h.from.getItem(0));
  h.from.moveFault="after";
  assert.throws(()=>h.move(),/FAULT_AFTER_NATIVE/);
  assert.equal(h.pending(),true);assert.equal(h.from.getItem(0),undefined);
  assert.deepEqual(allFields(h.to.getItem(0)),original);
  h.recover();h.recover();
  assert.equal(h.from.moves,1);assert.equal(h.pending(),true);
  assert.deepEqual(allFields(h.to.getItem(0)),original);
});
test("after-native-finish failed journal clear cannot auto replay or flatten source",()=>{
  const h=setup(),original=allFields(h.from.getItem(0));
  h.setClearFault(true);
  assert.throws(()=>h.move(),/FAULT_CLEAR_JOURNAL/);
  assert.equal(h.pending(),true);h.setClearFault(false);
  h.recover();assert.equal(h.pending(),true);
  assert.equal(h.from.moves,1);
  assert.deepEqual(allFields(h.to.getItem(0)),original);
});
test("postmove metadata mismatch fails closed with opaque unresolved marker",()=>{
  const h=setup();h.from.afterMoveMutation=s=>{s.destroy=["minecraft:diamond_block"]};
  assert.throws(()=>h.move(),/postmove identity/);
  assert.equal(h.pending(),true);
  h.recover();assert.equal(h.pending(),true);assert.equal(h.from.moves,1);
});
test("new direct-only path refuses uninspectable native fields without any debit",()=>{
  const h=setup();
  h.from.getItem=()=>({typeId:"minecraft:enchanted_book",amount:1,maxAmount:1,
      getLore:()=>{throw Error("unreadable")}});
  assert.equal(h.move(),0);assert.equal(h.pending(),false);
  assert.equal(h.from.moves,0);
});
test("foreign dimension and same physical container cannot use native opaque route",()=>{
  const h=setup();
  h.dblock.dimension.id="minecraft:nether";
  assert.equal(h.move(),0);
  h.dblock.dimension.id="minecraft:overworld";
  const info={slot:0,before:0,room:1};
  assert.equal(h.context.pg20MoveOpaqueNative(h.from,h.sblock,0,h.from,h.dblock,
            info,1,h.from.getItem(0)),0);
  assert.equal(h.pending(),false);
});
test("legacy post-debit transfer never reconstructs ItemStack from incomplete payload",()=>{
  const h=setup(),s=h.from.getItem(0);
  h.from.items[0]=undefined;
  const tx={d:"minecraft:overworld",srcD:"minecraft:overworld",dstD:"minecraft:overworld",
    src:h.sblock.location,dst:h.dblock.location,srcSlot:0,dstSlot:0,
    sig:h.context.exactStackSig(s),srcBefore:1,srcAfter:0,dstBefore:0,
    dstAfter:1,move:1,item:{typeId:s.typeId,amount:1}};
  h.journal.set(h.key,JSON.stringify(tx));
  h.recover();
  assert.equal(h.pending(),true);
  assert.equal(h.from.getItem(0),undefined);
  assert.equal(h.to.getItem(0),undefined);
  assert.equal(h.from.sets+h.to.sets,0);
});
test("legacy credited destination but source-before is never auto-debited",()=>{
  const h=setup(),s=h.from.getItem(0);
  h.to.items[0]=s.clone();
  const tx={d:"minecraft:overworld",srcD:"minecraft:overworld",dstD:"minecraft:overworld",
    src:h.sblock.location,dst:h.dblock.location,srcSlot:0,dstSlot:0,
    sig:h.context.exactStackSig(s),srcBefore:1,srcAfter:0,dstBefore:0,
    dstAfter:1,move:1,item:{typeId:s.typeId,amount:1}};
  h.journal.set(h.key,JSON.stringify(tx));
  h.recover();assert.equal(h.pending(),true);
  assert.deepEqual(allFields(h.from.getItem(0)),allFields(s));
  assert.deepEqual(allFields(h.to.getItem(0)),allFields(s));
  assert.equal(h.from.sets+h.to.sets,0);
});
test("legacy untouched journal preserves original prepared-state clear behavior",()=>{
  const h=setup(),s=h.from.getItem(0);
  const tx={d:"minecraft:overworld",srcD:"minecraft:overworld",dstD:"minecraft:overworld",
    src:h.sblock.location,dst:h.dblock.location,srcSlot:0,dstSlot:0,
    sig:h.context.exactStackSig(s),srcBefore:1,srcAfter:0,dstBefore:0,
    dstAfter:1,move:1,item:{typeId:s.typeId,amount:1}};
  h.journal.set(h.key,JSON.stringify(tx));h.recover();
  assert.equal(h.pending(),false);
  assert.deepEqual(allFields(h.from.getItem(0)),allFields(s));
});
test("legacy completed journal preserves no-mutation clear behavior",()=>{
  const h=setup(),s=h.from.getItem(0);
  h.from.items[0]=undefined;h.to.items[0]=s.clone();
  const tx={d:"minecraft:overworld",srcD:"minecraft:overworld",dstD:"minecraft:overworld",
    src:h.sblock.location,dst:h.dblock.location,srcSlot:0,dstSlot:0,
    sig:h.context.exactStackSig(s),srcBefore:1,srcAfter:0,dstBefore:0,
    dstAfter:1,move:1,item:{typeId:s.typeId,amount:1}};
  h.journal.set(h.key,JSON.stringify(tx));h.recover();
  assert.equal(h.pending(),false);assert.equal(h.from.sets+h.to.sets,0);
  assert.deepEqual(allFields(h.to.getItem(0)),allFields(s));
});
test("opaque markers stay HOLD regardless of identical physical states",()=>{
  for(const variant of ["pg20-native-opaque-v1","unrecognized-owner"]){
    const h=setup();
    const tx={d:"minecraft:overworld",srcD:"minecraft:overworld",dstD:"minecraft:overworld",
      src:h.sblock.location,dst:h.dblock.location,srcSlot:0,dstSlot:0,
      opaqueTag:variant};
    h.journal.set(h.key,JSON.stringify(tx));
    h.recover();
    assert.equal(h.pending(),true);assert.equal(h.from.moves,0);
    assert.equal(h.to.getItem(0),undefined);
  }
});
test("ordinary legacy physical Sorter storage path retains existing partial write semantics",()=>{
  const h=setup(new Stack("minecraft:cobblestone",4));
  assert.equal(h.move(2,false,{slot:0,before:0,room:64}),2);
  assert.equal(h.from.getItem(0).amount,2);
  assert.equal(h.to.getItem(0).amount,2);
  assert.equal(h.from.sets,1);assert.equal(h.to.sets,1);
  assert.equal(h.from.moves,0);assert.equal(h.pending(),false);
});
test("unresolved physical journal blocks the otherwise ordinary source debit too",()=>{
  const h=setup(new Stack("minecraft:cobblestone",4));
  h.journal.set(h.key,"broken");
  assert.equal(h.move(2,false),0);
  assert.equal(h.from.sets,0);assert.equal(h.to.sets,0);
});
test("repeated recovery HOLD logging is throttled while unresolved marker remains",()=>{
  const h=setup();h.journal.set(h.key,"broken");
  h.recover();h.recover();h.recover();
  assert.equal(h.logs.filter(s=>s.includes("PG20")).length,1);
  h.context.system.currentTick+=1200;
  h.recover();assert.equal(h.logs.filter(s=>s.includes("PG20")).length,2);
});
test("the derived code does not add any gameplay block or temporary PG19 test probe",()=>{
  assert.doesNotMatch(src,/hlprobe:mr_container/);
  assert.doesNotMatch(src,/pg20_inject_failure|pg20_test_probe/);
  assert.match(src,/src\.moveItem\(srcSlot, dstSlotInfo\.slot, dst\)/);
});
