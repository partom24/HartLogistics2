import test from "node:test";
import assert from "node:assert/strict";
import {inspectVerifiedBankFilterHome,inspectBankFilterColumn}
  from "../../addon/behavior_pack/scripts/urce_1513_verified_bank_filter.js";

const D="minecraft:overworld";
const key=(p)=>[p.x,p.y,p.z].join(",");
function fake(typeId,p,inv=null){
  return {typeId,location:p,dimension:{id:D},
    permutation:{getState:n=>n==="toggle_bit"?false:0},
    getComponent:n=>n==="minecraft:inventory"&&inv?{container:inv}:undefined};
}
function container(items=[]){
  return {isValid:true,size:27,contents:[...items],
    firstItem(){return this.contents.find(Boolean);}};
}
const env=({
  two=true,filterId="minecraft:cobblestone",full=false,
  unknown=false,cycle=false,broken=false,branch=false,
  unknownSideHopper=false,wrongColumn=false,unloaded=false,
  powered=false,locked=false
}={})=>{
  const blocks=new Map(),visited=new Set(),collectors=[],receivers=[],columns=[];
  const at=p=>blocks.get(key(p))??fake("minecraft:air",p);
  const put=(typeId,p,inv)=>{let e=fake(typeId,p,inv);blocks.set(key(p),e);return e;};
  const rec=(id,p)=>{const v={d:D,id,x:p.x,y:p.y,z:p.z};receivers.push(v);
    put("hartsorter:receiver",p);
    put("minecraft:hopper",{x:p.x,y:p.y-1,z:p.z},container());return v;};
  const root=rec("R1",{x:0,y:5,z:0});
  // Bank #1: source Receiver -> straight visual Transporter -> Collector.
  for(let x=1;x<=3;x++)put("hartsorter:transporter",{x,y:4,z:0});
  let follow;
  if(two){
    const c={id:"C1",d:D,x:4,y:4,z:0,link:"R2"};
    collectors.push(c);put("hartsorter:collector",c);
    follow=rec("R2",{x:10,y:5,z:0});
    for(let x=11;x<=13;x++)put("hartsorter:transporter",{x,y:4,z:0});
  }
  const atBank=two?{x:13,y:4,z:-1}:{x:3,y:4,z:-1};
  const sorterY=3;
  put("minecraft:hopper",atBank,container());
  const e={d:D,x:atBank.x,y:sorterY,z:atBank.z,m:"filter",f:filterId};
  put("hartsorter:sorter",e);
  const storage={x:atBank.x+1,y:sorterY,z:atBank.z};
  const store=container();
  const chest=put("minecraft:chest",storage,store);
  put("minecraft:stone",{x:storage.x,y:storage.y-1,z:storage.z});
  const col={d:D,x:atBank.x,z:atBank.z,
    source:{...atBank},sorters:[e]};
  columns.push(col);
  if(cycle){
    const c={id:"C2",d:D,x:14,y:4,z:0,link:"R1"};
    collectors.push(c);put("hartsorter:collector",c);
  }
  if(unknownSideHopper)
    put("minecraft:hopper",{x:two?12:2,y:4,z:1},container());
  if(branch)
    put("hartsorter:transporter",{x:two?12:2,y:4,z:1});
  if(broken)blocks.delete(key({x:two?12:2,y:4,z:0}));
  if(wrongColumn){
    col.sorters[0]={...col.sorters[0],y:sorterY-1};
  }
  if(locked){
    const src=blocks.get(key(atBank));
    src.permutation.getState=n=>n==="toggle_bit"?true:0;
  }
  const get=(d,p)=>{
    if(d!==D)throw Error("unloaded_dimension");
    visited.add(key(p));
    if(unloaded&&p.x===(two?12:2)&&p.y===4&&p.z===1)
      return undefined;
    return at(p);
  };
  const isPowered=(_)=>powered;
  const stack={typeId:"minecraft:cobblestone",amount:4,maxAmount:64};
  const config={receiver:root,item:stack,collectors,receivers,columns,
    read:get,modeOf:e=>e.m,
    matches:(item,f)=>item.typeId===f,
    powered:isPowered,
    destination:(_e,_block)=>({kind:"storage",block:chest}),
    inventory:b=>b.getComponent("minecraft:inventory")?.container,
    admit:(_c,_item)=>full?undefined:{slot:0,room:64},
    maxReads:4000,maxPipes:64,maxBanks:6};
  return {config,root,store,visited,blocks,col,e};
};

