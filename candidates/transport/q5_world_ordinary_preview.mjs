/**
 * OFFLINE ONLY: complete Q4 Receiver census -> Q5 ordinary bucket drafts.
 *
 * This joins the world-wide Q4 metadata/read-only census with the STRICT
 * per-Receiver Q4 item shape and synthetic live-identity classifier. All
 * Receivers must pass: there is no partial migration, "skip MR", implicit
 * reconstruction, item debit, world staging, source authority or writer.
 *
 * The second full Q4 census rejects observable drift during draft conversion.
 * This is NOT a globally atomic Bedrock snapshot. Caller classification and
 * completeness assertions are not proof of actual stable server behavior.
 */
import { previewQ5WorldQ4Census } from './q5_world_receiver_census.mjs';
import { previewQ5OrdinaryReceiver } from './q5_readonly_preview.mjs';
import { inspectQ5Draft } from './q5_bucket_core.mjs';

const validEpoch = n => Number.isSafeInteger(n) && n>0;
const safe = n => Number.isSafeInteger(n) && n>=0;
const noPermission = {
  canMigrate:false,canRoute:false,canStageWorld:false,canClearQ4:false,
  canDebitQ4:false,canWriteQ5:false,canWriteWorld:false
};
const refuse = reason => ({ok:false,status:'HOLD',reason,...noPermission});

export function previewQ5WorldOrdinaryDrafts({
  world,worldId,receivers,expectedReceiverCount,expectedQueuedTotal,
  registrySnapshotStable,epoch,identityAssertionsByReceiver
}={}) {
  if (!validEpoch(epoch) || !(identityAssertionsByReceiver instanceof Map) ||
      !Array.isArray(receivers) ||
      identityAssertionsByReceiver.size !== receivers.length) {
    return refuse('invalid_world_ordinary_preview_inputs');
  }
  const input={world,worldId,receivers,expectedReceiverCount,
    expectedQueuedTotal,registrySnapshotStable};
  const source=previewQ5WorldQ4Census(input);
  if (!source.ok) return refuse('initial_world_q4_census_refused:'+source.reason);

  const known=new Set(source.receivers.map(r=>r.id));
  for (const id of identityAssertionsByReceiver.keys()) {
    if (!known.has(id)) return refuse('unknown_receiver_classification');
  }

  const drafts=[];
  let globalTotal=0,globalBucketCount=0,globalPageCount=0;
  for (const legacy of source.receivers) {
    const identityAssertions=identityAssertionsByReceiver.get(legacy.id);
    if (!(identityAssertions instanceof Map)) {
      return refuse('missing_receiver_classification:'+legacy.id);
    }
    const result=previewQ5OrdinaryReceiver({
      receiver:{id:legacy.id,queueKey:legacy.queueKey},
      world,epoch,identityAssertions
    });
    if (!result.ok) {
      return refuse('receiver_q5_refused:'+legacy.id+':'+result.reason);
    }
    if (result.q4ObservedItems !== legacy.itemCount ||
        result.observedQ4Fingerprint !== legacy.fingerprint) {
      return refuse('receiver_q4_changed_during_bucketization:'+legacy.id);
    }
    const checked=inspectQ5Draft(result.draft);
    if (!checked.ok || checked.total !== legacy.itemCount ||
        checked.bucketCount !== result.q5BucketCount ||
        result.draft.receiverId !== legacy.id) {
      return refuse('invalid_receiver_q5_draft:'+legacy.id);
    }
    globalTotal+=result.draft.total;
    globalBucketCount+=checked.bucketCount;
    globalPageCount+=result.q5PageCount;
    if (!safe(globalTotal) || !safe(globalBucketCount) ||
        !safe(globalPageCount)) return refuse('global_q5_count_overflow');
    drafts.push({
      receiverId:legacy.id,sourceFingerprint:legacy.fingerprint,
      itemCount:legacy.itemCount,bucketCount:checked.bucketCount,
      pageCount:result.q5PageCount,draft:result.draft
    });
  }
  if (globalTotal!==source.itemCount) {
    return refuse('q5_global_total_mismatch');
  }

  const after=previewQ5WorldQ4Census(input);
  if (!after.ok) {
    return refuse('final_world_q4_census_refused:'+after.reason);
  }
  if (after.itemCount!==source.itemCount ||
      after.receiverCount!==source.receiverCount ||
      JSON.stringify(after.receivers)!==JSON.stringify(source.receivers)) {
    return refuse('world_q4_changed_during_bucketization');
  }

  return {
    ok:true,status:'WORLD_Q5_ORDINARY_DRAFTS_READ_ONLY_ONLY',
    worldId,epoch,receiverCount:source.receiverCount,
    itemCount:globalTotal,bucketCount:globalBucketCount,
    pageCount:globalPageCount,drafts,
    hasGlobalAtomicSnapshotProof:false,
    hasDurableFreezeProof:false,
    hasAuthenticatedRuntimeIdentityProof:false,
    ...noPermission
  };
}
