/*
 * PG-15 LAB ONLY — deliberate two-cut interrupted handoff proof.
 * Builds ON already-accepted PG14 vanilla single-chest helpers. Keeps PG14,
 * PG13, PG08 and 1.4.1 untouched. Only own one world dynamic-property key.
 *
 * Both explicit cut commands persist INTENT then deliberately omit settlement.
 * PRE omits native move. POST executes precisely one native move, then omits
 * settlement. Neither scenario authorizes automatic retry or auto-settle.
 * An ordinary clean server restart is NOT a hard crash/power-loss test.
 */
const PG15_KEY = "hartlogistics:pg15_intent_cut_v1";
const PG15_SCHEMA = "pg15-cut-v1";
const PG15_INSTANCE = String(Date.now()) + ":" +
    String(Math.floor(Math.random() * 1000000000));
let pg15Busy = false;
let pg15Audited = null; // volatile: a post-restart read-only audit is mandatory

function pg15Hash(raw) {
    let result = 2166136261;
    for (let i = 0; i < raw.length; i++) {
        result ^= raw.charCodeAt(i);
        result = Math.imul(result, 16777619) >>> 0;
    }
    return result.toString(16).padStart(8, "0");
}
function pg15Encode(mode, runId) {
    const core = { schema: PG15_SCHEMA, mode, runId,
                   source: "-955|69|-804", destination: "-951|69|-804",
                   phase: "HANDOFF_INTENT", item: "minecraft:cobblestone", count: 1 };
    return JSON.stringify({ ...core, checksum: pg15Hash(JSON.stringify(core)) });
}
function pg15Decode(raw) {
    if (typeof raw !== "string" || raw.length < 80 || raw.length > 800) return null;
    let record;
    try { record = JSON.parse(raw); } catch (_) { return null; }
    if (!record || typeof record !== "object" || Array.isArray(record) ||
        Object.keys(record).length !== 9 ||
        record.schema !== PG15_SCHEMA ||
        !(record.mode === "PRE" || record.mode === "POST") ||
        typeof record.runId !== "string" ||
        !/^[0-9]+:[0-9]+$/.test(record.runId) ||
        record.source !== "-955|69|-804" ||
        record.destination !== "-951|69|-804" ||
        record.phase !== "HANDOFF_INTENT" ||
        record.item !== "minecraft:cobblestone" || record.count !== 1 ||
        typeof record.checksum !== "string" ||
        !/^[0-9a-f]{8}$/.test(record.checksum)) return null;
    const core = { schema: record.schema, mode: record.mode, runId: record.runId,
                   source: record.source, destination: record.destination,
                   phase: record.phase, item: record.item, count: record.count };
    return record.checksum === pg15Hash(JSON.stringify(core)) ? record : null;
}
function pg15Read() {
    const raw = world.getDynamicProperty(PG15_KEY);
    if (raw === undefined) return { state: "EMPTY" };
    const record = pg15Decode(raw);
    return record ? { state: "INTENT_HOLD", record } :
                    { state: "INVALID_HOLD" };
}
function pg15WriteChecked(raw) {
    world.setDynamicProperty(PG15_KEY, raw);
    if (world.getDynamicProperty(PG15_KEY) !== raw) {
        throw new Error("pg15_journal_readback_failure");
    }
}
function pg15Send(origin, message) {
    const entity = origin?.sourceEntity;
    const text = "§6[PG15 LAB Interrupted] §f" + message;
    if (entity && typeof entity.sendMessage === "function") {
        try { entity.sendMessage(text); return; } catch (_) {}
    }
    log("[PG15] " + message);
}
function pg15Physical(rig) {
    // These PG14 functions scan *all* 27 slots in both isolated single chests.
    // Never equate unknown/extra inventory with known empty.
    if (pg14Before(rig)) return "A_ONE_B_EMPTY";
    if (pg14After(rig)) return "A_EMPTY_B_ONE";
    if (pg14Empty(rig)) return "BOTH_EMPTY";
    return "UNEXPECTED";
}
function pg15Run(origin, action) {
    if (!pg14Allowed(origin)) {
        pg15Send(origin, "REFUSED: LAB operator must be in the designated Overworld room.");
        return;
    }
    if (pg15Busy || pg14Busy) {
        pg15Send(origin, "HOLD: another custody command is in progress.");
        return;
    }
    pg15Busy = true;
    try {
        const entry = pg15Read();
        if (action === "pre" || action === "post") {
            if (entry.state !== "EMPTY") {
                pg15Send(origin, "HOLD: existing " + entry.state +
                    "; never re-run an interrupted handoff.");
                return;
            }
            // Prior PG14 journal must already be cleared; never override it.
            if (pg14Read().state !== "EMPTY") {
                pg15Send(origin, "HOLD: old PG14 custody state is not empty.");
                return;
            }
            const rig = pg14Rig();
            if (!pg14Before(rig)) {
                pg15Send(origin, "REFUSED: exact one plain cobblestone in chest A slot 0, chest B empty, two isolated single chests required.");
                return;
            }
            const mode = action === "pre" ? "PRE" : "POST";
            const raw = pg15Encode(mode, PG15_INSTANCE);
            // Durable INTENT readback before any physical item touch.
            pg15WriteChecked(raw);
            if (pg15Read().state !== "INTENT_HOLD") {
                throw new Error("intent_not_readable");
            }
            // Recheck full physical rig after marker; any drift leaves HOLD.
            if (!pg14Before(rig)) throw new Error("physical_state_changed_after_intent");
            if (mode === "POST") {
                rig.source.moveItem(0, 0, rig.dest); // ONE native move, never replay
                if (!pg14After(rig)) throw new Error("physical_postmove_readback_mismatch");
                pg15Send(origin, "POST CUT PASS: 1 test cobblestone moved A to B; INTENT intentionally not SETTLED. HOLD, NO RETRY. Restart LAB normally then /hartlogistics:cutaudit.");
            } else {
                pg15Send(origin, "PRE CUT PASS: INTENT persisted; intentionally NO item moved. HOLD, NO RETRY. Restart LAB normally then /hartlogistics:cutaudit.");
            }
            return;
        }
        if (action === "audit") {
            pg15Audited = null;
            if (entry.state !== "INTENT_HOLD") {
                pg15Send(origin, "HOLD: journal " + entry.state +
                    "; no recovery action permitted.");
                return;
            }
            if (pg14Read().state !== "EMPTY") {
                pg15Send(origin, "HOLD: old PG14 journal changed; no recovery action.");
                return;
            }
            if (entry.record.runId === PG15_INSTANCE) {
                pg15Send(origin, "HOLD: SAME SESSION. A normal LAB restart is required; no item action.");
                return;
            }
            const physical = pg15Physical(pg14Rig());
            const expected = entry.record.mode === "PRE" ?
                             "A_ONE_B_EMPTY" : "A_EMPTY_B_ONE";
            if (physical !== expected) {
                pg15Send(origin, "HOLD_PHYSICAL_MISMATCH: expected " + expected +
                    ", observed " + physical + "; do not clear or retry.");
                return;
            }
            // A matching physical position does NOT prove exactly-once custody.
            pg15Audited = entry.record.checksum;
            pg15Send(origin, "RESTART CUT AUDIT PASS: " + entry.record.mode +
                " intent persists; observed " + physical +
                ". Recovery HOLD, no move, no retry, NO auto-settlement.");
            return;
        }
        if (action === "clear") {
            if (entry.state !== "INTENT_HOLD" ||
                entry.record.runId === PG15_INSTANCE ||
                pg15Audited !== entry.record.checksum) {
                pg15Send(origin, "HOLD: requires valid INTENT, separate-session successful audit, and manually emptied test chests.");
                return;
            }
            if (pg14Read().state !== "EMPTY" || !pg14Empty(pg14Rig())) {
                pg15Send(origin, "HOLD: PG14 journal must be empty and both test chests empty; manual item recovery required.");
                return;
            }
            // Does not move items. Deletes ONLY the PG15 experiment property.
            pg15WriteChecked(undefined);
            if (pg15Read().state !== "EMPTY") throw new Error("clear_readback_failure");
            pg15Audited = null;
            pg15Send(origin, "CLEAN PASS: only PG15 cut marker cleared. Both test chests empty; no automatic recovery.");
            return;
        }
        pg15Send(origin, "REFUSED: unrecognized cut test command.");
    } catch (error) {
        // A partial write or transfer is ambiguous. No rollback, no retry.
        pg15Audited = null;
        pg15Send(origin, "HOLD: uncertain or invalid state. NO RETRY. " + String(error));
        log("[PG15] fail-closed " + String(error));
    } finally {
        pg15Busy = false;
    }
}
system.beforeEvents.startup.subscribe(event => {
    for (const action of ["pre", "post", "audit", "clear"]) {
        event.customCommandRegistry.registerCommand(
            { name: "hartlogistics:cut" + action,
              description: "PG15 LAB deliberate " + action + " interrupted handoff",
              permissionLevel: CommandPermissionLevel.GameDirectors,
              cheatsRequired: false },
            origin => { system.run(() => pg15Run(origin, action)); }
        );
    }
});
