/**
 * PG-16: ordinary physical custody admission and abrupt-crash outcome explorer.
 *
 * PURE, OFFLINE, CONSERVATIVE MODEL. It never accesses a Minecraft server or
 * issues an inventory mutation. Models multiple possible save orders; DOES NOT
 * claim any individual trace has been reproduced on a particular Bedrock build.
 *
 * Native Container.moveItem and world.setDynamicProperty are separate APIs.
 * A readback of both in one BDS session is not a certified atomic save barrier.
 */
export const CUTS = Object.freeze([
  "BEFORE_INTENT",
  "INTENT_WRITTEN_BEFORE_MOVE",
  "MOVE_RETURNED_BEFORE_SETTLEMENT",
  "SETTLEMENT_WRITTEN"
]);
export const JOURNAL_STATES = Object.freeze([
  "EMPTY", "RESERVED", "HANDOFF_INTENT", "SETTLED"
]);

const exactKey = s => typeof s === "string" &&
    /^[a-zA-Z0-9:|,._/-]{1,160}$/.test(s) &&
    !s.includes("..") && !s.includes("//");
const goodEpoch = n => Number.isSafeInteger(n) && n > 0;
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const deny = (reason, extra={}) => Object.freeze({
  status: "REFUSE", reason,
  canMoveItem: false, canCreditBulk: false, canRetry: false,
  canSettle: false, canReleaseReservation: false,
  canClearJournal: false, ...extra
});
const readonly = (status, reason, extra={}) => Object.freeze({
  status, reason,
  canMoveItem: false, canCreditBulk: false, canRetry: false,
  canSettle: false, canReleaseReservation: false,
  canClearJournal: false, ...extra
});

/**
 * Guard a *proposal*, not grant a runtime capability.
 * All fields, including "engineAttested", are synthetic caller-supplied
 * assertions; a future Bedrock adapter needs independent proof.
 *
 * For known player-accessible vanilla chests, the gate always refuses.
 */
export function evaluateCustodyAdmission(data={}) {
  if (!object(data) || !object(data.tx) ||
      !exactKey(data.tx.txId) || !exactKey(data.tx.networkId) ||
      !exactKey(data.tx.sourceId) || !exactKey(data.tx.destinationId) ||
      data.tx.sourceId===data.tx.destinationId ||
      !goodEpoch(data.tx.epoch) || data.tx.count!==1 ||
      data.tx.itemId!=="minecraft:cobblestone") {
    return deny("invalid_transaction_identity");
  }
  if (!object(data.region) || data.region.networkId!==data.tx.networkId ||
      data.region.epoch!==data.tx.epoch ||
      data.region.fullTopologyKnown!==true ||
      data.region.unknownBoundary!==false ||
      data.region.sameLoadedRegion!==true ||
      data.region.ownerCount!==1 ||
      !exactKey(data.region.controllerId) ||
      data.region.claimedControllerId!==data.region.controllerId) {
    return deny("region_authority_not_established");
  }
  if (!object(data.source) || !object(data.destination) ||
      data.source.id!==data.tx.sourceId ||
      data.destination.id!==data.tx.destinationId ||
      data.source.loaded!==true || data.destination.loaded!==true ||
      data.source.isSingleInventory!==true ||
      data.destination.isSingleInventory!==true ||
      data.source.size!==27 || data.destination.size!==27 ||
      data.source.exactOrdinarySingleItem!==true ||
      data.source.exactlyEmpty!==false ||
      data.destination.exactOrdinarySingleItem!==false ||
      data.destination.exactlyEmpty!==true) {
    return deny("physical_endpoint_snapshot_untrusted");
  }
  if (data.source.typeId==="minecraft:chest" ||
      data.destination.typeId==="minecraft:chest" ||
      data.source.playerWritable!==false ||
      data.destination.playerWritable!==false ||
      data.source.automationWritable!==false ||
      data.destination.automationWritable!==false ||
      data.source.foreignAddonsBlocked!==true ||
      data.destination.foreignAddonsBlocked!==true) {
    return deny("exclusive_physical_custody_not_demonstrated");
  }
  if (!object(data.fence) ||
      data.fence.networkId!==data.tx.networkId ||
      data.fence.epoch!==data.tx.epoch ||
      data.fence.controllerId!==data.region.controllerId ||
      data.fence.compareAndSwapAttested!==true ||
      data.fence.liveAtExecution!==true ||
      data.fence.blocksCompetingWriters!==true) {
    return deny("persistent_fencing_not_demonstrated");
  }
  if (!object(data.persistence) ||
      data.persistence.atomicJournalInventoryCommitAttested!==true ||
      data.persistence.recoversBothEndpointsWithoutSplit!==true ||
      data.persistence.replayProtectionAttested!==true) {
    return deny("cross_domain_crash_commit_not_demonstrated");
  }
  // Even this fully asserted imaginary boundary does NOT authorize executing
  // a transfer. Synthetic booleans can never authenticate engine behavior.
  return readonly("MODEL_PREREQUISITES_ONLY",
    "conditional_assumptions_need_independent_bedrock_proof");
}

/**
 * Conservative possibility space: each chest chunk/record may reflect old or
 * new state after abrupt termination; this is NOT a claim about actual save
 * scheduling in BDS. Enumerating possible persistence gaps is enough to show
 * that no unconditional auto-retry/settle policy has been proved.
 */
