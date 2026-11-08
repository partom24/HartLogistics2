/** Actual connection callback -> visible model bounds in Bedrock world axes.
 * Bedrock block model X is reflected; Y and Z retain their signs. This crosses
 * the script/resource boundary missed by PG26's separate state/model tests.
 * Offline coordinate checks only; the owner still verifies actual BDS rendering.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const compiled = read("../build/pg27-lab/behavior_pack/scripts/main.js");
const overlay = read("../candidates/pg26/transporter_input.js");
assert.ok(compiled.endsWith(overlay.trimEnd() + "\n"));
const block = JSON.parse(read("../build/pg27-lab/behavior_pack/blocks/transporter.json"))["minecraft:block"];
const models = JSON.parse(read("../build/pg27-lab/resource_pack/models/blocks/transporter.geo.json"))["minecraft:geometry"];
const oldModels = JSON.parse(read("../build/pg26-lab/resource_pack/models/blocks/transporter.geo.json"))["minecraft:geometry"];
const directions = [
  ["east", [1, 0, 0]], ["west", [-1, 0, 0]],
  ["up", [0, 1, 0]], ["down", [0, -1, 0]],
  ["south", [0, 0, 1]], ["north", [0, 0, -1]]
];
const id = "hartlogistics:transporter";
let callbacks;
vm.runInNewContext(overlay, {
  SORTER_ID: compiled.match(/const SORTER_ID = ("[^"]+");/)[1].slice(1, -1),
  system: {beforeEvents: {startup: {subscribe(fn) {
    fn({blockComponentRegistry: {registerCustomComponent(name, component) {
      assert.equal(name, "hartlogistics:transporter_connections"); callbacks = component;
    }}});
  }}}}
});

const key = p => [p.x, p.y, p.z].join(",");
class Permutation {
  constructor(states) { this.states = states; }
  getState(name) { return this.states[name]; }
  withState(name, value) { return new Permutation({...this.states, [name]: value}); }
}
function fixture(position, mask) {
  const neighbors = new Set(directions.flatMap(([, delta], i) => mask & (1 << i)
    ? [key({x: position.x + delta[0], y: position.y + delta[1], z: position.z + delta[2]})] : []));
  return {typeId: id, location: position,
    permutation: new Permutation(Object.fromEntries(directions.map(([face], i) =>
      ["hartlogistics:connect_" + face, !(mask & (1 << i))]))),
    dimension: {getBlock: p => ({typeId: neighbors.has(key(p)) ? id : "minecraft:air"})},
    setPermutation(p) { this.permutation = p; }
  };
}
function worldBounds(cube, position) {
  const scale = [-1, 1, 1];
  const center = [position.x + 0.5, position.y, position.z + 0.5];
  return cube.origin.map((value, axis) => [value, value + cube.size[axis]]
    .map(v => center[axis] + scale[axis] * v / 16).sort((a, b) => a - b));
}
function visibleBounds(model, pipe) {
  const visible = block.components["minecraft:geometry"].bone_visibility;
  return model.bones.filter(bone => {
    if (!(bone.name in visible)) return true;
    const state = visible[bone.name].match(/^q\.block_state\('([^']+)'\)$/);
    assert.ok(state, "supported visibility expression");
    return pipe.permutation.getState(state[1]);
  }).map(bone => ({name: bone.name, bounds: worldBounds(bone.cubes[0], pipe.location)}));
}
function physicalDirections(parts, position) {
  return parts.filter(p => p.name !== "core").map(({bounds}) => {
    const center = [position.x + 0.5, position.y + 0.5, position.z + 0.5];
    const offsets = bounds.map(([a, b], axis) => (a + b) / 2 - center[axis]);
    const axis = offsets.findIndex(v => Math.abs(v) > 0.001);
    return directions.find(([, delta]) => delta[axis] === Math.sign(offsets[axis]))[0];
  }).sort();
}

test("all 64 real callback states render toward their actual neighbors on both sides of zero", () => {
  for (const position of [{x: 0, y: 70, z: 0}, {x: -954, y: 71, z: -810}, {x: 31, y: -30, z: -1}]) {
    for (let mask = 0; mask < 64; mask++) {
      const pipe = fixture(position, mask);
      callbacks.onTick({block: pipe});
      const expected = directions.filter((_, i) => mask & (1 << i)).map(([name]) => name).sort();
      const parts = visibleBounds(models[0], pipe);
      assert.deepEqual(physicalDirections(parts, position), expected, `mask ${mask} at ${key(position)}`);
      for (const {name, bounds} of parts.filter(p => p.name !== "core")) {
        const delta = directions.find(([face]) => face === name)[1];
        const axis = delta.findIndex(v => v !== 0);
        // Each enabled arm must touch the requested block face, not its opposite.
        assert.equal(bounds[axis][delta[axis] > 0 ? 1 : 0],
          [position.x, position.y, position.z][axis] + (delta[axis] > 0 ? 1 : 0));
      }
    }
  }
});

test("PG26 east-only end cap reproduces the reported wrong-side arm; PG27 closes the seam", () => {
  const a = fixture({x: -954, y: 71, z: -810}, 1);
  const b = fixture({x: -953, y: 71, z: -810}, 2);
  callbacks.onPlace({block: a}); callbacks.onPlace({block: b});
  assert.deepEqual(physicalDirections(visibleBounds(oldModels[0], a), a.location), ["west"]);
  assert.deepEqual(physicalDirections(visibleBounds(models[0], a), a.location), ["east"]);
  const arm = (pipe, name) => visibleBounds(models[0], pipe).find(p => p.name === name).bounds;
  const east = arm(a, "east"), west = arm(b, "west");
  assert.equal(east[0][1], west[0][0]);
  assert.deepEqual(east.slice(1), west.slice(1));
});

test("removing and replacing either X neighbor clears and restores only that visible arm", () => {
  const position = {x: -954, y: 71, z: -810};
  const pipe = fixture(position, 63);
  callbacks.onTick({block: pipe});
  for (const bit of [1, 2]) {
    pipe.dimension = fixture(position, 63 ^ bit).dimension;
    callbacks.onTick({block: pipe});
    assert.deepEqual(physicalDirections(visibleBounds(models[0], pipe), position),
      directions.filter((_, i) => (63 ^ bit) & (1 << i)).map(([face]) => face).sort());
    pipe.dimension = fixture(position, 63).dimension;
    callbacks.onTick({block: pipe});
    assert.equal(physicalDirections(visibleBounds(models[0], pipe), position).length, 6);
  }
});
