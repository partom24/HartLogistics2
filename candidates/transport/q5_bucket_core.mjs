/**
 * Q5 ordinary Receiver bucket-page candidate — pure, OFFLINE and non-executable.
 *
 * The source is a COMPLETE Q4 snapshot supplied by a future trusted adapter.
 * No world-property write, inventory mutation, receipt, journal settlement,
 * migration authority, native MR handling or runtime Q5 cutover is implemented.
 * `verified` flags supplied by the caller are model inputs, not Bedrock proof.
 */
import { chooseOrdinaryDestination } from './ordinary_network_core.mjs';

export const Q5_RECEIVER_CAPACITY = 250000;
export const Q5_BUCKETS_PER_PAGE = 8;
export const Q5_PAGE_CHAR_LIMIT = 4096;
export const Q5_DRAFT_SCHEMA = 'hart-q5-ordinary-draft-v1';

const fail = reason => ({ ok: false, reason });
const positive = n => Number.isSafeInteger(n) && n > 0;
const nonnegative = n => Number.isSafeInteger(n) && n >= 0;
const validId = v => typeof v === 'string' && v.length > 0 && v.length <= 256;
const typeId = v => typeof v === 'string' && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function normalize(value, depth = 0) {
  if (depth > 12) throw Error('identity_depth');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (Array.isArray(value)) return value.map(v => normalize(v, depth + 1));
  if (!value || typeof value !== 'object' ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw Error('identity_type');
  }
  const result = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('identity_unsafe_key');
    result[key] = normalize(value[key], depth + 1);
  }
  return result;
}

/** Full serialized identity, not just typeId. Classification is a prerequisite. */
export function q5IdentityKey(definition) {
  try {
    if (!definition || !typeId(definition.typeId)) return null;
    const key = JSON.stringify(normalize(definition));
    return key && key.length <= 2048 ? key : null;
  } catch (_) { return null; }
}

// Detect accidental page drift/torn snapshots; NOT a signed or durable receipt.
function pageFingerprint(pages) {
  const raw = JSON.stringify(pages);
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619);
  return 'fnv32:' + (h >>> 0).toString(16).padStart(8, '0');
}

function paginate(sorted) {
  const pages = [];
  let buckets = [];
  const flush = () => {
    if (!buckets.length) return;
    pages.push({ index: pages.length, buckets });
    buckets = [];
  };
  for (const bucket of sorted) {
    const proposed = [...buckets, bucket];
    const pageSize = JSON.stringify({ index: pages.length, buckets: proposed }).length;
    if (buckets.length && (proposed.length > Q5_BUCKETS_PER_PAGE || pageSize > Q5_PAGE_CHAR_LIMIT)) flush();
    buckets.push(bucket);
    if (JSON.stringify({ index: pages.length, buckets }).length > Q5_PAGE_CHAR_LIMIT) return null;
  }
  flush();
  return pages;
}

/**
 * Stage a snapshot-only conversion from Q4 entries to keyed ordinary buckets.
 * `complete` and `journalClear` are assertions to be attested by a future
 * Bedrock migration adapter; the returned draft CANNOT be used for cutover.
 */
export function stageQ4OrdinaryDraft({ receiverId, epoch, entries, declaredTotal,
                                       complete, journalClear } = {}) {
  if (!validId(receiverId) || !positive(epoch)) return fail('invalid_receiver_epoch');
  if (complete !== true || journalClear !== true || !Array.isArray(entries)) {
    return fail('q4_snapshot_unverified');
  }
  if (!nonnegative(declaredTotal) || declaredTotal > Q5_RECEIVER_CAPACITY) {
    return fail('invalid_declared_total');
  }
  const counts = new Map();
  let total = 0;
  for (const entry of entries) {
    if (!entry || !positive(entry.amount) ||
        entry.classification !== 'ordinary' || entry.losslessIdentity !== true ||
        entry.metadataFree !== true) return fail('unsafe_or_invalid_q4_entry');
    const key = q5IdentityKey(entry.definition);
    if (key === null) return fail('invalid_item_identity');
    total += entry.amount;
    if (!Number.isSafeInteger(total) || total > Q5_RECEIVER_CAPACITY) return fail('q5_capacity_exceeded');
    counts.set(key, (counts.get(key) || 0) + entry.amount);
  }
  if (total !== declaredTotal) return fail('q4_total_mismatch');
  const sorted = [...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, count]) => ({ key, count }));
  const pages = paginate(sorted);
  if (pages === null) return fail('q5_page_too_large');
  return { ok: true, executable: false, cutoverAuthorized: false,
    draft: { schema: Q5_DRAFT_SCHEMA, receiverId, epoch, revision: 0,
             capacity: Q5_RECEIVER_CAPACITY, total, pages, fingerprint: pageFingerprint(pages) } };
}

