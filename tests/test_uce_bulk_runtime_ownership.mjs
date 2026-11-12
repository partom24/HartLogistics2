import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/**
 * Exercises the exact Bulk global-identity reader shipped by the UCE Bedrock
 * bridge. This is a source/mock regression, not BDS block or disk acceptance.
 */
const source=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const from=source.indexOf('function uceBulkGlobalUniqueness(');
const until=source.indexOf('\n/**\n * Append at most one VERIFIED',from);
assert.ok(from>=0&&until>from,'exact runtime function must be present');
const runtimeFunction=source.slice(from,until);

function fixture(shards,options={}){
  const seal={shards:shards.map(x=>({key:x.key}))};
  const world={
    getDynamicProperty(key){
      assert.equal(key,'hartlogistics:uce_cold_seal_v1');
      return JSON.stringify(seal);
    }
  };
  const createUnifiedShardWriter=({shardKey})=>{
    const shard=shards.find(x=>x.key===shardKey);
    if(!shard||options.unreadable===shardKey)return {ok:false};
    return {ok:true,inspect:()=>({
      ok:true,snapshot:{accounts:shard.accounts}
    })};
  };
  const context={world,createUnifiedShardWriter};
  vm.runInNewContext(runtimeFunction,context);
  return (ownerId,shardKey)=>context.uceBulkGlobalUniqueness(
    ownerId,shardKey,{worldId:'w',epoch:9});
}
const controller=name=>({kind:'bulk',ownerId:name,
  role:'controller',controllerOwnerId:name});
const member=(name,controllerOwnerId)=>({kind:'bulk',ownerId:name,
  role:'member',controllerOwnerId});

test('disconnected Receiver regions can elect independent Bulk controllers',()=>{
  const check=fixture([
    {key:'shard-a',accounts:[controller('bank-a')]},
    {key:'shard-b',accounts:[controller('bank-b')]}
  ]);
  // A third bank can join B despite A's separate controller.
  assert.equal(check('bank-new','shard-b'),true);
  assert.equal(check('bank-new','shard-a'),true);
});
test('one physical Bulk identity may never join competing shards',()=>{
  const check=fixture([
    {key:'shard-a',accounts:[controller('bank-a')]},
    {key:'shard-b',accounts:[controller('bank-b'),
      member('bank-occupied','bank-b')]}
  ]);
  assert.equal(check('bank-occupied','shard-a'),false);
  assert.equal(check('bank-a','shard-b'),false);
  assert.equal(check('bank-new','shard-b'),true);
});
test('incomplete, unreadable or multiply indexed world shards always HOLD',()=>{
  const shards=[
    {key:'shard-a',accounts:[controller('bank-a')]},
    {key:'shard-b',accounts:[controller('bank-b')]}
  ];
  assert.equal(fixture(shards,{unreadable:'shard-a'})(
    'bank-new','shard-b'),false);
  assert.equal(fixture(shards)('bank-new','nonexistent-shard'),false);
  const duplicate=fixture([
    {key:'same-shard',accounts:[]},
    {key:'same-shard',accounts:[]}
  ]);
  assert.equal(duplicate('bank-new','same-shard'),false);
});
