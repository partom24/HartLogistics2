import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {createEmptyUnifiedOrdinaryLedger,registerUnifiedEmptyAccount,
  inspectUnifiedOrdinaryLedger} from
  '../candidates/transport/unified_ordinary_accounts.mjs';
import {inspectQ4OrdinaryDefinitionShape} from
  '../candidates/transport/q5_ordinary_shape_gate.mjs';
import {createUnifiedShardWriter,previewUnifiedShard,
  UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA,UCE_FEDERATED_INTENT_KEY} from
  '../candidates/transport/unified_world_shard_writer.mjs';
import {executeUnifiedFederatedTransfer} from
  '../candidates/transport/unified_federated_service.mjs';
import {planUnifiedBulkService} from
  '../candidates/transport/unified_bulk_policy.mjs';

/**
 * An OFFLINE exact-source integration test, not a Bedrock or save-atomicity
 * claim. Calls the REAL UCE ordinary scheduler and physical pipe reader,
 * using the REAL world-shard/federated mutation modules. No synthetic
 * production transaction driver bypasses the integrated Bedrock scheduler.
 */
const baseline=fs.readFileSync(new URL(
  '../addon/behavior_pack/scripts/main.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const pipe=fs.readFileSync(new URL(
  '../candidates/uce/runtime_pipe_route.js',import.meta.url),'utf8');
const remoteBulk=fs.readFileSync(new URL(
  '../candidates/uce/runtime_remote_bulk_bridge.js',import.meta.url),'utf8');
function exactFunction(src,name){
  const at=src.indexOf('function '+name+'(');
  assert.ok(at>=0,'source helper missing: '+name);
  const begin=src.indexOf('{',at);
  let depth=0;
  for(let i=begin;i<src.length;i++){
    if(src[i]==='{')depth++;
    else if(src[i]==='}'&&--depth===0)return src.slice(at,i+1);
  }
  throw Error('unterminated function '+name);
}
const generated=process.env.UCE_GENERATED_MAIN?
  fs.readFileSync(process.env.UCE_GENERATED_MAIN,'utf8'):undefined;
const production=generated||bridge;
const start=production.indexOf('function uceInterbankRouteVerified(');
const end=production.indexOf('\n\n/* Bulk Storage',start);
assert.ok(start>0&&end>start,'exact integrated ordinary scheduler found');
const routeNames=[
  'ucePipeSameDimension','ucePipeSorterRegistryIndex',
  'ucePipeRouteNetwork','uceReadOnlyPipeInput',
  'ucePipeSourceStillConnected','uceReadOnlySorterDestination',
  'ucePipeStorageOwnerId','ucePipeEmptySlot','ucePipeAutoSeed',
  'ucePipeHasUnresolvedForwarding',
  'uceVerifiedNoReachablePreferredOutput','uceLinkedBankBulkRoutes',
  'uceSelectInterbankFilteredRoute',
  'uceChoosePipeDestination','ucePipeDestinationStillValid',
  'uceSorterColumnWinner','uceSorterCollectorSources',
  'uceSorterSourceStillValid'
];
const route=generated?[
  ...['UCE_MAX_LOADED_PIPES','UCE_MAX_SORTER_COLUMN_HEIGHT'].map(name=>{
    const match=generated.match(new RegExp(
      'const '+name+'\\s*=\\s*[0-9]+\\s*;'));
    assert.ok(match,'assembled UCE route constant missing '+name);
    return match[0];
  }),
  'let ucePipeSorterIndexCache;',
  ...routeNames.map(name=>exactFunction(generated,name))
].join('\n'):pipe;
const executable=[
  exactFunction(generated||baseline,'supportedStorage'),
  exactFunction(generated||baseline,'blockContainer'),
  exactFunction(production,'uceDirectStorageOwnerBlock'),
  route,
  // The production scheduler invokes the existing remote Bulk adapter on
  // routes where no Receiver→Receiver Filter transfer was available. Keep
  // the *actual* production adapter in the VM, not an undefined mock seam.
  generated?[
    'uceRemoteBulkPreferredOutput',
    'uceInterbankBulkRouteVerified',
    'ucePlanInterbankBulkTransfer',
    'uceTryRemoteBulkTransfer',
    'uceTryRemoteBulkRefill'
  ].map(name=>exactFunction(generated,name)).join('\n'):remoteBulk,
  'let uceOrdinaryCursor=0;',
  production.slice(start,end)
].join('\n');
const worldId='minecraft:overworld:interbank-integrated',epoch=13;
const shardA='hartlogistics:uce_shard_0001_v1';
const shardB='hartlogistics:uce_shard_0002_v1';
const key=q5IdentityKey({typeId:'minecraft:cobblestone',
  lore:[],ench:[],canDestroy:[],canPlaceOn:[]});
