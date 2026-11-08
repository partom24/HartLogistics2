import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const file=new URL("../build/pg23-lab/behavior_pack/scripts/main.js",import.meta.url);
if(!fs.existsSync(file))
  throw Error("PG23 derived build must be prepared before Node tests");
const compiled=fs.readFileSync(file,"utf8");
function body(name){
  const anchor="function "+name+"(";
  const start=compiled.indexOf(anchor);
  assert(start>=0,"missing compiled function "+name);
  const end=compiled.indexOf("\nfunction ",start+anchor.length);
  return compiled.slice(start,end<0?undefined:end);
}
const authentic=[
  "pg20ReportHold","pg20InspectableNativeFingerprint",
  "pg23TransportMayRun","pg23CompactSourceHopper","saveJournal"
].map(body).join("\n");

class Stack {
  constructor(typeId="minecraft:enchanted_book",amount=1){
    this.typeId=typeId;this.amount=amount;this.maxAmount=typeId==="minecraft:cobblestone"?64:1;
    this.nameTag="PG23 source-identified item";
    this.lore=["original item; do not recreate"];
    this.dyn={"hart:owner":"native-copy","hart:level":1};
    this.destroy=["minecraft:stone"];this.place=["minecraft:granite"];
    this.keepOnDeath=true;this.lockMode="slot";this.durability={damage:11,unbreakable:true};
  }
  clone(){
    const s=new Stack(this.typeId,this.amount);
    Object.assign(s,structuredClone({
      nameTag:this.nameTag,lore:this.lore,dyn:this.dyn,
      destroy:this.destroy,place:this.place,keepOnDeath:this.keepOnDeath,
      lockMode:this.lockMode,durability:this.durability
    }));
    return s;
  }
  getLore(){return [...this.lore]}
  getCanDestroy(){return [...this.destroy]}
  getCanPlaceOn(){return [...this.place]}
  getDynamicPropertyIds(){return Object.keys(this.dyn)}
  getDynamicProperty(id){return this.dyn[id]}
  getComponent(id){return id==="minecraft:durability"?{...this.durability}:undefined}
}
const fields=s=>s?{typeId:s.typeId,amount:s.amount,nameTag:s.nameTag,lore:s.lore,
  dyn:s.dyn,destroy:s.destroy,place:s.place,keepOnDeath:s.keepOnDeath,
  lockMode:s.lockMode,durability:s.durability}:null;

class Hopper {
  constructor(items=[]){
    this.items=Array.from({length:5},(_,i)=>items[i]?.clone());
    this.isValid=true;this.size=5;
    this.moves=0;this.sets=0;this.fault="";
    this.afterMove=null;this.afterGet=null;
  }
  getItem(i){
    assert(i>=0&&i<5);
    if(this.afterGet)this.afterGet(i);
    return this.items[i]?.clone();
  }
  setItem(){this.sets++;throw Error("PG23 MUST NEVER call setItem")}
  moveItem(from,to,toContainer){
    assert.equal(toContainer,this,"only same-container native move allowed");
    assert.notEqual(from,to);
    this.moves++;
    if(this.fault==="before")throw Error("fault before native");
    assert(this.items[from] && !this.items[to],"exact whole-stack and empty destination");
    this.items[to]=this.items[from].clone();this.items[from]=undefined;
    if(this.afterMove)this.afterMove(from,to);
    if(this.fault==="after")throw Error("fault after native");
  }
}

function harness(items=[undefined,new Stack()]){
  const hopper=new Hopper(items), journal=new Map(), logs=[];
  const sourceBlock={typeId:"minecraft:hopper",
    dimension:{id:"minecraft:overworld"},location:{x:1,y:70,z:1}};
  const key="hartsorter:journal_v1",qKey="hartsorter:queue_journal_v1";
  let getFault=false,setFault="",clearFault=false,afterWrite=null;
  const world={getDynamicProperty:k=>{
    if(getFault)throw Error("journal read failure");
    return journal.get(k);
  }};
  const context={
    PG23_COMPACTION_JOURNAL:"pg23-native-hopper-compaction-v1",
    JOURNAL_KEY:key,QUEUE_JOURNAL_KEY:qKey,
    system:{currentTick:1000},log:x=>logs.push(x),world,
    enchantments:()=>[{type:{id:"minecraft:protection"},level:1}],
    exactStackSig:s=>s.typeId+"|"+s.nameTag,
    setWorldDynamic:(k,v)=>{
      if(setFault==="before"&&v!==undefined)throw Error("write failed before");
      if(v===undefined && clearFault)throw Error("clear failed");
      if(v===undefined)journal.delete(k);else journal.set(k,v);
      if(v!==undefined&&afterWrite)afterWrite();
      if(setFault==="after"&&v!==undefined)throw Error("write failed after");
    }
  };
  vm.runInNewContext(`let pg20LastHold="";let pg20LastHoldTick=-100000;let pg23LocalHold=false;\n`+
                     authentic,context);
  return {hopper,journal,logs,world,sourceBlock,key,qKey,
    run:()=>context.pg23CompactSourceHopper(hopper,sourceBlock),
    allowed:()=>context.pg23TransportMayRun(),
    setFault:x=>{setFault=x},setClearFault:x=>{clearFault=x},
    setGetFault:x=>{getFault=x},afterJournalWrite:x=>{afterWrite=x},
    resetProcess:()=>vm.runInNewContext("pg23LocalHold=false",context)
  };
}

