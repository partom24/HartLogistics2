import test from 'node:test';
import assert from 'node:assert/strict';
import {q5IdentityKey,inspectQ5Draft} from
  '../candidates/transport/q5_bucket_core.mjs';
import {previewQ5WorldOrdinaryDrafts} from
  '../candidates/transport/q5_world_ordinary_preview.mjs';

const worldId='minecraft:overworld:offline-world';
function item(typeId='minecraft:cobblestone',extras={}){
  return {typeId,lore:[],ench:[],canDestroy:[],canPlaceOn:[],...extras};
}
const proof=()=>({
  classification:'ordinary',metadataFree:true,losslessIdentity:true,
  runtimeStackable:true,runtimeMaxStack:64,verifiedFreshRoundTrip:true
});
function fixture(groups=[[{definition:item(),amount:15}],
                         [{definition:item('minecraft:iron_ingot'),amount:8}]]) {
  const receivers=[],records=new Map(),identityAssertionsByReceiver=new Map();
  let total=0;
  for(let i=0;i<groups.length;i++){
    const rows=groups[i],queueKey='q'+(i+1);
    const id='minecraft:overworld|'+i+',70,-40';
    receivers.push({id,queueKey});
    const count=rows.reduce((n,e)=>n+e.amount,0);
    total+=count;
    records.set('hartsorter:q4m_'+queueKey,JSON.stringify({
      v:4,h:rows.length?1:0,t:rows.length,n:Math.max(rows.length+1,1),
      q:count,r:count,d:0
    }));
    if(rows.length){
      records.set('hartsorter:q4p_'+queueKey+'_0',
        JSON.stringify([0,rows.map((e,j)=>['d'+j,e.amount])]));
    }
    const assertions=new Map();
    rows.forEach((entry,j)=>{
      records.set('hartsorter:q4d_'+queueKey+'_d'+j,
        JSON.stringify(entry.definition));
      assertions.set(q5IdentityKey(entry.definition),proof());
    });
    identityAssertionsByReceiver.set(id,assertions);
  }
  let writes=0;
  const world={
    getDynamicPropertyIds:()=>[...records.keys()],
    getDynamicProperty:key=>records.get(key),
    setDynamicProperty:()=>{writes++;}
  };
  return {world,worldId,records,receivers,
    identityAssertionsByReceiver,expectedReceiverCount:receivers.length,
    expectedQueuedTotal:total,registrySnapshotStable:true,epoch:10,
    get writes(){return writes}};
}
const run=(f,overrides={})=>previewQ5WorldOrdinaryDrafts({...f,...overrides});
const keys=['canMigrate','canRoute','canStageWorld','canClearQ4',
  'canDebitQ4','canWriteQ5','canWriteWorld'];
