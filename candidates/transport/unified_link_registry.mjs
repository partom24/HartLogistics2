/**
 * Unified Custody Engine — ONE versioned Collector link record writer.
 *
 * Routing identity metadata only. Never reads/writes Q4 queue pages, item
 * counts, native inventories, or a second property to prepare a transaction.
 * Original hartsorter:logistics_v2 remains the single persisted registry;
 * legacy writers are completely fenced while UCE owns mutation authority.
 *
 * This adapter may append an EMPTY newly placed Collector or relink an
 * existing Collector to an ALREADY SEALED Receiver, including a new one
 * owned by a presealed empty shard. It cannot create Receiver accounts,
 * select an absent Receiver, or migrate queued items.
 * The caller must prove the actual loaded blocks before and immediately
 * before writing, and preserve the existing immutable Q4 linkage records.
 */
import {verifyUnifiedMutationFence} from './unified_world_shard_writer.mjs';

export const UCE_LINKS_KEY='hartsorter:logistics_v2';
export const UCE_LINKS_RECEIPT_SCHEMA='hart-uce-links-v1';
const ASCII=/^[\x20-\x7e]+$/;
const id=s=>typeof s==='string'&&s.length>0&&s.length<=256&&ASCII.test(s);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const hold=reason=>({ok:false,status:'HOLD',reason,
  canWriteQueue:false,canMoveItems:false,canClearQ4:false});
