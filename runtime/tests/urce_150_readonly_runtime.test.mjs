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
  const callbacks=[],events=[],pending=[];
  let reads=0;
  const dim={
    getBlock(p){
      reads++;
      const id=[p.x,p.y,p.z].join("|");
      if(unknown.has(id))return undefined;
      return {typeId:byPos.get(id)??"minecraft:air",location:{...p},dimension:dim};
    }
  };
  const system={currentTick:100,run(fn){pending.push(fn);}};
  const world={beforeEvents:{playerInteractWithBlock:{subscribe(fn){callbacks.push(fn);}}}};
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
  return {click,tick,pump,events,dim,system,get reads(){return reads;},get pending(){return pending.length;}};
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
   assert.equal(bp.components["minecraft:geometry"],geo.description.identifier);
   assert.ok(geo.bones[0].cubes.length>=4);
   const location="addon/resource_pack/textures/blocks/"+texture+".png";
   const bytes=fs.readFileSync(path.join(ROOT,location));
   assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
   assert.equal(atlas.texture_data[texture].textures,"textures/blocks/"+texture);
 }
});
test("DEV-02 1.5 BP/RP preserve stable UUIDs and Bedrock 2.7.0",()=>{
 const bp=JSON.parse(read("addon/behavior_pack/manifest.json"));
 const rp=JSON.parse(read("addon/resource_pack/manifest.json"));
 assert.deepEqual(bp.header.version,[1,5,0]);
 assert.deepEqual(rp.header.version,[1,5,0]);
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
   .replace('const VERSION = "1.5.0-dev";','const VERSION = "1.4.2";');
 assert.equal(createHash("sha256").update(unwrapped).digest("hex"),
   "2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411",
   "Do not silently rewrite current 1.4.2 custody or routing engine");
 assert.doesNotMatch(script,/\.setItem\s*\(|\.setDynamicProperty\s*\(|\.spawnItem\s*\(|\.remove\s*\(/);
});
test("DEV-04 player-chosen valid connected layout is inspected without native writes",()=>{
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
 assert.ok(x.reads-before<=84,"12 nodes x (current + six adjacent native reads) cap per tick");
 assert.ok(x.pending>0,"network work yields to next tick");
 x.pump(500);
 assert.match(x.events.join("\n"),/Transporters: 180/);
});
test("DEV-08 player can place Bulk without its item custody pretending active",()=>{
 const x=worldWithBlocks([point(10,5,10,"hartsorter:bulk_storage")]);
 x.click({x:10,y:5,z:10});x.pump();
 assert.match(x.events.join("\n"),/No item custody is enabled/);
});
