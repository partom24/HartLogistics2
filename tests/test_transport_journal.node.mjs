import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync,
  unlinkSync, openSync, closeSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createJournal, replayJournal, appendEvent, BANK_CAPACITY
} from "../candidates/transport/ordinary_journal.node.mjs";

function fixture(fn, bankIds = ["bulk-west", "bulk-east"]) {
  const dir = mkdtempSync(join(tmpdir(), "hl-ordinary-journal-"));
  const file = join(dir, "ordinary-transport.wal");
  try {
    createJournal(file, { networkId: "network-alpha", epoch: 17, bankIds });
    return fn(file);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}
function plan(txId = "tx-one", count = 42, extra = {}) {
  return {
    txId, networkId: "network-alpha", epoch: 17,
    itemId: "minecraft:cobblestone", count,
    sourceId: "chest-a", destinationId: "bulk-west",
    allocations: [{ bankId: "bulk-west", count }],
    ...extra
  };
}
const intent = (txId = "tx-one") => ({ txId });
const ack = (txId = "tx-one", count = 42, extra = {}) => ({
  txId, receiptId: "ack-" + txId, networkId: "network-alpha", epoch: 17,
  itemId: "minecraft:cobblestone", count,
  sourceId: "chest-a", destinationId: "bulk-west",
  sourceDebited: true, destinationCredited: true, ...extra
});
const abort = (txId = "tx-one") =>
  ({ txId, sourceRetainsExactItems: true, destinationUnchanged: true });
const write = (file, action, data, extra = {}) =>
  appendEvent(file, action, data,
    { expectedHead: replayJournal(file).head, ...extra });

test("new journal has a fsynced genesis and no inferred physical inventory", () => fixture((file) => {
  const s = replayJournal(file);
  assert.equal(s.networkId, "network-alpha");
  assert.equal(s.epoch, 17);
  assert.equal(s.sequence, 1);
  assert.equal(Object.keys(s.transactions).length, 0);
  assert.equal(readFileSync(file, "utf8").endsWith("\n"), true);
}));

test("reserve before handoff holds across restart, never auto-moves or auto-aborts", () => fixture((file) => {
  const r = write(file, "RESERVE", plan());
  assert.equal(r.canPerformPhysicalMove, false);
  assert.equal(replayJournal(file).recovery["tx-one"], "HOLD_PRE_HANDOFF");
  assert.equal(replayJournal(file).transactions["tx-one"].status, "reserved");
}));

test("durable HANDOFF_INTENT is required before physical move may even be attempted", () => fixture((file) => {
  const reserved = write(file, "RESERVE", plan());
  assert.equal(reserved.canPerformPhysicalMove, false);
  const intended = write(file, "HANDOFF_INTENT", intent());
  assert.equal(intended.canPerformPhysicalMove, true);
  assert.equal(replayJournal(file).recovery["tx-one"], "HOLD_AMBIGUOUS_HANDOFF");
  // Retry is not new authorization, including after crash and fresh reopen.
  const duplicate = write(file, "HANDOFF_INTENT", intent());
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.canPerformPhysicalMove, false);
}));

test("externally asserted complete receipt settles once; duplicate ACK is harmless", () => fixture((file) => {
  write(file, "RESERVE", plan());
  write(file, "HANDOFF_INTENT", intent());
  const done = write(file, "SETTLE", ack());
  assert.equal(done.recovery["tx-one"], "JOURNAL_SETTLED_NO_REPLAY");
  assert.equal(done.transactions["tx-one"].receiptId, "ack-tx-one");
  const again = write(file, "SETTLE", ack());
  assert.equal(again.duplicate, true);
  assert.equal(again.canPerformPhysicalMove, false);
  assert.equal(replayJournal(file).sequence, 4);
}));

test("settling the same tx with a changed receipt is a conflict, not a duplicate", () => fixture((file) => {
  write(file, "RESERVE", plan());
  write(file, "HANDOFF_INTENT", intent());
  write(file, "SETTLE", ack());
  assert.throws(() => write(file, "SETTLE", ack("tx-one", 42,
    { destinationCredited: false })), /JOURNAL_HOLD/);
  assert.throws(() => write(file, "SETTLE", ack("tx-one", 42,
    { receiptId: "ack-other" })), /JOURNAL_HOLD/);
}));

