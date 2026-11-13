import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {createEmptyUnifiedOrdinaryLedger,
  registerUnifiedEmptyAccount,inspectUnifiedOrdinaryLedger} from
  '../candidates/transport/unified_ordinary_accounts.mjs';
import {createUnifiedShardWriter,previewUnifiedShard,
  UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA,
  UCE_FEDERATED_INTENT_KEY} from
  '../candidates/transport/unified_world_shard_writer.mjs';
import {executeUnifiedFederatedTransfer} from
  '../candidates/transport/unified_federated_service.mjs';
import {planUnifiedBulkService} from
  '../candidates/transport/unified_bulk_policy.mjs';
import {inspectQ4OrdinaryDefinitionShape} from
  '../candidates/transport/q5_ordinary_shape_gate.mjs';

/*
 * Actual-source/assembled-runtime interbank Bulk orchestrator and actual
 * world shard writers, global PREPARED journal and ordinary ledger kernel.
 * Only Minecraft block/Collector topology probes are simulated. These are
 * offline transaction safety results, NOT BDS/disk-atomicity proof.
 */
const original=fs.readFileSync(new URL(
  '../candidates/uce/runtime_remote_bulk_bridge.js',import.meta.url),
  'utf8');
let implementation=original;
if(process.env.UCE_GENERATED_MAIN){
  const compiled=fs.readFileSync(process.env.UCE_GENERATED_MAIN,'utf8');
  const mark=compiled.lastIndexOf(
    'UCE existing-ledger cross-BANK Bulk routing adapter.');
  const start=mark>=0?compiled.lastIndexOf('/*',mark):-1;
  assert.ok(start>=0,'generated addon missing remote Bulk adapter');
  implementation=compiled.slice(start);
}
const worldId='minecraft:overworld:uce-remote-bulk',epoch=25;
const src={id:'minecraft:overworld|4|70|4',
  d:'minecraft:overworld',x:4,y:70,z:4,present:true};
const dst={id:'minecraft:overworld|24|70|4',
  d:'minecraft:overworld',x:24,y:70,z:4,present:true};
const srcShard='hartlogistics:uce_shard_0001_v1';
const dstShard='hartlogistics:uce_shard_0002_v1';
const bankOwnerId='minecraft:overworld|22|70|4';
const key=q5IdentityKey({typeId:'minecraft:cobblestone',lore:[],
  ench:[],canDestroy:[],canPlaceOn:[]});
