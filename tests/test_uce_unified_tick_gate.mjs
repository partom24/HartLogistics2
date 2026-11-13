import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** The exact generated-bridge scheduler gate, not a second test implementation.
 * Source mock only: Bedrock disk durability and actual actor interleavings
 * remain separate, bounded acceptance requirements.
 */
const bridge=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const first=bridge.indexOf('function uceUnifiedJournalHold(){');
const last=bridge.indexOf('\n/**\n * Read the immutable cold seal',first);
assert.ok(first>=0&&last>first,'unified scheduler must have stable bounds');
const actual=bridge.slice(first,last);

function fixture({ready=true,active=true,sealed=true,
                  thrown=false,journals={},afterMR=null,afterOrdinary=null,
                  ordinaryBudget=0,dirty=false,topologyFails=false}={}){
  const calls=[],messages=[],reads=[];
  const authority=active?{worldId:'restored-lab-copy',epoch:41}:undefined;
  const world={
    getDynamicProperty:key=>{
      reads.push(key);
      if(thrown)throw Error('unreadable world property');
      return journals[key];
    }
  };
  const context={
    world,ready,dirty,
    rebuildTopology:()=>{
      calls.push('topology');
      if(topologyFails)throw Error('topology observation failed');
    },
    uceAuthoritySnapshot:()=>{calls.push('authority');return authority;},
    inspectUnifiedActiveColdImport:args=>{
      calls.push('cold');
      assert.equal(args.world,world);
      assert.equal(args.worldId,'restored-lab-copy');
      assert.equal(args.epoch,41);
      return sealed?{ok:true}:{ok:false,reason:'stale_sealed_shard'};
    },
    uceBridgeLog:msg=>messages.push(msg),
    uceMrServiceTick:a=>{
      assert.equal(a,authority);calls.push('MR');
      if(typeof afterMR==='function')afterMR(journals);
    },
    uceOrdinaryServiceTick:a=>{
      assert.equal(a,authority);calls.push('ORDINARY');
      const count=calls.filter(x=>x==='ORDINARY').length;
      if(typeof afterOrdinary==='function')afterOrdinary(journals,count);
      return count<=ordinaryBudget;
    },
    uceSorterDirectServiceTick:a=>{
      assert.equal(a,authority);calls.push('SORTER');
    }
  };
  vm.runInNewContext(actual,context);
  context.uceUnifiedServiceTick();
  return {calls,messages,reads};
}
test('valid ACTIVE sealed world services both lanes under a single authority proof',()=>{
  const f=fixture();
  assert.deepEqual(f.calls,['authority','cold','MR','ORDINARY','SORTER']);
  assert.equal(f.reads.length,16,
    'one ordinary no-work attempt still gets a post-commit journal check');
});
test('missing authority or failed cold seal never invokes either lane',()=>{
  assert.deepEqual(fixture({active:false}).calls,['authority']);
  assert.deepEqual(fixture({sealed:false}).calls,['authority','cold']);
  assert.deepEqual(fixture({ready:false}).calls,['authority']);
});
test('every nonempty native, ordinary, and Q4 journal globally freezes both lanes',()=>{
  for(const key of [
    'hartsorter:journal_v1',
    'hartsorter:queue_journal_v1',
    'hartlogistics:uce_native_intent_v1',
    'hartlogistics:uce_boundary_intent_v1'
  ]){
    const f=fixture({journals:{[key]:'PREPARED'}});
    assert.deepEqual(f.calls,['authority','cold'],key);
    assert.equal(f.messages.some(x=>x.includes(key)),true,key);
  }
});
test('ambiguous falsy journal values HOLD; absence may proceed',()=>{
  for(const value of [false,0]){
    const f=fixture({journals:{'hartsorter:journal_v1':value}});
    assert.deepEqual(f.calls,['authority','cold']);
  }
  assert.deepEqual(fixture({journals:{
    'hartsorter:journal_v1':''
  }}).calls,['authority','cold','MR','ORDINARY','SORTER']);
});
test('world property throw is global HOLD, not legacy fallback or a write',()=>{
  const f=fixture({thrown:true});
  assert.deepEqual(f.calls,['authority','cold']);
  assert.equal(f.messages.some(x=>x.includes('unreadable')),true);
});

