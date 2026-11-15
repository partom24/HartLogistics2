/**
 * Native-first LEVEL 2 SOURCE-ONLY semantics that any native operation must
 * preserve. Execute functions extracted from immutable owner-supplied 1.4.1.
 * Does not simulate correctness of Bedrock's Container.transferItem/moveItem.
 * Run in CI with node --test. No world, BDS, or 1.5 assets are accessed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const js = fs.readFileSync(path.join(base,"addon/behavior_pack/scripts/main.js"), "utf8");
function source(name, globals={}) {
  const re=new RegExp("(^|\\n)[ \\t]*function\\s+"+name+"\\s*\\(","g");
  const hit=re.exec(js);
  assert.ok(hit, "missing canonical function: "+name);
  const from=js.indexOf("function "+name,hit.index);
  const brace=js.indexOf("{",from);
  let depth=0,quote="",esc=false,line=false,block=false;
  for(let i=brace;i<js.length;i++){
    const c=js[i],n=js[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(esc){esc=false;continue;}if(c==="\\"){esc=true;continue;}if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==="\x60"){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0)
      return vm.runInNewContext(js.slice(from,i+1)+"\n"+name+";", globals,
        {filename:"canonical-1.4.1:"+name,timeout:2000});
  }
  throw Error("unterminated "+name);
}
const json = x=>JSON.parse(JSON.stringify(x));
const stack=(typeId, amount=1, enchantments=[])=>({typeId,amount,ench:enchantments});
function inventory(items,read=()=>{}) {
  return {isValid:true,size:items.length,getItem(i){read(i);return items[i];}};
}
function autoContext(inv) {
  return {destinationFor:()=>({kind:"storage",container:inv}),
    enchantments:s=>s.ench || []};
}

test("NATIVE-M07-01: AUTO accepts same native type ID despite different names or lore",()=>{
  const seeded={typeId:"minecraft:stone",nameTag:"Seed",getLore:()=>["seed"]};
  const candidate={typeId:"minecraft:stone",nameTag:"Different",getLore:()=>["other"]};
  const fn=source("autoSorterMatches",autoContext(inventory([seeded])));
  assert.equal(fn(candidate,{m:"auto"}),true);
  // Any future use of Container.contains(ItemStack) must prove that exact
  // behavior rather than impose metadata/stackability as the AUTO rule.
});

test("NATIVE-M07-02: AUTO changes instantly when last seed disappears",()=>{
  const slots=[{typeId:"minecraft:stone"}];
  const fn=source("autoSorterMatches",autoContext(inventory(slots)));
  assert.equal(fn({typeId:"minecraft:stone"},{m:"auto"}),true);
  slots[0]=undefined;
  assert.equal(fn({typeId:"minecraft:stone"},{m:"auto"}),false);
});

test("NATIVE-M07-03: AUTO accepts an enchanted-book type SET regardless of level/order",()=>{
  const seed=stack("minecraft:enchanted_book",1,[{id:"minecraft:sharpness",level:1},{id:"minecraft:mending",level:1}]);
  const incoming=stack("minecraft:enchanted_book",1,[{id:"minecraft:mending",level:1},{id:"minecraft:sharpness",level:5}]);
  const fn=source("autoSorterMatches",autoContext(inventory([seed])));
  assert.equal(fn(incoming,{}),true);
});

test("NATIVE-M07-04: AUTO rejects same book type with different enchantment type sets",()=>{
  const seed=stack("minecraft:enchanted_book",1,[{id:"minecraft:sharpness",level:1}]);
  const incoming=stack("minecraft:enchanted_book",1,[{id:"minecraft:mending",level:1}]);
  const fn=source("autoSorterMatches",autoContext(inventory([seed])));
  assert.equal(fn(incoming,{}),false);
});

test("NATIVE-M07-05: AUTO does not accept a Collector or a missing/invalid destination",()=>{
  const fnCollector=source("autoSorterMatches",{destinationFor:()=>({kind:"collector"}),enchantments:()=>[]});
  const fnInvalid=source("autoSorterMatches",{destinationFor:()=>({kind:"storage",container:{isValid:false}}),enchantments:()=>[]});
  assert.equal(fnCollector({typeId:"minecraft:stone"},{}),false);
  assert.equal(fnInvalid({typeId:"minecraft:stone"},{}),false);
});

test("NATIVE-M07-06: AUTO seeds require live slot reads and have an O(D) worst-case",()=>{
  const slots=Array.from({length:54},(_,i)=>i===53?{typeId:"minecraft:stone"}:{typeId:"minecraft:dirt"});
  let reads=0;
  const fn=source("autoSorterMatches",autoContext(inventory(slots,()=>reads++)));
  assert.equal(fn({typeId:"minecraft:stone"},{}),true);
  assert.equal(reads,54);
});

test("NATIVE-M04-01: canonical Hopper compaction preserves remaining item order",()=>{
  const slots=[undefined,{typeId:"minecraft:a",amount:4},undefined,{typeId:"minecraft:b",amount:2},undefined];
  const events=[];
  const inv={size:slots.length,getItem:i=>slots[i],
    setItem:(i,value)=>{events.push([i,value?.typeId??"empty"]);slots[i]=value;}};
  source("compactSourceHopper") (inv);
  assert.deepEqual(slots.map(x=>x?.typeId??"-"),["minecraft:a","minecraft:b","-","-","-"]);
  assert.deepEqual(events,[[0,"minecraft:a"],[1,"empty"],[1,"minecraft:b"],[3,"empty"]]);
  // Native moveItem/swapItems behavior on occupied slots has NOT been tested.
});

test("NATIVE-M04-02: full native Hopper compaction does not write when already packed",()=>{
  const items=[{typeId:"minecraft:a"},{typeId:"minecraft:b"},undefined,undefined,undefined];
  let writes=0;
  source("compactSourceHopper")({size:items.length,getItem:i=>items[i],setItem:()=>writes++});
  assert.equal(writes,0);
});

test("NATIVE-M19-01: Collector only admits native Hoppers whose output faces Collector",()=>{
  const c={x:0,y:64,z:0,d:"overworld"};
  const byLoc=new Map();
  const key=v=>[v.x,v.y,v.z].join(",");
  function put(loc,typeId,facingDirection) {
    const block={
      typeId,location:loc,
      permutation:{getState:n=>n==="facing_direction"?facingDirection:0},
      getComponent:n=>n==="minecraft:inventory"?{container:{isValid:true,size:5}}:undefined
    };
    byLoc.set(key(loc),block);
  }
  // Above Hopper at y=65 faces down (1); west Hopper at x=-1 faces east (5).
  put({x:0,y:65,z:0},"minecraft:hopper",1);
  put({x:-1,y:64,z:0},"minecraft:hopper",5);
  // East Hopper faces east, away from the Collector.
  put({x:1,y:64,z:0},"minecraft:hopper",5);
  // Dropper output faces Collector but is deliberately excluded from direct polling.
  put({x:0,y:64,z:1},"minecraft:dropper",2);
  const colBlock={dimension:{getBlock:loc=>byLoc.get(key(loc))}};
  const fn=source("collectorInputSources",{
    collectorAt:()=>colBlock,
    hopperOutputOffset:source("hopperOutputOffset"),
    blockContainer:b=>b.getComponent("minecraft:inventory")?.container,
    hopperIsRedstoneLocked:()=>false
  });
  const origins=fn(c).map(x=>x.block.location);
  assert.deepEqual(json(origins),[{x:0,y:65,z:0},{x:-1,y:64,z:0}]);
});

test("NATIVE-M20-01: Receiver output is native Hopper directly below or unavailable",()=>{
  const e={x:1,y:70,z:1,d:"overworld"};
  let typeId="minecraft:hopper";
  const receiver={dimension:{getBlock:()=>({typeId})}};
  const fn=source("receiverOutputHopper",{
    receiverAt:()=>receiver,
    blockContainer:()=>({isValid:true,size:5}),
    hopperIsRedstoneLocked:()=>false
  });
  assert.equal(fn(e).container.size,5);
  typeId="minecraft:barrel";
  assert.equal(fn(e),undefined);
});

test("NATIVE-M20-02: Receiver drain honours native output Hopper lock and Hart redstone",()=>{
  let reads=0;
  const fn=source("processReceiverDrain",{
    RECEIVER_BATCH:16,
    receiverAt:()=>({}),
    blockIsRedstonePowered:()=>false,
    receiverOutputHopper:()=>({locked:true,container:{isValid:true}}),
    loadReceiverQueue:()=>{reads++;return {total:100};},
    dequeueToReceiver:()=>{throw Error("should not drain a locked output");},
    log:()=>{}
  });
  assert.equal(fn({id:"Receiver"},256),0);
  assert.equal(reads,0);
});

test("NATIVE-M20-03: Receiver drain batches at 16 without claiming native Hopper throughput",()=>{
  let total=100,admitted=0;
  const fn=source("processReceiverDrain",{
    RECEIVER_BATCH:16,
    receiverAt:()=>({}),
    blockIsRedstonePowered:()=>false,
    receiverOutputHopper:()=>({locked:false}),
    loadReceiverQueue:()=>({total}),
    dequeueToReceiver:(_e,_o,budget)=>{
      const n=Math.min(total,budget,5);
      total-=n;admitted+=n;return n;
    },
    log:()=>{}
  });
  assert.equal(fn({id:"Receiver"},256),16);
  assert.equal(admitted,16);
  assert.equal(total,84);
});

test("NATIVE-M02-01: topology keeps separated vertical columns distinct",()=>{
  const registry=[{d:"overworld",x:2,z:3,y:70},{d:"overworld",x:2,z:3,y:71},
    {d:"overworld",x:2,z:3,y:75}];
  const state={registry,columns:[],rrStart:0,dirty:true};
  source("rebuildTopology",state)();
  assert.deepEqual(json(state.columns.map(c=>c.sorters.map(e=>e.y))),[[70,71],[75]]);
});

test("NATIVE-M28-01: nonexistent Sorter mode preserves original filter fallback",()=>{
  const fn=source("sorterMode",{SORTER_MODES:["wildcard","filter","auto","bypass"]});
  assert.equal(fn({m:"invalid",f:{id:"minecraft:dirt"}}),"filter");
  assert.equal(fn({m:undefined,f:undefined}),"wildcard");
  assert.equal(fn({m:"bypass",f:{id:"minecraft:dirt"}}),"bypass");
});
