import test from "node:test";
import assert from "node:assert/strict";
import {
  BULK_MEMBER_CAPACITY, pointKey, verifyLocalRoute, verifyPort,
  freshLedger, bulkCapacityStatus, chooseOrdinaryDestination,
  reserveOrdinary, commitVerifiedReceipt, cancelStillAtSource, mayRemoveBulkBank
} from "../candidates/transport/ordinary_network_core.mjs";

const A = "0,0,0";
const B = "1,0,0";
const C = "2,0,0";
const D = "1,0,1";
const ordinary = Object.freeze({
  id: "minecraft:cobblestone", classification: "ordinary",
  metadataFree: true, losslessIdentity: true
});
const receipt = (txId, count, overrides = {}) => ({
  txId, count, itemId: ordinary.id, networkId: "network-alpha",
  epoch: 7, physicallyVerified: true, ...overrides
});
function topology(override = {}) {
  return {
    networkId: "network-alpha", epoch: 7,
    expectedNodes: [A, B, C], loadedNodes: [A, B, C],
    memberships: [[A, "region-west"], [B, "region-west"], [C, "region-west"]],
    claims: [{ networkId: "network-alpha", region: "region-west",
               controllerId: "bulk-1", epoch: 7 }],
    liveControllers: ["bulk-1"], unknownBoundary: false,
    ...override
  };
}
const permit = () => verifyLocalRoute(topology(), A, C);
const ledger = (banks = ["bulk-1"], epoch = 7) =>
  freshLedger("network-alpha", epoch, banks);
const reserve = (state, txId, count, overrides = {}) =>
  reserveOrdinary(state, {
    txId, item: ordinary, count,
    expectedRevision: state.revision, expectedEpoch: state.epoch,
    routePermit: permit(), ...overrides
  });
function fullBank(state, bankId, amount = BULK_MEMBER_CAPACITY) {
  const result = structuredClone(state);
  result.banks[bankId].counts[ordinary.id] = amount;
  return result;
}

test("six face source/target coordinates must be integral, never diagonal", () => {
  assert.equal(pointKey(-4, 80, 19), "-4,80,19");
  assert.equal(pointKey(1.5, 0, 0), null);
  assert.equal(pointKey(Infinity, 0, 0), null);
  assert.equal(verifyLocalRoute(topology(), A, C).ok, true);
  assert.equal(verifyLocalRoute(topology({
    expectedNodes: [A, "1,1,0"], loadedNodes: [A, "1,1,0"],
    memberships: [[A, "region-west"], ["1,1,0", "region-west"]]
  }), A, "1,1,0").reason, "no_verified_local_path");
});

test("deterministic shortest path through a loop independent of node ordering", () => {
  const nodes = [A, B, C, D, "2,0,1"];
  const reference = verifyLocalRoute(topology({
    expectedNodes: nodes, loadedNodes: nodes,
    memberships: nodes.map((n) => [n, "region-west"])
  }), A, "2,0,1");
  assert.equal(reference.ok, true);
  assert.equal(reference.path[0], A);
  assert.equal(reference.path.at(-1), "2,0,1");
  assert.equal(new Set(reference.path).size, reference.path.length);
  for (const perm of [nodes, [...nodes].reverse(), [D, C, A, "2,0,1", B]]) {
    const result = verifyLocalRoute(topology({
      expectedNodes: perm, loadedNodes: [...perm].reverse(),
      memberships: perm.map((n) => [n, "region-west"]).reverse()
    }), A, "2,0,1");
    assert.deepEqual(result.path, reference.path);
  }
});

test("unloaded, missing, extra or unknown-boundary nodes refuse transfer", () => {
  for (const overrides of [
    { loadedNodes: [A, C] }, { loadedNodes: [A, B, C, D] },
    { unknownBoundary: true }, { expectedNodes: [] },
    { loadedNodes: [A, B, B] }, { expectedNodes: [A, B, B] }
  ]) {
    assert.equal(verifyLocalRoute(topology(overrides), A, C).ok, false);
  }
});

