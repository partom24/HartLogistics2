import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {inspectQ4OrdinaryDefinitionShape} from
  '../candidates/transport/q5_ordinary_shape_gate.mjs';

const src=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const from=src.indexOf('function uceClassifyLiveStack(');
const to=src.indexOf('\nfunction uceReceiverHasNewMRInput(',from);
assert.ok(from>=0&&to>from,'exact integrated ordinary/MR classifier found');
const actual=src.slice(from,to);
class PlainItem {
  constructor(typeId,amount){
    this.typeId=typeId;this.amount=amount;this.maxAmount=64;
    this.nameTag='';
  }
  getDynamicPropertyIds(){return [];}
  getLore(){return [];}
  isStackableWith(other){return this.typeId===other?.typeId&&
    !this.nameTag&&!other?.nameTag;}
}
function fixture(){
  const ctx={ItemStack:PlainItem,inspectQ4OrdinaryDefinitionShape};
  vm.runInNewContext(actual,ctx);
  return x=>ctx.uceClassifyLiveStack(x);
}
test('canonical ordinary vanilla stack takes existing count-account route',()=>{
  const classify=fixture();
  assert.equal(classify(new PlainItem('minecraft:cobblestone',16)),
    'ORDINARY');
});
test('stackable unsupported custom namespace uses native MR rather than invalid virtual key',()=>{
  const classify=fixture();
  assert.equal(classify(new PlainItem('hartbots:custom_ingot',16)),
    'MR');
  assert.equal(classify(new PlainItem('minecraft:enchanted_book',1)),
    'MR');
});
test('named, lore, and unreadable native item remain MR or unknown, never virtual ordinary',()=>{
  const classify=fixture();
  const named=new PlainItem('minecraft:stone',32);
  named.nameTag='Eternal Stone';
  assert.equal(classify(named),'MR');
  const lore=new PlainItem('minecraft:stone',2);
  lore.getLore=()=>['tagged'];
  assert.equal(classify(lore),'MR');
  const broken=new PlainItem('minecraft:stone',1);
  broken.getLore=()=>{throw Error('metadata unavailable');};
  assert.equal(classify(broken),'UNKNOWN');
});
