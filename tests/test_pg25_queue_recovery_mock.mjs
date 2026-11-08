/** Source-execute compiled PG25. Mock storage cuts, not Bedrock durability. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../build/pg25-lab/behavior_pack/scripts/main.js", import.meta.url), "utf8");
function body(name) {
  const start = source.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing actual PG25 " + name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}
const recovery = ["pg25PreservePendingQueueJournal", "recoverQueueJournal", "pg23TransportMayRun",
                  "schedulerTick", "logisticsTick", "recoverJournal"].map(body).join("\n");
function rig(raw, {readError = false, physicalPending = false} = {}) {
  const props = new Map();
  if (raw !== undefined) props.set("q4", raw);
  if (physicalPending) props.set("physical", "pending");
  const logs = [], calls = [];
  const forbidden = name => () => { calls.push(name); throw Error("FORBIDDEN " + name); };
  const context = {
    QUEUE_JOURNAL_KEY: "q4", JOURNAL_KEY: "physical", log: m => logs.push(m),
    pg20ReportHold: m => logs.push(m), ready: true, dirty: true,
    world: {getDynamicProperty(key) {
      if (key === "q4" && readError) throw Error("unreadable journal");
      return props.get(key);
    }},
    getQueueJournal: forbidden("parse Q4 journal"),
    loadReceiverQueue: forbidden("load/migrate queue"),
    queueEntryAmount: forbidden("inspect/repair queue"),
    persistQueueMeta: forbidden("write queue metadata"),
    saveQueueJournal: forbidden("clear/replace Q4 receipt"),
    getContainerAt: forbidden("access physical container"),
    rebuildQueueItem: forbidden("rebuild item"),
    rebuildTopology: forbidden("topology work"),
    getJournal: forbidden("physical journal recovery")
  };
  vm.runInNewContext("let pg25QueueHold=false, pg23LocalHold=false, pg24EntityHold=false;\n" + recovery, context);
  return {props, logs, calls, context,
    recover: () => context.recoverQueueJournal(),
    mayRun: () => context.pg23TransportMayRun(),
    setReadError: value => { readError = value; }};
}

for (const kind of ["enqueue", "dequeue", "entity_enqueue"]) {
  for (const state of ["before", "after", "page-only", "ambiguous"]) {
    test(`${kind} / ${state}: preserve exact receipt before classifier or inventory work`, () => {
      const raw = JSON.stringify({kind, receiverId: "r", entryId: "r:e1", fixtureState: state,
        srcBefore: 8, srcAfter: 0, dstBefore: 0, dstAfter: 8, qBefore: 8, qAfter: 0});
      const h = rig(raw);
      h.recover(); h.recover();
      assert.equal(h.props.get("q4"), raw);
      assert.equal(h.mayRun(), false);
      assert.deepEqual(h.calls, []);
      assert.equal(h.logs.length, 1, "HOLD should log once, not every tick");
      assert.match(h.logs[0], /Q4 HOLD/);
    });
  }
}
for (const raw of ["", "{broken", "null", "[]", "{}", '{"kind":"future_kind"}', 0, false]) {
  test(`unrecognized raw receipt ${JSON.stringify(raw)} is preserved and blocks writers`, () => {
    const h = rig(raw); h.recover();
    h.context.schedulerTick(); h.context.logisticsTick();
    assert.equal(h.props.get("q4"), raw); assert.equal(h.mayRun(), false);
    assert.deepEqual(h.calls, []);
  });
}
test("read failure holds without fabricating or clearing a marker", () => {
  const h = rig(undefined, {readError: true}); h.recover();
  h.setReadError(false);
  assert.equal(h.props.has("q4"), false); assert.equal(h.mayRun(), false);
  assert.match(h.logs[0], /read failed/); assert.deepEqual(h.calls, []);
});
test("clean startup without a receipt leaves admission available", () => {
  const h = rig(); h.recover();
  assert.equal(h.mayRun(), true); assert.equal(h.logs.length, 0);
  assert.deepEqual(h.calls, []);
});
test("removing a raw marker externally cannot unlock this process or physical recovery", () => {
  const h = rig('{"kind":"enqueue"}'); h.recover(); h.props.delete("q4");
  h.context.recoverJournal(); h.context.schedulerTick(); h.context.logisticsTick();
  assert.equal(h.mayRun(), false); assert.deepEqual(h.calls, []);
});
test("new process with the same persisted receipt remains HOLD without replays", () => {
  const raw = '{"kind":"dequeue","dstBefore":0,"dstAfter":8}';
  const a = rig(raw); a.recover();
  const b = rig(a.props.get("q4")); b.recover();
  assert.equal(b.mayRun(), false); assert.equal(b.props.get("q4"), raw);
  assert.deepEqual(b.calls, []);
});
test("physical pending journal still blocks ordinary admission with no Q4 receipt", () => {
  const h = rig(undefined, {physicalPending: true}); h.recover();
  assert.equal(h.mayRun(), false); assert.deepEqual(h.calls, []);
});
test("menu/block queue loading cannot bypass HOLD even before recovery tick or via cache", () => {
  const h = rig('{"kind":"enqueue"}');
  h.context.queueCache = {has() {throw Error("cache must not be inspected");}};
  vm.runInNewContext(body("loadReceiverQueue"), h.context);
  assert.throws(() => h.context.loadReceiverQueue({id: "r"}), /PG25 Q4 HOLD/);
  assert.throws(() => h.context.loadReceiverQueue({id: "r"}, true), /PG25 Q4 HOLD/);
  assert.equal(h.mayRun(), false);
  assert.equal(h.props.get("q4"), '{"kind":"enqueue"}');
});
test("clear-journal queue loading retains existing cached queue behavior", () => {
  const h = rig(), q = {total: 8};
  h.context.queueCache = new Map([["r", q]]);
  vm.runInNewContext(body("loadReceiverQueue"), h.context);
  assert.equal(h.context.loadReceiverQueue({id: "r"}), q);
  assert.equal(h.mayRun(), true); assert.equal(h.logs.length, 0);
});

// Execute the actual startup callback, including its queue-migration gate.
const startupStart = source.indexOf("system.run(() => {\n    registry = loadRegistry();");
assert.ok(startupStart >= 0);
const startupEnd = source.indexOf("\n});", startupStart) + "\n});".length;
for (const pending of [true, false]) {
  test(`actual startup ${pending ? "defers" : "retains"} Receiver migration with ${pending ? "pending" : "clear"} Q4 journal`, () => {
    const h = rig(pending ? '{"kind":"enqueue"}' : undefined);
    const work = [];
    Object.assign(h.context, {
      system: {run: fn => fn(), runTimeout() {}},
      LOGISTICS_KEY: "registry", registry: [], ready: false,
      safeJsonParse: () => ({collectors: [], receivers: [{id: "r"}], nextQueue: 1}),
      loadRegistry: () => [], migrateLegacyCollectorsIfNeeded: () => work.push("collector migration"),
      allocateQueueKey: () => {work.push("queue key"); return "q1";},
      loadReceiverQueue: () => work.push("Receiver queue initialization"),
      registryStorageSummary: () => "fixture", reconcileDisplays() {}, recoverJournal() {}
    });
    vm.runInNewContext(source.slice(startupStart, startupEnd), h.context);
    assert.deepEqual(work, pending ? [] : ["collector migration", "queue key", "Receiver queue initialization"]);
    assert.equal(h.context.ready, true);
  });
}

// Real unchanged normal Q4 functions with minimal fake ordinary-item storage.
function ordinaryRoute() {
  const h = rig();
  const receiver = {id: "r"}, collector = {id: "c", accepted: 0};
  const data = {typeId: "minecraft:cobblestone"};
  const item = amount => ({...data, amount, maxAmount: 64, clone() {return item(this.amount);}});
  let src = item(8), dst;
  const q = {total: 0, meta: {head: 0, tail: 0, next: 1, total: 0, received: 0, delivered: 0}};
  let entry;
  const block = {dimension: {id: "minecraft:overworld"}, location: {x: 1, y: 64, z: 1}};
  const input = {block, container: {getItem: () => src?.clone(), setItem: (_, value) => {src = value;}}};
  const output = {block, container: {getItem: () => dst?.clone(), setItem: (_, value) => {dst = value;}}};
  Object.assign(h.context, {
    QUEUE_CAPACITY: 250000, loadReceiverQueue: () => q,
    queueDataSignature: JSON.stringify, queueTailEntry: () => entry,
    queueHeadEntry: () => entry, queueMetaSnapshot: value => ({...value}),
    queueEntryId: (_, seq) => "r:e" + seq,
    persistQueueEntry: (_, __, seq, value) => {entry = {...value, seq};},
    clearQueueEntry: () => {entry = undefined;},
    persistQueueMeta: (_, __, meta) => {q.meta = {...meta}; q.total = meta.total;},
    saveQueueJournal: tx => tx === undefined ? h.props.delete("q4") : h.props.set("q4", JSON.stringify(tx)),
    rebuildQueueItem: (_, amount) => item(amount),
    findAcceptSlot: () => ({slot: 0, room: 64 - (dst?.amount ?? 0)}),
    queueSlotState: () => ({amount: dst?.amount ?? 0}), markLogisticsDirty() {}
  });
  vm.runInNewContext(["enqueueFromSource", "dequeueToReceiver"].map(body).join("\n"), h.context);
  return {h, q, collector, input, output, receiver, data, src: () => src, dst: () => dst};
}
test("ordinary enqueue and dequeue complete normally and conserve eight items", () => {
  const r = ordinaryRoute();
  assert.equal(r.h.context.enqueueFromSource(r.receiver, r.collector, r.input, 0, 8, r.data), 8);
  assert.equal(r.src(), undefined); assert.equal(r.q.total, 8); assert.equal(r.h.props.has("q4"), false);
  assert.equal(r.h.context.dequeueToReceiver(r.receiver, r.output, 8), 8);
  assert.equal(r.q.total, 0); assert.equal(r.dst().amount, 8); assert.equal(r.h.props.has("q4"), false);
  assert.equal(r.h.mayRun(), true);
});
test("partial ordinary intake and output preserve remaining balances", () => {
  const r = ordinaryRoute();
  assert.equal(r.h.context.enqueueFromSource(r.receiver, r.collector, r.input, 0, 3, r.data), 3);
  assert.equal(r.src().amount, 5); assert.equal(r.q.total, 3);
  assert.equal(r.h.context.dequeueToReceiver(r.receiver, r.output, 2), 2);
  assert.equal(r.q.total + r.src().amount + r.dst().amount, 8);
  assert.equal(r.q.meta.received, 3); assert.equal(r.q.meta.delivered, 2);
});
test("HOLD blocks actual normal functions before any queue or container reads", () => {
  const r = ordinaryRoute(); r.h.props.set("q4", "unresolved"); r.h.recover();
  const deny = () => {throw Error("must not read inventory");};
  r.input.container.getItem = deny; r.h.context.loadReceiverQueue = deny;
  assert.equal(r.h.context.enqueueFromSource(r.receiver, r.collector, r.input, 0, 1, r.data), 0);
  assert.equal(r.h.context.dequeueToReceiver(r.receiver, r.output, 1), 0);
  assert.equal(r.h.props.get("q4"), "unresolved");
});
