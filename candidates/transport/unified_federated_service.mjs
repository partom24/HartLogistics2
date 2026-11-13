/**
 * UCE virtual ordinary Receiver -> Bulk across two sealed ledger shards.
 *
 * One global durable intent coordinates TWO existing shard writers. Neither
 * path reconstructs ItemStacks, creates another queue, or mutates a Q4 key.
 * PREPARED/debit/credit cutpoints are read back and any uncertainty HOLDS
 * every other Hart custody writer. No automatic replay or disk-atomic claim.
 */
import {transitionUnifiedOrdinaryBoundary} from './unified_ordinary_accounts.mjs';
import {verifyUnifiedMutationFence,UCE_FEDERATED_INTENT_KEY,
  UCE_FEDERATED_SCHEMA} from './unified_world_shard_writer.mjs';
const ASCII=/^[\x20-\x7e]+$/;
const SHARD=/^hartlogistics:uce_shard_[a-z0-9_]{1,80}_v1$/;
const valid=s=>typeof s==='string'&&!!s&&s.length<=256&&ASCII.test(s);
const pos=n=>Number.isSafeInteger(n)&&n>0;
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const hold=(reason,afterPrepared=false)=>({ok:false,status:'HOLD',reason,
  pendingReconciliation:afterPrepared,canReplay:false,
  hasHardCrashDiskProof:false});
function read(world){
  try{return {ok:true,raw:world.getDynamicProperty(UCE_FEDERATED_INTENT_KEY)};}
  catch(_){return hold('federated_journal_unreadable');}
}
function stage(world,before,after){
  const now=read(world);
  if(!now.ok)return now;
  if(now.raw!==before)return hold('federated_intent_changed_prewrite',before!==undefined);
  if(after!==undefined&&
     (typeof after!=='string'||after.length>12000||!ASCII.test(after)))
    return hold('federated_intent_capacity_exceeded',before!==undefined);
  try{world.setDynamicProperty(UCE_FEDERATED_INTENT_KEY,after);}
  catch(_){return hold('federated_intent_write_ambiguous',true);}
  const posted=read(world);
  if(!posted.ok||posted.raw!==after)
    return hold('federated_intent_readback_failed',true);
  return {ok:true,raw:after};
}
const account=(view,id)=>view.snapshot.accounts.find(a=>a.id===id);
const bucket=(a,key)=>a?.buckets.find(b=>b.key===key)?.count||0;
const receipt=(view,kind,tx,accountId)=>!!view.ok&&
  view.lastReceipt?.kind===kind&&
  view.lastReceipt.operationId===tx.operationId&&
  view.lastReceipt.accountId===accountId&&
  view.lastReceipt.key===tx.key&&
  view.lastReceipt.count===tx.count&&
  view.lastReceipt.fromShard===tx.fromShard&&
  view.lastReceipt.toShard===tx.toShard;

/**
 * Execute once under the live global authority. Caller binds the existing
 * shard writers with verifyFederatedRoute(tx,direction) and validates loaded
 * network membership at both the preflight and per-shard mutation boundary.
 * A failed operation with a PREPARED marker must NEVER be invoked again:
 * inspect it offline and reconcile the isolated LAB clone instead.
 */
