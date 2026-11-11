/* TEMP_TEST:PG32-NOTHROW-BEFORE-EVENT — one-shot owner LAB cancellation check.
 * Volatile in-memory diagnostic, never a Q5 maintenance marker or writer.
 * Only an explicitly armed operator's NEXT interaction with a Collector is
 * intercepted. No inventory, Q4, journal, world or block-state mutation.
 * Remove after the bounded LAB test and exact PG27 rollback.
 */
const PG32_CANCEL_WINDOW_TICKS = 1200; // 60 seconds at 20 TPS.
let pg32Armed = null;
let pg32CancelledCount = 0;
let pg32LastResult = "NOT_RUN";

function pg32Notify(origin, message) {
    try {
        const player = origin?.sourceEntity;
        if (player && typeof player.sendMessage === "function") {
            player.sendMessage(message);
            return;
        }
    } catch (_) {}
    log(String(message).replace(/§./g, ""));
}
function pg32RequireOperator(origin) {
    try {
        const player = origin?.sourceEntity;
        return player && player.typeId === "minecraft:player" &&
            typeof player.id === "string" ? player : null;
    } catch (_) {
        return null;
    }
}
function pg32Arm(origin) {
    const player = pg32RequireOperator(origin);
    if (!player || !Number.isSafeInteger(system.currentTick)) {
        pg32Notify(origin, "§e[PG32] HOLD: player/tick unavailable; not armed.");
        return;
    }
    pg32Armed = {
        playerId: player.id,
        expiryTick: system.currentTick + PG32_CANCEL_WINDOW_TICKS
    };
    pg32LastResult = "ARMED";
    pg32Notify(origin,
        "§e[PG32] ARMED for one Collector interaction within 60 seconds. " +
        "No Q4, inventory or world writes. Use q5cancelclear to disarm.");
}
function pg32CancelBeforeInteract(ev) {
    // Source-inserted as the FIRST statement of the exact PG27
    // playerInteractWithBlock beforeEvent subscription. The original handler
    // is unchanged when not armed, expired, different player/block or failed.
    if (!pg32Armed) return false;
    try {
        const now = system.currentTick;
        if (!Number.isSafeInteger(now) || now > pg32Armed.expiryTick) {
            pg32Armed = null;
            pg32LastResult = "EXPIRED";
            return false;
        }
        if (!ev || ev.isFirstEvent !== true ||
            ev.player?.isSneaking ||
            ev.player?.id !== pg32Armed.playerId ||
            ev.block?.typeId !== "hartsorter:collector") return false;
        // Non-throwing, synchronous Bedrock beforeEvent cancellation.
        // Never cancel a foreign player's or vanilla block interaction.
        ev.cancel = true;
        if (ev.cancel !== true) {
            pg32Armed = null;
            pg32LastResult = "CANCEL_READBACK_FAILED";
            return false;
        }
        pg32Armed = null;
        pg32CancelledCount += 1;
        pg32LastResult = "CANCEL_READBACK_TRUE";
        return true; // Prevent ORIGINAL Hart interaction handler work.
    } catch (_) {
        pg32Armed = null;
        pg32LastResult = "CANCEL_EXCEPTION_HOLD";
        return false; // No throw, no Q5 authority.
    }
}
function pg32Check(origin) {
    const player = pg32RequireOperator(origin);
    if (!player) {
        pg32Notify(origin, "§e[PG32] HOLD: operator player required.");
        return;
    }
    if (pg32Armed && (!Number.isSafeInteger(system.currentTick) ||
        system.currentTick > pg32Armed.expiryTick)) {
        pg32Armed = null;
        pg32LastResult = "EXPIRED";
    }
    pg32Notify(origin, "§7[PG32 BEFORE EVENT] last=" + pg32LastResult +
        " cancelled=" + pg32CancelledCount +
        " armed=" + (pg32Armed?.playerId === player.id ? "YES" : "NO") +
        ". Q4 authoritative; no maintenance marker, journal or item writes.");
}
function pg32Clear(origin) {
    const player = pg32RequireOperator(origin);
    if (!player) {
        pg32Notify(origin, "§e[PG32] HOLD: operator player required.");
        return;
    }
    if (pg32Armed && pg32Armed.playerId !== player.id) {
        pg32Notify(origin, "§e[PG32] HOLD: another operator owns the arm.");
        return;
    }
    pg32Armed = null;
    pg32LastResult = "DISARMED";
    pg32Notify(origin, "§7[PG32] DISARMED. No world/state cleanup needed.");
}
system.beforeEvents.startup.subscribe(event => {
    for (const [name, description, fn] of [
        ["q5cancelarm", "PG32 temporary one-shot Collector cancel arm.", pg32Arm],
        ["q5cancelcheck", "PG32 temporary read-only cancellation status.", pg32Check],
        ["q5cancelclear", "PG32 temporary disarm.", pg32Clear]
    ]) {
        event.customCommandRegistry.registerCommand({
            name: "hartlogistics:" + name,
            description,
            permissionLevel: CommandPermissionLevel.GameDirectors,
            cheatsRequired: false
        }, origin => { system.run(() => fn(origin)); });
    }
});