function noPermit(r){for(const k of keys) assert.equal(r[k],false,k);}
function hold(r,reason){
  assert.equal(r.ok,false);assert.equal(r.status,'HOLD');
  if(reason)assert.equal(r.reason,reason);
  noPermit(r);
}
test('35-Receiver scale becomes ordered Q5 ordinary draft previews only',()=>{
  const counts=[90070,...Array.from({length:33},()=>800),3037];
  const f=fixture(counts.map(n=>[{definition:item(),amount:n}]));
  const before=JSON.stringify([...f.records]),r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.status,'WORLD_Q5_ORDINARY_DRAFTS_READ_ONLY_ONLY');
  assert.equal(r.receiverCount,35);
  assert.equal(r.itemCount,119507);
  assert.equal(r.bucketCount,35);
  assert.equal(r.pageCount,35);
  assert.equal(r.drafts.length,35);
  assert.equal(r.drafts.find(x=>x.itemCount===90070).bucketCount,1);
  assert.equal(r.hasGlobalAtomicSnapshotProof,false);
  assert.equal(r.hasDurableFreezeProof,false);
  assert.equal(r.hasAuthenticatedRuntimeIdentityProof,false);
  noPermit(r);
  assert.equal(f.writes,0);
  assert.equal(JSON.stringify([...f.records]),before);
});
test('two Receivers become canonical Q5 pages with exact totals',()=>{
  const f=fixture(),r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.itemCount,23);
  assert.equal(r.drafts.reduce((sum,x)=>sum+x.draft.total,0),23);
  for(const x of r.drafts){
    assert.equal(inspectQ5Draft(x.draft).ok,true);
    assert.equal(x.sourceFingerprint.startsWith('fnv32:'),true);
  }
});
test('Q4 source and identity order do not control Q5 bucket ordering',()=>{
  const a=item('minecraft:stone'),b=item('minecraft:gold_ingot');
  const f=fixture([[{definition:b,amount:7},{definition:a,amount:4},
                     {definition:a,amount:3}]]);
  const g=fixture([[{definition:a,amount:3},{definition:b,amount:7},
                     {definition:a,amount:4}]]);
  const ra=run(f),rb=run(g);
  assert.equal(ra.ok&&rb.ok,true);
  assert.deepEqual(ra.drafts[0].draft.pages,rb.drafts[0].draft.pages);
  assert.equal(ra.bucketCount,2);
  assert.equal(ra.itemCount,14);
});
test('Receiver registry order never changes canonical global draft order',()=>{
  const f=fixture(),a=run(f),b=run(f,{receivers:[...f.receivers].reverse()});
  assert.deepEqual(a,b);
});
test('one metadata-rich ordinary claimant HOLDS entire world without partial draft',()=>{
  const f=fixture([[{definition:item(),amount:2}],
    [{definition:item('minecraft:diamond',{nameTag:'sensitive'}),amount:1}]]);
  const r=run(f);
  hold(r);
  assert.match(r.reason,/receiver_q5_refused:.*q4_ordinary_shape_refused/);
  assert.equal('drafts' in r,false);
  assert.equal(f.writes,0);
});
test('native opaque item cannot enter Q5 ordinary lane even with synthetic proof',()=>{
  const f=fixture([[{definition:item('minecraft:enchanted_book'),amount:1}]]);
  hold(run(f));
});
test('one missing runtime roundtrip witness holds every Receiver',()=>{
  const f=fixture();
  const assertions=f.identityAssertionsByReceiver.get(f.receivers[1].id);
  assertions.get(q5IdentityKey(item('minecraft:iron_ingot'))).verifiedFreshRoundTrip=false;
  hold(run(f));
});
test('one missing receiver proof map blocks world conversion',()=>{
  const f=fixture();
  const byReceiver=new Map(f.identityAssertionsByReceiver);
  byReceiver.set(f.receivers[1].id,null);
  hold(run(f,{identityAssertionsByReceiver:byReceiver}),
    'missing_receiver_classification:'+f.receivers[1].id);
});
test('unexpected extra receiver classification blocks complete world census',()=>{
  const f=fixture(),map=new Map(f.identityAssertionsByReceiver);
  map.delete(f.receivers[1].id);
  map.set('foreign_receiver',new Map());
  hold(run(f,{identityAssertionsByReceiver:map}),
    'unknown_receiver_classification');
});
test('extra unobserved item identity for a registered Receiver refuses',()=>{
  const f=fixture(),map=f.identityAssertionsByReceiver.get(f.receivers[0].id);
  map.set(q5IdentityKey(item('minecraft:diamond')),proof());
  hold(run(f));
});
test('missing Q4 page refuses whole-world Q5 preview before conversion',()=>{
  const f=fixture();
  f.records.delete('hartsorter:q4p_q2_0');
  hold(run(f));
});
test('unregistered Q4 metadata and unresolved old legacy q3 metadata refuse',()=>{
  const a=fixture();
  a.records.set('hartsorter:q4m_q99','{"v":4,"h":0,"t":0,"n":1,"q":0,"r":0,"d":0}');
  hold(run(a));
  const b=fixture();
  b.records.set('hartsorter:q3m_q99','pending');
  hold(run(b));
});
test('queue journal and physical journal stop full Q5 conversion',()=>{
  for(const key of ['hartsorter:queue_journal_v1','hartsorter:journal_v1']){
    const f=fixture();
    f.records.set(key,'pending');
    hold(run(f));
  }
});
test('global claimed item count mismatch cannot be disguised by consistent Q5 pages',()=>{
  const f=fixture();
  hold(run(f,{expectedQueuedTotal:f.expectedQueuedTotal+1}),
    'initial_world_q4_census_refused:q4_global_total_mismatch');
});
test('mutating a Receiver count-neutral source counter during conversion HOLDS',()=>{
  const f=fixture(),original=f.world.getDynamicPropertyIds;
  let calls=0;
  f.world.getDynamicPropertyIds=()=>{
    calls++;
    if(calls===12){
      const key='hartsorter:q4m_q1',meta=JSON.parse(f.records.get(key));
      meta.r++;
      f.records.set(key,JSON.stringify(meta));
    }
    return original();
  };
  const r=run(f);
  hold(r,'receiver_q4_changed_during_bucketization:'+f.receivers[0].id);
});
test('world changes AFTER drafts but BEFORE final Q4 census HOLDS',()=>{
  const f=fixture(),original=f.world.getDynamicPropertyIds;
  let calls=0;
  f.world.getDynamicPropertyIds=()=>{
    calls++;
    if(calls===16){
      const key='hartsorter:q4m_q1',meta=JSON.parse(f.records.get(key));
      meta.r++;
      f.records.set(key,JSON.stringify(meta));
    }
    return original();
  };
  hold(run(f),'world_q4_changed_during_bucketization');
});
test('source side exceptions are HOLD rather than partial success',()=>{
  const f=fixture();
  f.world.getDynamicProperty=key=>{
    if(key==='hartsorter:q4p_q2_0')throw Error('unloaded');
    return f.records.get(key);
  };
  hold(run(f));
});
test('single Receiver exceeding 250000 items cannot silently truncate to cap',()=>{
  const f=fixture([[{definition:item(),amount:250001}]]);
  hold(run(f));
});
test('exact 250000 Receiver ordinary capacity still produces only a preview',()=>{
  const f=fixture([[{definition:item(),amount:250000}]]);
  const r=run(f);
  assert.equal(r.ok,true);assert.equal(r.itemCount,250000);
  noPermit(r);
});
test('empty complete synthetic world returns an empty no-authority preview',()=>{
  const f=fixture([]);
  const r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.receiverCount,0);
  assert.equal(r.itemCount,0);
  assert.deepEqual(r.drafts,[]);
  noPermit(r);
});
test('unknown world identity or unproven registry completeness refuses all',()=>{
  const f=fixture();
  hold(run(f,{worldId:''}));
  hold(run(f,{registrySnapshotStable:false}));
  hold(run(f,{expectedReceiverCount:1}));
});
test('no stable runtime proof supplied means no Q5 candidate is produced',()=>{
  const f=fixture();
  hold(run(f,{identityAssertionsByReceiver:null}),
    'invalid_world_ordinary_preview_inputs');
  hold(run(f,{epoch:0}),'invalid_world_ordinary_preview_inputs');
});
test('repeated large read-only previews never alter any world or Q4 bytes',()=>{
  const f=fixture([[{definition:item(),amount:90070}],
    [{definition:item('minecraft:gold_ingot'),amount:800}]]);
  const raw=JSON.stringify([...f.records]);
  for(let i=0;i<8;i++){
    const r=run(f);
    assert.equal(r.ok,true);
    noPermit(r);
  }
  assert.equal(JSON.stringify([...f.records]),raw);
  assert.equal(f.writes,0);
});
