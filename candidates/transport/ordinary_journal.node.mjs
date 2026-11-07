/**
 * OFFLINE NODE-ONLY crash/fault simulator for the proposed ordinary Bulk journal.
 *
 * IMPORTANT: node:fs + node:crypto are unavailable to Minecraft Script API.
 * No Minecraft item is moved. A receipt with both proof flags is a MODEL INPUT,
 * not a verified physical transfer. No deployment or crash-atomic gameplay claim.
 *
 * Contract: persist RESERVE -> persist HANDOFF_INTENT -> external physical
 * operation -> persist SETTLE. Crash after intent => HOLD / reconcile manually,
 * NEVER auto-repeat the physical operation or free the reservation.
 */
import {
  openSync, closeSync, writeSync, fsyncSync, readFileSync, unlinkSync
} from "node:fs";
import { createHash } from "node:crypto";

export const BANK_CAPACITY = 200000;
const EMPTY_HASH = "0".repeat(64);
const keyPattern = /^[a-z0-9_.:/-]{1,128}$/;
const itemPattern = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const validKey = (s) => typeof s === "string" && keyPattern.test(s);
const validItem = (s) => typeof s === "string" && itemPattern.test(s);
const amount = (n) => Number.isSafeInteger(n) && n > 0;
const has = (x, k) => Object.prototype.hasOwnProperty.call(x, k);
function hold(why) { throw new Error("JOURNAL_HOLD: " + why); }
function digest(record) {
  const { seq, prev, action, data } = record;
  return createHash("sha256")
    .update(JSON.stringify({ seq, prev, action, data }), "utf8")
    .digest("hex");
}
function recordFor(seq, prev, action, data) {
  const result = { seq, prev, action, data };
  return { ...result, hash: digest(result) };
}
const canonical = (x) => JSON.stringify(x);
function requireEqual(a, b, why) {
  if (canonical(a) !== canonical(b)) hold(why);
}
function emptyMap() { return Object.create(null); }

