/** URCE RP/BP boundary check: prevent Bedrock missing-texture checkerboards.
 * Every custom block/material, geometry, entity texture and PNG is inspected.
 * This proves SOURCE integrity, NOT that a player's client downloaded the RP.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const bp=path.join(root,"addon/behavior_pack");
const rp=path.join(root,"addon/resource_pack");
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const files=(p)=>fs.readdirSync(p,{withFileTypes:true}).flatMap(entry=>{
 const name=path.join(p,entry.name);
 return entry.isDirectory()?files(name):entry.isFile()?[name]:[];
});
const atlas=read(path.join(rp,"textures/terrain_texture.json"));
const textureMap=atlas.texture_data;

function checkPng(file){
 const b=fs.readFileSync(file);
 assert.equal(b.subarray(0,8).toString("hex"),"89504e470d0a1a0a",
   "Missing/invalid PNG signature: "+file);
 let pos=8,seenIHDR=false,seenIDAT=false,seenEnd=false;
 const compressed=[];
 while(pos<b.length){
   assert.ok(pos+12<=b.length,"Truncated PNG chunk: "+file);
   const count=b.readUInt32BE(pos);
   const type=b.subarray(pos+4,pos+8).toString("ascii");
   const end=pos+12+count;
   assert.ok(end<=b.length,"Truncated PNG "+type+" chunk: "+file);
   const data=b.subarray(pos+8,pos+8+count);
   let crc=0xffffffff;
   for(const byte of b.subarray(pos+4,pos+8+count)){
     crc^=byte;
     for(let j=0;j<8;j++)crc=(crc&1)?((crc>>>1)^0xedb88320):(crc>>>1);
   }
   assert.equal((crc^0xffffffff)>>>0,b.readUInt32BE(pos+8+count),
     "PNG CRC mismatch "+file+" "+type);
   if(type==="IHDR"){
     assert.equal(count,13);
     assert.ok(data.readUInt32BE(0)>0&&data.readUInt32BE(4)>0,
       "Empty dimensions: "+file);
     assert.ok(data.readUInt32BE(0)<=4096&&data.readUInt32BE(4)<=4096,
       "Unreasonably large asset: "+file);
     seenIHDR=true;
   }
   if(type==="IDAT"){seenIDAT=true;compressed.push(data)}
   if(type==="IEND"){seenEnd=true;assert.equal(end,b.length);break}
   pos=end;
 }
 assert.ok(seenIHDR&&seenIDAT&&seenEnd,"Incomplete PNG: "+file);
 const decoded=zlib.inflateSync(Buffer.concat(compressed));
 assert.ok(decoded.length>0,"Empty IDAT pixel data: "+file);
}
function findAll(obj,field){
 const results=[];
 const walk=x=>{
   if(Array.isArray(x)){for(const v of x)walk(v);return}
   if(x&&typeof x==="object"){
     if(typeof x[field]==="string")results.push(x[field]);
     for(const v of Object.values(x))walk(v);
   }
 };
 walk(obj);return results;
}
test("RP-01 all 1.4.2 and 1.5 block materials resolve to actual PNGs",()=>{
 const referenced=new Set();
 for(const file of files(path.join(bp,"blocks")).filter(f=>f.endsWith(".json"))){
   const block=read(file);
   for(const material of findAll(block,"texture"))referenced.add(material);
 }
 assert.ok(referenced.size>=10,"Expected existing Sorter material variants");
 for(const material of referenced){
   assert.ok(textureMap[material],"Missing atlas entry: "+material);
 }
 for(const [key,value] of Object.entries(textureMap)){
   const values=typeof value.textures==="string"?
       [value.textures]:Array.isArray(value.textures)?value.textures:[];
   assert.ok(values.length>0,"Invalid texture list for "+key);
   for(const tex of values){
     const target=path.join(rp,tex+".png");
     assert.ok(fs.existsSync(target),"Atlas points to missing image "+key+" -> "+tex);
     checkPng(target);
   }
 }
 assert.ok(referenced.has("hartlogistics_transporter"));
 assert.ok(referenced.has("hartlogistics_bulk_storage"));
});
test("RP-02 every custom Bedrock block geometry has a matching resource identifier",()=>{
 const ids=new Set();
 for(const file of files(path.join(rp,"models/blocks")).filter(f=>f.endsWith(".json"))){
   for(const model of read(file)["minecraft:geometry"]??[]){
     ids.add(model.description?.identifier);
   }
 }
 let found=0;
 for(const file of files(path.join(bp,"blocks")).filter(f=>f.endsWith(".json"))){
   const block=read(file);
   for(const geometry of findAll(block,"minecraft:geometry")){
     if(geometry.startsWith("minecraft:"))continue;
     assert.ok(ids.has(geometry),"Geometry not shipped: "+geometry+" ("+file+")");
     found++;
   }
 }
 assert.ok(found>=2,"Expected new geometry and original Sorter masks");
});
test("RP-03 filter-display client entity, render controller, texture and pose resolve",()=>{
 const entity=read(path.join(rp,"entity/filter_display.entity.json"))["minecraft:client_entity"].description;
 const render=read(path.join(rp,"render_controllers/filter_display.render_controllers.json")).render_controllers;
 const models=read(path.join(rp,"models/entity/filter_display.geo.json"))["minecraft:geometry"];
 const animations=read(path.join(rp,"animations/filter_display.animation.json")).animations;
 assert.ok(render[entity.render_controllers[0]],"Missing display render controller");
 assert.ok(models.some(x=>x.description.identifier===entity.geometry.default),"Missing display geometry");
 assert.ok(animations[entity.animations.pose],"Missing display animation");
 assert.ok(fs.existsSync(path.join(rp,entity.textures.default+".png")),
   "Missing filter display texture");
 checkPng(path.join(rp,entity.textures.default+".png"));
});
test("RP-04 BP/RP identifiers and dependency are identical, no version skew",()=>{
 const b=read(path.join(bp,"manifest.json"));
 const r=read(path.join(rp,"manifest.json"));
 assert.deepEqual(b.header.version,r.header.version);
 assert.ok(b.dependencies.some(d=>d.uuid===r.header.uuid
          &&JSON.stringify(d.version)===JSON.stringify(r.header.version)));
 assert.notEqual(b.header.uuid,r.header.uuid);
});
test("RP-05 packaged files cannot contain stale textures_list allowlist",()=>{
 assert.ok(!fs.existsSync(path.join(rp,"textures/textures_list.json")),
   "A textures_list.json must list ALL texture files or be removed");
});
