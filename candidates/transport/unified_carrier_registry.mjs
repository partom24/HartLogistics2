/**
 * UCE persistent native-carrier host registry.
 *
 * R5 historical evidence established that a 9-slot entity inventory can hold
 * a named ItemStack and retain the same entity ID after a graceful restart.
 * This module makes actual Collector/Receiver ownership explicit; it does
 * NOT turn that historical R5 result into a new HL2 BDS acceptance.
 *
 * There is NO automatic respawn. A reservation, missing/unloaded carrier,
 * duplicate host, changed endpoint or unexpected contents remains HOLD.
 * The host manager never serializes/rebuilds ItemStacks or runs a transfer.
 */
import {verifyUnifiedMutationFence} from './unified_world_shard_writer.mjs';

export const UCE_CARRIER_TYPE='hartlogistics:uce_native_carrier';
export const UCE_CARRIER_SCHEMA='hart-uce-native-host-v1';
export const UCE_CARRIER_SLOTS=9;
const ASCII=/^[\x20-\x7e]+$/;
const id=s=>typeof s==='string'&&s.length>0&&s.length<=256&&ASCII.test(s);
const integer=n=>Number.isSafeInteger(n);
const hold=reason=>({ok:false,status:'HOLD',reason,
  canSpawn:false,canTransfer:false,canReplace:false,canDestroy:false});
function hostKey(ownerId){
  if(!id(ownerId))return null;
  let h=2166136261;
  for(let i=0;i<ownerId.length;i++)h=Math.imul(h^ownerId.charCodeAt(i),16777619);
  return 'hartlogistics:uce_native_host_'+(h>>>0).toString(16).padStart(8,'0')+'_v1';
}
function anchorOK(anchor){
  return !!anchor&&id(anchor.dimensionId)&&
    integer(anchor.x)&&integer(anchor.y)&&integer(anchor.z);
}
function anchorEquals(a,b){
  return !!a&&!!b&&a.dimensionId===b.dimensionId&&
    a.x===b.x&&a.y===b.y&&a.z===b.z;
}
function origin(anchor){
  return {x:anchor.x+0.5,y:anchor.y+0.2,z:anchor.z+0.5};
}
function read(world,key){
  try{return {ok:true,raw:world.getDynamicProperty(key)};}
  catch(_){return hold('carrier_record_read_failed');}
}
function decode(raw,ownerId,worldId,epoch){
  if(typeof raw!=='string'||raw.length>4096)return hold('carrier_record_missing');
  let rec;
  try{rec=JSON.parse(raw);}catch(_){return hold('carrier_record_invalid');}
  if(!rec||rec.schema!==UCE_CARRIER_SCHEMA||
     !id(rec.ownerId)||rec.ownerId!==ownerId||
     rec.worldId!==worldId||rec.epoch!==epoch||
     !anchorOK(rec.anchor)||
     !['RESERVED','ACTIVE'].includes(rec.state)||
     (rec.state==='ACTIVE'&&!id(rec.entityId)))
    return hold('carrier_record_mismatch_or_collision');
  return {ok:true,record:rec};
}
function inventory(entity){
  try{
    const component=entity.getComponent('minecraft:inventory');
    if(!component||component.inventorySize!==UCE_CARRIER_SLOTS||
       component.canBeSiphonedFrom!==false)
      return hold('carrier_inventory_contract_invalid');
    const c=component.container;
    if(!c||c.size!==UCE_CARRIER_SLOTS||
       typeof c.getItem!=='function')return hold('carrier_slots_unavailable');
    if(typeof c.isValid==='function' && !c.isValid())
      return hold('carrier_inventory_invalid');
    if(c.isValid===false)return hold('carrier_inventory_invalid');
    return {ok:true,container:c};
  }catch(_){return hold('carrier_inventory_unreadable');}
}
function dimension(world,anchor){
  try{return world.getDimension(anchor.dimensionId);}
  catch(_){return null;}
}
function near(dim,anchor){
  try{
    const entities=dim.getEntities({type:UCE_CARRIER_TYPE,
      location:origin(anchor),maxDistance:0.75});
    return Array.isArray(entities)?entities:null;
  }catch(_){return null;}
}
/**
 * Explicit per-registered-block host lifecycle manager, not a scheduler.
 * ownerVerifier must check the actual loaded hartsorter Collector/Receiver
 * block, registered ID and anchor before authorizing host creation/use.
 */
