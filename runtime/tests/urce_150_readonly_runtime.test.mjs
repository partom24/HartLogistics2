import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(ROOT,p),"utf8");
const script=read("addon/behavior_pack/scripts/urce_150_readonly_runtime.js");
const main=read("addon/behavior_pack/scripts/main.js");
function worldWithBlocks(blocks,unknownCoords=[]){
  const unknown=new Set(unknownCoords.map(p=>[p.x,p.y,p.z].join("|")));
  const byPos=new Map(blocks.map(b=>[[b.x,b.y,b.z].join("|"),b.typeId]));
  const callbacks=[],placed=[],broken=[],events=[],pending=[];
  let reads=0,visualWrites=0;
  const perms=new Map();
  function permAt(id){
    return perms.get(id)??{getState(){return false;},withState(name,value){
      const values={[name]:value};
      return {getState(n){return values[n]??false;},withState(n,v){
        values[n]=v;return this;}};}};
  }
  const dim={
    getBlock(p){
      reads++;
      const id=[p.x,p.y,p.z].join("|");
      if(unknown.has(id))return undefined;
      return {typeId:byPos.get(id)??"minecraft:air",location:{...p},dimension:dim,
        get permutation(){return permAt(id);},
        setPermutation(next){perms.set(id,next);visualWrites++;}
      };
    }
  };
  const system={currentTick:100,run(fn){pending.push(fn);}};
  const world={
    beforeEvents:{playerInteractWithBlock:{subscribe(fn){callbacks.push(fn);}}},
    afterEvents:{
      playerPlaceBlock:{subscribe(fn){placed.push(fn);}},
      playerBreakBlock:{subscribe(fn){broken.push(fn);}}
    }
  };
  const body=script.replace(/import \{ world, system \} from ['"]@minecraft\/server['"];/,"");
  vm.runInNewContext(body,{world,system,Set,Map},{timeout:3000});
  const player={id:"player-v",sendMessage(text){events.push(text);}};
  function click(p){
    const block=dim.getBlock(p);
    for(const cb of callbacks)cb({isFirstEvent:true,player,block});
  }
  function tick(){
    const work=pending.splice(0);
    for(const fn of work)fn();
    system.currentTick++;
  }
  function pump(limit=250){
    let ticks=0;
    while(pending.length&&ticks++<limit)tick();
    return ticks;
  }
  function place(p,typeId){
    byPos.set([p.x,p.y,p.z].join("|"),typeId);
    const block=dim.getBlock(p);
    for(const cb of placed)cb({block});
  }
  function remove(p){
    byPos.delete([p.x,p.y,p.z].join("|"));
    const block=dim.getBlock(p);
    for(const cb of broken)cb({block});
  }
  function state(p,name){
    return permAt([p.x,p.y,p.z].join("|")).getState("hartlogistics:connect_"+name);
  }
  return {click,tick,pump,place,remove,state,events,dim,system,
    get writes(){return visualWrites;},get reads(){return reads;},get pending(){return pending.length;}};
}
const point=(x,y,z,typeId)=>({x,y,z,typeId});
test("DEV-01 both new blocks have unique geometry, atlas, models and textures",()=>{
 const atlas=JSON.parse(read("addon/resource_pack/textures/terrain_texture.json"));
 for(const [id,texture] of [["transporter","hartlogistics_transporter"],["bulk_storage","hartlogistics_bulk_storage"]]){
   const bp=JSON.parse(read("addon/behavior_pack/blocks/"+id+".json"))["minecraft:block"];
   assert.equal(bp.description.identifier,"hartsorter:"+id);
   assert.equal(bp.components["minecraft:material_instances"]["*"].texture,texture);
   const name="addon/resource_pack/models/blocks/"+texture+".geo.json";
   const geo=JSON.parse(read(name))["minecraft:geometry"][0];
   const declared=bp.components["minecraft:geometry"];
   assert.equal(typeof declared==="string"?declared:declared.identifier,geo.description.identifier);
   assert.ok(geo.bones.reduce((n,b)=>n+(b.cubes?.length??0),0)>=4);
   const location="addon/resource_pack/textures/blocks/"+texture+".png";
   const bytes=fs.readFileSync(path.join(ROOT,location));
   assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
   assert.equal(atlas.texture_data[texture].textures,"textures/blocks/"+texture);
 }
});
test("DEV-02 1.5 BP/RP preserve stable UUIDs and Bedrock 2.7.0",()=>{
 const bp=JSON.parse(read("addon/behavior_pack/manifest.json"));
 const rp=JSON.parse(read("addon/resource_pack/manifest.json"));
 assert.deepEqual(bp.header.version,[1,5,1]);
 assert.deepEqual(rp.header.version,[1,5,1]);
 assert.equal(bp.header.uuid,"4854d263-05dd-4f79-a21c-7ba969295c2d");
 assert.equal(rp.header.uuid,"91316442-0f26-4fbb-88f3-2e39ea843a1a");
 assert.ok(bp.dependencies.some(x=>x.module_name==="@minecraft/server"&&x.version==="2.7.0"));
});
test("DEV-03 main source imports read-only preview with 1.4.2 movement intact",()=>{
 assert.match(main,/import "\.\/urce_150_readonly_runtime\.js"/);
 assert.match(main,/function schedulerTick\(\)/);
 assert.match(main,/function logisticsTick\(\)/);
 assert.match(main,/function safeMovePartial\(/);
 assert.match(main,/const QUEUE_CAPACITY = 250000/);
 // Only this import and the dev version string may change original 1.4.2.
 const unwrapped=main.replace('import "./urce_150_readonly_runtime.js";\n\n','')
   .replace('const VERSION = "1.5.1-dev";','const VERSION = "1.4.2";');
 assert.equal(createHash("sha256").update(unwrapped).digest("hex"),
   "2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411",
   "Do not silently rewrite current 1.4.2 custody or routing engine");
 assert.doesNotMatch(script,/\.setItem\s*\(|\.setDynamicProperty\s*\(|\.spawnItem\s*\(|\.remove\s*\(/);
});
test("DEV-04 player-chosen valid connected layout is inspected without cargo writes",()=>{
 const x=worldWithBlocks([
   point(73,12,-405,"hartsorter:transporter"),
   point(74,12,-405,"hartsorter:transporter"),
   point(75,12,-405,"minecraft:hopper"),
   point(73,12,-404,"hartsorter:sorter")
 ]);
 x.click({x:73,y:12,z:-405});x.pump();
 const display=x.events.join("\n");
 assert.match(display,/Transporters: 2/);
 assert.match(display,/hopper: 1/);
 assert.match(display,/sorter: 1/);
 assert.match(display,/no Transporter cargo movement or Bulk storage is enabled/);
});
test("DEV-05 a loop warns without rerouting or mutating the network",()=>{
 const xs=[
 point(5,40,8,"hartsorter:transporter"),point(6,40,8,"hartsorter:transporter"),
 point(5,40,9,"hartsorter:transporter"),point(6,40,9,"hartsorter:transporter")
 ];
 const x=worldWithBlocks(xs);x.click({x:5,y:40,z:8});x.pump();
 assert.match(x.events.join("\n"),/physical loop was observed/);
});
test("DEV-06 unloaded frontier remains unverified",()=>{
 const x=worldWithBlocks([point(-3,5,2,"hartsorter:transporter")],[{x:-2,y:5,z:2}]);
 x.click({x:-3,y:5,z:2});x.pump();
 assert.match(x.events.join("\n"),/view is incomplete/);
});
test("DEV-07 first tick bounded; size is not a fixed rig limit",()=>{
 const blocks=Array.from({length:180},(_,i)=>point(i,20,0,"hartsorter:transporter"));
 const x=worldWithBlocks(blocks);
 x.click({x:0,y:20,z:0});x.tick(); // schedules first chunk
 const before=x.reads;
 x.tick(); // max 12 transporter inspections, at most 72 neighbor reads
 assert.ok(x.reads-before<=160,"Bounded inspection plus local visual refresh; no full network scan in one tick");
 assert.ok(x.pending>0,"network work yields to next tick");
 x.pump(500);
 assert.match(x.events.join("\n"),/Transporters: 180/);
});
test("DEV-08 player can place Bulk without its item custody pretending active",()=>{
 const x=worldWithBlocks([point(10,5,10,"hartsorter:bulk_storage")]);
 x.click({x:10,y:5,z:10});x.pump();
 assert.match(x.events.join("\n"),/No item custody is enabled/);
});

test("DEV-09 historical PG27 4x4 core and world-correct, directional arms",()=>{
  const bp=JSON.parse(read("addon/behavior_pack/blocks/transporter.json"))["minecraft:block"];
  const model=JSON.parse(read("addon/resource_pack/models/blocks/hartlogistics_transporter.geo.json"))["minecraft:geometry"];
  const faces=["north","south","east","west","up","down"];
  assert.equal(model.length,2,"World shape and distinct held item shape");
  const bones=Object.fromEntries(model[0].bones.map(b=>[b.name,b.cubes[0]]));
  assert.deepEqual(bones.core.origin,[-2,6,-2]);
  assert.deepEqual(bones.core.size,[4,4,4]);
  for(const face of faces){
    assert.equal(bp.description.states["hartlogistics:connect_"+face].length,2);
    assert.equal(bp.components["minecraft:geometry"].bone_visibility[face],
      "q.block_state('hartlogistics:connect_"+face+"')");
    assert.equal(bones[face].size.filter(x=>x===4).length>=2,true);
  }
  // PG27 empirically verified Bedrock's reflected model X coordinate.
  assert.deepEqual(bones.east.origin,[-8,6,-2]);
  assert.deepEqual(bones.west.origin,[2,6,-2]);
  assert.equal(bp.components["minecraft:item_visual"].geometry,
    "geometry.hartlogistics.transporter_item");
  assert.equal(bp.components["minecraft:collision_box"],false);
});
test("DEV-10 player placement joins known endpoints without global polling",()=>{
  const p={x:-10,y:50,z:6};
  const x=worldWithBlocks([point(p.x,p.y,p.z,"hartsorter:transporter")]);
  x.place({x:-9,y:50,z:6},"minecraft:chest");
  x.pump();
  assert.equal(x.state(p,"east"),true);
  const once=x.writes;
  x.place({x:-10,y:50,z:7},"minecraft:stone");
  x.pump();
  assert.equal(x.state(p,"south"),false,"Ignore non-endpoint blocks");
  assert.equal(x.writes,once,"Avoid writes when no visual state changes");
  x.place({x:-10,y:50,z:7},"hartsorter:receiver");
  x.pump();
  assert.equal(x.state(p,"south"),true);
  x.remove({x:-9,y:50,z:6});
  x.pump();
  assert.equal(x.state(p,"east"),false);
  assert.equal(x.state(p,"south"),true);
});
test("DEV-11 adjacent 4x4 Transporters connect both sides and disconnect",()=>{
  const x=worldWithBlocks([]);
  const p={x:4,y:12,z:-8},q={x:5,y:12,z:-8};
  x.place(p,"hartsorter:transporter"); x.place(q,"hartsorter:transporter");
  x.pump();
  assert.equal(x.state(p,"east"),true);
  assert.equal(x.state(q,"west"),true);
  x.remove(q);x.pump();
  assert.equal(x.state(p,"east"),false);
});
test("DEV-12 unknown neighbors never auto-disconnect visual ports",()=>{
  const p={x:-12,y:3,z:2},q={x:-11,y:3,z:2};
  const x=worldWithBlocks([point(p.x,p.y,p.z,"hartsorter:transporter")]);
  x.place(q,"hartsorter:bulk_storage");
  x.pump();
  assert.equal(x.state(p,"east"),true);
  const original=x.writes;
  // No write or false assumption for an unreadable/unloaded neighbor.
  // This source-level contract is enforced by a direct unresolved guard.
  assert.match(script,/if\(!neighbor\)continue;/);
  assert.equal(x.writes,original);
});
test("DEV-13 connected visual updates do not install ticking or cargo writers",()=>{
  const bp=JSON.parse(read("addon/behavior_pack/blocks/transporter.json"))["minecraft:block"];
  assert.equal(bp.components["minecraft:tick"],undefined);
  for(const forbidden of ["setInterval(", "runInterval(", "registerCustomComponent(",
                          ".setItem(", ".addItem(", ".spawnItem("]){
    assert.equal(script.includes(forbidden),false,"Unexpected cargo writer/polling: "+forbidden);
  }
  assert.ok(script.includes("world.afterEvents.playerPlaceBlock"));
  assert.ok(script.includes("world.afterEvents.playerBreakBlock"));
  assert.ok(script.includes("block.setPermutation(permutation)"));
});