test('MR PREPARED in this tick prevents any later ordinary service start',()=>{
  const f=fixture({afterMR:j=>{
    j['hartlogistics:uce_native_intent_v1']='PREPARED';
  }});
  assert.deepEqual(f.calls,['authority','cold','MR']);
  assert.equal(f.messages.some(x=>x.includes('uce_native_intent_v1')),true);
});
test('MR clears its own acknowledged journal before ordinary lane starts',()=>{
  const f=fixture({afterMR:j=>{
    j['hartlogistics:uce_native_intent_v1']=undefined;
  }});
  assert.deepEqual(f.calls,['authority','cold','MR','ORDINARY','SORTER']);
});

test('dirty legacy Sorter topology is refreshed inside unified tick only',()=>{
  const r=fixture({dirty:true});
  assert.deepEqual(r.calls,['authority','cold','topology','MR','ORDINARY','SORTER']);
  const held=fixture({dirty:true,topologyFails:true});
  assert.deepEqual(held.calls,['authority','cold','topology']);
  assert.equal(held.messages.some(x=>x.includes('topology')),true);
});

test('ordinary operation leaving a pending intent holds direct native Sorter work',()=>{
  const f=fixture({afterMR:j=>{
    j['hartlogistics:uce_native_intent_v1']=undefined;
  }});
  assert.deepEqual(f.calls,['authority','cold','MR','ORDINARY','SORTER']);
});

