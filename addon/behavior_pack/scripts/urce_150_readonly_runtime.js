/*
 * Hart Logistics 1.5 development — read-only visible Transporter topology.
 * Player-facing diagnostics and adjacency-only Transporter arm visuals.
 * Local visual block permutations may change on player placement/break.
 * No item movement, native inventory writes, storage properties,
 * persistent route/capacity cache or custody authority.
 */
import { world, system } from '@minecraft/server';
const TRANSPORTER = 'hartsorter:transporter';
const BULK = 'hartsorter:bulk_storage';
const FACES = [
  {x:1,y:0,z:0},{x:-1,y:0,z:0},
  {x:0,y:1,z:0},{x:0,y:-1,z:0},
  {x:0,y:0,z:1},{x:0,y:0,z:-1}
];
const ENDPOINTS = new Set([
  'hartsorter:sorter','hartsorter:collector','hartsorter:receiver',
  'hartsorter:bulk_storage','minecraft:hopper'
]);
// PG27's accepted 4x4-core pipe arms are now driven only by native
// *player placement/break* events. No custom global polling interval,
// no block onTick callbacks and no cargo custody. Visual arms do NOT
// establish directed routing or inventory transfer authority.
const VISUAL_ENDPOINTS = new Set([
  ...ENDPOINTS,
  'minecraft:chest','minecraft:trapped_chest','minecraft:barrel'
]);
const VISUAL_FACES = [
  {name:'east',x:1,y:0,z:0},{name:'west',x:-1,y:0,z:0},
  {name:'up',x:0,y:1,z:0},{name:'down',x:0,y:-1,z:0},
  {name:'south',x:0,y:0,z:1},{name:'north',x:0,y:0,z:-1}
];
const visualPending = new Map();
let visualScheduled = false;
const VISUAL_POSITIONS_PER_TICK = 8;
function updateTransporterVisual(dimension,pos){
  let block;
  try{block=dimension.getBlock(pos);}catch(_){return;}
  if(!block || block.typeId!==TRANSPORTER)return;
  try{
    let permutation=block.permutation,changed=false;
    for(const dir of VISUAL_FACES){
      let neighbor;
      try{neighbor=dimension.getBlock(shifted(pos,dir));}catch(_){continue;}
      if(!neighbor)continue; // Unknown/unloaded never means disconnected.
      const want=neighbor.typeId===TRANSPORTER||VISUAL_ENDPOINTS.has(neighbor.typeId);
      const state='hartlogistics:connect_'+dir.name;
      if(permutation.getState(state)!==want){
        permutation=permutation.withState(state,want);
        changed=true;
      }
    }
    if(changed)block.setPermutation(permutation);
  }catch(_){/* Visual degradation is never cargo authority. */}
}
function flushTransporterVisuals(){
  visualScheduled=false;
  let n=0;
  while(visualPending.size && n++<VISUAL_POSITIONS_PER_TICK){
    const first=visualPending.keys().next().value;
    const item=visualPending.get(first);
    visualPending.delete(first);
    updateTransporterVisual(item.dimension,item.pos);
  }
  if(visualPending.size && !visualScheduled){
    visualScheduled=true;
    system.run(flushTransporterVisuals);
  }
}
function scheduleVisualsNear(dimension,center){
  if(!dimension || !center)return;
  for(const p of [center,...VISUAL_FACES.map(dir=>shifted(center,dir))]){
    const id=dimension.id+'|'+key(p);
    if(!visualPending.has(id))visualPending.set(id,{dimension,pos:p});
  }
  if(!visualScheduled){
    visualScheduled=true;
    system.run(flushTransporterVisuals);
  }
}
world.afterEvents.playerPlaceBlock.subscribe(ev=>{
  try{scheduleVisualsNear(ev.block.dimension,ev.block.location);}catch(_){}
});
world.afterEvents.playerBreakBlock.subscribe(ev=>{
  try{scheduleVisualsNear(ev.block.dimension,ev.block.location);}catch(_){}
});
const ongoing = new Set();
const recent = new Map();
let scans = 0;
const MAX_PARALLEL = 2;
const PER_TICK = 12; // Work cap per tick; not a limit on network dimensions.
function key(p){return p.x+'|'+p.y+'|'+p.z;}
function shifted(p,d){return {x:p.x+d.x,y:p.y+d.y,z:p.z+d.z};}
function message(player,text){
  try {player.sendMessage('§3[Hart URCE DEV] §r'+text);} catch(_){ }
}
function inspect(player,dimension,start){
  if(!player||!dimension)return;
  const playerId=player.id;
  if(ongoing.has(playerId))return;
  if(scans>=MAX_PARALLEL){message(player,'§7Another network inspection is running.');return;}
  ongoing.add(playerId);scans++;
  const pending=[start];
  const seen=new Set([key(start)]);
  const parent=new Map([[key(start),null]]);
  const endpoints=new Map();
  let traversed=0,unavailable=0,cycles=0,invalidated=false;
  function complete(){
    ongoing.delete(playerId);scans=Math.max(0,scans-1);
    if(invalidated){message(player,'§eThe route changed during inspection; nothing was certified.');return;}
    const types=new Map();
    for(const type of endpoints.values())types.set(type,(types.get(type)||0)+1);
    const listed=[...types].map(([t,n])=>t.split(':').pop()+': '+n).join(', ')||'none';
    message(player,'§bTransporters: '+traversed+'§r | §7nearby native endpoints: '+listed);
    if(cycles>0)message(player,'§eA physical loop was observed; no directed route is certified.');
    if(unavailable>0)message(player,'§e'+unavailable+' unavailable boundary reads; this view is incomplete.');
    message(player,'§7Infrastructure-only preview: no Transporter cargo movement or Bulk storage is enabled.');
  }
  function step(){
    try{
      for(let work=0;work<PER_TICK&&pending.length;work++){
        const pos=pending.shift(),origin=key(pos);
        let current;
        try{current=dimension.getBlock(pos);}catch(_){unavailable++;continue;}
        if(!current){unavailable++;continue;}
        if(current.typeId!==TRANSPORTER){invalidated=true;break;}
        traversed++;
        for(const face of FACES){
          const neighbor=shifted(pos,face);
          let block;
          try{block=dimension.getBlock(neighbor);}catch(_){unavailable++;continue;}
          if(!block){unavailable++;continue;}
          const id=key(neighbor);
          if(block.typeId===TRANSPORTER){
            if(!seen.has(id)){
              seen.add(id);parent.set(id,origin);pending.push(neighbor);
            }else if(parent.get(origin)!==id){cycles++;}
          }else if(ENDPOINTS.has(block.typeId)){endpoints.set(id,block.typeId);}
        }
      }
      if(pending.length&&!invalidated)system.run(step);
      else complete();
    }catch(_){invalidated=true;complete();}
  }
  system.run(step);
}
world.beforeEvents.playerInteractWithBlock.subscribe(ev=>{
  if(!ev.isFirstEvent)return;
  let type,dimension,location,player;
  try{
    type=ev.block?.typeId;
    if(type!==TRANSPORTER&&type!==BULK)return;
    player=ev.player;dimension=ev.block.dimension;
    const p=ev.block.location;
    location={x:p.x,y:p.y,z:p.z};
  }catch(_){return;}
  if(!player)return;
  const now=system.currentTick;
  if(now-(recent.get(player.id)??-1000)<20)return;
  recent.set(player.id,now);
  system.run(()=>{
    if(type===BULK)message(player,'§6Bulk Storage preview. §7No item custody is enabled in this build.');
    else {
      // Reconcile a pre-existing pipe on first interaction after upgrading.
      // Only local visual permutations change, never native cargo custody.
      scheduleVisualsNear(dimension,location);
      inspect(player,dimension,location);
    }
  });
});
