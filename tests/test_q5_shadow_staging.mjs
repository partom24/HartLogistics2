import test from 'node:test';
import assert from 'node:assert/strict';
import { q5IdentityKey, stageQ4OrdinaryDraft } from '../candidates/transport/q5_bucket_core.mjs';
import {
  Q5_SHADOW_SCHEMA, REQUIRED_FROZEN_HANDLERS,
  planQ5ShadowWrites, inspectQ5ShadowStore
} from '../candidates/transport/q5_shadow_staging.mjs';

const item = (id, amount) => ({
  amount, definition: { typeId: 'minecraft:' + id },
  classification: 'ordinary', metadataFree: true, losslessIdentity: true
});
const entries = [
  item('cobblestone', 6), item('gold_ingot', 12), item('cobblestone', 7),
  item('iron_ingot', 11)
];
const stage = values => stageQ4OrdinaryDraft({
  receiverId: 'minecraft:overworld:-955,69,-790', epoch: 7,
  entries: values, declaredTotal: values.reduce((n, x) => n + x.amount, 0),
  journalClear: true, complete: true
}).draft;
const freeze = () => ({
  active: true, worldEpoch: 7, verifiedAllHartHandlers: true,
  coveredHandlers: [...REQUIRED_FROZEN_HANDLERS]
});
const q4 = draft => ({
  receiverId: draft.receiverId, snapshotFingerprint: 'q4:read-only-source-snapshot',
  revision: 18, completeSnapshot: true, queueJournalClear: true,
  physicalJournalClear: true, sourceUnchanged: true, total: draft.total
});
function fixture(values = entries) {
  const draft = stage(values);
  const options = { draft, q4: q4(draft), freeze: freeze() };
  const plan = planQ5ShadowWrites(options);
  assert.equal(plan.ok, true);
  return { options, plan };
}
const write = (plan, count = plan.writes.length) => new Map(
  plan.writes.slice(0, count).map(({key, value}) => [key, value]));
const check = (f, records, overrides = {}) =>
  inspectQ5ShadowStore({ ...f.options, records, ...overrides });
const hold = result => {
  assert.equal(result.ok, false);
  assert.equal(result.status, 'HOLD');
  for (const field of [
    'canRoute', 'canMigrate', 'canClearQ4', 'canSettle', 'canRetry', 'canWriteWorld'
  ]) assert.equal(result[field], false, field);
};

test('stages separate page records, then manifest, then seal, with Q4 ownership only', () => {
  const f = fixture();
  assert.equal(f.plan.status, 'WRITE_PLAN_ONLY');
  assert.ok(f.plan.writes.length >= 3);
  assert.ok(f.plan.writes[0].key.endsWith('page:0'));
  assert.ok(f.plan.writes.at(-2).key.endsWith('manifest'));
  assert.ok(f.plan.writes.at(-1).key.endsWith('seal'));
  const manifest = JSON.parse(f.plan.writes.at(-2).value);
  assert.equal(manifest.schema, Q5_SHADOW_SCHEMA);
  assert.equal(manifest.owner, 'Q4_ONLY');
  assert.equal(manifest.total, f.options.draft.total);
  assert.equal(manifest.sourceRevision, 18);
  assert.equal(manifest.pages, f.options.draft.pages.length);
  assert.equal(check(f, write(f.plan)).status, 'SHADOW_STAGED_READ_ONLY');
});

test('even a verified complete shadow cannot authorize migration or gameplay', () => {
  const f = fixture();
  const stored = write(f.plan);
  const before = JSON.stringify(f.options.draft);
  for (let i = 0; i < 12; i++) {
    const verified = check(f, stored);
    assert.equal(verified.ok, true);
    assert.equal(verified.sourceAuthority, 'Q4_ONLY');
    assert.equal(verified.stagedItems, 36);
    for (const field of ['canRoute', 'canMigrate', 'canClearQ4',
      'canSettle', 'canRetry', 'canWriteWorld']) assert.equal(verified[field], false);
  }
  assert.equal(JSON.stringify(f.options.draft), before);
  assert.equal(stored.size, f.plan.writes.length);
});

test('crash before/after EVERY independently written record holds', () => {
  const values = Array.from({length: 27}, (_, i) => item('type_' + i, 2));
  const f = fixture(values);
  assert.ok(f.options.draft.pages.length > 2);
  for (let i = 0; i < f.plan.writes.length; i++) {
    const result = check(f, write(f.plan, i));
    hold(result);
    assert.equal(result.reason, 'partial_shadow_snapshot');
  }
  assert.equal(check(f, write(f.plan)).ok, true);
});

test('corruption of ANY staged record holds, including seal and manifest', () => {
  const f = fixture(Array.from({length: 19}, (_, i) => item('type_' + i, i + 1)));
  for (const step of f.plan.writes) {
    const store = write(f.plan);
    store.set(step.key, step.value + 'T');
    const result = check(f, store);
    hold(result);
    assert.equal(result.reason, 'shadow_snapshot_mismatch');
  }
});

test('missing one interior page refuses even if the seal is present', () => {
  const f = fixture(Array.from({length: 25}, (_, i) => item('type_' + i, 1)));
  for (const step of f.plan.writes) {
    const store = write(f.plan);
    store.delete(step.key);
    hold(check(f, store));
  }
});

