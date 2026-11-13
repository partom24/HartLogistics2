import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/**
 * Exercise the exact source spliced into the Bedrock UCE main module, with
 * loaded-block and original Sorter registry stubs. No BDS/disk claim.
 */
const src=fs.readFileSync(new URL(
  '../candidates/uce/runtime_pipe_route.js',import.meta.url),'utf8');
// Reuse EXACT production helpers instead of mocks that can silently drift
// from the 1.4.1 destination whitelist or UCE native chest ownership proof.
const baseline=fs.readFileSync(new URL(
  '../addon/behavior_pack/scripts/main.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL(
  '../candidates/uce/runtime_bridge.js',import.meta.url),'utf8');
function exactFunction(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,'missing production helper: '+name);
  const brace=source.indexOf('{',start);
  let depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&--depth===0)
      return source.slice(start,i+1);
    // A closing brace may only close a matching opening brace.
    if(source[i]!=='}')depth+=0;
  }
  throw new Error('unterminated helper: '+name);
}
const generated=process.env.UCE_GENERATED_MAIN?
  fs.readFileSync(process.env.UCE_GENERATED_MAIN,'utf8'):undefined;
const routeFunctions=[
  'ucePipeSameDimension','ucePipeRouteNetwork','uceReadOnlyPipeInput',
  'ucePipeSourceStillConnected','uceReadOnlySorterDestination',
  'ucePipeStorageOwnerId','ucePipeEmptySlot','ucePipeAutoSeed',
  'ucePipeHasUnresolvedForwarding',
  'uceSelectInterbankFilteredRoute',
  'uceChoosePipeDestination','ucePipeDestinationStillValid',
  'uceSorterColumnWinner','uceSorterCollectorSources',
  'uceSorterSourceStillValid'
];
const routeCode=generated?[
  ...['UCE_MAX_LOADED_PIPES','UCE_MAX_SORTER_COLUMN_HEIGHT'].map(name=>{
    const match=generated.match(new RegExp(
      'const '+name+'\\s*=\\s*[0-9]+\\s*;'));
    assert.ok(match,'generated main lacks route constant '+name);
    return match[0];
  }),
  ...routeFunctions.map(name=>exactFunction(generated,name))
].join('\n'):src;
const actualStorageHelpers=[
  exactFunction(generated||baseline,'supportedStorage'),
  exactFunction(generated||baseline,'blockContainer'),
  exactFunction(generated||bridge,'uceDirectStorageOwnerBlock')
].join('\n');
function fixture(){
  const dim={id:'minecraft:overworld'},blocks=new Map(),
    missing=new Set(),entries=[],FACES=[
      ['north',0,0,-1],['south',0,0,1],['east',1,0,0],
      ['west',-1,0,0],['up',0,1,0],['down',0,-1,0]
    ].map(([name,x,y,z])=>({name,x,y,z}));
  const k=p=>p.x+','+p.y+','+p.z;
  const inventories=[],collectors=[];
  const containers=(size=27)=>{const items=Array(size).fill(undefined);
    const c={size,isValid:true,getItem:i=>items[i],
      setItem:(i,x)=>{items[i]=x;},fill:x=>items.fill(x)};
    inventories.push(c);return c;};
  function put(typeId,x,y,z,container){
    const b={typeId,dimension:dim,location:{x,y,z},powered:false,
      getComponent:n=>n==='minecraft:inventory'&&container?
        {container}:undefined};
    blocks.set(k(b.location),b);return b;
  }
  dim.getBlock=p=>missing.has(k(p))?undefined:
    blocks.get(k(p))||{
      typeId:'minecraft:air',location:{...p},dimension:dim,
      getComponent:()=>undefined
    };
  const receiverBlock=put('hartsorter:receiver',4,70,4);
  const receiver={id:dim.id+'|4|70|4',d:dim.id,x:4,y:70,z:4,present:true};
  const registeredReceivers=[receiver];
  const nearPipe=put('hartlogistics:transporter',3,70,4);
  const farPipe=put('hartlogistics:transporter',2,70,4);
  const nearerSorter=put('hartsorter:sorter',3,69,4);
  const fartherSorter=put('hartsorter:sorter',2,69,4);
  const chestA=put('minecraft:barrel',3,69,5,containers());
  const chestB=put('minecraft:barrel',2,69,5,containers());
  const filter={d:dim.id,x:3,y:69,z:4,m:'filter',f:{match:{typeId:'minecraft:cobblestone'}}};
  const fallback={d:dim.id,x:2,y:69,z:4,m:'wildcard',f:null};
  entries.push(filter,fallback);
  const context={
    logistics:{receivers:registeredReceivers,collectors},
    registry:entries,PG26_FACES:FACES,PG26_PIPE_ID:'hartlogistics:transporter',
    PG26_MAX_PIPES:16,RECEIVER_ID:'hartsorter:receiver',
    SORTER_ID:'hartsorter:sorter',COLLECTOR_ID:'hartsorter:collector',
    pg26PositionKey:k,pg26Neighbor:(b,face)=>dim.getBlock({
      x:b.location.x+face.x,y:b.location.y+face.y,z:b.location.z+face.z}),
    uceSameLoadedBlock:(a,b)=>!!a&&!!b&&
      a.typeId===b.typeId&&a.dimension.id===b.dimension.id&&
      k(a.location)===k(b.location),
    receiverOutputHopper:()=>undefined,
    receiverAt:r=>{
      const b=dim.getBlock({x:r.x,y:r.y,z:r.z});
      return b?.typeId==='hartsorter:receiver'?b:undefined;
    },
    logisticsId:(d,x,y,z)=>d+'|'+x+'|'+y+'|'+z,
    findReceiverById:id=>registeredReceivers.find(r=>r.id===id),
    findCollectorById:id=>collectors.find(c=>c.id===id),
    collectorAt:c=>{
      if(!c||c.present===false)return undefined;
      const b=dim.getBlock({x:c.x,y:c.y,z:c.z});
      return b?.typeId==='hartsorter:collector'?b:undefined;
    },
    uceAuthoritySnapshot:()=>({worldId:'w',epoch:9}),
    uceOrdinaryAccountSource:(_,id)=>registeredReceivers.some(r=>r.id===id)?
      'sealed-region':undefined,
    sorterAt:e=>{
      if(!entries.includes(e))return undefined;
      const block=dim.getBlock({x:e.x,y:e.y,z:e.z});
      return block?.typeId==='hartsorter:sorter'?block:undefined;
    },
    facingOffset:()=>({x:0,y:0,z:1}),
    sorterMode:e=>e.m,blockIsRedstonePowered:b=>!!b.powered,
    matchesFilter:(item,f)=>item.typeId===f.match.typeId,
    findAcceptSlot:(c,item)=>{
      let empty=-1;
      for(let i=0;i<c.size;i++){
        const v=c.getItem(i);
        if(!v){if(empty<0)empty=i;continue;}
        if(typeof v.isStackableWith==='function'&&
           v.isStackableWith(item)&&v.amount<v.maxAmount)
          return {slot:i,before:v.amount,room:v.maxAmount-v.amount,
            existing:v};
      }
      return empty<0?undefined:{slot:empty,before:0,
        room:item.maxAmount,existing:undefined};
    },
    enchantments:stack=>stack?.ench||[]
  };
  vm.runInNewContext(actualStorageHelpers+'\n'+routeCode,context);
  return {context,dim,blocks,missing,k,put,receiver,registeredReceivers,
    receiverBlock,
    nearPipe,farPipe,nearerSorter,fartherSorter,chestA,chestB,filter,
    fallback,inventories,FACES,entries,collectors,newContainer:containers,
    choose:item=>context.uceChoosePipeDestination(receiver,item),
    network:()=>context.ucePipeRouteNetwork(receiver)};
}
const COBBLE={typeId:'minecraft:cobblestone',amount:1};
test('two Sorters share one read-only pipe network; Filter precedes Wildcard',()=>{
  const f=fixture(),graph=f.network();
  assert.equal(graph.entries.length,2);
  const choice=f.choose(COBBLE);
  assert.equal(choice.entry,f.filter);
  assert.equal(choice.mode,'filter');
  assert.equal(choice.slot,0);
  assert.equal(choice.dest.block,f.chestA);
  assert.equal(choice.ownerId.startsWith('uce-pipe-output|'),true);
});
test('one Transporter discovers an eight-Sorter 1.4.1 column and a filtered bottom row wins',()=>{
  const f=fixture();
  f.filter.m='wildcard';f.filter.f=null;
  const rows=[];
  for(let y=68;y>=62;y--){
    const block=f.put('hartsorter:sorter',3,y,4);
    const entry={d:f.dim.id,x:3,y,z:4,m:'bypass',f:null};
    f.entries.push(entry);
    rows.push({block,entry});
  }
  const bottom=rows[rows.length-1];
  bottom.entry.m='filter';
  bottom.entry.f={match:{typeId:'minecraft:cobblestone'}};
  const dest=f.put('minecraft:barrel',3,62,5,f.newContainer());
  const graph=f.network();
  assert.ok(graph);
  assert.equal(graph.entries.length,9); // 8 in this column plus one other
  const winner=f.choose(COBBLE);
  assert.equal(winner.entry,bottom.entry);
  assert.equal(winner.dest.block,dest);
  assert.equal(winner.mode,'filter');
  // Lower Sorters are endpoints, not Transporters: the pipe count is two.
  assert.equal(graph.fingerprint.includes('3,69,4x8'),true);
  assert.equal(graph.entries.some(e=>e.y===62),true);
});

