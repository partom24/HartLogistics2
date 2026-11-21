// Minimal offline simulation. This is NOT a Bedrock runtime test.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../behavior_pack/scripts/main.js');
const topology=fs.readFileSync(path.join(path.dirname(root),'topology.js'),'utf8').replace(/export /g,'');
const src=fs.readFileSync(root,'utf8').replace(/import\s*\{[^}]*\}\s*from\s*'@minecraft\/server';/s,'');
const queued=[],intervals=[],handlers={};
const makeEvents=()=>({subscribe(fn){(this.handlers||(this.handlers=[])).push(fn);}});
const system={run(fn){queued.push({fn,t:0});},runTimeout(fn,t=0){queued.push({fn,t});},
    runInterval(fn,interval){intervals.push({fn,interval});},afterEvents:{scriptEventReceive:makeEvents()}};
class Stack {
  constructor(typeId,amount=1,props={}){this.typeId=typeId;this.amount=amount;this.maxAmount=props.maxAmount||64;this.nameTag=props.nameTag||'';this.props={...props};}
  clone(){return new Stack(this.typeId,this.amount,this.props);}
  isStackableWith(other){return this.maxAmount>1&&other.maxAmount>1&&this.typeId===other.typeId&&this.nameTag===other.nameTag&&JSON.stringify(this.props)===JSON.stringify(other.props);}
  getComponent(){return undefined;}
  getLore(){return [];}
  getCanDestroy(){return [];}
  getCanPlaceOn(){return [];}
  getDynamicPropertyIds(){return [];}
}
class Container {
  constructor(size){this.size=size;this.slots=Array(size).fill(undefined);}
  getItem(i){return this.slots[i]?.clone();}
  setItem(i,v){this.slots[i]=v?.clone();}
  addItem(s){
    let n=s.amount;
    for(let i=0;i<this.size&&n;i++){
      const cell=this.slots[i];
      if(cell&&!cell.isStackableWith(s))continue;
      if(!cell){const m=Math.min(n,s.maxAmount);this.slots[i]=s.clone();this.slots[i].amount=m;n-=m;}
      else{const m=Math.min(n,cell.maxAmount-cell.amount);cell.amount+=m;n-=m;}
    }
    return n?new Stack(s.typeId,n,s.props):undefined;
  }
  transferItem(i,to){
    const before=this.getItem(i);if(!before)return undefined;
    const rem=to.addItem(before);this.setItem(i,rem);
    return rem;
  }
  count(type){return this.slots.reduce((n,s)=>n+(s?.typeId===type?s.amount:0),0);}
}
const dim={id:'minecraft:overworld',getBlock(p){return getBlock(p);}};
const blocks=new Map(),properties=new Map();
const posKey=p=>`${p.x},${p.y},${p.z}`;
function getBlock(p){const k=posKey(p);if(!blocks.has(k))blocks.set(k,makeBlock('minecraft:air',p));return blocks.get(k);}
function makeBlock(typeId,p){
  const b={typeId,location:{...p},dimension:dim,states:{'minecraft:cardinal_direction':'south','hartlogistics:mode':'wildcard'},inv:undefined};
  if(typeId==='minecraft:hopper')b.inv=new Container(5);
  if(typeId==='minecraft:chest')b.inv=new Container(27);
  if(typeId==='minecraft:barrel')b.inv=new Container(27);
  b.getComponent=(name)=>name==='minecraft:inventory'&&b.inv?{container:b.inv}:undefined;
  b.setType=(id)=>{b.typeId=id;b.inv=id==='minecraft:barrel'||id==='minecraft:chest'?new Container(27):id==='minecraft:hopper'?new Container(5):undefined;};
  b.permutation={getState(n){return b.states[n];},withState(n,v){b.states[n]=v;return b.permutation;}};
  b.setPermutation=(per)=>{b.permutation=per;};return b;
}
function place(type,x,y,z){blocks.set(`${x},${y},${z}`,makeBlock(type,{x,y,z}));return getBlock({x,y,z});}
const world={tickingAreaManager:{maxChunkCount:1000,hasCapacity(){return true;},createTickingArea(){return {then(ready){ready();}};},removeTickingArea(){}},getDimension(){return dim;},getDynamicProperty(k){return properties.get(k);},setDynamicProperty(k,v){if(v===undefined)properties.delete(k);else properties.set(k,v);},getDynamicPropertyIds(){return [...properties.keys()];},beforeEvents:{itemUse:makeEvents(),playerInteractWithBlock:makeEvents(),playerBreakBlock:makeEvents()},afterEvents:{playerInteractWithBlock:makeEvents(),playerPlaceBlock:makeEvents(),entityHitBlock:makeEvents(),playerBreakBlock:makeEvents()}};
const context=vm.createContext({world,system,ItemStack:Stack,BlockPermutation:{resolve(){return {};}},EquipmentSlot:{Mainhand:'Mainhand'},EnchantmentTypes:{get(){return undefined;}},Potions:{},console:{warn(){}}});
vm.runInContext(src.replace(/import \{ discover[^;]+;/,()=>topology),context,{filename:'main.js'});
function event(id){for(const cb of system.afterEvents.scriptEventReceive.handlers){cb({id,sourceEntity:{sendMessage(){}}});}}
function drain(){for(let t=0;t<10&&queued.length;t++){
    const q=queued.splice(0);for(const x of q){if(x.t<=0)x.fn();else queued.push({fn:x.fn,t:x.t-1});}
}}
// Two independently translated and rotated installations.
function bank(x,y,z,dx,dz,length,height) {
  const receiver=place('hartsorter:receiver',x-dx,y,z-dz);
  const collector=place('hartsorter:collector',x-4*dx,y,z-4*dz);
  const input=place('minecraft:barrel',collector.location.x,y+1,collector.location.z).inv;
  const key=(kind,b)=>'hartlab:'+kind+'_o_'+Object.values(b.location).join('_');
  const rk=key('r',receiver), ck=key('c',collector);
  properties.set(ck,JSON.stringify({receiver:rk}));
  const hoppers=[],sorters=[],chests=[];
  for(let i=0;i<length;i++){
    const X=x+i*dx,Z=z+i*dz;
    const hopper=place('minecraft:hopper',X,y,Z);
    hopper.states.facing_direction=dx===-1?4:3;
    hoppers.push(hopper);
    for(let j=1;j<=height;j++){
      const sorter=place('hartsorter:sorter',X,y-j,Z);
      sorters.push(sorter);
      const chest=place('minecraft:chest',X+dz,y-j,Z-dx);
      chests.push(chest.inv);
      const id='test:item_'+i+'_'+j;
      properties.set(key('s',sorter),JSON.stringify({d:dim.id,...sorter.location,m:'filter',f:{match:{typeId:id,enchIds:[]}}}));
    }
  }
  return {rk,input,hoppers,sorters,chests};
}
const banks=[bank(125,-18,-77,-1,0,10,4),bank(-307,92,48,0,1,3,2)];
drain();
const snapshot=JSON.stringify([...properties]);
event('hartlab:setup_io');drain();
assert.equal(JSON.stringify([...properties]),snapshot);
function evalBank(b,expr){
  context.receiverKey=b.rk;
  return vm.runInContext('(()=>{const b=labBanks[receiverKey];return '+expr+'})()',context);
}
for(const b of banks){
  assert.equal(evalBank(b,'labBuildIndex(b).total'),b.sorters.length);
  for(const s of b.sorters){
    const i=b.sorters.indexOf(s),id=JSON.parse(properties.get('hartlab:s_o_'+Object.values(s.location).join('_'))).f.match.typeId;
    context.probe=new Stack(id);
    assert.equal(posKey(evalBank(b,'labSelectTarget(b,probe).p')),posKey(s.location));
  }
  console.log('Discovery:',b.hoppers.length,'Hoppers,',b.sorters.length,'Sorters,',evalBank(b,'b.reads'),'block reads');
}
const [a,b]=banks;
a.input.setItem(0,new Stack('test:item_9_4',12));
b.input.setItem(0,new Stack('test:item_2_2',1,{maxAmount:1,nameTag:'Unbroken'}));
function ticks(n){
  for(let t=1;t<=n;t++){
    for(const i of intervals)i.fn();
    if(t%8===0)for(const {hoppers} of banks)for(let j=hoppers.length-2;j>=0;j--){
      const h=hoppers[j].inv,slot=h.slots.findIndex(Boolean);
      if(slot<0)continue;
      const s=h.getItem(slot),unit=s.clone();unit.amount=1;
      if(!hoppers[j+1].inv.addItem(unit)){s.amount--;h.setItem(slot,s.amount?s:undefined);}
    }
    drain();
  }
}
world.tickingAreaManager.maxChunkCount=0;
ticks(16);
assert.equal(a.input.getItem(0).amount,12);
world.tickingAreaManager.maxChunkCount=1000;
const pendingLoads=[];
world.tickingAreaManager.createTickingArea=()=>({then(resolve){pendingLoads.push(resolve);}});
ticks(16);
assert.ok(pendingLoads.length);
assert.equal(a.input.getItem(0).amount,12);
for(const resolve of pendingLoads)resolve();
world.tickingAreaManager.createTickingArea=()=>({then(resolve){resolve();}});
ticks(300);
assert.equal(a.chests.at(-1).count('test:item_9_4'),12);
assert.equal(b.chests.at(-1).getItem(0).nameTag,'Unbroken');
assert.equal(evalBank(a,'b.discoveries'),1);
const chest=a.chests.at(-1);
for(let i=0;i<chest.size;i++)chest.setItem(i,new Stack('minecraft:dirt',64));
a.input.setItem(0,new Stack('test:item_9_4',3));ticks(40);
assert.equal(a.input.getItem(0).amount,3);
const last=a.hoppers.at(-1);
last.states.facing_direction=5;event('hartlab:refresh');drain();
assert.match(evalBank(a,'b.blocked'),/loop/);
console.log('PASS: all indexed positions, physical delivery, metadata, full destination, loop, cached discovery and read-only setup');
last.states.facing_direction=4;
const start=a.hoppers[0].location;
const feeder=place('minecraft:hopper',start.x,start.y-1,start.z);
event('hartlab:refresh');drain();
assert.match(evalBank(a,'b.blocked'),/downward pull/);
feeder.setType('hartsorter:sorter');
event('hartlab:refresh');drain();
assert.equal(evalBank(a,'b.net.lane.length'),10);
// An offset stack can be registered explicitly without moving it.
const remote=place('hartsorter:sorter',start.x,start.y+5,start.z+4);
properties.set(a.rk,JSON.stringify({inlet:start,columns:{[posKey(remote.location)]:{tap:posKey(start),anchor:remote.location}}}));
event('hartlab:refresh');drain();
assert.equal(evalBank(a,'labBuildIndex(b).total'),41);
const read=dim.getBlock;
dim.getBlock=p=>posKey(p)===posKey(last.location)?undefined:read(p);
event('hartlab:refresh');drain();
assert.match(evalBank(a,'b.blocked'),/Loading discovery chunk/);
dim.getBlock=read;
event('hartlab:refresh');drain();
assert.equal(evalBank(a,'b.net.lane.length'),10);
// Restart with an item physically in the inlet. Recovery must never replay dispatch.
chest.slots.fill(undefined);ticks(8);
assert.ok(properties.get('hartlab:transport_020').includes(a.rk));
const before=a.hoppers.reduce((sum,h)=>sum+h.inv.count('test:item_9_4'),0);
assert.equal(before,3);
vm.runInContext('labLoadState()',context);
assert.equal(evalBank(a,'b.recovery'),true);
ticks(180);
assert.equal(chest.count('test:item_9_4'),0);
assert.equal(last.inv.count('test:item_9_4'),3);
assert.equal(a.input.count('test:item_9_4'),0);
console.log('PASS: competing pull, registered column, unavailable chunk, restart without replay');
// Rebuild one output around a corner; inspect a newly added vertical output.
last.states.facing_direction=2;
const turn=place('minecraft:hopper',last.location.x,last.location.y,last.location.z-1);
turn.states.facing_direction=0;
const drop=place('minecraft:hopper',turn.location.x,turn.location.y-1,turn.location.z);
drop.states.facing_direction=2;
event('hartlab:refresh');drain();
assert.equal(evalBank(a,'b.net.lane.length'),12);
console.log('PASS: extension around a corner and down');
// The chest above the Collector and the side feeder share a double-chest supply in LAB.
// Model the split just after the native pull. Only the feeder may be admitted.
const collector=[...blocks.values()].find(block=>block.typeId==='hartsorter:collector' &&
  block.location.z===b.hoppers[0].location.z-4);
const cp=collector.location;
const intake=place('minecraft:hopper',cp.x-1,cp.y,cp.z);
intake.states.facing_direction=5;
const brick='test:item_2_2';
const initial=b.chests.at(-1).count(brick);
b.input.setItem(0,new Stack(brick,63));
intake.inv.setItem(0,new Stack(brick,1));
intake.states.toggle_bit=true;
ticks(32);
assert.equal(b.input.count(brick),63);
assert.equal(intake.inv.count(brick),1);
intake.states.toggle_bit=false;
ticks(96);
assert.equal(intake.inv.count(brick),0);
assert.equal(b.input.count(brick),63);
assert.equal(b.chests.at(-1).count(brick),initial+1);
// Model subsequent pulls by the native feeder while the receiver is busy.
for(let i=0;i<63;i++){
  const sourceStack=b.input.getItem(0);sourceStack.amount--;
  b.input.setItem(0,sourceStack.amount?sourceStack:undefined);
  intake.inv.addItem(new Stack(brick));ticks(8);
}
ticks(256);
assert.equal(b.input.count(brick),0);
assert.equal(intake.inv.count(brick),0);
assert.equal(b.chests.at(-1).count(brick),initial+64);
console.log('PASS: locked and empty feeder reserve intake, source 63 + feeder 1 delivered through feeder');

// Each chest has one empty slot. Seven stacks must fill column one,
// then the lowest three chests of column two. Fixture arrays run top to bottom.
const overflow=bank(-182,43,217,0,1,2,4);
banks.push(overflow);
const plank='minecraft:oak_planks';
for(const sorter of overflow.sorters){
  const key='hartlab:s_o_'+Object.values(sorter.location).join('_');
  const config=JSON.parse(properties.get(key));
  config.f.match.typeId=plank;
  properties.set(key,JSON.stringify(config));
}
for(const chest of overflow.chests){
  for(let i=1;i<chest.size;i++)chest.setItem(i,new Stack('minecraft:dirt',64));
}
for(let slot=0;slot<7;slot++)overflow.input.setItem(slot,new Stack(plank,64));
vm.runInContext('labLoadState()',context);
ticks(3000);
assert.deepEqual(overflow.chests.map(c=>c.count(plank)),[64,64,64,64,0,64,64,64]);
assert.equal(overflow.input.count(plank),0);
assert.equal(evalBank(overflow,'b.confirmed'),448);
console.log('PASS: seven-stack overflow fills second column bottom up');

// Interrupt after one verified arrival; model native drainage to the lane output.
const rb=bank(817,41,-224,0,1,2,1);
banks.push(rb);
vm.runInContext('labLoadState()',context);
rb.input.setItem(0,new Stack('test:item_1_1',64));
for(let i=0;i<20 && !rb.chests[1].count('test:item_1_1');i++)ticks(8);
const deposited=rb.chests[1].count('test:item_1_1');
assert.ok(deposited>0 && deposited<64);
evalBank(rb,'++b.generation');
ticks(8);
assert.equal(evalBank(rb,'b.recovery'),true);
const output=new Container(27);
for(const h of rb.hoppers)for(let slot=0;slot<h.inv.size;slot++){
  if(h.inv.getItem(slot))h.inv.transferItem(slot,output);
}
ticks(128);
assert.equal(evalBank(rb,'b.recovery'),false);
assert.equal(evalBank(rb,'b.dispatched'),64);
assert.equal(evalBank(rb,'b.confirmed'),deposited);
assert.equal(evalBank(rb,'b.catches'),output.count('test:item_1_1'));
assert.equal(evalBank(rb,'b.confirmed+b.catches'),64);
console.log('PASS: interrupted stack reconciled with the physical destination and lane output');

// Keep the Hopper bank operating while a second Receiver uses only Transporters.
const pipeBank=bank(1024,31,-512,-1,0,10,4);
const pipeId='hartlogistics:transporter';
for(const h of pipeBank.hoppers)h.setType(pipeId);
const wildcard=pipeBank.sorters[0];
properties.delete('hartlab:s_o_'+Object.values(wildcard.location).join('_'));
vm.runInContext('labLoadState()',context);
const cargo='test:item_9_4';
pipeBank.input.setItem(0,new Stack(cargo,64,{nameTag:'Far end'}));
rb.input.setItem(0,new Stack('test:item_0_1',5));
ticks(160);
assert.equal(evalBank(pipeBank,'b.net.lane.length'),10);
assert.equal(evalBank(pipeBank,'b.cache.total'),40);
assert.equal(pipeBank.chests.at(-1).getItem(0).nameTag,'Far end');
assert.equal(pipeBank.chests.at(-1).count(cargo),64);
assert.equal(pipeBank.chests[0].count(cargo),0);
assert.equal(rb.chests[0].count('test:item_0_1'),5);
const destination=pipeBank.chests.at(-1);
for(let i=0;i<destination.size;i++)destination.setItem(i,new Stack('minecraft:dirt',64));
pipeBank.input.setItem(0,new Stack(cargo,32));
ticks(16);
assert.equal(pipeBank.input.count(cargo),32);
destination.setItem(0,undefined);
pipeBank.hoppers[4].setType('minecraft:air');
ticks(1);
assert.equal(destination.count(cargo),0);
assert.equal(pipeBank.input.count(cargo),32);
pipeBank.hoppers[4].setType(pipeId);
event('hartlab:refresh');drain();ticks(32);
assert.equal(destination.count(cargo),32);
assert.equal(evalBank(pipeBank,'b.confirmed'),96);
assert.equal(pipeBank.input.count(cargo),0);
console.log('PASS: simultaneous Hopper and Transporter banks, 10 pipes/40 Sorters, filter priority, named stack, full chest, interrupted path and reconnection');

// Parallel rows with one block of clearance between their footprints. Use the
// player link interaction with empty inputs and inspect the cache directly.
const adjacentH=bank(2200,80,1024,-1,0,10,4);
const adjacentT=bank(2200,80,1027,-1,0,10,4);
const player={id:'builder',sendMessage(){}};
function linkRig(z){
  const collector=getBlock({x:2204,y:80,z}),receiver=getBlock({x:2201,y:80,z});
  Object.assign(context,{builder:player,collectorBlock:collector,receiverBlock:receiver});
  properties.delete('hartlab:c_o_2204_80_'+z);
  vm.runInContext('selectCollector(builder,collectorBlock);useReceiver(builder,receiverBlock)',context);
}
for(const h of adjacentT.hoppers)h.setType('hartlogistics:transporter');
adjacentT.hoppers[0].setType('minecraft:air');
linkRig(1024);linkRig(1027);drain();
assert.equal(evalBank(adjacentH,'b.cache.total'),40);
assert.equal(evalBank(adjacentT,'b.net'),null);
const inlet=adjacentT.hoppers[0];
inlet.setType('hartlogistics:transporter');
for(const fn of world.afterEvents.playerPlaceBlock.handlers)fn({block:inlet,player});
drain();
assert.equal(evalBank(adjacentT,'b.cache.total'),40);
assert.equal(evalBank(adjacentT,'b.net.lane.length'),10);
const hd=evalBank(adjacentH,'b.discoveries'),td=evalBank(adjacentT,'b.discoveries');
ticks(80);
assert.equal(evalBank(adjacentH,'b.discoveries'),hd);
assert.equal(evalBank(adjacentT,'b.discoveries'),td);
banks.push(adjacentH);
adjacentH.input.setItem(0,new Stack('test:item_9_4',5,{nameTag:'Hopper bank'}));
adjacentT.input.setItem(0,new Stack('test:item_9_4',7,{nameTag:'Transporter bank'}));
ticks(200);
assert.equal(adjacentH.chests.at(-1).count('test:item_9_4'),5);
assert.equal(adjacentT.chests.at(-1).count('test:item_9_4'),7);
console.log('PASS: adjacent empty banks register on linking and construction, stay cached at idle, and deliver independently');

// Physical bank ingress, counted ordinary overflow, and a partial remote refill.
for(const [mode,z] of [['hopper',3500],['pipe',3510]]){
  const rig=bank(6000,75,z,-1,0,3,2);
  if(mode==='hopper')banks.push(rig);
  else for(const h of rig.hoppers)h.setType('hartlogistics:transporter');
  const itemId='minecraft:cobbled_deepslate';
  const sorter=rig.sorters.at(-1),dest=rig.chests.at(-1);
  const sk='hartlab:s_o_'+Object.values(sorter.location).join('_');
  const config=JSON.parse(properties.get(sk));config.f.match.typeId=itemId;
  properties.set(sk,JSON.stringify(config));
  const member=place('hartlogistics:bulk_storage',6000,75,z-1);
  const ledger='hartlab:bulk_o_6000_75_'+(z-1);
  vm.runInContext('labLoadState()',context);drain();
  assert.equal(evalBank(rig,'b.net.bulk.length'),1);
  for(let i=0;i<dest.size;i++)dest.setItem(i,new Stack(itemId,64));
  rig.input.setItem(0,new Stack(itemId,64));ticks(80);
  assert.equal(rig.input.count(itemId),0);
  assert.equal(JSON.parse(properties.get(ledger)).items[itemId],64);
  assert.equal(evalBank(rig,'b.dispatched'),0);
  let breakAttempt={block:member,player,cancel:false};
  for(const cb of world.beforeEvents.playerBreakBlock.handlers)cb(breakAttempt);
  assert.equal(breakAttempt.cancel,true);
  dest.setItem(0,new Stack(itemId,32));ticks(600);
  assert.equal(dest.count(itemId),27*64);
  assert.equal(JSON.parse(properties.get(ledger)).items[itemId],32);
  assert.equal(evalBank(rig,'b.confirmed'),32);
  // Native Receiver supply takes priority over the remaining Bulk balance.
  dest.setItem(0,new Stack(itemId,32));
  rig.input.setItem(0,new Stack(itemId,48));ticks(600);
  assert.equal(dest.count(itemId),27*64);
  assert.equal(JSON.parse(properties.get(ledger)).items[itemId],48);
  rig.input.setItem(0,new Stack(itemId,1,{nameTag:'Keep my identity'}));ticks(64);
  assert.equal(rig.input.count(itemId),1);
  assert.equal(JSON.parse(properties.get(ledger)).items[itemId],48);
  console.log('PASS: '+mode+' direct Bulk overflow, partial refill, incoming priority, removal protection and named-item exclusion');
}
const caps=bank(8000,80,200,-1,0,4,1);
for(const h of caps.hoppers)h.setType('hartlogistics:transporter');
const ordinary='minecraft:cobblestone';
const specialKey='hartlab:s_o_8000_79_200';
const special=JSON.parse(properties.get(specialKey));special.f.match.typeId=ordinary;
properties.set(specialKey,JSON.stringify(special));
properties.delete('hartlab:s_o_7997_79_200'); // last Sorter is wildcard
for(let i=0;i<27;i++)caps.chests[0].setItem(i,new Stack(ordinary,64));
place('hartlogistics:bulk_storage',8000,80,199);
place('hartlogistics:bulk_storage',7997,80,199);
const firstBulk='hartlab:bulk_o_8000_80_199',lastBulk='hartlab:bulk_o_7997_80_199';
const stored=n=>JSON.stringify({items:{[ordinary]:n},provisional:{}});
properties.set(firstBulk,stored(199980));properties.set(lastBulk,stored(199990));
vm.runInContext('labLoadState()',context);drain();
caps.input.setItem(0,new Stack(ordinary,64));
ticks(96);
assert.equal(JSON.parse(properties.get(firstBulk)).items[ordinary],200000);
assert.equal(JSON.parse(properties.get(lastBulk)).items[ordinary],200000);
assert.equal(caps.chests.at(-1).count(ordinary),34);
caps.hoppers[2].setType('minecraft:air');
properties.set(lastBulk,stored(10));caps.input.setItem(0,new Stack(ordinary,64));
ticks(64);
assert.equal(caps.input.count(ordinary),64);
assert.equal(JSON.parse(properties.get(lastBulk)).items[ordinary],10);
caps.hoppers[2].setType('hartlogistics:transporter');
caps.input.setItem(0,undefined);
const pending=JSON.parse(stored(10));
pending.pending={kind:'receiver credit',item:ordinary,amount:12,provisional:false};
properties.set(lastBulk,JSON.stringify(pending));
ticks(96);
assert.equal(JSON.parse(properties.get(lastBulk)).items[ordinary],22);
pending.pending.kind='native intake';properties.set(lastBulk,JSON.stringify(pending));
caps.input.setItem(0,new Stack(ordinary,64));ticks(64);
assert.equal(caps.input.count(ordinary),64);
assert.equal(JSON.parse(properties.get(lastBulk)).items[ordinary],10);
console.log('PASS: multiple Bulk members, verified exhaustion, disconnected path and restart journal phases');

// Cold discovery crosses three consecutive chunk boundaries without player movement.
const coldBank=bank(4804,50,203,-1,0,52,1);
const unloaded=new Set([299,298,297]);
const originalRead=dim.getBlock;
dim.getBlock=function(p){
    if(p.z===203 && unloaded.has(Math.floor(p.x/16)))return undefined;
    return originalRead.call(this,p);
};
const awakened=[];
world.tickingAreaManager.createTickingArea=(id,options)=>({then(resolve){
    const x=Math.floor(options.from.x/16);
    if(unloaded.delete(x))awakened.push(x);
    resolve();
}});
context.coldReceiver=coldBank.rk;
vm.runInContext('labDiscover(labBankForReceiver(coldReceiver))',context);
ticks(120);
assert.deepEqual(awakened,[299,298,297]);
assert.equal(evalBank(coldBank,'b.net.lane.length'),52);
assert.equal(evalBank(coldBank,'b.dispatched'),0);
dim.getBlock=originalRead;
console.log('PASS: discovery automatically loads three successive unavailable chunks');
