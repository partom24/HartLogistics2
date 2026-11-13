import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createUnifiedNativePort} from '../candidates/transport/unified_native_custody.mjs';
import {serviceUnifiedReceiverMR} from '../candidates/transport/unified_receiver_mr_service.mjs';
import {
  createUnifiedCarrierRegistry,UCE_CARRIER_TYPE,UCE_CARRIER_SCHEMA,
  UCE_CARRIER_SLOTS
} from '../candidates/transport/unified_carrier_registry.mjs';
import {
  UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA
} from '../candidates/transport/unified_world_shard_writer.mjs';

const worldId='minecraft:overworld:restore-141',epoch=18;
const ownerId='minecraft:overworld|-952,70,-791';
const anchor={dimensionId:'minecraft:overworld',x:-952,y:70,z:-791};
function fakeContainer(){
  const slots=Array.from({length:UCE_CARRIER_SLOTS},()=>undefined);
  return {size:UCE_CARRIER_SLOTS,isValid:true,
    getItem:i=>{
      if(slots[i]===undefined)return undefined;
      const v=structuredClone(slots[i]);
      v.getLore=()=>[...(v.lore||[])];
      return v;
    },
    moveItem:(i,j,target)=>{
      if(slots[i]===undefined||target.getItem(j)!==undefined)
        throw Error('engine empty-destination-only');
      target.inject(j,slots[i]);
      slots[i]=undefined;
    },
    inject:(i,v)=>{slots[i]=structuredClone(v);}};
}
function fixture(opts={}){
  const records=new Map();
  if(opts.active!==false)records.set(UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',worldId,epoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  }));
  const spawned=[];
  let verified=opts.verified!==false,writes=0,queries=0;
  const dim={
    id:'minecraft:overworld',
    getEntities({type}){
      queries++;
      return spawned.filter(x=>x.typeId===type&&x.loaded!==false);
    },
    spawnEntity(type,pos){
      const c=fakeContainer();
      const entity={
        id:'native-entity-'+(spawned.length+1),typeId:type,
        location:pos,loaded:true,
        getComponent:()=>({
          inventorySize:UCE_CARRIER_SLOTS,canBeSiphonedFrom:false,
          container:c
        })
      };
      spawned.push(entity);
      if(opts.spawnThrows){
        throw Error('entity may have spawned before exception');
      }
      return entity;
    }
  };
  const world={
    getDynamicProperty:key=>records.get(key),
    setDynamicProperty(key,v){
      writes++;
      if(opts.onWrite)return opts.onWrite(key,v,records,writes);
      if(v===undefined)records.delete(key);
      else records.set(key,v);
    },
    getDimension:id=>id===dim.id?dim:undefined
  };
  const make=()=>createUnifiedCarrierRegistry({
    world,worldId,epoch,externalFence:opts.externalFence??(()=>true),
    ownerVerifier:()=>verified
  });
  const mgr=make();
  assert.equal(mgr.ok,true,mgr.reason);
  return {mgr,make,world,records,dim,spawned,
    setVerified:v=>{verified=v;},
    get writes(){return writes;},
    get queries(){return queries}};
}
const failed=(r,reason)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.status,'HOLD');
  assert.equal(r.canSpawn,false);
  if(reason)assert.equal(r.reason,reason);
};
const register=f=>f.mgr.registerEmptyHost({ownerId,anchor});
const inspect=f=>f.mgr.inspectHost({ownerId,anchor});
test('asset defines stable nonexperimental persistent 9-slot native inventory, damage protection and no hopper siphon',()=>{
  const raw=readFileSync(new URL('../candidates/uce/assets/entities/uce_native_carrier.json',import.meta.url),'utf8');
  const def=JSON.parse(raw)['minecraft:entity'];
  assert.equal(def.description.identifier,UCE_CARRIER_TYPE);
  assert.equal(def.description.is_experimental,false);
  assert.equal(def.components['minecraft:inventory'].inventory_size,9);
  assert.equal(def.components['minecraft:inventory'].can_be_siphoned_from,false);
  assert.ok(def.components['minecraft:persistent']);
  assert.equal(def.components['minecraft:damage_sensor'].triggers.deals_damage,'no');
});
test('one empty carrier reserved then spawned, recorded ACTIVE and inspected by exact native entity identity',()=>{
  const f=fixture(),r=register(f);
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'EMPTY_NATIVE_HOST_REGISTERED');
  assert.equal(f.writes,2);
  assert.equal(f.spawned.length,1);
  const v=inspect(f);
  assert.equal(v.ok,true,v.reason);
  assert.equal(v.entityId,f.spawned[0].id);
  assert.equal(v.capacitySlots,9);
  assert.equal(v.occupiedSlots,0);
  assert.equal(v.canDestroy,false);
  assert.equal(v.canSpawn,false);
  assert.equal(JSON.parse([...f.records.values()].find(x=>typeof x==='string'&&x.includes(UCE_CARRIER_SCHEMA))).state,'ACTIVE');
});
test('registration is idempotency-safe: an existing host is never respawned',()=>{
  const f=fixture();assert.equal(register(f).ok,true);
  failed(register(f),'carrier_record_already_reserved_or_active');
  assert.equal(f.spawned.length,1);
});
test('unloaded host returns HOLD, later same entity/item survives mock restart reobservation',()=>{
  const f=fixture();assert.equal(register(f).ok,true);
  const sample={typeId:'minecraft:enchanted_book',amount:1,
    nameTag:'Hart R5 evidence based',lore:['original native item'],
    hidden:{enchants:['mending'],opaqueExtra:true}};
  f.spawned[0].getComponent().container.inject(0,sample);
  f.spawned[0].loaded=false;
  failed(inspect(f),'carrier_missing_or_duplicated');
  const newManager=f.make();
  failed(newManager.inspectHost({ownerId,anchor}),'carrier_missing_or_duplicated');
  assert.equal(f.spawned.length,1);
  f.spawned[0].loaded=true;
  const view=newManager.inspectHost({ownerId,anchor});
  assert.equal(view.ok,true,view.reason);
  assert.equal(view.occupiedSlots,1);
  const actual=view.container.getItem(0);
  assert.equal(typeof actual.getLore,'function');
  delete actual.getLore;
  assert.deepEqual(actual,sample);
  assert.equal(f.spawned.length,1);
});
test('reserved record after ambiguous spawn is HOLD and never automatically spawned again',()=>{
  const f=fixture({spawnThrows:true});
  failed(register(f),'carrier_spawn_outcome_ambiguous');
  assert.equal(f.spawned.length,1);
  const state=[...f.records.values()].map(x=>{
    try{return JSON.parse(x);}catch(_){return null;}
  }).find(x=>x?.schema===UCE_CARRIER_SCHEMA);
  assert.equal(state.state,'RESERVED');
  failed(inspect(f),'carrier_reserved_requires_manual_reconciliation');
  failed(register(f),'carrier_session_quarantined');
  const restarted=f.make();
  failed(restarted.registerEmptyHost({ownerId,anchor}),
    'carrier_record_already_reserved_or_active');
  assert.equal(f.spawned.length,1);
});
test('empty source record with an orphan near anchor refuses duplicate creation',()=>{
  const f=fixture();
  f.dim.spawnEntity(UCE_CARRIER_TYPE,{x:anchor.x+.5,y:anchor.y+.2,z:anchor.z+.5});
  failed(register(f),'orphan_or_duplicate_carrier_near_anchor');
  assert.equal(f.writes,0);
  assert.equal(f.spawned.length,1);
});
test('duplicate visible carriers at the same anchor trigger HOLD, not election',()=>{
  const f=fixture();assert.equal(register(f).ok,true);
  f.dim.spawnEntity(UCE_CARRIER_TYPE,{x:anchor.x+.5,y:anchor.y+.2,z:anchor.z+.5});
  failed(inspect(f),'carrier_missing_or_duplicated');
});
test('changed owner identity or wrong anchor prevents custody',()=>{
  const f=fixture();assert.equal(register(f).ok,true);
  f.setVerified(false);
  failed(inspect(f),'carrier_owner_block_unverified');
  f.setVerified(true);
  failed(f.mgr.inspectHost({ownerId,
    anchor:{...anchor,x:anchor.x+1}}),'carrier_anchor_changed');
});
test('no ACTIVE single-writer authority means no carrier reservation and no spawn',()=>{
  const f=fixture({active:false});
  failed(register(f),'world_ue_authority_missing');
  assert.equal(f.writes,0);
  assert.equal(f.spawned.length,0);
});
test('legacy journal or external writer fence prevents carrier creation',()=>{
  const f=fixture();f.records.set('hartsorter:queue_journal_v1','pending');
  failed(register(f),'legacy_journal_pending');
  const g=fixture({externalFence:()=>false});
  failed(register(g),'legacy_writer_exclusion_unproven');
  assert.equal(g.spawned.length,0);
});
test('reservation write that throws after effect HOLDS before entity spawn',()=>{
  const f=fixture({onWrite:(key,v,records)=>{
    records.set(key,v);
    throw Error('unknown persistence');
  }});
  failed(register(f),'carrier_reservation_write_ambiguous');
  assert.equal(f.spawned.length,0);
  assert.equal(f.mgr.getSessionQuarantine(),true);
});
test('entity ID substitution in persisted record is a HOLD, never a new host',()=>{
  const f=fixture();assert.equal(register(f).ok,true);
  const key=[...f.records.keys()].find(x=>x.includes('uce_native_host_'));
  const r=JSON.parse(f.records.get(key));
  r.entityId='invented-other-entity';
  f.records.set(key,JSON.stringify(r));
  failed(inspect(f),'carrier_entity_id_changed');
});


