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
  let inventorySizeReads=0;
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
      isValid:true,get size(){inventorySizeReads++;return 5;},
      getItem:()=>{inventoryReads++;return undefined;}
    })
  };
  vm.runInNewContext('let uceSorterDirectCursor=0;\n'+direct,ctx);
  return {columns,ctx,logs,
    tick:()=>ctx.uceSorterDirectServiceTick({worldId:'w',epoch:1}),
    counts:()=>({dimensionLookups,blockLookups,inventoryReads,
      inventorySizeReads})};
}

test('all 1387 scattered columns are checked, but each dimension is resolved once per service tick',()=>{
  const f=sourceFixture();
  f.tick();
  assert.deepEqual(f.counts(),
    {dimensionLookups:3,blockLookups:1387,inventoryReads:5,
      inventorySizeReads:1});
  assert.deepEqual(f.logs,[]);
  f.tick();
  assert.deepEqual(f.counts(),
    {dimensionLookups:6,blockLookups:2774,inventoryReads:10,
      inventorySizeReads:2},
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
test('compiled 1.5 reads destination inventory size ONCE per findAcceptSlot call',()=>{
  if(!compiled)return;
  const begin=compiled.indexOf('function findAcceptSlot(container, stack) {');
  const end=compiled.indexOf('\n}\n\nfunction slotState(',begin);
  assert.ok(begin>=0&&end>begin);
  const ctx={};
  vm.runInNewContext(compiled.slice(begin,end+2),ctx);
  const stack={typeId:'minecraft:stone',amount:4,maxAmount:64};
  let sizes=0,reads=0;
  const slots=Array.from({length:27},()=>({
    typeId:'minecraft:dirt',amount:64,maxAmount:64,
    isStackableWith:other=>other.typeId==='minecraft:dirt'
  }));
  const container={get size(){sizes++;return slots.length;},
    getItem:i=>{reads++;return slots[i];}};
  slots[0]=undefined;
  slots[20]={typeId:'minecraft:stone',amount:60,maxAmount:64,
    isStackableWith:other=>other.typeId==='minecraft:stone'};
  const chosen=ctx.findAcceptSlot(container,stack);
  assert.equal(chosen?.slot,20,'partial stack outranks earlier empty slot');
  assert.equal(chosen?.before,60);
  assert.equal(chosen?.room,4);
  assert.equal(sizes,1,'27-slot native container size must be read once');
  assert.equal(reads,21,'every slot before the matching stack stays checked');
  slots[20]={typeId:'minecraft:stone',amount:64,maxAmount:64,
    isStackableWith:other=>other.typeId==='minecraft:stone'};
  sizes=reads=0;
  assert.equal(ctx.findAcceptSlot(container,stack)?.slot,0,
    'when the matching stack is full, preserve original first empty');
  assert.equal(sizes,1);
  assert.equal(reads,27);
  slots[0]={typeId:'minecraft:dirt',amount:64,maxAmount:64,
    isStackableWith:other=>other.typeId==='minecraft:dirt'};
  sizes=reads=0;
  assert.equal(ctx.findAcceptSlot(container,stack),undefined,
    'full destination must not accept extra items');
  assert.equal(sizes,1);
  assert.equal(reads,27);
});
test('compiled 1.5 still fences the original costly 1.4.1 Sorter writer under UCE',()=>{
  if(!compiled)return;
  assert.match(compiled,/function schedulerTick\(\) \{\s*if \(uceLegacyWriterBlocked\(\)\) return;/);
  assert.match(compiled,/function logisticsTick\(\) \{\s*if \(uceLegacyWriterBlocked\(\)\) \{ ucePerformanceTick\(\); return; \}/);
  assert.match(compiled,/function uceSorterDirectServiceTick\(authority\)/);
  assert.match(compiled,/const dimensions=new Map\(\);/);
});
