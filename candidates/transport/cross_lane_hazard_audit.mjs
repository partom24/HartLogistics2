/**
 * PG-17 ORIGINAL: purely diagnostic cross-lane hazard auditor.
 *
 * Nothing here is a scheduler, runtime lock, Bedrock adapter, journal writer,
 * inventory-transfer implementation, or production admission capability.
 * It deliberately cannot return permission to mutate. This code was written
 * independently from the three owner-supplied reference-only *.mjs files.
 */
export const ROUTES = Object.freeze([
  "LEGACY_Q4", "NATIVE_DIRECT", "Q5_OUTPUT",
  "BULK_DEPOSIT", "BULK_WITHDRAW", "BULK_INTERNAL"
]);
export const PHASES = Object.freeze([
  "PREPARED", "NATIVE_TOUCHED", "RECEIPT_PENDING", "COMMITTED"
]);

const routenames = new Set(ROUTES);
const phases = new Set(PHASES);
const keyed = s => typeof s==="string" && /^[a-zA-Z0-9:|,._/-]{1,120}$/.test(s) &&
                         !s.includes("..") && !s.includes("//");
const positive = n => Number.isSafeInteger(n) && n>0;
const obj = v => v!==null && typeof v==="object" && !Array.isArray(v);
const uniqueSorted = xs => Object.freeze([...new Set(xs)].sort());
const FORBIDDEN=Object.freeze({
  canMoveItems:false,canDebitQueue:false,canCreditDestination:false,
  canCreditBulk:false,canReplay:false,canSettle:false,
  canReleaseReservation:false,canClearJournal:false,
  productionAuthorized:false
});
const report=(status,reason,details={})=>
  Object.freeze({...details,status,reason,...FORBIDDEN});

/** Describes an already observed transaction; no caller-provided permission flag. */
export function validateObservedLeg(leg){
  if(!obj(leg) || !keyed(leg.operation) || !keyed(leg.writer) ||
     !keyed(leg.network) || !keyed(leg.source) || !keyed(leg.destination) ||
     !keyed(leg.journal) || !routenames.has(leg.route) ||
     !phases.has(leg.phase) || !positive(leg.epoch) ||
     leg.source===leg.destination) {
    return report("INVALID","invalid_or_incomplete_leg");
  }
  return report("OBSERVATION_ONLY","syntactically_valid_untrusted_claim");
}

/** Two in-flight legs ALWAYS violate the proposed global one-leg contract.
 * Extra collision reasons make cross-lane conflicts explainable without
 * granting an uncontended operation permission to write.
 */
export function explainOverlap(a,b){
  if(validateObservedLeg(a).status==="INVALID" ||
     validateObservedLeg(b).status==="INVALID") {
    return report("INVALID","invalid_overlap_input",{flags:Object.freeze([])});
  }
  const flags=["COOPERATIVE_GLOBAL_WRITER_COLLISION"];
  const first=new Set([a.source,a.destination]);
  if(first.has(b.source)||first.has(b.destination)){
    flags.push("SAME_PHYSICAL_ENDPOINT");
  }
  if(a.writer===b.writer)flags.push("SAME_WRITER_ID");
  if(a.journal===b.journal)flags.push("SAME_JOURNAL_KEY");
  if(a.network===b.network && a.epoch!==b.epoch)flags.push("MIXED_NETWORK_EPOCH");
  if(a.network!==b.network)flags.push("CROSS_NETWORK_IN_FLIGHT");
  if(a.route!==b.route)flags.push("CROSS_LANE_IN_FLIGHT");
  return report("HOLD","multiple_inflight_legs",
                {flags:uniqueSorted(flags)});
}

/** Read-only forensic audit over all concurrent in-flight claims.
 * A missing observation is not an empty observation.
 */
