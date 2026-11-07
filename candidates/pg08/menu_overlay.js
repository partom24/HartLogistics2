/* PG-08 candidate only: injected into a LAB-only derived copy of 1.4.1.
 * NO Q5 migration, MR inventory, world-write probes or implicit link selection.
 * Globals referenced below are existing 1.4.1 script functions/registry.
 */
const PG08_SESSION_TICKS = 1200; // ~60 seconds at 20 TPS; expire sooner only when ticks advance.
const pg08MenusOpen = new Map();
const pg08LinkRevisions = new Map();
let pg08LinkEditHold = false;

function pg08Revision(collectorId) {
    return pg08LinkRevisions.get(collectorId) ?? 0;
}
function pg08MenuCurrent(player, token) {
    return !!player && pg08MenusOpen.get(player.id) === token;
}
// Invalidate any unresolved form and pending link when a player leaves.
world.afterEvents?.playerLeave?.subscribe(ev => {
    pg08MenusOpen.delete(ev.playerId);
    pendingCollectorByPlayer.delete(ev.playerId);
});

function pg08Notify(player, message) {
    try { player.sendMessage(message); } catch (_) {}
}
function pg08CollectorLive(entry) {
    return !!entry && entry.present !== false && !!collectorAt(entry);
}
function pg08ReceiverLive(entry) {
    return !!entry && entry.present !== false && !!receiverAt(entry);
}
function pg08LinkLabel(link) {
    return link ? String(link) : "unlinked";
}
function pg08ReadOnlyMigrationStatus() {
    // Q5 is not implemented in this candidate. Do not claim completion.
    return "Q5: not installed; existing q4 storage unchanged";
}
function pg08StatusLine(entry) {
    return "Linked Receiver: " + pg08LinkLabel(entry.link) +
           "\n" + pg08ReadOnlyMigrationStatus();
}
function pg08ReadbackLink(collectorId) {
    const raw = world.getDynamicProperty(LOGISTICS_KEY);
    const snapshot = safeJsonParse(raw, null);
    const saved = snapshot && Array.isArray(snapshot.collectors)
        ? snapshot.collectors.find(x => x && x.id === collectorId) : null;
    if (!saved) throw new Error("missing persisted Collector record");
    return saved.link ?? null;
}
function pg08CommitLink(collectorId, oldLink, nextLink, revision = pg08Revision(collectorId)) {
    if (pg08LinkEditHold || pg08Revision(collectorId) !== revision) return false;
    const current = findCollectorById(collectorId);
    const expected = oldLink ?? null;
    const target = nextLink ?? null;
    if (!pg08CollectorLive(current) || (current.link ?? null) !== expected) return false;
    if (target !== null && !pg08ReceiverLive(findReceiverById(target))) return false;
    if (expected === target) return true;
    current.link = target;
    try {
        saveLogistics();
        if (pg08ReadbackLink(collectorId) !== target) throw new Error("link readback mismatch");
        pg08LinkRevisions.set(collectorId, revision + 1);
        return true;
    } catch (err) {
        // Never report success on failed/uncertain persistence.
        current.link = expected;
        try {
            saveLogistics();
            if (pg08ReadbackLink(collectorId) !== expected) throw new Error("rollback readback mismatch");
        } catch (rollbackErr) {
            pg08LinkEditHold = true; // Fail closed until an inspected restart/recovery.
            log("[PG08] LINK EDITS HELD: rollback uncertain; " + String(rollbackErr));
        }
        log("[PG08] Link write refused for " + collectorId + ": " + String(err));
        return false;
    }
}
async function pg08Show(player, form) {
    try {
        const result = await form.show(player);
        return result && !result.canceled ? result.selection : null;
    } catch (err) {
        log("[PG08] UI not available: " + String(err));
        pg08Notify(player, "§c[Hart Logistics] Menu unavailable; no link changed.");
        return null;
    }
}
async function pg08Confirm(player, title, body, action) {
    const form = new MessageFormData()
        .title(title).body(body).button1("Cancel").button2(action);
    return (await pg08Show(player, form)) === 1;
}
async function pg08WithMenu(player, callback) {
    if (!player || !player.id || pg08MenusOpen.has(player.id)) return;
    const token = {};
    pg08MenusOpen.set(player.id, token);
    try { await callback(token); }
    catch (err) {
        log("[PG08] Menu error: " + String(err));
        pg08Notify(player, "§c[Hart Logistics] Menu error; no link changed.");
    }
    finally {
        if (pg08MenuCurrent(player, token)) pg08MenusOpen.delete(player.id);
    }
}
async function pg08CollectorMenu(player, block, token) {
    const id = logisticsId(block.dimension.id, block.location.x, block.location.y, block.location.z);
    // Opening a menu never starts a pending link; cancel any older selection.
    pendingCollectorByPlayer.delete(player.id);
    let entry = findCollectorById(id);
    if (!entry) entry = registerCollector(block); // old-world registration recovery
    const prior = entry.link ?? null;
    const revision = pg08Revision(id);
    const form = new ActionFormData()
        .title("Hart Collector")
        .body(pg08StatusLine(entry))
        .button("Link / Relink Receiver")
        .button("Unlink Receiver")
        .button("Details")
        .button("Close");
    const choice = await pg08Show(player, form);
    if (!pg08MenuCurrent(player, token)) return;
    if (choice === 2) {
        const live = findCollectorById(id);
        if (pg08CollectorLive(live)) collectorStatus(player, live);
        return;
    }
    if (choice !== 0 && choice !== 1) return;
    const live = findCollectorById(id);
    if (!pg08CollectorLive(live) || (live.link ?? null) !== prior ||
        pg08Revision(id) !== revision || pg08LinkEditHold) {
        pg08Notify(player, "§c[Collector] Stale or unavailable. Reopen the menu.");
        return;
    }
    if (choice === 0) {
        pendingCollectorByPlayer.set(player.id, {
            collector: id, oldLink: prior, revision,
            expires: system.currentTick + PG08_SESSION_TICKS
        });
        pg08Notify(player, "§b[Collector] Selection armed. Interact with the intended Receiver to confirm.");
        return;
    }
    if (prior === null) {
        pg08Notify(player, "§7[Collector] Already unlinked.");
        return;
    }
    if (!await pg08Confirm(player, "Unlink Receiver",
            "Remove Collector link to " + pg08LinkLabel(prior) + "?", "Unlink")) return;
    if (!pg08MenuCurrent(player, token)) return;
    if (pg08CommitLink(id, prior, null, revision)) {
        pg08Notify(player, "§a[Collector] Receiver unlinked.");
    } else {
        pg08Notify(player, "§c[Collector] Unlink refused; saved link not confirmed.");
    }
}
async function pg08ReceiverMenu(player, block, token) {
    const id = logisticsId(block.dimension.id, block.location.x, block.location.y, block.location.z);
    let entry = findReceiverById(id);
    if (!entry) entry = registerReceiver(block);
    const ticket = pendingCollectorByPlayer.get(player.id);
    if (!ticket) {
        const links = logistics.collectors.filter(x => x.link === id).length;
        const form = new ActionFormData().title("Hart Receiver")
            .body("Linked Collectors: " + links + "\n" + pg08ReadOnlyMigrationStatus())
            .button("Details").button("Close");
        if ((await pg08Show(player, form)) === 0 &&
            pg08MenuCurrent(player, token) && pg08ReceiverLive(findReceiverById(id))) {
            receiverStatus(player, entry);
        }
        return;
    }
    if (system.currentTick > ticket.expires) {
        pendingCollectorByPlayer.delete(player.id);
        pg08Notify(player, "§e[Collector] Selection expired; select again.");
        return;
    }
    const col = findCollectorById(ticket.collector);
    if (!pg08CollectorLive(col) || !pg08ReceiverLive(findReceiverById(id)) ||
        (col.link ?? null) !== ticket.oldLink ||
        pg08Revision(col.id) !== ticket.revision || pg08LinkEditHold) {
        pendingCollectorByPlayer.delete(player.id);
        pg08Notify(player, "§c[Collector] Selection stale; no link changed.");
        return;
    }
    const confirmed = await pg08Confirm(player, "Confirm Receiver",
        "Link Collector " + col.id + "\nto Receiver " + id + "?", "Link");
    if (!confirmed) {
        pendingCollectorByPlayer.delete(player.id);
        return;
    }
    if (!pg08MenuCurrent(player, token) ||
        pendingCollectorByPlayer.get(player.id) !== ticket ||
        system.currentTick > ticket.expires || !pg08ReceiverLive(findReceiverById(id))) {
        pg08Notify(player, "§c[Collector] Selection changed or expired.");
        return;
    }
    pendingCollectorByPlayer.delete(player.id);
    if (pg08CommitLink(col.id, ticket.oldLink, id, ticket.revision)) {
        pg08Notify(player, "§a[Collector] Link confirmed to Receiver " + id + ".");
    } else {
        pg08Notify(player, "§c[Collector] Link refused; existing link preserved or uncertain.");
    }
}
// Keep original event dispatch function names intact.
function selectCollector(player, block) {
    void pg08WithMenu(player, token => pg08CollectorMenu(player, block, token));
}
function useReceiver(player, block) {
    void pg08WithMenu(player, token => pg08ReceiverMenu(player, block, token));
}