test("attempting an ACK before a handoff intent always holds", () => fixture((file) => {
  write(file, "RESERVE", plan());
  assert.throws(() => write(file, "SETTLE", ack()), /settlement_not_supported/);
  assert.equal(replayJournal(file).recovery["tx-one"], "HOLD_PRE_HANDOFF");
}));

test("incomplete, untrusted or mismatched physical receipts never settle", () => fixture((file) => {
  write(file, "RESERVE", plan());
  write(file, "HANDOFF_INTENT", intent());
  for (const change of [
    { sourceDebited: false }, { destinationCredited: false },
    { itemId: "minecraft:dirt" }, { count: 43 },
    { epoch: 18 }, { networkId: "foreign" },
    { sourceId: "chest-elsewhere" }, { destinationId: "bulk-east" },
    { receiptId: null }
  ]) {
    assert.throws(() => write(file, "SETTLE", ack("tx-one", 42, change)), /JOURNAL_HOLD/);
  }
  assert.equal(replayJournal(file).recovery["tx-one"], "HOLD_AMBIGUOUS_HANDOFF");
}));

test("no cancellation after HANDOFF_INTENT: ambiguous physical custody must HOLD", () => fixture((file) => {
  write(file, "RESERVE", plan());
  write(file, "HANDOFF_INTENT", intent());
  assert.throws(() => write(file, "ABORT", abort()), /abort_requires_no_move/);
  assert.equal(replayJournal(file).recovery["tx-one"], "HOLD_AMBIGUOUS_HANDOFF");
}));

test("cancel-before-intent requires both unchanged-source and destination proof flags", () => fixture((file) => {
  write(file, "RESERVE", plan());
  assert.throws(() => write(file, "ABORT", { ...abort(),
    sourceRetainsExactItems: false }), /abort_requires_no_move/);
  assert.throws(() => write(file, "ABORT", { ...abort(),
    destinationUnchanged: false }), /abort_requires_no_move/);
  const canceled = write(file, "ABORT", abort());
  assert.equal(canceled.recovery["tx-one"], "ABORTED_NO_MOVE");
  assert.equal(write(file, "ABORT", abort()).duplicate, true);
  assert.throws(() => write(file, "HANDOFF_INTENT", intent()), /intent_out_of_order/);
}));

test("repeat RESERVE with same ID is idempotent, changed allocation is refused", () => fixture((file) => {
  write(file, "RESERVE", plan());
  const duplicate = write(file, "RESERVE", plan());
  assert.equal(duplicate.duplicate, true);
  assert.equal(replayJournal(file).sequence, 2);
  assert.throws(() => write(file, "RESERVE", plan("tx-one", 43,
    { allocations: [{ bankId: "bulk-west", count: 43 }] })), /JOURNAL_HOLD/);
}));

test("same receipt ID may never settle two distinct transactions", () => fixture((file) => {
  write(file, "RESERVE", plan());
  write(file, "HANDOFF_INTENT", intent());
  write(file, "SETTLE", ack());
  write(file, "RESERVE", plan("tx-two", 2, {
    allocations: [{ bankId: "bulk-west", count: 2 }]
  }));
  write(file, "HANDOFF_INTENT", intent("tx-two"));
  assert.throws(() => write(file, "SETTLE", ack("tx-two", 2,
    { receiptId: "ack-tx-one" })), /settlement_not_supported/);
}));

test("reserving 200,000 items is allowed only once per same Bulk member", () => fixture((file) => {
  write(file, "RESERVE", plan("big", BANK_CAPACITY, {
    allocations: [{ bankId: "bulk-west", count: BANK_CAPACITY }]
  }));
  assert.throws(() => write(file, "RESERVE", plan("extra", 1)), /bank_overbooked/);
  assert.equal(replayJournal(file).sequence, 2);
}));

test("two banks allow 300,000 count with exact splits; missing bank refuses", () => fixture((file) => {
  const over = plan("large", 300000, {
    allocations: [
      { bankId: "bulk-west", count: 200000 },
      { bankId: "bulk-east", count: 100000 }
    ]
  });
  write(file, "RESERVE", over);
  assert.equal(replayJournal(file).transactions.large.reservation.count, 300000);
  assert.throws(() => write(file, "RESERVE", plan("fake", 1, {
    allocations: [{ bankId: "not-registered", count: 1 }]
  })), /invalid_reservation_allocation/);
}));

