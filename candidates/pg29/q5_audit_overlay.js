/* PG29 Q5 read-only Bedrock audit. This is NOT a Q5 storage migration.
 * TEMP_TEST:PG29-Q5-AUDIT
 * Remove this custom command/startup hook and registry entry at test closeout.
 * Zero gameplay, inventory, world-property or journal writes originate here.
 */
function pg29SendAudit(origin, message) {
    const entity = origin?.sourceEntity;
    if (entity && typeof entity.sendMessage === "function") {
        entity.sendMessage(message);
    } else {
        log(message.replace(/§./g, ""));
    }
}
function pg29RunReadOnlyAudit(origin) {
    if (!ready || !Array.isArray(logistics?.receivers)) {
        pg29SendAudit(origin, "§e[PG29 Q5 READ ONLY] HOLD: logistics initialization incomplete.");
        return;
    }
    const known = logistics.receivers.filter(r =>
        r && typeof r.id === "string" && typeof r.queueKey === "string");
    if (!known.length) {
        pg29SendAudit(origin, "§e[PG29 Q5 READ ONLY] HOLD: no registered Receiver to inspect.");
        return;
    }
    // Inspect ONE existing Receiver (largest recorded backlog) and NO other
    // inventory, queue, world or item. No q4 loader/migrator is invoked.
    known.sort((a, b) =>
        (Number(b.queued) || 0) - (Number(a.queued) || 0) ||
        String(a.id).localeCompare(String(b.id)));
    const target = known[0];
    let report;
    try {
        report = sampleQ4WorldReadOnly({receiver: target, world});
    } catch (err) {
        pg29SendAudit(origin, "§c[PG29 Q5 READ ONLY] HOLD: read-only scanner threw; no writes.");
        return;
    }
    if (!report || !report.ok) {
        pg29SendAudit(origin, "§e[PG29 Q5 READ ONLY] HOLD: " +
            String(report?.reason ?? "unknown") + ". No migration or journal changes.");
        return;
    }
    pg29SendAudit(origin,
        "§a[PG29 Q5 READ ONLY] Q4 snapshot structurally observed " +
        report.total + " items in " + report.entryCount + " entries.");
    pg29SendAudit(origin,
        "§7Receiver: " + target.d + " " + target.x + "," + target.y + "," + target.z +
        " | fingerprint: " + report.snapshotFingerprint);
    pg29SendAudit(origin,
        "§eNO Q5 WRITES OR AUTHORITY CHANGE. Q4 remains authoritative. " +
        "Two matching reads are not crash-atomic proof.");
}

// Only invoked explicitly via a named operator command. No automatic audit.
system.beforeEvents.startup.subscribe((event) => {
    event.customCommandRegistry.registerCommand(
        {
            name: "hartlogistics:q5audit",
            description: "LAB-only read-only Q4 snapshot eligibility witness.",
            permissionLevel: CommandPermissionLevel.GameDirectors,
            cheatsRequired: false
        },
        (origin) => {
            system.run(() => pg29RunReadOnlyAudit(origin));
        }
    );
});