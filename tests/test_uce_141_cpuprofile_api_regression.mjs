import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/**
 * Owner's November 2026 CPUProfile of 1.4.1, 1,387 stacked Sorters:
 *   1.49m native API samples in 12.96 seconds.
 *   schedulerTick: 91.3% of samples; findAcceptSlot: 439,931 samples;
 *   compactSourceHopper: 280,676 samples; World.getDimension: 93,433.
 *
 * This file exercises actual 1.5 source functions, not a parallel algorithm.
 * Counting API accesses in a mock is NOT actual Bedrock CPU/TPS proof.
 */
const bridge=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const route=fs.readFileSync(new URL(
  '../candidates/uce/runtime_pipe_route.js',import.meta.url),'utf8');
const compiled=process.env.UCE_GENERATED_MAIN?
  fs.readFileSync(process.env.UCE_GENERATED_MAIN,'utf8'):null;
const exactSource=compiled||bridge;
const from=exactSource.indexOf('function uceSorterDirectServiceTick(authority){');
const to=exactSource.indexOf('\n}\n\n/*',from);
assert.ok(from>=0&&to>from,'real direct Sorter service must be accessible');
const direct=exactSource.slice(from,to+2);

function sourceFixture(count=1387){
  const dimensions=['minecraft:overworld','minecraft:nether','minecraft:the_end'];
  const columns=Array.from({length:count},(_,i)=>({
    d:dimensions[i%dimensions.length],
    source:{x:i,y:90,z:0}
  }));
  let dimensionLookups=0,blockLookups=0,inventoryReads=0;
  const logs=[],ctx={
    columns,uceBridgeLog:s=>logs.push(s),
    getDimension:id=>{
      dimensionLookups++;
      return {id,getBlock:p=>{
        blockLookups++;
        if(p.x!==count-1)return {typeId:'minecraft:stone'};
        return {typeId:'minecraft:hopper',location:p};
      }};
    },
    hopperIsRedstoneLocked:()=>false,
    blockContainer:()=>({
      isValid:true,size:5,
      getItem:()=>{inventoryReads++;return undefined;}
    })
  };
  vm.runInNewContext('let uceSorterDirectCursor=0;\n'+direct,ctx);
  return {columns,ctx,logs,
    tick:()=>ctx.uceSorterDirectServiceTick({worldId:'w',epoch:1}),
    counts:()=>({dimensionLookups,blockLookups,inventoryReads})};
}

test('all 1387 scattered columns are checked, but each dimension is resolved once per service tick',()=>{
  const f=sourceFixture();
  f.tick();
  assert.deepEqual(f.counts(),
    {dimensionLookups:3,blockLookups:1387,inventoryReads:5});
  assert.deepEqual(f.logs,[]);
  f.tick();
  assert.deepEqual(f.counts(),
    {dimensionLookups:6,blockLookups:2774,inventoryReads:10},
    'loaded block and Hopper state must be re-observed on the NEXT tick');
});
test('direct Sorter does not scan a destination inventory twice before creating a native move',()=>{
  assert.match(direct,/const accepting=ordinaryKey\?selected\.accepting:undefined;/);
  assert.doesNotMatch(direct,/ordinaryKey\?findAcceptSlot\(dest,stack\)/);
  // The executor MUST NOT cache/rely on an old selected route for ACK.
  assert.match(direct,/const current=uceSorterColumnWinner\(/);
  assert.match(direct,/verifyEndpointOwner:endpointValid/);
  assert.match(direct,/port\.ackWhole\(/);
});
test('route winner stores exactly one native preflight slot without replacing authenticated route checks',()=>{
  assert.match(route,/const accepting=findAcceptSlot\(dest,item\);/);
  assert.match(route,/block:target,container:dest,accepting/);
  assert.match(route,/function uceSorterColumnWinner\(column,item,settledSelection=undefined\)/);
  assert.match(route,/settledSelection\?\.entry===entry/);
});
test('compiled 1.5 still fences the original costly 1.4.1 Sorter writer under UCE',()=>{
  if(!compiled)return;
  assert.match(compiled,/function schedulerTick\(\) \{\s*if \(uceLegacyWriterBlocked\(\)\) return;/);
  assert.match(compiled,/function logisticsTick\(\) \{\s*if \(uceLegacyWriterBlocked\(\)\) \{ ucePerformanceTick\(\); return; \}/);
  assert.match(compiled,/function uceSorterDirectServiceTick\(authority\)/);
  assert.match(compiled,/const dimensions=new Map\(\);/);
});
