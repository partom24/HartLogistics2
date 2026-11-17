/**
 * P4f — SOURCE-ONLY, FAULT-INJECTION RESEARCH; NOT gameplay code.
 *
 * Compare native-shaped destination-managed addItem against ACTUAL current
 * 1.4.1 Q4 source function bodies. Demonstrate an information-theoretic
 * ambiguity when other vanilla/player writers can mutate the destination.
 *
 * The addItem mock is an illustration of the documented remainder contract,
 * NOT evidence of its exact placement, atomicity, cost, or metadata semantics
 * on a real Bedrock Dedicated Server. A source test cannot simulate BDS crashes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const FILE="addon/behavior_pack/scripts/main.js";
const SCRIPT=fs.readFileSync(path.join(ROOT,FILE),"utf8");
const expectedSha="5c4a2d414302ef10d76fef21932928592caf2fab84cd000c5b0085cefcdd1b91";
const digest=createHash("sha256").update(SCRIPT).digest("hex");

function functionSource(name) {
  const at=SCRIPT.indexOf("function "+name+"(");
  assert.ok(at>=0, "actual 1.4.1 engine function not found: "+name);
  const brace=SCRIPT.indexOf("{",at);
  let depth=0,quote="",escaped=false,line=false,block=false;
  for(let i=brace;i<SCRIPT.length;i++) {
    const c=SCRIPT[i],n=SCRIPT[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;}
      if(c==="\\"){escaped=true;continue;}
      if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)return SCRIPT.slice(at,i+1);
  }
  throw Error("could not extract complete source function "+name);
}
function actual(name,env={}) {
  return vm.runInNewContext(functionSource(name)+"\n"+name+";",env,
    {timeout:2500,filename:"actual-1.4.1/"+name});
}

const plain=(typeId,amount,meta="plain")=>({typeId,amount,meta});
const copy=x=>x===undefined?undefined:structuredClone(x);
const stack=(typeId,amount,meta="plain")=>({
  typeId,amount,meta,clone(){return stack(this.typeId,this.amount,this.meta);}
});
const sig=s=>s===undefined?"absent":s.typeId+"|"+s.meta;
const normalized=x=>JSON.parse(JSON.stringify(x));
function container(initial,name,trace=[],faults={}) {
  const slots=initial.map(v=>v===undefined?undefined:stack(v.typeId,v.amount,v.meta));
  const api={
    getItem(i){trace.push(name+".get:"+i);return slots[i]?.clone();},
    setItem(i,v){
      trace.push(name+".set:"+i);
      slots[i]=v?.clone();
      if(faults.afterWrite===name){
        faults.afterWrite=undefined;
        throw Error("simulated crash after "+name+" write");
      }
    },
    get size(){return slots.length;}
  };
  return {slots,api};
}

/**
 * Illustrative destination-owned stack placement. This intentionally supports
 * the strongest reasonable success case for addItem: exact metadata equality,
 * fills partial stacks first, chooses empty slots, and returns an exact leftover.
 * Even this favorable model cannot provide the Q4 recovery receipt.
 */
function illustrativeAddItem(slots,offered) {
  let remaining=offered.amount;
  for(let i=0;i<slots.length&&remaining>0;i++){
    const v=slots[i];
    if(!v||sig(v)!==sig(offered)||v.amount>=64)continue;
    const accepted=Math.min(64-v.amount,remaining);
    v.amount+=accepted;remaining-=accepted;
  }
  for(let i=0;i<slots.length&&remaining>0;i++){
    if(slots[i]!==undefined)continue;
    const accepted=Math.min(64,remaining);
    slots[i]=plain(offered.typeId,accepted,offered.meta);remaining-=accepted;
  }
  return remaining?plain(offered.typeId,remaining,offered.meta):undefined;
}

function buildQ4({sourceAmount=10,destinationAmount=20,failAfterWrite,
  failAfterPrepare=false,failBeforeClear=false}={}) {
  const trace=[],logs=[];
  let journal,source=container([plain("minecraft:stone",sourceAmount)],"source",trace,
    {afterWrite:failAfterWrite});
  let destination=container([plain("minecraft:stone",destinationAmount)],"destination",trace,
    {afterWrite:failAfterWrite});
  const srcBlock={dimension:{id:"overworld"},location:{x:0,y:70,z:0}};
  const dstBlock={dimension:{id:"overworld"},location:{x:1,y:70,z:0}};
  const saveJournal=v=>{
    trace.push(v?"journal.prepare":"journal.clear");
    if(v!==undefined){
      journal=copy(v);
      if(failAfterPrepare){
        failAfterPrepare=false;
        throw Error("simulated crash after prepared journal");
      }
    } else {
      if(failBeforeClear){
        failBeforeClear=false;
        throw Error("simulated crash before journal clear");
      }
      journal=undefined;
    }
  };
  const write=actual("safeMovePartial",{
    exactStackSig:sig,serializeTransport:s=>({typeId:s.typeId,meta:s.meta}),
    POTION_ITEM_IDS:new Set(),filterRoundTripSafe:()=>true,saveJournal
  });
  const slotState=actual("slotState",{exactStackSig:sig});
  const recover=actual("recoverJournal",{
    safeJsonParse:s=>s?JSON.parse(s):undefined,
    world:{getDynamicProperty:()=>journal?JSON.stringify(journal):undefined},
    JOURNAL_KEY:"q4",
    getContainerAt:(_dim,loc)=>loc.x===0?source.api:destination.api,
    slotState,saveJournal,
    rebuildTransportItem:(data,amount)=>stack(data.typeId,amount,data.meta),
    log:m=>logs.push(m)
  });
  return {source,destination,write,recover,srcBlock,dstBlock,trace,logs,
    get journal(){return journal;}};
}

