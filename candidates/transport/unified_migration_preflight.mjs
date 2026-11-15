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

export function readLegacyRegistry(world){
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
// Read the exact original 1.4.1 generation-switched Sorter registry. The
// owner's storage room has nine 24k-shard records, not one 32k JSON value.
// Never silently use a stale v1 backup if the authoritative v2 is damaged.
const SORTER_META='hartsorter:registry_v2';
const SORTER_V1='hartsorter:registry_v1';
function readOriginalSorterRegistry(world){
  let metaRaw,legacyRaw;
  try {
    metaRaw=world.getDynamicProperty(SORTER_META);
    if(metaRaw===undefined||metaRaw===null||metaRaw==='')
      legacyRaw=world.getDynamicProperty(SORTER_V1);
  } catch(_){return refuse('legacy_sorter_registry_read_failed');}
  let source,raw,count,shards=0;
  if(typeof metaRaw==='string'&&metaRaw.length){
    let m;
    try { m=JSON.parse(metaRaw); }
    catch(_){return refuse('legacy_sorter_registry_meta_invalid');}
    if(!m||m.version!==2||(m.gen!==0&&m.gen!==1)||
       !natural(m.shards)||m.shards<1||!natural(m.count)||
       !natural(m.chars)||m.chars<2)
      return refuse('legacy_sorter_registry_meta_invalid');
    let keys;
    try {keys=world.getDynamicPropertyIds();}
    catch(_){return refuse('legacy_sorter_registry_keys_unreadable');}
    if(!Array.isArray(keys)||m.shards>keys.length)
      return refuse('legacy_sorter_registry_shards_missing');
    const parts=[];
    for(let i=0;i<m.shards;i++){
      let piece;
      try {piece=world.getDynamicProperty('hartsorter:r2_'+m.gen+'_'+i);}
      catch(_){return refuse('legacy_sorter_registry_shard_unreadable');}
      if(typeof piece!=='string'||piece.length<1||piece.length>24000)
        return refuse('legacy_sorter_registry_shard_invalid');
      parts.push(piece);
    }
    raw=parts.join('');shards=m.shards;count=m.count;source='v2';
    if(raw.length!==m.chars)
      return refuse('legacy_sorter_registry_chars_mismatch');
  }else if(metaRaw===undefined||metaRaw===null||metaRaw===''){
    if(legacyRaw===undefined||legacyRaw===null||legacyRaw==='')
      return {ok:true,source:'none',count:0,shards:0,
        raw:'',metaRaw:'',signature:'none'};
    if(typeof legacyRaw!=='string'||legacyRaw.length>32767)
      return refuse('legacy_sorter_v1_invalid');
    raw=legacyRaw;count=undefined;source='v1';
  }else return refuse('legacy_sorter_registry_meta_invalid');
  let records;
  try {records=JSON.parse(raw);}
  catch(_){return refuse('legacy_sorter_registry_payload_invalid');}
  if(!Array.isArray(records)||
     (count!==undefined&&records.length!==count))
    return refuse('legacy_sorter_registry_count_mismatch');
  const seen=new Set();
  for(const entry of records){
    if(!entry||!id(entry.d)||
       !Number.isSafeInteger(entry.x)||
       !Number.isSafeInteger(entry.y)||
       !Number.isSafeInteger(entry.z))
      return refuse('legacy_sorter_registry_entry_invalid');
    const key=entry.d+'|'+entry.x+'|'+entry.y+'|'+entry.z;
    if(seen.has(key))return refuse('legacy_sorter_registry_duplicate');
    seen.add(key);
  }
  return {ok:true,source,count:records.length,shards,
    chars:raw.length,metaRaw:metaRaw||'',
    signature:(metaRaw||'')+'|'+raw};
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
  const sorters=readOriginalSorterRegistry(world);
  if(!sorters.ok)return sorters;
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
  let ordinary=0,opaque=0,opaqueReceiverCount=0;
  const reasons=new Set(),opaqueReceiverExamples=[];
  for(const receiver of registry.receivers){
    const scan=sampleQ4WorldReadOnly({world,receiver});
    if(!scan.ok)
      return refuse('legacy_q4_snapshot:'+receiver.id+':'+scan.reason);
    const sealed=census.receivers.find(x=>x.id===receiver.id);
    if(!sealed||sealed.itemCount!==scan.total||
       sealed.fingerprint!==scan.snapshotFingerprint)
      return refuse('legacy_q4_source_changed_during_preflight');
    let receiverOpaque=0;
    const receiverReasons=new Set();
    for(const entry of scan.entries){
      const shape=inspectQ4OrdinaryDefinitionShape(entry.definition);
      if(shape.ok)ordinary+=entry.amount;
      else{
        opaque+=entry.amount;
        receiverOpaque+=entry.amount;
        reasons.add(shape.reason);
        receiverReasons.add(shape.reason);
      }
      if(!natural(ordinary)||!natural(opaque)||
         !natural(receiverOpaque))
        return refuse('legacy_item_count_overflow');
    }
    if(receiverOpaque>0){
      opaqueReceiverCount++;
      // Queue IDs and counts are bounded diagnostic evidence only:
      // never expose a named item, metadata definition, enchantment
      // or reconstructed ItemStack. No source queue is mutated here.
      if(opaqueReceiverExamples.length<8)
        opaqueReceiverExamples.push({
          receiverId:receiver.id,queueKey:receiver.queueKey,
          opaqueItemCount:receiverOpaque,
          reasons:[...receiverReasons].sort().slice(0,3)
        });
    }
  }
  const final=readLegacyRegistry(world);
  const finalSorters=readOriginalSorterRegistry(world);
  if(!finalSorters.ok||!sorters.ok||
     finalSorters.signature!==sorters.signature)
    return refuse('legacy_sorter_registry_changed_during_preflight');
  if(!final.ok||final.raw!==registry.raw)
    return refuse('legacy_registry_changed_during_preflight');
  const after=declaredTotal(world,registry.receivers);
  if(!after.ok||after.total!==census.itemCount||
     ordinary+opaque!==census.itemCount)
    return refuse('legacy_q4_count_changed_during_preflight');
  const details={
    sorterCount:sorters.count,sorterRegistryShards:sorters.shards,
    sorterRegistryChars:sorters.chars||0,
    sorterRegistryFormat:sorters.source,
    receiverCount:census.receiverCount,q4ItemCount:census.itemCount,
    ordinaryShapeCandidateCount:ordinary,
    metadataRichOrUnknownCount:opaque,
    opaqueReceiverCount,opaqueReceiverExamples,
    opaqueReasons:[...reasons].sort().slice(0,10),
    hasFrozenWorldProof:false,hasBackupProof:false,
    hasNativeRoundTripProof:false,
    canMigrate:false,canModifyWorld:false,canClearQ4:false
  };
  if(opaque)return refuse('legacy_metadata_rich_or_unknown_items',details);
  return {ok:true,status:'READ_ONLY_Q4_SHAPE_CENSUS_NOT_CUTOVER',
    ...details};
}
