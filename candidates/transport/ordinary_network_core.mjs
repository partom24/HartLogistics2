/**
 * Ordinary-only Transporter/Bulk safety core (offline candidate).
 *
 * This module is deliberately dependency-free, deterministic and side-effect-free.
 * It does NOT access Minecraft, implement durable storage, move ItemStacks,
 * elect controllers, bind a custom block or authorize production deployment.
 *
 * A future adapter must prove loaded topology, inventory classification, receipt
 * durability and atomic revision fences BEFORE using these proposed decisions.
 */
export const BULK_MEMBER_CAPACITY = 200000;
export const DELTAS = Object.freeze([
  [-1, 0, 0], [0, -1, 0], [0, 0, -1],
  [0, 0, 1], [0, 1, 0], [1, 0, 0]
]);

const fail = (reason) => ({ ok: false, reason });
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const positiveInt = (n) => Number.isSafeInteger(n) && n > 0;
const nonnegativeInt = (n) => Number.isSafeInteger(n) && n >= 0;
const nonempty = (s) => typeof s === "string" && s.length > 0;
const itemTypeId = (s) => typeof s === "string" &&
  /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(s);

export function pointKey(x, y, z) {
  if (![x, y, z].every(Number.isSafeInteger)) return null;
  return [x, y, z].join(",");
}

function parsePoint(value) {
  if (typeof value !== "string" || !/^-?\d+,-?\d+,-?\d+$/.test(value)) return null;
  const p = value.split(",").map(Number);
  if (!p.every(Number.isSafeInteger) || p.join(",") !== value) return null;
  return p;
}

function sameUniqueMembers(list, expected) {
  return Array.isArray(list) && list.length === expected.size &&
    new Set(list).size === list.length && list.every((s) => expected.has(s));
}

function neighborKeys(key) {
  const p = parsePoint(key);
  if (!p) return [];
  return DELTAS.map((d) => pointKey(p[0] + d[0], p[1] + d[1], p[2] + d[2]))
    .filter(Boolean).sort();
}

/**
 * Permit a path ONLY when the FULL authoritative graph and a single live
 * same-epoch claim for its local region are already supplied and consistent.
 * Does not infer a network boundary from currently visible chunks.
 */
export function verifyLocalRoute(snapshot, source, target) {
  if (!snapshot || !nonempty(snapshot.networkId) || !positiveInt(snapshot.epoch)) {
    return fail("missing_network_epoch");
  }
  const expected = snapshot.expectedNodes;
  const loaded = snapshot.loadedNodes;
  if (!Array.isArray(expected) || !expected.length ||
      !expected.every((p) => parsePoint(p)) ||
      !sameUniqueMembers(loaded, new Set(expected)) ||
      new Set(expected).size !== expected.length ||
      snapshot.unknownBoundary !== false) {
    return fail("incomplete_or_unknown_graph");
  }
  if (!Array.isArray(snapshot.memberships) ||
      snapshot.memberships.length !== expected.length) {
    return fail("ambiguous_membership");
  }
  const member = new Map();
  for (const entry of snapshot.memberships) {
    if (!Array.isArray(entry) || entry.length !== 2 ||
        !expected.includes(entry[0]) || !nonempty(entry[1]) ||
        member.has(entry[0])) {
      return fail("ambiguous_membership");
    }
    member.set(entry[0], entry[1]);
  }
  if (!member.has(source) || !member.has(target)) return fail("endpoint_unknown");
  const region = member.get(source);
  if (region !== member.get(target)) return fail("cross_region_handoff_unproven");
  if (!Array.isArray(snapshot.claims) || !Array.isArray(snapshot.liveControllers)) {
    return fail("unverified_controller_claim");
  }
  const claims = snapshot.claims.filter((c) => c && c.region === region);
  if (claims.length !== 1) return fail("owner_missing_or_contested");
  const claim = claims[0];
  if (claim.networkId !== snapshot.networkId ||
      claim.epoch !== snapshot.epoch ||
      !nonempty(claim.controllerId) ||
      !snapshot.liveControllers.includes(claim.controllerId)) {
    return fail("owner_stale_or_unavailable");
  }
  const known = new Set(loaded);
  const parent = new Map([[source, null]]);
  const queue = [source];
  for (let i = 0; i < queue.length; i += 1) {
    const p = queue[i];
    if (p === target) {
      const path = [];
      for (let cursor = target; cursor !== null; cursor = parent.get(cursor)) {
        path.push(cursor);
      }
      return {
        ok: true, reason: "verified_local_path_only",
        networkId: snapshot.networkId, epoch: snapshot.epoch,
        region, controllerId: claim.controllerId,
        path: path.reverse()
      };
    }
    for (const n of neighborKeys(p)) {
      if (known.has(n) && member.get(n) === region && !parent.has(n)) {
        parent.set(n, p);
        queue.push(n);
      }
    }
  }
  return fail("no_verified_local_path");
}

