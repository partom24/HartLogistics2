/**
 * HartLogistics2 Unified Custody Engine — ordinary account kernel.
 *
 * Receivers and Bulk members are accounts in ONE ownership ledger, not Q4/Q5
 * queues and independent Bulk stores. This module is pure source logic: it
 * never accesses Bedrock, mutates an inventory, issues a journal, writes a
 * property, or authorizes a Q4 cutover. The caller must provide independently
 * frozen, reconciled Q4 observations and actual runtime item certifications.
 *
 * Existing strict Q4 readers and Q5 item-shape classifier are REUSED rather
 * than copied or turned into additional writers.
 */
import {q5IdentityKey} from './q5_bucket_core.mjs';
import {inspectQ4OrdinaryDefinitionShape} from './q5_ordinary_shape_gate.mjs';

export const UCE_LEDGER_SCHEMA = 'hart-uce-ordinary-accounts-v1';
export const UCE_RECEIVER_CAPACITY = 250000;
export const UCE_BULK_MEMBER_CAPACITY = 200000;
const pos = n => Number.isSafeInteger(n) && n > 0;
const nat = n => Number.isSafeInteger(n) && n >= 0;
const idOK = s => typeof s === 'string' && s.length > 0 && s.length <= 256;
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const denied = reason => ({
  ok:false, status:'HOLD', reason, canWriteWorld:false,
  canMoveItems:false, canCommitMigration:false, canClearQ4:false
});
const noAuthority = {
  canWriteWorld:false, canMoveItems:false,
  canCommitMigration:false, canClearQ4:false
};
const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const keyCheck = key => {
  if (typeof key !== 'string') return false;
  try {
    const decoded = JSON.parse(key);
    const result = inspectQ4OrdinaryDefinitionShape(decoded);
    return result.ok === true && result.key === key &&
      q5IdentityKey(decoded) === key;
  } catch (_) { return false; }
};

function inspectAccount(account) {
  if (!account || !idOK(account.id) ||
      !['receiver','bulk'].includes(account.kind) ||
      !idOK(account.ownerId) ||
      account.id !== account.kind + ':' + account.ownerId ||
      account.capacity !== (account.kind === 'receiver'
        ? UCE_RECEIVER_CAPACITY : UCE_BULK_MEMBER_CAPACITY) ||
      !nat(account.total) || account.total > account.capacity ||
      !Array.isArray(account.buckets) || !account.lifetime ||
      !nat(account.lifetime.received) || !nat(account.lifetime.delivered))
    return denied('invalid_account');
  let total=0, previous=null;
  for (const b of account.buckets) {
    if (!b || !keyCheck(b.key) || !pos(b.count) ||
        (previous !== null && order(previous,b.key) >= 0)) {
      return denied('invalid_or_unsorted_ordinary_bucket');
    }
    previous=b.key;
    total+=b.count;
    if (!nat(total) || total > account.capacity) {
      return denied('account_capacity_exceeded');
    }
  }
  if (total !== account.total) return denied('account_total_mismatch');
  if (account.kind === 'receiver') {
    const q=account.legacyQ4;
    if (q !== undefined && (!q || !/^q[1-9][0-9]*$/.test(q.queueKey) ||
        !/^fnv32:[0-9a-f]{8}$/.test(q.fingerprint) ||
        !nat(q.head) || !nat(q.tail) || !pos(q.next) ||
        !nat(q.received) || !nat(q.delivered))) {
      return denied('invalid_receiver_legacy_provenance');
    }
  } else if (account.legacyQ4 !== undefined) {
    return denied('bulk_has_legacy_q4');
  }
  return {ok:true};
}

/**
 * Validate an entire immutable ledger value. No success here authorizes world
 * storage: Bedrock disk atomicity and external-writer exclusion are separate.
 */