export function enumerateCrashOutcomes() {
  const cuts = [
    {
      cut: CUTS[0], journal: ["EMPTY", "RESERVED"],
      a: [1], b: [0], moveCalls: 0
    },
    {
      cut: CUTS[1], journal: ["RESERVED", "HANDOFF_INTENT"],
      a: [1], b: [0], moveCalls: 0
    },
    {
      cut: CUTS[2], journal: ["RESERVED", "HANDOFF_INTENT"],
      a: [0, 1], b: [0, 1], moveCalls: 1
    },
    {
      cut: CUTS[3], journal: ["HANDOFF_INTENT", "SETTLED"],
      a: [0, 1], b: [0, 1], moveCalls: 1
    }
  ];
  const outcomes=[];
  for (const c of cuts) {
    for (const journal of c.journal) {
      for (const sourceCount of c.a) {
        for (const destinationCount of c.b) {
          const total=sourceCount+destinationCount;
          const record={
            cut:c.cut, journal, sourceCount, destinationCount, moveCalls:c.moveCalls,
            conservation:total===1?"MATCHES_ONE":
                         total===0?"MISSING":"DUPLICATE"
          };
          outcomes.push(Object.freeze({
            ...record, recovery: classifyCrashObservation(record)
          }));
        }
      }
    }
  }
  return Object.freeze(outcomes);
}

/**
 * Observations are forensic; all uncertain epochs and INTENT states remain
 * quarantined. Even matching SETTLED + one item lacks authenticated provenance
 * and cross-domain crash commit.
 */
export function classifyCrashObservation(evidence) {
  if (!object(evidence) ||
      !JOURNAL_STATES.includes(evidence.journal) ||
      ![0,1].includes(evidence.sourceCount) ||
      ![0,1].includes(evidence.destinationCount) ||
      !Number.isSafeInteger(evidence.moveCalls) ||
      ![0,1].includes(evidence.moveCalls)) {
    return readonly("HOLD","invalid_or_unloaded_physical_observation");
  }
  const total=evidence.sourceCount+evidence.destinationCount;
  if (total!==1) {
    return readonly("HOLD",
       total===0?"apparent_item_missing_after_crash":
                "apparent_item_duplicate_after_crash");
  }
  if (evidence.journal==="HANDOFF_INTENT") {
    return readonly("HOLD","ambiguous_intent_no_replay");
  }
  if (evidence.journal==="SETTLED" &&
      evidence.sourceCount===0 && evidence.destinationCount===1) {
    return readonly("OBSERVATION_ONLY",
      "settled_and_destination_present_not_proven_unique_custody");
  }
  if (evidence.journal==="EMPTY" || evidence.journal==="RESERVED") {
    return readonly("HOLD","missing_authoritative_intent_or_owner");
  }
  return readonly("HOLD","journal_vs_physical_state_conflict");
}

/**
 * Two distinct physical histories are indistinguishable by an ordinary item
 * type/count and a PG15-style INTENT marker. In history 2 a foreign actor
 * removes the original item and replaces it with an indistinguishable item.
 * The projection deliberately omits non-observable physical token identity.
 */
export function provenanceCollisionWitness() {
  const a={
    history:"native_move_of_original",
    privateOriginalLocation:"B",
    privateDestinationToken:"original",
    observable:{journal:"HANDOFF_INTENT",sourceCount:0,
                destinationCount:1,itemId:"minecraft:cobblestone"}
  };
  const b={
    history:"foreign_removal_plus_identical_replacement",
    privateOriginalLocation:"outside",
    privateDestinationToken:"replacement",
    observable:{journal:"HANDOFF_INTENT",sourceCount:0,
                destinationCount:1,itemId:"minecraft:cobblestone"}
  };
  const indistinguishable=JSON.stringify(a.observable)===
                           JSON.stringify(b.observable);
  return Object.freeze({
    indistinguishable,
    distinctCustody:a.privateOriginalLocation!==b.privateOriginalLocation,
    histories:Object.freeze([Object.freeze(a),Object.freeze(b)]),
    recovery:classifyCrashObservation({
      ...a.observable,moveCalls:1
    })
  });
}

/** Report whether an offline candidate is allowed to claim a stronger result. */
export function evaluateEvidenceClaim({cleanRestart, forcedCrash,
                                        physicalConservation, uniqueProvenance,
                                        externalWriterExclusion,
                                        atomicCommitProof}={}) {
  const clean=cleanRestart===true;
  const blockers=[
    ["forced_crash_unproven",forcedCrash!==true],
    ["physical_conservation_unproven",physicalConservation!==true],
    ["unique_item_provenance_unproven",uniqueProvenance!==true],
    ["external_writers_not_excluded",externalWriterExclusion!==true],
    ["atomic_commit_unproven",atomicCommitProof!==true]
  ].filter(([,needed])=>needed).map(([reason])=>reason);
  return readonly("EVIDENCE_ONLY",
    blockers.length?"additional_guarantees_blocked":"all_assertions_still_need_authentication",
    {cleanRestartObserved:clean, missing: Object.freeze(blockers),
     productionApproved:false});
}