test('stacked matching Filter is bottom-to-top and powered rows do not block lower routing',()=>{
  const f=fixture();
  const lower=f.put('hartsorter:sorter',3,68,4);
  const lowerEntry={d:f.dim.id,x:3,y:68,z:4,m:'filter',
    f:{match:{typeId:'minecraft:cobblestone'}}};
  f.entries.push(lowerEntry);
  const lowerChest=f.put('minecraft:barrel',3,68,5,f.newContainer());
  const first=f.choose(COBBLE);
  assert.equal(first.entry,lowerEntry);
  assert.equal(first.dest.block,lowerChest);
  assert.equal(f.context.ucePipeDestinationStillValid(
    f.receiver,COBBLE,first),true);
  lower.powered=true;
  assert.equal(f.choose(COBBLE).entry,f.filter);
  assert.equal(f.context.ucePipeDestinationStillValid(
    f.receiver,COBBLE,first),false);
  lower.powered=false;
  f.nearerSorter.powered=true;
  assert.equal(f.choose(COBBLE).entry,lowerEntry);
  assert.ok(f.network());
});

test('unregistered or unloaded lower Sorter cannot be skipped for wildcard fallback',()=>{
  const f=fixture();
  f.filter.m='wildcard';f.filter.f=null;
  f.put('hartsorter:sorter',3,68,4);
  assert.equal(f.network(),undefined);
  assert.equal(f.choose(COBBLE),undefined);
  const lowerEntry={d:f.dim.id,x:3,y:68,z:4,m:'filter',
    f:{match:{typeId:'minecraft:cobblestone'}}};
  f.entries.push(lowerEntry);
  f.put('minecraft:barrel',3,68,5,f.newContainer());
  assert.ok(f.network());
  assert.equal(f.choose(COBBLE).entry,lowerEntry);
  f.missing.add('3,67,4'); // May contain a still-higher-priority lower row
  assert.equal(f.network(),undefined);
  assert.equal(f.choose(COBBLE),undefined);
});