test("NATIVE-01 the real 1.4.1 Q4 source and writer are unchanged by this research",()=>{
  assert.equal(digest,expectedSha);
  assert.match(functionSource("safeMovePartial"),/saveJournal\(tx\)/);
  assert.match(functionSource("safeMovePartial"),/dst\.setItem\(tx\.dstSlot/);
  assert.match(functionSource("recoverJournal"),/TRANSFER JOURNAL AMBIGUOUS/);
});
test("NATIVE-02 a native-shaped offer yields a remainder but no placement receipt",()=>{
  const chest=[plain("minecraft:stone",63),undefined,plain("minecraft:dirt",64)];
  const leftover=illustrativeAddItem(chest,plain("minecraft:stone",16));
  assert.equal(leftover,undefined);
  assert.equal(chest[0].amount,64);
  assert.equal(chest[1].amount,15);
  // To know changed slots [0,1], the caller would need to inspect the chest;
  // the documented ItemStack|undefined return provides no slot IDs.
  assert.deepEqual(chest.map(v=>v?.amount),[64,15,64]);
});
test("NATIVE-03 partial acceptance is bounded, with full leftover on rejection",()=>{
  const chest=[plain("minecraft:stone",61),plain("minecraft:dirt",64)];
  const rem=illustrativeAddItem(chest,plain("minecraft:stone",16));
  assert.equal(rem.amount,13);
  assert.equal(chest[0].amount,64);
  assert.equal(illustrativeAddItem(chest,plain("minecraft:stone",16)).amount,16);
});
test("NATIVE-04 destination insertion alone does not debit its source",()=>{
  const src=[plain("minecraft:stone",16)],dst=[plain("minecraft:stone",50)];
  const rem=illustrativeAddItem(dst,plain("minecraft:stone",16));
  assert.equal(rem.amount,2);
  assert.equal(src[0].amount,16,"Separate source remains untouched");
  assert.equal(dst[0].amount,64,"Destination credited 14");
});
test("NATIVE-05 destination-first crash is ambiguous even with full durable pre-snapshot",()=>{
  const before=Array.from({length:54},()=>plain("minecraft:dirt",64));
  before[9]=plain("minecraft:stone",20);
  const durablePrepared={srcSlot:0,srcBefore:10,offer:5,
    destinationBefore:copy(before)};
  const noOffer=copy(before); // crash before native insertion
  noOffer[9].amount+=5;       // another player/Hopper supplied indistinguishable stone
  const nativeOffer=copy(before);
  assert.equal(illustrativeAddItem(nativeOffer,plain("minecraft:stone",5)),undefined);
  const observationA={source:[plain("minecraft:stone",10)],destination:noOffer,
    journal:durablePrepared};
  const observationB={source:[plain("minecraft:stone",10)],destination:nativeOffer,
    journal:durablePrepared};
  assert.deepEqual(observationA,observationB,
    "Every observable byte, including PRE-snapshot, can be identical");
  const correctA="do-not-debit-source"; // no Hart destination credit occurred
  const correctB="debit-source-by-5";   // Hart credit completed before crash
  assert.notEqual(correctA,correctB,
    "Same observation requires conflicting recovery actions => no safe classifier");
});
test("NATIVE-06 source-first crash has the symmetric ambiguity",()=>{
  const before=Array.from({length:27},()=>plain("minecraft:dirt",64));
  before[20]=plain("minecraft:stone",20);
  const prepared={srcBefore:10,srcAfter:5,offer:5,destinationBefore:copy(before)};
  const external=copy(before);
  external[20].amount+=5; // Hart debited but native addItem not yet called
  const inserted=copy(before);
  assert.equal(illustrativeAddItem(inserted,plain("minecraft:stone",5)),undefined);
  const a={source:[plain("minecraft:stone",5)],destination:external,journal:prepared};
  const b={source:[plain("minecraft:stone",5)],destination:inserted,journal:prepared};
  assert.deepEqual(a,b);
  assert.notEqual("restore-debited-source","leave-source-debited",
    "Same observation requires conflicting repair choices");
});
test("NATIVE-07 partial addItem result lost before journal receipt has same ambiguity",()=>{
  const before=[plain("minecraft:stone",61),plain("minecraft:dirt",64)];
  const prepared={offer:16,sourceBefore:16,destinationBefore:copy(before)};
  const a=copy(before);a[0].amount+=3; // unrelated writer; no addItem
  const b=copy(before);
  assert.equal(illustrativeAddItem(b,plain("minecraft:stone",16)).amount,13);
  const observationA={source:16,destination:a,journal:prepared};
  const observationB={source:16,destination:b,journal:prepared};
  assert.deepEqual(observationA,observationB);
  assert.equal(3,16-13,"The accepted quantity is unknown after interrupted return");
});
test("NATIVE-08 no cross-inventory transaction follows from the 2.7 API signatures",()=>{
  const apiContracts=fs.readFileSync(path.join(ROOT,
    "recovery/tests/level2_api_270_types.test.mjs"),"utf8");
  assert.match(apiContracts,/API270-01: Container transferItem exists/);
  assert.match(apiContracts,/API270-03: Container addItem is destination-only/);
  assert.match(apiContracts,/API_AVAILABLE_NOT_CROSS_CUSTODY/);
  assert.match(apiContracts,/No native amount-bounded signature/);
});
test("Q4-CONTROL-01 actual recovery discards a prepared-but-untouched transfer",()=>{
  const h=buildQ4({failAfterPrepare:true});
  assert.throws(()=>h.write(h.source.api,h.srcBlock,0,h.destination.api,
    h.dstBlock,{slot:0,before:20,room:44},5),/simulated crash/);
  assert.ok(h.journal);
  assert.equal(h.source.slots[0].amount,10);
  assert.equal(h.destination.slots[0].amount,20);
  h.recover();
  assert.equal(h.journal,undefined);
  assert.equal(h.source.slots[0].amount,10);
  assert.equal(h.destination.slots[0].amount,20);
});
test("Q4-CONTROL-02 actual Q4 writer recovers after source debit but before credit",()=>{
  const h=buildQ4({failAfterWrite:"source"});
  assert.throws(()=>h.write(h.source.api,h.srcBlock,0,h.destination.api,
    h.dstBlock,{slot:0,before:20,room:44},5),/simulated crash/);
  assert.equal(h.source.slots[0].amount,5);
  assert.equal(h.destination.slots[0].amount,20);
  assert.ok(h.journal,"Durable exact-slot journal was prepared");
  h.recover(); // one-shot synthetic fault clears at modeled restart
  assert.equal(h.destination.slots[0].amount,25);
  assert.equal(h.journal,undefined);
});
test("Q4-CONTROL-03 known destination slot is written just once and journal cleared",()=>{
  const h=buildQ4();
  h.write(h.source.api,h.srcBlock,0,h.destination.api,h.dstBlock,
    {slot:0,before:20,room:44},5);
  assert.equal(h.trace.filter(x=>x==="destination.set:0").length,1);
  assert.equal(h.trace.filter(x=>x==="journal.prepare").length,1);
  assert.equal(h.trace.filter(x=>x==="journal.clear").length,1);
  assert.equal(h.source.slots[0].amount,5);
  assert.equal(h.destination.slots[0].amount,25);
});
test("Q4-CONTROL-04 source-only current custody journals a single chosen slot",()=>{
  const h=buildQ4();
  h.write(h.source.api,h.srcBlock,0,h.destination.api,h.dstBlock,
    {slot:0,before:20,room:44},5);
  assert.equal(h.trace.some(x=>x==="destination.set:1"),false);
  assert.match(functionSource("recoverJournal"),/tx\.dstSlot/);
  assert.match(functionSource("safeMovePartial"),/dstSlot: dstSlotInfo\.slot/);
});

test("Q4-CONTROL-05 actual recovery recognizes credit already completed",()=>{
  const h=buildQ4({failBeforeClear:true});
  assert.throws(()=>h.write(h.source.api,h.srcBlock,0,h.destination.api,
    h.dstBlock,{slot:0,before:20,room:44},5),/simulated crash/);
  assert.ok(h.journal);
  assert.equal(h.source.slots[0].amount,5);
  assert.equal(h.destination.slots[0].amount,25);
  h.recover();
  assert.equal(h.journal,undefined);
  assert.equal(h.destination.slots[0].amount,25);
  assert.equal(h.source.slots[0].amount,5);
  assert.equal(h.trace.filter(x=>x==="destination.set:0").length,1);
});
test("Q4-CONTROL-06 actual recovery holds conflicting destination data",()=>{
  const h=buildQ4({failAfterWrite:"source"});
  assert.throws(()=>h.write(h.source.api,h.srcBlock,0,h.destination.api,
    h.dstBlock,{slot:0,before:20,room:44},5),/simulated crash/);
  h.destination.slots[0]=stack("minecraft:dirt",32);
  h.recover();
  assert.ok(h.journal);
  assert.equal(h.destination.slots[0].typeId,"minecraft:dirt");
  assert.equal(h.source.slots[0].amount,5);
  assert.ok(h.logs.some(x=>x.includes("AMBIGUOUS")));
});
test("Q4-CONTROL-07 actual writer does not require whole-chest snapshots",()=>{
  const w=functionSource("safeMovePartial");
  assert.match(w,/dstSlotInfo\.slot/);
  assert.match(w,/saveJournal\(tx\)/);
  assert.doesNotMatch(w,/for\s*\(let\s+i\s*=\s*0;\s*i\s*<\s*dst\.size/);
});
