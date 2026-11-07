/* PG-13 isolated LAB persistence SHADOW.
 * No inventory read/write, no item transfer, no new block and no Q5 migration.
 * Script is appended only to a verified PG08 1.5.1 derived candidate for LAB.
 * These world dynamic-property keys are reserved exclusively for this test.
 */
const PG13_A = "hartlogistics:pg13_shadow_reserve_v1";
const PG13_B = "hartlogistics:pg13_shadow_intent_v1";
const PG13_INSTANCE = String(Date.now()) + ":" + String(Math.floor(Math.random() * 1000000000));
const PG13_SCHEME = "pg13-shadow-v1";
let pg13LocalBusy = false;

function pg13Hash(payload) {
    // Small corruption detector only. NOT a secure MAC, fsync or proof of item custody.
    let hash = 2166136261;
    for (let i = 0; i < payload.length; i++) {
        hash ^= payload.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}
function pg13Core(stage, runId, session, prior) {
    return { scheme: PG13_SCHEME, stage, runId, session, prior };
}
function pg13Pack(stage, runId, session, prior) {
    const core = pg13Core(stage, runId, session, prior);
    return JSON.stringify({ ...core, checksum: pg13Hash(JSON.stringify(core)) });
}
function pg13Parse(raw, stage) {
    if (typeof raw !== "string" || raw.length < 40 || raw.length > 800) return null;
    let value;
    try { value = JSON.parse(raw); } catch (_) { return null; }
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).length !== 6 ||
        value.scheme !== PG13_SCHEME || value.stage !== stage ||
        typeof value.runId !== "string" || !/^[0-9]+:[0-9]+$/.test(value.runId) ||
        typeof value.session !== "string" || !/^[0-9]+:[0-9]+$/.test(value.session) ||
        !(value.prior === null || /^[0-9a-f]{8}$/.test(value.prior)) ||
        typeof value.checksum !== "string" ||
        !/^[0-9a-f]{8}$/.test(value.checksum)) return null;
    const core = pg13Core(value.stage, value.runId, value.session, value.prior);
    return pg13Hash(JSON.stringify(core)) === value.checksum ? value : null;
}
function pg13Read() {
    const aRaw = world.getDynamicProperty(PG13_A);
    const bRaw = world.getDynamicProperty(PG13_B);
    if (aRaw === undefined && bRaw === undefined) return { state: "EMPTY" };
    const a = pg13Parse(aRaw, "RESERVED");
    if (!a || a.prior !== null) return { state: "HOLD_INVALID_RESERVATION" };
    if (bRaw === undefined) return { state: "HOLD_PRE_INTENT", a };
    const b = pg13Parse(bRaw, "HANDOFF_INTENT");
    if (!b || b.prior !== a.checksum || b.runId !== a.runId ||
        b.session !== a.session) return { state: "HOLD_INVALID_INTENT", a };
    return { state: "HOLD_AMBIGUOUS_HANDOFF", a, b };
}
function pg13Notify(origin, msg) {
    const entity = origin?.sourceEntity;
    const decorated = "§6[PG13 LAB Shadow] §f" + msg;
    if (entity && typeof entity.sendMessage === "function") {
        try { entity.sendMessage(decorated); return; } catch (_) {}
    }
    log("[PG13] " + msg);
}
function pg13Authorized(origin) {
    // Do not permit console/command blocks or unattended automation to modify
    // world dynamic properties; must be an operator standing in known LAB room.
    const entity = origin?.sourceEntity;
    if (!entity || entity.typeId !== "minecraft:player") return false;
    try {
        const p = entity.location;
        return entity.dimension.id === "minecraft:overworld" &&
            p.x >= -968.7 && p.x <= -937.0 &&
            p.y >= 68 && p.y <= 73 &&
            p.z >= -817.7 && p.z <= -776.0;
    } catch (_) { return false; }
}
function pg13WriteAndVerify(key, value) {
    world.setDynamicProperty(key, value);
    if (world.getDynamicProperty(key) !== value) {
        throw new Error("post-write readback mismatch");
    }
}
function pg13Command(origin, action) {
    if (!pg13Authorized(origin)) {
        pg13Notify(origin, "REFUSED: operator player must be inside the isolated LAB Overworld room.");
        return;
    }
    if (pg13LocalBusy) {
        pg13Notify(origin, "HOLD: operation already in progress.");
        return;
    }
    pg13LocalBusy = true;
    try {
        const old = pg13Read();
        if (action === "begin") {
            if (old.state !== "EMPTY") {
                pg13Notify(origin, "HOLD: old shadow test state " + old.state + "; no overwrite.");
                return;
            }
            const runId = PG13_INSTANCE;
            pg13WriteAndVerify(PG13_A, pg13Pack("RESERVED", runId, PG13_INSTANCE, null));
            pg13Notify(origin, "BEGIN PASS: shadow reserve saved/read back. No items moved.");
            return;
        }
        if (action === "intent") {
            if (old.state !== "HOLD_PRE_INTENT" || old.a.session !== PG13_INSTANCE) {
                pg13Notify(origin, "HOLD: expected same-session reserve; found " + old.state + ".");
                return;
            }
            pg13WriteAndVerify(PG13_B,
                pg13Pack("HANDOFF_INTENT", old.a.runId, old.a.session, old.a.checksum));
            pg13Notify(origin, "INTENT PASS: shadow marker saved. No items moved. Restart only LAB BDS, then CHECK.");
            return;
        }
        if (action === "check") {
            if (old.state !== "HOLD_AMBIGUOUS_HANDOFF") {
                pg13Notify(origin, "HOLD: shadow recovery status " + old.state + "; no item action.");
                return;
            }
            const restarted = old.b.session !== PG13_INSTANCE;
            pg13Notify(origin, (restarted ? "RESTART READBACK PASS" : "SAME SESSION (restart not verified)") +
                ": reserved + intent persisted; recovery HOLD_AMBIGUOUS_HANDOFF. No items moved.");
            return;
        }
        if (action === "clear") {
            // Cleanup is scoped to two PG13-only diagnostic keys. Never touch
            // q4, native ItemStacks, other addon dynamic properties or blocks.
            world.setDynamicProperty(PG13_B, undefined);
            world.setDynamicProperty(PG13_A, undefined);
            if (pg13Read().state !== "EMPTY") throw new Error("shadow cleanup readback mismatch");
            pg13Notify(origin, "CLEAN PASS: only PG13 shadow keys cleared; no items moved.");
            return;
        }
        pg13Notify(origin, "REFUSED: unknown command.");
    } catch (err) {
        // Do not roll back partial writes or auto-clear them on exceptions.
        pg13Notify(origin, "HOLD: shadow storage uncertain; " + String(err));
        log("[PG13] shadow write/readback exception " + String(err));
    } finally {
        pg13LocalBusy = false;
    }
}
system.beforeEvents.startup.subscribe((event) => {
    for (const action of ["begin", "intent", "check", "clear"]) {
        event.customCommandRegistry.registerCommand(
            {
                name: "hartlogistics:shadow" + action,
                description: "PG13 LAB-only shadow journal " + action + " (NO ITEM TRANSFER)",
                permissionLevel: CommandPermissionLevel.GameDirectors,
                cheatsRequired: false
            },
            (origin) => { system.run(() => pg13Command(origin, action)); }
        );
    }
});