test('multiple successful ordinary Receiver operations are bounded to four per tick',()=>{
  const f=fixture({ordinaryBudget:100});
  assert.deepEqual(f.calls,['authority','cold','MR',
    'ORDINARY','ORDINARY','ORDINARY','ORDINARY','SORTER']);
  assert.equal(f.calls.filter(x=>x==='MR').length,1);
  assert.equal(f.calls.filter(x=>x==='SORTER').length,1);
  assert.equal(f.reads.length,28,
    'two pre-lane, four post-commit and one pre-Sorter journal censuses');
});
test('ordinary batch stops on no work without spinning the scheduler',()=>{
  const f=fixture({ordinaryBudget:2});
  assert.deepEqual(f.calls,['authority','cold','MR',
    'ORDINARY','ORDINARY','ORDINARY','SORTER']);
});
test('ordinary journal interruption in second operation stops all subsequent writers',()=>{
  const f=fixture({ordinaryBudget:4,afterOrdinary:(journals,count)=>{
    if(count===2)
      journals['hartlogistics:uce_boundary_intent_v1']='PREPARED';
  }});
  assert.deepEqual(f.calls,['authority','cold','MR',
    'ORDINARY','ORDINARY']);
  assert.equal(f.messages.some(x=>x.includes('uce_boundary_intent_v1')),true);
  assert.equal(f.calls.includes('SORTER'),false);
});
test('an idle Receiver with an output Hopper does not reserve/spawn a carrier',()=>{
  const start=bridge.indexOf('function uceOrdinaryServiceTick(authority){');
  const end=bridge.indexOf('\n\n/* Bulk Storage',start);
  assert.ok(start>=0&&end>start);
  const helperStart=bridge.indexOf('function uceCarrierRegistrationReason(');
  const helperEnd=bridge.indexOf('\nfunction uceBridgeLog(',helperStart);
  assert.ok(helperStart>=0&&helperEnd>helperStart,
    'runtime carrier error classifier must be exercised from actual source');
  const actual=bridge.slice(helperStart,helperEnd)+
    '\nlet uceOrdinaryCursor=0;\n'+bridge.slice(start,end);
  const receiver={id:'minecraft:overworld|3|80|6',
    d:'minecraft:overworld',x:3,y:80,z:6,present:true};
  const receiverBlock={typeId:'hartsorter:receiver',location:{x:3,y:80,z:6}};
  const sourceBlock={typeId:'minecraft:hopper',dimension:{id:'minecraft:overworld'},
    location:{x:3,y:79,z:6}};
  let total=0,registrations=0;
  const logs=[];
  const ctx={
    world:{},
    uceLiveReceiverOwner:()=>true,
    logistics:{receivers:[receiver],collectors:[]},
    receiverAt:()=>receiverBlock,blockIsRedstonePowered:()=>false,
    receiverOutputHopper:()=>({block:sourceBlock,locked:false,
      container:{size:5,isValid:true,getItem:()=>undefined}}),
    uceOrdinaryHopperCandidate:()=>({
      slot:0,partialOutput:false,beforeAmount:0,room:64}),
    uceOrdinaryAccountSource:()=> 'sealed',
    uceMaybeRegisterBulk:()=>false,
    ucePipeRouteNetwork:()=>undefined,
    uceSorterCollectorSources:()=>[],
    createUnifiedCarrierRegistry:()=>({ok:true,
      inspectHost:()=>({ok:false,reason:'carrier_record_missing'}),
      registerEmptyHost:()=>{registrations++;return {ok:false,
        reason:'synthetic_spawn_blocked'};}}),
    createUnifiedShardWriter:()=>({ok:true,
      inspect:()=>({ok:true,snapshot:{accounts:[{
        id:'receiver:'+receiver.id,total,capacity:250000,
        buckets:total?[{key:JSON.stringify({typeId:'minecraft:stone'}),count:total}]:[]
      }]}})}),
    ItemStack:class {constructor(typeId,amount){this.typeId=typeId;this.amount=amount;}},
    uceClassifyLiveStack:()=> 'ORDINARY',
    uceNativeOutputSlot:()=>0,
    uceBridgeLog:x=>logs.push(x)
  };
  vm.runInNewContext(actual,ctx);
  const authority={worldId:'world',epoch:1};
  ctx.uceOrdinaryServiceTick(authority);
  assert.equal(registrations,0);
  assert.deepEqual(logs,[],'uninitialized idle host is not a custody fault');
  total=64;
  ctx.uceOrdinaryServiceTick(authority);
  assert.equal(registrations,1,'actual pending output may initiate an empty host');
  assert.deepEqual(logs,['synthetic_spawn_blocked']);
});

