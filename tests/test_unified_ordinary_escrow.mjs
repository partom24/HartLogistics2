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
import {executeUnifiedOrdinaryDeposit,executeUnifiedOrdinaryWithdrawal,
  inspectUnifiedOrdinaryBoundary} from
  '../candidates/transport/unified_ordinary_service.mjs';

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
      s.isStackableWith=other=>!!other&&
        other.typeId===s.typeId&&!s.nameTag&&!other.nameTag;
      s.clone=()=>{
        const raw=structuredClone(slots[i]);
        return {...raw,getLore:()=>[...(raw.lore||[])]};
      };
      return s;
    },
    moveItem(i,j,to){
      if(slots[i]===undefined||to.peek(j)!==undefined)
        throw Error('native-move-unsafe');
      to.put(j,slots[i]);slots[i]=undefined;
    },
    setItem(i,v){
      if(v===undefined){slots[i]=undefined;return;}
      const {getLore,isStackableWith,clone,...data}=v; // Bedrock stores native item state, not API methods.
      slots[i]=structuredClone(data);
    },
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


test('reverse product journey: credited Receiver count -> certified native escrow -> debit -> native destination',()=>{
  const f=fixture();
  enter(f);
  assert.equal(credit(f).ok,true);
  assert.equal(consume(f).ok,true);
  assert.equal(f.reg.stageMovedTicket(f.owner).ok,true);
  assert.equal(ackConsume(f).ok,true);
  assert.equal(f.writer.inspect().snapshot.total,64);
  // The (future) one outer coordinator must first verify deposit completion
  // before retiring this marker; no code here clears it automatically.
  f.values.delete(boundaryKey);

  const withdrawId='ordinary-withdraw-32';
  const claim={schema:'hart-uce-ordinary-boundary-v1',
    worldId,epoch,operationId:withdrawId,phase:'ESCROW_READY',
    direction:'withdraw',accountId,key,count:32,
    expectedRevision:f.writer.inspect().snapshot.revision};
  f.values.set(boundaryKey,JSON.stringify(claim));
  const registry=createUnifiedCarrierRegistry({
    world:f.world,worldId,epoch,boundaryOperationId:withdrawId,
    externalFence:()=>true,ownerVerifier:()=>true});
  assert.equal(registry.ok,true);
  const terminal=container(9);
  const to={ownerId:receiver,container:f.host.container,slot:0};
  const output={ownerId:'sorter-destination',container:terminal,slot:3};
  const isCertified=(stack,k,n)=>stack?.typeId==='minecraft:cobblestone'&&
    stack.amount===n&&k===key&&stack.maxAmount===64&&
    !stack.nameTag&&stack.getLore().length===0;
  const port=createUnifiedNativePort({
    world:f.world,worldId,epoch,boundaryOperationId:withdrawId,
    externalFence:()=>true,verifyEndpointOwner:()=>true,
    durableOwnershipWitness:registry.durableOwnershipWitness,
    makeCertifiedOrdinaryItem:(k,n)=>k===key?
      {typeId:'minecraft:cobblestone',amount:n,maxAmount:64,
       nameTag:'',lore:[],getLore:()=>[]}:null,
    certifyOrdinaryEscrow:isCertified,
    verifyLedgerWithdrawalReservation:({operationId,accountId:a,key:k,count:n,direction})=>{
      const v=f.writer.inspect(),t=JSON.parse(f.values.get(boundaryKey));
      return v.ok&&v.snapshot.accounts.find(a=>a.id===accountId)?.total>=n&&
        operationId===withdrawId&&a===accountId&&k===key&&
        direction==='withdraw'&&t.operationId===withdrawId;
    }
  });
  assert.equal(port.ok,true);
  const materialized=port.materializeCertifiedOrdinary({
    operationId:'native-materialize-1',to,accountId,key,count:32});
  assert.equal(materialized.ok,true,materialized.reason);
  assert.equal(registry.stageMovedTicket(f.owner).ok,true);
  const acknowledged=port.ackMaterializedOrdinary({
    operationId:'native-materialize-1',to,accountId,key,count:32});
  assert.equal(acknowledged.ok,true,acknowledged.reason);
  assert.equal(registry.inspectCustody(f.owner).occupied,1);
  assert.equal(f.writer.inspect().snapshot.total,64);
  const writer=createUnifiedShardWriter({
    world:f.world,worldId,epoch,shardKey,externalFence:()=>true,
    verifyEscrowCustody:()=>registry.inspectCustody(f.owner).occupied===1});
  const debited=writer.applyBoundaryCommit({
    operationId:withdrawId,accountId,key,count:32,direction:'withdraw',
    expectedRevision:claim.expectedRevision,expectedEpoch:epoch});
  assert.equal(debited.ok,true,debited.reason);
  assert.equal(writer.inspect().snapshot.total,32);
  const moved=port.moveWhole({operationId:'native-withdraw-output-1',
    from:to,to:output});
  assert.equal(moved.ok,true,moved.reason);
  assert.equal(registry.stageMovedTicket(f.owner).ok,true);
  assert.equal(port.ackWhole({operationId:'native-withdraw-output-1',
    from:to,to:output}).ok,true);
  assert.equal(registry.inspectCustody(f.owner).occupied,0);
  assert.equal(writer.inspect().snapshot.total,32);
  assert.equal(terminal.getItem(3)?.amount,32);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),false);
});

