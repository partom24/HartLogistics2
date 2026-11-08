/**
 * Permanent source-executed Q4 recovery witnesses; not Bedrock crash evidence.
 * Execute the PG24 build's real recovery/classifier/guards against explicit
 * mocked save cuts and external inventory writers. No gameplay code is patched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../build/pg24-lab/behavior_pack/scripts/main.js", import.meta.url), "utf8"
);
function body(name) {
  const anchor = "function " + name + "(";
  const start = source.indexOf(anchor);
  assert.ok(start >= 0, "missing PG24 function " + name);
  assert.equal(source.indexOf(anchor, start + anchor.length), -1, "duplicate " + name);
  const end = source.indexOf("\nfunction ", start + anchor.length);
  return source.slice(start, end < 0 ? undefined : end);
}
const actual = [
  "safeJsonParse", "getQueueJournal", "saveQueueJournal", "queueMetaMatches",
  "journalQueueState", "pg24PreservePendingEntityJournal", "recoverQueueJournal"
].map(body).join("\n");
const data = {typeId: "minecraft:cobblestone"};
const sig = JSON.stringify(data);
const meta = (total, next, received, delivered) => ({
  head: total ? 1 : 0, tail: total ? 1 : 0, next, total, received, delivered
});
const stack = (amount, typeId = data.typeId) => amount ? {typeId, amount,
  clone() { return stack(this.amount, this.typeId); }} : undefined;

function rig(kind, {queue = "after", physical = 0, external = 0,
                     typeId = data.typeId, missingContainer = false,
                     physicalPending = false, pageOnly = false} = {}) {
  assert.ok(kind === "enqueue" || kind === "dequeue" || kind === "entity_enqueue");
  const enqueue = kind !== "dequeue";
  const before = enqueue ? 0 : 8, after = enqueue ? 8 : 0;
  const tx = {kind, receiverId: "r", entryId: "r:e1", move: 8, item: data,
    qBefore: before, qAfter: after,
    qMetaBefore: enqueue ? meta(0, 1, 0, 0) : meta(8, 2, 8, 0),
    qMetaAfter: enqueue ? meta(8, 2, 8, 0) : meta(0, 2, 8, 8),
    sourceD: "minecraft:overworld", source: {x: 0, y: 64, z: 0}, srcSlot: 0,
    srcSig: sig, srcBefore: 8, srcAfter: 0,
    dstD: "minecraft:overworld", dst: {x: 4, y: 64, z: 0}, dstSlot: 0,
    dstSig: sig, dstBefore: 0, dstAfter: 8};
  const raw = new Map([["queue", JSON.stringify(tx)]]);
  if (physicalPending) raw.set("physical", "pending physical receipt");
  const amount = queue === "before" ? before : queue === "after" ? after : 4;
  const q = {meta: {...(queue === "before" || pageOnly ? tx.qMetaBefore : tx.qMetaAfter)}, amount};
  let slot = stack(physical, typeId), writes = 0, metaWrites = 0;
  const logs = [], holds = [];
  const container = {
    getItem(n) { assert.equal(n, 0); return slot?.clone(); },
    setItem(n, item) { assert.equal(n, 0); writes++; slot = item?.clone(); }
  };
  const context = {
    QUEUE_JOURNAL_KEY: "queue", JOURNAL_KEY: "physical",
    world: {getDynamicProperty: key => raw.get(key)},
    setWorldDynamic(key, value) {
      if (value === undefined) raw.delete(key); else raw.set(key, value);
    },
    log: msg => logs.push(msg), pg20ReportHold: msg => holds.push(msg),
    findReceiverById: id => id === "r" ? {id} : undefined,
    loadReceiverQueue: () => q, queueEntryAmount: () => q.amount,
    persistQueueMeta(_receiver, _queue, value) { metaWrites++; q.meta = {...value}; },
    getContainerAt: () => missingContainer ? undefined : container,
    serializeQueueItem: item => item ? {typeId: item.typeId} : undefined,
    queueDataSignature: value => JSON.stringify(value),
    queueSlotState: () => ({amount: slot?.amount ?? 0,
      sig: slot ? JSON.stringify({typeId: slot.typeId}) : ""}),
    rebuildQueueItem: (item, count) => stack(count, item.typeId)
  };
  vm.runInNewContext("let pg24EntityHold = false;\n" + actual, context);
  return {
    recover: () => context.recoverQueueJournal(), raw, q, logs, holds,
    pending: () => raw.has("queue"),
    physical: () => slot?.amount ?? 0,
    writes: () => writes, metaWrites: () => metaWrites,
    total: () => q.amount + (slot?.amount ?? 0) + external
  };
}

test("control: uninterrupted enqueue recovery completes the unperformed source debit", () => {
  const h = rig("enqueue", {physical: 8});
  h.recover();
  assert.equal(h.total(), 8); assert.equal(h.physical(), 0);
  assert.equal(h.writes(), 1); assert.equal(h.pending(), false);
});
test("control: uninterrupted dequeue recovery completes the unperformed destination credit", () => {
  const h = rig("dequeue"); h.recover();
  assert.equal(h.total(), 8); assert.equal(h.physical(), 8);
  assert.equal(h.writes(), 1); assert.equal(h.pending(), false);
});
test("witness: drained completed output looks untouched and is credited a second time", () => {
  // Output already delivered eight; a vanilla/player writer moved them elsewhere.
  const h = rig("dequeue", {external: 8});
  assert.equal(h.total(), 8); h.recover();
  assert.equal(h.total(), 16); assert.equal(h.writes(), 1);
  assert.equal(h.pending(), false);
  h.recover(); assert.equal(h.total(), 16); // Clearance cannot undo the extra credit.
});
test("witness: refilled completed input looks undebited and replacement items are deleted", () => {
  // Eight original items are in Q4; eight new same-signature items refill input.
  const h = rig("enqueue", {physical: 8});
  assert.equal(h.total(), 16); h.recover();
  assert.equal(h.total(), 8); assert.equal(h.writes(), 1);
  assert.equal(h.pending(), false);
});
test("witness: rolled-back enqueue page plus already-debited input clears as untouched", () => {
  const h = rig("enqueue", {queue: "before"}); h.recover();
  assert.equal(h.total(), 0); // Eight expected items are absent from both domains.
  assert.equal(h.writes(), 0); assert.equal(h.pending(), false);
  assert.ok(h.logs.includes("Recovered untouched queue enqueue."));
});
test("witness: rolled-back dequeue page plus credited output clears with both copies", () => {
  const h = rig("dequeue", {queue: "before", physical: 8}); h.recover();
  assert.equal(h.total(), 16); assert.equal(h.writes(), 0);
  assert.equal(h.pending(), false);
  assert.ok(h.logs.includes("Recovered untouched queue dequeue."));
});
test("witness: metadata repair cannot authenticate an already-drained output", () => {
  const h = rig("dequeue", {pageOnly: true, external: 8}); h.recover();
  assert.equal(h.metaWrites(), 1); assert.equal(h.total(), 16);
  assert.equal(h.pending(), false);
});
test("control: a different source identity preserves the unresolved enqueue receipt", () => {
  const h = rig("enqueue", {physical: 8, typeId: "minecraft:diamond"}); h.recover();
  assert.equal(h.writes(), 0); assert.equal(h.pending(), true);
});
test("control: ambiguous queue amount preserves receipt and inventory", () => {
  const h = rig("dequeue", {queue: "ambiguous"}); h.recover();
  assert.equal(h.writes(), 0); assert.equal(h.metaWrites(), 0);
  assert.equal(h.pending(), true);
});
test("control: unloaded physical container preserves the receipt", () => {
  const h = rig("enqueue", {missingContainer: true}); h.recover();
  assert.equal(h.writes(), 0); assert.equal(h.pending(), true);
});
test("control: PG23 physical journal fence blocks Q4 container recovery", () => {
  const h = rig("dequeue", {physicalPending: true}); h.recover();
  assert.equal(h.writes(), 0); assert.equal(h.pending(), true);
  assert.equal(h.holds.length, 1);
});
test("control: PG24 entity journal fence remains HOLD without Q4 metadata repair", () => {
  const h = rig("entity_enqueue", {pageOnly: true}); h.recover();
  assert.equal(h.writes(), 0); assert.equal(h.metaWrites(), 0);
  assert.equal(h.pending(), true); assert.equal(h.holds.length, 1);
});
