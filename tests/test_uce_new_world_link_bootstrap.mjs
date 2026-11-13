import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** Executes the exact PG36 Bedrock runtime gate, not a duplicate algorithm. */
const source=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const begin=source.indexOf('function uceEmptyLinkRegistryBootProof(');
const end=source.indexOf('\nfunction uceUseReceiverLinkOrStatus(',begin);
assert.ok(begin>=0&&end>begin,'PG36 guarded fresh link proof is present');
const linkEnd=source.indexOf('\n\n/* Read-only status',end);
assert.ok(linkEnd>end,'exact new-world link UI function has stable boundary');
assert.match(source.slice(end,linkEnd),
  /verifyEmptyNewWorld:\(\)=>uceEmptyLinkRegistryBootProof\(authority\)/);
const routine=source.slice(begin,end);
function fixture(options={}){
  const shardCount=32,worldId='minecraft:overworld:uce-empty-test',epoch=1;
  const seal={worldId,epoch,receivers:0,initialItemCount:0,q4Sources:[],
    shards:Array.from({length:shardCount},(_,i)=>({
      owner:'reserve:'+String(i).padStart(4,'0'),
      key:'hartlogistics:uce_shard_'+String(i).padStart(4,'0')+'_v1',
      initialCount:0}))};
  if(options.legacySeal)seal.q4Sources=[{id:'legacy',queueKey:'q1'}];
  if(options.historicalReceiver)seal.receivers=1;
  const values=new Map([['hartlogistics:uce_cold_seal_v1',JSON.stringify(seal)]]);
  const keySet=new Set(values.keys());
  if(options.legacyKey){
    values.set(options.legacyKey,'historical-asset');
    keySet.add(options.legacyKey);
  }
  if(Object.prototype.hasOwnProperty.call(options,'existingRegistry')){
    values.set('hartsorter:logistics_v2',options.existingRegistry);
    keySet.add('hartsorter:logistics_v2');
  }
  const reads=[];
  const world={
    getDynamicProperty(key){reads.push(key);return values.get(key);},
    getDynamicPropertyIds(){return [...keySet];}
  };
  const context={
    world,LOGISTICS_KEY:'hartsorter:logistics_v2',
    inspectUnifiedActiveColdImport:()=>({ok:!options.badCold,
      currentLedgerTotal:options.nonzeroTotal?1:0})
  };
  vm.runInNewContext(routine,context);
  return {check:()=>context.uceEmptyLinkRegistryBootProof({worldId,epoch}),
    reads,seal,values,keySet};
}
test('PG36 genuinely empty sealed world admits missing link registry read-only',()=>{
  const f=fixture();
  assert.equal(f.check(),true);
  assert.ok(f.reads.includes('hartsorter:logistics_v2'));
});
test('PG36 archived-Q4 sources and historical receivers cannot bootstrap missing registry',()=>{
  for(const opts of [{legacySeal:true},{historicalReceiver:true},
    {legacyKey:'hartsorter:q4m_q1'},
    {legacyKey:'hartsorter:q3m_q1'},
    {legacyKey:'hartsorter:q2_q1_0'},
    {legacyKey:'hartsorter:queue_journal_v1'},
    {legacyKey:'hartsorter:logistics_v1'},
    {legacyKey:'hartsorter:journal_v1'}]){
    assert.equal(fixture(opts).check(),false,JSON.stringify(opts));
  }
});
test('PG36 preexisting, empty or corrupted saved registry never silently resets',()=>{
  for(const existingRegistry of ['',null,'{broken',JSON.stringify({
    collectors:[],receivers:[],nextQueue:1
  })]){
    assert.equal(fixture({existingRegistry}).check(),false,
      'existing saved registry must always be handled by ordinary parser');
  }
});
test('PG36 stale cold seal or ledger ownership cannot bootstrap',()=>{
  assert.equal(fixture({badCold:true}).check(),false);
  assert.equal(fixture({nonzeroTotal:true}).check(),false);
  const a=fixture();a.seal.shards[0].initialCount=1;
  a.values.set('hartlogistics:uce_cold_seal_v1',JSON.stringify(a.seal));
  assert.equal(a.check(),false);
});