export function executeUnifiedFederatedTransfer({
    world,worldId,epoch,operationId,sourceWriter,destinationWriter,
    fromShard,toShard,fromAccount,toAccount,key,count,externalFence,
    verifyRoute
  }={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     typeof world.setDynamicProperty!=='function'||
     !valid(worldId)||!pos(epoch)||!valid(operationId)||
     !SHARD.test(fromShard||'')||!SHARD.test(toShard||'')||
     fromShard===toShard||!valid(fromAccount)||!valid(toAccount)||
     fromAccount===toAccount||typeof key!=='string'||!key||
     !pos(count)||count>64||typeof externalFence!=='function'||
     typeof verifyRoute!=='function'||
     typeof sourceWriter?.inspect!=='function'||
     typeof sourceWriter?.applyFederatedSide!=='function'||
     typeof destinationWriter?.inspect!=='function'||
     typeof destinationWriter?.applyFederatedSide!=='function')
    return hold('invalid_federated_transfer_binding');
  const gate=verifyUnifiedMutationFence(
    world,worldId,epoch,externalFence);
  if(!gate.ok)return hold('federated_fence:'+gate.reason);
  const empty=read(world);
  if(!empty.ok)return empty;
  if(empty.raw!==undefined&&empty.raw!==null&&empty.raw!=='')
    return hold('pending_federated_requires_manual_reconciliation',true);
  const source=sourceWriter.inspect(),target=destinationWriter.inspect();
  if(!source.ok||!target.ok)
    return hold('federated_source_or_destination_shard_unreadable');
  const from=account(source,fromAccount),to=account(target,toAccount);
  if(!from||from.kind!=='receiver'||!to||to.kind!=='bulk'||
     bucket(from,key)<count||to.total+count>to.capacity||
     !nat(source.snapshot.total+target.snapshot.total))
    return hold('federated_account_or_capacity_unverified');
  const args={operationId,fromShard,toShard,fromAccount,toAccount,key,count,
    fromRevision:source.snapshot.revision,toRevision:target.snapshot.revision,
    sourceTotal:source.snapshot.total,targetTotal:target.snapshot.total,
    sourceCount:bucket(from,key),targetCount:bucket(to,key)};
  // Read-only algebra catches invalid item identity/overflow before saving
  // a global PREPARED marker or changing an account.
  const debit=transitionUnifiedOrdinaryBoundary(source.snapshot,{
    operationId,accountId:fromAccount,key,count,direction:'withdraw',
    expectedRevision:args.fromRevision,expectedEpoch:epoch});
  const credit=transitionUnifiedOrdinaryBoundary(target.snapshot,{
    operationId,accountId:toAccount,key,count,direction:'deposit',
    expectedRevision:args.toRevision,expectedEpoch:epoch});
  if(!debit.ok||!credit.ok)
    return hold('federated_preview_invalid');
  const tx={schema:UCE_FEDERATED_SCHEMA,phase:'PREPARED',worldId,epoch,...args};
  let route=false;
  try{route=verifyRoute(tx)===true;}catch(_){}
  if(!route)return hold('federated_live_route_not_verified');
  const prepared=stage(world,empty.raw,JSON.stringify(tx));
  if(!prepared.ok)return prepared;
  const sourceArgs={operationId,fromShard,toShard,fromAccount,toAccount,
    key,count,direction:'withdraw',expectedRevision:args.fromRevision,
    expectedEpoch:epoch};
  const sent=sourceWriter.applyFederatedSide(sourceArgs);
  if(!sent.ok)return hold('federated_debit:'+sent.reason,true);
  const debitedRaw=JSON.stringify({...tx,phase:'DEBIT_INSPECTED'});
  const marked=stage(world,prepared.raw,debitedRaw);
  if(!marked.ok)return hold('federated_debit_marker:'+marked.reason,true);
  const received=destinationWriter.applyFederatedSide({
    ...sourceArgs,direction:'deposit',expectedRevision:args.toRevision});
  if(!received.ok)return hold('federated_credit:'+received.reason,true);
  const creditedRaw=JSON.stringify({...tx,phase:'CREDIT_INSPECTED'});
  const completed=stage(world,debitedRaw,creditedRaw);
  if(!completed.ok)return hold('federated_credit_marker:'+completed.reason,true);
  // Both independently saved receipts must prove that exact original
  // source item count moved once and that total ownership was conserved.
  const finalSource=sourceWriter.inspect();
  const finalTarget=destinationWriter.inspect();
  if(!receipt(finalSource,'FEDERATED_DEBIT',tx,fromAccount)||
     !receipt(finalTarget,'FEDERATED_CREDIT',tx,toAccount)||
     bucket(account(finalSource,fromAccount),key)!==args.sourceCount-count||
     bucket(account(finalTarget,toAccount),key)!==args.targetCount+count||
     finalSource.snapshot.total!==args.sourceTotal-count||
     finalTarget.snapshot.total!==args.targetTotal+count)
    return hold('federated_balanced_receipts_unverified',true);
  const clear=stage(world,creditedRaw,undefined);
  if(!clear.ok)return hold('federated_final_clear:'+clear.reason,true);
  return {ok:true,status:'FEDERATED_TWO_SHARD_TRANSFER_READBACK',
    operationId,fromAccount,toAccount,count,key,
    hasHardCrashDiskProof:false,canReplay:false};
}
