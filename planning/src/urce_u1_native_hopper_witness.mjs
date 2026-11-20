/**
 * URCE U1 — bounded, read-only *positive* native Hopper supply witnesses.
 *
 * This module accepts the same shape as dimension.getBlock({x,y,z}) and
 * block.permutation.getState("facing_direction"), through an injected reader.
 * It does not import Bedrock, scan item inventories, mutate world properties,
 * accept links, or make item/custody decisions.
 *
 * A Hopper-output chain may positively witness Receiver -> Collector reachability.
 * Its ABSENCE cannot prove that a bank/Transporter/Sorter/chest/foreign path is
 * absent. In particular, this module never returns ALLOW for a new link.
 *
 * This is an offline/integration adapter, NOT an installed runtime guard.
 */
import {buildReadOnlyGraph, checkManagedLink} from "./urce_u1_route_model.mjs";

const OFFSET = new Map([
  [0,{x:0,y:-1,z:0}], [1,{x:0,y:-1,z:0}],
  [2,{x:0,y:0,z:-1}], [3,{x:0,y:0,z:1}],
  [4,{x:-1,y:0,z:0}], [5,{x:1,y:0,z:0}]
]);
const COLLECTOR = "hartsorter:collector";
const RECEIVER = "hartsorter:receiver";
const HOPPER = "minecraft:hopper";
const shift=(p,v)=>({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});
const at=(e)=>({x:e.x,y:e.y,z:e.z});
const valid=(e)=>!!e && typeof e.id==="string" && e.id.length>0 &&
  typeof e.d==="string" && e.d.length>0 &&
  [e.x,e.y,e.z].every(Number.isSafeInteger);