function validateGenesis(data) {
  if (!data || !validKey(data.networkId) || !amount(data.epoch) ||
      !Array.isArray(data.bankIds) || !data.bankIds.length ||
      data.bankIds.some((id) => !validKey(id)) ||
      new Set(data.bankIds).size !== data.bankIds.length ||
      data.bankIds.length > 10000) hold("bad_genesis");
  // Only freshly empty banks are modeled, not preexisting real-world inventory.
}
function apply(state, action, data) {
  if (action === "GENESIS") {
    if (state) hold("duplicate_genesis");
    validateGenesis(data);
    return {
      networkId: data.networkId, epoch: data.epoch,
      bankIds: [...data.bankIds], transactions: emptyMap(),
      receipts: emptyMap()
    };
  }
  if (!state || !data || !validKey(data.txId)) hold("invalid_record");
  const old = has(state.transactions, data.txId) ?
    state.transactions[data.txId] : null;
  switch (action) {
    case "RESERVE": {
      if (old || data.networkId !== state.networkId ||
          data.epoch !== state.epoch || !validItem(data.itemId) ||
          !amount(data.count) || !validKey(data.sourceId) ||
          !validKey(data.destinationId) ||
          !Array.isArray(data.allocations) || !data.allocations.length) {
        hold("invalid_or_duplicate_reservation");
      }
      let total = 0;
      const seen = new Set();
      for (const allocation of data.allocations) {
        if (!allocation || !validKey(allocation.bankId) ||
            !state.bankIds.includes(allocation.bankId) ||
            seen.has(allocation.bankId) || !amount(allocation.count)) {
          hold("invalid_reservation_allocation");
        }
        seen.add(allocation.bankId);
        total += allocation.count;
        if (!Number.isSafeInteger(total)) hold("unsafe_allocation_sum");
      }
      if (total !== data.count) hold("reservation_quantity_mismatch");
      state.transactions[data.txId] = {
        status: "reserved", reservation: structuredClone(data), receiptId: null, receipt: null
      };
      break;
    }
    case "HANDOFF_INTENT":
      if (!old || old.status !== "reserved" ||
          Object.keys(data).length !== 1) hold("intent_out_of_order");
      old.status = "intent";
      break;
    case "SETTLE": {
      if (!old || old.status !== "intent" || !validKey(data.receiptId) ||
          has(state.receipts, data.receiptId) ||
          data.sourceDebited !== true || data.destinationCredited !== true) {
        hold("settlement_not_supported_by_receipt");
      }
      const reservation = old.reservation;
      if (data.networkId !== state.networkId || data.epoch !== state.epoch ||
          data.itemId !== reservation.itemId ||
          data.count !== reservation.count ||
          data.sourceId !== reservation.sourceId ||
          data.destinationId !== reservation.destinationId) {
        hold("receipt_mismatch");
      }
      old.status = "settled";
      old.receiptId = data.receiptId;
      old.receipt = structuredClone(data);
      state.receipts[data.receiptId] = data.txId;
      break;
    }
    case "ABORT":
      // No handoff has been attempted. If INTENT is durable, HOLD instead.
      if (!old || old.status !== "reserved" ||
          data.sourceRetainsExactItems !== true ||
          data.destinationUnchanged !== true) hold("abort_requires_no_move");
      old.status = "aborted";
      break;
    default:
      hold("unknown_action");
  }

  // Every record must preserve the 200k-per-Bulk count and never double-book.
  const capacity = emptyMap();
  for (const id of state.bankIds) capacity[id] = 0;
  for (const tx of Object.values(state.transactions)) {
    if (tx.status === "aborted") continue;
    for (const alloc of tx.reservation.allocations) {
      capacity[alloc.bankId] += alloc.count;
      if (!Number.isSafeInteger(capacity[alloc.bankId]) ||
          capacity[alloc.bankId] > BANK_CAPACITY) hold("bank_overbooked");
    }
  }
  return state;
}

/** Does not truncate, salvage, skip, repair or trust a torn/corrupted record. */
export function replayJournal(file) {
  const text = readFileSync(file, "utf8");
  if (!text || !text.endsWith("\n")) hold("missing_complete_final_record");
  const lines = text.slice(0, -1).split("\n");
  let previous = EMPTY_HASH;
  let state = null;
  for (let index = 0; index < lines.length; index++) {
    let event;
    try { event = JSON.parse(lines[index]); }
    catch { hold("invalid_json_at_" + index); }
    if (!event || event.seq !== index || event.prev !== previous ||
        typeof event.action !== "string" ||
        !validKey(event.action.toLowerCase()) ||
        !event.data || typeof event.data !== "object" ||
        typeof event.hash !== "string" ||
        event.hash !== digest(event) ||
        canonical(event) !== canonical(recordFor(index, previous, event.action, event.data))) {
      hold("sequence_or_hash_corruption_at_" + index);
    }
    state = apply(state, event.action, event.data);
    previous = event.hash;
  }
  if (!state) hold("missing_genesis");
  return {
    head: previous, sequence: lines.length,
    networkId: state.networkId, epoch: state.epoch,
    bankIds: [...state.bankIds],
    transactions: state.transactions,
    receipts: state.receipts,
    // Deliberately don't claim that this proves a physical item transfer.
    recovery: Object.fromEntries(Object.entries(state.transactions).map(([id, tx]) =>
      [id, tx.status === "intent" ? "HOLD_AMBIGUOUS_HANDOFF" :
           tx.status === "reserved" ? "HOLD_PRE_HANDOFF" :
           tx.status === "settled" ? "JOURNAL_SETTLED_NO_REPLAY" :
           "ABORTED_NO_MOVE"]))
  };
}

