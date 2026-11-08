/* PG25: preserve unresolved Q4 receipts, without replay or inferred settlement.
 * Process-local HOLD gates cooperating Hart writers. Persisted evidence is the
 * existing Q4 journal, not this flag. No external-writer or disk-atomic claim.
 */
let pg25QueueHold = false;

function pg25PreservePendingQueueJournal() {
    if (pg25QueueHold) return true;
    let reason;
    try {
        if (world.getDynamicProperty(QUEUE_JOURNAL_KEY) === undefined) return false;
        reason = "unresolved Q4 receipt (including unknown/malformed data)";
    } catch (_) {
        reason = "Q4 journal read failed";
    }
    pg25QueueHold = true;
    log("[PG25] Q4 HOLD: " + reason +
        "; all Hart routing paused. Preserve world, inventories and journals; " +
        "no automatic repair, replay or clear. Independent audit required.");
    return true;
}
