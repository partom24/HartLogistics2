import test from 'node:test';
import assert from 'node:assert/strict';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {createEmptyUnifiedOrdinaryLedger,
  registerUnifiedEmptyAccount} from '../candidates/transport/unified_ordinary_accounts.mjs';
import {previewUnifiedShard,createUnifiedShardWriter,
  UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA} from
  '../candidates/transport/unified_world_shard_writer.mjs';
import {createUnifiedCarrierRegistry,UCE_CARRIER_TYPE} from
  '../candidates/transport/unified_carrier_registry.mjs';
import {createUnifiedNativePort,UCE_NATIVE_INTENT_KEY} from
  '../candidates/transport/unified_native_custody.mjs';

const worldId='minecraft:overworld:ordinary-custody',epoch=31;
const receiver='minecraft:overworld|10|70|10';
const accountId='receiver:'+receiver;
const anchor={dimensionId:'minecraft:overworld',x:10,y:70,z:10};
const shardKey='hartlogistics:uce_shard_region1_v1';
const boundaryKey='hartlogistics:uce_boundary_intent_v1';
const outerId='ordinary-receipt-31';
const nativeMoveId='ordinary-native-in-31';
const consumeId='ordinary-consumed-31';
const definition={typeId:'minecraft:cobblestone',lore:[],ench:[],
  canDestroy:[],canPlaceOn:[]};
const key=q5IdentityKey(definition);
const physical={typeId:'minecraft:cobblestone',amount:64,nameTag:'',
  lore:[],maxAmount:64,hiddenMetadata:{none:true}};