test("compiled PG23 replaces the actual two-setItem compaction and retains old PG20 MR",()=>{
  assert.match(compiled,/const VERSION = "1\.5\.6-LAB-PG23";/);
  assert.doesNotMatch(compiled,/function compactSourceHopper\(/);
  assert.doesNotMatch(compiled,/container\.setItem\(write, item\)/);
  assert.doesNotMatch(compiled,/container\.setItem\(read, undefined\)/);
  assert.match(compiled,/src\.moveItem\(srcSlot, dstSlotInfo\.slot, dst\)/);
  assert.match(compiled,/function pg20MoveOpaqueNative\(/);
  assert.match(compiled,/function pg08CommitLink\(/);
  assert.doesNotMatch(compiled,/const PG13_A|const PG14_RESERVE|const PG15_KEY/);
});
test("strict native same-Hopper compaction preserves two original stacks and metadata",()=>{
  const book=new Stack(),cobble=new Stack("minecraft:cobblestone",64);
  const h=harness([undefined,book,undefined,cobble]);
  assert.equal(h.run(),true);
  assert.deepEqual(fields(h.hopper.getItem(0)),fields(book));
  assert.deepEqual(fields(h.hopper.getItem(1)),fields(cobble));
  assert.equal(h.hopper.getItem(2),undefined);
  assert.equal(h.hopper.getItem(3),undefined);
  assert.equal(h.hopper.moves,2);
  assert.equal(h.hopper.sets,0);
  assert.equal(h.journal.size,0);
});
test("no holes yields no physical or journal mutation",()=>{
  const book=new Stack(),h=harness([book,new Stack("minecraft:cobblestone",64)]);
  assert.equal(h.run(),true);
  assert.equal(h.hopper.moves,0);
  assert.equal(h.journal.size,0);
});
test("only later slots compact left in original relative order",()=>{
  const a=new Stack(),b=new Stack("minecraft:cobblestone",64),
        c=new Stack("minecraft:diamond_sword"),h=harness([undefined,undefined,a,b,c]);
  assert.equal(h.run(),true);
  assert.deepEqual(h.hopper.items.slice(0,3).map(x=>x?.typeId),
    [a.typeId,b.typeId,c.typeId]);
  assert.deepEqual(h.hopper.items.slice(3),[undefined,undefined]);
});
test("pending physical journal blocks any compaction even if malformed",()=>{
  const h=harness([undefined,new Stack()]);
  h.journal.set(h.key,"bad JSON");
  assert.equal(h.run(),false);
  assert.equal(h.hopper.moves,0);
  assert.equal(h.journal.get(h.key),"bad JSON");
});
test("pending Q4 journal pauses Hopper compaction even with empty physical journal",()=>{
  const h=harness([undefined,new Stack()]);
  h.journal.set(h.qKey,"pending");
  assert.equal(h.run(),false);
  assert.equal(h.hopper.moves,0);
});
test("world journal read error causes in-process sticky HOLD and zero writes",()=>{
  const h=harness([undefined,new Stack()]);
  h.setGetFault(true);assert.equal(h.run(),false);
  h.setGetFault(false);assert.equal(h.run(),false);
  assert.equal(h.hopper.moves,0);
});
test("before-intent write failure cannot touch physical inventory",()=>{
  const h=harness([undefined,new Stack()]);
  h.setFault("before");assert.equal(h.run(),false);
  assert.equal(h.hopper.moves,0);assert.equal(h.journal.size,0);
});
test("after-intent write failure preserves PREPARED marker without movement",()=>{
  const h=harness([undefined,new Stack()]);
  h.setFault("after");assert.equal(h.run(),false);
  assert.equal(h.hopper.moves,0);assert.equal(h.journal.has(h.key),true);
  assert.equal(h.run(),false);
});
test("native move thrown before mutation leaves visible intent and original item",()=>{
  const s=new Stack(),h=harness([undefined,s]);
  h.hopper.fault="before";
  assert.equal(h.run(),false);
  assert.equal(h.hopper.moves,1);assert.equal(h.journal.has(h.key),true);
  assert.equal(h.hopper.getItem(0),undefined);
  assert.deepEqual(fields(h.hopper.getItem(1)),fields(s));
});
test("native move thrown after mutation leaves moved item but never retries",()=>{
  const s=new Stack(),h=harness([undefined,s]);
  h.hopper.fault="after";
  assert.equal(h.run(),false);
  assert.equal(h.hopper.moves,1);
  assert.deepEqual(fields(h.hopper.getItem(0)),fields(s));
  assert.equal(h.hopper.getItem(1),undefined);
  assert.equal(h.journal.has(h.key),true);
  h.hopper.fault="";
  assert.equal(h.run(),false);
  assert.equal(h.hopper.moves,1);
});
test("source changed between intent and native call is held without replacing item",()=>{
  const h=harness([undefined,new Stack()]);
  h.afterJournalWrite(()=>{h.hopper.items[1].nameTag="external writer";});
  assert.equal(h.run(),false);assert.equal(h.hopper.moves,0);
  assert.equal(h.journal.has(h.key),true);
});
test("destination filled by foreign writer between intent and move is held",()=>{
  const h=harness([undefined,new Stack()]);
  h.afterJournalWrite(()=>{h.hopper.items[0]=new Stack("minecraft:cobblestone",3);});
  assert.equal(h.run(),false);assert.equal(h.hopper.moves,0);
  assert.equal(h.journal.has(h.key),true);
});
test("postmove opaque identity mismatch is HOLD and retains prepared journal",()=>{
  const h=harness([undefined,new Stack()]);
  h.hopper.afterMove=(_,to)=>{h.hopper.items[to].dyn["hart:owner"]="unexpected";};
  assert.equal(h.run(),false);
  assert.equal(h.journal.has(h.key),true);
  assert.equal(h.hopper.moves,1);
});
test("postmove physical clear failure retains pending marker and original metadata",()=>{
  const s=new Stack(),h=harness([undefined,s]);
  h.setClearFault(true);
  assert.equal(h.run(),false);assert.equal(h.journal.has(h.key),true);
  assert.deepEqual(fields(h.hopper.getItem(0)),fields(s));
  assert.equal(h.run(),false);assert.equal(h.hopper.moves,1);
});
test("reboot with PREPARED intent refuses new compaction; no automatic replay",()=>{
  const h=harness([undefined,new Stack()]);
  h.hopper.fault="after";assert.equal(h.run(),false);
  h.resetProcess();h.hopper.fault="";
  assert.equal(h.allowed(),false);
  assert.equal(h.run(),false);
  assert.equal(h.hopper.moves,1);
});
test("uninspectable metadata refuses compaction before any physical intent",()=>{
  const h=harness([undefined,new Stack()]);
  // Container.getItem returns a clone; corrupt a cloned-data field, not a method.
  h.hopper.items[1].destroy=null;
  assert.equal(h.run(),false);assert.equal(h.journal.size,0);
  assert.equal(h.hopper.moves,0);
});
test("world source block must be an actual Hopper and container must have five slots",()=>{
  const h=harness([undefined,new Stack()]);
  h.sourceBlock.typeId="minecraft:chest";
  assert.equal(h.run(),false);assert.equal(h.hopper.moves,0);
  h.sourceBlock.typeId="minecraft:hopper";h.hopper.size=27;
  assert.equal(h.run(),false);assert.equal(h.hopper.moves,0);
});
test("compiled routing gates are present before each known source mutator",()=>{
  for(const [name,args] of [
    ["processColumn","col, globalRemaining"],
    ["processCollectorIngress","collector, globalRemaining"],
    ["enqueueFromEjectedEntity","receiver, collector, entity, itemData, amount"],
    ["enqueueFromSource","receiver, collector, source, srcSlot, move, itemData"],
    ["dequeueToReceiver","receiver, output, maxMove"],
  ]) {
    const head=`function ${name}(${args}) {\n    if (!pg23TransportMayRun()) return 0;`;
    assert(compiled.includes(head),name+" lacks global HOLD gate");
  }
  assert.match(body("safeMovePartial"),/if \(!pg23TransportMayRun\(\)\) return 0;/);
  assert.match(body("recoverQueueJournal"),/getDynamicProperty\(JOURNAL_KEY\) !== undefined/);
});
test("redstone locked Sorter Hopper is checked before any PG23 compaction",()=>{
  const f=body("processColumn");
  assert(f.indexOf("if (hopperIsRedstoneLocked(sourceBlock)) return 0;")>=0);
  assert(f.indexOf("hopperIsRedstoneLocked(sourceBlock)")<
         f.indexOf("pg23CompactSourceHopper(src, sourceBlock)"));
});