test('actual UCE native port + carrier ticket store integrates source->host->destination with durable ACK',()=>{
  const f=fixture();
  assert.equal(register(f).ok,true);
  const host=inspect(f);
  assert.equal(host.ok,true);
  const src=fakeContainer(),dest=fakeContainer();
  const rich={typeId:'minecraft:diamond_pickaxe',amount:1,
    nameTag:'Épée brillante 🗡️',lore:['Âme ancienne','Never flatten'],
    hiddenNbt:{enchants:['mending','unbreaking'],opaqueTag:'world-data'}};
  src.inject(0,rich);
  const port=createUnifiedNativePort({
    world:f.world,worldId,epoch,externalFence:()=>true,
    verifyEndpointOwner:p=>p.ownerId!==ownerId ||
      f.mgr.inspectHost({ownerId,anchor}).ok,
    durableOwnershipWitness:f.mgr.durableOwnershipWitness
  });
  assert.equal(port.ok,true,port.reason);
  const input={ownerId:'vanilla-hopper:1',container:src,slot:0};
  const carrierSlot={ownerId,container:host.container,slot:2};
  const r=port.moveWhole({operationId:'native-mr-accept-1',
    from:input,to:carrierSlot});
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'NATIVE_MOVED_PENDING_OWNERSHIP_ACK');
  assert.equal(f.mgr.inspectCustody({ownerId,anchor}).ok,false);
  const stage=f.mgr.stageMovedTicket({ownerId,anchor});
  assert.equal(stage.ok,true,stage.reason);
  assert.equal(stage.action,'ADMITTED');
  const ack=port.ackWhole({operationId:'native-mr-accept-1',
    from:input,to:carrierSlot});
  assert.equal(ack.ok,true,ack.reason);
  assert.equal(ack.status,'NATIVE_CUSTODY_ACK_READBACK');
  let custody=f.mgr.inspectCustody({ownerId,anchor});
  assert.equal(custody.ok,true,custody.reason);
  assert.equal(custody.occupied,1);
  assert.deepEqual(host.container.getItem(2).hiddenNbt,rich.hiddenNbt);
  const output={ownerId:'vanilla-chest:2',container:dest,slot:4};
  const r2=port.moveWhole({operationId:'native-mr-release-2',
    from:carrierSlot,to:output});
  assert.equal(r2.ok,true,r2.reason);
  const stage2=f.mgr.stageMovedTicket({ownerId,anchor});
  assert.equal(stage2.ok,true,stage2.reason);
  assert.equal(stage2.action,'RELEASED');
  assert.equal(port.ackWhole({operationId:'native-mr-release-2',
    from:carrierSlot,to:output}).ok,true);
  custody=f.mgr.inspectCustody({ownerId,anchor});
  assert.equal(custody.ok,true,custody.reason);
  assert.equal(custody.occupied,0);
  assert.deepEqual(dest.getItem(4).hiddenNbt,rich.hiddenNbt);
  assert.equal(src.getItem(0),undefined);
});

