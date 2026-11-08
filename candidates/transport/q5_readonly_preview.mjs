/**
 * End-to-end OFFLINE preview only: q4 World-shaped read -> complete item
 * identity census -> Q5 ordinary bucket draft. Never starts a migration.
 *
 * All "lossless" flags here are supplied modeled assertions, not authenticated
 * engine evidence. Real Bedrock needs a verified classification adapter, a
 * world-wide maintenance freeze, durable Q4 revision and atomic authority
 * cutover. This function NEVER creates Q5 shadow writes or a debit permit.
 */
import { sampleQ4WorldReadOnly } from './q5_q4_read_adapter.mjs';
import { inspectQ4OrdinaryDefinitionShape } from './q5_ordinary_shape_gate.mjs';
import { q5IdentityKey, stageQ4OrdinaryDraft, inspectQ5Draft
} from './q5_bucket_core.mjs';

const hold = reason => ({
  ok: false, status: 'HOLD', reason, canRoute: false,
  canStageWorld: false, canMigrate: false, canClearQ4: false
});
const pos = n => Number.isSafeInteger(n) && n > 0;

/**
 * \`identityAssertions\` is a Map from the *complete* canonical serialized
 * definition key to {classification:"ordinary",losslessIdentity:true,
 * metadataFree:true,runtimeStackable:true,runtimeMaxStack:64,
 * verifiedFreshRoundTrip:true}. These are synthetic inputs, NOT automatically verified
 * merely because q4 previously accepted the item.
 */
export function previewQ5OrdinaryReceiver({receiver,world,epoch,identityAssertions}={}) {
  if (!pos(epoch) || !(identityAssertions instanceof Map)) return hold('preview_inputs_unverified');
  const source = sampleQ4WorldReadOnly({receiver,world});
  if (!source.ok) return hold('q4_read_refused:' + source.reason);
  const ids = new Set();
  const modeled = [];
  for (const entry of source.entries) {
    const shape = inspectQ4OrdinaryDefinitionShape(entry.definition);
    if (!shape.ok) return hold('q4_ordinary_shape_refused:' + shape.reason);
    const key = q5IdentityKey(entry.definition);
    if (key === null || key !== shape.key) return hold('unsafe_source_definition');
    ids.add(key);
    const a = identityAssertions.get(key);
    if (!a || a.classification !== 'ordinary' ||
        a.losslessIdentity !== true || a.metadataFree !== true ||
        a.runtimeStackable !== true ||
        !Number.isSafeInteger(a.runtimeMaxStack) || a.runtimeMaxStack <= 1 ||
        a.verifiedFreshRoundTrip !== true) {
      return hold('unverified_q5_identity_class');
    }
    modeled.push({
      definition: entry.definition, amount: entry.amount,
      classification: 'ordinary', metadataFree: true, losslessIdentity: true
    });
  }
  if (identityAssertions.size !== ids.size ||
      [...identityAssertions.keys()].some(key => !ids.has(key))) {
    return hold('unexpected_identity_assertion');
  }
  const stage = stageQ4OrdinaryDraft({
    receiverId: source.receiverId, epoch,
    entries: modeled, complete: true, journalClear: true,
    declaredTotal: source.total
  });
  if (!stage.ok) return hold('q5_draft_refused:' + stage.reason);
  const verified = inspectQ5Draft(stage.draft);
  if (!verified.ok || verified.total !== source.total) return hold('q5_snapshot_inconsistent');
  return {
    ok: true, status: 'Q5_READ_ONLY_PREVIEW_ONLY',
    receiverId: source.receiverId,
    q4ObservedItems: source.total, q5BucketCount: verified.bucketCount,
    q5PageCount: stage.draft.pages.length,
    observedQ4Fingerprint: source.snapshotFingerprint,
    hasDurableQ4Revision: false,
    draft: stage.draft,
    canRoute: false, canStageWorld: false,
    canMigrate: false, canClearQ4: false
  };
}
