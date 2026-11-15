
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const src=fs.readFileSync(path.join(root,"addon/behavior_pack/scripts/main.js"),"utf8");
function original(name,env={}) {
  const start=src.indexOf("function "+name+"(");
  assert.ok(start>=0,"Missing 1.4.1 function: "+name);
  const begin=src.indexOf("{",start);
  let depth=0,quote="",esc=false,line=false,block=false;
  for(let i=begin;i<src.length;i++){
    const c=src[i],n=src[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(esc){esc=false;continue;}if(c==="\\"){esc=true;continue;}if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c==="\x60"){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)
      return vm.runInNewContext(src.slice(start,i+1)+"\n"+name+";",env,{timeout:2000});
  }
  throw Error("Unbalanced original function");
}
function make(o={}){
  const log=[],trace=[],receiver={id:"R",queued:o.count??0,received:0,delivered:0};
  const collector={id:"C",link:"R",accepted:0};
  let stack={typeId:"custom:opaque",amount:1};
  const c={typeId:"collector",powered:!!o.collectorPowered};
  const r={typeId:"receiver",powered:!!o.receiverPowered};
  const q={total:o.backlog??0,meta:{received:0,delivered:0}};
  const f=original("processCollectorIngress",{
    COLLECTOR_BATCH:16,QUEUE_CAPACITY:250000,
    collectorAt:()=>c,blockIsRedstonePowered:b=>b.powered,
    findReceiverById:()=>receiver,
    collectorInputSources:()=>[{
      kind:"hopper",locked:!!o.sourceLocked,
      block:{typeId:"minecraft:hopper"},container:{size:1,getItem:()=>stack}
    }],
    serializeQueueItem:()=>undefined,
    loadReceiverQueue:()=>{if(o.queueUnavailable)throw Error("unreadable Q4");return q;},
    receiverAt:()=>o.receiverUnloaded?undefined:r,
    receiverOutputHopper:()=>o.noOutput?undefined:{
      locked:!!o.outputLocked,block:{typeId:"minecraft:hopper"},container:{}
    },
    findAcceptSlot:()=>({slot:0,room:64,before:0}),
    safeMovePartial:()=>{trace.push("physical.move");stack=undefined;return 1;},
    recordDirectReceiverTransfer:()=>{trace.push("counter");if(o.counterFailure)throw Error("counter failed");},
    markLogisticsDirty:()=>trace.push("dirty"),
    queueRejectSeen:new Set(),log:s=>log.push(s)
  });
  return{run:()=>f(collector,256),collector,receiver,trace,log,get item(){return stack;}};
}
test("opaque item direct transfer with empty Q4 and loaded Receiver",()=>{
  const h=make();assert.equal(h.run(),1);
  assert.deepEqual(h.trace.slice(0,2),["physical.move","counter"]);
});
test("real Q4 backlog blocks direct transfer",()=>{
  const h=make({backlog:7});assert.equal(h.run(),0);
  assert.equal(h.trace.includes("physical.move"),false);
});
test("Receiver unloaded prevents direct transfer",()=>{
  const h=make({receiverUnloaded:true});assert.equal(h.run(),0);
});
test("powered source Hopper prevents direct transfer",()=>{
  const h=make({sourceLocked:true});assert.equal(h.run(),0);
});
test("powered Receiver prevents direct transfer",()=>{
  const h=make({receiverPowered:true});assert.equal(h.run(),0);
});
test("locked native output Hopper prevents direct transfer",()=>{
  const h=make({outputLocked:true});assert.equal(h.run(),0);
});
test("unreadable Q4 and stored count >0 prevents direct transfer",()=>{
  const h=make({queueUnavailable:true,count:3});assert.equal(h.run(),0);
});
test("unreadable Q4 with stored count 0 permits direct move in canonical source",()=>{
  const h=make({queueUnavailable:true,count:0});assert.equal(h.run(),1);
  assert.equal(h.trace.includes("physical.move"),true);
  assert.equal(h.item,undefined);
  // This is a SOURCE conditional witness, NOT real-world corruption proof.
});
test("diagnostic counter failure does not retry already completed physical move",()=>{
  const h=make({counterFailure:true});assert.equal(h.run(),1);
  assert.equal(h.trace.filter(x=>x==="physical.move").length,1);
  assert.equal(h.receiver.received,1);
  assert.equal(h.receiver.delivered,1);
});
