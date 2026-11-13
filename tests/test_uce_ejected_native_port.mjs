import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnifiedNativePort,UCE_NATIVE_INTENT_KEY} from
  '../candidates/transport/unified_native_custody.mjs';
import {UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA,
  createUnifiedShardWriter,previewUnifiedShard,
  verifyUnifiedMutationFence} from
  '../candidates/transport/unified_world_shard_writer.mjs';
import {createEmptyUnifiedOrdinaryLedger,registerUnifiedEmptyAccount,
  inspectUnifiedOrdinaryLedger} from
  '../candidates/transport/unified_ordinary_accounts.mjs';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {executeUnifiedEjectedOrdinaryDeposit,
  UCE_ORDINARY_BOUNDARY_KEY} from
  '../candidates/transport/unified_ordinary_service.mjs';

const worldId='archived-bds-lab-copy',epoch=84;
const original={typeId:'minecraft:enchanted_book',amount:1,
  nameTag:'Enchanted owner keeps this',lore:['opaque MR'],
  hiddenNbt:{enchants:{mending:1},custom:'nonserialized'}};
const clone=x=>x===undefined?undefined:structuredClone(x);
function fixture(options={}){
  const values=new Map([[UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',worldId,epoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  })]]);
  let writes=0,durable=false;
  const world={getDynamicProperty:key=>values.get(key),
    setDynamicProperty(key,value){
      writes++;
      if(value===undefined)values.delete(key);else values.set(key,value);
    }};
  const slots=[undefined,undefined],host={
    size:2,isValid:true,getItem:i=>clone(slots[i]),
    moveItem(){throw Error('not applicable');},
    setItem(i,stack){
      slots[i]=clone(stack);
      if(options.throwCopy)throw Error('native setItem uncertain');
    }};
  const entity={id:'entity-1',isValid:true,typeId:'minecraft:item',
    getComponent:name=>name==='minecraft:item'?{itemStack:clone(original)}:undefined,
    remove(){
      entity.isValid=false;
      if(options.throwRemoval)throw Error('entity removal uncertain');
    }};
  const ownerId='ejected-item|entity-1';
  const to={ownerId:'minecraft:overworld|4|70|5',container:host,slot:0};
  const port=createUnifiedNativePort({
    world,worldId,epoch,externalFence:()=>true,
    verifyEndpointOwner:ref=>ref.ownerId===ownerId?
      ref.entity===entity&&entity.isValid:ref.ownerId===to.ownerId,
    durableOwnershipWitness:j=>durable&&
      j.kind==='ENTITY_TO_NATIVE'&&j.entityId===entity.id
  });
  assert.equal(port.ok,true,port.reason);
  const args={operationId:'entity-copy-1',entity,sourceOwnerId:ownerId,to};
  return {port,args,entity,values,slots,
    setTicket:x=>{durable=x;},
    get writes(){return writes;}};
}
test('native item entity copies unchanged; ticket required before exact remove',()=>{
  const f=fixture();
  const staged=f.port.stageEjectedItem(f.args);
  assert.equal(staged.ok,true,staged.reason);
  assert.equal(staged.status,'ENTITY_COPIED_PENDING_TICKET_AND_REMOVAL');
  assert.deepEqual(f.slots[0],original);
  assert.equal(f.entity.isValid,true);
  assert.equal(JSON.parse(f.values.get(UCE_NATIVE_INTENT_KEY)).phase,
    'MOVED_INSPECTED');
  const unsafe=f.port.ackEjectedItem(f.args);
  assert.equal(unsafe.ok,false);
  assert.equal(unsafe.reason,'entity_ack_owner_or_ticket_unverified');
  assert.equal(f.entity.isValid,true);
  f.setTicket(true);
  const ack=f.port.ackEjectedItem(f.args);
  assert.equal(ack.ok,true,ack.reason);
  assert.equal(f.entity.isValid,false);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),false);
  assert.deepEqual(f.slots[0].hiddenNbt,original.hiddenNbt);
  assert.equal(f.writes,3);
});
test('uncertain native copy holds pending and does not remove original entity',()=>{
  const f=fixture({throwCopy:true});
  const result=f.port.stageEjectedItem(f.args);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'entity_copy_outcome_ambiguous');
  assert.equal(f.entity.isValid,true);
  assert.deepEqual(f.slots[0],original);
  assert.equal(JSON.parse(f.values.get(UCE_NATIVE_INTENT_KEY)).phase,
    'PREPARED');
  assert.equal(f.port.stageEjectedItem(f.args).ok,false);
});
test('remove throwing after effect leaves journal and blocks future attempts',()=>{
  const f=fixture({throwRemoval:true});
  assert.equal(f.port.stageEjectedItem(f.args).ok,true);
  f.setTicket(true);
  const ack=f.port.ackEjectedItem(f.args);
  assert.equal(ack.ok,false);
  assert.equal(ack.reason,'entity_remove_outcome_ambiguous');
  assert.equal(f.entity.isValid,false);
  assert.deepEqual(f.slots[0],original);
  assert.equal(JSON.parse(f.values.get(UCE_NATIVE_INTENT_KEY)).phase,
    'MOVED_INSPECTED');
  assert.equal(f.port.ackEjectedItem(f.args).ok,false);
});
test('foreign journal or missing native endpoints never copies entity item',()=>{
  const f=fixture();
  f.values.set('hartsorter:queue_journal_v1','pending');
  const result=f.port.stageEjectedItem(f.args);
  assert.equal(result.ok,false);
  assert.equal(f.slots[0],undefined);
  assert.equal(f.entity.isValid,true);
  assert.equal(f.writes,0);
});

