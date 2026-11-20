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
  full=false,side=false,sideType="minecraft:hopper",
  direction=0,locked=false,missing=false,duplicate=false,
  hiddenSorter=false,mode2="bypass",autoSeed=false}={}){
  const dim="minecraft:overworld",m=new Map();
  const key=(X,Y,Z)=>`${X}|${Y}|${Z}`;
  const set=(b)=>m.set(key(b.location.x,b.location.y,b.location.z),b);
  const rx=mk("hartsorter:receiver",x,y,z);
  const hop=mk("minecraft:hopper",x,y-1,z,{facing:direction,locked});
  const items=full?[{typeId:filter,amount:64,maxAmount:64}]:[];
  const inv1=inventory(items);
  const sorter1=mk("hartsorter:sorter",x,y-2,z);
  const sorter2=mk("hartsorter:sorter",x,y-3,z);
  const chest1=mk("minecraft:chest",x+1,y-2,z,{inv:inv1});
  const chest2=mk("minecraft:barrel",x+1,y-3,z,{inv:inventory()});
  for(const b of [rx,hop,sorter1,sorter2,chest1,chest2,
    mk("minecraft:stone",x,y-4,z)])set(b);
  if(side)set(mk(sideType,x+1,y-1,z,{inv:sideType==="minecraft:chest"?inventory():undefined}));
  if(hiddenSorter)set(mk("hartsorter:sorter",x,y-4,z));
  const owners=[
    {d:dim,x,y:y-3,z,m:mode2,f:{match:{typeId:filter}}},
    {d:dim,x,y:y-2,z,m:mode,f:{match:{typeId:filter}}}
  ];
  const column={d:dim,source:{x,y:y-1,z},sorters:owners};
  const columns=duplicate?[column,{...column}]:[column];
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
  ["side Hopper",{side:true},"side_managed_or_native_route"],
  ["side Transporter",{side:true,sideType:"hartsorter:transporter"},"side_managed_or_native_route"],
  ["missing chunk",{missing:true},"side_block_unavailable"],
  ["not-down facing",{direction:5},"output_hopper_not_downward"],
  ["redstone powered",{locked:true},"output_hopper_locked_or_unknown"],
  ["duplicate column",{duplicate:true},"source_column_not_unique"],
  ["unregistered hidden Sorter",{hiddenSorter:true},"sorter_run_boundary_unknown"],
  ["foreign inventory",{side:true,sideType:"minecraft:chest"},"side_inventory_boundary"]
]){
  test("GO-09 fail-closed "+name,async()=>{
    const {outlet,home}=await evaluation(config);
    assert.equal(outlet.status,"HOLD");assert.equal(outlet.reason,reason);
    assert.equal(home.status,"HOLD");
  });
}
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
  assert.match(s,/dequeueToReceiver\(receiver, output, budget, governedLane\)/);
  assert.match(s,/if \(governedLane!=="DIRECT_NATIVE_SORTER" \|\|/);
  assert.match(s,/saveQueueJournal\(tx\);/);
  assert.match(s,/persistQueueMeta\(receiver, q, metaAfter\);/);
  assert.match(s,/output\.container\.setItem\(tx\.dstSlot, moved\)/);
  assert.match(s,/if\(directClosed\)continue;/);
});
