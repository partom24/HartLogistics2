/**
 * URCE U2 — PURE custody intent and reconciliation decision model.
 *
 * This module NEVER reads or writes a Bedrock world or inventory. The caller
 * must provide *proven, current* native admission and custody observations.
 * Neither a route plan nor a caller-supplied receipt is itself physical proof.
 *
 * It describes one legal writer boundary; it is NOT a durable implementation
 * and does not replace the existing exact 1.4.2 Q4/physical journals.
 */
const OWNERS=new Set(["hopper","sorter","collector","receiver","bulk","native_carrier"]);
const IDENTITIES=new Set(["ordinary","mr"]);
const PHASES=new Set(["PREPARED","DEBIT_RECORDED","CREDIT_RECORDED","COMMITTED"]);

function finiteCount(x){return Number.isSafeInteger(x)&&x>=0;}
function knownName(x){return typeof x==="string"&&x.length>0;}

/**
 * Accept only evidence that a writer is actually capable of proving,
 * not guessed remote capacity or speculative arrival at a pipe position.
 *
 * The identityRef is opaque: MR carries a native ItemStack reference ONLY
 * within the current synchronous endpoint operation; it is not serialized
 * into a dynamic property. For ordinary cargo, the identityRef is a
 * previously losslessly verified identity key, not just a type-ID whitelist.
 */
export function proposeCustodyIntent({
  transactionId, source, target, identityKind, identityRef, quantity,
  sourceCount, availableCapacity, routeVerified, nativeAdmissionVerified,
  sourceLoaded, targetLoaded, sourceAuthorityVerified, targetAuthorityVerified,
  nativeItemOriginalPresent, existingJournal
}) {
  const hold=reason=>({decision:"HOLD",reason});
  if(!knownName(transactionId)||!source||!target||
    !knownName(source.id)||!knownName(target.id)||
    !OWNERS.has(source.kind)||!OWNERS.has(target.kind)||
    source.id===target.id||!IDENTITIES.has(identityKind)||
    !knownName(identityRef)||!finiteCount(quantity)||quantity===0||
    !finiteCount(sourceCount)||!finiteCount(availableCapacity))return hold("invalid_intent");
  if(existingJournal !== null && existingJournal !== undefined)
    return hold("pending_journal");
  if(routeVerified!==true) return hold("route_unverified");
  if(sourceLoaded!==true||targetLoaded!==true) return hold("endpoint_unloaded");
  if(sourceAuthorityVerified!==true||targetAuthorityVerified!==true)
    return hold("custody_authority_unverified");
  if(nativeAdmissionVerified!==true) return hold("native_admission_unverified");
  if(quantity>sourceCount || quantity>availableCapacity) return hold("insufficient_verified_quantity");
  if(identityKind==="mr") {
    // An ordinary counted-Bulk or counted Q4 balance cannot own an MR stack.
    if(source.kind==="bulk"||target.kind==="bulk")return hold("mr_cannot_enter_counted_bulk");
    if(nativeItemOriginalPresent!==true)return hold("original_native_item_required");
    if(quantity!==1)return hold("mr_requires_whole_native_stack_handoff");
  }
  return {decision:"PLAN_ONLY",reason:"requires_durable_prepare",
    intent:Object.freeze({transactionId,
      source:{id:source.id,kind:source.kind},
      target:{id:target.id,kind:target.kind},
      identityKind, identityRef, quantity,
      // Never grant physical writer permission from this read-only model.
      executePermitted:false,
      replayPermitted:false,
      autoCommitPermitted:false})};
}

/**
 * Any pending or contradictory physical/durable observation is a HOLD.
 * The same native count may have been supplied by a foreign Hopper/player;
 * it cannot by itself certify the original item's provenance.
 *
 * A live implementation must independently prove exact native ownership,
 * journals, Q4 authority and external writer fencing, then use a separate
 * durable writer. This function cannot settle or replay cargo.
 */
export function classifyCustodyRecovery({intent,phase,sourceObserved,targetObserved,
  exclusiveNativeOwnership,sourceReceipt,targetReceipt,journalReadable}) {
  const hold=(reason)=>({status:"HOLD",reason,
    retryPermitted:false,settlePermitted:false,creditPermitted:false});
  if(!intent||intent.executePermitted!==false||!PHASES.has(phase))
    return hold("invalid_or_untrusted_intent");
  if(journalReadable!==true)return hold("unreadable_or_missing_journal");
  if(exclusiveNativeOwnership!==true)return hold("foreign_writer_possible");
  if(!sourceObserved||!targetObserved||
     sourceObserved.loaded!==true||targetObserved.loaded!==true)
    return hold("custodian_unavailable");
  if(sourceReceipt?.authenticated!==true || targetReceipt?.authenticated!==true)
    return hold("missing_exact_receipt");
  if(sourceReceipt.transactionId!==intent.transactionId||
     targetReceipt.transactionId!==intent.transactionId)
    return hold("receipt_identity_mismatch");
  // Even matching receipts are not documented as crash-atomic across
  // multiple world properties and native item storage. This decision model
  // never pretends otherwise.
  return hold(phase==="COMMITTED"?"needs_live_physical_reconciliation":
    "ambiguous_interrupted_transfer");
}

/** Pure arithmetic counterfactual, NOT a Bedrock tick/CPU benchmark. */
export function densityCounterfactual(items,batchLimit) {
  if(!finiteCount(items)||!Number.isSafeInteger(batchLimit)||batchLimit<=0)
    return {status:"INVALID"};
  const transactions=Math.ceil(items/batchLimit);
  return {status:"MODEL_ONLY",items,transactions,
    // safeMovePartial: prepare, source write, destination write, clear
    modeledPhysicalInventoryWrites:transactions*2,
    modeledJournalPropertyWrites:transactions*2,
    // This is NOT proof that one native slot can admit the whole batch.
    nativeCapacityUnverified:true};
}
