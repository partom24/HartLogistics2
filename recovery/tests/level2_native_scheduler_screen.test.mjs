/**
 * Level 2 SOURCE-ONLY elimination tests for proposed "native scheduler"
 * alternatives. Executes original owner 1.4.1 functions; does NOT run BDS.
 *
 * Scope: disprove equivalence of a naive native-only/event-only substitute
 * without implementing a new scheduler or assuming undocumented native events.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const JS = readFileSync(path.join(ROOT, "addon/behavior_pack/scripts/main.js"), "utf8");
const SORTER = JSON.parse(readFileSync(path.join(ROOT, "addon/behavior_pack/blocks/sorter.json"), "utf8"));
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, "addon/behavior_pack/manifest.json"), "utf8");
const LEVEL1 = readFileSync(path.join(ROOT, "LEVEL1_NATIVE_API_RESEARCH_141.md"), "utf8");
const MODES = ["filter", "auto", "wildcard", "bypass"];
function original(name, context = {}) {
  const start = JS.indexOf("function " + name + "(");
  assert.ok(start >= 0, "Baseline function absent: " + name);
  const candidates = ["function ", "system.runInterval(", "world.afterEvents."];
  const bodyStart = JS.indexOf("{", start);
  let nesting = 0, quote = "", escaped = false, single = false, multi = false;
  for (let i = bodyStart; i < JS.length; i++) {
    const c = JS[i], n = JS[i + 1];
    if (single) { if (c === "\n") single = false; continue; }
    if (multi) { if (c === "*" && n === "/") { multi = false; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { single = true; i++; continue; }
    if (c === "/" && n === "*") { multi = true; i++; continue; }
    if (c === "'" || c === '"' || c === "\x60") { quote = c; continue; }
    if (c === "{") nesting++;
    if (c === "}" && --nesting === 0)
      return vm.runInNewContext(JS.slice(start, i + 1) + "\n" + name, context,
        { filename: "pinned-1.4.1:" + name, timeout: 2500 });
  }
  assert.fail("Unbalanced source function " + name);
}
function plain(data) { return JSON.parse(JSON.stringify(data)); }
function routeCase({
  modes = [{id:"wild", m:"wildcard"}, {id:"auto",m:"auto"}, {id:"filter",m:"filter",f:{typeId:"minecraft:stone"}}],
  typeId = "minecraft:stone", autoSeeded = true, powered = false, locked = false
} = {}) {
  const observed = [];
  let inHopper = { typeId, amount: 1, maxAmount: 64 };
  const container = {
    isValid: true, size: 5,
    getItem(i) { return i === 0 ? inHopper : undefined; }
  };
  const hopper = { typeId:"minecraft:hopper", getComponent(key) {
    assert.equal(key, "minecraft:inventory"); return { container };
  }};
  const context = {
    PER_COLUMN_BATCH:16,
    getDimension: () => ({getBlock:()=> hopper}),
    hopperIsRedstoneLocked: () => locked,
    sorterAt: () => ({}),
    blockIsRedstonePowered: () => powered,
    sorterMode: original("sorterMode", { SORTER_MODES: MODES }),
    matchesFilter: (stack, filter) => stack.typeId === filter.typeId,
    autoSorterMatches: () => autoSeeded,
    compactSourceHopper: () => {}, // isolate *routing*, not compaction
    destinationFor: e => ({kind:"storage",id:e.id,block:{},container:{}}),
    findAcceptSlot:()=>({slot:0,room:64,before:0}),
    safeMovePartial:(_src,_source,_slot,_dst,destBlock,slot,want) => {
      observed.push({move:want,from:typeId,slot});
      inHopper = undefined;
      return want;
    },
    log: () => {}
  };
  // A destination marker is separate from stock Minecraft; the actual
  // processColumn() decides WHICH Hart mode to send the item to.
  context.destinationFor = e => ({kind:"storage",block:{id:e.id},container:{}});
  context.safeMovePartial = (_src,_source,_slot,_dst,destBlock,_slotInfo,want) => {
    observed.push({id:destBlock.id,typeId,amount:want});
    inHopper=undefined;
    return want;
  };
  const fn=original("processColumn",context);
  const consumed=fn({d:"overworld",source:{x:0,y:65,z:0},sorters:modes},256);
  return {consumed, observed, remaining:inHopper};
}
function comparatorStrength(slots, slotCount=5) {
  // The documented vanilla comparator output is a *fullness* projection,
  // not an observation of item identity or all inventory mutations.
  const sum=slots.reduce((a,s)=>a + (s ? s.amount/s.maxAmount : 0),0);
  return sum===0 ? 0 : Math.floor(1+(sum/slotCount)*14);
}
test("L2-native-01: Sorter BP has native redstone callback but no native inventory or tick component",()=>{
  assert.deepEqual(MANIFEST.header.version,[1,4,1]);
  assert.equal(MANIFEST.dependencies.find(x=>x.module_name==="@minecraft/server").version,"2.7.0");
  const c=SORTER["minecraft:block"].components;
  assert.ok(c["minecraft:redstone_consumer"]);
  assert.ok(c["hartlogistics:redstone_input"]);
  assert.equal(c["minecraft:inventory"],undefined);
  assert.equal(c["minecraft:tick"],undefined);
});
test("L2-native-02: original four-mode routing is NOT ordinary Hopper-only selection",()=>{
  const out=routeCase();
  assert.equal(out.consumed,1);
  assert.deepEqual(out.observed,[{id:"filter",typeId:"minecraft:stone",amount:1}]);
});
test("L2-native-03: AUTO must win over wildcard when Filter does not match",()=>{
  const out=routeCase({
    typeId:"minecraft:dirt",
    modes:[{id:"wild",m:"wildcard"},{id:"filter",m:"filter",f:{typeId:"minecraft:stone"}},{id:"auto",m:"auto"}]
  });
  assert.equal(out.consumed,1);
  assert.deepEqual(out.observed,[{id:"auto",typeId:"minecraft:dirt",amount:1}]);
});
test("L2-native-04: wildcard is fallback, not default over unseeded AUTO",()=>{
  const out=routeCase({typeId:"minecraft:dirt",autoSeeded:false});
  assert.equal(out.consumed,1);
  assert.deepEqual(out.observed,[{id:"wild",typeId:"minecraft:dirt",amount:1}]);
});
test("L2-native-05: bypass mode yields no scripted transfer; native Hopper remains eligible",()=>{
  const out=routeCase({modes:[{id:"b",m:"bypass"}]});
  assert.equal(out.consumed,0);
  assert.deepEqual(out.observed,[]);
  assert.equal(out.remaining.typeId,"minecraft:stone");
});
test("L2-native-06: disabled source Hopper yields no scripted transfer",()=>{
  const out=routeCase({locked:true});
  assert.equal(out.consumed,0);
  assert.deepEqual(out.observed,[]);
});
test("L2-native-07: powered Sorter yields no scripted transfer",()=>{
  const out=routeCase({powered:true});
  assert.equal(out.consumed,0);
  assert.deepEqual(out.observed,[]);
});
test("L2-native-08: sorted physical columns put lowest y first",()=>{
  const sandbox={registry:[{d:"overworld",x:1,z:1,y:68},{d:"overworld",x:1,z:1,y:66},{d:"overworld",x:1,z:1,y:67}],
    columns:[],dirty:true,rrStart:0};
  original("rebuildTopology",sandbox)();
  assert.deepEqual(sandbox.columns.map(c=>c.sorters.map(s=>s.y)),[[66,67,68]]);
  assert.equal(sandbox.dirty,false);
});
test("L2-native-09: comparator fullness signal cannot distinguish different cargo identities",()=>{
  const a=[{typeId:"minecraft:stone",amount:1,maxAmount:64}];
  const b=[{typeId:"minecraft:dirt",amount:1,maxAmount:64}];
  assert.equal(comparatorStrength(a),comparatorStrength(b));
  assert.equal(comparatorStrength(a),1);
  assert.equal(routeCase({typeId:a[0].typeId}).observed[0].id,"filter");
  assert.equal(routeCase({typeId:b[0].typeId}).observed[0].id,"auto");
  // This proves a lossy signal cannot encode the distinct Hart selections.
  // It DOES NOT claim Minecraft fires/doesn't fire any particular event.
});
test("L2-native-10: a comparator output can stay unchanged as Hopper quantity changes",()=>{
  const s=amount=>[{typeId:"minecraft:stone",amount,maxAmount:64}];
  assert.equal(comparatorStrength(s(20)),comparatorStrength(s(21)));
  assert.equal(comparatorStrength(s(20)),1);
});
test("L2-native-11: configuration events do not observe ongoing vanilla item arrivals",()=>{
  assert.ok(LEVEL1.includes("onTick"));
  assert.ok(LEVEL1.includes("playerInventoryItemChange"));
  assert.ok(LEVEL1.includes("Hopper"));
  // No proposed universal vanilla-Hopper inventory item change event is
  // present in the source as a subscribed listener; checking names here
  // cannot prove absolute API nonexistence (official docs/typings required).
  assert.doesNotMatch(JS,/world\.afterEvents\.hopperInventoryItemChange/);
});