test("MBF-01 physical one-bank native path proves a reachable, admitting Filter home",()=>{
  const f=env({two:false});
  const r=inspectVerifiedBankFilterHome(f.config);
  assert.equal(r.status,"FILTER_HOME",JSON.stringify(r));
  assert.equal(r.chosen.block.typeId,"minecraft:chest");
  assert.equal(r.chosen.entry,f.e);
  assert.equal(r.banks,1);
  assert.ok(r.reads<100,"bounded one-bank source read cost");
  assert.equal(r.executePermitted,false);
  assert.equal(r.persistPermitted,false);
});

test("MBF-02 an explicit Collector->Receiver link joins two verified bank components",()=>{
  const f=env();
  const r=inspectVerifiedBankFilterHome(f.config);
  assert.equal(r.status,"FILTER_HOME",JSON.stringify(r));
  assert.equal(r.banks,2);
  assert.equal(r.chosen.bankReceiverId,"R2");
  assert.equal(r.chosen.links,1);
  assert.equal(r.executePermitted,false);
  assert.ok(r.reads<200,"bounded two-bank proof");
});

test("MBF-03 absent item claim or full chest is NOT an AUTO/Wildcard or Bulk grant",()=>{
  for(const [opts,reason] of [
    [{filterId:"minecraft:dirt"},"no_live_reachable_filter_admission"],
    [{full:true},"no_live_reachable_filter_admission"]
  ]){
    const r=inspectVerifiedBankFilterHome(env(opts).config);
    assert.equal(r.status,"NO_FILTER_HOME",JSON.stringify(r));
    assert.equal(r.reason,reason);
    assert.equal(r.executePermitted,false);
  }
});

test("MBF-04 cycle, native unknown, missing pipe and stray Hopper fail CLOSED",()=>{
  for(const opts of [
    {cycle:true},{unloaded:true},
    {branch:true},{unknownSideHopper:true},
    {wrongColumn:true},{locked:true},{powered:true}
  ]){
    const r=inspectVerifiedBankFilterHome(env(opts).config);
    assert.equal(r.status,"HOLD",JSON.stringify({opts,r}));
    assert.equal(r.mayAuthorizeCargo,false);
  }
});

test("MBF-04b physically broken bank run provides NO affirmative Filter route",()=>{
  const r=inspectVerifiedBankFilterHome(env({broken:true}).config);
  assert.equal(r.status,"NO_FILTER_HOME");
  assert.equal(r.executePermitted,false);
  assert.equal(r.mayAuthorizeCargo,false);
});

test("MBF-05 positive path requires current saved link and loaded exact endpoints",()=>{
  const e=env();
  e.config.collectors[0].link=undefined;
  assert.equal(inspectVerifiedBankFilterHome(e.config).status,"HOLD");
  const e2=env();
  e2.config.read=(d,p)=>p.x===10&&p.y===5&&p.z===0
    ?undefined:e2.blocks.get(key(p))??fake("minecraft:air",p);
  assert.equal(inspectVerifiedBankFilterHome(e2.config).status,"HOLD");
});

test("MBF-06 bounded graph and incomplete call contracts cannot confer a home",()=>{
  const f=env();
  assert.equal(inspectVerifiedBankFilterHome({...f.config,maxReads:3}).status,"HOLD");
  assert.equal(inspectVerifiedBankFilterHome({...f.config,maxPipes:1}).status,"HOLD");
  assert.equal(inspectVerifiedBankFilterHome({...f.config,maxBanks:1}).status,"HOLD");
  assert.equal(inspectVerifiedBankFilterHome({...f.config,
    receiver:{...f.root,x:999}}).status,"HOLD");
});

test("MBF-07 direct column proof detects Hopper occupancy, missing Sorter, extractor",()=>{
  const f=env({two:false});
  const c=f.col;
  const base={column:c,item:f.config.item,read:f.config.read,
    modeOf:f.config.modeOf,matches:f.config.matches,
    powered:f.config.powered,destination:f.config.destination,
    inventory:f.config.inventory,admit:f.config.admit};
  assert.equal(inspectBankFilterColumn(base).status,"FILTER_HOME");
  const h=f.blocks.get(key(c.source));
  h.getComponent=()=>({container:container([f.config.item])});
  assert.equal(inspectBankFilterColumn(base).status,"HOLD");
  h.getComponent=()=>({container:container()});
  const chest=f.config.destination().block;
  f.blocks.set(key({x:chest.location.x,y:chest.location.y-1,z:chest.location.z}),
    fake("minecraft:hopper",{x:chest.location.x,y:chest.location.y-1,z:chest.location.z}));
  assert.equal(inspectBankFilterColumn(base).status,"HOLD");
});
