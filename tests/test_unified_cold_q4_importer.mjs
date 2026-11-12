import test from 'node:test';
import assert from 'node:assert/strict';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {
  previewUnifiedColdQ4Import,executeUnifiedColdQ4Import,
  inspectUnifiedActiveColdImport,UCE_COLD_SEAL_KEY,
  UCE_NEW_RECEIVER_RESERVES
} from '../candidates/transport/unified_cold_q4_importer.mjs';
import {UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA,
  createUnifiedShardWriter,previewUnifiedShard}
  from '../candidates/transport/unified_world_shard_writer.mjs';

const worldId='minecraft:overworld:archived-141-test',epoch=77;
const item=(typeId='minecraft:cobblestone',extra={})=>({
  typeId,lore:[],ench:[],canDestroy:[],canPlaceOn:[],...extra
});
const proof=()=>({
  classification:'ordinary',metadataFree:true,losslessIdentity:true,
  runtimeStackable:true,runtimeMaxStack:64,verifiedFreshRoundTrip:true
});
function fixture(groups=[
  [{definition:item(),amount:120}],
  [{definition:item('minecraft:iron_ingot'),amount:64}]
],options={}){
  const values=new Map(),receivers=[],proofs=new Map();
  let expectedQueuedTotal=0,writes=0;
  for(let i=0;i<groups.length;i++){
    const queueKey='q'+(i+1),id='minecraft:overworld|'+i+'|70|-40';
    const rows=groups[i];
    const total=rows.reduce((n,x)=>n+x.amount,0);
    expectedQueuedTotal+=total;
    receivers.push({id,queueKey});
    values.set('hartsorter:q4m_'+queueKey,JSON.stringify({
      v:4,h:rows.length?1:0,t:rows.length,
      n:rows.length+1,q:total,r:total+2,d:2
    }));
    if(rows.length){
      values.set('hartsorter:q4p_'+queueKey+'_0',
        JSON.stringify([0,rows.map((row,j)=>['d'+j,row.amount])]));
    }
    rows.forEach((row,j)=>{
      values.set('hartsorter:q4d_'+queueKey+'_d'+j,
        JSON.stringify(row.definition));
      proofs.set(q5IdentityKey(row.definition),proof());
    });
  }
  const world={
    getDynamicProperty:k=>values.get(k),
    getDynamicPropertyIds:()=>[...values.keys()],
    setDynamicProperty(k,v){
      writes++;
      if(options.onWrite)return options.onWrite(k,v,values,writes);
      if(v===undefined)values.delete(k);
      else values.set(k,v);
    }
  };
  const source=[...values].filter(([k])=>k.startsWith('hartsorter:'));
  const params={world,worldId,epoch,receivers,proofs,
    expectedQueuedTotal,expectedReceiverCount:receivers.length};
  return {params,world,values,source,
    get writes(){return writes}};
}
const run=(f,overrides={})=>executeUnifiedColdQ4Import({
  ...f.params,backupVerified:true,legacyInputIsolation:true,
  actualWorldFence:()=>f.values.has(UCE_AUTHORITY_KEY),
  ...overrides
});
const fail=(r,reason)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.status,'HOLD');
  if(reason)assert.equal(r.reason,reason);
  assert.equal(r.canDeleteQ4,false);
};
test('cold Q4 plan with actual paged/defined source is deterministic and read-only',()=>{
  const f=fixture(),p=previewUnifiedColdQ4Import(f.params);
  assert.equal(p.ok,true,p.reason);
  assert.equal(p.status,'COLD_Q4_IMPORT_PLAN_ONLY');
  assert.equal(p.itemCount,184);
  assert.equal(p.receiverCount,2);
  assert.equal(p.shards.length,2+UCE_NEW_RECEIVER_RESERVES);
  assert.equal(p.reservedReceiverSlots,UCE_NEW_RECEIVER_RESERVES);
  assert.equal(p.shards.reduce((n,x)=>n+x.itemCount,0),184);
  assert.equal(f.writes,0);
  assert.equal(p.canModifyWorld,false);
  assert.equal(p.canDeleteQ4,false);
  assert.deepEqual([...f.values].filter(([k])=>k.startsWith('hartsorter:')),
    f.source);
});
test('successful modeled cold cutover preserves every Q4 byte and seals all new shards',()=>{
  const f=fixture(),r=run(f);
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'COLD_Q4_IMPORT_ACTIVE_READBACK');
  assert.equal(r.shardCount,2+UCE_NEW_RECEIVER_RESERVES);
  assert.equal(r.itemCount,184);
  assert.equal(r.originalQ4Retained,true);
  assert.equal(r.releaseApproved,false);
  assert.equal(r.hasHardCrashAtomicityProof,false);
  assert.deepEqual([...f.values].filter(([k])=>k.startsWith('hartsorter:')),
    f.source);
  const auth=JSON.parse(f.values.get(UCE_AUTHORITY_KEY));
  assert.equal(auth.schema,UCE_AUTHORITY_SCHEMA);
  assert.equal(auth.state,'ACTIVE');
  assert.equal(auth.q4LegacyWritersFenced,true);
  assert.equal(auth.initialItemCount,184);
  assert.equal(inspectUnifiedActiveColdImport({
    world:f.world,worldId,epoch}).currentLedgerTotal,184);
});
test('missing persisted shard after cutover blocks all ACTIVE routing',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  const seal=JSON.parse(f.values.get(UCE_COLD_SEAL_KEY));
  f.values.delete(seal.shards[1].key);
  fail(inspectUnifiedActiveColdImport({world:f.world,worldId,epoch}),
    'cold_shard_unreadable:'+seal.shards[1].key+
    ':world_shard_missing_or_oversized');
});
test('altered genesis contents and seal index refuse ACTIVE startup',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  const seal=JSON.parse(f.values.get(UCE_COLD_SEAL_KEY));
  const key=seal.shards[0].key;
  const raw=f.values.get(key);
  f.values.set(key,raw.replace('"GENESIS"','"TAMPERED"'));
  const r=inspectUnifiedActiveColdImport({world:f.world,worldId,epoch});
  assert.equal(r.ok,false);
  assert.match(r.reason,/cold_shard_unreadable|cold_genesis_shard_mismatch/);
  const g=fixture();assert.equal(run(g).ok,true);
  const x=JSON.parse(g.values.get(UCE_COLD_SEAL_KEY));
  x.shards[0].owner='forged-owner';
  g.values.set(UCE_COLD_SEAL_KEY,JSON.stringify(x));
  fail(inspectUnifiedActiveColdImport({world:g.world,worldId,epoch}),
    'cold_seal_missing_or_changed');
});
test('MR row in Q4 refuses ALL shards and never requests authority',()=>{
  for(const typeId of ['minecraft:enchanted_book',
                       'minecraft:diamond_pickaxe',
                       'minecraft:filled_map']){
    const f=fixture([[{definition:item(typeId),amount:1}]]);
    const r=run(f);
    fail(r,'q4_ordinary_conversion:q4_not_ordinary:native_or_opaque_item_type');
    assert.equal(f.writes,0);
    assert.equal(f.values.has(UCE_AUTHORITY_KEY),false);
    assert.deepEqual([...f.values],f.source);
  }
});
test('metadata name even on stackable legacy source cannot be flattened',()=>{
  const f=fixture([[{definition:item('minecraft:stone',
    {nameTag:'My personal block'}),amount:1}]]);
  const r=run(f);
  fail(r,'q4_ordinary_conversion:q4_not_ordinary:serialized_item_metadata_present');
  assert.equal(f.writes,0);
});
test('pending legacy Q4 journal refuses before any authority write',()=>{
  const f=fixture();f.values.set('hartsorter:queue_journal_v1','pending');
  fail(run(f),'preexisting_custody_journal:hartsorter:queue_journal_v1');
  assert.equal(f.writes,0);
});
test('missing backup or isolated ingress refuses before frozen-state marker',()=>{
  for(const overrides of [{backupVerified:false},
                           {legacyInputIsolation:false},
                           {actualWorldFence:null}]){
    const f=fixture();
    fail(run(f,overrides),'backup_or_legacy_isolation_unverified');
    assert.equal(f.writes,0);
  }
});
test('ambiguous frozen-marker write stops before copying any shard',()=>{
  const f=fixture({},{});
  const g=fixture(undefined,{onWrite:(k,v,values)=>{
    values.set(k,v);
    throw Error('save outcome uncertain');
  }});
  fail(run(g),'freeze_request_ambiguous:world_property_write_ambiguous:'+
       UCE_AUTHORITY_KEY);
  assert.equal(JSON.parse(g.values.get(UCE_AUTHORITY_KEY)).state,'REQUESTED');
  assert.equal(g.values.has(UCE_COLD_SEAL_KEY),false);
});
test('failed post-request fence retains REQUESTED with unchanged original Q4',()=>{
  const f=fixture();
  fail(run(f,{actualWorldFence:()=>false}),
    'legacy_writer_fence_unverified_after_request');
  assert.equal(JSON.parse(f.values.get(UCE_AUTHORITY_KEY)).state,'REQUESTED');
  assert.deepEqual([...f.values].filter(([k])=>k.startsWith('hartsorter:')),
    f.source);
});
test('changed Q4 content during freeze is detected and never activated',()=>{
  const f=fixture(undefined,{onWrite:(k,v,values)=>{
    values.set(k,v);
    if(k===UCE_AUTHORITY_KEY&&JSON.parse(v).state==='REQUESTED'){
      const key='hartsorter:q4d_q1_d0';
      values.set(key,JSON.stringify(item('minecraft:stone')));
    }
  }});
  fail(run(f),'q4_changed_during_request');
  assert.equal(JSON.parse(f.values.get(UCE_AUTHORITY_KEY)).state,'REQUESTED');
});
test('partial shard write fails frozen, preserves intact original Q4',()=>{
  const f=fixture(undefined,{onWrite:(k,v,values)=>{
    values.set(k,v);
    if(k.includes('uce_shard_0001'))
      throw Error('write may have completed');
  }});
  const r=run(f);
  assert.equal(r.ok,false);
  assert.match(r.reason,/cold_shard_write/);
  assert.equal(JSON.parse(f.values.get(UCE_AUTHORITY_KEY)).state,'REQUESTED');
  assert.equal(f.values.has(UCE_COLD_SEAL_KEY),false);
  assert.deepEqual([...f.values].filter(([k])=>k.startsWith('hartsorter:')),
    f.source);
});
test('preexisting UCE authority or shadow prevents second migration',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  const before=f.writes;
  fail(run(f),'authority_or_seal_already_present');
  assert.equal(f.writes,before);
});
test('35 Receiver synthetic archive scales into individually sealed read-only shards',()=>{
  const f=fixture(Array.from({length:35},(_,i)=>[
    {definition:item(i%2?'minecraft:stone':'minecraft:cobblestone'),
      amount:1000+i}
  ]));
  const p=previewUnifiedColdQ4Import(f.params);
  assert.equal(p.ok,true,p.reason);
  assert.equal(p.receiverCount,35);
  assert.equal(p.shards.length,35+UCE_NEW_RECEIVER_RESERVES);
  assert.equal(p.itemCount,35*1000+34*35/2);
  assert.equal(f.writes,0);
});


