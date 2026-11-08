import test from 'node:test';
import assert from 'node:assert/strict';
import {previewQ5WorldQ4Census,Q5_CENSUS_RECEIVER_LIMIT} from
  '../candidates/transport/q5_world_receiver_census.mjs';

const worldId='minecraft-overworld-lab-mock';
function fixture(counts=[90070,...Array.from({length:33},()=>800),3037]) {
  const receivers=[],records=new Map(),writes=[];
  counts.forEach((count,index)=>{
    const queueKey='q'+(index+1);
    const id='minecraft:overworld|'+index+',70,1';
    receivers.push({id,queueKey});
    records.set('hartsorter:q4m_'+queueKey,JSON.stringify({
      v:4,h:count?1:0,t:count?1:0,n:count?2:1,
      q:count,r:count,d:0
    }));
    if(count){
      records.set('hartsorter:q4p_'+queueKey+'_0',JSON.stringify([0,[['a',count]]]));
      records.set('hartsorter:q4d_'+queueKey+'_a',
        JSON.stringify({typeId:'minecraft:cobblestone'}));
    }
  });
  const world={
    getDynamicPropertyIds:()=>[...records.keys()],
    getDynamicProperty:k=>records.get(k),
    setDynamicProperty:(...args)=>writes.push(args)
  };
  return {receivers,records,world,writes,worldId,
    expectedReceiverCount:receivers.length,
    expectedQueuedTotal:counts.reduce((a,b)=>a+b,0),
    registrySnapshotStable:true
  };
}
const run=(f,overrides={})=>previewQ5WorldQ4Census({...f,...overrides});
const hold=(r,reason)=>{
  assert.equal(r.ok,false);assert.equal(r.status,'HOLD');
  if(reason)assert.equal(r.reason,reason);
  for(const k of ['canMigrate','canRoute','canStageWorld','canClearQ4','canWriteWorld'])
    assert.equal(r[k],false,k);
};
test('synthetic 35-Receiver, 119507-count and 90070 single-entry world is observable only',()=>{
  const f=fixture(),before=JSON.stringify([...f.records]),r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.status,'WORLD_Q4_CENSUS_READ_ONLY_ONLY');
  assert.equal(r.receiverCount,35);
  assert.equal(r.itemCount,119507);
  assert.equal(r.receivers.length,35);
  assert.equal(r.receivers.find(x=>x.itemCount===90070).entryCount,1);
  assert.equal(r.hasDurableGlobalFreezeProof,false);
  assert.equal(r.hasNativeBlockResidencyProof,false);
  for(const k of ['canMigrate','canRoute','canStageWorld','canClearQ4','canWriteWorld'])
    assert.equal(r[k],false);
  assert.equal(JSON.stringify([...f.records]),before);
  assert.deepEqual(f.writes,[]);
});
test('registry input ordering cannot change canonical whole-world census',()=>{
  const f=fixture();
  const a=run(f),b=run(f,{receivers:[...f.receivers].reverse()});
  assert.deepEqual(a,b);
});
test('count mismatch or missing Receiver immediately HOLD, never partial success',()=>{
  const f=fixture();
  hold(run(f,{expectedQueuedTotal:f.expectedQueuedTotal+1}),'q4_global_total_mismatch');
  hold(run(f,{receivers:f.receivers.slice(1)}),'incomplete_world_registry_claim');
});
test('a missing one of 35 Q4 pages or metadata records holds all Receivers',()=>{
  for(const key of ['hartsorter:q4p_q35_0','hartsorter:q4m_q12',
                    'hartsorter:q4d_q1_a']){
    const f=fixture();f.records.delete(key);
    const r=run(f);
    hold(r);
    assert.match(r.reason,/receiver_q4_refused/);
  }
});
test('any pending queue or physical journal refuses all-Receiver read',()=>{
  for(const key of ['hartsorter:queue_journal_v1','hartsorter:journal_v1']){
    const f=fixture();f.records.set(key,'pending');
    const r=run(f);
    hold(r);
    assert.match(r.reason,/journal_not_clear/);
  }
});
test('no evidence of global registry completeness never allows census',()=>{
  const f=fixture();
  hold(run(f,{registrySnapshotStable:false}),'incomplete_world_registry_claim');
  hold(run(f,{registrySnapshotStable:undefined}),'incomplete_world_registry_claim');
  hold(run(f,{expectedReceiverCount:34}),'incomplete_world_registry_claim');
});
test('duplicate world receiver ID, queue key, malformed key all HOLD',()=>{
  const f=fixture();
  for(const change of [
    arr=>arr[1].id=arr[0].id,
    arr=>arr[1].queueKey=arr[0].queueKey,
    arr=>arr[1].queueKey='bad/queue'
  ]){
    const clone=f.receivers.map(x=>({...x}));change(clone);
    hold(run(f,{receivers:clone}),'invalid_or_duplicate_receiver_identity');
  }
});
test('another Receiver changes after first complete sweep: entire census HOLD',()=>{
  const f=fixture(),original=f.world.getDynamicPropertyIds;
  let lists=0;
  f.world.getDynamicPropertyIds=()=>{
    lists++;
    if(lists===71){
      const key='hartsorter:q4m_q1';
      const meta=JSON.parse(f.records.get(key));meta.r++;
      f.records.set(key,JSON.stringify(meta));
    }
    return original();
  };
  hold(run(f),'q4_registry_changed_between_sweeps');
});
test('a definition changes with same count between sweeps: fingerprint catches it',()=>{
  const f=fixture(),original=f.world.getDynamicPropertyIds;
  let lists=0;
  f.world.getDynamicPropertyIds=()=>{
    lists++;
    if(lists===71){
      f.records.set('hartsorter:q4d_q1_a',
        JSON.stringify({typeId:'minecraft:gold_ingot'}));
    }
    return original();
  };
  hold(run(f),'q4_registry_changed_between_sweeps');
});
test('a source-side read exception does not silently fabricate an empty Receiver',()=>{
  const f=fixture();
  f.world.getDynamicProperty=key=>{
    if(key==='hartsorter:q4p_q7_0')throw Error('unloaded property');
    return f.records.get(key);
  };
  const r=run(f);
  hold(r);
  assert.match(r.reason,/world_property_read_failed/);
});
test('one overfilled Receiver fails without truncating its 250000 legacy cap',()=>{
  const f=fixture([250001]);
  hold(run(f));
});
test('full 250000-item Q4 Receiver is still only an observation',()=>{
  const f=fixture([250000]);
  const r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.itemCount,250000);
  assert.equal(r.canMigrate,false);
});
test('read-only empty Receiver registry is valid when declared totals are zero',()=>{
  const f=fixture([]);
  const r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.itemCount,0);
  assert.equal(r.receiverCount,0);
  assert.equal(r.canRoute,false);
});
test('unknown world ID or more than 512 claimed Receivers refuses',()=>{
  const f=fixture();
  hold(run(f,{worldId:''}),'incomplete_world_registry_claim');
  assert.equal(Q5_CENSUS_RECEIVER_LIMIT,512);
  const tooMany=Array.from({length:513},(_,i)=>({id:'r'+i,queueKey:'q'+(i+1)}));
  hold(run(f,{receivers:tooMany,expectedReceiverCount:513}),
    'incomplete_world_registry_claim');
});
test('repeated stable censuses do not write any dynamic properties',()=>{
  const f=fixture([1,2,3]),before=JSON.stringify([...f.records]);
  for(let i=0;i<10;i++){
    const r=run(f);assert.equal(r.ok,true);assert.equal(r.itemCount,6);
  }
  assert.deepEqual(f.writes,[]);
  assert.equal(JSON.stringify([...f.records]),before);
});

