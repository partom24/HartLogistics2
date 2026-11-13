/**
 * UCE Receiver MR gameplay service. This is the adapter between the SAME
 * registered Collector/Receiver route and the one native custody writer.
 *
 * No new queue, journal, reconstruction, event subscription, global scheduler
 * or autonomous retry. The owning integrated Bedrock scheduler calls it with
 * live, freshly validated native endpoints; it returns one service result.
 * The carrier registry and native port share the unified mutation fence.
 *
 * Ordinary items are not claimed by this MR lane; they are handled by the
 * shared ordinary-account scheduler. UNKNOWN may not enter a count bucket.
 */
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const denied=(reason)=>({ok:false,status:'HOLD',reason,
  moved:0,canReconstruct:false,canReplay:false});
const idle=reason=>({ok:true,status:'IDLE',reason,moved:0});
const validInput=s=>s&&s.container&&s.blockVerified===true&&
  s.ownerId&&typeof s.container.getItem==='function'&&safe(s.container.size);
const validOutput=d=>d&&d.container&&d.blockVerified===true&&
  d.ownerId&&typeof d.container.getItem==='function'&&safe(d.container.size);
function emptySlot(container){
  try{
    for(let slot=0;slot<container.size;slot++)
      if(container.getItem(slot)===undefined)return slot;
  }catch(_){}
  return -1;
}
function moveAndClaim({port,registry,ownerId,anchor,from,to,
  operationId}){
  const r=port.moveWhole({operationId,from,to});
  if(!r.ok)return denied('native_move:'+r.reason);
  if(r.status!=='NATIVE_MOVED_PENDING_OWNERSHIP_ACK')
    return denied('native_move_unexpected_result');
  const ticket=registry.stageMovedTicket({ownerId,anchor});
  if(!ticket.ok)return denied('native_ticket:'+ticket.reason);
  if(!['NATIVE_TICKET_STAGED_FOR_ACK',
        'NATIVE_TICKET_ALREADY_STAGED'].includes(ticket.status))
    return denied('native_ticket_unexpected_result');
  const ack=port.ackWhole({operationId,from,to});
  if(!ack.ok)return denied('native_ack:'+ack.reason);
  if(ack.status!=='NATIVE_CUSTODY_ACK_READBACK')
    return denied('native_ack_unexpected_result');
  return {ok:true,status:'MR_NATIVE_CUSTODY_TRANSFER_COMPLETE',
    moved:r.destinationWitness?.amount||0,operationId,
    fromOwner:from.ownerId,toOwner:to.ownerId};
}

/**
 * Both MR ingress and egress pass the SAME mutation boundary. The caller
 * decides which direction is due this tick; do not attempt both silently.
 *
 * direction: 'ingress' | 'egress'
 * identify returns 'MR'|'ORDINARY'|'UNKNOWN' for one native source stack.
 * operationId must be a stable, unique receipt allocated by owning scheduler.
 * The source selection and output inventory are read again on every tick.
 *
 * A missing *previously registered* carrier is HOLD; automatic respawn is
 * prohibited. Initial registration is an explicit separate owner operation.
 */
export function serviceUnifiedReceiverMR({registry,port,ownerId,anchor,
    direction,inputSources=[],output=null,identify,operationId,
    receiverPowered=false,collectorPowered=false}={}){
  if(!registry||!port||typeof registry.inspectCustody!=='function'||
      typeof port.moveWhole!=='function'||!ownerId||!anchor||
      !['ingress','egress'].includes(direction)||
      typeof identify!=='function'||typeof operationId!=='string'||
      !operationId)return denied('invalid_mr_service_binding');
  const verified=registry.inspectCustody({ownerId,anchor});
  if(!verified.ok)return denied('carrier:'+verified.reason);
  const host=registry.inspectHost({ownerId,anchor});
  if(!host.ok)return denied('carrier:'+host.reason);
  if(direction==='ingress'){
    if(collectorPowered)return idle('collector_redstone_paused');
    if(verified.free<=0)return idle('native_carrier_full');
    const dstSlot=emptySlot(host.container);
    if(dstSlot<0)return denied('native_carrier_capacity_disagrees');
    if(!Array.isArray(inputSources))return denied('incomplete_ingress_sources');
    for(const source of inputSources){
      if(!validInput(source))return denied('unverified_collector_source');
      if(source.locked===true)continue;
      for(let slot=0;slot<source.container.size;slot++){
        let stack;
        try{stack=source.container.getItem(slot);}
        catch(_){return denied('collector_source_unreadable');}
        if(stack===undefined)continue;
        let kind;
        try{kind=identify(stack);}
        catch(_){return denied('collector_item_identity_unreadable');}
        if(kind==='ORDINARY')continue;
        if(kind!=='MR')return denied('uncertified_item_class');
        // A Sorter may share its source Hopper with other destinations.
        // The caller's read-only route selector owns priority and rechecks
        // the winner through the same native port before the move/ACK.
        if(typeof source.eligibleSlot==='function'){
          let eligible=false;
          try{eligible=source.eligibleSlot(slot,stack)===true;}
          catch(_){return denied('source_route_selection_unreadable');}
          if(!eligible)continue;
        }
        const from={ownerId:source.ownerId,container:source.container,slot};
        const to={ownerId,container:host.container,slot:dstSlot};
        return moveAndClaim({port,registry,ownerId,anchor,
          from,to,operationId});
      }
    }
    return idle('no_mr_input');
  }
  if(receiverPowered)return idle('receiver_output_redstone_paused');
  if(verified.occupied===0)return idle('no_mr_queue');
  if(!validOutput(output)||output.locked===true)return idle('native_output_blocked');
  const dstSlot=emptySlot(output.container);
  if(dstSlot<0)return idle('native_destination_full');
  // Storage claims are already enumerated and sorted by the carrier registry.
  if(!Array.isArray(verified.slots)||verified.slots.length===0)
    return denied('carrier_ticket_slots_missing');
  const srcSlot=verified.slots[0];
  // An ordinary escrow accidentally left in a carrier is governed by the
  // ordinary boundary journal and must NOT escape via the MR output lane.
  // Native tickets alone are not spendable ordinary-account authority.
  let nativeKind;
  try{
    const stack=host.container.getItem(srcSlot);
    nativeKind=stack?identify(stack):undefined;
  }catch(_){return denied('native_mr_egress_identity_unreadable');}
  if(nativeKind!=='MR')
    return denied('native_egress_requires_mr_identity');
  const from={ownerId,container:host.container,slot:srcSlot};
  const to={ownerId:output.ownerId,container:output.container,slot:dstSlot};
  return moveAndClaim({port,registry,ownerId,anchor,
    from,to,operationId});
}
