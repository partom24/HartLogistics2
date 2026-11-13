import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/**
 * Execute the actual UCE gameplay menu overlay with PG08's BDS-supported
 * @minecraft/server-ui callback shape. The existing UCE link registry is
 * the ONLY commit delegate. No BDS, disk or UI rendering claim.
 */
const source=fs.readFileSync(new URL(
  '../candidates/uce/runtime_link_menu.js',import.meta.url),'utf8');

function fixture({existing=true,linked=null}={}){
  const dimension={id:'minecraft:overworld'},colId=dimension.id+'|3|70|4',
    recId=dimension.id+'|23|70|4';
  const collectorBlock={typeId:'hartsorter:collector',dimension,
    location:{x:3,y:70,z:4}};
  const receiverBlock={typeId:'hartsorter:receiver',dimension,
    location:{x:23,y:70,z:4}};
  const saved={collectors:existing?[{id:colId,link:linked}]:[],
    receivers:[],nextQueue:1,uceLinkRevision:3};
  const notifications=[],actions=[],confirms=[],arms=[],commits=[];
  let writes=0,leave,formHook,unlinkCalls=0,nativeOccupied=false;
  const responses={action:[],confirm:[]};
  class ActionFormData{
    title(){return this;}
    body(){return this;}
    button(){return this;}
    async show(){
      actions.push('opened');
      if(formHook)formHook('action');
      return responses.action.shift()??{canceled:true};
    }
  }
  class MessageFormData{
    title(){return this;}
    body(){return this;}
    button1(){return this;}
    button2(){return this;}
    async show(){
      confirms.push('opened');
      if(formHook)formHook('confirm');
      return responses.confirm.shift()??{canceled:true};
    }
  }
  const ctx={
    ActionFormData,MessageFormData,
    COLLECTOR_ID:'hartsorter:collector',RECEIVER_ID:'hartsorter:receiver',
    LOGISTICS_KEY:'hartsorter:logistics_v2',
    world:{
      getDynamicProperty:()=>JSON.stringify(saved),
      setDynamicProperty:()=>{writes++;},
      afterEvents:{playerLeave:{subscribe:fn=>{leave=fn;}}}
    },
    system:{currentTick:100},
    logisticsId:(d,x,y,z)=>d+'|'+x+'|'+y+'|'+z,
    collectorAt:()=>collectorBlock,
    receiverAt:()=>receiverBlock,
    uceSameLoadedBlock:(a,b)=>a.typeId===b.typeId&&
      a.location.x===b.location.x&&a.location.y===b.location.y&&
      a.location.z===b.location.z,
    uceShowCollectorLinkedStatus:()=>notifications.push('details'),
    uceShowReceiverLinkedStatus:()=>notifications.push('status'),
    uceSelectCollectorForLink:(_,block)=>{
      arms.push(block);
      const p=block.location;
      ctx.ucePendingLinkBlocks.set(ctx.player.id,{
        id:colId,d:dimension.id,x:p.x,y:p.y,z:p.z});
    },
    uceUseReceiverLinkOrStatus:(_,block)=>{
      commits.push(block);
      ctx.ucePendingLinkBlocks.delete(ctx.player.id);
    },
    uceLegacyWriterBlocked:()=>true,
    uceUnifiedJournalHold:()=>false,
    uceAuthoritySnapshot:()=>({worldId:'test-world',epoch:1}),
    inspectUnifiedActiveColdImport:()=>({ok:true}),
    uceLiveCollectorOwner:()=>true,
    createUnifiedCarrierRegistry:()=>({
      ok:true,
      inspectHost:()=>({ok:true}),
      inspectCustody:()=>({ok:true,occupied:nativeOccupied?1:0})
    }),
    createUnifiedLinkRegistry:opts=>({
      ok:true,
      inspect:()=>({ok:true,revision:saved.uceLinkRevision}),
      unlinkCollector:args=>{
        unlinkCalls++;
        if(!opts.verifyCollectorBlock(args.collector)||
           args.expectedRevision!==saved.uceLinkRevision)
          return {ok:false,reason:'stale_or_custody_occupied'};
        const col=saved.collectors.find(c=>c.id===args.collector.id);
        if(!col?.link)return {ok:false,reason:'not_linked'};
        col.link=null;
        saved.uceLinkRevision++;
        return {ok:true};
      }
    }),
    safeJsonParse:(value,fallback)=>{
      try{return JSON.parse(value);}catch(_){return fallback;}
    },
    uceHydrateNewReceivers:()=>true,
    uceNativeReceiptId:()=> 'menu-unlink-receipt-1',
    logistics:{collectors:[],receivers:[]}
  };
  ctx.player={id:'tester',sendMessage:message=>notifications.push(message)};
  vm.runInNewContext(
    'const ucePendingLinkBlocks=new Map();\n'+source+'\n'+
    'globalThis.__testPending=ucePendingLinkBlocks;\n',ctx);
  ctx.ucePendingLinkBlocks=ctx.__testPending;
  return {
    ctx,colId,recId,saved,responses,notifications,arms,commits,actions,confirms,
    collectorBlock,receiverBlock,
    get writes(){return writes;},
    get unlinkCalls(){return unlinkCalls;},
    setNativeOccupied(value){nativeOccupied=value;},
    onForm(fn){formHook=fn;},
    leave(){leave({playerId:'tester'});},
    arm:()=>ctx.uceCollectorLinkMenu(ctx.player,collectorBlock),
    confirm:()=>ctx.uceReceiverLinkMenu(ctx.player,receiverBlock)
  };
}
test('explicit Link / Relink and Receiver confirmation use exactly one old UCE writer',async()=>{
  const f=fixture({linked:'old-receiver'});
  f.responses.action.push({selection:0});
  await f.arm();
  assert.equal(f.arms.length,1);
  assert.equal(f.ctx.ucePendingLinkBlocks.size,1);
  assert.equal(f.commits.length,0);
  f.responses.confirm.push({selection:1});
  await f.confirm();
  assert.equal(f.commits.length,1);
  assert.equal(f.ctx.ucePendingLinkBlocks.size,0);
  assert.equal(f.writes,0,'menu has no separate world-state writer');
});
test('closing Collector menu or canceling Receiver confirmation never writes',async()=>{
  const f=fixture();
  f.responses.action.push({canceled:true});
  await f.arm();
  assert.equal(f.arms.length,0);
  f.responses.action.push({selection:0});
  await f.arm();
  f.responses.confirm.push({selection:0});
  await f.confirm();
  assert.equal(f.commits.length,0);
  assert.equal(f.ctx.ucePendingLinkBlocks.size,0);
  assert.equal(f.writes,0);
});
test('stale link revision and changed Collector link refuse commit',async()=>{
  for(const change of [f=>{f.saved.uceLinkRevision++;},
                         f=>{f.saved.collectors[0].link='other';}]){
    const f=fixture({linked:'prior'});
    f.responses.action.push({selection:0});
    await f.arm();
    change(f);
    f.responses.confirm.push({selection:1});
    await f.confirm();
    assert.equal(f.commits.length,0);
    assert.equal(f.ctx.ucePendingLinkBlocks.size,0);
  }
});
test('session expiration and player-leave invalidate pending link',async()=>{
  const f=fixture();
  f.responses.action.push({selection:0});
  await f.arm();
  f.ctx.system.currentTick=1301;
  f.responses.confirm.push({selection:1});
  await f.confirm();
  assert.equal(f.commits.length,0);
  f.responses.action.push({selection:0});
  await f.arm();
  f.leave();
  f.responses.confirm.push({selection:1});
  await f.confirm();
  assert.equal(f.commits.length,0);
});
test('fresh sealed empty-world link may be armed without inventing a registry',async()=>{
  const f=fixture({existing:false});
  f.responses.action.push({selection:0});
  await f.arm();
  assert.equal(f.arms.length,1);
  f.responses.confirm.push({selection:1});
  await f.confirm();
  assert.equal(f.commits.length,1);
  assert.equal(f.writes,0);
});
test('unreadable saved link registry fails closed before any selection',async()=>{
  const f=fixture();
  f.ctx.world.getDynamicProperty=()=>'{corrupt';
  f.responses.action.push({selection:0});
  await f.arm();
  assert.equal(f.actions.length,0);
  assert.equal(f.arms.length,0);
  assert.equal(f.commits.length,0);
});
test('forms unavailable and details-only interaction never mutate link',async()=>{
  const f=fixture();
  f.responses.action.push({selection:2});
  await f.arm();
  assert.ok(f.notifications.includes('details'));
  assert.equal(f.arms.length,0);
  f.onForm(()=>{throw Error('form-unavailable');});
  await f.arm();
  assert.equal(f.commits.length,0);
  assert.equal(f.writes,0);
});