test('withdrawal cannot materialize without a matching ledger reservation and empty host slot',()=>{
  const f=fixture();
  const port=createUnifiedNativePort({
    world:f.world,worldId,epoch,boundaryOperationId:outerId,
    externalFence:()=>true,verifyEndpointOwner:()=>true,
    durableOwnershipWitness:()=>false,
    makeCertifiedOrdinaryItem:()=>({typeId:'minecraft:cobblestone',amount:64}),
    certifyOrdinaryEscrow:()=>true,
    verifyLedgerWithdrawalReservation:()=>false});
  hold(port.materializeCertifiedOrdinary({
    operationId:'fake',to:f.to,accountId,key,count:64}),
    'ordinary_materialize_escrow_not_reserved');
  assert.equal(f.host.container.getItem(0),undefined);
  assert.equal(f.writer.inspect().snapshot.total,0);
});


function coordinated(f,id){
  f.values.delete(boundaryKey);
  const registry=createUnifiedCarrierRegistry({
    world:f.world,worldId,epoch,boundaryOperationId:id,
    externalFence:()=>true,ownerVerifier:()=>true
  });
  const writer=createUnifiedShardWriter({
    world:f.world,shardKey,worldId,epoch,externalFence:()=>true,
    verifyEscrowCustody:()=>{
      const v=registry.inspectCustody(f.owner);
      return v.ok&&v.slots.includes(0)&&
        f.host.container.getItem(0)!==undefined;
    }
  });
  const port=createUnifiedNativePort({
    world:f.world,worldId,epoch,boundaryOperationId:id,
    externalFence:()=>true,verifyEndpointOwner:()=>true,
    durableOwnershipWitness:registry.durableOwnershipWitness,
    makeCertifiedOrdinaryItem:(k,n)=>k===key?({
      typeId:'minecraft:cobblestone',amount:n,maxAmount:64,
      nameTag:'',lore:[],getLore:()=>[]
    }):null,
    certifyOrdinaryEscrow:(item,k,n)=>item?.typeId==='minecraft:cobblestone'&&
      item.amount===n&&k===key&&!item.nameTag&&
      item.getLore().length===0,
    verifyLedgerWithdrawalReservation:({operationId,accountId:a,key:k,count:n})=>{
      const current=writer.inspect();
      const outer=f.values.get(boundaryKey);
      let tx;
      try{tx=JSON.parse(outer);}catch(_){return false;}
      return current.ok&&tx?.phase==='PREPARED'&&
        tx.operationId===id&&operationId===id&&
        a===accountId&&k===key&&n>0&&
        (current.snapshot.accounts.find(x=>x.id===accountId)
         ?.buckets.find(b=>b.key===key)?.count||0)>=n;
    },
    verifyLedgerBoundaryReceipt:({operationId,accountId:a,key:k,count:n,
                                    direction})=>{
      const current=writer.inspect();
      let tx;
      try{tx=JSON.parse(f.values.get(boundaryKey));}catch(_){return false;}
      const r=current.lastReceipt;
      return current.ok&&tx?.phase==='ESCROW_READY'&&
        tx.operationId===id&&operationId===id&&
        a===accountId&&k===key&&n===r.count&&
        direction===r.direction&&r.kind==='BOUNDARY'&&
        r.operationId===id;
    }
  });
  assert.equal(port.ok,true);
  return {world:f.world,worldId,epoch,operationId:id,
    accountId,key,registry,port,writer,ownerId:receiver,anchor,
    carrierSlot:f.to,physicalSlot:f.from,
    verifyRoute:()=>true,verifyOrdinary:()=>true};
}

