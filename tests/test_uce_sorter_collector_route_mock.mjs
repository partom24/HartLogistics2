import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL(
  '../candidates/uce/runtime_pipe_route.js',import.meta.url),'utf8');
const from=src.indexOf('function uceSorterColumnWinner(');
assert.ok(from>0,'source reader must be integrated in UCE runtime');
const code=src.slice(from);
function fixture(){
  const dim={id:'minecraft:overworld'},blocks=new Map();
  const key=p=>p.x+','+p.y+','+p.z;
  const stored=new Map(),messages=[];
  const put=(typeId,x,y,z,container)=>{
    const b={typeId,dimension:dim,location:{x,y,z},
      powered:false,inventory:container,
      getComponent:()=>container?{container}:undefined};
    blocks.set(key(b.location),b);return b;
  };
  dim.getBlock=p=>blocks.get(key(p))||{typeId:'minecraft:air',
    dimension:dim,location:{...p},getComponent:()=>undefined};
  const make=()=>({isValid:true,size:5,slots:new Array(5).fill(undefined),
    getItem(i){return this.slots[i];},
    setItem(i,v){this.slots[i]=v;}});
  const hopper=put('minecraft:hopper',0,72,0,make());
  const filterBlock=put('hartsorter:sorter',0,71,0);
  const wildcardBlock=put('hartsorter:sorter',0,70,0);
  const storage=put('minecraft:barrel',1,71,0,make());
  const collectorBlock=put('hartsorter:collector',1,70,0);
  const filter={d:dim.id,x:0,y:71,z:0,m:'filter',
    f:{typeId:'minecraft:stone'}};
  const wildcard={d:dim.id,x:0,y:70,z:0,m:'wildcard',f:null};
  const collector={id:dim.id+'|1|70|0',d:dim.id,x:1,y:70,z:0,
    link:'receiver-1',present:true};
  const receiver={id:'receiver-1',present:true};
  const column={d:dim.id,source:{x:0,y:72,z:0},
    sorters:[wildcard,filter]};
  const ctx={columns:[column],COLLECTOR_ID:'hartsorter:collector',
    getDimension:()=>dim,
    sorterAt:e=>e===filter?filterBlock:
      e===wildcard?wildcardBlock:undefined,
    facingOffset:()=>({x:1,y:0,z:0}),
    sorterMode:e=>e.m,
    blockIsRedstonePowered:b=>!!b.powered,
    hopperIsRedstoneLocked:b=>!!b.powered,
    blockContainer:b=>b.inventory,
    matchesFilter:(item,f)=>item.typeId===f.typeId,
    supportedStorage:b=>b.typeId==='minecraft:barrel',
    autoSorterMatches:(item,e)=>storage.inventory.slots.some(
      x=>x?.typeId===item.typeId),
    findAcceptSlot:(c,item)=>{
      const ix=c.slots.findIndex(x=>!x);
      return ix>=0?{slot:ix}:undefined;
    },
    logisticsId:(d,x,y,z)=>d+'|'+x+'|'+y+'|'+z,
    findCollectorById:id=>id===collector.id?collector:undefined,
    collectorAt:c=>c===collector?collectorBlock:undefined,
    findReceiverById:id=>id===receiver.id?receiver:undefined,
    receiverAt:r=>r===receiver?{typeId:'hartsorter:receiver'}:undefined,
    uceAuthoritySnapshot:()=>({worldId:'world',epoch:9}),
    uceOrdinaryAccountSource:()=> 'sealed-shard',
    uceSameLoadedBlock:(a,b)=>a?.typeId===b?.typeId&&
      key(a.location)===key(b.location)&&a.dimension.id===b.dimension.id
  };
  vm.runInNewContext(code,ctx);
  const stone={typeId:'minecraft:stone',amount:5};
  hopper.inventory.setItem(0,stone);
  return {ctx,dim,hopper,storage,collectorBlock,collector,receiver,
    filter,wildcard,filterBlock,wildcardBlock,column,stone,messages};
}
test('existing Filter storage outranks wildcard Collector',()=>{
  const f=fixture(),route=f.ctx.uceSorterColumnWinner(f.column,f.stone);
  assert.equal(route.kind,'storage');
  assert.equal(route.entry,f.filter);
  const record=f.ctx.uceSorterCollectorSources(f.receiver)[0];
  assert.equal(record.eligibleSlot(0,f.stone),false);
});
test('full preferred storage falls through to linked wildcard Collector',()=>{
  const f=fixture();f.storage.inventory.slots.fill({typeId:'minecraft:stone'});
  const route=f.ctx.uceSorterColumnWinner(f.column,f.stone);
  assert.equal(route.kind,'collector');
  assert.equal(route.collector,f.collector);
  const record=f.ctx.uceSorterCollectorSources(f.receiver)[0];
  assert.equal(record.kind,'sorter-collector');
  assert.equal(record.eligibleSlot(0,f.stone),true);
});
test('an unloaded sealed linked Receiver still leaves the original Sorter Collector route eligible',()=>{
  const f=fixture();
  f.storage.inventory.slots.fill({typeId:'minecraft:stone'});
  f.ctx.receiverAt=()=>undefined;
  const selected=f.ctx.uceSorterColumnWinner(f.column,f.stone);
  assert.equal(selected?.kind,'collector',
    'an unavailable Receiver must NOT cause local storage fallback');
  assert.equal(selected?.collector.id,f.collector.id);
  const exact=f.ctx.uceSorterCollectorSources(
    f.receiver,f.collector.id);
  assert.equal(exact.length,1);
  assert.equal(exact[0].eligibleSlot(0,f.stone),true);
  assert.equal(exact[0].stillSelected(f.stone),true);
  assert.equal(f.ctx.uceSorterCollectorSources(
    f.receiver,'another-collector').length,0,
    'one Collector host may not claim a different Collector route');
});
test('wrong Filter item selects Collector without flattening live stack',()=>{
  const f=fixture(),dirt={typeId:'minecraft:dirt',amount:1};
  f.hopper.inventory.setItem(1,dirt);
  const choice=f.ctx.uceSorterColumnWinner(f.column,dirt);
  assert.equal(choice.kind,'collector');
  assert.equal(f.ctx.uceSorterCollectorSources(f.receiver)[0]
    .eligibleSlot(1,dirt),true);
});
test('powered Collector and Hopper, missing link or sealed account HOLDS',()=>{
  const f=fixture();f.storage.inventory.slots.fill({typeId:'minecraft:stone'});
  f.collectorBlock.powered=true;
  assert.equal(f.ctx.uceSorterColumnWinner(f.column,f.stone),undefined);
  f.collectorBlock.powered=false;
  f.collector.link='wrong';
  assert.equal(f.ctx.uceSorterColumnWinner(f.column,f.stone),undefined);
  f.collector.link='receiver-1';
  f.ctx.uceOrdinaryAccountSource=()=>undefined;
  assert.equal(f.ctx.uceSorterColumnWinner(f.column,f.stone),undefined);
  f.hopper.powered=true;
  assert.deepEqual(Array.from(f.ctx.uceSorterCollectorSources(f.receiver)),[]);
});
test('changed priority or source inventory revokes source authorization',()=>{
  const f=fixture();f.storage.inventory.slots.fill({typeId:'minecraft:stone'});
  const record=f.ctx.uceSorterCollectorSources(f.receiver)[0];
  assert.equal(record.eligibleSlot(0,f.stone),true);
  assert.equal(record.stillSelected(f.stone),true);
  f.filter.m='bypass';
  assert.equal(record.eligibleSlot(0,f.stone),true);
  f.filter.m='filter';
  f.storage.inventory.slots.fill(undefined);
  assert.equal(record.eligibleSlot(0,f.stone),false);
  f.storage.inventory.slots.fill({typeId:'minecraft:stone'});
  f.hopper.inventory.setItem(0,undefined);
  assert.equal(record.eligibleSlot(0,f.stone),false);
  // Once port.moveWhole moved the item, route identity remains provable
  // for the ACK; checking the emptied source slot here would deadlock it.
  assert.equal(record.stillSelected(f.stone),true);
});

