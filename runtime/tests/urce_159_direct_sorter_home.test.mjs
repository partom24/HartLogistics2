import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SRC=path.join(ROOT,"addon/behavior_pack/scripts/urce_159_direct_sorter_home.js");
async function load(){
  const m=new vm.SourceTextModule(fs.readFileSync(SRC,"utf8"),{identifier:SRC});
  await m.link(()=>{throw Error("native direct home must not import Bedrock or a custody writer");});
  await m.evaluate();
  return m.namespace;
}
const mk=(type,x,y,z,extra={})=>({
  typeId:type,location:{x,y,z},dimension:{id:"minecraft:overworld"},
  permutation:{getState(name){
    if(name==="facing_direction")return extra.facing??0;
    if(name==="toggle_bit")return extra.locked??false;
    if(name==="minecraft:cardinal_direction")return extra.cardinal??"east";
  }},
  getComponent(name){if(name!=="minecraft:inventory")return undefined;
    return extra.inv?{container:extra.inv}:undefined;},
  power:extra.power??false
});
function inventory(items=[],size=5){
  return {isValid:true,size,items:[...items],
    getSlot(i){
      return {hasItem:()=>!!this.items[i],
        get typeId(){return this.hasItem()?items[i]?.typeId:undefined;},
        getItem:()=>this.items[i]};
    }
  };
}
function rig({x=0,y=73,z=0,mode="filter",filter="minecraft:cobblestone",
  full=false,side=false,sideType="minecraft:hopper",sideAt="hopper",
  sideDx=1,sideDz=0,sideFacing=0,parallelColumns=0,
  direction=0,locked=false,missing=false,duplicate=false,
  nativeTerminal=false,terminalExtractor=false,terminalType="minecraft:chest",
  terminalInert=false,terminalAir=false,terminalLiquid=false,
  hiddenSorter=false,belowChestHopper=false,mode2="bypass",autoSeed=false}={}){
  const dim="minecraft:overworld",m=new Map();
  const key=(X,Y,Z)=>`${X}|${Y}|${Z}`;
  const set=(b)=>m.set(key(b.location.x,b.location.y,b.location.z),b);
  const rx=mk("hartsorter:receiver",x,y,z);
  const hop=mk("minecraft:hopper",x,y-1,z,{facing:direction,locked});
  const items=full?[{typeId:filter,amount:64,maxAmount:64}]:[];
  const inv1=inventory(items);
  if(nativeTerminal) {
    const dirs={2:{x:0,z:-1},3:{x:0,z:1},4:{x:-1,z:0},5:{x:1,z:0}};
    const off=dirs[direction]??{x:0,z:-1};
    const stop=mk(terminalType,x+off.x,y-1,z+off.z,{
      inv:terminalInert?undefined:inventory()
    });
    stop.isAir=terminalAir;
    stop.isLiquid=terminalLiquid;
    set(stop);
    set(mk(terminalExtractor?"minecraft:hopper":"minecraft:stone",
      x+off.x,y-2,z+off.z));
  }
  const sorter1=mk("hartsorter:sorter",x,y-2,z);
  const sorter2=mk("hartsorter:sorter",x,y-3,z);
  const chest1=mk("minecraft:chest",x+1,y-2,z,{inv:inv1});
  const chest2=mk("minecraft:barrel",x+1,y-3,z,{inv:inventory()});
  for(const b of [rx,hop,sorter1,sorter2,chest1,chest2,
    mk("minecraft:stone",x,y-4,z)])set(b);
  if(side)set(mk(sideType,x+sideDx,sideAt==="receiver"?y:y-1,z+sideDz,{
    facing:sideFacing,inv:sideType==="minecraft:chest" ||
      sideType==="minecraft:barrel" || sideType==="example:active_pipe"
      ?inventory():undefined
  }));
  if(hiddenSorter)set(mk("hartsorter:sorter",x,y-4,z));
  if(belowChestHopper)set(mk("minecraft:hopper",x+1,y-4,z,{facing:0}));
  const owners=[
    {d:dim,x,y:y-3,z,m:mode2,f:{match:{typeId:filter}}},
    {d:dim,x,y:y-2,z,m:mode,f:{match:{typeId:filter}}}
  ];
  const column={d:dim,source:{x,y:y-1,z},sorters:owners};
  const columns=duplicate?[column,{...column}]:[column];
  for(let n=0;n<parallelColumns;n++) {
    const otherX=x+n+10,otherZ=z;
    const other=mk("hartsorter:sorter",otherX,y-2,otherZ);
    set(other);
    columns.push({d:dim,source:{x:otherX,y:y-1,z:otherZ},
      sorters:[{d:dim,x:otherX,y:y-2,z:otherZ,m:"filter",
        f:{match:{typeId:filter}}}]});
  }
  return {receiver:{d:dim,id:`${dim}|${x}|${y}|${z}`,x,y,z},
    output:hop,columns,owners,inv1,inv2:chest2.getComponent("minecraft:inventory").container,
    readBlock(_d,pos){if(missing&&pos.x===x+1&&pos.y===y-1)return undefined;
      return m.get(key(pos.x,pos.y,pos.z))??mk("minecraft:air",pos.x,pos.y,pos.z);},
    modeOf:e=>e.m,
    observeDestination(e,b){
      const a=b.permutation.getState("minecraft:cardinal_direction");
      if(a!=="east")return undefined;
      const dst=m.get(key(e.x+1,e.y,e.z));
      return dst&&["minecraft:chest","minecraft:barrel"].includes(dst.typeId)
        ?{kind:"storage",block:dst}:undefined;
    },
    matches:(item,f)=>item.typeId===f.match.typeId,
    powered:block=>block.power,
    inventory:block=>block.getComponent("minecraft:inventory")?.container,
    autoSeed:(container,item)=>container.items.some(x=>x?.typeId===item.typeId),
    admit(container,item,seedRequired){
      if(seedRequired&&!container.items.some(x=>x?.typeId===item.typeId))return undefined;
      const existing=container.items.find(x=>x?.typeId===item.typeId&&x.amount<64);
      if(existing)return {slot:container.items.indexOf(existing),room:64-existing.amount};
      if(container.items.filter(Boolean).length>=container.size)return undefined;
      return {slot:container.items.length,room:64};
    }};
}
const stone={typeId:"minecraft:cobblestone",amount:1,maxAmount:64};
const dirt={typeId:"minecraft:dirt",amount:1,maxAmount:64};
async function evaluation(config,item=stone){
  const mod=await load();const a=rig(config);
  const outlet=mod.inspectDirectSorterOutlet(a);
  const home=mod.inspectDirectItemHome({...a,outlet,item});
  return {mod,a,outlet,home};
}