test('one UCE coordinator delivers ordinary Hopper->account->Sorter without duplicate credit/debit',()=>{
  const f=fixture();
  const deposit=executeUnifiedOrdinaryDeposit({
    ...coordinated(f,'coordinated-deposit-1'),count:64
  });
  assert.equal(deposit.ok,true,deposit.reason);
  assert.equal(deposit.status,'UNIFIED_ORDINARY_BOUNDARY_DELIVERED');
  assert.equal(f.values.has(boundaryKey),false);
  assert.equal(f.source.getItem(0),undefined);
  assert.equal(f.host.container.getItem(0),undefined);
  assert.equal(f.writer.inspect().snapshot.total,64);
  assert.equal(f.reg.inspectCustody(f.owner).occupied,0);

  const destination=container(9);
  const output={ownerId:'sorter-native-output',container:destination,slot:3};
  const withdrawalArgs={
    ...coordinated(f,'coordinated-withdraw-2'),count:32,
    physicalSlot:output
  };
  const withdrawn=executeUnifiedOrdinaryWithdrawal(withdrawalArgs);
  assert.equal(withdrawn.ok,true,withdrawn.reason);
  assert.equal(withdrawn.direction,'withdraw');
  assert.equal(f.values.has(boundaryKey),false);
  assert.equal(destination.getItem(3)?.amount,32);
  assert.equal(f.writer.inspect().snapshot.total,32);
  assert.equal(f.reg.inspectCustody(f.owner).occupied,0);
});

test('coordinator refuses reentering a pending interrupted boundary without speculative replay',()=>{
  const f=fixture();
  const args=coordinated(f,'coordinated-interrupt-1');
  const r=executeUnifiedOrdinaryDeposit({
    ...args,count:64,
    // Source route changed after the escrow was admitted, before settlement;
    // simulate interruption by failing the *ledger* escrow witness.
    writer:{
      ...args.writer,
      applyBoundaryCommit:()=>({ok:false,reason:'injected_save_ambiguity'})
    }
  });
  hold(r,'ordinary_credit:injected_save_ambiguity');
  assert.equal(inspectUnifiedOrdinaryBoundary(f.world).status,
    'BOUNDARY_PENDING_RECONCILIATION');
  assert.equal(f.values.has(boundaryKey),true);
  assert.equal(f.source.getItem(0),undefined);
  assert.equal(f.reg.inspectCustody(f.owner).occupied,1);
  hold(executeUnifiedOrdinaryDeposit({...args,count:64}),
    'pending_boundary_requires_reconciliation');
  assert.equal(f.writer.inspect().snapshot.total,0);
});

test('coordinator stops safely after an ordinary debit if Sorter topology changes',()=>{
  const f=fixture();
  assert.equal(executeUnifiedOrdinaryDeposit({
    ...coordinated(f,'seed-balance'),count:64
  }).ok,true);
  const destination=container(9);
  let checks=0;
  const args={
    ...coordinated(f,'output-destination-changed'),count:16,
    physicalSlot:{ownerId:'sorter',container:destination,slot:1},
    verifyRoute:()=>++checks===1
  };
  const result=executeUnifiedOrdinaryWithdrawal(args);
  hold(result,'sorter_destination_changed_after_debit');
  assert.equal(f.writer.inspect().snapshot.total,48);
  assert.equal(f.host.container.getItem(0)?.amount,16);
  assert.equal(destination.getItem(1),undefined);
  assert.equal(inspectUnifiedOrdinaryBoundary(f.world).status,
    'BOUNDARY_PENDING_RECONCILIATION');
});

test('integrated ordinary debit uses existing native partial journal and full escrow ACK',()=>{
  const f=fixture();
  assert.equal(executeUnifiedOrdinaryDeposit({
    ...coordinated(f,'seed-partial-ordinary'),count:64
  }).ok,true);
  const destination=container(9);
  destination.put(2,{typeId:'minecraft:cobblestone',amount:60,maxAmount:64,
    nameTag:'',lore:[]});
  const output={ownerId:'sorter-merge-output',container:destination,slot:2};
  const args={...coordinated(f,'withdraw-partial-ordinary'),count:4,
    partialOutput:true,physicalSlot:output};
  const result=executeUnifiedOrdinaryWithdrawal(args);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.status,'UNIFIED_ORDINARY_BOUNDARY_DELIVERED');
  assert.equal(destination.getItem(2).amount,64,
    'real occupied destination stack was extended, not replaced');
  assert.equal(f.writer.inspect().snapshot.total,60,
    'only actual free space is debited once');
  assert.equal(f.host.container.getItem(0),undefined);
  assert.equal(f.reg.inspectCustody(f.owner).occupied,0);
  assert.equal(f.values.has(boundaryKey),false);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),false);
});
test('partial output cannot bypass the native certified journal port',()=>{
  const f=fixture();
  const args=coordinated(f,'missing-partial-port');
  const port={...args.port};
  port.moveCertifiedPartial=undefined;
  const result=executeUnifiedOrdinaryWithdrawal({
    ...args,port,partialOutput:true,count:4});
  hold(result,'partial_output_port_unavailable');
  assert.equal(f.values.has(boundaryKey),false);
  assert.equal(f.writer.inspect().snapshot.total,0);
});
