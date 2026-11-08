/*
 * PG24 derived LAB-only: authenticated-in-process readback before converting
 * a vanilla ejected item entity to a Q4 queue credit. Across a BDS restart an
 * unresolved entity_enqueue journal remains HOLD; it is NEVER permission to
 * delete a reappeared item, replay a Q4 credit or clear the journal.
 *
 * This does not make Q4 dynamic properties + vanilla entities disk-atomic.
 * No new world keys, probes, experiments or item reconstruction.
 */
let pg24EntityHold = false;

function pg24PreservePendingEntityJournal() {
    if (pg24EntityHold) return true;
    let raw;
    try {
        raw = world.getDynamicProperty(QUEUE_JOURNAL_KEY);
    } catch (_) {
        pg24EntityHold = true;
        pg20ReportHold("PG24 Q4 journal read error; HOLD all Hart transfers");
        return true;
    }
    if (raw === undefined) return false;
    let tx;
    try { tx = JSON.parse(raw); } catch (_) { return false; }
    if (!tx || typeof tx !== "object" || tx.kind !== "entity_enqueue") return false;
    pg24EntityHold = true;
    pg20ReportHold("PG24 unresolved ejected-item entity Q4 receipt: HOLD; no automatic removal or journal clear");
    return true;
}

function pg24VerifyEjectedCommit(receiver, q, tx, entity) {
    try {
        // The already-written intent must still name this EXACT transaction.
        if (world.getDynamicProperty(QUEUE_JOURNAL_KEY) !== JSON.stringify(tx))
            throw new Error("Q4 entity intent readback mismatch");
        if (!entity || !entity.isValid || entity.typeId !== "minecraft:item" ||
            entity.id !== tx.entityId)
            throw new Error("ejected source entity identity changed");

        const snap = safeJsonParse(world.getDynamicProperty(queueMetaKey(receiver)), undefined);
        const meta = normalizeQueueMeta(snap, receiver);
        if (!meta || !queueMetaMatches(meta, tx.qMetaAfter))
            throw new Error("Q4 entity queue metadata readback mismatch");

        const seq = queueSeqFromEntryId(receiver, tx.entryId);
        const entry = seq ? readQueueEntry(receiver, q, seq, true) : undefined;
        if (!entry || entry.id !== tx.entryId ||
            entry.amount !== tx.qAfter ||
            queueDataSignature(entry.data) !== tx.itemSig ||
            world.getDynamicProperty(queueDefinitionKey(receiver, entry.defId)) !== tx.itemSig)
            throw new Error("Q4 entity queue page/definition readback mismatch");

        // Other scripts or vanilla actions could replace/pick up the item
        // between the initial event and this synchronous final mutation.
        const stack = itemEntityStack(entity);
        const data = stack ? serializeQueueItem(stack) : undefined;
        if (!stack || stack.amount !== tx.entityAmount || !data ||
            queueDataSignature(data) !== tx.itemSig)
            throw new Error("ejected source stack no longer matches intent");

        entity.remove();
        // We cannot independently attest on-disk entity deletion here.
        // A failure or ambiguity leaves Q4 intent for manual custody audit.
    } catch (err) {
        pg24EntityHold = true;
        pg20ReportHold("PG24 ejected entity custody uncertain: HOLD without retry");
        throw err;
    }
}

function pg24ClearVerifiedEntityIntent() {
    try {
        saveQueueJournal(undefined);
        if (world.getDynamicProperty(QUEUE_JOURNAL_KEY) !== undefined)
            throw new Error("Q4 entity journal-clear readback mismatch");
    } catch (err) {
        pg24EntityHold = true;
        pg20ReportHold("PG24 ejected entity journal-clear uncertain: HOLD");
        throw err;
    }
}
