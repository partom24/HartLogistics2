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
const phases=new Set(['PREPARED','MOVED_INSPECTED']);
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
    verifyEndpointOwner,durableOwnershipWitness}={}){
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
    {allowedNativeOperationId:operationId});
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
  return {ok:true,inspectPending,moveWhole,ackWhole,
    getSessionQuarantine:()=>quarantined};
}