/** Reject torn/missing/reordered pages, duplicate keys, count drift and drifted layout. */
export function inspectQ5Draft(draft) {
  if (!draft || draft.schema !== Q5_DRAFT_SCHEMA || !validId(draft.receiverId) ||
      !positive(draft.epoch) || !nonnegative(draft.revision) ||
      draft.capacity !== Q5_RECEIVER_CAPACITY ||
      !nonnegative(draft.total) || draft.total > draft.capacity ||
      !Array.isArray(draft.pages)) return fail('invalid_q5_header');
  const buckets = [];
  const seen = new Set();
  let total = 0;
  for (let p = 0; p < draft.pages.length; p++) {
    const page = draft.pages[p];
    if (!page || page.index !== p || !Array.isArray(page.buckets) ||
        !page.buckets.length || page.buckets.length > Q5_BUCKETS_PER_PAGE ||
        JSON.stringify(page).length > Q5_PAGE_CHAR_LIMIT) return fail('invalid_q5_page');
    for (const entry of page.buckets) {
      if (!entry || typeof entry.key !== 'string' || !positive(entry.count) ||
          seen.has(entry.key)) return fail('invalid_or_duplicate_bucket');
      let decoded;
      try { decoded = JSON.parse(entry.key); } catch (_) { return fail('invalid_item_identity'); }
      if (q5IdentityKey(decoded) !== entry.key) return fail('invalid_item_identity');
      seen.add(entry.key);
      total += entry.count;
      if (!Number.isSafeInteger(total) || total > draft.capacity) return fail('q5_capacity_exceeded');
      buckets.push({ key: entry.key, count: entry.count });
    }
  }
  if (total !== draft.total) return fail('q5_total_mismatch');
  if (draft.fingerprint !== pageFingerprint(draft.pages)) return fail('q5_page_fingerprint_mismatch');
  const canonical = paginate([...buckets].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  // Canonical page shape is fixed, so incomplete/reordered/broken page boundaries HOLD.
  if (!canonical || JSON.stringify(canonical) !== JSON.stringify(draft.pages)) {
    return fail('noncanonical_q5_pages');
  }
  return { ok: true, total, bucketCount: buckets.length, buckets };
}

/**
 * Destination-aware selection across ALL buckets — no FIFO head-of-line.
 * The availability list must cover every bucket, and the existing Bulk policy
 * still refuses unknown capacity. A proposed selection is NOT a debit permit.
 */
export function previewQ5Dispatch(draft, { availability, bulkLedger,
    expectedEpoch, completeRoutes, maxBatch = 64 } = {}) {
  const check = inspectQ5Draft(draft);
  if (!check.ok) return check;
  if (expectedEpoch !== draft.epoch || completeRoutes !== true) return fail('routing_authority_unverified');
  if (!positive(maxBatch) || !Array.isArray(availability) ||
      availability.length !== check.bucketCount) return fail('incomplete_destination_snapshot');
  const statuses = new Map();
  const legalStatus = ['none', 'usable', 'unavailable', 'full'];
  for (const a of availability) {
    if (!a || typeof a.key !== 'string' || statuses.has(a.key) ||
        !check.buckets.some(b => b.key === a.key) ||
        !legalStatus.includes(a.filtered) || !legalStatus.includes(a.automatic) ||
        typeof a.wildcardVerified !== 'boolean') return fail('incomplete_destination_snapshot');
    statuses.set(a.key, a);
  }
  const choices = [];
  const priority = { filtered: 0, automatic: 1, bulk: 2, wildcard: 3 };
  for (const bucket of check.buckets) {
    const s = statuses.get(bucket.key);
    const route = chooseOrdinaryDestination(bulkLedger, {
      filtered: s.filtered, automatic: s.automatic,
      wildcardVerified: s.wildcardVerified === true
    });
    if (own(priority, route.decision)) {
      choices.push({ key: bucket.key, count: Math.min(maxBatch, bucket.count),
                     destinationKind: route.decision, rank: priority[route.decision] });
    }
  }
  choices.sort((a, b) => a.rank - b.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (!choices.length) return { ok: true, decision: 'hold', executable: false };
  const { key, count, destinationKind } = choices[0];
  return { ok: true, decision: 'proposed', key, count, destinationKind,
           executable: false, cutoverAuthorized: false };
}