test("competing, absent, unlive or stale controller claims are denied", () => {
  const base = topology().claims[0];
  for (const overrides of [
    { claims: [] }, { claims: [base, { ...base, controllerId: "bulk-2" }] },
    { liveControllers: [] }, { claims: [{ ...base, epoch: 6 }] },
    { claims: [{ ...base, networkId: "network-beta" }] }
  ]) {
    assert.equal(verifyLocalRoute(topology(overrides), A, C).ok, false);
  }
});

test("no silent cross-controller handoff or transit through another region", () => {
  const claims = [
    { networkId: "network-alpha", region: "region-west", controllerId: "bulk-1", epoch: 7 },
    { networkId: "network-alpha", region: "region-east", controllerId: "bulk-2", epoch: 7 }
  ];
  const route = topology({
    memberships: [[A, "region-west"], [B, "region-west"], [C, "region-east"]],
    claims, liveControllers: ["bulk-1", "bulk-2"]
  });
  assert.equal(verifyLocalRoute(route, A, B).ok, true);
  assert.equal(verifyLocalRoute(route, A, C).reason,
               "cross_region_handoff_unproven");
  route.memberships = [[A, "region-west"], [B, "region-east"], [C, "region-west"]];
  assert.equal(verifyLocalRoute(route, A, C).reason, "no_verified_local_path");
});

test("missing or duplicate or malformed membership cannot invent a region", () => {
  for (const memberships of [
    [[A, "region-west"], [B, "region-west"]],
    [[A, "region-west"], [B, "region-west"], [B, "region-west"]],
    [[A, "region-west"], [B, "region-west"], [D, "region-west"]],
    [[A, "region-west"], [B, ""], [C, "region-west"]]
  ]) {
    assert.equal(verifyLocalRoute(topology({ memberships }), A, C).ok, false);
  }
});

test("convention ports: adjacent containers only inputs; Sorter is only output", () => {
  assert.equal(verifyPort({ role: "extract", neighborKind: "ordinary_container",
                            validatedSource: true }).ok, true);
  assert.equal(verifyPort({ role: "extract", neighborKind: "ordinary_container",
                            validatedSource: false }).ok, false);
  assert.equal(verifyPort({ role: "deliver", neighborKind: "ordinary_container",
                            validatedSource: true }).ok, false);
  assert.equal(verifyPort({ role: "deliver", neighborKind: "sorter_intake" }).ok, true);
  assert.equal(verifyPort({ role: "deliver", neighborKind: "sorter_intake",
                            redstoneAllowed: false }).ok, false);
  assert.equal(verifyPort({ role: "extract", neighborKind: "hartbots_virtual_depot",
                            validatedSource: true }).ok, false);
});

test("one Bulk member has 200,000 ordinary-item capacity, not a stack count", () => {
  let s = ledger();
  const first = reserve(s, "tx-1", 200000);
  assert.equal(first.ok, true);
  assert.equal(first.executable, false);
  assert.deepEqual(first.allocations, [{ bankId: "bulk-1", count: 200000 }]);
  s = first.state;
  assert.deepEqual(bulkCapacityStatus(s), {
    ok: true, status: "verified_full", free: 0
  });
  assert.equal(reserve(s, "tx-2", 1).reason, "insufficient_verified_capacity");
  const committed = commitVerifiedReceipt(s, "tx-1", receipt("tx-1", 200000), s.revision);
  assert.equal(committed.ok, true);
  assert.equal(committed.state.banks["bulk-1"].counts[ordinary.id], 200000);
  assert.equal(bulkCapacityStatus(committed.state).free, 0);
});

