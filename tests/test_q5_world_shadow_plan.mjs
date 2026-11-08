import test from 'node:test';
import assert from 'node:assert/strict';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {previewQ5WorldOrdinaryDrafts}
  from '../candidates/transport/q5_world_ordinary_preview.mjs';
import {REQUIRED_FROZEN_HANDLERS}
  from '../candidates/transport/q5_shadow_staging.mjs';
import {planQ5WorldShadowWrites,inspectQ5WorldShadowRecords}
  from '../candidates/transport/q5_world_shadow_plan.mjs';

const worldId='minecraft:overworld:synthetic';
const ordinary=(typeId='minecraft:cobblestone')=>({
  typeId,lore:[],ench:[],canDestroy:[],canPlaceOn:[]
});
const proof=()=>({
  classification:'ordinary',metadataFree:true,losslessIdentity:true,
  runtimeStackable:true,runtimeMaxStack:64,verifiedFreshRoundTrip:true
});
function fixture(groupCounts=[7,11]) {
  const receivers=[],records=new Map(),identityAssertionsByReceiver=new Map();
  let total=0;
  for(let i=0;i<groupCounts.length;i++){
    const count=groupCounts[i],queueKey='q'+(i+1);
    const id='minecraft:overworld|'+i+',69,-55';
    receivers.push({id,queueKey});
    total+=count;
    records.set('hartsorter:q4m_'+queueKey,JSON.stringify({
      v:4,h:count?1:0,t:count?1:0,n:count?2:1,
      q:count,r:count,d:0
    }));
    if(count){
      records.set('hartsorter:q4p_'+queueKey+'_0',JSON.stringify(
        [0,[['a',count]]]));
      records.set('hartsorter:q4d_'+queueKey+'_a',
        JSON.stringify(ordinary(i%2?'minecraft:iron_ingot':'minecraft:cobblestone')));
    }
    const assertions=new Map();
    if(count)assertions.set(
      q5IdentityKey(ordinary(i%2?'minecraft:iron_ingot':'minecraft:cobblestone')),
      proof()
    );
    identityAssertionsByReceiver.set(id,assertions);
  }
  let writes=0;
  const world={
    getDynamicPropertyIds:()=>[...records.keys()],
    getDynamicProperty:key=>records.get(key),
    setDynamicProperty:()=>{writes++;}
  };
  const epoch=14;
  const base={world,worldId,records,receivers,
    expectedReceiverCount:receivers.length,
    expectedQueuedTotal:total,registrySnapshotStable:true,
    epoch,identityAssertionsByReceiver};
  const seen=previewQ5WorldOrdinaryDrafts(base);
  assert.equal(seen.ok,true,'valid synthetic Q4 fixture');
  const q4WitnessByReceiver=new Map(seen.drafts.map(d=>[d.receiverId,{
    receiverId:d.receiverId,snapshotFingerprint:d.sourceFingerprint,
    total:d.itemCount,revision:2,completeSnapshot:true,
    queueJournalClear:true,physicalJournalClear:true,sourceUnchanged:true
  }]));
  const freeze={active:true,worldEpoch:epoch,verifiedAllHartHandlers:true,
    coveredHandlers:[...REQUIRED_FROZEN_HANDLERS]};
  return {...base,q4WitnessByReceiver,freeze,
    get writes(){return writes;}};
}
const run=(f,changes={})=>planQ5WorldShadowWrites({...f,...changes});
const deniedKeys=['canRoute','canMigrate','canStageWorld','canDebitQ4',
  'canWriteQ5','canWriteWorld','canClearQ4','canSettle','canRetry'];
function noPermit(r){
  for(const k of deniedKeys)assert.equal(r[k],false,k);
}
function hold(r,reason){
  assert.equal(r.ok,false);
  assert.equal(r.status,'HOLD');
  if(reason)assert.equal(r.reason,reason);
  noPermit(r);
}
const writeMock=(prepared,extra=[])=>new Map([
  ...prepared.plans.flatMap(x=>x.writes.map(w=>[w.key,w.value])),
  ...extra
]);

