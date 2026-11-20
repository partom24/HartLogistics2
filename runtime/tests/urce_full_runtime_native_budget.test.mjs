/**
 * FULL-RUNTIME native API call budget (instrumented Node stubs, never Bedrock timing).
 *
 * Load real ESM main.js and all imported URCE modules into one VM. Do NOT replace
 * any Hart functions: source discovery, Q4, route guard, topology observers,
 * transporter visuals, event subscriptions, and all scheduled jobs stay intact.
 *
 * --experimental-vm-modules is needed for vm.SourceTextModule (Node 20/22).
 * Counters measure native API invocation counts, NOT CPU time, BDS TPS or latency.
 */
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
                  blocked=false,legacy=false}={}) {
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
    block("hartsorter:sorter",p,{states:{"hartlogistics:mode":"filter"}});
    block("minecraft:hopper",{...p,y:65},{items:[]});
    registry.push({d:DIM,...p,m:"filter",f:{typeId:"minecraft:diamond"},
      ...(legacy?{}:{i:[p.x,p.y,p.z-1,2]})});
  }
  const cols=[],recs=[],collectorSources=[];
  for(let i=0;i<receivers;i++){
    const p={x:80000+i*20,y:70,z:0},id=key(DIM,p),queueKey="q"+(i+1);
    block("hartsorter:receiver",p);
    block("minecraft:hopper",{...p,y:69},{items:[],facing:0});
    if(blocked)block("minecraft:chest",{...p,y:68},{items:[]});
    recs.push({id,d:DIM,...p,present:true,queueKey,qVersion:4,qGen:0,qShards:0,
      received:0,delivered:0,queued:0});
    properties.set("hartsorter:q4m_"+queueKey,JSON.stringify({v:4,h:0,t:0,n:1,q:0,r:0,d:0}));
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
  return {metrics,loadFullRuntime,advance,collectorSources,properties,warnings,intervals,world,
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
  f.advance(5); // include one-time startup/initial display cleanup outside steady-state window
  f.metrics.reset();
  const ticks=100;f.advance(ticks);
  const {counts}=publish("loaded empty hopper steady state, full runtime",f,ticks);
  assert.equal(n(counts,"System.currentTick"),0,"Genuinely idle runtime must not read expensive native tick clock");
  assert.equal(n(counts,"Container.setItem"),0,"Empty inventory must never mutate");
  assert.equal(n(counts,"Dimension.getBlock"),(1442+73*8+54*3)*ticks,
    "Missing or newly added native block observation must be explicitly reviewed");
  assert.equal(n(counts,"Container.firstItem"),1442*ticks,
    "Empty Sorter firstItem remains one read per source; never scan slots");
  assert.equal(n(counts,"Container.getItem"),0);
  assert.ok(n(counts,"World.getDimension")<=3,"Dimension handles should stay cached");
  assert.ok(n(counts,"World.getDynamicProperty.hartsorter:journal_v1")<=ticks+6);
  assert.ok(n(counts,"World.getDynamicProperty.hartsorter:queue_journal_v1")<=ticks*2+8);
  assert.equal(n(counts,"World.setDynamicProperty.hartsorter:journal_v1"),0);
});
test("FULL-NATIVE-02 stationary, linked cargo includes REAL graph guard, Hopper and Transporter observers",async()=>{
  const f=fixture({sorters:24,collectors:73,receivers:54,stationary:true,blocked:true});
  await f.loadFullRuntime();f.advance(5);f.metrics.reset();
  const ticks=21;f.advance(ticks);
  const {counts}=publish("linked stationary cargo, blocked native boundary",f,ticks);
  assert.ok(n(counts,"System.currentTick")>=73*ticks,
    "Real liveLinkCheck native clock cost must be counted, not replaced by a zero-cost fake");
  assert.ok(n(counts,"Dimension.getBlock")>73*8*ticks,
    "Real route probe must do native Hopper/Transporter topology observations");
  assert.ok(n(counts,"Dimension.getBlock")<4000*ticks,
    "A repeated full topology scan per source is a native API regression");
  assert.equal(n(counts,"Container.setItem"),0,"HOLD must not debit a source");
  assert.equal(n(counts,"World.setDynamicProperty.hartsorter:queue_journal_v1"),0,
    "Unknown routes cannot write Q4");
});
test("FULL-NATIVE-03 eligible live source exercises real custody writer and receiver drain",async()=>{
  const f=fixture({sorters:0,collectors:1,receivers:1,stationary:true,blocked:false});
  await f.loadFullRuntime();f.advance(5);f.metrics.reset();
  f.advance(1);
  const {counts}=publish("one loaded eligible Collector -> Q4 -> Receiver",f,1);
  assert.ok(n(counts,"System.currentTick")>0,"Route guard must be genuinely invoked");
  assert.ok(n(counts,"Dimension.getBlock")>0);
  assert.ok(n(counts,"Container.firstItem")>0);
  assert.ok(n(counts,"Container.setItem")>0,"Test must exercise actual source/destination writers");
  assert.ok(Object.keys(counts).some(k=>k.startsWith("World.setDynamicProperty.hartsorter:q4")),
    "Test must exercise native Q4 persistence");
  assert.ok(n(counts,"Dimension.getBlock")<300,
    "One eligible route must not scan a whole artificial room");
});
test("FULL-NATIVE-04 idle native frames vs legacy mode/display maintenance are separate budgets",async()=>{
  const f=fixture({sorters:64,collectors:0,receivers:0,legacy:true});
  await f.loadFullRuntime();f.advance(5);f.metrics.reset();f.advance(100);
  const {counts}=publish("legacy Sorter displays and mode maintenance",f,100);
  assert.ok(n(counts,"Dimension.getEntities")>0,
    "100-tick reconciliation must actually execute; no hidden mocked-out callbacks");
  assert.ok(n(counts,"BlockPermutation.getState")>0,
    "5-tick legacy mode reconciliation must actually execute");
  assert.ok(n(counts,"Dimension.getEntities")<=64*2,
    "Entity queries should be local to legacy Sorters, not whole dimensions");
  assert.equal(n(counts,"Container.setItem"),0);
});
