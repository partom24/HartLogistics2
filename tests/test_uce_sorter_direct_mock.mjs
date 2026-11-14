import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const text=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
const marker=text.indexOf('let uceSorterDirectCursor=0;');
assert.ok(marker>=0,'the shipped native direct Sorter executor must exist');
const runtime=text.slice(marker);
function fixture({locked=false,occupied=false,ordinary=false}={}){
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
  const item=ordinary?
    {typeId:'minecraft:stone',amount:12,maxAmount:64}:
    {typeId:'minecraft:stone',amount:12,
      lore:['opaque payload'],metadata:{keep:'native'}};
  hopper.inventory.setItem(0,item);
  if(ordinary)dest.inventory.setItem(0,{
    typeId:'minecraft:stone',amount:60,maxAmount:64});
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
    // Real route winner now supplies the accepting slot observed in its
    // native storage preflight. The executor must reuse that snapshot,
    // rather than issue a duplicate findAcceptSlot before the journal.
    uceSorterColumnWinner:(_,stack)=>
      stack?{kind:'storage',entry,source:{block:hopper},
        block:dest,container:dest.inventory,
        accepting:ctx.findAcceptSlot(dest.inventory,stack)}:undefined,
    uceNativeOutputSlot:c=>c.items.findIndex(x=>x===undefined),
    ucePlainItemIdentity:s=>s&&!s.lore?.length&&s.maxAmount===64?
      'minecraft:stone':undefined,
    uceClassifyLiveStack:s=>s?.maxAmount===64?'ORDINARY':'MR',
    findAcceptSlot:(c,stack)=>{
      let empty=-1;
      for(let i=0;i<c.size;i++){
        const value=c.getItem(i);
        if(!value){if(empty<0)empty=i;continue;}
        if(value.typeId===stack.typeId&&value.maxAmount===64&&
           value.amount<64)return {slot:i,before:value.amount,
             room:64-value.amount,existing:value};
      }
      return empty<0?undefined:{slot:empty,before:0,room:64};
    },
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
      moveCertifiedPartial:({operationId,from,to,count,key})=>{
        assert.equal(opts.verifyEndpointOwner(from),true);
        assert.equal(opts.verifyEndpointOwner(to),true);
        assert.equal(key,'minecraft:stone');
        const fromStack=from.container.getItem(from.slot);
        const target=to.container.getItem(to.slot);
        assert.equal(opts.certifyOrdinaryEscrow(fromStack,key,12),true);
        from.container.setItem(from.slot,{...fromStack,amount:fromStack.amount-count});
        to.container.setItem(to.slot,{...target,amount:target.amount+count});
        moves.push(['partial',operationId,count]);
        return {ok:true,status:'NATIVE_MOVED_PENDING_OWNERSHIP_ACK'};
      },
      ackCertifiedPartial:args=>{
        moves.push(['ACK-PARTIAL',args.operationId]);
        return {ok:true,status:'NATIVE_CUSTODY_ACK_READBACK'};
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

test('existing 1.4.1 ordinary partial Sorter merge is retained behind UCE physical journal',()=>{
  const f=fixture({ordinary:true});
  f.ctx.uceSorterDirectServiceTick(f.authority);
  assert.equal(f.hopper.inventory.getItem(0).amount,8);
  assert.equal(f.dest.inventory.getItem(0).amount,64);
  assert.deepEqual(f.moves.map(x=>x[0]),['partial','ACK-PARTIAL']);
});
