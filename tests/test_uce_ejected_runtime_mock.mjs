import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** Runs the ACTUAL BDS-bridge ejection handler in a source-only mock.
 * Real Bedrock metadata fidelity, entity removal timing and persistence
 * are acceptance gates, not inferred from this test.
 */
const bridge=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const index=bridge.indexOf('function uceProcessEjectedItemEntity(');
assert.ok(index>0,'generated ejection bridge handler required');
const runtime=bridge.slice(index);
function fixture({route=true,full=false,failCopy=false,
                 receiverLoaded=true,ordinary=false,powered=false,
                 relinkAfterCopy=false}={}){
  const calls=[],logs=[],retries=[];
  const authority={worldId:'archived-lab-world',epoch:84};
  const item={typeId:'minecraft:enchanted_book',amount:1,
    nameTag:'Native unchanged',hiddenNbt:{special:44}};
  const entity={id:'entity-1',typeId:'minecraft:item',isValid:true};
  const sender={typeId:'minecraft:dispenser',
    dimension:{id:'minecraft:overworld'},location:{x:1,y:2,z:3}};
  const collector={id:'c',link:'receiver-1',d:'minecraft:overworld',
    x:2,y:2,z:3,present:true};
  const collectorBlock={typeId:'hartsorter:collector',powered};
  const found={collector,source:sender};
  const receiver={id:'receiver-1',d:'minecraft:overworld',
    x:3,y:2,z:3,present:true};
  const container={size:9,isValid:true,slots:Array(9).fill(undefined),
    getItem(i){return this.slots[i];}};
  let registryOptions;
  const registry={
    ok:true,
    inspectHost:()=>({ok:true,container}),
    inspectCustody:()=>({ok:true,free:full?0:9}),
    stageMovedTicket:({ownerId,anchor})=>{
      calls.push('TICKET');
      if(relinkAfterCopy&&!registryOptions.ownerVerifier(ownerId,anchor))
        return {ok:false,reason:'collector_link_revoked'};
      return {ok:true};
    },
    durableOwnershipWitness:()=>true
  };
  const port={
    ok:true,
    stageEjectedItem:()=>{
      calls.push('COPY');
      if(failCopy)return {ok:false,reason:'COPY_UNCERTAIN'};
      container.slots[0]=item;
      if(relinkAfterCopy)collector.link='wrong-receiver';
      return {ok:true};
    },
    ackEjectedItem:()=>{
      calls.push('ACK');
      assert.deepEqual(calls,['COPY','TICKET','ACK']);
      entity.isValid=false;
      return {ok:true};
    }
  };
  const ctx={
    ready:true,world:{},
    uceAuthoritySnapshot:()=>authority,
    inspectUnifiedActiveColdImport:()=>({ok:true}),
    uceUnifiedJournalHold:()=>false,
    ejectedItemCollector:()=>route?found:undefined,
    findReceiverById:id=>id===receiver.id?receiver:undefined,
    receiverAt:()=>receiverLoaded?
      {typeId:'hartsorter:receiver'}:undefined,
    uceOrdinaryAccountSource:()=> 'sealed-shard',
    itemEntityStack:()=>item,
    uceClassifyLiveStack:()=>ordinary?'ORDINARY':'MR',
    findCollectorById:id=>id===collector.id?collector:undefined,
    collectorAt:()=>collectorBlock,
    blockIsRedstonePowered:b=>!!b?.powered,
    createUnifiedCarrierRegistry:opts=>{
      registryOptions=opts;return registry;
    },
    uceLegacyWriterBlocked:()=>true,
    uceLiveReceiverOwner:()=>true,
    uceLiveCollectorOwner:(id,anchor)=>id===collector.id&&
      anchor.dimensionId===collector.d&&
      anchor.x===collector.x&&anchor.y===collector.y&&
      anchor.z===collector.z,
    uceNativeOutputSlot:()=>0,
    uceNativeReceiptId:()=> 'operation-1',
    createUnifiedNativePort:()=>port,
    uceSameLoadedBlock:(a,b)=>a===b,
    uceBridgeLog:s=>logs.push(s),
    system:{runTimeout:fn=>retries.push(fn)}
  };
  vm.runInNewContext(runtime,ctx);
  return {ctx,entity,container,logs,calls,retries,item,port,
    collector,get registryOptions(){return registryOptions;}};
}
test('linked Dropper entity uses same carrier port and ticket before removal',()=>{
  const f=fixture();
  f.ctx.uceProcessEjectedItemEntity(f.entity);
  assert.deepEqual(f.calls,['COPY','TICKET','ACK']);
  assert.equal(f.entity.isValid,false);
  assert.deepEqual(f.container.getItem(0),f.item);
  assert.deepEqual(f.logs,[]);
});
test('carrier full leaves original vanilla entity untouched and unjournaled',()=>{
  const f=fixture({full:true});
  f.ctx.uceProcessEjectedItemEntity(f.entity);
  assert.deepEqual(f.calls,[]);
  assert.equal(f.entity.isValid,true);
});
test('native copy HOLD never invokes ticket or entity remove',()=>{
  const f=fixture({failCopy:true});
  f.ctx.uceProcessEjectedItemEntity(f.entity);
  assert.deepEqual(f.calls,['COPY']);
  assert.equal(f.entity.isValid,true);
  assert.equal(f.logs.some(x=>x.includes('COPY_UNCERTAIN')),true);
});
test('vanilla trigger delay retries read-only correlation, not custody action',()=>{
  const f=fixture({route:false});
  f.ctx.uceProcessEjectedItemEntity(f.entity,0);
  assert.deepEqual(f.calls,[]);
  assert.equal(f.retries.length,1);
  assert.equal(f.entity.isValid,true);
});