test("a multi-bank batch reserves deterministic atomic slices without partial admission", () => {
  const original = ledger(["bulk-3", "bulk-1", "bulk-2"]);
  const planned = reserve(original, "big", 450000);
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.allocations, [
    { bankId: "bulk-1", count: 200000 },
    { bankId: "bulk-2", count: 200000 },
    { bankId: "bulk-3", count: 50000 }
  ]);
  assert.equal(bulkCapacityStatus(planned.state).free, 150000);
  assert.equal(bulkCapacityStatus(original).free, 600000);
  const denied = reserve(planned.state, "too-big", 150001);
  assert.equal(denied.ok, false);
  assert.equal(denied.state, undefined);
  assert.equal(bulkCapacityStatus(planned.state).free, 150000);
});

test("fully verified full Bulk permits wildcard only when verified downstream", () => {
  const s = fullBank(ledger(), "bulk-1");
  assert.deepEqual(chooseOrdinaryDestination(s, { wildcardVerified: true }),
                   { decision: "wildcard", reason: "bulk_verified_full" });
  assert.equal(chooseOrdinaryDestination(s).decision, "hold");
  assert.equal(chooseOrdinaryDestination(ledger(), { wildcardVerified: true }).decision,
               "bulk");
});

test("filtered/automatic targets outrank Bulk; unknown specific target holds", () => {
  const s = ledger();
  assert.equal(chooseOrdinaryDestination(s, { filtered: "usable",
                     automatic: "usable", wildcardVerified: true }).decision, "filtered");
  assert.equal(chooseOrdinaryDestination(s, { filtered: "full",
                     automatic: "usable" }).decision, "automatic");
  assert.equal(chooseOrdinaryDestination(s, { filtered: "unavailable",
                     wildcardVerified: true }).decision, "hold");
  assert.equal(chooseOrdinaryDestination(s, { automatic: "unavailable" }).decision, "hold");
  assert.equal(chooseOrdinaryDestination(s, { filtered: "unknown" }).decision, "hold");
});

test("unloaded, stale, unknown, foreign or missing Bulk capacity cannot permit wildcard", () => {
  for (const mutation of [
    (s) => { s.banks["bulk-1"].status = "unloaded"; },
    (s) => { s.banks["bulk-1"].status = "unknown"; },
    (s) => { s.banks["bulk-1"].epoch -= 1; },
    (s) => { s.banks["bulk-1"].networkId = "foreign"; },
    (s) => { delete s.banks["bulk-1"]; },
    (s) => { s.expectedBankIds.push("missing"); }
  ]) {
    const s = structuredClone(ledger());
    mutation(s);
    assert.equal(chooseOrdinaryDestination(s, { wildcardVerified: true }).decision,
                 "hold");
    assert.equal(reserve(s, "none", 1).ok, false);
  }
});

test("new bank with existing stored ordinary counts cannot exceed 200k", () => {
  const s = fullBank(ledger(), "bulk-1", 199999);
  const got = reserve(s, "last", 1);
  assert.equal(got.ok, true);
  assert.equal(reserve(got.state, "over", 1).reason, "insufficient_verified_capacity");
  const bad = fullBank(ledger(), "bulk-1", 200001);
  assert.equal(bulkCapacityStatus(bad).ok, false);
});

test("metadata-rich/ambiguous classification never enters ordinary buckets", () => {
  for (const item of [
    { ...ordinary, metadataFree: false },
    { ...ordinary, losslessIdentity: false },
    { ...ordinary, classification: "native-mr" },
    { ...ordinary, classification: "ordinary", metadataFree: undefined },
    { ...ordinary, id: "" },
    { id: "minecraft:enchanted_book", classification: "ordinary",
      losslessIdentity: true, metadataFree: false }
  ]) {
    assert.equal(reserve(ledger(), "mr", 1, { item }).reason,
                 "unverified_or_metadata_rich_item");
  }
});

