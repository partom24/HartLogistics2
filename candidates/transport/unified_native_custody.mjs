/**
 * Unified Custody Engine — native physical port.
 *
 * Whole ItemStacks remain real native objects. The port never serializes or
 * rebuilds an opaque payload and NEVER debits the ordinary account ledger.
 * All movement is synchronous, guarded by the SAME UCE mutation fence.
 *
 * A PREPARED journal is written before exactly one Container.moveItem call.
 * A successful post-move witness advances to MOVED_INSPECTED, still held.
 * The unified owner must persist its destination custody claim before ACK.
 * No automatic replay or journal clearing on restart/exception.
 *
 * Crash atomicity of inventory + world properties is not promised by Bedrock.
 * Interrupted/foreign-writer/alias outcomes remain HOLD for reconciliation.
 */
import {verifyUnifiedMutationFence} from './unified_world_shard_writer.mjs';

export const UCE_NATIVE_INTENT_KEY='hartlogistics:uce_native_intent_v1';
export const UCE_NATIVE_INTENT_SCHEMA='hart-uce-native-intent-v1';
const ASCII=/^[\x20-\x7e]+$/;
const pos=n=>Number.isSafeInteger(n)&&n>0;
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const name=s=>typeof s==='string'&&s.length>0&&s.length<=256&&ASCII.test(s);
const deny=reason=>({ok:false,status:'HOLD',reason,
  canReplay:false,canClearJournal:false,canMoveMore:false});
const phases=new Set(['PREPARED','MOVED_INSPECTED','CONSUMED_INSPECTED',
  'MATERIALIZED_INSPECTED']);
function containerOK(c){
  if(!c||!nat(c.size)||c.size<1||
     typeof c.getItem!=='function'||typeof c.moveItem!=='function')return false;
  try{
    if(typeof c.isValid==='function')return c.isValid()===true;
    return c.isValid!==false;
  }catch(_){return false;}
}
function witness(stack){
  if(!stack||typeof stack.typeId!=='string'||!pos(stack.amount))
    return null;
  let lore=[];
  try{
    if(typeof stack.getLore==='function')lore=stack.getLore();
  }catch(_){return null;}
  if(!Array.isArray(lore)||lore.some(x=>typeof x!=='string'))return null;
  // This is a READ-ONLY SURFACE witness, NOT a serialized ItemStack or
  // byte-for-byte NBT identity. Native custody remains the original object.
  return {typeId:stack.typeId,amount:stack.amount,
    nameTag:typeof stack.nameTag==='string'?stack.nameTag:'',
    lore};
}
function readJournal(world){
  let raw;
  try{raw=world.getDynamicProperty(UCE_NATIVE_INTENT_KEY);}
  catch(_){return deny('native_intent_unreadable');}
  if(raw===undefined||raw===null||raw==='')return {ok:true,empty:true};
  if(typeof raw!=='string'||raw.length>12000)
    return deny('native_intent_invalid');
  let j;
  try{j=JSON.parse(raw);}catch(_){return deny('native_intent_invalid');}
  if(!j||j.schema!==UCE_NATIVE_INTENT_SCHEMA||
     !phases.has(j.phase)||!name(j.operationId)||
     !name(j.worldId)||!pos(j.epoch)||!j.from||!j.to||
     !name(j.from.ownerId)||!name(j.to.ownerId)||
     !nat(j.from.slot)||!nat(j.to.slot)||!j.witness||
     !name(j.witness.typeId)||!pos(j.witness.amount))
    return deny('native_intent_invalid');
  return {ok:true,empty:false,record:j,raw};
}
function verifyEndpoint(value){
  if(!value||!name(value.ownerId)||!containerOK(value.container)||
     !nat(value.slot)||value.slot>=value.container.size)
    return false;
  return true;
}
/**
 * Synchronous single-movement adapter. All native endpoint identity/owner
 * lookup must be provided by the integrated planner (not merely an asserted
 * coordinate). verifyEndpointOwner must independently check a live host/source
 * record and must be re-run just before the move.
 */
