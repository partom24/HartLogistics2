/**
 * Unified Custody Engine — one-time cold Q4 world import.
 *
 * Operates only on a backed-up, isolated restored 1.4.1 world with the UCE
 * derived runtime installed. All ordinary Q4 rows must be representable
 * losslessly *under the saved Q4 schema*. Metadata-rich/opaque legacy rows
 * remain protected in Q4: they cause HOLD, never partial import or deletion.
 *
 * This is the same UCE authority, not a second queue engine. No Q4 property
 * is ever mutated/cleared. No direct ItemStack is constructed or reconstructed.
 *
 * Explicitly not a hard-crash atomic multi-property transaction. A saved
 * REQUESTED marker after an interrupted operation freezes all legacy writers;
 * the owner restores the immutable ZIP on unreconciled ambiguity. Never
 * automatically "fix" or erase the historical Q4 source.
 */
import {previewQ5WorldQ4Census} from './q5_world_receiver_census.mjs';
import {readOnlyQ4Snapshot} from './q5_q4_readonly_snapshot.mjs';
import {stageUnifiedOrdinaryAccounts} from './unified_ordinary_accounts.mjs';
import {previewUnifiedShard,inspectUnifiedWorldShard,UCE_AUTHORITY_KEY,
    UCE_AUTHORITY_SCHEMA} from './unified_world_shard_writer.mjs';

export const UCE_COLD_SEAL_KEY='hartlogistics:uce_cold_seal_v1';
export const UCE_COLD_SEAL_SCHEMA='hart-uce-cold-seal-v1';
const maxReceivers=512,maxShards=512,maxSeal=28000;
const validId=s=>typeof s==='string'&&s.length>0&&s.length<=256;
const positive=n=>Number.isSafeInteger(n)&&n>0;
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const refuse=reason=>({ok:false,status:'HOLD',reason,
  canDeleteQ4:false,canModifyWorld:false,canRoute:false});
