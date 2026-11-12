import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnifiedLinkRegistry,UCE_LINKS_KEY,UCE_LINKS_RECEIPT_SCHEMA}
  from '../candidates/transport/unified_link_registry.mjs';
import {UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA}
  from '../candidates/transport/unified_world_shard_writer.mjs';
const worldId='minecraft:overworld:registered-bds-copy',epoch=71;
const collector={id:'minecraft:overworld|3|70|1',
  d:'minecraft:overworld',x:3,y:70,z:1};
const receiver={id:'minecraft:overworld|5|70|1',
  d:'minecraft:overworld',x:5,y:70,z:1,
  queueKey:'q1',qVersion:4,qShards:0,queued:0,
  received:0,delivered:0,present:true};
function fixture(opts={}){
  const saved={collectors:[],receivers:[receiver],nextQueue:2,
    customLegacy:'preserved-original-registry-field'};
  const values=new Map([
    [UCE_LINKS_KEY,JSON.stringify(saved)],
    [UCE_AUTHORITY_KEY,JSON.stringify({
      schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',
      worldId,epoch,writer:'UCE_EXCLUSIVE',
      q4LegacyWritersFenced:true,migrationReconciled:true
    })],
    ['hartsorter:q4m_q1','original-q4-custody-bytes']
  ]);
  let writes=0,valid=opts.valid!==false,receiverValid=opts.receiverValid!==false;
  const world={
    getDynamicProperty:k=>values.get(k),
    setDynamicProperty(k,v){
      writes++;
      if(opts.onWrite)return opts.onWrite(k,v,values);
      values.set(k,v);
    }
  };
  const create=()=>createUnifiedLinkRegistry({
    world,worldId,epoch,externalFence:opts.externalFence||(()=>true),
    verifyCollectorBlock:()=>valid,
    verifySealedReceiver:()=>receiverValid});
  const writer=create();
  assert.equal(writer.ok,true,writer.reason);
  return {writer,create,values,world,saved,setValid:x=>{valid=x;},
    setReceiverValid:x=>{receiverValid=x;},
    get writes(){return writes}};
}
function req(collectorRecord=collector,rev=0){
  return {operationId:'link-op-1',collector:collectorRecord,
    receiverId:receiver.id,expectedRevision:rev};
}
function hold(x,reason){
  assert.equal(x.ok,false,JSON.stringify(x));
  assert.equal(x.status,'HOLD');if(reason)assert.equal(x.reason,reason);
}
test('new native Collector links to already-sealed Receiver as one persisted registry record',()=>{
  const f=fixture(),before=f.values.get('hartsorter:q4m_q1');
  const out=f.writer.linkCollector(req());
  assert.equal(out.ok,true,out.reason);
  assert.equal(out.status,'COLLECTOR_LINK_COMMITTED_READBACK');
  assert.equal(f.writes,1);
  const data=JSON.parse(f.values.get(UCE_LINKS_KEY));
  assert.equal(data.nextQueue,2);
  assert.equal(data.customLegacy,'preserved-original-registry-field');
  assert.equal(data.receivers[0].queueKey,'q1');
  assert.equal(data.collectors.length,1);
  assert.equal(data.collectors[0].link,receiver.id);
  assert.equal(data.collectors[0].accepted,0);
  assert.equal(data.uceLinkRevision,1);
  assert.equal(data.uceLastLinkReceipt.schema,UCE_LINKS_RECEIPT_SCHEMA);
  assert.equal(f.values.get('hartsorter:q4m_q1'),before);
});
test('duplicate user selection is idempotent, not an extra registry write',()=>{
  const f=fixture();assert.equal(f.writer.linkCollector(req()).ok,true);
  const same=f.writer.linkCollector(req(collector,1));
  assert.equal(same.ok,true,same.reason);
  assert.equal(same.status,'COLLECTOR_LINK_ALREADY_PRESENT');
  assert.equal(f.writes,1);
});
test('missing physical Collector, sealed Receiver, or no active authority holds',()=>{
  const a=fixture({valid:false});
  hold(a.writer.linkCollector(req()),'collector_or_sealed_receiver_unverified');
  const b=fixture({receiverValid:false});
  hold(b.writer.linkCollector(req()),'collector_or_sealed_receiver_unverified');
  const c=fixture();c.values.delete(UCE_AUTHORITY_KEY);
  hold(c.writer.linkCollector(req()),'world_ue_authority_missing');
  assert.equal(a.writes+b.writes+c.writes,0);
});
test('pending native or ordinary custody transaction blocks relink',()=>{
  for(const key of ['hartlogistics:uce_native_intent_v1',
                    'hartlogistics:uce_boundary_intent_v1',
                    'hartsorter:queue_journal_v1']){
    const f=fixture();f.values.set(key,JSON.stringify({pending:true}));
    hold(f.writer.linkCollector(req()));
    assert.equal(f.writes,0);
  }
});
test('identity collision or stale revision never silently overwrites existing link',()=>{
  const f=fixture();assert.equal(f.writer.linkCollector(req()).ok,true);
  hold(f.writer.linkCollector(req({...collector,x:999},1)),
    'collector_identity_collision');
  hold(f.writer.linkCollector(req(collector,0)),
    'stale_link_registry_revision');
  assert.equal(f.writes,1);
});
test('write result ambiguous: one session quarantine even if property changed',()=>{
  const f=fixture({onWrite:(k,v,values)=>{
    values.set(k,v);throw Error('BDS may have saved before throw');
  }});
  hold(f.writer.linkCollector(req()),'link_write_outcome_ambiguous');
  hold(f.writer.linkCollector(req()),'link_session_quarantined');
  assert.equal(f.writes,1);
  assert.equal(JSON.parse(f.values.get(UCE_LINKS_KEY)).collectors.length,1);
});
test('unreadable, duplicated or mutated source registry fails closed',()=>{
  const a=fixture();a.values.set(UCE_LINKS_KEY,'{broken');
  hold(a.writer.linkCollector(req()),'saved_logistics_corrupt');
  const b=fixture();
  const bad={...b.saved,collectors:[collector,collector]};
  b.values.set(UCE_LINKS_KEY,JSON.stringify(bad));
  hold(b.writer.linkCollector(req()),'saved_collector_registry_invalid');
  assert.equal(a.writes+b.writes,0);
});

