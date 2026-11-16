/**
 * Phase A P2: actual engine-source live AUTO admission tests.
 * Native-shaped mocks, not BDS/TPS acceptance.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const JS=fs.readFileSync(path.join(ROOT,"addon/behavior_pack/scripts/main.js"),"utf8");

function source(name, globals={}) {
  const start=JS.indexOf("function "+name+"(");
  assert.ok(start>=0,"Source function missing: "+name);
  const brace=JS.indexOf("{",start);
  let depth=0,quote="",escaped=false,line=false,block=false;
  for(let i=brace;i<JS.length;i++) {
    const c=JS[i],n=JS[i+1];
    if(line){if(c==="\n")line=false;continue;}
    if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;}if(c==="\\"){escaped=true;continue;}if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;}
    if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
    if(c==="{")depth++;
    if(c==="}"&&--depth===0) {
      return vm.runInNewContext(JS.slice(start,i+1)+"\n"+name+";",globals,
        {filename:"p2-source:"+name,timeout:2500});
    }
  }
  throw new Error("Unbalanced source function "+name);
}
const item=(typeId,amount=1,meta="",maxAmount=64,ench=[])=>({typeId,amount,meta,maxAmount,ench});
const nativeEnchantments=s=>s.ench??[];
function inventory(items) {
  const calls={reads:0,size:0,empty:0,compare:0,writes:0,slots:0};
  const container={
    isValid:true,
    get size(){calls.size++;return items.length;},
    getItem(i){
      calls.reads++;
      const cur=items[i];
      if(!cur)return undefined;
      return {...cur,isStackableWith(other){
        calls.compare++;
        if(cur.throwCompare)throw Error("comparison unavailable");
        return cur.typeId===other.typeId&&cur.meta===other.meta&&cur.maxAmount>1;
      }};
    },
    getSlot(i){
      calls.slots++;
      return {
        hasItem(){return !!items[i];},
        get typeId(){return items[i]?.typeId;},
        get amount(){return items[i]?.amount;},
        get maxAmount(){return items[i]?.maxAmount;},
        getItem(){calls.reads++;return items[i]&&{...items[i]};},
        isStackableWith(other){
          calls.compare++;
          const cur=items[i];
          if(cur.throwCompare)throw Error("native slot comparison unavailable");
          return cur.typeId===other.typeId&&cur.meta===other.meta&&cur.maxAmount>1;
        }
      };
    },
    setItem(i,stack){calls.writes++;items[i]=stack;},
    firstItem(){let i=items.findIndex(Boolean);return i<0?undefined:i;},
    firstEmptySlot(){calls.empty++;let i=items.findIndex(x=>!x);return i<0?undefined:i;}
  };
  return {container,items,calls};
}
const find=source("findAcceptSlot",{enchantments:nativeEnchantments});

test("P2-01 AUTO cannot take an unseeded chest even if empty space exists",()=>{
  const d=inventory([item("minecraft:stone",3),undefined]);
  assert.equal(find(d.container,item("minecraft:feather"),true),undefined);
  assert.equal(d.calls.size,1);assert.equal(d.calls.slots,2);assert.equal(d.calls.reads,0);
});
test("P2-02 AUTO uses one live scan to find seed and compatible partial before earlier empty",()=>{
  const d=inventory([undefined,item("minecraft:feather",12,"other"),item("minecraft:feather",51)]);
  const slot=find(d.container,item("minecraft:feather",5),true);
  assert.equal(slot.slot,2);assert.equal(slot.room,13);
  assert.equal(d.calls.size,1);assert.equal(d.calls.slots,3);assert.equal(d.calls.reads,1);
  assert.equal(d.calls.compare,2);
});
test("P2-03 AUTO seed may be metadata-incompatible; use first empty, not unsafe merge",()=>{
  const d=inventory([item("minecraft:feather",12,"renamed"),undefined,item("minecraft:dirt")]);
  const slot=find(d.container,item("minecraft:feather"),true);
  assert.equal(slot.slot,1);assert.equal(slot.before,0);
  assert.equal(d.calls.compare,1);
});
test("P2-04 fully occupied matching seed does not give phantom capacity",()=>{
  const d=inventory([item("minecraft:feather",64),item("minecraft:stone",64)]);
  assert.equal(find(d.container,item("minecraft:feather"),true),undefined);
  assert.equal(d.calls.compare,0);
});
test("P2-05 full matching seed plus earlier empty uses first empty",()=>{
  const d=inventory([undefined,item("minecraft:feather",64)]);
  const slot=find(d.container,item("minecraft:feather"),true);
  assert.equal(slot.slot,0);
  assert.equal(d.calls.size,1);
});
test("P2-06 native nonstackable AUTO admission still requires a seed",()=>{
  const d=inventory([item("minecraft:diamond_sword",1,"named",1),undefined]);
  const slot=find(d.container,item("minecraft:diamond_sword",1,"different",1),true);
  assert.equal(slot.slot,1);assert.equal(slot.room,1);
  assert.equal(d.calls.empty,1);assert.equal(d.calls.compare,0);
  d.items[0]=undefined;
  assert.equal(find(d.container,item("minecraft:diamond_sword",1,"different",1),true),undefined);
});
test("P2-07 book AUTO matches enchantment type sets, not order or level",()=>{
  const book=(e)=>item("minecraft:enchanted_book",1,"",1,e);
  const d=inventory([book([{id:"sharpness",level:1},{id:"mending",level:1}]),undefined]);
  assert.equal(find(d.container,book([{id:"mending",level:3},{id:"sharpness",level:5}]),true).slot,1);
  assert.equal(find(d.container,book([{id:"fortune",level:1}]),true),undefined);
});
test("P2-08 AUTO reacts immediately to last seed removal; no cached eligibility",()=>{
  const d=inventory([item("minecraft:feather"),undefined]);
  assert.equal(find(d.container,item("minecraft:feather"),true).slot,0);
  d.items[0]=undefined;
  assert.equal(find(d.container,item("minecraft:feather"),true),undefined);
});
test("P2-09 non-AUTO still needs no seed; selection unchanged",()=>{
  const d=inventory([undefined,item("minecraft:stone",10)]);
  assert.equal(find(d.container,item("minecraft:feather"),false).slot,0);
  assert.equal(find(d.container,item("minecraft:stone"),false).slot,1);
});
test("P2-10 one 54-slot AUTO scan is sufficient for late seed and partial admission",()=>{
  const d=inventory([...Array.from({length:53},()=>item("minecraft:stone",64)),item("minecraft:feather",55)]);
  const slot=find(d.container,item("minecraft:feather"),true);
  assert.equal(slot.slot,53);assert.equal(slot.room,9);
  assert.equal(d.calls.slots,54);assert.equal(d.calls.reads,1);assert.equal(d.calls.size,1);
});

function route({sourceItem=item("minecraft:feather",4),sorters,storage}) {
  const src=inventory([sourceItem,undefined,undefined,undefined,undefined]);
  const targets=Object.fromEntries(Object.entries(storage).map(([key,value])=>[key,inventory(value)]));
  const seen=[];
  const sourceBlock={typeId:"minecraft:hopper",getComponent:()=>({container:src.container})};
  const destinationFor=e=>{
    seen.push("destination:"+e.id);
    if(e.collector) return {kind:"collector",block:{},collector:{}};
    const d=targets[e.id];return d&&{kind:"storage",container:d.container,block:{id:e.id}};
  };
  const safeMovePartial=(inC,_source,slot,outC,_dest,place,want)=>{
    const from=inC.getItem(slot);
    const n=Math.min(want,place.room,from.amount);
    const existing=outC.getItem(place.slot);
    outC.setItem(place.slot,{...from,amount:n+(existing?.amount??0)});
    inC.setItem(slot,n===from.amount?undefined:{...from,amount:from.amount-n});
    return n;
  };
  const env={
    getDimension:()=>({getBlock:()=>sourceBlock}),PER_COLUMN_BATCH:16,
    hopperIsRedstoneLocked:()=>false,sorterAt:()=>({}),
    blockIsRedstonePowered:()=>false,sorterMode:e=>e.mode,
    matchesFilter:(s,f)=>s.typeId===f.typeId,
    autoSorterMatches:()=>{throw Error("obsolete duplicate AUTO inventory scan invoked");},
    compactSourceHopper:source("compactSourceHopper"),
    destinationFor,findAcceptSlot:find,safeMovePartial,
    sorterCollectorRoute:()=>{throw Error("AUTO should not route to collector");},
    log:()=>{}
  };
  const process=source("processColumn",env);
  const used=process({d:"overworld",x:0,z:0,source:{x:0,y:70,z:0},sorters},256);
  return {used,src,targets,seen};
}
test("P2-11 matching Filter transfers before AUTO without reading the AUTO chest",()=>{
  const r=route({
    sorters:[{id:"filter",mode:"filter",f:{typeId:"minecraft:feather"}},
      {id:"auto",mode:"auto"}],
    storage:{filter:[undefined],auto:[item("minecraft:feather",10),undefined]}
  });
  assert.equal(r.used,4);assert.equal(r.targets.filter.items[0].amount,4);
  assert.equal(r.targets.auto.calls.reads,0);
  assert.equal(r.seen.filter(s=>s==="destination:auto").length,0);
});
test("P2-12 a full Filter falls back to a live seeded AUTO using one destination scan",()=>{
  const r=route({
    sorters:[{id:"filter",mode:"filter",f:{typeId:"minecraft:feather"}},
      {id:"auto",mode:"auto"},{id:"wild",mode:"wildcard"}],
    storage:{filter:[item("minecraft:dirt",64)],auto:[item("minecraft:feather",10)],
      wild:[undefined]}
  });
  assert.equal(r.used,4);assert.equal(r.targets.auto.items[0].amount,14);
  assert.equal(r.targets.auto.calls.size,1);
  assert.equal(r.targets.auto.calls.reads,2); // one admission scan, one credit read in synthetic move
  assert.equal(r.targets.wild.calls.reads,0);
});
test("P2-13 unseeded AUTO falls through to Wildcard and never becomes wildcard itself",()=>{
  const r=route({
    sorters:[{id:"auto",mode:"auto"},{id:"wild",mode:"wildcard"}],
    storage:{auto:[item("minecraft:dirt",64),undefined],wild:[undefined]}
  });
  assert.equal(r.used,4);assert.equal(r.targets.auto.items[1],undefined);
  assert.equal(r.targets.wild.items[0].amount,4);
  assert.equal(r.targets.auto.calls.reads,0);
  assert.equal(r.targets.auto.calls.slots,2);
});
test("P2-14 AUTO ignores a Collector and leaves Collector egress to the correct route",()=>{
  const r=route({
    sorters:[{id:"auto",mode:"auto",collector:true},{id:"wild",mode:"wildcard"}],
    storage:{wild:[undefined]}
  });
  assert.equal(r.used,4);assert.equal(r.targets.wild.items[0].amount,4);
});

test("P3-01 54 unrelated full slots use native views with zero ItemStack copies",()=>{
  const d=inventory(Array.from({length:54},()=>item("minecraft:stone",64)));
  assert.equal(find(d.container,item("minecraft:feather"),true),undefined);
  assert.equal(d.calls.slots,54);assert.equal(d.calls.reads,0);
  assert.equal(d.calls.compare,0);
});
test("P3-02 matching type but full native slot cannot merge or produce a copy",()=>{
  const d=inventory([item("minecraft:feather",64),item("minecraft:stone",64)]);
  assert.equal(find(d.container,item("minecraft:feather")),undefined);
  assert.equal(d.calls.reads,0);assert.equal(d.calls.compare,0);
});
test("P3-03 native metadata comparison rejects different custom data before empty",()=>{
  const d=inventory([item("minecraft:feather",3,"custom"),undefined]);
  const result=find(d.container,item("minecraft:feather",2,"plain"));
  assert.equal(result.slot,1);assert.equal(result.before,0);
  assert.equal(d.calls.compare,1);assert.equal(d.calls.reads,0);
});
test("P3-04 AUTO book seed has live type-set semantics; copy only candidate books",()=>{
  const book=e=>item("minecraft:enchanted_book",1,"",1,e);
  const d=inventory([book([{id:"mending",level:1}]),undefined]);
  assert.equal(find(d.container,book([{id:"mending",level:3}]),true).slot,1);
  const first=d.calls.reads;
  assert.equal(first,1);
  d.items[0]=book([{id:"fortune",level:1}]);
  assert.equal(find(d.container,book([{id:"mending",level:3}]),true),undefined);
  assert.equal(d.calls.reads,first+1);
});