export function createUnifiedNativePort({world,worldId,epoch,externalFence,
    verifyEndpointOwner,durableOwnershipWitness,
    certifyOrdinaryEscrow,verifyLedgerBoundaryReceipt,
    makeCertifiedOrdinaryItem,verifyLedgerWithdrawalReservation,
    boundaryOperationId=null}={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     typeof world.setDynamicProperty!=='function'||
     !name(worldId)||!pos(epoch)||
     typeof externalFence!=='function'||
     typeof verifyEndpointOwner!=='function'||
     typeof durableOwnershipWitness!=='function')
    return deny('invalid_native_port_binding');
  let quarantined=false;
  const fence=(operationId=null)=>verifyUnifiedMutationFence(
    world,worldId,epoch,externalFence,
    {allowedNativeOperationId:operationId,
     allowedBoundaryOperationId:boundaryOperationId});
  function inspectPending(){
    const j=readJournal(world);
    if(!j.ok)return j;
    if(j.empty)return {ok:true,status:'NATIVE_JOURNAL_CLEAR',
      canReplay:false,canClearJournal:false};
    return {ok:true,status:'NATIVE_MOVE_REQUIRES_RECONCILIATION',
      operationId:j.record.operationId,phase:j.record.phase,
      canReplay:false,canClearJournal:false,canMoveMore:false};
  }
  function moveWhole({operationId,from,to}={}){
    if(quarantined)return deny('native_session_quarantined');
    const gate=fence();
    if(!gate.ok)return deny(gate.reason);
    const pending=readJournal(world);
    if(!pending.ok)return pending;
    if(!pending.empty)return deny('native_intent_already_pending');
    if(!name(operationId)||!verifyEndpoint(from)||!verifyEndpoint(to)||
       from.container===to.container||from.ownerId===to.ownerId)
      return deny('invalid_native_move_endpoints');
    let admitted=false;
    try{admitted=verifyEndpointOwner(from)===true&&
      verifyEndpointOwner(to)===true;}catch(_){}
    if(!admitted)return deny('native_endpoint_ownership_unverified');
    let source,dest;
    try{
      source=from.container.getItem(from.slot);
      dest=to.container.getItem(to.slot);
    }catch(_){return deny('native_endpoint_read_failed');}
    const before=witness(source);
    if(!before||dest!==undefined)return deny('native_source_missing_or_target_occupied');
    const intent={schema:UCE_NATIVE_INTENT_SCHEMA,phase:'PREPARED',
      operationId,worldId,epoch,
      from:{ownerId:from.ownerId,slot:from.slot},
      to:{ownerId:to.ownerId,slot:to.slot},witness:before};
    let raw=JSON.stringify(intent);
    if(raw.length>12000)return deny('native_intent_oversized');
    // A changed caller proof or queued legacy/native journal prevents the
    // first physical write. All operations remain in this synchronous turn.
    const second=fence();
    let verified=false;
    try{verified=verifyEndpointOwner(from)===true&&
      verifyEndpointOwner(to)===true;}catch(_){}
    if(!second.ok||!verified)return deny('native_prewrite_fence_changed');
    try{
      if(JSON.stringify(witness(from.container.getItem(from.slot)))!==
           JSON.stringify(before) ||
         to.container.getItem(to.slot)!==undefined)
        return deny('native_slots_changed_prewrite');
    }catch(_){return deny('native_prewrite_slot_read_failed');}
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,raw);}
    catch(_){
      quarantined=true;
      return deny('native_prepare_write_ambiguous');
    }
    const posted=readJournal(world);
    if(!posted.ok||posted.empty||posted.raw!==raw){
      quarantined=true;
      return deny('native_prepare_readback_failed');
    }
    // Script API 2.7.0: moveItem(sourceSlot, destinationSlot,
    // destinationContainer). Empty-slot only; no inferred native merge.
    try{from.container.moveItem(from.slot,to.slot,to.container);}
    catch(_){
      quarantined=true;
      return deny('native_move_outcome_ambiguous');
    }
    let afterSrc,afterDst;
    try{
      afterSrc=from.container.getItem(from.slot);
      afterDst=to.container.getItem(to.slot);
    }catch(_){
      quarantined=true;
      return deny('native_postmove_read_failed');
    }
    if(afterSrc!==undefined ||
       JSON.stringify(witness(afterDst))!==JSON.stringify(before)){
      quarantined=true;
      return deny('native_postmove_witness_mismatch');
    }
    intent.phase='MOVED_INSPECTED';
    raw=JSON.stringify(intent);
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,raw);}
    catch(_){
      quarantined=true;
      return deny('native_moved_marker_write_ambiguous');
    }
    const settled=readJournal(world);
    if(!settled.ok||settled.empty||settled.raw!==raw){
      quarantined=true;
      return deny('native_moved_marker_readback_failed');
    }
    // Still pending: the unified owner must record the new physical ticket
    // before calling ACK. No new move is permitted with a pending journal.
    return {ok:true,status:'NATIVE_MOVED_PENDING_OWNERSHIP_ACK',
      operationId,sourceNowEmpty:true,
      destinationWitness:before,canReplay:false,
      canClearJournal:false,canMoveMore:false};
  }
  /**
   * ACK never recreates an item. The integrated owner must prove a separately
   * persisted receipt/ticket authorizing the destination; after restart the
   * physical endpoints must be rediscovered and passed back by identity.
   */
  function ackWhole({operationId,from,to}={}){
    if(quarantined)return deny('native_session_quarantined');
    const gate=fence(operationId);
    if(!gate.ok)return deny(gate.reason);
    const j=readJournal(world);
    if(!j.ok)return j;
    if(j.empty||j.record.phase!=='MOVED_INSPECTED'||
       j.record.operationId!==operationId||j.record.worldId!==worldId||
       j.record.epoch!==epoch)
      return deny('native_ack_without_matching_moved_intent');
    if(!verifyEndpoint(from)||!verifyEndpoint(to)||
       from.ownerId!==j.record.from.ownerId||
       to.ownerId!==j.record.to.ownerId||
       from.slot!==j.record.from.slot||to.slot!==j.record.to.slot)
      return deny('native_ack_endpoint_mismatch');
    let ownership=false,physical=false;
    try{
      ownership=durableOwnershipWitness(j.record)===true;
      physical=verifyEndpointOwner(from)===true&&
        verifyEndpointOwner(to)===true&&
        from.container.getItem(from.slot)===undefined&&
        JSON.stringify(witness(to.container.getItem(to.slot)))===
          JSON.stringify(j.record.witness);
    }catch(_){}
    if(!ownership||!physical)
      return deny('native_ack_custody_proof_missing');
    // No automatic pending journal cleanup on initial startup or failure.
    // This explicit ACK requires independent ownership and physical proof.
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,undefined);}
    catch(_){
      quarantined=true;
      return deny('native_ack_clear_ambiguous');
    }
    const cleared=readJournal(world);
    if(!cleared.ok||!cleared.empty){
      quarantined=true;
      return deny('native_ack_clear_readback_failed');
    }
    return {ok:true,status:'NATIVE_CUSTODY_ACK_READBACK',
      operationId,canReplay:false};
  }

  /**
   * Terminal physical retirement of a CERTIFIED ordinary ItemStack already
   * covered by a persisted ledger credit and a global outer boundary intent.
   * This is the same native writer, not a destructive general-purpose helper.
   * It must never be used on metadata-rich or uncertain live stacks.
   */
  function consumeCertifiedEscrow({operationId,from,accountId,key,count}={}){
    if(quarantined)return deny('native_session_quarantined');
    const gate=fence();
    if(!gate.ok)return deny(gate.reason);
    const pending=readJournal(world);
    if(!pending.ok)return pending;
    if(!pending.empty)return deny('native_intent_already_pending');
    if(!name(operationId)||!verifyEndpoint(from)||
       !name(accountId)||typeof key!=='string'||!pos(count)||
       typeof from.container.setItem!=='function'||
       typeof certifyOrdinaryEscrow!=='function'||
       typeof verifyLedgerBoundaryReceipt!=='function')
      return deny('invalid_ordinary_escrow_consumption');
    let item;
    try{item=from.container.getItem(from.slot);}
    catch(_){return deny('escrow_item_unreadable');}
    const before=witness(item);
    let certified=false,credited=false,owned=false;
    try{
      certified=certifyOrdinaryEscrow(item,key,count)===true;
      credited=verifyLedgerBoundaryReceipt({
        operationId:boundaryOperationId,accountId,key,count,
        direction:'deposit'
      })===true;
      owned=verifyEndpointOwner(from)===true;
    }catch(_){}
    if(!before||before.amount!==count||!certified||!credited||!owned)
      return deny('ordinary_escrow_not_credited_or_certified');
    const intent={schema:UCE_NATIVE_INTENT_SCHEMA,
      phase:'PREPARED',kind:'CONSUME_ORDINARY_ESCROW',
      operationId,worldId,epoch,
      from:{ownerId:from.ownerId,slot:from.slot},
      to:{ownerId:'ledger:'+accountId,slot:0},witness:before};
    let raw=JSON.stringify(intent);
    if(raw.length>12000)return deny('native_intent_oversized');
    const again=fence();
    let physical=false,receipt=false;
    try{
      physical=JSON.stringify(witness(from.container.getItem(from.slot)))===
        JSON.stringify(before) && verifyEndpointOwner(from)===true;
      receipt=verifyLedgerBoundaryReceipt({
        operationId:boundaryOperationId,accountId,key,count,
        direction:'deposit'
      })===true;
    }catch(_){}
    if(!again.ok||!physical||!receipt)
      return deny('escrow_prewrite_custody_changed');
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,raw);}
    catch(_){
      quarantined=true;
      return deny('escrow_consumption_intent_ambiguous');
    }
    const prepared=readJournal(world);
    if(!prepared.ok||prepared.empty||prepared.raw!==raw){
      quarantined=true;
      return deny('escrow_consumption_intent_readback_failed');
    }
    try{from.container.setItem(from.slot,undefined);}
    catch(_){
      quarantined=true;
      return deny('escrow_consumption_outcome_ambiguous');
    }
    let empty=false;
    try{empty=from.container.getItem(from.slot)===undefined;}
    catch(_){}
    if(!empty){
      quarantined=true;
      return deny('escrow_consumption_postwrite_mismatch');
    }
    intent.phase='CONSUMED_INSPECTED';
    raw=JSON.stringify(intent);
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,raw);}
    catch(_){
      quarantined=true;
      return deny('escrow_consumed_marker_ambiguous');
    }
    const posted=readJournal(world);
    if(!posted.ok||posted.empty||posted.raw!==raw){
      quarantined=true;
      return deny('escrow_consumed_marker_readback_failed');
    }
    return {ok:true,status:'CERTIFIED_ORDINARY_ESCROW_CONSUMED_PENDING_ACK',
      operationId,accountId,count,
      canReplay:false,canClearJournal:false};
  }
  /**
   * ACK only after carrier ticket was durably RELEASED, original slot is
   * physically empty and the ledger credit receipt still matches. No replay
   * or new ItemStack creation occurs in this method.
   */
  function ackCertifiedEscrow({operationId,from,accountId,key,count}={}){
    if(quarantined)return deny('native_session_quarantined');
    const gate=fence(operationId);
    if(!gate.ok)return deny(gate.reason);
    const j=readJournal(world);
    if(!j.ok)return j;
    if(j.empty||j.record.phase!=='CONSUMED_INSPECTED'||
       j.record.kind!=='CONSUME_ORDINARY_ESCROW'||
       j.record.operationId!==operationId||
       j.record.from.ownerId!==from?.ownerId||
       j.record.from.slot!==from?.slot||
       j.record.to.ownerId!=='ledger:'+accountId||
       j.record.witness.amount!==count)
      return deny('escrow_ack_without_matching_consumption');
    let valid=false;
    try{
      valid=verifyEndpointOwner(from)===true &&
        from.container.getItem(from.slot)===undefined &&
        durableOwnershipWitness(j.record)===true &&
        verifyLedgerBoundaryReceipt({
          operationId:boundaryOperationId,accountId,key,count,
          direction:'deposit'
        })===true;
    }catch(_){}
    if(!valid)return deny('escrow_ack_custody_proof_missing');
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,undefined);}
    catch(_){
      quarantined=true;
      return deny('escrow_ack_clear_ambiguous');
    }
    const cleared=readJournal(world);
    if(!cleared.ok||!cleared.empty){
      quarantined=true;
      return deny('escrow_ack_readback_failed');
    }
    return {ok:true,status:'CERTIFIED_ORDINARY_ESCROW_CLEARED',
      operationId,canReplay:false};
  }


  /**
   * Materialize a newly certified PLAIN ItemStack into a protected native
   * escrow host under one journal. Source ledger balance remains untouched
   * until the SAME UCE account writer has verified durable host ownership.
   *
   * The provided constructor is runtime-only, never a metadata-rich
   * deserialize function. The exclusive outer boundary reservation must
   * bind exact account/item/quantity before allocating the original slot.
   */
  function materializeCertifiedOrdinary({operationId,to,accountId,key,count}={}){
    if(quarantined)return deny('native_session_quarantined');
    const gate=fence();
    if(!gate.ok)return deny(gate.reason);
    const pending=readJournal(world);
    if(!pending.ok)return pending;
    if(!pending.empty)return deny('native_intent_already_pending');
    if(!name(operationId)||!verifyEndpoint(to)||
       typeof to.container.setItem!=='function'||
       !name(accountId)||typeof key!=='string'||!pos(count)||
       typeof makeCertifiedOrdinaryItem!=='function'||
       typeof certifyOrdinaryEscrow!=='function'||
       typeof verifyLedgerWithdrawalReservation!=='function')
      return deny('invalid_ordinary_materialize_request');
    let authorized=false,ownerVerified=false,empty=false;
    try{
      authorized=verifyLedgerWithdrawalReservation({
        operationId:boundaryOperationId,accountId,key,count,
        direction:'withdraw'
      })===true;
      ownerVerified=verifyEndpointOwner(to)===true;
      empty=to.container.getItem(to.slot)===undefined;
    }catch(_){}
    if(!authorized||!ownerVerified||!empty)
      return deny('ordinary_materialize_escrow_not_reserved');
    let item;
    try{item=makeCertifiedOrdinaryItem(key,count);}
    catch(_){return deny('ordinary_materialize_constructor_failed');}
    const before=witness(item);
    let certified=false;
    try{certified=certifyOrdinaryEscrow(item,key,count)===true;}
    catch(_){}
    if(!before||before.amount!==count||!certified)
      return deny('ordinary_materialize_item_not_certified');
    const intent={schema:UCE_NATIVE_INTENT_SCHEMA,
      phase:'PREPARED',kind:'MATERIALIZE_ORDINARY_ESCROW',
      operationId,worldId,epoch,
      from:{ownerId:'ledger:'+accountId,slot:0},
      to:{ownerId:to.ownerId,slot:to.slot},witness:before};
    let raw=JSON.stringify(intent);
    if(raw.length>12000)return deny('native_intent_oversized');
    const second=fence();
    let stillAuthorized=false,stillEmpty=false;
    try{
      stillAuthorized=verifyLedgerWithdrawalReservation({
        operationId:boundaryOperationId,accountId,key,count,
        direction:'withdraw'
      })===true&&verifyEndpointOwner(to)===true;
      stillEmpty=to.container.getItem(to.slot)===undefined;
    }catch(_){}
    if(!second.ok||!stillAuthorized||!stillEmpty)
      return deny('ordinary_materialize_prewrite_changed');
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,raw);}
    catch(_){
      quarantined=true;
      return deny('ordinary_materialize_prepared_ambiguous');
    }
    const prepared=readJournal(world);
    if(!prepared.ok||prepared.empty||prepared.raw!==raw){
      quarantined=true;
      return deny('ordinary_materialize_prepared_readback_failed');
    }
    // Only certified plain items can be newly instantiated. The native
    // setter is a Bedrock inventory effect, not an atomic disk transaction.
    try{to.container.setItem(to.slot,item);}
    catch(_){
      quarantined=true;
      return deny('ordinary_materialize_native_write_ambiguous');
    }
    let same=false;
    try{
      same=JSON.stringify(witness(to.container.getItem(to.slot)))===
        JSON.stringify(before);
    }catch(_){}
    if(!same){
      quarantined=true;
      return deny('ordinary_materialize_native_witness_mismatch');
    }
    intent.phase='MATERIALIZED_INSPECTED';
    raw=JSON.stringify(intent);
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,raw);}
    catch(_){
      quarantined=true;
      return deny('ordinary_materialize_marker_ambiguous');
    }
    const posted=readJournal(world);
    if(!posted.ok||posted.empty||posted.raw!==raw){
      quarantined=true;
      return deny('ordinary_materialize_marker_readback_failed');
    }
    return {ok:true,status:'CERTIFIED_ORDINARY_ESCROW_MATERIALIZED_PENDING_ACK',
      operationId,accountId,count,
      canReplay:false,canClearJournal:false};
  }
  function ackMaterializedOrdinary({operationId,to,accountId,key,count}={}){
    if(quarantined)return deny('native_session_quarantined');
    const gate=fence(operationId);
    if(!gate.ok)return deny(gate.reason);
    const j=readJournal(world);
    if(!j.ok)return j;
    if(j.empty||j.record.phase!=='MATERIALIZED_INSPECTED'||
       j.record.kind!=='MATERIALIZE_ORDINARY_ESCROW'||
       j.record.operationId!==operationId||
       j.record.from.ownerId!=='ledger:'+accountId||
       j.record.to.ownerId!==to?.ownerId||
       j.record.to.slot!==to?.slot||j.record.witness.amount!==count)
      return deny('materialize_ack_without_matching_intent');
    let valid=false;
    try{
      const item=to.container.getItem(to.slot);
      valid=verifyEndpointOwner(to)===true &&
        JSON.stringify(witness(item))===
          JSON.stringify(j.record.witness) &&
        certifyOrdinaryEscrow(item,key,count)===true &&
        durableOwnershipWitness(j.record)===true &&
        verifyLedgerWithdrawalReservation({
          operationId:boundaryOperationId,accountId,key,count,
          direction:'withdraw'
        })===true;
    }catch(_){}
    if(!valid)return deny('materialize_ack_custody_proof_missing');
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,undefined);}
    catch(_){
      quarantined=true;
      return deny('materialize_ack_clear_ambiguous');
    }
    const cleared=readJournal(world);
    if(!cleared.ok||!cleared.empty){
      quarantined=true;
      return deny('materialize_ack_clear_readback_failed');
    }
    return {ok:true,status:'CERTIFIED_ORDINARY_ESCROW_ADMITTED',
      operationId,canReplay:false};
  }


  /*
   * A vanilla dropper/dispenser does not expose its ejected item through a
   * Container. Copy the LIVE ItemStack into the existing native carrier under
   * the same UCE intent and ticket protocol; remove its entity ONLY after
   * registry.stageMovedTicket has independently persisted destination custody.
   * The intermediate source entity intentionally remains present. On crash,
   * partial placement or uncertain entity.remove, the journal HOLDS and never
   * replays/clears automatically. This is NOT BDS disk-atomicity.
   */
  function entityValid(entity){
    try{
      return !!entity&&entity.typeId==='minecraft:item'&&
        (typeof entity.isValid==='function'
          ? entity.isValid()===true : entity.isValid===true);
    }catch(_){return false;}
  }
  function entityStack(entity){
    try{return entity?.getComponent('minecraft:item')?.itemStack;}
    catch(_){return undefined;}
  }
  function entitySourceRef(entity,sourceOwnerId){
    return {ownerId:sourceOwnerId,slot:0,entity};
  }
  function stageEjectedItem({operationId,entity,sourceOwnerId,to}={}){
    if(quarantined)return deny('native_session_quarantined');
    const gate=fence();
    if(!gate.ok)return deny(gate.reason);
    const pending=readJournal(world);
    if(!pending.ok)return pending;
    if(!pending.empty)return deny('native_intent_already_pending');
    if(!name(operationId)||!name(sourceOwnerId)||
       !entityValid(entity)||!name(entity.id)||!verifyEndpoint(to)||
       sourceOwnerId===to.ownerId||
       typeof to.container.setItem!=='function')
      return deny('entity_ingress_invalid_endpoints');
    const from=entitySourceRef(entity,sourceOwnerId);
    let admitted=false;
    try{admitted=verifyEndpointOwner(from)===true&&
      verifyEndpointOwner(to)===true;}catch(_){}
    if(!admitted)return deny('entity_ingress_owner_unverified');
    const stack=entityStack(entity),before=witness(stack);
    if(!before)return deny('entity_ingress_item_unreadable');
    try{if(to.container.getItem(to.slot)!==undefined)
      return deny('entity_ingress_target_occupied');}
    catch(_){return deny('entity_ingress_target_unreadable');}
    const intent={schema:UCE_NATIVE_INTENT_SCHEMA,
      kind:'ENTITY_TO_NATIVE',phase:'PREPARED',
      operationId,worldId,epoch,entityId:entity.id,
      from:{ownerId:sourceOwnerId,slot:0},
      to:{ownerId:to.ownerId,slot:to.slot},witness:before};
    let raw=JSON.stringify(intent);
    if(raw.length>12000)return deny('entity_ingress_intent_oversized');
    const again=fence();
    let valid=false;
    try{
      valid=again.ok&&entityValid(entity)&&
        verifyEndpointOwner(from)===true&&
        verifyEndpointOwner(to)===true&&
        JSON.stringify(witness(entityStack(entity)))===
          JSON.stringify(before)&&
        to.container.getItem(to.slot)===undefined;
    }catch(_){}
    if(!valid)return deny('entity_ingress_changed_prewrite');
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,raw);}
    catch(_){quarantined=true;return deny('entity_prepare_write_ambiguous');}
    const posted=readJournal(world);
    if(!posted.ok||posted.empty||posted.raw!==raw){
      quarantined=true;return deny('entity_prepare_readback_failed');
    }
    // This uses the ItemStack returned by the native item component
    // directly, not JSON/def reconstruction or a guessed new ItemStack.
    try{to.container.setItem(to.slot,stack);}
    catch(_){quarantined=true;return deny('entity_copy_outcome_ambiguous');}
    let copied=false;
    try{
      copied=entityValid(entity)&&
        JSON.stringify(witness(entityStack(entity)))===
          JSON.stringify(before)&&
        JSON.stringify(witness(to.container.getItem(to.slot)))===
          JSON.stringify(before);
    }catch(_){}
    if(!copied){quarantined=true;
      return deny('entity_copy_readback_mismatch');}
    intent.phase='MOVED_INSPECTED';
    raw=JSON.stringify(intent);
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,raw);}
    catch(_){quarantined=true;
      return deny('entity_moved_marker_write_ambiguous');}
    const marked=readJournal(world);
    if(!marked.ok||marked.empty||marked.raw!==raw){
      quarantined=true;
      return deny('entity_moved_marker_readback_failed');
    }
    return {ok:true,status:'ENTITY_COPIED_PENDING_TICKET_AND_REMOVAL',
      operationId,originalEntityIntact:true,
      canReplay:false,canClearJournal:false};
  }
  function ackEjectedItem({operationId,entity,sourceOwnerId,to}={}){
    if(quarantined)return deny('native_session_quarantined');
    const gate=fence(operationId);
    if(!gate.ok)return deny(gate.reason);
    const pending=readJournal(world);
    if(!pending.ok)return pending;
    const j=pending.record;
    if(pending.empty||j?.kind!=='ENTITY_TO_NATIVE'||
       j.phase!=='MOVED_INSPECTED'||
       j.operationId!==operationId||j.entityId!==entity?.id||
       j.from.ownerId!==sourceOwnerId||
       j.to.ownerId!==to?.ownerId||j.to.slot!==to?.slot||
       !verifyEndpoint(to))
      return deny('entity_ack_without_exact_copied_intent');
    const from=entitySourceRef(entity,sourceOwnerId);
    let confirmed=false;
    try{
      confirmed=entityValid(entity)&&
        verifyEndpointOwner(from)===true&&
        verifyEndpointOwner(to)===true&&
        durableOwnershipWitness(j)===true&&
        JSON.stringify(witness(entityStack(entity)))===
          JSON.stringify(j.witness)&&
        JSON.stringify(witness(to.container.getItem(to.slot)))===
          JSON.stringify(j.witness);
    }catch(_){}
    if(!confirmed)return deny('entity_ack_owner_or_ticket_unverified');
    // The carrier ticket is already durably saved. If source removal is
    // ambiguous, never attempt another removal or automatic settlement.
    try{entity.remove();}
    catch(_){quarantined=true;return deny('entity_remove_outcome_ambiguous');}
    if(entityValid(entity)){
      quarantined=true;return deny('entity_remove_not_observed');
    }
    try{world.setDynamicProperty(UCE_NATIVE_INTENT_KEY,undefined);}
    catch(_){quarantined=true;return deny('entity_ack_clear_ambiguous');}
    const cleared=readJournal(world);
    if(!cleared.ok||!cleared.empty){
      quarantined=true;return deny('entity_ack_clear_readback_failed');
    }
    return {ok:true,status:'ENTITY_NATIVE_CUSTODY_ACK_READBACK',
      operationId,canReplay:false};
  }

  return {ok:true,inspectPending,moveWhole,ackWhole,
    stageEjectedItem,ackEjectedItem,
    consumeCertifiedEscrow,ackCertifiedEscrow,
    materializeCertifiedOrdinary,ackMaterializedOrdinary,
    getSessionQuarantine:()=>quarantined};
}