test('128 connected Transporters can discover 1,024 registered stacked Sorters',()=>{
  const f=fixture();
  for(let x=1;x>=-124;x--)f.put('hartlogistics:transporter',x,70,4);
  for(let x=3;x>=-124;x--){
    if(x<=1)f.put('hartsorter:sorter',x,69,4);
    if(x<=1)f.entries.push({d:f.dim.id,x,y:69,z:4,m:'bypass',f:null});
    for(let y=68;y>=62;y--){
      f.put('hartsorter:sorter',x,y,4);
      f.entries.push({d:f.dim.id,x,y,z:4,m:'bypass',f:null});
    }
  }
  const graph=f.network();
  assert.ok(graph);
  assert.equal(graph.entries.length,1024);
  // Federated Bulk custody has an 8,192-character route witness fence.
  assert.ok(graph.fingerprint.length<=8192);
  assert.equal(f.choose(COBBLE).entry,f.filter);
});

test('1,536 stacked Sorters across two independent loaded banks have no global Sorter ceiling',()=>{
  const f=fixture();
  // 48 pipe-fed columns per bank, 16 vertically contiguous Sorters each.
  // Each graph stays below its own bounded pipe budget. This is a scale
  // GEOMETRY proof, not cross-Collector/Bulk forwarding or BDS timing.
  for(let x=1;x>=-44;x--)f.put('hartlogistics:transporter',x,70,4);
  for(let x=3;x>=-44;x--){
    if(x<=1){
      f.put('hartsorter:sorter',x,69,4);
      f.entries.push({d:f.dim.id,x,y:69,z:4,m:'bypass',f:null});
    }
    for(let y=68;y>=54;y--){
      f.put('hartsorter:sorter',x,y,4);
      f.entries.push({d:f.dim.id,x,y,z:4,m:'bypass',f:null});
    }
  }
  const second={id:f.context.logisticsId(f.dim.id,199,70,4),
    d:f.dim.id,x:199,y:70,z:4,present:true};
  f.registeredReceivers.push(second);
  f.put('hartsorter:receiver',199,70,4);
  for(let x=200;x<=247;x++){
    f.put('hartlogistics:transporter',x,70,4);
    for(let y=69;y>=54;y--){
      f.put('hartsorter:sorter',x,y,4);
      f.entries.push({d:f.dim.id,x,y,z:4,m:'bypass',f:null});
    }
  }
  const a=f.network(),b=f.context.ucePipeRouteNetwork(second);
  assert.ok(a);assert.ok(b);
  assert.equal(f.entries.length,1536);
  assert.equal(a.entries.length,768);
  assert.equal(b.entries.length,768);
  assert.notEqual(a.fingerprint,b.fingerprint);
  assert.equal(a.leaderId,f.receiver.id);
  assert.equal(b.leaderId,second.id);
  assert.ok(a.fingerprint.length<=8192);
  assert.ok(b.fingerprint.length<=8192);
  assert.equal(f.choose(COBBLE)?.entry,f.filter);
});
test('duplicate Sorter registration revokes the entire Transporter route',()=>{
  const f=fixture();
  assert.ok(f.network());
  f.entries.push({...f.filter});
  assert.equal(f.network(),undefined);
  assert.equal(f.choose(COBBLE),undefined);
});

test('an unrelated duplicate Sorter registration does not freeze a separate pipe bank',()=>{
  const f=fixture();
  // No registered pipe feeds this distant registry row.
  f.entries.push({d:f.dim.id,x:1000,y:69,z:1000,m:'filter',
    f:{match:{typeId:'minecraft:stone'}}});
  f.entries.push({d:f.dim.id,x:1000,y:69,z:1000,m:'wildcard',f:null});
  assert.ok(f.network());
  assert.equal(f.choose(COBBLE).entry,f.filter);
});

