/**
 * UCE ordinary account world adapter — a bounded ONE-property ledger shard.
 *
 * This is executable Bedrock Script API source, not yet wired into gameplay.
 * For accounts in a single shard, both debits and credits and one receipt are
 * written as one JSON value. Cross-shard and physical/native transfers are
 * NOT implemented here; separate property and inventory writes are not a
 * documented Bedrock atomic transaction.
 *
 * An ACTIVE marker is necessary but NOT SUFFICIENT to prove the original Q4
 * writer is stopped. The actual game entrypoint must wire the synchronous
 * externalFence callback to its real exclusive mutation guard, and must not
 * install an ACTIVE marker before a validated cold Q4 import/cutover.
 */
import {inspectUnifiedOrdinaryLedger,
  transitionUnifiedOrdinaryAccounts,
  transitionUnifiedOrdinaryBoundary,
  registerUnifiedEmptyAccount,
  retireUnifiedEmptyBulkAccount} from './unified_ordinary_accounts.mjs';

export const UCE_SHARD_SCHEMA='hart-uce-world-shard-v1';
export const UCE_AUTHORITY_SCHEMA='hart-uce-world-authority-v1';
export const UCE_AUTHORITY_KEY='hartlogistics:uce_authority_v1';
export const UCE_SHARD_MAX_CHARS=28000;
export const UCE_FEDERATED_INTENT_KEY='hartlogistics:uce_federated_intent_v1';
export const UCE_EMPTY_BULK_REMOVAL_KEY='hartlogistics:uce_empty_bulk_removal_intent_v1';
export const UCE_EMPTY_BULK_REMOVAL_SCHEMA='hart-uce-empty-bulk-removal-v1';
export const UCE_FEDERATED_SCHEMA='hart-uce-federated-intent-v1';
const KEY=/^hartlogistics:uce_shard_[a-z0-9_]{1,80}_v1$/;
const ASCII=/^[\x20-\x7e]+$/;
const journals=['hartsorter:journal_v1','hartsorter:queue_journal_v1'];
const pos=n=>Number.isSafeInteger(n)&&n>0;
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const hold=reason=>({ok:false,status:'HOLD',reason,canMoveNative:false,
  canClearQ4:false,canCommitMigration:false});
function hash(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);
  return 'fnv32:'+(h>>>0).toString(16).padStart(8,'0');
}
function pack(shardKey,snapshot,receipt){
  const body={schema:UCE_SHARD_SCHEMA,shardKey,snapshot,receipt};
  const raw=JSON.stringify({...body,integrity:hash(JSON.stringify(body))});
  if(raw.length>UCE_SHARD_MAX_CHARS)return hold('world_shard_capacity_exceeded');
  if(!ASCII.test(raw))return hold('non_ascii_world_shard');
  return {ok:true,raw};
}
function unpack(raw,shardKey,worldId,epoch){
  if(typeof raw!=='string'||!raw||raw.length>UCE_SHARD_MAX_CHARS)
    return hold('world_shard_missing_or_oversized');
  let v;
  try{v=JSON.parse(raw);}catch(_){return hold('world_shard_invalid_json');}
  if(!v||v.schema!==UCE_SHARD_SCHEMA||v.shardKey!==shardKey||
     !v.snapshot||v.snapshot.worldId!==worldId||
     v.snapshot.epoch!==epoch||!v.receipt||
     v.receipt.epoch!==epoch||v.receipt.revision!==v.snapshot.revision||
     typeof v.receipt.operationId!=='string'||
     !ASCII.test(v.receipt.operationId)||v.receipt.operationId.length>256)
     return hold('invalid_world_shard_envelope');
  const good=inspectUnifiedOrdinaryLedger(v.snapshot);
  if(!good.ok)return hold('invalid_world_shard_ledger:'+good.reason);
  const checked=pack(shardKey,v.snapshot,v.receipt);
  if(!checked.ok)return checked;
  if(checked.raw!==raw)return hold('noncanonical_or_modified_world_shard');
  return {ok:true,value:v,raw};
}
function read(world,key){
  try{return {ok:true,value:world.getDynamicProperty(key)};}
  catch(_){return hold('world_property_read_failed');}
}
function authority(world,worldId,epoch){
  const r=read(world,UCE_AUTHORITY_KEY);
  if(!r.ok)return r;
  if(typeof r.value!=='string'||r.value.length>4096)
    return hold('world_ue_authority_missing');
  let v;
  try{v=JSON.parse(r.value);}catch(_){return hold('world_ue_authority_invalid');}
  if(!v||v.schema!==UCE_AUTHORITY_SCHEMA||v.state!=='ACTIVE'||
     v.worldId!==worldId||v.epoch!==epoch||
     v.writer!=='UCE_EXCLUSIVE'||v.q4LegacyWritersFenced!==true||
     v.migrationReconciled!==true)
    return hold('world_ue_authority_not_exclusive');
  return {ok:true};
}
function noLegacyJournal(world){
  for(const key of journals){
    const r=read(world,key);
    if(!r.ok)return r;
    if(r.value!==undefined&&r.value!==null&&r.value!=='')
      return hold('legacy_journal_pending');
  }
  return {ok:true};
}