function parse(raw){
  if(typeof raw!=='string'||!raw||raw.length>30000)
    return hold('saved_logistics_missing_or_oversized');
  let data;
  try{data=JSON.parse(raw);}catch(_){return hold('saved_logistics_corrupt');}
  if(!data||!Array.isArray(data.collectors)||
     !Array.isArray(data.receivers)||
     !integer(data.nextQueue)||data.nextQueue<1 ||
     (data.uceLinkRevision!==undefined&&!integer(data.uceLinkRevision)))
    return hold('saved_logistics_invalid_header');
  const receivers=new Set(),collectors=new Set();
  for(const r of data.receivers){
    if(!r||!id(r.id)||receivers.has(r.id)||
       !id(r.d)||!Number.isSafeInteger(r.x)||
       !Number.isSafeInteger(r.y)||!Number.isSafeInteger(r.z)||
       !id(r.queueKey))return hold('saved_receiver_registry_invalid');
    receivers.add(r.id);
  }
  for(const c of data.collectors){
    if(!c||!id(c.id)||collectors.has(c.id)||
       !id(c.d)||!Number.isSafeInteger(c.x)||
       !Number.isSafeInteger(c.y)||!Number.isSafeInteger(c.z)||
       (c.link!==null&&c.link!==undefined&&!id(c.link)))
      return hold('saved_collector_registry_invalid');
    collectors.add(c.id);
  }
  if(data.uceLastLinkReceipt!==undefined){
    const r=data.uceLastLinkReceipt;
    if(!r||r.schema!==UCE_LINKS_RECEIPT_SCHEMA||
       !id(r.operationId)||!id(r.collectorId)||!id(r.receiverId)||
       !integer(r.revision)||r.revision!==data.uceLinkRevision)
      return hold('saved_logistics_receipt_invalid');
  }
  return {ok:true,data};
}
export function createUnifiedLinkRegistry({world,worldId,epoch,
    externalFence,verifyCollectorBlock,verifySealedReceiver,
    verifyEmptyNewWorld}={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     typeof world.setDynamicProperty!=='function'||
     !id(worldId)||!Number.isSafeInteger(epoch)||epoch<1||
     typeof externalFence!=='function'||
     typeof verifyCollectorBlock!=='function'||
     typeof verifySealedReceiver!=='function')
    return hold('invalid_link_registry_binding');
  let quarantined=false;
  function read(){
    let raw;
    try{raw=world.getDynamicProperty(UCE_LINKS_KEY);}
    catch(_){return hold('saved_logistics_unreadable');}
    // A truly new UCE world has no legacy Q4 link registry. Only its
    // independently verified empty sealed origin permits a virtual initial
    // record; never silently recreate a missing/corrupt archived registry.
    if(raw===undefined){
      let safe=false;
      try{safe=verifyEmptyNewWorld?.()===true;}catch(_){}
      if(!safe)return hold('saved_logistics_missing_or_oversized');
      return {ok:true,raw:undefined,bootstrap:true,
        data:{collectors:[],receivers:[],nextQueue:1}};
    }
    const parsed=parse(raw);
    if(!parsed.ok)return parsed;
    return {...parsed,raw,bootstrap:false};
  }
  function inspect(){
    const r=read();
    if(!r.ok)return r;
    return {ok:true,status:'LINK_REGISTRY_READ_ONLY',
      collectorCount:r.data.collectors.length,
      receiverCount:r.data.receivers.length,
      revision:r.data.uceLinkRevision??0};
  }
  function linkCollector({operationId,collector,receiverId,
      expectedRevision}={}){
    if(quarantined)return hold('link_session_quarantined');
    if(!id(operationId)||!collector||!id(collector.id)||
       !id(collector.d)||!Number.isSafeInteger(collector.x)||
       !Number.isSafeInteger(collector.y)||
       !Number.isSafeInteger(collector.z)||
       !id(receiverId)||!integer(expectedRevision))
      return hold('invalid_link_request');
    const gate=verifyUnifiedMutationFence(world,worldId,epoch,externalFence);
    if(!gate.ok)return hold(gate.reason);
    const previous=read();
    if(!previous.ok)return previous;
    const old=previous.data;
    const revision=old.uceLinkRevision??0;
    if(revision!==expectedRevision)
      return hold('stale_link_registry_revision');
    // Legacy receiver registry rows are not an ownership oracle. A newly
    // registered UCE Receiver exists in a sealed shard, not a Q4 registry.
    // The caller's live, rechecked sealed-account proof is authoritative.
    const current=old.collectors.find(c=>c.id===collector.id);
    if(current&&(current.d!==collector.d||
       current.x!==collector.x||current.y!==collector.y||
       current.z!==collector.z))
      return hold('collector_identity_collision');
    let valid=false,receiverValid=false;
    try{
      valid=verifyCollectorBlock(collector)===true;
      receiverValid=verifySealedReceiver(receiverId)===true;
    }catch(_){}
    if(!valid||!receiverValid)
      return hold('collector_or_sealed_receiver_unverified');
    if(current?.link===receiverId&&current.present!==false)
      return {ok:true,status:'COLLECTOR_LINK_ALREADY_PRESENT',
        operationId,revision,canWriteQueue:false};
    const next=JSON.parse(JSON.stringify(old));
    const target=next.collectors.find(c=>c.id===collector.id);
    if(target){
      target.link=receiverId;
      target.present=true;
      if(!integer(target.accepted))target.accepted=0;
    }else{
      next.collectors.push({...collector,link:receiverId,
        present:true,accepted:0});
    }
    next.uceLinkRevision=revision+1;
    if(!integer(next.uceLinkRevision))
      return hold('link_revision_overflow');
    next.uceLastLinkReceipt={
      schema:UCE_LINKS_RECEIPT_SCHEMA,operationId,
      collectorId:collector.id,receiverId,
      epoch,revision:next.uceLinkRevision
    };
    const raw=JSON.stringify(next);
    if(raw.length>30000)return hold('link_registry_capacity_exceeded');
    const reread=read();
    if(!reread.ok)return reread;
    if(reread.raw!==previous.raw)
      return hold('link_registry_changed_prewrite');
    const gate2=verifyUnifiedMutationFence(world,worldId,epoch,externalFence);
    let stillCollector=false,stillReceiver=false;
    try{
      stillCollector=verifyCollectorBlock(collector)===true;
      stillReceiver=verifySealedReceiver(receiverId)===true;
    }catch(_){}
    let stillEmptySafe=!previous.bootstrap;
    if(previous.bootstrap){
      try{stillEmptySafe=verifyEmptyNewWorld?.()===true;}catch(_){}
    }
    if(!gate2.ok||!stillCollector||!stillReceiver||!stillEmptySafe)
      return hold('link_route_or_writer_fence_changed_prewrite');
    try{world.setDynamicProperty(UCE_LINKS_KEY,raw);}
    catch(_){
      quarantined=true;
      return hold('link_write_outcome_ambiguous');
    }
    const posted=read();
    if(!posted.ok||posted.raw!==raw){
      quarantined=true;
      return hold('link_readback_mismatch');
    }
    return {ok:true,status:'COLLECTOR_LINK_COMMITTED_READBACK',
      collectorId:collector.id,receiverId,revision:next.uceLinkRevision,
      operationId,canWriteQueue:false,canClearQ4:false};
  }
  return {ok:true,inspect,linkCollector,
    getSessionQuarantine:()=>quarantined};
}
