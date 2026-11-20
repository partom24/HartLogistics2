/**
 * Fixed 101-column / 5-item source-decision regression fixture.
 * 101 separate 5-Sorter columns; 20 cycles of 5 plain items.
 * Six thousand nonmatch visits x 8 ticks plus 100 final captures.
 *
 * This tests REAL U1 source decision modules, but deterministic native Hopper
 * residence and physical movement are simulated. It does NOT run journals,
 * Q4, full-runtime intervals, or native Bedrock BDS, and its counters are not
 * a replacement for a full API call/tick profiler.
 *
 * Execute: node --experimental-vm-modules --test
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SCRIPTS=path.join(ROOT,"addon/behavior_pack/scripts");
async function load(){
  const cache=new Map();
  const make=file=>{
    if(cache.has(file))return cache.get(file);
    const mod=new vm.SourceTextModule(fs.readFileSync(path.join(SCRIPTS,file),"utf8"),
      {identifier:file});
    cache.set(file,mod);
    return mod;
  };
  const bridge=make("urce_column_offer_bridge.js");
  await bridge.link(specifier=>make(path.basename(specifier)));
  await bridge.evaluate();
  return {
    frame:bridge.namespace.prepareLocalColumnFrame,
    transit:make("urce_column_local_decisions.js").namespace.proveLocalColumnTransit,
    legacyOrder:make("urce_column_local_decisions.js").namespace.orderedLocalSorterCandidates
  };
}
test("101 columns, 5 repeating items, 20-column destination spacing preserve every delivery",async()=>{
  const {frame,transit,legacyOrder}=await load();
  const types=["minecraft:cobblestone","minecraft:dirt","minecraft:gravel",
    "minecraft:stone","minecraft:sand"];
  const homes=[21,41,61,81,101];
  const modeOf=e=>e.m,match=(s,f)=>s.typeId===f.match.typeId;
  const columns=Array.from({length:101},(_,c)=>Array.from({length:5},(_,j)=>({
    d:"minecraft:overworld",x:(c+1)*4,y:64+j,z:0,m:"filter",
    f:{match:{typeId:homes.includes(c+1)&&j===0?
      types[homes.indexOf(c+1)]:"minecraft:diamond"}}
  })));
  let occupied=0,transitCount=0,frameCalls=0,orderDifferences=0;
  const accepted=new Set();
  const delivered=Object.fromEntries(types.map(t=>[t,0]));
  for(let tick=1;tick<=1600;tick++){
    for(let column=1;column<=101;column++){
      const elapsed=tick-1-(column-1)*8;
      if(elapsed<0)continue;
      const item=Math.floor(elapsed/8);
      if(item>=100||column>homes[item%5]||accepted.has(item))continue;
      const stack={typeId:types[item%5],amount:1};
      occupied++;
      const source={size:5,getItem(i){return i===0?stack:undefined;}};
      if(transit(columns[column-1],source,modeOf,match)){
        transitCount++;continue;
      }
      frameCalls++;
      const result=frame({activeSorters:columns[column-1],stack,
        modeOf,matches:match});
      const previous=legacyOrder(columns[column-1],stack,modeOf,match);
      if(previous.length!==result.targets.length||
        previous.some((s,i)=>s!==result.targets[i]))orderDifferences++;
      assert.equal(result.executePermitted,false);
      assert.equal(result.captured,false);
      assert.equal(result.offers.length,0,"C does not construct network graph evidence on hot path");
      if(column===homes[item%5]&&result.targets.length===1){
        accepted.add(item);delivered[stack.typeId]++;
      }
    }
  }
  assert.equal(occupied,48100);
  assert.equal(transitCount,48000);
  assert.equal(frameCalls,100);
  assert.equal(orderDifferences,0);
  assert.equal(accepted.size,100);
  for(const type of types)assert.equal(delivered[type],20);
  const main=fs.readFileSync(path.join(SCRIPTS,"main.js"),"utf8");
  assert.match(main,/prepareLocalColumnFrame\(\{/);
  assert.doesNotMatch(main,/evaluateSourceScopedShadow\(/);
  console.log("URCE_101_STAGE "+JSON.stringify({
    inspectedColumnsPerTick:101,ticks:1600,modeledPolls:161600,
    occupied,transitCount,frameCalls,delivered,orderDifferences,
    nativeCallsNotMeasured:true,bedrockMeasured:false
  }));
});
