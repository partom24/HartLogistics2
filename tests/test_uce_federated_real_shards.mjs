import test from 'node:test';
import assert from 'node:assert/strict';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {createEmptyUnifiedOrdinaryLedger,registerUnifiedEmptyAccount,
  inspectUnifiedOrdinaryLedger} from
  '../candidates/transport/unified_ordinary_accounts.mjs';
import {createUnifiedShardWriter,previewUnifiedShard,
  verifyUnifiedMutationFence,UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA,
  UCE_FEDERATED_INTENT_KEY} from
  '../candidates/transport/unified_world_shard_writer.mjs';
import {executeUnifiedFederatedTransfer,
  planUnifiedFederatedNetwork} from
  '../candidates/transport/unified_federated_service.mjs';

const worldId='minecraft:overworld:federated-test',epoch=12;
const fromShard='hartlogistics:uce_shard_0001_v1';
const toShard='hartlogistics:uce_shard_0002_v1';
const fromAccount='receiver:receiv-a',toAccount='bulk:bank-a';
const key=q5IdentityKey({typeId:'minecraft:cobblestone',lore:[],
  ench:[],canDestroy:[],canPlaceOn:[]});
function fixture({failAt,receiverCount=100,bankCount=0}={}){
  const data=new Map([[UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',worldId,epoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  })]]);
  function ledger(kind,ownerId,total){
    let snap=createEmptyUnifiedOrdinaryLedger({worldId,epoch}).snapshot;
    const reg=registerUnifiedEmptyAccount(snap,{kind,ownerId,
      expectedRevision:0,expectedEpoch:epoch});
    assert.equal(reg.ok,true,reg.reason);
    snap=reg.next;
    const a=snap.accounts[0];
    a.total=total;
    a.buckets=total?[{key,count:total}]:[];
    snap.total=total;
    assert.equal(inspectUnifiedOrdinaryLedger(snap).ok,true);
    return snap;
  }
  data.set(fromShard,previewUnifiedShard({
    snapshot:ledger('receiver','receiv-a',receiverCount),
    shardKey:fromShard}).raw);
  data.set(toShard,previewUnifiedShard({
    snapshot:ledger('bulk','bank-a',bankCount),
    shardKey:toShard}).raw);
  let writes=0;
  const world={
    getDynamicProperty:k=>data.get(k),
    setDynamicProperty(k,v){
      writes++;
      if(v===undefined)data.delete(k);else data.set(k,v);
      if(failAt===writes)throw Error('injected_after_write');
    }
  };
  let routeValid=true;
  const opts={world,worldId,epoch,externalFence:()=>true,
    verifyFederatedRoute:()=>routeValid};
  const sourceWriter=createUnifiedShardWriter({
    ...opts,shardKey:fromShard});
  const destinationWriter=createUnifiedShardWriter({
    ...opts,shardKey:toShard});
  assert.equal(sourceWriter.ok,true);
  assert.equal(destinationWriter.ok,true);
  const args={world,worldId,epoch,operationId:'federated-safe-op-1',
    sourceWriter,destinationWriter,fromShard,toShard,fromAccount,
    toAccount,key,count:32,externalFence:()=>true,
    verifyRoute:()=>routeValid};
  return {data,world,sourceWriter,destinationWriter,args,
    get writes(){return writes;},
    set routeValid(v){routeValid=v;}};
}
test('one exclusive global intent transfers 32 virtual ordinary items between two existing shards',()=>{
  const f=fixture();
  const r=executeUnifiedFederatedTransfer(f.args);
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'FEDERATED_TWO_SHARD_TRANSFER_READBACK');
  assert.equal(f.data.has(UCE_FEDERATED_INTENT_KEY),false);
  const src=f.sourceWriter.inspect(),dst=f.destinationWriter.inspect();
  assert.equal(src.snapshot.total,68);
  assert.equal(dst.snapshot.total,32);
  assert.equal(src.snapshot.total+dst.snapshot.total,100);
  assert.equal(src.lastReceipt.kind,'FEDERATED_DEBIT');
  assert.equal(dst.lastReceipt.kind,'FEDERATED_CREDIT');
  assert.equal(src.lastReceipt.operationId,dst.lastReceipt.operationId);
  assert.equal(src.snapshot.accounts[0].lifetime.delivered,32);
  assert.equal(f.writes,6,'prepare/debit/mark/credit/mark/clear');
});
test('virtual cross-shard transfer refuses an absent route or excess capacity before PREPARED',()=>{
  const f=fixture();
  f.routeValid=false;
  const bad=executeUnifiedFederatedTransfer(f.args);
  assert.equal(bad.ok,false);
  assert.equal(bad.reason,'federated_live_route_not_verified');
  assert.equal(f.writes,0);
  f.routeValid=true;
  const tooMuch=executeUnifiedFederatedTransfer({...f.args,count:101});
  assert.equal(tooMuch.ok,false);
  assert.equal(f.data.has(UCE_FEDERATED_INTENT_KEY),false);
});
test('uncertain source debit preserves global PREPARED journal and fences every other writer',()=>{
  const f=fixture({failAt:2});
  const r=executeUnifiedFederatedTransfer(f.args);
  assert.equal(r.ok,false);
  assert.equal(r.pendingReconciliation,true);
  const tx=JSON.parse(f.data.get(UCE_FEDERATED_INTENT_KEY));
  assert.equal(tx.phase,'PREPARED');
  assert.equal(f.sourceWriter.inspect().snapshot.total,68,
    'source debit may have been persisted before callback threw');
  assert.equal(f.destinationWriter.inspect().snapshot.total,0);
  const other=verifyUnifiedMutationFence(
    f.world,worldId,epoch,()=>true);
  assert.equal(other.ok,false);
  assert.equal(other.reason,'federated_intent_pending_global');
  const retry=executeUnifiedFederatedTransfer(f.args);
  assert.equal(retry.ok,false);
  assert.equal(retry.reason,'federated_fence:federated_intent_pending_global');
});
test('uncertain destination credit preserves intent; no speculative replay',()=>{
  const f=fixture({failAt:4});
  const r=executeUnifiedFederatedTransfer(f.args);
  assert.equal(r.ok,false);
  assert.equal(r.pendingReconciliation,true);
  assert.equal(f.sourceWriter.inspect().snapshot.total,68);
  assert.equal(f.destinationWriter.inspect().snapshot.total,32);
  assert.equal(JSON.parse(f.data.get(UCE_FEDERATED_INTENT_KEY)).phase,
    'DEBIT_INSPECTED');
  assert.equal(verifyUnifiedMutationFence(
    f.world,worldId,epoch,()=>true).ok,false);
});

test('cross-shard transfers may refill an empty follower Receiver from leader Bulk',()=>{
  const f=fixture({receiverCount:0,bankCount:70});
  const reverse={...f.args,
    operationId:'cross-shard-refill-1',count:16,
    sourceWriter:f.destinationWriter,
    destinationWriter:f.sourceWriter,
    fromShard:toShard,toShard:fromShard,
    fromAccount:toAccount,toAccount:fromAccount
  };
  const r=executeUnifiedFederatedTransfer(reverse);
  assert.equal(r.ok,true,r.reason);
  assert.equal(f.sourceWriter.inspect().snapshot.total,16);
  assert.equal(f.destinationWriter.inspect().snapshot.total,54);
  assert.equal(f.data.has(UCE_FEDERATED_INTENT_KEY),false);
});
test('federated plan holds when network membership, controller or shard provenance is incomplete',()=>{
  const f=fixture();
  const options={followerSnapshot:f.sourceWriter.inspect().snapshot,
    leaderSnapshot:f.destinationWriter.inspect().snapshot,
    receiverOwnerId:'receiv-a',leaderOwnerId:'leader-1',
    connectedBankOwnerIds:['bank-a']};
  // Add the missing leader Receiver using the SAME ledger kernel, not a
  // synthetic shadow account: the controller must own a physical anchor.
  let snap=options.leaderSnapshot;
  const reg=registerUnifiedEmptyAccount(snap,{
    kind:'receiver',ownerId:'leader-1',
    expectedRevision:snap.revision,expectedEpoch:epoch});
  assert.equal(reg.ok,true,reg.reason);
  options.leaderSnapshot=reg.next;
  const result=planUnifiedFederatedNetwork(options);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.direction,'receiver_to_bulk');
  assert.equal(result.count,64);
  assert.equal(result.to,toAccount);
  const missing=planUnifiedFederatedNetwork({
    ...options,connectedBankOwnerIds:['bank-a','missing']});
  assert.equal(missing.ok,false);
  assert.equal(missing.reason,'federated_bank_not_registered_in_leader_shard');
  const sameOwner=planUnifiedFederatedNetwork({
    ...options,leaderOwnerId:'receiv-a'});
  assert.equal(sameOwner.ok,false);
});
test('federated plan honors preferred Sorter, source backpressure and bidirectional refill',()=>{
  const a=fixture();
  const b=fixture({receiverCount:0,bankCount:40});
  function opts(f){
    const l=f.destinationWriter.inspect().snapshot;
    const reg=registerUnifiedEmptyAccount(l,{
      kind:'receiver',ownerId:'leader-1',
      expectedRevision:l.revision,expectedEpoch:epoch});
    assert.equal(reg.ok,true);
    return {followerSnapshot:f.sourceWriter.inspect().snapshot,
      leaderSnapshot:reg.next,receiverOwnerId:'receiv-a',
      leaderOwnerId:'leader-1',connectedBankOwnerIds:['bank-a']};
  }
  assert.equal(planUnifiedFederatedNetwork({
    ...opts(a),preferredOutputKeys:[key]}).reason,
    'preferred_sorter_output_ready');
  assert.equal(planUnifiedFederatedNetwork({
    ...opts(a),sourceWaiting:true}).status,'IDLE');
  const refill=planUnifiedFederatedNetwork({
    ...opts(b),outputEligibleKeys:[key]});
  assert.equal(refill.ok,true,refill.reason);
  assert.equal(refill.direction,'bulk_to_receiver');
  assert.equal(refill.count,40);
  assert.equal(planUnifiedFederatedNetwork(opts(b)).status,'IDLE');
});
