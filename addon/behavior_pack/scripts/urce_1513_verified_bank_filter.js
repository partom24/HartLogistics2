/**
 * URCE 1.5.13: positively witnessed downstream FILTER home over a managed
 * Transporter bank and explicit Collector -> Receiver links.
 *
 * Transporters are visual *logical* infrastructure, not inventories or
 * item-by-item physical carriers. This read-only observer never transfers,
 * journals, persists, assigns Bulk ownership, or authorizes a Wildcard on
 * absence-of-claim evidence. The ORIGINAL Q4 writer alone can credit its
 * positively witnessed native storage endpoint.
 *
 * Every visited native block is reobserved in the synchronous attempt;
 * neither loaded Block handles nor positive cargo authority are cached.
 * A native Hopper next to a pipe is a column source only when the registered
 * complete Sorter run proves it; an unknown Hopper or unmatched active
 * endpoint is a hard HOLD. Incomplete/unloaded/branching paths HOLD.
 */
const RECEIVER="hartsorter:receiver",COLLECTOR="hartsorter:collector";
const SORTER="hartsorter:sorter",PIPE="hartsorter:transporter";
const HOPPER="minecraft:hopper";
const FACES=Object.freeze([
  {x:1,y:0,z:0},{x:-1,y:0,z:0},
  {x:0,y:1,z:0},{x:0,y:-1,z:0},
  {x:0,y:0,z:1},{x:0,y:0,z:-1}
]);
const valid=e=>!!e&&typeof e.d==="string"&&e.d.length>0&&
  [e.x,e.y,e.z].every(Number.isSafeInteger);
const key=(d,p)=>d+"|"+p.x+"|"+p.y+"|"+p.z;
const move=(p,o)=>({x:p.x+o.x,y:p.y+o.y,z:p.z+o.z});
const result=(status,reason,extra={})=>({
  status,reason,executePermitted:false,persistPermitted:false,
  mayAuthorizeCargo:false,...extra
});

/**
 * Strict endpoint. A Filter must prove: current physical Sorter, same source
 * Hopper, live orientation/storage, no under-storage Hopper extraction,
 * current native inventory admission. No unknown Auto/Wildcard census here.
 */
export function inspectBankFilterColumn({column,item,read,modeOf,matches,
  powered,destination,inventory,admit,maxColumnHeight=64}) {
  const hold=reason=>result("HOLD",reason);
  if(!column||!valid({...column,y:column.source?.y})||
     !Array.isArray(column.sorters)||!column.sorters.length||
     column.sorters.length>maxColumnHeight||!item||
     !["function"].every(()=>true))return hold("invalid_bank_column");
  const d=column.d,p=column.source,run=column.sorters;
  let source;
  try{source=read(d,p);}
  catch(_){return hold("source_unavailable");}
  if(source?.typeId!==HOPPER)return hold("source_not_native_hopper");
  try{
    const locked=source.permutation?.getState("toggle_bit");
    if(locked!==false&&locked!==0)return hold("source_hopper_locked_or_unknown");
    const c=source.getComponent("minecraft:inventory")?.container;
    if(!c?.isValid||c.firstItem()!==undefined)
      return hold("source_hopper_not_empty_or_unavailable");
  }catch(_){return hold("source_hopper_unverified");}
  let matching=0;
  const choices=[];
  for(let i=0;i<run.length;i++){
    const entry=run[i];
    if(!valid(entry)||entry.d!==d||entry.x!==p.x||
       entry.z!==p.z||entry.y!==run[0].y+i)
      return hold("column_registry_inconsistent");
    let block;
    try{block=read(d,entry);}
    catch(_){return hold("sorter_unavailable");}
    if(block?.typeId!==SORTER)return hold("sorter_unloaded_or_missing");
    if(i===run.length-1&&entry.y!==p.y-1)
      return hold("source_column_not_contiguous");
    let mode;
    try{mode=modeOf(entry);}
    catch(_){return hold("sorter_mode_unknown");}
    if(!["filter","auto","wildcard","bypass"].includes(mode))
      return hold("sorter_mode_unverified");
    if(mode!=="filter")continue;
    if(entry.nativeQuarantine)return hold("sorter_filter_quarantined");
    let match;
    try{match=!!entry.f&&matches(item,entry.f);}
    catch(_){return hold("filter_claim_unverified");}
    if(!match)continue;
    matching++;
    try{if(powered(block))continue;}
    catch(_){return hold("filter_power_unverified");}
    let dest;
    try{dest=destination(entry,block);}
    catch(_){return hold("filter_destination_unverified");}
    if(dest?.kind!=="storage"||!dest.block)
      return hold("matching_filter_destination_not_storage");
    const target=dest.block.location;
    if(!target||![target.x,target.y,target.z].every(Number.isSafeInteger))
      return hold("filter_storage_location_unverified");
    let under;
    try{under=read(d,{x:target.x,y:target.y-1,z:target.z});}
    catch(_){return hold("filter_storage_extraction_unknown");}
    if(!under)return hold("filter_storage_extraction_unknown");
    if(under.typeId===HOPPER)return hold("filter_storage_extractor_present");
    let container,slot;
    try{
      container=inventory(dest.block);
      if(!container?.isValid)return hold("filter_storage_inventory_unknown");
      slot=admit(container,item);
    }catch(_){return hold("filter_storage_admission_unknown");}
    if(slot&&slot.room>0)
      choices.push({entry,block:dest.block,container,slot,bottomUp:i});
  }
  if(!matching)return result("NO_FILTER_CLAIM","no_matching_filter_in_column");
  if(!choices.length)return result("CLAIM_FULL","matching_filter_no_room");
  return result("FILTER_HOME","live_matching_filter_storage",{
    homes:choices
  });
}

