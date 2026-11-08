/**
 * Q5 ordinary shadow staging write plan. OFFLINE, read-only planning only.
 *
 * This module models separately persisted Bedrock world-property-like records
 * but does not call Script API, write a world property, authorize a Q4 debit,
 * make Q5 authoritative, clear a legacy journal, or automatically replay.
 *
 * Q4 remains the sole authority for the entire shadow phase. A caller's
 * assertions of a global freeze, exact Q4 snapshot and unchanged source cannot
 * prove those conditions in Bedrock; runtime admission stays blocked.
 */
import { inspectQ5Draft } from './q5_bucket_core.mjs';

export const Q5_SHADOW_SCHEMA = 'hart-q5-ordinary-shadow-v1';
export const REQUIRED_FROZEN_HANDLERS = Object.freeze([
  'collector_q4_ingress',
  'entity_q4_ingress',
  'native_mr_direct',
  'physical_recovery',
  'q4_recovery',
  'receiver_q4_output',
  'sorter_compaction',
  'sorter_physical',
  'transporter_input',
  'q5_scheduler',
  'bulk_scheduler',
  'migration'
].sort());

const nonempty = v => typeof v === 'string' && v.length > 0 && v.length <= 256;
const nat = n => Number.isSafeInteger(n) && n >= 0;
const pos = n => Number.isSafeInteger(n) && n > 0;

const denied = reason => ({
  ok: false, status: 'HOLD', reason,
  canRoute: false, canMigrate: false, canClearQ4: false,
  canSettle: false, canRetry: false, canWriteWorld: false
});

function checkFreeze(freeze, epoch) {
  if (!freeze || freeze.active !== true || freeze.worldEpoch !== epoch ||
      freeze.verifiedAllHartHandlers !== true ||
      !Array.isArray(freeze.coveredHandlers) ||
      freeze.coveredHandlers.length !== REQUIRED_FROZEN_HANDLERS.length) {
    return false;
  }
  const set = new Set(freeze.coveredHandlers);
  return set.size === REQUIRED_FROZEN_HANDLERS.length &&
    REQUIRED_FROZEN_HANDLERS.every(n => set.has(n));
}
function checkQ4(q4, draft) {
  return q4 && q4.receiverId === draft.receiverId &&
    nonempty(q4.snapshotFingerprint) &&
    nat(q4.revision) && q4.completeSnapshot === true &&
    q4.queueJournalClear === true && q4.physicalJournalClear === true &&
    q4.sourceUnchanged === true &&
    q4.total === draft.total;
}

// Accidental corruption detector, NOT an authenticated record or disk seal.
function checksum(raw) {
  let a = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    a = Math.imul((a ^ raw.charCodeAt(i)) >>> 0, 16777619);
  }
  return 'fnv32:' + (a >>> 0).toString(16).padStart(8, '0');
}

function shadowNamespace(draft, q4) {
  return 'hl2:q5shadow:' + encodeURIComponent(draft.receiverId) +
    ':e' + draft.epoch + ':r' + q4.revision + ':';
}

/**
 * Returns a sequence of distinct record writes for a *hypothetical* adapter.
 * The last record is a shadow SEAL. A sealed shadow is not an active bank.
 * No transfer/cutover, recovery writer or world authorization is returned.
 */
export function planQ5ShadowWrites({ draft, q4, freeze } = {}) {
  const checked = inspectQ5Draft(draft);
  if (!checked.ok) return denied('invalid_bucket_draft:' + checked.reason);
  if (!checkFreeze(freeze, draft.epoch)) return denied('global_freeze_unproven');
  if (!checkQ4(q4, draft)) return denied('q4_source_unverified');
  const namespace = shadowNamespace(draft, q4);
  const writes = [];
  const hashes = [];
  for (const page of draft.pages) {
    const raw = JSON.stringify(page);
    writes.push({ key: namespace + 'page:' + page.index, value: raw });
    hashes.push(checksum(raw));
  }
  const manifest = {
    schema: Q5_SHADOW_SCHEMA,
    receiverId: draft.receiverId,
    epoch: draft.epoch,
    sourceRevision: q4.revision,
    sourceFingerprint: q4.snapshotFingerprint,
    bucketSchema: draft.schema,
    bucketFingerprint: draft.fingerprint,
    total: draft.total,
    pages: draft.pages.length,
    pageChecksums: hashes,
    owner: 'Q4_ONLY',
    phase: 'SHADOW_STAGED'
  };
  const rawManifest = JSON.stringify(manifest);
  writes.push({ key: namespace + 'manifest', value: rawManifest });
  writes.push({
    key: namespace + 'seal',
    value: JSON.stringify({
      schema: Q5_SHADOW_SCHEMA,
      manifestChecksum: checksum(rawManifest),
      pageCount: draft.pages.length,
      owner: 'Q4_ONLY'
    })
  });
  return {
    ok: true, status: 'WRITE_PLAN_ONLY', namespace, writes,
    // The caller may simulate these writes, never apply them to a live world.
    canRoute: false, canMigrate: false, canClearQ4: false,
    canSettle: false, canRetry: false, canWriteWorld: false
  };
}

/**
 * Read-only reconciliation against the original draft AND source/freeze witness.
 * Unknown/missing/torn/foreign/stale/mixed records HOLD; never repair by
 * retrying writes, clearing Q4, or picking a "last known good" partial page.
 *
 * This is intentionally not a cutover classifier. Even a perfect snapshot
 * agrees only with its synthetic inputs, not cross-property crash durability.
 */
export function inspectQ5ShadowStore({ draft, q4, freeze, records } = {}) {
  const plan = planQ5ShadowWrites({ draft, q4, freeze });
  if (!plan.ok) return plan;
  if (!(records instanceof Map)) return denied('unreadable_shadow_records');
  const expected = new Map(plan.writes.map(w => [w.key, w.value]));
  for (const [key, value] of records.entries()) {
    if (typeof key !== 'string') return denied('invalid_record_key');
    if (key.startsWith(plan.namespace) &&
        (!expected.has(key) || typeof value !== 'string')) {
      return denied('unknown_or_invalid_shadow_record');
    }
  }
  for (const [key, value] of expected) {
    if (!records.has(key)) return denied('partial_shadow_snapshot');
    if (records.get(key) !== value) return denied('shadow_snapshot_mismatch');
  }
  return {
    ok: true, status: 'SHADOW_STAGED_READ_ONLY',
    receiverId: draft.receiverId, sourceAuthority: 'Q4_ONLY',
    stagedPages: draft.pages.length, stagedItems: draft.total,
    canRoute: false, canMigrate: false, canClearQ4: false,
    canSettle: false, canRetry: false, canWriteWorld: false
  };
}