/**
 * URCE 1.5.2 live Collector/Receiver link safety adapter.
 *
 * A single bounded Hopper/Transporter read-only observation is shared among
 * link checks for one game tick and unchanged registry. No persistent cache,
 * invented route proof, native cargo writer or background scan is created.
 * Invalidate on every known block/link/endpoint change. Runtime decisions
 * are provisional until native BDS acceptance.
 */
import {
  inspectCandidateSupplyLink,observeSupplyLinkSnapshot
} from "./urce_152_link_snapshot_gate.js";

export function createLiveLinkGuard() {
  const memo=new Map();
  let epoch=0,currentTick=undefined,snapshot=undefined;
  let observedTickScans=0;
  function reset() { memo.clear(); snapshot=undefined; }
  function invalidate() { epoch++; reset(); }
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
    if(snapshot && (
      snapshot.collectors!==collectors||snapshot.receivers!==receivers||
      snapshot.getBlock!==getBlock||
      !sameRecords(collectors,snapshot.collectorRecords)||
      !sameRecords(receivers,snapshot.receiverRecords)
    ))reset();
    // A forced pre-save check MUST evict all prior same-tick decisions.
    // Otherwise another Collector can reuse an earlier observation.
    if(forceFresh)reset();
    const id=collector.id+"->"+receiver.id;
    if(!forceFresh && memo.has(id))return memo.get(id);

    let observations;
    if(!forceFresh && snapshot)observations=snapshot.observations;
    else{
      try {
        observations=observeSupplyLinkSnapshot({
          collectors,receivers,getBlock
        });
        observedTickScans++;
      }catch(_){return hold("live_topology_observation_failed");}
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
    if(!forceFresh){
      // Bound decision entries even during many player-selected link checks.
      if(memo.size>=512)memo.clear();
      memo.set(id,result);
    }
    return result;
  }
  return {check,invalidate,stats};
}
