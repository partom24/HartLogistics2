import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/**
 * Exact Collector-native waiting service spliced into the real UCE main.js.
 * Native port and persistent host registration are independently exercised
 * by real module tests. Here only Bedrock blocks are synthetic.
 */
const original=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const main=process.env.UCE_GENERATED_MAIN?
  fs.readFileSync(process.env.UCE_GENERATED_MAIN,'utf8'):original;
const begin=main.indexOf('const UCE_COLLECTOR_MR_SCAN_BUDGET=16;');
const end=main.indexOf('const UCE_MR_SCAN_BUDGET=16;',begin);
assert.ok(begin>=0&&end>begin,'integrated Collector-native service required');
const code=main.slice(begin,end);
const collector={id:'minecraft:overworld|3|69|5',
  d:'minecraft:overworld',x:3,y:69,z:5,
  link:'minecraft:overworld|24|70|4',present:true};
const receiver={id:collector.link,d:'minecraft:overworld',
  x:24,y:70,z:4,present:true};
function fixture({receiverLoaded=false,powered=false,
                 accountSealed=true,sourceIsMR=true,
                 sourceIsOrdinary=false,carrierExisting=false,carrierOccupied=false,
                 sorterInput=false,sourceEligible=true}={}){
  let loaded=receiverLoaded,linked=accountSealed;
  let hasHost=carrierExisting||carrierOccupied;
  const native={typeId:'minecraft:enchanted_book',amount:1,
    nameTag:'Collector waiting MR',getLore:()=>['native payload']};
  const ordinary={typeId:'minecraft:cobblestone',
    amount:64,maxAmount:64};
  const slots=Array(9).fill(undefined);
  if(carrierOccupied)slots[0]=native;
  const host={size:9,isValid:true,getItem:i=>slots[i],
    setItem:(i,v)=>{slots[i]=v}};
  const input={size:5,isValid:true,items:[
    sourceIsMR?native:sourceIsOrdinary?ordinary:undefined],
    getItem(i){return this.items[i];},
    setItem(i,v){this.items[i]=v}};
  const block={typeId:'hartsorter:collector',powered,
    dimension:{id:collector.d},location:{
      x:collector.x,y:collector.y,z:collector.z}};
  const hopper={typeId:'minecraft:hopper',dimension:block.dimension,
    location:{x:3,y:70,z:5}};
  const actions=[],messages=[];
  const mgr={
    ok:true,inspectHost:({ownerId})=>
      ownerId===collector.id&&hasHost?{ok:true,container:host}:
      {ok:false,reason:'carrier_record_missing'},
    registerEmptyHost:()=>{actions.push('REGISTER_COLLECTOR');
      hasHost=true;return {ok:true};},
    inspectCustody:()=>({
      ok:true,slots:slots[0]?[0]:[],
      free:slots[0]?8:9,occupied:slots[0]?1:0}),
    durableOwnershipWitness:()=>true
  };
  const ctx={
    world:{},logistics:{collectors:[collector],receivers:[receiver]},
    findReceiverById:id=>id===receiver.id?receiver:undefined,
    findCollectorById:id=>id===collector.id?collector:undefined,
    collectorAt:()=>block,
    receiverAt:()=>loaded?{typeId:'hartsorter:receiver'}:undefined,
    uceLiveCollectorOwner:()=>true,
    uceLiveReceiverOwner:()=>loaded,
    blockIsRedstonePowered:b=>!!b?.powered,
    uceOrdinaryAccountSource:()=>linked?'sealed-shard':undefined,
    createUnifiedCarrierRegistry:()=>mgr,
    collectorInputSources:()=>sorterInput?[]:[{
      kind:'hopper',block:hopper,
      container:input,locked:false}],
    uceSorterCollectorSources:(_,required)=>{
      if(!sorterInput||required!==collector.id)return [];
      return [{kind:'sorter-collector',block:hopper,
        container:input,locked:false,
        eligibleSlot:()=>sourceEligible,
        stillSelected:()=>sourceEligible}];
    },
    uceLiveHopperOwner:()=>true,
    uceSameLoadedBlock:(a,b)=>!!a&&!!b&&
      a.typeId===b.typeId&&a.dimension?.id===b.dimension?.id&&
      a.location?.x===b.location?.x&&
      a.location?.y===b.location?.y&&
      a.location?.z===b.location?.z,
    uceClassifyLiveStack:stack=>stack===native?'MR':
      stack===ordinary?'ORDINARY':'UNKNOWN',
    ucePlainItemIdentity:stack=>stack===ordinary?
      'ordinary-key':undefined,
    ucePerfTimedOperation:(_,call)=>call(),
    uceCollectorOrdinaryDeposit:(_,fromOwner,toOwner,anchor,candidate,
                                  carrier,verify)=>{
      actions.push('ORDINARY');
      assert.equal(fromOwner.id,collector.id);
      assert.equal(toOwner.id,receiver.id);
      assert.equal(candidate.item,ordinary);
      assert.equal(candidate.key,'ordinary-key');
      assert.equal(verify(),true);
      input.setItem(candidate.slot,undefined);
      return {ok:true,status:'UNIFIED_ORDINARY_BOUNDARY_DELIVERED'};
    },
    createUnifiedNativePort:()=>{actions.push('PORT');return {ok:true};},
    uceNativeReceiptId:()=> 'collector-native-1',
    serviceUnifiedReceiverMR:({ownerId,direction,inputSources})=>{
      actions.push(direction==='ingress'?'INGRESS':'BAD_DIRECTION');
      assert.equal(ownerId,collector.id);
      assert.equal(inputSources.length,1);
      assert.equal(inputSources[0].eligibleSlot(0,native),sourceEligible);
      if(!sourceEligible)return {ok:true,moved:0};
      slots[0]=input.getItem(0);input.setItem(0,undefined);
      return {ok:true,moved:1};
    },
    uceTryInterbankMrHandoff:(authority,fromOwner,registry,
                              carrier,anchor,slot,item,route)=>{
      actions.push('DRAIN');
      assert.equal(fromOwner.id,collector.id);
      assert.equal(route.receiver.id,receiver.id);
      assert.ok(route.witness.startsWith('CB1|'));
      assert.equal(route.verify(),true);
      assert.equal(item,native);
      slots[slot]=undefined;
      return {ok:true,moved:1};
    },
    ucePerfRecordMove:(kind,n)=>actions.push('METRIC:'+kind+':'+n),
    uceUnifiedJournalHold:()=>false,
    uceBridgeLog:reason=>messages.push(reason),
    uceCarrierRegistrationReason:x=>x.reason,
    COLLECTOR_ID:'hartsorter:collector'
  };
  vm.runInNewContext(code,ctx);
  const tick=()=>ctx.uceCollectorMrBufferTick({
    worldId:'world',epoch:9});
  return {tick,ctx,actions,messages,input,slots,collector,block,
    get loaded(){return loaded;},
    setLoaded:v=>{loaded=v;},setAccount:v=>{linked=v;},
    get hasHost(){return hasHost;}};
}
test('unloaded linked Receiver admits MR Hopper input into one Collector-owned native carrier',()=>{
  const f=fixture();
  f.tick();
  assert.deepEqual(f.actions,[
    'REGISTER_COLLECTOR','PORT','INGRESS','METRIC:MR:1']);
  assert.equal(f.input.getItem(0),undefined);
  assert.equal(f.slots[0]?.nameTag,'Collector waiting MR');
  assert.equal(f.hasHost,true);
});
test('an unloaded linked Receiver is credited through existing ordinary boundary, not a new queue',()=>{
  const f=fixture({sourceIsMR:false,sourceIsOrdinary:true});
  f.tick();
  assert.deepEqual(f.actions,[
    'REGISTER_COLLECTOR','ORDINARY','METRIC:ordinary:undefined']);
  assert.equal(f.input.getItem(0),undefined,
    'one verified ordinary stack is admitted to the sealed Receiver ledger');
  assert.equal(f.hasHost,true,
    'Collector carrier is the real native escrow owner');
});
test('when Receiver becomes loaded, Collector cargo drains before any new input',()=>{
  const f=fixture({carrierExisting:true,carrierOccupied:true,
    sourceIsMR:false});
  f.tick(); // Receiver unavailable: no additional source MR
  f.setLoaded(true);
  f.tick();
  assert.ok(f.actions.includes('DRAIN'));
  assert.ok(f.actions.includes('METRIC:MR:1'));
  assert.equal(f.slots[0],undefined);
});
test('loaded Receiver with no waiting Collector host keeps original direct ingress',()=>{
  const f=fixture({receiverLoaded:true});
  f.tick();
  assert.deepEqual(f.actions,[],
    'a new Collector host must not be spawned for an already loaded Receiver');
});
test('unsealed, redstone-paused, or unlinked Collector never captures native input',()=>{
  for(const opts of [{accountSealed:false},{powered:true}]){
    const f=fixture(opts);
    f.tick();
    assert.deepEqual(f.actions,[]);
    assert.ok(f.input.getItem(0));
  }
  const f=fixture();
  f.collector.link='';
  f.tick();
  assert.deepEqual(f.actions,[]);
  f.collector.link='minecraft:overworld|24|70|4';
});
test('unloaded Sorter→Collector uses only the selected Collector source',()=>{
  const f=fixture({sorterInput:true});
  f.tick();
  assert.ok(f.actions.includes('INGRESS'));
  const disallowed=fixture({sorterInput:true,sourceEligible:false});
  disallowed.tick();
  assert.deepEqual(disallowed.actions,[]);
  assert.ok(disallowed.input.getItem(0));
});
