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
  return {writer,create,values,saved,setValid:x=>{valid=x;},
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
