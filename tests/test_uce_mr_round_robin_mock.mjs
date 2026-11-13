import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/**
 * Exact UCE bridge service, not a copy of its algorithm. No BDS claims:
 * source-shaped mock checks round-robin fairness, budgets and global HOLD.
 */
const bridge=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const from=bridge.indexOf('const UCE_MR_SCAN_BUDGET=16;');
const to=bridge.indexOf('\n\n/* One scheduler,',from);
assert.ok(from>0&&to>from,'MR scheduler source boundary found');
const actual='let uceMrCursor=0;\n'+bridge.slice(from,to);

function fixture({receivers=40,moveEvery=true,holdAfter=0}={}){
  const inspected=[],messages=[];
  const owners=Array.from({length:receivers},(_,i)=>({
    id:'receiver-'+i,d:'minecraft:overworld',x:i,y:70,z:9,present:true
  }));
  const context={
    logistics:{receivers:owners,collectors:[]},
    uceOrdinaryAccountSource:()=> 'sealed-region',
    receiverAt:()=>({typeId:'hartsorter:receiver'}),
    blockIsRedstonePowered:()=>false,
    createUnifiedCarrierRegistry:()=>({
      ok:true,
      inspectHost:()=>({ok:true,container:{
        size:9,isValid:true,getItem:()=>undefined
      }}),
      inspectCustody:()=>({ok:true,occupied:0,slots:[],free:9})
    }),
    ucePipeRouteNetwork:()=>undefined,
    uceSorterCollectorSources:()=>[],
    receiverOutputHopper:()=>undefined,
    createUnifiedNativePort:()=>({ok:true}),
    uceNativeReceiptId:()=> 'unique-source-mock-receipt',
    uceClassifyLiveStack:()=> 'MR',
    serviceUnifiedReceiverMR:({ownerId})=>{
      inspected.push(ownerId);
      return {ok:true,moved:moveEvery?1:0};
    },
    uceUnifiedJournalHold:()=>holdAfter>0&&
      inspected.length>=holdAfter,
    uceBridgeLog:x=>messages.push(x)
  };
  vm.runInNewContext(actual,context);
  return {tick:()=>context.uceMrServiceTick({
    worldId:'mock',epoch:3
  }),inspected,messages};
}
const ids=(a,b)=>Array.from({length:b-a},(_,i)=>'receiver-'+(a+i));
test('MR throughput is bounded to eight native moves per tick without starving later Receivers',()=>{
  const f=fixture();
  f.tick();
  assert.deepEqual(f.inspected,ids(0,8));
  f.tick();
  assert.deepEqual(f.inspected,ids(0,16));
  f.tick();
  assert.deepEqual(f.inspected,ids(0,24));
  f.tick();
  f.tick();
  assert.deepEqual(f.inspected,ids(0,40));
  f.tick();
  assert.deepEqual(f.inspected.slice(-8),ids(0,8));
});
test('idle MR network scans at most sixteen Receivers per tick and advances its cursor',()=>{
  const f=fixture({moveEvery:false});
  f.tick();
  assert.deepEqual(f.inspected,ids(0,16));
  f.tick();
  assert.deepEqual(f.inspected,ids(0,32));
  f.tick();
  assert.deepEqual(f.inspected.slice(32),[...ids(32,40),...ids(0,8)]);
});
test('an uncertain native journal stops this MR scheduler before another owner is touched',()=>{
  const f=fixture({holdAfter:3});
  f.tick();
  assert.deepEqual(f.inspected,ids(0,3));
  assert.deepEqual(f.messages,[]);
});