test('matching Transporter-fed Collector Filter HOLDS instead of silently routing to Wildcard',()=>{
  const f=fixture();
  f.chestA.typeId='hartsorter:collector';
  assert.equal(f.network().entries.length,2);
  assert.equal(f.choose(COBBLE),undefined,
    'an unimplemented cross-bank handoff cannot be bypassed');
  // Only a filter for this item represents a candidate route.
  f.filter.f={match:{typeId:'minecraft:stone'}};
  assert.equal(f.choose(COBBLE)?.entry,f.fallback);
  f.filter.f={match:{typeId:'minecraft:cobblestone'}};
  f.chestA.typeId='minecraft:barrel';
  assert.equal(f.choose(COBBLE)?.entry,f.filter);
});
test('Bulk cannot spill past a Collector forwarding frontier or unknown filtered storage',()=>{
  const f=fixture(),graph=f.network();
  assert.equal(f.context.ucePipeHasUnresolvedForwarding(
    f.receiver,graph,COBBLE),false,
    'verified local Filter and Wildcard outputs need no HOLD');
  f.chestA.typeId='hartsorter:collector';
  assert.equal(f.context.ucePipeHasUnresolvedForwarding(
    f.receiver,f.network(),COBBLE),true,
    'matching Collector Filter must protect downstream bank priority');
  f.filter.f={match:{typeId:'minecraft:stone'}};
  assert.equal(f.context.ucePipeHasUnresolvedForwarding(
    f.receiver,f.network(),COBBLE),false,
    'non-matching Collector Filter is not a route for this item');
  f.filter.f={match:{typeId:'minecraft:cobblestone'}};
  f.chestA.typeId='minecraft:barrel';
  f.missing.add('3,69,5');
  assert.equal(f.context.ucePipeHasUnresolvedForwarding(
    f.receiver,f.network(),COBBLE),true,
    'unloaded filtered target cannot be declared unavailable');
  f.missing.clear();
  f.chestA.getComponent('minecraft:inventory').container.fill({
    typeId:'minecraft:stone',amount:64,maxAmount:64});
  assert.equal(f.context.ucePipeHasUnresolvedForwarding(
    f.receiver,f.network(),COBBLE),false,
    'a known full native output may safely be considered for Bulk');
});
test('one-hop Collector handoff selects a different sealed Receiver with a real accepting Filter',()=>{
  const f=fixture();
  f.filter.m='bypass';
  const collectorBlock=f.chestB;
  collectorBlock.typeId='hartsorter:collector';
  const at=collectorBlock.location;
  const id=f.context.logisticsId(f.dim.id,at.x,at.y,at.z);
  const remote={id:f.context.logisticsId(f.dim.id,24,70,4),
    d:f.dim.id,x:24,y:70,z:4,present:true};
  f.registeredReceivers.push(remote);
  f.put('hartsorter:receiver',24,70,4);
  f.put('hartlogistics:transporter',23,70,4);
  f.put('hartsorter:sorter',23,69,4);
  const remoteFilter={d:f.dim.id,x:23,y:69,z:4,m:'filter',
    f:{match:{typeId:'minecraft:cobblestone'}}};
  f.entries.push(remoteFilter);
  const remoteDest=f.put('minecraft:barrel',23,69,5,f.newContainer());
  f.collectors.push({id,d:f.dim.id,x:at.x,y:at.y,z:at.z,
    link:remote.id,present:true});
  const select=()=>f.context.uceSelectInterbankFilteredRoute(
    f.receiver,f.network(),COBBLE,f.context.uceAuthoritySnapshot());
  const route=select();
  assert.ok(route,'fully verified Collector link should route to Filter');
  assert.equal(route.entry,f.fallback);
  assert.equal(route.receiver,remote);
  assert.equal(route.remote.entry,remoteFilter);
  assert.equal(route.remote.dest.block,remoteDest);
  assert.ok(route.witness.startsWith('IB1|'));
  assert.equal(route.witness.length<8192,true);
  assert.equal(select()?.witness,route.witness,
    'same live topology must reproduce exact journal witness');
  remoteFilter.f={match:{typeId:'minecraft:stone'}};
  assert.equal(select(),undefined,'unmatched remote filter is not valid');
  remoteFilter.f={match:{typeId:'minecraft:cobblestone'}};
  remoteDest.powered=true; // storage power itself is not a Sorter lock
  assert.equal(select()?.witness,route.witness);
  remoteDest.powered=false;
  f.put('hartsorter:sorter',23,69,4).powered=true;
  assert.equal(select(),undefined,'powered remote Sorter blocks forwarding');
  f.put('hartsorter:sorter',23,69,4).powered=false;
  collectorBlock.powered=true;
  assert.equal(select(),undefined,'redstone-paused Collector is not a route');
  collectorBlock.powered=false;
  f.collectors[0].link=f.receiver.id;
  assert.equal(select(),undefined,'self-link must never bounce same balance');
  f.collectors[0].link=remote.id;
  f.filter.m='filter';
  assert.equal(select(),undefined,'accepting local Filter takes priority');
  // Even if a local filtered chest exists but its native alias is
  // inconsistent, do not forward past that unresolved higher-priority
  // original 1.4.1 destination.
  f.chestA.typeId='minecraft:chest';
  f.put('minecraft:chest',4,69,5,f.newContainer());
  assert.equal(select(),undefined,
    'uncertified local Filter cannot be bypassed by remote link');
});
test('unloaded, overfull or relinked remote bank cannot receive a virtual handoff',()=>{
  const f=fixture();f.filter.m='bypass';
  f.chestB.typeId='hartsorter:collector';
  const p=f.chestB.location;
  const next={id:f.context.logisticsId(f.dim.id,24,70,4),
    d:f.dim.id,x:24,y:70,z:4,present:true};
  f.registeredReceivers.push(next);
  f.put('hartsorter:receiver',24,70,4);
  f.put('hartlogistics:transporter',23,70,4);
  f.put('hartsorter:sorter',23,69,4);
  f.entries.push({d:f.dim.id,x:23,y:69,z:4,m:'filter',
    f:{match:{typeId:'minecraft:cobblestone'}}});
  const remote=f.put('minecraft:barrel',23,69,5,f.newContainer());
  const record={id:f.context.logisticsId(f.dim.id,p.x,p.y,p.z),
    d:f.dim.id,x:p.x,y:p.y,z:p.z,link:next.id,present:true};
  f.collectors.push(record);
  const select=()=>f.context.uceSelectInterbankFilteredRoute(
    f.receiver,f.network(),COBBLE,f.context.uceAuthoritySnapshot());
  assert.ok(select());
  remote.getComponent('minecraft:inventory').container.fill({
    typeId:'minecraft:stone',amount:64,maxAmount:64});
  assert.equal(select(),undefined,'full destination cannot take item');
  remote.getComponent('minecraft:inventory').container.setItem(0,undefined);
  f.missing.add('23,70,3');
  assert.equal(select(),undefined,'unloaded remote pipe frontier HOLD');
  f.missing.clear();
  record.link='minecraft:overworld|999|70|4';
  assert.equal(select(),undefined,'stale Collector link HOLD');
  record.link=next.id;
  f.missing.add('24,70,4');
  assert.equal(select(),undefined,'unloaded receiver cannot take custody');
});
test('unloaded or uncertified preferred output HOLDS rather than using Wildcard',()=>{
  const f=fixture();
  f.missing.add('3,69,5');
  assert.equal(f.network().entries.length,2);
  assert.equal(f.choose(COBBLE),undefined);
  f.missing.clear();
  f.chestA.typeId='minecraft:chest';
  f.put('minecraft:chest',4,69,5,f.newContainer());
  assert.equal(f.choose(COBBLE),undefined,
    'unverified double chest must not authorize weaker destination');
  f.chestA.typeId='minecraft:furnace';
  assert.equal(f.choose(COBBLE)?.entry,f.fallback,
    'known unsupported physical output is not a hidden route');
});
test('verified earlier Filter can win before a later unresolved Collector Wildcard',()=>{
  const f=fixture();
  f.filter.m='wildcard';f.filter.f=null;
  f.chestA.typeId='hartsorter:collector';
  const below=f.put('hartsorter:sorter',3,68,4);
  const lower={d:f.dim.id,x:3,y:68,z:4,m:'filter',
    f:{match:{typeId:'minecraft:cobblestone'}}};
  f.entries.push(lower);
  const output=f.put('minecraft:barrel',3,68,5,f.newContainer());
  const selected=f.choose(COBBLE);
  assert.equal(selected?.entry,lower);
  assert.equal(selected?.dest.block,output);
  assert.equal(below.typeId,'hartsorter:sorter');
});
test('occupied preferred output selects lower priority destination without merge',()=>{
  const f=fixture();
  f.chestA.getComponent('minecraft:inventory').container.fill({
    typeId:'minecraft:cobblestone',amount:1});
  const chosen=f.choose(COBBLE);
  assert.equal(chosen.entry,f.fallback);
  assert.equal(chosen.dest.block,f.chestB);
  assert.equal(chosen.slot,0);
});
test('seeded Auto takes precedence over Wildcard but never seeds empty chest',()=>{
  const f=fixture();f.filter.m='auto';f.filter.f=null;
  const a=f.chestA.getComponent('minecraft:inventory').container;
  assert.equal(f.choose(COBBLE).entry,f.fallback);
  a.setItem(2,{typeId:'minecraft:cobblestone',amount:7});
  const pick=f.choose(COBBLE);
  assert.equal(pick.entry,f.filter);assert.equal(pick.mode,'auto');
});
test('bypass and powered Sorter cannot take items',()=>{
  const f=fixture();f.filter.m='bypass';
  assert.equal(f.choose(COBBLE).entry,f.fallback);
  f.nearerSorter.powered=true;
  assert.ok(f.network());
  assert.equal(f.choose(COBBLE).entry,f.fallback);
  f.fartherSorter.powered=true;
  assert.equal(f.choose(COBBLE),undefined);
});
test('unloaded pipe boundary or unsupported foreign inventory HOLDS without route',()=>{
  const f=fixture();
  f.missing.add('3,70,3');
  assert.equal(f.network(),undefined);
  f.missing.clear();
  f.put('minecraft:furnace',1,70,4,
    f.chestA.getComponent('minecraft:inventory').container);
  assert.equal(f.network(),undefined);
});
test('unregistered second Receiver still refuses ambiguous shared graph',()=>{
  const f=fixture();
  f.put('hartsorter:receiver',1,70,4);
  assert.equal(f.network(),undefined);
});
test('two registered Receivers share one graph with deterministic ingress leader',()=>{
  const f=fixture();
  const b=f.put('hartsorter:receiver',1,70,4);
  const secondary={id:f.context.logisticsId(f.dim.id,1,70,4),
    d:f.dim.id,x:1,y:70,z:4,present:true};
  f.registeredReceivers.push(secondary);
  const a=f.network(),c=f.context.ucePipeRouteNetwork(secondary);
  assert.ok(a);assert.ok(c);
  assert.equal(a.leaderId,secondary.id);
  assert.equal(c.leaderId,secondary.id);
  assert.equal(a.fingerprint,c.fingerprint);
  assert.equal(a.receiverIds.length,2);
  assert.equal(f.choose(COBBLE).entry,f.filter);
  f.put('minecraft:barrel',0,70,4,f.inventories[0]);
  // The barrel touching the second Receiver only is not on a pipe.
  // Add an input directly above the common connected pipe instead.
  f.put('minecraft:barrel',3,71,4,f.inventories[1]);
  const source=f.network().inputs[0];
  assert.equal(f.context.ucePipeSourceStillConnected(f.receiver,source),false);
  assert.equal(f.context.ucePipeSourceStillConnected(secondary,source),true);
  b.typeId='minecraft:air';
  assert.equal(f.network().leaderId,f.receiver.id);
  assert.equal(f.context.ucePipeSourceStillConnected(f.receiver,source),true);
});
test('shared graph refuses stale, missing or mismatched Receiver block authority',()=>{
  const f=fixture();
  f.put('hartsorter:receiver',1,70,4);
  const secondary={id:f.context.logisticsId(f.dim.id,1,70,4),
    d:f.dim.id,x:1,y:70,z:4,present:true};
  f.registeredReceivers.push(secondary);
  assert.ok(f.network());
  secondary.x=99;
  assert.equal(f.network(),undefined);
  secondary.x=1;
  f.missing.add('1,70,4');
  assert.equal(f.network(),undefined);
  f.missing.clear();
  secondary.present=false;
  assert.equal(f.network(),undefined);
  secondary.present=true;
  // Even a matching in-memory registry row cannot authorize a Receiver
  // whose sealed account is unavailable/corrupt.
  f.context.uceOrdinaryAccountSource=(_,id)=>
    id===secondary.id?undefined:'sealed-region';
  assert.equal(f.network(),undefined);
});
test('Transporter-fed Sorter preserves every 1.4.1 single-storage destination',()=>{
  for(const kind of ['minecraft:chest','minecraft:trapped_chest',
                     'minecraft:barrel','minecraft:shulker_box',
                     'minecraft:red_shulker_box','minecraft:blue_shulker_box']){
    const f=fixture();
    f.chestA.typeId=kind;
    const selected=f.choose(COBBLE);
    assert.equal(selected?.entry,f.filter,kind);
    assert.equal(selected?.dest.block,f.chestA,kind);
    assert.equal(f.context.ucePipeDestinationStillValid(
      f.receiver,COBBLE,selected),true,kind);
    f.chestA.typeId='minecraft:furnace';
    assert.notEqual(f.choose(COBBLE)?.entry,f.filter,
                    kind+' changed to unsupported native inventory');
    assert.equal(f.context.ucePipeDestinationStillValid(
      f.receiver,COBBLE,selected),false,kind+' identity changed');
  }
});
test('one 54-slot double chest has one canonical custody owner across both Sorters',()=>{
  const f=fixture(),shared=f.newContainer(54);
  f.chestA.typeId='minecraft:chest';
  f.chestB.typeId='minecraft:chest';
  for(const half of [f.chestA,f.chestB])
    half.getComponent=n=>n==='minecraft:inventory'?{container:shared}:undefined;
  const primary=f.choose(COBBLE);
  assert.equal(primary?.entry,f.filter);
  assert.equal(primary?.dest.container,shared);
  assert.equal(primary?.slot,0);
  assert.equal(f.context.ucePipeDestinationStillValid(
    f.receiver,COBBLE,primary),true);
  f.filter.m='bypass';
  const otherHalf=f.choose(COBBLE);
  assert.equal(otherHalf?.entry,f.fallback);
  assert.equal(otherHalf?.dest.container,shared);
  assert.equal(primary.ownerId,otherHalf.ownerId,
               'both aliases MUST have identical native custody identity');
  assert.notEqual(primary.routeId,otherHalf.routeId,
                  'distinct Sorter selection still has its own route witness');
  f.missing.add('3,69,5');
  assert.equal(f.choose(COBBLE),undefined,
               'unloaded companion half cannot authorize native output');
  assert.equal(f.context.ucePipeDestinationStillValid(
    f.receiver,COBBLE,otherHalf),false);
});
test('double chest output refuses 27-slot aliases and nonreciprocal chest topology',()=>{
  const f=fixture();
  f.chestA.typeId='minecraft:trapped_chest';
  f.chestB.typeId='minecraft:trapped_chest';
  assert.equal(f.choose(COBBLE),undefined,
               'physically paired aliases must report one 54-slot inventory');
  const shared=f.newContainer(54);
  for(const half of [f.chestA,f.chestB])
    half.getComponent=n=>n==='minecraft:inventory'?{container:shared}:undefined;
  assert.equal(f.choose(COBBLE)?.dest.container,shared);
  f.put('minecraft:trapped_chest',4,69,5,f.newContainer(54));
  assert.equal(f.choose(COBBLE),undefined,
               'ambiguous triple-chest adjacency must never claim ownership');
});
test('powered Receiver pauses only output; Transporter inputs remain discoverable',()=>{
  const f=fixture();f.receiverBlock.powered=true;
  f.put('minecraft:barrel',1,70,4,f.inventories[0]);
  const graph=f.network();
  assert.ok(graph);
  assert.equal(graph.inputs.length,1);
  assert.equal(f.choose(COBBLE),undefined);
  assert.equal(f.context.ucePipeSourceStillConnected(
    f.receiver,graph.inputs[0]),true);
  f.receiverBlock.powered=false;
  assert.ok(f.choose(COBBLE));
  f.farPipe.powered=true;
  assert.equal(f.network(),undefined);
  assert.equal(f.choose(COBBLE),undefined);
});
test('selected destination must be identical after priority or topology changes',()=>{
  const f=fixture(),choice=f.choose(COBBLE);
  assert.equal(f.context.ucePipeDestinationStillValid(f.receiver,COBBLE,choice),true);
  f.filter.m='bypass';
  assert.equal(f.context.ucePipeDestinationStillValid(f.receiver,COBBLE,choice),false);
  f.filter.m='filter';
  assert.equal(f.context.ucePipeDestinationStillValid(f.receiver,COBBLE,choice),true);
  f.put('hartlogistics:transporter',3,71,4);
  assert.equal(f.context.ucePipeDestinationStillValid(f.receiver,COBBLE,choice),false);
});
test('existing Receiver output Hopper takes precedence over Transporter pipe',()=>{
  const f=fixture();f.context.receiverOutputHopper=()=>({
    block:f.put('minecraft:hopper',4,69,4)});
  assert.ok(f.network()); // Bank graph remains readable without a pipe egress.
  assert.equal(f.choose(COBBLE),undefined);
});

