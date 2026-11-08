/**
 * OFFLINE, READ-ONLY entire Q4 Receiver registry census for eventual Q5 staging.
 * One Receiver sample alone cannot establish world-wide ownership or counts.
 *
 * Two consecutive FULL registry sweeps (each underlying Receiver is already
 * double-read) detect obvious between-Receiver drift. This is NOT a globally
 * atomic Bedrock snapshot; unloaded native blocks and external vanilla writers
 * remain separately gated. No world write or Q4→Q5 activation occurs here.
 */
import {sampleQ4WorldReadOnly,Q4_READ_PROPERTY_LIMIT} from './q5_q4_read_adapter.mjs';

export const Q5_CENSUS_RECEIVER_LIMIT=512;
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const validId=s=>typeof s==='string'&&s.length>0&&s.length<=256;
const denied=reason=>({ok:false,status:'HOLD',reason,
  canMigrate:false,canRoute:false,canStageWorld:false,
  canClearQ4:false,canWriteWorld:false});

// An inventory of named Receivers alone is not evidence that *all* Q4
// metadata records were enumerated. Refuse unclaimed Receiver metadata, older
// legacy queue metadata and changes to that listing across the full census.
// Unused old definition sidecars are intentionally not deleted or classified.
function readMetadataCensus(world, claimedKeys) {
  if (!world || typeof world.getDynamicPropertyIds !== 'function' ||
      typeof world.getDynamicProperty !== 'function') {
    return denied('world_property_listing_unavailable');
  }
  let ids;
  try { ids=world.getDynamicPropertyIds(); }
  catch (_) { return denied('world_property_listing_failed'); }
  if (!Array.isArray(ids) || ids.length>Q4_READ_PROPERTY_LIMIT ||
      ids.some(k=>typeof k!=='string'||k.length>256) ||
      new Set(ids).size!==ids.length) {
    return denied('invalid_world_property_listing');
  }
  const prefix='hartsorter:q4m_';
  const meta=[];
  for (const key of ids) {
    if (key.startsWith('hartsorter:q2m_') ||
        key.startsWith('hartsorter:q3m_')) {
      return denied('unresolved_legacy_q2_q3_metadata');
    }
    if (!key.startsWith(prefix)) continue;
    const queueKey=key.slice(prefix.length);
    if (!/^q[1-9][0-9]*$/.test(queueKey) || !claimedKeys.has(queueKey)) {
      return denied('unclaimed_q4_receiver_metadata');
    }
    meta.push(key);
  }
  if (meta.length!==claimedKeys.size) {
    return denied('missing_registered_q4_metadata');
  }
  meta.sort();
  return {ok:true,signature:JSON.stringify(meta)};
}

function scanReceivers(world,receivers) {
  const result=[];
  let total=0;
  for(const receiver of receivers) {
    const read=sampleQ4WorldReadOnly({receiver,world});
    if(!read.ok) return denied('receiver_q4_refused:'+receiver.id+':'+read.reason);
    if(!safe(read.total) || read.total>250000) return denied('receiver_count_out_of_range');
    total+=read.total;
    if(!safe(total)) return denied('global_q4_total_overflow');
    result.push({
      id:receiver.id,queueKey:receiver.queueKey,
      itemCount:read.total,entryCount:read.entryCount,
      fingerprint:read.snapshotFingerprint
    });
  }
  return {ok:true,total,result};
}

/**
 * Requires the complete registry and expected Q4 count to be supplied by a
 * future authenticated maintenance adapter. Boolean assertions alone do not
 * prove that the actual global routing freeze exists in BDS.
 */
export function previewQ5WorldQ4Census({world,receivers,worldId,
  expectedReceiverCount,expectedQueuedTotal,registrySnapshotStable}={}) {
  if(!validId(worldId)||registrySnapshotStable!==true||
      !Array.isArray(receivers)||receivers.length>Q5_CENSUS_RECEIVER_LIMIT||
      !safe(expectedReceiverCount)||expectedReceiverCount!==receivers.length||
      !safe(expectedQueuedTotal)) return denied('incomplete_world_registry_claim');
  const ids=new Set(),keys=new Set(),ordered=[];
  for(const receiver of receivers) {
    if(!receiver||!validId(receiver.id)||
        !/^q[1-9][0-9]*$/.test(receiver.queueKey)||
        ids.has(receiver.id)||keys.has(receiver.queueKey)) {
      return denied('invalid_or_duplicate_receiver_identity');
    }
    ids.add(receiver.id);keys.add(receiver.queueKey);
    ordered.push({id:receiver.id,queueKey:receiver.queueKey});
  }
  ordered.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const initial=readMetadataCensus(world,keys);
  if(!initial.ok)return initial;
  const a=scanReceivers(world,ordered);
  if(!a.ok)return a;
  if(a.total!==expectedQueuedTotal) return denied('q4_global_total_mismatch');
  const middle=readMetadataCensus(world,keys);
  if(!middle.ok)return middle;
  if(middle.signature!==initial.signature) return denied('q4_metadata_list_changed');
  const b=scanReceivers(world,ordered);
  if(!b.ok)return b;
  const final=readMetadataCensus(world,keys);
  if(!final.ok)return final;
  if(final.signature!==initial.signature) return denied('q4_metadata_list_changed');
  if(b.total!==a.total||JSON.stringify(b.result)!==JSON.stringify(a.result)) {
    return denied('q4_registry_changed_between_sweeps');
  }
  return {ok:true,status:'WORLD_Q4_CENSUS_READ_ONLY_ONLY',
    worldId,receiverCount:ordered.length,itemCount:b.total,
    receivers:b.result,hasNativeBlockResidencyProof:false,
    hasDurableGlobalFreezeProof:false,
    canMigrate:false,canRoute:false,canStageWorld:false,
    canClearQ4:false,canWriteWorld:false};
}
