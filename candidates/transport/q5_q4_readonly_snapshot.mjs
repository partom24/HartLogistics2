/**
 * Read-only offline decoder of actual legacy q4 page/definition layout.
 *
 * Source format audited from the protected 1.4.1 main.js:
 * q4m_queueKey = {v:4,h,t,n,q,r,d}; q4p_queueKey_page = [start, [[defId,qty]]];
 * q4d_queueKey_defId = JSON item definition. A page holds 64 sequence slots.
 *
 * This DOES NOT call loadReceiverQueue() (which can initialize/migrate, delete
 * old properties and write registry metadata), nor getDynamicProperty/setItem.
 * It consumes a synthetic Map of RAW property values only. Caller flags for
 * clear journals are untrusted until independently established by Bedrock.
 * A complete read is NOT an atomic world snapshot or a Q5 cutover permission.
 */
import { q5IdentityKey } from './q5_bucket_core.mjs';

export const Q4_SOURCE_PAGE_SIZE = 64;
export const Q4_SOURCE_MAX_CHARS = 30000;
export const Q4_SOURCE_CAPACITY = 250000;

const safe = n => Number.isSafeInteger(n) && n >= 0;
const fail = reason => ({
  ok: false, status: 'HOLD', reason,
  canRoute: false, canMigrate: false, canWriteWorld: false, canClearQ4: false
});

function parse(raw) {
  if (typeof raw !== 'string' || raw.length < 1 ||
      raw.length > Q4_SOURCE_MAX_CHARS) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}
function fingerprint(records) {
  // Detect accidental model drift only; no cryptographic identity or proof.
  let hash = 2166136261;
  for (const [key, value] of records) {
    const raw = JSON.stringify([key, value]);
    for (let i = 0; i < raw.length; i++) {
      hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
    }
  }
  return 'fnv32:' + (hash >>> 0).toString(16).padStart(8, '0');
}
function keys(receiver) {
  const queueKey = receiver.queueKey;
  return {
    meta: 'hartsorter:q4m_' + queueKey,
    pagePrefix: 'hartsorter:q4p_' + queueKey + '_',
    defPrefix: 'hartsorter:q4d_' + queueKey + '_'
  };
}

/**
 * All values must come from a complete, externally frozen reader (not proven
 * by this module). It deliberately does not auto-create missing q4 metadata or
 * translate q2/q3. Unknown MR definitions stay unclassified for later proof.
 */
export function readOnlyQ4Snapshot({ receiver, records, queueJournalClear,
                                     physicalJournalClear } = {}) {
  if (!receiver || typeof receiver.id !== 'string' ||
      !receiver.id || receiver.id.length > 256 ||
      typeof receiver.queueKey !== 'string' ||
      !/^q[1-9][0-9]*$/.test(receiver.queueKey)) return fail('invalid_receiver_identity');
  if (queueJournalClear !== true || physicalJournalClear !== true) {
    return fail('unresolved_legacy_journal');
  }
  if (!(records instanceof Map)) return fail('unreadable_q4_store');
  const k = keys(receiver);
  const rawMeta = records.get(k.meta);
  const meta = parse(rawMeta);
  if (!meta || meta.v !== 4 ||
      !safe(meta.h) || !safe(meta.t) || !safe(meta.q) ||
      !safe(meta.r) || !safe(meta.d) ||
      !Number.isSafeInteger(meta.n) || meta.n < 1 ||
      meta.q > Q4_SOURCE_CAPACITY ||
      (meta.q === 0 && (meta.h !== 0 || meta.t !== 0)) ||
      (meta.q > 0 && (meta.h < 1 || meta.t < meta.h ||
                      meta.n <= meta.t || meta.t - meta.h + 1 > meta.q))) {
    return fail('invalid_or_legacy_q4_metadata');
  }
  const firstPage = meta.q ? Math.floor((meta.h - 1) / Q4_SOURCE_PAGE_SIZE) : 0;
  const lastPage = meta.q ? Math.floor((meta.t - 1) / Q4_SOURCE_PAGE_SIZE) : -1;
  const referenced = [[k.meta, rawMeta]];
  const seenDefinitions = new Set();
  const entries = [];
  let total = 0;
  const actualPages = new Set();
  for (const key of records.keys()) {
    if (typeof key !== 'string') return fail('invalid_world_property_key');
    if (key.startsWith(k.pagePrefix)) {
      const suffix = key.slice(k.pagePrefix.length);
      if (!/^(0|[1-9][0-9]*)$/.test(suffix) ||
          !Number.isSafeInteger(Number(suffix))) return fail('unrecognized_q4_page');
      actualPages.add(Number(suffix));
    }
  }
  if (actualPages.size !== Math.max(0, lastPage - firstPage + 1)) {
    return fail('missing_or_orphan_q4_page');
  }
  for (let pageNo = firstPage; pageNo <= lastPage; pageNo++) {
    if (!actualPages.has(pageNo)) return fail('missing_or_orphan_q4_page');
    const pageKey = k.pagePrefix + pageNo;
    const rawPage = records.get(pageKey);
    const value = parse(rawPage);
    const firstSlot = pageNo === firstPage ? (meta.h - 1) % Q4_SOURCE_PAGE_SIZE : 0;
    const lastSlot = pageNo === lastPage ? (meta.t - 1) % Q4_SOURCE_PAGE_SIZE :
      Q4_SOURCE_PAGE_SIZE - 1;
    if (!Array.isArray(value) || value.length !== 2 ||
        value[0] !== firstSlot || !Array.isArray(value[1]) ||
        value[1].length !== lastSlot - firstSlot + 1) {
      return fail('invalid_q4_page_bounds');
    }
    referenced.push([pageKey, rawPage]);
    for (let i = 0; i < value[1].length; i++) {
      const packed = value[1][i];
      if (!Array.isArray(packed) || packed.length !== 2 ||
          typeof packed[0] !== 'string' ||
          !/^[a-z0-9]+(?:_[1-9][0-9]*)?$/.test(packed[0]) ||
          !Number.isSafeInteger(packed[1]) || packed[1] <= 0) {
        return fail('invalid_q4_page_row');
      }
      const defKey = k.defPrefix + packed[0];
      const rawDefinition = records.get(defKey);
      const definition = parse(rawDefinition);
      if (q5IdentityKey(definition) === null) return fail('missing_or_unsafe_q4_definition');
      if (!seenDefinitions.has(defKey)) {
        seenDefinitions.add(defKey);
        referenced.push([defKey, rawDefinition]);
      }
      const seq = pageNo * Q4_SOURCE_PAGE_SIZE + firstSlot + i + 1;
      entries.push({ seq, definition, amount: packed[1] });
      total += packed[1];
      if (!safe(total) || total > Q4_SOURCE_CAPACITY) return fail('q4_count_over_capacity');
    }
  }
  if (total !== meta.q) return fail('q4_count_mismatch');
  referenced.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return {
    ok: true, status: 'STRUCTURAL_Q4_OBSERVATION_ONLY',
    receiverId: receiver.id, queueKey: receiver.queueKey,
    total, entryCount: entries.length,
    metadata: { head: meta.h, tail: meta.t, next: meta.n,
                received: meta.r, delivered: meta.d },
    entries, snapshotFingerprint: fingerprint(referenced),
    // No durable Q4 revision/epoch is in the legacy q4 metadata.
    // A runtime adapter must build its OWN enforced freeze/revision proof.
    hasDurableRevision: false,
    canRoute: false, canMigrate: false, canWriteWorld: false, canClearQ4: false
  };
}