test('unclaimed Q4 Receiver metadata refuses entire world census',()=>{
  const f=fixture([2,3]);
  f.records.set('hartsorter:q4m_q999',
    JSON.stringify({v:4,h:1,t:1,n:2,q:1,r:1,d:0}));
  hold(run(f),'unclaimed_q4_receiver_metadata');
});
test('the zero-Receiver claim cannot conceal leftover Q4 metadata',()=>{
  const f=fixture([]);
  f.records.set('hartsorter:q4m_q1',
    JSON.stringify({v:4,h:0,t:0,n:1,q:0,r:0,d:0}));
  hold(run(f),'unclaimed_q4_receiver_metadata');
});
test('legacy Q2/Q3 meta records are retained but globally held for manual review',()=>{
  for(const prefix of ['hartsorter:q2m_','hartsorter:q3m_']){
    const f=fixture([1]);
    f.records.set(prefix+'q999','legacy-retained');
    hold(run(f),'unresolved_legacy_q2_q3_metadata');
    assert.equal(f.records.get(prefix+'q999'),'legacy-retained');
  }
});
test('world cannot claim an empty observation without a readable property listing',()=>{
  const f=fixture([]);
  hold(run(f,{world:null}),'world_property_listing_unavailable');
  hold(run(f,{world:{getDynamicProperty:()=>undefined}}),
    'world_property_listing_unavailable');
  const g=fixture([1]);
  g.world.getDynamicPropertyIds=()=>{throw Error('unloaded');};
  hold(run(g),'world_property_listing_failed');
});
test('ambiguous, duplicated or invalid world property listings are held',()=>{
  for(const ids of [
    ['hartsorter:q4m_q1','hartsorter:q4m_q1'],
    ['hartsorter:q4m_q1',null],
    ['hartsorter:q4m_q1','x'.repeat(257)],
    {keys:['hartsorter:q4m_q1']}
  ]){
    const f=fixture([1]);
    f.world.getDynamicPropertyIds=()=>ids;
    hold(run(f),'invalid_world_property_listing');
  }
});
test('metadata listing addition after first sweep is not mistaken for a stable registry',()=>{
  const f=fixture([3,4]);
  const original=f.world.getDynamicPropertyIds;let lists=0;
  f.world.getDynamicPropertyIds=()=>{
    lists++;
    if(lists===6)f.records.set('hartsorter:q4m_q999',
      '{"v":4,"h":0,"t":0,"n":1,"q":0,"r":0,"d":0}');
    return original();
  };
  // One global listing + 2 Receivers * 2 scans = 5.
  // The next metadata listing discovers the injected unregistered Receiver.
  hold(run(f),'unclaimed_q4_receiver_metadata');
});
test('unrelated packs and old unreferenced Q4 definition sidecars remain untouched',()=>{
  const f=fixture([1]);
  f.records.set('other_pack:state','do-not-touch');
  f.records.set('hartsorter:q4d_q1_legacyunused','{"typeId":"minecraft:dirt"}');
  const snapshot=JSON.stringify([...f.records]);
  assert.equal(run(f).ok,true);
  assert.equal(JSON.stringify([...f.records]),snapshot);
  assert.deepEqual(f.writes,[]);
});
