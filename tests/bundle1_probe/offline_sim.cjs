// TEMP_TEST:PG03-05
// Disposable mock-only integration simulations; NOT Minecraft/BDS runtime proof.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const file = path.join(__dirname, "behavior_pack", "scripts", "main.js");
const source = fs.readFileSync(file, "utf8").replace(/^import\s+[^\n]+\n/gm, "");

class Stack {
  constructor(typeId, amount = 1) {
    this.typeId=typeId; this.amount=amount; this.nameTag="";
    this.lore=[];
  }
  setLore(lines) { this.lore=[...lines]; }
  getLore() { return [...this.lore]; }
}
class Container {
  constructor(size, world) { this.size=size; this.slots=Array(size).fill(undefined); this.world=world; }
  getItem(i) { return this.slots[i]; }
  setItem(i,v) { this.slots[i]=v; }
  moveItem(from, to, target) {
    if(this.world.corruptMove) {
      if(this.slots[from]) this.slots[from].nameTag="CORRUPTED";
    }
    if(target.slots[to]) throw Error("occupied");
    target.slots[to]=this.slots[from];
    this.slots[from]=undefined;
  }
  transferItem(from,target) {
    const i=target.slots.findIndex(v=>!v);
    if(i>=0) {
      target.slots[i]=this.slots[from];
      this.slots[from]=undefined;
      return undefined;
    }
    if(this.world.blockMode==="throw") throw Error("full");
    if(this.world.blockMode==="destroy") {
      this.slots[from]=undefined;
      return undefined;
    }
    const rest=this.slots[from];
    if(this.world.blockMode==="returned") this.slots[from]=undefined;
    return rest;
  }
}
function createWorld(config={}) {
  const state=new Map();
  const effects={world: {blockMode:config.blockMode||"retained",corruptMove:!!config.corruptMove},messages:[]};
  const blocks=new Map();
  const dimension={id:"minecraft:overworld",getBlock(l){return blocks.get(l.x);}};
  const make=(x,type,slotSize)=>{
    const container=slotSize?new Container(slotSize,effects.world):undefined;
    const b={typeId:type,dimension,location:{x,y:80,z:0},
      getComponent(id){
        return id==="minecraft:inventory"&&container?{container}:undefined;
      },container};
    blocks.set(x,b);return b;
  };
  const chest=make(-1,"minecraft:chest",27);
  const A=make(0,"hlprobe:mr_container",config.native===false?0:9);
  const B=make(1,config.wrongB?"minecraft:air":"hlprobe:mr_container",config.native===false?0:9);
  const output=make(2,"minecraft:chest",27);
  const player={id:"mock-owner",isSneaking:false,sendMessage(m){effects.messages.push(m);}};
  const world={
    beforeEvents:{playerInteractWithBlock:{subscribe(fn){effects.event=fn;}}},
    getDynamicProperty(k){return state.get(k);},
    setDynamicProperty(k,v){if(v===undefined)state.delete(k);else state.set(k,v);}
  };
  let selection=0;
  class Form {
    title(){return this;} body(){return this;} button(){return this;}
    show(){return Promise.resolve({canceled:selection===null,selection});}
  }
  function load() {
    vm.runInNewContext(source,{world,system:{run(fn){fn();}},ItemStack:Stack,
      ActionFormData:Form,console:{warn(){}}},{timeout:3000});
  }
  async function click(index) {
    selection=index;
    const before=effects.messages.length;
    const e={block:A,player,cancel:false};
    effects.event(e);
    assert.equal(e.cancel,true,"probe interaction must be canceled");
    await new Promise(resolve=>setImmediate(resolve));
    return effects.messages.slice(before);
  }
  return {load,click,blocks,effects,state,chest,A,B,output,player};
}
function saw(messages,s){return messages.some(m=>m.includes(s));}
let passed=0;
async function run(name,fn){await fn();console.log("PASS "+name);passed++;}
(async()=>{
  for(const mode of ["retained","returned","throw"]){
    await run("full-target semantics: "+mode,async()=>{
      const h=createWorld({blockMode:mode});
      h.load();
      assert(saw(await h.click(0),"PG03 PASS"));
      assert(saw(await h.click(1),"PG04 PASS"));
      assert.equal(h.A.container.getItem(0).nameTag,"HL PG04 native metadata");
      assert.equal(h.B.container.slots.filter(Boolean).length,0);
      assert.equal(h.chest.container.slots.filter(Boolean).length,0);
      assert.equal(h.output.container.slots.filter(Boolean).length,0);
      assert(saw(await h.click(2),"PG05 ARMED"));
      assert(saw(await h.click(3),"NO-GO")); // false positive same boot blocked
      h.load(); // restart with persistent world and native inventories
      assert(saw(await h.click(3),"PG05 PASS"));
      assert.equal(h.state.has("hlprobe:pg05_armed"),false);
    });
  }
  await run("missing custom inventory fails closed",async()=>{
    const h=createWorld({native:false});h.load();
    assert(saw(await h.click(0),"NO-GO"));
    assert.equal(h.chest.container.slots.filter(Boolean).length,0);
  });
  await run("wrong rig identity fails before writes",async()=>{
    const h=createWorld({wrongB:true});h.load();
    assert(saw(await h.click(1),"NO-GO"));
    assert.equal(h.chest.container.slots.filter(Boolean).length,0);
  });
  await run("corrupted metadata detected",async()=>{
    const h=createWorld({corruptMove:true});h.load();
    assert(saw(await h.click(1),"NO-GO"));
  });
  await run("silently destroyed blocked transfer detected",async()=>{
    const h=createWorld({blockMode:"destroy"});h.load();
    assert(saw(await h.click(1),"NO-GO"));
  });
  await run("nonempty source never overwritten",async()=>{
    const h=createWorld();h.load();
    h.chest.container.setItem(0,new Stack("minecraft:dirt",4));
    assert(saw(await h.click(1),"NO-GO"));
    assert.equal(h.chest.container.getItem(0).amount,4);
  });
  await run("cancel does not alter inventory or marker",async()=>{
    const h=createWorld();h.load();
    await h.click(null);
    assert.equal(h.state.has("hlprobe:pg05_armed"),false);
    assert.equal(h.chest.container.slots.filter(Boolean).length,0);
  });
  await run("PG05 cannot arm before PG04",async()=>{
    const h=createWorld();h.load();
    assert(saw(await h.click(2),"NO-GO"));
  });
  await run("PG04 blocked if PG05 marker active",async()=>{
    const h=createWorld();h.load();
    assert(saw(await h.click(1),"PG04 PASS"));
    assert(saw(await h.click(2),"PG05 ARMED"));
    assert(saw(await h.click(1),"NO-GO"));
  });
  console.log("Bundle1 mock-only scenarios: "+passed+" PASS (not Bedrock evidence)");
})().catch(e=>{console.error(e);process.exitCode=1;});