test('Bulk member is discovered only on same connected Receiver pipe graph',()=>{
  const f=fixture();
  const bank=f.put('hartlogistics:bulk_storage',1,70,4);
  const network=f.network();
  assert.ok(network);
  assert.equal(network.banks.length,1);
  assert.equal(network.banks[0],bank);
  assert.equal(f.choose(COBBLE).entry,f.filter);
});
test('Bulk block touching a disconnected second pipe graph cannot claim ownership',()=>{
  const f=fixture();
  f.put('hartlogistics:bulk_storage',1,70,4);
  // Existing pipe at (2,70,4), second disconnected pipe touching the bank.
  f.put('hartlogistics:transporter',0,70,4);
  // The second pipe is connected to the first through the bank only.
  assert.equal(f.network(),undefined);
});


test('Transporter admits loaded 27-slot barrel input without becoming a second output writer',()=>{
  const f=fixture();
  const barrel=f.put('minecraft:barrel',1,70,4,f.inventories[0]);
  const network=f.network();
  assert.ok(network);
  assert.equal(network.inputs.length,1);
  assert.equal(network.inputs[0].block,barrel);
  assert.equal(network.entries.length,2);
  assert.equal(f.context.ucePipeSourceStillConnected(f.receiver,
    network.inputs[0]),true);
  assert.equal(f.choose(COBBLE).entry,f.filter);
});
test('multiple chest/barrel inputs are deduplicated and sorted deterministically',()=>{
  const f=fixture();
  const source1=f.put('minecraft:barrel',1,70,4,f.inventories[0]);
  const source2=f.put('minecraft:chest',3,71,4,f.inventories[1]);
  const graph=f.network();
  assert.ok(graph);
  assert.equal(graph.inputs.length,2);
  assert.deepEqual(Array.from(graph.inputs,x=>f.k(x.block.location)),
    ['1,70,4','3,71,4']);
  assert.equal(graph.inputs[0].block,source1);
  assert.equal(graph.inputs[1].block,source2);
});
test('lower-bank input below Receiver elevation remains a verified pipe source',()=>{
  const f=fixture();
  for(const x of [1,0,-1])f.put('hartlogistics:transporter',x,70,4);
  f.put('hartlogistics:transporter',-1,69,4);
  const source=f.put('minecraft:barrel',-2,69,4,f.newContainer());
  const graph=f.network();
  assert.ok(graph,'a valid descending pipe must not be rejected by Y level');
  assert.equal(graph.inputs.length,1);
  assert.equal(graph.inputs[0].block,source);
  assert.equal(f.context.ucePipeSourceStillConnected(f.receiver,graph.inputs[0]),true);
  f.missing.add('-1,69,3');
  assert.equal(f.network(),undefined,'unknown lower-bank frontier HOLDS');
});
test('original supported vanilla single-storage pipe inputs retain identity checks',()=>{
  for(const kind of ['minecraft:chest','minecraft:trapped_chest',
                     'minecraft:barrel','minecraft:shulker_box',
                     'minecraft:purple_shulker_box']){
    const f=fixture(),input=f.put(kind,1,70,4,f.newContainer());
    const graph=f.network();
    assert.ok(graph,kind);
    assert.equal(graph.inputs[0].block,input,kind);
    assert.equal(f.context.ucePipeSourceStillConnected(
      f.receiver,graph.inputs[0]),true,kind);
    input.typeId='minecraft:dispenser';
    assert.equal(f.context.ucePipeSourceStillConnected(
      f.receiver,graph.inputs[0]),false,
      kind+' changed to unsupported type');
  }
});
test('double-chest aliases cannot become uncertified input owners',()=>{
  const f=fixture();
  const chest=f.put('minecraft:chest',1,70,4,f.inventories[0]);
  f.put('minecraft:chest',1,70,5,f.inventories[0]);
  assert.equal(f.network(),undefined);
  assert.equal(chest.typeId,'minecraft:chest');
  const shulker=fixture();
  shulker.put('minecraft:shulker_box',1,70,4,shulker.newContainer(54));
  assert.equal(shulker.network(),undefined,
    'non-27-slot inventory cannot masquerade as a single input');
});
test('source removal, unloaded frontier or changed input source identity revokes admission',()=>{
  const f=fixture();
  const chest=f.put('minecraft:chest',1,70,4,f.inventories[0]);
  const initial=f.network().inputs[0];
  assert.equal(f.context.ucePipeSourceStillConnected(f.receiver,initial),true);
  chest.typeId='minecraft:barrel';
  assert.equal(f.context.ucePipeSourceStillConnected(f.receiver,initial),false);
  chest.typeId='minecraft:chest';
  f.missing.add('1,70,3');
  assert.equal(f.context.ucePipeSourceStillConnected(f.receiver,initial),false);
});
test('pipe output is refused if it aliases a connected input container',()=>{
  const f=fixture();
  const source=f.put('minecraft:barrel',1,70,4,f.inventories[0]);
  // Overlapping wrappers would only be considered the same if both
  // represent the very same world block, never merely the same item type.
  assert.ok(f.network());
  assert.notEqual(f.choose(COBBLE)?.dest.block,source);
});

