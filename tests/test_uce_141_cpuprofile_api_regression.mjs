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

test('compiled legacy 1.5 Sorter skips all downstream work for empty input but sees next-tick cargo', {skip:!compiled},()=>{
  const begin=compiled.indexOf('function processColumn(col, globalRemaining) {');
  const end=compiled.indexOf('\nfunction processCollectorIngress(',begin);
  assert.ok(begin>=0&&end>begin,'assembled legacy processColumn must exist');
  const actual=compiled.slice(begin,end);
  assert.match(actual,/const srcSize=src.size;/);
  assert.match(actual,/if \(!hasSourceItems\) return 0;/);
  assert.match(actual,/const emptySlots=src\.emptySlotsCount;/);
  assert.match(actual,/if \(!pg23TransportMayRun\(\)\) return 0;/);
  assert.doesNotMatch(actual.slice(0,160),
    /if \(!pg23TransportMayRun\(\)\) return 0;/,
    'journal safety gate moves only past read-only empty-Hopper check');
  assert.match(actual,/for \(let si=0; si<srcSize && columnBudget>0; si\+\+\)/);
  let cargo,locked=false,bypass=false,occupancyFails=false,gateOpen=true;
  const calls={size:0,occupancy:0,reads:0,gates:0,sorters:0,compactions:0,moves:0};
  const input={
    isValid:true,
    get size(){calls.size++;return 5;},
    get emptySlotsCount(){
      calls.occupancy++;
      if(occupancyFails)throw Error('native occupancy unavailable');
      return cargo?4:5;
    },
    getItem:i=>{calls.reads++;return i===0?cargo:undefined;}
  };
  const source={
    typeId:'minecraft:hopper',
    getComponent:name=>name==='minecraft:inventory'?{container:input}:undefined
  };
  const dest={};
  const ctx={
    PER_COLUMN_BATCH:16,PG26_COLUMN_BATCH:64,
    PG26_PIPE_ID:'hartlogistics:transporter',
    pg23TransportMayRun:()=>{calls.gates++;return gateOpen;},
    getDimension:()=>({getBlock:()=>source}),
    hopperIsRedstoneLocked:()=>locked,
    sorterAt:()=>{calls.sorters++;return {};},
    blockIsRedstonePowered:()=>false,
    sorterMode:()=>bypass?'bypass':'wildcard',
    pg23CompactSourceHopper:()=>{calls.compactions++;return true;},
    destinationFor:()=>({kind:'storage',block:{},container:dest}),
    findAcceptSlot:()=>({slot:0,room:64}),
    safeMovePartial:()=>{calls.moves++;cargo=undefined;return 1;},
    matchesFilter:()=>false,
    autoSorterMatches:()=>false,
    recoverJournal:()=>{throw Error('unexpected recovery');},
    recoverQueueJournal:()=>{throw Error('unexpected recovery');}
  };
  vm.runInNewContext(actual,ctx);
  const col={d:'minecraft:overworld',x:0,z:0,
    source:{x:0,y:90,z:0},sorters:[{nativeQuarantine:false}]};
  assert.equal(ctx.processColumn(col,64),0);
  assert.equal(calls.size,1);
  assert.equal(calls.occupancy,1,'one native occupancy read replaces five native slot reads');
  assert.equal(calls.reads,0,'empty Hopper must not read five slots');
  assert.equal(calls.gates,0,'empty Hopper must not reread persistent Q4 journal keys');
  assert.equal(calls.sorters,0,'empty source must not query sorter block or state');
  assert.equal(calls.compactions,0,'empty Hopper must not open a physical journal');
  assert.equal(calls.moves,0);
  cargo={typeId:'minecraft:cobblestone',amount:1,maxAmount:64};
  assert.equal(ctx.processColumn(col,64),1,'next tick sees freshly inserted item');
  assert.equal(calls.size,2,'one size property read per source invocation');
  assert.equal(calls.occupancy,2,'occupancy must be observed fresh after item ingress');
  assert.equal(calls.gates,1,'occupied Hopper must pass PG23 journal safety gate');
  assert.equal(calls.sorters,1);
  assert.equal(calls.compactions,2,'occupied Hopper retains both compaction fences');
  assert.equal(calls.moves,1);
  locked=true;
  cargo={typeId:'minecraft:cobblestone',amount:1,maxAmount:64};
  const before={...calls};
  assert.equal(ctx.processColumn(col,64),0);
  assert.equal(calls.size,before.size,'powered Hopper stays untouched');
  assert.equal(calls.occupancy,before.occupancy,'redstone lock precedes occupancy');
  assert.equal(calls.gates,before.gates,'redstone lock precedes journal gate');
  assert.equal(calls.sorters,before.sorters,'redstone pause precedes routing');
  assert.equal(calls.compactions,before.compactions);
  assert.equal(calls.moves,before.moves);
  locked=false;bypass=true;
  assert.equal(ctx.processColumn(col,64),0);
  assert.equal(calls.compactions,before.compactions,
    'all-bypass column must not compact or move inventory');
  assert.equal(calls.moves,before.moves);

  // Older BDS versions or invalid native properties must use the original
  // live five-slot scan, never incorrectly assume that the Hopper is empty.
  bypass=false;occupancyFails=true;cargo=undefined;
  const fallbackBefore={...calls};
  assert.equal(ctx.processColumn(col,64),0);
  assert.equal(calls.reads-fallbackBefore.reads,5);
  assert.equal(calls.gates,fallbackBefore.gates,
    'empty fallback scan still avoids journal reads and item routing');

  // A nonempty fallback must still HOLD on unresolved PG23 journals, and
  // route a newly arrived item as soon as authority is restored.
  cargo={typeId:'minecraft:cobblestone',amount:1,maxAmount:64};
  gateOpen=false;
  const guardedBefore={...calls};
  assert.equal(ctx.processColumn(col,64),0);
  assert.equal(calls.gates-guardedBefore.gates,1);
  assert.equal(calls.compactions,guardedBefore.compactions);
  assert.equal(calls.moves,guardedBefore.moves);
  gateOpen=true;
  assert.equal(ctx.processColumn(col,64),1,'fallback still processes live cargo');
  assert.equal(calls.moves,guardedBefore.moves+1);
});