test('35 Receiver world yields only Q4-owned shadow write plans, not custody',()=>{
  const f=fixture([90070,...Array.from({length:33},()=>800),3037]);
  const before=JSON.stringify([...f.records]),r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.status,'GLOBAL_SHADOW_WRITE_PLAN_ONLY');
  assert.equal(r.receiverCount,35);
  assert.equal(r.itemCount,119507);
  assert.equal(r.pageCount,35);
  assert.equal(r.recordCount,35*3);
  assert.equal(r.plans.length,35);
  assert.equal(r.hasDurableWorldFreezeProof,false);
  assert.equal(r.hasCrashAtomicityProof,false);
  assert.equal(r.hasNativeMRIdentityProof,false);
  noPermit(r);
  assert.equal(JSON.stringify([...f.records]),before);
  assert.equal(f.writes,0);
});
test('all planned page, manifest and seal keys are unique per Receiver',()=>{
  const r=run(fixture());
  assert.equal(r.ok,true);
  const writes=r.plans.flatMap(x=>x.writes);
  assert.equal(new Set(writes.map(x=>x.key)).size,writes.length);
  assert.equal(r.plans.every(x=>x.writes.at(-1).key.endsWith(':seal')),true);
  assert.equal(r.plans.every(x=>x.writes.at(-2).key.endsWith(':manifest')),true);
});
test('complete mocked shadow records pass READ-ONLY reconciliation only',()=>{
  const f=fixture(),prepared=run(f);
  assert.equal(prepared.ok,true);
  const before=JSON.stringify([...f.records]);
  const records=writeMock(prepared);
  const r=inspectQ5WorldShadowRecords({prepared,records,freeze:f.freeze});
  assert.equal(r.ok,true);
  assert.equal(r.status,'GLOBAL_SHADOW_RECORDS_READ_ONLY');
  assert.equal(r.itemCount,18);
  assert.equal(r.recordCount,prepared.recordCount);
  assert.equal(r.q4RemainsAuthoritative,true);
  noPermit(r);
  assert.equal(JSON.stringify([...f.records]),before);
  assert.equal(f.writes,0);
});
test('interrupted first page, manifest or seal write HOLDS all Receivers',()=>{
  const f=fixture(),prepared=run(f);
  for(const item of prepared.plans){
    for(const write of item.writes){
      const store=writeMock(prepared);
      store.delete(write.key);
      const r=inspectQ5WorldShadowRecords({
        prepared,records:store,freeze:f.freeze
      });
      hold(r);
      assert.match(r.reason,/receiver_shadow_incomplete/);
    }
  }
});
test('a torn, reserialized or mismatched shadow page HOLDS all Receivers',()=>{
  const f=fixture(),prepared=run(f);
  for(const item of prepared.plans){
    for(const write of item.writes){
      const store=writeMock(prepared);
      store.set(write.key,' '+write.value);
      hold(inspectQ5WorldShadowRecords({prepared,records:store,freeze:f.freeze}));
    }
  }
});
test('unclaimed Q5 shadow epochs, pages and orphan receiver records HOLD',()=>{
  const f=fixture(),prepared=run(f);
  for(const key of [
    'hl2:q5shadow:other:e1:r0:manifest',
    prepared.plans[0].namespace+'page:999',
    'hl2:q5shadow:old_orphan:seal'
  ]){
    const store=writeMock(prepared,[[key,'{}']]);
    hold(inspectQ5WorldShadowRecords({prepared,records:store,freeze:f.freeze}),
      'unclaimed_q5_shadow_record');
  }
});
test('unrelated world properties and mods are not removed or classified',()=>{
  const f=fixture(),prepared=run(f);
  const store=writeMock(prepared,[
    ['other_mod:unrelated','data'],
    ['hartsorter:q4m_q1',f.records.get('hartsorter:q4m_q1')]
  ]);
  const before=JSON.stringify([...store]);
  const r=inspectQ5WorldShadowRecords({
    prepared,records:store,freeze:f.freeze
  });
  assert.equal(r.ok,true);
  assert.equal(JSON.stringify([...store]),before);
});
test('missing, duplicate or extra Q4 Receiver witnesses refuse all plans',()=>{
  const f=fixture(),id=f.receivers[1].id;
  const missing=new Map(f.q4WitnessByReceiver);
  missing.delete(id);
  hold(run(f,{q4WitnessByReceiver:missing}),
    'incomplete_q4_receiver_witnesses');
  const extras=new Map(f.q4WitnessByReceiver);
  extras.delete(id);extras.set('foreign_receiver',{});
  hold(run(f,{q4WitnessByReceiver:extras}),
    'unregistered_q4_receiver_witness');
});
test('source fingerprint mismatch or Q4 count drift refuses before planning',()=>{
  for(const edit of [
    q=>q.snapshotFingerprint='fnv32:00000000',
    q=>q.total++,
    q=>q.receiverId='different',
    q=>q.revision='bad'
  ]){
    const f=fixture(),w=new Map(f.q4WitnessByReceiver);
    const id=f.receivers[0].id,obj={...w.get(id)};
    edit(obj);w.set(id,obj);
    hold(run(f,{q4WitnessByReceiver:w}),
      'source_witness_mismatch:'+id);
  }
});
test('synthetic incomplete world-freeze handler claim cannot plan any shadow',()=>{
  const f=fixture(),freeze={...f.freeze,verifiedAllHartHandlers:false};
  const r=run(f,{freeze});
  hold(r);
  assert.match(r.reason,/global_freeze_unproven/);
});
test('missing one of 12 required frozen handlers refuses all shadow plans',()=>{
  const f=fixture(),freeze={...f.freeze,
    coveredHandlers:f.freeze.coveredHandlers.slice(1)};
  hold(run(f,{freeze}));
});
test('missing Q4 queue or physical journal witness blocks all world plans',()=>{
  for(const prop of ['queueJournalClear','physicalJournalClear',
                     'sourceUnchanged','completeSnapshot']){
    const f=fixture(),m=new Map(f.q4WitnessByReceiver),id=f.receivers[0].id;
    m.set(id,{...m.get(id),[prop]:false});
    hold(run(f,{q4WitnessByReceiver:m}));
  }
});
test('epoch mismatch prevents shadow authority even when all draft totals match',()=>{
  const f=fixture();
  hold(run(f,{freeze:{...f.freeze,worldEpoch:13}}),
    'global_shadow_inputs_unverified');
});
test('unregistered Q4 metadata and pending queue journals refuse globally',()=>{
  const f=fixture();
  f.records.set('hartsorter:q4m_q99','{"v":4,"h":0,"t":0,"n":1,"q":0,"r":0,"d":0}');
  hold(run(f));
  const g=fixture();
  g.records.set('hartsorter:queue_journal_v1','pending');
  hold(run(g));
});
test('MR-like metadata in one Receiver prohibits ordinary-only whole-world staging',()=>{
  const f=fixture(),id=f.receivers[1].queueKey;
  f.records.set('hartsorter:q4d_'+id+'_a',
    JSON.stringify({...ordinary('minecraft:enchanted_book')}));
  hold(run(f));
  assert.equal(f.writes,0);
});
test('world changes between Q5 draft and shadow planning final re-read HOLD',()=>{
  const f=fixture(),get=f.world.getDynamicPropertyIds;
  let lists=0;
  f.world.getDynamicPropertyIds=()=>{
    lists++;
    if(lists===17){
      const key='hartsorter:q4m_q1',m=JSON.parse(f.records.get(key));
      m.r++;
      f.records.set(key,JSON.stringify(m));
    }
    return get();
  };
  const r=run(f);
  hold(r);
  assert.match(r.reason,/q4_changed_during_world_shadow_planning|final_world_ordinary_draft_refused/);
});
test('change to Q4 witness claims while scans run is detected',()=>{
  const f=fixture(),get=f.world.getDynamicPropertyIds;
  let lists=0;
  f.world.getDynamicPropertyIds=()=>{
    lists++;
    if(lists===17){
      f.q4WitnessByReceiver.get(f.receivers[0].id).revision=3;
    }
    return get();
  };
  hold(run(f),'world_witness_changed_during_shadow_planning');
});
test('unreadable, cyclical or absent witness claims never create plans',()=>{
  const f=fixture();
  hold(run(f,{q4WitnessByReceiver:null}),'global_shadow_inputs_unverified');
  const map=new Map(f.q4WitnessByReceiver);
  const id=f.receivers[0].id,obj={...map.get(id)};
  obj.loop=obj;map.set(id,obj);
  hold(run(f,{q4WitnessByReceiver:map}),'unreadable_world_witnesses');
});
test('invalid shadow store input and unknown non-string key HOLD',()=>{
  const f=fixture(),p=run(f);
  hold(inspectQ5WorldShadowRecords({prepared:null,records:new Map(),freeze:f.freeze}),
    'unverifiable_world_shadow_records');
  hold(inspectQ5WorldShadowRecords({prepared:p,records:{},freeze:f.freeze}),
    'unverifiable_world_shadow_records');
  const bad=writeMock(p);bad.set(null,'bogus');
  hold(inspectQ5WorldShadowRecords({prepared:p,records:bad,freeze:f.freeze}),
    'invalid_world_record_key');
});
test('foreign/unknown shadow key with nonstring value is held',()=>{
  const f=fixture(),p=run(f);
  const store=writeMock(p);
  store.set(p.plans[0].writes[0].key,42);
  hold(inspectQ5WorldShadowRecords({prepared:p,records:store,freeze:f.freeze}));
});
test('an old or missing quiescence claim cannot certify shadow observations',()=>{
  const f=fixture(),p=run(f),store=writeMock(p);
  hold(inspectQ5WorldShadowRecords({
    prepared:p,records:store,freeze:{...f.freeze,active:false}
  }));
  hold(inspectQ5WorldShadowRecords({
    prepared:p,records:store,freeze:{...f.freeze,worldEpoch:15}
  }));
});
test('empty Q4 world yields no shadow writes, only no-authority inspection',()=>{
  const f=fixture([]);
  const plan=run(f);
  assert.equal(plan.ok,true);
  assert.equal(plan.receiverCount,0);
  assert.equal(plan.itemCount,0);
  assert.equal(plan.recordCount,0);
  noPermit(plan);
  const inspected=inspectQ5WorldShadowRecords({
    prepared:plan,records:new Map(),freeze:f.freeze
  });
  assert.equal(inspected.ok,true);
  noPermit(inspected);
});
test('full 250000 ordinary count remains planned pages only',()=>{
  const f=fixture([250000]);
  const r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.itemCount,250000);
  noPermit(r);
});
test('repeated complete plans never invoke Bedrock writers or mutate Q4 state',()=>{
  const f=fixture([90070,800]),raw=JSON.stringify([...f.records]);
  for(let i=0;i<8;i++){
    const p=run(f);
    assert.equal(p.ok,true);
    const read=inspectQ5WorldShadowRecords({
      prepared:p,records:writeMock(p),freeze:f.freeze
    });
    assert.equal(read.ok,true);
    noPermit(read);
  }
  assert.equal(JSON.stringify([...f.records]),raw);
  assert.equal(f.writes,0);
});
