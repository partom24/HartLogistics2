/**
 * UCE Bulk overflow and refill policy — read-only planning for ONE ledger.
 *
 * The same Receiver and physically connected Bulk members share one revision.
 * No new Q5 queue, no native ItemStack, no write, no controller election, and
 * no external state. The caller must reverify loaded topology immediately
 * before the single-shard transfer writer acts.
 */
import {inspectUnifiedOrdinaryLedger} from './unified_ordinary_accounts.mjs';
export const UCE_BULK_MOVE_BATCH=64;
export const UCE_BULK_RECEIVER_RESERVE=512;
const hold=reason=>({ok:false,status:'HOLD',reason,canWriteWorld:false});
const idle=reason=>({ok:true,status:'IDLE',reason,canWriteWorld:false});
export function planUnifiedBulkService({snapshot,receiverOwnerId,
    connectedBankOwnerIds=[],sourceWaiting=false,
    outputEligibleKeys=[]}={}){
  const checked=inspectUnifiedOrdinaryLedger(snapshot);
  if(!checked.ok)return hold('invalid_ledger:'+checked.reason);
  if(typeof receiverOwnerId!=='string'||!receiverOwnerId||
     !Array.isArray(connectedBankOwnerIds)||
     connectedBankOwnerIds.some(x=>typeof x!=='string'||!x)||
     new Set(connectedBankOwnerIds).size!==connectedBankOwnerIds.length||
     !Array.isArray(outputEligibleKeys))
    return hold('invalid_bulk_route_membership');
  const recv=snapshot.accounts.find(a=>
    a.id==='receiver:'+receiverOwnerId);
  if(!recv)return hold('missing_bulk_service_receiver');
  const bankIds=new Set(connectedBankOwnerIds);
  const banks=snapshot.accounts.filter(a=>
    a.kind==='bulk'&&bankIds.has(a.ownerId));
  if(!banks.length)return idle('no_connected_registered_bank');
  if(banks.length!==connectedBankOwnerIds.length)
    return hold('connected_bulk_account_unregistered');
  const leaders=banks.filter(x=>x.role==='controller');
  if(leaders.length!==1||
     banks.some(x=>x.controllerOwnerId!==leaders[0].ownerId))
    return hold('bulk_controller_not_on_same_verified_network');
  banks.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  // Overflow only near Receiver's high-water mark; bank is not a separate
  // competing queue. This reserves ingress headroom and handles backpressure.
  if(recv.total>=recv.capacity-UCE_BULK_RECEIVER_RESERVE &&
     recv.buckets.length){
    for(const entry of recv.buckets){
      for(const bank of banks){
        const free=bank.capacity-bank.total;
        if(free<=0)continue;
        const count=Math.min(entry.count,free,UCE_BULK_MOVE_BATCH);
        if(count>0)return {ok:true,status:'TRANSFER_DRAFT_ONLY',
          direction:'receiver_to_bulk',from:recv.id,to:bank.id,
          key:entry.key,count,expectedRevision:snapshot.revision,
          expectedEpoch:snapshot.epoch,canWriteWorld:false};
      }
    }
    return idle('all_connected_banks_full');
  }
  // Refill a drained Receiver only when there is a verified actual output
  // for the offered item and no new Collector input waiting. The output
  // itself still follows the existing Filter/Auto/Wildcard priority.
  if(recv.total===0 && !sourceWaiting && outputEligibleKeys.length){
    const eligible=new Set(outputEligibleKeys);
    for(const bank of banks){
      for(const entry of bank.buckets){
        if(!eligible.has(entry.key))continue;
        const count=Math.min(entry.count,UCE_BULK_MOVE_BATCH,
          recv.capacity-recv.total);
        if(count>0)return {ok:true,status:'TRANSFER_DRAFT_ONLY',
          direction:'bulk_to_receiver',from:bank.id,to:recv.id,
          key:entry.key,count,expectedRevision:snapshot.revision,
          expectedEpoch:snapshot.epoch,canWriteWorld:false};
      }
    }
  }
  return idle('bulk_retains_custody_or_no_output');
}