const witness='IBB1|source|verified-collector|remote-bank-owner';
function makeLedger(owners,counts={}){
  let snap=createEmptyUnifiedOrdinaryLedger({worldId,epoch}).snapshot;
  for(const [kind,ownerId] of owners){
    const r=registerUnifiedEmptyAccount(snap,{kind,ownerId,
      expectedRevision:snap.revision,expectedEpoch:epoch});
    assert.equal(r.ok,true,r.reason);
    snap=r.next;
  }
  for(const account of snap.accounts){
    const value=counts[account.id]||0;
    account.total=value;
    account.buckets=value?[{key,count:value}]:[];
    snap.total+=value;
  }
  assert.equal(inspectUnifiedOrdinaryLedger(snap).ok,true);
  return snap;
}
function fixture({remoteFull=false,badController=false,
                 revokeOnPrepared=false,invalidPath=false,
                 sourceWaiting=false,hopperAccepts=null}={}){
  const a=makeLedger([['receiver',src.id]],{
    ['receiver:'+src.id]:128
  });
  const b=makeLedger([
    ['receiver',dst.id],['bulk',bankOwnerId]
  ],remoteFull?{['bulk:'+bankOwnerId]:200000}:{});
  if(badController){
    const bank=b.accounts.find(x=>x.kind==='bulk');
    bank.controllerOwnerId='missing-controller';
  }
  const rawA=previewUnifiedShard({snapshot:a,shardKey:srcShard});
  assert.equal(rawA.ok,true,rawA.reason);
  const initialB=remoteFull?
    previewUnifiedShard({snapshot:b,shardKey:dstShard}):
    badController?undefined:
    previewUnifiedShard({snapshot:b,shardKey:dstShard});
  if(!badController)assert.equal(initialB.ok,true,initialB.reason);
  const saved=new Map([[UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',worldId,epoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  })],[srcShard,rawA.raw],
    [dstShard,badController?'invalid-shard':initialB.raw]]);
  let writes=0,routeActive=!invalidPath;
  const world={
    getDynamicProperty:k=>saved.get(k),
    setDynamicProperty(k,v){
      writes++;
      if(v===undefined)saved.delete(k);else saved.set(k,v);
      if(revokeOnPrepared&&k===UCE_FEDERATED_INTENT_KEY&&v&&
         JSON.parse(v).phase==='PREPARED')
        routeActive=false;
    }
  };
  const graphBank={ownerId:bankOwnerId};
  const route={receiver:dst,leaderId:dst.id,
    bankOwnerId,witness,
    graph:{banks:[graphBank]},path:[{kind:'collector'}]};
  const authority={worldId,epoch};
  let operationNumber=0;
  const context={
    world,
    uceOrdinaryAccountSource:(_,id)=>
      id===src.id?srcShard:id===dst.id?dstShard:undefined,
    uceBulkOwnerId:b=>b.ownerId,
    ucePipeRouteNetwork:()=>({receiverIds:[src.id],banks:[]}),
    uceLinkedBankBulkRoutes:()=>routeActive?[route]:undefined,
    // The VM item definition is parsed in a different JS realm from the
    // imported pure identity validator. Production runs in ONE realm;
    // normalize only the mock boundary, without relaxing the real gate.
    inspectQ4OrdinaryDefinitionShape:definition=>
      inspectQ4OrdinaryDefinitionShape(
        JSON.parse(JSON.stringify(definition))),
    ItemStack:class {
      constructor(typeId,amount){
        this.typeId=typeId;this.amount=amount;this.maxAmount=64;
      }
    },
    uceClassifyLiveStack:s=>s.typeId==='minecraft:cobblestone'?
      'ORDINARY':'MR',
    createUnifiedShardWriter,
    planUnifiedBulkService,
    executeUnifiedFederatedTransfer,
    uceNativeReceiptId:()=>'remote-bulk-operation-'+(++operationNumber),
    uceLegacyWriterBlocked:()=>true,
    uceAuthoritySnapshot:()=>authority,
    ucePerfTimedOperation:(_,fn)=>fn(),
    ucePerfRecordMove:()=>{},
    receiverOutputHopper:()=>hopperAccepts===null?undefined:{
      container:{isValid:true,size:5},locked:false},
    uceOrdinaryHopperCandidate:()=>hopperAccepts===true,
    receiverAt:()=>({typeId:'hartsorter:receiver'}),
    blockIsRedstonePowered:()=>false,
    uceChoosePipeDestination:()=>undefined
  };
  vm.runInNewContext(implementation,context);
  const proof=(tx,direction)=>
    context.uceInterbankBulkRouteVerified(
      authority,src,tx,direction);
  const sourceWriter=createUnifiedShardWriter({
    world,shardKey:srcShard,worldId,epoch,
    externalFence:()=>true,verifyFederatedRoute:proof
  });
  assert.equal(sourceWriter.ok,true,sourceWriter.reason);
  const account=sourceWriter.inspect().snapshot.accounts.find(
    x=>x.id==='receiver:'+src.id);
  const run=()=>context.uceTryRemoteBulkTransfer(
    authority,src,srcShard,sourceWriter,account,sourceWaiting);
  const view=shardKey=>createUnifiedShardWriter({
    world,worldId,epoch,shardKey,externalFence:()=>false
  }).inspect();
  return {run,view,saved,world,srcAccount:account,
    set routeActive(v){routeActive=v;},
    get writes(){return writes},
    get operationNumber(){return operationNumber}};
}
test('one actual globally journaled two-shard Receiver→remote-Bulk transfer conserves 128 source items',()=>{
  const f=fixture(),r=f.run();
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'REMOTE_BULK_TRANSFER_COMMITTED');
  assert.equal(r.count,64);
  assert.equal(f.view(srcShard).snapshot.total,64);
  const target=f.view(dstShard);
  assert.equal(target.snapshot.total,64);
  assert.equal(f.view(srcShard).snapshot.total+target.snapshot.total,128);
  assert.equal(target.snapshot.accounts.find(x=>x.kind==='bulk').total,64);
  assert.equal(f.saved.has(UCE_FEDERATED_INTENT_KEY),false);
  assert.equal(f.view(srcShard).lastReceipt.kind,'FEDERATED_DEBIT');
  assert.equal(target.lastReceipt.kind,'FEDERATED_CREDIT');
  assert.equal(f.writes,6,'one global PREPARED and two saved receipts');
});
test('full remote Bulk is not spendable and leaves source/custody untouched',()=>{
  const f=fixture({remoteFull:true}),r=f.run();
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'REMOTE_BULK_NO_SPENDABLE_ROUTE');
  assert.equal(f.writes,0);
  assert.equal(f.view(srcShard).snapshot.total,128);
  assert.equal(f.view(dstShard).snapshot.total,200000);
});
test('unregistered or corrupt remote controller HOLDs before any source debit',()=>{
  const f=fixture({badController:true}),r=f.run();
  assert.equal(r.ok,false);
  assert.equal(f.writes,0);
  assert.equal(f.view(srcShard).snapshot.total,128);
});
test('unverified Collector route cannot authorize remote Bulk custody',()=>{
  const f=fixture({invalidPath:true}),r=f.run();
  assert.equal(r.ok,false);
  assert.equal(f.writes,0);
  assert.equal(f.view(srcShard).snapshot.total,128);
});
test('a Collector link revoked at PREPARED leaves one global pending intent and no speculative replay',()=>{
  const f=fixture({revokeOnPrepared:true}),r=f.run();
  assert.equal(r.ok,false);
  assert.equal(f.saved.has(UCE_FEDERATED_INTENT_KEY),true);
  assert.equal(f.view(srcShard).snapshot.total,128);
  assert.equal(f.view(dstShard).snapshot.total,0);
});
test('source ingress backpressure does not spill a low-water Receiver into remote Bulk',()=>{
  const f=fixture({sourceWaiting:true}),r=f.run();
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'REMOTE_BULK_SOURCE_PRIORITY');
  assert.equal(f.writes,0);
  assert.equal(f.view(srcShard).snapshot.total,128);
});

test('full original output Hopper can spill to remote governed Bulk with exact two-shard receipts',()=>{
  const f=fixture({hopperAccepts:false}),r=f.run();
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'REMOTE_BULK_TRANSFER_COMMITTED');
  assert.equal(f.view(srcShard).snapshot.total,64);
  assert.equal(f.view(dstShard).snapshot.total,64);
  assert.equal(f.saved.has(UCE_FEDERATED_INTENT_KEY),false);
});
test('newly accepting original output Hopper takes priority over remote Bulk with no journal write',()=>{
  const f=fixture({hopperAccepts:true}),r=f.run();
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'REMOTE_BULK_NO_SPENDABLE_ROUTE');
  assert.equal(f.writes,0);
  assert.equal(f.view(srcShard).snapshot.total,128);
  assert.equal(f.view(dstShard).snapshot.total,0);
});
