import test from 'node:test';
import assert from 'node:assert/strict';
import {q5IdentityKey} from '../candidates/transport/q5_bucket_core.mjs';
import {previewQ5WorldOrdinaryDrafts}
  from '../candidates/transport/q5_world_ordinary_preview.mjs';
import {REQUIRED_FROZEN_HANDLERS}
  from '../candidates/transport/q5_shadow_staging.mjs';
import {planQ5WorldShadowWrites}
  from '../candidates/transport/q5_world_shadow_plan.mjs';
import {inspectQ5WorldShadowAgainstCurrentQ4}
  from '../candidates/transport/q5_shadow_source_freshness.mjs';

const worldId='minecraft:overworld:test';
const ordinary=(typeId='minecraft:cobblestone')=>({
  typeId,lore:[],ench:[],canDestroy:[],canPlaceOn:[]
});
const proof=()=>({
  classification:'ordinary',metadataFree:true,losslessIdentity:true,
  runtimeStackable:true,runtimeMaxStack:64,verifiedFreshRoundTrip:true
});
function fixture(counts=[11,7]){
  const records=new Map(),receivers=[],identityAssertionsByReceiver=new Map();
  let total=0,writes=0;
  counts.forEach((count,i)=>{
    const id='minecraft:overworld|'+i+',70,-64',queueKey='q'+(i+1);
    const definition=ordinary(i%2?'minecraft:iron_ingot':'minecraft:cobblestone');
    receivers.push({id,queueKey});total+=count;
    records.set('hartsorter:q4m_'+queueKey,JSON.stringify({
      v:4,h:count?1:0,t:count?1:0,n:count?2:1,
      q:count,r:count,d:0
    }));
    if(count){
      records.set('hartsorter:q4p_'+queueKey+'_0',
        JSON.stringify([0,[['a',count]]]));
      records.set('hartsorter:q4d_'+queueKey+'_a',
        JSON.stringify(definition));
    }
    const map=new Map();
    if(count)map.set(q5IdentityKey(definition),proof());
    identityAssertionsByReceiver.set(id,map);
  });
  const world={
    getDynamicPropertyIds:()=>[...records.keys()],
    getDynamicProperty:key=>records.get(key),
    setDynamicProperty:()=>{writes++;}
  };
  const epoch=19;
  const source={world,worldId,receivers,expectedReceiverCount:counts.length,
    expectedQueuedTotal:total,registrySnapshotStable:true,
    epoch,identityAssertionsByReceiver};
  const initial=previewQ5WorldOrdinaryDrafts(source);
  assert.equal(initial.ok,true);
  source.q4WitnessByReceiver=new Map(initial.drafts.map(item=>[
    item.receiverId,{
      receiverId:item.receiverId,snapshotFingerprint:item.sourceFingerprint,
      total:item.itemCount,revision:2,completeSnapshot:true,
      queueJournalClear:true,physicalJournalClear:true,sourceUnchanged:true
    }
  ]));
  const freeze={active:true,worldEpoch:epoch,verifiedAllHartHandlers:true,
    coveredHandlers:[...REQUIRED_FROZEN_HANDLERS]};
  const prepared=planQ5WorldShadowWrites({...source,freeze});
  assert.equal(prepared.ok,true);
  const shadow=new Map(prepared.plans.flatMap(p=>p.writes.map(w=>[w.key,w.value])));
  return {source,records,freeze,prepared,shadow,get writes(){return writes;}};
}
const inspect=(f,overrides={})=>inspectQ5WorldShadowAgainstCurrentQ4({
  source:f.source,prepared:f.prepared,records:f.shadow,freeze:f.freeze,
  ...overrides
});
const noPermit=r=>{
  for(const name of ['canRoute','canMigrate','canStageWorld','canDebitQ4',
    'canWriteQ5','canWriteWorld','canClearQ4','canSettle','canRetry'])
    assert.equal(r[name],false,name);
};
const hold=(r,reason)=>{
  assert.equal(r.ok,false);
  assert.equal(r.status,'HOLD');
  if(reason)assert.equal(r.reason,reason);
  noPermit(r);
};
function changeQ4Counter(f,idIndex=0){
  const key='hartsorter:q4m_q'+(idIndex+1);
  const m=JSON.parse(f.records.get(key));m.r++;
  f.records.set(key,JSON.stringify(m));
}
test('complete current Q4 and all shadow pages can correlate, never authorize writes',()=>{
  const f=fixture(),raw=JSON.stringify([...f.records]),r=inspect(f);
  assert.equal(r.ok,true);
  assert.equal(r.status,'CURRENT_Q4_SHADOW_CORRELATION_READ_ONLY');
  assert.equal(r.receiverCount,2);
  assert.equal(r.itemCount,18);
  assert.equal(r.q4RemainsAuthoritative,true);
  assert.equal(r.hasAtomicReadProof,false);
  assert.equal(r.hasDurableFreezeProof,false);
  assert.equal(r.hasAuthenticatedLiveItemProof,false);
  noPermit(r);
  assert.equal(JSON.stringify([...f.records]),raw);
  assert.equal(f.writes,0);
});
test('35-Receiver owner-scale synthetic Q4 shape correlates with 35 shadows',()=>{
  const f=fixture([90070,...Array.from({length:33},()=>800),3037]);
  const r=inspect(f);
  assert.equal(r.ok,true);
  assert.equal(r.receiverCount,35);
  assert.equal(r.itemCount,119507);
  assert.equal(r.recordCount,35*3);
  noPermit(r);
});
test('stale Q4 revision/counter after plan creation refuses a perfectly sealed shadow',()=>{
  const f=fixture(),pre=inspect(f);
  assert.equal(pre.ok,true);
  changeQ4Counter(f);
  const r=inspect(f);
  hold(r,'q4_source_is_stale_vs_shadow');
  assert.equal(f.writes,0);
});
test('Q4 item identity changes after shadow plan, even with conserved totals, HOLD',()=>{
  const f=fixture();
  const key='hartsorter:q4d_q2_a',next=ordinary('minecraft:diamond');
  f.records.set(key,JSON.stringify(next));
  f.source.identityAssertionsByReceiver.get(f.source.receivers[1].id)
    .set(q5IdentityKey(next),proof());
  hold(inspect(f));
});
test('a source Receiver item count change cannot match an old global shadow seal',()=>{
  const f=fixture(),key='hartsorter:q4m_q1';
  const m=JSON.parse(f.records.get(key));
  m.q++;m.r++;
  f.records.set(key,JSON.stringify(m));
  hold(inspect(f));
});
test('an orphaned additional Q4 Receiver after planning refuses current source',()=>{
  const f=fixture();
  f.records.set('hartsorter:q4m_q99','{"v":4,"h":0,"t":0,"n":1,"q":0,"r":0,"d":0}');
  hold(inspect(f));
});
test('one missing or changed shadow record rejects whole-world correlation',()=>{
  const f=fixture();
  for(const x of f.prepared.plans){
    for(const w of x.writes){
      const missing=new Map(f.shadow);missing.delete(w.key);
      const changed=new Map(f.shadow);changed.set(w.key,' '+w.value);
      hold(inspect(f,{records:missing}));
      hold(inspect(f,{records:changed}));
    }
  }
});
test('unknown Q5 shadow namespace after plan rejects correlation',()=>{
  const f=fixture();
  const fake=new Map(f.shadow);
  fake.set('hl2:q5shadow:unknown:e1:r1:manifest','{}');
  hold(inspect(f,{records:fake}));
});
test('foreign mod and old Q4 properties in shadow Map never get mutated',()=>{
  const f=fixture();
  const shadow=new Map(f.shadow);
  shadow.set('another_mod:state','keep');
  shadow.set('hartsorter:q4m_q1',f.records.get('hartsorter:q4m_q1'));
  const before=JSON.stringify([...shadow]);
  assert.equal(inspect(f,{records:shadow}).ok,true);
  assert.equal(JSON.stringify([...shadow]),before);
});
test('wrong world identity or changed synthetic epoch cannot inspect a shadow',()=>{
  const f=fixture();
  hold(inspect(f,{source:{...f.source,worldId:'foreign'}}),
    'current_q4_revalidation_required');
  hold(inspect(f,{source:{...f.source,epoch:20}}),
    'current_q4_revalidation_required');
  hold(inspect(f,{freeze:{...f.freeze,worldEpoch:18}}),
    'current_q4_revalidation_required');
});
test('source Map missing or no source description is a HOLD, never read-only PASS',()=>{
  const f=fixture();
  hold(inspect(f,{source:null}),'current_q4_revalidation_required');
  hold(inspect(f,{source:{...f.source,q4WitnessByReceiver:null}}),
    'current_q4_revalidation_required');
  hold(inspect(f,{source:{...f.source,q4WitnessByReceiver:new Map()}}),
    'q4_source_is_stale_vs_shadow');
});
test('current Q4 unreadable property or torn journal refuses',()=>{
  const f=fixture();
  f.source.world.getDynamicProperty=()=>{throw Error('unloaded');};
  hold(inspect(f));
  const g=fixture();
  g.records.set('hartsorter:queue_journal_v1','pending');
  hold(inspect(g));
});
test('source changes after first scan but during shadow Map read HOLD',()=>{
  const f=fixture();
  class ChangingShadow extends Map {
    *[Symbol.iterator]() {
      changeQ4Counter(f);
      yield* super[Symbol.iterator]();
    }
  }
  const shadow=new ChangingShadow(f.shadow);
  const r=inspect(f,{records:shadow});
  hold(r,'q4_source_changed_during_shadow_read');
  assert.equal(f.writes,0);
});
test('change to freeze witness during shadow Map inspection HOLD',()=>{
  const f=fixture();
  class ChangingShadow extends Map {
    *[Symbol.iterator]() {
      f.freeze.syntheticNote='changed';
      yield* super[Symbol.iterator]();
    }
  }
  const shadow=new ChangingShadow(f.shadow);
  hold(inspect(f,{records:shadow}),'current_world_witness_changed_during_read');
});
test('change to Q4 source witness while records read is detected',()=>{
  const f=fixture();
  class ChangingShadow extends Map {
    *[Symbol.iterator]() {
      const w=f.source.q4WitnessByReceiver.get(f.source.receivers[0].id);
      w.revision++;
      yield* super[Symbol.iterator]();
    }
  }
  const shadow=new ChangingShadow(f.shadow);
  hold(inspect(f,{records:shadow}));
});
test('a changed synthetic live-identity proof during inspection is never authority',()=>{
  const f=fixture();
  const id=f.source.receivers[0].id;
  class ChangingShadow extends Map {
    *[Symbol.iterator]() {
      const key=q5IdentityKey(ordinary());
      f.source.identityAssertionsByReceiver.get(id).get(key)
        .verifiedFreshRoundTrip=false;
      yield* super[Symbol.iterator]();
    }
  }
  hold(inspect(f,{records:new ChangingShadow(f.shadow)}));
});
test('malformed prepared shadow plan or missing supporting witness HOLD',()=>{
  const f=fixture();
  hold(inspect(f,{prepared:null}),'current_q4_revalidation_required');
  const malformed={...f.prepared,plans:[null,...f.prepared.plans.slice(1)]};
  hold(inspect(f,{prepared:malformed}));
  const changed={...f.prepared,receiverCount:100};
  hold(inspect(f,{prepared:changed}));
});
test('cyclical witness values refuse without throwing or changing the world',()=>{
  const f=fixture(),id=f.source.receivers[0].id;
  const witness={...f.source.q4WitnessByReceiver.get(id)};
  witness.self=witness;
  f.source.q4WitnessByReceiver.set(id,witness);
  hold(inspect(f),'unreadable_current_world_witnesses');
});
test('stale world census even on empty world remains no authority',()=>{
  const f=fixture([]),r=inspect(f);
  assert.equal(r.ok,true);
  assert.equal(r.itemCount,0);
  assert.equal(r.receiverCount,0);
  noPermit(r);
  f.records.set('hartsorter:q4m_q1',
    '{"v":4,"h":0,"t":0,"n":1,"q":0,"r":0,"d":0}');
  hold(inspect(f));
});
test('full 250000-item ordinary Receiver can only pass read-only correlation',()=>{
  const f=fixture([250000]),r=inspect(f);
  assert.equal(r.ok,true);
  assert.equal(r.itemCount,250000);
  noPermit(r);
});
test('repeated inspection never invokes a mock Bedrock property writer',()=>{
  const f=fixture([90070,42]),before=JSON.stringify([...f.records]);
  for(let i=0;i<10;i++){
    const r=inspect(f);
    assert.equal(r.ok,true);
    noPermit(r);
  }
  assert.equal(JSON.stringify([...f.records]),before);
  assert.equal(f.writes,0);
});