const dimensionId='minecraft:overworld';
const id=(x,y,z)=>dimensionId+'|'+x+'|'+y+'|'+z;
const FACES=[
  ['north',0,0,-1],['south',0,0,1],['east',1,0,0],
  ['west',-1,0,0],['up',0,1,0],['down',0,-1,0]
].map(([name,x,y,z])=>({name,x,y,z}));
function ledger(owner,total){
  let snap=createEmptyUnifiedOrdinaryLedger({worldId,epoch}).snapshot;
  const registered=registerUnifiedEmptyAccount(snap,{
    kind:'receiver',ownerId:owner,expectedRevision:0,expectedEpoch:epoch});
  assert.equal(registered.ok,true,registered.reason);
  snap=registered.next;
  snap.accounts[0].total=total;
  snap.accounts[0].buckets=total?[{key,count:total}]:[];
  snap.total=total;
  assert.equal(inspectUnifiedOrdinaryLedger(snap).ok,true);
  return snap;
}
function fixture({afterPreparedLinkChange=false,throwAfterDebit=false,
                 destinationTotal=0,remoteMode='filter',
                 remoteBankSeeded=false}={}){
  const remoteBankId=id(23,70,5);
  let remoteLedger=ledger(id(24,70,4),destinationTotal);
  if(remoteBankSeeded){
    const registered=registerUnifiedEmptyAccount(remoteLedger,{
      kind:'bulk',ownerId:remoteBankId,
      expectedRevision:remoteLedger.revision,expectedEpoch:epoch});
    assert.equal(registered.ok,true,registered.reason);
    remoteLedger=registered.next;
    const bank=remoteLedger.accounts.find(a=>
      a.id==='bulk:'+remoteBankId&&a.kind==='bulk');
    assert.ok(bank);
    bank.total=128;
    bank.buckets=[{key,count:128}];
    remoteLedger.total+=128;
    assert.equal(inspectUnifiedOrdinaryLedger(remoteLedger).ok,true);
  }
  const saved=new Map([[UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',
    worldId,epoch,writer:'UCE_EXCLUSIVE',
    q4LegacyWritersFenced:true,migrationReconciled:true
  })],[shardA,previewUnifiedShard({
    snapshot:ledger(id(4,70,4),remoteBankSeeded?0:100),
    shardKey:shardA}).raw],
    [shardB,previewUnifiedShard({
      snapshot:remoteLedger,shardKey:shardB}).raw]]);
  let writes=0,moves=0;
  const logs=[];
  const dim={id:dimensionId},blocks=new Map(),entries=[];
  const at=p=>p.x+','+p.y+','+p.z;
  const newContainer=()=>{
    const slots=Array(27).fill(undefined);
    return {size:27,isValid:true,getItem:i=>slots[i],
      setItem:(i,x)=>{slots[i]=x}};
  };
  function put(typeId,x,y,z,container){
    const block={typeId,dimension:dim,location:{x,y,z},
      powered:false,getComponent:n=>n==='minecraft:inventory'&&container?
        {container}:undefined};
    blocks.set(at(block.location),block);
    return block;
  }
  dim.getBlock=p=>blocks.get(at(p))||{
    typeId:'minecraft:air',dimension:dim,location:{...p},
    getComponent:()=>undefined
  };
  const first={id:id(4,70,4),d:dimensionId,x:4,y:70,z:4,present:true};
  const last={id:id(24,70,4),d:dimensionId,x:24,y:70,z:4,present:true};
  put('hartsorter:receiver',4,70,4);
  put('hartsorter:receiver',24,70,4);
  put('hartlogistics:transporter',3,70,4);
  put('hartlogistics:transporter',23,70,4);
  if(remoteBankSeeded)
    put('hartlogistics:bulk_storage',23,70,5);
  const outputHopper=remoteBankSeeded?put('minecraft:hopper',
    4,69,4,{size:5,isValid:true,getItem:()=>undefined}):undefined;
  put('hartsorter:sorter',3,69,4);
  put('hartsorter:sorter',23,69,4);
  const collectorBlock=put('hartsorter:collector',3,69,5);
  const destination=put('minecraft:barrel',23,69,5,newContainer());
  if(remoteMode==='auto')
    destination.getComponent('minecraft:inventory').container.setItem(
      2,{typeId:'minecraft:cobblestone',amount:12,maxAmount:64});
  entries.push({d:dimensionId,x:3,y:69,z:4,m:'wildcard',f:null},
    {d:dimensionId,x:23,y:69,z:4,m:remoteMode,
      f:remoteMode==='filter'?
        {match:{typeId:'minecraft:cobblestone'}}:null});
  const collector={id:id(3,69,5),d:dimensionId,
    x:3,y:69,z:5,present:true,link:last.id};
  const logistics={receivers:[first,last],collectors:[collector]};
  const world={
    getDynamicProperty:k=>saved.get(k),
    setDynamicProperty(k,value){
      writes++;
      if(value===undefined)saved.delete(k);
      else saved.set(k,value);
      if(afterPreparedLinkChange&&k===UCE_FEDERATED_INTENT_KEY&&
         value&&JSON.parse(value)?.phase==='PREPARED')
        collector.link='minecraft:overworld|1000|70|4';
      if(throwAfterDebit&&k===shardA)
        throw Error('fault-injected-after-source-shard-write');
    }
  };
  const ctx={
    world,logistics,registry:entries,columns:[],
    PG26_FACES:FACES,PG26_PIPE_ID:'hartlogistics:transporter',
    SORTER_ID:'hartsorter:sorter',RECEIVER_ID:'hartsorter:receiver',
    COLLECTOR_ID:'hartsorter:collector',
    pg26PositionKey:at,
    pg26Neighbor:(b,face)=>dim.getBlock({
      x:b.location.x+face.x,y:b.location.y+face.y,z:b.location.z+face.z}),
    uceSameLoadedBlock:(a,b)=>!!a&&!!b&&
      a.typeId===b.typeId&&a.dimension.id===b.dimension.id&&
      at(a.location)===at(b.location),
    receiverAt:r=>{
      const block=dim.getBlock({x:r.x,y:r.y,z:r.z});
      return block?.typeId==='hartsorter:receiver'?block:undefined;
    },
    sorterAt:e=>{
      if(!entries.includes(e))return undefined;
      const b=dim.getBlock({x:e.x,y:e.y,z:e.z});
      return b?.typeId==='hartsorter:sorter'?b:undefined;
    },
    collectorAt:c=>{
      if(c.present===false)return undefined;
      const b=dim.getBlock({x:c.x,y:c.y,z:c.z});
      return b?.typeId==='hartsorter:collector'?b:undefined;
    },
    logisticsId:(d,x,y,z)=>d+'|'+x+'|'+y+'|'+z,
    findReceiverById:i=>logistics.receivers.find(r=>r.id===i),
    findCollectorById:i=>logistics.collectors.find(c=>c.id===i),
    collectorInputSources:()=>[],
    uceOrdinaryAccountSource:(_,owner)=>
      owner===first.id?shardA:owner===last.id?shardB:undefined,
    uceLiveReceiverOwner:()=>true,
    uceAuthoritySnapshot:()=>({worldId,epoch}),
    uceLegacyWriterBlocked:()=>true,
    uceMaybeRegisterBulk:()=>false,
    uceSorterCollectorSources:()=>[],
    receiverOutputHopper:r=>remoteBankSeeded&&r.id===first.id?
      {block:outputHopper,
        container:outputHopper.getComponent('minecraft:inventory').container,
        locked:false}:undefined,
    uceBulkOwnerId:b=>id(
      b.location.x,b.location.y,b.location.z),
    blockIsRedstonePowered:b=>!!b.powered,
    sorterMode:e=>e.m,facingOffset:()=>({x:0,y:0,z:1}),
    matchesFilter:(item,filter)=>item.typeId===filter.match.typeId,
    enchantments:()=>[],
    findAcceptSlot:(c,item)=>{
      for(let i=0;i<c.size;i++){
        if(c.getItem(i)===undefined)
          return {slot:i,before:0,room:64,existing:undefined};
      }
      return undefined;
    },
    createUnifiedCarrierRegistry:()=>({ok:true,
      inspectHost:()=>({ok:false,reason:'carrier_record_missing'}),
      registerEmptyHost:()=>({ok:false,reason:'test-must-not-spawn-host'})}),
    createUnifiedShardWriter,executeUnifiedFederatedTransfer,
    planUnifiedBulkService,
    // The source runs in VM while this pure policy module runs in Node.
    // Recreate an ordinary host-realm JSON value before the production
    // shape validator's strict Object.prototype check. In the actual
    // assembled Bedrock script both functions run in the SAME realm.
    inspectQ4OrdinaryDefinitionShape:definition=>
      inspectQ4OrdinaryDefinitionShape(
        JSON.parse(JSON.stringify(definition))),
    uceClassifyLiveStack:()=> 'ORDINARY',
    ItemStack:class{
      constructor(typeId,amount){
        this.typeId=typeId;this.amount=amount;this.maxAmount=64;
      }
      isStackableWith(other){return other?.typeId===this.typeId;}
    },
    uceNativeReceiptId:()=> 'interbank-op-'+(++moves),
    ucePerfTimedOperation:(_,action)=>action(),
    ucePerfRecordMove:()=>{},
    ucePerfSampleShard:()=>{},
    uceBridgeLog:(...parts)=>logs.push(parts.join(' ')),
    uceCarrierRegistrationReason:r=>r?.reason||'unknown',
    uceOrdinaryHopperCandidate:()=>remoteBankSeeded?{
      slot:0,partialOutput:false,beforeAmount:0,room:64}:undefined,
    hopperIsRedstoneLocked:()=>false
  };
  vm.runInNewContext(executable,ctx);
  const read=(key)=>createUnifiedShardWriter({
    world,shardKey:key,worldId,epoch,externalFence:()=>true}).inspect();
  return {ctx,first,last,collector,collectorBlock,destination,
    outputHopper,remoteBankId,saved,world,read,logs,
    get writes(){return writes}};
}
test('integrated UCE scheduler journals a real Filter-directed interbank handoff exactly once',()=>{
  const f=fixture();
  const item=new f.ctx.ItemStack('minecraft:cobblestone',1);
  assert.equal(inspectQ4OrdinaryDefinitionShape(JSON.parse(key)).ok,true);
  assert.ok(f.ctx.ucePipeRouteNetwork(f.first),
    'source pipe graph must be physically loaded and owned');
  assert.ok(f.ctx.ucePipeRouteNetwork(f.last),
    'target pipe graph must be physically loaded and owned');
  assert.equal(f.ctx.uceChoosePipeDestination(
    f.last,item,true,undefined,true)?.mode,'filter',
    'remote Filter must be an eligible native destination');
  assert.ok(f.ctx.uceSelectInterbankFilteredRoute(
    f.first,f.ctx.ucePipeRouteNetwork(f.first),item,{worldId,epoch}),
    'Collector edge and remote Filter must form a live interbank path');
  const moved=f.ctx.uceOrdinaryServiceTick({worldId,epoch});
  assert.equal(moved,true);
  assert.equal(f.read(shardA).snapshot.total,36);
  assert.equal(f.read(shardB).snapshot.total,64);
  assert.equal(f.read(shardA).snapshot.total+
               f.read(shardB).snapshot.total,100);
  assert.equal(f.saved.has(UCE_FEDERATED_INTENT_KEY),false);
  assert.equal(f.read(shardA).lastReceipt.kind,'FEDERATED_DEBIT');
  assert.equal(f.read(shardB).lastReceipt.kind,'FEDERATED_CREDIT');
  assert.equal(f.destination.getComponent('minecraft:inventory').container
    .getItem(0),undefined,'virtual transfer did not duplicate physical output');
});
test('integrated UCE scheduler conserves custody through seeded remote Auto fallback',()=>{
  const f=fixture({remoteMode:'auto'});
  const item=new f.ctx.ItemStack('minecraft:cobblestone',1);
  const route=f.ctx.uceSelectInterbankFilteredRoute(
    f.first,f.ctx.ucePipeRouteNetwork(f.first),item,{worldId,epoch});
  assert.equal(route?.remote.mode,'auto');
  assert.equal(route?.remote.priority,1);
  assert.ok(route.witness.endsWith('|A'));
  const transferred=f.ctx.uceOrdinaryServiceTick({worldId,epoch});
  assert.equal(transferred,true,'same global two-shard custody writer');
  assert.equal(f.read(shardA).snapshot.total,36);
  assert.equal(f.read(shardB).snapshot.total,64);
  assert.equal(f.read(shardA).snapshot.total+
               f.read(shardB).snapshot.total,100);
  assert.equal(f.saved.has(UCE_FEDERATED_INTENT_KEY),false);
  assert.equal(f.read(shardA).lastReceipt.kind,'FEDERATED_DEBIT');
  assert.equal(f.read(shardB).lastReceipt.kind,'FEDERATED_CREDIT');
  assert.equal(f.destination.getComponent('minecraft:inventory').container
    .getItem(2).amount,12,
    'Auto seed remains physical: virtual forwarding creates no duplicate');
});
test('interbank mid-transaction Collector relink preserves PREPARED and neither shard debits',()=>{
  const f=fixture({afterPreparedLinkChange:true});
  const result=f.ctx.uceOrdinaryServiceTick({worldId,epoch});
  assert.notEqual(result,true);
  assert.equal(f.read(shardA).snapshot.total,100);
  assert.equal(f.read(shardB).snapshot.total,0);
  assert.equal(JSON.parse(f.saved.get(UCE_FEDERATED_INTENT_KEY)).phase,
    'PREPARED');
  assert.notEqual(f.ctx.uceOrdinaryServiceTick({worldId,epoch}),true,
    'pending global journal prohibits any auto-retry');
  assert.equal(f.read(shardA).snapshot.total,100);
});
test('interbank debit-write uncertainty HOLDS globally instead of repeating sender debit',()=>{
  const f=fixture({throwAfterDebit:true});
  assert.notEqual(f.ctx.uceOrdinaryServiceTick({worldId,epoch}),true);
  assert.equal(f.read(shardA).snapshot.total,36,
    'source debit may have persisted before injected error');
  assert.equal(f.read(shardB).snapshot.total,0);
  assert.equal(f.saved.has(UCE_FEDERATED_INTENT_KEY),true);
  assert.equal(JSON.parse(f.saved.get(UCE_FEDERATED_INTENT_KEY)).phase,
    'PREPARED');
});
test('full remote Receiver cannot be overcredited by Collector forwarding',()=>{
  const f=fixture({destinationTotal:250000});
  assert.notEqual(f.ctx.uceOrdinaryServiceTick({worldId,epoch}),true);
  assert.equal(f.read(shardA).snapshot.total,100);
  assert.equal(f.read(shardB).snapshot.total,250000);
  assert.equal(f.saved.has(UCE_FEDERATED_INTENT_KEY),false);
});

