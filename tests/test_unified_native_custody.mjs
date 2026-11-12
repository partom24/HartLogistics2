import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createUnifiedNativePort,UCE_NATIVE_INTENT_KEY,UCE_NATIVE_INTENT_SCHEMA
} from '../candidates/transport/unified_native_custody.mjs';
import {UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA}
  from '../candidates/transport/unified_world_shard_writer.mjs';

const worldId='minecraft:overworld:protected141';
const epoch=43;
const original={typeId:'minecraft:diamond_pickaxe',amount:1,
  nameTag:'Hart original MR',lore:['Never serialize into Q4'],
  hiddenNbt:{opaqueEnchant:'unbroken',nested:{num:42}}};
const copied=o=>o===undefined?undefined:structuredClone(o);
function nativeContainer(initial){
  const state=[copied(initial),undefined,undefined,undefined];
  let moves=0;
  const c={
    size:4,isValid:true,
    getItem:i=>copied(state[i]),
    // A native engine moves the actual payload, including opaque bytes.
    // getItem returns NEW JS objects, as Script API is permitted to do.
    moveItem(from,to,target){
      moves++;
      if(target===this||!state[from]||target.peek(to))
        throw Error('native container rule');
      const real=state[from];
      state[from]=undefined;
      target.setByEngine(to,real);
    },
    peek:i=>state[i],
    setByEngine:(i,v)=>{state[i]=v;},
    get moves(){return moves;},
    get raw(){return state;}
  };
  return c;
}
function fixture(opts={}){
  const values=new Map();
  if(opts.active!==false)values.set(UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',worldId,epoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  }));
  let writes=0,durable=opts.ack===true,valid=opts.valid!==false;
  const world={
    getDynamicProperty:k=>values.get(k),
    setDynamicProperty(k,v){
      writes++;
      if(opts.onWrite)return opts.onWrite(k,v,values,writes);
      if(v===undefined)values.delete(k);
      else values.set(k,v);
    }
  };
  const src=nativeContainer(original),dst=nativeContainer();
  const from={container:src,slot:0,ownerId:'vanilla-hopper:1'};
  const to={container:dst,slot:1,ownerId:'uce-carrier:1'};
  const port=createUnifiedNativePort({
    world,worldId,epoch,externalFence:opts.externalFence??(()=>true),
    verifyEndpointOwner:()=>valid,
    durableOwnershipWitness:()=>durable
  });
  assert.equal(port.ok,true,port.reason);
  return {port,values,src,dst,from,to,
    setDurable:v=>{durable=v;},
    setValid:v=>{valid=v;},
    get writes(){return writes}};
}
const holds=(r,reason)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.status,'HOLD');
  assert.equal(r.canReplay,false);
  if(reason)assert.equal(r.reason,reason);
};
const run=f=>f.port.moveWhole({
  operationId:'uce-native-43-1',from:f.from,to:f.to
});
const ack=f=>f.port.ackWhole({
  operationId:'uce-native-43-1',from:f.from,to:f.to
});
test('whole original ItemStack moves natively with opaque mock payload intact and stays pending ACK',()=>{
  const f=fixture(),r=run(f);
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'NATIVE_MOVED_PENDING_OWNERSHIP_ACK');
  assert.equal(f.src.raw[0],undefined);
  assert.deepEqual(f.dst.raw[1],original);
  assert.equal(f.src.moves,1);
  assert.equal(f.port.inspectPending().phase,'MOVED_INSPECTED');
  assert.equal(JSON.parse(f.values.get(UCE_NATIVE_INTENT_KEY)).schema,UCE_NATIVE_INTENT_SCHEMA);
  assert.equal(f.writes,2);
  holds(run(f),'native_intent_pending_global');
});
test('ACK requires persistent ownership proof; never clears a moved item merely from physical readback',()=>{
  const f=fixture();assert.equal(run(f).ok,true);
  holds(ack(f),'native_ack_custody_proof_missing');
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),true);
  f.setDurable(true);
  const r=ack(f);
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'NATIVE_CUSTODY_ACK_READBACK');
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),false);
  assert.equal(f.port.inspectPending().status,'NATIVE_JOURNAL_CLEAR');
  assert.deepEqual(f.dst.raw[1],original);
});
test('inactive UCE authority blocks physical move before a journal',()=>{
  const f=fixture({active:false});
  holds(run(f),'world_ue_authority_missing');
  assert.equal(f.src.moves,0);
  assert.equal(f.writes,0);
});
test('pending legacy queue or native journal blocks new move',()=>{
  const f=fixture();
  f.values.set('hartsorter:queue_journal_v1','{"pending":true}');
  holds(run(f),'legacy_journal_pending');
  assert.equal(f.src.moves,0);
  const g=fixture();
  g.values.set(UCE_NATIVE_INTENT_KEY,'unparseable');
  holds(run(g),'native_intent_invalid_for_unified_fence');
  assert.equal(g.src.moves,0);
});
test('unverified endpoint identity / changed prewrite fence preserves source',()=>{
  const f=fixture({valid:false});
  holds(run(f),'native_endpoint_ownership_unverified');
  assert.deepEqual(f.src.raw[0],original);
  const g=fixture({externalFence:()=>false});
  holds(run(g),'legacy_writer_exclusion_unproven');
  assert.equal(g.writes,0);
});
test('target occupied refuses native move without touching journal',()=>{
  const f=fixture();
  f.dst.setByEngine(1,{typeId:'minecraft:stone',amount:64});
  holds(run(f),'native_source_missing_or_target_occupied');
  assert.equal(f.src.moves,0);
  assert.equal(f.writes,0);
});
test('same-container or same-owner move refuses before writer access',()=>{
  const f=fixture(),wrong={...f.to,container:f.src};
  holds(f.port.moveWhole({
    operationId:'uce-native-43-1',from:f.from,to:wrong
  }),'invalid_native_move_endpoints');
  const sameOwner={...f.to,ownerId:f.from.ownerId};
  holds(f.port.moveWhole({
    operationId:'uce-native-43-1',from:f.from,to:sameOwner
  }),'invalid_native_move_endpoints');
  assert.equal(f.writes,0);
});
test('after-move exception leaves PREPARED and session quarantine, never retries',()=>{
  const f=fixture();
  const savedMove=f.src.moveItem;
  f.src.moveItem=(a,b,d)=>{
    savedMove(a,b,d);
    throw Error('engine throws after move happened');
  };
  holds(run(f),'native_move_outcome_ambiguous');
  assert.equal(f.dst.raw[1].typeId,original.typeId);
  assert.equal(JSON.parse(f.values.get(UCE_NATIVE_INTENT_KEY)).phase,'PREPARED');
  holds(run(f),'native_session_quarantined');
  assert.equal(f.src.moves,1);
});
test('before-move PREPARED write exception leaves source item and prevents physical write',()=>{
  const f=fixture({onWrite:(k,v,values)=>{
    if(v!==undefined)values.set(k,v);
    throw Error('write outcome unknown');
  }});
  holds(run(f),'native_prepare_write_ambiguous');
  assert.deepEqual(f.src.raw[0],original);
  assert.equal(f.src.moves,0);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),true);
});
test('destination mismatch after one native move leaves journal and never guesses recovery',()=>{
  const f=fixture();
  f.src.moveItem=(a,b,d)=>{
    f.src.setByEngine(a,undefined);
    d.setByEngine(b,{typeId:'minecraft:iron_ingot',amount:1});
  };
  holds(run(f),'native_postmove_witness_mismatch');
  assert.equal(JSON.parse(f.values.get(UCE_NATIVE_INTENT_KEY)).phase,'PREPARED');
  holds(ack(f),'native_session_quarantined');
});
test('ACK rejects stale owner identity and disappeared destination even with durable claim',()=>{
  const f=fixture({ack:true});assert.equal(run(f).ok,true);
  holds(f.port.ackWhole({
    operationId:'uce-native-43-1',from:f.from,
    to:{...f.to,ownerId:'other'}
  }),'native_ack_endpoint_mismatch');
  f.dst.setByEngine(1,undefined);
  holds(ack(f),'native_ack_custody_proof_missing');
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),true);
});
test('restart finds pending native intent but never automatically settles or replays',()=>{
  const f=fixture();
  assert.equal(run(f).ok,true);
  const p=createUnifiedNativePort({
    world:{getDynamicProperty:k=>f.values.get(k),
      setDynamicProperty:()=>{throw Error('no automatic writes');}},
    worldId,epoch,externalFence:()=>true,
    verifyEndpointOwner:()=>true,
    durableOwnershipWitness:()=>false
  });
  assert.equal(p.inspectPending().phase,'MOVED_INSPECTED');
  holds(p.moveWhole({operationId:'again',from:f.from,to:f.to}),
    'native_intent_pending_global');
});
