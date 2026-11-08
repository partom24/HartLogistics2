import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTODY_DOMAINS, RESTART_TYPES, OWNER_PG20_CRASH_REPORT,
  classifyMixedCrashRecovery
} from "../candidates/transport/crash_origin_reconciliation.mjs";

const blank=()=>Object.fromEntries(CUSTODY_DOMAINS.map(x=>[x,{cobble:0,books:0}]));
function caseData(restartType="ABRUPT"){
  return {
    restartType,autoPlayerReturn:restartType==="ABRUPT",
    expected:{cobble:256,books:1},
    journals:{sorter:"CLEAR",queue:"CLEAR"},
    after:{...blank(), player:{cobble:256,books:1}}
  };
}
function noActions(r){
  assert.equal(r.status,"EVIDENCE_ONLY");
  for(const key of ["canTransfer","canRetry","canSettle","canClearJournal",
                    "canCreateItem","canReleaseCapacity","productionApproved"])
    assert.equal(r[key],false,key+" must never authorize a mutation");
}
test("owner's true auto-return report remains INDETERMINATE while test Receiver Q4 and chest are unexamined",()=>{
  const r=classifyMixedCrashRecovery(OWNER_PG20_CRASH_REPORT);
  assert.equal(r.verdict,"INDETERMINATE");
  assert.equal(r.reason,"full_player_chest_hopper_receiver_q4_snapshot_unobserved");
  noActions(r);
});
test("complete inspected player restoration is only CONSISTENT rollback, never custody recovery",()=>{
  const r=classifyMixedCrashRecovery(caseData());
  assert.equal(r.verdict,"ROLLBACK_CONSISTENT");
  assert.match(r.reason,/not_crash_atomic/);
  assert.deepEqual(r.totals,{cobble:256,books:1});
  noActions(r);
});
test("the same visible player inventory with an unseen Q4 is not safe to declare duplication-free",()=>{
  const d=caseData();d.after.receiverQ4=null;
  const r=classifyMixedCrashRecovery(d);
  assert.equal(r.verdict,"INDETERMINATE");noActions(r);
});
test("book returned to player plus extra queued copy is detected as apparent duplication",()=>{
  const d=caseData();d.after.receiverQ4={cobble:0,books:1};
  const r=classifyMixedCrashRecovery(d);
  assert.equal(r.verdict,"HOLD");
  assert.equal(r.reason,"apparent_duplicate_across_persistence_domains");
  noActions(r);
});
test("four stacks in player plus an additional physical input stack is a HOLD",()=>{
  const d=caseData();d.after.inputHopper={cobble:64,books:0};
  assert.equal(classifyMixedCrashRecovery(d).reason,
               "apparent_duplicate_across_persistence_domains");
});
test("not finding all cobble in the five full domains is a HOLD, not an invented repair",()=>{
  const d=caseData();d.after.player={cobble:192,books:1};
  const r=classifyMixedCrashRecovery(d);
  assert.equal(r.reason,"apparent_missing_item_across_persistence_domains");noActions(r);
});
test("source, output and Q4 split quantities conserve count without proving exclusive provenance",()=>{
  const d=caseData();d.autoPlayerReturn=false;
  d.after.player={cobble:0,books:0};
  d.after.inputHopper={cobble:64,books:0};
  d.after.outputHopper={cobble:128,books:1};
  d.after.receiverQ4={cobble:64,books:0};
  const r=classifyMixedCrashRecovery(d);
  assert.equal(r.verdict,"ACCOUNTED_BUT_UNPROVEN");noActions(r);
});
test("after normal restart all cargo in output is observable delivery, not hard-crash proof",()=>{
  const d=caseData("NORMAL");d.autoPlayerReturn=false;
  d.after.player={cobble:0,books:0};
  d.after.outputHopper={cobble:256,books:1};
  const r=classifyMixedCrashRecovery(d);
  assert.equal(r.verdict,"DELIVERY_CONSISTENT");noActions(r);
});
test("HOLD on either outstanding physical or Q4 journal, even with inventory apparently conserved",()=>{
  for(const k of ["sorter","queue"]){
    const d=caseData();d.journals[k]="PENDING";
    const r=classifyMixedCrashRecovery(d);
    assert.equal(r.verdict,"HOLD");noActions(r);
  }
});
test("unknown journal cannot be mistaken for clear by empty physical slots",()=>{
  for(const k of ["sorter","queue"]){
    const d=caseData();d.journals[k]="UNKNOWN";
    const r=classifyMixedCrashRecovery(d);
    assert.equal(r.verdict,"INDETERMINATE");noActions(r);
  }
});
test("book mismatch is HOLD even when every item count balances",()=>{
  const d=caseData();d.visibleBookMismatch=true;
  const r=classifyMixedCrashRecovery(d);
  assert.equal(r.reason,"visible_book_metadata_mismatch");noActions(r);
});
test("matching counts and unobserved opaque metadata never prove book fidelity",()=>{
  const d=caseData();d.visibleBookMismatch=false;
  const r=classifyMixedCrashRecovery(d);
  assert.equal(r.verdict,"ROLLBACK_CONSISTENT");
  assert.equal(r.productionApproved,false);noActions(r);
});
test("automatic return needs explicit affirmative owner provenance for this classification",()=>{
  for(const v of [false,null]){
    const d=caseData();d.autoPlayerReturn=v;
    const r=classifyMixedCrashRecovery(d);
    assert.equal(r.verdict,"ACCOUNTED_BUT_UNPROVEN");noActions(r);
  }
});
test("normal restart never classified as abrupt rollback even if player contains items",()=>{
  const d=caseData("NORMAL");d.autoPlayerReturn=true;
  const r=classifyMixedCrashRecovery(d);
  assert.equal(r.verdict,"ACCOUNTED_BUT_UNPROVEN");noActions(r);
});
test("invalid input and absent Receiver Q4 never accidentally become zeros",()=>{
  const cases=[null,undefined,{},[],false,{...caseData(),restartType:"POWERFAIL"},
    {...caseData(),after:null},{...caseData(),after:{...blank(),receiverQ4:{}}},
    {...caseData(),after:{...blank(),feedChest:{cobble:-1,books:0}}},
    {...caseData(),journals:null},{...caseData(),expected:{cobble:NaN,books:1}},
    {...caseData(),autoPlayerReturn:undefined}];
  for(const data of cases){
    const r=classifyMixedCrashRecovery(data);
    assert.equal(r.verdict,"INDETERMINATE",JSON.stringify(data));
    noActions(r);
  }
});
test("unobserved or extra book is neither erased nor manufactured",()=>{
  const d=caseData();d.after.player.books=0;
  const r=classifyMixedCrashRecovery(d);
  assert.equal(r.verdict,"HOLD");noActions(r);
});
test("repeated assessments are deterministic and have no stateful auto-settlement",()=>{
  const d=caseData();const original=structuredClone(d);
  for(let i=0;i<20;i++){
    const r=classifyMixedCrashRecovery(d);
    assert.equal(r.verdict,"ROLLBACK_CONSISTENT");noActions(r);
    assert.equal(Object.isFrozen(r),true);
  }
  assert.deepEqual(d,original);
});
test("domain enumeration includes player, physical chest/hoppers and Receiver Q4",()=>{
  assert.deepEqual(CUSTODY_DOMAINS,
    ["player","feedChest","inputHopper","outputHopper","receiverQ4"]);
  assert.deepEqual(RESTART_TYPES,["ABRUPT","NORMAL"]);
});