test('PG08 Unlink uses existing writer only after explicit confirmation',async()=>{
  const f=fixture({linked:'other-receiver'});
  f.responses.action.push({selection:1});
  f.responses.confirm.push({selection:0});
  await f.arm();
  assert.equal(f.unlinkCalls,0);
  assert.equal(f.saved.collectors[0].link,'other-receiver');
  f.responses.action.push({selection:1});
  f.responses.confirm.push({selection:1});
  await f.arm();
  assert.equal(f.unlinkCalls,1);
  assert.equal(f.saved.collectors[0].link,null);
  assert.equal(f.writes,0);
  assert.equal(f.commits.length,0);
});
test('native Collector waiting custody refuses Unlink without touching link',async()=>{
  const f=fixture({linked:'other-receiver'});
  f.setNativeOccupied(true);
  f.responses.action.push({selection:1});
  f.responses.confirm.push({selection:1});
  await f.arm();
  assert.equal(f.unlinkCalls,0);
  assert.equal(f.saved.collectors[0].link,'other-receiver');
  assert.equal(f.writes,0);
});
test('stale Unlink confirmation cannot override concurrent relink',async()=>{
  const f=fixture({linked:'old-receiver'});
  f.onForm(kind=>{
    if(kind==='confirm')f.saved.uceLinkRevision++;
  });
  f.responses.action.push({selection:1});
  f.responses.confirm.push({selection:1});
  await f.arm();
  assert.equal(f.unlinkCalls,0);
  assert.equal(f.saved.collectors[0].link,'old-receiver');
});
