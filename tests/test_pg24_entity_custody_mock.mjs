import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const pg24Path=new URL("../build/pg24-lab/behavior_pack/scripts/main.js",import.meta.url);
const pg23Path=new URL("../build/pg23-lab/behavior_pack/scripts/main.js",import.meta.url);
if(!fs.existsSync(pg24Path)||!fs.existsSync(pg23Path))
  throw Error("Build exact PG23 and PG24 sources before source-executed tests");
const pg24=fs.readFileSync(pg24Path,"utf8");
const pg23=fs.readFileSync(pg23Path,"utf8");

function body(source,name){
  const key="function "+name+"(",i=source.indexOf(key);
  assert(i>=0,"missing compiled function "+name);
  const j=source.indexOf("\nfunction ",i+key.length);
  return source.slice(i,j<0?undefined:j);
}
const functions=[
  "enqueueFromEjectedEntity","pg24PreservePendingEntityJournal",
  "pg24VerifyEjectedCommit","pg24ClearVerifiedEntityIntent",
  "recoverQueueJournal","pg23TransportMayRun"
];
const actual=functions.map(n=>body(pg24,n)).join("\n");
const originalRecovery=body(pg23,"recoverQueueJournal");

function harness(config={}){
  const raw=new Map(),holds=[],logs=[];
  const items=new Map(),definitions=new Map();
  const q={total:0,meta:{version:4,head:0,tail:0,next:1,total:0,received:0,delivered:0},last:null};
  const receiver={id:"testReceiver",queueKey:"testQ4"};
  const collector={id:"testCollector",x:-944,y:69,z:-814,accepted:0};
  const stack={typeId:"minecraft:cobblestone",amount:8};
  const itemData={typeId:"minecraft:cobblestone",extra:"pristine"};
  let removes=0, journalWrites=0, finalClearWrites=0, onQueuePersist=null;
  const entity={
    id:"source-entity-uuid",isValid:true,typeId:"minecraft:item",dimension:{id:"minecraft:overworld"},
    current:{...stack},
    getComponent:key=>key==="minecraft:item"?{itemStack:{...entity.current}}:undefined,
    remove(){
      if(config.entityRemoval==="throw_before")throw Error("remove before cut");
      this.isValid=false;removes++;
      if(config.entityRemoval==="throw_after")throw Error("remove after cut");
    }
  };
  const srcBlock={location:{x:-944,y:69,z:-814},dimension:{id:"minecraft:overworld"}};
  const world={
    getDynamicProperty(key){
      if(config.journalReadError&&key==="Q4_KEY")throw Error("read error");
      let value=raw.get(key);
      if(key==="Q4_KEY" && config.tamperIntentReadback && journalWrites>0 && finalClearWrites===0)
        return "different intent";
      if(key==="Q4_META" && config.tamperMeta)return "not-meta";
      if(key==="Q4_DEFINITION" && config.tamperDefinition)return "wrong-definition";
      return value;
    },
    getEntity(){throw Error("Recovery must not query/remove a recovered entity")}
  };
  const queueDataSignature=data=>JSON.stringify(data);
  const context={
    world,QUEUE_CAPACITY:250000,QUEUE_JOURNAL_KEY:"Q4_KEY",JOURNAL_KEY:"PHYSICAL_KEY",
    pg20ReportHold:msg=>holds.push(msg), log:msg=>logs.push(msg),
    safeJsonParse:(raw,fallback)=>{try{return JSON.parse(raw);}catch{return fallback}},
    queueDataSignature, itemEntityStack:e=>e.isValid?{...e.current}:undefined,
    serializeQueueItem:s=>s?{typeId:s.typeId,extra:"pristine"}:undefined,
    loadReceiverQueue:()=>q,
    queueTailEntry:()=>q.last,
    queueMetaSnapshot:m=>Object.fromEntries(["head","tail","next","total","received","delivered"].map(k=>[k,m[k]])),
    queueEntryId:(_,n)=>"testQ4:e"+n,
    collectorAt:()=>srcBlock,
    saveQueueJournal(tx){
      if(tx!==undefined){
        if(config.journalWriteError==="before")throw Error("journal write failed before");
        raw.set("Q4_KEY",JSON.stringify(tx));journalWrites++;
        if(config.journalWriteError==="after")throw Error("journal write failed after");
      }else{
        if(config.clearError==="before")throw Error("journal clear failed before");
        raw.delete("Q4_KEY");finalClearWrites++;
        if(config.clearError==="after")throw Error("journal clear failed after");
      }
    },
    persistQueueEntry(_,__,seq,entry){
      items.set(seq,{id:"testQ4:e"+seq,defId:"d1",data:entry.data,amount:entry.amount});
      definitions.set("d1",queueDataSignature(entry.data));
      raw.set("Q4_DEFINITION",queueDataSignature(entry.data));
      if(config.onPersistEntry) config.onPersistEntry({entity,raw,items,receiver,q});
    },
    persistQueueMeta(_,__,meta){
      q.meta={...meta,version:4};q.total=meta.total;
      raw.set("Q4_META",JSON.stringify({v:4,h:meta.head,t:meta.tail,n:meta.next,
                                  q:meta.total,r:meta.received,d:meta.delivered}));
      if(config.onPersistMeta)config.onPersistMeta({entity,raw,items,receiver,q});
    },
    queueMetaKey:()=> "Q4_META",
    normalizeQueueMeta:(m)=>m&&m.v===4?{head:m.h,tail:m.t,next:m.n,
                                    total:m.q,received:m.r,delivered:m.d}:undefined,
    queueMetaMatches:(meta,snap)=>!!meta&&["head","tail","next","total","received","delivered"]
      .every(k=>meta[k]===snap[k]),
    queueSeqFromEntryId:(_,id)=>id==="testQ4:e1"?1:undefined,
    readQueueEntry:(_,__,seq,force)=>{
      assert.equal(force,true);
      const stored=items.get(seq);
      if(!stored)return undefined;
      return config.tamperPage?{...stored,amount:stored.amount+1}:stored;
    },
    queueDefinitionKey:()=> "Q4_DEFINITION",
    markLogisticsDirty(){},
    getQueueJournal:()=> {
      const rawValue=raw.get("Q4_KEY");
      try{return rawValue===undefined?undefined:JSON.parse(rawValue)}catch{return undefined}
    }
  };
  if(config.mergeExisting){
    q.total=4;
    q.meta={version:4,head:1,tail:1,next:2,total:4,received:4,delivered:0};
    q.last={id:"testQ4:e1",seq:1,data:itemData,amount:4};
    items.set(1,{id:"testQ4:e1",seq:1,defId:"d1",data:itemData,amount:4});
    raw.set("Q4_META",JSON.stringify({v:4,h:1,t:1,n:2,q:4,r:4,d:0}));
    raw.set("Q4_DEFINITION",queueDataSignature(itemData));
  }
  vm.runInNewContext("let pg24EntityHold=false;let pg23LocalHold=false;\n"+actual,context);
  return {
    context,world,raw,q,receiver,collector,entity,itemData,holds,logs,items,
    run:()=>context.enqueueFromEjectedEntity(receiver,collector,entity,itemData,8),
    recover:()=>context.recoverQueueJournal(),
    checkRecovery:()=>context.pg24PreservePendingEntityJournal(),
    transport:()=>context.pg23TransportMayRun(),
    counters:()=>({removes,journalWrites,finalClearWrites})
  };
}
const assertHold=h=>{
  assert.ok(h.holds.length>0,"expected a HOLD diagnostic");
  assert.equal(h.transport(),false);
};
test("derived candidate preserves PG23 native Hopper transfer and only changes entity ingress",()=>{
  assert.match(pg24,/const VERSION = "1\.5\.7-LAB-PG24";/);
  assert.match(pg24,/function pg23CompactSourceHopper\(/);
  assert.match(pg24,/container\.moveItem\(read, write, container\)/);
  assert.match(pg24,/function pg20MoveOpaqueNative\(/);
  assert.doesNotMatch(pg24,/function compactSourceHopper\(/);
  const fn=body(pg24,"enqueueFromEjectedEntity");
  assert.match(fn,/pg24VerifyEjectedCommit\(receiver, q, tx, entity\)/);
  assert.doesNotMatch(fn,/\bentity\.remove\(\)/);
});
test("one ordinary vanilla ejected stack gets one Q4 credit and exactly one entity removal",()=>{
  const h=harness();
  assert.equal(h.run(),8);
  assert.deepEqual(h.counters(),{removes:1,journalWrites:1,finalClearWrites:1});
  assert.equal(h.entity.isValid,false);
  assert.equal(h.q.total,8);
  assert.equal(h.collector.accepted,8);
  assert.equal(h.raw.has("Q4_KEY"),false);
  assert.equal(h.holds.length,0);
  assert.equal(h.transport(),true);
});
test("valid Q4 merge requires same stored source signature and precise amount",()=>{
  const h=harness({mergeExisting:true});
  assert.equal(h.run(),8);
  assert.equal(h.q.total,12);
  assert.equal(h.items.get(1).amount,12);
  assert.equal(h.counters().removes,1);
  assert.equal(h.raw.has("Q4_KEY"),false);
});
test("at-capacity ejection never opens an intent or removes vanilla entity",()=>{
  const h=harness();h.q.total=250000;
  assert.equal(h.run(),0);
  assert.deepEqual(h.counters(),{removes:0,journalWrites:0,finalClearWrites:0});
  assert.equal(h.entity.isValid,true);
});
test("journal write failure before intent is incapable of removing a source entity",()=>{
  const h=harness({journalWriteError:"before"});
  assert.throws(()=>h.run(),/journal write failed before/);
  assert.equal(h.counters().removes,0);assert.equal(h.raw.has("Q4_KEY"),false);
});
test("journal write failure after intent retains marker and never removes source",()=>{
  const h=harness({journalWriteError:"after"});
  assert.throws(()=>h.run(),/journal write failed after/);
  assert.equal(h.counters().removes,0);assert.equal(h.raw.has("Q4_KEY"),true);
  assert.equal(h.checkRecovery(),true);assertHold(h);
});
test("mismatched immediate prepared journal blocks queue and entity mutation",()=>{
  const h=harness({tamperIntentReadback:true});
  assert.throws(()=>h.run(),/intent readback mismatch/);
  assert.equal(h.counters().removes,0);
  assert.equal(h.items.size,0);
  assertHold(h);
});
test("missing or corrupted Q4 page after persist never deletes source entity",()=>{
  const h=harness({tamperPage:true});
  assert.throws(()=>h.run(),/queue page\/definition readback mismatch/);
  assert.equal(h.counters().removes,0);
  assert.equal(h.raw.has("Q4_KEY"),true);assertHold(h);
});
test("missing Q4 item definition after persist is a custody HOLD",()=>{
  const h=harness({tamperDefinition:true});
  assert.throws(()=>h.run(),/queue page\/definition readback mismatch/);
  assert.equal(h.counters().removes,0);assertHold(h);
});
test("metadata readback changed after commit is a custody HOLD",()=>{
  const h=harness({tamperMeta:true});
  assert.throws(()=>h.run(),/metadata readback mismatch/);
  assert.equal(h.counters().removes,0);assertHold(h);
});
test("foreign writer changes entity item amount after Q4 credit: no source deletion",()=>{
  const h=harness({onPersistMeta:({entity})=>entity.current.amount=6});
  assert.throws(()=>h.run(),/source stack no longer matches intent/);
  assert.equal(h.counters().removes,0);assertHold(h);
});
test("foreign writer changes entity item type after Q4 credit: no source deletion",()=>{
  const h=harness({onPersistMeta:({entity})=>entity.current.typeId="minecraft:diamond"});
  assert.throws(()=>h.run(),/source stack no longer matches intent/);
  assert.equal(h.counters().removes,0);assertHold(h);
});
test("source entity becomes invalid after Q4 credit: no double removal",()=>{
  const h=harness({onPersistMeta:({entity})=>entity.isValid=false});
  assert.throws(()=>h.run(),/source entity identity changed/);
  assert.equal(h.counters().removes,0);assertHold(h);
});
test("source identity changes after Q4 credit: no removal of unrelated entity",()=>{
  const h=harness({onPersistMeta:({entity})=>entity.id="other-entity"});
  assert.throws(()=>h.run(),/source entity identity changed/);
  assert.equal(h.counters().removes,0);assertHold(h);
});
test("native entity removal can throw before mutation: marker and HOLD preserved",()=>{
  const h=harness({entityRemoval:"throw_before"});
  assert.throws(()=>h.run(),/remove before cut/);
  assert.equal(h.counters().removes,0);
  assert.equal(h.raw.has("Q4_KEY"),true);assertHold(h);
});
test("native entity removal can throw after mutation: never replay or clear pending intent",()=>{
  const h=harness({entityRemoval:"throw_after"});
  assert.throws(()=>h.run(),/remove after cut/);
  assert.equal(h.counters().removes,1);assert.equal(h.entity.isValid,false);
  assert.equal(h.raw.has("Q4_KEY"),true);assertHold(h);
});
test("journal clear failure before property change preserves marker and HOLD",()=>{
  const h=harness({clearError:"before"});
  assert.throws(()=>h.run(),/journal clear failed before/);
  assert.equal(h.counters().removes,1);
  assert.equal(h.raw.has("Q4_KEY"),true);assertHold(h);
});
test("journal clear failure after property change still causes process HOLD",()=>{
  const h=harness({clearError:"after"});
  assert.throws(()=>h.run(),/journal clear failed after/);
  assert.equal(h.counters().removes,1);
  assert.equal(h.raw.has("Q4_KEY"),false);
  assertHold(h);
});
test("missing entity after Q4 receipt and reboot is no proof of removal: HOLD, no journal clear",()=>{
  const h=harness();h.raw.set("Q4_KEY",JSON.stringify({kind:"entity_enqueue",entityId:"missing"}));
  assert.equal(h.checkRecovery(),true);
  assertHold(h);
  assert.equal(h.raw.has("Q4_KEY"),true);
  assert.equal(h.counters().removes,0);
});
test("recovered pending entity journal refuses even when the source still exists",()=>{
  const h=harness();h.raw.set("Q4_KEY",JSON.stringify({kind:"entity_enqueue",entityId:h.entity.id}));
  assert.equal(h.recover(),undefined);
  assert.equal(h.raw.has("Q4_KEY"),true);
  assert.equal(h.counters().removes,0);
  assertHold(h);
});
test("recovered corrupted entity journal does not clear or remove anything",()=>{
  const h=harness();h.raw.set("Q4_KEY",'{"kind":"entity_enqueue","entityId":"a"');
  assert.equal(h.checkRecovery(),false); // prior PG23 malformed-raw HOLD handles it
  assert.equal(h.transport(),false);
  assert.equal(h.raw.has("Q4_KEY"),true);
});
test("world Q4 journal read error holds all Hart movement",()=>{
  const h=harness({journalReadError:true});
  assert.equal(h.checkRecovery(),true);assertHold(h);
  assert.equal(h.counters().removes,0);
});
test("clean restart without any queued marker doesn't create a sticky HOLD",()=>{
  const h=harness();
  assert.equal(h.checkRecovery(),false);
  assert.equal(h.holds.length,0);
  assert.equal(h.transport(),true);
});
test("outstanding unrelated Q4 enqueue is left to the existing conservative PG23 gate",()=>{
  const h=harness();h.raw.set("Q4_KEY",JSON.stringify({kind:"enqueue"}));
  assert.equal(h.checkRecovery(),false);
  assert.equal(h.transport(),false);
  assert.equal(h.counters().removes,0);
});
test("the exact PG23 recovery used to clear an after-queue entity that disappeared in loaded chunk",()=>{
  const reports=[],store={value:"q4-intent"};
  const context={
    JOURNAL_KEY:"phys",QUEUE_JOURNAL_KEY:"q4",
    world:{getDynamicProperty:()=>undefined,getEntity:()=>undefined},
    getQueueJournal:()=>({kind:"entity_enqueue",receiverId:"R",entryId:"q:e1",
      entityId:"missing",sourceD:"minecraft:overworld",source:{x:0,y:70,z:0}}),
    findReceiverById:()=>({id:"R"}),loadReceiverQueue:()=>({}),
    queueEntryAmount:()=>8,journalQueueState:()=>"after",
    getBlock:()=>({typeId:"minecraft:collector"}),
    saveQueueJournal:tx=>store.value=tx,
    log:s=>reports.push(s)
  };
  vm.runInNewContext(originalRecovery,context);
  context.recoverQueueJournal();
  assert.equal(store.value,undefined,"original PG23 cleared intent despite absent entity");
  assert.ok(reports.some(x=>x.includes("Recovered completed dropper/dispenser")));
  // Source-level policy hazard: does not prove a real BDS duplication/loss.
});
test("PG24 source explicitly prevents missing-entity Q4 recovery before metadata classifier",()=>{
  const source=body(pg24,"recoverQueueJournal");
  assert(source.includes("if (pg24PreservePendingEntityJournal()) return;"));
  assert(source.indexOf("pg24PreservePendingEntityJournal()")<
    source.indexOf("getQueueJournal()"));
});
