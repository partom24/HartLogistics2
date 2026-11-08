/**
 * OFFLINE ONLY. Fresh Q4 vs already-planned Q5 shadow correlation.
 *
 * A valid shadow seal on its own can be STALE: Q4 remains authoritative
 * throughout staging and could have changed after plan creation. Before and
 * after inspecting the shadow Map, perform complete world-wide read-only Q4
 * ordinary draft scans and demand exact Receiver/source/draft agreement.
 *
 * Does NOT prove snapshot atomicity, trustworthy BDS dynamic-property order,
 * durable maintenance, live item fidelity, world isolation or authority
 * cutover. Never writes/clears/repairs a world property or physical item.
 */
import {previewQ5WorldOrdinaryDrafts}
  from './q5_world_ordinary_preview.mjs';
import {inspectQ5WorldShadowRecords}
  from './q5_world_shadow_plan.mjs';

const noAuthority=Object.freeze({
  canRoute:false,canMigrate:false,canStageWorld:false,
  canDebitQ4:false,canWriteQ5:false,canWriteWorld:false,
  canClearQ4:false,canSettle:false,canRetry:false
});
const hold=reason=>({ok:false,status:'HOLD',reason,...noAuthority});
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const safeJSON=value=>{try{return JSON.stringify(value)??null;}catch(_){return null;}};
function witnessSignature(map,freeze) {
  try {
    const signature=JSON.stringify([freeze,[...map]]);
    return typeof signature==='string'?signature:null;
  }catch(_){return null;}
}
function correlate(prepared,observed,witnesses) {
  if (!observed.ok || !prepared || !prepared.ok ||
      prepared.status!=='GLOBAL_SHADOW_WRITE_PLAN_ONLY' ||
      prepared.receiverCount!==observed.receiverCount ||
      prepared.itemCount!==observed.itemCount ||
      prepared.pageCount!==observed.pageCount ||
      !Array.isArray(prepared.plans) ||
      prepared.plans.length!==observed.receiverCount ||
      !(witnesses instanceof Map) ||
      witnesses.size!==observed.receiverCount) return false;
  let count=0;
  for(let i=0;i<observed.drafts.length;i++){
    const now=observed.drafts[i],planned=prepared.plans[i];
    const witness=witnesses.get(now.receiverId);
    if(!planned || !planned.q4 || !witness ||
       planned.receiverId!==now.receiverId ||
       planned.sourceFingerprint!==now.sourceFingerprint ||
       planned.itemCount!==now.itemCount ||
       planned.pageCount!==now.pageCount ||
       planned.q4.receiverId!==now.receiverId ||
       planned.q4.snapshotFingerprint!==now.sourceFingerprint ||
       planned.q4.total!==now.itemCount ||
       safeJSON(witness)===null ||
       safeJSON(witness)!==safeJSON(planned.q4) ||
       safeJSON(planned.draft)===null ||
       safeJSON(planned.draft)!==safeJSON(now.draft)){
      return false;
    }
    count+=now.itemCount;
    if(!safe(count))return false;
  }
  return count===prepared.itemCount;
}

/**
 * A fresh source-shaped consistency check; returns no executable authority.
 * All witness and quiescence claims are synthetic. Read-only checks cannot
 * exclude an ABA change-and-restore between observations.
 */
export function inspectQ5WorldShadowAgainstCurrentQ4({
  source,prepared,records,freeze
}={}) {
  if(!source || typeof source!=='object' ||
     !(source.q4WitnessByReceiver instanceof Map) ||
     !prepared || !prepared.ok ||
     !freeze || typeof freeze!=='object' ||
     freeze.worldEpoch!==prepared.epoch ||
     source.epoch!==prepared.epoch ||
     source.worldId!==prepared.worldId) {
    return hold('current_q4_revalidation_required');
  }
  const priorSignature=witnessSignature(source.q4WitnessByReceiver,freeze);
  if(priorSignature===null)return hold('unreadable_current_world_witnesses');

  const before=previewQ5WorldOrdinaryDrafts(source);
  if(!before.ok) return hold('current_q4_source_refused:'+before.reason);
  if(!correlate(prepared,before,source.q4WitnessByReceiver)) {
    return hold('q4_source_is_stale_vs_shadow');
  }

  const shadow=inspectQ5WorldShadowRecords({
    prepared,records,freeze
  });
  if(!shadow.ok) return hold('shadow_records_refused:'+shadow.reason);

  const after=previewQ5WorldOrdinaryDrafts(source);
  if(!after.ok) return hold('q4_source_changed_during_shadow_read:'+after.reason);
  if(JSON.stringify(after.drafts)!==JSON.stringify(before.drafts) ||
     !correlate(prepared,after,source.q4WitnessByReceiver)) {
    return hold('q4_source_changed_during_shadow_read');
  }
  if(witnessSignature(source.q4WitnessByReceiver,freeze)!==priorSignature) {
    return hold('current_world_witness_changed_during_read');
  }
  return {
    ok:true,status:'CURRENT_Q4_SHADOW_CORRELATION_READ_ONLY',
    worldId:prepared.worldId,epoch:prepared.epoch,
    receiverCount:prepared.receiverCount,itemCount:prepared.itemCount,
    pageCount:prepared.pageCount,recordCount:prepared.recordCount,
    q4RemainsAuthoritative:true,
    hasAtomicReadProof:false,
    hasDurableFreezeProof:false,
    hasAuthenticatedLiveItemProof:false,
    ...noAuthority
  };
}