export function inspectUnifiedOrdinaryLedger(snapshot) {
  if (!snapshot || snapshot.schema !== UCE_LEDGER_SCHEMA ||
      !idOK(snapshot.worldId) || !pos(snapshot.epoch) ||
      !nat(snapshot.revision) || !nat(snapshot.total) ||
      !Array.isArray(snapshot.accounts) ||
      !Array.isArray(snapshot.sourceReceivers)) {
    return denied('invalid_ledger_header');
  }
  let total=0,prev=null,receivers=0;
  const seenQueueKeys=new Set();
  for (const a of snapshot.accounts) {
    const check=inspectAccount(a);
    if (!check.ok) return check;
    if (prev !== null && order(prev,a.id)>=0)
      return denied('duplicate_or_unordered_account');
    prev=a.id;
    total+=a.total;
    if (!nat(total)) return denied('ledger_total_overflow');
    if (a.kind === 'receiver') {
      receivers++;
      if (a.legacyQ4 !== undefined) {
        if (seenQueueKeys.has(a.legacyQ4.queueKey))
          return denied('duplicate_legacy_queue_key');
        seenQueueKeys.add(a.legacyQ4.queueKey);
      }
    }
  }
  if (total!==snapshot.total)
    return denied('ledger_conservation_mismatch');
  if (seenQueueKeys.size!==snapshot.sourceReceivers.length)
    return denied('source_provenance_count_mismatch');
  let sourcePrev=null;
  for (const source of snapshot.sourceReceivers) {
    if (!source || !idOK(source.id) ||
        !/^q[1-9][0-9]*$/.test(source.queueKey) ||
        !/^fnv32:[0-9a-f]{8}$/.test(source.fingerprint) ||
        (sourcePrev!==null && order(sourcePrev,source.id)>=0))
      return denied('invalid_source_census');
    sourcePrev=source.id;
    const account=snapshot.accounts.find(a=>a.id==='receiver:'+source.id);
    if (!account || !account.legacyQ4 ||
        account.legacyQ4.queueKey!==source.queueKey ||
        account.legacyQ4.fingerprint!==source.fingerprint ||
        (snapshot.revision===0 && account.total!==source.itemCount))
      return denied('source_account_mismatch');
  }
  return {ok:true,status:'LEDGER_CONSISTENT_SOURCE_ONLY',
    accountCount:snapshot.accounts.length,receiverCount:receivers,total,
    ...noAuthority};
}

/**
 * Create an empty world ledger for a brand-new world. No Q4 linkage or
 * migration-mode assertion is implied by constructing this source value.
 */
export function createEmptyUnifiedOrdinaryLedger({worldId,epoch}={}) {
  if (!idOK(worldId) || !pos(epoch)) return denied('invalid_new_world_identity');
  const snapshot={
    schema:UCE_LEDGER_SCHEMA,worldId,epoch,revision:0,total:0,
    accounts:[],sourceReceivers:[]
  };
  return {ok:true,status:'EMPTY_ORDINARY_LEDGER_DRAFT_ONLY',
    snapshot,...noAuthority};
}

/**
 * Register a genuinely new empty Receiver or Bulk member; a legacy imported
 * Receiver is NEVER re-created under another account ID. No item mutation.
 * Physical placement and authoritative identity are checked by the caller.
 */
export function registerUnifiedEmptyAccount(snapshot,{kind,ownerId,
    expectedRevision,expectedEpoch}={}) {
  const valid=inspectUnifiedOrdinaryLedger(snapshot);
  if (!valid.ok) return valid;
  if (!['receiver','bulk'].includes(kind) || !idOK(ownerId) ||
      !nat(expectedRevision) || snapshot.revision!==expectedRevision ||
      expectedEpoch!==snapshot.epoch) {
    return denied('invalid_or_stale_registration');
  }
  const id=kind+':'+ownerId;
  if (snapshot.accounts.some(a=>a.id===id)) return denied('duplicate_account');
  if (!nat(snapshot.revision+1)) return denied('ledger_version_overflow');
  const next=JSON.parse(JSON.stringify(snapshot));
  next.accounts.push({
    id,kind,ownerId,
    capacity:kind==='receiver'?UCE_RECEIVER_CAPACITY:UCE_BULK_MEMBER_CAPACITY,
    total:0,buckets:[],lifetime:{received:0,delivered:0}
  });
  next.accounts.sort((a,b)=>order(a.id,b.id));
  next.revision++;
  const check=inspectUnifiedOrdinaryLedger(next);
  if (!check.ok) return check;
  return {ok:true,status:'EMPTY_ACCOUNT_REGISTRATION_DRAFT_ONLY',
    next,registeredId:id,hasWorldIdentityProof:false,...noAuthority};
}