/**
 * Shared UCE-only mutation fence for the ordinary and native storage ports.
 * Never infer exclusivity from a marker alone: the caller must wire a real
 * synchronous runtime writer exclusion inspection before enabling ACTIVE.
 */
export function verifyUnifiedMutationFence(world,worldId,epoch,externalFence,
    {allowedNativeOperationId=null,allowedBoundaryOperationId=null,
     allowedFederatedOperationId=null,
     allowedEmptyBulkRemovalOperationId=null}={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
      typeof externalFence!=='function')
    return hold('invalid_unified_mutation_fence');
  const a=authority(world,worldId,epoch);
  if(!a.ok)return a;
  const j=noLegacyJournal(world);
  if(!j.ok)return j;
  // The same UCE engine owns native and ordinary transfers. An unresolved
  // native intent freezes every unrelated ordinary-account mutation.
  const native=read(world,'hartlogistics:uce_native_intent_v1');
  if(!native.ok)return native;
  if(native.value!==undefined && native.value!==null &&
     native.value!=='') {
    let intent;
    try{intent=JSON.parse(native.value);}
    catch(_){return hold('native_intent_invalid_for_unified_fence');}
    if(!intent || intent.schema!=='hart-uce-native-intent-v1' ||
       intent.worldId!==worldId || intent.epoch!==epoch ||
       typeof intent.operationId!=='string'||!intent.operationId ||
       intent.operationId!==allowedNativeOperationId)
      return hold('native_intent_pending_global');
  }
  const boundary=read(world,'hartlogistics:uce_boundary_intent_v1');
  if(!boundary.ok)return boundary;
  if(boundary.value!==undefined && boundary.value!==null &&
     boundary.value!==''){
    let tx;
    try{tx=JSON.parse(boundary.value);}
    catch(_){return hold('boundary_intent_invalid_for_unified_fence');}
    if(!tx||tx.schema!=='hart-uce-ordinary-boundary-v1' ||
       tx.worldId!==worldId||tx.epoch!==epoch ||
       typeof tx.operationId!=='string'||!tx.operationId ||
       tx.operationId!==allowedBoundaryOperationId)
      return hold('ordinary_boundary_pending_global');
  }
  // One globally reserved inter-shard balance is protected from ALL
  // unrelated native, ordinary, link and account writers.
  const federated=read(world,UCE_FEDERATED_INTENT_KEY);
  if(!federated.ok)return federated;
  if(federated.value!==undefined && federated.value!==null &&
     federated.value!==''){
    let intent;
    try{intent=JSON.parse(federated.value);}
    catch(_){return hold('federated_intent_invalid_for_unified_fence');}
    if(!intent||intent.schema!==UCE_FEDERATED_SCHEMA||
       intent.worldId!==worldId||intent.epoch!==epoch||
       typeof intent.operationId!=='string'||!intent.operationId||
       intent.operationId!==allowedFederatedOperationId)
      return hold('federated_intent_pending_global');
  }
  // The PREPARED physical-removal marker blocks EVERY unrelated writer.
  // Never auto-clear a pending marker after partial world/shard saves.
  const removal=read(world,UCE_EMPTY_BULK_REMOVAL_KEY);
  if(!removal.ok)return removal;
  if(removal.value!==undefined&&removal.value!==null&&removal.value!==''){
    let intent;
    try{intent=JSON.parse(removal.value);}catch(_){
      return hold('empty_bulk_removal_intent_invalid');
    }
    if(!intent||intent.schema!==UCE_EMPTY_BULK_REMOVAL_SCHEMA||
       intent.worldId!==worldId||intent.epoch!==epoch||
       typeof intent.operationId!=='string'||!intent.operationId||
       intent.operationId!==allowedEmptyBulkRemovalOperationId)
      return hold('empty_bulk_removal_pending_global');
  }
  let exclusive=false;
  try{exclusive=externalFence()===true;}catch(_){};
  if(!exclusive)return hold('legacy_writer_exclusion_unproven');
  return {ok:true};
}

