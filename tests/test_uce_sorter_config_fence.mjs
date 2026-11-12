import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const raw=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const marker='function uceAllowsSorterRegistryWrite(key){';
const start=raw.indexOf(marker),end=raw.indexOf('\n}',start);
assert.ok(start>=0&&end>start);
const fn=raw.slice(start,end+2);
function gate({active=true,sealed=true}={}){
  const ctx={
    REGISTRY_META_KEY:'hartsorter:registry_v2',
    world:{getDynamicProperty:()=>undefined},
    uceAuthoritySnapshot:()=>active?
      {worldId:'minecraft:overworld:source',epoch:7}:undefined,
    inspectUnifiedActiveColdImport:()=>({ok:sealed})
  };
  vm.runInNewContext(fn,ctx);
  return k=>ctx.uceAllowsSorterRegistryWrite(k);
}
test('only actual Sorter registry commit and generation-shard keys are writable in ACTIVE sealed UCE',()=>{
  const allowed=gate();
  assert.equal(allowed('hartsorter:registry_v2'),true);
  assert.equal(allowed('hartsorter:r2_0_0'),true);
  assert.equal(allowed('hartsorter:r2_1_42'),true);
  for(const key of [
    'hartsorter:queue_journal_v1','hartsorter:journal_v1',
    'hartsorter:logistics_v2','hartsorter:registry_v1',
    'hartsorter:q4m_q1','hartsorter:q4d_q1_d1',
    'hartlogistics:uce_authority_v1',
    'hartlogistics:uce_boundary_intent_v1',
    'hartsorter:r2_2_0','hartsorter:r2_1_0_suffix',
    'hartsorter:r2_1_-1', 'hartsorter:r2_1_',
    '',undefined,null
  ])assert.equal(allowed(key),false,String(key));
});
test('unsealed or non-ACTIVE authority does not permit even Sorter configuration writes',()=>{
  for(const options of [{active:false},{sealed:false}]){
    const allow=gate(options);
    assert.equal(allow('hartsorter:registry_v2'),false);
    assert.equal(allow('hartsorter:r2_0_1'),false);
  }
});
test('legacy link and source-writer guard remains in generated builder, never a second routing authority',()=>{
  const builder=fs.readFileSync(new URL(
    '../candidates/uce/prepare_candidate.py',import.meta.url),'utf8');
  assert.match(builder,/uceAllowsSorterRegistryWrite\(key\)/);
  assert.match(builder,/guard_function\(source,"selectCollector"/);
  assert.match(builder,/guard_function\(source,"useReceiver"/);
  assert.match(builder,/guard_function\(source,"dequeueToReceiver"/);
  assert.match(builder,/guard_function\(source,"enqueueFromEjectedEntity"/);
  assert.match(builder,/guard_function\(source,"pg20MoveOpaqueNative"/);
});
