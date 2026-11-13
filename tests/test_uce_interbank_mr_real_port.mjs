import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createUnifiedCarrierRegistry,UCE_CARRIER_TYPE} from
  '../candidates/transport/unified_carrier_registry.mjs';
import {createUnifiedNativePort,UCE_NATIVE_INTENT_KEY} from
  '../candidates/transport/unified_native_custody.mjs';
import {UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA,
  verifyUnifiedMutationFence} from
  '../candidates/transport/unified_world_shard_writer.mjs';

/**
 * True Node integration of TWO real persistent carrier registry instances
 * and the REAL native ItemStack port, called through the exact Bedrock
 * bridge handoff function. Only the Bedrock entity/container APIs are mocks.
 * This does not certify real BDS hard-crash save-ordering.
 */
const bridge=process.env.UCE_GENERATED_MAIN?
  fs.readFileSync(process.env.UCE_GENERATED_MAIN,'utf8'):
  fs.readFileSync(new URL(
    '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
function extract(name){
  const at=bridge.indexOf('function '+name+'(');
  assert.ok(at>=0,'missing exact bridge function '+name);
  const begin=bridge.indexOf('{',at);
  let depth=0;
  for(let i=begin;i<bridge.length;i++){
    if(bridge[i]==='{')depth++;
    else if(bridge[i]==='}'&&--depth===0)
      return bridge.slice(at,i+1);
  }
  throw Error('unterminated '+name);
}
const fn=extract('uceTryInterbankMrHandoff');
const worldId='minecraft:overworld:real-interbank-mr',epoch=31;
const dimId='minecraft:overworld';
const owner=(x)=>({id:dimId+'|'+x+'|70|4',
  d:dimId,x,y:70,z:4,present:true});
const anchor=r=>({dimensionId:r.d,x:r.x,y:r.y,z:r.z});
const sample={typeId:'minecraft:diamond_pickaxe',amount:1,
  nameTag:'Never flatten MR item',
  lore:['same named native ItemStack'],
  hiddenNbt:{enchantments:{mending:1},custom:['opaque',42]}};
const copy=x=>x===undefined?undefined:structuredClone(x);
function container(size=9,seed){
  const slots=Array(size).fill(undefined);
  if(seed)slots[0]=copy(seed);
  return {size,isValid:true,getItem:i=>copy(slots[i]),
    moveItem(i,j,to){
      if(slots[i]===undefined||to.getItem(j)!==undefined)
        throw Error('mock-native-empty-slot-required');
      to.setEngine(j,slots[i]);
      slots[i]=undefined;
    },setEngine:(slot,item)=>{slots[slot]=copy(item);},
    raw:slots};
}
function fixture({interruptSecondTicket=false}={}){
  const values=new Map([[UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',worldId,epoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  })]]);
  const source=owner(4),target=owner(24);
  const hosts=[];
  let phase='setup',ticketWrites=0;
  const dim={
    id:dimId,
    getEntities({type,location,maxDistance}){
      return hosts.filter(e=>e.typeId===type&&e.loaded!==false&&
        Math.hypot(e.location.x-location.x,
          e.location.y-location.y,e.location.z-location.z)<=maxDistance);
    },
    spawnEntity(type,location){
      const e={id:'carrier-'+(hosts.length+1),typeId:type,
        location,loaded:true,
        getComponent:()=>({inventorySize:9,
          canBeSiphonedFrom:false,container:container()})};
      hosts.push(e);
      return e;
    }
  };
  const world={
    getDynamicProperty:key=>values.get(key),
    setDynamicProperty(key,value){
      if(value===undefined)values.delete(key);
      else values.set(key,value);
      if(phase==='handoff'&&key.includes('uce_native_ticket_')){
        ticketWrites++;
        if(interruptSecondTicket&&ticketWrites===2)
          throw Error('injected_second_ticket_after_save');
      }
    },
    getDimension:key=>key===dimId?dim:undefined
  };
  const registry=createUnifiedCarrierRegistry({
    world,worldId,epoch,externalFence:()=>true,
    ownerVerifier:(id,at)=>[source,target].some(x=>
      x.id===id&&x.d===at.dimensionId&&
      x.x===at.x&&x.y===at.y&&x.z===at.z)
  });
  assert.equal(registry.ok,true,registry.reason);
  assert.equal(registry.registerEmptyHost({
    ownerId:source.id,anchor:anchor(source)}).ok,true);
  assert.equal(registry.registerEmptyHost({
    ownerId:target.id,anchor:anchor(target)}).ok,true);
  const sourceHost=registry.inspectHost({
    ownerId:source.id,anchor:anchor(source)});
  const targetHost=registry.inspectHost({
    ownerId:target.id,anchor:anchor(target)});
  assert.equal(sourceHost.ok,true,sourceHost.reason);
  assert.equal(targetHost.ok,true,targetHost.reason);
  const input=container(5,sample);
  const from={ownerId:'physical-test-input',container:input,slot:0};
  const to={ownerId:source.id,container:sourceHost.container,slot:0};
  const port=createUnifiedNativePort({
    world,worldId,epoch,externalFence:()=>true,
    verifyEndpointOwner:()=>true,
    durableOwnershipWitness:registry.durableOwnershipWitness
  });
  assert.equal(port.ok,true,port.reason);
  const seeded=port.moveWhole({operationId:'mr-seed-1',from,to});
  assert.equal(seeded.ok,true,seeded.reason);
  const ticket=registry.stageMovedTicket({
    ownerId:source.id,anchor:anchor(source)});
  assert.equal(ticket.ok,true,ticket.reason);
  const seedAck=port.ackWhole({operationId:'mr-seed-1',from,to});
  assert.equal(seedAck.ok,true,seedAck.reason);
  assert.equal(values.has(UCE_NATIVE_INTENT_KEY),false);
  assert.equal(registry.inspectCustody({
    ownerId:source.id,anchor:anchor(source)}).occupied,1);
  let selected=true;
  const ctx={
    world,uceClassifyLiveStack:()=> 'MR',
    ucePipeRouteNetwork:()=>({}),
    uceSelectInterbankFilteredRoute:()=>selected?
      {receiver:target,hops:1,witness:'IB1|real-native-host-transfer'}:
      undefined,
    uceLiveReceiverOwner:(id,at)=>
      [source,target].some(r=>r.id===id&&r.x===at.x),
    uceNativeReceiptId:()=> 'mr-interbank-real-1',
    uceLegacyWriterBlocked:()=>true,
    uceAuthoritySnapshot:()=>({worldId,epoch}),
    createUnifiedNativePort
  };
  vm.runInNewContext(fn,ctx);
  phase='handoff';
  const run=()=>ctx.uceTryInterbankMrHandoff(
    {worldId,epoch},source,registry,sourceHost,
    anchor(source),0,sourceHost.container.getItem(0));
  return {run,registry,source,target,world,values,hosts,
    sourceHost,targetHost,input,
    revoke(){selected=false;},
    get ticketWrites(){return ticketWrites;}};
}
test('two real native carriers exchange the unchanged MR item with dual tickets and journal ACK',()=>{
  const f=fixture();
  const result=f.run();
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.status,'INTERBANK_MR_NATIVE_CUSTODY_ACK');
  assert.equal(f.sourceHost.container.getItem(0),undefined);
  const actual=f.targetHost.container.getItem(0);
  assert.deepEqual(actual,sample,
    'original native metadata-rich payload was moved, not flattened');
  const src=f.registry.inspectCustody({
    ownerId:f.source.id,anchor:anchor(f.source)});
  const dst=f.registry.inspectCustody({
    ownerId:f.target.id,anchor:anchor(f.target)});
  assert.equal(src.ok,true,src.reason);
  assert.equal(dst.ok,true,dst.reason);
  assert.equal(src.occupied,0);
  assert.equal(dst.occupied,1);
  assert.equal(f.ticketWrites,2,'one source RELEASE and one target ADMIT');
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),false);
  assert.equal(f.hosts.length,2,'exactly the original two physical carriers');
  assert.equal(verifyUnifiedMutationFence(f.world,worldId,epoch,()=>true).ok,
    true);
});
test('second real carrier ticket write uncertainty retains global native HOLD, no extra move',()=>{
  const f=fixture({interruptSecondTicket:true});
  const r=f.run();
  assert.equal(r.ok,false);
  assert.ok(r.reason.includes('interbank_mr_target_ticket'));
  assert.equal(f.sourceHost.container.getItem(0),undefined);
  assert.deepEqual(f.targetHost.container.getItem(0),sample);
  assert.equal(f.values.has(UCE_NATIVE_INTENT_KEY),true);
  assert.equal(verifyUnifiedMutationFence(
    f.world,worldId,epoch,()=>true).ok,false);
  const repeated=f.run();
  assert.notEqual(repeated?.ok,true);
  assert.equal(f.hosts.length,2);
  assert.equal(f.sourceHost.container.getItem(0),undefined);
  assert.deepEqual(f.targetHost.container.getItem(0),sample);
});
