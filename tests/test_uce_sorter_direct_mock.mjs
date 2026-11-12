import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const text=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const marker=text.indexOf('let uceSorterDirectCursor=0;');
assert.ok(marker>=0,'the shipped native direct Sorter executor must exist');
const runtime=text.slice(marker);
function fixture({locked=false,occupied=false}={}){
  const dim={id:'minecraft:overworld'},blocks=new Map(),writes=[],moves=[];
  const key=p=>p.x+','+p.y+','+p.z;
  const container=()=>({
    size:5,isValid:true,items:Array(5).fill(undefined),
    getItem(i){return this.items[i];},
    setItem(i,x){this.items[i]=x;}
  });
  function put(typeId,x,y,z,inventory){
    const b={typeId,dimension:dim,location:{x,y,z},
      inventory,powered:false,
      getComponent:()=>inventory?{container:inventory}:undefined};
    blocks.set(key(b.location),b);return b;
  }
  dim.getBlock=p=>blocks.get(key(p))||{
    typeId:'minecraft:air',dimension:dim,location:{...p}};
  const hopper=put('minecraft:hopper',0,71,0,container());
  const dest=put('minecraft:barrel',1,70,0,container());
  const item={typeId:'minecraft:stone',amount:12,
    lore:['opaque payload'],metadata:{keep:'native'}};
  hopper.inventory.setItem(0,item);
  if(occupied)dest.inventory.items.fill({typeId:'minecraft:stone',amount:1});
  const entry={y:70,x:0,z:0};
  const col={d:dim.id,source:{x:0,y:71,z:0},sorters:[entry]};
  const authority={worldId:'lab-world',epoch:24};
  let receipt=0;
  const world={getDynamicProperty:()=>undefined,
    setDynamicProperty:()=>{writes.push('property')}};
  const ctx={world,columns:[col],PG26_FACES:[],
    getDimension:()=>dim,
    supportedStorage:b=>b?.typeId==='minecraft:barrel',
    blockContainer:b=>b?.inventory,
    hopperIsRedstoneLocked:b=>locked||b.powered,
    uceSorterColumnWinner:(_,stack)=>
      stack?{kind:'storage',entry,source:{block:hopper},
        block:dest,container:dest.inventory}:undefined,
    uceNativeOutputSlot:c=>c.items.findIndex(x=>x===undefined),
    uceLiveHopperOwner:()=>!locked,
    getBlock:(d,x,y,z)=>dim.getBlock({x,y,z}),
    uceSameLoadedBlock:(a,b)=>!!a&&!!b&&a.typeId===b.typeId&&
      key(a.location)===key(b.location),
    uceNativeReceiptId:()=> 'direct-op-'+(++receipt),
    uceLegacyWriterBlocked:()=>true,
    uceAuthoritySnapshot:()=>authority,
    uceBridgeLog:m=>moves.push(['HOLD',m]),
    createUnifiedNativePort:opts=>({
      ok:true,
      moveWhole:({operationId,from,to})=>{
        assert.equal(opts.verifyEndpointOwner(from),true);
        assert.equal(opts.verifyEndpointOwner(to),true);
        const src=from.container.getItem(from.slot);
        from.container.setItem(from.slot,undefined);
        to.container.setItem(to.slot,src);
        assert.equal(opts.verifyEndpointOwner(from),true);
        moves.push(['moved',operationId]);
        return {ok:true,status:'NATIVE_MOVED_PENDING_OWNERSHIP_ACK'};
      },
      ackWhole:args=>{
        assert.equal(opts.durableOwnershipWitness({
          operationId:args.operationId,
          from:{ownerId:args.from.ownerId},to:{ownerId:args.to.ownerId}
        }),true);
        moves.push(['ACK',args.operationId]);
        return {ok:true,status:'NATIVE_CUSTODY_ACK_READBACK'};
      }
    })
  };
  vm.runInNewContext(runtime,ctx);
  return {ctx,hopper,dest,item,moves,writes,authority};
}
test('original native stack moves into storage with identity intact and one receipt',()=>{
  const f=fixture();
  f.ctx.uceSorterDirectServiceTick(f.authority);
  assert.deepEqual(f.dest.inventory.getItem(0),f.item);
  assert.equal(f.hopper.inventory.getItem(0),undefined);
  assert.deepEqual(f.moves.map(x=>x[0]),['moved','ACK']);
});
test('locked Hopper or full storage never triggers a native custody transfer',()=>{
  for(const opts of [{locked:true},{occupied:true}]){
    const f=fixture(opts);
    f.ctx.uceSorterDirectServiceTick(f.authority);
    assert.equal(f.hopper.inventory.getItem(0),f.item);
    assert.equal(f.moves.length,0);
  }
});
test('stale route or failed native commit leaves source unchanged',()=>{
  const f=fixture();
  f.ctx.uceSorterColumnWinner=()=>undefined;
  f.ctx.uceSorterDirectServiceTick(f.authority);
  assert.equal(f.hopper.inventory.getItem(0),f.item);
  assert.equal(f.moves.length,0);
});
