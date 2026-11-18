/**
 * U1 continuation — exact 1.4.2 Collector/Receiver early-capacity research.
 * Execute real sorterCollectorRoute and loadReceiverQueue source bodies, and
 * the actual direct Collector and ejected entity ingress guards.
 * A counterfactual capacity-first sorter route is defined IN TEST MEMORY ONLY.
 *
 * This tests causal invocation order, output and modeled migration effects,
 * not Bedrock timing, data durability, or owner-world throughput.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=fs.readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");
assert.equal(createHash("sha256").update(SRC).digest("hex"),
  "2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411",
  "Test must execute frozen 1.4.2 gameplay source");
function functionSource(name) {
  const start=SRC.indexOf("function "+name+"(");
  assert.ok(start>=0,"Missing real source function: "+name);
  const brace=SRC.indexOf("{",start);
  let depth=0,q="",escaped=false,line=false,block=false;
  for(let i=brace;i<SRC.length;i++){
    const c=SRC[i],n=SRC[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(q){if(escaped){escaped=false;continue;}if(c==="\\"){escaped=true;continue;}
      if(c===q)q="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c.charCodeAt(0)===96){q=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)return SRC.slice(start,i+1);
  }
  throw Error("Unclosed source function "+name);
}
function substitute(s,from,to){
  assert.equal(s.split(from).length-1,1,"Source drift: expected exact unique anchor");
  return s.replace(from,to);
}
function compile(body,env){
  const name=/^function (\w+)\(/.exec(body)?.[1];assert.ok(name);
  return vm.runInNewContext(body+"\n"+name+";",env,{timeout:3000,filename:name});
}
const originalSorter=functionSource("sorterCollectorRoute");
const actualLoader=functionSource("loadReceiverQueue");
const actualCollector=functionSource("processCollectorIngress");
const actualEjection=functionSource("processEjectedItemEntity");
const actualSerialize=functionSource("serializeQueueItem");
const originalSerializerOrder=`    const itemData = serializeQueueItem(stack);
    if (!itemData) return undefined;

    let queue;
    try {
        queue = loadReceiverQueue(receiver);
    } catch (err) {
        log(\`Sorter could not load Collector queue \${receiver.id}: \${err}\`);
        return undefined;
    }

    const room = QUEUE_CAPACITY - queue.total;
    if (room <= 0) return undefined;`;
const capacityFirstSorter=substitute(originalSorter,originalSerializerOrder,
`    let queue;
    try {
        queue = loadReceiverQueue(receiver);
    } catch (err) {
        log(\`Sorter could not load Collector queue \${receiver.id}: \${err}\`);
        return undefined;
    }

    const room = QUEUE_CAPACITY - queue.total;
    if (room <= 0) return undefined;
    const itemData = serializeQueueItem(stack);
    if (!itemData) return undefined;`);

function setup({route="baseline",qtotal=250000,itemSafe=true,queueMode="q4",
  cache=false,legacyCleanup=false,receiverFieldsDirty=false,missingReceiver=false,
  powered=false,unlinked=false,serializeThrows=false}={}){
  const effects=[],cacheMap=new Map();
  const receiver={id:"receiver-1",qVersion:receiverFieldsDirty?3:4,
    qShards:receiverFieldsDirty?2:0,qGen:receiverFieldsDirty?1:0,
    queued:0,received:0,delivered:0};
  const collector={id:"collector-1",link:unlinked?undefined:receiver.id};
  const q4meta={total:qtotal,head:qtotal?1:0,tail:qtotal?1:0,next:2,version:4};
  if(cache)cacheMap.set(receiver.id,{total:qtotal,meta:q4meta});
  const store=new Map();
  if(queueMode==="q4"||queueMode==="invalid")store.set("q4",queueMode==="invalid"?"{not-json":JSON.stringify(q4meta));
  if(queueMode==="legacy"||legacyCleanup)store.set("q3",JSON.stringify({total:qtotal}));
  const env={
    QUEUE_CAPACITY:250000,
    queueCache:cacheMap,
    queueMetaKey:()=> "q4",
    legacyQ3MetaKey:()=> "q3",
    safeJsonParse:(v,f)=>{try{return JSON.parse(v)}catch{return f}},
    world:{getDynamicProperty:k=>{effects.push("worldRead:"+k);return store.get(k);}},
    normalizeQueueMeta:(data)=>data?.version===4?data:undefined,
    newQueueState:meta=>{effects.push("newQ4");return {total:meta.total,meta};},
    syncReceiverFromQueueMeta:(r,m)=>{effects.push("syncReceiver");r.queued=m.total;},
    normalizeLegacyQ3Meta:x=>x?.total===undefined?undefined:x,
    getQueueJournal:()=>undefined,
    queueSeqFromEntryId:()=>1,
    cleanupLegacyQ3Queue:()=>{effects.push("cleanupQ3");},
    cleanupLegacyReceiverQueue:()=>{effects.push("cleanupQ2");},
    saveLogistics:()=>{effects.push("saveLogistics");},
    migrateReceiverQueueQ3ToV4:(_r,m)=>{effects.push("migrateQ3");return {total:m.total,meta:m};},
    migrateReceiverQueueQ2ToV4:()=>{effects.push("migrateQ2");return {total:qtotal,meta:q4meta};},
    initializeEmptyReceiverQueue:()=>{effects.push("initializeQ4");return {total:0,meta:q4meta};},
    findReceiverById:()=>{effects.push("findReceiver");return missingReceiver?undefined:receiver;},
    blockIsRedstonePowered:()=>{effects.push("poweredCheck");return powered;},
    serializeQueueItem:s=>{
      effects.push("serialize");
      if(serializeThrows)throw Error("synthetic unsupported native serializer");
      return s.safe?{typeId:s.typeId,meta:s.meta??""}:undefined;
    },
    log:m=>effects.push("log:"+m)
  };
  env.loadReceiverQueue=compile(actualLoader,env);
  const sorter=compile(route==="capacity-first"?capacityFirstSorter:originalSorter,env);
  const dest={block:{},collector};
  const stack={typeId:"minecraft:stone",amount:1,maxAmount:64,safe:itemSafe,meta:"named"};
  const result=()=>{let value,error;
    try{value=sorter(dest,stack)}catch(e){error=String(e);}
    return {
      value:value?{room:value.room,serialized:value.itemData,receiver:value.receiver.id}:undefined,
      error,effects:[...effects],
      receiver:{...receiver},
      cacheKeys:[...cacheMap.keys()]
    };
  };
  return {result,collector,receiver,dest,stack,effects,env};
}
const both=options=>({
  original:setup({...options,route:"baseline"}).result(),
  reordered:setup({...options,route:"capacity-first"}).result()
});
const calls=(result,name)=>result.effects.filter(e=>e===name).length;

test("ORDER-01 original, source-first and queue-first logic remain only test fixtures",()=>{
  assert.match(originalSorter,/const itemData = serializeQueueItem\(stack\)/);
  assert.match(actualLoader,/migrateReceiverQueueQ3ToV4/);
  assert.match(actualLoader,/cleanupLegacyQ3Queue/);
  assert.match(actualCollector,/const itemData = serializeQueueItem\(stack\)/);
  assert.match(actualEjection,/const itemData = serializeQueueItem\(stack\)/);
  assert.match(actualSerialize,/queueSafeNonstackRoundTrip/);
  assert.doesNotMatch(SRC,/function sorterCollectorRouteCapacityFirst\(/);
});
test("ORDER-02 verified q4 FULL with queue-safe cargo skips serialization, same final result",()=>{
  const {original,reordered}=both({qtotal:250000});
  assert.deepEqual(original.value,reordered.value);
  assert.equal(calls(original,"serialize"),1);
  assert.equal(calls(reordered,"serialize"),0);
  assert.deepEqual(original.receiver,reordered.receiver);
});
test("ORDER-03 near-full accepts a bounded one-unit offer with SAME return and effects",()=>{
  const {original,reordered}=both({qtotal:249999});
  assert.deepEqual(reordered.value,original.value);
  assert.equal(reordered.value.room,1);
  assert.equal(calls(reordered,"serialize"),1);
  assert.equal(calls(original,"serialize"),1);
  assert.notDeepEqual(original.effects,reordered.effects,
    "Even when both succeed, native operation ordering has changed");
});
test("ORDER-04 unsupported source stack must not load, migrate or initialize q4",()=>{
  for(const qmode of ["q4","legacy","absent"]){
    const {original,reordered}=both({queueMode:qmode,itemSafe:false,qtotal:250000});
    assert.equal(original.value,undefined);
    assert.equal(reordered.value,undefined);
    assert.equal(calls(original,"serialize"),1);
    assert.equal(original.effects.some(e=>e.startsWith("worldRead:")),false);
    assert.ok(reordered.effects.some(e=>e.startsWith("worldRead:")),
      "Queue-first reads world even for an item that cannot be queued");
    if(qmode==="legacy")assert.ok(reordered.effects.includes("migrateQ3"));
    if(qmode==="absent")assert.ok(reordered.effects.includes("initializeQ4"));
  }
});
test("ORDER-05 unreadable q4 metadata: rejected cargo no longer has same logging and work",()=>{
  const {original,reordered}=both({queueMode:"invalid",itemSafe:false});
  assert.equal(original.effects.some(e=>e.startsWith("log:")),false);
  assert.ok(reordered.effects.some(e=>e.startsWith("log:Sorter could not load")));
  assert.equal(original.effects.some(e=>e.startsWith("worldRead:")),false);
});
test("ORDER-06 old q3 cleanup and q2 counters can run for rejected cargo after reordering",()=>{
  const {original,reordered}=both({legacyCleanup:true,itemSafe:false,receiverFieldsDirty:true});
  assert.equal(original.effects.includes("cleanupQ3"),false);
  assert.ok(reordered.effects.includes("cleanupQ3"));
  assert.ok(reordered.effects.includes("cleanupQ2"));
  assert.ok(reordered.effects.includes("saveLogistics"));
});
test("ORDER-07 full q4 cannot be inferred from stale Receiver cached numeric metadata",()=>{
  const {original,reordered}=both({qtotal:250000,cache:false,receiverFieldsDirty:true});
  assert.equal(original.value,undefined);
  assert.equal(reordered.value,undefined);
  assert.equal(original.receiver.queued,250000);
  assert.equal(reordered.receiver.queued,250000);
  assert.ok(original.effects.includes("syncReceiver"));
  assert.ok(reordered.effects.includes("syncReceiver"));
});
test("ORDER-08 a cached Q4 entry is not a new native receipt or proof of outside writers",()=>{
  const {original,reordered}=both({qtotal:250000,cache:true});
  assert.equal(original.value,undefined);
  assert.equal(reordered.value,undefined);
  assert.equal(original.effects.some(e=>e.startsWith("worldRead:")),false);
  assert.equal(reordered.effects.some(e=>e.startsWith("worldRead:")),false);
  assert.equal(calls(reordered,"serialize"),0);
  // This model does not establish cache validity after restart or an external
  // writer. It only confirms the EXISTING cache path in actual loadReceiverQueue.
});
test("ORDER-09 disconnected, missing and powered Collector never touches queue",()=>{
  for(const opt of [{unlinked:true},{missingReceiver:true},{powered:true}]){
    const {original,reordered}=both(opt);
    assert.deepEqual(reordered,original);
    assert.equal(calls(original,"serialize"),0);
    assert.equal(original.effects.some(e=>e.startsWith("worldRead:")),false);
  }
});
test("ORDER-10 supported cargo + unreadable queue preserves reject/log but shifts serializer work",()=>{
  const {original,reordered}=both({queueMode:"invalid",itemSafe:true});
  assert.deepEqual(original.value,reordered.value);
  assert.equal(calls(original,"serialize"),1);
  assert.equal(calls(reordered,"serialize"),0);
  assert.ok(reordered.effects.some(e=>e.startsWith("log:")));
  assert.ok(original.effects.some(e=>e.startsWith("log:")));
});
test("ORDER-11 a serializer throw is not equivalent to a queue-first full exit",()=>{
  const {original,reordered}=both({serializeThrows:true,qtotal:250000});
  assert.match(original.error,/unsupported native serializer/);
  assert.equal(reordered.error,undefined);
  assert.equal(reordered.value,undefined);
});
test("ORDER-12 direct Collector ingress deliberately uses queue state for MR fallback",()=>{
  const source=actualCollector;
  const normal=source.indexOf("const itemData = serializeQueueItem(stack);");
  const unsupported=source.indexOf("if (itemData) {",normal);
  const direct=source.indexOf("let qTotal;",unsupported);
  const explicit=source.indexOf("loadReceiverQueue(receiver).total",direct);
  const output=source.indexOf("qTotal === 0",explicit);
  assert.ok(normal>=0&&normal<unsupported&&unsupported<direct&&direct<explicit&&explicit<output);
  assert.match(source,/recordDirectReceiverTransfer\(receiver, moved\)/);
  assert.match(source,/return used;\s*\}\s*const receiverBlock = receiverAt/);
});
test("ORDER-13 ejected item entity remains world-owned if it is not serializable",()=>{
  const s=actualEjection;
  assert.ok(s.indexOf("const itemData = serializeQueueItem(stack)")>=0);
  assert.match(s,/if \(!itemData\) \{[\s\S]*?return;[\s\S]*?\}/);
  assert.ok(s.indexOf("serializeQueueItem(stack)")<s.indexOf("enqueueFromEjectedEntity(receiver"));
  assert.doesNotMatch(s,/loadReceiverQueue\(receiver\)/,
    "Live queue read occurs deeper in actual enqueueFromEjectedEntity");
});
test("ORDER-14 exact source serialization can reconstruct and check rich native identity",()=>{
  assert.match(actualSerialize,/getLore\(\)/);
  assert.match(actualSerialize,/getCanDestroy\(\)/);
  assert.match(actualSerialize,/getCanPlaceOn\(\)/);
  assert.match(actualSerialize,/getComponent\("minecraft:durability"\)/);
  assert.match(actualSerialize,/dynamicProps\(stack\)/);
  assert.match(actualSerialize,/rebuildQueueItem\(data, 1\)/);
  assert.match(actualSerialize,/isStackableWith\(rebuilt\)/);
  assert.match(actualSerialize,/QUEUE_ENTRY_MAX_CHARS/);
});
test("ORDER-15 no new cached chest capacity or added gameplay writer is used",()=>{
  assert.match(actualLoader,/queueCache\.has\(receiver\.id\)/);
  assert.match(actualCollector,/if \(q\.total >= QUEUE_CAPACITY\) return used/);
  assert.match(actualSorter,/const room = QUEUE_CAPACITY - queue\.total/);
  assert.match(actualEjection,/getQueueJournal\(\)/);
});
