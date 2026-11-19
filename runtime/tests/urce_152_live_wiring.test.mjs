import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const main=readFileSync(resolve(root,"addon/behavior_pack/scripts/main.js"),"utf8");
function original(name,context) {
  const start=main.indexOf("function "+name+"(");
  assert.ok(start>=0,"missing actual installed function "+name);
  const end=main.indexOf("\nfunction ",start+9);
  const source=main.slice(start,end<0?main.length:end).trim();
  return vm.runInNewContext("("+source+")",context,{timeout:2000});
}
function wire({verdict="REJECT",saveFails=false,link="old-receiver"}={}){
  const col={id:"collector-1",link},receiver={id:"receiver-2",x:23,y:62,z:-17};
  const player={id:"player-1",messages:[],sendMessage(m){this.messages.push(m);}};
  const pending=new Map([[player.id,col.id]]),events={saves:0,invalidations:0,status:0};
  const context={
    registerReceiver:()=>receiver,pendingCollectorByPlayer:pending,
    findCollectorById:id=>id===col.id?col:undefined,
    liveLinkCheck:()=>({decision:verdict,reason:verdict==="REJECT"?"cycle":"unverified"}),
    saveLogistics:()=>{events.saves++;if(saveFails)throw Error("synthetic storage outage")},
    liveLinkGuard:{invalidate(){events.invalidations++}},
    receiverStatus:()=>{events.status++}
  };
  return {col,receiver,player,pending,events,call:original("useReceiver",context)};
}
test("WIRE-01 source-executed useReceiver refuses a back-edge before saving",()=>{
  const f=wire({verdict:"REJECT"});f.call(f.player,{});
  assert.equal(f.col.link,"old-receiver");
  assert.equal(f.events.saves,0);
  assert.equal(f.events.invalidations,0);
  assert.equal(f.pending.has(f.player.id),true);
  assert.match(f.player.messages.join("\n"),/REJECTED \(supply loop\)/);
});
test("WIRE-02 source-executed useReceiver HOLD preserves established links",()=>{
  const f=wire({verdict:"HOLD"});f.call(f.player,{});
  assert.equal(f.col.link,"old-receiver");
  assert.equal(f.events.saves,0);
  assert.equal(f.events.status,0);
  assert.match(f.player.messages.join("\n"),/HELD \(route unverified\)/);
});
test("WIRE-03 a known-safe snapshot writes only one new link and invalidates routing",()=>{
  const f=wire({verdict:"SAFE_SNAPSHOT"});f.call(f.player,{});
  assert.equal(f.col.link,f.receiver.id);
  assert.equal(f.events.saves,1);
  assert.equal(f.events.invalidations,1);
  assert.equal(f.pending.has(f.player.id),false);
  assert.equal(f.events.status,1);
});
test("WIRE-04 persistence failure restores old link without false success",()=>{
  const f=wire({verdict:"SAFE_SNAPSHOT",saveFails:true});
  f.call(f.player,{});
  assert.equal(f.col.link,"old-receiver");
  assert.equal(f.events.saves,1);
  assert.equal(f.events.invalidations,0);
  assert.equal(f.pending.has(f.player.id),true);
  assert.match(f.player.messages.join("\n"),/previous link retained/);
});
test("WIRE-05 Hopper Collector intake HOLD occurs before any Q4 read or native debit",()=>{
  const collector={id:"collector-1",link:"receiver-2"};
  const receiver={id:"receiver-2"};
  const input={kind:"hopper",locked:false,
    container:{isValid:true,firstItem(){return {typeId:"minecraft:stone",amount:1}},
      size:5,getItem(){throw Error("getItem must not run on HOLD")}}};
  let writes=0;
  const context={
    collectorAt:()=>({typeId:"hartsorter:collector"}),
    blockIsRedstonePowered:()=>false,
    findReceiverById:()=>receiver,
    collectorInputSources:()=>[input],
    liveLinkCheck:()=>({decision:"HOLD",reason:"cycle"}),
    COLLECTOR_BATCH:64,
    loadReceiverQueue:()=>{writes++;throw Error("queue read must not run")},
    serializeQueueItem:()=>{writes++;throw Error("serializer must not run")}
  };
  const call=original("processCollectorIngress",context);
  assert.equal(call(collector,64),0);
  assert.equal(writes,0);
});
test("WIRE-06 Sorter->Collector route refuses before serialization",()=>{
  const collector={id:"collector-1",link:"receiver-2"};
  let serialize=0;
  const context={
    blockIsRedstonePowered:()=>false,
    findReceiverById:()=>({id:"receiver-2"}),
    liveLinkCheck:()=>({decision:"REJECT",reason:"cycle"}),
    serializeQueueItem:()=>{serialize++;throw Error("not allowed")}
  };
  const call=original("sorterCollectorRoute",context);
  assert.equal(call({collector,block:{}},{typeId:"minecraft:stone"}),undefined);
  assert.equal(serialize,0);
});
test("WIRE-07 ejected-item Collector route refuses before reading/removing entity",()=>{
  let touches=0;
  const collector={id:"collector-1",link:"receiver-2"};
  const context={
    ready:true,getQueueJournal:()=>false,
    ejectedItemCollector:()=>({collector}),
    findReceiverById:()=>({id:"receiver-2"}),
    liveLinkCheck:()=>({decision:"HOLD",reason:"unknown"}),
    itemEntityStack:()=>{touches++;throw Error("entity must not be touched")},
    system:{runTimeout(){touches++;}},
    enqueueFromEjectedEntity:()=>{touches++;throw Error("must not enqueue")}
  };
  const call=original("processEjectedItemEntity",context);
  call({isValid:true,typeId:"minecraft:item"});
  assert.equal(touches,0);
});