test("negative, fractional, non-integer or unsafe quantities are refused", () => {
  for (const count of [-1, 0, 0.3, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
    assert.equal(reserve(ledger(), "bad", count).ok, false);
  }
});

test("reject a forged or stale topology route permit", () => {
  const s = ledger();
  const proof = permit();
  for (const routePermit of [
    null, { ok: true }, { ...proof, epoch: 6 },
    { ...proof, networkId: "foreign" }, { ...proof, path: [] },
    { ...proof, controllerId: "" }
  ]) {
    assert.equal(reserve(s, "r", 1, { routePermit }).reason,
                 "route_authority_missing");
  }
});

test("two simultaneous proposals from same revision cannot both commit without CAS", () => {
  const s = ledger();
  const a = reserve(s, "concurrent-a", 100000);
  const b = reserve(s, "concurrent-b", 100000);
  assert.equal(a.ok && b.ok, true);
  assert.equal(a.state.revision, 1);
  assert.equal(reserve(a.state, "concurrent-b", 100000, {
    expectedRevision: s.revision
  }).reason, "revision_conflict");
  assert.equal(commitVerifiedReceipt(a.state, "concurrent-a",
                     receipt("concurrent-a", 100000), s.revision).reason,
                     "revision_conflict");
});

test("duplicate transaction request is idempotent, nonexecutable and does not reserve twice", () => {
  const s = reserve(ledger(), "idem", 88).state;
  const repeated = reserve(s, "idem", 88, { expectedRevision: 0 });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.executable, false);
  assert.equal(repeated.state, s);
  assert.equal(bulkCapacityStatus(s).free, 200000 - 88);
  assert.equal(reserve(s, "idem", 89).reason, "transaction_id_conflict");
});

test("ack receipt must match exact item, ID, network, epoch and physical success", () => {
  const s = reserve(ledger(), "ack", 64).state;
  for (const edits of [
    { count: 63 }, { epoch: 8 }, { itemId: "minecraft:dirt" },
    { txId: "other" }, { networkId: "unknown" },
    { physicallyVerified: false }
  ]) {
    assert.equal(commitVerifiedReceipt(s, "ack",
                 receipt("ack", 64, edits), s.revision).reason,
                 "receipt_not_proven");
  }
  assert.equal(bulkCapacityStatus(s).free, 200000 - 64);
  assert.deepEqual(Object.entries(s.banks["bulk-1"].counts), []);
});

test("verified receipt commits exact bucket once; replay cannot double count", () => {
  const s = reserve(ledger(), "ack", 64).state;
  const first = commitVerifiedReceipt(s, "ack", receipt("ack", 64), s.revision);
  assert.equal(first.ok, true);
  assert.equal(first.state.banks["bulk-1"].counts[ordinary.id], 64);
  const replay = commitVerifiedReceipt(first.state, "ack", receipt("ack", 64), 0);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.changed, false);
  assert.equal(replay.state.banks["bulk-1"].counts[ordinary.id], 64);
  assert.equal(reserve(first.state, "ack", 64).executable, false);
});

test("timeout cannot silently cancel until source custody is independently verified", () => {
  const s = reserve(ledger(), "pending", 16).state;
  assert.equal(cancelStillAtSource(s, "pending", null, s.revision).reason,
               "source_custody_unverified");
  assert.equal(cancelStillAtSource(s, "pending",
              { txId: "pending", sourceRetainsExactItems: false },
              s.revision).reason, "source_custody_unverified");
  const done = cancelStillAtSource(s, "pending",
       { txId: "pending", sourceRetainsExactItems: true }, s.revision);
  assert.equal(done.ok, true);
  assert.equal(bulkCapacityStatus(done.state).free, 200000);
  assert.equal(cancelStillAtSource(done.state, "pending",
               { txId: "pending", sourceRetainsExactItems: true }, 0).duplicate, true);
  assert.equal(commitVerifiedReceipt(done.state, "pending",
               receipt("pending", 16), done.state.revision).reason,
               "canceled_transaction");
});

