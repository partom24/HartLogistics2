/*
 * PG-23 derived LAB-only: source Hopper slot compaction with a single native
 * Container.moveItem and the existing physical transaction journal.
 *
 * Scoped replacement for the legacy unjournaled two-setItem compaction.
 * Does NOT prove disk-level atomicity or block vanilla/foreign container writes.
 * There are no commands, probes, experimental features or persistent new keys.
 */
const PG23_COMPACTION_JOURNAL = "pg23-native-hopper-compaction-v1";
let pg23LocalHold = false;

function pg23TransportMayRun() {
    // This is a *cooperating Hart-script* freeze. It does NOT stop vanilla
    // Hoppers/players, other addons or Minecraft's save pipeline.
    if (pg23LocalHold) return false;
    try {
        if (world.getDynamicProperty(JOURNAL_KEY) !== undefined) {
            pg20ReportHold("PG23 unresolved physical intent; all Hart routing paused");
            return false;
        }
        if (world.getDynamicProperty(QUEUE_JOURNAL_KEY) !== undefined) {
            pg20ReportHold("PG23 unresolved Q4 intent; all Hart routing paused");
            return false;
        }
        return true;
    } catch (_) {
        pg23LocalHold = true;
        pg20ReportHold("PG23 journal read failure; all Hart routing paused");
        return false;
    }
}

function pg23CompactSourceHopper(container, sourceBlock) {
    // Return false on ANY uncertain outcome so processColumn stops immediately.
    // Unlike the old implementation there is never a source/dest setItem pair.
    if (!pg23TransportMayRun()) return false;
    if (!container || !container.isValid || container.size !== 5 ||
        typeof container.moveItem !== "function" || !sourceBlock ||
        sourceBlock.typeId !== "minecraft:hopper") return false;

    let write = 0;
    try {
        for (let read = 0; read < container.size; read++) {
            const stack = container.getItem(read);
            if (!stack) continue;
            if (read !== write) {
                const before = pg20InspectableNativeFingerprint(stack);
                if (before === undefined ||
                    container.getItem(write) !== undefined) {
                    pg20ReportHold("PG23 hopper compaction preflight unavailable");
                    return false;
                }
                if (!pg23TransportMayRun()) return false;
                const tx = {
                    opaqueTag: PG23_COMPACTION_JOURNAL,
                    d: sourceBlock.dimension.id,
                    srcD: sourceBlock.dimension.id,
                    dstD: sourceBlock.dimension.id,
                    src: {...sourceBlock.location},
                    dst: {...sourceBlock.location},
                    srcSlot: read, dstSlot: write,
                    srcBefore: stack.amount, srcAfter: 0,
                    dstBefore: 0, dstAfter: stack.amount,
                    sig: exactStackSig(stack),
                    itemType: stack.typeId, move: stack.amount
                };
                const raw = JSON.stringify(tx);
                saveJournal(tx);
                if (world.getDynamicProperty(JOURNAL_KEY) !== raw ||
                    pg20InspectableNativeFingerprint(container.getItem(read)) !== before ||
                    container.getItem(write) !== undefined) {
                    pg23LocalHold = true;
                    pg20ReportHold("PG23 compaction intent or physical pre-readback uncertain");
                    return false;
                }
                // Stable Container API supports moving inside the same container.
                // One engine call replaces the old exposed two-setItem gap.
                container.moveItem(read, write, container);
                if (container.getItem(read) !== undefined ||
                    pg20InspectableNativeFingerprint(container.getItem(write)) !== before) {
                    pg23LocalHold = true;
                    pg20ReportHold("PG23 compaction native move readback mismatch");
                    return false;
                }
                saveJournal(undefined);
                if (world.getDynamicProperty(JOURNAL_KEY) !== undefined) {
                    pg23LocalHold = true;
                    pg20ReportHold("PG23 compaction journal-clear readback uncertain");
                    return false;
                }
            }
            write++;
        }
        return true;
    } catch (_) {
        // A throw can occur AFTER physical mutation. Retain prepared journal,
        // block subsequent Hart-script moves, and require an independent audit.
        pg23LocalHold = true;
        pg20ReportHold("PG23 compaction exception: HOLD, no automatic retry");
        return false;
    }
}