/** Read-only inspection of any existing one-property UCE shard, for
 * cold-import startup validation without assuming receipt GENESIS after moves.
 */
export function inspectUnifiedWorldShard({raw,shardKey,worldId,epoch}={}){
  if(!KEY.test(shardKey||'')||typeof worldId!=='string'||!pos(epoch))
    return hold('invalid_world_shard_inspection');
  const r=unpack(raw,shardKey,worldId,epoch);
  if(!r.ok)return r;
  return {ok:true,status:'WORLD_SHARD_INTEGRITY_VERIFIED',
    snapshot:r.value.snapshot,receipt:r.value.receipt,
    canMoveNative:false,canClearQ4:false,canCommitMigration:false};
}

/** Build an importable source value. Never writes a world or grants cutover. */
export function previewUnifiedShard({snapshot,shardKey}={}){
  if(!KEY.test(shardKey||''))return hold('invalid_world_shard_key');
  const valid=inspectUnifiedOrdinaryLedger(snapshot);
  if(!valid.ok)return hold('invalid_ledger:'+valid.reason);
  const p=pack(shardKey,snapshot,{operationId:'GENESIS',
    epoch:snapshot.epoch,revision:snapshot.revision});
  if(!p.ok)return p;
  return {ok:true,status:'WORLD_SHARD_SHADOW_DRAFT_ONLY',
    raw:p.raw,length:p.raw.length,canWriteWorld:false,
    canCommitMigration:false,canMoveNative:false,canClearQ4:false};
}

/**
 * An executable one-key internal-account transfer. No module-owned authority
 * initialization, background retry, native inventory move or Q4 debit.
 *
 * The callback must inspect the real Bedrock legacy writer state. A mock true
 * callback proves algorithm behavior only, not actual writer exclusion.
 */
