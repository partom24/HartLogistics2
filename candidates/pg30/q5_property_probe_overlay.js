/* TEMP_TEST:PG30-Q5-PERSISTENCE
 * Operator-only Bedrock LAB diagnostic of isolated dual world-property keys.
 * NOT the Q5 maintenance marker. No routing, queue, inventory, journal, block
 * or authority changes are permitted. Remove command and temporary registry
 * after test and verified cleanup. Never run on production.
 */
const PG30_HISTORY_KEY = "hartlogistics:pg30_test_history_tmp_v1";
const PG30_MARKER_KEY = "hartlogistics:pg30_test_marker_tmp_v1";
const PG30_SCHEMA = "hl-pg30-temp-property-probe-v1";
const PG30_HISTORY_RAW = JSON.stringify({
    schema: PG30_SCHEMA, kind: "history", epoch: 1, revision: 1,
    owner: "TEMP_TEST:PG30-Q5-PERSISTENCE"
});
const PG30_MARKER_RAW = JSON.stringify({
    schema: PG30_SCHEMA, kind: "marker", epoch: 1, revision: 1,
    phase: "REQUESTED_SIMULATION_ONLY", authority: "NO_Q4_OR_Q5_CHANGE",
    owner: "TEMP_TEST:PG30-Q5-PERSISTENCE"
});
function pg30Send(origin, message) {
    const entity = origin?.sourceEntity;
    if (entity && typeof entity.sendMessage === "function") {
        entity.sendMessage(message);
    } else {
        log(message.replace(/§./g, ""));
    }
}
function pg30Read() {
    try {
        return {
            ok: true,
            history: world.getDynamicProperty(PG30_HISTORY_KEY),
            marker: world.getDynamicProperty(PG30_MARKER_KEY)
        };
    } catch (_) { return {ok: false, reason: "property read failed"}; }
}
function pg30KnownPair(pair) {
    return pair.ok &&
        (pair.history === undefined || pair.history === PG30_HISTORY_RAW) &&
        (pair.marker === undefined || pair.marker === PG30_MARKER_RAW);
}
function pg30Report(origin, prefix, message) {
    pg30Send(origin, "§e[PG30 TEMP Q5 PROPERTY] " + prefix + ": " + message);
}
function pg30Check(origin) {
    if (!ready) {
        pg30Report(origin, "HOLD", "legacy runtime initialization incomplete");
        return;
    }
    const pair = pg30Read();
    if (!pair.ok) {
        pg30Report(origin, "HOLD", pair.reason);
    } else if (!pg30KnownPair(pair)) {
        pg30Report(origin, "HOLD", "unknown test property contents; no mutation");
    } else if (pair.history === undefined && pair.marker === undefined) {
        pg30Report(origin, "CLEAN", "both temporary keys absent");
    } else if (pair.history === PG30_HISTORY_RAW && pair.marker === undefined) {
        pg30Report(origin, "HISTORY_ONLY", "history persisted; marker absent; Q4 unchanged");
    } else if (pair.history === PG30_HISTORY_RAW && pair.marker === PG30_MARKER_RAW) {
        pg30Report(origin, "BOTH_PRESENT", "test marker/history match; Q4 unchanged");
    } else {
        pg30Report(origin, "HOLD", "partial temporary cleanup; use q5pclear only");
    }
}
function pg30Start(origin) {
    if (!ready) {
        pg30Report(origin, "HOLD", "legacy runtime initialization incomplete");
        return;
    }
    const pair = pg30Read();
    if (!pair.ok || !pg30KnownPair(pair) ||
        pair.history !== undefined || pair.marker !== undefined) {
        pg30Report(origin, "HOLD", "test keys not both clean; no writes");
        return;
    }
    try {
        world.setDynamicProperty(PG30_HISTORY_KEY, PG30_HISTORY_RAW);
    } catch (_) {
        pg30Report(origin, "HOLD", "test-only history write failed; preserve state");
        return;
    }
    const after = pg30Read();
    if (!after.ok || after.history !== PG30_HISTORY_RAW ||
        after.marker !== undefined) {
        pg30Report(origin, "HOLD", "post-write readback ambiguous; preserve state");
        return;
    }
    pg30Report(origin, "HISTORY_ONLY", "temporary history written; marker absent");
}
function pg30Finish(origin) {
    if (!ready) {
        pg30Report(origin, "HOLD", "legacy runtime initialization incomplete");
        return;
    }
    const before = pg30Read();
    if (!before.ok || before.history !== PG30_HISTORY_RAW ||
        before.marker !== undefined) {
        pg30Report(origin, "HOLD", "not in exact history-only state; no writes");
        return;
    }
    try {
        world.setDynamicProperty(PG30_MARKER_KEY, PG30_MARKER_RAW);
    } catch (_) {
        pg30Report(origin, "HOLD", "test-only marker write failed; preserve state");
        return;
    }
    const after = pg30Read();
    if (!after.ok || after.history !== PG30_HISTORY_RAW ||
        after.marker !== PG30_MARKER_RAW) {
        pg30Report(origin, "HOLD", "two-key readback ambiguous; preserve state");
        return;
    }
    pg30Report(origin, "BOTH_PRESENT", "two isolated test keys now match; Q4 unchanged");
}
function pg30Clear(origin) {
    if (!ready) {
        pg30Report(origin, "HOLD", "legacy runtime initialization incomplete");
        return;
    }
    const before = pg30Read();
    if (!pg30KnownPair(before)) {
        pg30Report(origin, "HOLD", "unknown test keys; refusal to delete");
        return;
    }
    // Only these two exact test-owned keys may be cleared. If interruption
    // leaves one cleared, the same command safely resumes cleanup.
    try {
        if (before.marker === PG30_MARKER_RAW) {
            world.setDynamicProperty(PG30_MARKER_KEY, undefined);
        }
        if (before.history === PG30_HISTORY_RAW) {
            world.setDynamicProperty(PG30_HISTORY_KEY, undefined);
        }
    } catch (_) {
        pg30Report(origin, "HOLD", "partial test-key cleanup; recheck; no rollback");
        return;
    }
    const after = pg30Read();
    if (!after.ok || after.history !== undefined ||
        after.marker !== undefined) {
        pg30Report(origin, "HOLD", "cleanup not verified; preserve test pack");
        return;
    }
    pg30Report(origin, "CLEAN", "both temporary keys verified absent");
}
// No automatic property writes occur at startup, on ticks, or on player events.
// All four GameDirectors commands are intentional temporary lab instrumentation.
system.beforeEvents.startup.subscribe((event) => {
    const cmds = [
        ["hartlogistics:q5pcheck", "Read isolated PG30 property test state", pg30Check],
        ["hartlogistics:q5pstart", "Write PG30 isolated test history only", pg30Start],
        ["hartlogistics:q5pfinish", "Write PG30 isolated test marker after history", pg30Finish],
        ["hartlogistics:q5pclear", "Clear only exact PG30 test-owned keys", pg30Clear]
    ];
    for (const [name, description, callback] of cmds) {
        event.customCommandRegistry.registerCommand(
            {name, description,
             permissionLevel: CommandPermissionLevel.GameDirectors,
             cheatsRequired: false},
            origin => { system.run(() => callback(origin)); }
        );
    }
});
