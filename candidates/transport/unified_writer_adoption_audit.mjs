/**
 * PG-22 offline adoption audit for a unified Hart-managed movement coordinator.
 *
 * Distinct from the PG-17 overlap model: this checks whether EVERY existing
 * production-era Hart ingress/egress/recovery entry point has actually been
 * placed behind a common coordinator, whether a restart left a pending intent,
 * and whether a newly named op would repeat an already-recorded identity.
 *
 * No runtime hooks. No inventory mutation. No transfer permits. Unverified
 * Bedrock durability or external-writer exclusivity cannot be asserted by JS.
 * Authored independently of the owner's three reference-only modules.
 */
export const CURRENT_ENTRY_POINTS = Object.freeze([
  "SORTER_HOPPER_COMPACTION",
  "SORTER_PHYSICAL_MOVE",
  "COLLECTOR_Q4_INGRESS",
  "ITEM_ENTITY_Q4_INGRESS",
  "RECEIVER_Q4_EGRESS",
  "COLLECTOR_NATIVE_DIRECT",
  "PHYSICAL_JOURNAL_RECOVERY",
  "Q4_JOURNAL_RECOVERY"
]);
export const FUTURE_ENTRY_POINTS = Object.freeze([
  "Q5_ORDINARY_OUTPUT",
  "BULK_RECEIVE",
  "BULK_SEND",
  "BULK_INTERNAL",
  "WORLD_MIGRATION"
]);
export const ALL_ENTRY_POINTS = Object.freeze([...CURRENT_ENTRY_POINTS,...FUTURE_ENTRY_POINTS]);
export const STATE_VALUES = Object.freeze([
  "COORDINATED", "BYPASSES_COORDINATOR", "NOT_IMPLEMENTED", "UNKNOWN"
]);
export const JOURNAL_PHASES = Object.freeze(["PREPARED","PHYSICAL_TOUCHED","RECEIPT_PENDING","COMMITTED","UNREADABLE"]);
const current = new Set(CURRENT_ENTRY_POINTS);
const paths = new Set(ALL_ENTRY_POINTS);
const legalStates = new Set(STATE_VALUES);
const phases = new Set(JOURNAL_PHASES);
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const identity=x=>typeof x==="string"&&/^[a-zA-Z0-9:_./|-]{1,120}$/.test(x)&&!x.includes("..");
const epoch=n=>Number.isSafeInteger(n)&&n>=1;
const guard=Object.freeze({
  mayRunTransfer:false,mayDebitQueue:false,mayDebitBulk:false,
  mayReplay:false,maySettle:false,mayClearJournal:false,
  mayReleaseCapacity:false,mayStartMigration:false,
  mayCertifyDurability:false,mayPromoteToProduction:false
});
const response=(status,reason,detail={})=>Object.freeze({
  status,reason,...detail,...guard
});

/**
 * A caller's claim that its entry point has been integrated is not verified by
 * this function. The result always describes an OFFLINE MODEL state, never a
 * capability token. Never use its output as a branch to perform inventory work.
 */
export function auditUnifiedWriterCensus(input) {
  if(!object(input)||!Array.isArray(input.entries))
    return response("HOLD","missing_complete_entry_point_inventory");
  const entries=input.entries;
  if(entries.length!==paths.size||
     entries.some(e=>!object(e)||!paths.has(e.path)||!legalStates.has(e.state))||
     new Set(entries.map(e=>e.path)).size!==paths.size)
    return response("HOLD","entry_point_census_incomplete_or_invalid");

  const byName=new Map(entries.map(e=>[e.path,e.state]));
  const bypassed=CURRENT_ENTRY_POINTS.filter(name=>byName.get(name)!=="COORDINATED");
  const premature=FUTURE_ENTRY_POINTS.filter(name=>byName.get(name)==="BYPASSES_COORDINATOR");
  const uncertain=FUTURE_ENTRY_POINTS.filter(name=>byName.get(name)==="UNKNOWN");

  if(bypassed.length||premature.length||uncertain.length)
    return response("HOLD","not_all_hart_writers_cooperate",{
      bypassed:Object.freeze([...bypassed,...premature,...uncertain])
    });
  return response("CENSUS_MODEL_ONLY","cooperative_entry_points_claimed_not_engine_attested",{
    integratedCount:entries.filter(e=>e.state==="COORDINATED").length
  });
}

/** Fail closed on unreadable, stale, missing or competing persisted intents. */
export function auditRestartReservation({census,boot,records,retiredIds,claim}={}) {
  const coverage=auditUnifiedWriterCensus(census);
  if(coverage.status!=="CENSUS_MODEL_ONLY")
    return response("HOLD","writer_census_not_proven",{censusReason:coverage.reason});

  if(!object(boot)||!epoch(boot.generation)||!epoch(boot.worldEpoch)||
     boot.scanAllKnownJournals!==true||boot.resumedFromRestart!==true||
     boot.legacyRoutingFrozen!==true)
    return response("HOLD","startup_freeze_or_complete_scan_unverified");

  if(!Array.isArray(records)||!Array.isArray(retiredIds)||
     !retiredIds.every(identity)||new Set(retiredIds).size!==retiredIds.length)
    return response("HOLD","durable_intent_census_unavailable");

  if(records.some(r=>!object(r)||!identity(r.operationId)||
      !paths.has(r.path)||!phases.has(r.phase)||!epoch(r.worldEpoch)))
    return response("HOLD","unknown_or_unreadable_intent");

  if(new Set(records.map(r=>r.operationId)).size!==records.length)
    return response("HOLD","multiple_records_for_one_operation");

  if(records.some(r=>r.worldEpoch!==boot.worldEpoch))
    return response("HOLD","stale_controller_epoch_requires_audit");

  if(records.length)
    return response("HOLD","persisted_or_ambiguous_intent_requires_manual_custody_audit",{
      pending:Object.freeze(records.map(r=>r.operationId))
    });

  if(!object(claim)||!identity(claim.operationId)||!paths.has(claim.path)||
     !epoch(claim.worldEpoch)||claim.worldEpoch!==boot.worldEpoch)
    return response("HOLD","candidate_operation_identity_or_epoch_invalid");

  if(retiredIds.includes(claim.operationId))
    return response("HOLD","operation_id_cannot_be_replayed_after_restart");

  if(census.entries.find(e=>e.path===claim.path)?.state!=="COORDINATED")
    return response("HOLD","proposed_lane_not_integrated");

  // Even if a complete scan and no duplicate are *claimed*, a world-property
  // readback cannot prove save-atomicity with physical player/chest/Hopper data.
  return response("MODEL_IDLE_ONLY","no_hart_conflict_observed_but_physical_custody_not_certified",{
    acknowledgedGeneration:boot.generation,acknowledgedEpoch:boot.worldEpoch
  });
}

/** Enumerate the specific admission gaps of deployed PG20, without a permit. */
export function currentPg20WriterGaps() {
  return Object.freeze(CURRENT_ENTRY_POINTS.map(path=>Object.freeze({
    path,
    integration:"NOT_IN_UNIFIED_RUNTIME_COORDINATOR",
    canTransfer:false
  })));
}
