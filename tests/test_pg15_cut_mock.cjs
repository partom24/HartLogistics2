/* Real PG14+PG15 overlays in restarted Node VM with fixed test-owned chest APIs. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(
  path.resolve(__dirname, "../candidates/pg14/custody_overlay.js"), "utf8"
) + "\n" + fs.readFileSync(
  path.resolve(__dirname, "../candidates/pg15/interrupted_overlay.js"), "utf8"
);
const PG15 = "hartlogistics:pg15_intent_cut_v1";
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
    assert.equal(startupCallbacks.length, 2);
    for (const cb of startupCallbacks) cb({
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
        const fn = commands.get("hartlogistics:cut" + action);
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
      assert(writes.every(([key]) => [KEY_A, KEY_B, PG15].includes(key)));
      assert(reads.every(key => [KEY_A, KEY_B, PG15].includes(key)));
    }
  };
}


test("PG15 four no-cheats operator commands register but never auto-run", () => {
  const r=fresh(),p=r.spawn(1);
  for(const a of ["pre","post","audit","clear"]) {
    assert(p.commands.has("hartlogistics:cut"+a));
  }
  assert.equal(r.writes.length,0);
  assert.equal(r.moves,0);
  r.assertIsolated();
});
test("PRE writes INTENT before move and intentionally never touches item", () => {
  const r=fresh(),p=r.spawn(1);
  assert.match(p.run("pre"),/PRE CUT PASS.*HOLD, NO RETRY/);
  assert.match(r.data.get(PG15),/"phase":"HANDOFF_INTENT"/);
  assert.equal(r.moves,0);
  assert.equal(r.sourceItems[0].amount,1);
  assert.equal(r.destItems[0],undefined);
  assert.equal(r.writes.length,1);
  r.assertIsolated();
});
test("PRE same-session AUDIT refuses to claim restart and allows no clear",()=>{
  const r=fresh(),p=r.spawn(1);
  p.run("pre");
  assert.match(p.run("audit"),/SAME SESSION/);
  r.sourceItems[0]=undefined;
  assert.match(p.run("clear"),/HOLD/);
  assert.equal(r.data.has(PG15),true);
});
test("PRE clean restart audits original source and leaves INTENT held",()=>{
  const r=fresh();r.spawn(1).run("pre");
  const next=r.spawn(2);
  assert.match(next.run("audit"),/RESTART CUT AUDIT PASS: PRE.*Recovery HOLD, no move, no retry/);
  assert.equal(r.moves,0);
  assert.equal(r.sourceItems[0].amount,1);
});
test("PRE cannot clear before manual extraction of test cobble",()=>{
  const r=fresh();r.spawn(1).run("pre");
  const next=r.spawn(2);
  next.run("audit");
  assert.match(next.run("clear"),/both test chests empty/);
  assert.equal(r.data.has(PG15),true);
});
test("PRE cleanup after restart audit and owner manually removes test cobble",()=>{
  const r=fresh();r.spawn(1).run("pre");
  const next=r.spawn(2);
  next.run("audit");
  r.sourceItems[0]=undefined;
  assert.match(next.run("clear"),/CLEAN PASS/);
  assert.equal(r.data.has(PG15),false);
  assert.equal(r.moves,0);
  r.assertIsolated();
});
test("POST writes INTENT and then moves exactly one item; never settles",()=>{
  const r=fresh(),p=r.spawn(1);
  assert.match(p.run("post"),/POST CUT PASS.*INTENT intentionally not SETTLED/);
  assert.equal(r.moves,1);
  assert.equal(r.sourceItems[0],undefined);
  assert.equal(r.destItems[0].amount,1);
  assert.equal(r.writes.length,1);
  assert.match(r.data.get(PG15),/"mode":"POST"/);
  assert.match(r.data.get(PG15),/"phase":"HANDOFF_INTENT"/);
});
test("POST restart audit sees one moved item but does not auto-settle or replay",()=>{
  const r=fresh();r.spawn(1).run("post");
  const next=r.spawn(2);
  assert.match(next.run("audit"),/RESTART CUT AUDIT PASS: POST.*Recovery HOLD, no move, no retry/);
  assert.equal(r.moves,1);
  assert.match(r.data.get(PG15),/"phase":"HANDOFF_INTENT"/);
});
test("POST cleanup after restart audit and owner removes received cobble",()=>{
  const r=fresh();r.spawn(1).run("post");
  const next=r.spawn(2);
  next.run("audit");
  r.destItems[0]=undefined;
  assert.match(next.run("clear"),/CLEAN PASS/);
  assert.equal(r.data.has(PG15),false);
  assert.equal(r.moves,1);
});
test("repeated PRE or POST cannot issue another move or rewrite marker",()=>{
  const r=fresh(),p=r.spawn(1);
  p.run("post");
  const raw=r.data.get(PG15);
  for(const a of ["pre","post","pre","post"]) {
    assert.match(p.run(a),/HOLD: existing INTENT_HOLD/);
  }
  assert.equal(r.moves,1);
  assert.equal(r.data.get(PG15),raw);
  assert.equal(r.writes.length,1);
});
test("rebooted script cannot issue new PRE or POST on unclosed marker",()=>{
  const r=fresh();r.spawn(1).run("pre");
  const next=r.spawn(2);
  assert.match(next.run("post"),/HOLD: existing INTENT_HOLD/);
  assert.equal(r.moves,0);
});
test("journal-write failure never permits a physical move",()=>{
  const r=fresh(),p=r.spawn(1);
  r.setFault((key)=>key===PG15);
  assert.match(p.run("post"),/HOLD: uncertain/);
  assert.equal(r.moves,0);
  assert.equal(r.data.has(PG15),false);
});
test("failed journal readback after write always stops before moving",()=>{
  const r=fresh(),p=r.spawn(1);
  const originalGet=r.data.get.bind(r.data);
  let touched=false;
  r.data.get=(key)=>{
    if(key===PG15 && r.data.has(PG15)) {
      touched=true;
      return "corrupted";
    }
    return originalGet(key);
  };
  assert.match(p.run("post"),/HOLD: uncertain/);
  assert.equal(touched,true);
  assert.equal(r.moves,0);
});
test("move exception BEFORE mutation leaves INTENT, cannot retry",()=>{
  const r=fresh(),p=r.spawn(1);
  r.moveFault("before");
  assert.match(p.run("post"),/HOLD: uncertain/);
  assert.equal(r.moves,1);
  assert.match(r.data.get(PG15),/HANDOFF_INTENT/);
  assert.match(r.spawn(2).run("audit"),/HOLD_PHYSICAL_MISMATCH/);
  assert.equal(r.moves,1);
});
test("move exception AFTER physical mutation leaves INTENT, no replay",()=>{
  const r=fresh(),p=r.spawn(1);
  r.moveFault("after");
  assert.match(p.run("post"),/HOLD: uncertain/);
  assert.equal(r.moves,1);
  assert.equal(r.destItems[0]?.amount,1);
  assert.match(r.spawn(2).run("audit"),/RESTART CUT AUDIT PASS: POST/);
  assert.equal(r.moves,1);
});
test("post-move wrong amount cannot produce a success signal or be cleared",()=>{
  const r=fresh(),p=r.spawn(1);
  r.moveFault("wrong");
  assert.match(p.run("post"),/HOLD: uncertain/);
  assert.match(r.spawn(2).run("audit"),/HOLD_PHYSICAL_MISMATCH/);
  assert.equal(r.moves,1);
});
test("unexpected chest content after restart blocks audit and cleanup",()=>{
  const r=fresh();r.spawn(1).run("post");
  const next=r.spawn(2);
  r.destItems[2]=cobble();
  assert.match(next.run("audit"),/HOLD_PHYSICAL_MISMATCH/);
  r.destItems[0]=undefined;
  r.destItems[2]=undefined;
  assert.match(next.run("clear"),/HOLD/);
  assert.equal(r.data.has(PG15),true);
});
test("tampered journal checksum blocks further audits and physical moves",()=>{
  const r=fresh();r.spawn(1).run("post");
  r.data.set(PG15,r.data.get(PG15).replace('"mode":"POST"','"mode":"PRE"'));
  const next=r.spawn(2);
  assert.match(next.run("audit"),/INVALID_HOLD/);
  assert.match(next.run("pre"),/INVALID_HOLD/);
  assert.match(next.run("clear"),/HOLD/);
  assert.equal(r.moves,1);
});
test("partial or unknown journal types never guessed as empty",()=>{
  for(const bad of ["{}","bad-json",0,true,{},null,""]){
    const r=fresh(),p=r.spawn(1);
    r.data.set(PG15,bad);
    assert.match(p.run("post"),/HOLD: existing INVALID_HOLD/);
    assert.equal(r.moves,0);
  }
});
test("PG14 not-cleared journal blocks new PG15 cut before state change",()=>{
  const r=fresh(),p=r.spawn(1);
  r.data.set(KEY_A,"previous custody data");
  assert.match(p.run("post"),/old PG14 custody state is not empty/);
  assert.equal(r.moves,0);
  assert.equal(r.data.has(PG15),false);
});
test("source wrong amount, extra items or occupied destination refuses pre and post",()=>{
  for(const edit of [
    r=>{r.sourceItems[0]=cobble({amount:2});},
    r=>{r.sourceItems[1]=cobble();},
    r=>{r.destItems[0]=cobble();},
    r=>{r.sourceType("minecraft:barrel");},
    r=>{r.destSize(54);},
    r=>{r.neighborType("-955|68|-804","minecraft:hopper");}
  ]){
    const r=fresh(),p=r.spawn(1);
    edit(r);
    assert.match(p.run("pre"),/REFUSED|HOLD/);
    assert.match(p.run("post"),/REFUSED|HOLD/);
    assert.equal(r.moves,0);
    assert.equal(r.data.has(PG15),false);
  }
});
test("out-of-bounds player, wrong dimension or console cannot start or clear",()=>{
  for(const setup of [
    {pos:{x:-931,y:69,z:-800}},
    {pos:{x:-953,y:69,z:-800},dim:"minecraft:nether"},
    {origin:{}}
  ]){
    const r=fresh(),p=r.spawn(1,setup.pos,setup.dim);
    assert.match(p.run("post",setup.origin),/REFUSED/);
    assert.equal(r.moves,0);
    assert.equal(r.writes.length,0);
  }
});
test("clear before audit cannot clear even if both chests have been emptied",()=>{
  const r=fresh();r.spawn(1).run("post");
  const next=r.spawn(2);
  r.destItems[0]=undefined;
  assert.match(next.run("clear"),/HOLD/);
  assert.equal(r.data.has(PG15),true);
});
test("audit mismatch followed by fixed state permits fresh audit, not automatic move",()=>{
  const r=fresh();r.spawn(1).run("post");
  const next=r.spawn(2);
  r.destItems[0]=cobble({amount:2});
  assert.match(next.run("audit"),/HOLD_PHYSICAL_MISMATCH/);
  r.destItems[0]=cobble();
  assert.match(next.run("audit"),/RESTART CUT AUDIT PASS: POST/);
  assert.equal(r.moves,1);
});
test("clear fails safely if world write rejects delete",()=>{
  const r=fresh();r.spawn(1).run("post");
  const next=r.spawn(2);
  next.run("audit");
  r.destItems[0]=undefined;
  r.setFault((key,value)=>key===PG15 && value===undefined);
  assert.match(next.run("clear"),/HOLD: uncertain/);
  assert.equal(r.data.has(PG15),true);
});
test("second clear after success is a safe HOLD, not a failed previous cleanup",()=>{
  const r=fresh();r.spawn(1).run("pre");
  const next=r.spawn(2);
  next.run("audit");r.sourceItems[0]=undefined;
  assert.match(next.run("clear"),/CLEAN PASS/);
  assert.match(next.run("clear"),/HOLD/);
});
test("diagnostic has one native move and never writes other addon keys",()=>{
  const overlay=fs.readFileSync(
    path.resolve(__dirname, "../candidates/pg15/interrupted_overlay.js"),"utf8");
  assert.equal((overlay.match(/rig\.source\.moveItem\(0, 0, rig\.dest\)/g)||[]).length,1);
  assert.doesNotMatch(overlay, /new\s+ItemStack\s*\(|setItem\s*\(|addItem\s*\(|clearAll\s*\(/);
  assert.doesNotMatch(overlay, /world\.getAllPlayers\s*\(|world\.clearDynamicProperties\s*\(/);
  const r=fresh(),p=r.spawn(1);p.run("post");r.assertIsolated();
});
