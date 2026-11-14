/**
 * Unified Custody Engine ordinary physical-boundary coordinator.
 *
 * This is NOT a second queue, scheduler or custody authority. It composes:
 *   one UCE outer operation, one native physical port, one carrier ticket
 *   registry, and the SAME ordinary account shard writer.
 *
 * Called by the future product scheduler after it has selected a route and
 * verified actual native endpoint identity/redstone/capacity. No source or
 * destination is invented here. One transfer per invocation; no background
 * retry, journal cleanup, Q4 recovery or authority activation.
 *
 * Durable phases: PREPARED -> ESCROW_READY -> (ledger receipt + native ACK)
 * -> VERIFIED_COMPLETE -> CLEAR. Any uncertain result leaves outer record
 * and original native/ledger evidence in HOLD.
 *
 * A successful setDynamicProperty+readback is NOT a BDS disk-atomic promise.
 */
export const UCE_ORDINARY_BOUNDARY_KEY='hartlogistics:uce_boundary_intent_v1';
export const UCE_ORDINARY_BOUNDARY_SCHEMA='hart-uce-ordinary-boundary-v1';
const ASCII=/^[\x20-\x7e]+$/;
const id=x=>typeof x==='string'&&x.length>0&&x.length<=256&&ASCII.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const nat=x=>Number.isSafeInteger(x)&&x>=0;
const hold=reason=>({ok:false,status:'HOLD',reason,
  canReplay:false,canClearQ4:false,canRepair:false});
