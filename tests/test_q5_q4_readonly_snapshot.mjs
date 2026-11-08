import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnlyQ4Snapshot, Q4_SOURCE_PAGE_SIZE, Q4_SOURCE_CAPACITY } from
  '../candidates/transport/q5_q4_readonly_snapshot.mjs';
import { stageQ4OrdinaryDraft, inspectQ5Draft } from
  '../candidates/transport/q5_bucket_core.mjs';

function source(amounts, {head=1, definitions} = {}) {
  const receiver={id:'minecraft:overworld|-955,69,-790',queueKey:'q13'};
  const records=new Map();
  const defs=definitions??amounts.map((_,i)=>({typeId:i%2?'minecraft:iron_ingot':'minecraft:stone'}));
  const total=amounts.reduce((n,x)=>n+x,0);
  const tail=amounts.length?head+amounts.length-1:0;
  records.set('hartsorter:q4m_q13',JSON.stringify({
    v:4,h:amounts.length?head:0,t:tail,
    n:Math.max(1,tail+1),q:total,r:total+22,d:22
  }));
  const pages=new Map();
  for(let i=0;i<amounts.length;i++) {
    const seq=head+i,page=Math.floor((seq-1)/Q4_SOURCE_PAGE_SIZE);
    const slot=(seq-1)%Q4_SOURCE_PAGE_SIZE;
    const defId='a'+i.toString(36);
    const record=pages.get(page)??{start:slot,rows:[]};
    record.rows.push([defId,amounts[i]]);
    pages.set(page,record);
    records.set('hartsorter:q4d_q13_'+defId,JSON.stringify(defs[i]));
  }
  for(const [page,{start,rows}] of pages) {
    records.set('hartsorter:q4p_q13_'+page,JSON.stringify([start,rows]));
  }
  return {receiver,records,queueJournalClear:true,physicalJournalClear:true};
}
const run=x=>readOnlyQ4Snapshot(x);
const hold=x=>{
  assert.equal(x.ok,false);assert.equal(x.status,'HOLD');
  for(const k of ['canRoute','canMigrate','canWriteWorld','canClearQ4'])assert.equal(x[k],false);
};
test('matches actual q4 compact v4 meta/pages/sidecar layout without writing',()=>{
  const f=source([2,8,5,9],{head:13});const before=JSON.stringify([...f.records]);
  const result=run(f);
  assert.equal(result.ok,true);
  assert.equal(result.total,24);
  assert.deepEqual(result.entries.map(x=>x.seq),[13,14,15,16]);
  assert.deepEqual(result.entries.map(x=>x.amount),[2,8,5,9]);
  assert.equal(result.metadata.head,13);
  assert.equal(result.metadata.tail,16);
  assert.equal(result.metadata.received,46);
  assert.equal(result.metadata.delivered,22);
  assert.equal(result.hasDurableRevision,false);
  assert.equal(result.canMigrate,false);
  assert.equal(JSON.stringify([...f.records]),before);
});

test('reads an exact 64-slot page and a multi-page mid-page head',()=>{
  const f=source(Array.from({length:68},(_,i)=>i+1),{head:61});
  const r=run(f);
  assert.equal(r.ok,true);
  assert.equal(r.entryCount,68);
  assert.equal(r.entries[0].seq,61);
  assert.equal(r.entries.at(-1).seq,128);
  assert.equal(r.total,68*69/2);
});

test('Q4 arrival order is discarded by subsequent Q5 aggregation',()=>{
  const f=source([2,9,3,7],{head:37});const r=run(f);
  const draft=stageQ4OrdinaryDraft({
    receiverId:r.receiverId,epoch:3,complete:true,journalClear:true,declaredTotal:r.total,
    entries:r.entries.map(e=>({definition:e.definition,amount:e.amount,
      classification:'ordinary',metadataFree:true,losslessIdentity:true}))
  });
  assert.equal(draft.ok,true);
  assert.equal(inspectQ5Draft(draft.draft).bucketCount,2);
  assert.deepEqual(inspectQ5Draft(draft.draft).buckets.map(x=>x.count).sort((a,b)=>a-b),[5,16]);
});

test('empty initialized Q4 stays read-only and has no pages',()=>{
  const f=source([]);const r=run(f);
  assert.equal(r.ok,true);assert.equal(r.total,0);
  assert.deepEqual(r.entries,[]);
  assert.equal(r.metadata.next,1);
});

test('missing metadata is not silently initialized like legacy loader',()=>{
  const f=source([1]);f.records.delete('hartsorter:q4m_q13');
  const before=JSON.stringify([...f.records]);
  hold(run(f));assert.equal(JSON.stringify([...f.records]),before);
});

