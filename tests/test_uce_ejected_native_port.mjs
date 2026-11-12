import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnifiedNativePort,UCE_NATIVE_INTENT_KEY} from
  '../candidates/transport/unified_native_custody.mjs';
import {UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA} from
  '../candidates/transport/unified_world_shard_writer.mjs';

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
