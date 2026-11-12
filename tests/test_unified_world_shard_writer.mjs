import test from 'node:test';
import assert from 'node:assert/strict';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {
  createEmptyUnifiedOrdinaryLedger,registerUnifiedEmptyAccount,
  inspectUnifiedOrdinaryLedger
} from '../candidates/transport/unified_ordinary_accounts.mjs';
import {
  previewUnifiedShard,createUnifiedShardWriter,
  UCE_AUTHORITY_SCHEMA,UCE_AUTHORITY_KEY,UCE_SHARD_MAX_CHARS
} from '../candidates/transport/unified_world_shard_writer.mjs';

const key='hartlogistics:uce_shard_region1_v1';
const worldId='minecraft:overworld:archive-141';
const epoch=11;
const item={typeId:'minecraft:cobblestone',lore:[],ench:[],
  canDestroy:[],canPlaceOn:[]};
const itemKey=q5IdentityKey(item);
function snapshot(){
  let s=createEmptyUnifiedOrdinaryLedger({worldId,epoch}).snapshot;
  for(const [kind,ownerId] of [['receiver','r1'],['bulk','b1']]){
    const r=registerUnifiedEmptyAccount(s,{
      kind,ownerId,expectedRevision:s.revision,expectedEpoch:epoch
    });
    assert.equal(r.ok,true,r.reason);
    s=r.next;
  }
  const recv=s.accounts.find(a=>a.id==='receiver:r1');
  recv.total=12;
  recv.buckets=[{key:itemKey,count:12}];
  s.total=12;
  assert.equal(inspectUnifiedOrdinaryLedger(s).ok,true);
  return s;
}
function fixture(options={}){
  const initial=snapshot();
  const plan=previewUnifiedShard({snapshot:initial,shardKey:key});
  assert.equal(plan.ok,true,plan.reason);
  const values=new Map([[key,plan.raw]]);
  if(options.active!==false)values.set(UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',worldId,epoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  }));
  let writes=0;
  const world={
    getDynamicProperty(k){
      if(options.onRead)return options.onRead(k,values,writes);
      return values.get(k);
    },
    setDynamicProperty(k,v){
      writes++;
      if(options.onWrite)return options.onWrite(k,v,values,writes);
      values.set(k,v);
    }
  };
  const writer=createUnifiedShardWriter({world,worldId,shardKey:key,
    epoch,externalFence:options.externalFence??(()=>true)});
  assert.equal(writer.ok,true,writer.reason);
  const req={operationId:'receipt-world11-rev3',from:'receiver:r1',
    to:'bulk:b1',key:itemKey,count:8,expectedRevision:initial.revision,
    expectedEpoch:epoch};
  return {world,writer,values,req,
    get writes(){return writes}};
}
function holds(r,reason){
  assert.equal(r.ok,false);
  assert.equal(r.status,'HOLD');
  if(reason)assert.equal(r.reason,reason);
  assert.equal(r.canMoveNative,false);
}
test('one Bedrock property write transfers between Receiver and Bulk with readback receipt',()=>{
  const f=fixture(),before=f.values.get(key);
  const r=f.writer.applyInternalTransfer(f.req);
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'ONE_RECORD_INTERNAL_TRANSFER_READBACK');
  assert.equal(f.writes,1);
  assert.notEqual(f.values.get(key),before);
  const view=f.writer.inspect();
  assert.equal(view.ok,true,view.reason);
  assert.equal(view.snapshot.total,12);
  assert.equal(view.snapshot.accounts.find(a=>a.id==='receiver:r1').total,4);
  assert.equal(view.snapshot.accounts.find(a=>a.id==='bulk:b1').total,8);
  assert.equal(view.lastReceipt.operationId,f.req.operationId);
  assert.equal(view.lastReceipt.revision,r.afterRevision);
  assert.equal(r.hasHardCrashDiskProof,false);
});
test('replayed old revision cannot spend twice even after process recreation',()=>{
  const f=fixture();
  assert.equal(f.writer.applyInternalTransfer(f.req).ok,true);
  holds(f.writer.applyInternalTransfer(f.req),'invalid_or_stale_internal_intent');
  const fresh=createUnifiedShardWriter({
    world:f.world,shardKey:key,worldId,epoch,externalFence:()=>true});
  holds(fresh.applyInternalTransfer(f.req),'invalid_or_stale_internal_intent');
  assert.equal(f.writes,1);
});
test('no authority means no mutation or implicit Q4 migration',()=>{
  const f=fixture({active:false});
  holds(f.writer.applyInternalTransfer(f.req),'world_ue_authority_missing');
  assert.equal(f.writes,0);
});
test('forged ACTIVE status without exclusive legacy writer state is refused',()=>{
  const f=fixture(),authority=JSON.parse(f.values.get(UCE_AUTHORITY_KEY));
  authority.q4LegacyWritersFenced=false;
  f.values.set(UCE_AUTHORITY_KEY,JSON.stringify(authority));
  holds(f.writer.applyInternalTransfer(f.req),'world_ue_authority_not_exclusive');
  assert.equal(f.writes,0);
});
test('pending physical or Q4 journal halts account changes',()=>{
  for(const journal of ['hartsorter:journal_v1',
                         'hartsorter:queue_journal_v1']){
    const f=fixture();
    f.values.set(journal,'{"uncertain":true}');
    holds(f.writer.applyInternalTransfer(f.req),'legacy_journal_pending');
    assert.equal(f.writes,0);
  }
});
test('actual caller writer fence is mandatory and rechecked immediately prewrite',()=>{
  const f=fixture({externalFence:()=>false});
  holds(f.writer.applyInternalTransfer(f.req),
    'legacy_writer_exclusion_unproven');
  assert.equal(f.writes,0);
  let calls=0;
  const x=fixture({externalFence:()=>++calls===1});
  holds(x.writer.applyInternalTransfer(x.req),
    'world_writer_fence_changed_prewrite');
  assert.equal(x.writes,0);
});
test('read-only inspection rejects corrupt or changed ledger and never repairs it',()=>{
  const f=fixture();
  f.values.set(key,'{bad');
  holds(f.writer.inspect(),'world_shard_invalid_json');
  holds(f.writer.applyInternalTransfer(f.req),'world_shard_invalid_json');
  assert.equal(f.writes,0);
  const g=fixture();
  const tampered=JSON.parse(g.values.get(key));
  tampered.snapshot.total=500;
  g.values.set(key,JSON.stringify(tampered));
  holds(g.writer.inspect(),'invalid_world_shard_ledger:ledger_conservation_mismatch');
});
test('mid-read state drift is detected and not written',()=>{
  const f=fixture({onRead:(k,values)=>{
    if(k===key) return values.get(key);
    return values.get(k);
  }});
  assert.equal(f.writer.inspect().ok,true);
  let reads=0;
  const g=fixture({onRead:(k,values)=>{
    if(k===key&&++reads===2)return values.get(key)+' ';
    return values.get(k);
  }});
  holds(g.writer.inspect(),'world_shard_changed_during_inspection');
  assert.equal(g.writes,0);
});
test('write throws even after physically writing: fail closed with per-session quarantine',()=>{
  const f=fixture({onWrite:(k,v,values)=>{
    values.set(k,v);
    throw Error('simulated BDS write-after-commit exception');
  }});
  holds(f.writer.applyInternalTransfer(f.req),
    'world_shard_write_outcome_ambiguous');
  assert.equal(f.writes,1);
  holds(f.writer.applyInternalTransfer(f.req),
    'shard_session_quarantine:write_outcome_ambiguous');
  assert.equal(f.writes,1);
  const after=f.writer.inspect();
  assert.equal(after.ok,true);
  assert.equal(after.snapshot.accounts.find(a=>a.id==='bulk:b1').total,8);
});
test('postwrite receipt mismatch quarantines without a second debit',()=>{
  const f=fixture({onWrite:(k,v,values)=>{
    values.set(k,v.replace('receipt-world11-rev3','receipt-drift'));
  }});
  holds(f.writer.applyInternalTransfer(f.req),'world_shard_postwrite_mismatch');
  holds(f.writer.applyInternalTransfer(f.req),
    'shard_session_quarantine:postwrite_mismatch');
  assert.equal(f.writes,1);
});
test('changed shard between planning and write refuses without overwriting another writer',()=>{
  let n=0;
  const f=fixture({onRead:(k,values)=>{
    if(k===key && ++n===2)return values.get(k)+' ';
    return values.get(k);
  }});
  holds(f.writer.applyInternalTransfer(f.req),'world_shard_changed_prewrite');
  assert.equal(f.writes,0);
});
test('bounded property prevents arbitrary 250k-item world expansion into huge string',()=>{
  let s=createEmptyUnifiedOrdinaryLedger({worldId,epoch}).snapshot;
  for(let i=0;i<250;i++){
    const r=registerUnifiedEmptyAccount(s,{
      kind:'bulk',ownerId:'member-'+String(i).padStart(4,'0'),
      expectedRevision:s.revision,expectedEpoch:epoch});
    assert.equal(r.ok,true,r.reason);
    s=r.next;
  }
  const p=previewUnifiedShard({snapshot:s,shardKey:key});
  holds(p,'world_shard_capacity_exceeded');
  assert.equal(UCE_SHARD_MAX_CHARS,28000);
});
test('missing shipment source and native move remain out of scope of this writer',()=>{
  const f=fixture();
  const wrong={...f.req,from:'receiver:missing'};
  holds(f.writer.applyInternalTransfer(wrong),'unknown_account');
  assert.equal(f.writes,0);
  assert.equal(f.writer.canMoveNative,undefined);
});