export function createUnifiedCarrierRegistry({world,worldId,epoch,
    externalFence,ownerVerifier}={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     typeof world.setDynamicProperty!=='function'||
     typeof world.getDimension!=='function'||
     !id(worldId)||!integer(epoch)||epoch<=0||
     typeof externalFence!=='function'||
     typeof ownerVerifier!=='function')
    return hold('invalid_carrier_registry_binding');
  const fence=()=>verifyUnifiedMutationFence(world,worldId,epoch,externalFence);
  let quarantined=false;
  function inspectHost({ownerId,anchor}={}){
    const key=hostKey(ownerId);
    if(!key||!anchorOK(anchor))return hold('invalid_carrier_owner_or_anchor');
    const r=read(world,key);
    if(!r.ok)return r;
    const d=decode(r.raw,ownerId,worldId,epoch);
    if(!d.ok)return d;
    if(!anchorEquals(d.record.anchor,anchor))
      return hold('carrier_anchor_changed');
    if(d.record.state!=='ACTIVE')
      return hold('carrier_reserved_requires_manual_reconciliation');
    let valid=false;
    try{valid=ownerVerifier(ownerId,anchor)===true;}catch(_){}
    if(!valid)return hold('carrier_owner_block_unverified');
    const dim=dimension(world,anchor);
    if(!dim)return hold('carrier_dimension_unloaded');
    const entities=near(dim,anchor);
    if(!entities)return hold('carrier_entity_query_failed');
    if(entities.length!==1)return hold('carrier_missing_or_duplicated');
    const e=entities[0];
    if(e.id!==d.record.entityId)return hold('carrier_entity_id_changed');
    const inv=inventory(e);
    if(!inv.ok)return inv;
    let count=0;
    try{
      for(let i=0;i<inv.container.size;i++)
        if(inv.container.getItem(i)!==undefined)count++;
    }catch(_){return hold('carrier_slot_census_failed');}
    return {ok:true,status:'PERSISTENT_NATIVE_HOST_VERIFIED',
      entityId:e.id,ownerId,anchor,
      container:inv.container,occupiedSlots:count,
      capacitySlots:UCE_CARRIER_SLOTS,
      canSpawn:false,canReplace:false,canDestroy:false};
  }
  /**
   * Create one NEW, EMPTY carrier only for a valid owner with no host record.
   * Persist a reservation BEFORE spawning; any later error requires an audit
   * and must never silently spawn a second entity. No automatic startup call.
   */
  function registerEmptyHost({ownerId,anchor}={}){
    if(quarantined)return hold('carrier_session_quarantined');
    const gate=fence();
    if(!gate.ok)return hold(gate.reason);
    const key=hostKey(ownerId);
    if(!key||!anchorOK(anchor))return hold('invalid_carrier_owner_or_anchor');
    let verified=false;
    try{verified=ownerVerifier(ownerId,anchor)===true;}catch(_){}
    if(!verified)return hold('carrier_owner_block_unverified');
    const existing=read(world,key);
    if(!existing.ok)return existing;
    if(existing.raw!==undefined&&existing.raw!==null&&existing.raw!=='')
      return hold('carrier_record_already_reserved_or_active');
    const dim=dimension(world,anchor);
    if(!dim)return hold('carrier_dimension_unloaded');
    const entities=near(dim,anchor);
    if(!entities)return hold('carrier_entity_query_failed');
    if(entities.length!==0)return hold('orphan_or_duplicate_carrier_near_anchor');
    const record={schema:UCE_CARRIER_SCHEMA,
      state:'RESERVED',worldId,epoch,ownerId,anchor};
    const reserved=JSON.stringify(record);
    if(reserved.length>4096||!ASCII.test(reserved))
      return hold('carrier_reservation_too_large');
    const second=fence();
    let nowValid=false;
    try{nowValid=ownerVerifier(ownerId,anchor)===true;}catch(_){}
    if(!second.ok||!nowValid)
      return hold('carrier_owner_or_fence_changed_prewrite');
    const again=read(world,key);
    if(!again.ok)return again;
    if(again.raw!==undefined&&again.raw!==null&&again.raw!=='')
      return hold('carrier_record_changed_prewrite');
    try{world.setDynamicProperty(key,reserved);}
    catch(_){
      quarantined=true;
      return hold('carrier_reservation_write_ambiguous');
    }
    const saved=read(world,key);
    if(!saved.ok||saved.raw!==reserved){
      quarantined=true;
      return hold('carrier_reservation_readback_failed');
    }
    // The physical entity spawn itself is not atomically durable with the
    // world property. RESERVED intentionally survives any interrupted spawn.
    let e;
    try{e=dim.spawnEntity(UCE_CARRIER_TYPE,origin(anchor));}
    catch(_){
      quarantined=true;
      return hold('carrier_spawn_outcome_ambiguous');
    }
    const observed=near(dim,anchor);
    if(!observed||observed.length!==1||observed[0].id!==e.id){
      quarantined=true;
      return hold('carrier_spawn_identity_ambiguous');
    }
    const inv=inventory(e);
    if(!inv.ok){
      quarantined=true;
      return inv;
    }
    try{
      for(let i=0;i<inv.container.size;i++)
        if(inv.container.getItem(i)!==undefined){
          quarantined=true;
          return hold('new_carrier_unexpected_contents');
        }
    }catch(_){
      quarantined=true;
      return hold('new_carrier_slot_read_failed');
    }
    const active=JSON.stringify({...record,state:'ACTIVE',entityId:e.id});
    if(active.length>4096||!ASCII.test(active)){
      quarantined=true;
      return hold('active_carrier_record_oversized');
    }
    try{world.setDynamicProperty(key,active);}
    catch(_){
      quarantined=true;
      return hold('active_carrier_record_write_ambiguous');
    }
    const done=read(world,key);
    if(!done.ok||done.raw!==active){
      quarantined=true;
      return hold('active_carrier_record_readback_failed');
    }
    return {ok:true,status:'EMPTY_NATIVE_HOST_REGISTERED',
      entityId:e.id,ownerId,capacitySlots:UCE_CARRIER_SLOTS,
      hasHardCrashAtomicityProof:false,canReplace:false,canDestroy:false};
  }

  /**
   * Native custody tickets are part of THIS host's ownership record, not an
   * alternative store for ItemStacks. They list the slot in which the original
   * native ItemStack physically resides and a partial read-only witness.
   * Each native transfer must have one MOVED_INSPECTED global journal intent.
   */
  const ticketSchema='hart-uce-native-host-tickets-v1';
  const journalKey='hartlogistics:uce_native_intent_v1';
  function ticketKey(owner){
    const hk=hostKey(owner);
    return hk ? hk.replace('uce_native_host_','uce_native_ticket_') : null;
  }
  function visibleWitness(stack){
    if(!stack||!id(stack.typeId)||!Number.isSafeInteger(stack.amount)||
       stack.amount<1)return null;
    let lore=[];
    try{if(typeof stack.getLore==='function')lore=stack.getLore();}
    catch(_){return null;}
    if(!Array.isArray(lore)||lore.some(v=>typeof v!=='string'))return null;
    return {typeId:stack.typeId,amount:stack.amount,
      nameTag:typeof stack.nameTag==='string'?stack.nameTag:'',
      lore};
  }
  function readTickets(owner){
    const key=ticketKey(owner);
    if(!key)return hold('invalid_ticket_owner');
    const r=read(world,key);
    if(!r.ok)return r;
    if(r.raw===undefined||r.raw===null||r.raw==='')return {
      ok:true,empty:true,
      record:{schema:ticketSchema,worldId,epoch,ownerId:owner,
        revision:0,slots:[],lastReceipt:null}};
    if(typeof r.raw!=='string'||r.raw.length>12000)
      return hold('native_ticket_invalid_size');
    let rec;
    try{rec=JSON.parse(r.raw);}catch(_){return hold('native_ticket_invalid_json');}
    if(!rec||rec.schema!==ticketSchema||rec.worldId!==worldId||
       rec.epoch!==epoch||rec.ownerId!==owner||
       !Number.isSafeInteger(rec.revision)||rec.revision<0||
       !Array.isArray(rec.slots)||rec.slots.length>UCE_CARRIER_SLOTS)
      return hold('native_ticket_invalid_record');
    const seen=new Set();
    for(const ticket of rec.slots){
      if(!ticket||!Number.isSafeInteger(ticket.slot)||
         ticket.slot<0||ticket.slot>=UCE_CARRIER_SLOTS||
         seen.has(ticket.slot)||!id(ticket.operationId)||
         !visibleWitness(ticket.witness))
        return hold('native_ticket_invalid_slot');
      seen.add(ticket.slot);
    }
    if(rec.slots.some((t,i)=>i>0&&rec.slots[i-1].slot>=t.slot))
      return hold('native_ticket_noncanonical_order');
    if(rec.lastReceipt!==null && (!rec.lastReceipt||
       !id(rec.lastReceipt.operationId) ||
       !['ADMITTED','RELEASED'].includes(rec.lastReceipt.action)||
       !Number.isSafeInteger(rec.lastReceipt.revision)||
       rec.lastReceipt.revision!==rec.revision))
      return hold('native_ticket_invalid_last_receipt');
    return {ok:true,record:rec,empty:false};
  }
  function currentJournal(){
    const r=read(world,journalKey);
    if(!r.ok)return r;
    if(typeof r.raw!=='string')return hold('native_move_journal_missing');
    let j;
    try{j=JSON.parse(r.raw);}catch(_){return hold('native_move_journal_invalid');}
    if(!j||j.phase!=='MOVED_INSPECTED'||!id(j.operationId)||
       j.worldId!==worldId||j.epoch!==epoch||!j.from||!j.to||
       !visibleWitness(j.witness))
      return hold('native_move_journal_not_settleable');
    return {ok:true,record:j};
  }
  /**
   * A host is READY only if every physically occupied slot has exactly one
   * persisted claim and every claim has an observable matching native stack.
   * Identical read-only witnesses are NOT complete hidden-NBT comparisons.
   */
  function inspectCustody({ownerId,anchor}={}){
    const host=inspectHost({ownerId,anchor});
    if(!host.ok)return host;
    const tickets=readTickets(ownerId);
    if(!tickets.ok)return tickets;
    let physical=0;
    try{
      for(let slot=0;slot<host.container.size;slot++){
        const item=host.container.getItem(slot);
        const claim=tickets.record.slots.find(t=>t.slot===slot);
        if(item!==undefined)physical++;
        if((item===undefined)!==(claim===undefined))
          return hold('native_ticket_physical_slot_mismatch');
        if(item!==undefined &&
           JSON.stringify(visibleWitness(item))!==
             JSON.stringify(claim.witness))
          return hold('native_ticket_item_witness_mismatch');
      }
    }catch(_){return hold('native_ticket_slot_read_failed');}
    if(physical!==tickets.record.slots.length)
      return hold('native_ticket_count_mismatch');
    return {ok:true,status:'NATIVE_CUSTODY_CLAIMS_RECONCILED',
      ownerId,entityId:host.entityId,ticketRevision:tickets.record.revision,
      occupied:physical,free:UCE_CARRIER_SLOTS-physical,
      slots:tickets.record.slots.map(x=>x.slot),
      canTransfer:true,canSpawn:false,canDestroy:false};
  }
  /**
   * Stage native ownership AFTER native port MOVED_INSPECTED and BEFORE
   * native ACK; one ticket property write is bounded to nine original items.
   * ADMITTED adds a carrier claim, RELEASED removes one.
   *
   * Uncertain writes HOLD; successful retry of the identical operation is
   * read-only and does not duplicate/remove a second claim.
   */
  function stageMovedTicket({ownerId,anchor}={}){
    if(quarantined)return hold('carrier_session_quarantined');
    const gate=fence();
    if(!gate.ok)return hold(gate.reason);
    const host=inspectHost({ownerId,anchor});
    if(!host.ok)return host;
    const journal=currentJournal();
    if(!journal.ok)return journal;
    const j=journal.record;
    const admitting=j.to.ownerId===ownerId;
    const releasing=j.from.ownerId===ownerId;
    if(admitting===releasing)return hold('native_move_not_exclusive_to_host');
    const slot=admitting?j.to.slot:j.from.slot;
    if(!Number.isSafeInteger(slot)||slot<0||slot>=UCE_CARRIER_SLOTS)
      return hold('native_ticket_slot_out_of_range');
    const tickets=readTickets(ownerId);
    if(!tickets.ok)return tickets;
    const previous=tickets.record;
    if(previous.lastReceipt?.operationId===j.operationId){
      const r=previous.lastReceipt;
      if(r.action!==(admitting?'ADMITTED':'RELEASED')||
         r.slot!==slot)return hold('native_ticket_receipt_conflict');
      return {ok:true,status:'NATIVE_TICKET_ALREADY_STAGED',
        operationId:j.operationId,
        canClearJournal:false,canSpawn:false,canDestroy:false};
    }
    const old=previous.slots.find(x=>x.slot===slot);
    if(admitting&&old)return hold('native_ticket_destination_claimed');
    if(releasing&&!old)return hold('native_ticket_source_unclaimed');
    if(releasing&&JSON.stringify(old.witness)!==
       JSON.stringify(j.witness))
      return hold('native_ticket_outbound_witness_conflict');
    const nextSlots=admitting?
      [...previous.slots,{slot,operationId:j.operationId,
        witness:j.witness}]:
      previous.slots.filter(x=>x.slot!==slot);
    nextSlots.sort((a,b)=>a.slot-b.slot);
    const expected=new Map(nextSlots.map(x=>[x.slot,x.witness]));
    try{
      for(let i=0;i<host.container.size;i++){
        const actual=visibleWitness(host.container.getItem(i));
        const want=expected.get(i);
        if((actual===null)!==(want===undefined) ||
          (actual!==null&&JSON.stringify(actual)!==
            JSON.stringify(want)))
          return hold('native_ticket_postmove_physical_mismatch');
      }
    }catch(_){return hold('native_ticket_physical_unreadable');}
    const updated={...previous,revision:previous.revision+1,
      slots:nextSlots,lastReceipt:{operationId:j.operationId,
        action:admitting?'ADMITTED':'RELEASED',slot,
        revision:previous.revision+1}};
    if(!Number.isSafeInteger(updated.revision))
      return hold('native_ticket_revision_overflow');
    const raw=JSON.stringify(updated);
    if(raw.length>12000||!ASCII.test(raw))
      return hold('native_ticket_capacity_exceeded');
    const key=ticketKey(ownerId);
    const r=read(world,key);
    if(!r.ok)return r;
    if((r.raw===undefined||r.raw===null||r.raw==='')!==tickets.empty)
      return hold('native_ticket_changed_prewrite');
    if(!tickets.empty&&JSON.stringify(previous)!==r.raw)
      return hold('native_ticket_changed_prewrite');
    if(!fence().ok)return hold('native_ticket_fence_changed_prewrite');
    try{world.setDynamicProperty(key,raw);}
    catch(_){
      quarantined=true;
      return hold('native_ticket_write_outcome_ambiguous');
    }
    const observed=read(world,key);
    if(!observed.ok||observed.raw!==raw){
      quarantined=true;
      return hold('native_ticket_write_readback_failed');
    }
    return {ok:true,status:'NATIVE_TICKET_STAGED_FOR_ACK',
      operationId:j.operationId,action:updated.lastReceipt.action,
      ticketRevision:updated.revision,
      canClearJournal:false,canSpawn:false,canDestroy:false};
  }
  /** Bind this function as the unified native port's ACK proof callback. */
  function durableOwnershipWitness(intent){
    if(!intent||!id(intent.operationId)||!intent.from||!intent.to)
      return false;
    const hostOwner=intent.to.ownerId;
    const outboundOwner=intent.from.ownerId;
    // The caller must prove which endpoint is an actual owner host. We do
    // not infer a carrier merely from a forged owner ID string.
    for(const owner of [hostOwner,outboundOwner]){
      const t=readTickets(owner);
      if(!t.ok||t.empty)continue;
      if(t.record.lastReceipt?.operationId!==intent.operationId)continue;
      const action=owner===hostOwner?'ADMITTED':'RELEASED';
      if(t.record.lastReceipt.action===action&&
         t.record.lastReceipt.slot===(action==='ADMITTED'?
           intent.to.slot:intent.from.slot))
        return true;
    }
    return false;
  }

  return {ok:true,inspectHost,registerEmptyHost,inspectCustody,
    stageMovedTicket,durableOwnershipWitness,
    getSessionQuarantine:()=>quarantined};
}
