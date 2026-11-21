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
const world={getDimension(){return dim;},getDynamicProperty(k){return properties.get(k);},setDynamicProperty(k,v){if(v===undefined)properties.delete(k);else properties.set(k,v);},getDynamicPropertyIds(){return [...properties.keys()];},beforeEvents:{itemUse:makeEvents(),playerInteractWithBlock:makeEvents(),playerBreakBlock:makeEvents()},afterEvents:{playerInteractWithBlock:makeEvents(),playerPlaceBlock:makeEvents(),entityHitBlock:makeEvents(),playerBreakBlock:makeEvents()}};
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
assert.match(evalBank(a,'b.blocked'),/Unavailable/);
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