test('q2/q3 metadata is never migrated by this Q4-only reader',()=>{
  for(const ver of [2,3,5]){
    const f=source([1]);const key='hartsorter:q4m_q13';
    const meta=JSON.parse(f.records.get(key));meta.v=ver;
    f.records.set(key,JSON.stringify(meta));hold(run(f));
  }
});

test('journal status must be clear before attempting snapshot',()=>{
  const f=source([1]);
  hold(run({...f,queueJournalClear:false}));
  hold(run({...f,physicalJournalClear:false}));
  hold(run({...f,queueJournalClear:undefined}));
});

test('absent, malformed or extra pages refuse rather than skipping entries',()=>{
  const initial=source(Array.from({length:70},()=>1),{head:60});
  const victim='hartsorter:q4p_q13_1';
  for(const change of [
    r=>r.delete(victim),
    r=>r.set(victim,'{bad json'),
    r=>r.set(victim,JSON.stringify([0,[['a',1]]])),
    r=>r.set('hartsorter:q4p_q13_99','[0,[[\"a\",1]]]'),
    r=>r.set('hartsorter:q4p_q13_01','[0,[[\"a\",1]]]')
  ]){
    const f={...initial,records:new Map(initial.records)};
    change(f.records);hold(run(f));
  }
});

test('missing, malformed and ambiguous definitions refuse the entire Q4 snapshot',()=>{
  const original=source([2,3]);
  for(const change of [
    r=>r.delete('hartsorter:q4d_q13_a0'),
    r=>r.set('hartsorter:q4d_q13_a0','{bad'),
    r=>r.set('hartsorter:q4d_q13_a0','{"typeId":"bad"}'),
    r=>r.set('hartsorter:q4d_q13_a0','{"typeId":"minecraft:stone","bad":{"__proto__":{"x":1}}}')
  ]){
    const f={...original,records:new Map(original.records)};
    change(f.records);hold(run(f));
  }
});

test('invalid Q4 head/tail/next/count cannot be quietly normalized',()=>{
  for(const changes of [
    {h:0},{t:0},{t:3},{n:1},{q:2},{q:-1},{q:1.5},{v:3},
    {r:-1},{d:1.1},{q:Q4_SOURCE_CAPACITY+1}
  ]){
    const f=source([2]);const k='hartsorter:q4m_q13';
    const meta=JSON.parse(f.records.get(k));
    f.records.set(k,JSON.stringify({...meta,...changes}));hold(run(f));
  }
});

test('malformed row amount, duplicate-def key and sparse rows refuse safely',()=>{
  const initial=source([2,3]);
  for(const mutation of [
    rows=>{rows[0][1]=0;},
    rows=>{rows[0][1]=-1;},
    rows=>{rows[0][1]=1.5;},
    rows=>{rows[0][0]='weird id';},
    rows=>{rows.pop();}
  ]){
    const f={...initial,records:new Map(initial.records)};
    const k='hartsorter:q4p_q13_0';
    const packed=JSON.parse(f.records.get(k));
    mutation(packed[1]);
    f.records.set(k,JSON.stringify(packed));
    hold(run(f));
  }
});

test('reader refuses over-capacity counts including after page sum',()=>{
  const f=source([250001]);hold(run(f));
  const g=source([100000,150000]);
  const k='hartsorter:q4m_q13',meta=JSON.parse(g.records.get(k));
  meta.q=249999;
  g.records.set(k,JSON.stringify(meta));
  hold(run(g));
});

test('page and definition values over 30000 characters are refused',()=>{
  const f=source([1]);
  const k='hartsorter:q4d_q13_a0';
  f.records.set(k,JSON.stringify({typeId:'minecraft:stone',text:'x'.repeat(30000)}));
  hold(run(f));
});

test('stored non-queue sidecar definitions are not deleted',()=>{
  const f=source([1]);
  const key='hartsorter:q4d_q13_old_unused';
  f.records.set(key,'{"typeId":"minecraft:dirt"}');
  const r=run(f);
  assert.equal(r.ok,true);
  assert.equal(f.records.has(key),true);
});

test('source observation fingerprint changes when page bytes change',()=>{
  const f=source([2,3]);
  const a=run(f);assert.equal(a.ok,true);
  const k='hartsorter:q4p_q13_0';
  const rows=JSON.parse(f.records.get(k));rows[1][0][1]=3;rows[1][1][1]=2;
  f.records.set(k,JSON.stringify(rows));
  const b=run(f);assert.equal(b.ok,true);
  assert.notEqual(a.snapshotFingerprint,b.snapshotFingerprint);
});

test('receiver identity and world-property map must be known',()=>{
  const f=source([1]);
  hold(run({...f,receiver:{...f.receiver,queueKey:'../q13'}}));
  hold(run({...f,receiver:{...f.receiver,id:''}}));
  hold(run({...f,records:undefined}));
});