test('cold-sealed Receiver accepts newly registered Bulk member with unchanged Q4 source',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  const sealed=JSON.parse(f.values.get(UCE_COLD_SEAL_KEY));
  const shardKey=sealed.shards[0].key;
  const writer=createUnifiedShardWriter({world:f.world,shardKey,
    worldId,epoch,externalFence:()=>true,
    verifyBulkPlacement:()=>true,
    verifyGlobalBulkUniqueness:()=>true});
  const initial=writer.inspect();
  assert.equal(initial.ok,true);
  const r=writer.registerBulkMember({ownerId:'world-bank-a',
    operationId:'world-bank-register-1',expectedRevision:initial.snapshot.revision,
    expectedEpoch:epoch});
  assert.equal(r.ok,true,r.reason);
  const valid=inspectUnifiedActiveColdImport({world:f.world,worldId,epoch});
  assert.equal(valid.ok,true,valid.reason);
  assert.equal(valid.currentLedgerTotal,184);
  assert.deepEqual([...f.values].filter(([k])=>k.startsWith('hartsorter:')),
    f.source);
});
test('disconnected Receiver shards each accept a distinct Bulk controller',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  const sealed=JSON.parse(f.values.get(UCE_COLD_SEAL_KEY));
  for(let i=0;i<2;i++){
    const shardKey=sealed.shards[i].key;
    const writer=createUnifiedShardWriter({world:f.world,shardKey,
      worldId,epoch,externalFence:()=>true,
      verifyBulkPlacement:()=>true,
      verifyGlobalBulkUniqueness:()=>true});
    const before=writer.inspect().snapshot;
    const registered=writer.registerBulkMember({
      ownerId:'disconnected-bank-'+i,operationId:'register-bank-'+i,
      expectedRevision:before.revision,expectedEpoch:epoch});
    assert.equal(registered.ok,true,registered.reason);
    assert.equal(registered.controllerOwnerId,'disconnected-bank-'+i);
  }
  const valid=inspectUnifiedActiveColdImport({world:f.world,worldId,epoch});
  assert.equal(valid.ok,true,valid.reason);
  assert.equal(valid.currentLedgerTotal,184);
  assert.deepEqual([...f.values].filter(([k])=>k.startsWith('hartsorter:')),
    f.source);
});
test('duplicate Bulk owner across disconnected shards refuses global startup',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  const sealed=JSON.parse(f.values.get(UCE_COLD_SEAL_KEY));
  for(let i=0;i<2;i++){
    const shardKey=sealed.shards[i].key;
    // Deliberately forged callbacks: global startup still must refuse
    // duplicated physical ownership without trusting this registration.
    const writer=createUnifiedShardWriter({world:f.world,shardKey,
      worldId,epoch,externalFence:()=>true,
      verifyBulkPlacement:()=>true,
      verifyGlobalBulkUniqueness:()=>true});
    const before=writer.inspect().snapshot;
    assert.equal(writer.registerBulkMember({
      ownerId:'same-physical-bank',operationId:'forged-claim-'+i,
      expectedRevision:before.revision,expectedEpoch:epoch}).ok,true);
  }
  fail(inspectUnifiedActiveColdImport({world:f.world,worldId,epoch}),
    'duplicate_bulk_owner_across_shards');
  assert.deepEqual([...f.values].filter(([k])=>k.startsWith('hartsorter:')),
    f.source);
});

