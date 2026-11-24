// Minimal offline simulation. This is NOT a Bedrock runtime test.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../behavior_pack/scripts/main.js');
const topology=fs.readFileSync(path.join(path.dirname(root),'topology.js'),'utf8').replace(/export /g,'');
const src=fs.readFileSync(root,'utf8').replace(/import\s*\{[^}]*\}\s*from\s*'@minecraft\/server';/s,'');
const forms=[];
class MockActionForm {
    constructor(){this.buttons=[];}
    title(s){this.heading=s;return this;}
    body(s){this.description=s;return this;}
    button(s){this.buttons.push(s);return this;}
    show(player){this.player=player;forms.push(this);return new Promise(resolve=>{this.answer=resolve;});}
}
const queued=[],intervals=[],handlers={};
const makeEvents=()=>({subscribe(fn){(this.handlers||(this.handlers=[])).push(fn);}});
const system={beforeEvents:{startup:makeEvents()},run(fn){queued.push({fn,t:0});},runTimeout(fn,t=0){queued.push({fn,t});},
    runInterval(fn,interval){intervals.push({fn,interval});},afterEvents:{scriptEventReceive:makeEvents()}};
class Stack {
  constructor(typeId,amount=1,props={}){this.typeId=typeId;this.amount=amount;this.maxAmount=props.maxAmount||64;this.nameTag=props.nameTag||'';this.props={...props};}
  get isStackable(){return this.maxAmount>1 && !Object.keys(this.props).length;}
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
  get emptySlotsCount(){return this.slots.filter(item=>!item).length;}
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
  moveItem(i,j,to){assert.equal(to.getItem(j),undefined);to.slots[j]=this.slots[i];this.slots[i]=undefined;}
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
  if(['hartsorter:collector','hartsorter:receiver'].includes(typeId))b.states['hartlogistics:powered']=false;
  if(typeId==='minecraft:hopper')b.inv=new Container(5);
  if(typeId==='minecraft:chest')b.inv=new Container(27);
  if(typeId==='minecraft:barrel')b.inv=new Container(27);
  b.getComponent=(name)=>name==='minecraft:inventory'&&b.inv?{container:b.inv}:undefined;
  b.setType=(id)=>{b.typeId=id;b.inv=id==='minecraft:barrel'||id==='minecraft:chest'?new Container(27):id==='minecraft:hopper'?new Container(5):undefined;};
  b.permutation={getState(n){return b.states[n];},withState(n,v){b.states[n]=v;return b.permutation;}};
  b.setPermutation=(per)=>{b.permutation=per;};return b;
}
function place(type,x,y,z){blocks.set(`${x},${y},${z}`,makeBlock(type,{x,y,z}));return getBlock({x,y,z});}
const world={tickingAreaManager:{maxChunkCount:1000,hasCapacity(){return true;},createTickingArea(){return {then(ready){ready();}};},removeTickingArea(){}},getDimension(){return dim;},getDynamicProperty(k){return properties.get(k);},setDynamicProperty(k,v){if(v===undefined)properties.delete(k);else properties.set(k,v);},getDynamicPropertyIds(){return [...properties.keys()];},beforeEvents:{itemUse:makeEvents(),playerInteractWithBlock:makeEvents(),playerBreakBlock:makeEvents()},afterEvents:{playerLeave:makeEvents(),playerInteractWithBlock:makeEvents(),playerPlaceBlock:makeEvents(),entityHitBlock:makeEvents(),playerBreakBlock:makeEvents()}};
function newRuntime(isolatedMigration=false){
    const context=vm.createContext({world,system,ActionFormData:MockActionForm,isolatedMigration,ItemStack:Stack,BlockPermutation:{resolve(){return {};}},EquipmentSlot:{Mainhand:'Mainhand'},EnchantmentTypes:{get(){return undefined;}},Potions:{},console:{warn(){}}});
    const q4Lab=fs.readFileSync(path.join(path.dirname(root),'q4Lab.js'),'utf8').replace(/export /g,'');
    vm.runInContext(src.replace("import { ActionFormData } from '@minecraft/server-ui';",'').replace(/import \{ isolatedMigration[^;]+;/,'').replace(/export function /g,'function ').replace(/import \{ q4LabStep[^;]+;/,()=>q4Lab).replace(/import \{ discover[^;]+;/,()=>topology),context,{filename:'main.js'});
    return context;
}
const context=newRuntime();
function event(id){for(const cb of system.afterEvents.scriptEventReceive.handlers){cb({id,sourceEntity:{sendMessage(){}}});}}
function drain(){for(let t=0;t<10&&queued.length;t++){
    const q=queued.splice(0);for(const x of q){if(x.t<=0)x.fn();else queued.push({fn:x.fn,t:x.t-1});}
}}
// Two independently translated and rotated installations.
function fixtureItem(column,row){
    const colors='white orange magenta light_blue yellow lime pink gray light_gray cyan purple blue brown green red black'.split(' ');
    const materials=['wool','concrete','terracotta','stained_glass','carpet','concrete_powder','glazed_terracotta'];
    return 'minecraft:'+colors[column%16]+'_'+materials[Math.floor(column/16)+row-1];
}
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
      const id=fixtureItem(i,j);
      properties.set(key('s',sorter),JSON.stringify({d:dim.id,...sorter.location,m:'filter',f:{match:{typeId:id,enchIds:[]}}}));
    }
  }
  return {rk,input,hoppers,sorters,chests};
}
if(process.argv.includes('--column-budget')){
    require('./fixtures/column_budget.cjs')({world,dim,Container,bank,properties,event,drain,intervals,Stack});
    return;
}
if(process.argv.includes('--q4-route')){
    const banks=[];
    function restart(){
        intervals.length=0;queued.length=0;
        for(const group of [system.beforeEvents,system.afterEvents,world.beforeEvents,world.afterEvents])
            for(const ev of Object.values(group))ev.handlers=[];
        const fresh=newRuntime();
        drain();event('hartlab:setup_io');drain();
        return fresh;
    }
    function ticks(n){
        for(let t=1;t<=n;t++){
            for(const cb of intervals)cb.fn();
            if(t%8===0)for(const b of banks)for(let i=b.hoppers.length-2;i>=0;i--){
                const inv=b.hoppers[i].inv;
                if(inv.getItem(0))inv.transferItem(0,b.hoppers[i+1].inv);
            }
            drain();
        }
    }
    require('./fixtures/q4_route.cjs')({newRuntime,bank,world,properties,place,dim,Stack,context,ticks,banks,event,drain,restart})
        .catch(error=>{console.error(error);process.exitCode=1;});
    return;
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
a.input.setItem(0,new Stack(fixtureItem(9,4),12));
b.input.setItem(0,new Stack(fixtureItem(2,2),1,{maxAmount:1,nameTag:'Unbroken'}));
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
assert.equal(a.chests.at(-1).count(fixtureItem(9,4)),12);
assert.equal(b.chests.at(-1).getItem(0).nameTag,'Unbroken');
assert.equal(evalBank(a,'b.discoveries'),1);
const chest=a.chests.at(-1);
for(let i=0;i<chest.size;i++)chest.setItem(i,new Stack('minecraft:dirt',64));
a.input.setItem(0,new Stack(fixtureItem(9,4),3));ticks(40);
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
const before=a.hoppers.reduce((sum,h)=>sum+h.inv.count(fixtureItem(9,4)),0);
assert.equal(before,3);
vm.runInContext('labLoadState()',context);
assert.equal(evalBank(a,'b.recovery'),true);
ticks(180);
assert.equal(chest.count(fixtureItem(9,4)),0);
assert.equal(last.inv.count(fixtureItem(9,4)),3);
assert.equal(a.input.count(fixtureItem(9,4)),0);
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
const brick=fixtureItem(2,2);
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
rb.input.setItem(0,new Stack(fixtureItem(1,1),64));
for(let i=0;i<20 && !rb.chests[1].count(fixtureItem(1,1));i++)ticks(8);
const deposited=rb.chests[1].count(fixtureItem(1,1));
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
assert.equal(evalBank(rb,'b.catches'),output.count(fixtureItem(1,1)));
assert.equal(evalBank(rb,'b.confirmed+b.catches'),64);
console.log('PASS: interrupted stack reconciled with the physical destination and lane output');

// Keep the Hopper bank operating while a second Receiver uses only Transporters.
const pipeBank=bank(1024,31,-512,-1,0,10,4);
const pipeId='hartlogistics:transporter';
for(const h of pipeBank.hoppers)h.setType(pipeId);
const wildcard=pipeBank.sorters[0];
properties.delete('hartlab:s_o_'+Object.values(wildcard.location).join('_'));
vm.runInContext('labLoadState()',context);
const cargo=fixtureItem(9,4);
pipeBank.input.setItem(0,new Stack(cargo,64,{nameTag:'Far end'}));
rb.input.setItem(0,new Stack(fixtureItem(0,1),5));
ticks(160);
assert.equal(evalBank(pipeBank,'b.net.lane.length'),10);
assert.equal(evalBank(pipeBank,'b.cache.total'),40);
assert.equal(pipeBank.chests.at(-1).getItem(0).nameTag,'Far end');
assert.equal(pipeBank.chests.at(-1).count(cargo),64);
assert.equal(pipeBank.chests[0].count(cargo),0);
assert.equal(rb.chests[0].count(fixtureItem(0,1)),5);
const destination=pipeBank.chests.at(-1);
for(let i=0;i<destination.size;i++)destination.setItem(i,new Stack('minecraft:dirt',64));
pipeBank.input.setItem(0,new Stack(cargo,32));
const readSlot=destination.getItem;
destination.getItem=()=>{throw Error('unreadable capacity');};
ticks(16);
assert.equal(pipeBank.input.count(cargo),32);
assert.equal(pipeBank.chests[0].count(cargo),0);
destination.getItem=readSlot;
ticks(16);
assert.equal(pipeBank.input.count(cargo),0);
assert.equal(pipeBank.chests[0].count(cargo),32);
pipeBank.input.setItem(0,new Stack(cargo,32));
destination.setItem(0,undefined);
pipeBank.hoppers[4].setType('minecraft:air');
ticks(1);
assert.equal(destination.count(cargo),0);
assert.equal(pipeBank.input.count(cargo),32);
pipeBank.hoppers[4].setType(pipeId);
event('hartlab:refresh');drain();ticks(32);
assert.equal(destination.count(cargo),32);
assert.equal(evalBank(pipeBank,'b.confirmed'),128);
assert.equal(pipeBank.input.count(cargo),0);
console.log('PASS: simultaneous Hopper and Transporter banks, 10 pipes/40 Sorters, filter priority, named stack, full chest, interrupted path and reconnection');

// Parallel rows with one block of clearance between their footprints. Use the
// player link interaction with empty inputs and inspect the cache directly.
async function finishRoutingTests(){
system.currentTick=5;
const adjacentH=bank(2200,80,1024,-1,0,10,4);
const adjacentT=bank(2200,80,1027,-1,0,10,4);
const player={id:'builder',sendMessage(){}};
function click(block,who=player){
  const ev={isFirstEvent:true,block,player:who};
  for(const cb of world.beforeEvents.playerInteractWithBlock.handlers)cb(ev);
  drain();
  return ev;
}
async function answer(form,label){
  const index=form.buttons.indexOf(label);
  assert.ok(index>=0,label);
  form.answer({selection:index,canceled:false});
  await new Promise(resolve=>setImmediate(resolve));
}
async function linkRig(z){
  const collector=getBlock({x:2204,y:80,z}),receiver=getBlock({x:2201,y:80,z});
  const other=getBlock({x:2201,y:80,z:z===1024?1027:1024});
  const key='hartlab:c_o_2204_80_'+z, prior=properties.get(key);
  for(const fn of world.afterEvents.playerPlaceBlock.handlers)fn({block:collector,player});
  assert.ok(click(collector).cancel);
  await answer(forms.at(-1),'Close');
  click(other);
  assert.equal(forms.at(-1).heading,'Hart Receiver');
  await answer(forms.at(-1),'Close');
  assert.equal(properties.get(key),prior);
  assert.equal(click(receiver,{...player,isSneaking:true}).cancel,undefined);
  click(collector);await answer(forms.at(-1),'Relink Receiver');
  click(other,{...player,id:'second-player'});
  assert.equal(forms.at(-1).heading,'Hart Receiver');
  await answer(forms.at(-1),'Close');
  click(other);await answer(forms.at(-1),'Cancel');
  assert.equal(properties.get(key),prior);
  click(collector);await answer(forms.at(-1),'Unlink Receiver');
  await answer(forms.at(-1),'Unlink');
  assert.equal(JSON.parse(properties.get(key)).receiver,undefined);
  click(collector);await answer(forms.at(-1),'Link Receiver');
  system.currentTick+=1201;
  click(other);assert.equal(forms.at(-1).heading,'Hart Receiver');
  await answer(forms.at(-1),'Close');
  click(collector);await answer(forms.at(-1),'Link Receiver');
  click(other);
  properties.set(key,JSON.stringify({marker:1}));
  await answer(forms.at(-1),'Confirm link');
  assert.deepEqual(JSON.parse(properties.get(key)),{marker:1});
  click(collector);await answer(forms.at(-1),'Link Receiver');
  click(receiver);await answer(forms.at(-1),'Confirm link');
  assert.equal(JSON.parse(properties.get(key)).marker,1);
  assert.equal(JSON.parse(properties.get(key)).receiver,'hartlab:r_o_2201_80_'+z);
}
for(const h of adjacentT.hoppers)h.setType('hartlogistics:transporter');
adjacentT.hoppers[0].setType('minecraft:air');
await linkRig(1024);await linkRig(1027);drain();
console.log('PASS: endpoint inspection, explicit link, relink cancellation, player isolation, timeout, unlink and concurrent change');
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
adjacentH.input.setItem(0,new Stack(fixtureItem(9,4),5,{nameTag:'Hopper bank'}));
adjacentT.input.setItem(0,new Stack(fixtureItem(9,4),7,{nameTag:'Transporter bank'}));
ticks(200);
assert.equal(adjacentH.chests.at(-1).count(fixtureItem(9,4)),5);
assert.equal(adjacentT.chests.at(-1).count(fixtureItem(9,4)),7);
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
  const immediateLoad=world.tickingAreaManager.createTickingArea;
  world.tickingAreaManager.createTickingArea=()=>({then(resolve){system.run(resolve);}});
  // Begin refill after the bank's earlier coverage has expired.
  vm.runInContext('routeChunks.clear()',context);
  dest.setItem(0,new Stack(itemId,32));ticks(600);
  world.tickingAreaManager.createTickingArea=immediateLoad;
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
// No Collector input, refresh or status call may be needed to arm the taps.
assert.equal(evalBank(coldBank,'b.cache?.passiveTaps.length'),52);
coldBank.hoppers[51].inv.setItem(0,new Stack(fixtureItem(51,1),8));
ticks(8);
assert.equal(coldBank.chests[51].count(fixtureItem(51,1)),8);
assert.equal(evalBank(coldBank,'b.laneDelivered'),8);
dim.getBlock=originalRead;
console.log('PASS: discovery automatically loads three successive unavailable chunks');

// Model two refill polls with cleanup running immediately before the second.
vm.runInContext("routeChunks.set('refill-test',{id:'refill-test',ready:true,last:labTick})",context);
assert.equal(vm.runInContext("labTick+=32;releaseIdleChunks();routeChunks.has('refill-test')",context),true);
assert.equal(vm.runInContext("labTick+=16;releaseIdleChunks();routeChunks.has('refill-test')",context),false);
console.log('PASS: ready area survives the next refill poll and expires after inactivity');

// Drive the registered native update callback through a complete powered/unpowered cycle.
let flow;
system.beforeEvents.startup.handlers[0]({blockComponentRegistry:{registerCustomComponent(id,component){flow=component;}}});
function power(block,level){flow.onRedstoneUpdate({block,powerLevel:level});}
const pausedBank=bank(9050,70,150,-1,0,3,1);
for(const h of pausedBank.hoppers)h.setType('hartlogistics:transporter');
const rc=getBlock({x:9051,y:70,z:150}),cc=getBlock({x:9054,y:70,z:150});
place('hartlogistics:bulk_storage',9050,70,149);
const stockKey='hartlab:bulk_o_9050_70_149';
const wanted='minecraft:cobblestone';
const filterKey='hartlab:s_o_9050_69_150';
const filter=JSON.parse(properties.get(filterKey));filter.f.match.typeId=wanted;
properties.set(filterKey,JSON.stringify(filter));
properties.set(stockKey,stored(12));
vm.runInContext('labLoadState()',context);drain();
power(rc,1);pausedBank.input.setItem(0,new Stack(wanted,8));ticks(96);
assert.equal(pausedBank.input.count(wanted),8);
assert.equal(JSON.parse(properties.get(stockKey)).items[wanted],12);
assert.equal(pausedBank.chests[0].count(wanted),0);
power(cc,15);power(rc,0);ticks(96);
assert.equal(pausedBank.input.count(wanted),8);
assert.equal(pausedBank.chests[0].count(wanted),12);
power(cc,0);ticks(96);
assert.equal(pausedBank.input.count(wanted),0);
assert.equal(pausedBank.chests[0].count(wanted),20);
console.log('PASS: powered Receiver pauses intake and refill; Collector independently pauses intake and resumes');

// Two direct relay layouts, each with a separate destination bank.
const helpers=new Map();
world.getEntity=id=>helpers.get(id);
dim.getEntities=({type,location})=>[...helpers.values()].filter(e=>
    e.typeId===type && posKey(e.location)===posKey(location));
dim.spawnEntity=(typeId,location)=>{
    const inv=new Container(5),id='helper-'+helpers.size;
    const e={id,typeId,location,getComponent:n=>n==='minecraft:inventory'?{container:inv}:undefined,
        remove:()=>helpers.delete(id)};
    helpers.set(id,e);return e;
};
for(const directPipe of [true,false]){
    const x=directPipe?10010:10110,z=450;
    const upstream=bank(x,70,z,-1,0,2,1);
    if(directPipe)for(const h of upstream.hoppers)h.setType(pipeId);
    else banks.push(upstream);
    const downstream=bank(x+300,70,z,-1,0,2,1);
    for(const h of downstream.hoppers)h.setType(pipeId);
    const relay=place('hartsorter:collector',x-1,directPipe?70:69,z+1);
    properties.set('hartlab:c_o_'+Object.values(relay.location).join('_'),JSON.stringify({receiver:downstream.rk}));
    const kind=directPipe?fixtureItem(0,1):fixtureItem(1,1);
    if(directPipe){
        // No Sorters on this remote pipe segment.
        for(const sorter of upstream.sorters)sorter.setType('minecraft:air');
    }
    vm.runInContext('labLoadState()',context);drain();
    power(relay,8);
    upstream.input.setItem(0,new Stack(kind,1,{nameTag:'Original cargo'}));
    ticks(120);assert.equal(upstream.input.count(kind),1);
    power(relay,0);
    const receiver=getBlock({x:x+301,y:70,z});
    power(receiver,9);ticks(160);
    assert.equal(upstream.input.count(kind),1);
    vm.runInContext('labLoadState()',context);drain();
    power(receiver,0);ticks(160);
    assert.equal(upstream.input.count(kind),0);
    assert.equal(downstream.chests[directPipe?0:1].getItem(0).nameTag,'Original cargo');
    power(receiver,15);
    upstream.input.setItem(0,new Stack(kind,4));ticks(180);
    const relayInv=evalBank(upstream,'collectorBuffer(labGet(b.cfg.dimension,'+JSON.stringify(relay.location)+')).getComponent("minecraft:inventory").container');
    assert.equal(relayInv.count(kind),4);
    power(receiver,0);ticks(180);assert.equal(relayInv.count(kind),0);
    console.log('PASS: direct '+(directPipe?'Transporter':'Hopper-fed Sorter')+' to Collector, MR held at origin across pause and reload');
}

const twin=bank(10400,70,461,-1,0,14,1);
banks.push(twin);
const twinFilter='hartlab:s_o_10387_69_461';
const tc=JSON.parse(properties.get(twinFilter));tc.f.match.typeId=plank;properties.set(twinFilter,JSON.stringify(tc));
vm.runInContext('labLoadState()',context);drain();
for(let i=0;i<3;i++)twin.input.setItem(i,new Stack(plank,64));
ticks(48);
assert.equal(evalBank(twin,'b.active.sent'),128);
assert.equal(twin.input.count(plank),64);
const twinReceiver=getBlock({x:10401,y:70,z:461});
power(twinReceiver,15);ticks(1400);
assert.equal(twin.chests.at(-1).count(plank),128);
assert.equal(twin.input.count(plank),64);
power(twinReceiver,0);ticks(800);
assert.equal(twin.chests.at(-1).count(plank),192);
console.log('PASS: two stacks in flight, active lane drains under power, remaining input resumes');

// Two distinct native book objects share a name. Assert native object identity
// at receipt so a reconstruction from visible fields would fail this test.
const richBank=bank(12000,64,-808,-1,0,3,1);
for(const block of richBank.hoppers)block.setType(pipeId);
const bookId='minecraft:enchanted_book';
const potionId='minecraft:splash_potion';
for(const [i,match] of [[0,{typeId:bookId,enchIds:['minecraft:mending']}],
                        [1,{typeId:bookId,enchIds:['minecraft:protection']}],
                        [2,{typeId:potionId,potion:{effect:'night_vision',delivery:'splash'}}]]){
    const p=richBank.sorters[i].location,k='hartlab:s_o_'+Object.values(p).join('_');
    const entry=JSON.parse(properties.get(k));entry.f.match=match;properties.set(k,JSON.stringify(entry));
}
const originalComponent=Stack.prototype.getComponent;
Stack.prototype.getComponent=function(id){
    if(this.props.enchantment && id==='minecraft:enchantable')
        return {getEnchantments:()=>[{type:{id:this.props.enchantment},level:3}]};
    if(this.props.effect && id==='minecraft:potion')
        return {potionEffectType:{id:this.props.effect},potionDeliveryType:{id:'splash'}};
    return originalComponent.call(this,id);
};
vm.runInContext('labLoadState()',context);drain();
for(const [slot,tag] of [[0,'minecraft:mending'],[1,'minecraft:protection']]){
    richBank.input.setItem(slot,new Stack(bookId,1,{nameTag:'Archive',maxAmount:1,enchantment:tag,opaque:{value:slot}}));
}
richBank.input.setItem(2,new Stack(potionId,1,{maxAmount:1,effect:'night_vision'}));
const originals=richBank.input.slots.slice(0,3);ticks(160);
originals.forEach((original,i)=>assert.equal(richBank.chests[i].slots[0],original));
console.log('PASS: named books with different enchantments and splash potion arrive as the original native objects');

// Simulate an engine interruption immediately after the native move, before a
// receipt. New cargo at the original address must stay held across reload.
richBank.input.setItem(0,originals[0]);
const separate=richBank.input.slots[0],move=richBank.input.moveItem;
richBank.input.moveItem=function(...args){move.apply(this,args);throw Error('interrupted after move');};
ticks(40);richBank.input.moveItem=move;
assert.equal(richBank.chests[0].slots[1],separate);
assert.equal(richBank.input.slots[0],undefined);
const record=[...properties.keys()].find(k=>k.startsWith('hartlab:mr_'));
assert.ok(record);
richBank.input.setItem(0,originals[1]);vm.runInContext('labLoadState()',context);ticks(80);
assert.equal(richBank.input.count(bookId),1);
assert.equal(richBank.chests[1].count(bookId),1);
const clearFence=()=>{for(const cb of system.afterEvents.scriptEventReceive.handlers)cb({id:'hartlab:mr_clear',message:record});drain();};
clearFence();assert.ok(properties.has(record));
richBank.input.setItem(0,undefined);clearFence();assert.equal(properties.has(record),false);
console.log('PASS: post-move interruption retains native cargo, fences the source after reload and requires explicit reconciliation');

const mixed=bank(13000,70,61,-1,0,1,1);
mixed.hoppers[0].setType(pipeId);
properties.delete('hartlab:s_o_'+Object.values(mixed.sorters[0].location).join('_'));
vm.runInContext('labLoadState()',context);drain();
const collectorKey='hartlab:c_o_13004_70_61';
const serve=()=>evalBank(mixed,'labTryCollector(b,"'+collectorKey+'")');
ticks(64);
mixed.input.setItem(0,new Stack('minecraft:cobblestone',32));
for(let i=1;i<5;i++)mixed.input.setItem(i,new Stack('addon:opaque',1,{opaque:i}));
for(let i=0;i<3;i++)assert.ok(serve());
assert.equal(mixed.chests[0].count('addon:opaque'),2);
assert.equal(mixed.chests[0].count('minecraft:cobblestone'),32);
console.log('PASS: mixed Collector admits two MR stacks then ordinary cargo under continuous MR demand');

// Cycle back to the same remote Collector with no final chest.
const cycle=bank(14500,70,450,-1,0,2,1);
for(const h of cycle.hoppers)h.setType(pipeId);
for(const sorter of cycle.sorters)sorter.setType('minecraft:air');
const returnRelay=place('hartsorter:collector',14499,70,451);
properties.set('hartlab:c_o_14499_70_451',JSON.stringify({receiver:cycle.rk}));
vm.runInContext('labLoadState()',context);
cycle.input.setItem(0,new Stack('addon:sealed_crate',1,{opaque:{contents:['secret']}}));
const crate=cycle.input.slots[0];ticks(160);
assert.equal(cycle.input.slots[0],crate);
assert.equal(evalBank(cycle,'b.confirmed'),0);
assert.equal(properties.has('hartlab:buffer_o_14499_70_451'),false);
console.log('PASS: cyclic MR relay retains original stack at the input without a carrier or a false receipt');

const wildcardPosition=richBank.sorters[2].location;
properties.delete('hartlab:s_o_'+Object.values(wildcardPosition).join('_'));
for(let i=0;i<richBank.chests[0].size;i++)richBank.chests[0].setItem(i,new Stack('minecraft:dirt',64));
richBank.chests[2].setItem(0,undefined);
event('hartlab:refresh');drain();
richBank.input.setItem(0,originals[0]);
const fallbackBook=richBank.input.slots[0];
ticks(160);
assert.equal(richBank.input.getItem(0),undefined);
assert.equal(richBank.chests[2].slots[0],fallbackBook);
console.log('PASS: full MR filter destination falls back to Wildcard with the original book');

// Native chest pulls are modelled at one item per eight ticks. Provide a
// real terminal catch so bypassed items count as failures instead of waiting.
const injected=bank(15100,72,680,-1,0,100,1);
banks.push(injected);
const stone='minecraft:stone_bricks',oak='minecraft:oak_planks';
for(const [column,type] of [[98,stone],[99,oak]]){
  const key='hartlab:s_o_'+Object.values(injected.sorters[column].location).join('_');
  const cfg=JSON.parse(properties.get(key));cfg.f.match.typeId=type;
  properties.set(key,JSON.stringify(cfg));
}
const feed=place('minecraft:chest',15096,73,680).inv;
const catchChest=place('minecraft:chest',15000,72,680).inv;
vm.runInContext('labLoadState()',context);drain();
function drainInjectedLane(cycles){
  for(let i=0;i<cycles;i++){
    const slot=feed.slots.findIndex(Boolean);
    if(slot>=0){
      const stack=feed.getItem(slot);
      if(!injected.hoppers[4].inv.addItem(new Stack(stack.typeId,1))){
        stack.amount--;feed.setItem(slot,stack.amount?stack:undefined);
      }
    }
    ticks(8);
    const tail=injected.hoppers.at(-1).inv;
    for(let j=0;j<tail.size;j++){
      const s=tail.getItem(j);
      if(s?.typeId===stone)tail.transferItem(j,catchChest);
    }
  }
}
for(let j=0;j<4;j++)feed.setItem(j,new Stack(stone,64));
drainInjectedLane(370);
assert.equal(injected.chests[98].count(stone),256);
assert.equal(catchChest.count(stone),0);
assert.equal(evalBank(injected,'b.laneDelivered'),256);
assert.equal(evalBank(injected,'b.dispatched'),0);
injected.input.setItem(0,new Stack(oak,64));
ticks(8);assert.ok(evalBank(injected,'b.active'));
feed.setItem(0,new Stack(stone,64));
drainInjectedLane(320);
assert.equal(injected.chests[98].count(stone),320);
assert.equal(injected.chests[99].count(oak),64);
assert.equal(catchChest.count(stone),0);
assert.equal(evalBank(injected,'b.laneDelivered'),320);
assert.equal(evalBank(injected,'b.confirmed'),64);
console.log('PASS: 256 inline stone bricks reach their downstream filter; 64 more alongside a separately accounted oak shipment');

const bookLane=bank(16100,72,680,-1,0,2,1);
const protectKey='hartlab:s_o_'+Object.values(bookLane.sorters[1].location).join('_');
const protectConfig=JSON.parse(properties.get(protectKey));
protectConfig.f.match={typeId:bookId,enchIds:['minecraft:protection']};
properties.set(protectKey,JSON.stringify(protectConfig));
vm.runInContext('labLoadState()',context);drain();ticks(40);
const bookTap=bookLane.hoppers[1].inv;
const bookOutput=bookLane.chests[1];
bookTap.setItem(0,originals[0]); // Mending shares Protection's base item ID.
for(let i=1;i<=4;i++)bookTap.setItem(i,originals[1]);
const waiting=bookTap.slots.slice(1,5);
ticks(4);
assert.deepEqual(bookOutput.slots.slice(0,4),waiting);
waiting.forEach((item,i)=>assert.equal(bookOutput.slots[i],item));
assert.ok(bookTap.getItem(0));
assert.equal(bookTap.count(bookId),1);
assert.equal(evalBank(bookLane,'b.laneDelivered'),4);
console.log('PASS: inline Protection filter moves four original books and leaves Mending in the hopper');

// Only the feed chunk initially ticks. After the player leaves, every
// simulated native pull and forward below requires a live temporary area.
const unattended=bank(20000,80,800,-1,0,48,1);
const feedIndex=21,feedPos=unattended.hoppers[feedIndex].location;
const inlineFeed=place('minecraft:chest',feedPos.x,feedPos.y+1,feedPos.z).inv;
vm.runInContext('labLoadState()',context);drain();ticks(96);
const manager=world.tickingAreaManager;
const areaIds=new Map(), chunk=p=>Math.floor(p.x/16)+','+Math.floor(p.z/16);
let playerChunk=chunk(feedPos);
const canTick=p=>chunk(p)===playerChunk || [...areaIds.values()].includes(chunk(p));
const createArea=manager.createTickingArea,removeArea=manager.removeTickingArea;
manager.createTickingArea=(id,opts)=>{
    if(opts.from.x>=19936 && opts.from.x<=20016 && [784,800].includes(opts.from.z))areaIds.set(id,chunk(opts.from));
    return createArea(id,opts);
};
manager.removeTickingArea=id=>{areaIds.delete(id);removeArea.call(manager,id);};
const readBlock=dim.getBlock;
dim.getBlock=p=>p.x>=19950 && p.x<=20005 && p.z>=799 && p.z<=801 && !canTick(p)
    ? undefined : readBlock.call(dim,p);
const cargoType=fixtureItem(47,1);
ticks(64);
assert.equal(areaIds.size,0);
inlineFeed.setItem(0,new Stack(cargoType,32));
ticks(4);
assert.ok(areaIds.size>0,'occupied inline feed must wake a remote receiver and destination');
playerChunk=undefined;
for(let cycle=0;cycle<64;cycle++){
    ticks(8);
    for(let j=unattended.hoppers.length-2;j>=feedIndex;j--){
        const from=unattended.hoppers[j],to=unattended.hoppers[j+1];
        if(canTick(from.location)&&canTick(to.location)&&from.inv.getItem(0))
            from.inv.transferItem(0,to.inv);
    }
    if(canTick(feedPos)&&inlineFeed.getItem(0)){
        const remaining=inlineFeed.getItem(0).amount-1;
        unattended.hoppers[feedIndex].inv.addItem(new Stack(cargoType,1));
        inlineFeed.setItem(0,remaining?new Stack(cargoType,remaining):undefined);
    }
}
assert.equal(unattended.chests.at(-1).count(cargoType),32);
assert.equal(evalBank(unattended,'b.dispatched'),0);
ticks(96);assert.equal(areaIds.size,0);
dim.getBlock=readBlock;manager.createTickingArea=createArea;manager.removeTickingArea=removeArea;
console.log('PASS: inline feed wakes unloaded Hopper route, drains after player departure and releases its areas');

const receiverLocation=unattended.rk.split('_').slice(-3).map(Number);
const testReceiver=dim.getBlock({x:receiverLocation[0],y:receiverLocation[1],z:receiverLocation[2]});
const responses=[];
for(const action of ['seed','prepare','commit','commit','status']){
    const sourceEntity={getBlockFromViewDirection:()=>({block:testReceiver}),sendMessage:m=>responses.push(m)};
    for(const cb of system.afterEvents.scriptEventReceive.handlers)cb({id:'hartlab:q4_'+action,sourceEntity});
    drain();
}
assert.equal(responses.length,5);
assert.match(responses[4],/phase=committed source=0 receiver=250016 capacity=250016 total=250016/);
console.log('PASS: synthetic Q4 transfer through a selected linked Receiver and script events');

{
    const isolated=newRuntime(true);
    const src=new Container(1),dest=new Container(1);
    const bow=new Stack('minecraft:crossbow',1,{maxAmount:1,nameTag:'Migration crossbow',damage:37});
    src.setItem(0,bow);
    Object.assign(isolated,{src,dest,bow});
    vm.runInContext(`
        routingStarted=true;
        const fixtureBank={};
        labBankForReceiver=()=>fixtureBank;
        labDiscover=coverRoute=receiverAccepts=()=>true;
        labBuildIndex=()=>({missing:0});
        labSelectTarget=()=>({destination:{x:7,y:5,z:9}});
        labDestinationContainer=()=>dest;
        labTryDispatch=()=>{throw Error('Non-stackable entered physical hopper shipment');};
        fixtureBank.recovery=true;
    `,isolated);
    const offer=()=>vm.runInContext("offerMigratedAccount('minecraft:overworld|1|2|3',bow,src)",isolated);
    assert.equal(offer(),false);
    vm.runInContext('fixtureBank.recovery=false',isolated);
    assert.equal(offer(),true);
    assert.equal(src.getItem(0),undefined);
    assert.deepEqual(dest.getItem(0).props,bow.props);
}

}
finishRoutingTests().catch(error=>{console.error(error);process.exitCode=1;});
