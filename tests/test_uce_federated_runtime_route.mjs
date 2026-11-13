import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** Exact integrated bridge proof. Source-shaped only, not BDS acceptance. */
const bridge=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const start=bridge.indexOf('function uceFederatedRouteVerified(');
const end=bridge.indexOf('\nfunction uceOrdinaryServiceTick(',start);
assert.ok(start>0&&end>start);
const code=bridge.slice(start,end);
const leader={id:'lead',present:true};
const follower={id:'follower',present:true};
const authority={worldId:'world',epoch:9};
const shardA='hartlogistics:uce_shard_0001_v1';
const shardB='hartlogistics:uce_shard_0002_v1';
const rawGraph={leaderId:'lead',receiverIds:['lead','follower'],
  fingerprint:'verified-pipes-and-sorters',
  banks:[{id:'bank-block'}]};
function fixture(){
  let validBanks=true,leaderVisible=true;
  const network={...rawGraph};
  const ctx={
    world:{},findReceiverById:id=>id===leader.id?leader:undefined,
    receiverAt:r=>r===leader?leaderVisible?{typeId:'receiver'}:undefined:
      {typeId:'receiver'},
    ucePipeRouteNetwork:()=>network,
    uceOrdinaryAccountSource:(_,id)=>id==='lead'?shardB:
      id==='follower'?shardA:undefined,
    uceBulkOwnerId:()=> 'bank-owner',
    createUnifiedShardWriter:({shardKey})=>shardKey===shardB?{
      ok:true,inspect:()=>({ok:true,snapshot:{accounts:[
        {id:'receiver:lead',kind:'receiver'},
        {id:'bulk:bank-owner',kind:'bulk',ownerId:'bank-owner',
         role:'controller',controllerOwnerId:'bank-owner'}
      ]}})
    }:{ok:false},
    planUnifiedBulkService:()=>({ok:validBanks})
  };
  vm.runInNewContext(code,ctx);
  const normal={worldId:'world',epoch:9,
    routeWitness:rawGraph.fingerprint,
    fromAccount:'receiver:follower',
    toAccount:'bulk:bank-owner',fromShard:shardA,toShard:shardB};
  return {ctx,network,normal,
    set validBanks(x){validBanks=x;},
    set leaderVisible(x){leaderVisible=x;}};
}
test('federated bridge proves both Receiver and elected bank ownership before a debit',()=>{
  const f=fixture();
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,f.normal,'withdraw'),true);
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,{...f.normal,fromShard:shardB},'withdraw'),false);
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,{...f.normal,toAccount:'bulk:foreign'},'withdraw'),false);
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,{...f.normal,routeWitness:'stale'},'withdraw'),false);
  f.validBanks=false;
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,f.normal,'deposit'),false);
});
test('reverse bank refill must remain attached to the same loaded graph and leader',()=>{
  const f=fixture();
  const reverse={...f.normal,fromAccount:'bulk:bank-owner',
    toAccount:'receiver:follower',fromShard:shardB,toShard:shardA};
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,reverse,'withdraw'),true);
  f.leaderVisible=false;
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,reverse,'deposit'),false);
  f.leaderVisible=true;
  f.network.fingerprint='new-network-topology';
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,reverse,'deposit'),false);
});
