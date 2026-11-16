/** Source-executed active-sorter scan fidelity tests. Synthetic only, not BDS timings. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SCRIPT=fs.readFileSync(path.join(ROOT,'addon/behavior_pack/scripts/main.js'),'utf8');
function fn(name,env={}) {
  const start=SCRIPT.indexOf('function '+name+'(');
  assert.ok(start>=0);
  const begin=SCRIPT.indexOf('{',start);
  let depth=0,line=false,block=false,quote='',escape=false;
  for(let i=begin;i<SCRIPT.length;i++) {
    const c=SCRIPT[i],n=SCRIPT[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='\''||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
    if(c==='{')depth++;
    if(c==='}'&&--depth===0)return vm.runInNewContext(SCRIPT.slice(start,i+1)+'\n'+name+';',env,{timeout:2000});
  }
  throw Error('Unbalanced function '+name);
}
const item=(id,n=1,max=64,meta='')=>({typeId:id,amount:n,maxAmount:max,meta,isStackableWith(o){return this.typeId===o.typeId&&this.meta===o.meta&&this.maxAmount>1;}});
function inv(slots){const calls={size:0,reads:0,empty:0,compare:0,slotReads:0};return{calls,slots,container:{isValid:true,get size(){calls.size++;return slots.length;},getItem(i){calls.reads++;const x=slots[i];return x&&{...x,isStackableWith(o){calls.compare++;return x.isStackableWith(o);}};},getSlot(i){calls.slotReads++;return{hasItem(){return !!slots[i];},get typeId(){return slots[i]?.typeId;},get amount(){return slots[i]?.amount;},get maxAmount(){return slots[i]?.maxAmount;},getItem(){calls.reads++;return slots[i]&&{...slots[i]};},isStackableWith(o){calls.compare++;return slots[i].isStackableWith(o);}};},firstEmptySlot(){calls.empty++;const i=slots.findIndex(x=>!x);return i<0?undefined:i;}}};}
test('SCAN-01 first compatible partial stack wins over earlier empty, one size read',()=>{const v=inv([undefined,item('stone',64),item('feather',60)]);const r=fn('findAcceptSlot')(v.container,item('feather'));assert.equal(r.slot,2);assert.equal(r.room,4);assert.equal(v.calls.size,1);assert.equal(v.calls.compare,1);});
test('SCAN-02 full/wrong-type items never invoke native comparison',()=>{const v=inv([item('stone',1),item('feather',64),item('feather',3,64,'named'),item('feather',5)]);const r=fn('findAcceptSlot')(v.container,item('feather'));assert.equal(r.slot,3);assert.equal(v.calls.compare,2);assert.equal(v.calls.size,1);});
test('SCAN-03 54 unrelated full items do not invoke native stack comparison',()=>{const v=inv(Array.from({length:54},()=>item('stone',64)));assert.equal(fn('findAcceptSlot')(v.container,item('feather')),undefined);assert.equal(v.calls.slotReads,54);assert.equal(v.calls.reads,0);assert.equal(v.calls.compare,0);assert.equal(v.calls.size,1);});
test('SCAN-04 nonstackables use native firstEmptySlot with zero getItem calls',()=>{const v=inv([...Array.from({length:53},()=>item('stone',64)),undefined]);const r=fn('findAcceptSlot')(v.container,item('sword',1,1));assert.equal(r.slot,53);assert.equal(r.room,1);assert.equal(v.calls.empty,1);assert.equal(v.calls.reads,0);assert.equal(v.calls.size,0);});
test('SCAN-05 full nonstackable inventory refuses insertion',()=>{const v=inv(Array.from({length:27},()=>item('stone',64)));assert.equal(fn('findAcceptSlot')(v.container,item('sword',1,1)),undefined);assert.equal(v.calls.reads,0);});
test('SCAN-06 selection observes live inventory edits, never stale cached slots',()=>{const v=inv([item('feather',10),undefined]);const find=fn('findAcceptSlot');assert.equal(find(v.container,item('feather')).slot,0);v.slots[0]=item('stone',64);assert.equal(find(v.container,item('feather')).slot,1);});
const auto=v=>fn('autoSorterMatches',{destinationFor:()=>({kind:'storage',container:v.container}),enchantments:x=>x.ench||[]});
test('SCAN-07 AUTO uses one size read and scans to the last live seed',()=>{const v=inv([...Array.from({length:53},()=>item('stone')),item('feather')]);assert.equal(auto(v)(item('feather'),{}),true);assert.equal(v.calls.size,1);assert.equal(v.calls.reads,54);});
test('SCAN-08 AUTO last-seed removal takes effect at the next decision',()=>{const v=inv([item('feather')]);const matches=auto(v);assert.equal(matches(item('feather'),{}),true);v.slots[0]=undefined;assert.equal(matches(item('feather'),{}),false);assert.equal(v.calls.size,2);});
test('SCAN-09 AUTO still matches exact type with different name/metadata',()=>{const v=inv([item('feather',1,64,'named')]);assert.equal(auto(v)(item('feather',1,64,'different'),{}),true);});
test('SCAN-10 AUTO enchanted-book comparison uses type-set not levels',()=>{const book=e=>({typeId:'minecraft:enchanted_book',ench:e});const v=inv([book([{id:'a',level:1},{id:'b',level:1}])]);assert.equal(auto(v)(book([{id:'b',level:3},{id:'a',level:5}]),{}),true);assert.equal(auto(v)(book([{id:'c',level:1}]),{}),false);});