test('Collector links to a newly sealed Receiver absent the old Q4 registry',()=>{
  const f=fixture();
  const saved={...f.saved,receivers:[]};
  f.values.set(UCE_LINKS_KEY,JSON.stringify(saved));
  const out=f.writer.linkCollector(req());
  assert.equal(out.ok,true,out.reason);
  assert.equal(f.writes,1);
  const now=JSON.parse(f.values.get(UCE_LINKS_KEY));
  assert.equal(now.receivers.length,0);
  assert.equal(now.collectors[0].link,receiver.id);
  assert.equal(f.values.get('hartsorter:q4m_q1'),
    'original-q4-custody-bytes');
});
test('an unsealed new Receiver cannot be targeted even without a legacy Q4 row',()=>{
  const f=fixture({receiverValid:false});
  f.values.set(UCE_LINKS_KEY,JSON.stringify({...f.saved,receivers:[]}));
  hold(f.writer.linkCollector(req()),'collector_or_sealed_receiver_unverified');
  assert.equal(f.writes,0);
});

test('PG36 absent fresh-world registry is initialized atomically by first Collector link only',()=>{
  const f=fixture();
  f.values.delete(UCE_LINKS_KEY);
  f.values.delete('hartsorter:q4m_q1');
  let bootstrapChecks=0;
  const verified=()=>{bootstrapChecks++;return true;};
  const writer=createUnifiedLinkRegistry({
    world:f.world,worldId,epoch,externalFence:()=>true,
    verifyCollectorBlock:()=>true,verifySealedReceiver:()=>true,
    verifyEmptyNewWorld:verified});
  const pre=writer.inspect();
  assert.equal(pre.ok,true,pre.reason);
  assert.equal(pre.collectorCount,0);
  assert.equal(pre.receiverCount,0);
  assert.equal(pre.revision,0);
  assert.equal(f.writes,0,'inspect never writes a synthetic registry');
  const out=writer.linkCollector(req());
  assert.equal(out.ok,true,out.reason);
  assert.equal(out.status,'COLLECTOR_LINK_COMMITTED_READBACK');
  assert.equal(f.writes,1,'one combined registry/link atomic write only');
  assert.ok(bootstrapChecks>=3,'fresh-world proof rechecked around write');
  const saved=JSON.parse(f.values.get(UCE_LINKS_KEY));
  assert.equal(saved.nextQueue,1);
  assert.equal(saved.receivers.length,0);
  assert.equal(saved.collectors.length,1);
  assert.equal(saved.collectors[0].link,receiver.id);
  assert.equal(writer.inspect().revision,1);
});

test('PG36 existing Q4 and missing/corrupt saved registry remain HOLD unless explicit fresh proof',()=>{
  const f=fixture();
  f.values.delete(UCE_LINKS_KEY);
  hold(f.writer.inspect(),'saved_logistics_missing_or_oversized');
  hold(f.writer.linkCollector(req()),'saved_logistics_missing_or_oversized');
  assert.equal(f.writes,0);
  for(const raw of [null,'','{broken']){
    f.values.set(UCE_LINKS_KEY,raw);
    const writer=createUnifiedLinkRegistry({
      world:f.world,worldId,epoch,externalFence:()=>true,
      verifyCollectorBlock:()=>true,verifySealedReceiver:()=>true,
      verifyEmptyNewWorld:()=>true});
    hold(writer.inspect());
    assert.equal(f.writes,0);
  }
});

test('PG36 fresh origin proof must remain valid immediately before first write',()=>{
  const f=fixture();
  f.values.delete(UCE_LINKS_KEY);
  let proofs=0;
  const writer=createUnifiedLinkRegistry({
    world:f.world,worldId,epoch,externalFence:()=>true,
    verifyCollectorBlock:()=>true,verifySealedReceiver:()=>true,
    verifyEmptyNewWorld:()=>++proofs<3});
  const result=writer.linkCollector(req());
  hold(result,'link_route_or_writer_fence_changed_prewrite');
  assert.equal(f.writes,0);
  assert.equal(f.values.has(UCE_LINKS_KEY),false);
});
