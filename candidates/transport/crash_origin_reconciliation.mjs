/**
 * PG-21 OFFLINE custody accounting: distinguish an observed earlier-save rollback
 * from an actual crash-atomic Hart handoff. This is NOT runtime recovery code.
 *
 * A player's inventory, chest/Hopper inventories, Receiver Q4 and world-property
 * journals may be saved in different domains. This model never repairs a world,
 * reconstructs an ItemStack, settles a journal or issues a transfer permit.
 */
export const CUSTODY_DOMAINS = Object.freeze([
  "player", "feedChest", "inputHopper", "outputHopper", "receiverQ4"
]);
export const RESTART_TYPES = Object.freeze(["ABRUPT", "NORMAL"]);
export const JOURNAL_OBSERVATIONS = Object.freeze(["CLEAR", "PENDING", "UNKNOWN"]);
const isRecord = v => v !== null && typeof v === "object" && !Array.isArray(v);
const amount = n => Number.isSafeInteger(n) && n >= 0 && n <= 200000;
const noPermission = (verdict, reason, observed={}) => Object.freeze({
  status: "EVIDENCE_ONLY",
  verdict, reason,
  ...observed,
  canTransfer: false,
  canRetry: false,
  canSettle: false,
  canClearJournal: false,
  canCreateItem: false,
  canReleaseCapacity: false,
  productionApproved: false,
});
const unavailable = reason => noPermission("INDETERMINATE",reason);

function fullSnapshot(s) {
  if (!isRecord(s)) return undefined;
  const result={};
  for (const name of CUSTODY_DOMAINS) {
    const location=s[name];
    if (!isRecord(location) || !amount(location.cobble) ||
        !amount(location.books)) return undefined;
    result[name]={cobble:location.cobble, books:location.books};
  }
  return result;
}

/**
 * All user-provided flags are untrusted observations; they can classify a
 * screenshot/report, not grant a live Bedrock capability. Unknown Q4 is NOT 0.
 * A fully summed inventory is still not an authenticated token identity.
 */
export function classifyMixedCrashRecovery(data) {
  if (!isRecord(data) ||
      !RESTART_TYPES.includes(data.restartType) ||
      ![true,false,null].includes(data.autoPlayerReturn) ||
      !isRecord(data.expected) ||
      !amount(data.expected.cobble) || !amount(data.expected.books) ||
      data.expected.cobble===0 && data.expected.books===0) {
    return unavailable("invalid_or_missing_test_identity");
  }
  if (!isRecord(data.journals) ||
      !JOURNAL_OBSERVATIONS.includes(data.journals.sorter) ||
      !JOURNAL_OBSERVATIONS.includes(data.journals.queue)) {
    return unavailable("journal_observation_missing");
  }
  if (data.journals.sorter==="PENDING" || data.journals.queue==="PENDING") {
    return noPermission("HOLD","unresolved_journal_preserve_physical_state");
  }
  if (data.journals.sorter!=="CLEAR" || data.journals.queue!=="CLEAR") {
    return unavailable("one_or_more_journals_unobserved");
  }
  const snapshot=fullSnapshot(data.after);
  if (!snapshot) return unavailable("full_player_chest_hopper_receiver_q4_snapshot_unobserved");
  const totals={cobble:0, books:0};
  for(const location of Object.values(snapshot)) {
    totals.cobble+=location.cobble;
    totals.books+=location.books;
  }
  if (!amount(totals.cobble) || !amount(totals.books)) {
    return unavailable("aggregate_count_overflow");
  }
  if (totals.cobble>data.expected.cobble ||
      totals.books>data.expected.books) {
    return noPermission("HOLD","apparent_duplicate_across_persistence_domains",
                        {totals:Object.freeze(totals)});
  }
  if (totals.cobble<data.expected.cobble ||
      totals.books<data.expected.books) {
    return noPermission("HOLD","apparent_missing_item_across_persistence_domains",
                        {totals:Object.freeze(totals)});
  }
  if (data.visibleBookMismatch===true) {
    return noPermission("HOLD","visible_book_metadata_mismatch",
                        {totals:Object.freeze(totals)});
  }
  const player=snapshot.player;
  if (data.restartType==="ABRUPT" &&
      data.autoPlayerReturn===true &&
      player.cobble===data.expected.cobble &&
      player.books===data.expected.books) {
    return noPermission("ROLLBACK_CONSISTENT",
      "player_state_restored_before_staging_is_plausible_not_crash_atomic",
      {totals:Object.freeze(totals)});
  }
  const output=snapshot.outputHopper;
  if (data.restartType==="NORMAL" &&
      output.cobble===data.expected.cobble &&
      output.books===data.expected.books) {
    return noPermission("DELIVERY_CONSISTENT",
      "normal_restart_retention_is_not_abrupt_atomicity",
      {totals:Object.freeze(totals)});
  }
  return noPermission("ACCOUNTED_BUT_UNPROVEN",
    "count_conservation_does_not_authenticate_custody_or_saved_order",
    {totals:Object.freeze(totals)});
}

/** Owner's actual 2026-11-07 forced-kill evidence, deliberately incomplete. */
export const OWNER_PG20_CRASH_REPORT = Object.freeze({
  restartType:"ABRUPT", autoPlayerReturn:true,
  expected:Object.freeze({cobble:256,books:1}),
  journals:Object.freeze({sorter:"CLEAR",queue:"CLEAR"}),
  after:Object.freeze({
    player:Object.freeze({cobble:256,books:1}),
    feedChest:null,
    inputHopper:Object.freeze({cobble:0,books:0}),
    outputHopper:Object.freeze({cobble:0,books:0}),
    receiverQ4:null
  })
});