test("stale revision cannot overwrite a newer append, even from a second writer", () => fixture((file) => {
  const stale = replayJournal(file).head;
  write(file, "RESERVE", plan());
  assert.throws(() => appendEvent(file, "RESERVE", plan("tx-two", 1), {
    expectedHead: stale
  }), /head_revision_conflict/);
  assert.equal(replayJournal(file).sequence, 2);
}));

test("simulated crash after FSYNC before response leaves a durable intent and HOLD", () => fixture((file) => {
  write(file, "RESERVE", plan());
  assert.throws(() => write(file, "HANDOFF_INTENT", intent(),
    { fault: "after_fsync_before_return" }), /SIMULATED_CRASH_AFTER_FSYNC/);
  assert.equal(existsSync(file + ".lock"), true);
  assert.equal(replayJournal(file).recovery["tx-one"], "HOLD_AMBIGUOUS_HANDOFF");
  assert.throws(() => write(file, "HANDOFF_INTENT", intent()), /writer_lock_held/);
  // Operator/test fixture ONLY: writer has exited, so mock clearing stale marker.
  unlinkSync(file + ".lock");
  const duplicate = write(file, "HANDOFF_INTENT", intent());
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.canPerformPhysicalMove, false);
}));

test("simulated crash after write before fsync is uncertain; no automatic retry", () => fixture((file) => {
  write(file, "RESERVE", plan());
  assert.throws(() => write(file, "HANDOFF_INTENT", intent(),
    { fault: "after_write_before_fsync" }), /SIMULATED_CRASH_BEFORE_FSYNC/);
  assert.equal(existsSync(file + ".lock"), true);
  // This fixture's full write may remain visible, but its durability was NOT ACKed.
  assert.equal(replayJournal(file).recovery["tx-one"], "HOLD_AMBIGUOUS_HANDOFF");
  assert.throws(() => write(file, "SETTLE", ack()), /writer_lock_held/);
}));

test("after-durable-ACK crash: replay sees settled, never moves a second time", () => fixture((file) => {
  write(file, "RESERVE", plan());
  write(file, "HANDOFF_INTENT", intent());
  assert.throws(() => write(file, "SETTLE", ack(),
    { fault: "after_fsync_before_return" }), /SIMULATED_CRASH_AFTER_FSYNC/);
  assert.equal(replayJournal(file).recovery["tx-one"], "JOURNAL_SETTLED_NO_REPLAY");
  unlinkSync(file + ".lock");
  const repeat = write(file, "SETTLE", ack());
  assert.equal(repeat.duplicate, true);
  assert.equal(repeat.canPerformPhysicalMove, false);
}));

test("crash in RESERVE appending never auto-allows physical movement", () => fixture((file) => {
  assert.throws(() => write(file, "RESERVE", plan(),
    { fault: "after_write_before_fsync" }), /SIMULATED_CRASH/);
  assert.equal(replayJournal(file).recovery["tx-one"], "HOLD_PRE_HANDOFF");
  assert.equal(existsSync(file + ".lock"), true);
}));

test("log truncation and torn JSON tail refuse rather than salvage partial entries", () => fixture((file) => {
  write(file, "RESERVE", plan());
  const content = readFileSync(file, "utf8");
  writeFileSync(file, content.slice(0, -1), "utf8");
  assert.throws(() => replayJournal(file), /missing_complete_final_record/);
  writeFileSync(file, content + '{"seq":', "utf8");
  assert.throws(() => replayJournal(file), /missing_complete_final_record/);
}));

test("tampered byte/hash and malformed extra line refuse all custody inference", () => fixture((file) => {
  write(file, "RESERVE", plan());
  const content = readFileSync(file, "utf8");
  writeFileSync(file, content.replace("minecraft:cobblestone",
    "minecraft:diamond"), "utf8");
  assert.throws(() => replayJournal(file), /sequence_or_hash_corruption/);
  writeFileSync(file, content + "not json\n", "utf8");
  assert.throws(() => replayJournal(file), /invalid_json/);
}));

