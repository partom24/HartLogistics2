/* Real PG14 overlay executed in Node VM using restrictive stable-API mocks. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(
  path.resolve(__dirname, "../candidates/pg14/custody_overlay.js"), "utf8"
);
const KEY_A = "hartlogistics:pg14_cobble_reserve_v1";
const KEY_B = "hartlogistics:pg14_cobble_progress_v1";
const SRC = "-955|69|-804";
const DST = "-951|69|-804";

function cobble(overrides = {}) {
  return {
    typeId: "minecraft:cobblestone",
    amount: 1,
    isStackable: true,
    nameTag: undefined,
    getLore: () => [],
    getDynamicPropertyIds: () => [],
    getCanDestroy: () => [],
    getCanPlaceOn: () => [],
    ...overrides
  };
}
function fresh() {
  const data = new Map([["hartsorter:logistics_v2", "SENTINEL"]]);
  const writes = [], reads = [], messages = [];
  const sourceItems = Array(27).fill(undefined);
  const destItems = Array(27).fill(undefined);
  sourceItems[0] = cobble();
  let sourceType = "minecraft:chest";
  let destType = "minecraft:chest";
  let sourceSize = 27, destSize = 27;
  let moveFault = null, setFault = null, blockFault = null;
  const neighborTypes = new Map();
  let moves = 0;
  const containers = {};
  containers[SRC] = {
    get size() { return sourceSize; },
    isValid: true,
    getItem(slot) { return sourceItems[slot]; },
    moveItem(from, to, destination) {
      moves++;
      if (moveFault === "before") throw Error("synthetic before-move fault");
      assert.equal(from, 0);
      assert.equal(to, 0);
      assert.equal(destination, containers[DST]);
      if (destItems[0] !== undefined) throw Error("dest occupied");
      destItems[0] = sourceItems[0];
      sourceItems[0] = undefined;
      if (moveFault === "after") throw Error("synthetic after-move fault");
      if (moveFault === "wrong") destItems[0] = cobble({ amount: 2 });
    }
  };
  containers[DST] = {
    get size() { return destSize; },
    isValid: true,
    getItem(slot) { return destItems[slot]; }
  };
  const blocks = {
    [SRC]: { get typeId() { return sourceType; }, getComponent(id) {
      assert.equal(id, "minecraft:inventory");
      return { container: containers[SRC] };
    } },
    [DST]: { get typeId() { return destType; }, getComponent(id) {
      assert.equal(id, "minecraft:inventory");
      return { container: containers[DST] };
    } }
  };
  const world = {
    getDimension(id) {
      assert.equal(id, "minecraft:overworld");
      return { getBlock(position) {
        if (blockFault) throw Error("Unloaded chunk");
        const key = [position.x, position.y, position.z].join("|");
        if (blocks[key]) return blocks[key];
        return {
          typeId: neighborTypes.get(key) ||
            (position.y === 68 ? "minecraft:stone_bricks" : "minecraft:air"),
          getComponent(componentId) {
            assert.equal(componentId, "minecraft:inventory");
            return undefined;
          }
        };
      } };
    },
    getDynamicProperty(key) {
      reads.push(key);
      return data.get(key);
    },
    setDynamicProperty(key, value) {
      writes.push([key, value]);
      if (setFault && setFault(key, value)) throw Error("synthetic world write failure");
      if (value === undefined) data.delete(key);
      else data.set(key, value);
    }
  };
  function spawn(seed, pos = { x: -953, y: 69, z: -800 },
                 dim = "minecraft:overworld") {
    const commands = new Map(), startupCallbacks = [];
    const player = {
      typeId: "minecraft:player", location: pos,
      dimension: { id: dim },
      sendMessage: msg => messages.push(msg)
    };
    const context = {
      world,
      system: {
        run(fn) { fn(); },
        beforeEvents: { startup: { subscribe(fn) { startupCallbacks.push(fn); } } }
      },
      CommandPermissionLevel: { GameDirectors: 2 },
      Date: { now() { return 1700000000 + seed; } },
      Math: Object.assign(Object.create(Math), { random: () => seed / 1000 }),
      log(msg) { messages.push(msg); }
    };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: "pg14_custody_overlay.js" });
    assert.equal(startupCallbacks.length, 1);
    startupCallbacks[0]({
      customCommandRegistry: { registerCommand(meta, fn) {
        assert(!commands.has(meta.name));
        assert.equal(meta.cheatsRequired, false);
        assert.equal(meta.permissionLevel, 2);
        commands.set(meta.name, fn);
      } }
    });
    return {
      commands,
      run(action, origin = { sourceEntity: player }) {
        const fn = commands.get("hartlogistics:custody" + action);
        assert(fn, "unknown command");
        const before = messages.length;
        fn(origin);
        return messages.slice(before).join("\n");
      }
    };
  }
  return {
    data, writes, reads, messages, sourceItems, destItems, spawn,
    get moves() { return moves; },
    moveFault(mode) { moveFault = mode; },
    setFault(fn) { setFault = fn; },
    blockFault(b) { blockFault = b; },
    neighborType(key, type) { neighborTypes.set(key, type); },
    sourceType(t) { sourceType = t; },
    destType(t) { destType = t; },
    sourceSize(n) { sourceSize = n; },
    destSize(n) { destSize = n; },
    assertIsolated() {
      assert.equal(data.get("hartsorter:logistics_v2"), "SENTINEL");
      assert(writes.every(([key]) => [KEY_A, KEY_B].includes(key)));
      assert(reads.every(key => [KEY_A, KEY_B].includes(key)));
    }
  };
}

test("operator commands register but never run at startup or write inventory", () => {
  const r = fresh(), p = r.spawn(1);
  assert.deepEqual([...p.commands.keys()], [
    "hartlogistics:custodyinspect", "hartlogistics:custodytransfer",
    "hartlogistics:custodystatus", "hartlogistics:custodyclear"
  ]);
  assert.equal(r.moves, 0);
  assert.equal(r.writes.length, 0);
  r.assertIsolated();
});
test("INSPECT is read-only and passes exact two-chest one-cobble setup", () => {
  const r = fresh(), p = r.spawn(1);
  assert.match(p.run("inspect"), /INSPECT PASS/);
  assert.equal(r.moves, 0);
  assert.equal(r.writes.length, 0);
});
test("one explicit transfer records reserved then intent then settled", () => {
  const r = fresh(), p = r.spawn(1);
  assert.match(p.run("transfer"), /TRANSFER READBACK PASS/);
  assert.equal(r.moves, 1);
  assert.equal(r.sourceItems[0], undefined);
  assert.equal(r.destItems[0]?.typeId, "minecraft:cobblestone");
  assert.equal(r.writes.length, 3);
  assert.match(r.data.get(KEY_A), /RESERVED/);
  assert.match(r.data.get(KEY_B), /SETTLED/);
  r.assertIsolated();
});
test("same-session receipt readback is not advertised as restart", () => {
  const r = fresh(), p = r.spawn(1);
  p.run("transfer");
  assert.match(p.run("status"), /SAME SESSION CUSTODY READBACK/);
});
test("new script session sees one transferred cobble and original settled journal", () => {
  const r = fresh();r.spawn(1).run("transfer");
  assert.match(r.spawn(2).run("status"), /RESTART CUSTODY READBACK PASS/);
  assert.equal(r.moves, 1);
});
test("repeated transfer never extracts second item or overwrites journal", () => {
  const r = fresh(), p = r.spawn(1);
  p.run("transfer");
  const saved = [...r.data.entries()];
  assert.match(p.run("transfer"), /HOLD: SETTLED/);
  assert.match(r.spawn(2).run("transfer"), /HOLD: SETTLED/);
  assert.deepEqual([...r.data.entries()], saved);
  assert.equal(r.moves, 1);
});
test("missing or wrong source is refused with zero world-property writes", () => {
  for (const changed of [
    () => undefined, () => cobble({ amount: 2 }),
    () => cobble({ typeId: "minecraft:enchanted_book" }),
    () => cobble({ isStackable: false }),
    () => cobble({ nameTag: "precious" }),
    () => cobble({ getLore: () => ["value"] }),
    () => cobble({ getDynamicPropertyIds: () => ["custom:key"] }),
    () => cobble({ getCanPlaceOn: () => ["minecraft:stone"] }),
    () => cobble({ getCanDestroy: () => ["minecraft:stone"] })
  ]) {
    const r = fresh(), p = r.spawn(1);
    r.sourceItems[0] = changed();
    assert.match(p.run("transfer"), /REFUSED/);
    assert.equal(r.moves, 0);
    assert.equal(r.writes.length, 0);
  }
});
test("additional occupied slots or destination items cause exact-full-inventory refusal", () => {
  for (const config of [
    r => { r.sourceItems[2] = cobble(); },
    r => { r.destItems[1] = cobble(); },
    r => { r.destItems[0] = cobble(); }
  ]) {
    const r = fresh(), p = r.spawn(1);
    config(r);
    assert.match(p.run("inspect"), /REFUSED/);
    assert.match(p.run("transfer"), /REFUSED/);
    assert.equal(r.moves, 0);
    assert.equal(r.writes.length, 0);
  }
});
test("double chest and non-chest blocks refuse without writes", () => {
  for (const config of [
    r => r.sourceSize(54), r => r.destSize(54),
    r => r.sourceType("minecraft:barrel"), r => r.destType("minecraft:air")
  ]) {
    const r = fresh(), p = r.spawn(1);
    config(r);
    assert.match(p.run("transfer"), /HOLD: uncertain/);
    assert.equal(r.moves, 0);
    assert.equal(r.writes.length, 0);
  }
});
test("unloaded container failure is never replaced with a guess", () => {
  const r = fresh(), p = r.spawn(1);
  r.blockFault(true);
  assert.match(p.run("transfer"), /HOLD: uncertain/);
  assert.equal(r.moves, 0);
  assert.equal(r.writes.length, 0);
});
test("adjacent hopper, chest, or redstone automation denies physical movement", () => {
  for (const [key, type] of [
    ["-955|68|-804", "minecraft:hopper"],
    ["-955|70|-804", "minecraft:hopper"],
    ["-954|69|-804", "minecraft:chest"],
    ["-951|69|-803", "minecraft:dispenser"],
    ["-951|68|-804", "hartsorter:sorter"]
  ]) {
    const r = fresh(), p = r.spawn(1);
    r.neighborType(key, type);
    assert.match(p.run("transfer"), /HOLD: uncertain/);
    assert.equal(r.moves, 0);
    assert.equal(r.writes.length, 0);
  }
});
test("non-player/console/outside room cannot mutate test inventories", () => {
  for (const setup of [
    { pos: { x: -936, y: 69, z: -800 } },
    { pos: { x: -953, y: 69, z: -800 }, dim: "minecraft:nether" },
    { origin: {} }
  ]) {
    const r = fresh(), p = r.spawn(1, setup.pos, setup.dim);
    assert.match(p.run("transfer", setup.origin), /REFUSED/);
    assert.equal(r.moves, 0);
    assert.equal(r.writes.length, 0);
  }
});
test("RESERVED failure refuses before physical move and retains one-sided record if present", () => {
  const r = fresh(), p = r.spawn(1);
  r.setFault(key => key === KEY_A);
  assert.match(p.run("transfer"), /HOLD: uncertain/);
  assert.equal(r.moves, 0);
  assert.equal(r.data.has(KEY_A), false);
  assert.equal(r.data.has(KEY_B), false);
});
test("INTENT write failure blocks physical move; reservation remains held", () => {
  const r = fresh(), p = r.spawn(1);
  r.setFault(key => key === KEY_B);
  assert.match(p.run("transfer"), /HOLD: uncertain/);
  assert.equal(r.moves, 0);
  assert.equal(r.data.has(KEY_A), true);
  assert.equal(r.data.has(KEY_B), false);
  assert.match(r.spawn(2).run("status"), /HOLD_RESERVED/);
});
test("native move failure before mutation retains ambiguous intent; no retry", () => {
  const r = fresh(), p = r.spawn(1);
  r.moveFault("before");
  assert.match(p.run("transfer"), /HOLD: uncertain/);
  assert.equal(r.moves, 1);
  assert.equal(r.data.get(KEY_B).includes('"kind":"INTENT"'), true);
  assert.match(r.spawn(2).run("status"), /HOLD_AMBIGUOUS_HANDOFF/);
  assert.match(p.run("transfer"), /HOLD/);
  assert.equal(r.moves, 1);
});
test("native move exception AFTER physical mutation retains ambiguous intent", () => {
  const r = fresh(), p = r.spawn(1);
  r.moveFault("after");
  assert.match(p.run("transfer"), /HOLD: uncertain/);
  assert.equal(r.sourceItems[0], undefined);
  assert.equal(r.destItems[0]?.amount, 1);
  assert.match(r.spawn(2).run("status"), /HOLD_AMBIGUOUS_HANDOFF/);
  assert.equal(r.moves, 1);
});
test("post-move readback failure retains INTENT and holds across restart", () => {
  const r = fresh(), p = r.spawn(1);
  r.moveFault("wrong");
  assert.match(p.run("transfer"), /HOLD: uncertain/);
  assert.match(r.spawn(2).run("status"), /HOLD_AMBIGUOUS_HANDOFF/);
  assert.equal(r.moves, 1);
});
test("settlement world-write exception after actual move retains ambiguous hold", () => {
  const r = fresh(), p = r.spawn(1);
  r.setFault((key, raw) => key === KEY_B && typeof raw === "string" &&
    raw.includes('"kind":"SETTLED"'));
  assert.match(p.run("transfer"), /HOLD: uncertain/);
  assert.equal(r.moves, 1);
  assert.equal(r.sourceItems[0], undefined);
  assert.equal(r.destItems[0]?.amount, 1);
  assert.match(r.spawn(2).run("status"), /HOLD_AMBIGUOUS_HANDOFF/);
});
test("tampered or missing journal key remains HOLD; no transfer", () => {
  for (const alter of [
    r => r.data.delete(KEY_A),
    r => r.data.set(KEY_B, r.data.get(KEY_B).replace("SETTLED", "INTENT")),
    r => r.data.set(KEY_A, "invalid json")
  ]) {
    const r = fresh(), p = r.spawn(1);
    p.run("transfer");
    alter(r);
    assert.match(r.spawn(2).run("status"), /HOLD/);
    assert.match(r.spawn(2).run("transfer"), /HOLD/);
    assert.equal(r.moves, 1);
  }
});
test("physical chest changed since settlement blocks success status", () => {
  const r = fresh(), p = r.spawn(1);
  p.run("transfer");
  r.destItems[0] = cobble({ amount: 2 });
  assert.match(r.spawn(2).run("status"), /HOLD: settled record/);
});
test("cleanup is denied before operator removes received test cobble", () => {
  const r = fresh(), p = r.spawn(1);
  p.run("transfer");
  assert.match(p.run("clear"), /HOLD: clear only/);
  assert.equal(r.data.has(KEY_A), true);
  assert.equal(r.data.has(KEY_B), true);
});
test("cleanup of two experiment-only keys after both chests emptied", () => {
  const r = fresh(), p = r.spawn(1);
  p.run("transfer");
  r.destItems[0] = undefined; // owner manually collected test cobble
  assert.match(p.run("clear"), /CLEAN PASS/);
  assert.equal(r.data.has(KEY_A), false);
  assert.equal(r.data.has(KEY_B), false);
  r.assertIsolated();
});
test("uncertain partial cleanup does not make a new transfer available", () => {
  const r = fresh(), p = r.spawn(1);
  p.run("transfer");
  r.destItems[0] = undefined;
  r.setFault(key => key === KEY_A);
  assert.match(p.run("clear"), /HOLD: uncertain/);
  assert.match(r.spawn(2).run("status"), /HOLD_RESERVED/);
  assert.equal(r.moves, 1);
});
test("no new items or generic production inventory access in overlay", () => {
  assert.doesNotMatch(source, /new\s+ItemStack\s*\(/);
  assert.doesNotMatch(source, /setItem\s*\(|addItem\s*\(|clearAll\s*\(/);
  assert.doesNotMatch(source, /world\.getAllPlayers\s*\(/);
  assert.doesNotMatch(source, /world\.clearDynamicProperties\s*\(/);
  assert.doesNotMatch(source, /setDynamicProperty\s*\(\s*LOGISTICS_KEY/);
});