test('missing UCE authority cannot silently re-enable Q4 when sealed shard or journal survived a restart',()=>{
  const begin=bridge.indexOf('let uceEverHadAuthority=false;');
  const end=bridge.indexOf('\nfunction uceAuthoritySnapshot(){',begin);
  assert.ok(begin>=0&&end>begin,'actual UCE/legacy fence stable bounds');
  const original=bridge.slice(begin,end);
  const scenarios=[
    {keys:[],props:{},legacy:true},
    {keys:['hartsorter:logistics_v2'],props:{},legacy:true},
    {keys:['hartlogistics:uce_shard_0002_v1'],props:{},legacy:false},
    {keys:['hartlogistics:uce_native_host_d5df_v1'],props:{},legacy:false},
    {keys:['hartlogistics:uce_native_intent_v1'],props:{},legacy:false},
    {keys:[],props:{'hartlogistics:uce_cold_seal_v1':'sealed'},legacy:false},
    {keys:['hartlogistics:uce_authority_v1'],props:{
      'hartlogistics:uce_authority_v1':'corrupt marker'},legacy:false},
    {keys:['hartlogistics:uce_authority_v1'],props:{
      'hartlogistics:uce_authority_v1':''},legacy:false}
  ];
  for(const scenario of scenarios){
    let listed=0;
    const ctx={UCE_MAIN_AUTHORITY:'hartlogistics:uce_authority_v1',
      world:{getDynamicProperty:key=>scenario.props[key],
        getDynamicPropertyIds:()=>{listed++;return [...scenario.keys];}}};
    vm.runInNewContext(original,ctx);
    const first=ctx.uceLegacyWriterBlocked();
    assert.equal(first,!scenario.legacy,JSON.stringify(scenario));
    const second=ctx.uceLegacyWriterBlocked();
    assert.equal(second,first,'stable fail-closed provenance');
    assert.ok(listed<=1,'legacy origins must not enumerate every tick');
  }
});
test('once UCE authority has existed, deleting the marker in-process cannot revive legacy writers',()=>{
  const begin=bridge.indexOf('let uceEverHadAuthority=false;');
  const end=bridge.indexOf('\nfunction uceAuthoritySnapshot(){',begin);
  const raw={authority:'persisted'};
  const ctx={UCE_MAIN_AUTHORITY:'hartlogistics:uce_authority_v1',
    world:{getDynamicProperty:key=>key==='hartlogistics:uce_authority_v1'?
      raw.authority:undefined,
      getDynamicPropertyIds:()=>[]}};
  vm.runInNewContext(bridge.slice(begin,end),ctx);
  assert.equal(ctx.uceLegacyWriterBlocked(),true);
  raw.authority=undefined;
  assert.equal(ctx.uceLegacyWriterBlocked(),true);
});
test('legacy mode fails closed if dynamic property enumeration is unreadable',()=>{
  const begin=bridge.indexOf('let uceEverHadAuthority=false;');
  const end=bridge.indexOf('\nfunction uceAuthoritySnapshot(){',begin);
  const ctx={UCE_MAIN_AUTHORITY:'hartlogistics:uce_authority_v1',
    world:{getDynamicProperty:()=>undefined,
      getDynamicPropertyIds:()=>{throw Error('unreadable');}}};
  vm.runInNewContext(bridge.slice(begin,end),ctx);
  assert.equal(ctx.uceLegacyWriterBlocked(),true);
});

test('native Hopper egress selects certified ordinary partial space before empty slots',()=>{
  const from=bridge.indexOf('function uceOrdinaryHopperCandidate(');
  const to=bridge.indexOf('\nfunction uceNativeOutputSlot(',from);
  assert.ok(from>0&&to>from);
  const canonical={typeId:'minecraft:cobblestone',amount:1,maxAmount:64,
    isStackableWith:other=>other?.typeId==='minecraft:cobblestone'};
  const partial={typeId:'minecraft:cobblestone',amount:60,maxAmount:64,
    isStackableWith:other=>other?.typeId==='minecraft:cobblestone'};
  const slots=[partial,undefined];
  const ctx={
    findAcceptSlot:(container,item)=>{
      const v=container.getItem(0);
      if(v?.isStackableWith(item)&&v.amount<v.maxAmount)
        return {slot:0,before:v.amount,room:v.maxAmount-v.amount};
      return container.getItem(1)===undefined?
        {slot:1,before:0,room:64}:undefined;
    },
    ucePlainItemIdentity:item=>
      item.typeId==='minecraft:cobblestone'&&!item.nameTag?
        'plain:cobblestone':undefined
  };
  vm.runInNewContext(bridge.slice(from,to),ctx);
  const inventory={isValid:true,size:2,getItem:i=>slots[i]};
  const chosen=ctx.uceOrdinaryHopperCandidate(inventory,canonical);
  assert.equal(chosen.slot,0);
  assert.equal(chosen.beforeAmount,60);
  assert.equal(chosen.room,4);
  assert.equal(chosen.partialOutput,true);
  slots[0]={...partial,nameTag:'opaque'};
  assert.equal(ctx.uceOrdinaryHopperCandidate(inventory,canonical)?.slot,1,
    'opaque inventory entry cannot be merged into; empty slot is eligible');
  slots[1]={typeId:'minecraft:stone',amount:64};
  assert.equal(ctx.uceOrdinaryHopperCandidate(inventory,canonical),undefined);
  slots[0]=undefined;
  slots[1]=undefined;
  assert.equal(ctx.uceOrdinaryHopperCandidate(inventory,canonical)?.slot,0,
    'first available empty slot is preferred when no partial exists');
});
