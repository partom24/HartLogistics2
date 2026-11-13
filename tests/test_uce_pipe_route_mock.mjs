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
function fixture(){
  const dim={id:'minecraft:overworld'},blocks=new Map(),
    missing=new Set(),entries=[],FACES=[
      ['north',0,0,-1],['south',0,0,1],['east',1,0,0],
      ['west',-1,0,0],['up',0,1,0],['down',0,-1,0]
    ].map(([name,x,y,z])=>({name,x,y,z}));
  const k=p=>p.x+','+p.y+','+p.z;
  const inventories=[];
  const containers=()=>{const items=Array(27).fill(undefined);
    const c={size:27,isValid:true,getItem:i=>items[i],
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
  vm.runInNewContext(src,context);
  return {context,dim,blocks,missing,k,put,receiver,registeredReceivers,
    receiverBlock,
    nearPipe,farPipe,nearerSorter,fartherSorter,chestA,chestB,filter,
    fallback,inventories,FACES,entries,newContainer:containers,
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
  f.put('minecraft:shulker_box',1,70,4,
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
test('double chest output is refused; no aliasing to same container',()=>{
  const f=fixture();f.filter.m='bypass';
  f.chestB.typeId='minecraft:chest';
  f.put('minecraft:chest',2,69,6);
  assert.equal(f.choose(COBBLE),undefined);
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
test('a source below Receiver level and double-chest aliases fail the entire graph',()=>{
  const low=fixture();
  // This block is directly below a pipe, at y=69 while Receiver is y=70.
  low.put('minecraft:barrel',3,69,4,low.inventories[0]);
  assert.equal(low.network(),undefined);
  const f=fixture();
  const chest=f.put('minecraft:chest',1,70,4,f.inventories[0]);
  f.put('minecraft:chest',1,70,5,f.inventories[0]);
  assert.equal(f.network(),undefined);
  assert.equal(chest.typeId,'minecraft:chest');
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
