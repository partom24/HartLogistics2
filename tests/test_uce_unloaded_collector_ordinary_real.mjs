import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {createEmptyUnifiedOrdinaryLedger,registerUnifiedEmptyAccount,
  inspectUnifiedOrdinaryLedger} from
  '../candidates/transport/unified_ordinary_accounts.mjs';
import {createUnifiedShardWriter,previewUnifiedShard,
  verifyUnifiedMutationFence,UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA} from
  '../candidates/transport/unified_world_shard_writer.mjs';
import {createUnifiedCarrierRegistry} from
  '../candidates/transport/unified_carrier_registry.mjs';
import {createUnifiedNativePort,UCE_NATIVE_INTENT_KEY} from
  '../candidates/transport/unified_native_custody.mjs';
import {executeUnifiedOrdinaryDeposit,inspectUnifiedOrdinaryBoundary,
  UCE_ORDINARY_BOUNDARY_KEY} from
  '../candidates/transport/unified_ordinary_service.mjs';
import {inspectQ4OrdinaryDefinitionShape} from
  '../candidates/transport/q5_ordinary_shape_gate.mjs';

/** Executes the exact generated HL2 ordinary Collector→sealed Receiver
 * helper against the REAL unified ledger, ordinary boundary coordinator,
 * persistent native carrier and native inventory journal modules. The
 * unmounted Receiver is NEVER represented as a live Bedrock block.
 * Only the Bedrock world/entity/native container APIs are simulated.
 */
