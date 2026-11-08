import test from 'node:test';
import assert from 'node:assert/strict';
import { q5IdentityKey, inspectQ5Draft } from '../candidates/transport/q5_bucket_core.mjs';
import { previewQ5OrdinaryReceiver } from '../candidates/transport/q5_readonly_preview.mjs';

const receiver = {id:'minecraft:overworld|-955,69,-790',queueKey:'q19'};
function fixture(amounts=[4,7,3],definitions=[
  {typeId:'minecraft:stone'}, {typeId:'minecraft:gold_ingot'},
  {typeId:'minecraft:stone'}
]) {
  const store = new Map();
  const sum=amounts.reduce((a,b)=>a+b,0);
  const rows=amounts.map((n,i)=>['d'+i,n]);
  store.set('hartsorter:q4m_q19',JSON.stringify({
    v:4,h:amounts.length?1:0,t:amounts.length,n:Math.max(1,amounts.length+1),
    q:sum,r:sum+100,d:100
  }));
  if(rows.length)store.set('hartsorter:q4p_q19_0',JSON.stringify([0,rows]));
  for(let i=0;i<rows.length;i++)
    store.set('hartsorter:q4d_q19_d'+i,JSON.stringify(definitions[i]));
  const mutations=[];
  const world = {
    getDynamicPropertyIds:()=>[...store.keys()],
    getDynamicProperty:key=>store.get(key),
    setDynamicProperty:(...args)=>mutations.push(args)
  };
  const proof = new Map(definitions.map(d=>[q5IdentityKey(d),{
    classification:'ordinary',losslessIdentity:true,metadataFree:true
  }]));
  return {receiver,store,world,proof,mutations,epoch:7};
}
const run=(f,overrides={})=>previewQ5OrdinaryReceiver({
  receiver:f.receiver,world:f.world,identityAssertions:f.proof,epoch:f.epoch,...overrides
});
function hold(r) {
  assert.equal(r.ok,false);assert.equal(r.status,'HOLD');
  for(const key of ['canRoute','canStageWorld','canMigrate','canClearQ4'])
    assert.equal(r[key],false);
}
test('Q4 pages become Q5 aggregated ordinary draft, not a migration commit',()=>{
  const f=fixture(),before=JSON.stringify([...f.store]);
  const r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.status,'Q5_READ_ONLY_PREVIEW_ONLY');
  assert.equal(r.q4ObservedItems,14);
  assert.equal(r.q5BucketCount,2);
  assert.equal(r.q5PageCount,1);
  assert.equal(r.hasDurableQ4Revision,false);
  assert.equal(inspectQ5Draft(r.draft).total,14);
  for(const key of ['canRoute','canStageWorld','canMigrate','canClearQ4'])
    assert.equal(r[key],false);
  assert.equal(JSON.stringify([...f.store]),before);
  assert.deepEqual(f.mutations,[]);
});

test('Q4 arriving in different order produces the same Q5 bucket pages',()=>{
  const first=fixture([4,7,3],[
    {typeId:'minecraft:stone'}, {typeId:'minecraft:gold_ingot'},
    {typeId:'minecraft:stone'}]);
  const second=fixture([3,4,7],[
    {typeId:'minecraft:stone'}, {typeId:'minecraft:stone'},
    {typeId:'minecraft:gold_ingot'}]);
  const a=run(first),b=run(second);
  assert.equal(a.ok&&b.ok,true);
  assert.deepEqual(a.draft.pages,b.draft.pages);
});

test('unknown metadata-rich identity refuses all Q5 ordinary conversion',()=>{
  const f=fixture([4,1],[{typeId:'minecraft:stone'},{typeId:'minecraft:enchanted_book',ench:[{id:'sharpness',level:2}]}]);
  f.proof.set(q5IdentityKey({typeId:'minecraft:enchanted_book',ench:[{id:'sharpness',level:2}]}),{
    classification:'native-mr',losslessIdentity:false,metadataFree:false
  });
  hold(run(f));
});

test('no automatic admission of Q4 data without full explicit classification',()=>{
  const f=fixture();f.proof.delete(q5IdentityKey({typeId:'minecraft:gold_ingot'}));
  hold(run(f));
  assert.equal(f.mutations.length,0);
});

test('unexpected extra claimed identity refuses even when q4 counts match',()=>{
  const f=fixture();
  f.proof.set(q5IdentityKey({typeId:'minecraft:diamond'}),{
    classification:'ordinary',losslessIdentity:true,metadataFree:true
  });
  hold(run(f));
});

test('empty Q4 can form an empty read-only Q5 draft',()=>{
  const f=fixture([],[]);const r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.q5BucketCount,0);
  assert.equal(r.q5PageCount,0);
  assert.equal(r.q4ObservedItems,0);
});

test('snapshot containing two item metadata variants remains separately keyed',()=>{
  const red={typeId:'minecraft:potion',potion:{effect:'healing',delivery:'drink'}};
  const blue={typeId:'minecraft:potion',potion:{effect:'speed',delivery:'drink'}};
  const f=fixture([2,3,4],[red,blue,red]);const r=run(f);
  assert.equal(r.ok,true);assert.equal(r.q5BucketCount,2);
  assert.deepEqual(inspectQ5Draft(r.draft).buckets.map(b=>b.count).sort(),[3,6].sort());
  assert.equal(r.canMigrate,false);
  // Synthetic proof above does NOT establish the actual Bedrock potion roundtrip.
});

test('pending or malformed legacy journals prevent even read-only staging',()=>{
  for(const journal of ['hartsorter:journal_v1','hartsorter:queue_journal_v1']){
    const f=fixture();f.store.set(journal,'pending');hold(run(f));
  }
});

test('Q4 data changed between two reads stays HOLD',()=>{
  const f=fixture();let scans=0;
  f.world.getDynamicPropertyIds=()=>{
    scans++;
    if(scans===2){
      const k='hartsorter:q4p_q19_0';
      f.store.set(k,JSON.stringify([0,[['d0',3],['d1',8],['d2',3]]]));
    }
    return [...f.store.keys()];
  };
  hold(run(f));
});

test('unsupported/partial Q4 metadata refuses all Q5 previews',()=>{
  const f=fixture();f.store.delete('hartsorter:q4m_q19');
  hold(run(f));
});

test('bad epoch, missing proof map and unavailable world refuse',()=>{
  const f=fixture();
  hold(run(f,{epoch:0}));
  hold(run(f,{identityAssertions:null}));
  hold(run(f,{world:null}));
});

test('partial Q4 definition sidecar refuses without fabricating missing identity',()=>{
  const f=fixture();f.store.delete('hartsorter:q4d_q19_d1');
  hold(run(f));
  assert.deepEqual(f.mutations,[]);
});

test('250000 count limit remains and source properties do not change',()=>{
  const f=fixture([250000],[{typeId:'minecraft:cobblestone'}]);
  const before=JSON.stringify([...f.store]),r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.draft.total,250000);
  assert.equal(JSON.stringify([...f.store]),before);
});

test('preview does not advance persisted authority or supply an executable writer',()=>{
  const f=fixture(),a=run(f),b=run(f);
  assert.deepEqual(a,b);
  assert.equal(Object.keys(a).includes('writes'),false);
  assert.equal(a.canStageWorld,false);
  assert.equal(a.canMigrate,false);
});