/**
 * Enforces the owner's physical direction rule: adjacent ordinary containers
 * are ONLY sources; the pipe may offer output ONLY to a Sorter intake.
 * "validatedSource" must come from the eventual Bedrock adapter, not from
 * the name of a chest or a client-supplied flag.
 */
export function verifyPort({ role, neighborKind, validatedSource = false,
                             redstoneAllowed = true } = {}) {
  if (redstoneAllowed !== true) return fail("redstone_or_input_blocked");
  if (role === "extract" && neighborKind === "ordinary_container" &&
      validatedSource === true) {
    return { ok: true, reason: "validated_container_source" };
  }
  if (role === "deliver" && neighborKind === "sorter_intake") {
    return { ok: true, reason: "sorter_only_output" };
  }
  return fail("unsupported_or_forbidden_port");
}

/**
 * A side-effect-free modeled ledger. Bank counts and transaction records in
 * this object must be hydrated from durable authoritative state in real code.
 *
 * State schema:
 * {networkId, epoch, revision, expectedBankIds, banks: {
 *   id:{networkId,epoch,status:"verified", counts:{itemId:count}}
 * }, transactions:{txId:{networkId,epoch,itemId,count,status,allocations}}}
 */
export function freshLedger(networkId, epoch, bankIds) {
  if (!nonempty(networkId) || !positiveInt(epoch) ||
      !Array.isArray(bankIds) || !bankIds.length ||
      bankIds.some((id) => !nonempty(id)) ||
      new Set(bankIds).size !== bankIds.length) {
    throw new TypeError("exact network, epoch and unique bank IDs required");
  }
  const banks = Object.create(null);
  for (const id of bankIds) {
    Object.defineProperty(banks, id, {
      configurable: true, enumerable: true, writable: true,
      value: { networkId, epoch, status: "verified", counts: {} }
    });
  }
  return { networkId, epoch, revision: 0,
           expectedBankIds: [...bankIds], banks, transactions: Object.create(null) };
}

function inspectLedger(ledger) {
  if (!ledger || !nonempty(ledger.networkId) ||
      !positiveInt(ledger.epoch) || !nonnegativeInt(ledger.revision) ||
      !ledger.banks || typeof ledger.banks !== "object" ||
      !ledger.transactions || typeof ledger.transactions !== "object") {
    return fail("invalid_ledger");
  }
  const ids = ledger.expectedBankIds;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
      ids.some((id) => !nonempty(id)) ||
      Object.keys(ledger.banks).length !== ids.length ||
      ids.some((id) => !own(ledger.banks, id))) {
    return fail("unknown_bank_membership");
  }
  const reserved = Object.create(null);
  for (const id of ids) reserved[id] = 0;
  for (const [txId, tx] of Object.entries(ledger.transactions)) {
    if (!nonempty(txId) || !tx || tx.networkId !== ledger.networkId ||
        !positiveInt(tx.epoch) || !itemTypeId(tx.itemId) ||
        !positiveInt(tx.count) ||
        !["reserved", "committed", "canceled"].includes(tx.status) ||
        !Array.isArray(tx.allocations) || !tx.allocations.length) {
      return fail("invalid_transaction_state");
    }
    let sum = 0;
    const seen = new Set();
    for (const allocation of tx.allocations) {
      if (!allocation || !ids.includes(allocation.bankId) ||
          seen.has(allocation.bankId) || !positiveInt(allocation.count)) {
        return fail("invalid_transaction_allocation");
      }
      sum += allocation.count;
      seen.add(allocation.bankId);
      if (!Number.isSafeInteger(sum)) return fail("invalid_transaction_allocation");
      if (tx.status === "reserved") reserved[allocation.bankId] += allocation.count;
    }
    if (sum !== tx.count) return fail("invalid_transaction_allocation");
    if (tx.status === "reserved" && tx.epoch !== ledger.epoch) {
      return fail("stale_pending_reservation");
    }
  }
  const free = Object.create(null);
  for (const id of ids) {
    const bank = ledger.banks[id];
    if (!bank || bank.networkId !== ledger.networkId ||
        bank.epoch !== ledger.epoch || bank.status !== "verified" ||
        !bank.counts || typeof bank.counts !== "object") {
      return fail("unknown_or_stale_bulk_capacity");
    }
    let occupied = 0;
    for (const [itemId, n] of Object.entries(bank.counts)) {
      if (!itemTypeId(itemId) || !nonnegativeInt(n)) {
        return fail("invalid_bulk_count");
      }
      occupied += n;
    }
    if (!Number.isSafeInteger(occupied) ||
        !Number.isSafeInteger(reserved[id]) ||
        occupied + reserved[id] > BULK_MEMBER_CAPACITY) {
      return fail("inconsistent_or_overfull_bulk");
    }
    free[id] = BULK_MEMBER_CAPACITY - occupied - reserved[id];
  }
  return { ok: true, free, totalFree: Object.values(free).reduce((a, b) => a + b, 0) };
}