test('unloaded linked Receiver buffers ejected MR in Collector native host using same ticketed port',()=>{
  const f=fixture({receiverLoaded:false});
  f.ctx.uceProcessEjectedItemEntity(f.entity);
  assert.deepEqual(f.calls,['COPY','TICKET','ACK']);
  assert.equal(f.entity.isValid,false);
  assert.equal(f.container.getItem(0),f.item,
    'native metadata-rich payload is not serialized');
  assert.ok(f.registryOptions,'real Collector host must be selected');
  assert.equal(f.registryOptions.ownerVerifier(f.collector.id,{
    dimensionId:f.collector.d,x:f.collector.x,
    y:f.collector.y,z:f.collector.z}),true);
  assert.equal(f.registryOptions.ownerVerifier('receiver-1',{
    dimensionId:f.collector.d,x:f.collector.x,
    y:f.collector.y,z:f.collector.z}),false,
    'unloaded Receiver must never be the native owner');
});
test('unloaded Receiver cannot strand an ordinary ejected entity in MR-only Collector custody',()=>{
  const f=fixture({receiverLoaded:false,ordinary:true});
  f.ctx.uceProcessEjectedItemEntity(f.entity);
  assert.deepEqual(f.calls,[]);
  assert.equal(f.entity.isValid,true);
  assert.equal(f.registryOptions,undefined);
});
test('unloaded Receiver with powered Collector or full native host preserves vanilla entity',()=>{
  for(const options of [
    {receiverLoaded:false,powered:true},
    {receiverLoaded:false,full:true}
  ]){
    const f=fixture(options);
    f.ctx.uceProcessEjectedItemEntity(f.entity);
    assert.deepEqual(f.calls,[]);
    assert.equal(f.entity.isValid,true);
  }
});
test('unloaded Collector relink after native copy HOLDS before item entity removal',()=>{
  const f=fixture({receiverLoaded:false,relinkAfterCopy:true});
  f.ctx.uceProcessEjectedItemEntity(f.entity);
  assert.deepEqual(f.calls,['COPY','TICKET']);
  assert.equal(f.entity.isValid,true);
  assert.equal(f.logs.some(s=>s.includes('collector_link_revoked')),true);
  assert.equal(f.container.getItem(0),f.item,
    'uncertain copied payload remains for manual journal reconciliation');
});
