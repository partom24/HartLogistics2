/**
 * Read-only 1.4.1 Q4 migration preflight for the existing UCE importer.
 * No world mutation, Q4 debit, cold authority, or substitute native item proof.
 */
import {previewQ5WorldQ4Census} from './q5_world_receiver_census.mjs';
import {sampleQ4WorldReadOnly} from './q5_q4_read_adapter.mjs';
import {inspectQ4OrdinaryDefinitionShape} from './q5_ordinary_shape_gate.mjs';

export const UCE_MIGRATION_REGISTRY_KEY='hartsorter:logistics_v2';
const AUTH='hartlogistics:uce_authority_v1';
const natural=n=>Number.isSafeInteger(n)&&n>=0;
const id=s=>typeof s==='string'&&s.length>0&&s.length<=256;
const refuse=(reason,details={})=>({ok:false,status:'HOLD',reason,
  canMigrate:false,canModifyWorld:false,canClearQ4:false,...details});

function readLegacyRegistry(world){
  let raw;
  try{raw=world.getDynamicProperty(UCE_MIGRATION_REGISTRY_KEY);}
  catch(_){return refuse('legacy_registry_read_failed');}
  if(typeof raw!=='string'||!raw||raw.length>32767)
    return refuse('legacy_registry_v2_missing_or_oversized');
  let saved;
  try{saved=JSON.parse(raw);}catch(_){return refuse('legacy_registry_corrupt');}
  if(!saved||!Array.isArray(saved.collectors)||
     !Array.isArray(saved.receivers)||saved.receivers.length>512)
    return refuse('legacy_registry_incomplete');
  const receivers=[],seenIds=new Set(),seenQueues=new Set();
  for(const r of saved.receivers){
    if(!r||!id(r.id)||!id(r.d)||
       !Number.isSafeInteger(r.x)||!Number.isSafeInteger(r.y)||
       !Number.isSafeInteger(r.z)||
       r.id!==r.d+'|'+r.x+'|'+r.y+'|'+r.z||
       typeof r.queueKey!=='string'||
       !/^q[1-9][0-9]*$/.test(r.queueKey)||
       seenIds.has(r.id)||seenQueues.has(r.queueKey))
      return refuse('legacy_receiver_registry_invalid_or_legacy');
    seenIds.add(r.id);seenQueues.add(r.queueKey);
    receivers.push({id:r.id,queueKey:r.queueKey});
  }
  return {ok:true,raw,receivers};
}
function declaredTotal(world,receivers){
  let total=0;
  for(const r of receivers){
    let value;
    try{
      value=JSON.parse(world.getDynamicProperty(
        'hartsorter:q4m_'+r.queueKey));
    }catch(_){return refuse('legacy_q4_metadata_unreadable:'+r.queueKey);}
    if(!value||value.v!==4||!natural(value.q)||value.q>250000)
      return refuse('legacy_q4_metadata_not_v4:'+r.queueKey);
    total+=value.q;
    if(!natural(total))return refuse('legacy_q4_global_count_overflow');
  }
  return {ok:true,total};
}
/** Stable-in-memory observation only, not an atomic Bedrock world freeze. */
export function previewUnifiedMigrationPreflight({world}={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     typeof world.getDynamicPropertyIds!=='function')
    return refuse('world_read_api_unavailable');
  let authority;
  try{authority=world.getDynamicProperty(AUTH);}
  catch(_){return refuse('uce_authority_unreadable');}
  if(authority!==undefined&&authority!==null&&authority!=='')
    return refuse('uce_authority_already_present');
  const registry=readLegacyRegistry(world);
  if(!registry.ok)return registry;
  const declared=declaredTotal(world,registry.receivers);
  if(!declared.ok)return declared;
  const census=previewQ5WorldQ4Census({
    world,worldId:'uce-preflight-readonly-not-authority',
    receivers:registry.receivers,
    expectedReceiverCount:registry.receivers.length,
    expectedQueuedTotal:declared.total,
    registrySnapshotStable:true
  });
  if(!census.ok)return refuse('legacy_q4_census:'+census.reason);
  let ordinary=0,opaque=0;
  const reasons=new Set();
  for(const receiver of registry.receivers){
    const scan=sampleQ4WorldReadOnly({world,receiver});
    if(!scan.ok)
      return refuse('legacy_q4_snapshot:'+receiver.id+':'+scan.reason);
    const sealed=census.receivers.find(x=>x.id===receiver.id);
    if(!sealed||sealed.itemCount!==scan.total||
       sealed.fingerprint!==scan.snapshotFingerprint)
      return refuse('legacy_q4_source_changed_during_preflight');
    for(const entry of scan.entries){
      const shape=inspectQ4OrdinaryDefinitionShape(entry.definition);
      if(shape.ok)ordinary+=entry.amount;
      else{
        opaque+=entry.amount;
        reasons.add(shape.reason);
      }
      if(!natural(ordinary)||!natural(opaque))
        return refuse('legacy_item_count_overflow');
    }
  }
  const final=readLegacyRegistry(world);
  if(!final.ok||final.raw!==registry.raw)
    return refuse('legacy_registry_changed_during_preflight');
  const after=declaredTotal(world,registry.receivers);
  if(!after.ok||after.total!==census.itemCount||
     ordinary+opaque!==census.itemCount)
    return refuse('legacy_q4_count_changed_during_preflight');
  const details={
    receiverCount:census.receiverCount,q4ItemCount:census.itemCount,
    ordinaryShapeCandidateCount:ordinary,
    metadataRichOrUnknownCount:opaque,
    opaqueReasons:[...reasons].sort().slice(0,10),
    hasFrozenWorldProof:false,hasBackupProof:false,
    hasNativeRoundTripProof:false,
    canMigrate:false,canModifyWorld:false,canClearQ4:false
  };
  if(opaque)return refuse('legacy_metadata_rich_or_unknown_items',details);
  return {ok:true,status:'READ_ONLY_Q4_SHAPE_CENSUS_NOT_CUTOVER',
    ...details};
}