test("GO-01 real direct downward Hopper, verified full registered Sorter run, native Filter home",async()=>{
  const {outlet,home}=await evaluation();
  assert.equal(outlet.status,"CLOSED_DIRECT_OUTLET");
  assert.equal(home.status,"HOME_OBSERVED");
  assert.equal(home.tier,"filter");
  assert.equal(home.mayAuthorizeCargo,false);
  assert.equal(home.executePermitted,false);
});
test("GO-02 arbitrary translated placement preserves identical safe local decisions",async()=>{
  const {outlet,home}=await evaluation({x:784,y:112,z:-932});
  assert.equal(outlet.status,"CLOSED_DIRECT_OUTLET");
  assert.equal(home.tier,"filter");
});
test("GO-03 proven nonmatching Auto and no Filter claim allows native Wildcard home",async()=>{
  const {home}=await evaluation({mode:"wildcard",mode2:"auto"},dirt);
  assert.equal(home.status,"HOME_OBSERVED");assert.equal(home.tier,"wildcard");
});
test("GO-04 full matching Filter never becomes a false NO CLAIM and does not leak to Wildcard",async()=>{
  const {mod,a,outlet}=await evaluation({mode:"filter",mode2:"wildcard",full:true});
  // Fill every slot with an exact full Filter seed, while wildcard has room.
  a.inv1.items=Array.from({length:a.inv1.size},()=>({typeId:stone.typeId,amount:64}));
  const home=mod.inspectDirectItemHome({...a,outlet,item:stone});
  assert.equal(home.status,"HOLD");
  assert.equal(home.reason,"claimed_home_full_bulk_authority_unknown");
});
test("GO-05 live-seeded Auto may take item when Filter is exhausted",async()=>{
  const {mod,a,outlet}=await evaluation({mode:"filter",mode2:"auto",full:true});
  a.inv1.items=Array.from({length:a.inv1.size},()=>({typeId:stone.typeId,amount:64}));
  a.inv2.items=[{typeId:stone.typeId,amount:3,maxAmount:64}];
  const home=mod.inspectDirectItemHome({...a,outlet,item:stone});
  assert.equal(home.tier,"auto");
});
test("GO-06 unseeded Auto does not manufacture a claim; Wildcard can accept",async()=>{
  const {home}=await evaluation({mode:"wildcard",mode2:"auto"},dirt);
  assert.equal(home.tier,"wildcard");
});
test("GO-07 unknown Auto seed HOLDs; it is not a negative claim",async()=>{
  const {mod,a,outlet}=await evaluation({mode:"wildcard",mode2:"auto"},dirt);
  const home=mod.inspectDirectItemHome({...a,outlet,item:dirt,autoSeed:()=>undefined});
  assert.equal(home.status,"HOLD");assert.equal(home.reason,"claim_or_native_capacity_unknown");
});
test("GO-08 non-stackable native MR stays outside count-only home adapter",async()=>{
  const {home}=await evaluation({}, {typeId:"minecraft:diamond_sword",maxAmount:1,amount:1});
  assert.equal(home.status,"HOLD");assert.equal(home.reason,"native_metadata_custody_required");
});
for(const [name,config,reason] of [
  ["foreign active side inventory",{side:true,sideType:"example:active_pipe"},"foreign_side_inventory_boundary"],
  ["side Hopper direction unknown",{side:true,sideFacing:"unknown"},"adjacent_hopper_direction_unknown"],
  ["missing chunk",{missing:true},"side_block_unavailable"],
  ["unverified lateral output",{direction:5},"output_hopper_not_downward_or_terminal"],
  ["redstone powered",{locked:true},"output_hopper_locked_or_unknown"],
  ["duplicate column",{duplicate:true},"source_column_not_unique"],
  ["unregistered hidden Sorter",{hiddenSorter:true},"sorter_run_boundary_unknown"],
  ["Hopper extracting from output storage",{belowChestHopper:true,mode2:"filter"},"storage_hopper_extractor_present"],
  ["duplicate source with competing output",{duplicate:true},"source_column_not_unique"]
]){
  test("GO-09 fail-closed "+name,async()=>{
    const {outlet,home}=await evaluation(config);
    assert.equal(outlet.status,"HOLD");assert.equal(outlet.reason,reason);
    assert.equal(home.status,"HOLD");
  });
}