export function bulkCapacityStatus(ledger) {
  const inspected = inspectLedger(ledger);
  if (!inspected.ok) return inspected;
  return { ok: true, status: inspected.totalFree === 0 ? "verified_full" : "verified_space",
           free: inspected.totalFree };
}

/** No wildcard until ALL authoritative member banks are verified fully used. */
export function chooseOrdinaryDestination(
  ledger, { filtered = "none", automatic = "none", wildcardVerified = false } = {}
) {
  if (!["none", "usable", "unavailable", "full"].includes(filtered) ||
      !["none", "usable", "unavailable", "full"].includes(automatic)) {
    return { decision: "hold", reason: "unknown_sorter_capacity" };
  }
  if (filtered === "usable") return { decision: "filtered" };
  if (filtered === "unavailable") return { decision: "hold", reason: "filtered_unavailable" };
  if (automatic === "usable") return { decision: "automatic" };
  if (automatic === "unavailable") return { decision: "hold", reason: "automatic_unavailable" };
  const capacity = bulkCapacityStatus(ledger);
  if (!capacity.ok) return { decision: "hold", reason: capacity.reason };
  if (capacity.status === "verified_space") return { decision: "bulk" };
  return wildcardVerified === true ?
    { decision: "wildcard", reason: "bulk_verified_full" } :
    { decision: "hold", reason: "bulk_verified_full_no_wildcard" };
}

function ordinaryItemVerified(item) {
  return item && itemTypeId(item.id) &&
    item.classification === "ordinary" && item.losslessIdentity === true &&
    item.metadataFree === true;
}

function copyState(ledger) {
  const banks = Object.create(null);
  for (const [id, bank] of Object.entries(ledger.banks)) {
    Object.defineProperty(banks, id, {
      configurable: true, enumerable: true, writable: true,
      value: { ...bank, counts: Object.assign(Object.create(null), bank.counts) }
    });
  }
  return { ...ledger, banks,
           transactions: Object.assign(Object.create(null), ledger.transactions) };
}

/**
 * Pure modeled reservation. NO inventory read/write or durability: a runtime
 * caller must use a durable compare-and-swap/journal before any item mutation.
 * Duplicate txId never yields a second executable reservation.
 */
