/**
 * U1-B legacy destinationFor control-plane side-effect parity.
 * Extract and execute the current actual function from main.js against
 * a pinned legacy-reference replica, using injected Bedrock-shaped stubs.
 *
 * This proves no registration/queue/inventory side-effect order drift for
 * these modeled cases. It does not authorize custody/migration or imply BDS timing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const MAIN=path.join(ROOT,"addon/behavior_pack/scripts/main.js");
const PROBE=path.join(ROOT,"addon/behavior_pack/scripts/urce_column_local_decisions.js");
const COLLECTOR_ID="hartsorter:collector";

function legacySupportedStorage(block){
  if(!block)return false;
  const id=block.typeId;
  if(id==="minecraft:chest"||id==="minecraft:trapped_chest"||id==="minecraft:barrel")return true;
  if(id==="minecraft:shulker_box"||id.endsWith("_shulker_box"))return true;
  return false;
}
function legacyDestinationFor(entry,ctx){
  const b=ctx.sorterAt(entry);
  if(!b)return undefined;
  const off=ctx.facingOffset(b);
  if(!off)return undefined;
  let dest;
  try{
    dest=b.dimension.getBlock({
      x:b.location.x+off.x,y:b.location.y,z:b.location.z+off.z
    });
  }catch(_){return undefined;}
  if(!dest)return undefined;
  if(dest.typeId===COLLECTOR_ID){
    const id=ctx.logisticsId(dest.dimension.id,dest.location.x,dest.location.y,dest.location.z);
    let collector=ctx.findCollectorById(id);
    if(!collector)collector=ctx.registerCollector(dest);
    else if(collector.present===false){collector.present=true;ctx.saveLogistics();}
    return {kind:"collector",block:dest,collector};
  }
  if(!legacySupportedStorage(dest))return undefined;
  const c=dest.getComponent("minecraft:inventory")?.container;
  if(!c||!c.isValid)return undefined;
  return {kind:"storage",block:dest,container:c};
}
function extractActualDestination(src){
  const a=src.indexOf("function destinationFor(entry) {");
  const b=src.indexOf("\nfunction sorterCollectorRoute(",a);
  assert.ok(a>0&&b>a,"actual destinationFor() body must be found");
  return src.slice(a,b);
}
async function loadProbe(){
  const mod=new vm.SourceTextModule(fs.readFileSync(PROBE,"utf8"),{identifier:PROBE});
  await mod.link(()=>{throw Error("Read-only probe cannot import Bedrock");});
  await mod.evaluate();
  return mod.namespace.observeSorterDestination;
}
function trial(newDestinationFor,{type,existing,valid,available,throwRegister=false,throwPersist=false}){
  const trace=[];
  const container={isValid:valid,size:27};
  const dest={
    typeId:type,dimension:{id:"minecraft:overworld"},
    location:{x:2,y:64,z:3},
    getComponent(id){trace.push("inventory:"+id);return {container};}
  };
  const sorter={
    dimension:{getBlock(p){
      trace.push("getBlock");
      if(!available)throw Error("chunk unavailable");
      return dest;
    }},
    location:{x:1,y:64,z:3}
  };
  const existingCollector=existing==="none"?undefined:{id:"known",present:existing==="present"};
  const ctx={
    sorterAt:()=>sorter,
    facingOffset:()=>({x:1,y:0,z:0}),
    logisticsId:()=>"known",
    findCollectorById:()=>existingCollector,
    registerCollector:()=>{
      trace.push("registerCollector");
      if(throwRegister)throw Error("registry write failed");
      return {id:"known",present:true};
    },
    saveLogistics:()=>{
      trace.push("saveLogistics");
      if(throwPersist)throw Error("logistics persistence failed");
    }
  };
  let value,exception;
  try{value=newDestinationFor({d:"minecraft:overworld",x:1,y:64,z:3},ctx);}
  catch(e){exception=e.message;}
  return {
    kind:value?.kind,
    collectorId:value?.collector?.id,
    storedContainer:value?.container===container,
    collectorPresent:existingCollector?.present,
    exception,trace
  };
}
test("U1-B actual destinationFor preserves 1.5.8 registration and storage side effects",async()=>{
  const observe=await loadProbe();
  const main=fs.readFileSync(MAIN,"utf8");
  const body=extractActualDestination(main);
  const names=[
    "sorterAt","facingOffset","logisticsId","findCollectorById",
    "registerCollector","saveLogistics","observeSorterDestination","COLLECTOR_ID"
  ];
  const factory=Function(...names,body+"\nreturn destinationFor;");
  function newFunction(entry,ctx){
    const deps={
      ...ctx,observeSorterDestination:observe,COLLECTOR_ID
    };
    return factory(...names.map(name=>deps[name]))(entry);
  }
  for(const type of [
    COLLECTOR_ID,"minecraft:chest","minecraft:barrel",
    "minecraft:shulker_box","minecraft:blue_shulker_box","minecraft:air"
  ]){
    for(const existing of ["none","present","absent"]){
      for(const valid of [true,false]){
        for(const available of [true,false]){
          const opts={type,existing,valid,available};
          assert.deepEqual(trial(newFunction,opts),
            trial(legacyDestinationFor,opts),
            "Parity failed: "+JSON.stringify(opts));
        }
      }
    }
  }
  for(const opts of [
    {type:COLLECTOR_ID,existing:"none",valid:true,available:true,throwRegister:true},
    {type:COLLECTOR_ID,existing:"absent",valid:true,available:true,throwPersist:true}
  ]){
    assert.deepEqual(trial(newFunction,opts),trial(legacyDestinationFor,opts));
  }
});