const bridge=process.env.UCE_GENERATED_MAIN?
  fs.readFileSync(process.env.UCE_GENERATED_MAIN,'utf8'):
  fs.readFileSync(new URL(
    '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const start=bridge.indexOf('function uceCollectorOrdinaryDeposit(');
const end=bridge.indexOf('\nconst UCE_COLLECTOR_MR_SCAN_BUDGET',start);
assert.ok(start>=0&&end>start,'shipped Collector ordinary helper present');
const exact=bridge.slice(start,end);
const worldId='minecraft:overworld:collector-unloaded-ordinary',epoch=32;
const dimId='minecraft:overworld';
const collector={id:dimId+'|3|69|5',d:dimId,
  x:3,y:69,z:5,present:true};
const receiver={id:dimId+'|24|70|4',d:dimId,
  x:24,y:70,z:4,present:true};
const anchor={dimensionId:collector.d,
  x:collector.x,y:collector.y,z:collector.z};
const accountId='receiver:'+receiver.id;
const shardKey='hartlogistics:uce_shard_0001_v1';
const def={typeId:'minecraft:cobblestone',lore:[],ench:[],
  canDestroy:[],canPlaceOn:[]};
const key=q5IdentityKey(def);
const rawItem={typeId:'minecraft:cobblestone',amount:32,maxAmount:64,
  nameTag:'',lore:[]};
const copy=v=>v===undefined?undefined:structuredClone(v);
function container(size,first=undefined){
  const slots=Array(size).fill(undefined);
  if(first)slots[0]=copy(first);
  return {size,isValid:true,
    getItem(i){
      const value=copy(slots[i]);
      if(!value)return undefined;
      value.getLore=()=>[...value.lore];
      value.getDynamicPropertyIds=()=>[];
      value.isStackableWith=x=>x?.typeId===value.typeId&&
        !x?.nameTag&&!value.nameTag;
      return value;
    },
    // Bedrock Container.setItem is required for certified physical escrow
    // retirement after the Receiver's durable ledger credit.
    setItem(i,value){slots[i]=copy(value);},
    moveItem(i,j,to){
      if(slots[i]===undefined||to.peek(j)!==undefined)
        throw Error('mock-engine-owner-refusal');
      to.put(j,slots[i]);slots[i]=undefined;
    },
    peek:i=>slots[i],put:(i,value)=>{slots[i]=copy(value);},
    raw:slots};
}
function fixture({full=false,failShardAfterSave=false,
                 changeRouteAfterPrepared=false}={}){
  const values=new Map([[UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',worldId,epoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  })]]);
  let ledger=createEmptyUnifiedOrdinaryLedger({worldId,epoch}).snapshot;
  const added=registerUnifiedEmptyAccount(ledger,{
    kind:'receiver',ownerId:receiver.id,
    expectedEpoch:epoch,expectedRevision:0});
  assert.equal(added.ok,true,added.reason);
  ledger=added.next;
  if(full){
    ledger.accounts[0].total=ledger.accounts[0].capacity;
    ledger.accounts[0].buckets=[{key,count:ledger.accounts[0].total}];
    ledger.total=ledger.accounts[0].total;
    assert.equal(inspectUnifiedOrdinaryLedger(ledger).ok,true);
  }
  const preview=previewUnifiedShard({snapshot:ledger,shardKey});
  assert.equal(preview.ok,true,preview.reason);
  values.set(shardKey,preview.raw);
  const input=container(5,rawItem);
  const spawned=[];
  const dimension={
    id:dimId,
    getEntities({type,location,maxDistance}){
      return spawned.filter(e=>e.typeId===type&&
        Math.hypot(e.location.x-location.x,
          e.location.y-location.y,e.location.z-location.z)<=maxDistance);
    },
    spawnEntity(type,location){
      const native=container(9);
      const entity={id:'real-collector-carrier-'+(spawned.length+1),
        typeId:type,location,
        getComponent:()=>({inventorySize:9,
          canBeSiphonedFrom:false,container:native})};
      spawned.push(entity);
      return entity;
    }
  };
  let route=true,writeCount=0;
  const world={
    getDynamicProperty:k=>values.get(k),
    setDynamicProperty(k,value){
      writeCount++;
      if(value===undefined)values.delete(k);
      else values.set(k,value);
      if(changeRouteAfterPrepared&&k===UCE_ORDINARY_BOUNDARY_KEY&&
         value&&JSON.parse(value).phase==='PREPARED')route=false;
      if(failShardAfterSave&&k===shardKey)
        throw Error('fault_injected_after_shard_persisted');
    },
    getDimension:k=>k===dimId?dimension:undefined
  };
  const activate=()=>createUnifiedCarrierRegistry({
    world,worldId,epoch,externalFence:()=>true,
    ownerVerifier:(id,at)=>id===collector.id&&
      at.dimensionId===collector.d&&
      at.x===collector.x&&at.y===collector.y&&at.z===collector.z
  });
  const setup=activate();
  assert.equal(setup.ok,true,setup.reason);
  assert.equal(setup.registerEmptyHost({ownerId:collector.id,anchor}).ok,
    true);
  const carrier=setup.inspectHost({ownerId:collector.id,anchor});
  assert.equal(carrier.ok,true,carrier.reason);
  const source={ownerId:'input|'+dimId+'|3,70,5',container:input};
  const ctx={
    world,
    uceOrdinaryAccountSource:(_,id)=>
      id===receiver.id?shardKey:undefined,
    uceNativeReceiptId:()=> 'collector-unloaded-ordinary-1',
    uceLegacyWriterBlocked:()=>true,
    uceAuthoritySnapshot:()=>({worldId,epoch}),
    uceLiveCollectorOwner:(id,at)=>id===collector.id&&
      at.x===collector.x&&at.y===collector.y,
    uceNativeOutputSlot:c=>{
      for(let i=0;i<c.size;i++)
        if(c.getItem(i)===undefined)return i;
      return -1;
    },
    ucePlainItemIdentity:s=>s?.typeId==='minecraft:cobblestone'&&
      s.amount>0&&!s.nameTag&&s.getLore?.().length===0?key:undefined,
    uceClassifyLiveStack:s=>s?.typeId==='minecraft:cobblestone'&&
      !s.nameTag&&s.getLore?.().length===0?'ORDINARY':'MR',
    inspectQ4OrdinaryDefinitionShape:definition=>
      inspectQ4OrdinaryDefinitionShape(
        JSON.parse(JSON.stringify(definition))),
    createUnifiedCarrierRegistry,createUnifiedNativePort,
    createUnifiedShardWriter,executeUnifiedOrdinaryDeposit
  };
  vm.runInNewContext(exact,ctx);
  const args=()=>({
    authority:{worldId,epoch},col:collector,linked:receiver,anchor,
    candidate:{source,slot:0,item:input.getItem(0),key},
    carrier,routeVerified:()=>route
  });
  const run=()=>{
    const p=args();
    return ctx.uceCollectorOrdinaryDeposit(p.authority,p.col,p.linked,
      p.anchor,p.candidate,p.carrier,p.routeVerified);
  };
  const view=()=>createUnifiedShardWriter({
    world,shardKey,worldId,epoch,externalFence:()=>true}).inspect();
  return {run,view,world,values,carrier,setup,input,spawned,
    setRoute:x=>{route=x;},
    get writes(){return writeCount}};
}
test('unloaded Receiver credited once from Collector Hopper using actual native escrow, tickets and shard',()=>{
  const f=fixture(),result=f.run();
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.direction,'deposit');
  assert.equal(result.count,32);
  assert.equal(f.view().snapshot.total,32);
  assert.equal(f.input.getItem(0),undefined);
  assert.equal(f.carrier.container.getItem(0),undefined);
  assert.equal(f.setup.inspectCustody({ownerId:collector.id,anchor}).occupied,0);
  assert.equal(f.values.has(UCE_ORDINARY_BOUNDARY_KEY),false);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),false);
  assert.equal(f.spawned.length,1);
  const receipt=f.view().lastReceipt;
  assert.equal(receipt.kind,'BOUNDARY');
  assert.equal(receipt.accountId,accountId);
  assert.equal(receipt.key,key);
  assert.equal(receipt.count,32);
  const repeat=f.run();
  assert.equal(repeat.ok,false,
    'a second attempt cannot fabricate another physical item');
  assert.equal(f.view().snapshot.total,32);
});
test('unloaded Receiver at capacity does not debit Hopper or allocate pending custody',()=>{
  const f=fixture({full:true}),result=f.run();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'ordinary_account_at_capacity');
  assert.equal(f.input.getItem(0).amount,32);
  assert.equal(f.view().snapshot.total,250000);
  assert.equal(f.carrier.container.getItem(0),undefined);
  assert.equal(f.values.has(UCE_ORDINARY_BOUNDARY_KEY),false);
});
test('Collector unlink or unloaded identity change before PREPARED does not touch source',()=>{
  const f=fixture();f.setRoute(false);
  const result=f.run();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'collector_ordinary_link_not_verified');
  assert.equal(f.input.getItem(0).amount,32);
  assert.equal(f.view().snapshot.total,0);
  assert.equal(f.values.has(UCE_ORDINARY_BOUNDARY_KEY),false);
});
test('Collector link changes after PREPARED: no physical credit and global pending HOLD',()=>{
  const f=fixture({changeRouteAfterPrepared:true});
  const result=f.run();
  assert.equal(result.ok,false);
  assert.equal(f.input.getItem(0).amount,32);
  assert.equal(f.view().snapshot.total,0);
  assert.equal(f.values.has(UCE_ORDINARY_BOUNDARY_KEY),true);
  assert.equal(verifyUnifiedMutationFence(f.world,worldId,epoch,()=>true).ok,
    false);
});
test('shard write ambiguity holds after physical escrow, cannot double-credit Receiver',()=>{
  const f=fixture({failShardAfterSave:true});
  const result=f.run();
  assert.equal(result.ok,false);
  assert.equal(f.input.getItem(0),undefined);
  assert.equal(f.carrier.container.getItem(0).amount,32);
  assert.equal(f.view().snapshot.total,32,
    'postwrite outcome may have persisted one ledger credit');
  assert.equal(inspectUnifiedOrdinaryBoundary(f.world).status,
    'BOUNDARY_PENDING_RECONCILIATION');
  assert.equal(f.values.has(UCE_ORDINARY_BOUNDARY_KEY),true);
  assert.equal(f.run().ok,false);
  assert.equal(f.view().snapshot.total,32);
});
