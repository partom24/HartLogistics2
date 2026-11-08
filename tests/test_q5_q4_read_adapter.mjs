import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleQ4WorldReadOnly,
  Q4_QUEUE_JOURNAL_KEY,Q4_PHYSICAL_JOURNAL_KEY,Q4_READ_PROPERTY_LIMIT
} from '../candidates/transport/q5_q4_read_adapter.mjs';

const receiver = {id:'minecraft:overworld|-955,69,-790',queueKey:'q2'};
function fixture() {
  const records = new Map([
    ['hartsorter:q4m_q2',JSON.stringify({v:4,h:1,t:2,n:3,q:12,r:44,d:32})],
    ['hartsorter:q4p_q2_0',JSON.stringify([0,[['a',4],['b',8]]])],
    ['hartsorter:q4d_q2_a',JSON.stringify({typeId:'minecraft:cobblestone'})],
    ['hartsorter:q4d_q2_b',JSON.stringify({typeId:'minecraft:gold_ingot'})],
    ['unrelated:foreign-key','not-a-Q4-record']
  ]);
  let scans=0;
  const reads=[];
  const world = {
    getDynamicPropertyIds(){scans++;return [...records.keys()];},
    getDynamicProperty(key){reads.push(key);return records.get(key);}
  };
  return {receiver,records,world,reads,get scans(){return scans;}};
}
const run = f => sampleQ4WorldReadOnly({receiver:f.receiver,world:f.world});
const hold = x => {
  assert.equal(x.ok,false);
  assert.equal(x.status,'HOLD');
  for(const key of ['canMigrate','canRoute','canClearQ4','canWriteWorld'])
    assert.equal(x[key],false);
};
test('two stable source-shaped read passes return Q4 structural observation only',()=>{
  const f=fixture(),before=JSON.stringify([...f.records]);
  const res=run(f);
  assert.equal(res.ok,true);
  assert.equal(res.doubleReadOnly,true);
  assert.equal(res.total,12);
  assert.equal(res.entries.length,2);
  assert.equal(res.hasDurableRevision,false);
  assert.equal(f.scans,2);
  assert.equal(JSON.stringify([...f.records]),before);
  for(const key of ['canMigrate','canRoute','canClearQ4','canWriteWorld'])
    assert.equal(res[key],false);
});

test('reader touches no unrelated item or gameplay property',()=>{
  const f=fixture();run(f);
  assert.equal(f.reads.includes('unrelated:foreign-key'),false);
  assert.equal(f.reads.filter(x=>x===Q4_QUEUE_JOURNAL_KEY).length,4);
  assert.equal(f.reads.filter(x=>x===Q4_PHYSICAL_JOURNAL_KEY).length,4);
});

test('missing Q4 meta does not initialize a queue',()=>{
  const f=fixture();f.records.delete('hartsorter:q4m_q2');
  const before=JSON.stringify([...f.records]);
  hold(run(f));
  assert.equal(JSON.stringify([...f.records]),before);
});

test('pending, malformed and unknown physical/Q4 journals deny all staging',()=>{
  for(const key of [Q4_QUEUE_JOURNAL_KEY,Q4_PHYSICAL_JOURNAL_KEY]){
    for(const raw of ['{"pending":true}',null,'corrupt']){
      const f=fixture();f.records.set(key,raw);
      hold(run(f));
    }
  }
});

test('world object cannot offer missing read APIs or unexpected receiver identity',()=>{
  hold(sampleQ4WorldReadOnly({receiver,world:{}}));
  hold(sampleQ4WorldReadOnly({receiver,world:null}));
  hold(sampleQ4WorldReadOnly({receiver:null,world:fixture().world}));
  const f=fixture();f.receiver={id:'r',queueKey:'bad'};hold(run(f));
});

test('a changed Q4 page between observations is held, not silently re-read',()=>{
  const f=fixture();
  let scans=0;
  f.world.getDynamicPropertyIds=()=>{
    scans++;
    if(scans===2) f.records.set('hartsorter:q4p_q2_0',
      JSON.stringify([0,[['a',5],['b',7]]]));
    return [...f.records.keys()];
  };
  const r=run(f);
  hold(r);
  assert.equal(r.reason,'q4_changed_between_observations');
});

test('a newly added Q4 page or definition between scans is held',()=>{
  const f=fixture();let scans=0;
  f.world.getDynamicPropertyIds=()=>{
    scans++;
    if(scans===2)f.records.set('hartsorter:q4p_q2_1','[0,[[\"a\",1]]]');
    return [...f.records.keys()];
  };
  hold(run(f));
});

test('journal appearing while scanning blocks the second read',()=>{
  const f=fixture();
  const orig=f.world.getDynamicProperty;
  let calls=0;
  f.world.getDynamicProperty=key=>{
    const v=orig(key);calls++;
    if(calls===3)f.records.set(Q4_QUEUE_JOURNAL_KEY,'pending');
    return v;
  };
  hold(run(f));
});

test('failure or unloaded source during read is a HOLD, never fallback-to-empty',()=>{
  const f=fixture();
  f.world.getDynamicProperty=key=>{
    if(key==='hartsorter:q4p_q2_0')throw Error('unloaded');
    return f.records.get(key);
  };
  hold(run(f));
  const g=fixture();g.world.getDynamicPropertyIds=()=>{throw Error('unavailable');};
  hold(run(g));
});

test('invalid, duplicate or over-limit global ID enumeration refuses',()=>{
  for(const ids of [
    ['hartsorter:q4m_q2','hartsorter:q4m_q2'],
    [null],['x'.repeat(257)],
    {not:'an array'}
  ]){
    const f=fixture();f.world.getDynamicPropertyIds=()=>ids;hold(run(f));
  }
  assert.equal(Q4_READ_PROPERTY_LIMIT,500000);
});

test('a source-side Q4 page or definition corruption is not repaired',()=>{
  for(const change of [
    r=>r.delete('hartsorter:q4d_q2_b'),
    r=>r.set('hartsorter:q4p_q2_0','malformed'),
    r=>r.set('hartsorter:q4d_q2_a',5)
  ]){
    const f=fixture();change(f.records);hold(run(f));
  }
});

test('unchanged source sample is independent of property-id enumeration order',()=>{
  const f=fixture(),a=run(f);
  f.world.getDynamicPropertyIds=()=>[...f.records.keys()].reverse();
  const b=run(f);
  assert.equal(a.ok&&b.ok,true);
  assert.equal(a.snapshotFingerprint,b.snapshotFingerprint);
  assert.deepEqual(a.entries,b.entries);
});

test('Q4 q3 marker alone cannot be mistaken for initialized Q4',()=>{
  const f=fixture();
  f.records.clear();
  f.records.set('hartsorter:q3m_q2','{"v":3,"h":1}');
  hold(run(f));
});