test('foreign native modification of a ticketed slot is HOLD, never auto repaired',()=>{
  const f=fixture();assert.equal(register(f).ok,true);
  const host=inspect(f),src=fakeContainer();
  src.inject(0,{typeId:'minecraft:enchanted_book',amount:1,
    nameTag:'original',lore:['owned'],hiddenNbt:{rare:123}});
  const port=createUnifiedNativePort({world:f.world,worldId,epoch,
    externalFence:()=>true,verifyEndpointOwner:()=>true,
    durableOwnershipWitness:f.mgr.durableOwnershipWitness});
  const from={ownerId:'vanilla:1',container:src,slot:0};
  const to={ownerId,container:host.container,slot:0};
  assert.equal(port.moveWhole({operationId:'admit',from,to}).ok,true);
  assert.equal(f.mgr.stageMovedTicket({ownerId,anchor}).ok,true);
  assert.equal(port.ackWhole({operationId:'admit',from,to}).ok,true);
  host.container.inject(0,{typeId:'minecraft:stone',amount:1});
  failed(f.mgr.inspectCustody({ownerId,anchor}),
    'native_ticket_item_witness_mismatch');
});

test('repeated staging of the same moved operation is read-only, not duplicate ticket credit',()=>{
  const f=fixture();assert.equal(register(f).ok,true);
  const host=inspect(f),src=fakeContainer();
  src.inject(0,{typeId:'minecraft:diamond_sword',amount:1,
    nameTag:'Sword',lore:[]});
  const port=createUnifiedNativePort({world:f.world,worldId,epoch,
    externalFence:()=>true,verifyEndpointOwner:()=>true,
    durableOwnershipWitness:f.mgr.durableOwnershipWitness});
  const from={ownerId:'vanilla:1',container:src,slot:0};
  const to={ownerId,container:host.container,slot:0};
  assert.equal(port.moveWhole({operationId:'one-admission',from,to}).ok,true);
  const first=f.mgr.stageMovedTicket({ownerId,anchor});
  assert.equal(first.ok,true,first.reason);
  const before=f.writes;
  const repeat=f.mgr.stageMovedTicket({ownerId,anchor});
  assert.equal(repeat.ok,true,repeat.reason);
  assert.equal(repeat.status,'NATIVE_TICKET_ALREADY_STAGED');
  assert.equal(f.writes,before);
  assert.equal(port.ackWhole({operationId:'one-admission',from,to}).ok,true);
  assert.equal(f.mgr.inspectCustody({ownerId,anchor}).occupied,1);
});


