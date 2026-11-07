/*
 * PG-14 LAB ONLY. One test-owned vanilla cobblestone, two fixed separate
 * single chests, one explicit operator command, no automatic gameplay.
 * This code is never installed in production or the protected source tree.
 *
 * This is a conservative clean-restart custody observation, NOT crash-atomic
 * inventory transfer or MR-capable serialization. Post-intent uncertainty
 * always HOLDs; script never tries to replay an ItemStack move.
 */
const PG14_RESERVE = "hartlogistics:pg14_cobble_reserve_v1";
const PG14_PROGRESS = "hartlogistics:pg14_cobble_progress_v1";
const PG14_SCHEMA = "pg14-one-cobble-v1";
const PG14_SRC = Object.freeze({ x: -955, y: 69, z: -804 });
const PG14_DST = Object.freeze({ x: -951, y: 69, z: -804 });
const PG14_ITEM = "minecraft:cobblestone";
const PG14_INSTANCE = String(Date.now()) + ":" + String(Math.floor(Math.random() * 1000000000));
let pg14Busy = false;

function pg14Hash(raw) {
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) {
        h ^= raw.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}
function pg14Pack(kind, runId, prior, receipt) {
    const core = { schema: PG14_SCHEMA, kind, runId, prior, receipt };
    return JSON.stringify({ ...core, check: pg14Hash(JSON.stringify(core)) });
}
function pg14Decode(raw, kind) {
    if (typeof raw !== "string" || raw.length > 1500 || raw.length < 45) return null;
    let record;
    try { record = JSON.parse(raw); } catch (_) { return null; }
    if (!record || typeof record !== "object" || Array.isArray(record) ||
        Object.keys(record).length !== 6 || record.schema !== PG14_SCHEMA ||
        record.kind !== kind ||
        typeof record.runId !== "string" || !/^[0-9]+:[0-9]+$/.test(record.runId) ||
        typeof record.check !== "string" || !/^[a-f0-9]{8}$/.test(record.check)) return null;
    if (kind === "RESERVED" && (record.prior !== null || record.receipt !== null)) return null;
    if (kind === "INTENT" && (typeof record.prior !== "string" ||
        !/^[a-f0-9]{8}$/.test(record.prior) || record.receipt !== null)) return null;
    if (kind === "SETTLED" && (typeof record.prior !== "string" ||
        !/^[a-f0-9]{8}$/.test(record.prior) ||
        !record.receipt || typeof record.receipt !== "object" ||
        Array.isArray(record.receipt) ||
        Object.keys(record.receipt).length !== 4 ||
        record.receipt.sourceBefore !== "1xcobble" ||
        record.receipt.destBefore !== "empty" ||
        record.receipt.sourceAfter !== "empty" ||
        record.receipt.destAfter !== "1xcobble")) return null;
    const core = { schema: record.schema, kind: record.kind, runId: record.runId,
                   prior: record.prior, receipt: record.receipt };
    return pg14Hash(JSON.stringify(core)) === record.check ? record : null;
}
function pg14Read() {
    const aRaw = world.getDynamicProperty(PG14_RESERVE);
    const bRaw = world.getDynamicProperty(PG14_PROGRESS);
    if (aRaw === undefined && bRaw === undefined) return { state: "EMPTY" };
    const reserve = pg14Decode(aRaw, "RESERVED");
    if (!reserve) return { state: "HOLD_BAD_RESERVATION" };
    if (bRaw === undefined) return { state: "HOLD_RESERVED", reserve };
    const intent = pg14Decode(bRaw, "INTENT");
    const settled = pg14Decode(bRaw, "SETTLED");
    const value = intent || settled;
    if (!value || value.prior !== reserve.check || value.runId !== reserve.runId)
        return { state: "HOLD_BAD_PROGRESS", reserve };
    return { state: intent ? "HOLD_AMBIGUOUS_HANDOFF" : "SETTLED", reserve, value };
}
function pg14Send(origin, message) {
    const entity = origin?.sourceEntity;
    const text = "§6[PG14 LAB Custody] §f" + message;
    if (entity && typeof entity.sendMessage === "function") {
        try { entity.sendMessage(text); return; } catch (_) {}
    }
    log("[PG14] " + message);
}
function pg14Allowed(origin) {
    const player = origin?.sourceEntity;
    if (!player || player.typeId !== "minecraft:player") return false;
    try {
        const p = player.location;
        return player.dimension.id === "minecraft:overworld" &&
            p.x >= -968.7 && p.x <= -937.0 && p.y >= 68 && p.y <= 73 &&
            p.z >= -817.7 && p.z <= -776.0;
    } catch (_) { return false; }
}
function pg14WriteChecked(key, value) {
    world.setDynamicProperty(key, value);
    if (world.getDynamicProperty(key) !== value) throw new Error("journal_readback_mismatch");
}
function pg14Chest(dimension, position) {
    const block = dimension.getBlock(position); // unload/absence throws or returns undefined
    if (!block || block.typeId !== "minecraft:chest") throw new Error("only_single_vanilla_chest_allowed");
    const component = block.getComponent("minecraft:inventory");
    const container = component?.container;
    if (!container || container.size !== 27 || container.isValid === false)
        throw new Error("vanilla_single_chest_inventory_unavailable");
    return { block, container };
}
function pg14ItemOrdinary(item) {
    if (!item || item.typeId !== PG14_ITEM || item.amount !== 1 ||
        item.isStackable !== true ||
        (item.nameTag !== undefined && item.nameTag !== "") ||
        item.getLore().length !== 0 ||
        item.getDynamicPropertyIds().length !== 0 ||
        item.getCanDestroy().length !== 0 ||
        item.getCanPlaceOn().length !== 0) return false;
    return true;
}
function pg14Scan(container) {
    // Full 27-slot snapshot, not just slot 0. Throws -> HOLD, never assume empty.
    const found = [];
    for (let slot = 0; slot < 27; slot++) {
        const item = container.getItem(slot);
        if (item !== undefined) found.push({ slot, item });
    }
    return found;
}
function pg14Rig() {
    const dimension = world.getDimension("minecraft:overworld");
    const source = pg14Chest(dimension, PG14_SRC);
    const dest = pg14Chest(dimension, PG14_DST);
    return { source: source.container, dest: dest.container };
}
function pg14Before(rig) {
    const from = pg14Scan(rig.source);
    const to = pg14Scan(rig.dest);
    return from.length === 1 && from[0].slot === 0 &&
        pg14ItemOrdinary(from[0].item) && to.length === 0;
}
function pg14After(rig) {
    const from = pg14Scan(rig.source);
    const to = pg14Scan(rig.dest);
    return from.length === 0 && to.length === 1 &&
        to[0].slot === 0 && pg14ItemOrdinary(to[0].item);
}
function pg14Empty(rig) {
    return pg14Scan(rig.source).length === 0 && pg14Scan(rig.dest).length === 0;
}
function pg14Execute(origin, action) {
    if (!pg14Allowed(origin)) {
        pg14Send(origin, "REFUSED: operator must be in designated LAB Overworld room.");
        return;
    }
    if (pg14Busy) {
        pg14Send(origin, "HOLD: one custody action is already in progress.");
        return;
    }
    pg14Busy = true;
    try {
        const state = pg14Read();
        if (action === "inspect") {
            if (state.state !== "EMPTY") {
                pg14Send(origin, "HOLD: prior transaction " + state.state + "; no changes.");
                return;
            }
            if (pg14Before(pg14Rig())) {
                pg14Send(origin, "INSPECT PASS: source has exactly 1 ordinary cobblestone in slot 0; destination empty; both single chests. No changes.");
            } else {
                pg14Send(origin, "REFUSED: exact 1-cobble / empty-chest setup not met. No changes.");
            }
            return;
        }
        if (action === "transfer") {
            // Exclusive one-shot test, no recurring scheduler, no implicit retry.
            if (state.state !== "EMPTY") {
                pg14Send(origin, "HOLD: " + state.state + "; transfer never replayed.");
                return;
            }
            const rig = pg14Rig();
            if (!pg14Before(rig)) {
                pg14Send(origin, "REFUSED: expected source slot 0 exactly one plain cobblestone; destination entirely empty.");
                return;
            }
            const runId = PG14_INSTANCE;
            const reserveRaw = pg14Pack("RESERVED", runId, null, null);
            pg14WriteChecked(PG14_RESERVE, reserveRaw);
            const reserved = pg14Decode(reserveRaw, "RESERVED");
            if (!reserved || pg14Read().state !== "HOLD_RESERVED") throw new Error("reserve_not_durable_readback");
            const intentRaw = pg14Pack("INTENT", runId, reserved.check, null);
            pg14WriteChecked(PG14_PROGRESS, intentRaw);
            if (pg14Read().state !== "HOLD_AMBIGUOUS_HANDOFF") throw new Error("intent_not_durable_readback");
            // Recheck exact physical preconditions after markers. No await or
            // scheduler tick lies between validation and the native move call.
            if (!pg14Before(rig)) throw new Error("physical_source_or_target_changed");
            rig.source.moveItem(0, 0, rig.dest);
            // Never use item construction or script source/destination mutation.
            // Any exception or incomplete readback leaves durable INTENT → HOLD.
            if (!pg14After(rig)) throw new Error("physical_post_move_readback_mismatch");
            const receipt = { sourceBefore: "1xcobble", destBefore: "empty",
                              sourceAfter: "empty", destAfter: "1xcobble" };
            pg14WriteChecked(PG14_PROGRESS,
                pg14Pack("SETTLED", runId, reserved.check, receipt));
            if (pg14Read().state !== "SETTLED") throw new Error("settlement_readback_mismatch");
            pg14Send(origin, "TRANSFER READBACK PASS: ONE test cobblestone moved from chest A to chest B; journal SETTLED. No second move permitted.");
            return;
        }
        if (action === "status") {
            if (state.state !== "SETTLED") {
                pg14Send(origin, "HOLD: journal " + state.state + "; no inventory action.");
                return;
            }
            if (!pg14After(pg14Rig())) {
                pg14Send(origin, "HOLD: settled record and physical chest contents disagree or have been changed. No inventory action.");
                return;
            }
            const restarted = state.reserve.runId !== PG14_INSTANCE;
            pg14Send(origin, (restarted ? "RESTART CUSTODY READBACK PASS" :
                              "SAME SESSION CUSTODY READBACK") +
                ": journal SETTLED and chest A empty / chest B exactly 1 cobblestone. No replay.");
            return;
        }
        if (action === "clear") {
            if (state.state !== "SETTLED" || !pg14Empty(pg14Rig())) {
                pg14Send(origin, "HOLD: clear only after a SETTLED test and both chests emptied manually.");
                return;
            }
            // This clears only the two PG14 experiment-owned keys. If a delete
            // fails halfway, the leftover partial record is a HOLD, not repair.
            pg14WriteChecked(PG14_PROGRESS, undefined);
            pg14WriteChecked(PG14_RESERVE, undefined);
            if (pg14Read().state !== "EMPTY") throw new Error("clear_readback_failure");
            pg14Send(origin, "CLEAN PASS: two PG14 test keys cleared. Both test chests empty.");
            return;
        }
        pg14Send(origin, "REFUSED: unknown PG14 action.");
    } catch (error) {
        pg14Send(origin, "HOLD: uncertain or invalid test state; NO automatic retry. " + String(error));
        log("[PG14] fail-closed: " + String(error));
    } finally {
        pg14Busy = false;
    }
}
system.beforeEvents.startup.subscribe(event => {
    for (const action of ["inspect", "transfer", "status", "clear"]) {
        event.customCommandRegistry.registerCommand(
            { name: "hartlogistics:custody" + action,
              description: "PG14 test-owned one cobblestone custody " + action,
              permissionLevel: CommandPermissionLevel.GameDirectors,
              cheatsRequired: false },
            origin => { system.run(() => pg14Execute(origin, action)); }
        );
    }
});