test("GO-17 all four sides at both Receiver/Hopper heights permit passive chest/barrel neighbors",async()=>{
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    for(const sideAt of ["receiver","hopper"]) {
      for(const sideType of ["minecraft:chest","minecraft:barrel"]) {
        const {outlet,home}=await evaluation({side:true,sideDx:dx,sideDz:dz,sideAt,sideType});
        assert.equal(outlet.status,"CLOSED_DIRECT_OUTLET",
          sideType+" at "+sideAt+" "+dx+","+dz+" "+outlet.reason);
        assert.equal(home.status,"HOME_OBSERVED");
        assert.equal(home.tier,"filter");
      }
    }
  }
});

test("GO-18 neighboring native Hopper direction is NOT another outlet of downward source Hopper",async()=>{
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    for(const sideAt of ["receiver","hopper"]) {
      for(const sideFacing of [0,1,2,3,4,5]) {
        const {outlet,home}=await evaluation({side:true,sideDx:dx,sideDz:dz,sideAt,sideFacing});
        assert.equal(outlet.status,"CLOSED_DIRECT_OUTLET",
          "adjacent Hopper "+dx+","+dz+" at "+sideAt+" dir "+sideFacing+" "+outlet.reason);
        assert.equal(home.status,"HOME_OBSERVED");
      }
    }
  }
});