test('playable service: Collector native MR ingress while Receiver powered, then unpowered output',()=>{
  const f=fixture();assert.equal(register(f).ok,true);
  const src=fakeContainer(),dst=fakeContainer();
  const original={typeId:'minecraft:diamond_pickaxe',amount:1,
    nameTag:'Protected Mr',lore:['Never flatten'],
    hiddenNbt:{enchantments:['mending'],source:'player-original'}};
  src.inject(0,original);
  src.inject(1,{typeId:'minecraft:cobblestone',amount:64});
  const port=createUnifiedNativePort({world:f.world,worldId,epoch,
    externalFence:()=>true,verifyEndpointOwner:()=>true,
    durableOwnershipWitness:f.mgr.durableOwnershipWitness});
  const common={registry:f.mgr,port,ownerId,anchor,
    identify:stack=>stack.maxAmount===64?'ORDINARY':
      stack.typeId==='minecraft:cobblestone'?'ORDINARY':'MR'};
  const ingress=serviceUnifiedReceiverMR({...common,
    direction:'ingress',operationId:'s-1',receiverPowered:true,
    inputSources:[{container:src,ownerId:'collector-hopper:1',
      locked:false,blockVerified:true}]});
  assert.equal(ingress.ok,true,ingress.reason);
  assert.equal(ingress.moved,1);
  assert.equal(f.mgr.inspectCustody({ownerId,anchor}).occupied,1);
  assert.equal(src.getItem(0),undefined);
  assert.equal(src.getItem(1).amount,64);
  const paused=serviceUnifiedReceiverMR({...common,direction:'egress',
    operationId:'s-2',receiverPowered:true,
    output:{container:dst,ownerId:'destination-hopper:1',blockVerified:true}});
  assert.equal(paused.status,'IDLE');
  assert.equal(paused.reason,'receiver_output_redstone_paused');
  assert.equal(f.mgr.inspectCustody({ownerId,anchor}).occupied,1);
  const release=serviceUnifiedReceiverMR({...common,direction:'egress',
    operationId:'s-2',receiverPowered:false,
    output:{container:dst,ownerId:'destination-hopper:1',blockVerified:true}});
  assert.equal(release.ok,true,release.reason);
  assert.equal(release.status,'MR_NATIVE_CUSTODY_TRANSFER_COMPLETE');
  assert.deepEqual(dst.getItem(0).hiddenNbt,original.hiddenNbt);
  assert.equal(f.mgr.inspectCustody({ownerId,anchor}).occupied,0);
});

