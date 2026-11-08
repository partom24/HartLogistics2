/**
 * OFFLINE ONLY: all-or-HOLD Q5 world-wide ordinary shadow write PLAN.
 *
 * Reuses the complete Q4 census/ordinary bucket drafts and the existing
 * single-Receiver shadow planner. No Bedrock write, durability, Q4 debit,
 * shadow authority, Q5 migration, journal clear or physical item move.
 *
 * Even a complete plan and a matching mock record store are NOT proof of an
 * atomic world snapshot: world properties may persist out of order or be
 * restored from an old backup; vanilla/foreign inventory writers remain a
 * separate prerequisite. The 'verified' inputs are caller assertions.
 */
import {previewQ5WorldOrdinaryDrafts}
  from './q5_world_ordinary_preview.mjs';
import {planQ5ShadowWrites,inspectQ5ShadowStore}
  from './q5_shadow_staging.mjs';

export const Q5_GLOBAL_SHADOW_NAMESPACE='hl2:q5shadow:';
const noPermission=Object.freeze({
  canRoute:false,canMigrate:false,canStageWorld:false,
  canDebitQ4:false,canWriteQ5:false,canWriteWorld:false,
  canClearQ4:false,canSettle:false,canRetry:false
});
const hold=reason=>({ok:false,status:'HOLD',reason,...noPermission});
const safe=n=>Number.isSafeInteger(n)&&n>=0;

function serializeClaims(q4WitnessByReceiver,freeze) {
  try {
    const values=JSON.stringify([freeze,[...q4WitnessByReceiver]]);
    return typeof values==='string' ? values : null;
  }catch(_){return null;}
}

/**
 * Returns only a proposed set of per-Receiver shadow page/manifest/seal
 * records. Q4 remains the sole source of truth during any hypothetical
 * staging. Every Receiver and the entire source scan must be stable.
 */
export function planQ5WorldShadowWrites({
  world,worldId,receivers,expectedReceiverCount,expectedQueuedTotal,
  registrySnapshotStable,epoch,identityAssertionsByReceiver,
  q4WitnessByReceiver,freeze
}={}) {
  if (!(q4WitnessByReceiver instanceof Map) || !freeze ||
      typeof freeze!=='object' || freeze.worldEpoch!==epoch) {
    return hold('global_shadow_inputs_unverified');
  }
  const input={world,worldId,receivers,expectedReceiverCount,
    expectedQueuedTotal,registrySnapshotStable,epoch,
    identityAssertionsByReceiver};
  const beforeClaims=serializeClaims(q4WitnessByReceiver,freeze);
  if(beforeClaims===null)return hold('unreadable_world_witnesses');
  const first=previewQ5WorldOrdinaryDrafts(input);
  if(!first.ok) return hold('world_ordinary_draft_refused:'+first.reason);
  if(q4WitnessByReceiver.size!==first.receiverCount) {
    return hold('incomplete_q4_receiver_witnesses');
  }
  const known=new Set(first.drafts.map(x=>x.receiverId));
  for (const id of q4WitnessByReceiver.keys()) {
    if (!known.has(id))return hold('unregistered_q4_receiver_witness');
  }
  const uniqueKeys=new Set(),uniqueNamespaces=new Set();
  const plans=[];
  let total=0,pageCount=0,recordCount=0;
  for (const item of first.drafts) {
    const q4=q4WitnessByReceiver.get(item.receiverId);
    if (!q4 || q4.receiverId!==item.receiverId ||
        q4.snapshotFingerprint!==item.sourceFingerprint ||
        q4.total!==item.itemCount || !safe(q4.revision)) {
      return hold('source_witness_mismatch:'+item.receiverId);
    }
    const prepared=planQ5ShadowWrites({
      draft:item.draft,q4,freeze
    });
    if(!prepared.ok) {
      return hold('receiver_shadow_refused:'+item.receiverId+':'+prepared.reason);
    }
    if(uniqueNamespaces.has(prepared.namespace)) {
      return hold('reused_q5_shadow_namespace');
    }
    uniqueNamespaces.add(prepared.namespace);
    if(!prepared.writes.every(w=>w &&
        typeof w.key==='string' && w.key.length>0 &&
        w.key.startsWith(prepared.namespace) &&
        typeof w.value==='string')) {
      return hold('invalid_shadow_write_shape');
    }
    for(const write of prepared.writes){
      if(uniqueKeys.has(write.key))return hold('duplicate_q5_shadow_write');
      uniqueKeys.add(write.key);
    }
    total+=item.itemCount;
    pageCount+=item.pageCount;
    recordCount+=prepared.writes.length;
    if(!safe(total)||!safe(pageCount)||!safe(recordCount)) {
      return hold('global_shadow_count_overflow');
    }
    plans.push({
      receiverId:item.receiverId,sourceFingerprint:item.sourceFingerprint,
      itemCount:item.itemCount,pageCount:item.pageCount,
      draft:item.draft,q4,namespace:prepared.namespace,
      writes:prepared.writes
    });
  }
  if(total!==first.itemCount ||
      pageCount!==first.pageCount ||
      plans.length!==first.receiverCount){
    return hold('global_shadow_conservation_failed');
  }
  const after=previewQ5WorldOrdinaryDrafts(input);
  if(!after.ok)return hold('final_world_ordinary_draft_refused:'+after.reason);
  if(JSON.stringify(after.drafts)!==JSON.stringify(first.drafts) ||
     after.itemCount!==first.itemCount ||
     after.pageCount!==first.pageCount) {
    return hold('q4_changed_during_world_shadow_planning');
  }
  const afterClaims=serializeClaims(q4WitnessByReceiver,freeze);
  if(afterClaims!==beforeClaims) {
    return hold('world_witness_changed_during_shadow_planning');
  }
  return {
    ok:true,status:'GLOBAL_SHADOW_WRITE_PLAN_ONLY',
    worldId,epoch,receiverCount:first.receiverCount,
    itemCount:total,pageCount,recordCount,
    plans,hasCrashAtomicityProof:false,
    hasDurableWorldFreezeProof:false,
    hasNativeMRIdentityProof:false,
    ...noPermission
  };
}

