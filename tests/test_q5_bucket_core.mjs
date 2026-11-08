import test from 'node:test';
import assert from 'node:assert/strict';
import { freshLedger } from '../candidates/transport/ordinary_network_core.mjs';
import { Q5_RECEIVER_CAPACITY, Q5_BUCKETS_PER_PAGE, Q5_PAGE_CHAR_LIMIT,
  q5IdentityKey, stageQ4OrdinaryDraft, inspectQ5Draft, previewQ5Dispatch
} from '../candidates/transport/q5_bucket_core.mjs';

const def = (id, extras = {}) => ({ typeId: `minecraft:${id}`, ...extras });
const entry = (definition, amount, extra = {}) => ({ definition, amount,
  classification: 'ordinary', losslessIdentity: true, metadataFree: true, ...extra });
const stage = (entries, extra = {}) => stageQ4OrdinaryDraft({
  receiverId: 'overworld:-955,69,-790', epoch: 7, entries,
  declaredTotal: entries.reduce((n, e) => n + (e?.amount || 0), 0),
  complete: true, journalClear: true, ...extra
});
const ledger = () => freshLedger('network', 7, ['bulk-1']);
const all = (draft, byKey = {}) => inspectQ5Draft(draft).buckets.map(b => ({
  key: b.key, filtered: 'none', automatic: 'none', wildcardVerified: false,
  ...byKey[b.key]
}));
const preview = (draft, availability, more = {}) => previewQ5Dispatch(draft, {
  expectedEpoch: 7, completeRoutes: true, maxBatch: 64, bulkLedger: ledger(),
  availability, ...more
});

test('aggregates interleaved identical Q4 identities into canonical sorted pages', () => {
  const got = stage([entry(def('stone'), 3), entry(def('gold_ingot'), 5),
    entry(def('stone'), 7)]);
  assert.equal(got.ok, true);
  assert.equal(got.executable, false);
  assert.equal(got.cutoverAuthorized, false);
  assert.equal(got.draft.total, 15);
  assert.deepEqual(inspectQ5Draft(got.draft).buckets.map(b => b.count), [5, 10]);
  assert.equal(got.draft.revision, 0);
});

test('Q5 bucket pages are independent of historical FIFO arrival order', () => {
  const a = [entry(def('sand'), 2), entry(def('iron_ingot'), 7), entry(def('sand'), 4)];
  assert.deepEqual(stage(a).draft, stage([...a].reverse()).draft);
});

test('full serialized item identity distinguishes variants and ignores object key order', () => {
  const first = def('potion', { variant: { effect: 'speed', level: 1 } });
  const second = def('potion', { variant: { level: 1, effect: 'speed' } });
  const third = def('potion', { variant: { effect: 'healing', level: 1 } });
  assert.equal(q5IdentityKey(first), q5IdentityKey(second));
  assert.notEqual(q5IdentityKey(first), q5IdentityKey(third));
  assert.equal(inspectQ5Draft(stage([entry(first, 2), entry(second, 3),
    entry(third, 1)]).draft).bucketCount, 2);
});

test('metadata rich and unverified Q4 entry refuses entire conversion', () => {
  for (const extra of [
    { classification: 'native-mr' }, { metadataFree: false },
    { losslessIdentity: false }, { losslessIdentity: undefined }
  ]) {
    assert.equal(stage([entry(def('stone'), 2), entry(def('enchanted_book'), 1, extra)]).reason,
      'unsafe_or_invalid_q4_entry');
  }
});

test('invalid item definitions cannot be admitted or collapsed', () => {
  for (const definition of [null, {}, { typeId: 'stone' },
    { typeId: 'minecraft:stone', data: NaN },
    { typeId: 'minecraft:stone', data: undefined },
    { typeId: 'minecraft:stone', bad: () => 1 }]) {
    assert.equal(stage([entry(definition, 1)]).reason, 'invalid_item_identity');
  }
});

