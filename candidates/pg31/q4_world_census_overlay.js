/* TEMP_TEST:PG31-Q4-WORLD-CENSUS — one operator-only, read-only LAB command.
 * Verify the complete REGISTERED Q4 Receiver corpus with the already-tested
 * Q5 world census decoder. This does NOT freeze routing or authorize migration.
 * No command at startup/ticks; no world/inventory/journal/registry writes.
 * Remove the entire temporary diagnostic after the one accepted LAB session.
 */
function pg31Send(origin, message) {
    const entity = origin?.sourceEntity;
    if (entity && typeof entity.sendMessage === "function") {
        entity.sendMessage(message);
    } else {
        log(message.replace(/§./g, ""));
    }
}
function pg31Hold(origin, reason) {
    pg31Send(origin, "§e[PG31 Q4 WORLD READ ONLY] HOLD: " + String(reason) +
        ". No world or Q5 writes.");
}
function pg31ReadOnlyWorldCensus(origin) {
    if (!ready || !Array.isArray(logistics?.receivers)) {
        pg31Hold(origin, "PG27 runtime registry not ready");
        return;
    }
    // Explicitly read the live, original PG27 receiver registry. This is NOT
    // independent proof the world is globally frozen or chunks are loaded.
    const sources = logistics.receivers;
    if (sources.length < 1 || sources.length > 512) {
        pg31Hold(origin, "Receiver count outside bounded census");
        return;
    }
    let receivers, expectedTotal = 0, sourceSignature;
    try {
        receivers = [];
        for (const r of sources) {
            if (!r || typeof r.id !== "string" ||
                typeof r.queueKey !== "string" ||
                !Number.isSafeInteger(Number(r.queued)) ||
                Number(r.queued) < 0 || Number(r.queued) > 250000) {
                pg31Hold(origin, "unrecognized registered Receiver");
                return;
            }
            receivers.push({id:r.id, queueKey:r.queueKey});
            expectedTotal += Number(r.queued);
            if (!Number.isSafeInteger(expectedTotal)) {
                pg31Hold(origin, "world queue count overflow");
                return;
            }
        }
        sourceSignature = JSON.stringify(sources.map(r =>
            [r.id,r.queueKey,Number(r.queued)]));
    } catch (_) {
        pg31Hold(origin, "registry read failed");
        return;
    }

    // The existing read-only adapter performs TWO complete Receiver sweeps,
    // each with two raw Q4 reads, plus before/middle/after global metadata
    // listing and clear raw Q4/native journal checks. No Q4 loader is called.
    let report;
    try {
        report = previewQ5WorldQ4Census({
            world,
            worldId:"PG31-SOURCE-SHAPED-LAB-OBSERVATION-ONLY",
            receivers,
            expectedReceiverCount:receivers.length,
            expectedQueuedTotal:expectedTotal,
            registrySnapshotStable:true
        });
    } catch (_) {
        pg31Hold(origin, "read-only world census threw");
        return;
    }
    if (!report?.ok) {
        pg31Hold(origin, report?.reason ?? "world census refused");
        return;
    }
    let sourceAfter;
    try {
        sourceAfter = JSON.stringify(logistics.receivers.map(r =>
            [r.id,r.queueKey,Number(r.queued)]));
    } catch (_) {
        pg31Hold(origin, "post-census registry read failed");
        return;
    }
    if (sourceAfter !== sourceSignature ||
        report.receiverCount !== receivers.length ||
        report.itemCount !== expectedTotal ||
        report.hasNativeBlockResidencyProof !== false ||
        report.hasDurableGlobalFreezeProof !== false ||
        report.canMigrate !== false || report.canWriteWorld !== false) {
        pg31Hold(origin, "world or authority changed during observation");
        return;
    }
    const entries = report.receivers.reduce((sum,r) => sum + r.entryCount,0);
    const largest = report.receivers.reduce((best,r) =>
        !best || r.itemCount > best.itemCount ? r : best,null);
    if (!Number.isSafeInteger(entries) || !largest) {
        pg31Hold(origin, "entry totals invalid");
        return;
    }
    pg31Send(origin, "§a[PG31 Q4 WORLD READ ONLY] STRUCTURAL PASS: " +
        report.receiverCount + " registered Receivers, " + report.itemCount +
        " queued Q4 items in " + entries +
        " queue entries.");
    pg31Send(origin, "§7Largest Receiver Q4: " + largest.itemCount +
        " items, " + largest.entryCount + " entries; fingerprint " +
        largest.fingerprint + ".");
    pg31Send(origin, "§eNO Q5 WRITES, NO AUTHORITY CHANGE. Q4 remains authoritative." +
        " Matching reads are not a durable global freeze, native MR proof" +
        " or crash-atomic snapshot.");
}
system.beforeEvents.startup.subscribe((event) => {
    event.customCommandRegistry.registerCommand(
        {
            name:"hartlogistics:q5census",
            description:"PG31 LAB temporary read-only census of all Q4 Receivers.",
            permissionLevel:CommandPermissionLevel.GameDirectors,
            cheatsRequired:false
        },
        (origin) => { system.run(() => pg31ReadOnlyWorldCensus(origin)); }
    );
});
