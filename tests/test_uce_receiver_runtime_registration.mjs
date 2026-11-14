import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** Test exact Bedrock bridge functions, without installing or modifying BDS. */
const source=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const begin=source.indexOf('function uceSealedRegions(');
const end=source.indexOf('\nfunction ucePlainItemIdentity(',begin);
assert.ok(begin>=0&&end>begin,'Receiver runtime reader must exist');
const runtime=source.slice(begin,end);

function fixture(){
  const owner='minecraft:overworld|50|74|21',dimensionId='minecraft:overworld';
  const regionKey='hartlogistics:uce_shard_0010_v1';
  const shards=new Map([
    ['legacy-shard',{accounts:[{id:'receiver:old',kind:'receiver',
      ownerId:'old'}]}],
    [regionKey,{accounts:[],sourceReceivers:[],total:0,revision:0}]
  ]);
  const seal={worldId:'w',epoch:9,shards:[
    {key:'legacy-shard',owner:'receiver:old'},
    {key:regionKey,owner:'reserve:0000'}
  ]};
  const values=new Map([['hartlogistics:uce_cold_seal_v1',JSON.stringify(seal)]]);
  const logs=[],messages=[],writes=[],blocks=new Map();
  const pos={x:50,y:74,z:21};
  const block={typeId:'hartsorter:receiver',
    dimension:{id:dimensionId},location:pos};
  blocks.set(owner,block);
  const logistics={receivers:[{id:'old',d:dimensionId,x:1,y:2,z:3,
    present:true}],collectors:[]};
  let receipt=0;
  const world={
    getDynamicProperty:k=>values.get(k),
    setDynamicProperty:(k,v)=>{writes.push([k,v]);values.set(k,v);}
  };
  const createUnifiedShardWriter=({shardKey,
    verifyReceiverPlacement,verifyGlobalReceiverUniqueness,
    verifyReceiverReserveShard})=>{
    const state=shards.get(shardKey);
    if(!state)return {ok:false,reason:'no_shard'};
    return {ok:true,inspect:()=>({ok:true,snapshot:state}),
      registerNewReceiver:({ownerId,anchor,expectedRevision})=>{
        if(!verifyReceiverPlacement(ownerId,anchor)||
           !verifyGlobalReceiverUniqueness(ownerId)||
           !verifyReceiverReserveShard(shardKey))
          return {ok:false,reason:'unverified_physical_owner'};
        if(state.accounts.length||state.revision!==expectedRevision)
          return {ok:false,reason:'stale'};
        state.accounts=[{id:'receiver:'+ownerId,kind:'receiver',
          ownerId,uceAnchor:anchor,total:0,
          lifetime:{received:0,delivered:0}}];
        state.revision++;
        writes.push([shardKey,'shard-only-register']);
        return {ok:true,revision:state.revision};
      }};
  };
  const ctx={world,logistics,RECEIVER_ID:'hartsorter:receiver',
    createUnifiedShardWriter,
    uceAuthoritySnapshot:()=>({worldId:'w',epoch:9}),
    inspectUnifiedActiveColdImport:()=>({ok:true}),
    uceBridgeLog:reason=>logs.push(reason),
    findReceiverById:id=>logistics.receivers.find(r=>r.id===id),
    logisticsId:(d,x,y,z)=>d+'|'+x+'|'+y+'|'+z,
    getBlock:(d,x,y,z)=>blocks.get(d+'|'+x+'|'+y+'|'+z),
    uceLegacyWriterBlocked:()=>true,
    uceNativeReceiptId:()=>('op'+(++receipt)),
    uceShowReceiverLinkedStatus:()=>messages.push('STATUS')
  };
  vm.runInNewContext(runtime,ctx);
  const player={sendMessage:m=>messages.push(m)};
  return {ctx,owner,regionKey,seal,shards,world,logistics,block,
    blocks,writes,messages,player,logs};
}
test('new Receiver adds one sealed ownership account and works in memory',()=>{
  const f=fixture();
  assert.equal(f.ctx.uceOrdinaryAccountSource({worldId:'w',epoch:9},
    f.owner),undefined);
  f.ctx.uceRegisterNewReceiver(f.player,f.block);
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0][0],f.regionKey);
  assert.equal(f.logistics.receivers.length,2);
  assert.equal(f.logistics.receivers[1].id,f.owner);
  assert.equal(f.ctx.uceOrdinaryAccountSource({worldId:'w',epoch:9},
    f.owner),f.regionKey);
  assert.equal(f.messages.some(s=>s.includes('Registered in unified custody')),true);
  // An already-owned placement is idempotent, not another stored balance.
  f.ctx.uceRegisterNewReceiver(f.player,f.block);
  assert.equal(f.writes.length,1);
});
test('restart rebuilds new Receiver identity without rewriting old Q4 registry',()=>{
  const f=fixture();f.ctx.uceRegisterNewReceiver(f.player,f.block);
  f.logistics.receivers=[f.logistics.receivers[0]];
  const before=f.writes.length;
  assert.equal(f.ctx.uceHydrateNewReceivers(),true);
  assert.equal(f.logistics.receivers.length,2);
  assert.equal(f.writes.length,before);
  assert.equal(f.ctx.uceHydrateNewReceivers(),true);
  assert.equal(f.logistics.receivers.length,2);
  assert.equal(f.ctx.uceOrdinaryAccountSource({worldId:'w',epoch:9},
    'old'),'legacy-shard');
});
test('missing physical Receiver refuses registration without mutating ownership',()=>{
  const f=fixture();f.blocks.delete(f.owner);
  f.ctx.uceRegisterNewReceiver(f.player,f.block);
  assert.equal(f.writes.length,0);
  assert.equal(f.logistics.receivers.length,1);
  assert.equal(f.shards.get(f.regionKey).accounts.length,0);
  assert.equal(f.messages.some(s=>s.includes('HOLD')),true);
});
test('reserved shard full or owner already claimed elsewhere cannot be reused',()=>{
  const f=fixture();
  f.shards.get(f.regionKey).accounts=[{kind:'receiver',
    id:'receiver:other',ownerId:'other',
    uceAnchor:{dimensionId:'minecraft:overworld',x:1,y:2,z:3}}];
  f.ctx.uceRegisterNewReceiver(f.player,f.block);
  assert.equal(f.writes.length,0);
  assert.equal(f.logistics.receivers.length,1);
  const g=fixture();
  g.shards.get('legacy-shard').accounts.push({
    id:'receiver:'+g.owner,kind:'receiver',ownerId:g.owner});
  assert.equal(g.ctx.uceNewReceiverIdentityUnclaimed({worldId:'w',epoch:9},
    g.owner),false);
});
