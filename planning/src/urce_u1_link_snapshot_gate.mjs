/**
 * URCE U1 — join native Hopper and visual-bank observations for a *draft*
 * Collector->Receiver link decision. This is source-only and has NO Bedrock
 * imports, persistent writes, or custody authority.
 *
 * A complete, single-Receiver/single-Collector Transporter RUN can establish
 * a managed logical supply direction (Receiver -> Collector) for cycle policy,
 * without proving any physical item movement or Hopper custody.
 *
 * REJECT: verified managed supply back-edge. HOLD: unverified/unloaded or
 * incomplete evidence. SAFE_SNAPSHOT: no cycle in this bounded observed
 * graph, but it is never permission to save a link in-game.
 */
import {
  buildReadOnlyGraph,checkManagedLink,sourceReachability
} from "./urce_u1_route_model.mjs";
import {observeNativeHopperWitness} from "./urce_u1_native_hopper_witness.mjs";
import {observeTransporterComponents} from "./urce_u1_transporter_bank_probe.mjs";

const answer=(decision,reason,extra={})=>({
  decision,reason,executePermitted:false,persistPermitted:false,...extra
});
const supportedId=id=>typeof id==="string"&&id.length>0;

export function inspectCandidateSupplyLink({
  collectors,receivers,getBlock,fromCollector,toReceiver,
  maxNativeReads=8192,maxTransporterReads=16000,
  maxHopsPerReceiver=512,maxTransporters=8192
}) {
  if(!supportedId(fromCollector)||!supportedId(toReceiver)||
    !Array.isArray(collectors)||!Array.isArray(receivers)||
    typeof getBlock!=="function")
    return answer("HOLD","invalid_link_request");

  // Obtain native-shaped, bounded, read-only world observations from one
  // caller-provided getBlock adapter; none of these can save a registry link.
  const native=observeNativeHopperWitness({
    collectors,receivers,getBlock,maxReads:maxNativeReads,maxHopsPerReceiver
  });
  if(native.status==="INVALID")return answer("HOLD","invalid_native_observation",
    {nativeStatus:native.status});
  const visual=observeTransporterComponents({
    anchors:[
      ...receivers.map(r=>({...r,kind:"receiver"})),
      ...collectors.map(c=>({...c,kind:"collector"}))
    ],getBlock,maxReads:maxTransporterReads,maxTransporters
  });
  if(visual.status==="INVALID")return answer("HOLD","invalid_visual_observation");
  if(!native.graph?.byId?.has(fromCollector)||
    !native.graph?.byId?.has(toReceiver))
    return answer("HOLD","unknown_link_endpoint");
  if(native.graph.byId.get(fromCollector).loaded!==true||
     native.graph.byId.get(toReceiver).loaded!==true)
    return answer("HOLD","unavailable_link_endpoint");

  // For relinking, remove only the selected Collector's old link from this
  // ephemeral proposal graph. Actual saved links and Q4 data stay untouched.
  const links=native.edges.filter(e=>
    !(e.kind==="collector_receiver"&&e.from===fromCollector));
  const logicalBanks=new Set(),ambiguousBankIds=new Set();
  for(const component of visual.components){
    if(component.classification==="CANDIDATE_SINGLE_BANK"&&
       !component.unknown&&component.receiverIds.length===1&&
       component.collectorIds.length===1){
      const receiverId=component.receiverIds[0],collectorId=component.collectorIds[0];
      logicalBanks.add(receiverId);
      links.push({from:receiverId,to:collectorId,kind:"local",
        verified:true,loaded:true,provenance:"managed_bank_intent"});
    } else {
      // An ambiguous/branching visual run is NOT proven directional. A
      // potential downstream return path can only force HOLD, not REJECT.
      for(const id of component.endpointIds)ambiguousBankIds.add(id);
      for(const r of component.receiverIds){
        for(const c of component.collectorIds){
          links.push({from:r,to:c,kind:"local",verified:false,
            loaded:false,provenance:"unverified_bank_direction"});
        }
      }
    }
  }
  const graph=buildReadOnlyGraph(
    [...native.graph.byId.values()].map(n=>({...n})),links
  );
  if(graph.status==="CYCLE")return answer("REJECT","existing_directed_supply_cycle",
    {evidence:"verified_native_or_managed_bank"});
  if(graph.status!=="OK")return answer("HOLD","invalid_composed_topology");

  const verdict=checkManagedLink(graph,fromCollector,toReceiver);
  if(verdict.decision==="REJECT")
    return answer("REJECT",verdict.reason,{
      evidence:"verified_native_or_managed_bank"
    });
  if(verdict.decision==="HOLD")
    return answer("HOLD",verdict.reason);

  const route=sourceReachability(graph,toReceiver);
  if(route.status!=="OK"||route.unknown)
    return answer("HOLD","unverified_source_reachability");

  // Inspect uncertainty ONLY at nodes on the source-reachable branch;
  // unknown disconnected bank observations cannot fabricate a cycle.
  const reached=new Set(route.reached.keys());
  if([...ambiguousBankIds].some(id=>reached.has(id)))
    return answer("HOLD","ambiguous_transporter_component");
  if(visual.status==="INCOMPLETE"){
    // The visual probe does not yet carry a per-component boundary coverage
    // certificate; a global incomplete result cannot prove safe absence.
    return answer("HOLD","incomplete_transporter_observation");
  }
  for(const issue of native.unknown){
    if(!reached.has(issue.from))continue;
    // In a complete one-input/one-output managed visual bank, a receiver
    // with NO native Hopper below can still have a logical bank route;
    // this is not permission for physical item movement.
    if(issue.reason==="receiver_output_not_hopper"&&logicalBanks.has(issue.from))
      continue;
    return answer("HOLD","unverified_native_supply_boundary",{
      observationReason:issue.reason
    });
  }
  // Source-level graph decision only. The real game's link handler must
  // obtain a fresh native observation at commit time, preserve old links on
  // any failure, and re-audit on changes BEFORE any Hart-controlled ingress.
  return answer("SAFE_SNAPSHOT","no_cycle_in_observed_managed_topology",{
    coverageScope:"loaded_supported_bank_and_hopper_snapshot",
    observedBanks:logicalBanks.size
  });
}