test('reserved shard atomically registers an empty NEW Receiver without Q4 registry edits',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  const seal=JSON.parse(f.values.get(UCE_COLD_SEAL_KEY));
  const region=seal.shards.find(x=>x.owner.startsWith('reserve:'));
  assert.ok(region);
  const beforeQ4=[...f.values].filter(([key])=>key.startsWith('hartsorter:'));
  const writer=createUnifiedShardWriter({
    world:f.world,shardKey:region.key,worldId,epoch,
    externalFence:()=>true,
    verifyReceiverReserveShard:key=>key===region.key,
    verifyReceiverPlacement:()=>true,
    verifyGlobalReceiverUniqueness:()=>true
  });
  const anchor={dimensionId:'minecraft:overworld',x:50,y:74,z:21};
  const ownerId='minecraft:overworld|50|74|21';
  const revision=writer.inspect().snapshot.revision;
  const registered=writer.registerNewReceiver({ownerId,anchor,
    operationId:'new-receiver-1',expectedEpoch:epoch,
    expectedRevision:revision});
  assert.equal(registered.ok,true,registered.reason);
  assert.equal(registered.status,'RECEIVER_REGISTERED_SAME_LEDGER');
  const active=inspectUnifiedActiveColdImport({world:f.world,worldId,epoch});
  assert.equal(active.ok,true,active.reason);
  assert.equal(active.newReceiverCount,1);
  assert.equal(active.currentLedgerTotal,184);
  assert.equal(writer.inspect().snapshot.accounts[0].uceAnchor.x,50);
  assert.deepEqual([...f.values].filter(([key])=>key.startsWith('hartsorter:')),
    beforeQ4);
  assert.equal(writer.registerNewReceiver({ownerId,anchor,
    operationId:'replayed-registration',expectedEpoch:epoch,
    expectedRevision:revision}).ok,false);
});
test('new Receiver registration fails closed without a valid live identity and reserve',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  const region=JSON.parse(f.values.get(UCE_COLD_SEAL_KEY)).shards
    .find(x=>x.owner.startsWith('reserve:'));
  const writer=createUnifiedShardWriter({world:f.world,shardKey:region.key,
    worldId,epoch,externalFence:()=>true,
    verifyReceiverReserveShard:()=>true,
    verifyReceiverPlacement:()=>false,
    verifyGlobalReceiverUniqueness:()=>true});
  const before=f.writes;
  const out=writer.registerNewReceiver({
    ownerId:'minecraft:overworld|2|3|4',
    anchor:{dimensionId:'minecraft:overworld',x:2,y:3,z:4},
    operationId:'unverified-receiver',expectedEpoch:epoch,
    expectedRevision:0});
  assert.equal(out.ok,false);
  assert.equal(out.status,'HOLD');
  assert.equal(out.reason,'receiver_placement_or_uniqueness_unproven');
  assert.equal(out.canMoveNative,false);
  assert.equal(f.writes,before);
});

