/**
 * URCE U0 — source-only writer surface contract at the 1.5.8 development baseline.
 *
 * Deliberately scans the entire reachable local-module import closure from
 * addon/behavior_pack/scripts/main.js, not a hand-picked function excerpt.
 * A new mutation method call, additional occurrence, or imported gameplay
 * module must trigger deliberate census review.
 *
 * This is a syntactic, direct-sink/change-detection gate. It is NOT proof that
 * every transitive path is safe, a formal JS AST, or BDS runtime evidence.
 * See docs/URCE_U0_ACTIVE_RUNTIME_WRITER_CENSUS_20261120.md.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const SCRIPTS=path.join(ROOT,"addon/behavior_pack/scripts");
const MODULES=[
  "main.js",
  "urce_150_readonly_runtime.js",
  "urce_152_live_link_guard.js",
  "urce_152_link_snapshot_gate.js",
  "urce_152_native_hopper_witness.js",
  "urce_152_transporter_bank_probe.js",
  "urce_152_route_model.js"
].sort();

const MUTATOR_METHODS=[
  "setItem","addItem","moveItem","transferItem","clearAll",
  "setEquipment","setType","setPermutation","setDynamicProperty",
  "spawnItem","spawnEntity","remove","teleport","addTag","removeTag",
  "runCommand","runCommandAsync"
];
const expected={
  "main.js":{
    "<top-level>":{runCommand:1,setType:1},
    showNativeFrameUpgradeNotice:{setDynamicProperty:1},
    setWorldDynamic:{setDynamicProperty:1},
    removeDisplay:{remove:1},
    equipDisplayEntity:{runCommand:1,setEquipment:1},
    syncDisplay:{addTag:1,remove:1,setDynamicProperty:1,spawnEntity:1,teleport:1},
    reconcileDisplays:{remove:1},
    reconcileLoadedDisplay:{remove:1},
    syncSorterModeVisual:{setPermutation:1},
    rebuildQueueItem:{setDynamicProperty:1},
    enqueueFromEjectedEntity:{remove:1},
    enqueueFromSource:{setItem:2},
    dequeueToReceiver:{setItem:2},
    recoverQueueJournal:{remove:1,setItem:4},
    rebuildItem:{setDynamicProperty:1},
    giveOrDrop:{addItem:1,spawnItem:2},
    setFilter:{setItem:2},
    recoverJournal:{setItem:4},
    safeMovePartial:{setItem:4},
    compactSourceHopper:{setItem:2},
    plantEmptyNativeFrame:{setPermutation:1,setType:1},
    eraseOwnedFrame:{setType:1}
  },
  "urce_150_readonly_runtime.js":{
    updateTransporterVisual:{setPermutation:1}
  },
  "urce_152_live_link_guard.js":{},
  "urce_152_link_snapshot_gate.js":{},
  "urce_152_native_hopper_witness.js":{},
  "urce_152_transporter_bank_probe.js":{},
  "urce_152_route_model.js":{}
};
const expectedWorldPropertyHelperCalls={
  saveRegistry:3,
  saveLogistics:1,
  saveQueueJournal:2,
  saveJournal:2,
  persistQueueMeta:1,
  ensureQueueDefinition:1,
  persistQueuePage:2,
  clearQueueEntry:1,
  cleanupLegacyReceiverQueue:1,
  cleanupLegacyQ3Queue:3,
  cleanupUncommittedQ4:1
};

function source(module){return fs.readFileSync(path.join(SCRIPTS,module),"utf8");}
function directLocalImports(src){
  return [...src.matchAll(/\b(?:from\s*|import\s*)["'](\.\/[^"']+\.js)["']/g)]
    .map(m=>m[1].slice(2));
}
function moduleClosure(start){
  const seen=new Set(),pending=[start];
  while(pending.length){
    const name=pending.pop();
    assert.ok(!name.includes("/")&&!name.includes(".."),"unexpected import path: "+name);
    if(seen.has(name))continue;
    seen.add(name);
    pending.push(...directLocalImports(source(name)));
  }
  return [...seen].sort();
}
function scan(module){
  const lines=source(module).split(/\r?\n/);
  const sites={};
  const props={};
  let owner="<top-level>";
  for(const line of lines){
    const declaration=line.match(/^(?:export )?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if(declaration)owner=declaration[1];
    for(const method of MUTATOR_METHODS){
      const hits=[...line.matchAll(new RegExp("\\.\\s*"+method+"\\s*\\(","g"))].length;
      if(hits){
        if(!sites[owner])sites[owner]={};
        sites[owner][method]=(sites[owner][method]||0)+hits;
      }
    }
    if(module==="main.js"&&!/^\s*function\s+setWorldDynamic\s*\(/.test(line)){
      const hits=[...line.matchAll(/\bsetWorldDynamic\s*\(/g)].length;
      if(hits)props[owner]=(props[owner]||0)+hits;
    }
    if(owner!=="<top-level>"&&/^}\s*(?:\/\/.*)?$/.test(line))owner="<top-level>";
  }
  return {sites,props};
}

test("all local runtime modules are covered, including transitive imports",()=>{
  assert.deepEqual(moduleClosure("main.js"),MODULES);
});
test("direct native/world mutation API sinks remain an explicitly reviewed surface",()=>{
  for(const module of MODULES){
    assert.deepEqual(scan(module).sites,expected[module],"direct writes changed: "+module);
  }
});
test("persistent world-property helper calls remain reviewed",()=>{
  assert.deepEqual(scan("main.js").props,expectedWorldPropertyHelperCalls);
});
test("the scheduled and event-driven custody roots remain present for transitive review",()=>{
  const main=source("main.js");
  for(const name of ["schedulerTick","logisticsTick","recoverJournal",
    "recoverQueueJournal","flushLogistics","reconcileDisplays","reconcileModeVisuals"]){
    assert.match(main,new RegExp("system\\.runInterval\\("+name+",\\s*\\d+\\)"),
      "scheduler root changed: "+name);
  }
  for(const symbol of ["processColumn","processCollectorIngress","processReceiverDrain",
    "processEjectedItemEntity","enqueueFromSource","enqueueFromEjectedEntity",
    "dequeueToReceiver","safeMovePartial","compactSourceHopper","loadReceiverQueue",
    "registerCollector","registerReceiver","setFilter","giveOrDrop"]){
    assert.match(main,new RegExp("\\bfunction\\s+"+symbol+"\\s*\\("),
      "reviewed authority function changed: "+symbol);
  }
});