function container(size=9,item=undefined){
  const slots=Array(size).fill(undefined);
  if(item!==undefined)slots[0]=structuredClone(item);
  return {size,isValid:true,
    getItem:i=>{
      if(slots[i]===undefined)return undefined;
      const s=structuredClone(slots[i]);
      s.getLore=()=>[...(s.lore||[])];
      return s;
    },
    moveItem(i,j,to){
      if(slots[i]===undefined||to.peek(j)!==undefined)
        throw Error('native-move-unsafe');
      to.put(j,slots[i]);slots[i]=undefined;
    },
    setItem(i,v){slots[i]=v===undefined?undefined:structuredClone(v);},
    peek:i=>slots[i],
    put:(i,v)=>{slots[i]=structuredClone(v);}
  };
}
function fixture(opts={}){
  const values=new Map();
  values.set(UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',worldId,epoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  }));
  let ledger=createEmptyUnifiedOrdinaryLedger({worldId,epoch}).snapshot;
  const reg=registerUnifiedEmptyAccount(ledger,{kind:'receiver',
    ownerId:receiver,expectedEpoch:epoch,expectedRevision:0});
  assert.equal(reg.ok,true,reg.reason);
  ledger=reg.next;
  const p=previewUnifiedShard({snapshot:ledger,shardKey});
  assert.equal(p.ok,true,p.reason);
  values.set(shardKey,p.raw);
  const spawned=[],source=container(5,physical);
  const dim={
    getEntities({type}){return spawned.filter(e=>e.typeId===type&&e.loaded!==false);},
    spawnEntity(typeId,position){
      const c=container(9);
      const entity={typeId,id:'original-native-host-1',loaded:true,
        location:position,getComponent:()=>({
          inventorySize:9,canBeSiphonedFrom:false,container:c
        })};
      spawned.push(entity);return entity;
    }
  };
  let writes=0;
  const world={
    getDynamicProperty:k=>values.get(k),
    setDynamicProperty(k,v){
      writes++;
      if(opts.onWrite)return opts.onWrite(k,v,values,writes);
      if(v===undefined)values.delete(k);
      else values.set(k,v);
    },
    getDimension:()=>dim
  };
  const registryArgs={world,worldId,epoch,externalFence:()=>true,
    ownerVerifier:()=>true};
  const setupRegistry=createUnifiedCarrierRegistry(registryArgs);
  assert.equal(setupRegistry.ok,true);
  assert.equal(setupRegistry.registerEmptyHost({ownerId:receiver,anchor}).ok,true);
  const regWithBoundary=createUnifiedCarrierRegistry({
    ...registryArgs,boundaryOperationId:outerId});
  assert.equal(regWithBoundary.ok,true);
  const owner={ownerId:receiver,anchor};
  const host=regWithBoundary.inspectHost(owner);
  assert.equal(host.ok,true,host.reason);
  const from={ownerId:'vanilla-input-hopper',container:source,slot:0};
  const to={ownerId:receiver,container:host.container,slot:0};
  const intent={schema:'hart-uce-ordinary-boundary-v1',
    worldId,epoch,operationId:outerId,phase:'ESCROW_READY',
    direction:'deposit',accountId,key,count:64,
    expectedRevision:ledger.revision};
  values.set(boundaryKey,JSON.stringify(intent));
  const escrow=()=>{
    const c=regWithBoundary.inspectCustody(owner);
    return c.ok&&c.occupied===1&&
      c.slots[0]===0&&
      host.container.getItem(0)?.typeId===physical.typeId&&
      host.container.getItem(0)?.amount===64;
  };
  const writer=createUnifiedShardWriter({world,shardKey,worldId,epoch,
    externalFence:()=>true,verifyEscrowCustody:()=>escrow()});
  assert.equal(writer.ok,true);
  const hasLedgerReceipt=args=>{
    const view=writer.inspect();
    if(!view.ok)return false;
    const r=view.lastReceipt;
    const tx=JSON.parse(values.get(boundaryKey));
    return r.kind==='BOUNDARY'&&r.operationId===outerId&&
      r.accountId===args.accountId&&r.key===args.key&&
      r.count===args.count&&r.direction===args.direction&&
      tx.phase==='ESCROW_READY'&&tx.operationId===outerId;
  };
  const port=createUnifiedNativePort({world,worldId,epoch,
    externalFence:()=>true,boundaryOperationId:outerId,
    verifyEndpointOwner:()=>true,
    durableOwnershipWitness:regWithBoundary.durableOwnershipWitness,
    certifyOrdinaryEscrow:(item,k,n)=>{
      return item?.typeId==='minecraft:cobblestone'&&
        item.amount===n&&n===64&&k===key&&
        item.nameTag===''&&item.getLore().length===0;
    },
    verifyLedgerBoundaryReceipt:hasLedgerReceipt
  });
  assert.equal(port.ok,true);
  return {world,values,source,host,reg:regWithBoundary,port,
    writer,from,to,intent,owner,ledger,
    get writes(){return writes;}};
}
function hold(v,reason){
  assert.equal(v.ok,false,JSON.stringify(v));
  assert.equal(v.status,'HOLD');
  if(reason)assert.equal(v.reason,reason);
}
function enter(f){
  const move=f.port.moveWhole({operationId:nativeMoveId,
    from:f.from,to:f.to});
  assert.equal(move.ok,true,move.reason);
  assert.equal(f.reg.stageMovedTicket(f.owner).ok,true);
  const ack=f.port.ackWhole({operationId:nativeMoveId,
    from:f.from,to:f.to});
  assert.equal(ack.ok,true,ack.reason);
  return move;
}
function credit(f){
  return f.writer.applyBoundaryCommit({
    operationId:outerId,accountId,key,count:64,
    direction:'deposit',expectedRevision:f.ledger.revision,
    expectedEpoch:epoch});
}
function consume(f){
  return f.port.consumeCertifiedEscrow({
    operationId:consumeId,from:f.to,accountId,key,count:64});
}
function ackConsume(f){
  return f.port.ackCertifiedEscrow({
    operationId:consumeId,from:f.to,accountId,key,count:64});
}

test('ordinary real-stack custody: vanilla->persistent host->one ledger credit->single consume/ACK',()=>{
  const f=fixture();
  enter(f);
  assert.equal(f.reg.inspectCustody(f.owner).occupied,1);
  const r=credit(f);
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'BOUNDARY_ACCOUNT_WRITE_READBACK');
  assert.equal(f.writer.inspect().snapshot.total,64);
  assert.equal(f.host.container.getItem(0)?.amount,64);
  const consumed=consume(f);
  assert.equal(consumed.ok,true,consumed.reason);
  assert.equal(consumed.status,'CERTIFIED_ORDINARY_ESCROW_CONSUMED_PENDING_ACK');
  assert.equal(f.host.container.getItem(0),undefined);
  assert.equal(f.reg.stageMovedTicket(f.owner).ok,true);
  assert.equal(ackConsume(f).ok,true);
  const custody=f.reg.inspectCustody(f.owner);
  assert.equal(custody.ok,true,custody.reason);
  assert.equal(custody.occupied,0);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),false);
  assert.equal(f.writer.inspect().snapshot.total,64);
  assert.equal(f.source.getItem(0),undefined);
});
test('refuse physical retirement before exact persisted account receipt',()=>{
  const f=fixture();
  enter(f);
  hold(consume(f),'ordinary_escrow_not_credited_or_certified');
  assert.equal(f.host.container.getItem(0)?.amount,64);
  assert.equal(f.writer.inspect().snapshot.total,0);
});
test('credit requires source in protected escrow, not arbitrary plain item',()=>{
  const f=fixture();
  hold(credit(f),'native_escrow_custody_unverified');
  assert.equal(f.writer.inspect().snapshot.total,0);
});
test('unresolved consumption journal blocks second credit and cannot auto-replay',()=>{
  const f=fixture();enter(f);assert.equal(credit(f).ok,true);
  assert.equal(consume(f).ok,true);
  hold(f.port.consumeCertifiedEscrow({
    operationId:'another',from:f.to,accountId,key,count:64
  }),'native_intent_pending_global');
  assert.equal(f.writer.inspect().snapshot.total,64);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),true);
});
test('partial post-consume crash retains physical/ticket mismatch until explicit reconciliation',()=>{
  const f=fixture();enter(f);assert.equal(credit(f).ok,true);
  assert.equal(consume(f).ok,true);
  hold(f.reg.inspectCustody(f.owner),'native_ticket_physical_slot_mismatch');
  assert.equal(f.writer.inspect().snapshot.total,64);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),true);
});