function read(world){
  try{return {ok:true,raw:world.getDynamicProperty(UCE_ORDINARY_BOUNDARY_KEY)};}
  catch(_){return hold('boundary_record_read_failed');}
}
function update(world,previous,record){
  const r=read(world);
  if(!r.ok)return r;
  if(r.raw!==previous)return hold('boundary_record_changed_prewrite');
  const raw=record===undefined?undefined:JSON.stringify(record);
  if(typeof raw==='string'&&raw.length>12000)
    return hold('boundary_record_too_large');
  try{world.setDynamicProperty(UCE_ORDINARY_BOUNDARY_KEY,raw);}
  catch(_){return hold('boundary_record_write_ambiguous');}
  const after=read(world);
  if(!after.ok||after.raw!==raw)
    return hold('boundary_record_readback_mismatch');
  return {ok:true,raw};
}
function requireEmpty(world){
  const r=read(world);
  if(!r.ok)return r;
  if(r.raw!==undefined&&r.raw!==null&&r.raw!=='')
    return hold('pending_boundary_requires_reconciliation');
  return {ok:true,raw:r.raw};
}
function ticket(registry,ownerId,anchor,slot,expectedPresent){
  const r=registry.inspectCustody({ownerId,anchor});
  if(!r.ok)return hold('carrier_claims:'+r.reason);
  if(!Array.isArray(r.slots)||r.slots.includes(slot)!==expectedPresent)
    return hold('carrier_custody_slot_state_mismatch');
  return {ok:true};
}
function ledgerReceipt(writer,tx){
  const r=writer.inspect();
  if(!r.ok)return hold('ordinary_account_unreadable:'+r.reason);
  const receipt=r.lastReceipt;
  if(!receipt||receipt.kind!=='BOUNDARY'||
     receipt.operationId!==tx.operationId||
     receipt.accountId!==tx.accountId||
     receipt.key!==tx.key||receipt.count!==tx.count||
     receipt.direction!==tx.direction)
    return hold('ordinary_boundary_account_receipt_missing');
  return {ok:true};
}
function input({world,worldId,epoch,operationId,accountId,key,count,
    registry,port,writer,ownerId,anchor,carrierSlot,physicalSlot,
    verifyRoute,verifyOrdinary}={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     typeof world.setDynamicProperty!=='function'||
     !id(worldId)||!positive(epoch)||!id(operationId)||!id(accountId)||
     typeof key!=='string'||!key||!positive(count)||!id(ownerId)||
     !anchor||!registry||!port||!writer||
     typeof registry.inspectCustody!=='function'||
     typeof registry.stageMovedTicket!=='function'||
     typeof port.moveWhole!=='function'||
     typeof writer.applyBoundaryCommit!=='function'||
     typeof writer.inspect!=='function'||
     !carrierSlot||!physicalSlot||
     typeof verifyRoute!=='function'||
     typeof verifyOrdinary!=='function')
    return hold('invalid_boundary_service_binding');
  return {ok:true};
}
function before(world,tx,writer,verifyRoute,verifyOrdinary,
    physicalSlot,carrierSlot,registry,ownerId,anchor,partialOutput=false){
  const empty=requireEmpty(world);
  if(!empty.ok)return empty;
  const ledger=writer.inspect();
  if(!ledger.ok)return hold('ordinary_account_unreadable:'+ledger.reason);
  const acct=ledger.snapshot.accounts.find(a=>a.id===tx.accountId);
  if(!acct)return hold('ordinary_account_unknown');
  if(tx.direction==='deposit'&&acct.total+tx.count>acct.capacity)
    return hold('ordinary_account_at_capacity');
  if(tx.direction==='withdraw' &&
     (acct.buckets.find(b=>b.key===tx.key)?.count||0)<tx.count)
    return hold('ordinary_account_insufficient_balance');
  tx.expectedRevision=ledger.snapshot.revision;
  if(ledger.snapshot.worldId!==tx.worldId ||
     ledger.snapshot.epoch!==tx.epoch)
    return hold('ordinary_world_epoch_mismatch');
  let route=false,ordinary=false;
  try{
    route=verifyRoute()===true;
    ordinary=verifyOrdinary({
      accountId:tx.accountId,key:tx.key,count:tx.count,
      direction:tx.direction,
      from:physicalSlot,to:carrierSlot
    })===true;
  }catch(_){}
  if(!route||!ordinary)return hold('route_or_ordinary_identity_unverified');
  const carrier=ticket(registry,ownerId,anchor,carrierSlot.slot,false);
  if(!carrier.ok)return carrier;
  let emptySlot=false,sourceReady=false;
  try{
    emptySlot=carrierSlot.container.getItem(carrierSlot.slot)===undefined;
    const physical=physicalSlot.container.getItem(physicalSlot.slot);
    sourceReady=tx.direction==='deposit'?physical!==undefined:
      partialOutput?
        !!physical&&Number.isSafeInteger(physical.amount)&&
        Number.isSafeInteger(physical.maxAmount)&&
        physical.amount>0&&
        physical.amount+tx.count<=physical.maxAmount&&
        typeof physical.isStackableWith==='function':
        physical===undefined;
  }catch(_){}
  if(!emptySlot||!sourceReady)
    return hold('physical_endpoints_not_ready');
  return {ok:true,previous:empty.raw};
}
function finish(world,tx,previous,writer,registry,ownerId,anchor,carrierSlot){
  const credit=ledgerReceipt(writer,tx);
  if(!credit.ok)return credit;
  const cleared=ticket(registry,ownerId,anchor,carrierSlot.slot,false);
  if(!cleared.ok)return cleared;
  const done={...tx,phase:'VERIFIED_COMPLETE'};
  const a=update(world,previous,done);
  if(!a.ok)return a;
  const b=update(world,a.raw,undefined);
  if(!b.ok)return b;
  return {ok:true,status:'UNIFIED_ORDINARY_BOUNDARY_DELIVERED',
    operationId:tx.operationId,accountId:tx.accountId,
    direction:tx.direction,count:tx.count,
    canReplay:false,hasDiskCrashAtomicityProof:false};
}
/**
 * Prepare one RECEIVER OR BULK ordinary account deposit from an existing
 * loaded native input into protected native escrow. The scheduler owns
 * route choice and identity certification, not the coordinator.
 */