test('service refuses uncertified MR shape and honors blocked Collector/redstone',()=>{
  const f=fixture();assert.equal(register(f).ok,true);
  const src=fakeContainer();
  src.inject(0,{typeId:'minecraft:potion',amount:1,nameTag:'Custom potion'});
  const port=createUnifiedNativePort({world:f.world,worldId,epoch,
    externalFence:()=>true,verifyEndpointOwner:()=>true,
    durableOwnershipWitness:f.mgr.durableOwnershipWitness});
  const common={registry:f.mgr,port,ownerId,anchor,
    direction:'ingress',operationId:'s-hold',
    inputSources:[{container:src,ownerId:'input-source',
      blockVerified:true,locked:false}]};
  const powered=serviceUnifiedReceiverMR({...common,
    collectorPowered:true,identify:()=> 'MR'});
  assert.equal(powered.status,'IDLE');
  const unknown=serviceUnifiedReceiverMR({...common,
    identify:()=> 'UNKNOWN'});
  assert.equal(unknown.status,'HOLD');
  assert.equal(unknown.reason,'uncertified_item_class');
  assert.equal(f.writes,2); // Only initial carrier reservation/activation.
  assert.equal(src.getItem(0).typeId,'minecraft:potion');
});

test('PG39 RESERVED owner has read-only per-host physical and journal evidence',()=>{
  const f=fixture({spawnThrows:true});
  failed(register(f),'carrier_spawn_outcome_ambiguous');
  const writes=f.writes;
  const r=f.mgr.inspectHostEvidence({ownerId,anchor});
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.status,'HOST_EVIDENCE_READ_ONLY');
  assert.equal(r.ownerId,ownerId);
  assert.equal(r.recordState,'RESERVED');
  assert.equal(r.custodyState,'HOLD:RESERVED');
  assert.equal(r.liveEntityCount,1);
  assert.equal(r.entities[0].occupied,0);
  assert.equal(r.ticketSlotCount,0);
  assert.equal(r.nativeIntentPhase,'CLEAR');
  assert.equal(r.canRepair,false);
  assert.equal(r.canSpawn,false);
  assert.equal(f.writes,writes);
  assert.equal(f.spawned.length,1);
});
test('host census distinguishes idle missing record from an ACTIVE native host',()=>{
  const f=fixture();
  const before=f.mgr.inspectHostEvidence({ownerId,anchor});
  assert.equal(before.ok,true);
  assert.equal(before.recordState,'MISSING');
  assert.equal(before.custodyState,'UNINITIALIZED');
  assert.equal(register(f).ok,true);
  const ready=f.mgr.inspectHostEvidence({ownerId,anchor});
  assert.equal(ready.recordState,'ACTIVE');
  assert.equal(ready.custodyState,'VERIFIED');
  assert.equal(ready.liveEntityCount,1);
});

test('corrupt host and ticket records never hide independently observed physical carrier',()=>{
  const f=fixture();
  assert.equal(register(f).ok,true);
  const key=[...f.records.keys()].find(k=>k.includes('uce_native_host_'));
  assert.ok(key);
  f.records.set(key,'{invalid');
  f.records.set(key.replace('uce_native_host_','uce_native_ticket_'),'{invalid');
  const oldWrites=f.writes;
  const audit=f.mgr.inspectHostEvidence({ownerId,anchor});
  assert.equal(audit.ok,true,audit.reason);
  assert.equal(audit.recordState,'INVALID');
  assert.match(audit.recordStatus,/^HOLD:carrier_record_invalid$/);
  assert.equal(audit.liveEntityCount,1);
  assert.equal(audit.entities[0].id,f.spawned[0].id);
  assert.equal(audit.ticketSlotCount,null);
  assert.match(audit.ticketStatus,/^HOLD:native_ticket_invalid_json$/);
  assert.equal(audit.custodyState,audit.recordStatus);
  assert.equal(f.writes,oldWrites);
  assert.equal(f.spawned.length,1);
});

test('a sealed but no-longer-live Receiver must not report healthy uninitialized host',()=>{
  const f=fixture();
  f.setVerified(false);
  const writes=f.writes;
  const r=f.mgr.inspectHostEvidence({ownerId,anchor});
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.recordState,'MISSING');
  assert.equal(r.ownerVerified,false);
  assert.equal(r.custodyState,'HOLD:carrier_owner_block_unverified');
  assert.equal(r.canRepair,false);
  assert.equal(f.writes,writes);
  assert.equal(f.spawned.length,0);
});
