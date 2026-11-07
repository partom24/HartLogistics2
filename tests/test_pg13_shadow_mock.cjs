/* Execute the ACTUAL PG13 overlay in a Node VM; no Minecraft or LAB access. */
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const file = require("node:path").join(__dirname, "../candidates/pg13/shadow_overlay.js");
const source = fs.readFileSync(file, "utf8");
const A = "hartlogistics:pg13_shadow_reserve_v1";
const B = "hartlogistics:pg13_shadow_intent_v1";
const expectKeys = [A, B];
let passed = 0;

function rig() {
    const data = new Map([["hartsorter:logistics_v2", "HANDS_OFF_ORIGINAL_STATE"]]);
    const reads = [];
    const writes = [];
    const out = [];
    let failOnKey = null;
    function spawn(seed = 1, where = { x: -953, y: 69, z: -797 }, dim = "minecraft:overworld") {
        const commands = new Map();
        const subscribers = [];
        const player = {
            typeId: "minecraft:player",
            location: where,
            dimension: { id: dim },
            sendMessage: message => out.push(message)
        };
        const world = {
            getDynamicProperty(key) { reads.push(key); return data.get(key); },
            setDynamicProperty(key, value) {
                writes.push([key, value]);
                if (failOnKey === key) throw Error("synthetic write failure");
                if (value === undefined) data.delete(key);
                else data.set(key, value);
            }
        };
        const system = {
            run(callback) { callback(); },
            beforeEvents: { startup: { subscribe: callback => subscribers.push(callback) } }
        };
        const MockDate = { now: () => 1000000 + seed };
        const MockMath = Object.assign(Object.create(Math), { random: () => seed / 1000 });
        const sandbox = {
            world, system, Date: MockDate, Math: MockMath,
            CommandPermissionLevel: { GameDirectors: 1 },
            log: message => out.push(message)
        };
        vm.createContext(sandbox);
        vm.runInContext(source, sandbox, { filename: file });
        assert.equal(subscribers.length, 1);
        for (const callback of subscribers) callback({
            customCommandRegistry: {
                registerCommand(config, handler) {
                    assert.equal(commands.has(config.name), false);
                    commands.set(config.name, { config, handler });
                }
            }
        });
        return {
            commands,
            player,
            run(action, origin = { sourceEntity: player }) {
                const cmd = commands.get("hartlogistics:shadow" + action);
                assert(cmd, "missing shadow command " + action);
                const start = out.length;
                cmd.handler(origin);
                return out.slice(start).join("\n");
            }
        };
    }
    return {
        data, reads, writes, out, spawn,
        failFor(key) { failOnKey = key; },
        assertUntouched() {
            assert.equal(data.get("hartsorter:logistics_v2"), "HANDS_OFF_ORIGINAL_STATE");
            assert(writes.every(([key]) => expectKeys.includes(key)));
            assert(reads.every(key => expectKeys.includes(key)));
        }
    };
}
function test(name, body) {
    body();
    passed++;
    console.log("PASS PG13 " + passed + ": " + name);
}

