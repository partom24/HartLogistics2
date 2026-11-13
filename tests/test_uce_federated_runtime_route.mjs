import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** Exact integrated bridge proof. Source-shaped only, not BDS acceptance. */
const bridge=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const start=bridge.indexOf('function uceInterbankRouteVerified(');
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
  let validBanks=true,leaderVisible=true,preferredOutput=false,
      unresolvedForwarding=false;
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
    planUnifiedBulkService:()=>({ok:validBanks}),
    inspectQ4OrdinaryDefinitionShape:()=>({ok:true}),
    ItemStack:class {
      constructor(typeId,amount){this.typeId=typeId;this.amount=amount;}
    },
    uceClassifyLiveStack:()=> 'ORDINARY',
    receiverOutputHopper:()=>undefined,
    blockIsRedstonePowered:()=>false,
    uceChoosePipeDestination:()=>preferredOutput?{slot:0}:undefined,
    ucePipeHasUnresolvedForwarding:()=>unresolvedForwarding
  };
  vm.runInNewContext(code,ctx);
  const normal={worldId:'world',epoch:9,
    routeWitness:rawGraph.fingerprint,
    key:JSON.stringify({typeId:'minecraft:stone',lore:[],ench:[],
      canDestroy:[],canPlaceOn:[]}),
    fromAccount:'receiver:follower',
    toAccount:'bulk:bank-owner',fromShard:shardA,toShard:shardB};
  return {ctx,network,normal,
    set validBanks(x){validBanks=x;},
    set leaderVisible(x){leaderVisible=x;},
    set preferredOutput(x){preferredOutput=x;},
    set unresolvedForwarding(x){unresolvedForwarding=x;}};
}
test('interbank bridge re-proves source, destination and exact route witness before each shard write',()=>{
  const source={id:'source',present:true};
  const target={id:'target',present:true};
  const witness='IB1|source|verified-filter-target';
  let routeValid=true,targetLoaded=true,destinationSealed=true;
  const ctx={
    uceOrdinaryAccountSource:(_,id)=>id==='source'?shardA:
      id==='target'&&destinationSealed?shardB:undefined,
    ucePipeRouteNetwork:()=>({receiverIds:['source']}),
    uceSelectInterbankFilteredRoute:()=>
      routeValid?{witness,receiver:target}:undefined,
    receiverAt:r=>r===source?{typeId:'receiver'}:
      r===target&&targetLoaded?{typeId:'receiver'}:undefined,
    inspectQ4OrdinaryDefinitionShape:()=>({ok:true}),
    uceClassifyLiveStack:()=> 'ORDINARY',
    ItemStack:class {constructor(typeId,amount){
      this.typeId=typeId;this.amount=amount;
    }}
  };
  vm.runInNewContext(code,ctx);
  const tx={worldId:'world',epoch:9,
    fromAccount:'receiver:source',toAccount:'receiver:target',
    fromShard:shardA,toShard:shardB,routeWitness:witness,
    key:JSON.stringify({typeId:'minecraft:cobblestone',
      lore:[],ench:[],canDestroy:[],canPlaceOn:[]})};
  const authority={worldId:'world',epoch:9};
  const check=(x=tx,dir='withdraw')=>
    ctx.uceInterbankRouteVerified(authority,source,x,dir);
  assert.equal(check(),true);
  assert.equal(check(tx,'deposit'),true);
  assert.equal(check({...tx,toAccount:'receiver:wrong'}),false);
  assert.equal(check({...tx,fromShard:shardB}),false);
  assert.equal(check({...tx,routeWitness:witness+'-stale'}),false);
  assert.equal(check({...tx,toShard:shardA}),false);
  assert.equal(check({...tx,key:'not-json'}),false);
  destinationSealed=false;
  assert.equal(check(),false);
  destinationSealed=true;targetLoaded=false;
  assert.equal(check(),false);
  targetLoaded=true;routeValid=false;
  assert.equal(check(),false);
});
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
test('federated write proof forbids Bulk spill while Collector route remains unresolved',()=>{
  const f=fixture();
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,f.normal,'withdraw'),true);
  f.unresolvedForwarding=true;
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,f.normal,'withdraw'),false,
    'unresolved Collector forwarding must block both shard writes');
  const reverse={...f.normal,fromAccount:'bulk:bank-owner',
    toAccount:'receiver:follower',fromShard:shardB,toShard:shardA};
  f.preferredOutput=true;
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,reverse,'withdraw'),true,
    'a verified Filter refill must not be blocked by an unrelated frontier');
});
test('reverse bank refill must remain attached to the same loaded graph and leader',()=>{
  const f=fixture();
  f.preferredOutput=true;
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

test('federated overflow/refill revalidates live preferred Sorter priority at commit',()=>{
  const f=fixture();
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,f.normal,'withdraw'),true);
  f.preferredOutput=true;
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,f.normal,'withdraw'),false,
    'new preferred output blocks stale overflow');
  const reverse={...f.normal,fromAccount:'bulk:bank-owner',
    toAccount:'receiver:follower',fromShard:shardB,toShard:shardA};
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,reverse,'withdraw'),true);
  f.preferredOutput=false;
  assert.equal(f.ctx.uceFederatedRouteVerified(
    authority,follower,reverse,'deposit'),false,
    'retracted preferred output blocks stale refill');
});
