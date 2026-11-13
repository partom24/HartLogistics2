/**
 * UCE virtual ordinary transfers between two sealed ledger shards:
 * Receiver <-> Bulk and Receiver -> verified linked Receiver.
 *
 * One global durable intent coordinates TWO existing shard writers. Neither
 * path reconstructs ItemStacks, creates another queue, or mutates a Q4 key.
 * PREPARED/debit/credit cutpoints are read back and any uncertainty HOLDS
 * every other Hart custody writer. No automatic replay or disk-atomic claim.
 */
import {transitionUnifiedOrdinaryBoundary,
  inspectUnifiedOrdinaryLedger} from './unified_ordinary_accounts.mjs';
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
// A matching operation ID/count alone cannot authorize reconciliation.
// The persisted side must also prove the exact epoch, debit/credit direction
// and one-revision transition from the global PREPARED witness.
const receipt=(view,kind,tx,accountId)=>{
  if(!view?.ok||!tx||!['FEDERATED_DEBIT','FEDERATED_CREDIT']
    .includes(kind))return false;
  const debit=kind==='FEDERATED_DEBIT';
  const before=debit?tx.fromRevision:tx.toRevision;
  const r=view.lastReceipt;
  return nat(before)&&before<Number.MAX_SAFE_INTEGER&&
    r?.kind===kind&&r.operationId===tx.operationId&&
    r.accountId===accountId&&r.key===tx.key&&
    r.count===tx.count&&r.fromShard===tx.fromShard&&
    r.toShard===tx.toShard&&r.epoch===tx.epoch&&
    r.direction===(debit?'withdraw':'deposit')&&
    r.beforeRevision===before&&r.revision===before+1&&
    view.snapshot?.revision===r.revision;
};

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
    verifyRoute,routeWitness=''
  }={}){
  if(!world||typeof world.getDynamicProperty!=='function'||
     typeof world.setDynamicProperty!=='function'||
     !valid(worldId)||!pos(epoch)||!valid(operationId)||
     !SHARD.test(fromShard||'')||!SHARD.test(toShard||'')||
     fromShard===toShard||!valid(fromAccount)||!valid(toAccount)||
     fromAccount===toAccount||typeof key!=='string'||!key||
     !pos(count)||count>64||typeof routeWitness!=='string'||
     routeWitness.length>8192||!ASCII.test(routeWitness)||
     typeof externalFence!=='function'||
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
  if(!from||!to||!(
       (from.kind==='receiver'&&to.kind==='bulk')||
       (from.kind==='bulk'&&to.kind==='receiver')||
       (from.kind==='receiver'&&to.kind==='receiver')
     )||bucket(from,key)<count||to.total+count>to.capacity||
     !nat(source.snapshot.total+target.snapshot.total))
    return hold('federated_account_or_capacity_unverified');
  // Receiver→Receiver is an explicit, verifiable linked-bank route,
  // NEVER a generic balance alias or automatic Bulk rebinding.
  const linkedReceiverHandoff=from.kind==='receiver'&&
    to.kind==='receiver';
  if(linkedReceiverHandoff?!routeWitness.startsWith('IB1|'):
     routeWitness.startsWith('IB1|'))
    return hold('federated_route_kind_witness_mismatch');
  const args={operationId,fromShard,toShard,fromAccount,toAccount,key,count,
    fromRevision:source.snapshot.revision,toRevision:target.snapshot.revision,
    sourceTotal:source.snapshot.total,targetTotal:target.snapshot.total,
    sourceCount:bucket(from,key),targetCount:bucket(to,key),
    routeWitness};
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

/**
 * Forensic read-only audit of an INTERRUPTED global cross-shard transfer.
 * This function never clears or replays the journal, even if both shard
 * receipts look balanced: Bedrock has no proved hard-crash flush ordering.
 * The result is actionable evidence for a stopped-LAB restore/reconciliation.
 */
export function inspectUnifiedFederatedPending({
    world,worldId,epoch,sourceWriter,destinationWriter
  }={}){
  const fail=reason=>({
    ok:false,status:'HOLD',reason,canWriteWorld:false,
    canReplay:false,canClearJournal:false,hasHardCrashDiskProof:false
  });
  if(!world||!valid(worldId)||!pos(epoch)||
     typeof sourceWriter?.inspect!=='function'||
     typeof destinationWriter?.inspect!=='function')
    return fail('invalid_federated_inspection_binding');
  const pending=read(world);
  if(!pending.ok)return fail(pending.reason);
  if(pending.raw===undefined||pending.raw===null||
     pending.raw==='')return {ok:true,status:'FEDERATED_JOURNAL_CLEAR',
       canWriteWorld:false,canReplay:false,canClearJournal:false};
  let tx;
  try{tx=JSON.parse(pending.raw);}catch(_){
    return fail('federated_pending_json_unreadable');
  }
  if(!tx||tx.schema!==UCE_FEDERATED_SCHEMA||
     !['PREPARED','DEBIT_INSPECTED','CREDIT_INSPECTED']
       .includes(tx.phase)||
     tx.worldId!==worldId||tx.epoch!==epoch||
     !valid(tx.operationId)||!SHARD.test(tx.fromShard||'')||
     !SHARD.test(tx.toShard||'')||tx.fromShard===tx.toShard||
     !valid(tx.fromAccount)||!valid(tx.toAccount)||
     !pos(tx.count)||tx.count>64||!valid(tx.key)||
     !valid(tx.routeWitness)||tx.routeWitness.length>8192||
     !nat(tx.fromRevision)||!nat(tx.toRevision)||
     tx.fromRevision===Number.MAX_SAFE_INTEGER||
     tx.toRevision===Number.MAX_SAFE_INTEGER||
     !nat(tx.sourceTotal)||!nat(tx.targetTotal)||
     !nat(tx.sourceCount)||!nat(tx.targetCount)||
     tx.sourceCount<tx.count||
     !nat(tx.sourceTotal-tx.count)||
     !nat(tx.targetTotal+tx.count))
    return fail('federated_pending_identity_invalid');
  const from=sourceWriter.inspect(),to=destinationWriter.inspect();
  if(!from.ok||!to.ok)
    return fail('federated_pending_shards_unreadable');
  const src=account(from,tx.fromAccount);
  const dst=account(to,tx.toAccount);
  if(!src||!dst)return fail('federated_pending_accounts_missing');
  const srcBalance=bucket(src,tx.key);
  const dstBalance=bucket(dst,tx.key);
  const sourceOld=from.snapshot.revision===tx.fromRevision&&
    from.snapshot.total===tx.sourceTotal&&
    srcBalance===tx.sourceCount;
  const sourceMoved=from.snapshot.revision===tx.fromRevision+1&&
    from.snapshot.total===tx.sourceTotal-tx.count&&
    srcBalance===tx.sourceCount-tx.count&&
    receipt(from,'FEDERATED_DEBIT',tx,tx.fromAccount);
  const targetOld=to.snapshot.revision===tx.toRevision&&
    to.snapshot.total===tx.targetTotal&&
    dstBalance===tx.targetCount;
  const targetMoved=to.snapshot.revision===tx.toRevision+1&&
    to.snapshot.total===tx.targetTotal+tx.count&&
    dstBalance===tx.targetCount+tx.count&&
    receipt(to,'FEDERATED_CREDIT',tx,tx.toAccount);
  if((!sourceOld&&!sourceMoved)||(!targetOld&&!targetMoved)||
     (targetMoved&&!sourceMoved))
    return fail('federated_pending_receipt_or_balance_inconsistent');
  let evidenceState;
  if(sourceOld&&targetOld&&tx.phase==='PREPARED')
    evidenceState='NO_SHARD_WRITE_OBSERVED';
  else if(sourceMoved&&targetOld&&
      ['PREPARED','DEBIT_INSPECTED'].includes(tx.phase))
    evidenceState='SOURCE_DEBIT_ONLY_OBSERVED';
  else if(sourceMoved&&targetMoved)
    evidenceState='BOTH_SHARD_RECEIPTS_BALANCED';
  else return fail('federated_pending_phase_receipt_conflict');
  return {ok:true,status:'FEDERATED_PENDING_READ_ONLY_HOLD',
    phase:tx.phase,evidenceState,operationId:tx.operationId,
    fromAccount:tx.fromAccount,toAccount:tx.toAccount,count:tx.count,
    sourceDebited:sourceMoved,targetCredited:targetMoved,
    observedCombinedTotal:from.snapshot.total+to.snapshot.total,
    beforeCombinedTotal:tx.sourceTotal+tx.targetTotal,
    canWriteWorld:false,canReplay:false,canClearJournal:false,
    hasHardCrashDiskProof:false};
}

/**
 * Read-only selection for a connected pipe network whose Receiver and Bulk
 * accounts live in different immutable seal shards. Only the loaded graph's
 * elected leader shard may own banks. This planner never grants a writer
 * permission, never aliases one physical bank in two ledgers, and never
 * creates a second account store.
 */
export function planUnifiedFederatedNetwork({
    followerSnapshot,leaderSnapshot,receiverOwnerId,leaderOwnerId,
    connectedBankOwnerIds=[],sourceWaiting=false,
    preferredOutputKeys=[],outputEligibleKeys=[]
  }={}){
  const idle=reason=>({ok:true,status:'IDLE',reason,canWriteWorld:false});
  const deny=reason=>({ok:false,status:'HOLD',reason,canWriteWorld:false});
  const first=inspectUnifiedOrdinaryLedger(followerSnapshot);
  const second=inspectUnifiedOrdinaryLedger(leaderSnapshot);
  if(!first.ok||!second.ok)return deny('federated_shard_invalid');
  if(followerSnapshot.worldId!==leaderSnapshot.worldId||
     followerSnapshot.epoch!==leaderSnapshot.epoch||
     !valid(receiverOwnerId)||!valid(leaderOwnerId)||
     receiverOwnerId===leaderOwnerId||
     !Array.isArray(connectedBankOwnerIds)||
     !connectedBankOwnerIds.length||
     connectedBankOwnerIds.some(x=>!valid(x))||
     new Set(connectedBankOwnerIds).size!==connectedBankOwnerIds.length||
     !Array.isArray(preferredOutputKeys)||
     !Array.isArray(outputEligibleKeys)||
     [...preferredOutputKeys,...outputEligibleKeys].some(
       x=>typeof x!=='string'||!x))
    return deny('federated_network_membership_invalid');
  const receiver=followerSnapshot.accounts.find(
    a=>a.id==='receiver:'+receiverOwnerId&&a.kind==='receiver');
  const leader=leaderSnapshot.accounts.find(
    a=>a.id==='receiver:'+leaderOwnerId&&a.kind==='receiver');
  if(!receiver||!leader||followerSnapshot.accounts.some(
       a=>a.kind==='bulk'&&connectedBankOwnerIds.includes(a.ownerId)))
    return deny('federated_receiver_or_bank_shard_ambiguous');
  const members=new Set(connectedBankOwnerIds);
  const banks=leaderSnapshot.accounts.filter(
    a=>a.kind==='bulk'&&members.has(a.ownerId)).sort(
    (a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if(banks.length!==members.size)
    return deny('federated_bank_not_registered_in_leader_shard');
  const controllers=banks.filter(b=>b.role==='controller');
  if(controllers.length!==1||banks.some(
       b=>b.controllerOwnerId!==controllers[0].ownerId))
    return deny('federated_bank_controller_unverified');
  const preferred=new Set(preferredOutputKeys);
  if(receiver.buckets.some(b=>preferred.has(b.key)))
    return idle('preferred_sorter_output_ready');
  if(receiver.total>0&&
     (!sourceWaiting||receiver.total>=receiver.capacity-512)){
    for(const b of receiver.buckets){
      for(const bank of banks){
        const room=bank.capacity-bank.total;
        const count=Math.min(room,b.count,64);
        if(count>0)return {ok:true,status:'TRANSFER_DRAFT_ONLY',
          direction:'receiver_to_bulk',
          from:'receiver:'+receiverOwnerId,to:bank.id,
          key:b.key,count,canWriteWorld:false};
      }
    }
    return idle('all_connected_banks_full');
  }
  // Only verified preferred physical outputs may draw bank balances back
  // into this particular Receiver; Wildcard cannot drain Bulk directly.
  if(receiver.total===0&&!sourceWaiting&&outputEligibleKeys.length){
    const eligible=new Set(outputEligibleKeys);
    for(const bank of banks){
      for(const b of bank.buckets){
        if(!eligible.has(b.key))continue;
        const count=Math.min(b.count,64,receiver.capacity);
        if(count>0)return {ok:true,status:'TRANSFER_DRAFT_ONLY',
          direction:'bulk_to_receiver',from:bank.id,
          to:'receiver:'+receiverOwnerId,
          key:b.key,count,canWriteWorld:false};
      }
    }
  }
  return idle('federated_bank_retains_custody_or_no_route');
}
