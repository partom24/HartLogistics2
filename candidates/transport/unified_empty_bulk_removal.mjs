/**
 * Ordinary Minecraft mining interaction for EMPTY Hart Bulk Storage.
 *
 * This is deliberately a ONE-ACTION user experience: the player mines a
 * block. The game performs all verified account/controller maintenance.
 * Unused accounts only. Nonempty / previously used custody never vanishes.
 *
 * Bedrock block edits and world properties are not disk-atomic. The PREPARED
 * marker fences every other UCE writer before removing a registered block.
 * An ambiguous write leaves HOLD; no background retry, deletion or Q4 reset.
 */
import {inspectUnifiedActiveColdImport} from './unified_cold_q4_importer.mjs';
import {createUnifiedShardWriter,verifyUnifiedMutationFence,
  UCE_EMPTY_BULK_REMOVAL_KEY,UCE_EMPTY_BULK_REMOVAL_SCHEMA}
  from './unified_world_shard_writer.mjs';

const clean=s=>typeof s==='string'&&s.length>0&&s.length<=256&&
  /^[\x20-\x7e]+$/.test(s);
const hold=reason=>({ok:false,status:'HOLD',reason});
const vacant=value=>value===undefined||value===null||value==='';
const bankID=p=>p.dimensionId+'|'+p.x+','+p.y+','+p.z;

export function executeUnifiedEmptyBulkRemoval({
    world,worldId,epoch,operationId,block,operatorAuthorized=false,
    externalFence
}={}){
  if(!world||operatorAuthorized!==true||!clean(worldId)||
     !Number.isSafeInteger(epoch)||epoch<1||!clean(operationId)||
     typeof externalFence!=='function'||!block||
     block.typeId!=='hartlogistics:bulk_storage')
    return hold('bulk_removal_authority_unavailable');
  const d=block.dimension,at=block.location;
  if(!d||!clean(d.id)||!at||
     ![at.x,at.y,at.z].every(Number.isSafeInteger))
    return hold('bulk_location_unavailable');
  const location={dimensionId:d.id,x:at.x,y:at.y,z:at.z};
  const ownerId=bankID(location);
  const placed=()=>d.getBlock({x:at.x,y:at.y,z:at.z});
  const type=()=>placed()?.typeId;
  try{
    const cold=inspectUnifiedActiveColdImport({world,worldId,epoch});
    if(!cold.ok)return hold('storage_account_unavailable');
    const fence=verifyUnifiedMutationFence(world,worldId,epoch,externalFence);
    if(!fence.ok)return hold('another_storage_operation_pending');
    if(!vacant(world.getDynamicProperty(UCE_EMPTY_BULK_REMOVAL_KEY)))
      return hold('another_bulk_removal_pending');
    if(type()!=='hartlogistics:bulk_storage')
      return hold('block_changed');
    const seal=JSON.parse(world.getDynamicProperty(
      'hartlogistics:uce_cold_seal_v1'));
    if(!seal||seal.worldId!==worldId||seal.epoch!==epoch||
       !Array.isArray(seal.shards)||seal.shards.length===0)
      return hold('storage_registry_unavailable');
    let matched=null;
    // Inspect EVERY sealed region. Any unreadable shard refuses removal,
    // even if the desired block looks empty or not yet registered.
    for(const region of seal.shards){
      const reader=createUnifiedShardWriter({world,worldId,epoch,
        shardKey:region.key,externalFence:()=>false});
      const view=reader.ok&&reader.inspect();
      if(!view?.ok)return hold('storage_registry_unavailable');
      const rows=view.snapshot.accounts.filter(a=>
        a.id==='bulk:'+ownerId&&a.kind==='bulk');
      if(rows.length>1||rows.length&&matched)
        return hold('storage_registry_duplicate');
      if(rows.length===1)matched={region:region.key,account:rows[0],
        revision:view.snapshot.revision};
    }
    // Unregistered placement: no virtual item is owned. It is safe to
    // remove just the block after the global census and mutation fence.
    if(!matched){
      if(!verifyUnifiedMutationFence(
          world,worldId,epoch,externalFence).ok||
         type()!=='hartlogistics:bulk_storage')
        return hold('block_or_storage_changed');
      placed().setType('minecraft:air');
      if(type()!=='minecraft:air')return hold('block_removal_not_verified');
      return {ok:true,status:'EMPTY_UNREGISTERED_BLOCK_REMOVED',
        ownerId,controllerOwnerId:null};
    }
    const account=matched.account;
    if(account.total!==0||account.buckets.length!==0)
      return hold('storage_contains_items');
    if(account.lifetime.received!==0||account.lifetime.delivered!==0)
      return hold('storage_has_item_history');
    const intent={schema:UCE_EMPTY_BULK_REMOVAL_SCHEMA,
      worldId,epoch,operationId,ownerId,shardKey:matched.region,
      location,phase:'PREPARED'};
    const raw=JSON.stringify(intent);
    // Mark first: every other writer freezes BEFORE physical removal.
    world.setDynamicProperty(UCE_EMPTY_BULK_REMOVAL_KEY,raw);
    if(world.getDynamicProperty(UCE_EMPTY_BULK_REMOVAL_KEY)!==raw)
      return hold('removal_ownership_not_verified');
    const mineFence=verifyUnifiedMutationFence(world,worldId,epoch,
      externalFence,{allowedEmptyBulkRemovalOperationId:operationId});
    if(!mineFence.ok||type()!=='hartlogistics:bulk_storage')
      return hold('removal_claim_changed');
    placed().setType('minecraft:air');
    if(type()!=='minecraft:air')return hold('block_removal_not_verified');
    const write=createUnifiedShardWriter({world,worldId,epoch,
      shardKey:matched.region,externalFence,
      verifyBulkVacated:(id,key,op)=>{
        if(id!==ownerId||key!==matched.region||op!==operationId||
           type()!=='minecraft:air')return false;
        const saved=world.getDynamicProperty(UCE_EMPTY_BULK_REMOVAL_KEY);
        return saved===raw;
      }});
    if(!write.ok)return hold('storage_retirement_unavailable');
    const retired=write.retireEmptyBulkMember({ownerId,operationId,
      expectedRevision:matched.revision,expectedEpoch:epoch});
    if(!retired.ok)return hold('storage_retirement_'+retired.reason);
    const after=inspectUnifiedActiveColdImport({world,worldId,epoch});
    if(!after.ok)return hold('storage_retirement_readback_unavailable');
    const inspected=write.inspect();
    if(!inspected.ok||inspected.snapshot.accounts.some(a=>
        a.id==='bulk:'+ownerId))
      return hold('retired_account_still_present');
    world.setDynamicProperty(UCE_EMPTY_BULK_REMOVAL_KEY,undefined);
    if(!vacant(world.getDynamicProperty(UCE_EMPTY_BULK_REMOVAL_KEY)))
      return hold('removal_marker_clear_unverified');
    return {ok:true,status:'EMPTY_BULK_REMOVED_AND_ACCOUNT_RETIRED',
      ownerId,controllerOwnerId:retired.controllerOwnerId};
  }catch(_){
    return hold('removal_interrupted_keep_world_for_reconciliation');
  }
}