test('unsafe JavaScript object keys and prototype values fail closed', () => {
  const poisoned = JSON.parse('{"typeId":"minecraft:stone","__proto__":{"bad":1}}');
  assert.equal(q5IdentityKey(poisoned), null);
  assert.equal(q5IdentityKey({ typeId: 'minecraft:stone', x: new Date() }), null);
});

test('no incomplete Q4 export or pending journal can be staged', () => {
  const e = [entry(def('stone'), 1)];
  for (const extra of [{ complete: false }, { journalClear: false },
    { declaredTotal: 2 }, { declaredTotal: -1 }, { entries: null }]) {
    assert.equal(stage(e, extra).ok, false);
  }
});

test('enforces fixed 250000 Receiver count without altering native MR capacity', () => {
  const limit = stage([entry(def('stone'), Q5_RECEIVER_CAPACITY)]);
  assert.equal(limit.ok, true);
  assert.equal(stage([entry(def('stone'), Q5_RECEIVER_CAPACITY + 1)]).ok, false);
  assert.equal(stage([entry(def('stone'), 150000), entry(def('iron_ingot'), 100001)]).ok, false);
});

test('invalid counts, receiver identity or epoch are refused', () => {
  for (const n of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(stage([entry(def('stone'), n)]).ok, false);
  }
  for (const extra of [{ epoch: 0 }, { receiverId: '' }, { epoch: 2.5 }]) {
    assert.equal(stage([], extra).ok, false);
  }
});

test('empty complete Q4 creates a valid empty draft; no dispatch', () => {
  const draft = stage([]).draft;
  assert.deepEqual(draft.pages, []);
  assert.equal(inspectQ5Draft(draft).total, 0);
  assert.equal(preview(draft, []).decision, 'hold');
});

test('paginates many distinct ordinary buckets with deterministic page indexes', () => {
  const e = Array.from({ length: 29 }, (_, i) => entry(def('type_' + i), i + 1));
  const draft = stage(e).draft;
  assert.equal(draft.pages.length, Math.ceil(29 / Q5_BUCKETS_PER_PAGE));
  assert.equal(inspectQ5Draft(draft).bucketCount, 29);
  draft.pages.forEach((p, index) => {
    assert.equal(p.index, index);
    assert.ok(JSON.stringify(p).length <= Q5_PAGE_CHAR_LIMIT);
  });
});

test('page byte budget splits large identities without truncation', () => {
  const e = Array.from({ length: 6 }, (_, i) =>
    entry(def('type_' + i, { label: 'x'.repeat(750) }), 2));
  const draft = stage(e).draft;
  assert.ok(draft.pages.length > 1);
  assert.equal(inspectQ5Draft(draft).total, 12);
});

test('overwide standalone bucket is refused rather than truncated', () => {
  assert.equal(stage([entry(def('stone', { data: 'x'.repeat(2100) }), 1)]).reason,
    'invalid_item_identity');
});

test('missing, duplicated, reordered and torn pages do not validate', () => {
  const base = stage(Array.from({ length: 18 }, (_, i) => entry(def('type_' + i), 1))).draft;
  const changes = [
    s => { s.pages.pop(); },
    s => { s.pages[1].index = 88; },
    s => { s.pages[1].buckets[0].key = s.pages[0].buckets[0].key; },
    s => { s.pages.reverse(); },
    s => { s.pages[0].buckets.pop(); },
    s => { s.pages[0].buckets[0].count++; },
    s => { s.total++; },
    s => { s.pages[0].buckets[0].count++; s.pages[0].buckets[1].count--; },
    s => { s.pages[0].buckets[0].key = '{'; }
  ];
  for (const change of changes) {
    const s = structuredClone(base);
    change(s);
    assert.equal(inspectQ5Draft(s).ok, false);
  }
});