export function executeUnifiedOrdinaryDeposit(args={}){
  const bound=input(args);
  if(!bound.ok)return bound;
  const {world,worldId,epoch,operationId,accountId,key,count,
    registry,port,writer,ownerId,anchor,carrierSlot,physicalSlot,
    verifyRoute,verifyOrdinary}=args;
  const tx={schema:UCE_ORDINARY_BOUNDARY_SCHEMA,
    phase:'PREPARED',worldId,epoch,operationId,
    direction:'deposit',accountId,key,count,expectedRevision:0};
  const start=before(world,tx,writer,verifyRoute,verifyOrdinary,
    physicalSlot,carrierSlot,registry,ownerId,anchor);
  if(!start.ok)return start;
  const requested=update(world,start.previous,tx);
  if(!requested.ok)return requested;
  const moved=port.moveWhole({operationId:operationId+':native-in',
    from:physicalSlot,to:carrierSlot});
  if(!moved.ok)return hold('native_ingress:'+moved.reason);
  const staged=registry.stageMovedTicket({ownerId,anchor});
  if(!staged.ok)return hold('native_ticket_in:'+staged.reason);
  const ack=port.ackWhole({operationId:operationId+':native-in',
    from:physicalSlot,to:carrierSlot});
  if(!ack.ok)return hold('native_ack_in:'+ack.reason);
  const ready=ticket(registry,ownerId,anchor,carrierSlot.slot,true);
  if(!ready.ok)return ready;
  const escrow=update(world,requested.raw,{...tx,phase:'ESCROW_READY'});
  if(!escrow.ok)return escrow;
  const credited=writer.applyBoundaryCommit({...tx,
    expectedEpoch:epoch});
  if(!credited.ok)return hold('ordinary_credit:'+credited.reason);
  const retired=port.consumeCertifiedEscrow({
    operationId:operationId+':retire',from:carrierSlot,
    accountId,key,count});
  if(!retired.ok)return hold('ordinary_escrow_retire:'+retired.reason);
  const released=registry.stageMovedTicket({ownerId,anchor});
  if(!released.ok)return hold('native_ticket_retire:'+released.reason);
  const clear=port.ackCertifiedEscrow({
    operationId:operationId+':retire',from:carrierSlot,
    accountId,key,count});
  if(!clear.ok)return hold('ordinary_escrow_ack:'+clear.reason);
  return finish(world,tx,escrow.raw,writer,registry,
    ownerId,anchor,carrierSlot);
}

/**
 * Dropper/Dispenser ORDINARY entity -> existing sealed Receiver ledger.
 * Uses the SAME boundary intent, native entity port, persistent carrier
 * ticket and shard writer as a Hopper-sourced ordinary deposit. The item
 * entity is removed ONLY after its exact native escrow and durable ticket
 * readback. Then a single certified Receiver credit retires that escrow.
 *
 * Interrupted operation always HOLDS its outer journal; there is no
 * speculative replay, second item queue or reconstructed MR payload.
 */