export function observeNativeHopperWitness({
  receivers, collectors, getBlock, maxReads=8192, maxHopsPerReceiver=512
}) {
  const invalid=(reason)=>({
    status:"INVALID",reason,graph:undefined,edges:[],unknown:[],
    metrics:{reads:0,steps:0},coverageComplete:false,mayAuthorizeLink:false
  });
  if(!Array.isArray(receivers)||!Array.isArray(collectors)||
     typeof getBlock!=="function"||!Number.isSafeInteger(maxReads)||
     maxReads<1||!Number.isSafeInteger(maxHopsPerReceiver)||
     maxHopsPerReceiver<1) return invalid("invalid_observer_arguments");
  const all=[...receivers,...collectors], ids=new Set(),positions=new Set();
  for(const e of all) {
    if(!valid(e)||ids.has(e.id))return invalid("invalid_or_duplicate_endpoint");
    ids.add(e.id);
    const k=e.d+"|"+e.x+"|"+e.y+"|"+e.z;
    if(positions.has(k))return invalid("overlapping_endpoint");
    positions.add(k);
  }
  const unknown=[],edges=[],metrics={reads:0,steps:0};
  const cache=new Map();
  function read(d,p) {
    const k=d+"|"+p.x+"|"+p.y+"|"+p.z;
    if(cache.has(k))return cache.get(k);
    let result;
    if(metrics.reads>=maxReads) result={state:"unknown",reason:"read_budget"};
    else {
      metrics.reads++;
      try {
        const block=getBlock(d,p);
        result=block&&typeof block.typeId==="string"
          ?{state:"loaded",block}
          :{state:"unknown",reason:"unloaded_or_unavailable"};
      } catch(_) {
        result={state:"unknown",reason:"get_block_failed"};
      }
    }
    cache.set(k,result);
    return result;
  }
  const nodes=all.map(e=>{
    const found=read(e.d,at(e));
    const expected=collectors.includes(e)?COLLECTOR:RECEIVER;
    const loaded=found.state==="loaded" && found.block.typeId===expected;
    if(!loaded) unknown.push({from:e.id,reason:found.state==="unknown"
      ?found.reason:"stale_endpoint_type"});
    return {id:e.id,kind:expected===COLLECTOR?"collector":"receiver",loaded};
  });
  const byId=new Map(all.map(e=>[e.id,e]));
  const byPosition=new Map(collectors.map(e=>[
    e.d+"|"+e.x+"|"+e.y+"|"+e.z,e.id
  ]));
  for(const col of collectors) {
    if(!col.link)continue;
    if(typeof col.link!=="string"||!byId.has(col.link)||
       !receivers.some(r=>r.id===col.link)) {
      unknown.push({from:col.id,reason:"unknown_receiver_link"});
      continue;
    }
    const present=nodes.find(n=>n.id===col.id)?.loaded===true &&
      nodes.find(n=>n.id===col.link)?.loaded===true;
    if(!present)unknown.push({from:col.id,reason:"link_endpoint_unverified"});
    edges.push({from:col.id,to:col.link,kind:"collector_receiver",
      verified:present,loaded:present});
  }
  for(const receiver of receivers) {
    if(nodes.find(n=>n.id===receiver.id)?.loaded!==true)continue;
    let pos=shift(at(receiver),{x:0,y:-1,z:0});
    let started=false,hit=false;
    const seen=new Set();
    for(let hop=0;hop<maxHopsPerReceiver;hop++) {
      const k=receiver.d+"|"+pos.x+"|"+pos.y+"|"+pos.z;
      if(seen.has(k)) {
        unknown.push({from:receiver.id,reason:"native_hopper_cycle"});
        hit=true;break;
      }
      seen.add(k);
      const found=read(receiver.d,pos);
      if(found.state!=="loaded") {
        unknown.push({from:receiver.id,reason:found.reason});
        hit=true;break;
      }
      const block=found.block;
      if(block.typeId!==HOPPER) {
        if(started && block.typeId===COLLECTOR) {
          const target=byPosition.get(k);
          if(target && nodes.find(n=>n.id===target)?.loaded===true) {
            edges.push({from:receiver.id,to:target,kind:"hopper",
              verified:true,loaded:true,witnessHops:seen.size-1});
          } else unknown.push({from:receiver.id,reason:"unregistered_collector"});
        } else if(!started) {
          // Receiver-output semantics in protected 1.4.2 require a Hopper
          // directly underneath. A positively loaded different block is
          // native-output ABSENCE, not an unloaded/unknown path. A logical
          // visual bank, if present, is observed separately. Later placement
          // of a Hopper MUST invalidate any previously safe route snapshot.
        } else if(block.typeId!=="minecraft:air") {
          // Chests, Sorters, Transporters and other endpoints may have other
          // native input/output semantics. Do NOT infer a pass-through path.
          unknown.push({
            from:receiver.id,reason:"unsupported_native_boundary",
            // Report observed native block and precise terminating Hopper
            // coordinate. This is diagnostic evidence, NOT route authority.
            dimension:receiver.d,
            position:{x:pos.x,y:pos.y,z:pos.z},
            blockType:block.typeId,receiverId:receiver.id
          });
        }
        hit=true;break;
      }
      started=true;metrics.steps++;
      let facing;
      try { facing=block.permutation?.getState("facing_direction"); }
      catch(_) { facing=undefined; }
      const direction=OFFSET.get(facing);
      if(!direction) {
        unknown.push({from:receiver.id,reason:"hopper_direction_unverified"});
        hit=true;break;
      }
      pos=shift(pos,direction);
    }
    if(!hit)unknown.push({from:receiver.id,reason:"hop_limit"});
  }
  const graph=buildReadOnlyGraph(nodes,edges);
  return {
    status:graph.status==="CYCLE"?"CYCLE":
      graph.status==="OK"?"OBSERVED":"INVALID",
    reason:graph.reason||null,graph,edges,unknown,metrics,
    // Positive witnesses can reject a link. Negative coverage is deliberately
    // NOT complete: visual Transporter, Sorter, chests and external/native
    // input routes have not been exhaustively observed.
    coverageComplete:false,
    mayAuthorizeLink:false
  };
}

export function evaluateProposedLinkWitness(observation,collectorId,receiverId) {
  const refuse=(decision,reason)=>({
    decision,reason,persistPermitted:false,executePermitted:false
  });
  if(!observation||!observation.graph)
    return refuse("HOLD","no_native_topology_witness");
  if(observation.graph.status==="CYCLE")
    return refuse("REJECT","existing_verified_supply_cycle");
  const candidate=checkManagedLink(observation.graph,collectorId,receiverId);
  if(candidate.decision==="REJECT")
    return refuse("REJECT",candidate.reason);
  if(candidate.decision==="HOLD")
    return refuse("HOLD",candidate.reason);
  // The probe is not an exhaustive connectivity observer, so no affirmative
  // absence-of-return-path proof. Another verified module must be composed
  // before a real pre-commit ALLOW can exist.
  return refuse("HOLD","incomplete_native_supply_coverage");
}