function hash(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);
  return 'fnv32:'+(h>>>0).toString(16).padStart(8,'0');
}
function read(world,key){
  try{return {ok:true,value:world.getDynamicProperty(key)};}
  catch(_){return refuse('world_property_read_failed:'+key);}
}
function write(world,key,value){
  try{world.setDynamicProperty(key,value);}
  catch(_){return refuse('world_property_write_ambiguous:'+key);}
  const r=read(world,key);
  if(!r.ok)return r;
  if(r.value!==value)return refuse('world_property_readback_mismatch:'+key);
  return {ok:true};
}
function rawRecords(world,receiver){
  if(typeof world.getDynamicPropertyIds!=='function')
    return refuse('property_enumeration_unavailable');
  let keys;
  try{keys=world.getDynamicPropertyIds();}
  catch(_){return refuse('property_enumeration_failed');}
  if(!Array.isArray(keys)||keys.length>200000)
    return refuse('property_enumeration_invalid');
  const prefix=[
    'hartsorter:q4m_'+receiver.queueKey,
    'hartsorter:q4p_'+receiver.queueKey+'_',
    'hartsorter:q4d_'+receiver.queueKey+'_'
  ];
  const map=new Map();
  for(const key of keys){
    if(typeof key!=='string')return refuse('property_key_invalid');
    if(key===prefix[0] || key.startsWith(prefix[1]) ||
       key.startsWith(prefix[2])){
      const r=read(world,key);
      if(!r.ok)return r;
      map.set(key,r.value);
    }
  }
  return {ok:true,records:map};
}
function journalClear(world){
  for(const key of ['hartsorter:journal_v1','hartsorter:queue_journal_v1',
    'hartlogistics:uce_native_intent_v1']){
    const r=read(world,key);
    if(!r.ok)return r;
    if(r.value!==undefined&&r.value!==null&&r.value!=='')
      return refuse('preexisting_custody_journal:'+key);
  }
  return {ok:true};
}
function planInput({world,worldId,epoch,receivers,proofs,
    expectedQueuedTotal,expectedReceiverCount}={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     !validId(worldId)||!positive(epoch)||
     !Array.isArray(receivers)||receivers.length>maxReceivers||
     !(proofs instanceof Map)||!nat(expectedQueuedTotal)||
     !nat(expectedReceiverCount)||
     expectedReceiverCount!==receivers.length)
    return refuse('invalid_cold_import_inputs');
  const journal=journalClear(world);
  if(!journal.ok)return journal;
  const census=previewQ5WorldQ4Census({
    world,worldId,receivers,expectedReceiverCount,
    expectedQueuedTotal,registrySnapshotStable:true
  });
  if(!census.ok)return refuse('q4_census:'+census.reason);
  const reads=[];
  for(const receiver of receivers){
    const raw=rawRecords(world,receiver);
    if(!raw.ok)return raw;
    const r=readOnlyQ4Snapshot({receiver,records:raw.records,
      queueJournalClear:true,physicalJournalClear:true});
    if(!r.ok)return refuse('q4_snapshot:'+receiver.id+':'+r.reason);
    reads.push(r);
  }
  const staged=stageUnifiedOrdinaryAccounts({
    worldCensus:census,sourceSnapshots:reads,
    ordinaryProofs:proofs,bulkMemberIds:[],epoch
  });
  if(!staged.ok)return refuse('q4_ordinary_conversion:'+staged.reason);
  const sourceSnapshot=staged.snapshot;
  const shards=[];
  for(const account of sourceSnapshot.accounts){
    const ix=shards.length;
    if(ix>=maxShards)return refuse('too_many_cold_shards');
    const shardKey='hartlogistics:uce_shard_'+String(ix).padStart(4,'0')+'_v1';
    const source=sourceSnapshot.sourceReceivers.filter(
      r=>'receiver:'+r.id===account.id);
    const snapshot={...sourceSnapshot,
      accounts:[account],sourceReceivers:source,total:account.total};
    const envelope=previewUnifiedShard({snapshot,shardKey});
    if(!envelope.ok)return refuse('oversized_or_invalid_shard:'+
      account.id+':'+envelope.reason);
    shards.push({key:shardKey,raw:envelope.raw,
      itemCount:account.total,owner:account.id});
  }
  const seal={schema:UCE_COLD_SEAL_SCHEMA,worldId,epoch,
    receivers:receivers.length,initialItemCount:staged.itemCount,
    shards:shards.map(s=>({key:s.key,owner:s.owner,
      initialCount:s.itemCount,initialHash:hash(s.raw)})),
    q4Sources:sourceSnapshot.sourceReceivers.map(s=>({
      id:s.id,queueKey:s.queueKey,fingerprint:s.fingerprint,
      itemCount:s.itemCount
    }))};
  const rawSeal=JSON.stringify(seal);
  if(rawSeal.length>maxSeal)return refuse('cold_seal_capacity_exceeded');
  return {ok:true,status:'COLD_Q4_IMPORT_PLAN_ONLY',
    worldId,epoch,receiverCount:receivers.length,
    itemCount:staged.itemCount,shards,seal,rawSeal,
    censusSignature:JSON.stringify(census.receivers),
    canRoute:false,canModifyWorld:false,canDeleteQ4:false};
}
/**
 * Validate a complete read-only Q4 source before any write. A boolean
 * "quiescent" assertion is not considered an independent BDS freeze proof.
 */
export function previewUnifiedColdQ4Import(args){
  return planInput(args);
}
/**
 * The only authority-change entry point, bound to an owner-reviewed stopped
 * world restore operation. Builds REQUESTED then physical shard snapshots
 * then an immutable seal then ACTIVE; each cutpoint is a fail-closed hold.
 *
 * actualWorldFence() must verify that the runtime has source-enforced
 * no-legacy-writer behavior once any UCE authority marker exists. This is
 * supplied by the compiled integrated Bedrock main; merely returning true
 * from a mock is not proof of live or vanilla atomicity.
 *
 * A missing owner backup, unresolved legacy MR or pending journal refuses
 * BEFORE setting REQUESTED. Other failures after REQUESTED leave it in place.
 */