test("cannot cancel a committed receipt or drop populated/reserved Bulk", () => {
  const s = reserve(ledger(), "will-commit", 28).state;
  assert.equal(mayRemoveBulkBank(s, "bulk-1").reason,
               "bank_has_in_flight_reservations");
  const committed = commitVerifiedReceipt(s, "will-commit",
                    receipt("will-commit", 28), s.revision).state;
  assert.equal(mayRemoveBulkBank(committed, "bulk-1").reason,
               "bank_contains_items");
  assert.equal(cancelStillAtSource(committed, "will-commit",
               { txId: "will-commit", sourceRetainsExactItems: true },
               committed.revision).reason, "already_committed");
  assert.equal(mayRemoveBulkBank(ledger(), "bulk-1").ok, true);
  assert.equal(mayRemoveBulkBank(ledger(), "not-present").ok, false);
});

test("stale controller/bank epoch fails closed instead of reusing pending reservation", () => {
  const s = reserve(ledger(), "hold", 1).state;
  const stale = structuredClone(s);
  stale.epoch = 8;
  assert.equal(bulkCapacityStatus(stale).ok, false);
  assert.equal(reserve(stale, "hold", 1).ok, false);
  assert.equal(commitVerifiedReceipt(stale, "hold",
                 receipt("hold", 1, { epoch: 8 }), stale.revision).ok, false);
});

test("split/merge bank membership change cannot borrow a stale capacity manifest", () => {
  const s = ledger(["bulk-1", "bulk-2"]);
  const split = structuredClone(s);
  delete split.banks["bulk-2"];
  assert.equal(chooseOrdinaryDestination(split, { wildcardVerified: true }).decision,
               "hold");
  const merged = structuredClone(s);
  merged.banks["bulk-3"] = { networkId: merged.networkId, epoch: 7,
                              status: "verified", counts: {} };
  assert.equal(reserve(merged, "after-merge", 1).ok, false);
});

test("many deterministic valid ACKs conserve planned totals and obey capacity", () => {
  let s = ledger(["bulk-1", "bulk-2"]);
  let total = 0;
  for (let i = 0; i < 120; i += 1) {
    const amount = (i % 17 + 1) * 111;
    const txId = "batch-" + i;
    const plan = reserve(s, txId, amount);
    assert.equal(plan.ok, true);
    const accepted = commitVerifiedReceipt(plan.state, txId,
                                          receipt(txId, amount), plan.state.revision);
    assert.equal(accepted.ok, true);
    s = accepted.state;
    total += amount;
    assert.equal(s.banks["bulk-1"].counts[ordinary.id] +
                 (s.banks["bulk-2"].counts[ordinary.id] || 0), total);
    assert.equal(bulkCapacityStatus(s).free, 400000 - total);
  }
  assert.equal(s.revision, 240);
});


test("special JS property names cannot bypass idempotency or bank capacity", () => {
  const s = freshLedger("network-alpha", 7, ["__proto__"]);
  const item = { ...ordinary, id: "mod:__proto__" };
  const first = reserve(s, "__proto__", 42, { item });
  assert.equal(first.ok, true);
  assert.equal(Object.getPrototypeOf(first.state.transactions), null);
  const replay = reserve(first.state, "__proto__", 42, { item });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.executable, false);
  const confirmed = commitVerifiedReceipt(first.state, "__proto__", {
    ...receipt("__proto__", 42), itemId: "mod:__proto__"
  }, first.state.revision);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.state.banks["__proto__"].counts["mod:__proto__"], 42);
  assert.equal(bulkCapacityStatus(confirmed.state).free, BULK_MEMBER_CAPACITY - 42);
});

test("unqualified and JavaScript-native item keys are not ordinary bucket IDs", () => {
  for (const id of ["__proto__", "constructor", "minecraft:", "minecraft:bad space",
                    "minecraft:DIRT", ":stone", "minecraft:stone#tag"]) {
    assert.equal(reserve(ledger(), "bad-item", 1,
      { item: { ...ordinary, id } }).reason, "unverified_or_metadata_rich_item");
  }
});