/**
 * Build accounts from actual-shape, read-only q4 snapshot objects.
 *
 * worldCensus: output from previewQ5WorldQ4Census (source-only).
 * sourceSnapshots: output from readOnlyQ4Snapshot for EVERY census Receiver.
 * ordinaryProofs: per-serialized-item live-classification witnesses supplied by
 * caller. These can be modeled assertions; they are NOT authenticated by us.
 *
 * Strict all-or-HOLD semantics: no MR item, missing Receiver, stale fingerprint,
 * unknown ordinary identity, incomplete census or unsupported legacy data can
 * be quietly skipped. Preserve original received/delivered counters and pages.
 */
export function stageUnifiedOrdinaryAccounts({
  worldCensus, sourceSnapshots, ordinaryProofs,
  bulkMemberIds=[], epoch
}={}) {
  if (!worldCensus || worldCensus.ok !== true ||
      worldCensus.status !== 'WORLD_Q4_CENSUS_READ_ONLY_ONLY' ||
      !idOK(worldCensus.worldId) || !pos(epoch) ||
      !Array.isArray(worldCensus.receivers) ||
      !nat(worldCensus.itemCount) ||
      !Array.isArray(sourceSnapshots) ||
      sourceSnapshots.length!==worldCensus.receivers.length ||
      !(ordinaryProofs instanceof Map) || !Array.isArray(bulkMemberIds) ||
      new Set(bulkMemberIds).size!==bulkMemberIds.length ||
      bulkMemberIds.some(id=>!idOK(id)))
    return denied('invalid_cold_import_inputs');

  const sourceById=new Map();
  for (const source of sourceSnapshots) {
    if (!source || source.ok!==true ||
        source.status!=='STRUCTURAL_Q4_OBSERVATION_ONLY' ||
        source.hasDurableRevision!==false || !idOK(source.receiverId) ||
        sourceById.has(source.receiverId))
      return denied('untrusted_or_duplicate_q4_snapshot');
    sourceById.set(source.receiverId,source);
  }
  const accounts=[], sources=[], usedKeys=new Set(),usedQueueKeys=new Set();
  let global=0;
  for (const receiver of worldCensus.receivers) {
    const source=sourceById.get(receiver.id);
    if (!source || source.queueKey!==receiver.queueKey ||
        source.snapshotFingerprint!==receiver.fingerprint ||
        source.total!==receiver.itemCount ||
        usedQueueKeys.has(receiver.queueKey) ||
        !source.metadata || !nat(source.metadata.received) ||
        !nat(source.metadata.delivered) ||
        !nat(source.metadata.head) || !nat(source.metadata.tail) ||
        !pos(source.metadata.next) || !Array.isArray(source.entries)) {
      return denied('q4_census_snapshot_mismatch');
    }
    usedQueueKeys.add(receiver.queueKey);
    let accountTotal=0;
    const counts=new Map();
    for (const entry of source.entries) {
      if (!entry || !pos(entry.amount)) return denied('invalid_q4_amount');
      const shape=inspectQ4OrdinaryDefinitionShape(entry.definition);
      if (!shape.ok) return denied('q4_not_ordinary:'+shape.reason);
      const proof=ordinaryProofs.get(shape.key);
      if (!proof || proof.classification!=='ordinary' ||
          proof.losslessIdentity!==true ||
          proof.metadataFree!==true ||
          proof.runtimeStackable!==true ||
          !pos(proof.runtimeMaxStack) || proof.runtimeMaxStack<=1 ||
          proof.verifiedFreshRoundTrip!==true)
        return denied('uncertified_ordinary_identity');
      usedKeys.add(shape.key);
      accountTotal+=entry.amount;
      if (!nat(accountTotal) ||
          accountTotal>UCE_RECEIVER_CAPACITY)
        return denied('receiver_capacity_exceeded');
      counts.set(shape.key,(counts.get(shape.key)||0)+entry.amount);
    }
    if (accountTotal!==source.total)
      return denied('receiver_count_mismatch');
    global+=accountTotal;
    if (!nat(global)) return denied('global_count_overflow');
    accounts.push({
      id:'receiver:'+receiver.id,kind:'receiver',
      ownerId:receiver.id,capacity:UCE_RECEIVER_CAPACITY,total:accountTotal,
      lifetime:{received:source.metadata.received,
                delivered:source.metadata.delivered},
      buckets:[...counts].sort(([a],[b])=>order(a,b))
        .map(([key,count])=>({key,count})),
      legacyQ4:{queueKey:receiver.queueKey,
        fingerprint:source.snapshotFingerprint,
        head:source.metadata.head,tail:source.metadata.tail,
        next:source.metadata.next,received:source.metadata.received,
        delivered:source.metadata.delivered}
    });
    sources.push({id:receiver.id,queueKey:receiver.queueKey,
      fingerprint:source.snapshotFingerprint,itemCount:source.total});
  }
  if (global!==worldCensus.itemCount ||
      usedKeys.size!==ordinaryProofs.size ||
      [...ordinaryProofs.keys()].some(key=>!usedKeys.has(key)))
    return denied('world_count_or_certification_mismatch');

  for (const ownerId of bulkMemberIds) {
    accounts.push({id:'bulk:'+ownerId,kind:'bulk',ownerId,
      capacity:UCE_BULK_MEMBER_CAPACITY,total:0,buckets:[],
      lifetime:{received:0,delivered:0}});
  }
  accounts.sort((a,b)=>order(a.id,b.id));
  sources.sort((a,b)=>order(a.id,b.id));
  const snapshot={
    schema:UCE_LEDGER_SCHEMA,worldId:worldCensus.worldId,
    epoch,revision:0,total:global,accounts,sourceReceivers:sources
  };
  const validated=inspectUnifiedOrdinaryLedger(snapshot);
  if (!validated.ok) return validated;
  return {ok:true,status:'COLD_Q4_ACCOUNT_DRAFT_ONLY',snapshot,
    matchedReceivers:sources.length,itemCount:global,
    sourceIsReadOnly:true,hasAuthenticatedFreeze:false,
    hasAtomicBedrockSaveProof:false,...noAuthority};
}

