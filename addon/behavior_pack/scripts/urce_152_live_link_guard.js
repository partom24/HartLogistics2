/**
 * URCE 1.5.2 live Collector/Receiver link safety adapter.
 *
 * A single bounded Hopper/Transporter observation is shared for each tick.
 * Only a negative (REJECT/HOLD) may be reused for a short bounded interval;
 * a SAFE_SNAPSHOT is never cached across ticks. Negative reuse cannot
 * authorize cargo, even after unobserved native topology changes.
 * Invalidate on every known block/link/endpoint change. Runtime decisions
 * are provisional until native BDS acceptance.
 */
import {
  inspectCandidateSupplyLink,observeSupplyLinkSnapshot
} from "./urce_152_link_snapshot_gate.js";
import {projectObservedShadowGraph} from "./urce_152_shadow_evidence_bridge.js";

export function createLiveLinkGuard() {
  const memo=new Map(),negativeMemo=new Map();
  const NEGATIVE_TTL_TICKS=20;
  let epoch=0,currentTick=undefined,snapshot=undefined,recordVersion=undefined;
  let observedTickScans=0,negativeHits=0;
  function reset() { memo.clear(); snapshot=undefined; }
  function invalidate() {
    epoch++;reset();negativeMemo.clear();recordVersion=undefined;
  }
  function rememberNegative(id,result,tick){
    if(result?.decision!=="HOLD"&&result?.decision!=="REJECT")return;
    if(negativeMemo.size>=512)negativeMemo.clear();
    negativeMemo.set(id,{result,bornTick:tick,untilTick:tick+NEGATIVE_TTL_TICKS});
  }
  function fields(records) {
    return records.map(r=>[
      r?.id,r?.d,r?.x,r?.y,r?.z,r?.present,r?.link
    ]);
  }
  function sameRecords(current,recorded) {
    if(current.length!==recorded.length)return false;
    for(let i=0;i<current.length;i++){
      const e=current[i],old=recorded[i];
      if(e?.id!==old[0]||e?.d!==old[1]||
         e?.x!==old[2]||e?.y!==old[3]||e?.z!==old[4]||
         e?.present!==old[5]||e?.link!==old[6])return false;
    }
    return true;
  }
  function stats() {
    return {tick:currentTick,epoch,decisions:memo.size,
      negativeDecisions:negativeMemo.size,negativeHits,
      hasSnapshot:!!snapshot,worldScans:observedTickScans};
  }
  function check({
    collector,receiver,collectors,receivers,getBlock,currentTick:tick,
    forceFresh=false
  }) {
    const hold=reason=>({decision:"HOLD",reason,
      persistPermitted:false,executePermitted:false});
    if(!collector?.id||!receiver?.id||collector.link===undefined||
       !Array.isArray(collectors)||!Array.isArray(receivers)||
       typeof getBlock!=="function"||!Number.isSafeInteger(tick))
      return hold("invalid_live_link_context");

    if(tick!==currentTick) {
      currentTick=tick;
      reset(); // no map entries survive from an earlier Bedrock tick
    }
    // A link/endpoint change that bypasses a registered event still cannot
    // reuse an earlier same-tick route decision. This check is O(endpoints),
    // not a new global Block read.
    const changed=recordVersion && (
      recordVersion.collectors!==collectors||
      recordVersion.receivers!==receivers||
      recordVersion.getBlock!==getBlock||
      !sameRecords(collectors,recordVersion.collectorRecords)||
      !sameRecords(receivers,recordVersion.receiverRecords)
    );
    if(changed){
      reset();
      negativeMemo.clear();
    }
    if(changed||!recordVersion){
      recordVersion={collectors,receivers,getBlock,
        collectorRecords:fields(collectors),receiverRecords:fields(receivers)};
    }
    // Forced player link preflight ALWAYS observes the real current world,
    // including when a stale negative existed. A successful link save
    // subsequently calls invalidate() and clears all negative results.
    if(forceFresh){reset();negativeMemo.clear();}
    const id=collector.id+"->"+receiver.id;
    if(!forceFresh&&memo.has(id))return memo.get(id);
    if(!forceFresh){
      const cached=negativeMemo.get(id);
      if(cached&&tick>=cached.bornTick&&tick<cached.untilTick){
        negativeHits++;
        if(memo.size>=512)memo.clear();
        memo.set(id,cached.result);
        return cached.result; // NEVER a positive cargo permission
      }
      if(cached)negativeMemo.delete(id);
    }

    let observations;
    if(!forceFresh && snapshot)observations=snapshot.observations;
    else{
      try {
        observations=observeSupplyLinkSnapshot({
          collectors,receivers,getBlock
        });
        observedTickScans++;
      }catch(_){
        const failure=hold("live_topology_observation_failed");
        rememberNegative(id,failure,tick);
        return failure;
      }
      // The forced pre-save UI check is always fresh, and a subsequent
      // link save triggers invalidate(). A reused route snapshot is safe only
      // within the current tick with unchanged registry and reader identity.
      snapshot={
        collectors,receivers,getBlock,
        collectorRecords:fields(collectors),
        receiverRecords:fields(receivers),
        observations
      };
    }
    let result;
    try {
      result=inspectCandidateSupplyLink({
        collectors,receivers,getBlock,
        fromCollector:collector.id,toReceiver:receiver.id,
        snapshot:observations
      });
    } catch (_){result=hold("live_topology_evaluation_failed");}
    // Only denial/HOLD survives this tick. A positive safety decision
    // always re-reads live topology on the NEXT tick before any cargo writer.
    if(result.decision==="HOLD"||result.decision==="REJECT")
      rememberNegative(id,result,tick);
    else negativeMemo.delete(id);
    if(!forceFresh){
      if(memo.size>=512)memo.clear();
      memo.set(id,result);
    }
    return result;
  }
  /**
   * Diagnostic-only view of a previously materialized SAME-TICK snapshot.
   * This performs zero world reads, never invokes check(), and never
   * promotes a negative memo entry to a positive observation.
   *
   * Registry content and reader identity must be unchanged. Returning a
   * newly constructed graph (not internal snapshot references) prevents a
   * shadow consumer from mutating the live safety guard's observations.
   */
  function peekShadowEvidence({
    collectors,receivers,getBlock,currentTick:tick
  }) {
    const hold=reason=>({
      status:"HOLD",reason,graph:undefined,
      sourceClaimCoverage:"UNKNOWN",worldCoverage:"UNKNOWN",
      executePermitted:false,persistPermitted:false,
      mayAuthorizeCargo:false
    });
    if (!Number.isSafeInteger(tick) || tick!==currentTick ||
        !snapshot || !recordVersion ||
        !Array.isArray(collectors) || !Array.isArray(receivers) ||
        snapshot.collectors!==collectors ||
        snapshot.receivers!==receivers ||
        snapshot.getBlock!==getBlock ||
        recordVersion.collectors!==collectors ||
        recordVersion.receivers!==receivers ||
        recordVersion.getBlock!==getBlock ||
        !sameRecords(collectors,recordVersion.collectorRecords) ||
        !sameRecords(receivers,recordVersion.receiverRecords)) {
      return hold("no_fresh_matching_observation");
    }
    return projectObservedShadowGraph(snapshot.observations);
  }
  return {check,invalidate,stats,peekShadowEvidence};
}