test('partial staged write at every page boundary is not an accepted snapshot', () => {
  const base = stage(Array.from({ length: 27 }, (_, i) => entry(def('type_' + i), 1))).draft;
  for (let i = 0; i < base.pages.length; i++) {
    const torn = { ...base, pages: base.pages.slice(0, i) };
    assert.equal(inspectQ5Draft(torn).ok, false);
  }
});

test('a canonical JSON save/load roundtrip preserves the Q5 draft', () => {
  const base = stage([entry(def('cobblestone'), 64), entry(def('gold_ingot'), 12)]).draft;
  assert.deepEqual(inspectQ5Draft(JSON.parse(JSON.stringify(base))), inspectQ5Draft(base));
});

test('destination-aware selection bypasses an ineligible first bucket', () => {
  const draft = stage([entry(def('cobblestone'), 64), entry(def('gold_ingot'), 8)]).draft;
  const gold = q5IdentityKey(def('gold_ingot'));
  const result = preview(draft, all(draft, {
    [q5IdentityKey(def('cobblestone'))]: { filtered: 'unavailable' },
    [gold]: { filtered: 'usable' }
  }));
  assert.equal(result.decision, 'proposed');
  assert.equal(result.key, gold);
  assert.equal(result.count, 8);
  assert.equal(result.executable, false);
});

test('filtered and automatic destinations outrank Bulk and wildcard', () => {
  const draft = stage([entry(def('stone'), 64), entry(def('gold_ingot'), 64),
    entry(def('iron_ingot'), 64)]).draft;
  const keys = [def('stone'), def('gold_ingot'), def('iron_ingot')].map(q5IdentityKey);
  const statuses = {
    [keys[0]]: { filtered: 'usable' },
    [keys[1]]: { automatic: 'usable' },
    [keys[2]]: { filtered: 'none' }
  };
  assert.equal(preview(draft, all(draft, statuses)).key, keys[0]);
  statuses[keys[0]] = { filtered: 'full' };
  assert.equal(preview(draft, all(draft, statuses)).key, keys[1]);
});

test('the batch is capped by source bucket and requested maxBatch', () => {
  const draft = stage([entry(def('stone'), 130)]).draft;
  assert.equal(preview(draft, all(draft)).count, 64);
  assert.equal(preview(draft, all(draft), { maxBatch: 11 }).count, 11);
});

test('routing requires complete per-bucket availability and current epoch', () => {
  const draft = stage([entry(def('stone'), 10), entry(def('gold_ingot'), 3)]).draft;
  const a = all(draft);
  for (const overrides of [{ completeRoutes: false }, { expectedEpoch: 8 },
    { availability: a.slice(1) }, { availability: [a[0], a[0]] },
    { maxBatch: 0 },
    { availability: [{ ...a[0], filtered: undefined }, a[1]] }]) {
    assert.equal(preview(draft, a, overrides).ok, false);
  }
});

test('stale, unknown or absent Bulk authority never grants wildcard', () => {
  const draft = stage([entry(def('stone'), 10)]).draft;
  const avail = all(draft, { [q5IdentityKey(def('stone'))]: { wildcardVerified: true } });
  const broken = ledger();
  broken.banks['bulk-1'].status = 'unloaded';
  assert.equal(preview(draft, avail, { bulkLedger: broken }).decision, 'hold');
  assert.equal(preview(draft, avail, { bulkLedger: null }).decision, 'hold');
});

test('unknown filtered destination holds that bucket rather than using wildcard', () => {
  const draft = stage([entry(def('stone'), 64)]).draft;
  const avail = all(draft, { [q5IdentityKey(def('stone'))]: {
    filtered: 'unavailable', wildcardVerified: true
  } });
  assert.equal(preview(draft, avail).decision, 'hold');
});

test('dispatch does not mutate stored buckets or consume inventory', () => {
  const draft = stage([entry(def('stone'), 64)]).draft;
  const before = JSON.stringify(draft);
  for (let i = 0; i < 50; i++) {
    assert.equal(preview(draft, all(draft)).decision, 'proposed');
  }
  assert.equal(JSON.stringify(draft), before);
});
