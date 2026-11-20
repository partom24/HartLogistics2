/**
 * HartLogistics pre-release native API call-budget trace.
 *
 * Narrow, source-extracted MICRO-GATE ONLY. It deliberately substitutes
 * collectorAt/receiverAt, source discovery, output resolution and liveLinkCheck,
 * so its zero System.currentTick count is NOT a full-runtime claim. The separate
 * urce_full_runtime_native_budget.test.mjs is the mandatory end-to-end gate
 * that executes every imported Hart runtime module and all scheduled jobs.
 * Native @minecraft/server APIs are COUNTED STUBS, never BDS latency/TPS.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const main=fs.readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");
function slice(start,end) {
  const a=main.indexOf(start), b=main.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,"Missing source seam: "+start+" to "+end);
  return main.slice(a,b);
}
const code=[
 slice("const SORTER_JOURNAL_AUDIT_TICKS = 20;","function locKey("),
 slice("function getQueueJournal() {","function saveJournal(tx) {"),
 slice("const dimensionHandleCache = new Map();","// Keep the Bedrock reader identity stable"),
 slice("function processColumn(col, globalRemaining) {","function processCollectorIngress(collector, globalRemaining) {"),
 slice("function processCollectorIngress(collector, globalRemaining) {","function processReceiverDrain(receiver, globalRemaining) {"),
 slice("function processReceiverDrain(receiver, globalRemaining) {","function logisticsTick() {"),
 slice("function logisticsTick() {","function schedulerTick() {"),
 slice("function schedulerTick() {","// Droppers/dispensers retain vanilla pulse semantics")
].join("\n")+"\n({schedulerTick,logisticsTick})";

const WORKLOAD={sorters:1442, collectors:73, receivers:54, ticks:40};
function countedIdleFixture({
 sorters=WORKLOAD.sorters,
 collectors=WORKLOAD.collectors,
 receivers=WORKLOAD.receivers,
 stationaryCollectorInputs=false
}={}) {
 const counts={
  nativeTick:0,worldGetDimension:0,dimensionGetBlock:0,
  blockTypeId:0,inventoryComponent:0,containerFirstItem:0,
  hopperPowerChecks:0,worldJournal:0,worldQueueJournal:0,
  collectorChecks:0,collectorInputDiscovery:0,
  receiverChecks:0,receiverOutputDiscovery:0,routeSafetyChecks:0,
  itemReads:0,itemWrites:0,dynamicWrites:0,queueLoads:0
 };
 const container={
  isValid:true, size:5,
  firstItem(){counts.containerFirstItem++;return undefined;},
  getItem(){counts.itemReads++;throw Error("Empty inventory must not read slots");},
  setItem(){counts.itemWrites++;throw Error("Idle trace must not mutate cargo");}
 };
 const hopper={
  get typeId(){counts.blockTypeId++;return "minecraft:hopper";},
  getComponent(name){
   assert.equal(name,"minecraft:inventory");
   counts.inventoryComponent++;
   return {container};
  }
 };
 const dim={
  getBlock(p){
   counts.dimensionGetBlock++;
   assert.ok(Number.isSafeInteger(p.x),"Expected native block location");
   return hopper;
  }
 };
 const world={
  getDimension(id){
   counts.worldGetDimension++;
   assert.equal(id,"minecraft:overworld");
   return dim;
  },
  getDynamicProperty(key){
   if(key==="hartsorter:journal_v1"){counts.worldJournal++;return undefined;}
   if(key==="hartsorter:queue_journal_v1"){counts.worldQueueJournal++;return undefined;}
   throw Error("Unexpected dynamic property: "+key);
  },
  setDynamicProperty(){counts.dynamicWrites++;throw Error("Idle must not persist");}
 };
 const system={
  get currentTick(){counts.nativeTick++;throw Error("Expensive native tick getter accessed in idle path");}
 };
 const columns=Array.from({length:sorters},(_,i)=>({
   d:"minecraft:overworld",
   source:{x:i,y:65,z:0},
   sorters:[{id:i,mode:"filter"}]
 }));
 const registry={
  collectors:Array.from({length:collectors},(_,i)=>({id:"C"+i,link:"R0"})),
  receivers:Array.from({length:receivers},(_,i)=>({id:"R"+i}))
 };
 const vars={
  world,system,ready:true,dirty:false,columns,rrStart:0,
  // This MICRO test extracts logisticsTick without its lexical module scope.
  // It substitutes liveLinkCheck; only FULL-NATIVE-02 measures its true clock.
  activeLogisticsPass:undefined,
  logistics:registry,collectorRrStart:0,receiverRrStart:0,
  GLOBAL_MOVE_BUDGET:256,LOGISTICS_GLOBAL_BUDGET:256,
  COLLECTOR_BATCH:Number(main.match(/const COLLECTOR_BATCH\s*=\s*(\d+);/)[1]),
  RECEIVER_BATCH:Number(main.match(/const RECEIVER_BATCH\s*=\s*(\d+);/)[1]),
  QUEUE_JOURNAL_KEY:"hartsorter:queue_journal_v1",
  JOURNAL_KEY:"hartsorter:journal_v1",
  safeJsonParse:(value,fallback)=>value===undefined?fallback:JSON.parse(value),
  hopperIsRedstoneLocked(){counts.hopperPowerChecks++;return false;},
  collectorAt(){counts.collectorChecks++;return {};},
  blockIsRedstonePowered:()=>false,
  findReceiverById:id=>registry.receivers.find(x=>x.id===id),
  collectorInputSources(){
    counts.collectorInputDiscovery++;
    if(!stationaryCollectorInputs)return [];
    return [{kind:"hopper",locked:false,block:{},
      container:{isValid:true,firstItem(){counts.containerFirstItem++;
        return {typeId:"minecraft:cobblestone",amount:1};}}}];
  },
  receiverAt(){counts.receiverChecks++;return {};},
  receiverOutputHopper(){counts.receiverOutputDiscovery++;return undefined;},
  // This intentionally STUBBED micro-gate lacks a Q4 queue implementation.
  // Source now checks Q4 emptiness BEFORE touching the Receiver output;
  // the independent full-runtime fixture executes the genuine Q4 loader.
  loadReceiverQueue(){counts.queueLoads++;return {total:0};},
  log(message){throw Error("Unexpected micro-gate error path: "+message);},
  liveLinkCheck(){
    counts.routeSafetyChecks++;
    if(!stationaryCollectorInputs)throw Error("No cargo: no route scan allowed");
    // Deliberately unverified: cargo must remain at the source.
    return {decision:"HOLD",reason:"simulated_native_unknown"};
  },
  recoverQueueJournal(){throw Error("No queue journal pending");},
  rebuildTopology(){throw Error("No dirty topology in steady-state trace");}
 };
 const callbacks=vm.runInNewContext(code,vars,{timeout:2000});
 return {counts,callbacks};
}

test("NATIVE-BUDGET-01 1,442 empty sorters, 73 collectors and 54 receivers stay within idle native access limits",()=>{
 const {counts,callbacks}=countedIdleFixture();
 const t=WORKLOAD.ticks;
 for(let i=0;i<t;i++){callbacks.schedulerTick();callbacks.logisticsTick();}
 const limit={
  nativeTick:0,
  worldGetDimension:1,
  worldJournal:t+Math.ceil(t/20),
  worldQueueJournal:t*2,
  dimensionGetBlock:WORKLOAD.sorters*t,
  blockTypeId:WORKLOAD.sorters*t,
  inventoryComponent:WORKLOAD.sorters*t,
  containerFirstItem:WORKLOAD.sorters*t,
  hopperPowerChecks:WORKLOAD.sorters*t,
  collectorChecks:WORKLOAD.collectors*t,
  collectorInputDiscovery:WORKLOAD.collectors*t,
  receiverChecks:WORKLOAD.receivers*t,
  receiverOutputDiscovery:0,
  queueLoads:WORKLOAD.receivers*t,
  routeSafetyChecks:0,itemReads:0,itemWrites:0,dynamicWrites:0
 };
 for(const [name,maximum] of Object.entries(limit))
   assert.ok(counts[name]<=maximum,
     name+": "+counts[name]+" native accesses > max "+maximum+" over "+t+" idle ticks");
 assert.ok(counts.dimensionGetBlock>0,"Exercise real loaded Hopper path, not a skipped scheduler");
 assert.equal(counts.worldJournal,t+2,
  "Scheduler 2 journal audits in 40 ticks; logistics still reads live each tick");
 assert.equal(counts.worldQueueJournal,2*t,
  "Queue journal independently checked by both custody engines");
 assert.equal(counts.routeSafetyChecks,0,"Empty Collector inputs avoid topology revalidation");
 console.log("HART_NATIVE_BUDGET_TRACE "+JSON.stringify({
  scenario:"loaded empty source Hoppers; native APIs are instrumented STUBS",
  bedrockMeasured:false,
  workload:WORKLOAD,
  counts,
  perTick:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,Number((v/t).toFixed(2))])),
  note:"MICRO GATE: route guards/discovery are mocked. Use HART_FULL_RUNTIME_NATIVE_TRACE for installed-runtime counts; never infer native TPS."
 }));
});

test("NATIVE-BUDGET-02 journal and custody remain guarded in small empty fixture",()=>{
 const {counts,callbacks}=countedIdleFixture({sorters:24,collectors:2,receivers:2});
 callbacks.schedulerTick();
 callbacks.logisticsTick();
 assert.equal(counts.worldJournal,2,
   "Initial scheduler audit and independent logistics check both run");
 assert.equal(counts.itemWrites,0);
 assert.equal(counts.nativeTick,0);
});

test("NATIVE-BUDGET-03 stationary input exposes route-validation hot path without moving cargo",()=>{
 const ticks=20;
 const {counts,callbacks}=countedIdleFixture({
   sorters:1442,collectors:73,receivers:54,stationaryCollectorInputs:true
 });
 for(let i=0;i<ticks;i++){callbacks.schedulerTick();callbacks.logisticsTick();}
 assert.equal(counts.routeSafetyChecks,73*ticks,
  "KNOWN COST: linked stationary inputs retry a guarded route once per Collector per tick");
 assert.equal(counts.itemWrites,0,"Unverified route must never debit item custody");
 assert.equal(counts.nativeTick,0);
 console.log("HART_NATIVE_BUDGET_TRACE "+JSON.stringify({
   scenario:"all linked Collector input Hoppers contain stationary item; guard returns HOLD",
   bedrockMeasured:false,
   workload:{sorters:1442,collectors:73,receivers:54,ticks},
   counts,
   knownRisk:"1460 STUBBED route guard attempts in 20 ticks; real guard System.currentTick and topology scans are intentionally excluded",
   note:"This is a quantified JS dispatch risk, not a safe native performance certification"
 }));
});
