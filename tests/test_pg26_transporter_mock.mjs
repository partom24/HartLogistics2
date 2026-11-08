/** Actual PG26 graph/Sorter/native writer, fake world APIs; not BDS proof. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../build/pg26-lab/behavior_pack/scripts/main.js",import.meta.url),"utf8");
function body(name) {
  const a=source.indexOf("function "+name+"("); assert.ok(a>=0,name);
  return source.slice(a,source.indexOf("\n}",a)+2);
}
const fullOverlay=fs.readFileSync(new URL("../candidates/pg26/transporter_input.js",import.meta.url),"utf8");
const overlay=fullOverlay.split("system.beforeEvents.startup.subscribe")[0];
const names=["processColumn","safeMovePartial","saveJournal","safeJsonParse","recoverJournal",
  "pg20MoveOpaqueNative","pg20InspectableNativeFingerprint","pg23TransportMayRun"];
class Stack {
  constructor(typeId="minecraft:cobblestone",amount=8,rich=false) {
    Object.assign(this,{typeId,amount,rich,maxAmount:64,nameTag:rich?"native-only":"",keepOnDeath:false,lockMode:"none"});
  }
  clone(){return new Stack(this.typeId,this.amount,this.rich)}
  getLore(){return []} getCanDestroy(){return []} getCanPlaceOn(){return []}
  getDynamicPropertyIds(){return []} getComponent(){return undefined}
}
class Inventory {
  constructor(size=27){this.size=size;this.isValid=true;this.items=Array(size);this.sets=0;this.moves=0;this.fault="";this.afterMove=null;}
  getItem(i){return this.items[i]?.clone()}
  setItem(i,item){this.sets++;this.items[i]=item?.clone()}
  moveItem(a,b,dst){
    this.moves++;
    if(this.fault==="before")throw Error("before native move");
    assert.ok(this.items[a]&&!dst.items[b]);
    dst.items[b]=this.items[a];this.items[a]=undefined;
    if(this.afterMove)this.afterMove(dst.items[b]);
    if(this.fault==="after")throw Error("after native move");
  }
  total(){return this.items.reduce((n,x)=>n+(x?.amount??0),0)}
}
const key=p=>`${p.x},${p.y},${p.z}`;
function fixture({hopper=false}={}) {
  const blocks=new Map(),missing=new Set(),props=new Map(),logs=[],writes=[];
  const dim={id:"minecraft:overworld",getBlock(p){if(missing.has(key(p)))return undefined;return blocks.get(key(p))??block("minecraft:air",p);}};
  function block(typeId,p,inventory){
    let states={};
    const permutation=st=>({getState:n=>st[n]??false,withState:(n,v)=>permutation({...st,[n]:v}),_states:st});
    return {typeId,location:{...p},dimension:dim,powered:false,inventory,
      getComponent:id=>id==="minecraft:inventory"&&inventory?{container:inventory}:undefined,
      get permutation(){return permutation(states);},
      setPermutation(p){states={...p._states};this.permutations=(this.permutations??0)+1;}};
  }
  function put(typeId,x,y,z,inventory){const b=block(typeId,{x,y,z},inventory);blocks.set(key(b.location),b);return b;}
  const input=new Inventory(hopper?5:27),output=new Inventory(); input.items[0]=new Stack();
  const sorter=put("hartsorter:sorter",0,69,0),root=put(hopper?"minecraft:hopper":"hartlogistics:transporter",0,70,0,hopper?input:undefined);
  if(!hopper){put("hartlogistics:transporter",0,70,1);put("hartlogistics:transporter",0,70,2);}
  const sourceBlock=hopper?root:put("minecraft:barrel",0,70,3,input);
  const outBlock=put("minecraft:chest",0,69,-1,output);
  const entry={d:dim.id,x:0,y:69,z:0,mode:"wildcard",f:null};
  const col={d:dim.id,x:0,z:0,source:{x:0,y:70,z:0},sorters:[entry]};
  let compact=0, collectorCalls=0, onDestination=null;
  const context={
    SORTER_ID:"hartsorter:sorter",COLLECTOR_ID:"hartsorter:collector",RECEIVER_ID:"hartsorter:receiver",
    JOURNAL_KEY:"physical",QUEUE_JOURNAL_KEY:"q4",PG20_OPAQUE_JOURNAL:"pg20-native-opaque-v1",PG23_COMPACTION_JOURNAL:"compaction",
    PER_COLUMN_BATCH:16,POTION_ITEM_IDS:new Set(), getDimension:()=>dim,
    world:{getDynamicProperty:n=>props.get(n)},
    setWorldDynamic(n,v){writes.push([n,v]);if(v===undefined)props.delete(n);else props.set(n,v);},
    pg20ReportHold:m=>logs.push(m),log:m=>logs.push(m),
    blockIsRedstonePowered:b=>b.powered,hopperIsRedstoneLocked:b=>!!b.powered,
    sorterAt:e=>blocks.get(key(e)),sorterMode:e=>e.mode,
    matchesFilter:(item,f)=>item.typeId===f.typeId,
    autoSorterMatches:item=>output.items.some(x=>x?.typeId===item.typeId),
    destinationFor(){if(onDestination)onDestination();return {kind:"container",container:output,block:outBlock};},
    findAcceptSlot(container,item){
      for(let i=0;i<container.size;i++){const x=container.items[i];if(x?.typeId===item.typeId&&x.amount<64)return {slot:i,before:x.amount,room:64-x.amount};}
      const i=container.items.findIndex(x=>!x);return i<0?undefined:{slot:i,before:0,room:64};
    },
    serializeQueueItem:item=>item&&!item.rich?{typeId:item.typeId}:undefined,
    serializeTransport:item=>({typeId:item.typeId}),exactStackSig:item=>item?.typeId??"",
    enchantments:()=>[],filterRoundTripSafe:()=>true,
    pg23CompactSourceHopper(){compact++;return true;},
    enqueueFromSource(){collectorCalls++;throw Error("new virtual custody is forbidden");},
    getContainerAt:(_,p)=>blocks.get(key(p))?.inventory,
    slotState:(container,i)=>({amount:container.items[i]?.amount??0,sig:container.items[i]?.typeId??""})
  };
  vm.runInNewContext("let pg23LocalHold=false,pg24EntityHold=false,pg25QueueHold=false;\n"+overlay+"\n"+names.map(body).join("\n"),context);
  return {blocks,missing,props,logs,writes,dim,put,input,output,entry,col,root,sorter,sourceBlock,outBlock,context,
    resolve:()=>context.pg26ReadTransportInput(col),run:(budget=256)=>context.processColumn(col,budget),
    compact:()=>compact,collectorCalls:()=>collectorCalls,onDestination:fn=>{onDestination=fn;}};
}
test("three pipes choose one real source and one Sorter endpoint",()=>{
  const h=fixture(),r=h.resolve(); assert.ok(r);assert.equal(r.block,h.sourceBlock);assert.equal(h.input.total(),8);assert.equal(h.writes.length,0);
});
for(const kind of ["minecraft:barrel","minecraft:chest"]){
  test(`${kind} ordinary stack moves through Sorter using one existing native writer`,()=>{
    const h=fixture();h.sourceBlock.typeId=kind; assert.equal(h.run(),8);
    assert.equal(h.input.total(),0);assert.equal(h.output.total(),8);
    assert.equal(h.input.moves,1);assert.equal(h.input.sets+h.output.sets,0);
    assert.equal(h.props.size,0);assert.equal(h.compact(),0);
    const receipt=JSON.parse(h.writes[0][1]);assert.equal(receipt.opaqueTag,"pg20-native-opaque-v1");
    assert.deepEqual(receipt.src,{x:0,y:70,z:3});assert.deepEqual(receipt.dst,{x:0,y:69,z:-1});
  });
}
test("a full 64-stack fits the pipe budget without changing legacy Hopper budget",()=>{
  const h=fixture();h.input.items[0].amount=64;assert.equal(h.run(),64);assert.equal(h.output.total(),64);
  const legacy=fixture({hopper:true});legacy.input.items[0].amount=64;assert.equal(legacy.run(),16);assert.equal(legacy.input.total(),48);assert.equal(legacy.compact(),2);
});
test("insufficient remaining tick budget leaves whole stack untouched",()=>{
  const h=fixture();assert.equal(h.run(4),0);assert.equal(h.input.total(),8);assert.equal(h.writes.length,0);
});
for(const mode of ["wildcard","filter","auto","bypass"]){
  for(const matching of [true,false]){
    test(`actual Sorter ${mode}/${matching?"matching":"other identity"} acceptance agrees for Hopper and pipe`,()=>{
      const results=[];
      for(const hopper of [false,true]){
        const h=fixture({hopper});h.entry.mode=mode;h.entry.f={typeId:matching?"minecraft:cobblestone":"minecraft:sand"};
        if(mode==="auto")h.output.items[0]=new Stack(matching?"minecraft:cobblestone":"minecraft:sand",64);
        results.push(h.run());
      }
      assert.equal(results[0],results[1]);
      assert.equal(results[0],mode==="bypass"||((mode==="filter"||mode==="auto")&&!matching)?0:8);
    });
  }
}
test("filter precedes wildcard in the same bottom-to-top column",()=>{
  const h=fixture();h.entry.mode="wildcard";
  const filtered={...h.entry,y:68,mode:"filter",f:{typeId:"minecraft:cobblestone"}};
  h.put("hartsorter:sorter",0,68,0);h.col.sorters=[h.entry,filtered];
  const chosen=[];h.context.destinationFor=e=>{chosen.push(e.y);return {kind:"container",container:h.output,block:h.outBlock};};
  assert.equal(h.run(),8);assert.equal(chosen[0],68);
});
for(const bad of ["extra source","extra sorter","unloaded boundary","too many pipes","double chest","foreign inventory","virtual receiver","low pipe"]){
  test(`${bad} refuses topology without touching an inventory or journal`,()=>{
    const h=fixture();
    if(bad==="extra source")h.put("minecraft:barrel",1,70,1,new Inventory());
    if(bad==="extra sorter")h.put("hartsorter:sorter",0,69,1);
    if(bad==="unloaded boundary")h.missing.add("1,70,1");
    if(bad==="too many pipes")for(let i=1;i<=16;i++)h.put("hartlogistics:transporter",i,70,1);
    if(bad==="double chest"){h.sourceBlock.typeId="minecraft:chest";h.put("minecraft:chest",1,70,3,new Inventory(54));}
    if(bad==="foreign inventory")h.put("othermod:store",1,70,1,new Inventory());
    if(bad==="virtual receiver")h.put("hartsorter:receiver",1,70,1);
    if(bad==="low pipe")h.put("hartlogistics:transporter",0,69,1);
    assert.equal(h.resolve(),undefined);assert.equal(h.run(),0);
    assert.equal(h.input.total(),8);assert.equal(h.input.moves,0);assert.equal(h.writes.length,0);
  });
}
test("connected loop is bounded, visited once and retains a unique source/column",()=>{
  const h=fixture();for(const [x,z] of [[1,0],[1,1],[1,2]])h.put("hartlogistics:transporter",x,70,z);
  assert.ok(h.resolve());assert.equal(h.run(),8);
});
for(const where of ["pipe","sorter","legacy hopper"]){
  test(`${where} redstone pause makes zero writes and resumes with the gate cleared`,()=>{
    const h=fixture({hopper:where==="legacy hopper"});const gate=where==="sorter"?h.sorter:h.root;
    gate.powered=true;assert.equal(h.run(),0);assert.equal(h.writes.length,0);
    gate.powered=false;assert.equal(h.run(),8);
  });
}
test("metadata-rich item stays at source without serialization or native move",()=>{
  const h=fixture();h.input.items[0]=new Stack("minecraft:enchanted_book",1,true);
  assert.equal(h.run(),0);assert.equal(h.input.total(),1);assert.equal(h.writes.length,0);
});
test("partial destination room is not permission to split or merge a native stack",()=>{
  const h=fixture();h.output.items.fill(new Stack("minecraft:cobblestone",63));
  assert.equal(h.run(),0);assert.equal(h.input.total(),8);assert.equal(h.writes.length,0);
});
test("empty destination slot is used without merging into an existing partial stack",()=>{
  const h=fixture();h.output.items[0]=new Stack("minecraft:cobblestone",1);
  assert.equal(h.run(),8);assert.equal(h.output.items[0].amount,1);assert.equal(h.output.items[1].amount,8);
});
test("Collector destination cannot introduce a new pipe-to-Q4 virtual custody leg",()=>{
  const h=fixture();h.context.destinationFor=()=>({kind:"collector"});
  assert.equal(h.run(),0);assert.equal(h.collectorCalls(),0);assert.equal(h.writes.length,0);
});
test("new source or lost route discovered at destination selection blocks final native mutation",()=>{
  const h=fixture();h.onDestination(()=>h.put("minecraft:barrel",1,70,1,new Inventory()));
  assert.equal(h.run(),0);assert.equal(h.input.total(),8);assert.equal(h.writes.length,0);
});
for(const phase of ["before","after"]){
  test(`native failure ${phase} movement preserves receipt and never automatically replays`,()=>{
    const h=fixture();h.input.fault=phase;assert.equal(h.run(),0);
    assert.equal(h.props.has("physical"),true);const raw=h.props.get("physical");
    assert.equal(h.input.total()+h.output.total(),8);
    assert.equal(h.run(),0);h.context.recoverJournal();
    assert.equal(h.props.get("physical"),raw);assert.equal(h.input.moves,1);
  });
}
for(const name of ["physical","q4"]){
  test(`pending ${name} receipt blocks pipe lookup and movement`,()=>{
    const h=fixture();h.props.set(name,"unresolved");assert.equal(h.resolve(),undefined);assert.equal(h.run(),0);
    assert.equal(h.input.moves,0);assert.equal(h.props.get(name),"unresolved");
  });
}
test("six-face visual states follow actual neighbors without inventory access or a journal",()=>{
  const h=fixture();
  h.context.pg26RefreshConnections(h.root);
  assert.equal(h.root.permutation.getState("hartlogistics:connect_down"),true);
  assert.equal(h.root.permutation.getState("hartlogistics:connect_south"),true);
  assert.equal(h.root.permutation.getState("hartlogistics:connect_north"),false);
  const changes=h.root.permutations;h.context.pg26RefreshConnections(h.root);
  assert.equal(h.root.permutations,changes,"unchanged connections should not write states again");
  h.put("minecraft:air",0,70,1);h.context.pg26RefreshConnections(h.root);
  assert.equal(h.root.permutation.getState("hartlogistics:connect_south"),false);
  assert.equal(h.input.moves,0);assert.equal(h.writes.length,0);
});
test("actual stable startup subscription registers the component used by the new block",()=>{
  const h=fixture(),registered=new Map();
  const context={...h.context,system:{beforeEvents:{startup:{subscribe:fn=>fn({blockComponentRegistry:{registerCustomComponent:(id,handlers)=>registered.set(id,handlers)}})}}}};
  vm.runInNewContext(fullOverlay,context);
  assert.deepEqual([...registered.keys()],["hartlogistics:transporter_connections"]);
  registered.get("hartlogistics:transporter_connections").onTick({block:h.root});
  assert.equal(h.root.permutation.getState("hartlogistics:connect_south"),true);
  assert.equal(h.input.moves,0);
});
test("all 64 neighbor masks drive the actual connection callback without stale arms",()=>{
  const h=fixture(),faces=[['north',0,0,-1],['south',0,0,1],['east',1,0,0],['west',-1,0,0],['up',0,1,0],['down',0,-1,0]];
  // Reuse the same block across all transitions to catch missed arm removals.
  for(const mask of [...Array(64).keys(),0]){
    for(let i=0;i<faces.length;i++){
      const [,x,y,z]=faces[i];h.put(mask&(1<<i)?"hartlogistics:transporter":"minecraft:air",x,70+y,z);
    }
    h.context.pg26RefreshConnections(h.root);
    for(let i=0;i<faces.length;i++)assert.equal(h.root.permutation.getState("hartlogistics:connect_"+faces[i][0]),!!(mask&(1<<i)),`mask ${mask}/${faces[i][0]}`);
  }
  assert.equal(h.input.moves,0);assert.equal(h.writes.length,0);
});
