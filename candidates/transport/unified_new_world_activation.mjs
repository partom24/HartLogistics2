/**
 * UCE first-playable empty LAB world activation.
 *
 * The same cold import engine, ledger seal and global authority are used for
 * archived migration and new worlds. This path is ONLY for an ACTUALLY EMPTY
 * legacy logistics world; it cannot convert, delete or bypass any Q4 items.
 * Explicit operator command + persistent readback are required.
 *
 * No backup claims are made for old worlds. The importer's backup flag is
 * vacuously true because the proof is that the world contains NO Q4 assets
 * or registered logistics identities. Never use this for an existing archive.
 */
import {executeUnifiedColdQ4Import,
  inspectUnifiedActiveColdImport} from './unified_cold_q4_importer.mjs';
import {UCE_AUTHORITY_KEY} from './unified_world_shard_writer.mjs';

const denied=reason=>({ok:false,status:'HOLD',reason,
  canActivate:false,canMigrateQ4:false,canDeleteQ4:false});
const valid=s=>typeof s==='string'&&s.length>0&&s.length<=256;
export function inspectEmptyLegacyWorld({world,logistics}={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     typeof world.getDynamicPropertyIds!=='function'||
     typeof world.setDynamicProperty!=='function'||
     !logistics||!Array.isArray(logistics.receivers)||
     !Array.isArray(logistics.collectors))
    return denied('empty_world_binding_invalid');
  if(logistics.receivers.length||logistics.collectors.length)
    return denied('legacy_logistics_owners_not_empty');
  let ids,registry;
  try{
    ids=world.getDynamicPropertyIds();
    registry=world.getDynamicProperty('hartsorter:logistics_v2');
  }catch(_){return denied('world_properties_unreadable');}
  if(!Array.isArray(ids)||ids.some(x=>typeof x!=='string')||
     new Set(ids).size!==ids.length||ids.length>200000)
    return denied('world_property_listing_invalid');
  for(const key of ids){
    if(key.startsWith('hartsorter:q2')||
       key.startsWith('hartsorter:q3')||
       key.startsWith('hartsorter:q4')||
       key.startsWith('hartlogistics:uce_')||
       // The PG42 one-off carrier probe is NOT a clean product world.
       // Its sampled native actor and persisted test identity may remain
       // even when no unified authority or Q4 queue exists.
       key.startsWith('hartlogistics:pg42_')||
       key.startsWith('hartsorter:queue_journal')||
       key==='hartsorter:journal_v1'||
       key==='hartsorter:logistics_v1')
      return denied('preexisting_custody_or_legacy_history:'+key);
  }
  // If an old logistics registry exists, it must be intact and empty.
  if(registry!==undefined&&registry!==null&&registry!==''){
    let saved;
    try{saved=JSON.parse(registry);}
    catch(_){return denied('legacy_registry_unreadable');}
    if(!saved||!Array.isArray(saved.collectors)||
       !Array.isArray(saved.receivers)||
       saved.collectors.length||saved.receivers.length)
      return denied('saved_legacy_logistics_owners_not_empty');
  }
  // A pre-existing orphaned native host may have no dynamic property
  // record. Observe all loaded dimensions; any carrier or unreadable
  // native census prohibits claiming that this is an EMPTY UCE world.
  try{
    if(typeof world.getDimension!=='function')
      return denied('native_entity_census_unavailable');
    for(const dimensionId of [
      'minecraft:overworld','minecraft:nether','minecraft:the_end']){
      const dimension=world.getDimension(dimensionId);
      const entities=dimension?.getEntities({
        type:'hartlogistics:uce_native_carrier'});
      if(!Array.isArray(entities))
        return denied('native_entity_census_unreadable:'+dimensionId);
      if(entities.length>0)
        return denied('preexisting_native_carrier_entity:'+dimensionId);
    }
  }catch(_){return denied('native_entity_census_unreadable');}
  const idsAfter=world.getDynamicPropertyIds();
  if(JSON.stringify(idsAfter)!==JSON.stringify(ids))
    return denied('world_property_ids_changed_during_preflight');
  return {ok:true,status:'EMPTY_LEGACY_WORLD_READ_ONLY',
    q4Count:0,receiverCount:0,canMigrateQ4:false,
    canModifyWorld:false,canDeleteQ4:false};
}
/**
 * Caller must be explicit owner-initiated LAB maintenance command and verify
 * that the REQUESTED marker is now fencing ALL old code paths. This function
 * does not provide a deployer or product-wide disk crash guarantee.
 */
export function activateUnifiedEmptyWorld({world,logistics,worldId,
    epoch=1,operatorAuthorized=false,actualWorldFence}={}){
  if(operatorAuthorized!==true||!valid(worldId)||
     !Number.isSafeInteger(epoch)||epoch<1||
     typeof actualWorldFence!=='function')
    return denied('empty_world_operator_not_authorized');
  const preflight=inspectEmptyLegacyWorld({world,logistics});
  if(!preflight.ok)return preflight;
  const result=executeUnifiedColdQ4Import({
    world,worldId,epoch,receivers:[],proofs:new Map(),
    expectedQueuedTotal:0,expectedReceiverCount:0,
    // No Q4 items/identities exist. Not a backup claim for archived worlds.
    backupVerified:true,legacyInputIsolation:true,
    actualWorldFence:()=>{
      try{
        const raw=world.getDynamicProperty(UCE_AUTHORITY_KEY);
        const marker=JSON.parse(raw);
        return marker.state==='REQUESTED'&&
          marker.worldId===worldId&&marker.epoch===epoch&&
          actualWorldFence()===true;
      }catch(_){return false;}
    }
  });
  if(!result.ok)return result;
  const live=inspectUnifiedActiveColdImport({world,worldId,epoch});
  if(!live.ok)return denied('new_world_active_readback:'+live.reason);
  if(live.currentLedgerTotal!==0||live.receiverCount!==0)
    return denied('new_world_zero_ownership_mismatch');
  return {ok:true,status:'EMPTY_UCE_WORLD_ACTIVATED_AND_READBACK',
    worldId,epoch,shardCount:result.shardCount,
    q4ItemCount:0,canMigrateQ4:false,canDeleteQ4:false,
    releaseApproved:false,hasHardCrashAtomicityProof:false};
}