test("GO-19 registered parallel columns, nearby Hart blocks and dense bank layouts are not phantom side outputs",async()=>{
  for(const sideType of [
    "hartsorter:sorter","hartsorter:transporter","hartsorter:collector",
    "hartsorter:receiver","hartsorter:bulk_storage"
  ]) {
    const {outlet,home}=await evaluation({
      side:true,sideType,parallelColumns:101
    });
    assert.equal(outlet.status,"CLOSED_DIRECT_OUTLET",sideType+" "+outlet.reason);
    assert.equal(home.status,"HOME_OBSERVED");
  }
});

test("GO-20 actual native downstream extraction still HOLDs despite harmless neighboring inventory",async()=>{
  const {outlet,home}=await evaluation({
    side:true,sideType:"minecraft:chest",belowChestHopper:true,mode2:"filter"
  });
  assert.equal(outlet.status,"HOLD");
  assert.equal(outlet.reason,"storage_hopper_extractor_present");
  assert.equal(home.status,"HOLD");
});


test("GO-21 native Hopper points north into positively witnessed passive terminal but Q4 must select Sorter Filter home",async()=>{
  const {outlet,home}=await evaluation({direction:2,nativeTerminal:true});
  assert.equal(outlet.status,"CLOSED_DIRECT_OUTLET");
  assert.equal(outlet.directToClaimedHome,true);
  assert.equal(outlet.nativeTerminal.location.y,72);
  assert.equal(outlet.nativeTerminal.location.z,-1);
  assert.equal(home.status,"HOME_OBSERVED");
  assert.equal(home.tier,"filter");
  assert.notEqual(outlet.nativeTerminal,outlet.owners.find(o=>o.entry===home.owner).destination);
});

test("GO-22 a lateral output pointing into unverified or actively extracted storage must HOLD",async()=>{
  for(const opts of [
    {direction:2},
    {direction:2,nativeTerminal:true,terminalType:"minecraft:stone"},
    {direction:2,nativeTerminal:true,terminalExtractor:true}
  ]){
    const {outlet,home}=await evaluation(opts);
    assert.equal(outlet.status,"HOLD",JSON.stringify(opts));
    assert.equal(home.status,"HOLD");
  }
});