/**
 * Compute a single-version intra-ledger ownership change. For Receiver -> Bulk
 * and Bulk -> Receiver this is ONE candidate revised value, not two separate
 * destructive queue writes. The caller owns durable writer admission and the
 * persistence/receipt protocol; this function NEVER applies a world mutation.
 *
 * A repeated old request is refused by expectedRevision (no replay debit).
 * No implicit wildcard permission or destination selection is provided.
 */
export function transitionUnifiedOrdinaryAccounts(snapshot,{
  operationId,from,to,key,count,expectedRevision,expectedEpoch
}={}) {
  const valid=inspectUnifiedOrdinaryLedger(snapshot);
  if (!valid.ok) return valid;
  if (!idOK(operationId) || !idOK(from) || !idOK(to) ||
      from===to || !keyCheck(key) || !pos(count) ||
      !nat(expectedRevision) || expectedRevision!==snapshot.revision ||
      expectedEpoch!==snapshot.epoch)
    return denied('invalid_or_stale_transfer_request');
  const src=snapshot.accounts.find(a=>a.id===from);
  const dst=snapshot.accounts.find(a=>a.id===to);
  if (!src || !dst) return denied('unknown_account');
  if ((src.buckets.find(b=>b.key===key)?.count||0)<count)
    return denied('insufficient_source_balance');
  if (dst.total+count>dst.capacity)
    return denied('destination_full');
  if (!nat(snapshot.total) || !nat(snapshot.revision+1))
    return denied('ledger_version_overflow');
  // Deep copy only after strict structural validation. Never mutate caller.
  const next=JSON.parse(JSON.stringify(snapshot));
  const a=next.accounts.find(x=>x.id===from);
  const b=next.accounts.find(x=>x.id===to);
  const prior=a.buckets.find(x=>x.key===key);
  prior.count-=count;
  if (prior.count===0) a.buckets=a.buckets.filter(x=>x.key!==key);
  const existing=b.buckets.find(x=>x.key===key);
  if (existing) existing.count+=count;
  else b.buckets.push({key,count});
  b.buckets.sort((x,y)=>order(x.key,y.key));
  a.total-=count;
  b.total+=count;
  // Original 1.4.1 lifetime numbers are historical provenance. UCE live
  // counters evolve independently without changing the frozen q4 metadata.
  if(a.kind==='receiver')a.lifetime.delivered+=count;
  if(b.kind==='receiver')b.lifetime.received+=count;
  if(!nat(a.lifetime.delivered)||!nat(b.lifetime.received))
    return denied('lifetime_counter_overflow');
  next.revision++;
  const check=inspectUnifiedOrdinaryLedger(next);
  if (!check.ok || check.total!==snapshot.total)
    return denied('transition_invariant_failure');
  return {
    ok:true,status:'INTERNAL_OWNERSHIP_TRANSITION_DRAFT_ONLY',next,
    receipt:{operationId,from,to,key,count,
      epoch:snapshot.epoch,beforeRevision:snapshot.revision,
      afterRevision:next.revision},
    itemCountBefore:snapshot.total,itemCountAfter:next.total,
    hasDurableReceipt:false,hasAtomicBedrockSaveProof:false,...noAuthority
  };
}


