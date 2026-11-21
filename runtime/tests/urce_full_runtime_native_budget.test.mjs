/**
 * FULL-RUNTIME native API call budget (instrumented Node stubs, never Bedrock timing).
 *
 * After a whole-engine review: native tick lookup is once per synchronous
 * logistics pass only when needed, verified same-stack device blocks are
 * reused, and an AUTHORITATIVELY empty Q4 queue never polls its output Hopper.
 * All supported Bedrock native/persistence/cargo writers remain real source.
 */
// Load real ESM main.js with no Hart module replacements; all native API stubs
// count actual calls. Node --experimental-vm-modules is required.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SCRIPT=path.join(ROOT,"addon/behavior_pack/scripts/main.js");
const DIM="minecraft:overworld";
const xyz=p=>[p.x,p.y,p.z].join(",");
const named=(n,id)=>n+"."+id;
function counters() {
  let values=Object.create(null);
  return {
    add(name){values[name]=(values[name]??0)+1;},
    reset(){values=Object.create(null);},
    read(name){return values[name]??0;},
    snapshot(){return {...values};}
  };
}
class Stack {
  constructor(typeId,amount=1) {
    this.typeId=typeId;this.amount=amount;this.maxAmount=64;
    this.lockMode="none";this.keepOnDeath=false;
  }
  clone(){const out=new Stack(this.typeId,this.amount);out.nameTag=this.nameTag;return out;}
  isStackableWith(other){return !!other&&other.typeId===this.typeId&&other.nameTag===this.nameTag;}
  getLore(){return [];}
  getCanDestroy(){return [];}
  getCanPlaceOn(){return [];}
  getDynamicPropertyIds(){return [];}
  getComponent(){return undefined;}
  setLore(){}
  setCanDestroy(){}
  setCanPlaceOn(){}
}
function fixture({sorters=24,collectors=2,receivers=2,stationary=false,
                  blocked=false,legacy=false,direct=false,directSideChest=false,
                  directedTerminalChest=false,directedTerminalInert=false,
                  managedBacklog=0,remoteBank=false,remoteFilterId="minecraft:cobblestone",
                  remoteCycle=false,remoteUnknownHopper=false}={}) {
  const metrics=counters();
  const blocks=new Map(), properties=new Map(), timers=[], intervals=[], listeners=new Map();
  let currentTick=0;
  const hit=n=>metrics.add(n);
  const key=(d,p)=>d+"|"+xyz(p);
  function inventory(items=[],size=5){
    const slots=Array.from({length:size},(_,i)=>items[i]);
    return {
      size,isValid:true,
      get emptySlotsCount(){hit("Container.emptySlotsCount");return slots.filter(x=>!x).length;},
      firstItem(){hit("Container.firstItem");const i=slots.findIndex(Boolean);return i<0?undefined:i;},
      firstEmptySlot(){hit("Container.firstEmptySlot");const i=slots.findIndex(x=>!x);return i<0?undefined:i;},
      getItem(i){hit("Container.getItem");return slots[i]?.clone();},
      setItem(i,item){hit("Container.setItem");slots[i]=item?.clone();},
      getSlot(i){
        hit("Container.getSlot");
        return {
          hasItem(){hit("ContainerSlot.hasItem");return !!slots[i];},
          get typeId(){hit("ContainerSlot.typeId");return slots[i]?.typeId;},
          get amount(){hit("ContainerSlot.amount");return slots[i]?.amount??0;},
          get maxAmount(){hit("ContainerSlot.maxAmount");return slots[i]?.maxAmount??64;},
          getItem(){hit("ContainerSlot.getItem");return slots[i]?.clone();},
          isStackableWith(s){hit("ContainerSlot.isStackableWith");return !!slots[i]?.isStackableWith(s);}
        };
      },
      inspect(){return slots.map(x=>x?.amount??0);}
    };
  }
  function block(type,p,{items=undefined,facing=0,states={}}={}){
    const dim=dimension;
    const store={facing_direction:facing,toggle_bit:0,...states};
    const container=items===undefined?undefined:inventory(items,type==="minecraft:chest"?27:5);
    const b={
      dimension:dim,location:{...p},
      get typeId(){hit("Block.typeId");return type;},
      getComponent(id){hit(named("Block.getComponent",id));return id==="minecraft:inventory"&&container?{container}:undefined;},
      getRedstonePower(){hit("Block.getRedstonePower");return 0;},
      get permutation(){hit("Block.permutation");return {getState(id){hit("BlockPermutation.getState");return store[id];},
        withState(id,value){hit("BlockPermutation.withState");return {...store,[id]:value};}};},
      setPermutation(next){hit("Block.setPermutation");Object.assign(store,next);}
    };
    blocks.set(key(DIM,p),b);
    return {block:b,container};
  }
  const dimension={
    id:DIM,
    getBlock(p){hit("Dimension.getBlock");return blocks.get(key(DIM,p))??blockAir(p);},
    getEntities(){hit("Dimension.getEntities");return [];}
  };
  function blockAir(p) {
    return {dimension,location:{...p},
      get typeId(){hit("Block.typeId");return "minecraft:air";},
      getComponent(id){hit(named("Block.getComponent",id));return undefined;},
      getRedstonePower(){hit("Block.getRedstonePower");return 0;}
    };
  }
  const world={
    getDimension(id){hit("World.getDimension");if(id!==DIM&&id!=="overworld")throw Error("unexpected dimension "+id);return dimension;},
    getDynamicProperty(id){hit(named("World.getDynamicProperty",id.startsWith("hartsorter:q4m_")?"Q4_META":
      id.startsWith("hartsorter:q3m_")?"Q3_META":id));return properties.get(id);},
    setDynamicProperty(id,v){hit(named("World.setDynamicProperty",id.startsWith("hartsorter:q4")?"Q4":id));
      if(v===undefined)properties.delete(id);else properties.set(id,v);},
    beforeEvents:new Proxy({}, {get(_,name){return event("before."+String(name));}}),
    afterEvents:new Proxy({}, {get(_,name){return event("after."+String(name));}})
  };
  function event(name){return {subscribe(fn){hit("Event.subscribe");if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}};}
  const system={
    beforeEvents:new Proxy({}, {get(_,name){return event("system.before."+String(name));}}),
    afterEvents:new Proxy({}, {get(_,name){return event("system.after."+String(name));}}),
    get currentTick(){hit("System.currentTick");return currentTick;},
    run(fn){hit("System.run");timers.push({due:currentTick+1,fn});},
    runTimeout(fn,n){hit("System.runTimeout");timers.push({due:currentTick+Math.max(1,n),fn});},
    runInterval(fn,n){hit("System.runInterval");intervals.push({fn,period:n});}
  };
  const registry=[];
  for(let i=0;i<sorters;i++){
    const p={x:i*4,y:64,z:0};
    block("hartsorter:sorter",p,{states:{"hartlogistics:mode":"filter","minecraft:cardinal_direction":"north"}});
    block("minecraft:hopper",{...p,y:65},{items:[]});
    registry.push({d:DIM,...p,m:"filter",f:{typeId:"minecraft:diamond"},
      ...(legacy?{}:{i:[p.x,p.y,p.z-1,2]})});
  }
  const cols=[],recs=[],collectorSources=[],receiverOutputs=[];
  const directChests=[],directSideChests=[],nativeTerminals=[],nativeInertTerminals=[];
  const remoteChests=[];
  for(let i=0;i<receivers;i++){
    const p={x:80000+i*20,y:70,z:0},id=key(DIM,p),queueKey="q"+(i+1);
    block("hartsorter:receiver",p);
    receiverOutputs.push(block("minecraft:hopper",{...p,y:69},{
      items:[],facing:(directedTerminalChest||directedTerminalInert) && i===0 ? 2 : 0
    }).container);
    if(blocked)block("minecraft:chest",{...p,y:68},{items:[]});
    if(direct&&i===0){
      // The Receiver output Hopper ends DOWNWARD at the top Sorter. The only
      // native-storage output is the verified local chest, not another bank.
      block("hartsorter:sorter",{...p,y:68},{
        states:{"minecraft:cardinal_direction":"east","hartlogistics:mode":"filter"}});
      const chest=block("minecraft:chest",{x:p.x+1,y:68,z:p.z},{items:[]});
      directChests.push(chest.container);
      if(directedTerminalChest) {
        nativeTerminals.push(block("minecraft:chest",
          {x:p.x,y:69,z:p.z-1},{items:[]}).container);
        block("minecraft:stone",{x:p.x,y:68,z:p.z-1});
      }
      if(directedTerminalInert){
        nativeInertTerminals.push(block("minecraft:stone_bricks",
          {x:p.x,y:69,z:p.z-1}).block);
        block("minecraft:stone",{x:p.x,y:68,z:p.z-1});
      }
      if(directSideChest) {
        const side=block("minecraft:chest",{x:p.x+1,y:69,z:p.z},{items:[]});
        directSideChests.push(side.container);
      }
      block("minecraft:stone",{...p,y:67});
      registry.push({d:DIM,x:p.x,y:68,z:p.z,m:"filter",
        f:{match:{typeId:"minecraft:cobblestone"}}});
    }
    recs.push({id,d:DIM,...p,present:true,queueKey,qVersion:4,qGen:0,qShards:0,
      received:0,delivered:0,queued:0});
    properties.set("hartsorter:q4m_"+queueKey,JSON.stringify(
      managedBacklog&&i===0
        ?{v:4,h:1,t:1,n:2,q:managedBacklog,r:52951,d:52951-managedBacklog}
        :{v:4,h:0,t:0,n:1,q:0,r:0,d:0}
    ));
  }
  if(remoteBank){
    if(receivers<2)throw Error("Two-bank fixture needs two Receivers");
    // Native bank #1: r0 -> face-connected visual pipe -> registered
    // Collector c1 -> saved link to Receiver r1.
    block("hartsorter:transporter",{x:80001,y:70,z:0});
    for(let x=80001;x<=80003;x++)
      block("hartsorter:transporter",{x,y:69,z:0});
    const relay={x:80004,y:69,z:0};
    block("hartsorter:collector",relay);
    cols.push({id:key(DIM,relay),d:DIM,...relay,present:true,
      link:recs[1].id,accepted:0});
    // Native bank #2: r1 -> pipe -> verified source Hopper/Sorter
    // -> native Filter chest, with an OPTIONAL unlinked terminal Collector.
    block("hartsorter:transporter",{x:80021,y:70,z:0});
    for(let x=80021;x<=80023;x++)
      block("hartsorter:transporter",{x,y:69,z:0});
    const terminal={x:80024,y:69,z:0};
    block("hartsorter:collector",terminal);
    cols.push({id:key(DIM,terminal),d:DIM,...terminal,present:true,
      link:remoteCycle?recs[0].id:null,accepted:0});
    if(remoteUnknownHopper)block("minecraft:hopper",
      {x:80022,y:69,z:1},{items:[]});
    block("minecraft:hopper",{x:80023,y:69,z:-1},{items:[]});
    const sorter={x:80023,y:68,z:-1};
    block("hartsorter:sorter",sorter,{states:{
      "minecraft:cardinal_direction":"east","hartlogistics:mode":"filter"
    }});
    const remote=block("minecraft:chest",
      {x:80024,y:68,z:-1},{items:[]});
    remoteChests.push(remote.container);
    block("minecraft:stone",{x:80024,y:67,z:-1});
    block("minecraft:stone",{x:80023,y:67,z:-1});
    registry.push({d:DIM,...sorter,m:"filter",
      f:{match:{typeId:remoteFilterId}}});
  }
  for(let i=0;i<collectors;i++){
    const p={x:50000+i*20,y:70,z:0},id=key(DIM,p);
    block("hartsorter:collector",p);
    const source=block("minecraft:hopper",{...p,y:71},{
      items:stationary?[new Stack("minecraft:cobblestone",4)]:[],facing:0
    });
    collectorSources.push(source.container);
    cols.push({id,d:DIM,...p,present:true,link:recs[i%Math.max(1,recs.length)]?.id??null,accepted:0});
  }
  // The real loader reads committed, generation-switched registry shards.
  const payload=JSON.stringify(registry);
  const pieces=payload.match(/[\s\S]{1,22000}/g)??["[]"];
  properties.set("hartsorter:registry_v2",JSON.stringify({version:2,gen:0,shards:pieces.length,
    count:registry.length,chars:payload.length}));
  pieces.forEach((s,i)=>properties.set("hartsorter:r2_0_"+i,s));
  properties.set("hartsorter:logistics_v2",JSON.stringify({collectors:cols,receivers:recs,nextQueue:recs.length+1}));
  const warnings=[];
  async function loadFullRuntime() {
    assert.ok(vm.SourceTextModule,"Run with node --experimental-vm-modules");
    const context=vm.createContext({console:{warn:(...s)=>warnings.push(s.join(" ")),log:()=>{}},
      JSON,Math,Number,Map,Set,WeakMap,WeakSet,Object,Array,String,Boolean,Error,
      TypeError,RangeError,parseInt,parseFloat,isNaN});
    const native=new vm.SyntheticModule(
      ["world","system","ItemStack","BlockPermutation","EquipmentSlot","EnchantmentTypes","Potions","CommandPermissionLevel"],
      function(){
        this.setExport("world",world);this.setExport("system",system);
        this.setExport("ItemStack",Stack);
        this.setExport("BlockPermutation",{resolve(){hit("BlockPermutation.resolve");return {};}});
        this.setExport("EquipmentSlot",{Mainhand:"Mainhand"});
        this.setExport("EnchantmentTypes",{get(){return undefined;}});
        this.setExport("Potions",{getEffectType(){return undefined;},getDeliveryType(){return undefined;}});
        this.setExport("CommandPermissionLevel",{GameDirectors:2});
      },{context,identifier:"@minecraft/server"});
    const cache=new Map();
    const make=filename=>{
      if(cache.has(filename))return cache.get(filename);
      assert.ok(filename.startsWith(path.join(ROOT,"addon/behavior_pack/scripts")+path.sep),
        "Only real add-on script imports allowed");
      const mod=new vm.SourceTextModule(fs.readFileSync(filename,"utf8"),{context,identifier:filename});
      cache.set(filename,mod);return mod;
    };
    const main=make(SCRIPT);
    await main.link((specifier,ref)=>{
      if(specifier==="@minecraft/server")return native;
      return make(path.resolve(path.dirname(ref.identifier),specifier));
    });
    await main.evaluate();
    assert.equal(intervals.length,7,"Changing periodic runtime tasks requires re-auditing ALL of them");
  }
  function advance(n=1) {
    for(let t=0;t<n;t++){
      currentTick++;
      const due=timers.filter(x=>x.due<=currentTick);
      for(const item of due){const ix=timers.indexOf(item);if(ix>=0)timers.splice(ix,1);item.fn();}
      for(const item of intervals)if(currentTick%item.period===0)item.fn();
    }
  }
  function emit(name,ev){for(const callback of listeners.get(name)??[])callback(ev);}
  return {metrics,loadFullRuntime,advance,emit,collectorSources,receiverOutputs,directChests,directSideChests,nativeTerminals,nativeInertTerminals,remoteChests,properties,warnings,intervals,world,
    get tick(){return currentTick;}};
}
function publish(label,fixture,ticks,extra={}) {
  const counts=fixture.metrics.snapshot();
  const perTick=Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,+(v/ticks).toFixed(3)]));
  console.log("HART_FULL_RUNTIME_NATIVE_TRACE "+JSON.stringify({
    scenario:label,bedrockMeasured:false,ticks,counts,perTick,...extra,
    note:"All shipped JS modules executed with counted native stubs. No BDS latency/TPS inferred."
  }));
  return {counts,perTick};
}
const n=(obj,k)=>obj[k]??0;
test("FULL-NATIVE-01 all registered periodic runtime paths: 1,442 empty sources, 73 collectors, 54 receivers",async()=>{
  const f=fixture({sorters:1442,collectors:73,receivers:54});
  await f.loadFullRuntime();
  f.advance(7); // include one-time startup/initial display cleanup outside steady-state window
  f.metrics.reset();
  const ticks=100;f.advance(ticks);
  const {counts}=publish("loaded empty hopper steady state, full runtime",f,ticks);
  assert.equal(n(counts,"System.currentTick"),0,"Genuinely idle runtime must not read expensive native tick clock");
  assert.equal(n(counts,"Container.setItem"),0,"Empty inventory must never mutate");
  assert.equal(n(counts,"Dimension.getBlock"),(1442+73*7+54)*ticks,
    "Verified Collector/Receiver reuse and empty-Q4 skip must save 181 reads/tick");
  assert.equal(n(counts,"Container.firstItem"),(1442+73)*ticks,
    "Empty Sorter and directed Collector sources each require one emptiness read");
  assert.equal(n(counts,"Container.getItem"),0);
  assert.equal(n(counts,"Block.typeId"),2007*ticks,
    "Known Hopper and endpoint identities must not be re-read after same-call proof");
  assert.equal(n(counts,"Block.getComponent.minecraft:inventory"),1515*ticks,
    "Zero-balance Q4 must avoid probing Receiver output inventory");
  assert.equal(n(counts,"BlockPermutation.getState"),1588*ticks,
    "No native Hopper state lookup for a zero-balance Receiver");
  assert.ok(n(counts,"Block.getRedstonePower")<=127*ticks);
  assert.equal(n(counts,"Dimension.getEntities"),0,"Native-frame idle path should never search legacy displays");
  assert.ok(n(counts,"World.getDimension")<=3,"Dimension handles should stay cached");
  assert.ok(n(counts,"World.getDynamicProperty.hartsorter:journal_v1")<=ticks+12);
  assert.ok(n(counts,"World.getDynamicProperty.hartsorter:queue_journal_v1")<=ticks*2+8);
  assert.equal(n(counts,"World.setDynamicProperty.hartsorter:journal_v1"),0);
});
test("FULL-NATIVE-02 stationary, linked cargo includes REAL graph guard, Hopper and Transporter observers",async()=>{
  const f=fixture({sorters:24,collectors:73,receivers:54,stationary:true,blocked:true});
  await f.loadFullRuntime();f.advance(7);f.metrics.reset();
  const ticks=21;f.advance(ticks);
  const {counts}=publish("linked stationary cargo, blocked native boundary",f,ticks);
  assert.equal(n(counts,"System.currentTick"),ticks,
    "A real liveLinkCheck MUST resolve native tick exactly once per synchronous logistics pass");
  assert.ok(n(counts,"Dimension.getBlock")>500*ticks,
    "The source-executed route probe must still observe actual Hopper and Transporter blocks");
  assert.ok(n(counts,"Dimension.getBlock")<=650*ticks,
    "Reused verified blocks and zero-Q4 outputs must not restore redundant reads");
  assert.ok(n(counts,"Block.typeId")<=725*ticks,
    "Eliminate repeated Hopper identities but retain real route graph reads");
  assert.ok(n(counts,"BlockPermutation.getState")<=250*ticks);
  assert.equal(n(counts,"System.currentTick"),21,
    "A reused native clock must not hide per-tick route freshness or 20-tick HOLD expiry");
  assert.equal(n(counts,"Container.setItem"),0,"HOLD must not debit a source");
  assert.equal(n(counts,"World.setDynamicProperty.hartsorter:queue_journal_v1"),0,
    "Unknown routes cannot write Q4");
});
test("FULL-NATIVE-03 queueable ingress retains Q4 custody when no home is verified",async()=>{
  const f=fixture({sorters:0,collectors:1,receivers:1,stationary:false,blocked:false});
  await f.loadFullRuntime();f.advance(7);f.metrics.reset();
  f.collectorSources[0].setItem(0,new Stack("minecraft:cobblestone",4));
  f.metrics.reset(); // exclude the fixture injection from measured native writes
  f.advance(1);
  const {counts}=publish("one loaded eligible Collector -> Q4 -> Receiver",f,1);
  assert.equal(n(counts,"System.currentTick"),1,
    "Ingress and Receiver drain share one real native clock within a logistics pass");
  assert.ok(n(counts,"Dimension.getBlock")>0);
  assert.ok(n(counts,"Container.firstItem")>0);
  assert.ok(n(counts,"Container.setItem")>0,"Test must exercise actual source/destination writers");
  assert.ok(n(counts,"World.setDynamicProperty.Q4")>0,
    "Test must exercise native Q4 persistence");
  assert.equal(f.collectorSources[0].inspect()[0],0,"Real ingress debits the physical Hopper");
  assert.equal(f.receiverOutputs[0].inspect()[0],0,
    "No source-reachable native home: original Q4 queue retains all four items");
  const raw=f.properties.get("hartsorter:q4m_q1");
  assert.ok(raw,"Existing Q4 meta remains persisted");
  assert.equal(JSON.parse(raw).q,4,"Exactly four Q4 items remain authoritatively held");
  assert.ok(n(counts,"Dimension.getBlock")<50,
    "One eligible route must not scan a whole artificial room");
  assert.ok(n(counts,"Container.getItem")<=16,"Avoid slot rereads during one routed item");
  assert.ok(n(counts,"World.setDynamicProperty.Q4")<=8,"Keep Q4 writes bounded per transfer");
});
test("FULL-NATIVE-07 real governed Collector to Q4 to Hopper to Sorter to chest",async()=>{
  const f=fixture({sorters:0,collectors:1,receivers:1,direct:true});
  await f.loadFullRuntime();f.advance(7);f.metrics.reset();
  f.collectorSources[0].setItem(0,new Stack("minecraft:cobblestone",4));
  f.metrics.reset();
  f.advance(1);
  const first=f.metrics.snapshot();
  assert.equal(f.collectorSources[0].inspect()[0],0,
    "The original Q4 enqueue writer debits exactly four native source items");
  assert.equal(f.receiverOutputs[0].inspect()[0],4,
    "The original Q4 dequeue writer credits only the proved native source Hopper");
  assert.equal(f.directChests[0].inspect()[0],0,"Sorter has not yet consumed Hopper cargo");
  assert.equal(JSON.parse(f.properties.get("hartsorter:q4m_q1")).q,0,
    "Q4 debit and Hopper credit conserve four units without a second writer");
  assert.ok(n(first,"World.setDynamicProperty.hartsorter:queue_journal_v1")>=4,
    "Original Q4 ingress and dequeue must both journal");
  f.metrics.reset();
  f.advance(1);
  const {counts}=publish("governed Collector -> Q4 -> Hopper -> Filter Sorter -> native chest",f,1);
  assert.equal(f.receiverOutputs[0].inspect()[0],0,
    "The original physical Sorter writer debits its proven native Hopper");
  assert.equal(f.directChests[0].inspect()[0],4,
    "The original physical Sorter writer credits exactly four cobblestone");
  assert.ok(n(counts,"World.setDynamicProperty.hartsorter:journal_v1")>=2,
    "A native chest write still requires the original physical journal");
  assert.ok(n(counts,"Container.setItem")>=2,
    "No bypass of the original physical source and destination setItem calls");
});
test("FULL-NATIVE-08 passively adjacent chest does not block real Collector/Q4/Sorter delivery",async()=>{
  const f=fixture({sorters:0,collectors:1,receivers:1,direct:true,directSideChest:true});
  await f.loadFullRuntime();f.advance(7);
  f.collectorSources[0].setItem(0,new Stack("minecraft:cobblestone",4));
  f.metrics.reset();
  f.advance(1);
  assert.equal(f.collectorSources[0].inspect()[0],0);
  assert.equal(f.receiverOutputs[0].inspect()[0],4,
    "The 1.5.10 Hopper must discharge along its physically verified downward path");
  assert.equal(JSON.parse(f.properties.get("hartsorter:q4m_q1")).q,0,
    "Native side chest must not change Q4 ownership");
  f.metrics.reset();
  f.advance(1);
  const {counts}=publish("four cobblestone via Q4/down Hopper/Sorter next to passive chest",f,1);
  assert.equal(f.receiverOutputs[0].inspect()[0],0);
  assert.equal(f.directChests[0].inspect()[0],4,
    "All four items must reach actual Filter chest, not passive neighbor");
  assert.equal(f.directSideChests[0].inspect()[0],0,
    "Side chest must receive zero items while native Hopper points down");
  assert.ok(n(counts,"World.setDynamicProperty.hartsorter:journal_v1")>=2,
    "Native Sorter physical custody journal remains mandatory");
  assert.ok(n(counts,"Container.setItem")>=2);
});
test("FULL-NATIVE-09 exact outgoing Hopper end chest does not misroute Filter cargo",async()=>{
  const f=fixture({sorters:0,collectors:1,receivers:1,direct:true,directedTerminalChest:true});
  await f.loadFullRuntime();f.advance(7);
  f.collectorSources[0].setItem(0,new Stack("minecraft:cobblestone",4));
  f.metrics.reset();
  f.advance(1);
  const {counts}=publish("4 cobblestone via original Q4 directly into chosen Sorter Filter chest; native outgoing Hopper points at terminal chest",f,1);
  assert.equal(f.collectorSources[0].inspect()[0],0,"Collector enqueued exactly four items");
  assert.equal(JSON.parse(f.properties.get("hartsorter:q4m_q1")).q,0,"Receiver Q4 has no held items");
  assert.equal(f.directChests[0].inspect()[0],4,"Intended Sorter Filter chest owns all four items");
  assert.equal(f.nativeTerminals[0].inspect()[0],0,"Native terminal chest did NOT intercept claimed Filter cargo");
  assert.equal(f.receiverOutputs[0].inspect()[0],0,"Q4 writer skipped Hopper which could divert item");
  assert.ok(n(counts,"World.setDynamicProperty.hartsorter:queue_journal_v1")>=4,
    "Original Q4 enqueue and direct Filter chest dequeue use one journal");
  assert.equal(n(counts,"World.setDynamicProperty.hartsorter:journal_v1"),0,
    "No fictitious physical Sorter transfer; one Q4 chest credit is the only writer");
});
test("FULL-NATIVE-10 actual ship runtime routes four Filter items past a Hopper pointing into stone bricks",async()=>{
  const f=fixture({sorters:0,collectors:1,receivers:1,direct:true,directedTerminalInert:true});
  await f.loadFullRuntime();f.advance(7);
  f.collectorSources[0].setItem(0,new Stack("minecraft:cobblestone",4));
  f.metrics.reset();f.advance(1);
  const {counts}=publish("original Q4 credits 4 Filter cobblestone directly when Hopper points at non-inventory stone bricks",f,1);
  assert.equal(f.collectorSources[0].inspect()[0],0,"Collector enqueued four");
  assert.equal(JSON.parse(f.properties.get("hartsorter:q4m_q1")).q,0,"No held Q4");
  assert.equal(f.directChests[0].inspect()[0],4,"Exactly 4 in selected Filter chest");
  assert.equal(f.receiverOutputs[0].inspect()[0],0,"Lateral native Hopper is not custody writer");
  assert.equal(f.nativeInertTerminals[0].typeId,"minecraft:stone_bricks");
  assert.ok(n(counts,"World.setDynamicProperty.hartsorter:queue_journal_v1")>=4,
    "Original Q4 enqueue/dequeue journal is used");
  assert.equal(n(counts,"World.setDynamicProperty.hartsorter:journal_v1"),0,
    "No fictitious physical Sorter transfer when direct home is credited");
});
test("FULL-NATIVE-11 protected 16388 Q4 with two links stays intact; no full graph rechecks without a home",async()=>{
  const f=fixture({sorters:1442,collectors:2,receivers:1,blocked:true,managedBacklog:16388});
  const key="hartsorter:q4m_q1";
  const untouched=f.properties.get(key);
  await f.loadFullRuntime();
  assert.equal(f.properties.get(key),untouched,"Startup must not rewrite the protected queue");
  f.advance(7);f.metrics.reset();
  const ticks=40;f.advance(ticks);
  const {counts,perTick}=publish("16388 Q4 held, no direct home, bounded native checks",f,ticks);
  assert.equal(f.properties.get(key),untouched,"No Q4 debit or metadata mutation");
  assert.equal(f.receiverOutputs[0].inspect()[0],0,"No speculative Hopper output");
  assert.equal(n(counts,"Container.setItem"),0,"No custody writer may execute");
  assert.equal(n(counts,"World.setDynamicProperty.hartsorter:queue_journal_v1"),0);
  assert.ok(perTick["Dimension.getBlock"]<1500,
    "No source-wide Hopper/Transporter scan on every tick: "+perTick["Dimension.getBlock"]);
  assert.ok(perTick["Block.typeId"]<2000,
    "No expensive unmanaged bank graph walk each tick: "+perTick["Block.typeId"]);
});
test("FULL-NATIVE-12 actual shipped two-bank Q4 -> saved Collector link -> live Filter chest, one journal",async()=>{
  const f=fixture({sorters:0,collectors:1,receivers:2,remoteBank:true});
  await f.loadFullRuntime();f.advance(7);
  f.collectorSources[0].setItem(0,new Stack("minecraft:cobblestone",4));
  f.metrics.reset();f.advance(1);
  const {counts}=publish("two real loaded Transporter bank runs, one explicit Collector->Receiver hop and 4 Q4->Filter native chest",f,1);
  assert.equal(f.collectorSources[0].inspect()[0],0,"Source Collector enqueued exactly four");
  assert.equal(JSON.parse(f.properties.get("hartsorter:q4m_q1")).q,0,"Source Q4 should drain");
  assert.equal(JSON.parse(f.properties.get("hartsorter:q4m_q2")).q,0,"Skipped intermediary Q4 stays empty");
  assert.equal(f.remoteChests[0].inspect()[0],4,"All 4 reached the remote Filter home");
  assert.equal(f.receiverOutputs[0].inspect()[0],0,"No unverified Hopper staging");
  assert.equal(f.receiverOutputs[1].inspect()[0],0,"No intermediate Receiver staging");
  assert.ok(n(counts,"World.setDynamicProperty.hartsorter:queue_journal_v1")>=4,
    "The original Q4 enqueue/dequeue journal is the sole owner");
  assert.equal(n(counts,"World.setDynamicProperty.hartsorter:journal_v1"),0,
    "No fake physical Sorter custody writer");
});
test("FULL-NATIVE-13 unknown remote claim and a physical bank cycle cannot debit Q4",async()=>{
  for(const opts of [
    {remoteFilterId:"minecraft:dirt"},
    {remoteCycle:true},
    {remoteUnknownHopper:true}
  ]){
    const f=fixture({sorters:0,collectors:1,receivers:2,remoteBank:true,...opts});
    await f.loadFullRuntime();f.advance(7);
    f.collectorSources[0].setItem(0,new Stack("minecraft:cobblestone",4));
    f.metrics.reset();f.advance(1);
    assert.equal(f.remoteChests[0].inspect()[0],0,
      "Unsafe remote bank must not write destination: "+JSON.stringify(opts));
    assert.equal(f.receiverOutputs[0].inspect()[0],0);
    assert.equal(f.receiverOutputs[1].inspect()[0],0);
    const q=JSON.parse(f.properties.get("hartsorter:q4m_q1")).q;
    assert.ok(q===0||q===4,"Source may only retain Q4 or pre-ingress HOLD");
    assert.equal(4-q, f.collectorSources[0].inspect()[0]===4 ? 0:4,
      "Source+Q4 conservation under route rejection");
  }
});
test("FULL-NATIVE-04 idle native frames vs legacy mode/display maintenance are separate budgets",async()=>{
  const f=fixture({sorters:64,collectors:0,receivers:0,legacy:true});
  await f.loadFullRuntime();f.advance(7);f.metrics.reset();f.advance(100);
  const {counts}=publish("legacy Sorter displays and mode maintenance",f,100);
  assert.ok(n(counts,"Dimension.getEntities")>0,
    "100-tick reconciliation must actually execute; no hidden mocked-out callbacks");
  assert.ok(n(counts,"BlockPermutation.getState")>0,
    "5-tick legacy mode reconciliation must actually execute");
  assert.ok(n(counts,"Dimension.getEntities")<=64*2,
    "Entity queries should be local to legacy Sorters, not whole dimensions");
  assert.equal(n(counts,"Container.setItem"),0);
});