function writeAll(fd, data) {
  const bytes = Buffer.from(data, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const wrote = writeSync(fd, bytes, offset, bytes.length - offset);
    if (!wrote) hold("short_write");
    offset += wrote;
  }
}

/**
 * New offline fixture: only empty simulated banks. File must not exist.
 * A real world migration must supply a separately verified baseline snapshot.
 */
export function createJournal(file, { networkId, epoch, bankIds }) {
  const genesis = { networkId, epoch, bankIds };
  validateGenesis(genesis);
  const event = recordFor(0, EMPTY_HASH, "GENESIS", genesis);
  const fd = openSync(file, "wx", 0o600);
  try {
    writeAll(fd, canonical(event) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return replayJournal(file);
}

/**
 * Single-writer simulator. Acquires a non-expiring exclusive create lock.
 * A real killed process leaves the lock in place: NEVER auto-steal it.
 * 'expectedHead' fences stale read-modify-writes.
 *
 * fault='after_write_before_fsync' or 'after_fsync_before_return' simulates
 * a process death and deliberately leaves the .lock marker. Test fixtures may
 * manually clear the orphan only after confirming that process is dead.
 */
export function appendEvent(file, action, data, { expectedHead, fault } = {}) {
  if (typeof action !== "string" || !validKey(action.toLowerCase()) ||
      !data || typeof data !== "object" || Array.isArray(data)) {
    hold("bad_append_request");
  }
  const lock = file + ".lock";
  let lockFd;
  try { lockFd = openSync(lock, "wx", 0o600); }
  catch { hold("writer_lock_held"); }
  let crashed = false;
  try {
    const initial = replayJournal(file);
    if (expectedHead !== initial.head) hold("head_revision_conflict");
    const currentTx = data.txId && has(initial.transactions, data.txId) ?
      initial.transactions[data.txId] : null;
    // Replays return no actionable permission. Different tx IDs/receipt IDs
    // are never silently reconciled, even when the transaction is terminal.
    if (currentTx && (
      (action === "RESERVE" && canonical(currentTx.reservation) === canonical(data)) ||
      (action === "HANDOFF_INTENT" && ["intent", "settled"].includes(currentTx.status)) ||
      (action === "ABORT" && currentTx.status === "aborted") ||
      (action === "SETTLE" && currentTx.status === "settled" &&
        currentTx.receiptId === data.receiptId &&
        canonical(currentTx.receipt) === canonical(data))
    )) {
      return { ...initial, duplicate: true, canPerformPhysicalMove: false };
    }
    const event = recordFor(initial.sequence, initial.head, action, data);
    // Validate in memory using exactly the same replay contract BEFORE writing.
    const state = {
      networkId: initial.networkId, epoch: initial.epoch,
      bankIds: initial.bankIds,
      transactions: Object.assign(emptyMap(), structuredClone(initial.transactions)),
      receipts: Object.assign(emptyMap(), structuredClone(initial.receipts))
    };
    apply(state, action, data);
    const fd = openSync(file, "a");
    let writeStarted = false;
    try {
      writeStarted = true;
      writeAll(fd, canonical(event) + "\n");
      if (fault === "after_write_before_fsync") {
        hold("SIMULATED_CRASH_BEFORE_FSYNC");
      }
      fsyncSync(fd);
      if (fault === "after_fsync_before_return") {
        hold("SIMULATED_CRASH_AFTER_FSYNC");
      }
    } catch (error) {
      // A write/fsync exception makes durability uncertain. Leave lock in place
      // for explicit reconciliation; do not silently unlock and retry.
      if (writeStarted) crashed = true;
      throw error;
    } finally { closeSync(fd); }
    try {
      const next = replayJournal(file);
      return { ...next, duplicate: false,
               canPerformPhysicalMove: action === "HANDOFF_INTENT" };
    } catch (error) {
      crashed = true;
      throw error;
    }
  } finally {
    closeSync(lockFd);
    if (!crashed) unlinkSync(lock);
  }
}
