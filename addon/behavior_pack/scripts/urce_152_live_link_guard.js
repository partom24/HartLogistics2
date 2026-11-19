/**
 * URCE 1.5.2 runtime control-plane facade. The imported U1 modules are
 * pure/read-only and have no Bedrock API imports or inventory writers.
 *
 * A source snapshot alone NEVER creates native cargo custody authority.
 * Gameplay may save a Collector link only after fresh same-turn synchronous
 * observation, and must HOLD all uncertain links before any new ingress.
 */
import {inspectCandidateSupplyLink} from "./urce_152_link_snapshot_gate.js";

export function createLiveLinkGuard() {
  const memo=new Map();
  let epoch=0;
  function invalidate() { epoch++; memo.clear(); }
  function check({
    collector,receiver,collectors,receivers,getBlock,currentTick,
    forceFresh=false
  }) {
    const hold=reason=>({decision:"HOLD",reason,
      persistPermitted:false,executePermitted:false});
    if(!collector?.id||!receiver?.id||collector.link===undefined||
       !Array.isArray(collectors)||!Array.isArray(receivers)||
       typeof getBlock!=="function"||!Number.isSafeInteger(currentTick))
      return hold("invalid_live_link_context");
    const id=collector.id+"->"+receiver.id+"|"+epoch+"|"+currentTick;
    if(!forceFresh && memo.has(id))return memo.get(id);
    let result;
    try {
      result=inspectCandidateSupplyLink({
        collectors,receivers,getBlock,
        fromCollector:collector.id,toReceiver:receiver.id
      });
    } catch (_) { result=hold("live_topology_observation_failed"); }
    // One-tick memoization only. The event invalidation hook ALSO clears the
    // cache on player block changes and confirmed link mutation.
    if(!forceFresh)memo.set(id,result);
    return result;
  }
  return {check,invalidate};
}
