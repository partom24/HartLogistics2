import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL(
  'pg42_probe.js',import.meta.url),'utf8');

function fixture({properties={},spawnThrows=false,abortWriteAt=0}={}){
  const db=new Map(Object.entries(properties)),entities=[],commands=new Map();
  const lines=[],writes=[],spawns=[];
  const dim={id:'minecraft:overworld',
    getEntities:({type,location,maxDistance})=>entities.filter(e=>
      e.typeId===type&&e.loaded!==false&&
      Math.hypot(e.location.x-location.x,
        e.location.y-location.y,e.location.z-location.z)<=maxDistance),
    spawnEntity:(type,location)=>{
      const slots=Array(9).fill(undefined);
      const entity={id:'test-native-'+(entities.length+1),typeId:type,
        location:{...location},loaded:true,
        getComponent:()=>({
          inventorySize:9,canBeSiphonedFrom:false,
          container:{size:9,isValid:true,
            getItem:i=>{
              const raw=slots[i];
              if(raw===undefined)return undefined;
              const item=new ItemStack(raw.typeId,raw.amount);
              item.nameTag=raw.nameTag;
              item.setLore(raw.lore||[]);
              return item;
            },
            setItem:(i,v)=>{slots[i]=structuredClone(v);}}
        })};
      entities.push(entity);
      spawns.push(type);
      if(spawnThrows)throw Object.assign(Error('untrusted engine details'),
        {name:'EntitySpawnError'});
      return entity;
    }};
  let origin={sourceEntity:{typeId:'minecraft:player',
    sendMessage:line=>lines.push(line),
    dimension:dim,
    location:{x:1.5,y:80,z:3.5}}};
  const world={
    getDynamicPropertyIds:()=>[...db.keys()],
    getDynamicProperty:k=>db.get(k),
    setDynamicProperty:(k,v)=>{
      writes.push(k);
      db.set(k,v);
      if(abortWriteAt===writes.length)
        throw Error('ambiguous persisted property write');
    },
    getDimension:()=>dim
  };
  class ItemStack{
    constructor(typeId,amount){this.typeId=typeId;this.amount=amount;
      this.nameTag='';this.lore=[];}
    setLore(s){this.lore=[...s];}
    getLore(){return [...this.lore];}
  }
  const componentSample=()=>{
    const original=entities[0].getComponent();
    return original.container.getItem(0);
  };
  function load(){
    const ctx={world,ItemStack,CommandPermissionLevel:{GameDirectors:1},
      system:{run:f=>f(),beforeEvents:{startup:{subscribe:f=>f({
        customCommandRegistry:{registerCommand:(def,callback)=>{
          if(commands.has(def.name))throw Error('duplicate command');
          commands.set(def.name,{...def,callback});}
        }})}}}};
    vm.runInNewContext(source,ctx);
    return ctx;
  }
  load();
  return {
    dim,entities,db,lines,writes,spawns,commands,origin,load,
    invoke:function(cmd){
      const found=commands.get('hartlogistics:'+cmd);
      assert.ok(found,'command registration '+cmd);
      return found.callback(this.origin);
    },
    componentSample
  };
}
test('one explicit spawn, nine slots and named/lore witness survive an in-place simulated restart',()=>{
  const f=fixture();
  assert.equal(f.commands.size,2);
  for(const v of f.commands.values()){
    assert.equal(v.permissionLevel,1);
    assert.equal(v.cheatsRequired,false);
  }
  assert.equal(f.entities.length,0,'never spawn on startup');
  f.invoke('pg42_audit');
  assert.match(f.lines.at(-1),/NO PROBE/);
  f.invoke('pg42_spawn');
  assert.equal(f.spawns.length,1);
  assert.equal(f.entities.length,1);
  assert.equal(f.writes.length,2,'reservation and activation only');
  assert.match(f.lines.at(-1),/CREATED one carrier ID test-native-1/);
  f.invoke('pg42_audit');
  assert.match(f.lines.at(-1),/PASS persisted carrier ID test-native-1/);
  const before=f.writes.length,entityId=f.entities[0].id;
  f.commands.clear();f.load();
  f.invoke('pg42_audit');
  assert.match(f.lines.at(-1),/PASS persisted carrier ID test-native-1/);
  assert.equal(f.entities[0].id,entityId);
  assert.equal(f.writes.length,before,'audit must be strictly read-only');
  f.invoke('pg42_spawn');
  assert.match(f.lines.at(-1),/HOLD existing ACTIVE/);
  assert.equal(f.spawns.length,1,'one-shot never recreates');
});
test('the historical PG35 cold seal and hartsorter keys both block every test mutation',()=>{
  for(const props of [
    {'hartlogistics:uce_cold_seal_v1':'sealed'},
    {'hartlogistics:uce_native_host_abcdef_v1':'RESERVED'},
    {'hartsorter:journal_v1':'pending'},
    {'hartlogistics:pg42_other_v1':'rogue'}
  ]){
    const f=fixture({properties:props});
    f.invoke('pg42_spawn');
    assert.match(f.lines.at(-1),/HOLD/);
    assert.equal(f.writes.length,0);
    assert.equal(f.spawns.length,0);
    f.invoke('pg42_audit');
    assert.match(f.lines.at(-1),/HOLD/);
    assert.equal(f.writes.length,0);
  }
});
test('thrown spawn after creating physical entity leaves RESERVED and forbids duplicate after restart',()=>{
  const f=fixture({spawnThrows:true});
  f.invoke('pg42_spawn');
  assert.equal(f.spawns.length,1);
  assert.equal(f.entities.length,1);
  assert.equal(f.writes.length,1);
  assert.equal(JSON.parse(f.db.get('hartlogistics:pg42_native_test_v1')).state,
    'RESERVED');
  assert.match(f.lines.at(-1),/HOLD spawn ambiguous \[EntitySpawnError\]/);
  f.commands.clear();f.load();
  f.invoke('pg42_spawn');
  assert.match(f.lines.at(-1),/HOLD existing RESERVED/);
  assert.equal(f.spawns.length,1);
});
test('an unloaded carrier or missing/mutated named item HOLDs, never silently respawns',()=>{
  const f=fixture();
  f.invoke('pg42_spawn');
  f.entities[0].loaded=false;
  const n=f.writes.length;
  f.commands.clear();f.load();
  f.invoke('pg42_audit');
  assert.match(f.lines.at(-1),/HOLD expected one loaded carrier/);
  assert.equal(f.spawns.length,1);
  f.entities[0].loaded=true;
  const c=f.entities[0].getComponent().container;
  const bad=c.getItem(0);
  bad.nameTag='tampered';
  c.setItem(0,bad);
  f.invoke('pg42_audit');
  assert.match(f.lines.at(-1),/HOLD SAMPLE_METADATA_CHANGED/);
  assert.equal(f.writes.length,n);
});
test('failed reservation readback cannot spawn even if dynamic property write happened',()=>{
  const f=fixture({abortWriteAt:1});
  f.invoke('pg42_spawn');
  assert.match(f.lines.at(-1),/HOLD reservation readback ambiguous/);
  assert.equal(f.spawns.length,0);
  assert.equal(f.writes.length,1);
  f.invoke('pg42_spawn');
  assert.match(f.lines.at(-1),/HOLD existing RESERVED/);
});

test('an ACTIVE readback throw after effect does not cause duplicate native entity',()=>{
  const f=fixture({abortWriteAt:2});
  f.invoke('pg42_spawn');
  assert.equal(f.spawns.length,1);
  assert.equal(f.entities.length,1);
  assert.equal(f.writes.length,2);
  assert.match(f.lines.at(-1),/HOLD ACTIVE readback ambiguous/);
  const state=JSON.parse(f.db.get('hartlogistics:pg42_native_test_v1'));
  assert.equal(state.state,'ACTIVE');
  f.commands.clear();f.load();
  f.invoke('pg42_spawn');
  assert.match(f.lines.at(-1),/HOLD existing ACTIVE/);
  assert.equal(f.spawns.length,1);
  f.invoke('pg42_audit');
  assert.match(f.lines.at(-1),/PASS persisted carrier ID/);
});
test('non-player command sources cannot start a test or inspect mutable world state',()=>{
  const f=fixture();
  f.origin={sourceEntity:{typeId:'minecraft:command_block'}};
  f.invoke('pg42_spawn');
  f.invoke('pg42_audit');
  assert.equal(f.writes.length,0);
  assert.equal(f.spawns.length,0);
});
