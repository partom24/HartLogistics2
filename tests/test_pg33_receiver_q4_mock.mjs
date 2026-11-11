/** PG33 generated-source tests with fake Bedrock blocks / Q4 storage.
 * These are OFFLINE fault witnesses, not target-runtime or crash-save proof.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../build/pg33-lab/behavior_pack/scripts/main.js", import.meta.url), "utf8");
function fn(name) {
  const marker = "function " + name + "(";
  const a = src.indexOf(marker);
  assert.ok(a >= 0, "Missing actual compiled " + name);
  const b = src.indexOf("\n}", a);
  assert.ok(b > a, "Unclosed actual compiled " + name);
  return src.slice(a, b + 2);
}
const names = ["pg26PositionKey", "pg26SameChunk", "pg26Neighbor",
  "pg26EmptyDestinationSlot", "pg26RefreshConnections",
  "pg33ReadReceiverInput", "pg33CommittedQ4Meta", "pg33StillMatches",
  "pg33NativeOutputAllowed", "pg33ProcessReceiverColumn", "dequeueToReceiver"];
const functions = names.map(fn).join("\n");
assert.match(fn("dequeueToReceiver"), /options\?\.emptyOnly/);
assert.match(fn("dequeueToReceiver"), /options\?\.revalidate/);
assert.match(fn("dequeueToReceiver"), /options\?\.expectedHead/);

function fixture(options={}) {
  const blocks=new Map(), missing=new Set(), logs=[], journal=[];
  const k=p=>[p.x,p.y,p.z].join(",");
  let pending=false, faults="", count=0, onSlot=undefined, beforeDest=undefined;
  let q4Raw='{"schema":"q4","state":"committed"}', q3Raw=undefined;
  const dim={id:"minecraft:overworld",getBlock(p) {
    if(missing.has(k(p)))return undefined;
    return blocks.get(k(p))??block("minecraft:air",p);
  }};
  function block(typeId,p,container) {
    let states={};
    const perm=x=>({getState:n=>x[n]??false,
      withState:(n,v)=>perm({...x,[n]:v}),_states:x});
    return {typeId,location:{...p},dimension:dim,powered:false,
      getComponent:name=>name==="minecraft:inventory" && container?{container}:undefined,
      get permutation(){return perm(states);},
      setPermutation(next){states={...next._states};}};
  }
  function put(typeId,x,y,z,container) {
    const b=block(typeId,{x,y,z},container);blocks.set(k(b.location),b);return b;
  }
  function container() {
    const values=Array(27).fill(undefined);
    return {size:27,isValid:true,values,
      getItem:i=>values[i]?{...values[i]}:undefined,
      setItem(i,item) {if(faults==="physical")throw Error("fault after Q4 debit");values[i]=item?{...item}:undefined;},
      total:()=>values.reduce((x,v)=>x+(v?.amount||0),0)};
  }
  const output=container();
  const sorter=put("hartsorter:sorter",0,69,0);
  const root=put("hartlogistics:transporter",0,70,0);
  const pipe=put("hartlogistics:transporter",1,70,0);
  const receiverBlock=put("hartsorter:receiver",2,70,0);
  const outBlock=put("minecraft:chest",0,69,1,output);
  const receiver={id:"R",d:dim.id,x:2,y:70,z:0,present:true,
    queued:8,qVersion:4,qShards:0,qGen:0};
  const entry={d:dim.id,x:0,y:69,z:0,mode:"wildcard",f:undefined};
  const col={d:dim.id,source:{x:0,y:70,z:0},sorters:[entry]};
  const q={total:8,meta:{head:1,tail:1,total:8,delivered:0},
    first:{seq:1,id:"R:1",amount:8,data:{typeId:"minecraft:cobblestone"}}};
  const state={blocks,missing,logs,journal,dim,put,k,output,sorter,root,pipe,
    receiverBlock,outBlock,receiver,entry,col,q,
    fault:type=>faults=type,
    onSlot:fn=>onSlot=fn,
    beforeDest:fn=>beforeDest=fn,
    pending:()=>pending,
    setPending:x=>pending=x,
    setQ4Raw:x=>q4Raw=x, setQ3Raw:x=>q3Raw=x};
  const ctx={
    PG26_PIPE_ID:"hartlogistics:transporter",PG26_MAX_PIPES:16,
    PG26_FACES:[["north",0,0,-1],["south",0,0,1],["east",1,0,0],
      ["west",-1,0,0],["up",0,1,0],["down",0,-1,0]].map(([name,x,y,z])=>({name,x,y,z})),
    PG33_RECEIVER_BATCH:64,PG33_DOWN:{name:"down",x:0,y:-1,z:0},
    world:{getDynamicProperty:key=>key==='q4m-fixture'?q4Raw:
      key==='q3m-fixture'?q3Raw:undefined},
    queueMetaKey:()=> 'q4m-fixture',
    legacyQ3MetaKey:()=> 'q3m-fixture',
    SORTER_ID:"hartsorter:sorter",COLLECTOR_ID:"hartsorter:collector",
    RECEIVER_ID:"hartsorter:receiver",
    pg23TransportMayRun:()=>!pending,getDimension:()=>dim,
    blockIsRedstonePowered:b=>!!b?.powered,
    logisticsId:()=>receiver.id,findReceiverById:id=>id===receiver.id?receiver:undefined,
    receiverAt:r=>r===receiver?receiverBlock:undefined,
    loadReceiverQueue:r=>{assert.equal(r,receiver);if(faults==="queue-load")throw Error("unreadable Q4");return q;},
    queueHeadEntry:(r,queue)=>queue.first,
    rebuildQueueItem:(data,amount)=>({typeId:data.typeId,amount,maxAmount:data.rich?1:64}),
    serializeQueueItem:item=>item.maxAmount>1?{typeId:item.typeId}:undefined,
    sorterAt:e=>e===entry?sorter:undefined,
    sorterMode:e=>e.mode, matchesFilter:(i,f)=>i.typeId===f.typeId,
    autoSorterMatches:(i,e)=>e.auto===i.typeId,
    destinationFor:e=>{
      if(beforeDest)beforeDest();
      return e.destination??{kind:"storage",block:outBlock,container:output};
    },
    queueMetaSnapshot:m=>({...m}),
    findAcceptSlot:(c,item)=>{
      const merge=c.values.findIndex(x=>x?.typeId===item.typeId &&
        x.amount<item.maxAmount);
      if(merge>=0)return {slot:merge,before:c.values[merge].amount,
        room:item.maxAmount-c.values[merge].amount};
      const i=c.values.findIndex(x=>!x);
      return i<0?undefined:{slot:i,before:0,room:item.maxAmount};
    },
    queueSlotState:(c,i)=>{if(onSlot)onSlot();const item=c.getItem(i);return {sig:item?.typeId??"",amount:item?.amount??0};},
    queueDataSignature:data=>JSON.stringify(data),
    persistQueueEntry:(r,queue,seq,e)=>{queue.first=e;},
    clearQueueEntry:(r,queue,seq)=>{queue.first=undefined;},
    persistQueueMeta:(r,queue,m)=>{
      queue.meta={...m};queue.total=m.total;r.queued=m.total;
      q4Raw=JSON.stringify(m);
    },
    markLogisticsDirty:()=>count++,
    saveQueueJournal:v=>{pending=!!v;journal.push(v??null);},
    recoverQueueJournal:()=>{logs.push("HOLD: pending receipt untouched");},
    log:s=>logs.push(String(s)),
  };
  vm.runInNewContext(functions,ctx);
  return {...state,ctx,resolve:()=>ctx.pg33ReadReceiverInput(col),
    run:(budget=256)=>ctx.pg33ProcessReceiverColumn(col,budget)};
}

test("real generated PG33 permits exactly one Receiver and one Sorter",()=>{
  const h=fixture(),r=h.resolve();
  assert.ok(r);assert.equal(r.receiver.id,"R");assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});
test("ordinary Q4 head debits once through original dequeue writer",()=>{
  const h=fixture();assert.equal(h.run(),8);
  assert.equal(h.q.total,0);assert.equal(h.output.total(),8);
  assert.equal(h.journal.length,2);assert.equal(h.journal[0].kind,"dequeue");
  assert.equal(h.journal[1],null);assert.equal(h.pending(),false);
});
test("legacy Receiver output Hopper takes precedence over new pipe",()=>{
  const h=fixture();h.put("minecraft:hopper",2,69,0);
  assert.equal(h.resolve(),undefined);assert.equal(h.run(),0);
  assert.equal(h.q.total,8);assert.equal(h.journal.length,0);
});
test("unreadable block under Receiver refuses route",()=>{
  const h=fixture();h.missing.add("2,69,0");
  assert.equal(h.run(),0);assert.equal(h.journal.length,0);
});
test("second Receiver source refuses ambiguous graph",()=>{
  const h=fixture();h.put("hartsorter:receiver",1,71,0);
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
});
test("adjacent ordinary inventory is not an alternate output",()=>{
  const h=fixture();h.put("minecraft:barrel",1,71,0);
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
});
test("unknown pipe frontier holds, not assumed air",()=>{
  const h=fixture();h.missing.add("1,70,-1");
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
});
test("unloaded or out-of-chunk Receiver source holds",()=>{
  const h=fixture();h.receiverBlock.location={x:16,y:70,z:0};
  assert.equal(h.run(),0);assert.equal(h.journal.length,0);
});
test("powered Receiver, pipe or Sorter refuses before queue debit",()=>{
  for(const name of ["receiverBlock","pipe","sorter"]) {
    const h=fixture();h[name].powered=true;
    assert.equal(h.run(),0,name);assert.equal(h.q.total,8);
    assert.equal(h.journal.length,0,name);
  }
});
test("FILTER and AUTO eligibility, BYPASS exclusion",()=>{
  const h=fixture();h.entry.mode="filter";h.entry.f={typeId:"minecraft:dirt"};
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
  h.entry.f={typeId:"minecraft:cobblestone"};
  assert.equal(h.run(),8);
  const j=fixture();j.entry.mode="bypass";assert.equal(j.run(),0);
  j.entry.mode="auto";j.entry.auto="minecraft:cobblestone";
  assert.equal(j.run(),8);
});
test("Q4 metadata-rich nonstackable head remains queued",()=>{
  const h=fixture();h.q.first.data.rich=true;
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});
test("empty destination slot required; no direct occupied merge",()=>{
  const h=fixture();
  h.output.values.fill({typeId:"minecraft:cobblestone",amount:1,maxAmount:64});
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});
test("existing partially occupied slot is not modified",()=>{
  const h=fixture();
  h.output.values[0]={typeId:"minecraft:cobblestone",amount:2,maxAmount:64};
  assert.equal(h.run(),8);assert.equal(h.output.values[0].amount,2);
  assert.equal(h.output.values[1].amount,8);
});
test("queue load errors leave physical and Q4 unchanged",()=>{
  const h=fixture();h.fault("queue-load");
  assert.equal(h.run(),0);assert.equal(h.output.total(),0);
  assert.equal(h.journal.length,0);
});
test("pending Q4 receipt globally refuses all new source debits",()=>{
  const h=fixture();h.setPending(true);
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});
test("graph changes before dequeue journal cause no debit",()=>{
  const h=fixture();h.onSlot(()=>h.put("minecraft:air",1,70,0));
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});
test("output changes during revalidation refuse without journal",()=>{
  const h=fixture();let n=0;
  h.beforeDest(()=>{if(++n===2)h.entry.destination={kind:"collector",block:h.outBlock};});
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});
test("exception after journaled Q4 debit preserves unresolved receipt and HOLD",()=>{
  const h=fixture();h.fault("physical");
  assert.equal(h.run(),0);assert.equal(h.output.total(),0);
  assert.equal(h.journal.length,1);assert.equal(h.journal[0].kind,"dequeue");
  assert.equal(h.pending(),true);assert.equal(h.run(),0);
  assert.equal(h.journal.length,1);assert.equal(h.q.total,0);
});
test("global and per-column budget are respected",()=>{
  const h=fixture();assert.equal(h.run(3),3);
  assert.equal(h.q.total,5);assert.equal(h.output.total(),3);
  assert.equal(h.journal.at(-1),null);
});

test("legacy Receiver -> output Hopper retains original occupied-stack merge",()=>{
  const h=fixture();const hopper=h.put("minecraft:hopper",2,69,0);
  h.output.values[0]={typeId:"minecraft:cobblestone",amount:2,maxAmount:64};
  const moved=h.ctx.dequeueToReceiver(h.receiver,
    {block:hopper,container:h.output},16);
  assert.equal(moved,8);assert.equal(h.output.values[0].amount,10);
  assert.equal(h.q.total,0);assert.equal(h.journal.at(-1),null);
});
test("changed Sorter mode after admission refuses Q4 journal debit",()=>{
  const h=fixture();h.onSlot(()=>{h.entry.mode="bypass";});
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});
test("changed FILTER matching after admission refuses Q4 journal debit",()=>{
  const h=fixture();h.entry.mode="filter";
  h.entry.f={typeId:"minecraft:cobblestone"};
  h.onSlot(()=>{h.entry.f={typeId:"minecraft:dirt"};});
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});
test("new legacy Hopper before journal defeats a previously valid pipe",()=>{
  const h=fixture();h.onSlot(()=>h.put("minecraft:hopper",2,69,0));
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});
test("queue head larger than one stack debits one bounded segment",()=>{
  const h=fixture();h.q.first.amount=100;h.q.total=100;h.q.meta.total=100;
  assert.equal(h.run(),64);assert.equal(h.q.total,36);
  assert.equal(h.q.first.amount,36);assert.equal(h.output.total(),64);
  assert.equal(h.journal.at(-1),null);
});

test("Receiver touching an independent disconnected pipe must HOLD both routes",()=>{
  const h=fixture();h.put("hartlogistics:transporter",3,70,0);
  assert.equal(h.resolve(),undefined);
  assert.equal(h.run(),0);assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});

test("generated connection callback visually links Receiver without writing custody",()=>{
  const h=fixture();
  h.ctx.pg26RefreshConnections(h.pipe);
  assert.equal(h.pipe.permutation.getState("hartlogistics:connect_east"),true);
  assert.equal(h.journal.length,0);assert.equal(h.q.total,8);
  h.put("minecraft:air",2,70,0);
  h.ctx.pg26RefreshConnections(h.pipe);
  assert.equal(h.pipe.permutation.getState("hartlogistics:connect_east"),false);
  assert.equal(h.journal.length,0);
});

test("Q4 must already be committed; new route never initializes or migrates older formats",()=>{
  for(const mode of ["q4absent","q4torn","q3present","q2shards","badversion"]) {
    const h=fixture();
    if(mode==="q4absent") h.setQ4Raw(undefined);
    if(mode==="q4torn") h.setQ4Raw("");
    if(mode==="q3present") h.setQ3Raw('{"version":3}');
    if(mode==="q2shards") h.receiver.qShards=1;
    if(mode==="badversion") h.receiver.qVersion=3;
    assert.equal(h.run(),0,mode);
    assert.equal(h.journal.length,0,mode);
    assert.equal(h.q.total,8,mode);
  }
});
test("Receiver registry identity must match physically connected Receiver",()=>{
  for(const field of ["x","y","z","d"]) {
    const h=fixture();
    h.receiver[field]=field==="d"?"minecraft:nether":999;
    assert.equal(h.run(),0,field);
    assert.equal(h.journal.length,0);
  }
});
test("native inventory beneath Receiver also refuses pipe transfer",()=>{
  const h=fixture();
  const other= {size:27,isValid:true};
  h.put("minecraft:barrel",2,69,0,other);
  assert.equal(h.run(),0);
  assert.equal(h.journal.length,0);
});
test("Q4 metadata drift during slot observation stops before debit journal",()=>{
  const h=fixture();
  h.onSlot(()=>h.setQ4Raw('{"schema":"q4","changed":true}'));
  assert.equal(h.run(),0);
  assert.equal(h.q.total,8);
  assert.equal(h.output.total(),0);
  assert.equal(h.journal.length,0);
});
test("queue head changes during destination inspection; no stale head debit",()=>{
  const h=fixture();
  h.onSlot(()=>{h.q.first={...h.q.first,id:"R:changed",data:{typeId:"minecraft:dirt"}};});
  assert.equal(h.run(),0);
  assert.equal(h.output.total(),0);
  assert.equal(h.journal.length,0);
  assert.equal(h.q.total,8);
});
test("q4 head has unknown serialized field; reconstructed plain item cannot silently discard it",()=>{
  const h=fixture();
  h.q.first.data={typeId:"minecraft:cobblestone",unrecognized:"opaque"};
  assert.equal(h.run(),0);
  assert.equal(h.output.total(),0);
  assert.equal(h.journal.length,0);
  assert.equal(h.q.total,8);
});
test("pending Q4 intent emerges just before journal cutpoint; HOLD without debit",()=>{
  const h=fixture();
  h.onSlot(()=>h.setPending(true));
  assert.equal(h.run(),0);
  assert.equal(h.journal.length,0);
  assert.equal(h.q.total,8);
});
test("powered destination after queue inspection refuses journaled credit",()=>{
  const h=fixture();
  h.onSlot(()=>{h.sorter.powered=true;});
  assert.equal(h.run(),0);
  assert.equal(h.journal.length,0);
  assert.equal(h.q.total,8);
});

test("double chest output adjacency is refused, even if one half reports 27 slots",()=>{
  const h=fixture();
  h.put("minecraft:chest",1,69,1);
  assert.equal(h.run(),0);
  assert.equal(h.q.total,8);
  assert.equal(h.output.total(),0);
  assert.equal(h.journal.length,0);
});
test("unknown neighbor of chest output is an unsafe frontier",()=>{
  const h=fixture();
  h.missing.add("0,69,2");
  assert.equal(h.run(),0);
  assert.equal(h.q.total,8);
  assert.equal(h.journal.length,0);
});
test("wrong-sized and arbitrary inventory outputs are refused",()=>{
  for (const kind of ["minecraft:hopper","minecraft:trapped_chest","minecraft:chest"]) {
    const h=fixture();
    h.outBlock.typeId=kind;
    if(kind==="minecraft:chest") h.output.size=54;
    assert.equal(h.run(),0,kind);
    assert.equal(h.q.total,8,kind);
    assert.equal(h.journal.length,0,kind);
  }
});
test("one ordinary 27-slot barrel output remains supported",()=>{
  const h=fixture();
  h.outBlock.typeId="minecraft:barrel";
  assert.equal(h.run(),8);
  assert.equal(h.output.total(),8);
  assert.equal(h.q.total,0);
  assert.equal(h.journal.at(-1),null);
});
