/**
 * URCE 1.5.8 design probe — source-only native Hopper terminal classification.
 *
 * NOT imported by the 1.5.7 runtime. NOT a managed-link or cargo permission.
 * A Hopper's facing direction witnesses its PUSH path, but a second Hopper
 * BELOW can independently PULL its inventory even if it faces sideways.
 *
 * Classify only a deliberately small set of unambiguously inert vanilla
 * blocks. An unknown block, container, custom block, missing chunk, possible
 * pull branch or exhausted budget remains HOLD. Every call is read-only.
 */
const HOPPER="minecraft:hopper";
const AIR="minecraft:air";
const DOWN=Object.freeze({x:0,y:-1,z:0});
const FACING=new Map([
  [0,DOWN],[1,DOWN],
  [2,{x:0,y:0,z:-1}],[3,{x:0,y:0,z:1}],
  [4,{x:-1,y:0,z:0}],[5,{x:1,y:0,z:0}]
]);
// These types cannot accept native Hopper inventory inserts or route items.
// This is a conservative, explicit class, never a generic isSolid shortcut:
// chests, barrels, Sorters, dispensers and arbitrary add-on blocks stay HOLD.
const INERT=new Set([
  "minecraft:cobbled_deepslate","minecraft:deepslate",
  "minecraft:stone","minecraft:cobblestone","minecraft:bedrock",
  "minecraft:andesite","minecraft:diorite","minecraft:granite",
  "minecraft:dirt","minecraft:grass_block"
]);
const key=(d,p)=>d+"|"+p.x+"|"+p.y+"|"+p.z;
const move=(p,v)=>({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});
const coords=p=>p&&[p.x,p.y,p.z].every(Number.isSafeInteger);

export function probeNativeHopperTerminal({
  dimension,receiver,getBlock,maxReads=1024,maxHops=512
}) {
  const metrics={reads:0,hops:0};
  const answer=(classification,reason,more={})=>({
    classification,reason,...more,metrics:{...metrics},
    // Even a proven local stopper cannot certify an entire managed network
    // against unloads, world changes, minecarts or other path segments.
    coverageComplete:false,mayAuthorizeLink:false,
    mayTransferCargo:false,persistPermitted:false
  });
  if(typeof dimension!=="string"||!dimension||
     !coords(receiver)||typeof getBlock!=="function"||
     !Number.isSafeInteger(maxReads)||maxReads<1||
     !Number.isSafeInteger(maxHops)||maxHops<1)
    return answer("HOLD","invalid_probe_context");

  const cache=new Map();
  function read(p) {
    const k=key(dimension,p);
    if(cache.has(k))return cache.get(k);
    let value;
    if(metrics.reads>=maxReads)value={state:"unknown",reason:"read_budget"};
    else {
      metrics.reads++;
      try {
        const block=getBlock(dimension,p);
        value=block&&typeof block.typeId==="string"
          ?{state:"loaded",block}
          :{state:"unknown",reason:"unloaded_or_unavailable"};
      } catch (_) {value={state:"unknown",reason:"get_block_failed"};}
    }
    cache.set(k,value);
    return value;
  }

  let p=move(receiver,DOWN);
  const seen=new Set();
  for(let i=0;i<maxHops;i++) {
    const k=key(dimension,p);
    if(seen.has(k))return answer("CYCLE","verified_hopper_output_cycle");
    seen.add(k);
    const found=read(p);
    if(found.state!=="loaded")
      return answer("HOLD",found.reason,{at:p});
    if(found.block.typeId!==HOPPER)
      return answer("HOLD","receiver_output_not_hopper",{at:p,
        blockType:found.block.typeId});
    metrics.hops++;
    let facing;
    try {facing=found.block.permutation?.getState("facing_direction");}
    catch (_) {return answer("HOLD","hopper_direction_unverified",{at:p});}
    const vector=FACING.get(facing);
    if(!vector)
      return answer("HOLD","hopper_direction_unverified",{at:p});
    const next=move(p,vector);

    // Native Hopper BELOW can pull from this one regardless of the
    // current Hopper's horizontal output. Check ONLY the source path;
    // the downward-output case shares the already-read next block.
    if(vector.y===0) {
      const belowPos=move(p,DOWN);
      const below=read(belowPos);
      if(below.state!=="loaded")
        return answer("HOLD","unverified_pull_below_hopper",{
          at:belowPos,detail:below.reason});
      if(below.block.typeId!==AIR&&!INERT.has(below.block.typeId))
        return answer("HOLD","possible_native_pull_branch",{
          at:belowPos,blockType:below.block.typeId});
    }
    const nextBlock=read(next);
    if(nextBlock.state!=="loaded")
      return answer("HOLD",nextBlock.reason,{at:next});
    if(nextBlock.block.typeId===HOPPER) {
      p=next;
      continue;
    }
    if(nextBlock.block.typeId===AIR)
      return answer("TERMINAL_AIR","verified_hopper_output_to_air",{
        at:next,fromHopper:p});
    if(INERT.has(nextBlock.block.typeId))
      return answer("TERMINAL_INERT","verified_inert_vanilla_stopper",{
        at:next,fromHopper:p,blockType:nextBlock.block.typeId});
    return answer("HOLD","unverified_native_output_boundary",{
      at:next,blockType:nextBlock.block.typeId});
  }
  return answer("HOLD","hop_limit");
}