test('MR service skips a Sorter item without a winning Collector route',async()=>{
  const {serviceUnifiedReceiverMR}=await import(
    '../candidates/transport/unified_receiver_mr_service.mjs');
  const first={typeId:'minecraft:enchanted_book',amount:1};
  const second={typeId:'minecraft:diamond_pickaxe',amount:1};
  const container={size:2,isValid:true,getItem:i=>i===0?first:second};
  const host={size:1,isValid:true,getItem:()=>undefined};
  const moved=[];
  const registry={
    inspectCustody:()=>({ok:true,free:1,occupied:0}),
    inspectHost:()=>({ok:true,container:host}),
    stageMovedTicket:()=>({ok:true,status:'NATIVE_TICKET_STAGED_FOR_ACK'})
  };
  const port={
    moveWhole:({from})=>{
      moved.push(from.slot);
      return {ok:true,status:'NATIVE_MOVED_PENDING_OWNERSHIP_ACK',
        destinationWitness:{amount:1}};
    },
    ackWhole:()=>({ok:true,status:'NATIVE_CUSTODY_ACK_READBACK'})
  };
  const result=serviceUnifiedReceiverMR({
    registry,port,ownerId:'receiver-1',
    anchor:{dimensionId:'minecraft:overworld',x:1,y:2,z:3},
    direction:'ingress',operationId:'sorter-mr-1',
    identify:()=> 'MR',
    inputSources:[{ownerId:'sorter-input-1',container,
      locked:false,blockVerified:true,
      eligibleSlot:slot=>slot===1}]
  });
  assert.equal(result.ok,true,result.reason);
  assert.deepEqual(moved,[1]);
});