/**
 * Read-only reconciliation of a hypothetical Map of Q5 shadow properties.
 * All known per-Receiver records and seals must exist exactly. Unknown Q5
 * shadow keys (including abandoned earlier epochs) HOLD the full world.
 * Other packs' properties are not touched or removed.
 */
export function inspectQ5WorldShadowRecords({prepared,records,freeze}={}) {
  if(!prepared || !prepared.ok ||
      prepared.status!=='GLOBAL_SHADOW_WRITE_PLAN_ONLY' ||
      !Array.isArray(prepared.plans) ||
      prepared.plans.length!==prepared.receiverCount ||
      !(records instanceof Map)) return hold('unverifiable_world_shadow_records');
  const expected=new Set();
  for(const item of prepared.plans){
    if(!item || !Array.isArray(item.writes))return hold('invalid_world_shadow_plan');
    for(const write of item.writes){
      if(!write || typeof write.key!=='string' || expected.has(write.key)) {
        return hold('invalid_world_shadow_plan');
      }
      expected.add(write.key);
    }
  }
  for(const [key,value] of records){
    if(typeof key!=='string')return hold('invalid_world_record_key');
    if(key.startsWith(Q5_GLOBAL_SHADOW_NAMESPACE) &&
       (!expected.has(key) || typeof value!=='string')) {
      return hold('unclaimed_q5_shadow_record');
    }
  }
  let total=0;
  for(const item of prepared.plans){
    const checked=inspectQ5ShadowStore({
      draft:item.draft,q4:item.q4,freeze,records
    });
    if(!checked.ok){
      return hold('receiver_shadow_incomplete:'+item.receiverId+':'+checked.reason);
    }
    total+=checked.stagedItems;
    if(!safe(total))return hold('global_shadow_total_overflow');
  }
  if(total!==prepared.itemCount) {
    return hold('global_shadow_total_mismatch');
  }
  return {
    ok:true,status:'GLOBAL_SHADOW_RECORDS_READ_ONLY',
    receiverCount:prepared.receiverCount,
    itemCount:total,recordCount:expected.size,
    q4RemainsAuthoritative:true,
    hasCrashAtomicityProof:false,
    ...noPermission
  };
}
