import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";

// 1.4.1 receiver output: immediately below Hopper, vanilla directed
// movement to native storage. This is source-simulated, NOT a native BDS run.
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=path.join(ROOT,"addon/behavior_pack/scripts");
async function load(){
  const file=path.join(SRC,"urce_159_direct_sorter_home.js");
  const m=new vm.SourceTextModule(fs.readFileSync(file,"utf8"),{identifier:file});
  await m.link(()=>{throw Error("pure outlet cannot have imported writers")});
  await m.evaluate();return m.namespace.inspectReceiverNativeTerminal;
}
function block(type,p,face=5,locked=false,valid=true){
 return {typeId:type,location:{...p},dimension:{id:"minecraft:overworld"},
   permutation:{getState(name){return name==="facing_direction"?face:
       name==="toggle_bit"?locked:undefined;}},
   getComponent(name){return name==="minecraft:inventory"&&
      (type==="minecraft:chest"||type==="minecraft:trapped_chest"||
       type==="minecraft:barrel"||type.endsWith("_shulker_box"))
       ?{container:{isValid:valid,size:27}}:undefined;}
 };
}
const dirs={0:[0,-1,0],1:[0,-1,0],2:[0,0,-1],
    3:[0,0,1],4:[-1,0,0],5:[1,0,0]};
