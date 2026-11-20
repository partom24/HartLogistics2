import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const source=readFileSync(resolve(root,"addon/behavior_pack/scripts/main.js"),"utf8");
const start=source.indexOf("function ejectedItemCollector(entity, spawnLoc=undefined) {");
const end=source.indexOf("function processEjectedItemEntity(",start);
assert.ok(start>=0&&end>start,"The shipped event admission source seam must remain executable");

function witness({spawn={x:100.25,y:70.25,z:50.25},powered=false,triggered=true,
                  sourceType="minecraft:dropper",linked=true,dimension="minecraft:overworld",
                  collectorCount=73}={}) {
  const counters={collectorAt:0,adjacentBlock:0,power:0,orientation:0,trigger:0};
  const collectors=Array.from({length:collectorCount},(_,i)=>({
    id:"C"+i,d:"minecraft:overworld",x:100+i*100,y:70,z:50,
    link:linked?"R":"",present:true
  }));
  const sourcePos={x:99,y:70,z:50};
  const sourceBlock={typeId:sourceType,location:sourcePos};
  const liveCollectorBlock={dimension:{
    getBlock(p){
      counters.adjacentBlock++;
      if(p.x===sourcePos.x&&p.y===sourcePos.y&&p.z===sourcePos.z)return sourceBlock;
      return {typeId:"minecraft:stone",location:{...p}};
    }
  }};
  const context={
    logistics:{collectors},
    collectorAt(c){counters.collectorAt++;return liveCollectorBlock;},
    collectorAllowsEjectedPulse(){counters.power++;return !powered;},
    directionalOutputOffset(){counters.orientation++;return {x:1,y:0,z:0};},
    sourceIsTriggered(){counters.trigger++;return triggered;}
  };
  const observe=vm.runInNewContext(source.slice(start,end)+"\nejectedItemCollector",context);
  const entity={isValid:true,typeId:"minecraft:item",location:spawn,
    dimension:{id:dimension}};
  const result=observe(entity,spawn);
  return {result,counters,collectors,entity};
}
test("SPAWN-01 distant item never consults any Collector Block or native redstone state",()=>{
  const out=witness({spawn:{x:0,y:70,z:0}});
  assert.equal(out.result,undefined);
  assert.equal(out.counters.collectorAt,0);
  assert.equal(out.counters.power,0);
  assert.equal(out.counters.adjacentBlock,0);
});
test("SPAWN-02 location prequalification still recognizes genuine directed Dropper item",()=>{
  const out=witness();
  assert.equal(out.result?.collector.id,"C0");
  assert.equal(out.result?.source.typeId,"minecraft:dropper");
  assert.equal(out.counters.collectorAt,1);
  assert.ok(out.counters.adjacentBlock>0);
  assert.equal(out.counters.trigger,1);
});
test("SPAWN-03 native power fence still protects spatially eligible item",()=>{
  const out=witness({powered:true});
  assert.equal(out.result,undefined);
  assert.equal(out.counters.collectorAt,1);
  assert.equal(out.counters.power,1);
  assert.equal(out.counters.adjacentBlock,0);
});
test("SPAWN-04 non-ejecting Hopper source or untriggered Dropper does not gain acceptance",()=>{
  const a=witness({sourceType:"minecraft:hopper"});
  assert.equal(a.result,undefined);
  assert.equal(a.counters.orientation,0);
  const b=witness({triggered:false});
  assert.equal(b.result,undefined);
  assert.ok(b.counters.trigger>0);
});
test("SPAWN-05 saved Collector link and dimension still constrain routing before native reads",()=>{
  for(const option of [{linked:false},{dimension:"minecraft:nether"}]){
    const out=witness(option);
    assert.equal(out.result,undefined);
    assert.equal(out.counters.collectorAt,0);
  }
});
test("SPAWN-06 original 0.35 to 1.35 coordinate tolerance is unchanged",()=>{
  const inside=witness({spawn:{x:99.65,y:70,z:50}});
  assert.equal(inside.result?.collector.id,"C0");
  const outside=witness({spawn:{x:99.64,y:70,z:50}});
  assert.equal(outside.result,undefined);
  assert.equal(outside.counters.collectorAt,0);
});