test('governed ordinary routing refuses Wildcard while native MR still may use it',()=>{
  const f=fixture();
  f.filter.m='bypass';
  assert.equal(f.choose(COBBLE).entry,f.fallback);
  assert.equal(f.context.uceChoosePipeDestination(
    f.receiver,COBBLE,true),undefined);
  const preferred=f.context.uceChoosePipeDestination(
    f.receiver,COBBLE,false);
  assert.equal(preferred.mode,'wildcard');
  assert.equal(f.context.ucePipeDestinationStillValid(
    f.receiver,COBBLE,preferred),true);
});
test('governed Bulk still allows Filter then seeded Auto, not an unseeded Auto',()=>{
  const f=fixture();
  assert.equal(f.context.uceChoosePipeDestination(
    f.receiver,COBBLE,true)?.entry,f.filter);
  f.filter.m='auto';f.filter.f=null;
  assert.equal(f.context.uceChoosePipeDestination(
    f.receiver,COBBLE,true),undefined);
  const c=f.chestA.getComponent('minecraft:inventory').container;
  c.setItem(2,{typeId:'minecraft:cobblestone',amount:3});
  const seeded=f.context.uceChoosePipeDestination(
    f.receiver,COBBLE,true);
  assert.equal(seeded.entry,f.filter);
  assert.equal(seeded.mode,'auto');
  assert.equal(f.context.ucePipeDestinationStillValid(
    f.receiver,COBBLE,seeded),true);
  c.setItem(2,undefined);
  assert.equal(f.context.ucePipeDestinationStillValid(
    f.receiver,COBBLE,seeded),false);
});