function rig({face=5,type="minecraft:chest",locked=false,
  chain=false,cycle=false,unloaded=false,extractor=false,valid=true}={}){
 const receiver={id:"R",d:"minecraft:overworld",x:0,y:70,z:0};
 const blocks=new Map();
 const key=p=>[p.x,p.y,p.z].join("|");
 const put=(type,p,face=5,locked=false,valid=true)=>{
   const b=block(type,p,face,locked,valid);blocks.set(key(p),b);return b;
 };
 put("hartsorter:receiver",{x:0,y:70,z:0});
 put("minecraft:hopper",{x:0,y:69,z:0},face,locked);
 const delta=dirs[face],first={x:delta[0],y:69+delta[1],z:delta[2]};
 let terminal=first;
 if(chain||cycle){
   put("minecraft:hopper",first,cycle?4:5);
   terminal={x:first.x+1,y:first.y,z:first.z};
 }
 if(!cycle)put(type,terminal,5,false,valid);
 put(extractor?"minecraft:hopper":"minecraft:stone",
   {x:terminal.x,y:terminal.y-1,z:terminal.z});
 let reads=0;
 const readBlock=(_d,p)=>{
   reads++;
   if(unloaded&&key(p)===key(terminal))throw Error("unloaded");
   return blocks.get(key(p))||block("minecraft:air",p);
 };
 return {receiver,readBlock,terminal,get reads(){return reads;}};
}
for(const [label,opts,hops] of [
 ["east chest",{},1],["west chest",{face:4},1],
 ["north chest",{face:2},1],["south chest",{face:3},1],
 ["down chest",{face:0},1],["down alternate",{face:1},1],
 ["barrel",{type:"minecraft:barrel"},1],
 ["trapped chest",{type:"minecraft:trapped_chest"},1],
 ["shulker",{type:"minecraft:red_shulker_box"},1],
 ["double Hopper",{chain:true},2]
]){
 test("PARITY E09 "+label,async()=>{
   const inspect=await load(),world=rig(opts);
   const result=inspect(world);
   assert.equal(result.status,"CLOSED_NATIVE_TERMINAL");
   assert.equal(result.hops,hops);
   assert.equal(result.terminalPosition.x,world.terminal.x);
   assert.equal(result.executePermitted,false);
   assert.equal(result.persistPermitted,false);
 });
}
for(const [label,opts,reason] of [
 ["locked",{locked:true},"native_terminal_hopper_locked_or_unknown"],
 ["cycle",{cycle:true},"native_terminal_hopper_cycle"],
 ["unloaded",{unloaded:true},"native_terminal_boundary_unloaded"],
 ["extractor",{extractor:true},"native_terminal_extraction_hopper"],
 ["foreign",{type:"minecraft:furnace"},"native_terminal_not_supported"],
 ["invalid container",{valid:false},"native_terminal_inventory_unverified"]
]){
 test("PARITY SAFE "+label,async()=>{
  const inspect=await load();
  const result=inspect(rig(opts));
  assert.equal(result.status,"HOLD");assert.equal(result.reason,reason);
 });
}
function shippingFunction(name,scope){
 const src=fs.readFileSync(path.join(SRC,"main.js"),"utf8");
 const i=src.indexOf("function "+name+"(");
 assert.ok(i>=0,"missing "+name);
 const end=src.indexOf("\nfunction ",i+1);
 return vm.runInNewContext("("+src.slice(i,end<0?src.length:end).trim()+")",scope);
}
test("PARITY LIVE exact chest boundary creates a strictly re-observed nonauthoritative lane",async()=>{
 const inspect=await load(),world=rig();
 const receiver=world.receiver,collector={id:"C",link:"R"};
 const pos=world.terminal;
 const issue="unsupported_native_boundary [minecraft:chest @ minecraft:overworld "+
  [pos.x,pos.y,pos.z].join(",")+" from receiver R]";
 let calls=0;
 const scope={activeLogisticsPass:undefined,system:{currentTick:33},
   logistics:{collectors:[collector],receivers:[receiver]},
   liveTopologyBlockReader:world.readBlock,
   liveLinkGuard:{check(){calls++;return {
     decision:"HOLD",reason:"unverified_native_supply_boundary",
     sourceReachableUnknownCount:1,observationReason:issue};}},
   directNativeTerminal:()=>inspect(world),
   directSorterOutlet:()=>{throw Error("wrong outlet kind")}
 };
 const result=shippingFunction("liveLinkCheck",scope)(collector,receiver);
 assert.equal(result.decision,"SAFE_SNAPSHOT");
 assert.equal(result.routeKind,"DIRECT_NATIVE_TERMINAL");
 assert.equal(result.executePermitted,false);
 assert.equal(calls,2,"a fresh live topology recheck is required");
});
test("PARITY SAFE extra unknown or fresh cycle never allows terminal bypass",()=>{
 const f=rig(),r=f.receiver,c={id:"C",link:"R"};
 for(const verdicts of [
  [{decision:"HOLD",reason:"unverified_native_supply_boundary",
    sourceReachableUnknownCount:2,observationReason:"unsupported_native_boundary [minecraft:chest @ minecraft:overworld 1,69,0 from receiver R]"}],
  [{decision:"HOLD",reason:"unverified_native_supply_boundary",
    sourceReachableUnknownCount:1,observationReason:"unsupported_native_boundary [minecraft:chest @ minecraft:overworld 1,69,0 from receiver R]"},
   {decision:"REJECT",reason:"existing_directed_supply_cycle"}]
 ]){
  let n=0,offered=0;
  const fn=shippingFunction("liveLinkCheck",{
   activeLogisticsPass:undefined,system:{currentTick:33},
   logistics:{collectors:[c],receivers:[r]},
   liveTopologyBlockReader:f.readBlock,
   liveLinkGuard:{check(){return verdicts[Math.min(n++,verdicts.length-1)]}},
   directNativeTerminal(){offered++;return {status:"CLOSED_NATIVE_TERMINAL"}},
   directSorterOutlet(){offered++;return {status:"CLOSED_DIRECT_OUTLET"}}
  });
  assert.notEqual(fn(c,r).decision,"SAFE_SNAPSHOT");
  assert.equal(offered,0);
 }
});
test("PARITY WRITER no second Q4/native mutation authority",()=>{
 const s=fs.readFileSync(path.join(SRC,"main.js"),"utf8");
 const p=fs.readFileSync(path.join(SRC,"urce_159_direct_sorter_home.js"),"utf8");
 assert.match(s,/governedLane==="DIRECT_NATIVE_TERMINAL"/);
 assert.match(s,/dequeueToReceiver\(receiver, output, budget, governedLane\)/);
 assert.match(s,/saveQueueJournal\(tx\);/);
 assert.match(s,/output\.container\.setItem\(tx\.dstSlot, moved\)/);
 for(const forbidden of [/\bsetItem\s*\(/,/\bsaveJournal\s*\(/,
   /\bsaveQueueJournal\s*\(/,/\bsetDynamicProperty\s*\(/]){
  assert.doesNotMatch(p,forbidden);
 }
});

test("PARITY Q4 actual shipping dequeue debits once into native output Hopper, or HOLDs unchanged",()=>{
 for(const closed of [true,false]){
  const calls=[],queue={total:4,meta:{head:0,tail:1,total:4,delivered:0}};
  const first={id:"q1",seq:0,amount:4,data:{typeId:"minecraft:cobblestone"}};
  const slots=[];
  const output={
   block:{location:{x:0,y:69,z:0},dimension:{id:"minecraft:overworld"}},
   container:{isValid:true,size:5,getItem(i){return slots[i];},
     setItem(i,v){calls.push("nativeCredit");slots[i]=v;}}
  };
  const deps={
   loadReceiverQueue:()=>queue,queueHeadEntry:()=>first,
   rebuildQueueItem:(data,amount)=>({typeId:data.typeId,amount,maxAmount:64}),
   findAcceptSlot:()=>({slot:0,room:64}),
   directNativeTerminal:()=>({status:closed?"CLOSED_NATIVE_TERMINAL":"HOLD",
     outputBlock:output.block}),
   directNativeHome:()=>{throw Error("Chest terminal is not a Sorter outlet");},
   queueMetaSnapshot:meta=>({...meta}),queueSlotState:()=>({amount:0}),
   queueDataSignature:()=>"signature",
   saveQueueJournal:tx=>calls.push(tx?"journalBegin":"journalClear"),
   clearQueueEntry:()=>calls.push("Q4Debit"),
   persistQueueEntry:()=>calls.push("Q4Partial"),
   persistQueueMeta:(_r,_q,m)=>{queue.meta=m;queue.total=m.total;calls.push("Q4Meta");},
   markLogisticsDirty:()=>calls.push("markDirty"),log:()=>{}
  };
  const dequeue=shippingFunction("dequeueToReceiver",deps);
  assert.equal(dequeue({id:"R"},output,4,"DIRECT_NATIVE_TERMINAL"),closed?4:0);
  assert.equal(queue.total,closed?0:4);
  assert.equal(slots[0]?.amount||0,closed?4:0);
  assert.deepEqual(calls,closed?
    ["journalBegin","Q4Debit","Q4Meta","nativeCredit","markDirty","journalClear"] :[]);
 }
});