/**
 * Complete, bounded source-specific Transporter topology witness:
 * - source Receiver -> adjacent Transporter pipe run
 * - each pipe's neighboring *registered* Hopper/Sorter column
 * - at most one registered Collector per component, to its saved Receiver.
 *
 * All bank hops are logical; a single Q4 journal credits only the final
 * storage, never intermediate Receivers. Cycles, unloaded native blocks,
 * unknown Hopper adjacency and ambiguous unregistered endpoints HOLD.
 *
 * No permission inferred from absence of reachable Auto/Bulk/Filter claims.
 * The result supports only a POSITIVE FILTER home (not Auto/Wildcard).
 */
export function inspectVerifiedBankFilterHome({
  receiver,item,collectors,receivers,columns,read,modeOf,matches,
  powered,destination,inventory,admit,
  maxPipes=768,maxReads=7000,maxBanks=16,maxColumnHeight=64
}) {
  const hold=reason=>result("HOLD",reason);
  if(!valid(receiver)||!item||item.maxAmount<=1||
     !Array.isArray(collectors)||!Array.isArray(receivers)||
     !Array.isArray(columns)||typeof read!=="function"||
     [modeOf,matches,powered,destination,inventory,admit]
       .some(f=>typeof f!=="function")||
     !Number.isInteger(maxPipes)||maxPipes<1||
     !Number.isInteger(maxReads)||maxReads<1||
     !Number.isInteger(maxBanks)||maxBanks<1)return hold("invalid_bank_request");

  const rById=new Map(),cByPos=new Map(),columnBySource=new Map();
  for(const r of receivers){
    if(!valid(r)||typeof r.id!=="string"||rById.has(r.id))
      return hold("ambiguous_receiver_registration");
    rById.set(r.id,r);
  }
  if(rById.get(receiver.id)!==receiver)
    return hold("receiver_registration_unverified");
  for(const c of collectors){
    if(!valid(c)||typeof c.id!=="string"||cByPos.has(key(c.d,c)))
      return hold("ambiguous_collector_registration");
    cByPos.set(key(c.d,c),c);
  }
  for(const column of columns){
    if(!valid({...column,y:column?.source?.y})||
       !valid({...column?.source,d:column?.d}))
      return hold("invalid_column_registration");
    const k=key(column.d,column.source);
    if(columnBySource.has(k))return hold("duplicate_column_source");
    columnBySource.set(k,column);
  }
  const cache=new Map();let reads=0,pipeVisits=0;
  function native(d,p){
    const k=key(d,p);
    if(cache.has(k))return cache.get(k);
    if(++reads>maxReads)throw Error("native_read_budget");
    const block=read(d,p);
    if(!block||typeof block.typeId!=="string")
      throw Error("native_chunk_unavailable");
    cache.set(k,block);
    return block;
  }
  const nextReceivers=[{r:receiver,hops:0}],visitedR=new Set();
  const candidates=[];let unknown;
  try {
    for(let idx=0;idx<nextReceivers.length;idx++){
      if(nextReceivers.length>maxBanks)throw Error("bank_hop_limit");
      const {r,hops}=nextReceivers[idx];
      if(visitedR.has(r.id))throw Error("managed_bank_cycle");
      visitedR.add(r.id);
      if(native(r.d,r).typeId!==RECEIVER)
        throw Error("bank_receiver_missing");
      const out=native(r.d,{x:r.x,y:r.y-1,z:r.z});
      if(out.typeId!==HOPPER)throw Error("bank_receiver_output_not_hopper");
      // A bank enters its visual graph through the Receiver or its own
      // output Hopper. Hopper direction and emptiness are verified again
      // in the original Q4 writer; the logical bank does not use Hopper
      // movement. Redstone/locked blocks can never receive routing authority.
      const seeds=[],seedKeys=new Set();
      for(const anchor of [r,{...r,y:r.y-1}]){
        for(const face of FACES){
          const p=move(anchor,face),b=native(r.d,p);
          if(b.typeId!==PIPE)continue;
          const k=key(r.d,p);
          if(!seedKeys.has(k)){seedKeys.add(k);seeds.push(p);}
        }
      }
      if(!seeds.length)throw Error("bank_receiver_no_transporter");
      if(seeds.length!==1)throw Error("bank_multiple_visual_entrances");

      const queue=[seeds[0]],visitedP=new Set([key(r.d,seeds[0])]);
      const columnsFound=new Set(),exits=new Map();
      for(let q=0;q<queue.length;q++){
        if(++pipeVisits>maxPipes)throw Error("transporter_pipe_limit");
        const p=queue[q];
        if(native(r.d,p).typeId!==PIPE)
          throw Error("transporter_run_mutated");
        let pipeNeighbors=0;
        for(const face of FACES){
          const at=move(p,face),adj=native(r.d,at);
          const k=key(r.d,at);
          if(adj.typeId===PIPE){
            pipeNeighbors++;
            if(!visitedP.has(k)){visitedP.add(k);queue.push(at);}
          }else if(adj.typeId===HOPPER){
            const column=columnBySource.get(k);
            const sourceOutput=k===key(r.d,{x:r.x,y:r.y-1,z:r.z});
            if(!column&&!sourceOutput)
              throw Error("unregistered_hopper_bank_boundary");
            if(column)columnsFound.add(column);
          }else if(adj.typeId===COLLECTOR){
            const c=cByPos.get(k);
            if(!c)throw Error("unregistered_collector_bank_boundary");
            if(!c.link||!rById.has(c.link))
              throw Error("collector_without_verified_receiver");
            exits.set(c.id,c);
          }else if(adj.typeId===RECEIVER){
            if(k!==key(r.d,r))throw Error("multiple_receivers_one_visual_bank");
          }
        }
        if(pipeNeighbors>2)throw Error("ambiguous_branched_pipe_run");
      }
      if(exits.size>1)throw Error("ambiguous_multi_exit_bank");
      for(const column of columnsFound){
        const found=inspectBankFilterColumn({
          column,item,read:native,modeOf,matches,powered,destination,
          inventory,admit,maxColumnHeight
        });
        if(found.status==="HOLD")throw Error(found.reason);
        if(found.status==="FILTER_HOME"){
          for(const home of found.homes)
            candidates.push({...home,bankReceiverId:r.id,links:hops,
              // Deterministic low-transaction cost proxy. Actual BDS
              // profiling is required to choose an empirical policy.
              cost:hops*10000+queue.length+column.sorters.length+
                home.bottomUp});
        }
      }
      for(const c of exits.values()){
        const next=rById.get(c.link);
        if(!next||native(c.d,c).typeId!==COLLECTOR ||
           native(next.d,next).typeId!==RECEIVER)
          throw Error("collector_receiver_link_unverified");
        if(next.d!==c.d)throw Error("cross_dimension_bank_link");
        if(visitedR.has(next.id))throw Error("managed_bank_cycle");
        nextReceivers.push({r:next,hops:hops+1});
      }
    }
  }catch(e){return hold(String(e?.message||"unknown_native_bank_boundary"));}
  if(!candidates.length)return result("NO_FILTER_HOME",
    "no_live_reachable_filter_admission",
    {banks:visitedR.size,pipeVisits,reads});
  candidates.sort((a,b)=>a.cost-b.cost||
    a.entry.y-b.entry.y);
  return result("FILTER_HOME","verified_transporter_filter_home",{
    chosen:candidates[0],banks:visitedR.size,pipeVisits,reads
  });
}
