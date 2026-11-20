// Minimal offline simulation. This is NOT a Bedrock runtime test.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../behavior_pack/scripts/main.js');
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
vm.runInContext(src,context,{filename:'main.js'});
function event(id){for(const cb of system.afterEvents.scriptEventReceive.handlers){cb({id,sourceEntity:{sendMessage(){}}});}}
function drain(){for(let t=0;t<10&&queued.length;t++){
    const q=queued.splice(0);for(const x of q){if(x.t<=0)x.fn();else queued.push({fn:x.fn,t:x.t-1});}
}}
// 10x4 main bank, 1x4 experimental; preserve vanilla hopper lines.
const mainXs=[-22,-17,-12,-7,-2,3,8,13,18,23];
for(const [z,xs,sorterZ,end] of [[0,mainXs,3,26],[18,[-20],21,-12]]){
    for(let x=-26;x<=end;x++)place('minecraft:hopper',x,87,z);
    place('minecraft:barrel',-26,88,z);
    place('minecraft:barrel',end+1,87,z);
    for(const x of xs)for(const y of [81,82,83,84]){
      place('hartsorter:sorter',x,y,sorterZ);
      place('minecraft:chest',x,y,sorterZ+1);
    }
}
event('hartlab:setup_io');drain();
assert.equal(getBlock({x:-29,y:87,z:0}).typeId,'hartsorter:collector');
assert.equal(getBlock({x:-27,y:87,z:0}).typeId,'hartsorter:receiver');
assert.equal(getBlock({x:-26,y:88,z:0}).typeId,'minecraft:air');
// filter stone at a *far* main column, nonstackable named object at another,
// and a different ore on experimental branch.
function setFilter(x,y,z,item){
  const e=`hartlab:s_o_${x}_${y}_${z}`;
  properties.set(e,JSON.stringify({d:'minecraft:overworld',x,y,z,m:'filter',
    f:{typeId:item,match:{typeId:item,enchIds:[]}},i:null}));
}
setFilter(23,84,3,'minecraft:stone');
setFilter(3,82,3,'minecraft:diamond_sword');
setFilter(-20,83,21,'minecraft:emerald');
// bypass all other Sorters to unambiguously address the selected 3.
for(const x of mainXs)for(const y of [81,82,83,84]){
  if((x===23&&y===84)||(x===3&&y===82))continue;
  const e=`hartlab:s_o_${x}_${y}_3`;
  properties.set(e,JSON.stringify({d:'minecraft:overworld',x,y,z:3,m:'bypass',f:null,i:null}));
}
for(const y of [81,82,83,84])if(y!==83){
  const e=`hartlab:s_o_-20_${y}_21`;
  properties.set(e,JSON.stringify({d:'minecraft:overworld',x:-20,y,z:21,m:'bypass',f:null,i:null}));
}
const mainInput=getBlock({x:-29,y:88,z:0}).inv;
const expInput=getBlock({x:-29,y:88,z:18}).inv;
mainInput.setItem(0,new Stack('minecraft:stone',12));
mainInput.setItem(1,new Stack('minecraft:diamond_sword',1,{maxAmount:1,nameTag:'Unbroken'}));
expInput.setItem(0,new Stack('minecraft:emerald',9));
// Physical vanilla-ish hoppers tick once each 8 ticks, one item per hopper.
// Process right-to-left so each item moves at most one hopper per cycle.
function simulateHoppers(t){
  if(t%8!==0)return;
  for(const [z,end] of [[0,26],[18,-12]]){
    for(let x=end;x>=-26;x--){
      const h=getBlock({x,y:87,z}).inv;
      const dst=getBlock({x:x+1,y:87,z}).inv;
      if(!dst)continue;
      for(let i=0;i<5;i++){
        const item=h.getItem(i);if(!item)continue;
        const single=item.clone();single.amount=1;
        if(dst.addItem(single))continue;
        item.amount-=1;h.setItem(i,item.amount?item:undefined);
        break;
      }
    }
  }
}
for(let t=1;t<=1300;t++){
  for(const i of intervals)if(t%i.interval===0)i.fn();
  simulateHoppers(t);drain();
}
assert.equal(getBlock({x:23,y:84,z:4}).inv.count('minecraft:stone'),12,'Far-column stone routed');
assert.equal(getBlock({x:3,y:82,z:4}).inv.count('minecraft:diamond_sword'),1,'Named nonstackable routed');
assert.equal(getBlock({x:3,y:82,z:4}).inv.getItem(0).nameTag,'Unbroken','Native metadata retained');
assert.equal(getBlock({x:-20,y:83,z:22}).inv.count('minecraft:emerald'),9,'Experimental lane routed');
assert.equal(mainInput.count('minecraft:stone'),0);
assert.equal(expInput.count('minecraft:emerald'),0);
assert.equal(getBlock({x:27,y:87,z:0}).inv.count('minecraft:stone'),0);
assert.equal(getBlock({x:-11,y:87,z:18}).inv.count('minecraft:emerald'),0);
// Full valid destination leaves source item untouched, rather than using an
// unrelated wildcard or dropping it.
const chest=getBlock({x:23,y:84,z:4}).inv;
for(let i=0;i<27;i++)chest.setItem(i,new Stack('minecraft:dirt',64));
mainInput.setItem(0,new Stack('minecraft:stone',3));
for(let t=1301;t<1350;t++){for(const i of intervals)if(t%i.interval===0)i.fn();simulateHoppers(t);drain();}
assert.equal(mainInput.count('minecraft:stone'),3,'Full destination held at source');
chest.slots.fill(undefined);
// No fixture destination hardcoded as the only matching Sorter: all 44
// possible output locations can be selected by the indexed destination logic.
for(const [lane,xs,z] of [['main',mainXs,3],['experimental',[-20],21]]){
  let n=0;
  for(const x of xs)for(const y of [81,82,83,84]){
    const id='test:item_'+lane+'_'+n++;
    setFilter(x,y,z,id);
    vm.runInContext('invalidateRouting()',context);
    const probe=new Stack(id,1);
    context.__probe=probe;
    const selected=vm.runInContext(`labSelectTarget(labBanks.${lane},__probe)`,context);
    assert.equal(selected?.p.x,x,`Expected ${lane} x=${x}`);
    assert.equal(selected?.p.y,y,`Expected ${lane} y=${y}`);
  }
}
console.log('PASS: both addressed Hopper lanes, every 44 candidate positions, mixed source, original named nonstackable metadata, full-destination safety');