test('one loaded cross-chunk Transporter network retains existing Sorter priority',()=>{
  const f=fixture();
  for(const x of [1,0,-1,-2,-3])f.put(
    'hartlogistics:transporter',x,70,4);
  const network=f.network();
  assert.ok(network);
  assert.equal(network.entries.length,2);
  assert.equal(f.choose(COBBLE).entry,f.filter);
  assert.equal(network.fingerprint.includes('-3,70,4'),true);
});
test('an unloaded block on the other side of a chunk boundary freezes graph-wide custody',()=>{
  const f=fixture();
  for(const x of [1,0,-1])f.put('hartlogistics:transporter',x,70,4);
  assert.ok(f.network());
  f.missing.add('-1,70,3');
  assert.equal(f.network(),undefined);
  assert.equal(f.choose(COBBLE),undefined);
});
test('a long loop cannot exceed bounded 128-pipe discovery budget',()=>{
  const f=fixture();
  // Initial two pipes at x=2,3. Add 127 more contiguous pipes.
  for(let x=1;x>=-125;x--)f.put('hartlogistics:transporter',x,70,4);
  assert.equal(f.network(),undefined);
});
test('a loaded downward bend can traverse lower Y without changing source ownership',()=>{
  const f=fixture();
  for(const x of [1,0,-1])f.put('hartlogistics:transporter',x,70,4);
  f.put('hartlogistics:transporter',-1,69,4);
  assert.ok(f.network());
  assert.equal(f.choose(COBBLE).entry,f.filter);
});

