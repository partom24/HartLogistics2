import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createUnifiedNativePort,UCE_NATIVE_INTENT_KEY} from
  '../candidates/transport/unified_native_custody.mjs';
import {UCE_AUTHORITY_KEY,UCE_AUTHORITY_SCHEMA} from
  '../candidates/transport/unified_world_shard_writer.mjs';

/**
 * Exact UCE direct Sorter bridge calling the real unified native port.
 * A source mock, not Bedrock persistence/whole-system acceptance.
 */
const bridge=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const from=bridge.indexOf('let uceSorterDirectCursor=0;');
assert.ok(from>0,'real direct Sorter executor must exist');
const runtime=bridge.slice(from);
const worldId='minecraft:overworld:direct-src-lab',epoch=12;
const original={typeId:'minecraft:diamond_pickaxe',amount:1,
  nameTag:'Precious',lore:['opaque 1.4.1'],hiddenData:{
    enchantments:['mending'],custom:{level:42}
  }};
const clone=x=>x===undefined?undefined:structuredClone(x);
function inventory(initial){
  const items=Array(5).fill(undefined);
  items[0]=clone(initial);
  let throwAfterMove=false;
  return {
    size:5,isValid:true,
    getItem:i=>clone(items[i]),
    moveItem(from,to,target){
      if(!items[from]||target.peek(to)!==undefined)throw Error('invalid move');
      target.engineSet(to,items[from]);
      items[from]=undefined;
      if(throwAfterMove)throw Error('uncertain native result');
    },
    engineSet:(i,v)=>{items[i]=v;},
    peek:i=>items[i],
    get raw(){return items;},
    set throwAfterMove(x){throwAfterMove=x;}
  };
}
function fixture({lastSlot=false}={}){
  const props=new Map([[UCE_AUTHORITY_KEY,JSON.stringify({
    schema:UCE_AUTHORITY_SCHEMA,state:'ACTIVE',worldId,epoch,
    writer:'UCE_EXCLUSIVE',q4LegacyWritersFenced:true,
    migrationReconciled:true
  })]]);
  let writes=0;
  const world={getDynamicProperty:key=>props.get(key),
    setDynamicProperty(key,v){
      writes++;
      if(v===undefined)props.delete(key);else props.set(key,v);
    }};
  const dim={id:'minecraft:overworld'},blocks=new Map();
  const k=(p)=>p.x+','+p.y+','+p.z;
  dim.getBlock=p=>blocks.get(k(p));
  function block(typeId,x,y,z,container){
    const b={typeId,dimension:dim,location:{x,y,z},container,
      getComponent:()=>container?{container}:undefined};
    blocks.set(k(b.location),b);
    return b;
  }
  const input=inventory(original),output=inventory();
  if(lastSlot)for(let i=1;i<output.size;i++)
    output.engineSet(i,{typeId:'minecraft:stone',amount:64});
  const hopper=block('minecraft:hopper',4,71,3,input);
  const storage=block('minecraft:barrel',5,70,3,output);
  const entry={d:dim.id,x:4,y:70,z:3};
  const col={d:dim.id,source:{x:4,y:71,z:3},sorters:[entry]};
  const context={world,columns:[col],PG26_FACES:[],
    getDimension:()=>dim,
    supportedStorage:b=>b?.typeId==='minecraft:barrel',
    blockContainer:b=>b.container,
    hopperIsRedstoneLocked:()=>false,
    uceSorterColumnWinner:(c,s,settled)=>s&&(
      output.raw.some(v=>v===undefined)||settled?.entry===entry)?{
      kind:'storage',entry,source:{block:hopper},
      block:storage,container:output}:undefined,
    uceNativeOutputSlot:c=>{
      for(let i=0;i<c.size;i++)if(c.getItem(i)===undefined)return i;
      return -1;
    },
    ucePlainItemIdentity:()=>undefined,
    uceClassifyLiveStack:()=> 'MR',
    findAcceptSlot:()=>undefined,
    uceLiveHopperOwner:()=>true,
    getBlock:(d,x,y,z)=>dim.getBlock({x,y,z}),
    uceSameLoadedBlock:(a,b)=>a?.typeId===b?.typeId&&
      k(a.location)===k(b.location),
    uceNativeReceiptId:()=> 'direct-uce-operation-1',
    uceLegacyWriterBlocked:()=>true,
    uceAuthoritySnapshot:()=>({worldId,epoch}),
    uceBridgeLog:m=>logs.push(m),
    createUnifiedNativePort,
  };
  const logs=[];
  vm.runInNewContext(runtime,context);
  return {context,world,props,hopper,storage,input,output,logs,
    get writes(){return writes;}};
}
test('real native port moves metadata-rich stack unchanged and clears matched intent',()=>{
  const f=fixture();
  f.context.uceSorterDirectServiceTick({worldId,epoch});
  assert.deepEqual(f.output.raw[0],original);
  assert.equal(f.input.raw[0],undefined);
  assert.equal(f.props.has(UCE_NATIVE_INTENT_KEY),false);
  assert.equal(f.writes,3); // PREPARED, MOVED, ACK-cleared
  assert.deepEqual(f.logs,[]);
});
test('postmove exception holds exact native intent and never duplicates on retry',()=>{
  const f=fixture();f.input.throwAfterMove=true;
  f.context.uceSorterDirectServiceTick({worldId,epoch});
  assert.deepEqual(f.output.raw[0],original);
  assert.equal(f.input.raw[0],undefined);
  const pending=JSON.parse(f.props.get(UCE_NATIVE_INTENT_KEY));
  assert.equal(pending.phase,'PREPARED');
  const prior=f.writes;
  f.context.uceSorterDirectServiceTick({worldId,epoch});
  assert.equal(f.writes,prior);
  assert.deepEqual(f.output.raw[0],original);
  assert.equal(f.props.has(UCE_NATIVE_INTENT_KEY),true);
});
test('pre-existing uncertain native custody freezes direct Sorter output',()=>{
  const f=fixture();
  f.props.set(UCE_NATIVE_INTENT_KEY,'{"unknown":"pending"}');
  f.context.uceSorterDirectServiceTick({worldId,epoch});
  assert.deepEqual(f.input.raw[0],original);
  assert.equal(f.output.raw[0],undefined);
  assert.equal(f.writes,0);
});

test('direct native Sorter ACK succeeds when the only free slot becomes full',()=>{
  const f=fixture({lastSlot:true});
  f.context.uceSorterDirectServiceTick({worldId,epoch});
  assert.deepEqual(f.output.raw[0],original);
  assert.equal(f.input.raw[0],undefined);
  assert.equal(f.props.has(UCE_NATIVE_INTENT_KEY),false);
  assert.equal(f.writes,3);
  assert.deepEqual(f.logs,[]);
});