export function executeUnifiedEjectedOrdinaryDeposit(args={}){
  const {world,worldId,epoch,operationId,accountId,key,count,
    registry,port,writer,ownerId,anchor,carrierSlot,
    entity,sourceOwnerId,verifyRoute,verifyOrdinary}=args;
  if(!world||typeof world.getDynamicProperty!=='function'||
     typeof world.setDynamicProperty!=='function'||
     !id(worldId)||!positive(epoch)||!id(operationId)||
     !id(accountId)||typeof key!=='string'||!key||
     !positive(count)||count>64||
     !id(ownerId)||!anchor||!carrierSlot||
     carrierSlot.ownerId!==ownerId||!entity||
     !id(entity.id)||sourceOwnerId!=='ejected-item|'+entity.id||
     typeof verifyRoute!=='function'||
     typeof verifyOrdinary!=='function'||
     typeof registry?.inspectCustody!=='function'||
     typeof registry?.stageMovedTicket!=='function'||
     typeof port?.stageEjectedItem!=='function'||
     typeof port?.ackEjectedItem!=='function'||
     typeof port?.consumeCertifiedEscrow!=='function'||
     typeof port?.ackCertifiedEscrow!=='function'||
     typeof writer?.inspect!=='function'||
     typeof writer?.applyBoundaryCommit!=='function')
    return hold('invalid_ejected_ordinary_binding');
  const empty=requireEmpty(world);
  if(!empty.ok)return empty;
  const ledger=writer.inspect();
  if(!ledger.ok)return hold('ordinary_account_unreadable:'+ledger.reason);
  if(ledger.snapshot.worldId!==worldId||
     ledger.snapshot.epoch!==epoch)return hold('ordinary_world_epoch_mismatch');
  const account=ledger.snapshot.accounts.find(a=>a.id===accountId);
  if(!account||account.kind!=='receiver')
    return hold('ejected_receiver_account_unknown');
  if(account.total+count>account.capacity)
    return hold('ordinary_account_at_capacity');
  let routed=false,ordinary=false;
  try{
    routed=verifyRoute()===true;
    ordinary=verifyOrdinary({
      accountId,key,count,direction:'deposit',entity,
      fromOwner:sourceOwnerId,to:carrierSlot
    })===true;
  }catch(_){}
  if(!routed||!ordinary)
    return hold('ejected_ordinary_route_or_identity_unverified');
  const free=ticket(registry,ownerId,anchor,carrierSlot.slot,false);
  if(!free.ok)return free;
  try{
    if(carrierSlot.container.getItem(carrierSlot.slot)!==undefined)
      return hold('ejected_ordinary_escrow_occupied');
  }catch(_){return hold('ejected_ordinary_escrow_unreadable');}
  const tx={schema:UCE_ORDINARY_BOUNDARY_SCHEMA,
    phase:'PREPARED',worldId,epoch,operationId,
    direction:'deposit',accountId,key,count,
    expectedRevision:ledger.snapshot.revision};
  const requested=update(world,empty.raw,tx);
  if(!requested.ok)return requested;
  const nativeOperationId=operationId+':native-in';
  const copied=port.stageEjectedItem({
    operationId:nativeOperationId,entity,sourceOwnerId,to:carrierSlot});
  if(!copied.ok)return hold('ejected_native_ingress:'+copied.reason);
  const claimed=registry.stageMovedTicket({ownerId,anchor});
  if(!claimed.ok)return hold('ejected_native_ticket:'+claimed.reason);
  const ack=port.ackEjectedItem({
    operationId:nativeOperationId,entity,sourceOwnerId,to:carrierSlot});
  if(!ack.ok)return hold('ejected_native_ack:'+ack.reason);
  const custody=ticket(registry,ownerId,anchor,carrierSlot.slot,true);
  if(!custody.ok)return custody;
  let stillLinked=false;
  try{stillLinked=verifyRoute()===true;}catch(_){}
  if(!stillLinked)
    return hold('ejected_route_changed_after_native_ack');
  const escrow=update(world,requested.raw,{...tx,phase:'ESCROW_READY'});
  if(!escrow.ok)return escrow;
  const credited=writer.applyBoundaryCommit({...tx,expectedEpoch:epoch});
  if(!credited.ok)return hold('ejected_ordinary_credit:'+credited.reason);
  const retired=port.consumeCertifiedEscrow({
    operationId:operationId+':retire',
    from:carrierSlot,accountId,key,count});
  if(!retired.ok)return hold('ejected_ordinary_escrow_retire:'+retired.reason);
  const released=registry.stageMovedTicket({ownerId,anchor});
  if(!released.ok)return hold('ejected_ordinary_ticket_retire:'+released.reason);
  const cleared=port.ackCertifiedEscrow({
    operationId:operationId+':retire',
    from:carrierSlot,accountId,key,count});
  if(!cleared.ok)return hold('ejected_ordinary_escrow_ack:'+cleared.reason);
  return finish(world,tx,escrow.raw,writer,registry,
    ownerId,anchor,carrierSlot);
}
/**
 * Withdraw from the SAME ordinary account writer; a certified item is
 * materialized into persistent native escrow, durably debited exactly once,
 * then handed to the validated Sorter destination. Never flatten MR items.
 */