export function createUnifiedShardWriter({world,shardKey,worldId,epoch,
    externalFence,verifyEscrowCustody,verifyInternalRoute,
    verifyBulkPlacement,verifyGlobalBulkUniqueness,
    verifyReceiverPlacement,verifyGlobalReceiverUniqueness,
    verifyReceiverReserveShard,verifyFederatedRoute,
    verifyBulkVacated}={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     typeof world.setDynamicProperty!=='function'||
     !KEY.test(shardKey||'')||typeof worldId!=='string'||
     !worldId||!ASCII.test(worldId)||!pos(epoch)||
     typeof externalFence!=='function')
    return hold('invalid_unified_shard_binding');
  let quarantine=null;
  function inspect(){
    const a=read(world,shardKey);
    if(!a.ok)return a;
    const parsed=unpack(a.value,shardKey,worldId,epoch);
    if(!parsed.ok)return parsed;
    const b=read(world,shardKey);
    if(!b.ok)return b;
    if(b.value!==a.value)return hold('world_shard_changed_during_inspection');
    return {ok:true,status:'WORLD_SHARD_READ_ONLY',
      snapshot:parsed.value.snapshot,
      lastReceipt:parsed.value.receipt,
      canMoveNative:false,canClearQ4:false,canCommitMigration:false};
  }
  function fence(boundaryOperationId=null,federatedOperationId=null,
                 emptyBulkRemovalOperationId=null){
    return verifyUnifiedMutationFence(world,worldId,epoch,externalFence,
      {allowedBoundaryOperationId:boundaryOperationId,
       allowedFederatedOperationId:federatedOperationId,
       allowedEmptyBulkRemovalOperationId:emptyBulkRemovalOperationId});
  }
  function applyInternalTransfer(args){
    if(quarantine)return hold('shard_session_quarantine:'+quarantine);
    if(typeof verifyInternalRoute!=='function')
      return hold('internal_route_proof_adapter_missing');
    const gate=fence();
    if(!gate.ok)return gate;
    const a=read(world,shardKey);
    if(!a.ok)return a;
    const parsed=unpack(a.value,shardKey,worldId,epoch);
    if(!parsed.ok)return parsed;
    const before=parsed.value.snapshot;
    if(!args||!nat(args.expectedRevision)||
       args.expectedRevision!==before.revision||
       args.expectedEpoch!==epoch||
       typeof args.operationId!=='string'||!args.operationId||
       args.operationId.length>256||!ASCII.test(args.operationId))
      return hold('invalid_or_stale_internal_intent');
    let liveRoute=false;
    try{liveRoute=verifyInternalRoute(args)===true;}catch(_){}
    if(!liveRoute)return hold('internal_bulk_route_unverified');
    const step=transitionUnifiedOrdinaryAccounts(before,args);
    if(!step.ok)return hold(step.reason);
    const receipt={operationId:args.operationId,epoch,
      revision:step.next.revision,beforeRevision:before.revision,
      from:args.from,to:args.to,key:args.key,count:args.count};
    const after=pack(shardKey,step.next,receipt);
    if(!after.ok)return after;
    const b=read(world,shardKey);
    if(!b.ok)return b;
    if(b.value!==a.value)return hold('world_shard_changed_prewrite');
    const gate2=fence();
    let stillRouted=false;
    try{stillRouted=verifyInternalRoute(args)===true;}catch(_){}
    if(!gate2.ok||!stillRouted)
      return hold('internal_route_or_writer_fence_changed_prewrite');
    try{world.setDynamicProperty(shardKey,after.raw);}
    catch(_){
      quarantine='write_outcome_ambiguous';
      return hold('world_shard_write_outcome_ambiguous');
    }
    const readback=read(world,shardKey);
    if(!readback.ok){
      quarantine='postwrite_unreadable';
      return hold('world_shard_postwrite_unreadable');
    }
    if(readback.value!==after.raw){
      quarantine='postwrite_mismatch';
      return hold('world_shard_postwrite_mismatch');
    }
    if(!unpack(readback.value,shardKey,worldId,epoch).ok){
      quarantine='postwrite_invalid';
      return hold('world_shard_postwrite_invalid');
    }
    return {ok:true,status:'ONE_RECORD_INTERNAL_TRANSFER_READBACK',
      receipt,beforeRevision:before.revision,afterRevision:step.next.revision,
      itemCount:step.next.total,canMoveNative:false,canClearQ4:false,
      canCommitMigration:false,hasHardCrashDiskProof:false};
  }
  /**
   * One account credit/debit from a held NATIVE ESCROW. Never execute against
   * a physical Hopper/chest alone. The same global boundary journal must
   * have been prepared before source moved to escrow or destination produced.
   * A matching durable receipt makes retries idempotent (read-only).
   *
   * This is part of the ONE UCE ledger writer, not another custody engine.
   */
  function applyBoundaryCommit(args){
    if(quarantine)return hold('shard_session_quarantine:'+quarantine);
    if(typeof verifyEscrowCustody!=='function')
      return hold('physical_escrow_proof_adapter_missing');
    if(!args||typeof args.operationId!=='string'||
       !args.operationId||args.operationId.length>256||
       !ASCII.test(args.operationId))
      return hold('invalid_boundary_commit_request');
    const gate=fence(args.operationId);
    if(!gate.ok)return gate;
    const outer=read(world,'hartlogistics:uce_boundary_intent_v1');
    if(!outer.ok)return outer;
    let tx;
    try{tx=JSON.parse(outer.value);}
    catch(_){return hold('boundary_intent_unreadable');}
    if(!tx||tx.schema!=='hart-uce-ordinary-boundary-v1'||
       tx.phase!=='ESCROW_READY'||tx.worldId!==worldId||
       tx.epoch!==epoch||tx.operationId!==args.operationId||
       tx.direction!==args.direction||tx.accountId!==args.accountId||
       tx.key!==args.key||tx.count!==args.count||
       tx.expectedRevision!==args.expectedRevision)
      return hold('boundary_intent_not_commit_ready');
    const a=read(world,shardKey);
    if(!a.ok)return a;
    const parsed=unpack(a.value,shardKey,worldId,epoch);
    if(!parsed.ok)return parsed;
    const previous=parsed.value;
    // A write may have succeeded before a BDS callback threw or crashed.
    // Recognize the SAME receipt; never credit/debit twice.
    if(previous.receipt?.operationId===args.operationId){
      if(previous.receipt.kind!=='BOUNDARY'||
         previous.receipt.direction!==args.direction||
         previous.receipt.accountId!==args.accountId||
         previous.receipt.key!==args.key||
         previous.receipt.count!==args.count)
        return hold('boundary_receipt_identity_conflict');
      return {ok:true,status:'BOUNDARY_ACCOUNT_ALREADY_COMMITTED',
        receipt:previous.receipt,canMoveNative:false,
        hasHardCrashDiskProof:false};
    }
    if(previous.snapshot.revision!==args.expectedRevision||
       args.expectedEpoch!==epoch)
      return hold('stale_boundary_account_revision');
    let escrow=false;
    try{escrow=verifyEscrowCustody(tx)===true;}catch(_){}
    if(!escrow)return hold('native_escrow_custody_unverified');
    const step=transitionUnifiedOrdinaryBoundary(previous.snapshot,args);
    if(!step.ok)return hold(step.reason);
    const receipt={kind:'BOUNDARY',operationId:args.operationId,epoch,
      revision:step.next.revision,beforeRevision:previous.snapshot.revision,
      direction:args.direction,accountId:args.accountId,
      key:args.key,count:args.count};
    const after=pack(shardKey,step.next,receipt);
    if(!after.ok)return after;
    const check=read(world,shardKey);
    if(!check.ok)return check;
    if(check.value!==a.value)return hold('boundary_account_changed_prewrite');
    const gate2=fence(args.operationId);
    let stillHeld=false;
    try{stillHeld=verifyEscrowCustody(tx)===true;}catch(_){}
    if(!gate2.ok||!stillHeld)
      return hold('boundary_escrow_or_fence_changed_prewrite');
    try{world.setDynamicProperty(shardKey,after.raw);}
    catch(_){
      quarantine='boundary_write_outcome_ambiguous';
      return hold('boundary_account_write_ambiguous');
    }
    const readback=read(world,shardKey);
    if(!readback.ok||readback.value!==after.raw ||
       !unpack(readback.value,shardKey,worldId,epoch).ok){
      quarantine='boundary_account_readback_mismatch';
      return hold('boundary_account_postwrite_mismatch');
    }
    return {ok:true,status:'BOUNDARY_ACCOUNT_WRITE_READBACK',
      receipt,accountTotal:step.next.total,
      hasHardCrashDiskProof:false,canMoveNative:false};
  }

  /**
   * One side of a virtual ordinary transfer between DIFFERENT sealed
   * shards. This is the SAME one-key UCE shard writer, not a new balance
   * engine. A global PREPARED journal owns the count between both receipts.
   * Interrupted writes HOLD; no automatic replay or hard-crash disk proof.
   */
  function applyFederatedSide(args){
    if(quarantine)return hold('shard_session_quarantine:'+quarantine);
    if(typeof verifyFederatedRoute!=='function')
      return hold('federated_route_proof_adapter_missing');
    const {operationId,fromShard,toShard,fromAccount,toAccount,
      key,count,direction,expectedRevision,expectedEpoch}=args||{};
    const isDebit=direction==='withdraw';
    const accountId=isDebit?fromAccount:toAccount;
    if(!operationId||typeof operationId!=='string'||
       operationId.length>256||!ASCII.test(operationId)||
       !KEY.test(fromShard||'')||!KEY.test(toShard||'')||
       fromShard===toShard||
       shardKey!==(isDebit?fromShard:toShard)||
       !['withdraw','deposit'].includes(direction)||
       !nat(expectedRevision)||expectedEpoch!==epoch)
      return hold('invalid_federated_side_request');
    const gate=fence(null,operationId);
    if(!gate.ok)return gate;
    const global=read(world,UCE_FEDERATED_INTENT_KEY);
    if(!global.ok)return global;
    let tx;
    try{tx=JSON.parse(global.value);}
    catch(_){return hold('federated_intent_unreadable');}
    const phase=isDebit?'PREPARED':'DEBIT_INSPECTED';
    const expected=isDebit?tx?.fromRevision:tx?.toRevision;
    if(!tx||tx.schema!==UCE_FEDERATED_SCHEMA||tx.phase!==phase||
       tx.worldId!==worldId||tx.epoch!==epoch||
       tx.operationId!==operationId||
       tx.fromShard!==fromShard||tx.toShard!==toShard||
       tx.fromAccount!==fromAccount||tx.toAccount!==toAccount||
       tx.key!==key||tx.count!==count||
       expected!==expectedRevision)
      return hold('federated_intent_not_ready_for_side');
    // Credit must see the durable source debit before mutating its shard.
    const sourceReceiptReady=()=>{
      if(isDebit)return true;
      const seen=read(world,fromShard);
      if(!seen.ok)return false;
      const src=unpack(seen.value,fromShard,worldId,epoch);
      if(!src.ok)return false;
      const r=src.value.receipt;
      const snap=src.value.snapshot;
      const owner=snap.accounts.find(a=>a.id===fromAccount);
      const remaining=owner?.buckets.find(b=>b.key===key)?.count||0;
      // Credit requires the *current* source state, not merely a matching
      // historical operation ID on some syntactically valid shard receipt.
      return r?.kind==='FEDERATED_DEBIT'&&
        r.operationId===operationId&&
        r.accountId===fromAccount&&r.key===key&&r.count===count&&
        r.fromShard===fromShard&&r.toShard===toShard&&
        r.direction==='withdraw'&&r.epoch===epoch&&
        r.beforeRevision===tx.fromRevision&&
        r.revision===tx.fromRevision+1&&
        snap.revision===r.revision&&
        snap.total===tx.sourceTotal-count&&
        remaining===tx.sourceCount-count;
    };
    const routed=()=>{
      try{return verifyFederatedRoute(tx,direction)===true&&
        sourceReceiptReady();}catch(_){return false;}
    };
    if(!routed())return hold('federated_topology_or_debit_unverified');
    const old=read(world,shardKey);
    if(!old.ok)return old;
    const parsed=unpack(old.value,shardKey,worldId,epoch);
    if(!parsed.ok)return parsed;
    const prior=parsed.value;
    const kind=isDebit?'FEDERATED_DEBIT':'FEDERATED_CREDIT';
    if(prior.receipt.operationId===operationId){
      const r=prior.receipt;
      if(r.kind!==kind||r.accountId!==accountId||
         r.key!==key||r.count!==count||
         r.fromShard!==fromShard||r.toShard!==toShard)
        return hold('federated_receipt_identity_conflict');
      return {ok:true,status:'FEDERATED_SIDE_ALREADY_COMMITTED',
        receipt:r,canMoveNative:false,hasHardCrashDiskProof:false};
    }
    if(prior.snapshot.revision!==expectedRevision)
      return hold('federated_shard_stale_revision');
    const step=transitionUnifiedOrdinaryBoundary(prior.snapshot,{
      operationId,accountId,key,count,direction,
      expectedRevision,expectedEpoch:epoch});
    if(!step.ok)return hold('federated_side_'+step.reason);
    const receipt={kind,operationId,accountId,key,count,
      direction,fromShard,toShard,epoch,
      revision:step.next.revision,
      beforeRevision:prior.snapshot.revision};
    const packed=pack(shardKey,step.next,receipt);
    if(!packed.ok)return packed;
    const again=read(world,shardKey);
    if(!again.ok||again.value!==old.value)
      return hold('federated_shard_changed_prewrite');
    const check=fence(null,operationId);
    const globalStill=read(world,UCE_FEDERATED_INTENT_KEY);
    if(!check.ok||!globalStill.ok||globalStill.value!==global.value||
       !routed())return hold('federated_route_or_intent_changed_prewrite');
    try{world.setDynamicProperty(shardKey,packed.raw);}
    catch(_){
      quarantine='federated_write_outcome_ambiguous';
      return hold('federated_shard_write_ambiguous');
    }
    const posted=read(world,shardKey);
    if(!posted.ok||posted.value!==packed.raw||
       !unpack(posted.value,shardKey,worldId,epoch).ok){
      quarantine='federated_postwrite_readback_invalid';
      return hold('federated_shard_readback_mismatch');
    }
    return {ok:true,status:'FEDERATED_SIDE_READBACK',
      receipt,canMoveNative:false,hasHardCrashDiskProof:false};
  }

  /**
   * Register a NEW physically verified Bulk Storage member inside one
   * pre-sealed Receiver shard. The member has zero balance and no separate
   * virtual queue. The first local bank becomes controller; independent
   * sealed Receiver regions may have independent controllers.
   *
   * The two callbacks must inspect the real loaded block and every sealed
   * shard, respectively. Source-only mocks do not prove live ownership.
   */
  function registerBulkMember({ownerId,operationId,
      expectedRevision,expectedEpoch}={}){
    if(quarantine)return hold('shard_session_quarantine:'+quarantine);
    if(typeof verifyBulkPlacement!=='function'||
       typeof verifyGlobalBulkUniqueness!=='function')
      return hold('bulk_world_placement_verification_unbound');
    if(typeof ownerId!=='string'||!ownerId||ownerId.length>256||
       !ASCII.test(ownerId)||typeof operationId!=='string'||
       !operationId||operationId.length>256||!ASCII.test(operationId)||
       !nat(expectedRevision)||expectedEpoch!==epoch)
      return hold('invalid_bulk_registration_request');
    const gate=fence();
    if(!gate.ok)return gate;
    const a=read(world,shardKey);
    if(!a.ok)return a;
    const parsed=unpack(a.value,shardKey,worldId,epoch);
    if(!parsed.ok)return parsed;
    const before=parsed.value.snapshot;
    if(before.revision!==expectedRevision ||
       !before.accounts.some(x=>x.kind==='receiver'))
      return hold('stale_or_unanchored_bulk_registration');
    let place=false,unique=false;
    try{
      place=verifyBulkPlacement(ownerId,shardKey)===true;
      unique=verifyGlobalBulkUniqueness(ownerId,shardKey)===true;
    }catch(_){}
    if(!place||!unique)return hold('bulk_placement_or_global_identity_unproven');
    const step=registerUnifiedEmptyAccount(before,{kind:'bulk',
      ownerId,expectedRevision,expectedEpoch:epoch});
    if(!step.ok)return hold(step.reason);
    const receipt={kind:'REGISTER_BULK',operationId,epoch,
      revision:step.next.revision,beforeRevision:before.revision,
      accountId:'bulk:'+ownerId,shardKey};
    const updated=pack(shardKey,step.next,receipt);
    if(!updated.ok)return updated;
    const check=read(world,shardKey);
    if(!check.ok)return check;
    if(check.value!==a.value)return hold('bulk_account_changed_prewrite');
    const again=fence();
    let stillPlace=false,stillUnique=false;
    try{
      stillPlace=verifyBulkPlacement(ownerId,shardKey)===true;
      stillUnique=verifyGlobalBulkUniqueness(ownerId,shardKey)===true;
    }catch(_){}
    if(!again.ok||!stillPlace||!stillUnique)
      return hold('bulk_owner_or_fence_changed_prewrite');
    try{world.setDynamicProperty(shardKey,updated.raw);}
    catch(_){
      quarantine='bulk_registration_write_ambiguous';
      return hold('bulk_registration_write_ambiguous');
    }
    const saved=read(world,shardKey);
    if(!saved.ok||saved.value!==updated.raw ||
       !unpack(saved.value,shardKey,worldId,epoch).ok){
      quarantine='bulk_registration_readback_mismatch';
      return hold('bulk_registration_readback_mismatch');
    }
    return {ok:true,status:'BULK_ACCOUNT_REGISTERED_SAME_LEDGER',
      accountId:receipt.accountId,revision:step.next.revision,
      controllerOwnerId:step.next.accounts.find(x=>
        x.id===receipt.accountId).controllerOwnerId,
      receipt,canMoveNative:false,canClearQ4:false};
  }


  /**
   * Remove exactly one fully drained Bulk member in this shard.
   * Global PREPARED marker must be owned by the requesting operation, and
   * physical AIR must be authenticated again before the one-property write.
   */
  function retireEmptyBulkMember({ownerId,operationId,expectedRevision,
      expectedEpoch}={}){
    if(quarantine)return hold('shard_session_quarantine:'+quarantine);
    if(typeof verifyBulkVacated!=='function')
      return hold('bulk_vacated_world_proof_missing');
    if(typeof ownerId!=='string'||!ownerId||!ASCII.test(ownerId)||
       typeof operationId!=='string'||!operationId||
       !ASCII.test(operationId)||operationId.length>256||
       !nat(expectedRevision)||expectedEpoch!==epoch)
      return hold('invalid_empty_bulk_retirement_request');
    const gate=fence(null,null,operationId);
    if(!gate.ok)return gate;
    const a=read(world,shardKey);
    if(!a.ok)return a;
    const parsed=unpack(a.value,shardKey,worldId,epoch);
    if(!parsed.ok)return parsed;
    const before=parsed.value.snapshot;
    if(before.revision!==expectedRevision)
      return hold('stale_empty_bulk_retirement_revision');
    const proved=()=>{
      try{return verifyBulkVacated(ownerId,shardKey,operationId)===true;}
      catch(_){return false;}
    };
    if(!proved())return hold('bulk_physical_vacancy_not_verified');
    const step=retireUnifiedEmptyBulkAccount(before,{
      ownerId,expectedRevision,expectedEpoch});
    if(!step.ok)return hold(step.reason);
    const receipt={kind:'RETIRE_EMPTY_BULK',operationId,epoch,
      revision:step.next.revision,beforeRevision:before.revision,
      accountId:'bulk:'+ownerId,shardKey,
      retiredLifetime:step.retiredLifetime};
    const updated=pack(shardKey,step.next,receipt);
    if(!updated.ok)return updated;
    const current=read(world,shardKey);
    if(!current.ok||current.value!==a.value)
      return hold('bulk_retirement_shard_changed_prewrite');
    if(!fence(null,null,operationId).ok||!proved())
      return hold('bulk_retirement_fence_or_block_changed');
    try{world.setDynamicProperty(shardKey,updated.raw);}catch(_){
      quarantine='bulk_retirement_write_ambiguous';
      return hold('bulk_retirement_write_ambiguous');
    }
    const saved=read(world,shardKey);
    if(!saved.ok||saved.value!==updated.raw||
       !unpack(saved.value,shardKey,worldId,epoch).ok){
      quarantine='bulk_retirement_readback_mismatch';
      return hold('bulk_retirement_readback_mismatch');
    }
    return {ok:true,status:'BULK_ACCOUNT_RETIRED_SAME_LEDGER',
      accountId:receipt.accountId,controllerOwnerId:step.controllerOwnerId,
      receipt,canClearQ4:false};
  }

  /**
   * Atomic empty-Receiver ownership registration in a pre-sealed reserve.
   * The ONLY persisted mutation is this existing UCE shard property. No new
   * Q4 queue, link writer, second index, item movement, or automatic retry.
   * Runtime rehydrates identities from the shard after each server restart.
   */
  function registerNewReceiver({ownerId,anchor,operationId,
      expectedRevision,expectedEpoch}={}){
    if(quarantine)return hold('shard_session_quarantine:'+quarantine);
    if(typeof verifyReceiverPlacement!=='function'||
       typeof verifyGlobalReceiverUniqueness!=='function'||
       typeof verifyReceiverReserveShard!=='function')
      return hold('receiver_world_verification_unbound');
    if(!anchor||typeof anchor.dimensionId!=='string'||
       !anchor.dimensionId||!ASCII.test(anchor.dimensionId)||
       !Number.isSafeInteger(anchor.x)||
       !Number.isSafeInteger(anchor.y)||
       !Number.isSafeInteger(anchor.z)||
       ownerId!==anchor.dimensionId+'|'+anchor.x+'|'+anchor.y+'|'+anchor.z||
       typeof operationId!=='string'||!operationId||
       operationId.length>256||!ASCII.test(operationId)||
       !nat(expectedRevision)||expectedEpoch!==epoch)
      return hold('invalid_new_receiver_registration_request');
    const gate=fence();
    if(!gate.ok)return gate;
    const old=read(world,shardKey);
    if(!old.ok)return old;
    const parsed=unpack(old.value,shardKey,worldId,epoch);
    if(!parsed.ok)return parsed;
    const before=parsed.value.snapshot;
    if(before.revision!==expectedRevision||before.accounts.length!==0||
       before.sourceReceivers.length!==0||before.total!==0)
      return hold('receiver_reserve_not_empty');
    const proved=()=>{
      try{return verifyReceiverReserveShard(shardKey)===true&&
        verifyReceiverPlacement(ownerId,anchor)===true&&
        verifyGlobalReceiverUniqueness(ownerId)===true;}
      catch(_){return false;}
    };
    if(!proved())return hold('receiver_placement_or_uniqueness_unproven');
    const step=registerUnifiedEmptyAccount(before,{
      kind:'receiver',ownerId,expectedRevision,expectedEpoch:epoch});
    if(!step.ok)return hold(step.reason);
    const account=step.next.accounts.find(a=>a.id==='receiver:'+ownerId);
    if(!account)return hold('new_receiver_account_missing');
    account.uceAnchor={dimensionId:anchor.dimensionId,
      x:anchor.x,y:anchor.y,z:anchor.z};
    const valid=inspectUnifiedOrdinaryLedger(step.next);
    if(!valid.ok)return hold(valid.reason);
    const receipt={kind:'REGISTER_RECEIVER',operationId,epoch,
      revision:step.next.revision,beforeRevision:before.revision,
      accountId:account.id,shardKey};
    const updated=pack(shardKey,step.next,receipt);
    if(!updated.ok)return updated;
    const last=read(world,shardKey);
    if(!last.ok)return last;
    if(last.value!==old.value)return hold('receiver_reserve_changed_prewrite');
    const still=fence();
    if(!still.ok||!proved())
      return hold('receiver_owner_or_fence_changed_prewrite');
    try{world.setDynamicProperty(shardKey,updated.raw);}
    catch(_){
      quarantine='receiver_registration_write_ambiguous';
      return hold('receiver_registration_write_ambiguous');
    }
    const saved=read(world,shardKey);
    if(!saved.ok||saved.value!==updated.raw||
       !unpack(saved.value,shardKey,worldId,epoch).ok){
      quarantine='receiver_registration_readback_mismatch';
      return hold('receiver_registration_readback_mismatch');
    }
    return {ok:true,status:'RECEIVER_REGISTERED_SAME_LEDGER',
      accountId:account.id,shardKey,revision:step.next.revision,
      receipt,canWriteQueue:false,canClearQ4:false};
  }

  return {ok:true,inspect,applyInternalTransfer,applyBoundaryCommit,
    applyFederatedSide,registerBulkMember,retireEmptyBulkMember,
    registerNewReceiver,
    getSessionQuarantine:()=>quarantine};
}