/**
 * One physical-boundary accounting proposal. The only two legal changes to
 * the global ordinary total are: depositing a certified native ordinary
 * ItemStack (credit), and creating a certified native outbound ItemStack
 * (debit). This pure operation does NOT prove the physical side occurred.
 *
 * The unified boundary coordinator must own the prepared native escrow,
 * reserve exclusive writer authority, and commit one durable boundary journal
 * before this returned ledger value is ever written. An ordinary internal
 * Receiver↔Bulk transfer must use transitionUnifiedOrdinaryAccounts instead.
 */
export function transitionUnifiedOrdinaryBoundary(snapshot,{
  operationId,accountId,key,count,direction,expectedRevision,expectedEpoch
}={}){
  const valid=inspectUnifiedOrdinaryLedger(snapshot);
  if(!valid.ok)return valid;
  if(!idOK(operationId)||!idOK(accountId)||!keyCheck(key)||
     !pos(count)||!['deposit','withdraw'].includes(direction)||
     !nat(expectedRevision)||expectedRevision!==snapshot.revision||
     expectedEpoch!==snapshot.epoch)
    return denied('invalid_or_stale_boundary_request');
  const current=snapshot.accounts.find(a=>a.id===accountId);
  if(!current)return denied('unknown_boundary_account');
  if(direction==='deposit' && current.total+count>current.capacity)
    return denied('boundary_account_full');
  if(direction==='withdraw' &&
     (current.buckets.find(x=>x.key===key)?.count||0)<count)
    return denied('boundary_insufficient_balance');
  if(!nat(snapshot.revision+1))return denied('ledger_version_overflow');
  const next=JSON.parse(JSON.stringify(snapshot));
  const account=next.accounts.find(a=>a.id===accountId);
  const existing=account.buckets.find(x=>x.key===key);
  if(direction==='deposit'){
    if(existing)existing.count+=count;
    else account.buckets.push({key,count});
    account.total+=count;
    next.total+=count;
    if(account.kind==='receiver')account.lifetime.received+=count;
  }else{
    existing.count-=count;
    if(existing.count===0)
      account.buckets=account.buckets.filter(x=>x.key!==key);
    account.total-=count;
    next.total-=count;
    if(account.kind==='receiver')account.lifetime.delivered+=count;
  }
  account.buckets.sort((a,b)=>order(a.key,b.key));
  if(!nat(account.lifetime.received)||!nat(account.lifetime.delivered))
    return denied('lifetime_counter_overflow');
  next.revision++;
  const checked=inspectUnifiedOrdinaryLedger(next);
  if(!checked.ok)return denied('boundary_ledger_conservation_failure');
  return {ok:true,status:'PHYSICAL_BOUNDARY_ACCOUNT_DRAFT_ONLY',
    next,receipt:{operationId,direction,accountId,key,count,
      epoch:snapshot.epoch,beforeRevision:snapshot.revision,
      afterRevision:next.revision},
    totalBefore:snapshot.total,totalAfter:next.total,
    externalCustodyProofRequired:true,
    hasDurableBoundaryIntent:false,canWriteWorld:false,
    canMoveItems:false,canCommitMigration:false,canClearQ4:false};
}
