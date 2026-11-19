import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {resolve,dirname,basename} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const register=JSON.parse(readFileSync(resolve(root,
  "planning/URCE_150_U0_DIRECT_WRITER_FENCE.json"),"utf8"));
const categories=new Set([
  "q4_custody_or_recovery","physical_journal_custody",
  "native_hopper_compaction","player_filter_equipment",
  "player_item_return","itemstack_reconstruction",
  "property_persistence","visual_or_block_lifecycle","visual_preview"
]);

function scan(file) {
  const lines=readFileSync(resolve(root,file),"utf8").split("\n");
  const sites=new Map();
  let scope="module",eventIndex=0;
  for(const line of lines){
    const normalized=line.trim().replace(/\s+/g," ");
    const named=line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if(named)scope=named[1];
    else if(/^\s*world\.(?:beforeEvents|afterEvents)\.\w+\.subscribe\(/.test(line))
      scope="event_"+(++eventIndex);
    const re=new RegExp("\\.\\s*("+register.guardedMethods.join("|")+")\\s*\\(","g");
    for(const found of line.matchAll(re)){
      const key=scope+"::"+found[1]+"::"+normalized;
      if(sites.has(key))sites.get(key).count++;
      else sites.set(key,{scope,method:found[1],signature:normalized,count:1});
    }
  }
  return [...sites.values()].sort((a,b)=>
    a.scope.localeCompare(b.scope)||a.method.localeCompare(b.method)||
    a.signature.localeCompare(b.signature));
}

test("U0-01 all active runtime scripts have a writer-census entry",()=>{
  const dir=resolve(root,"addon/behavior_pack/scripts");
  const actual=readdirSync(dir).filter(x=>x.endsWith(".js")).sort();
  const expected=Object.keys(register.scripts).map(x=>basename(x)).sort();
  assert.deepEqual(actual,expected,
    "A new runtime script needs explicit writer/recovery review before release");
});

test("U0-02 new/direct native mutations cannot silently bypass the census",()=>{
  assert.equal(register.schema,2);
  assert.equal(register.scope,"direct_callsite_lexical_fence_only");
  for(const [path,entries] of Object.entries(register.scripts)){
    assert.ok(entries.length>0);
    assert.ok(entries.every(e=>categories.has(e.category)&&e.count>0));
    const approved=entries.map(({scope,method,signature,count})=>({
      scope,method,signature,count
    }));
    assert.deepEqual(scan(path),approved,
      "Review every new or changed direct inventory/world mutation first");
  }
});

test("U0-03 protect physical/Q4/compaction writer baseline",()=>{
  const entries=register.scripts["addon/behavior_pack/scripts/main.js"];
  const count=c=>entries.filter(x=>x.category===c)
    .reduce((n,x)=>n+x.count,0);
  assert.equal(count("q4_custody_or_recovery"),10);
  assert.equal(count("physical_journal_custody"),8);
  assert.equal(count("native_hopper_compaction"),2);
  assert.equal(count("player_filter_equipment"),2);
  assert.equal(entries.filter(e=>e.method==="setItem")
    .reduce((n,x)=>n+x.count,0),20);
});

test("U0-04 keep world-state and link-writer seams visible",()=>{
  const entries=register.scripts["addon/behavior_pack/scripts/main.js"];
  assert.ok(entries.some(e=>e.method==="setDynamicProperty"&&
    e.signature==="world.setDynamicProperty(key, value);"));
  const original=readFileSync(resolve(root,
    "addon/behavior_pack/scripts/main.js"),"utf8");
  for(const name of ["setWorldDynamic","recoverJournal",
    "recoverQueueJournal","useReceiver","safeMovePartial","enqueueFromSource"]){
    assert.ok(original.includes("function "+name+"("),
      "Source control boundary removed/renamed: "+name);
  }
  // Current 1.5.1 link UI is still unguarded; this canary is not a fix.
  assert.ok(original.includes("col.link = receiver.id;"));
});