test("reordered or missing event and wrong previous hash are untrusted", () => fixture((file) => {
  write(file, "RESERVE", plan());
  write(file, "HANDOFF_INTENT", intent());
  const lines = readFileSync(file, "utf8").trimEnd().split("\n");
  writeFileSync(file, [lines[0], lines[2], lines[1], ""].join("\n"));
  assert.throws(() => replayJournal(file), /sequence_or_hash_corruption/);
  writeFileSync(file, [lines[0], lines[2], ""].join("\n"));
  assert.throws(() => replayJournal(file), /sequence_or_hash_corruption/);
}));

test("stale writer lock is never auto-stolen or removed", () => fixture((file) => {
  const fd = openSync(file + ".lock", "wx");
  closeSync(fd);
  assert.throws(() => write(file, "RESERVE", plan()), /writer_lock_held/);
  assert.equal(existsSync(file + ".lock"), true);
  assert.equal(replayJournal(file).sequence, 1);
}));

test("previously settled items remain counted when another reservation is aborted", () => fixture((file) => {
  write(file, "RESERVE", plan("first", 42));
  write(file, "HANDOFF_INTENT", intent("first"));
  write(file, "SETTLE", ack("first", 42));
  write(file, "RESERVE", plan("second", BANK_CAPACITY - 42, {
    allocations: [{ bankId: "bulk-west", count: BANK_CAPACITY - 42 }]
  }));
  write(file, "ABORT", abort("second"));
  assert.equal(replayJournal(file).recovery.first, "JOURNAL_SETTLED_NO_REPLAY");
  assert.equal(replayJournal(file).recovery.second, "ABORTED_NO_MOVE");
  assert.throws(() => write(file, "RESERVE", plan("too-much", BANK_CAPACITY)), /bank_overbooked/);
}));

test("unknown action, malformed tx and foreign epoch are fail-closed", () => fixture((file) => {
  assert.throws(() => write(file, "COMPENSATE", { txId: "tx-one" }), /unknown_action/);
  assert.throws(() => write(file, "RESERVE", plan("not valid")), /invalid_record/);
  assert.throws(() => write(file, "RESERVE", plan("bad-epoch", 1,
    { epoch: 18 })), /invalid_or_duplicate_reservation/);
  assert.equal(replayJournal(file).sequence, 1);
}));

test("long deterministic crash-free journal replay preserves one receipt per tx", () => fixture((file) => {
  for (let i = 0; i < 60; i++) {
    const txId = "load-" + i;
    const qty = (i % 11 + 1) * 17;
    write(file, "RESERVE", plan(txId, qty));
    write(file, "HANDOFF_INTENT", intent(txId));
    write(file, "SETTLE", ack(txId, qty));
  }
  const state = replayJournal(file);
  assert.equal(state.sequence, 181);
  assert.equal(Object.keys(state.receipts).length, 60);
  assert.equal(Object.keys(state.transactions).length, 60);
  assert.equal(Object.values(state.recovery).every((r) =>
    r === "JOURNAL_SETTLED_NO_REPLAY"), true);
}));

test("prototype-like transaction/receipt keys retain real identity and capacity", () => fixture((file) => {
  write(file, "RESERVE", plan("__proto__", BANK_CAPACITY));
  assert.equal(Object.hasOwn(replayJournal(file).transactions, "__proto__"), true);
  assert.throws(() => write(file, "RESERVE", plan("other", 1)), /bank_overbooked/);
  write(file, "HANDOFF_INTENT", intent("__proto__"));
  write(file, "SETTLE", ack("__proto__", BANK_CAPACITY,
    { receiptId: "__proto__" }));
  const recovered = replayJournal(file);
  assert.equal(Object.hasOwn(recovered.receipts, "__proto__"), true);
  assert.equal(recovered.recovery["__proto__"], "JOURNAL_SETTLED_NO_REPLAY");
  assert.equal(write(file, "SETTLE", ack("__proto__", BANK_CAPACITY,
    { receiptId: "__proto__" })).duplicate, true);
}));

test("malformed action type fails closed before touching the journal or lock", () => fixture((file) => {
  const before = readFileSync(file, "utf8");
  for (const action of [undefined, null, {}, 12, []]) {
    assert.throws(() => appendEvent(file, action, { txId: "tx-one" },
      { expectedHead: replayJournal(file).head }), /bad_append_request/);
  }
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal(existsSync(file + ".lock"), false);
}));
