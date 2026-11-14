import test from 'node:test';
import assert from 'node:assert/strict';
import {activateUnifiedEmptyWorld} from
  '../candidates/transport/unified_new_world_activation.mjs';
import {createUnifiedShardWriter,verifyUnifiedMutationFence,
  previewUnifiedShard,UCE_EMPTY_BULK_REMOVAL_KEY} from
  '../candidates/transport/unified_world_shard_writer.mjs';
import {executeUnifiedEmptyBulkRemoval} from
  '../candidates/transport/unified_empty_bulk_removal.mjs';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';

const worldId='minecraft:overworld:bulk-human-test',epoch=1;
const dimensionId='minecraft:overworld';
const first={x:25,y:147,z:56},second={x:26,y:146,z:56};
function owner(p){return dimensionId+'|'+p.x+','+p.y+','+p.z;}
function fixture(){
  const values=new Map(),blocks=new Map(),logistics={
    collectors:[],receivers:[],nextQueue:1
  };
  let onWrite=null,writes=0;
  const dimension={
    id:dimensionId,
    getEntities(){return [];},
    getBlock(p){return blocks.get(owner(p));}
  };
  const makeBlock=p=>{
    const block={location:{...p},dimension,
      typeId:'hartlogistics:bulk_storage',
      setType(t){this.typeId=t;}};
    blocks.set(owner(p),block);return block;
  };
  const world={
    getDynamicProperty:k=>values.get(k),
    getDynamicPropertyIds:()=>[...values.keys()],
    getDimension:()=>({getEntities:()=>[]}),
    setDynamicProperty(k,v){
      writes++;
      if(onWrite)onWrite(k,v);
      if(v===undefined)values.delete(k);else values.set(k,v);
    }
  };
  const active=activateUnifiedEmptyWorld({
    world,logistics,worldId,epoch,operatorAuthorized:true,
    actualWorldFence:()=>true
  });
  assert.equal(active.ok,true,active.reason);
  const seal=JSON.parse(values.get('hartlogistics:uce_cold_seal_v1'));
  const shardKey=seal.shards[0].key;
  const register=createUnifiedShardWriter({world,worldId,epoch,shardKey,
    externalFence:()=>true,
    verifyReceiverReserveShard:()=>true,
    verifyReceiverPlacement:()=>true,
    verifyGlobalReceiverUniqueness:()=>true,
    verifyBulkPlacement:()=>true,
    verifyGlobalBulkUniqueness:()=>true});
  const at={dimensionId,x:24,y:146,z:56};
  const r=register.registerNewReceiver({
    ownerId:dimensionId+'|24|146|56',anchor:at,
    operationId:'reg-receiver',expectedRevision:0,expectedEpoch:epoch});
  assert.equal(r.ok,true,r.reason);
  for(const p of [first,second]){
    const view=register.inspect();
    const x=register.registerBulkMember({ownerId:owner(p),
      operationId:'reg-bank-'+p.x,expectedEpoch:epoch,
      expectedRevision:view.snapshot.revision});
    assert.equal(x.ok,true,x.reason);
  }
  const block=makeBlock(first);
  const other=makeBlock(second);
  const remove=(b=block)=>executeUnifiedEmptyBulkRemoval({
    world,worldId,epoch,block:b,operationId:'mine-'+b.location.x,
    operatorAuthorized:true,externalFence:()=>true
  });
  return {world,values,blocks,block,other,remove,register,
    shardKey,setOnWrite:fn=>{onWrite=fn},
    get writes(){return writes}};
}

test('mining an EMPTY registered controller retires only it and elects the surviving bank',()=>{
  const f=fixture(),before=f.register.inspect().snapshot;
  const result=f.remove();
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.status,'EMPTY_BULK_REMOVED_AND_ACCOUNT_RETIRED');
  assert.equal(result.controllerOwnerId,owner(second));
  assert.equal(f.block.typeId,'minecraft:air');
  assert.equal(f.other.typeId,'hartlogistics:bulk_storage');
  const after=f.register.inspect().snapshot;
  assert.equal(before.accounts.filter(a=>a.kind==='bulk').length,2);
  assert.equal(after.accounts.filter(a=>a.kind==='bulk').length,1);
  assert.equal(after.accounts.find(a=>a.id==='bulk:'+owner(second)).role,
    'controller');
  assert.equal(after.total,0);
  assert.equal(f.values.has(UCE_EMPTY_BULK_REMOVAL_KEY),false);
  assert.equal(verifyUnifiedMutationFence(
    f.world,worldId,epoch,()=>true).ok,true);
});
test('unregistered, physically placed Bulk block can be picked up without touching accounts',()=>{
  const f=fixture();
  const unused={x:30,y:145,z:56};
  const block={location:unused,dimension:f.block.dimension,
    typeId:'hartlogistics:bulk_storage',
    setType(t){this.typeId=t;}};
  f.blocks.set(owner(unused),block);
  const revision=f.register.inspect().snapshot.revision;
  const result=f.remove(block);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.status,'EMPTY_UNREGISTERED_BLOCK_REMOVED');
  assert.equal(block.typeId,'minecraft:air');
  assert.equal(f.register.inspect().snapshot.revision,revision);
});
test('stored items block mining, leave the physical block and ledger untouched',()=>{
  const f=fixture();
  const view=f.register.inspect();
  const copy=JSON.parse(JSON.stringify(view.snapshot));
  const account=copy.accounts.find(a=>a.id==='bulk:'+owner(first));
  const key=q5IdentityKey({typeId:'minecraft:cobblestone',
    lore:[],ench:[],canDestroy:[],canPlaceOn:[]});
  account.total=1;account.buckets=[{key,count:1}];
  account.lifetime.received=1;copy.total=1;
  const envelope=previewUnifiedShard({snapshot:copy,shardKey:f.shardKey});
  assert.equal(envelope.ok,true,envelope.reason);
  f.values.set(f.shardKey,envelope.raw);
  const before=f.values.get(f.shardKey),result=f.remove();
  assert.equal(result.ok,false);
  assert.equal(result.reason,'storage_contains_items');
  assert.equal(f.block.typeId,'hartlogistics:bulk_storage');
  assert.equal(f.values.get(f.shardKey),before);
  assert.equal(f.values.has(UCE_EMPTY_BULK_REMOVAL_KEY),false);
});
test('ambiguous shard write after mined block leaves a global HOLD, never unsafe retry',()=>{
  const f=fixture();
  f.setOnWrite((k,v)=>{
    if(k===f.shardKey)throw Error('torn Bedrock world save');
  });
  const r=f.remove();
  assert.equal(r.ok,false);
  assert.equal(f.block.typeId,'minecraft:air');
  assert.equal(f.values.has(UCE_EMPTY_BULK_REMOVAL_KEY),true);
  const fenced=verifyUnifiedMutationFence(f.world,worldId,epoch,()=>true);
  assert.equal(fenced.ok,false);
  assert.equal(fenced.reason,'empty_bulk_removal_pending_global');
  const replay=f.remove();
  assert.equal(replay.ok,false);
  assert.equal(f.values.has(UCE_EMPTY_BULK_REMOVAL_KEY),true);
});
