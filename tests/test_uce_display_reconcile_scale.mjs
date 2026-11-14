import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** Actual 1.5 generated-main display reconciler, or identical raw source.
 * Isolates exactly the emitted function: no fake second implementation.
 * Offline CPU cost is NOT Bedrock/TPS acceptance evidence.
 */
const generated=!!process.env.UCE_GENERATED_MAIN;
const source=generated?fs.readFileSync(process.env.UCE_GENERATED_MAIN,'utf8'):
  fs.readFileSync(new URL('../candidates/uce/runtime_display_reconcile.js',
    import.meta.url),'utf8');
const begin=source.indexOf('const UCE_DISPLAY_MAINTENANCE_BATCH=16;');
const end=source.indexOf('/* END_HL2_BOUNDED_DISPLAY_MAINTENANCE */',begin);
assert.ok(begin>=0&&end>begin,'bounded display implementation must ship');
const actual=source.slice(begin,end);
assert.doesNotMatch(actual,/\.getEntities\(\{\s*type:\s*DISPLAY_ID\s*\}\)/,
  'no dimension-wide entity sweep in the bounded implementation');
function fixture(n=1387,{loaded=()=>true,frame=()=>false,
    filtered=()=>true,monitored=false}={}){
  const registry=Array.from({length:n},(_,i)=>({id:i,
    f:filtered(i)?{typeId:'minecraft:cobblestone'}:null}));
  const synced=[],removed=[],checked=[],notices=[];
  const perf={displaySlices:0,displayChecked:0,maxDisplaySliceMs:0,
    slowDisplaySlices:0};
  let currentTick=0;
  const ctx={
    ready:true,registry,ucePerfEnabled:monitored,
    ucePerfStats:perf,UCE_PERF_SLOW_TICK_MS:25,
    Date:{now:()=>currentTick++*31},
    ucePerfNotice:(...a)=>notices.push(a),
    sorterAt:e=>{checked.push(e.id);return loaded(e.id)?{}:undefined;},
    entryHasFrameImplant:e=>frame(e.id),
    syncDisplay:e=>synced.push(e.id),
    removeDisplay:e=>removed.push(e.id),
    getDimension(){throw Error('global dimension scan must never occur');}
  };
  vm.runInNewContext(actual,ctx);
  return {ctx,registry,checked,synced,removed,notices,perf,
    tick:()=>{const before=checked.length;
      ctx.uceReconcileDisplaysIncremental();
      return checked.length-before;}};
}

test('1,387 Sorters get one complete incremental visual pass, never a 100-tick burst',()=>{
  const f=fixture();
  const scanned=Array.from({length:100},()=>f.tick());
  assert.equal(Math.max(...scanned),16);
  assert.equal(scanned[99],16);
  assert.equal(new Set(f.checked).size,1387);
  assert.equal(f.synced.length,1600);
  assert.equal(f.removed.length,0);
  assert.deepEqual(f.checked.slice(0,16),Array.from({length:16},(_,i)=>i));
  assert.equal(f.checked[1386],1386);
  assert.equal(f.checked[1387],0);
});
test('unloaded Sorters are not considered stale; native frames or empty filters clean only local displays',()=>{
  const f=fixture(37,{loaded:i=>i!==6,
    frame:i=>i%3===0,filtered:i=>i%4!==0});
  for(let i=0;i<3;i++)assert.ok(f.tick()<=16);
  assert.equal(new Set(f.checked).size,37);
  assert.equal(f.synced.includes(6),false);
  assert.equal(f.removed.includes(6),false);
  assert.equal(f.removed.includes(0),true);
  assert.equal(f.removed.includes(3),true);
  assert.equal(f.synced.includes(5),true);
  assert.equal(f.removed.includes(5),false);
});
test('registry growth and shrink do not reset, spin or escape the batch limit',()=>{
  const f=fixture(50);
  f.tick();
  f.registry.splice(7,39);
  assert.ok(f.tick()<=16);
  f.registry.push(...Array.from({length:76},(_,i)=>({
    id:1000+i,f:{typeId:'minecraft:cobblestone'}})));
  const deltas=Array.from({length:40},()=>f.tick());
  assert.ok(Math.max(...deltas)<=16);
  assert.ok(f.synced.includes(1075));
  f.registry.length=0;
  assert.equal(f.tick(),0);
});
test('a monitored pass reports visual scan time separately from HL2 custody timing',()=>{
  const f=fixture(1387,{monitored:true});
  for(let i=0;i<20;i++)f.tick();
  assert.equal(f.perf.displaySlices,20);
  assert.equal(f.perf.displayChecked,320);
  assert.equal(f.perf.maxDisplaySliceMs,31);
  assert.equal(f.perf.slowDisplaySlices,20);
  assert.equal(f.notices.length,20);
});
test('generated HL2 replaces BOTH the 100-tick interval and startup all-Sorter pass',()=>{
  if(!generated)return;
  assert.match(source,/function reconcileDisplays\(\)\s*\{\s*uceReconcileDisplaysIncremental\(\);\s*\}/);
  assert.match(source,/system\.runInterval\(reconcileDisplays, 1\);/);
  assert.doesNotMatch(source,/system\.runInterval\(reconcileDisplays, 100\)/);
  assert.doesNotMatch(source,/system\.runTimeout\(reconcileDisplays, 5\)/);
  assert.doesNotMatch(source,/dim\.getEntities\(\{type: DISPLAY_ID\}\)/,
    'old global display orphan census must be absent from shipped main');
});
test('frozen original 1.4.1 baseline is unchanged; performance fix only enters HL2',()=>{
  const old=fs.readFileSync(new URL('../addon/behavior_pack/scripts/main.js',
    import.meta.url),'utf8');
  assert.match(old,/system\.runInterval\(reconcileDisplays, 100\);/);
  assert.match(old,/dim\.getEntities\(\{type: DISPLAY_ID\}\)/);
});
