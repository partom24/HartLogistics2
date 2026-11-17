/**
 * P4c/P4d source-executed differential against the unchanged P4b engine.
 * No BDS timings or future URCE behavior are inferred from these mocks.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const REL="addon/behavior_pack/scripts/main.js";
const candidate=fs.readFileSync(path.join(ROOT,REL),"utf8");
const p4b=execFileSync("git",["show","9a4e44093fbc9093d9bc985acce5348c8803c842:"+REL],
                     {cwd:ROOT,encoding:"utf8"});
function extract(js,name,env={}) {
  const start=js.indexOf("function "+name+"(");
  assert.ok(start>=0,"Missing source function "+name);
  const begin=js.indexOf("{",start);
  let depth=0,quote="",esc=false,line=false,block=false;
  for(let i=begin;i<js.length;i++){
    const c=js[i],n=js[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(esc){esc=false;continue;}if(c==="\\"){esc=true;continue;}
      if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c==="\x60"){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)return vm.runInNewContext(js.slice(start,i+1)+"\n"+name+";",env,{timeout:2000});
  }
  throw Error("Unbalanced "+name);
}
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const item=(typeId,amount=4,meta="")=>({typeId,amount,maxAmount:64,meta});
const filter=(typeId,extra={})=>({match:{typeId,...extra}});
const entry=(mode="filter",typeId="minecraft:diamond",extra={})=>({
  m:mode,f:mode==="filter"?filter(typeId):null,...extra
});
function inventory(values,events,tag){
  const slots=values.map(clone);
  return {slots,container:{
    isValid:true,get size(){events.push(tag+".size");return slots.length;},
    firstItem(){events.push(tag+".firstItem");return slots.find(v=>v!==undefined);},
    firstEmptySlot(){events.push(tag+".firstEmptySlot");
      const i=slots.findIndex(v=>v===undefined);return i<0?undefined:i;},
    getItem(i){events.push(tag+".getItem");return clone(slots[i]);},
    setItem(i,x){events.push(tag+".setItem");slots[i]=clone(x);}
  }};
}
const identityEnv={
  POTION_ITEM_IDS:new Set(["minecraft:potion","minecraft:splash_potion"]),
  potionIdentity:s=>s.potion,
  enchantments:s=>s.ench??[]
};
const realMatches=extract(candidate,"matchesFilter",identityEnv);
function acceptSlot(container,stack,auto){
  if(auto){
    let seeded=false;
    for(let i=0;i<container.size;i++)if(container.getItem(i)?.typeId===stack.typeId)seeded=true;
    if(!seeded)return undefined;
  }
  let firstEmpty;
  for(let i=0;i<container.size;i++){
    const old=container.getItem(i);
    if(!old){if(firstEmpty===undefined)firstEmpty=i;continue;}
    if(old.typeId===stack.typeId&&old.meta===stack.meta&&old.amount<64)
      return {slot:i,before:old.amount,room:64-old.amount};
  }
  return firstEmpty===undefined?undefined:{slot:firstEmpty,before:0,room:64};
}
function move(src,si,dst,info,want) {
  const cargo=src.getItem(si);
  if(!cargo)return 0;
  const n=Math.min(want,cargo.amount,info.room);
  if(!n)return 0;
  const prior=dst.getItem(info.slot);
  dst.setItem(info.slot,{...cargo,amount:(prior?.amount??0)+n});
  src.setItem(si,cargo.amount===n?undefined:{...cargo,amount:cargo.amount-n});
  return n;
}
function run(version,scenario){
  const js=version==="p4b"?p4b:candidate;
  const events=[],input=inventory(scenario.slots,events,"source");
  // Inject only an observational uncertainty, never a simulated mutation.
  // The optimized qualifier must fall back to the unchanged physical path.
  if(scenario.preflightReadThrowsOnce){
    const original=input.container.getItem.bind(input.container);
    let first=true;
    input.container.getItem=i=>{
      if(first){first=false;events.push("uncertain.read");throw Error("transient native read");}
      return original(i);
    };
  }
  if(scenario.preflightInvisibleSlots){
    const original=input.container.getItem.bind(input.container);
    let unseen=5;
    input.container.getItem=i=>{
      if(unseen-->0){events.push("uncertain.invisible");return undefined;}
      return original(i);
    };
  }
  const destinations=scenario.sorters.map((e,i)=>inventory(
    scenario.destinations?.[i]??[undefined,undefined,undefined],events,"dest"+i));
  const sourceBlock={typeId:"minecraft:hopper",getComponent:()=>({container:input.container})};
  const mocks={
    PER_COLUMN_BATCH:16,
    getDimension:()=>({getBlock:()=>sourceBlock}),
    hopperIsRedstoneLocked:()=>!!scenario.locked,
    sorterAt:e=>{events.push("sorterAt");return e.valid===false?undefined:{powered:e.powered};},
    blockIsRedstonePowered:b=>!!b.powered,
    sorterMode:e=>e.m,
    matchesFilter:realMatches,
    compactSourceHopper:extract(js,"compactSourceHopper"),
    destinationFor:e=>{events.push("destinationFor");
      const i=scenario.sorters.indexOf(e);
      return e.destinationMissing?undefined:{kind:"storage",container:destinations[i].container,block:{}};
    },
    findAcceptSlot:acceptSlot,
    safeMovePartial:(src,_block,si,dst,_to,info,want)=>move(src,si,dst,info,want),
    log:()=>{}
  };
  const fn=extract(js,"processColumn",mocks);
  const moved=fn({d:"overworld",source:{x:0,y:8,z:0},sorters:scenario.sorters},256);
  return {moved,source:input.slots.map(x=>x??null),
    dest:destinations.map(d=>d.slots.map(x=>x??null)),events};
}
function same(scenario,label){
  const old=run("p4b",scenario),now=run("candidate",scenario);
  assert.equal(now.moved,old.moved,label+" transfer count");
  assert.deepEqual(now.source,old.source,label+" source inventory including metadata");
  assert.deepEqual(now.dest,old.dest,label+" destination inventories");
  return {old,now};
}
test("TRANSIT-01 exhaustive 1024 mixed five-slot configurations equal P4b",()=>{
  const choices=[undefined,item("minecraft:dirt"),item("minecraft:stone",2,"named"),
                 item("minecraft:diamond",6,"named")];
  const sorters=[entry("filter","minecraft:diamond"),entry("filter","minecraft:emerald"),
                 entry("filter","minecraft:quartz"),entry("bypass")];
  for(let n=0;n<1024;n++){
    let v=n,slots=[];
    for(let k=0;k<5;k++){slots.push(choices[v%4]);v=Math.floor(v/4);}
    same({slots,sorters},"configuration "+n);
  }
});
test("TRANSIT-02 local Filter-only nonmatches avoid native all-Sorter validation",()=>{
  const sorters=[entry(),entry(),entry(),entry(),entry()];
  const scenario={slots:[item("minecraft:stone"),undefined,item("minecraft:dirt"),undefined,
                         item("minecraft:cobblestone")],sorters};
  const {old,now}=same(scenario,"filter-only transit");
  assert.equal(old.events.filter(e=>e==="sorterAt").length,5);
  assert.equal(now.events.filter(e=>e==="sorterAt").length,1);
  assert.equal(now.events.filter(e=>e==="destinationFor").length,0);
  assert.equal(now.events.filter(e=>e==="source.firstEmptySlot").length,1,
               "still compacts only when a physical sorter is active");
});
test("TRANSIT-03 mixed cargo with one matching later slot cannot be rejected",()=>{
  const {now}=same({slots:[item("minecraft:dirt"),undefined,item("minecraft:diamond",5),
                           item("minecraft:stone"),undefined],
      sorters:[entry(),entry("filter","minecraft:gold_ingot")]},"last-slot eligible");
  assert.equal(now.moved,5);
  assert.ok(now.events.includes("destinationFor"));
});
test("TRANSIT-04 Auto and Wildcard always fall through to live route logic",()=>{
  for(const mode of ["auto","wildcard"]){
    const scenario={slots:[item("minecraft:stone",5),undefined,undefined,undefined,undefined],
      sorters:[entry("filter","minecraft:diamond"),entry(mode)],
      destinations:[[undefined],mode==="auto"?[item("minecraft:stone",4),undefined]:[undefined,undefined]]};
    const {old,now}=same(scenario,mode);
    assert.equal(now.events.filter(e=>e==="sorterAt").length,old.events.filter(e=>e==="sorterAt").length);
    assert.equal(now.moved,5);
  }
});
test("TRANSIT-05 no physical active Filter means no compaction or transfer",()=>{
  const scenario={slots:[undefined,item("minecraft:stone",4),undefined,undefined,undefined],
    sorters:[entry("filter","minecraft:diamond",{powered:true}),entry("filter","minecraft:gold_ingot",{valid:false})]};
  const {now}=same(scenario,"no active sorter");
  assert.equal(now.events.includes("source.setItem"),false);
  assert.equal(now.events.includes("source.firstEmptySlot"),false);
  assert.equal(now.moved,0);
});
test("TRANSIT-06 Bypass-only columns remain pass-through with no writes",()=>{
  const scenario={slots:[undefined,item("minecraft:stone"),undefined,undefined,undefined],
    sorters:[entry("bypass"),entry("bypass")]};
  const {old,now}=same(scenario,"bypass-only");
  assert.equal(old.events.filter(e=>e==="sorterAt").length,2);
  assert.equal(now.events.filter(e=>e==="sorterAt").length,0);
  assert.equal(now.events.includes("source.firstEmptySlot"),false);
});
test("TRANSIT-07 redstone-locked source is not observed, compacted or routed",()=>{
  const {now}=same({slots:[item("minecraft:diamond"),undefined,undefined,undefined,undefined],
    sorters:[entry()],locked:true},"locked source");
  assert.equal(now.events.includes("source.firstItem"),false);
  assert.equal(now.events.filter(e=>e==="sorterAt").length,0);
});
test("TRANSIT-08 enchanted-book Filter compares enchantment TYPE sets, not level",()=>{
  const book=(ids,levels)=>({typeId:"minecraft:enchanted_book",amount:1,maxAmount:1,
    ench:ids.map((id,i)=>({id,level:levels[i]}))});
  const sorter=entry("filter","minecraft:enchanted_book");
  sorter.f=filter("minecraft:enchanted_book",{enchIds:["minecraft:sharpness","minecraft:looting"]});
  const accepted=same({slots:[book(["minecraft:looting","minecraft:sharpness"],[1,5]),...Array(4).fill(undefined)],
    sorters:[sorter]},"book match");
  assert.equal(accepted.now.moved,1);
  const rejected=same({slots:[book(["minecraft:looting"],[2]),...Array(4).fill(undefined)],
    sorters:[sorter]},"book mismatch");
  assert.equal(rejected.now.moved,0);
  assert.equal(rejected.now.events.filter(e=>e==="sorterAt").length,1);
});
test("TRANSIT-09 potion identity is not collapsed to item type",()=>{
  const sorter=entry("filter","minecraft:potion");
  sorter.f=filter("minecraft:potion",{potion:{effect:"healing",delivery:"drink"}});
  const water={typeId:"minecraft:potion",amount:1,maxAmount:1,potion:{effect:"water",delivery:"drink"}};
  const heal={...water,potion:{effect:"healing",delivery:"drink"}};
  const rejected=same({slots:[water,...Array(4).fill(undefined)],sorters:[sorter]},"potion mismatch");
  assert.equal(rejected.now.moved,0);
  const accepted=same({slots:[heal,...Array(4).fill(undefined)],sorters:[sorter]},"potion match");
  assert.equal(accepted.now.moved,1);
});
test("TRANSIT-10 blocked destinations and unloaded Sorters preserve outcomes",()=>{
  const scenarios=[
    {slots:[item("minecraft:diamond"),undefined,undefined,undefined,undefined],
      sorters:[entry("filter","minecraft:diamond",{destinationMissing:true})]},
    {slots:[item("minecraft:diamond"),undefined,undefined,undefined,undefined],
      sorters:[entry("filter","minecraft:diamond",{valid:false})]},
    {slots:[item("minecraft:stone"),undefined,undefined,undefined,undefined],
      sorters:[entry("filter","minecraft:diamond",{valid:false}),entry("filter","minecraft:emerald",{powered:true})]},
    {slots:[item("minecraft:diamond"),undefined,undefined,undefined,undefined],
      sorters:[entry("filter","minecraft:diamond")],
      destinations:[[item("minecraft:dirt",64),item("minecraft:stone",64),item("minecraft:gold_ingot",64)]]}
  ];
  for(let i=0;i<scenarios.length;i++)same(scenarios[i],"blocked "+i);
});
test("TRANSIT-11 mismatching full Hopper avoids compaction writes",()=>{
  const {now}=same({slots:Array.from({length:5},(_,i)=>item("minecraft:dirt",i+1,"data-"+i)),
    sorters:[entry(),entry(),entry(),entry()]},"full hopper");
  assert.equal(now.events.filter(e=>e==="source.setItem").length,0);
});
test("TRANSIT-12 verified Hopper flag avoids duplicate typeId, still reads toggle_bit",()=>{
  let reads=0,toggles=0;
  const block={get typeId(){reads++;return "minecraft:hopper";},
    permutation:{getState(x){assert.equal(x,"toggle_bit");toggles++;return true;}}};
  const fn=extract(candidate,"hopperIsRedstoneLocked");
  assert.equal(fn(block,true),true);
  assert.equal(reads,0);
  assert.equal(toggles,1);
  assert.equal(fn(block),true);
  assert.equal(reads,1);
  assert.equal(toggles,2);
  assert.equal(fn({typeId:"minecraft:stone"}),false);
});
test("TRANSIT-13 original scheduler cadence and item budgets remain unchanged",()=>{
  assert.match(candidate,/system\.runInterval\(schedulerTick,\s*1\)/);
  assert.match(candidate,/const PER_COLUMN_BATCH = 16;/);
  assert.match(candidate,/const GLOBAL_MOVE_BUDGET = 256;/);
  assert.match(candidate,/if \(provenTransit\)/);
  assert.doesNotMatch(candidate,/runInterval\(schedulerTick,\s*3\)/);
});
test("TRANSIT-14 a throwing prequalification read falls back instead of rejecting",()=>{
  const base={slots:[item("minecraft:diamond",3),undefined,undefined,undefined,undefined],
    sorters:[entry()]};
  const old=run("p4b",base);
  const now=run("candidate",{...base,preflightReadThrowsOnce:true});
  assert.equal(now.moved,old.moved);
  assert.deepEqual(now.source,old.source);
  assert.deepEqual(now.dest,old.dest);
  assert.ok(now.events.includes("uncertain.read"));
  assert.ok(now.events.includes("destinationFor"),"fallback must reach physical routing");
});
test("TRANSIT-15 ambiguous occupied Hopper cannot be proven transit from missing reads",()=>{
  const base={slots:[item("minecraft:diamond",4),undefined,undefined,undefined,undefined],
    sorters:[entry(),entry("filter","minecraft:emerald")]};
  const old=run("p4b",base);
  const now=run("candidate",{...base,preflightInvisibleSlots:true});
  assert.equal(now.moved,old.moved);
  assert.deepEqual(now.source,old.source);
  assert.deepEqual(now.dest,old.dest);
  assert.equal(now.events.filter(e=>e==="uncertain.invisible").length,5);
  assert.equal(now.events.filter(e=>e==="sorterAt").length,2);
});
test("TRANSIT-16 unknown registry mode conservatively uses original route path",()=>{
  const old=run("p4b",{slots:[item("minecraft:stone"),undefined,undefined,undefined,undefined],
     sorters:[entry("unknown"),entry("filter","minecraft:diamond")]});
  const now=run("candidate",{slots:[item("minecraft:stone"),undefined,undefined,undefined,undefined],
     sorters:[entry("unknown"),entry("filter","minecraft:diamond")]});
  assert.equal(now.moved,old.moved);
  assert.deepEqual(now.source,old.source);
  assert.deepEqual(now.dest,old.dest);
  assert.equal(now.events.filter(e=>e==="sorterAt").length,2);
});
