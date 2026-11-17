/**
 * Read only official npm @minecraft/server@2.7.0 declaration package in CI.
 * Native entityLoad is used to avoid the recurring global proxy census.
 * This type test proves availability/signatures, not event delivery on BDS.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const typePath=process.env.MINECRAFT_SERVER_TYPES_270;
const packagePath=process.env.MINECRAFT_SERVER_PACKAGE_270;
assert.ok(typePath&&packagePath,"Pinned 2.7.0 package paths required");
const pkg=JSON.parse(fs.readFileSync(packagePath,"utf8"));
const source=fs.readFileSync(typePath,"utf8");
assert.equal(pkg.name,"@minecraft/server");
assert.equal(pkg.version,"2.7.0");
function body(name){
  const pattern=new RegExp("\\b(?:declare\\s+)?(?:class|interface)\\s+"+name+"\\b[^\\{]*\\{");
  const m=pattern.exec(source);
  assert.ok(m,"Missing 2.7.0 declaration: "+name);
  const start=m.index+m[0].length;
  let depth=1;
  for(let i=start;i<source.length;i++){
    if(source[i]==="{")depth++;
    else if(source[i]==="}"&&--depth===0)return source.slice(start,i);
  }
  assert.fail("Unterminated 2.7 declaration "+name);
}
test("API270-DISPLAY-01 native entityLoad event exists on WorldAfterEvents",()=>{
  assert.match(body("WorldAfterEvents"),/entityLoad\s*:\s*EntityLoadAfterEventSignal\s*;/);
});
test("API270-DISPLAY-02 loaded entity is accessible in the callback",()=>{
  assert.match(body("EntityLoadAfterEvent"),/entity\s*:\s*Entity\s*;/);
});

test("API270-P4 native occupancy/count shortcut methods are present",()=>{
  const c=body("Container");
  assert.match(c,/emptySlotsCount\s*:\s*number\s*;/);
  assert.match(c,/firstItem\s*\(\s*\)\s*:\s*number\s*\|\s*undefined\s*;/);
  assert.match(c,/firstEmptySlot\s*\(\s*\)\s*:\s*number\s*\|\s*undefined\s*;/);
});
test("API270-P3 native live ContainerSlot admission signatures are present",()=>{
  const c=body("Container"),slot=body("ContainerSlot");
  assert.match(c,/getSlot\s*\(\s*slot:\s*number\s*\)\s*:\s*ContainerSlot\s*;/);
  assert.match(slot,/hasItem\s*\(\s*\)\s*:\s*boolean\s*;/);
  assert.match(slot,/typeId\s*:\s*string\s*;/);
  assert.match(slot,/amount\s*:\s*number\s*;/);
  assert.match(slot,/maxAmount\s*:\s*number\s*;/);
  assert.match(slot,/isStackableWith\s*\(\s*itemStack:\s*ItemStack\s*\)\s*:\s*boolean\s*;/);
  assert.match(slot,/getItem\s*\(\s*\)\s*:\s*ItemStack\s*\|\s*undefined\s*;/);
});
