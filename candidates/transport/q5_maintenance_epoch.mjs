/**
 * Pure Q5 global-maintenance epoch and on-load admission model.
 *
 * OFFLINE ONLY. Nothing in this module is imported by a gameplay pack.
 * This does not write world properties, stop Hart handlers, freeze vanilla
 * Hoppers, authenticate a Bedrock snapshot, or authorize Q4→Q5 cutover.
 * Flags provided by a synthetic caller are modeled assertions, not evidence.
 */
import { REQUIRED_FROZEN_HANDLERS } from './q5_shadow_staging.mjs';

export const Q5_MAINTENANCE_SCHEMA = 'hart-q5-maintenance-model-v1';
export const Q5_MAINTENANCE_HANDLERS = REQUIRED_FROZEN_HANDLERS;
export const Q5_MAINTENANCE_PHASES = Object.freeze([
  'REQUESTED', 'FROZEN', 'STAGING', 'VERIFYING', 'BLOCKED', 'RESUME_PENDING'
]);
export const Q5_BLOCK_PHASES = Object.freeze([
  'PENDING', 'MIGRATING', 'VERIFIED', 'BLOCKED'
]);
const phases = new Set(Q5_MAINTENANCE_PHASES);
const blockPhases = new Set(Q5_BLOCK_PHASES);
const allowedKinds = new Set(['sorter', 'collector', 'receiver', 'transporter', 'bulk', 'controller']);
const positive = v => Number.isSafeInteger(v) && v > 0;
const nonnegative = v => Number.isSafeInteger(v) && v >= 0;
const validName = v => typeof v === 'string' && v.length > 0 && v.length <= 256;

const noAuthority = () => ({
  canRoute: false, canMigrate: false, canResume: false,
  canDebitQ4: false, canWriteQ5: false, canSettle: false,
  canClearJournal: false, canWriteWorld: false
});
const denied = reason => ({ ok: false, status: 'HOLD', reason, ...noAuthority() });

/**
 * A world-wide stop gate is meaningful only if every known Hart transfer,
 * recovery and scheduling entry point checks the same epoch and has no
 * unresolved callback captured before the gate. Unknown handlers HOLD.
 */
function inspectHandlers(handlers, epoch) {
  if (!Array.isArray(handlers) ||
      handlers.length !== Q5_MAINTENANCE_HANDLERS.length) {
    return 'handler_coverage_incomplete';
  }
  const known = new Set(Q5_MAINTENANCE_HANDLERS);
  const seen = new Set();
  for (const handler of handlers) {
    if (!handler || !validName(handler.id) || !known.has(handler.id) ||
        seen.has(handler.id) || handler.gated !== true ||
        handler.checkedEpoch !== epoch ||
        !nonnegative(handler.inFlight) || handler.inFlight !== 0 ||
        handler.rechecksBeforeCommit !== true) {
      return 'handler_coverage_incomplete';
    }
    seen.add(handler.id);
  }
  return null;
}

function inspectBlocks(blocks, epoch) {
  if (!Array.isArray(blocks)) return {reason: 'block_registry_unreadable'};
  const seen = new Set();
  let pending = 0, blocked = 0, migrating = 0, verified = 0;
  for (const b of blocks) {
    if (!b || !validName(b.id) || seen.has(b.id) ||
        !allowedKinds.has(b.kind) || !blockPhases.has(b.phase) ||
        typeof b.loaded !== 'boolean' || !nonnegative(b.observedEpoch)) {
      return {reason: 'invalid_block_registry_entry'};
    }
    seen.add(b.id);
    if (b.observedEpoch > epoch) return {reason: 'future_block_epoch'};
    if (b.phase === 'VERIFIED') {
      if (b.observedEpoch !== epoch || b.loaded !== true ||
          b.identityVerified !== true || b.sourceUnchanged !== true) {
        return {reason: 'unverified_block_claim'};
      }
      verified++;
    } else if (b.phase === 'PENDING') {
      pending++;
    } else if (b.phase === 'MIGRATING') {
      // A restart after migration began must not be interpreted as complete.
      migrating++;
    } else {
      blocked++;
    }
    if (!b.loaded && b.phase !== 'PENDING' && b.phase !== 'BLOCKED') {
      return {reason: 'unloaded_block_cannot_be_active'};
    }
  }
  return {pending, blocked, migrating, verified, total: seen.size};
}

/**
 * Inspect an asserted maintenance barrier. A successful result means only
 * that the supplied *model* is internally consistent. It does NOT certify
 * global freeze or create a real-world permission to stage/migrate.
 */
