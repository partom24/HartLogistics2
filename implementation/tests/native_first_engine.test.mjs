/**
 * Native-first engine implementation candidate tests.
 *
 * These execute ORIGINAL 1.4.1 function bodies as modified only on
 * implementation/native-first-engine-141-20261115. No BDS or 1.5 inputs.
 * Native Container results are tightly controlled synthetic mocks; a green
 * test is a source behavior check, NOT actual engine performance acceptance.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SOURCE=fs.readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,"addon/behavior_pack/manifest.json"),"utf8"));
const objective=fs.readFileSync(path.join(ROOT,"OWNER_PRODUCT_OBJECTIVE.md"),"utf8");

function originalFunction(name,context={}) {
  const declaration=new RegExp("(^|\\n)[ \\t]*(?:async\\s+)?function\\s+"+name+"\\s*\\(","g");
  const m=declaration.exec(SOURCE);
  assert.ok(m,"Missing original 1.4.1 function: "+name);
  const start=SOURCE.indexOf("function "+name,m.index),brace=SOURCE.indexOf("{",start);
  let depth=0,quote="",escaped=false,line=false,block=false;
  for(let i=brace;i<SOURCE.length;i++){
    const c=SOURCE[i],n=SOURCE[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;}if(c==="\\"){escaped=true;continue;}if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c==="\x60"){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0) {
      return vm.runInNewContext(SOURCE.slice(start,i+1)+"\n"+name+";",context,
        {filename:"candidate/1.4.1:"+name,timeout:2500});
    }
  }
  throw Error("Unbalanced 1.4.1 function: "+name);
}
function nativeContainer(slots,events) {
  return {
    size:slots.length,isValid:true,
    firstItem() {events.push("firstItem");const i=slots.findIndex(x=>x!==undefined);
      return i>=0?i:undefined;},
    getItem(i) {events.push("getItem:"+i);return slots[i];},
    setItem(i,x) {events.push("setItem:"+i);slots[i]=x;}
  };
}
const cargo=(typeId="minecraft:stone",amount=1)=>({typeId,amount,maxAmount:64});
function sorterCase({locked=false,powered=false,slots=Array(5).fill(undefined),mode="wildcard",accept=false,unreadable=false}={}) {
  const events=[],originalSlots=slots.map(s=>s?{...s}:undefined);
  const inventory=nativeContainer(originalSlots,events);
  if(unreadable)inventory.firstItem=()=>{events.push("firstItem");throw Error("unloaded");};
  const block={typeId:"minecraft:hopper",getComponent(key){
    events.push("component:"+key);return {container:inventory};}};
  const implementation={
    PER_COLUMN_BATCH:16,
    getDimension:()=>({getBlock:()=>block}),
    hopperIsRedstoneLocked:()=>locked,
    sorterAt:()=>{events.push("sorterAt");return {};},
    blockIsRedstonePowered:()=>powered,
    sorterMode:()=>mode,
    compactSourceHopper:originalFunction("compactSourceHopper"),
    matchesFilter:()=>true,
    autoSorterMatches:()=>true,
    destinationFor:()=>{events.push("destinationFor");
      return accept?{kind:"storage",container:{},block:{}}:undefined;},
    findAcceptSlot:()=>({slot:0,room:64,before:0}),
    safeMovePartial:(_src,_source,slot,_dst,_dest,_slotInfo,want)=>{
      events.push("safeMovePartial:"+want);
      originalSlots[slot]=undefined;return want;
    },
    log:()=>{}
  };
  const fn=originalFunction("processColumn",implementation);
  const used=fn({d:"overworld",source:{x:1,y:65,z:0},sorters:[{m:mode}]},256);
  return {used,events,slots:originalSlots,inventory};
}
function collectorCase({locked=false,empty=false,unreadable=false,queueError=false,queueAmount=0,powered=false}={}) {
  const events=[],slots=empty?[undefined]:[cargo("custom:opaque",1)],inventory=nativeContainer(slots,events);
  if(unreadable)inventory.firstItem=()=>{events.push("firstItem");throw Error("chunk unloaded");};
  const collector={id:"C",link:"R",accepted:0};
  const receiver={id:"R",queued:0,received:0,delivered:0};
  const block={typeId:"hl:collector",powered};
  const fn=originalFunction("processCollectorIngress",{
    COLLECTOR_BATCH:16,QUEUE_CAPACITY:250000,
    collectorAt:()=>block,
    blockIsRedstonePowered:b=>b.powered??false,
    findReceiverById:()=>receiver,
    collectorInputSources:()=>[{kind:"hopper",locked,container:inventory,block:{typeId:"minecraft:hopper"}}],
    serializeQueueItem:()=>undefined, // opaque native item, direct-only path
    loadReceiverQueue:()=>{events.push("queue.read");if(queueError)throw Error("Q4 unavailable");return {total:queueAmount};},
    receiverAt:()=>({typeId:"hl:receiver",powered:false}),
    receiverOutputHopper:()=>({locked:false,container:{}}),
    findAcceptSlot:()=>({slot:0,room:64,before:0}),
    safeMovePartial:(_src,_block,slot,_dst,_dstBlock,_slotInfo,want)=>{
      events.push("safeMovePartial:"+want);slots[slot]=undefined;return want;},
    recordDirectReceiverTransfer:()=>events.push("counter"),
    markLogisticsDirty:()=>events.push("dirty"),
    queueRejectSeen:new Set(),
    log:m=>events.push("log:"+m)
  });
  return {used:fn(collector,256),events,slots,collector,receiver};
}

test("ENGINE-01 baseline manifest and both pinned owner product targets remain explicit",()=>{
  assert.deepEqual(manifest.header.version,[1,4,1]);
  assert.equal(manifest.dependencies.find(d=>d.module_name==="@minecraft/server").version,"2.7.0");
  assert.ok(objective.includes("sorter-array.png"));
  assert.ok(objective.includes("storage-room-array.png"));
});
test("ENGINE-02 empty native Hopper returns before Sorter block lookup or getItem scan",()=>{
  const r=sorterCase();
  assert.equal(r.used,0);
  assert.equal(r.events.filter(e=>e==="firstItem").length,1);
  assert.equal(r.events.filter(e=>e.startsWith("getItem:")).length,0);
  assert.equal(r.events.includes("sorterAt"),false);
});
test("ENGINE-03 powered vanilla Hopper exits before even the native empty predicate",()=>{
  const r=sorterCase({locked:true,slots:[cargo(),undefined,undefined,undefined,undefined]});
  assert.equal(r.used,0);assert.equal(r.events.includes("firstItem"),false);
});
test("ENGINE-04 nonempty Hopper with powered Sorter does not compact or mutate slots",()=>{
  const r=sorterCase({powered:true,slots:[undefined,cargo(),undefined,undefined,undefined]});
  assert.equal(r.used,0);assert.equal(r.events.includes("firstItem"),true);
  assert.equal(r.events.some(e=>e.startsWith("getItem:")),false);
});
test("ENGINE-05 invalid/throwing native inventory predicate never authorizes mutation",()=>{
  const r=sorterCase({unreadable:true,slots:[cargo(),undefined,undefined,undefined,undefined]});
  assert.equal(r.used,0);assert.equal(r.events.includes("sorterAt"),false);
  assert.equal(r.events.some(e=>e.startsWith("setItem:")),false);
});
test("ENGINE-06 bypass still never takes cargo from native Hopper",()=>{
  const r=sorterCase({mode:"bypass",slots:[cargo(),undefined,undefined,undefined,undefined]});
  assert.equal(r.used,0);assert.equal(r.slots[0].amount,1);
});
test("ENGINE-07 nonempty unmatched input performs just one compaction pass",()=>{
  const r=sorterCase({slots:[cargo(),undefined,undefined,undefined,undefined]});
  assert.equal(r.used,0);
  // Five compaction reads + source/target rechecks in the original route loop;
  // the old unconditional final compaction would add another five reads.
  assert.equal(r.events.filter(e=>e.startsWith("getItem:")).length,12);
  assert.equal(r.events.filter(e=>e.startsWith("setItem:")).length,0);
});
test("ENGINE-08 a real routed move executes only once with native source count intact",()=>{
  const r=sorterCase({slots:[cargo("minecraft:stone",4),undefined,undefined,undefined,undefined],accept:true});
  assert.equal(r.used,4);
  assert.deepEqual(r.events.filter(e=>e.startsWith("safeMovePartial:")),["safeMovePartial:4"]);
  assert.equal(r.slots[0],undefined);
});
test("ENGINE-09 an empty directed Collector Hopper skips all slot reads and queue work",()=>{
  const r=collectorCase({empty:true});
  assert.equal(r.used,0);
  assert.equal(r.events.filter(e=>e.startsWith("getItem:")).length,0);
  assert.equal(r.events.filter(e=>e==="queue.read").length,0);
});
test("ENGINE-10 redstone-locked Collector input Hopper is never queried or mutated",()=>{
  const r=collectorCase({locked:true});
  assert.equal(r.used,0);
  assert.equal(r.events.includes("firstItem"),false);
});
test("ENGINE-11 an unreadable native Collector input cannot be admitted",()=>{
  const r=collectorCase({unreadable:true});
  assert.equal(r.used,0);
  assert.equal(r.events.includes("queue.read"),false);
  assert.equal(r.slots[0].typeId,"custom:opaque");
});
test("ENGINE-12 nonempty Collector Hopper with authoritative empty Q4 retains direct-only path",()=>{
  const r=collectorCase();
  assert.equal(r.used,1);
  assert.equal(r.slots[0],undefined);
  assert.deepEqual(r.events.filter(e=>e.startsWith("safeMovePartial:")),["safeMovePartial:1"]);
});
test("ENGINE-13 stored Receiver count cannot replace an unreadable Q4",()=>{
  const r=collectorCase({queueError:true});
  assert.equal(r.used,0);
  assert.equal(r.slots[0].typeId,"custom:opaque");
  assert.equal(r.events.some(e=>e.startsWith("safeMovePartial:")),false);
  assert.equal(r.events.some(e=>e.includes("queue unavailable")),true);
});
test("ENGINE-14 actual Q4 backlog still stops opaque direct-only overtaking",()=>{
  const r=collectorCase({queueAmount:100});
  assert.equal(r.used,0);
  assert.equal(r.events.some(e=>e.startsWith("safeMovePartial:")),false);
});
test("ENGINE-15 powered Collector never reaches native cargo",()=>{
  const r=collectorCase({powered:true});
  assert.equal(r.used,0);assert.equal(r.events.includes("firstItem"),false);
});
test("ENGINE-16 original scheduling interval remains in source; no new custom scheduler introduced",()=>{
  assert.match(SOURCE,/system\.runInterval\(schedulerTick,\s*1\)/);
  assert.doesNotMatch(SOURCE,/hopperInventoryItemChange/);
});


function logisticsCase({collectors=0,receivers=0,pending=false,unresolved=false,physicalJournal=false,ready=true}={}) {
  const events=[];
  let queueJournal=pending;
  const collectorList=Array.from({length:collectors},(_,id)=>({id}));
  const receiverList=Array.from({length:receivers},(_,id)=>({id}));
  const ctx={
    ready, LOGISTICS_GLOBAL_BUDGET:256,
    logistics:{collectors:collectorList,receivers:receiverList},
    collectorRrStart:0,receiverRrStart:0,
    JOURNAL_KEY:"journal",
    getQueueJournal:()=>{events.push("Q4.read");return queueJournal?{pending:true}:undefined;},
    recoverQueueJournal:()=>{events.push("Q4.recover");if(!unresolved)queueJournal=false;},
    collectorAt:()=>{events.push("EXTRA.Collector.blockLookup");return {};},
    receiverAt:()=>{events.push("EXTRA.Receiver.blockLookup");return {};},
    processCollectorIngress:e=>{events.push("Collector:"+e.id);return 0;},
    processReceiverDrain:e=>{events.push("Receiver:"+e.id);return 0;},
    world:{getDynamicProperty:key=>{assert.equal(key,"journal");events.push("physicalJournal.read");return physicalJournal?"{pending}":undefined;}}
  };
  const fn=originalFunction("logisticsTick",ctx);
  fn();
  return {events,ctx};
}

test("ENGINE-17 idle logistics does a single native Q4 journal read instead of two",()=>{
  const {events}=logisticsCase();
  assert.equal(events.filter(e=>e==="Q4.read").length,1);
  assert.equal(events.filter(e=>e==="Q4.recover").length,0);
  assert.equal(events.filter(e=>e==="physicalJournal.read").length,1);
});
test("ENGINE-18 Collector and Receiver ingress functions own block validation exactly once",()=>{
  const {events}=logisticsCase({collectors:14,receivers:7});
  assert.equal(events.filter(e=>e.startsWith("Collector:")).length,14);
  assert.equal(events.filter(e=>e.startsWith("Receiver:")).length,7);
  assert.equal(events.filter(e=>e.startsWith("EXTRA.")).length,0);
});
test("ENGINE-19 a pending Q4 recovery must clear before any Collector ingress",()=>{
  const {events}=logisticsCase({pending:true,collectors:2,receivers:2});
  assert.deepEqual(events.slice(0,3),["Q4.read","Q4.recover","Q4.read"]);
  assert.equal(events.filter(e=>e.startsWith("Collector:")).length,2);
});
test("ENGINE-20 unresolved Q4 journal halts both Collector ingress and Receiver drain",()=>{
  const {events}=logisticsCase({pending:true,unresolved:true,collectors:5,receivers:5});
  assert.deepEqual(events,["Q4.read","Q4.recover","Q4.read"]);
});
test("ENGINE-21 pending physical journal still fences Receiver output after ingress",()=>{
  const {events}=logisticsCase({physicalJournal:true,collectors:2,receivers:3});
  assert.equal(events.filter(e=>e.startsWith("Collector:")).length,2);
  assert.equal(events.filter(e=>e.startsWith("Receiver:")).length,0);
});
test("ENGINE-22 engine not ready makes no native inventory or world-property observations",()=>{
  const {events}=logisticsCase({ready:false,collectors:5,receivers:5,pending:true});
  assert.deepEqual(events,[]);
});
test("ENGINE-23 original round-robin start advances without duplicate block checks",()=>{
  const {events,ctx}=logisticsCase({collectors:4,receivers:3});
  assert.deepEqual(events.filter(e=>e.startsWith("Collector:")),["Collector:0","Collector:1","Collector:2","Collector:3"]);
  assert.deepEqual(events.filter(e=>e.startsWith("Receiver:")),["Receiver:0","Receiver:1","Receiver:2"]);
  assert.equal(ctx.collectorRrStart,1);
  assert.equal(ctx.receiverRrStart,1);
});


test("ENGINE-24 1,387 eligible idle columns require zero script getItem slot scans",()=>{
  let nativeEmptyQueries=0,scriptSlotReads=0,sorterLookups=0;
  const container={
    isValid:true,size:5,
    firstItem(){nativeEmptyQueries++;return undefined;},
    getItem(){scriptSlotReads++;return undefined;}
  };
  const hopper={
    typeId:"minecraft:hopper",
    getComponent:()=>({container})
  };
  const process=originalFunction("processColumn",{
    PER_COLUMN_BATCH:16,
    getDimension:()=>({getBlock:()=>hopper}),
    hopperIsRedstoneLocked:()=>false,
    sorterAt:()=>{sorterLookups++;return {};},
    blockIsRedstonePowered:()=>false,
    sorterMode:()=> "wildcard",
    compactSourceHopper:originalFunction("compactSourceHopper"),
    log:()=>{}
  });
  const columns=Array.from({length:1387},(_,x)=>({
    d:"overworld",source:{x,y:65,z:0},
    sorters:[{m:"wildcard",y:64}]
  }));
  const fn=originalFunction("schedulerTick",{
    ready:true,dirty:false,rrStart:0,
    columns,GLOBAL_MOVE_BUDGET:256,
    JOURNAL_KEY:"journal",
    world:{getDynamicProperty:()=>undefined},
    getQueueJournal:()=>undefined,
    processColumn:process
  });
  fn();
  assert.equal(nativeEmptyQueries,1387);
  assert.equal(scriptSlotReads,0);
  assert.equal(sorterLookups,0);
  // Same synthetic arrangement in original 1.4.1 produces 20,805 mocked
  // getItem reads, independently tested by the immutable baseline suite.
  // This measures SCRIPT CALLS only; native firstItem may still do engine
  // work internally, so TPS and actual speedup remain unverified.
});


test("ENGINE-25 periodic display reconciliation makes no dimension-global queries",()=>{
  let queries=0;
  const fn=originalFunction("reconcileDisplays",{
    ready:true,registry:[],
    getDimension:()=>({getEntities:()=>{queries++;return [];}}),
    DISPLAY_ID:"hartsorter:filter_display"
  });
  fn();
  assert.equal(queries,0);
});
test("ENGINE-26 startup display cleanup still inspects all three dimensions",()=>{
  const dims=[];
  const fn=originalFunction("reconcileDisplays",{
    ready:true,registry:[],
    getDimension:id=>({getEntities:()=>{dims.push(id);return [];}}),
    DISPLAY_ID:"hartsorter:filter_display"
  });
  fn(true);
  assert.deepEqual(dims,["overworld","nether","the_end"]);
});
test("ENGINE-27 routine legacy registered-filter visual sync remains present",()=>{
  let updates=0,removals=0,queries=0;
  const entry={id:"sorter",f:{typeId:"minecraft:stone"}};
  const fn=originalFunction("reconcileDisplays",{
    ready:true,registry:[entry],
    sorterAt:()=>({typeId:"hl:sorter"}),
    entryHasFrameImplant:()=>false,
    syncDisplay:()=>updates++,
    removeDisplay:()=>removals++,
    getDimension:()=>({getEntities:()=>{queries++;return [];}}),
    DISPLAY_ID:"hartsorter:filter_display"
  });
  fn();
  assert.equal(updates,1);
  assert.equal(removals,0);
  assert.equal(queries,0);
});
test("ENGINE-28 known Sorter removed outside player events cleans its local proxy",()=>{
  let removals=0,queries=0;
  const entry={id:"stale",f:{typeId:"minecraft:stone"}};
  const fn=originalFunction("reconcileDisplays",{
    ready:true,registry:[entry],
    sorterAt:()=>undefined,
    removeDisplay:e=>{assert.equal(e,entry);removals++;},
    getDimension:()=>({getEntities:()=>{queries++;return [];}}),
    DISPLAY_ID:"hartsorter:filter_display"
  });
  fn();
  assert.equal(removals,1);
  assert.equal(queries,0);
});
test("ENGINE-29 native-loaded known legacy entity repairs only its owner",()=>{
  let updates=0,removes=0;
  const entry={id:"sorter",f:{typeId:"minecraft:stone"}};
  const ent={isValid:true,typeId:"hartsorter:filter_display",
    getDynamicProperty:()=> "known-owner",remove:()=>removes++};
  const fn=originalFunction("reconcileLoadedDisplay",{
    ready:true,DISPLAY_ID:"hartsorter:filter_display",
    DISPLAY_OWNER_PROP:"owner",
    findEntryByDisplayOwner:owner=>{assert.equal(owner,"known-owner");return entry;},
    entryHasFrameImplant:()=>false,
    sorterAt:()=>({typeId:"hl:sorter"}),
    syncDisplay:e=>{assert.equal(e,entry);updates++;}
  });
  fn(ent);
  assert.equal(updates,1);
  assert.equal(removes,0);
});
test("ENGINE-30 native-loaded orphan display is removed without a global census",()=>{
  let removals=0;
  const fn=originalFunction("reconcileLoadedDisplay",{
    ready:true,DISPLAY_ID:"hartsorter:filter_display",
    DISPLAY_OWNER_PROP:"owner",
    findEntryByDisplayOwner:()=>undefined
  });
  fn({isValid:true,typeId:"hartsorter:filter_display",
    getDynamicProperty:()=> "orphan",remove:()=>removals++});
  assert.equal(removals,1);
});
test("ENGINE-31 native-loaded display for a native-frame Sorter is removed",()=>{
  let removals=0,updated=0;
  const fn=originalFunction("reconcileLoadedDisplay",{
    ready:true,DISPLAY_ID:"hartsorter:filter_display",
    DISPLAY_OWNER_PROP:"owner",
    findEntryByDisplayOwner:()=>({f:{typeId:"minecraft:stone"}}),
    entryHasFrameImplant:()=>true,
    syncDisplay:()=>updated++
  });
  fn({isValid:true,typeId:"hartsorter:filter_display",
    getDynamicProperty:()=> "native-frame",remove:()=>removals++});
  assert.equal(removals,1);
  assert.equal(updated,0);
});
test("ENGINE-32 entity load while registry isn't ready does not delete cargo or entities",()=>{
  let removals=0;
  const fn=originalFunction("reconcileLoadedDisplay",{
    ready:false,DISPLAY_ID:"hartsorter:filter_display"
  });
  fn({isValid:true,typeId:"hartsorter:filter_display",remove:()=>removals++});
  assert.equal(removals,0);
});
test("ENGINE-33 module registers native display load event and preserves startup sweep",()=>{
  assert.match(SOURCE,/world\.afterEvents\.entityLoad\.subscribe/);
  assert.match(SOURCE,/system\.run\(\(\) => reconcileLoadedDisplay\(ev\.entity\)\)/);
  assert.match(SOURCE,/system\.runTimeout\(\(\) => reconcileDisplays\(true\),\s*5\)/);
  assert.match(SOURCE,/system\.runInterval\(reconcileDisplays,\s*100\)/);
});