export function executeUnifiedColdQ4Import(args){
  const p=planInput(args);
  if(!p.ok)return p;
  const {world,actualWorldFence,backupVerified,legacyInputIsolation,
    receivers,proofs,expectedQueuedTotal,expectedReceiverCount}=args;
  if(backupVerified!==true||legacyInputIsolation!==true||
     typeof actualWorldFence!=='function')
    return refuse('backup_or_legacy_isolation_unverified');
  const marker=read(world,UCE_AUTHORITY_KEY);
  if(!marker.ok)return marker;
  const oldSeal=read(world,UCE_COLD_SEAL_KEY);
  if(!oldSeal.ok)return oldSeal;
  if((marker.value!==undefined&&marker.value!==null&&marker.value!=='')||
     (oldSeal.value!==undefined&&oldSeal.value!==null&&oldSeal.value!==''))
    return refuse('authority_or_seal_already_present');
  for(const shard of p.shards){
    const r=read(world,shard.key);
    if(!r.ok)return r;
    if(r.value!==undefined&&r.value!==null&&r.value!=='')
      return refuse('preexisting_uec_shard');
  }
  let frozen=false;
  const requested={schema:UCE_AUTHORITY_SCHEMA,state:'REQUESTED',
    worldId:p.worldId,epoch:p.epoch,writer:'UCE_EXCLUSIVE',
    q4LegacyWritersFenced:false,migrationReconciled:false};
  const set=write(world,UCE_AUTHORITY_KEY,JSON.stringify(requested));
  if(!set.ok)return refuse('freeze_request_ambiguous:'+set.reason);
  try{frozen=actualWorldFence()===true;}catch(_){}
  if(!frozen)return refuse('legacy_writer_fence_unverified_after_request');
  // The just-established fence must not have altered Q4; verify again.
  const after=planInput({world,worldId:p.worldId,epoch:p.epoch,
    receivers,proofs,expectedQueuedTotal,expectedReceiverCount});
  if(!after.ok||after.rawSeal!==p.rawSeal)
    return refuse('q4_changed_during_request');
  for(const shard of p.shards){
    const w=write(world,shard.key,shard.raw);
    if(!w.ok)return refuse('cold_shard_write:'+w.reason);
  }
  const sealed=write(world,UCE_COLD_SEAL_KEY,p.rawSeal);
  if(!sealed.ok)return refuse('cold_seal_write:'+sealed.reason);
  const afterSeal=planInput({world,worldId:p.worldId,epoch:p.epoch,
    receivers,proofs,expectedQueuedTotal,expectedReceiverCount});
  if(!afterSeal.ok||afterSeal.rawSeal!==p.rawSeal)
    return refuse('q4_changed_after_shard_stage');
  for(const shard of p.shards){
    const readback=read(world,shard.key);
    if(!readback.ok||readback.value!==shard.raw)
      return refuse('cold_shard_readback_changed');
  }
  const active={...requested,state:'ACTIVE',
    q4LegacyWritersFenced:true,migrationReconciled:true,
    coldSealHash:hash(p.rawSeal),shardCount:p.shards.length,
    initialItemCount:p.itemCount};
  const commit=write(world,UCE_AUTHORITY_KEY,JSON.stringify(active));
  if(!commit.ok)return refuse('active_authority_write:'+commit.reason);
  return {ok:true,status:'COLD_Q4_IMPORT_ACTIVE_READBACK',
    receiverCount:p.receiverCount,itemCount:p.itemCount,
    shardCount:p.shards.length,originalQ4Retained:true,
    hasHardCrashAtomicityProof:false,hasNativeMRMigrationProof:false,
    releaseApproved:false};
}


/**
 * Required startup gate BEFORE any ACTIVE UCE service may move items. Check the
 * ACTIVE marker, cold seal, every registered shard, and original account owner
 * identities. A missing/torn/shadow-rewound shard refuses global activation.
 * Legitimate post-commit account balance revisions are allowed; an unmodified
 * GENESIS shard must match its original seal hash.
 */
