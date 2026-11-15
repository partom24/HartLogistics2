/**
 * Source-only fault probes for original 1.4.1 physical journal.
 * No actual Bedrock API calls. No 1.5 branch, no world or pack modifications.
 *
 * These are conditional witnesses under a synthetic native inventory host.
 * Passing source tests NEVER establishes crash-atomic Bedrock save behavior.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const original = readFileSync(path.join(root, "addon/behavior_pack/scripts/main.js"), "utf8");

function sourceFunction(name) {
  const declaration = new RegExp("(^|\\n)[ \\t]*(?:async\\s+)?function\\s+" + name + "\\s*\\(", "g");
  const found = declaration.exec(original);
  assert.ok(found, "original 1.4.1 function not found: " + name);
  const first = original.indexOf("function " + name, found.index);
  const opening = original.indexOf("{", first);
  assert.ok(opening >= 0);
  let depth = 0, quote = "", comment = "", escaped = false;
  for (let i = opening; i < original.length; i++) {
    const ch = original[i], next = original[i + 1];
    if (comment === "line") { if (ch === "\n") comment = ""; continue; }
    if (comment === "block") {
      if (ch === "*" && next === "/") { comment = ""; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "/" && next === "/") { comment = "line"; i++; continue; }
    if (ch === "/" && next === "*") { comment = "block"; i++; continue; }
    if (ch === "'" || ch === '"' || ch === "\x60") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return original.slice(first, i + 1);
  }
  throw Error("Unbalanced original function: " + name);
}

function originalFn(name, context = {}) {
  return vm.runInNewContext(sourceFunction(name) + "\n" + name + ";", context, {
    filename: "1.4.1/main.js:" + name,
    timeout: 2000
  });
}
const copy = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
function item(typeId, amount, hidden = "") {
  return {
    typeId, amount, maxAmount: 64, nameTag: "", hidden,
    clone() { return item(this.typeId, this.amount, this.hidden); }
  };
}
function container(initial, name, trace, onSet) {
  const slots = [initial?.clone()];
  return {
    slots,
    getItem(index) { trace.push(name + ".get:" + index); return slots[index]?.clone(); },
    setItem(index, value) {
      trace.push(name + ".set:" + index);
      if (onSet) onSet(value);
      slots[index] = value?.clone();
    }
  };
}
function createPhysicalHarness({
  srcAmount = 12, dstAmount = 0, typeId = "minecraft:stone",
  hidden = "", failSource = false, failDestination = false,
  failJournalClear = false, afterSourceSet = undefined
} = {}) {
  let journal = undefined, clearFailureArmed = failJournalClear;
  let stopSource = failSource, stopDest = failDestination;
  const trace = [], logs = [];
  const sig = stack => stack ? stack.typeId + "|" + stack.nameTag : "";
  const src = container(item(typeId, srcAmount, hidden), "src", trace, () => {
    if (stopSource) { stopSource = false; throw Error("source write interrupted"); }
    if (afterSourceSet) afterSourceSet();
  });
  const dst = container(dstAmount ? item(typeId, dstAmount, hidden) : undefined, "dst", trace, () => {
    if (stopDest) { stopDest = false; throw Error("destination write interrupted"); }
  });
  const srcBlock = { dimension: { id: "overworld" }, location: { x: 0, y: 65, z: 0 } };
  const dstBlock = { dimension: { id: "overworld" }, location: { x: 0, y: 64, z: 0 } };
  function saveJournal(value) {
    trace.push(value === undefined ? "journal.clear" : "journal.prepare");
    if (value === undefined && clearFailureArmed) {
      clearFailureArmed = false;
      throw Error("journal clear interrupted");
    }
    journal = copy(value);
  }
  const originalMove = originalFn("safeMovePartial", {
    exactStackSig: sig,
    serializeTransport: stack => ({ typeId: stack.typeId, hidden: stack.hidden }),
    POTION_ITEM_IDS: new Set(),
    filterRoundTripSafe: () => true,
    saveJournal
  });
  const originalRecovery = originalFn("recoverJournal", {
    world: { getDynamicProperty: () => journal },
    JOURNAL_KEY: "hartsorter:journal_v1",
    getContainerAt: (dimensionId, location) => {
      if (dimensionId !== "overworld") return undefined;
      if (location?.y === 65) return src;
      if (location?.y === 64) return dst;
      return undefined;
    },
    slotState: (host, slot) => {
      const stack = host.getItem(slot);
      return { sig: sig(stack), amount: stack?.amount ?? 0 };
    },
    exactStackSig: sig,
    rebuildTransportItem: (data, amount) => item(data.typeId, amount, data.hidden),
    saveJournal, log: msg => logs.push(msg)
  });
  return {
    src, dst, srcBlock, dstBlock, trace, logs,
    get journal() { return journal; },
    setJournal: value => { journal = copy(value); },
    move(amount, room = 64) {
      return originalMove(src, srcBlock, 0, dst, dstBlock,
        { slot: 0, before: dst.slots[0]?.amount ?? 0, room }, amount);
    },
    recover: () => originalRecovery(),
  };
}

test("L2-P2 M11: actual 1.4.1 native-slot mock moves a partial stack and clears journal last", () => {
  const h = createPhysicalHarness();
  assert.equal(h.move(4), 4);
  assert.equal(h.src.slots[0].amount, 8);
  assert.equal(h.dst.slots[0].amount, 4);
  assert.equal(h.journal, undefined);
  assert.ok(h.trace.indexOf("journal.prepare") < h.trace.indexOf("src.set:0"));
  assert.ok(h.trace.indexOf("src.set:0") < h.trace.indexOf("dst.set:0"));
  assert.ok(h.trace.indexOf("dst.set:0") < h.trace.indexOf("journal.clear"));
});

test("L2-P2 M10 M11: a partial destination merge is bounded by remaining room", () => {
  const h = createPhysicalHarness({ dstAmount: 61 });
  assert.equal(h.move(9, 3), 3);
  assert.equal(h.src.slots[0].amount, 9);
  assert.equal(h.dst.slots[0].amount, 64);
  assert.equal(h.journal, undefined);
});

test("L2-P2 M11: invalid amount or zero destination room does not create journal", () => {
  const h = createPhysicalHarness();
  assert.equal(h.move(0), 0);
  assert.equal(h.move(1, 0), 0);
  assert.equal(h.src.slots[0].amount, 12);
  assert.equal(h.dst.slots[0], undefined);
  assert.equal(h.trace.includes("journal.prepare"), false);
});

test("L2-P5 M12: crash before source debit leaves journal prepared; recovery clears without mutation", () => {
  const h = createPhysicalHarness({ failSource: true });
  assert.throws(() => h.move(4), /source write interrupted/);
  assert.ok(h.journal);
  assert.equal(h.src.slots[0].amount, 12);
  assert.equal(h.dst.slots[0], undefined);
  h.recover();
  assert.equal(h.journal, undefined);
  assert.equal(h.src.slots[0].amount, 12);
  assert.equal(h.dst.slots[0], undefined);
  assert.ok(h.logs.some(s => s.includes("untouched prepared")));
});

test("L2-P5 M12: crash after debit before credit recovers destination from retained journal", () => {
  const h = createPhysicalHarness({ failDestination: true });
  assert.throws(() => h.move(4), /destination write interrupted/);
  assert.ok(h.journal);
  assert.equal(h.src.slots[0].amount, 8);
  assert.equal(h.dst.slots[0], undefined);
  h.recover();
  assert.equal(h.src.slots[0].amount, 8);
  assert.equal(h.dst.slots[0].amount, 4);
  assert.equal(h.journal, undefined);
  assert.ok(h.logs.some(s => s.includes("completed destination credit")));
});

test("L2-P5 M12: crash after credit before journal clear detects complete transfer", () => {
  const h = createPhysicalHarness({ failJournalClear: true });
  assert.throws(() => h.move(4), /journal clear interrupted/);
  assert.ok(h.journal);
  assert.equal(h.src.slots[0].amount, 8);
  assert.equal(h.dst.slots[0].amount, 4);
  h.recover();
  assert.equal(h.journal, undefined);
  assert.equal(h.src.slots[0].amount, 8);
  assert.equal(h.dst.slots[0].amount, 4);
  assert.ok(h.logs.some(s => s.includes("Recovered completed transfer")));
});

test("L2-P5 M12: crash after native destination credit but before source debit debits on recovery", () => {
  const h = createPhysicalHarness({ failDestination: true });
  assert.throws(() => h.move(4), /destination write interrupted/);
  // Separate synthetic save cut: destination persisted while old source remained.
  h.src.slots[0] = item("minecraft:stone", 12);
  h.dst.slots[0] = item("minecraft:stone", 4);
  h.recover();
  assert.equal(h.src.slots[0].amount, 8);
  assert.equal(h.dst.slots[0].amount, 4);
  assert.equal(h.journal, undefined);
  assert.ok(h.logs.some(s => s.includes("completed source debit")));
});

test("L2-P5 M12: source and destination amounts inconsistent with journal HOLD unchanged", () => {
  const h = createPhysicalHarness({ failDestination: true });
  assert.throws(() => h.move(4), /destination write interrupted/);
  h.src.slots[0] = item("minecraft:stone", 7); // Neither declared 12 nor 8.
  h.dst.slots[0] = item("minecraft:stone", 2);
  const before = copy(h.journal);
  h.recover();
  assert.deepEqual(h.journal, before);
  assert.equal(h.src.slots[0].amount, 7);
  assert.equal(h.dst.slots[0].amount, 2);
  assert.ok(h.logs.some(s => s.includes("AMBIGUOUS")));
});

test("L2-P5 M12: unavailable source/destination retains pending recovery", () => {
  const h = createPhysicalHarness({ failDestination: true });
  assert.throws(() => h.move(4), /destination write interrupted/);
  const pending = copy(h.journal);
  // The actual recovery code uses getContainerAt; model unavailable dimension
  // by evaluating original recovery with no accessible native containers.
  const messages = [];
  const fn = originalFn("recoverJournal", {
    world: { getDynamicProperty: () => pending },
    JOURNAL_KEY: "hartsorter:journal_v1",
    getContainerAt: () => undefined,
    log: s => messages.push(s)
  });
  fn();
  assert.equal(h.journal.srcAfter, pending.srcAfter);
  assert.ok(messages.some(s => s.includes("unavailable")));
});

test("L2-P3 M12 M40: original journal signature cannot distinguish synthetic opaque payloads", () => {
  // Explicit source-level collision witness only. A real Bedrock integration
  // might refuse such a stack through transport serialization; this test does
  // not show actual duplication in the game.
  const h = createPhysicalHarness({
    typeId: "minecraft:stone", hidden: "opaque-A",
    failDestination: true
  });
  assert.throws(() => h.move(4), /destination write interrupted/);
  const oldSig = h.journal.sig;
  h.src.slots[0] = item("minecraft:stone", 8, "opaque-B");
  assert.notEqual(h.src.slots[0].hidden, h.journal.item.hidden);
  h.recover();
  assert.equal(h.journal, undefined);
  assert.equal(h.dst.slots[0].hidden, "opaque-A");
  assert.equal(h.src.slots[0].hidden, "opaque-B");
  assert.equal(oldSig, "minecraft:stone|");
});

// Dynamic property sharding is source-only: a simulated interruption at the
// generation switch is NOT evidence of Bedrock persistence atomicity.
test("L2-P5 M13: original registry shard split does not bisect UTF-16 surrogate pair", () => {
  const fn = originalFn("splitRegistryPayload", { REGISTRY_SHARD_CHARS: 2 });
  const parts = fn("A😀B");
  assert.equal(parts.join(""), "A😀B");
  assert.ok(parts.every(p => !/[\uD800-\uDBFF]$/.test(p)));
  assert.ok(parts.every(p => !/^[\uDC00-\uDFFF]/.test(p)));
});
test("L2-P5 M13: original registry generation marker writes after inactive shards", () => {
  const trace = [];
  const scope = {
    registry: [{ d: "overworld", x: 1, y: 2, z: 3 }],
    REGISTRY_META_KEY: "registry-meta",
    registryMeta: () => undefined,
    registryShardKey: (gen, idx) => "r2-" + gen + "-" + idx,
    splitRegistryPayload: t => [t],
    setWorldDynamic: (key, val) => trace.push({ key, val })
  };
  const fn = originalFn("saveRegistry", scope);
  fn();
  assert.equal(trace.length, 2);
  assert.equal(trace[0].key, "r2-1-0");
  assert.equal(trace[1].key, "registry-meta");
  assert.equal(JSON.parse(trace[1].val).count, 1);
});

test("L2-P5 M13: failure at registry metadata switch never commits generation in mock", () => {
  const state = new Map([["registry-meta", JSON.stringify({ version: 2, gen: 0, shards: 1 })]]);
  const fn = originalFn("saveRegistry", {
    registry: [{ id: "S1" }],
    REGISTRY_META_KEY: "registry-meta",
    registryMeta: () => ({ gen: 0, shards: 1 }),
    registryShardKey: (gen, idx) => "r2-" + gen + "-" + idx,
    splitRegistryPayload: value => [value],
    setWorldDynamic: (key, value) => {
      if (key === "registry-meta") throw Error("simulated metadata commit failure");
      state.set(key, value);
    }
  });
  assert.throws(() => fn(), /metadata commit failure/);
  assert.equal(JSON.parse(state.get("registry-meta")).gen, 0);
  assert.ok(state.has("r2-1-0"));
  // Simulated write order does not guarantee crash durability of the actual engine.
});