test('cross-shard Bulk member cannot spend against another region controller',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  const seal=JSON.parse(f.values.get(UCE_COLD_SEAL_KEY));
  const first=seal.shards[0].key,second=seal.shards[1].key;
  for(const [key,ownerId] of [[first,'bank-a'],[second,'bank-b']]){
    const writer=createUnifiedShardWriter({
      world:f.world,shardKey:key,worldId,epoch,externalFence:()=>true,
      verifyBulkPlacement:()=>true,
      verifyGlobalBulkUniqueness:()=>true});
    const current=writer.inspect().snapshot;
    assert.equal(writer.registerBulkMember({ownerId,
      operationId:'register-'+ownerId,
      expectedRevision:current.revision,expectedEpoch:epoch}).ok,true);
  }
  const read=createUnifiedShardWriter({world:f.world,shardKey:second,
    worldId,epoch,externalFence:()=>true}).inspect().snapshot;
  const local=read.accounts.find(a=>a.id==='bulk:bank-b');
  local.role='member';local.controllerOwnerId='bank-a';
  const forged=previewUnifiedShard({snapshot:read,shardKey:second});
  assert.equal(forged.ok,true,forged.reason);
  f.values.set(second,forged.raw);
  fail(inspectUnifiedActiveColdImport({world:f.world,worldId,epoch}),
    'cold_bulk_controller_conflict');
});
test('same newly registered Receiver cannot claim two reserved shards',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  const seal=JSON.parse(f.values.get(UCE_COLD_SEAL_KEY));
  const reserves=seal.shards.filter(x=>x.owner.startsWith('reserve:'));
  const anchor={dimensionId:'minecraft:overworld',x:60,y:71,z:32};
  const ownerId='minecraft:overworld|60|71|32';
  for(let i=0;i<2;i++){
    const shardKey=reserves[i].key;
    const writer=createUnifiedShardWriter({world:f.world,shardKey,
      worldId,epoch,externalFence:()=>true,
      verifyReceiverReserveShard:()=>true,
      verifyReceiverPlacement:()=>true,
      // Deliberately forged uniqueness to test the global inspection gate.
      verifyGlobalReceiverUniqueness:()=>true});
    const before=writer.inspect().snapshot;
    assert.equal(writer.registerNewReceiver({
      ownerId,anchor,operationId:'forged-receiver-'+i,
      expectedRevision:before.revision,expectedEpoch:epoch}).ok,true);
  }
  fail(inspectUnifiedActiveColdImport({world:f.world,worldId,epoch}),
    'invalid_or_duplicate_new_receiver_owner');
});