export function inspectUnifiedActiveColdImport({world,worldId,epoch}={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     !validId(worldId)||!positive(epoch))
    return refuse('invalid_cold_authority_check');
  const marker=read(world,UCE_AUTHORITY_KEY);
  if(!marker.ok)return marker;
  if(typeof marker.value!=='string'||marker.value.length>4096)
    return refuse('active_authority_missing');
  let active;
  try{active=JSON.parse(marker.value);}
  catch(_){return refuse('active_authority_corrupt');}
  if(!active||active.schema!==UCE_AUTHORITY_SCHEMA||
     active.state!=='ACTIVE'||active.worldId!==worldId||
     active.epoch!==epoch||active.writer!=='UCE_EXCLUSIVE'||
     active.q4LegacyWritersFenced!==true||
     active.migrationReconciled!==true||
     !nat(active.initialItemCount)||!nat(active.shardCount)||
     typeof active.coldSealHash!=='string')
    return refuse('active_authority_not_verified');
  const rawSeal=read(world,UCE_COLD_SEAL_KEY);
  if(!rawSeal.ok)return rawSeal;
  if(typeof rawSeal.value!=='string'||
     rawSeal.value.length>maxSeal||
     hash(rawSeal.value)!==active.coldSealHash)
    return refuse('cold_seal_missing_or_changed');
  let seal;
  try{seal=JSON.parse(rawSeal.value);}
  catch(_){return refuse('cold_seal_invalid');}
  if(!seal||seal.schema!==UCE_COLD_SEAL_SCHEMA||
     seal.worldId!==worldId||seal.epoch!==epoch||
     seal.initialItemCount!==active.initialItemCount||
     !Array.isArray(seal.shards)||
     seal.shards.length!==active.shardCount||
     !Array.isArray(seal.q4Sources)||
     seal.q4Sources.length!==seal.receivers)
    return refuse('cold_seal_authority_mismatch');
  let total=0,ids=new Set(),keys=new Set();
  const bankAccounts=new Map(),liveSources=new Map();
  const sealedSources=new Map(seal.q4Sources.map(x=>[x.id,x]));
  if(sealedSources.size!==seal.q4Sources.length)
    return refuse('duplicate_sealed_receiver_source');
  for(const item of seal.shards){
    if(!item||!validId(item.owner)||!validId(item.key)||
       !nat(item.initialCount)||typeof item.initialHash!=='string'||
       keys.has(item.key)||ids.has(item.owner))
      return refuse('cold_shard_index_invalid');
    keys.add(item.key);ids.add(item.owner);
    const raw=read(world,item.key);
    if(!raw.ok)return raw;
    const checked=inspectUnifiedWorldShard({
      raw:raw.value,shardKey:item.key,worldId,epoch});
    if(!checked.ok)
      return refuse('cold_shard_unreadable:'+item.key+':'+checked.reason);
    const original=checked.snapshot.accounts.find(a=>a.id===item.owner);
    if(!original||checked.snapshot.accounts.filter(a=>
        a.id===item.owner).length!==1)
      return refuse('cold_shard_account_changed');
    // New Bulk accounts may be appended to the original Receiver's one
    // property. No new Receiver can be conjured without a separate witnessed
    // registry/cold-import operation.
    for(const account of checked.snapshot.accounts){
      if(account.id!==item.owner&&account.kind!=='bulk')
        return refuse('unsealed_receiver_account');
      if(account.kind==='bulk'){
        if(bankAccounts.has(account.ownerId))
          return refuse('duplicate_bulk_owner_across_shards');
        bankAccounts.set(account.ownerId,account);
      }
    }
    for(const source of checked.snapshot.sourceReceivers){
      const old=sealedSources.get(source.id);
      if(!old||old.queueKey!==source.queueKey||
         old.fingerprint!==source.fingerprint||
         liveSources.has(source.id))
        return refuse('changed_or_repeated_q4_provenance');
      liveSources.set(source.id,source);
    }
    if(checked.snapshot.revision===0 &&
       hash(raw.value)!==item.initialHash)
      return refuse('cold_genesis_shard_mismatch');
    total+=checked.snapshot.total;
    if(!nat(total))return refuse('cold_current_total_overflow');
  }
  if(liveSources.size!==sealedSources.size)
    return refuse('cold_q4_provenance_missing');
  const controllers=[...bankAccounts.values()].filter(x=>
    x.role==='controller');
  if(bankAccounts.size && (controllers.length!==1 ||
      [...bankAccounts.values()].some(x=>
        x.controllerOwnerId!==controllers[0].ownerId)))
    return refuse('cold_bulk_controller_conflict');
  if(!seal.shards.length&&active.initialItemCount!==0)
    return refuse('cold_empty_shards_with_items');
  return {ok:true,status:'COLD_UCE_AUTHORITY_AND_SHARDS_VERIFIED',
    currentLedgerTotal:total,initialItemCount:active.initialItemCount,
    receiverCount:seal.receivers,shardCount:keys.size,
    canDeleteQ4:false,canMoveNative:false,
    hasCrashAtomicityProof:false};
}