export function reserveOrdinary(ledger, { txId, item, count,
                                        expectedRevision, expectedEpoch,
                                        routePermit } = {}) {
  if (!ordinaryItemVerified(item)) return fail("unverified_or_metadata_rich_item");
  if (!nonempty(txId) || !positiveInt(count)) return fail("invalid_quantity_or_txid");
  const report = inspectLedger(ledger);
  if (!report.ok) return report;
  if (expectedEpoch !== ledger.epoch) return fail("stale_epoch");
  const previous = own(ledger.transactions, txId) ? ledger.transactions[txId] : null;
  if (previous) {
    if (previous.itemId !== item.id || previous.count !== count ||
        previous.epoch !== ledger.epoch) {
      return fail("transaction_id_conflict");
    }
    return { ok: true, duplicate: true, executable: false,
             reason: "existing_transaction_no_replay", state: ledger };
  }
  if (expectedRevision !== ledger.revision) return fail("revision_conflict");
  if (!routePermit || routePermit.ok !== true ||
      routePermit.networkId !== ledger.networkId ||
      routePermit.epoch !== ledger.epoch ||
      !Array.isArray(routePermit.path) || !routePermit.path.length ||
      !nonempty(routePermit.controllerId)) return fail("route_authority_missing");
  if (count > report.totalFree) return fail("insufficient_verified_capacity");
  let left = count;
  const allocations = [];
  for (const bankId of [...ledger.expectedBankIds].sort()) {
    const slice = Math.min(left, report.free[bankId]);
    if (slice > 0) allocations.push({ bankId, count: slice });
    left -= slice;
    if (!left) break;
  }
  if (left !== 0) return fail("insufficient_verified_capacity");
  const next = copyState(ledger);
  next.revision += 1;
  next.transactions[txId] = {
    networkId: ledger.networkId, epoch: ledger.epoch,
    itemId: item.id, count, allocations, status: "reserved"
  };
  return { ok: true, duplicate: false, executable: false,
           reason: "reservation_plan_only", allocations, state: next };
}

/**
 * Model a verified receipt ACK, NOT an actual physical ItemStack move.
 * Exact durable receipt evidence + journal ordering are runtime requirements.
 */
export function commitVerifiedReceipt(ledger, txId, receipt, expectedRevision) {
  const report = inspectLedger(ledger);
  if (!report.ok) return report;
  const tx = own(ledger.transactions, txId) ? ledger.transactions[txId] : null;
  if (!tx) return fail("unknown_transaction");
  if (!receipt || receipt.txId !== txId ||
      receipt.networkId !== ledger.networkId || receipt.epoch !== ledger.epoch ||
      receipt.itemId !== tx.itemId || receipt.count !== tx.count ||
      receipt.physicallyVerified !== true) return fail("receipt_not_proven");
  if (tx.status === "committed") {
    return { ok: true, duplicate: true, changed: false, state: ledger };
  }
  if (tx.status !== "reserved") return fail("canceled_transaction");
  if (expectedRevision !== ledger.revision) return fail("revision_conflict");
  const next = copyState(ledger);
  for (const { bankId, count } of tx.allocations) {
    const bank = next.banks[bankId];
    bank.counts[tx.itemId] = (bank.counts[tx.itemId] || 0) + count;
  }
  next.transactions[txId] = { ...tx, status: "committed" };
  next.revision += 1;
  return { ok: true, duplicate: false, changed: true, state: next };
}

/** Never cancel merely because an ACK timed out; require proof source still owns items. */
export function cancelStillAtSource(ledger, txId, proof, expectedRevision) {
  const report = inspectLedger(ledger);
  if (!report.ok) return report;
  const tx = own(ledger.transactions, txId) ? ledger.transactions[txId] : null;
  if (!tx) return fail("unknown_transaction");
  if (tx.status === "canceled") {
    return { ok: true, duplicate: true, changed: false, state: ledger };
  }
  if (tx.status !== "reserved") return fail("already_committed");
  if (!proof || proof.txId !== txId ||
      proof.sourceRetainsExactItems !== true) return fail("source_custody_unverified");
  if (expectedRevision !== ledger.revision) return fail("revision_conflict");
  const next = copyState(ledger);
  next.transactions[txId] = { ...tx, status: "canceled" };
  next.revision += 1;
  return { ok: true, duplicate: false, changed: true, state: next };
}

/** Block breaking/evacuation while any count or reserved capacity is nonzero. */
export function mayRemoveBulkBank(ledger, bankId) {
  const report = inspectLedger(ledger);
  if (!report.ok) return report;
  if (!own(ledger.banks, bankId)) return fail("bank_not_registered");
  const bank = ledger.banks[bankId];
  if (Object.values(bank.counts).some((count) => count !== 0)) {
    return fail("bank_contains_items");
  }
  const pending = Object.values(ledger.transactions).some((tx) =>
    tx.status === "reserved" && tx.allocations.some((a) => a.bankId === bankId));
  if (pending) return fail("bank_has_in_flight_reservations");
  return { ok: true, reason: "empty_and_no_in_flight_reservation_only" };
}
