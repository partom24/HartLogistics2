/**
 * URCE U1 terminal + directed-supply COMPOSITION REVIEW (source only).
 *
 * This model intentionally cannot grant managed links or drain Q4.
 * It joins one native directed Hopper graph and local below-pull checks
 * in a SINGLE invocation with a shared bounded Block-reader snapshot.
 * Only source-reachable terminals are analyzed; disconnected historical
 * registries cannot contaminate the owner's actual supply path.
 *
 * A local verified inert stopper is not an absence-of-feedback guarantee
 * for the entire Minecraft dimension (minecarts, foreign extraction, etc).
 * Runtime promotion requires a versioned candidate and separate custody gate.
 */
import {observeNativeHopperWitness} from "./urce_u1_native_hopper_witness.mjs";
import {sourceReachability} from "./urce_u1_route_model.mjs";
import {probeNativeHopperTerminal} from "./urce_u1_solid_terminal_probe.mjs";

const key=(d,p)=>d+"|"+p.x+"|"+p.y+"|"+p.z;
const samePosition=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y&&a.z===b.z;

export function reviewNativeDirectedTerminal({
  receivers,collectors,getBlock,sourceReceiverId,
  maxUniqueReads=8192,maxHopsPerReceiver=512
}) {
  let uniqueReads=0;
  const cache=new Map();
  const answer=(decision,reason,detail={})=>({
    decision,reason,...detail,uniqueReads,
    coverageComplete:false,mayAuthorizeLink:false,
    mayTransferCargo:false,persistPermitted:false,executePermitted:false
  });
  if(!Array.isArray(receivers)||!Array.isArray(collectors)||
     typeof getBlock!=="function"||typeof sourceReceiverId!=="string"||
     !sourceReceiverId||!Number.isSafeInteger(maxUniqueReads)||maxUniqueReads<1||
     !Number.isSafeInteger(maxHopsPerReceiver)||maxHopsPerReceiver<1)
    return answer("HOLD","invalid_native_terminal_review");

  // No cross-tick state. Unknown reads stay unknown for this review and
  // an exhausted budget can NEVER fabricate loaded air or an inert block.
  function sharedBlock(d,p) {
    const k=key(d,p);
    if(cache.has(k)) {
      const result=cache.get(k);
      if(result.failed)throw result.error;
      return result.block;
    }
    if(uniqueReads>=maxUniqueReads)return undefined;
    uniqueReads++;
    try {
      const block=getBlock(d,p);
      cache.set(k,{failed:false,block});
      return block;
    } catch (error) {
      cache.set(k,{failed:true,error});
      throw error;
    }
  }

  const native=observeNativeHopperWitness({
    receivers,collectors,getBlock:sharedBlock,
    maxReads:maxUniqueReads,maxHopsPerReceiver
  });
  if(!native.graph||native.status==="INVALID")
    return answer("HOLD","invalid_native_graph",{native});
  if(native.status==="CYCLE"||native.graph.status==="CYCLE")
    return answer("REJECT","existing_directed_cycle",{native});

  const source=native.graph.byId.get(sourceReceiverId);
  if(!source||source.kind!=="receiver"||source.loaded!==true)
    return answer("HOLD","source_receiver_unverified",{native});
  const reachable=sourceReachability(native.graph,sourceReceiverId);
  if(reachable.status!=="OK"||reachable.unknown)
    return answer("HOLD","source_reachability_unverified",{native});

  const provenTerminals=[],blockers=[];
  for(const issue of native.unknown) {
    if(!reachable.reached.has(issue.from))continue;
    if(issue.reason!=="unsupported_native_boundary") {
      blockers.push({from:issue.from,reason:issue.reason});
      continue;
    }
    const receiver=receivers.find(r=>r.id===issue.from);
    if(!receiver||issue.dimension!==receiver.d) {
      blockers.push({from:issue.from,reason:"invalid_boundary_owner"});
      continue;
    }
    // This local probe checks direction, every intermediate horizontal
    // Hopper's native pull-below path, and the SAME exact observed stopper.
    // A classification is never a managed-link or cargo permission.
    const local=probeNativeHopperTerminal({
      dimension:receiver.d,receiver,getBlock:sharedBlock,
      maxReads:maxUniqueReads,maxHops:maxHopsPerReceiver
    });
    if(local.classification==="TERMINAL_INERT"&&
       samePosition(local.at,issue.position)&&
       local.blockType===issue.blockType) {
      provenTerminals.push({receiverId:issue.from,
        dimension:receiver.d,at:local.at,blockType:local.blockType,
        hopperSteps:local.metrics.hops});
    } else {
      blockers.push({from:issue.from,reason:local.reason,
        classification:local.classification,at:local.at});
    }
  }
  if(blockers.length)return answer("HOLD","source_branch_unverified",{
    native,blockers,provenTerminals
  });
  return answer(provenTerminals.length?"LOCAL_TERMINALS_PROVED":"NO_SOLID_TERMINAL",
    "directed_snapshot_not_cargo_authority",{
      native,provenTerminals,blockers
    });
}
