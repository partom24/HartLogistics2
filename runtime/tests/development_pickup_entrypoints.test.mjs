/**
 * Guard project pickup continuity on the active development branch.
 * Prevent stage-first or build-first handoffs from quietly obscuring the
 * owner product contract, historical ledgers and playable-delivery mandate.
 *
 * node --test runtime/tests/development_pickup_entrypoints.test.mjs
 * No Bedrock imports or gameplay mutation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const text=relative=>fs.readFileSync(path.join(ROOT,relative),"utf8");

test("root and state entrypoints lead with the active project-wide read order",()=>{
  const start=text("DEVELOPMENT_START_HERE.md");
  for(const required of [
    "AGENTS.md","PROJECT_CONTINUITY.md",
    "docs/CANONICAL_EVIDENCE_AND_TOOLING.md",
    "docs/PROJECT_STATIC_RESOURCES.json",
    "docs/URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md",
    "docs/URCE_101_COLUMN_FIVE_ITEM_STAGE_BASELINE_20261120.md"
  ]) {
    assert.ok(start.includes(required),"startup index omits "+required);
    assert.ok(fs.existsSync(path.join(ROOT,required)),
      "linked in-repo document missing "+required);
  }
  const agents=text("AGENTS.md");
  assert.ok(agents.slice(0,1800).includes("ACTIVE CONTINUOUS-DEVELOPMENT DIRECTIVE"));
  assert.ok(agents.includes("a completed stage") || agents.includes("completed stage"));
  assert.ok(agents.includes("lossless") || agents.includes("Q4"));
  const readme=text("README.md");
  assert.ok(readme.slice(0,1000).includes("DEVELOPMENT_START_HERE.md"));
  const current=text("docs/CURRENT_DEVELOPMENT_STATE.md");
  assert.ok(current.slice(0,1000).includes("../DEVELOPMENT_START_HERE.md"));
});

test("source-first discovery uses the same canonical entrypoint without executing it",()=>{
  const source=text("addon/behavior_pack/scripts/main.js");
  const head=source.slice(0,1100);
  assert.match(head,/DEVELOPMENT_START_HERE\.md/);
  assert.match(head,/github\.com\/partom24\/HartLogistics2/);
  assert.ok(head.indexOf("DEVELOPMENT_START_HERE.md")<
    source.indexOf('from "@minecraft/server"'),
    "source-first note must precede Bedrock runtime imports");
});

test("canonical historical continuity files remain present",()=>{
  for(const p of [
    "PROJECT_CONTINUITY.md",
    "docs/CANONICAL_EVIDENCE_AND_TOOLING.md",
    "docs/PROJECT_STATIC_RESOURCES.json"
  ]) assert.ok(fs.statSync(path.join(ROOT,p)).size>0,p);
});