export function auditObservedConcurrency(input={}){
  const {legs,pendingMarkers,scanComplete}=obj(input)?input:{};
  if(scanComplete!==true || !Array.isArray(legs) ||
     !Array.isArray(pendingMarkers)) {
    return report("HOLD","incomplete_global_writer_inventory");
  }
  if(legs.some(x=>validateObservedLeg(x).status==="INVALID")) {
    return report("HOLD","invalid_observed_leg");
  }
  const opIds=legs.map(x=>x.operation);
  if(new Set(opIds).size!==opIds.length) {
    return report("HOLD","duplicate_observed_operation");
  }
  if(pendingMarkers.some(x=>!obj(x) || !keyed(x.id) ||
                                  !keyed(x.owner) ||
                                  !["PREPARED","MOVED","COMMITTED","UNREADABLE"].includes(x.phase))) {
    return report("HOLD","invalid_or_unreadable_pending_marker");
  }
  if(new Set(pendingMarkers.map(x=>x.id)).size!==pendingMarkers.length) {
    return report("HOLD","duplicate_pending_marker");
  }
  const overlaps=[];
  for(let i=0;i<legs.length;i++){
    for(let j=i+1;j<legs.length;j++){
      const comparison=explainOverlap(legs[i],legs[j]);
      overlaps.push(Object.freeze({
        pair:Object.freeze([legs[i].operation,legs[j].operation]),
        flags:comparison.flags
      }));
    }
  }
  if(overlaps.length){
    return report("HOLD","inflight_global_writer_conflict",
      {overlaps:Object.freeze(overlaps)});
  }
  if(legs.length===1 || pendingMarkers.length){
    const unsettled=pendingMarkers.filter(x=>x.phase!=="COMMITTED");
    return report("HOLD",unsettled.length ?
      "unresolved_journal_no_replay" : "inflight_or_committed_still_requires_operator_proof",
      {pendingCount:pendingMarkers.length,liveCount:legs.length});
  }
  return report("MODEL_IDLE_ONLY","zero_cooperative_legs_reported",
    {pendingCount:0,liveCount:0});
}

/** This is route *design* feasibility, not an execution request.
 * Native moveItem can be studied for an entire ItemStack to an empty slot.
 * A plain "identical" destination stack does not certify a multi-write merge.
 */
export function reviewRouteDesign(input={}){
  const {route,shape,sourceItem,destinationEmpty,
         hasIndependentPhysicalCustody}=obj(input)?input:{};
  if(!routenames.has(route)){
    return report("HOLD","unknown_route");
  }
  if(route==="LEGACY_Q4"){
    return report("EXISTING_SCOPE_ONLY","protected_existing_q4_path_not_reauthorized");
  }
  if(route==="NATIVE_DIRECT"){
    if(shape!=="WHOLE_STACK_NATIVE_MOVE") {
      return report("HOLD","partial_merge_or_reconstruction_not_proved");
    }
    if(!obj(sourceItem) || !keyed(sourceItem.typeId) ||
       !positive(sourceItem.amount) ||
       !["PLAIN","METADATA_BEARING","UNINSPECTABLE"].includes(sourceItem.classification) ||
       destinationEmpty!==true) {
      return report("HOLD","native_transfer_input_incomplete");
    }
    if(hasIndependentPhysicalCustody!==true) {
      return report("HOLD","native_item_identity_does_not_exclude_external_writers");
    }
    // A caller-supplied assertion of custody is *not* proof; never grants
    // a runtime move, settle, debit or credit, even under perfect assumptions.
    return report("MODEL_DESIGN_ONLY",
       "whole_stack_native_move_design_requires_authenticated_runtime_boundary");
  }
  if(route==="Q5_OUTPUT") {
    return report("HOLD","virtual_debit_and_physical_credit_not_atomic");
  }
  return report("HOLD","bulk_storage_spendable_custody_unproven");
}

/** No future adapter may infer that a receipt merely *looking* settled
 * implies authority to delete an intent or move any item.
 */
export function inspectInterruptedPath(input={}){
  const {phase,sourceBefore,destinationAfter,
         queueAfter,receiptPersisted}=obj(input)?input:{};
  if(!["BEFORE_MOVE","AFTER_PHYSICAL_MOVE","AFTER_LOGICAL_DEBIT",
       "AFTER_RECEIPT"].includes(phase)){
    return report("HOLD","unknown_interruption_window");
  }
  if(!["EMPTY","ONE","UNREADABLE"].includes(sourceBefore) ||
     !["EMPTY","ONE","UNREADABLE"].includes(destinationAfter) ||
     !["UNCHANGED","DEBITED","UNREADABLE"].includes(queueAfter) ||
     ![true,false,"UNKNOWN"].includes(receiptPersisted)){
    return report("HOLD","untrusted_interrupted_observation");
  }
  return report("HOLD",
    phase==="AFTER_RECEIPT" && receiptPersisted===true ?
    "receipt_not_exclusive_cross_domain_durability_proof" :
    "mixed_persistence_domains_intent_requires_operator_audit");
}
