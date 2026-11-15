/**
 * HartLogistics2 Level 2 SOURCE-ONLY probes.
 *
 * Canonical implementation: immutable addon/behavior_pack/scripts/main.js,
 * original owner-supplied 1.4.1, NEVER the archived 1.5 code.
 * Nothing here interacts with BDS or an actual Minecraft inventory.
 *
 * These tests execute EXTRACTED ORIGINAL source with a bounded, explicitly
 * synthetic JavaScript host. They establish source effects and expose gaps;
 * simulated Container or ItemStack behavior is NOT evidence of Bedrock runtime
 * compatibility, performance, metadata fidelity or durability.
 *
 * Run: node --test recovery/tests/level2_source_contracts.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = fs.readFileSync(path.join(ROOT, "addon/behavior_pack/scripts/main.js"), "utf8");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "addon/behavior_pack/manifest.json"), "utf8"));
const MAPPING = fs.readFileSync(path.join(ROOT, "LEVEL1_MECHANISM_DECISIONS_141.md"), "utf8");
const API_RESEARCH = fs.readFileSync(path.join(ROOT, "LEVEL1_NATIVE_API_RESEARCH_141.md"), "utf8");

function extractOriginalFunction(name) {
  // Locate a named ORIGINAL function. This deliberately rejects not-found
  // methods rather than running a reimplementation from the test.
  const declaration = new RegExp("(^|\\n)[ \\t]*(?:async\\s+)?function\\s+" + name + "\\s*\\(", "g");
  const m = declaration.exec(SOURCE);
  assert.ok(m, "Original 1.4.1 function missing: " + name);
  const begin = SOURCE.indexOf("function " + name, m.index);
  const brace = SOURCE.indexOf("{", begin);
  assert.ok(brace >= 0, "Function has no body: " + name);
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = brace; i < SOURCE.length; ++i) {
    const c = SOURCE[i], n = SOURCE[i + 1];
    if (lineComment) {
      if (c === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === "*" && n === "/") { blockComment = false; ++i; }
      continue;
    }
    if (quote) {
      if (c === "\\") { ++i; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; ++i; continue; }
    if (c === "/" && n === "*") { blockComment = true; ++i; continue; }
    if (c === "'" || c === '"' || c === "\x60") { quote = c; continue; }
    if (c === "{") ++depth;
    if (c === "}" && --depth === 0) return SOURCE.slice(begin, i + 1);
  }
  throw new Error("Unbalanced original 1.4.1 function: " + name);
}

function compileOriginal(name, environment = {}) {
  const sandbox = vm.createContext({ ...environment });
  return { fn: vm.runInContext(extractOriginalFunction(name) + "\n" + name + ";", sandbox, {
    filename: "original-1.4.1/main.js:" + name,
    timeout: 2000
  }), sandbox };
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

function item(typeId, amount = 1, options = {}) {
  const payload = { typeId, amount, maxAmount: options.maxAmount ?? 64,
    nameTag: options.nameTag ?? "", hidden: options.hidden ?? "" };
  payload.isStackableWith = function (other) {
    return this.maxAmount > 1 && other?.maxAmount > 1 &&
      this.typeId === other.typeId && this.nameTag === other.nameTag &&
      this.hidden === other.hidden;
  };
  payload.clone = function () {
    return item(this.typeId, this.amount, {
      maxAmount: this.maxAmount, nameTag: this.nameTag, hidden: this.hidden
    });
  };
  payload.getLore = () => [];
  payload.getCanDestroy = () => [];
  payload.getCanPlaceOn = () => [];
  payload.getComponent = () => undefined;
  return payload;
}

function mockContainer(slots, trace = []) {
  return {
    isValid: true,
    get size() { trace.push("size"); return slots.length; },
    getItem(index) {
      trace.push("getItem:" + index);
      return slots[index]?.clone() ?? undefined;
    },
    setItem(index, stack) {
      trace.push("setItem:" + index);
      slots[index] = stack?.clone();
    },
    inspect() { return slots.map(s => s?.clone()); },
  };
}

// P0: establish the declared authoritative version rather than silently using
// a current moving "stable" docs definition or material from another branch.
test("L2-P0: original manifest declares 1.4.1 / @minecraft/server 2.7.0 / 1.26.50", () => {
  assert.deepEqual(MANIFEST.header.version, [1, 4, 1]);
  assert.deepEqual(MANIFEST.header.min_engine_version, [1, 26, 50]);
  assert.equal(MANIFEST.dependencies.find(d => d.module_name === "@minecraft/server")?.version, "2.7.0");
});
test("L2-P0: Level 1 maps exactly forty original mechanisms and 39 native families", () => {
  const ids = Array.from(MAPPING.matchAll(/^\| \*\*M(\d\d)/gm), m => m[1]);
  const native = Array.from(API_RESEARCH.matchAll(/^### N(\d\d) [—-]/gm), m => m[1]);
  assert.equal(new Set(ids).size, 40);
  assert.equal(new Set(native).size, 39);
  for (let i = 1; i <= 40; i++) assert.ok(ids.includes(String(i).padStart(2, "0")));
  for (let i = 1; i <= 39; i++) assert.ok(native.includes(String(i).padStart(2, "0")));
});
test("L2-P0: source does not depend on undocumented generic Hopper inventory-change event", () => {
  assert.equal(/(?:hopperInventoryItemChange|containerInventoryItemChange|containerItemChange)/.test(SOURCE), false);
  assert.ok(API_RESEARCH.includes("no event is established"));
});

// P1: Real scheduler code, counting source-level calls. These counts are NOT
// engine API counts, measured CPU, or TPS.
test("L2-P1 / M01: 1,387 idle columns are all examined each scheduler tick", () => {
  const visited = [];
  const env = {
    ready: true, dirty: false, rrStart: 0,
    columns: Array.from({ length: 1387 }, (_, i) => ({ id: i })),
    GLOBAL_MOVE_BUDGET: 256, JOURNAL_KEY: "journal",
    world: { getDynamicProperty() { return undefined; } },
    getQueueJournal: () => undefined,
    processColumn: col => { visited.push(col.id); return 0; },
    rebuildTopology: () => assert.fail("Unexpected topology rebuild")
  };
  const { fn, sandbox } = compileOriginal("schedulerTick", env);
  fn();
  assert.equal(visited.length, 1387);
  assert.equal(new Set(visited).size, 1387);
  assert.equal(sandbox.rrStart, 1);
  fn();
  assert.equal(visited.length, 2774);
  assert.equal(visited[1387], 1);
});
test("L2-P1 / M01 M05: move budget stops saturated scan, but not empty scan", () => {
  let visits = 0;
  const { fn } = compileOriginal("schedulerTick", {
    ready: true, dirty: false, rrStart: 0,
    columns: Array.from({ length: 1387 }, (_, id) => ({ id })),
    GLOBAL_MOVE_BUDGET: 256, JOURNAL_KEY: "journal",
    world: { getDynamicProperty: () => undefined },
    getQueueJournal: () => undefined,
    processColumn: () => { visits++; return 32; }
  });
  fn();
  assert.equal(visits, 8);
});
test("L2-P1 / M01 M12: pending journal fences scheduler before inventory work", () => {
  let calls = 0;
  const { fn } = compileOriginal("schedulerTick", {
    ready: true, dirty: false, rrStart: 0,
    columns: Array.from({ length: 100 }, (_, id) => ({ id })),
    GLOBAL_MOVE_BUDGET: 256, JOURNAL_KEY: "journal",
    world: { getDynamicProperty: () => "{pending}" },
    getQueueJournal: () => undefined,
    processColumn: () => { ++calls; return 0; }
  });
  fn();
  assert.equal(calls, 0);
});
function emptyColumnProbe({ locked = false, powered = false } = {}) {
  const trace = [];
  const container = mockContainer([undefined, undefined, undefined, undefined, undefined], trace);
  const hopper = {
    typeId: "minecraft:hopper",
    getComponent(name) { trace.push("getComponent:" + name); return { container }; }
  };
  const scope = {
    PER_COLUMN_BATCH: 16,
    getDimension: () => ({ getBlock: () => hopper }),
    hopperIsRedstoneLocked: () => locked,
    sorterAt: () => { trace.push("sorterAt"); return {}; },
    blockIsRedstonePowered: () => powered,
    sorterMode: () => "wildcard",
    matchesFilter: () => false,
    autoSorterMatches: () => false,
    destinationFor: () => undefined,
    log: () => undefined
  };
  scope.compactSourceHopper = compileOriginal("compactSourceHopper").fn;
  const { fn } = compileOriginal("processColumn", scope);
  return { used: fn({ d: "overworld", source: { x: 1, y: 2, z: 3 }, sorters: [{ m: "wildcard" }] }, 256), trace };
}
test("L2-P1 / M03 M04: original empty column checks Sorter and reads Hopper 15 times", () => {
  const { used, trace } = emptyColumnProbe();
  assert.equal(used, 0);
  assert.equal(trace.filter(x => x === "sorterAt").length, 1);
  assert.equal(trace.filter(x => x.startsWith("getItem:")).length, 15);
  assert.equal(trace.filter(x => x.startsWith("setItem:")).length, 0);
});
test("L2-P1 / M17: native Hopper redstone lock exits before touching inventory", () => {
  const { used, trace } = emptyColumnProbe({ locked: true });
  assert.equal(used, 0);
  assert.equal(trace.includes("sorterAt"), false);
  assert.equal(trace.some(x => x.includes("getComponent")), false);
});
test("L2-P1 / M17: powered Sorter refuses compaction and transfer", () => {
  const { used, trace } = emptyColumnProbe({ powered: true });
  assert.equal(used, 0);
  assert.equal(trace.filter(x => x === "sorterAt").length, 1);
  assert.equal(trace.some(x => x.startsWith("getItem:")), false);
});

test("L2-P1 / M01 M03 M04: 1,387 actual idle processColumn calls generate 20,805 mock slot reads", () => {
  let reads = 0, writes = 0, visits = 0;
  const slots = {
    isValid: true,
    size: 5,
    getItem() { reads++; return undefined; },
    setItem() { writes++; }
  };
  const hopper = {
    typeId: "minecraft:hopper",
    getComponent(name) {
      assert.equal(name, "minecraft:inventory");
      return { container: slots };
    }
  };
  const process = compileOriginal("processColumn", {
    PER_COLUMN_BATCH: 16,
    getDimension: () => ({ getBlock: () => hopper }),
    hopperIsRedstoneLocked: () => false,
    sorterAt: () => { visits++; return {}; },
    blockIsRedstonePowered: () => false,
    sorterMode: () => "wildcard",
    compactSourceHopper: compileOriginal("compactSourceHopper").fn,
    destinationFor: () => assert.fail("Empty Hopper should never inspect destinations"),
    log: () => undefined
  }).fn;
  const cols = Array.from({ length: 1387 }, (_, i) => ({
    d: "overworld",
    source: { x: i, y: 65, z: 0 },
    sorters: [{ m: "wildcard", y: 64 }]
  }));
  const scheduler = compileOriginal("schedulerTick", {
    ready: true, dirty: false, rrStart: 0,
    columns: cols, GLOBAL_MOVE_BUDGET: 256,
    JOURNAL_KEY: "journal",
    world: { getDynamicProperty: () => undefined },
    getQueueJournal: () => undefined,
    processColumn: process
  }).fn;
  scheduler();
  assert.equal(visits, 1387);
  assert.equal(reads, 1387 * 15);
  assert.equal(reads, 20805);
  assert.equal(writes, 0);
  // Counts synthetic JS slot access on an all-loaded, entirely empty,
  // eligible topology. This is NOT a recorded native API sample, TPS or CPU.
});

// P2: native slot selection candidates. Testing the current real slot-selection
// function *disqualifies* incorrect substitutions; native method outcomes stay
// unproven until actual BDS.
test("L2-P2 / M07 M10: partial compatible stack wins over earlier empty slot", () => {
  const slots = [undefined, item("minecraft:stone", 61), item("minecraft:dirt", 12)];
  const container = mockContainer(slots);
  const { fn } = compileOriginal("findAcceptSlot");
  const choice = fn(container, item("minecraft:stone", 1));
  assert.deepEqual(plain({ slot: choice.slot, before: choice.before, room: choice.room }),
    { slot: 1, before: 61, room: 3 });
  // A native firstEmptySlot() result of 0 would violate the original priority.
});
test("L2-P2 / M10: full slot array may still accept a stack merge", () => {
  const container = mockContainer([item("minecraft:stone", 63), item("minecraft:dirt", 64)]);
  const { fn } = compileOriginal("findAcceptSlot");
  const choice = fn(container, item("minecraft:stone", 1));
  assert.equal(choice.slot, 0);
  assert.equal(choice.room, 1);
});
test("L2-P2 / M10 M40: incompatible hidden item data is not treated as mergeable", () => {
  const container = mockContainer([item("minecraft:stone", 20, { hidden: "A" }),
    undefined, item("minecraft:stone", 11, { hidden: "B" })]);
  const { fn } = compileOriginal("findAcceptSlot");
  const choice = fn(container, item("minecraft:stone", 1, { hidden: "C" }));
  assert.equal(choice.slot, 1);
  assert.equal(choice.before, 0);
});
test("L2-P2 / M10: a completely full incompatible destination must reject", () => {
  const container = mockContainer([item("minecraft:dirt", 64), item("minecraft:stone", 64)]);
  const { fn } = compileOriginal("findAcceptSlot");
  assert.equal(fn(container, item("minecraft:stone", 1)), undefined);
});
test("L2-P2 / M10: same type nonstackable item must not merge", () => {
  const container = mockContainer([item("minecraft:sword", 1, { maxAmount: 1 }), undefined]);
  const { fn } = compileOriginal("findAcceptSlot");
  assert.equal(fn(container, item("minecraft:sword", 1, { maxAmount: 1 })).slot, 1);
});

// P3: identity/serialization. We establish properties of current source
// decisions, not whether a native clone persists or can be given one owner.
test("L2-P3 / M25: unknown nonstackable cargo is rejected from virtual Q4 encoding", () => {
  let rebuilt = 0;
  const { fn } = compileOriginal("serializeQueueItem", {
    queueKnownVanillaNonstack: () => false,
    rebuildQueueItem: () => { rebuilt++; return undefined; }
  });
  assert.equal(fn(item("custom:opaque_tool", 1, { maxAmount: 1, hidden: "secret" })), undefined);
  assert.equal(rebuilt, 0);
});
test("L2-P3 / M25 M40: Q4 encoding rejects a stack when reconstructed data cannot stack", () => {
  const s = item("minecraft:stone", 1, { hidden: "unrepresented" });
  const { fn } = compileOriginal("serializeQueueItem", {
    queueKnownVanillaNonstack: () => false,
    QUEUE_PLAIN_MINECART_IDS: new Set(),
    enchantments: () => [],
    dynamicProps: () => ({}),
    rebuildQueueItem: () => item("minecraft:stone", 1, { hidden: "different" }),
    QUEUE_ENTRY_MAX_CHARS: 30000
  });
  assert.equal(fn(s), undefined);
});
test("L2-P3 / M25: Q4 encoding accepts a conservatively reconstructed ordinary stack", () => {
  const s = item("minecraft:stone", 16);
  const { fn } = compileOriginal("serializeQueueItem", {
    queueKnownVanillaNonstack: () => false,
    QUEUE_PLAIN_MINECART_IDS: new Set(),
    enchantments: () => [],
    dynamicProps: () => ({}),
    rebuildQueueItem: () => item("minecraft:stone", 1),
    QUEUE_ENTRY_MAX_CHARS: 30000
  });
  const data = fn(s);
  assert.equal(data.typeId, "minecraft:stone");
  assert.deepEqual(plain(data.lore), []);
});
test("L2-P3 / M40: original exactStackSig omits arbitrary custom payload", () => {
  const { fn } = compileOriginal("exactStackSig", { enchantments: () => [] });
  const a = item("custom:metadata", 1, { maxAmount: 1, hidden: "opaque-A" });
  const b = item("custom:metadata", 1, { maxAmount: 1, hidden: "opaque-B" });
  assert.notEqual(a.hidden, b.hidden);
  assert.equal(fn(a), fn(b));
  // Only a signature-collision witness: NOT evidence that a specific actual
  // journal allows duplication. That requires the full transaction model.
});

// P4: Native redstone/events and workload from actual 1.4.1 functions.
test("L2-P4 / M17: Hopper powered toggle_bit true/1 locks, false/0 unlocks", () => {
  const { fn } = compileOriginal("hopperIsRedstoneLocked");
  const hopper = v => ({
    typeId: "minecraft:hopper",
    permutation: { getState: () => v }
  });
  for (const v of [true, 1]) assert.equal(fn(hopper(v)), true);
  for (const v of [false, 0]) assert.equal(fn(hopper(v)), false);
});
test("L2-P4 / M17 M39: missing Hopper power state currently fails open", () => {
  const { fn } = compileOriginal("hopperIsRedstoneLocked");
  assert.equal(fn({
    typeId: "minecraft:hopper",
    permutation: { getState() { throw Error("unloaded/missing state"); } }
  }), false);
  // Source risk classification: this is NOT proof failure is safe for custody.
});
test("L2-P4 / M17: cached custom redstone callback takes precedence over fallback", () => {
  const { fn } = compileOriginal("blockIsRedstonePowered", {
    recentHartRedstoneState: () => ({ power: 15 })
  });
  assert.equal(fn({ getRedstonePower: () => 0 }), true);
});
test("L2-P4 / M18 M30: only triggered Dropper/Dispenser matches source predicate", () => {
  const { fn } = compileOriginal("sourceIsTriggered");
  const b = (typeId, state) => ({
    typeId,
    permutation: { getState(name) { assert.equal(name, "triggered_bit"); return state; } }
  });
  assert.equal(fn(b("minecraft:dropper", true)), true);
  assert.equal(fn(b("minecraft:dispenser", 1)), true);
  assert.equal(fn(b("minecraft:chest", 1)), false);
  assert.equal(fn(b("minecraft:dropper", false)), false);
});
test("L2-P4 / M15 M16: no Sorters still causes three dimension-level display queries", () => {
  const queried = [];
  const { fn } = compileOriginal("reconcileDisplays", {
    ready: true, registry: [],
    getDimension: id => ({ getEntities(options) { queried.push({ id, options }); return []; } }),
    DISPLAY_ID: "hartsorter:filter_display"
  });
  fn();
  assert.equal(queried.length, 3);
  assert.deepEqual(queried.map(x => x.id), ["overworld", "nether", "the_end"]);
  assert.ok(queried.every(x => x.options.type === "hartsorter:filter_display"));
  assert.ok(queried.every(x => x.options.location === undefined));
});
test("L2-P4 / M15: 1,387 registered Sorters cause 1,387 display-owner checks per sweep", () => {
  let owners = 0, removals = 0, queries = 0;
  const { fn } = compileOriginal("reconcileDisplays", {
    ready: true, registry: Array.from({ length: 1387 }, (_, i) => ({ id: i, f: null })),
    sorterAt: () => { owners++; return {}; },
    removeDisplay: () => { removals++; },
    getDimension: () => ({ getEntities: () => { queries++; return []; } }),
    DISPLAY_ID: "hartsorter:filter_display"
  });
  fn();
  assert.equal(owners, 1387);
  assert.equal(removals, 1387);
  assert.equal(queries, 3);
});

// P5: Q4 page invariants. The native dynamic property API itself is mocked;
// page format, rejection and write ordering are from ORIGINAL source.
test("L2-P5 / M21 M22: Q4 accepts a single valid packed row and rejects sparse pages", () => {
  const { fn } = compileOriginal("normalizeQueuePage", { QUEUE_PAGE_SIZE: 64 });
  const result = fn([3, [["def1", 4]]], 2);
  assert.deepEqual(plain(result), { pageNo: 2, start: 3, rows: [{ defId: "def1", amount: 4 }] });
  assert.equal(fn([63, [["a", 1], ["b", 1]]], 2), undefined);
  assert.equal(fn([0, []], 2), undefined);
  assert.equal(fn([0, [["a", 0]]], 2), undefined);
  assert.equal(fn([64, [["a", 1]]], 2), undefined);
});
test("L2-P5 / M22: oversized Q4 page is refused before native property write", () => {
  const writes = [];
  const { fn } = compileOriginal("persistQueuePage", {
    QUEUE_PAGE_MAX_CHARS: 30000,
    queuePageKey: () => "page-key",
    setWorldDynamic: (key, value) => writes.push([key, value]),
    queueIoStats: { pageWrites: 0, chars: 0 }
  });
  const page = { pageNo: 0, start: 0, rows: [{ defId: "x".repeat(31000), amount: 1 }] };
  assert.throws(() => fn({ id: "r" }, { pages: new Map() }, page), /exceeds 30000/);
  assert.equal(writes.length, 0);
});
test("L2-P5 / M22: bounded queue page uses one dynamic-property write", () => {
  const writes = [], stats = { pageWrites: 0, chars: 0 }, q = { pages: new Map() };
  const { fn } = compileOriginal("persistQueuePage", {
    QUEUE_PAGE_MAX_CHARS: 30000,
    queuePageKey: () => "page-key",
    setWorldDynamic: (key, value) => writes.push({ key, value }),
    queueIoStats: stats
  });
  fn({ id: "r" }, q, { pageNo: 0, start: 0, rows: [{ defId: "abc", amount: 64 }] });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, "page-key");
  assert.equal(stats.pageWrites, 1);
  assert.ok(stats.chars > 0);
});
test("L2-P5 / M21 M22: original Q4 definition hash is deterministic and distinguishes sample IDs", () => {
  const { fn } = compileOriginal("queueDefinitionHash");
  const a = fn('{"id":"minecraft:stone"}');
  assert.equal(a, fn('{"id":"minecraft:stone"}'));
  assert.notEqual(a, fn('{"id":"minecraft:dirt"}'));
  // This is NOT a cryptographic collision or recovery proof.
});

// P6: document and work-scaling boundaries. Tests are deliberately rejecting
// common false assumptions from the native-first evaluation.
test("L2-P6: native research rejects undocumented Hopper event and native move atomicity", () => {
  assert.match(API_RESEARCH, /no event is established for \*every native Hopper/);
  assert.match(API_RESEARCH, /§?setDynamicProperties§?|setDynamicProperties/);
  assert.match(API_RESEARCH, /not document|does not document|does \*\*not\*\* document/i);
  assert.match(API_RESEARCH, /2\.8/);
  assert.match(API_RESEARCH, /2\.9/);
});
test("L2-P6: source's seven interval registrations are present and cost is not hidden", () => {
  const intervals = Array.from(SOURCE.matchAll(/system\.runInterval\((\w+),\s*(\d+)\)/g), m => [m[1], Number(m[2])]);
  assert.deepEqual(intervals, [
    ["schedulerTick", 1], ["logisticsTick", 1], ["reconcileDisplays", 100],
    ["reconcileModeVisuals", 5], ["recoverJournal", 20],
    ["recoverQueueJournal", 20], ["flushLogistics", 200]
  ]);
});