test('integrated Receiver scheduler refills native output from remote Bulk without physical duplication',()=>{
  const f=fixture({remoteBankSeeded:true});
  const before=f.read(shardA).snapshot.total+
    f.read(shardB).snapshot.total;
  assert.equal(before,128);
  const graph=f.ctx.ucePipeRouteNetwork(f.first);
  assert.ok(graph,'source Receiver must have one verified physical pipe graph');
  const options=f.ctx.uceLinkedBankBulkRoutes(
    f.first,undefined,{worldId,epoch},graph,false);
  assert.equal(options?.length,1,
    'source Receiver must discover its linked remote Bulk bank');
  const item=new f.ctx.ItemStack('minecraft:cobblestone',1);
  assert.equal(f.ctx.uceRemoteBulkPreferredOutput(f.first,item),true,
    'native Hopper must be an accepting original output');
  const transferred=f.ctx.uceOrdinaryServiceTick({worldId,epoch});
  assert.equal(transferred,true,
    'real scheduler must commit the same two-shard journal: '+
    f.logs.join(' | '));
  assert.equal(f.read(shardA).snapshot.total,64);
  assert.equal(f.read(shardB).snapshot.total,64);
  assert.equal(f.read(shardA).snapshot.total+
    f.read(shardB).snapshot.total,before);
  assert.equal(f.read(shardA).lastReceipt.kind,'FEDERATED_CREDIT');
  assert.equal(f.read(shardB).lastReceipt.kind,'FEDERATED_DEBIT');
  assert.equal(f.saved.has(UCE_FEDERATED_INTENT_KEY),false);
  assert.equal(f.outputHopper.getComponent('minecraft:inventory')
    .container.getItem(0),undefined,
    'virtual refill is followed by the existing physical egress writer');
});
test('integrated remote Bulk refill cannot survive an exact Collector link revocation at PREPARED',()=>{
  const f=fixture({remoteBankSeeded:true,afterPreparedLinkChange:true});
  const result=f.ctx.uceOrdinaryServiceTick({worldId,epoch});
  assert.notEqual(result,true);
  assert.equal(f.read(shardA).snapshot.total,0);
  assert.equal(f.read(shardB).snapshot.total,128);
  assert.equal(f.saved.has(UCE_FEDERATED_INTENT_KEY),true,
    'exact protected route must have entered PREPARED: '+
    f.logs.join(' | '));
  assert.equal(JSON.parse(f.saved.get(UCE_FEDERATED_INTENT_KEY)).phase,
    'PREPARED','revocation cannot silently clear an ambiguous transaction');
});