/*
 * End-to-end original ordinary entity -> Receiver account path using the
 * ACTUAL native journal, ordinary boundary coordinator and real shard
 * writer, with only the Bedrock entity/inventory and ticket persistence
 * witness supplied by mocks. This is OFFLINE evidence, not BDS disk proof.
 */
const plainWorldId='ejected-plain-account',plainEpoch=31;
const plainReceiverId='minecraft:overworld|24|70|4';
const plainShard='hartlogistics:uce_shard_0001_v1';
const plainAccount='receiver:'+plainReceiverId;
const plainDefinition={typeId:'minecraft:cobblestone',lore:[],
  ench:[],canDestroy:[],canPlaceOn:[]};
const plainKey=q5IdentityKey(plainDefinition);
function ordinaryEntityFixture({full=false,changeOnPrepared=false,
                               revokeAfterEntityRemoval=false}={}){
  const values=new Map([[UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',
    worldId:plainWorldId,epoch:plainEpoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  })]]);
  let snapshot=createEmptyUnifiedOrdinaryLedger({
    worldId:plainWorldId,epoch:plainEpoch}).snapshot;
  const registered=registerUnifiedEmptyAccount(snapshot,{
    kind:'receiver',ownerId:plainReceiverId,
    expectedRevision:snapshot.revision,expectedEpoch:plainEpoch});
  assert.equal(registered.ok,true,registered.reason);
  snapshot=registered.next;
  if(full){
    const a=snapshot.accounts[0];
    a.total=a.capacity;
    a.buckets=[{key:plainKey,count:a.capacity}];
    snapshot.total=a.capacity;
    assert.equal(inspectUnifiedOrdinaryLedger(snapshot).ok,true);
  }
  const preview=previewUnifiedShard({
    snapshot,shardKey:plainShard});
  assert.equal(preview.ok,true,preview.reason);
  values.set(plainShard,preview.raw);
  const initial={
    typeId:'minecraft:cobblestone',amount:32,maxAmount:64};
  const clone=x=>x===undefined?undefined:structuredClone(x);
  const slots=Array(9).fill(undefined);
  const host={size:9,isValid:true,
    getItem:i=>clone(slots[i]),
    setItem:(i,x)=>{slots[i]=clone(x)},
    moveItem(){throw Error('entity stage must not use a physical move');}};
  const entity={id:'ordinary-entity-1',typeId:'minecraft:item',
    isValid:true,getComponent:n=>n==='minecraft:item'?
      {itemStack:clone(initial)}:undefined,
    remove(){this.isValid=false;}};
  const ownerId='collector-owner',anchor={
    dimensionId:'minecraft:overworld',x:3,y:69,z:5};
  const sourceOwnerId='ejected-item|'+entity.id;
  let linked=true,ticketed=false,writes=0;
  const world={
    getDynamicProperty:key=>values.get(key),
    setDynamicProperty(key,value){
      writes++;
      if(value===undefined)values.delete(key);
      else values.set(key,value);
      if(changeOnPrepared&&key===UCE_ORDINARY_BOUNDARY_KEY&&
         value&&JSON.parse(value).phase==='PREPARED')linked=false;
      if(revokeAfterEntityRemoval&&key===UCE_NATIVE_INTENT_KEY&&
         value===undefined&&!entity.isValid)linked=false;
    }
  };
  const operationId='ejected-ordinary-op-1';
  const registry={
    inspectCustody:()=>({ok:true,slots:ticketed?[0]:[],
      free:ticketed?8:9,occupied:ticketed?1:0}),
    stageMovedTicket:()=>{
      ticketed=host.getItem(0)!==undefined;
      return {ok:true};
    },
    durableOwnershipWitness:intent=>
      intent.kind==='ENTITY_TO_NATIVE'?ticketed&&
        intent.to.ownerId===ownerId&&intent.to.slot===0:
      intent.kind==='CONSUME_ORDINARY_ESCROW'?!ticketed:
      false
  };
  const writer=createUnifiedShardWriter({
    world,shardKey:plainShard,worldId:plainWorldId,
    epoch:plainEpoch,externalFence:()=>true,
    verifyEscrowCustody:tx=>linked&&ticketed&&
      tx.accountId===plainAccount&&tx.key===plainKey&&
      tx.count===initial.amount&&
      host.getItem(0)?.typeId===initial.typeId&&
      host.getItem(0)?.amount===initial.amount
  });
  assert.equal(writer.ok,true,writer.reason);
  const verifyReceipt=meta=>{
    const view=writer.inspect();
    const raw=values.get(UCE_ORDINARY_BOUNDARY_KEY);
    let intent;
    try{intent=JSON.parse(raw);}catch(_){return false;}
    return !!view.ok&&intent?.operationId===operationId&&
      intent.phase==='ESCROW_READY'&&
      view.lastReceipt?.kind==='BOUNDARY'&&
      view.lastReceipt.operationId===operationId&&
      view.lastReceipt.accountId===meta.accountId&&
      view.lastReceipt.key===meta.key&&
      view.lastReceipt.count===meta.count&&
      view.lastReceipt.direction===meta.direction;
  };
  const port=createUnifiedNativePort({
    world,worldId:plainWorldId,epoch:plainEpoch,
    boundaryOperationId:operationId,
    externalFence:()=>true,
    verifyEndpointOwner:ref=>
      ref.ownerId===ownerId?
        ref.container===host&&linked:
      ref.ownerId===sourceOwnerId?
        ref.entity===entity&&entity.isValid&&linked:
      false,
    durableOwnershipWitness:registry.durableOwnershipWitness,
    certifyOrdinaryEscrow:(item,key,count)=>!!item&&
      item.typeId===initial.typeId&&
      item.amount===initial.amount&&
      key===plainKey&&count===initial.amount,
    verifyLedgerBoundaryReceipt:verifyReceipt
  });
  assert.equal(port.ok,true,port.reason);
  const run=()=>executeUnifiedEjectedOrdinaryDeposit({
    world,worldId:plainWorldId,epoch:plainEpoch,
    operationId,accountId:plainAccount,key:plainKey,
    count:initial.amount,registry,port,writer,ownerId,anchor,
    carrierSlot:{ownerId,container:host,slot:0},
    entity,sourceOwnerId,verifyRoute:()=>linked,
    verifyOrdinary:meta=>entity.isValid&&linked&&
      meta.accountId===plainAccount&&meta.key===plainKey&&
      meta.count===initial.amount&&meta.direction==='deposit'
  });
  return {run,view:()=>writer.inspect(),values,world,entity,host,
    get ticketed(){return ticketed;},
    get writes(){return writes;},
    revoke:()=>{linked=false}};
}
test('ordinary ejected entity credits one real Receiver shard and retires native escrow once',()=>{
  const f=ordinaryEntityFixture(),result=f.run();
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.count,32);
  assert.equal(result.direction,'deposit');
  assert.equal(f.entity.isValid,false);
  assert.equal(f.host.getItem(0),undefined);
  assert.equal(f.ticketed,false);
  assert.equal(f.view().snapshot.total,32);
  assert.equal(f.view().lastReceipt.kind,'BOUNDARY');
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),false);
  assert.equal(f.values.has(UCE_ORDINARY_BOUNDARY_KEY),false);
  assert.equal(f.run().ok,false,'original entity cannot be spent twice');
  assert.equal(f.view().snapshot.total,32);
});
test('full sealed Receiver refuses ordinary ejected item before any physical copy or journal',()=>{
  const f=ordinaryEntityFixture({full:true}),result=f.run();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'ordinary_account_at_capacity');
  assert.equal(f.entity.isValid,true);
  assert.equal(f.host.getItem(0),undefined);
  assert.equal(f.view().snapshot.total,250000);
  assert.equal(f.values.has(UCE_ORDINARY_BOUNDARY_KEY),false);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),false);
});
test('Collector relink at PREPARED preserves original entity and global HOLD',()=>{
  const f=ordinaryEntityFixture({changeOnPrepared:true}),result=f.run();
  assert.equal(result.ok,false);
  assert.equal(f.entity.isValid,true);
  assert.equal(f.host.getItem(0),undefined);
  assert.equal(f.view().snapshot.total,0);
  assert.equal(f.values.has(UCE_ORDINARY_BOUNDARY_KEY),true);
  assert.equal(verifyUnifiedMutationFence(
    f.world,plainWorldId,plainEpoch,()=>true).ok,false);
});
test('route revoked after exact entity ACK leaves one protected escrow and no speculative ordinary credit',()=>{
  const f=ordinaryEntityFixture({revokeAfterEntityRemoval:true});
  const result=f.run();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'ejected_route_changed_after_native_ack');
  assert.equal(f.entity.isValid,false);
  assert.equal(f.host.getItem(0).amount,32);
  assert.equal(f.ticketed,true);
  assert.equal(f.view().snapshot.total,0);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),false);
  assert.equal(f.values.has(UCE_ORDINARY_BOUNDARY_KEY),true);
  assert.equal(f.run().ok,false,'ambiguous boundary is not replayable');
  assert.equal(f.view().snapshot.total,0);
});
