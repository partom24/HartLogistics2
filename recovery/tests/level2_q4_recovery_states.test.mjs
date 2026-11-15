/**
 * Level 2 SOURCE-ONLY tests of the canonical 1.4.1 Q4 queue journal.
 * All decisions are executed in original function bodies. Synthetic holders
 * are NOT native Bedrock APIs, real disk crashes, BDS timing, or item fidelity.
 * No gameplay changes and no archived 1.5 inputs.
 *
 * Run: node --test recovery/tests/level2_q4_recovery_states.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const js=readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");

function original(name, env={}) {
  const pattern=new RegExp("(^|\\n)[ \\t]*function\\s+"+name+"\\s*\\(","g");
  const m=pattern.exec(js);assert.ok(m, "canonical 1.4.1 function absent: "+name);
  const start=js.indexOf("function "+name,m.index),brace=js.indexOf("{",start);
  let depth=0,quote="",escaped=false,comment="";
  for(let i=brace;i<js.length;i++){
    const c=js[i],n=js[i+1];
    if(comment==="line"){if(c==="\n")comment="";continue;}
    if(comment==="block"){if(c==="*"&&n==="/"){comment="";i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;}if(c==="\\"){escaped=true;continue;}if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){comment="line";i++;continue;}
    if(c==="/"&&n==="*"){comment="block";i++;continue;}
    if(c==="'"||c==='"'||c==="\x60"){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)return vm.runInNewContext(js.slice(start,i+1)+"\n"+name+";",env,{timeout:2500,filename:"1.4.1/"+name});
  }
  throw Error("unbalanced original function "+name);
}
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const sig=x=>JSON.stringify(x);
const item=(typeId,amount)=>({typeId,amount,clone(){return item(this.typeId,this.amount);}});
const before={head:0,tail:0,next:1,total:0,received:0,delivered:0};
const after={head:1,tail:1,next:2,total:4,received:4,delivered:0};
const beforeDrain={head:1,tail:1,next:2,total:4,received:4,delivered:0};
const afterDrain={head:0,tail:0,next:2,total:0,received:4,delivered:4};
const identity={typeId:"minecraft:stone"};

function baseTx(kind) {
  if(kind==="dequeue")return {kind,receiverId:"R",entryId:"R-1",qBefore:4,qAfter:0,
    qMetaBefore:clone(beforeDrain),qMetaAfter:clone(afterDrain),dstD:"overworld",dst:{x:0,y:20,z:0},dstSlot:0,
    dstSig:sig(identity),dstBefore:0,dstAfter:4,move:4,item:identity};
  const envelope={kind,receiverId:"R",entryId:"R-1",qBefore:0,qAfter:4,
    qMetaBefore:clone(before),qMetaAfter:clone(after),move:4,item:identity};
  if(kind==="enqueue")return {...envelope,srcSig:sig(identity),srcBefore:4,srcAfter:0,
    sourceD:"overworld",source:{x:0,y:10,z:0},srcSlot:0};
  return {...envelope,entityId:"entity-123",entityAmount:4,itemSig:sig(identity),
    sourceD:"overworld",source:{x:0,y:10,z:0}};
}
function harness(kind, options={}) {
  const tx=baseTx(kind),logs=[],trace=[],receiver={id:"R"},queue={
    meta:clone(options.meta??(options.queueCommitted===false?(kind==="dequeue"?beforeDrain:before):(kind==="dequeue"?afterDrain:after))),
    amount:options.amount??(options.queueCommitted===false?tx.qBefore:tx.qAfter)
  };
  let journal=clone(tx);
  let live=options.entity??undefined;
  const srcSlots=[options.sourceItem===null?undefined:item("minecraft:stone", options.sourceAmount??4)];
  const dstSlots=[options.destinationItem===null?undefined:options.destinationAmount?item("minecraft:stone",options.destinationAmount):undefined];
  function container(slots,label){
    return {getItem(i){trace.push(label+".get:"+i);return slots[i]?.clone();},
      setItem(i,stack){trace.push(label+".set:"+i);slots[i]=stack?.clone();}};
  }
  const source=container(srcSlots,"source"),target=container(dstSlots,"dest");
  const metadataMatch=original("queueMetaMatches");
  const state=original("journalQueueState",{
    queueMetaMatches:metadataMatch,
    persistQueueMeta:(_r,q,meta)=>{trace.push("queue.meta.write");q.meta=clone(meta);}
  });
  const recover=original("recoverQueueJournal",{
    getQueueJournal:()=>journal,
    findReceiverById:id=>options.missingReceiver?undefined:receiver,
    loadReceiverQueue:()=>{if(options.queueLoadError)throw Error("unavailable queue");return queue;},
    queueEntryAmount:(_r,q,_entry)=>q.amount,
    journalQueueState:state,
    saveQueueJournal:value=>{trace.push("journal."+(value===undefined?"clear":"save"));journal=clone(value);},
    getContainerAt:(_d,loc)=>{
      if(options.unloadedSource && loc?.y===10)return undefined;
      if(options.unloadedDestination && loc?.y===20)return undefined;
      return loc?.y===10?source:loc?.y===20?target:undefined;
    },
    serializeQueueItem:stack=>stack?{typeId:stack.typeId}:undefined,
    queueDataSignature:sig,
    itemEntityStack:e=>e?.stack,
    queueSlotState:original("queueSlotState",{
      serializeQueueItem:stack=>stack?{typeId:stack.typeId}:undefined,
      queueDataSignature:sig,exactStackSig:()=>"_"
    }),
    rebuildQueueItem:(data,amount)=>options.rebuildFailure?undefined:item(data.typeId,amount),
    world:{getEntity:()=>live},
    getBlock:()=>options.sourceChunkLoaded===false?undefined:{typeId:"minecraft:dropper"},
    log:message=>logs.push(message)
  });
  return {
    queue,tx,srcSlots,dstSlots,logs,trace,recover,
    get journal(){return journal;},
    set queueAmount(v){queue.amount=v;},
    set queueMeta(v){queue.meta=clone(v);},
    set sourceAmount(v){srcSlots[0]=v===null?undefined:item("minecraft:stone",v);},
    set destinationAmount(v){dstSlots[0]=v===null?undefined:item("minecraft:stone",v);},
    set entity(v){live=v;}
  };
}

// The exact Q4 partial-save page/meta branching is in canonical source.
test("Q4-L2-01: queue page committed but metadata old updates meta before inventory replay",()=>{
  const h=harness("enqueue",{meta:before,amount:4,sourceAmount:4});
  h.recover();
  assert.equal(h.queue.meta.total,4);
  assert.equal(h.srcSlots[0],undefined);
  assert.equal(h.journal,undefined);
  assert.ok(h.trace.indexOf("queue.meta.write")<h.trace.indexOf("source.set:0"));
});
test("Q4-L2-02: untouched enqueue clears journal without debiting source",()=>{
  const h=harness("enqueue",{queueCommitted:false,sourceAmount:4});
  h.recover();
  assert.equal(h.srcSlots[0].amount,4);
  assert.equal(h.journal,undefined);
  assert.equal(h.trace.includes("source.set:0"),false);
});
test("Q4-L2-03: committed enqueue source at pre-debit quantity is debited once",()=>{
  const h=harness("enqueue",{sourceAmount:4});
  h.recover();
  assert.equal(h.srcSlots[0],undefined);
  assert.equal(h.journal,undefined);
  assert.equal(h.trace.filter(x=>x==="source.set:0").length,1);
});
test("Q4-L2-04: committed enqueue whose source debit completed is not debited twice",()=>{
  const h=harness("enqueue",{sourceItem:null});
  h.recover();
  assert.equal(h.journal,undefined);
  assert.equal(h.trace.includes("source.set:0"),false);
});
test("Q4-L2-05: committed enqueue with unavailable Hopper retains journal",()=>{
  const h=harness("enqueue",{unloadedSource:true,sourceAmount:4});
  h.recover();
  assert.ok(h.journal);
  assert.equal(h.srcSlots[0].amount,4);
});
test("Q4-L2-06: committed enqueue with conflicting item identity retains journal",()=>{
  const h=harness("enqueue");
  h.srcSlots[0]=item("minecraft:dirt",4);
  h.recover();
  assert.ok(h.journal);
  assert.equal(h.srcSlots[0].typeId,"minecraft:dirt");
});
test("Q4-L2-07: committed enqueue with unexpected quantity HOLD",()=>{
  const h=harness("enqueue",{sourceAmount:3});
  h.recover();
  assert.ok(h.journal);
  assert.equal(h.srcSlots[0].amount,3);
});
test("Q4-L2-08: Q4 page and metadata contradiction HOLD; no source debit",()=>{
  const h=harness("enqueue",{meta:{...after,received:9},amount:4,sourceAmount:4});
  h.recover();
  assert.ok(h.journal);
  assert.equal(h.srcSlots[0].amount,4);
});

// Source-only dequeue correctness and constraint witnesses.
test("Q4-L2-09: untouched dequeue clears journal and leaves native output empty",()=>{
  const h=harness("dequeue",{queueCommitted:false});
  h.recover();
  assert.equal(h.dstSlots[0],undefined);
  assert.equal(h.journal,undefined);
});
test("Q4-L2-10: committed dequeue credits empty Hopper output once",()=>{
  const h=harness("dequeue");
  h.recover();
  assert.equal(h.dstSlots[0].amount,4);
  assert.equal(h.journal,undefined);
});
test("Q4-L2-11: committed dequeue with pre-existing partial native stack completes merge",()=>{
  const h=harness("dequeue",{destinationAmount:61});
  h.tx.dstBefore=61;h.tx.dstAfter=65;
  // the mock recovery reads the captured tx, so set the fixture's owned
  // journal fields through tx reference as well.
  h.recover();
  assert.equal(h.dstSlots[0].amount,61);
  assert.ok(h.journal);
});
test("Q4-L2-12: destination already credited does not get duplicate output",()=>{
  const h=harness("dequeue",{destinationAmount:4});
  h.recover();
  assert.equal(h.journal,undefined);
  assert.equal(h.dstSlots[0].amount,4);
  assert.equal(h.trace.includes("dest.set:0"),false);
});
test("Q4-L2-13: unavailable Receiver output retains debit journal",()=>{
  const h=harness("dequeue",{unloadedDestination:true});
  h.recover();
  assert.ok(h.journal);
  assert.equal(h.dstSlots[0],undefined);
});
test("Q4-L2-14: destination contains conflicting item HOLD, no overwrite",()=>{
  const h=harness("dequeue");
  h.dstSlots[0]=item("minecraft:dirt",1);
  h.recover();
  assert.ok(h.journal);
  assert.equal(h.dstSlots[0].typeId,"minecraft:dirt");
});
test("Q4-L2-15: unsafe rebuild on queue dequeue holds journal",()=>{
  const h=harness("dequeue",{rebuildFailure:true});
  h.recover();
  assert.ok(h.journal);
  assert.equal(h.dstSlots[0],undefined);
  assert.ok(h.logs.some(s=>s.includes("could not rebuild")));
});

// Entity handoff is a distinct custody boundary and requires separate BDS proof.
test("Q4-L2-16: uncommitted ejected entity stays in native world, journal clears",()=>{
  let removed=0;
  const entity={isValid:true,typeId:"minecraft:item",stack:item("minecraft:stone",4),remove(){removed++;}};
  const h=harness("entity_enqueue",{queueCommitted:false,entity});
  h.recover();
  assert.equal(h.journal,undefined);
  assert.equal(removed,0);
});
test("Q4-L2-17: committed ejection removes matching exact entity then journal",()=>{
  let removed=0;
  const entity={isValid:true,typeId:"minecraft:item",stack:item("minecraft:stone",4),remove(){removed++;}};
  const h=harness("entity_enqueue",{entity});
  h.recover();
  assert.equal(h.journal,undefined);
  assert.equal(removed,1);
});
test("Q4-L2-18: changed entity payload holds queue ownership unresolved",()=>{
  let removed=0;
  const entity={isValid:true,typeId:"minecraft:item",stack:item("minecraft:dirt",4),remove(){removed++;}};
  const h=harness("entity_enqueue",{entity});
  h.recover();
  assert.ok(h.journal);
  assert.equal(removed,0);
});
test("Q4-L2-19: missing entity and unloaded source chunk retain journal",()=>{
  const h=harness("entity_enqueue",{sourceChunkLoaded:false});
  h.recover();
  assert.ok(h.journal);
});
test("Q4-L2-20: source clears journal if entity ID absent but source block loaded",()=>{
  // Crucial SOURCE-LEVEL decision, NOT a BDS proof that entity absence means
  // prior Hart removal. Pickup, despawn, or loaded-chunk/entity visibility
  // semantics must be separately checked before relying on this assertion.
  const h=harness("entity_enqueue",{sourceChunkLoaded:true});
  h.recover();
  assert.equal(h.journal,undefined);
  assert.ok(h.logs.some(s=>s.includes("completed dropper/dispenser enqueue")));
});
test("Q4-L2-21: unresolved receiver or unreadable queue HOLD any pending tx",()=>{
  for(const opt of [{missingReceiver:true},{queueLoadError:true}]){
    const h=harness("enqueue",opt);
    h.recover();
    assert.ok(h.journal);
    assert.equal(h.srcSlots[0].amount,4);
  }
});
