/**
 * Level 2: ACTUAL @minecraft/server@2.7.0 TYPE DECLARATION REVIEW.
 *
 * This test is static. The official npm package is fetched in a separate
 * GitHub Actions job into RUNNER_TEMP; it is not imported or executed.
 * It checks exact signatures and checks for documented event interfaces.
 * Nothing here connects to BDS or loads gameplay.
 *
 * Environment: MINECRAFT_SERVER_TYPES_270=<path to package/index.d.ts>
 *              MINECRAFT_SERVER_PACKAGE_270=<path to package/package.json>
 *
 * NO bundled 1.5 sources, alternate candidate code, or generated runtime
 * are inputs. This is an independent public API contract check.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const typePath = process.env.MINECRAFT_SERVER_TYPES_270;
const packagePath = process.env.MINECRAFT_SERVER_PACKAGE_270;
assert.ok(typePath && packagePath, "Exact 2.7.0 npm declaration paths are required; never fall back to newer stable docs.");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const types = fs.readFileSync(typePath, "utf8");
assert.equal(pkg.name, "@minecraft/server");
assert.equal(pkg.version, "2.7.0");

function classBody(name) {
  const re = new RegExp("\\b(?:declare\\s+)?(?:class|interface)\\s+" + name + "\\b[^\\{]*\\{", "m");
  const m = re.exec(types);
  assert.ok(m, "2.7.0 TypeScript declaration for " + name + " is missing");
  const begin = m.index + m[0].length;
  // Read only declaration text; signatures in declarations are intentionally
  // parsed as text, not executed in an engine or evaluated for speed.
  let depth=1;
  for(let i=begin; i<types.length; i++) {
    const ch=types[i];
    if(ch==="{") depth++;
    if(ch==="}" && --depth===0) return types.slice(begin,i);
  }
  assert.fail("Unterminated TypeScript class declaration for "+name);
}
function hasSignature(body, regex) { assert.match(body, regex); }
function absentSignature(body, regex) { assert.doesNotMatch(body, regex); }
const report = [];
function record(area, outcome, detail) { report.push({ area, outcome, detail }); }

test("API270-01: Container transferItem exists with slot+container only and remainder return", () => {
  const c=classBody("Container");
  hasSignature(c, /transferItem\s*\(\s*fromSlot:\s*number,\s*toContainer:\s*Container\s*\)\s*:\s*ItemStack\s*\|\s*undefined/);
  absentSignature(c, /transferItem\s*\([^)]*(?:count|amount|limit|quantity)\s*:/);
  record("M11/M27", "API_AVAILABLE_NOT_SEMANTICALLY_EQUIVALENT", "Whole source slot; destination selection/remainder, no amount parameter");
});

test("API270-02: Container moveItem has fixed destination, no amount, no return", () => {
  const c=classBody("Container");
  hasSignature(c, /moveItem\s*\(\s*fromSlot:\s*number,\s*toSlot:\s*number,\s*toContainer:\s*Container\s*\)\s*:\s*void/);
  absentSignature(c, /moveItem\s*\([^)]*(?:count|amount|limit|quantity)\s*:/);
  record("M04/M11", "API_AVAILABLE_PARTIAL_GAP", "No native amount-bounded signature; cannot directly replace budgeted 1–16 items from stack");
});

test("API270-03: Container addItem is destination-only and returns remainder", () => {
  const c=classBody("Container");
  hasSignature(c, /addItem\s*\(\s*itemStack:\s*ItemStack\s*\)\s*:\s*ItemStack\s*\|\s*undefined/);
  record("M10/M20", "API_AVAILABLE_NOT_CROSS_CUSTODY", "No source debit or queue commit in method signature");
});

test("API270-04: Container native slot-selection/query helpers have exact return types", () => {
  const c=classBody("Container");
  hasSignature(c, /firstItem\s*\(\s*\)\s*:\s*number\s*\|\s*undefined/);
  hasSignature(c, /firstEmptySlot\s*\(\s*\)\s*:\s*number\s*\|\s*undefined/);
  hasSignature(c, /contains\s*\(\s*itemStack:\s*ItemStack\s*\)\s*:\s*boolean/);
  hasSignature(c, /find\s*\(\s*itemStack:\s*ItemStack\s*\)\s*:\s*number\s*\|\s*undefined/);
  hasSignature(c, /findLast\s*\(\s*itemStack:\s*ItemStack\s*\)\s*:\s*number\s*\|\s*undefined/);
  record("M03/M07/M10", "API_AVAILABLE_NOT_POLICY_EQUIVALENT", "firstEmptySlot returns slot index only; find/contains take ItemStack and specify no Hart AUTO filter semantics");
});

test("API270-05: Container slot and validity APIs exist", () => {
  const c=classBody("Container");
  hasSignature(c, /getItem\s*\(\s*slot:\s*number\s*\)\s*:\s*ItemStack\s*\|\s*undefined/);
  hasSignature(c, /getSlot\s*\(\s*slot:\s*number\s*\)\s*:\s*ContainerSlot/);
  assert.match(c, /emptySlotsCount\s*:\s*number/);
  assert.match(c, /size\s*:\s*number/);
  record("M03/M10", "API_AVAILABLE_COST_UNKNOWN", "Slot and empty slot count are documented, not measured hotpath cost");
});

test("API270-06: ItemStack.clone and stackability are typed but not persistent", () => {
  const item=classBody("ItemStack");
  hasSignature(item, /clone\s*\(\s*\)\s*:\s*ItemStack/);
  hasSignature(item, /isStackableWith\s*\(\s*itemStack:\s*ItemStack\s*\)\s*:\s*boolean/);
  record("M25/M40", "API_AVAILABLE_PERSISTENCE_UNKNOWN", "In-memory clone / stack compatibility; no durable queue identity or source debit guarantee");
});

test("API270-07: World dynamic properties have primitives/batch writes, not ItemStack storage", () => {
  const w=classBody("World");
  hasSignature(w, /setDynamicProperty\s*\(\s*identifier:\s*string\s*,/);
  hasSignature(w, /setDynamicProperties\s*\(\s*values:/);
  hasSignature(w, /getDynamicProperty\s*\(\s*identifier:\s*string\s*\)/);
  assert.match(w, /getDynamicPropertyTotalByteCount\s*\(\s*\)\s*:\s*number/);
  const propertyReturn = /getDynamicProperty\s*\([^)]*\)\s*:\s*([^;]+);/s.exec(w);
  assert.ok(propertyReturn, "Missing 2.7.0 World.getDynamicProperty return contract");
  for (const permitted of ["string", "number", "boolean", "Vector3", "undefined"])
    assert.ok(propertyReturn[1].includes(permitted), "Missing dynamic property value kind: " + permitted);
  assert.equal(/ItemStack|Container/.test(propertyReturn[1]), false,
    "World dynamic-property return union unexpectedly includes native cargo");
  record("M21-M24", "API_AVAILABLE_NOT_DATABASE", "Primitive/vector property values, no native ItemStack in durable property type");
});

test("API270-08: WorldAfterEvents has no generic hopper/container cargo event", () => {
  const events=classBody("WorldAfterEvents");
  const named=[...events.matchAll(/(?:readonly\s+)?(\w+)\s*:\s*\w+/g)].map(m=>m[1]);
  assert.ok(named.length>=8, "WorldAfterEvents extraction must list enough known event members");
  const matching=named.filter(x => /(?:hopper|container).*(?:item|inventory|content|change)|(?:item|inventory|content).*(?:hopper|container)/i.test(x));
  assert.deepEqual(matching, [], "New potentially relevant event found — revisit native architecture, do not bury it");
  record("M01/M19", "NO_GENERAL_HOPPER_CHANGE_EVENT_DECLARED", "Exact 2.7.0 WorldAfterEvents has no named generic Hopper/container-content-change event; negative declaration finding only");
});

test("API270-09: BlockCustomComponent tick/redstone callbacks are different interfaces", () => {
  const component=classBody("BlockCustomComponent");
  assert.match(component, /onTick\s*\?/);
  assert.match(component, /onRedstoneUpdate\s*\?/);
  record("M01/M17", "API_PRESENT_NOT_CARGO_TRIGGER", "Callback for custom block ticks / redstone only, not vanilla Hopper inventory contents");
});

test("API270-10: System runJob is a scheduled generator and has no Hopper signal", () => {
  const system=classBody("System");
  hasSignature(system, /runJob\s*\(\s*generator:\s*Generator/);
  hasSignature(system, /runInterval\s*\(/);
  record("M01/M35", "SCHEDULER_EXISTS_NOT_ARRIVAL_EVENT", "Native scheduler cannot replace inventory state observation");
});

test("API270-11: Entity.addItem is actually introduced in this declared version", () => {
  const e=classBody("Entity");
  hasSignature(e, /addItem\s*\(\s*itemStack:\s*ItemStack\s*\)\s*:\s*ItemStack\s*\|\s*undefined/);
  record("M25/M30", "API_AVAILABLE_CUSTODY_UNKNOWN", "Entity addItem gives native entity inventory operation, not secure persistent queue transaction");
});
