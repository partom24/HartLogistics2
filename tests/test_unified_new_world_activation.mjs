import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectEmptyLegacyWorld,activateUnifiedEmptyWorld} from
  '../candidates/transport/unified_new_world_activation.mjs';
import {UCE_AUTHORITY_KEY} from
  '../candidates/transport/unified_world_shard_writer.mjs';
const id='minecraft:overworld:explicit-empty-lab-world';
function fixture(options={}){
  const values=new Map(),logistics={collectors:[],receivers:[],
    nextQueue:1};
  let writes=0;
  const world={
    getDynamicProperty:k=>values.get(k),
    getDynamicPropertyIds:()=>[...values.keys()],
    getDimension:()=>({
      getEntities:()=>options.carriers||[]
    }),
    setDynamicProperty(k,v){
      writes++;
      if(options.onWrite)return options.onWrite(k,v,values,writes);
      if(v===undefined)values.delete(k);else values.set(k,v);
    }
  };
  const activate=(overrides={})=>activateUnifiedEmptyWorld({
    world,logistics,worldId:id,epoch:1,
    operatorAuthorized:true,actualWorldFence:()=>true,
    ...overrides
  });
  return {world,values,logistics,activate,get writes(){return writes}};
}
test('first-playable zero-item world uses SAME sealed cold UCE authority',()=>{
  const f=fixture();
  const pre=inspectEmptyLegacyWorld({world:f.world,logistics:f.logistics});
  assert.equal(pre.ok,true,pre.reason);
  assert.equal(f.writes,0);
  const result=f.activate();
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.status,'EMPTY_UCE_WORLD_ACTIVATED_AND_READBACK');
  assert.equal(result.q4ItemCount,0);
  assert.equal(result.canDeleteQ4,false);
  assert.equal(JSON.parse(f.values.get(UCE_AUTHORITY_KEY)).state,'ACTIVE');
  assert.equal([...f.values.keys()].filter(x=>x.startsWith('hartsorter:q4'))
    .length,0);
  assert.ok(f.writes>2);
});
test('existing owner, Q4 sidecar, journal, old Q2/3, or UCE data forbids activation',()=>{
  const cases=['hartsorter:q4p_q1_0','hartsorter:q4d_q1_d0',
    'hartsorter:q2m_q1','hartsorter:q3m_q1',
    'hartsorter:queue_journal_v1',
    'hartsorter:journal_v1','hartlogistics:uce_native_intent_v1',
    'hartlogistics:pg42_native_test_v1'];
  for(const key of cases){
    const f=fixture();f.values.set(key,'preexisting');
    const result=f.activate();
    assert.equal(result.ok,false,key);
    assert.equal(result.canActivate,false,key);
    assert.equal(f.writes,0,key);
  }
  const g=fixture();
  g.logistics.receivers.push({id:'old',queueKey:'q1'});
  assert.equal(g.activate().ok,false);
  assert.equal(g.writes,0);
  const h=fixture();
  h.values.set('hartsorter:logistics_v2',JSON.stringify({
    collectors:[{id:'old'}],receivers:[]}));
  assert.equal(h.activate().ok,false);
  assert.equal(h.writes,0);
});
test('explicit authorization, operation ID and actual runtime freeze are mandatory',()=>{
  for(const extras of [
    {operatorAuthorized:false},{worldId:''},
    {actualWorldFence:null}]){
    const f=fixture();const x=f.activate(extras);
    assert.equal(x.ok,false);assert.equal(f.writes,0);
  }
  const f=fixture();
  const stopped=f.activate({actualWorldFence:()=>false});
  assert.equal(stopped.ok,false);
  assert.equal(stopped.reason,'legacy_writer_fence_unverified_after_request');
  assert.equal(JSON.parse(f.values.get(UCE_AUTHORITY_KEY)).state,
    'REQUESTED');
});
test('second empty-world activation never overwrites the already sealed world',()=>{
  const f=fixture();assert.equal(f.activate().ok,true);
  const previous=f.writes;
  const repeated=f.activate();
  assert.equal(repeated.ok,false);
  assert.equal(f.writes,previous);
});
test('partial save failure freezes REQUESTED with no Q4 writes or unsafe replay',()=>{
  const f=fixture({onWrite:(k,v,values)=>{
    values.set(k,v);
    if(k.includes('uce_shard_0001'))
      throw Error('ambiguous Bedrock save');
  }});
  const result=f.activate();
  assert.equal(result.ok,false);
  assert.match(result.reason,/cold_shard_write/);
  assert.equal(JSON.parse(f.values.get(UCE_AUTHORITY_KEY)).state,
    'REQUESTED');
  assert.equal([...f.values.keys()].some(x=>x.startsWith('hartsorter:q4')),
    false);
});

test('preexisting unsourced native carrier blocks empty-world UCE authority before any mutation',()=>{
  const existing=fixture({carriers:[{id:'old-PG42-host',
    typeId:'hartlogistics:uce_native_carrier'}]});
  const r=existing.activate();
  assert.equal(r.ok,false);
  assert.match(r.reason,/preexisting_native_carrier_entity/);
  assert.equal(existing.writes,0);
});
test('native entity enumeration failures never imply that a lab world is empty',()=>{
  const f=fixture();
  f.world.getDimension=()=>({
    getEntities:()=>{throw Error('unloaded or unreadable');}
  });
  const r=f.activate();
  assert.equal(r.ok,false);
  assert.equal(r.reason,'native_entity_census_unreadable');
  assert.equal(f.writes,0);
});
