/**
 * PG-15 preparation: isolated, pure JavaScript physical-custody reconciliation.
 *
 * NO Minecraft API, no ItemStack writes, no automatic transfer, journal settle,
 * refund, remove, or retry. One observed same-type ordinary item is NOT proof
 * of unique physical provenance. This module can only classify a synthetic,
 * fully observed source/destination and already-recorded journal.
 *
 * A real Bedrock adapter must independently establish snapshot authenticity,
 * block identity, loaded state and exclusive controller authority.
 */
const validString = (s) => typeof s === "string" && s.length > 0 &&
  s.length <= 256;
const plainObject = (x) => x !== null && typeof x === "object" &&
  !Array.isArray(x);
const count = (n) => Number.isSafeInteger(n) && n > 0;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function result(status, reason, extra = {}) {
  return Object.freeze({
    status, reason,
    canMoveItem: false,
    canRetry: false,
    canReleaseReservation: false,
    canAutoSettle: false,
    canAutoClear: false,
    ...extra
  });
}
const hold = (reason, extra) => result("HOLD", reason, extra);
const confirmed = (reason) => result("OBSERVED_SETTLED", reason);

export const KNOWN_SETTLEMENT = "OBSERVED_SETTLED";
export const REQUIRED_SLOTS = 27;

/**
 * Every position must be reported, including empty positions. Unknown,
 * unreadable and metadata-bearing items are never treated as vanilla empty.
 */
export function classifySlots(slots, itemId) {
  if (!Array.isArray(slots) || slots.length !== REQUIRED_SLOTS ||
      !validString(itemId)) return { ok: false, reason: "incomplete_slot_snapshot" };
  let units = 0;
  let occupiedSlots = 0;
  for (let i = 0; i < REQUIRED_SLOTS; i++) {
    if (!own(slots, i)) return { ok: false, reason: "slot_unobserved" };
    const slot = slots[i];
    if (slot === null) continue; // null is the only trusted empty sentinel
    if (!plainObject(slot) || slot.typeId !== itemId ||
        slot.metadataFree !== true || slot.losslessIdentity !== true ||
        !count(slot.amount) || slot.amount > 64) {
      return { ok: false, reason: "foreign_or_unverified_item" };
    }
    // This narrow model allows only exactly one item and one occupied slot.
    units += slot.amount;
    occupiedSlots++;
    if (units > 1 || occupiedSlots > 1) {
      return { ok: false, reason: "unexpected_extra_item" };
    }
  }
  return { ok: true, units, occupiedSlots,
           firstSlot: occupiedSlots === 1 ? slots.findIndex(s => s !== null) : null };
}

/**
 * Single-item before/after diagnostics. Does not perform a move.
 *
 * The journal is already persisted externally. The two snapshots represent
 * synchronous, fully known inventory observations, NOT a cross-inventory
 * crash-atomic snapshot. No action may be inferred from a successful match.
 */
export function reconcileOrdinaryCustody({ expected, journal, source, destination,
                                            authority } = {}) {
  if (!plainObject(expected) ||
      !validString(expected.networkId) ||
      !validString(expected.txId) ||
      !validString(expected.itemId) ||
      !validString(expected.sourceId) ||
      !validString(expected.destinationId) ||
      expected.sourceId === expected.destinationId ||
      !count(expected.epoch) || expected.count !== 1) {
    return hold("invalid_expected_identity");
  }
  if (!plainObject(authority) ||
      authority.loaded !== true ||
      authority.exclusive === false ||
      authority.exclusive !== true ||
      authority.networkId !== expected.networkId ||
      authority.epoch !== expected.epoch ||
      authority.sourceId !== expected.sourceId ||
      authority.destinationId !== expected.destinationId) {
    return hold("missing_live_authority");
  }
  if (!plainObject(journal) || journal.networkId !== expected.networkId ||
      journal.epoch !== expected.epoch || journal.txId !== expected.txId ||
      journal.sourceId !== expected.sourceId ||
      journal.destinationId !== expected.destinationId ||
      journal.itemId !== expected.itemId || journal.count !== 1) {
    return hold("missing_or_conflicting_journal");
  }
  if (!plainObject(source) || !plainObject(destination) ||
      source.loaded !== true || destination.loaded !== true ||
      source.blockId !== expected.sourceId ||
      destination.blockId !== expected.destinationId ||
      source.blockType !== "minecraft:chest" ||
      destination.blockType !== "minecraft:chest" ||
      source.containerSize !== REQUIRED_SLOTS ||
      destination.containerSize !== REQUIRED_SLOTS ||
      source.isolated !== true || destination.isolated !== true) {
    return hold("missing_or_unverified_chest");
  }

  const from = classifySlots(source.slots, expected.itemId);
  const to = classifySlots(destination.slots, expected.itemId);
  if (!from.ok || !to.ok) return hold("untrusted_inventory_readback",
                                      { sourceReason: from.reason, destinationReason: to.reason });
  const before = from.units === 1 && from.firstSlot === 0 && to.units === 0;
  const after = from.units === 0 && to.units === 1 && to.firstSlot === 0;
  const total = from.units + to.units;
  if (!before && !after) return hold("inventory_conflict", { total });

  switch (journal.phase) {
    case "RESERVED":
      return hold(before ? "pre_handoff_reservation" :
                  "reservation_vs_physical_mismatch", { total });
    case "HANDOFF_INTENT":
      return hold(before ? "ambiguous_intent_source_retains_item" :
                  "ambiguous_intent_destination_contains_item", { total });
    case "SETTLED": {
      const receipt = journal.receipt;
      const receiptMatch = plainObject(receipt) &&
        Object.keys(receipt).length === 8 &&
        receipt.txId === expected.txId &&
        receipt.networkId === expected.networkId &&
        receipt.epoch === expected.epoch &&
        receipt.sourceId === expected.sourceId &&
        receipt.destinationId === expected.destinationId &&
        receipt.itemId === expected.itemId &&
        receipt.count === 1 &&
        receipt.physicalReadback === "A_EMPTY_B_ONE";
      if (!receiptMatch) return hold("missing_or_conflicting_settlement_receipt", { total });
      if (!after) return hold("settlement_vs_physical_mismatch", { total });
      // A matching stored receipt and observations are useful evidence, but
      // do not authorize arbitrary later custody transitions.
      return confirmed("recorded_receipt_matches_live_vanilla_chests");
    }
    case "ABORTED":
      return hold(before ? "aborted_no_move_observed" :
                  "abort_vs_physical_mismatch", { total });
    default:
      return hold("unknown_journal_phase", { total });
  }
}
