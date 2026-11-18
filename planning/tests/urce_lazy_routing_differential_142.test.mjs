/**
 * URCE U1: SOURCE-ONLY, counterfactual lazy tier route, no gameplay mutation.
 *
 * Loads the exact 1.4.2 processColumn from addon/ and executes it against a
 * minimally transformed candidate built IN TEST MEMORY. Also executes the
 * actual matching, admission, Hopper-compaction, Q4 journal writer,
 * destination resolution and Collector-route function bodies.
 *
 * Observe exact outcomes AND relative native-shaped call counts. No BDS
 * performance, external-writer concurrency or release claim is made.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const script=fs.readFileSync(path.join(root,"addon/behavior_pack/scripts/main.js"),"utf8");
assert.equal(createHash("sha256").update(script).digest("hex"),
  "2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411",
  "Only the exact 1.4.2 native-first engine is a valid baseline");

function extract(name){
  const start=script.indexOf("function "+name+"(");
  assert.ok(start>=0,"missing real source function "+name);
  const brace=script.indexOf("{",start);
  let depth=0,quote="",escape=false,line=false,block=false;
  for(let i=brace;i<script.length;i++){
    const c=script[i],n=script[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){
      if(escape){escape=false;continue;}
      if(c==="\\"){escape=true;continue;}
      if(c===quote)quote="";continue;
    }
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)return script.slice(start,i+1);
  }
  throw Error("unclosed real source function "+name);
}
function compile(body,env){return vm.runInNewContext(body+"\n;"+body.match(/^function (\w+)/)[1],
  env,{timeout:3000,filename:"1.4.2:source-function"});}
function replaceExact(s,old,now,description){
  const n=s.split(old).length-1;
  assert.equal(n,1,"candidate drift in "+description);
  return s.replace(old,now);
}
const originalColumn=extract("processColumn");
let proposed=originalColumn;
proposed=replaceExact(proposed,`    const activeSorters = col.sorters.filter(e => {
        const b = sorterAt(e);
        return b && !e.nativeQuarantine && !blockIsRedstonePowered(b) && sorterMode(e) !== "bypass";
    });
    if (!activeSorters.length) return 0;`,
`    // Counterfactual: still require at least one physically active Sorter
    // before compaction, but short-circuit at the FIRST live active Sorter.
    // The baseline scans all Sorter blocks at this point.
    let anyActive = false;
    for (const e of col.sorters) {
        const b = sorterAt(e);
        if (b && !e.nativeQuarantine && !blockIsRedstonePowered(b) &&
            sorterMode(e) !== "bypass") { anyActive = true; break; }
    }
    if (!anyActive) return 0;`,"live-active prequalification");
proposed=replaceExact(proposed,`        const specific = activeSorters.filter(e => sorterMode(e) === "filter" && e.f && matchesFilter(stack, e.f));
        // Defer AUTO seed checks until this target is actually attempted.
        // Otherwise every eligible chest is scanned in candidate selection
        // and then again just before insertion, even if Filter handled cargo.
        const auto = activeSorters.filter(e => sorterMode(e) === "auto");
        const wildcard = activeSorters.filter(e => sorterMode(e) === "wildcard");
        const targets = [...specific, ...auto, ...wildcard];

        if (!targets.length) continue;

        for (const e of targets) {`,
`        // Counterfactual: only resolve native block state AFTER cheap policy
        // membership. Each tier preserves bottom-to-top registry ordering.
        for (const tier of ["filter", "auto", "wildcard"]) {
          for (const e of col.sorters) {
            if (sorterMode(e) !== tier ||
                (tier === "filter" && (!e.f || !matchesFilter(stack, e.f)))) continue;
            const live = sorterAt(e);
            if (!live || e.nativeQuarantine || blockIsRedstonePowered(live)) continue;`,
"candidate list -> lazy ordered candidate walk");
proposed=replaceExact(proposed,`            if (columnBudget <= 0) break;
            stack = src.getItem(si);
            if (!stack) break;
        }
    }

    // Only a transfer can create a new gap`,
`            if (columnBudget <= 0) break;
            stack = src.getItem(si);
            if (!stack) break;
          } // registered entries in this tier
          if (columnBudget <= 0 || !src.getItem(si)) break;
        } // priority tier

    }

    // Only a transfer can create a new gap`,
"candidate/tier close");
assert.match(proposed,/for \(const tier of \["filter", "auto", "wildcard"\]\)/);
assert.doesNotMatch(proposed,/const targets = /);
assert.match(originalColumn,/const targets = \[\.\.\.specific, \.\.\.auto, \.\.\.wildcard\]/);

let shared=replaceExact(proposed,
  `            const live = sorterAt(e);
            if (!live || e.nativeQuarantine || blockIsRedstonePowered(live)) continue;`,
  `            // Defer even the native Sorter check until the candidate
            // is actually being attempted, rather than pre-reading it.`,
  "avoid duplicate candidate validation");
shared=replaceExact(shared,
  `                const dest = destinationFor(e);`,
  `                // One fresh Sorter read for this attempt. Hand the same live
                // Block to destinationFor; no second sorterAt call.
                const live = sorterAt(e);
                if (!live || e.nativeQuarantine || blockIsRedstonePowered(live)) break;
                const dest = destinationFor(e, live);`,
  "reuse exact same live block within one synchronous transfer attempt");
const sharedDestination=replaceExact(extract("destinationFor"),
  `function destinationFor(entry) {
    const b = sorterAt(entry);`,
  `function destinationFor(entry, precheckedSorter) {
    const b = precheckedSorter ?? sorterAt(entry);`,
  "pass verified live Sorter block to the actual native destination function");

const functionBodies={
  sorterMode:extract("sorterMode"),
  matchesFilter:extract("matchesFilter"),
  findAcceptSlot:extract("findAcceptSlot"),
  compactSourceHopper:extract("compactSourceHopper"),
  facingOffset:extract("facingOffset"),
  supportedStorage:extract("supportedStorage"),
  destinationFor:extract("destinationFor"),
  sorterCollectorRoute:extract("sorterCollectorRoute"),
  exactStackSig:extract("exactStackSig"),
  safeMovePartial:extract("safeMovePartial")
};

function plain(typeId,amount=1,{meta="",maxAmount=64,ench=[],potion=null}={}){
  return {typeId,amount,meta,maxAmount,ench:[...ench],potion};
}
function asItem(p){
  if(p===undefined||p===null)return undefined;
  return {
    ...snap(p),
    clone(){return asItem(this);},
    getLore(){return this.meta?[this.meta]:[];},
    getComponent(id){
      if(id==="minecraft:durability")return undefined;
      if(id==="minecraft:potion"&&this.potion)return {potionEffectType:{id:this.potion.effect},potionDeliveryType:{id:this.potion.delivery}};
      return undefined;
    }
  };
}
const snap=x=>x==null?null:{
  typeId:x.typeId,amount:x.amount,meta:x.meta??"",maxAmount:x.maxAmount??64,
  ench:[...(x.ench??[])],potion:x.potion??null
};
const key=x=>JSON.stringify(snap(x));
function makeInventory(items,metrics,name){
  const slots=items.map(asItem);
  const api={
    isValid:true,
    get size(){return slots.length;},
    get emptySlotsCount(){metrics.emptyCount++;return slots.filter(x=>!x).length;},
    firstItem(){metrics.firstItem++;const p=slots.findIndex(Boolean);return p<0?undefined:p;},
    firstEmptySlot(){metrics.firstEmptySlot++;const p=slots.findIndex(v=>!v);return p<0?undefined:p;},
    getItem(i){metrics.getItem++;return slots[i]?.clone();},
    setItem(i,x){metrics.setItem++;metrics.events.push(["setItem",name,i,snap(x)]);slots[i]=asItem(x);},
    getSlot(i){
      metrics.getSlot++;
      return {
        hasItem(){metrics.hasItem++;return Boolean(slots[i]);},
        get typeId(){metrics.slotType++;return slots[i]?.typeId;},
        get amount(){return slots[i]?.amount;},
        get maxAmount(){return slots[i]?.maxAmount;},
        getItem(){return slots[i]?.clone();},
        isStackableWith(incoming){
          metrics.stackability++;
          const s=slots[i];
          return Boolean(s&&s.typeId===incoming.typeId&&s.meta===incoming.meta
            &&s.maxAmount>1&&incoming.maxAmount>1
            &&JSON.stringify(s.ench)===JSON.stringify(incoming.ench)
            &&JSON.stringify(s.potion)===JSON.stringify(incoming.potion));
        }
      };
    }
  };
  return {slots,api};
}
function metric(){
  return {sorterAt:0,powered:0,destinationFor:0,blockLookup:0,
    size:0,getSlot:0,getItem:0,setItem:0,emptyCount:0,firstItem:0,
    firstEmptySlot:0,hasItem:0,slotType:0,stackability:0,
    serialize:0,queueRead:0,journalPrepare:0,journalClear:0,
    registered:0,logisticsSave:0,events:[]};
}
function scenario({
  source=[plain("minecraft:stone",3),undefined,undefined,undefined,undefined],
  entries=[{mode:"filter",filter:"minecraft:stone",destination:{kind:"storage",slots:[undefined,...Array(8).fill(null)]}}],
  sourceLocked=false,sourceMissing=false,cap=256
}={}){
  return {source,entries,sourceLocked,sourceMissing,cap};
}
function makeWorld(def,{sharedBlock=false}={}){
  const stats=metric();
  const src=makeInventory(def.source,stats,"source");
  const dests=new Map(),blocks=new Map(),collectors=new Map();
  let serial=0;
  const rootDim={id:"overworld",getBlock(loc){
    stats.blockLookup++;
    if(loc.y===70&&loc.z===0)return def.sourceMissing?undefined:sourceBlock;
    if(loc.z===-1)return dests.get(loc.y)?.block;
    return undefined;
  }};
  const sourceBlock={
    typeId:"minecraft:hopper",location:{x:0,y:70,z:0},dimension:rootDim,
    getComponent(id){return id==="minecraft:inventory"?{container:src.api}:undefined;}
  };
  def.entries.forEach((item,i)=>{
    const e={
      id:"s"+i,d:"overworld",x:0,y:70-def.entries.length+i,z:0,
      m:item.mode,f:item.filter?{match:{
        typeId:item.filter,enchIds:item.enchIds??[],potion:item.potion??undefined
      }}:undefined,
      nativeQuarantine:!!item.quarantine, powered:!!item.powered, missing:!!item.missing,
    };
    const d=item.destination??{kind:"storage",slots:Array(9).fill(undefined)};
    const native=d.kind==="storage"?makeInventory(d.slots??Array(9).fill(undefined),stats,e.id):undefined;
    const blk={
      typeId:d.kind==="collector"?"hartlogistics:collector":d.kind==="unsupported"?"minecraft:stone":"minecraft:chest",
      location:{x:0,y:e.y,z:-1},dimension:rootDim,
      powered:!!d.powered,
      getComponent(id){return id==="minecraft:inventory"&&native?{container:native.api}:undefined;}
    };
    dests.set(e.y,{native,block:blk,desc:d});
    blocks.set(e.id,e);
    e.item={...item};
    def.entries[i]=e;
    if(d.kind==="collector"&&d.link){
      const id="overworld|0|"+e.y+"|-1";
      collectors.set(id,{id,link:d.link,present:true});
    }
  });
  let journal;
  const env={
    PER_COLUMN_BATCH:16,
    QUEUE_CAPACITY:250000,
    COLLECTOR_ID:"hartlogistics:collector",
    SORTER_MODES:["filter","auto","wildcard","bypass"],
    POTION_ITEM_IDS:new Set(["minecraft:potion","minecraft:splash_potion","minecraft:lingering_potion"]),
    enchantments:s=>s.ench??[],
    potionIdentity:s=>s.potion??undefined,
    getDimension:id=>id==="overworld"?rootDim:undefined,
    hopperIsRedstoneLocked:()=>def.sourceLocked,
    sorterAt:e=>{
      stats.sorterAt++;
      return e.missing?undefined:{
        typeId:"hartlogistics:sorter",location:{x:0,y:e.y,z:0},dimension:rootDim,
        permutation:{getState:()=> "north"},powered:e.powered
      };
    },
    blockIsRedstonePowered:b=>{stats.powered++;return Boolean(b.powered);},
    saveJournal:v=>{if(v){stats.journalPrepare++;journal=structuredClone(v);stats.events.push(["journalPrepare",v.dstSlot,v.move]);}
      else {stats.journalClear++;journal=undefined;stats.events.push(["journalClear"]);}},
    log:msg=>stats.events.push(["log",String(msg)]),
    registerCollector:b=>{
      stats.registered++;
      const id="overworld|0|"+b.location.y+"|-1";
      const desc=dests.get(b.location.y)?.desc;
      const obj={id,link:desc?.link,present:true};
      collectors.set(id,obj);
      return obj;
    },
    findCollectorById:id=>collectors.get(id),
    findReceiverById:id=>{
      for(const d of dests.values())if(d.desc?.kind==="collector"&&d.desc.link===id)
        return {id,queued:d.desc.queued??0};
      return undefined;
    },
    saveLogistics:()=>{stats.logisticsSave++;},
    logisticsId:(dim,x,y,z)=>[dim,x,y,z].join("|"),
    serializeQueueItem:s=>{stats.serialize++;return s.meta==="opaque"?undefined:{typeId:s.typeId,meta:s.meta,ench:s.ench};},
    loadReceiverQueue:r=>{
      stats.queueRead++;
      for(const d of dests.values())if(d.desc?.link===r.id){
        if(d.desc.throwQueue)throw Error("queue unavailable");
        return {total:d.desc.queued??0};
      }
      throw Error("missing queue");
    },
    enqueueFromSource:(_receiver,_collector,s,si,want,data)=>{
      const it=s.container.getItem(si);
      const n=Math.min(want,it.amount);
      stats.events.push(["queuePrepare",data.typeId,n]);
      for(const holder of dests.values())
        if(holder.desc?.kind==="collector"&&holder.desc.link===_collector.link)
          holder.desc.queued=(holder.desc.queued??0)+n;
      s.container.setItem(si,it.amount===n?undefined:Object.assign(it,{amount:it.amount-n}));
      stats.events.push(["queueCommit",data.typeId,n]);
      return n;
    },
    exactStackSig:s=>key(s),
    serializeTransport:s=>snap(s),
    filterRoundTripSafe:()=>true,
    recoverJournal:()=>{},
    recoverQueueJournal:()=>{}
  };
  // Actual source function bodies, compiled into this scenario's VM context.
  const fun={};
  // Evaluation resolves free names at call time using the shared environment
  // and preserves real source behavior for the baseline and counterfactual.
  const bodies=sharedBlock?{...functionBodies,destinationFor:sharedDestination}:functionBodies;
  const definitions=Object.values(bodies).join("\n")+"\n";
  // Introduce metric wrappers around the actual functions at their boundary.
  const names=Object.keys(functionBodies);
  const obj=vm.runInNewContext(definitions+"\n({"+names.map(n=>n+":"+n).join(",")+"})",env,{timeout:3000});
  // Wrapping the same VM functions in JS is sufficient: actual functions use
  // globals looked up dynamically from env, so expose instrumentation there.
  const originalDestination=obj.destinationFor;
  env.destinationFor=(...args)=>{stats.destinationFor++;return originalDestination(...args);};
  env.sorterMode=obj.sorterMode;
  env.matchesFilter=obj.matchesFilter;
  env.compactSourceHopper=obj.compactSourceHopper;
  env.findAcceptSlot=(...args)=>obj.findAcceptSlot(...args);
  env.safeMovePartial=(...args)=>obj.safeMovePartial(...args);
  env.sorterCollectorRoute=(...args)=>obj.sorterCollectorRoute(...args);
  env.facingOffset=obj.facingOffset;
  env.supportedStorage=obj.supportedStorage;
  // Record each actual function to compare semantics independent of proposals.
  stats.source=src;
  stats.destinations=dests;
  return {stats,src,dests,env,originalDestination,get journal(){return journal;}};
}
function execute(def,variant=false){
  // Each run receives a fresh source/destination model, never shared inventory.
  const copy=structuredClone(def);
  const w=makeWorld(copy,{sharedBlock:variant==="shared"});
  const fn=compile(variant==="shared"?shared:(variant?proposed:originalColumn),w.env);
  const col={d:"overworld",x:0,z:0,source:{x:0,y:70,z:0},sorters:copy.entries};
  const moved=fn(col,copy.cap);
  const end={
    moved,
    source:w.src.slots.map(snap),
    destinations:[...w.dests.entries()].map(([y,d])=>({
      y,kind:d.desc.kind,slots:d.native?.slots.map(snap)??null,
      queued:d.desc.queued??0,registered:!d.desc.link && w.env.findCollectorById("overworld|0|"+y+"|-1")!==undefined
    })),
    journal:w.journal??null,
    events:w.stats.events
  };
  const counts=Object.fromEntries(Object.entries(w.stats).filter(([k,v])=>typeof v==="number"));
  return {end,counts};
}
function differential(def,label,variant=true){
  const baseline=execute(def,false);
  const candidate=execute(def,variant);
  assert.deepEqual(candidate.end,baseline.end,label+": mutation/journal/order differ");
  assert.equal(candidate.counts.getSlot,baseline.counts.getSlot,
    label+": lazy policy must not alter native capacity attempts in this model");
  assert.equal(candidate.counts.destinationFor,baseline.counts.destinationFor,
    label+": candidate destination attempt count changed");
  assert.equal(candidate.counts.journalPrepare,baseline.counts.journalPrepare);
  assert.equal(candidate.counts.journalClear,baseline.counts.journalClear);
  return {baseline,candidate};
}
const storage=(slots)=>({kind:"storage",slots});
const dirt=()=>plain("minecraft:dirt",64);
const full=()=>Array.from({length:54},dirt);

test("URCE-LAZY-01 source-only proposal is not installed in 1.4.2 gameplay",()=>{
  assert.match(originalColumn,/const activeSorters = col\.sorters\.filter/);
  assert.match(originalColumn,/const targets = \[\.\.\.specific, \.\.\.auto, \.\.\.wildcard\]/);
  assert.doesNotMatch(script,/for \(const tier of \["filter", "auto", "wildcard"\]\)/);
  assert.match(proposed,/for \(const tier of \["filter", "auto", "wildcard"\]\)/);
});
test("URCE-LAZY-02 cheap Filter mismatch avoids unnecessary Sorter block checks, not Auto admission",()=>{
  const def=scenario({
    source:[plain("minecraft:stone",2),undefined,undefined,undefined,undefined],
    entries:[
      {mode:"auto",destination:storage(full())},
      {mode:"filter",filter:"minecraft:dirt",destination:storage(full())},
      {mode:"filter",filter:"minecraft:diamond",destination:storage(full())},
      {mode:"filter",filter:"minecraft:iron_ingot",destination:storage(full())},
      {mode:"wildcard",destination:storage([undefined,...Array(8).fill(null)])}
    ]
  });
  const {baseline,candidate}=differential(def,"Filter misses with Auto+Wildcard");
  assert.equal(baseline.end.moved,2);
  assert.ok(candidate.counts.sorterAt<baseline.counts.sorterAt,
    "Avoid live block reads on policy-ineligible Filters");
  assert.equal(candidate.counts.getSlot,baseline.counts.getSlot,
    "Actually tried full Auto must still inspect its live chest");
});
test("URCE-LAZY-03 matching physical Filters preserve Q4 writer and partial-remainder continuation",()=>{
  const source=[plain("minecraft:stone",20),undefined,undefined,undefined,undefined];
  const a=full(),b=full();a[0]=plain("minecraft:stone",61);b[0]=plain("minecraft:stone",55);
  const def=scenario({source,entries:[
    {mode:"filter",filter:"minecraft:stone",destination:storage(a)},
    {mode:"filter",filter:"minecraft:stone",destination:storage(b)},
    {mode:"wildcard",destination:storage([undefined,...Array(8).fill(null)])}
  ]});
  const {baseline}=differential(def,"two Filter partials and remainder");
  assert.equal(baseline.end.moved,16,"Column budget remains exactly 16");
  assert.ok(baseline.end.events.some(x=>x[0]==="journalPrepare"));
  assert.equal(baseline.end.events.filter(x=>x[0]==="journalPrepare").length,
    baseline.end.events.filter(x=>x[0]==="journalClear").length);
});
test("URCE-LAZY-04 Filter-only no-match original transit still compacts native Hopper",()=>{
  const def=scenario({
    source:[undefined,plain("minecraft:stone",2),plain("minecraft:stone",1),undefined,undefined],
    entries:[
      {mode:"filter",filter:"minecraft:dirt",destination:storage(full())},
      {mode:"bypass",destination:storage(full())}
    ]});
  const {baseline,candidate}=differential(def,"transit compaction");
  assert.equal(baseline.end.moved,0);
  assert.equal(baseline.counts.destinationFor,0);
  assert.equal(candidate.counts.destinationFor,0);
  assert.equal(baseline.end.source[0].amount,2,"compacted to first native Hopper slot");
});
test("URCE-LAZY-05 missing and powered Sorters cannot change native Hopper custody",()=>{
  for(const [caseName,entries] of [
    ["all bypass",[{mode:"bypass"}]],
    ["all missing",[{mode:"filter",filter:"minecraft:stone",missing:true}]],
    ["all powered",[{mode:"wildcard",powered:true}]],
    ["quarantined",[{mode:"auto",quarantine:true}]]
  ]){
    const def=scenario({entries,source:[undefined,plain("minecraft:stone",1),undefined,undefined,undefined]});
    const {baseline}=differential(def,caseName);
    assert.equal(baseline.end.moved,0);
  }
});
test("URCE-LAZY-06 seeded Auto and Wildcard fallback retain metadata-sensitive admission",()=>{
  const slots=full();slots[4]=plain("minecraft:stone",60,{meta:"named"});
  const def=scenario({
    source:[plain("minecraft:stone",2,{meta:"named"}),undefined,undefined,undefined,undefined],
    entries:[
      {mode:"filter",filter:"minecraft:dirt",destination:storage(full())},
      {mode:"auto",destination:storage(slots)},
      {mode:"wildcard",destination:storage([undefined,...Array(8).fill(null)])}
    ]});
  const {baseline}=differential(def,"Auto accepts named matching partial");
  assert.equal(baseline.end.moved,2);
  assert.equal(baseline.end.destinations[1].slots[4].amount,62);
});
test("URCE-LAZY-07 Collector receiver capacity and serialization order remain unchanged",()=>{
  const def=scenario({
    source:[plain("minecraft:stone",3),undefined,undefined,undefined,undefined],
    entries:[
      {mode:"filter",filter:"minecraft:stone",
       destination:{kind:"collector",link:"receiver-1",queued:250000}},
      {mode:"wildcard",destination:storage([undefined,...Array(8).fill(null)])}
    ]});
  const {baseline}=differential(def,"Collector full fallback");
  assert.equal(baseline.end.moved,3);
  assert.ok(baseline.counts.serialize>=1,
    "Original source serializes before checking Q4 capacity: not optimized here");
});
test("URCE-LAZY-08 source Hopper absence, lock and budget remain equivalent",()=>{
  for(const def of [
    scenario({sourceMissing:true}),
    scenario({sourceLocked:true}),
    scenario({cap:0}),
    scenario({source:Array(5).fill(undefined)})
  ])differential(def,"intake early stop");
});
test("URCE-LAZY-09 deterministic mixed 4-5-high columns differential, no native call win claimed",()=>{
  const modes=["filter","auto","wildcard","bypass"];
  const types=["minecraft:stone","minecraft:dirt","minecraft:diamond"];
  let nativeSaved=0,liveSaved=0,regressed=0,deliveries=0;
  for(let seed=0;seed<144;seed++){
    let x=(seed+1)*3343;
    const rand=n=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x%n;};
    const slots=Array.from({length:5},()=>{
      const r=rand(4);return r===0?undefined:plain(types[rand(types.length)],1+rand(7),
        {meta:rand(3)===0?"named":""});
    });
    const entries=Array.from({length:seed%2?5:4},()=>{
      const mode=modes[rand(modes.length)];
      let inv=Array.from({length:9},()=>rand(4)===0?undefined:plain(types[rand(3)],rand(2)?64:30));
      return {mode,filter:types[rand(3)],powered:rand(8)===0,
        missing:rand(19)===0,
        destination:storage(inv)};
    });
    const {baseline,candidate}=differential(scenario({source:slots,entries}),"mixed seed "+seed);
    liveSaved+=baseline.counts.sorterAt-candidate.counts.sorterAt;
    nativeSaved+=baseline.counts.getSlot-candidate.counts.getSlot;
    if(candidate.counts.sorterAt>baseline.counts.sorterAt)regressed++;
    deliveries+=baseline.end.moved;
  }
  assert.equal(nativeSaved,0,"NO significant full-chest scan benefit from lazy route ordering alone");
  assert.ok(deliveries>=0);
  // Route-only simplification is not automatically a performance win: per-item
  // rechecking of eligible Sorters may actually cost *more* live block reads.
  assert.ok(Number.isInteger(liveSaved)&&Number.isInteger(regressed));
  console.log("URCE MODEL mixed-144:",JSON.stringify({nativeGetSlotSaved:nativeSaved,sorterAtSaved:liveSaved,sorterAtRegressedCases:regressed,itemsMoved:deliveries}));
});
test("URCE-LAZY-10 repeated compatible cargo can increase live block lookups",()=>{
  const def=scenario({
    source:Array.from({length:5},()=>plain("minecraft:stone",1)),
    entries:Array.from({length:4},()=>({
      mode:"filter",filter:"minecraft:stone",destination:storage(full())
    }))
  });
  const {baseline,candidate}=differential(def,"five slots times four eligible full Filters");
  assert.equal(baseline.end.moved,0);
  assert.ok(candidate.counts.sorterAt>baseline.counts.sorterAt,
    "A lazy per-item live validation repeats work across five source slots");
  assert.equal(candidate.counts.getSlot,baseline.counts.getSlot);
  console.log("URCE MODEL repeated-compatible:",JSON.stringify({
    baselineSorterAt:baseline.counts.sorterAt,candidateSorterAt:candidate.counts.sorterAt,
    baselineGetSlot:baseline.counts.getSlot,candidateGetSlot:candidate.counts.getSlot
  }));
});
test("URCE-LAZY-11 350 four-high columns model 1400 Sorter rule evaluations",()=>{
  let nativeGetSlotBase=0,nativeGetSlotLazy=0,liveSorterBase=0,liveSorterLazy=0,
      commitsBase=0,commitsLazy=0;
  for(let k=0;k<350;k++){
    const def=scenario({
      source:[plain("minecraft:stone",2),undefined,undefined,undefined,undefined],
      entries:[
        {mode:"auto",destination:storage(full())},
        {mode:"filter",filter:"minecraft:dirt",destination:storage(full())},
        {mode:"filter",filter:"minecraft:diamond",destination:storage(full())},
        {mode:"wildcard",destination:storage([undefined,...Array(8).fill(null)])}
      ]
    });
    const {baseline,candidate}=differential(def,"modeled 1400-sorter col "+k);
    nativeGetSlotBase+=baseline.counts.getSlot;
    nativeGetSlotLazy+=candidate.counts.getSlot;
    liveSorterBase+=baseline.counts.sorterAt;
    liveSorterLazy+=candidate.counts.sorterAt;
    commitsBase+=baseline.counts.journalPrepare;
    commitsLazy+=candidate.counts.journalPrepare;
  }
  assert.equal(nativeGetSlotLazy,nativeGetSlotBase,
    "A routing-only lazy rewrite does not reduce necessary dense Auto scans");
  assert.equal(commitsLazy,commitsBase,"Exactly identical physical journal count");
  assert.ok(liveSorterLazy<liveSorterBase);
  console.log("URCE MODEL 350x4:",JSON.stringify({
    baselineSorterAt:liveSorterBase,candidateSorterAt:liveSorterLazy,
    baselineGetSlot:nativeGetSlotBase,candidateGetSlot:nativeGetSlotLazy,
    baselinePhysicalJournals:commitsBase,candidatePhysicalJournals:commitsLazy
  }));
});

test("URCE-SHARED-01 one verified live Sorter Block is reused within its attempt",()=>{
  assert.match(shared,/destinationFor\(e, live\)/);
  assert.match(sharedDestination,/precheckedSorter \?\? sorterAt\(entry\)/);
  assert.doesNotMatch(script,/function destinationFor\(entry, precheckedSorter\)/);
  const def=scenario({
    source:[plain("minecraft:stone",2),undefined,undefined,undefined,undefined],
    entries:[
      {mode:"auto",destination:storage(full())},
      {mode:"filter",filter:"minecraft:dirt",destination:storage(full())},
      {mode:"filter",filter:"minecraft:diamond",destination:storage(full())},
      {mode:"wildcard",destination:storage([undefined,...Array(8).fill(null)])}
    ]});
  const {baseline,candidate}=differential(def,"shared native block", "shared");
  assert.equal(baseline.end.moved,2);
  assert.ok(candidate.counts.sorterAt<baseline.counts.sorterAt);
  assert.equal(candidate.counts.getSlot,baseline.counts.getSlot);
});
test("URCE-SHARED-02 repeated matching full targets avoid extra Sorter lookups",()=>{
  const def=scenario({
    source:Array.from({length:5},()=>plain("minecraft:stone",1)),
    entries:Array.from({length:4},()=>({
      mode:"filter",filter:"minecraft:stone",destination:storage(full())
    }))
  });
  const {baseline,candidate}=differential(def,"shared repeated matching full", "shared");
  assert.ok(candidate.counts.sorterAt<baseline.counts.sorterAt);
  assert.equal(candidate.counts.getSlot,baseline.counts.getSlot);
  console.log("URCE MODEL shared-repeated:",JSON.stringify({
    baselineSorterAt:baseline.counts.sorterAt,candidateSorterAt:candidate.counts.sorterAt,
    baselineGetSlot:baseline.counts.getSlot,candidateGetSlot:candidate.counts.getSlot
  }));
});
test("URCE-SHARED-03 mixed source outcomes and owner-scale shape are exactly preserved",()=>{
  const types=["minecraft:stone","minecraft:dirt","minecraft:diamond"];
  const modes=["filter","auto","wildcard","bypass"];
  let baseSort=0,sharedSort=0,baseSlot=0,sharedSlot=0,regressed=0;
  for(let seed=0;seed<144;seed++){
    let x=(seed+1)*3343;
    const rand=n=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x%n;};
    const slots=Array.from({length:5},()=>{
      const r=rand(4);
      return r===0?undefined:plain(types[rand(types.length)],1+rand(7),
        {meta:rand(3)===0?"named":""});
    });
    const entries=Array.from({length:seed%2?5:4},()=>{
      const mode=modes[rand(4)];
      const inv=Array.from({length:9},()=>rand(4)===0?undefined:
        plain(types[rand(3)],rand(2)?64:30));
      return {mode,filter:types[rand(3)],powered:rand(8)===0,missing:rand(19)===0,
        destination:storage(inv)};
    });
    const {baseline,candidate}=differential(scenario({source:slots,entries}),
      "shared mixed "+seed,"shared");
    baseSort+=baseline.counts.sorterAt;sharedSort+=candidate.counts.sorterAt;
    baseSlot+=baseline.counts.getSlot;sharedSlot+=candidate.counts.getSlot;
    if(candidate.counts.sorterAt>baseline.counts.sorterAt)regressed++;
  }
  assert.equal(sharedSlot,baseSlot);
  assert.ok(sharedSort<=baseSort);
  assert.ok(regressed>=0,"Record real regression cases rather than assuming universal benefit");
  console.log("URCE MODEL shared-mixed-144:",JSON.stringify({
    baselineSorterAt:baseSort,candidateSorterAt:sharedSort,
    baselineGetSlot:baseSlot,candidateGetSlot:sharedSlot,regressedCases:regressed
  }));
  let bs=0,cs=0,bg=0,cg=0;
  for(let i=0;i<350;i++){
    const def=scenario({
      source:[plain("minecraft:stone",2),undefined,undefined,undefined,undefined],
      entries:[
        {mode:"auto",destination:storage(full())},
        {mode:"filter",filter:"minecraft:dirt",destination:storage(full())},
        {mode:"filter",filter:"minecraft:diamond",destination:storage(full())},
        {mode:"wildcard",destination:storage([undefined,...Array(8).fill(null)])}
      ]});
    const {baseline,candidate}=differential(def,"shared 350x4 "+i,"shared");
    bs+=baseline.counts.sorterAt;cs+=candidate.counts.sorterAt;
    bg+=baseline.counts.getSlot;cg+=candidate.counts.getSlot;
  }
  assert.equal(cg,bg);
  assert.ok(cs<bs);
  console.log("URCE MODEL shared-350x4:",JSON.stringify({
    baselineSorterAt:bs,candidateSorterAt:cs,baselineGetSlot:bg,candidateGetSlot:cg
  }));
});