test("GO-10 no ItemStack or Block can be retained in a durable custody plan",async()=>{
  const {outlet,home}=await evaluation();
  assert.equal(outlet.persistPermitted,false);
  assert.equal(outlet.mayAuthorizeCargo,false);
  assert.equal(home.executePermitted,false);
});
test("GO-11 source integration retains exactly one journaled Q4 discharge authority",()=>{
  const s=fs.readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");
  assert.match(s,/inspectDirectSorterOutlet\(/);
  assert.match(s,/inspectDirectItemHome\(/);
  assert.match(s,/from receiver "\+receiver\.id\+"\]"/);
  assert.match(s,/dequeueToReceiver\(receiver, output, budget, governedLane\)/);
  assert.match(s,/governedLane!=="DIRECT_NATIVE_SORTER"/);
  assert.match(s,/saveQueueJournal\(tx\);/);
  assert.match(s,/persistQueueMeta\(receiver, q, metaAfter\);/);
  assert.match(s,/output\.container\.setItem\(tx\.dstSlot, moved\)/);
  assert.match(s,/if\(directClosed\)continue;/);
});

function extractMainFunction(name,scope){
  const src=fs.readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");
  const start=src.indexOf("function "+name+"(");
  assert.ok(start>=0,"Required shipping function "+name);
  const end=src.indexOf("\nfunction ",start+1);
  return vm.runInNewContext("("+src.slice(start,end<0?src.length:end).trim()+"\n)",scope);
}
function linkFixture({first,second,forceFresh=false}){
  const receiver={id:"minecraft:overworld|0|73|0",
    d:"minecraft:overworld",x:0,y:73,z:0};
  const collector={id:"C",link:receiver.id};
  const base={decision:"HOLD",reason:"unverified_native_supply_boundary",
    sourceReachableUnknownCount:1,
    observationReason:"unsupported_native_boundary [hartsorter:sorter @ minecraft:overworld 0,71,0 from receiver "+receiver.id+"]"};
  const seen=[],outlets=[];
  const scope={
    logistics:{collectors:[collector],receivers:[receiver]},
    liveTopologyBlockReader:()=>undefined,
    activeLogisticsPass:undefined,
    isKnownInertNativeStop:()=>false,
    system:{currentTick:9},
    liveLinkGuard:{check(args){
      seen.push(args.forceFresh);
      return seen.length===1?(first??base):(second??base);
    }},
    directSorterOutlet(r){
      outlets.push(r.id);
      return {status:"CLOSED_DIRECT_OUTLET"};
    }
  };
  const run=extractMainFunction("liveLinkCheck",scope);
  return {receiver,collector,base,seen,outlets,verdict:run(collector,receiver,forceFresh)};
}
test("GO-12 only fresh exactly ONE source-reachable native boundary of THIS Receiver can promote direct lane",()=>{
  const f=linkFixture({});
  assert.equal(f.verdict.decision,"SAFE_SNAPSHOT");
  assert.equal(f.verdict.routeKind,"DIRECT_NATIVE_SORTER");
  assert.deepEqual(f.seen,[false,true]);
  assert.equal(f.outlets.length,1);
  assert.equal(f.verdict.executePermitted,false);
});
test("GO-13 an unrelated Receiver native issue cannot authorize this Receiver",()=>{
  const f=linkFixture({first:{
    decision:"HOLD",reason:"unverified_native_supply_boundary",
    sourceReachableUnknownCount:1,
    observationReason:"unsupported_native_boundary [hartsorter:sorter @ minecraft:overworld 0,71,0 from receiver OTHER]"
  }});
  assert.equal(f.verdict.decision,"HOLD");
  assert.deepEqual(f.seen,[false]);assert.equal(f.outlets.length,0);
});
test("GO-14 second source-reachable native unknown cannot be hidden behind a Sorter",()=>{
  const f=linkFixture({first:{
    decision:"HOLD",reason:"unverified_native_supply_boundary",
    sourceReachableUnknownCount:2,
    observationReason:"unsupported_native_boundary [hartsorter:sorter @ minecraft:overworld 0,71,0 from receiver minecraft:overworld|0|73|0]"
  }});
  assert.equal(f.verdict.decision,"HOLD");assert.equal(f.outlets.length,0);
});
test("GO-15 a fresh cycle discovered after a prior negative HOLD must preserve REJECT",()=>{
  const f=linkFixture({second:{decision:"REJECT",reason:"cycle"}});
  assert.equal(f.verdict.decision,"REJECT");
  assert.deepEqual(f.seen,[false,true]);assert.equal(f.outlets.length,0);
});
test("GO-16 forced user-link validation does one fresh graph scan, never cached positive",()=>{
  const f=linkFixture({forceFresh:true});
  assert.equal(f.verdict.decision,"SAFE_SNAPSHOT");
  assert.deepEqual(f.seen,[true]);assert.equal(f.outlets.length,1);
});

test("GO-23 native chest boundary must match THIS Receiver's exact directed Hopper output",()=>{
  const receiverId="minecraft:overworld|0|73|0";
  const issue={
    decision:"HOLD",reason:"unverified_native_supply_boundary",
    sourceReachableUnknownCount:1,
    observationReason:"unsupported_native_boundary [minecraft:chest @ minecraft:overworld 0,72,-1 from receiver "+receiverId+"]"
  };
  const receiver={id:receiverId,d:"minecraft:overworld",x:0,y:73,z:0};
  const collector={id:"C",link:receiver.id};
  const oldLink=extractMainFunction("liveLinkCheck",{
    logistics:{collectors:[collector],receivers:[receiver]},
    liveTopologyBlockReader:()=>undefined,
    activeLogisticsPass:undefined,system:{currentTick:7},
    isKnownInertNativeStop:()=>false,
    dirty:false,columns:[{d:"minecraft:overworld",source:{x:0,y:72,z:0}}],
    liveLinkGuard:{check(){return issue;}},
    directSorterOutlet(){return {status:"CLOSED_DIRECT_OUTLET",
      nativeTerminal:{typeId:"minecraft:chest",location:{x:0,y:72,z:-1}}};}
  });
  assert.equal(oldLink(collector,receiver).routeKind,"DIRECT_NATIVE_SORTER");
});

test("GO-24 a nearby unconnected chest, mismatched terminal coordinates, or second unknown cannot certify a native route",()=>{
  for(const [reason,count] of [
    ["unsupported_native_boundary [minecraft:chest @ minecraft:overworld 1,72,-1 from receiver minecraft:overworld|0|73|0]",1],
    ["unsupported_native_boundary [minecraft:chest @ minecraft:overworld 0,72,-1 from receiver minecraft:overworld|0|73|0]",2]
  ]) {
    const receiver={id:"minecraft:overworld|0|73|0",d:"minecraft:overworld",x:0,y:73,z:0};
    const collector={id:"C",link:receiver.id};
    const run=extractMainFunction("liveLinkCheck",{
      logistics:{collectors:[collector],receivers:[receiver]},
      liveTopologyBlockReader:()=>undefined,activeLogisticsPass:undefined,
      system:{currentTick:7},
      isKnownInertNativeStop:()=>false,
      dirty:false,columns:[{d:"minecraft:overworld",source:{x:0,y:72,z:0}}],
      liveLinkGuard:{check(){return {decision:"HOLD",reason:"unverified_native_supply_boundary",
        sourceReachableUnknownCount:count,observationReason:reason};}},
      directSorterOutlet(){return {status:"CLOSED_DIRECT_OUTLET",
        nativeTerminal:{typeId:"minecraft:chest",location:{x:0,y:72,z:-1}}};}
    });
    assert.equal(run(collector,receiver).decision,"HOLD");
  }
});

test("GO-25 unrelated terminal chests without a registered local column do NOT trigger a second global graph scan",()=>{
  const receiver={id:"minecraft:overworld|0|73|0",d:"minecraft:overworld",x:0,y:73,z:0};
  const collector={id:"C",link:receiver.id};
  let observed=0,expensive=0;
  const run=extractMainFunction("liveLinkCheck",{
    logistics:{collectors:[collector],receivers:[receiver]},
    activeLogisticsPass:undefined,system:{currentTick:17},
    isKnownInertNativeStop:()=>false,
    liveTopologyBlockReader:()=>undefined,dirty:false,columns:[],
    liveLinkGuard:{check(){observed++;return {decision:"HOLD",
      reason:"unverified_native_supply_boundary",
      sourceReachableUnknownCount:1,
      observationReason:"unsupported_native_boundary [minecraft:chest @ minecraft:overworld 0,72,-1 from receiver "+receiver.id+"]"};}},
    directSorterOutlet(){expensive++;throw Error("should not inspect outlet");}
  });
  assert.equal(run(collector,receiver).decision,"HOLD");
  assert.equal(observed,1);
  assert.equal(expensive,0);
});