test("four operator commands, no-cheats flag, no auto world access", () => {
    const r = rig();
    const p = r.spawn(10);
    assert.deepEqual([...p.commands.keys()], [
        "hartlogistics:shadowbegin", "hartlogistics:shadowintent",
        "hartlogistics:shadowcheck", "hartlogistics:shadowclear"
    ]);
    for (const cmd of p.commands.values()) {
        assert.equal(cmd.config.permissionLevel, 1);
        assert.equal(cmd.config.cheatsRequired, false);
    }
    assert.deepEqual(r.reads, []);
    assert.deepEqual(r.writes, []);
    r.assertUntouched();
});
test("begin persists one namespaced reservation; duplicate begin never overwrites", () => {
    const r = rig(), p = r.spawn(10);
    assert.match(p.run("begin"), /BEGIN PASS/);
    assert(r.data.has(A));
    assert.equal(r.data.has(B), false);
    const copy = r.data.get(A);
    assert.match(p.run("begin"), /HOLD/);
    assert.equal(r.data.get(A), copy);
    assert.equal(r.writes.length, 1);
    r.assertUntouched();
});
test("intent only succeeds after matching same-session begin and never moves items", () => {
    const r = rig(), p = r.spawn(10);
    assert.match(p.run("intent"), /HOLD/);
    assert.match(p.run("begin"), /No items moved/);
    assert.match(p.run("intent"), /INTENT PASS.*No items moved/);
    assert(r.data.has(B));
    assert.match(p.run("intent"), /HOLD/);
    assert.equal(r.writes.length, 2);
    r.assertUntouched();
});
test("same runtime may readback but cannot assert restart", () => {
    const r = rig(), p = r.spawn(10);
    p.run("begin"); p.run("intent");
    assert.match(p.run("check"), /SAME SESSION \(restart not verified\)/);
    assert.equal(r.writes.length, 2);
    r.assertUntouched();
});
test("fresh script runtime with persisted keys verifies restart and ambiguous HOLD", () => {
    const r = rig(), p = r.spawn(10);
    p.run("begin"); p.run("intent");
    const fresh = r.spawn(11);
    assert.match(fresh.run("check"), /RESTART READBACK PASS.*HOLD_AMBIGUOUS_HANDOFF/);
    assert.equal(r.writes.length, 2);
    r.assertUntouched();
});
test("post-restart begin/intent refuse to replay existing handoff", () => {
    const r = rig(), p = r.spawn(10);
    p.run("begin"); p.run("intent");
    const fresh = r.spawn(11);
    assert.match(fresh.run("begin"), /HOLD/);
    assert.match(fresh.run("intent"), /HOLD/);
    assert.equal(r.writes.length, 2);
    r.assertUntouched();
});
test("restart between reservation and intent holds rather than assuming custody", () => {
    const r = rig(), p = r.spawn(10);
    p.run("begin");
    const fresh = r.spawn(12);
    assert.match(fresh.run("check"), /HOLD_PRE_INTENT/);
    assert.match(fresh.run("intent"), /HOLD/);
    assert.equal(r.writes.length, 1);
});
test("clear removes only two PG13 keys and permits fresh test", () => {
    const r = rig(), p = r.spawn(10);
    p.run("begin"); p.run("intent");
    assert.match(p.run("clear"), /CLEAN PASS/);
    assert.equal(r.data.has(A), false);
    assert.equal(r.data.has(B), false);
    assert.match(p.run("begin"), /BEGIN PASS/);
    r.assertUntouched();
});
test("outside measured room and wrong dimension cannot mutate", () => {
    for (const [where, dim] of [
        [{ x: -936, y: 69, z: -797 }, "minecraft:overworld"],
        [{ x: -953, y: 87, z: -797 }, "minecraft:overworld"],
        [{ x: -953, y: 69, z: -797 }, "minecraft:nether"]
    ]) {
        const r = rig(), p = r.spawn(10, where, dim);
        assert.match(p.run("begin"), /REFUSED/);
        assert.equal(r.writes.length, 0);
        r.assertUntouched();
    }
});
test("command block/server console cannot mutate test properties", () => {
    const r = rig(), p = r.spawn(10);
    assert.match(p.run("begin", {}), /REFUSED/);
    assert.match(p.run("clear", { sourceEntity: { typeId: "minecraft:armor_stand" } }), /REFUSED/);
    assert.equal(r.writes.length, 0);
    r.assertUntouched();
});
test("tampered reservation checksum fails closed", () => {
    const r = rig(), p = r.spawn(10);
    p.run("begin");
    r.data.set(A, r.data.get(A).replace('"stage":"RESERVED"', '"stage":"SETTLED"'));
    assert.match(p.run("check"), /HOLD_INVALID_RESERVATION/);
    assert.match(p.run("intent"), /HOLD/);
    assert.equal(r.writes.length, 1);
});
test("tampered intent checksum fails closed", () => {
    const r = rig(), p = r.spawn(10);
    p.run("begin"); p.run("intent");
    r.data.set(B, r.data.get(B).replace(/"prior":"[a-f0-9]+"/, '"prior":"00000000"'));
    assert.match(r.spawn(11).run("check"), /HOLD_INVALID_INTENT/);
    assert.equal(r.writes.length, 2);
});
test("stray intent without reservation fails closed", () => {
    const r = rig(), p = r.spawn(10);
    p.run("begin"); p.run("intent");
    r.data.delete(A);
    assert.match(p.run("check"), /HOLD_INVALID_RESERVATION/);
    assert.match(p.run("begin"), /HOLD/);
    r.assertUntouched();
});
test("uncertain write does not clear or re-run when write fails", () => {
    const r = rig(), p = r.spawn(10);
    p.run("begin");
    r.failFor(B);
    assert.match(p.run("intent"), /HOLD.*shadow storage uncertain/);
    assert.equal(r.data.has(A), true);
    assert.equal(r.data.has(B), false);
    assert.equal(r.writes.length, 2);
    r.assertUntouched();
});
test("no code path references inventory movement, ItemStack, q4 or Q5 writes", () => {
    assert.doesNotMatch(source, /addItem\(|setItem\(|ItemStack\(|getComponent\(/);
    assert.doesNotMatch(source, /setDynamicProperty\(\s*LOGISTICS_KEY/);
    assert.doesNotMatch(source, /runCommand\(|sendCommand\(/);
});
console.log("PG13 OFFLINE REAL JS MOCK PASS:", passed);
