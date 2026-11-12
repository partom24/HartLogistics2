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
  const receiver={id:'R',d:dim.id,x:4,y:70,z:4,present:true};
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
    receiverAt:r=>r===receiver?receiverBlock:undefined,
    sorterAt:e=>e===filter?nearerSorter:e===fallback?fartherSorter:undefined,
    facingOffset:()=>({x:0,y:0,z:1}),
    sorterMode:e=>e.m,blockIsRedstonePowered:b=>!!b.powered,
    matchesFilter:(item,f)=>item.typeId===f.match.typeId,
    enchantments:stack=>stack?.ench||[]
  };
  vm.runInNewContext(src,context);
  return {context,dim,blocks,missing,k,put,receiver,receiverBlock,
    nearPipe,farPipe,nearerSorter,fartherSorter,chestA,chestB,filter,
    fallback,inventories,FACES,
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
test('second Receiver on graph refuses ambiguous source owner',()=>{
  const f=fixture();
  f.put('hartsorter:receiver',1,70,4);
  assert.equal(f.network(),undefined);
});
test('double chest output is refused; no aliasing to same container',()=>{
  const f=fixture();f.filter.m='bypass';
  f.chestB.typeId='minecraft:chest';
  f.put('minecraft:chest',2,69,6);
  assert.equal(f.choose(COBBLE),undefined);
});
test('redstone-paused Receiver or pipes refuse route',()=>{
  const f=fixture();f.receiverBlock.powered=true;
  assert.equal(f.network(),undefined);
  f.receiverBlock.powered=false;f.farPipe.powered=true;
  assert.equal(f.network(),undefined);
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