test('replaying a staged seal does not authorize anything or mutate Q4', () => {
  const f = fixture();
  const store = write(f.plan);
  const before = JSON.stringify([...store]);
  assert.equal(check(f, store).canMigrate, false);
  store.set(f.plan.writes.at(-1).key, f.plan.writes.at(-1).value);
  assert.equal(check(f, store).canRoute, false);
  assert.equal(JSON.stringify([...store]), before);
});

test('out-of-order or partial record arrival is held until a complete shadow', () => {
  const f = fixture(Array.from({length: 19}, (_, i) => item('type_' + i, 1)));
  const store = new Map();
  for (const step of [...f.plan.writes].reverse()) {
    store.set(step.key, step.value);
    if (store.size < f.plan.writes.length) hold(check(f, store));
  }
  // Final bytes agree; insertion ordering itself is not a durability proof.
  assert.equal(check(f, store).status, 'SHADOW_STAGED_READ_ONLY');
});

test('source Q4 changes while staging: no implicit adoption of old page bytes', () => {
  const f = fixture();
  const store = write(f.plan);
  const original = f.options.q4;
  for (const changes of [
    { revision: 19 }, { snapshotFingerprint: 'q4:modified' },
    { total: original.total + 1 }, { receiverId: 'foreign' },
    { queueJournalClear: false }, { physicalJournalClear: false },
    { sourceUnchanged: false }, { completeSnapshot: false }
  ]) hold(check(f, store, { q4: { ...original, ...changes } }));
});

test('global freeze missing, stale or incomplete refuses plan AND staged data', () => {
  const f = fixture();
  const store = write(f.plan);
  for (const changes of [
    { active: false }, { worldEpoch: 8 }, { verifiedAllHartHandlers: false },
    { coveredHandlers: REQUIRED_FROZEN_HANDLERS.slice(1) },
    { coveredHandlers: [...REQUIRED_FROZEN_HANDLERS, 'unknown_handler'] },
    { coveredHandlers: [...REQUIRED_FROZEN_HANDLERS.slice(1),
                         REQUIRED_FROZEN_HANDLERS[1]] }
  ]) {
    const freezeState = { ...f.options.freeze, ...changes };
    hold(planQ5ShadowWrites({ ...f.options, freeze: freezeState }));
    hold(check(f, store, { freeze: freezeState }));
  }
});

test('bad Q4 snapshot flags and unreadable stage map refuse safely', () => {
  const f = fixture();
  hold(planQ5ShadowWrites({ ...f.options, q4: null }));
  hold(check(f, null));
  hold(check(f, { [f.plan.writes[0].key]: f.plan.writes[0].value }));
});

test('unknown same-generation record cannot be hidden behind a valid seal', () => {
  const f = fixture();
  const store = write(f.plan);
  store.set(f.plan.namespace + 'page:99', '{}');
  hold(check(f, store));
  store.delete(f.plan.namespace + 'page:99');
  store.set(f.plan.namespace + 'unrecognized-intent', '{}');
  hold(check(f, store));
});

test('unrelated receiver and older generation records are not deleted or used', () => {
  const f = fixture();
  const store = write(f.plan);
  store.set('other-minecraft-key', 'keep');
  store.set('hl2:q5shadow:other-receiver:e7:r18:page:0', 'older-different-owner');
  assert.equal(check(f, store).ok, true);
  assert.equal(store.get('other-minecraft-key'), 'keep');
});

test('cannot splice an older Q4 source revision into a later stage', () => {
  const f = fixture();
  const oldStore = write(f.plan);
  const newerQ4 = { ...f.options.q4, revision: 19 };
  const newer = planQ5ShadowWrites({ ...f.options, q4: newerQ4 });
  assert.equal(newer.ok, true);
  hold(check(f, oldStore, {q4: newerQ4}));
});

test('cannot claim shadow staging for unverified or MR-containing Q4', () => {
  const invalid = stageQ4OrdinaryDraft({
    receiverId: 'r', epoch: 7, entries: [
      { ...item('enchanted_book', 1), metadataFree: false }
    ], declaredTotal: 1, complete: true, journalClear: true
  });
  assert.equal(invalid.ok, false);
  hold(planQ5ShadowWrites({draft: invalid.draft, q4: q4(stage([])), freeze: freeze()}));
});

test('empty and full 250000-item ordinary source remain read-only shadows', () => {
  for (const source of [[], [item('stone', 250000)]]) {
    const f = fixture(source);
    const result = check(f, write(f.plan));
    assert.equal(result.ok, true);
    assert.equal(result.stagedItems, source.length ? 250000 : 0);
    assert.equal(result.canMigrate, false);
  }
});

test('source snapshot identity cannot be spoofed by colliding count alone', () => {
  const f = fixture();
  const store = write(f.plan);
  const wrongDraft = stage([item('iron_ingot', 36)]);
  hold(check(f, store, {draft: wrongDraft}));
});

test('staging pages reflect exact Q5 identity buckets, not Q4 arrival order', () => {
  const f = fixture();
  const f2 = fixture([...entries].reverse());
  assert.deepEqual(f.options.draft.pages, f2.options.draft.pages);
  assert.deepEqual(f.plan.writes, f2.plan.writes);
  assert.ok(f.options.draft.pages[0].buckets.some(
    bucket => bucket.key === q5IdentityKey({typeId:'minecraft:gold_ingot'})
  ));
});