test('native Sorter owner revalidates ACTUAL slot before move, route after ACK',()=>{
  const f=fixture();
  f.storage.inventory.slots.fill({typeId:'minecraft:stone'});
  const source=f.ctx.uceSorterCollectorSources(f.receiver)[0];
  const ref={container:source.container,slot:0};
  const identify=x=>x.typeId==='minecraft:stone'?'MR':'ORDINARY';
  assert.equal(f.ctx.uceSorterSourceStillValid(
    source,ref,f.stone,identify),true);
  source.container.setItem(0,{typeId:'minecraft:dirt',amount:1});
  assert.equal(f.ctx.uceSorterSourceStillValid(
    source,ref,f.stone,identify),false);
  source.container.setItem(0,undefined);
  assert.equal(f.ctx.uceSorterSourceStillValid(
    source,ref,f.stone,identify),true);
  f.collectorBlock.powered=true;
  assert.equal(f.ctx.uceSorterSourceStillValid(
    source,ref,f.stone,identify),false);
});

test('a 1.4.1 Sorter-column candidate census is indexed once per safe tick without caching ownership',()=>{
  const f=fixture();
  const original=f.dim.getBlock;
  let reads=0;
  f.dim.getBlock=p=>{reads++;return original(p);};
  f.ctx.system={currentTick:501};
  f.ctx.dirty=false;
  const first=f.ctx.uceSorterCollectorSources(f.receiver);
  const firstReads=reads;
  assert.equal(first.length,1);
  const second=f.ctx.uceSorterCollectorSources(f.receiver);
  const secondReads=reads-firstReads;
  assert.equal(second.length,1);
  assert.ok(secondReads<firstReads,
    'second Collector request reuses candidate index, not all Sorters');
  f.collector.link='receiver-other';
  assert.equal(f.ctx.uceSorterCollectorSources(f.receiver).length,0,
    'changed links must never be cached as authority');
  f.collector.link=f.receiver.id;
  f.ctx.system.currentTick=502;
  const before=reads;
  assert.equal(f.ctx.uceSorterCollectorSources(f.receiver).length,1);
  assert.ok(reads-before>secondReads,
    'next tick rebuilds candidates from live blocks');
  // Explicit topology dirty state disables even same-tick index reuse.
  f.ctx.dirty=true;
  const dirtyBefore=reads;
  f.ctx.uceSorterCollectorSources(f.receiver);
  const dirtyFirst=reads-dirtyBefore;
  const dirtyNext=reads;
  f.ctx.uceSorterCollectorSources(f.receiver);
  assert.equal(reads-dirtyNext,dirtyFirst,
    'dirty topology must be rediscovered rather than cached');
});

