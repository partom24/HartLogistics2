/**
 * PG-18: isolated, side-effect-free Transporter region repartition proposal.
 *
 * NOT a lease manager, controller election, world scanner, runtime permission,
 * gameplay component, or transaction writer. Freeze, fence, and graph inputs
 * are untrusted caller assertions. Even favorable results are PLAN_ONLY.
 */
const RIGHTS = Object.freeze({
  canMoveItems:false, canDebitQueue:false, canCreditDestination:false,
  canCreditBulk:false, canReplay:false, canSettle:false,
  canReleaseReservation:false, canClearJournal:false,
  canAssumeControllerAuthority:false, canCommitEpoch:false,
  productionAuthorized:false
});
const result = (status,reason,extra={}) =>
  Object.freeze({status,reason,...extra,...RIGHTS});
const hold = reason => result("HOLD",reason);
const record = x => x!==null && typeof x==="object" && !Array.isArray(x);
const safeId = x => typeof x==="string" && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(x);
const validEpoch = x => Number.isSafeInteger(x) && x>0 && x<Number.MAX_SAFE_INTEGER;
const canonicalNode = x => {
  if(typeof x!=="string" ||
     !/^-?(?:0|[1-9][0-9]*),-?(?:0|[1-9][0-9]*),-?(?:0|[1-9][0-9]*)$/.test(x))
    return false;
  const parts=x.split(",").map(Number);
  return parts.every(n=>Number.isSafeInteger(n) && Math.abs(n)<=30000000) &&
    parts.join(",")===x;
};
const unique = xs => new Set(xs).size===xs.length;
const lex = (a,b) => a<b?-1:a>b?1:0;
const DELTAS = Object.freeze([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]);
const neighbors = key => {
  const origin=key.split(",").map(Number);
  return DELTAS.map(d=>d.map((n,i)=>origin[i]+n).join(",")).sort(lex);
};

/** Full known same-dimension six-face graph; deterministic and linear edges. */
function components(nodes){
  const available=new Set(nodes), out=[];
  while(available.size){
    const start=[...available].sort(lex)[0], queue=[start];
    available.delete(start);
    for(let cursor=0;cursor<queue.length;cursor++){
      for(const next of neighbors(queue[cursor])){
        if(available.delete(next)) queue.push(next);
      }
    }
    out.push(Object.freeze(queue.sort(lex)));
  }
  out.sort((a,b)=>lex(a[0],b[0]));
  return Object.freeze(out);
}

/**
 * Proposed candidate ranks are NOT ownership leases. The modeled global
 * freeze does not actually stop vanilla Hoppers, players, or foreign add-ons.
 * A Bedrock adapter requires separately authenticated external-writer
 * exclusion, durable monotonic fencing, CAS, and item custody.
 */
export function proposeRegionRepartition(input){
  if(!record(input)||!safeId(input.networkId)||!safeId(input.dimensionId)||
     !validEpoch(input.previousEpoch))
    return hold("invalid_network_dimension_or_epoch");
  const {networkId,dimensionId,previousEpoch,freeze,
    expectedNodes,loadedNodes,unknownBoundary,controllers,
    predecessorClaims,predecessorInventoryComplete,fencedControllerIds,
    globalWriterScanComplete,pendingOperations}=input;
  if(!record(freeze)||freeze.state!=="FROZEN"||
     freeze.scope!=="ALL_HART_SCRIPT_ROUTING"||
     freeze.persistedReadback!==true||freeze.epoch!==previousEpoch)
    return hold("global_freeze_unverified");
  if(globalWriterScanComplete!==true||!Array.isArray(pendingOperations)||
     pendingOperations.length!==0)
    return hold("pending_or_unobserved_operations");
  if(!Array.isArray(expectedNodes)||!expectedNodes.length||
     !expectedNodes.every(canonicalNode)||!unique(expectedNodes)||
     !Array.isArray(loadedNodes)||!unique(loadedNodes)||
     loadedNodes.length!==expectedNodes.length||
     loadedNodes.some(x=>!expectedNodes.includes(x))||
     unknownBoundary!==false)
    return hold("incomplete_or_unknown_topology");
  if(!Array.isArray(predecessorClaims)||!predecessorClaims.length||
     predecessorInventoryComplete!==true||
     !predecessorClaims.every(c=>record(c)&&safeId(c.controllerId)&&
       safeId(c.regionId)&&c.networkId===networkId&&
       c.epoch===previousEpoch)||
     !unique(predecessorClaims.map(c=>c.controllerId))||
     !unique(predecessorClaims.map(c=>c.regionId))||
     !Array.isArray(fencedControllerIds)||!unique(fencedControllerIds)||
     fencedControllerIds.length!==predecessorClaims.length||
     fencedControllerIds.some(x=>!predecessorClaims.some(c=>c.controllerId===x)))
    return hold("predecessor_ownership_or_fencing_unproven");
  if(!Array.isArray(controllers)||!controllers.length||
     !controllers.every(c=>record(c)&&safeId(c.id)&&
       c.networkId===networkId&&c.dimensionId===dimensionId&&
       canonicalNode(c.node)&&expectedNodes.includes(c.node)&&
       c.live===true)||
     !unique(controllers.map(c=>c.id))||
     !unique(controllers.map(c=>c.node)))
    return hold("invalid_or_unavailable_candidate_controller");
  const parts=components(expectedNodes), regions=[];
  for(let idx=0;idx<parts.length;idx++){
    const nodes=parts[idx];
    const members=controllers.filter(c=>nodes.includes(c.node))
      .map(c=>c.id).sort(lex);
    if(!members.length) return hold("region_without_live_candidate_controller");
    regions.push(Object.freeze({
      proposedRegionId:networkId+":e"+(previousEpoch+1)+":r"+(idx+1),
      proposedControllerId:members[0],
      alternateControllerIds:Object.freeze(members.slice(1)),
      nodes
    }));
  }
  return result("PLAN_ONLY","candidate_repartition_not_committed",{
    networkId,dimensionId,suggestedEpoch:previousEpoch+1,
    regions:Object.freeze(regions),
    externallyAuthenticated:false,physicalCustodyProven:false
  });
}