export function inspectQ5MaintenanceEpoch({
  record, observedWorldEpoch, handlers, blocks,
  registryComplete, journals, externalIngress
} = {}) {
  if (!record || record.schema !== Q5_MAINTENANCE_SCHEMA ||
      !positive(record.epoch) || !phases.has(record.phase) ||
      record.authority !== 'Q4_ONLY' || record.hartRoutingStopped !== true ||
      record.maintenanceClaimPersisted !== true ||
      observedWorldEpoch !== record.epoch) {
    return denied('maintenance_epoch_unverified');
  }
  const coverage = inspectHandlers(handlers, record.epoch);
  if (coverage) return denied(coverage);
  if (registryComplete !== true) return denied('block_registry_not_complete');
  if (!journals || journals.sorterClear !== true ||
      journals.queueClear !== true || journals.physicalClear !== true) {
    return denied('journal_state_not_clear');
  }
  if (!['unknown', 'isolated', 'active'].includes(externalIngress)) {
    return denied('external_ingress_unclassified');
  }
  const census = inspectBlocks(blocks, record.epoch);
  if (census.reason) return denied(census.reason);
  const unresolved = census.pending + census.migrating + census.blocked;
  return {
    ok: true, status: 'MAINTENANCE_MODEL_ONLY', epoch: record.epoch,
    phase: record.phase, census,
    // A modeled witness can say what to inspect next, not that BDS is frozen.
    modelReadyForShadow: record.phase === 'FROZEN' &&
      unresolved === 0 && externalIngress === 'isolated',
    modelReadyForResumeReview: record.phase === 'RESUME_PENDING' &&
      unresolved === 0 && externalIngress === 'isolated',
    ...noAuthority()
  };
}

/**
 * A queued transfer can capture an earlier epoch. Even an otherwise-known
 * handler must be denied on every callback/commit boundary in maintenance.
 */
export function previewQ5MaintenanceOperation({state, handlerId, capturedEpoch, blockId} = {}) {
  const check = inspectQ5MaintenanceEpoch(state);
  if (!check.ok) return check;
  if (!Q5_MAINTENANCE_HANDLERS.includes(handlerId)) {
    return denied('unknown_hart_handler');
  }
  if (!positive(capturedEpoch) || capturedEpoch !== check.epoch) {
    return denied('stale_or_invalid_callback_epoch');
  }
  if (blockId !== undefined && (!validName(blockId) ||
      !state.blocks.some(b => b.id === blockId))) {
    return denied('unregistered_block');
  }
  return {
    ok: true, status: 'OPERATION_BLOCKED_BY_MAINTENANCE',
    handlerId, epoch: check.epoch, ...noAuthority()
  };
}

/**
 * Reappearing/unloaded world blocks are never promoted automatically.
 * Return an inspection request only, not a mutation or routing permit.
 */
export function previewQ5BlockOnLoad({state, blockId, observedEpoch} = {}) {
  const check = inspectQ5MaintenanceEpoch(state);
  if (!check.ok) return check;
  const block = state.blocks.find(b => b.id === blockId);
  if (!block) return denied('unregistered_block');
  if (!positive(observedEpoch) || observedEpoch !== check.epoch) {
    return denied('stale_onload_epoch');
  }
  if (!block.loaded || block.phase !== 'VERIFIED') {
    return {
      ok: true, status: 'PENDING_LOADED_BLOCK_VERIFICATION',
      blockId, epoch: check.epoch, ...noAuthority()
    };
  }
  return {
    ok: true, status: 'VERIFIED_MODEL_OBSERVATION_ONLY',
    blockId, epoch: check.epoch, ...noAuthority()
  };
}

/**
 * Propose a phase change for offline simulation only. Never leave
 * maintenance or choose Q5 authority; blocked migrations stay stopped.
 */
export function previewQ5PhaseTransition({state, targetPhase} = {}) {
  const check = inspectQ5MaintenanceEpoch(state);
  if (!check.ok) return check;
  const transitions = {
    REQUESTED: ['FROZEN', 'BLOCKED'],
    FROZEN: ['STAGING', 'BLOCKED'],
    STAGING: ['VERIFYING', 'BLOCKED'],
    VERIFYING: ['RESUME_PENDING', 'BLOCKED'],
    RESUME_PENDING: ['BLOCKED'],
    BLOCKED: []
  };
  if (!transitions[check.phase].includes(targetPhase)) {
    return denied('illegal_maintenance_transition');
  }
  if (targetPhase === 'STAGING' && !check.modelReadyForShadow) {
    return denied('shadow_prerequisites_unresolved');
  }
  if (targetPhase === 'RESUME_PENDING' &&
      (check.census.pending || check.census.migrating || check.census.blocked ||
       state.externalIngress !== 'isolated')) {
    return denied('resume_prerequisites_unresolved');
  }
  return {
    ok: true, status: 'PHASE_PREVIEW_ONLY', targetPhase,
    proposedRecord: {...state.record, phase: targetPhase},
    ...noAuthority()
  };
}