export function executeUnifiedOrdinaryWithdrawal(args={}){
  const bound=input(args);
  if(!bound.ok)return bound;
  const {world,worldId,epoch,operationId,accountId,key,count,
    registry,port,writer,ownerId,anchor,carrierSlot,physicalSlot,
    verifyRoute,verifyOrdinary}=args;
  const partialOutput=args.partialOutput===true;
  if(partialOutput&&(typeof port.moveCertifiedPartial!=='function'||
      typeof port.ackCertifiedPartial!=='function'))
    return hold('partial_output_port_unavailable');
  const tx={schema:UCE_ORDINARY_BOUNDARY_SCHEMA,
    phase:'PREPARED',worldId,epoch,operationId,
    direction:'withdraw',accountId,key,count,expectedRevision:0};
  const start=before(world,tx,writer,verifyRoute,verifyOrdinary,
    physicalSlot,carrierSlot,registry,ownerId,anchor,partialOutput);
  if(!start.ok)return start;
  const requested=update(world,start.previous,tx);
  if(!requested.ok)return requested;
  const materialized=port.materializeCertifiedOrdinary({
    operationId:operationId+':materialize',to:carrierSlot,
    accountId,key,count});
  if(!materialized.ok)
    return hold('ordinary_materialize:'+materialized.reason);
  const claim=registry.stageMovedTicket({ownerId,anchor});
  if(!claim.ok)return hold('materialized_native_ticket:'+claim.reason);
  const ack=port.ackMaterializedOrdinary({
    operationId:operationId+':materialize',to:carrierSlot,
    accountId,key,count});
  if(!ack.ok)return hold('ordinary_materialize_ack:'+ack.reason);
  const ready=ticket(registry,ownerId,anchor,carrierSlot.slot,true);
  if(!ready.ok)return ready;
  const escrow=update(world,requested.raw,{...tx,phase:'ESCROW_READY'});
  if(!escrow.ok)return escrow;
  const debit=writer.applyBoundaryCommit({...tx,expectedEpoch:epoch});
  if(!debit.ok)return hold('ordinary_debit:'+debit.reason);
  let stillRouted=false;
  try{stillRouted=verifyRoute()===true;}catch(_){}
  if(!stillRouted)return hold('sorter_destination_changed_after_debit');
  const moved=partialOutput?
    port.moveCertifiedPartial({
      operationId:operationId+':native-out',
      from:carrierSlot,to:physicalSlot,key,count}):
    port.moveWhole({
      operationId:operationId+':native-out',
      from:carrierSlot,to:physicalSlot});
  if(!moved.ok)return hold('ordinary_output:'+moved.reason);
  const released=registry.stageMovedTicket({ownerId,anchor});
  if(!released.ok)return hold('native_ticket_out:'+released.reason);
  const acknowledged=partialOutput?
    port.ackCertifiedPartial({
      operationId:operationId+':native-out',
      from:carrierSlot,to:physicalSlot,key,count}):
    port.ackWhole({
      operationId:operationId+':native-out',
      from:carrierSlot,to:physicalSlot});
  if(!acknowledged.ok)return hold('native_output_ack:'+acknowledged.reason);
  return finish(world,tx,escrow.raw,writer,registry,
    ownerId,anchor,carrierSlot);
}
/** Read-only pending-state diagnostics: no retries or implicit cleanup. */
export function inspectUnifiedOrdinaryBoundary(world){
  const r=read(world);
  if(!r.ok)return r;
  if(r.raw===undefined||r.raw===null||r.raw==='')
    return {ok:true,status:'NO_ORDINARY_BOUNDARY_PENDING'};
  if(typeof r.raw!=='string'||r.raw.length>12000)
    return hold('boundary_record_invalid');
  let tx;
  try{tx=JSON.parse(r.raw);}
  catch(_){return hold('boundary_record_invalid');}
  if(!tx||tx.schema!==UCE_ORDINARY_BOUNDARY_SCHEMA||
     !['PREPARED','ESCROW_READY','VERIFIED_COMPLETE'].includes(tx.phase)||
     !id(tx.operationId)||!id(tx.accountId)||!id(tx.worldId)||
     !positive(tx.epoch)||!positive(tx.count)||!nat(tx.expectedRevision))
    return hold('boundary_record_invalid');
  return {ok:true,status:'BOUNDARY_PENDING_RECONCILIATION',
    operationId:tx.operationId,phase:tx.phase,
    direction:tx.direction,canReplay:false,canClearJournal:false};
}