test('production-sized 1386 Sorters / 54 Collectors / 33 Receivers do not multiply full column reads per Collector',()=>{
  const dim={id:'minecraft:overworld'},blocks=new Map(),
    sorters=new Map(),collectors=new Map(),columns=[],
    links=[];
  const key=p=>p.x+','+p.y+','+p.z;
  let reads=0,sorterReads=0,totalSorters=0;
  function put(typeId,x,y,z,inventory=undefined){
    const b={typeId,dimension:dim,location:{x,y,z},inventory,
      getComponent:()=>inventory?{container:inventory}:undefined};
    blocks.set(key(b.location),b);
    return b;
  }
  dim.getBlock=p=>{
    reads++;
    return blocks.get(key(p))||{
      typeId:'minecraft:air',dimension:dim,
      location:{...p},getComponent:()=>undefined};
  };
  const hopperInventory=()=>({
    size:5,isValid:true,getItem:()=>undefined
  });
  for(let i=0;i<54;i++){
    const x=i*4,rows=i<36?26:25,entries=[];
    const receiver={id:'receiver-'+(i%33)};
    const hopper=put('minecraft:hopper',x,70,0,hopperInventory());
    for(let j=0;j<rows;j++){
      const y=69-j,block=put('hartsorter:sorter',x,y,0);
      const entry={d:dim.id,x,y,z:0,m:j===rows-1?
        'wildcard':'bypass',f:null};
      entries.push(entry);
      sorters.set(entry,block);
      totalSorters++;
    }
    const cy=70-rows,collectorBlock=put(
      'hartsorter:collector',x+1,cy,0);
    const collector={id:dim.id+'|'+(x+1)+'|'+cy+'|0',
      d:dim.id,x:x+1,y:cy,z:0,
      present:true,link:receiver.id};
    collectors.set(collector.id,collector);
    columns.push({d:dim.id,source:hopper.location,sorters:entries});
    links.push({collector,collectorBlock,receiver,hopper});
  }
  assert.equal(totalSorters,1386);
  assert.equal(collectors.size,54);
  assert.equal(new Set(links.map(x=>x.receiver.id)).size,33);
  const ctx={columns,COLLECTOR_ID:'hartsorter:collector',
    system:{currentTick:910},dirty:false,
    sorterAt:e=>{sorterReads++;return sorters.get(e);},
    facingOffset:()=>({x:1,y:0,z:0}),
    logisticsId:(d,x,y,z)=>d+'|'+x+'|'+y+'|'+z,
    findCollectorById:id=>collectors.get(id),
    collectorAt:c=>blocks.get(key(c)),
    getDimension:()=>dim,blockContainer:b=>b.inventory,
    hopperIsRedstoneLocked:b=>!!b.locked,
    uceSameLoadedBlock:(a,b)=>!!a&&!!b&&
      a.typeId===b.typeId&&key(a.location)===key(b.location)
  };
  vm.runInNewContext(code,ctx);
  for(const {collector,receiver} of links){
    const available=ctx.uceSorterCollectorSources(
      receiver,collector.id);
    assert.equal(available.length,1,
      'each independently linked Collector retains exactly one source');
  }
  assert.ok(reads<3500,
    'one safe-tick census must not repeat 1386 physical Sorter reads 54 times: '+reads);
  assert.ok(sorterReads<3500,
    'registered Sorters must not be polled 54 full times: '+sorterReads);
  const first=links[0];
  first.collector.link='other-receiver';
  assert.equal(ctx.uceSorterCollectorSources(
    first.receiver,first.collector.id).length,0,
    'relink invalidates ownership during cached tick');
  first.collector.link=first.receiver.id;
  first.hopper.locked=true;
  assert.equal(ctx.uceSorterCollectorSources(
    first.receiver,first.collector.id).length,0,
    'source redstone lock is inspected live, not cached');
  first.hopper.locked=false;
  blocks.delete(key(first.collectorBlock.location));
  assert.equal(ctx.uceSorterCollectorSources(
    first.receiver,first.collector.id).length,0,
    'removed physical Collector cannot use stale candidate index');
});