test("FULL-NATIVE-05 every unrelated vanilla item spawn must have a bounded Collector scan/retry cost",async()=>{
  const f=fixture({sorters:0,collectors:73,receivers:1});
  await f.loadFullRuntime();f.advance(7);f.metrics.reset();
  f.emit("after.entitySpawn",{entity:{typeId:"minecraft:item",isValid:true,
    dimension:{id:DIM},location:{x:0,y:70,z:0}}});
  f.advance(5);
  const {counts}=publish("unrelated item entity spawned outside all 73 Collectors",f,5,
    {eventCount:1,fixtureNote:"Includes five real source retry attempts and normal intervals"});
  assert.equal(n(counts,"System.runTimeout"),5,
    "Original entitySpawn callback plus four retry timers must be measured");
  assert.equal(n(counts,"Dimension.getBlock"),5*(73*7+1),
    "All five retries still run, but DISTANT spawned items cannot trigger any native Collector lookups");
  assert.equal(n(counts,"Container.setItem"),0);
  assert.equal(n(counts,"World.setDynamicProperty.hartsorter:queue_journal_v1"),0);
});
test("FULL-NATIVE-06 placement invalidates guard and schedules local Transporter visuals only",async()=>{
  const f=fixture({sorters:0,collectors:0,receivers:0});
  await f.loadFullRuntime();f.advance(7);f.metrics.reset();
  f.emit("after.playerPlaceBlock",{block:{dimension:f.world.getDimension(DIM),
    location:{x:9120,y:70,z:10},typeId:"hartsorter:transporter"}});
  f.metrics.reset();
  f.advance(2);
  const {counts}=publish("event-driven pipe arm update after placement",f,2);
  assert.ok(n(counts,"Dimension.getBlock")>0,"Run actual visual-queue flush");
  assert.ok(n(counts,"Dimension.getBlock")<=49,"At most seven local positions, six face checks each");
  assert.equal(n(counts,"Container.setItem"),0);
});