test('one physical Transporter input cannot serve two disconnected pipe networks',()=>{
  const f=fixture();
  f.put('minecraft:barrel',1,70,4,f.inventories[0]);
  assert.ok(f.network());
  f.put('hartlogistics:transporter',0,70,4);
  assert.equal(f.network(),undefined);
  assert.equal(f.choose(COBBLE),undefined);
});

test('pipe ACK accepts its filled final slot, pre-move admission still refuses it',()=>{
  const f=fixture(),choice=f.choose(COBBLE);
  choice.dest.container.fill({typeId:'minecraft:stone',amount:64});
  assert.equal(f.context.ucePipeDestinationStillValid(f.receiver,COBBLE,choice),false);
  assert.equal(f.context.ucePipeDestinationStillValid(f.receiver,COBBLE,choice,true),true);
  f.filter.m='bypass';
  assert.equal(f.context.ucePipeDestinationStillValid(f.receiver,COBBLE,choice,true),false);
  f.filter.m='filter';
  f.missing.add('3,70,3');
  assert.equal(f.context.ucePipeDestinationStillValid(f.receiver,COBBLE,choice,true),false);
});
test('direct Sorter source winner is preserved for the last-slot ACK',()=>{
  const f=fixture();
  f.put('minecraft:hopper',3,71,4);
  const col={d:f.dim.id,source:{x:3,y:71,z:4},
    sorters:[f.filter,f.fallback]};
  f.context.getDimension=()=>f.dim;
  f.context.blockContainer=b=>b?.typeId==='minecraft:hopper'
    ?{size:5,isValid:true,getItem:()=>COBBLE}
    :b?.getComponent('minecraft:inventory')?.container;
  f.context.hopperIsRedstoneLocked=()=>false;
  f.context.supportedStorage=b=>b?.typeId==='minecraft:barrel';
  f.context.findAcceptSlot=(container,item)=>{
    for(let i=0;i<container.size;i++)
      if(container.getItem(i)===undefined)return {slot:i};
    return undefined;
  };
  const destination=f.chestA.getComponent('minecraft:inventory').container;
  destination.fill({typeId:'minecraft:stone',amount:64});
  destination.setItem(0,undefined);
  const original=f.context.uceSorterColumnWinner(col,COBBLE);
  assert.equal(original?.entry,f.filter);
  destination.setItem(0,{typeId:'minecraft:cobblestone',amount:64});
  assert.notEqual(f.context.uceSorterColumnWinner(col,COBBLE)?.entry,f.filter);
  assert.equal(f.context.uceSorterColumnWinner(col,COBBLE,original)?.entry,f.filter);
  f.filter.m='bypass';
  assert.notEqual(f.context.uceSorterColumnWinner(col,COBBLE,original)?.entry,f.filter);
});

test('ordinary Receiver pipe egress merges into filtered partial stack before wildcard',()=>{
  const f=fixture();
  const dest=f.chestA.getComponent('minecraft:inventory').container;
  const cobble={typeId:'minecraft:cobblestone',amount:1,maxAmount:64,
    isStackableWith:s=>s?.typeId==='minecraft:cobblestone'};
  dest.fill({typeId:'minecraft:stone',amount:64,maxAmount:64});
  dest.setItem(8,{typeId:'minecraft:cobblestone',amount:60,maxAmount:64,
    isStackableWith:s=>s?.typeId==='minecraft:cobblestone'});
  const choice=f.context.uceChoosePipeDestination(
    f.receiver,cobble,false,undefined,true);
  assert.equal(choice.entry,f.filter);
  assert.equal(choice.slot,8);
  assert.equal(choice.partialOutput,true);
  assert.equal(choice.beforeAmount,60);
  assert.equal(choice.room,4);
  assert.equal(f.context.ucePipeDestinationStillValid(
    f.receiver,cobble,choice),true);
  dest.setItem(8,{typeId:'minecraft:cobblestone',amount:64,maxAmount:64,
    isStackableWith:s=>s?.typeId==='minecraft:cobblestone'});
  assert.equal(f.context.ucePipeDestinationStillValid(
    f.receiver,cobble,choice,true),true,
    'same admitted route may ACK exact credited partial slot');
  assert.equal(f.context.ucePipeDestinationStillValid(
    f.receiver,cobble,choice,false),false,
    'pre-move selection must not claim a full slot');
});
test('metadata-rich/uncertified pipe output still requires an empty destination',()=>{
  const f=fixture(),dest=f.chestA.getComponent('minecraft:inventory').container;
  const item={typeId:'minecraft:enchanted_book',amount:1,maxAmount:1};
  f.filter.f={match:{typeId:'minecraft:enchanted_book'}};
  dest.fill({typeId:'minecraft:enchanted_book',amount:1,maxAmount:1});
  const choice=f.context.uceChoosePipeDestination(f.receiver,item);
  assert.equal(choice.entry,f.fallback);
});
