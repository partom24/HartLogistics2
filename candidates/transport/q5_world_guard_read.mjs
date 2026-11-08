/**
 * Offline source-shaped Q5 global maintenance marker reader / admission model.
 *
 * This module does NOT load into Minecraft. Its two raw property reads are not
 * an atomic disk snapshot; no result grants gameplay execution or migration.
 * A future runtime hook must check at every source, asynchronous callback and
 * pre-commit boundary while excluding vanilla/foreign writer interference.
 */
import { REQUIRED_FROZEN_HANDLERS } from './q5_shadow_staging.mjs';

export const Q5_GUARD_MARKER_KEY = 'hartlogistics:q5_maintenance_marker_v1';
export const Q5_GUARD_HISTORY_KEY = 'hartlogistics:q5_maintenance_history_v1';
export const Q5_GUARD_MARKER_SCHEMA = 'hl-q5-maintenance-marker-v1';
export const Q5_GUARD_HISTORY_SCHEMA = 'hl-q5-maintenance-history-v1';

const PHASES = new Set(['LEGACY', 'REQUESTED', 'FROZEN', 'STAGING',
  'VERIFYING', 'RESUME_PENDING', 'BLOCKED']);
const safeInt = n => Number.isSafeInteger(n) && n >= 0;
const name = s => typeof s === 'string' && s.length > 0 && s.length <= 256;
const deny = reason => ({
  ok: false, status: 'HOLD', reason, wouldPermitLegacy: false,
  canRoute: false, canMigrate: false, canResume: false,
  canDebitQ4: false, canWriteQ5: false, canWriteWorld: false,
  canClearJournal: false
});

function parse(raw, expectedSchema) {
  if (typeof raw !== 'string' || !raw.length || raw.length > 8192) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v) ||
        v.schema !== expectedSchema) return null;
    return v;
  } catch (_) { return null; }
}

function twoReads(world) {
  if (!world || typeof world.getDynamicProperty !== 'function') {
    return deny('read_interface_unavailable');
  }
  let first, second;
  try {
    first = [
      world.getDynamicProperty(Q5_GUARD_MARKER_KEY),
      world.getDynamicProperty(Q5_GUARD_HISTORY_KEY)
    ];
    second = [
      world.getDynamicProperty(Q5_GUARD_MARKER_KEY),
      world.getDynamicProperty(Q5_GUARD_HISTORY_KEY)
    ];
  } catch (_) { return deny('maintenance_marker_read_failed'); }
  if (first[0] !== second[0] || first[1] !== second[1]) {
    return deny('maintenance_marker_changed_during_read');
  }
  if (first[0] === undefined && first[1] === undefined) {
    return deny('maintenance_marker_not_bootstrapped');
  }
  if (first[0] === undefined || first[1] === undefined) {
    return deny('partial_maintenance_marker');
  }
  const marker = parse(first[0], Q5_GUARD_MARKER_SCHEMA);
  const history = parse(first[1], Q5_GUARD_HISTORY_SCHEMA);
  if (!marker || !history) return deny('invalid_maintenance_marker');
  return {ok:true,marker,history};
}

/**
 * Require BOTH persistent records in the same model epoch. No "missing means
 * normal operation" default once a Q5-aware upgrade is considered.
 */
export function inspectQ5MaintenanceMarker({world, worldId}={}) {
  if (!name(worldId)) return deny('unknown_world_identity');
  const pair = twoReads(world);
  if (!pair.ok) return pair;
  const {marker,history} = pair;
  if (!name(marker.worldId) || marker.worldId !== worldId ||
      history.worldId !== worldId ||
      !safeInt(marker.epoch) || !safeInt(history.highestEpoch) ||
      !safeInt(marker.revision) || !safeInt(history.revision) ||
      !PHASES.has(marker.phase) ||
      marker.authority !== 'Q4_ONLY' ||
      typeof history.everEntered !== 'boolean' ||
      history.revision > marker.revision ||
      history.highestEpoch < marker.epoch) {
    return deny('inconsistent_maintenance_marker');
  }
  if (marker.phase === 'LEGACY') {
    // An attempted return to old Q4 routing after ANY migration epoch is a
    // dangerous silent rollback, even if the current marker appears "clean".
    if (marker.epoch !== 0 || history.highestEpoch !== 0 ||
        history.everEntered !== false) return deny('unsafe_legacy_resumption');
    return {
      ok:true,status:'LEGACY_MODEL_READ_ONLY',epoch:0,
      wouldPermitLegacy:true,
      canRoute:false,canMigrate:false,canResume:false,
      canDebitQ4:false,canWriteQ5:false,canWriteWorld:false,
      canClearJournal:false
    };
  }
  if (marker.epoch === 0 || history.everEntered !== true) {
    return deny('missing_maintenance_history');
  }
  return {
    ok:true,status:'MAINTENANCE_STOP_MODEL_ONLY',
    epoch:marker.epoch,phase:marker.phase,
    wouldPermitLegacy:false,
    canRoute:false,canMigrate:false,canResume:false,
    canDebitQ4:false,canWriteQ5:false,canWriteWorld:false,
    canClearJournal:false
  };
}

/**
 * Synthetic admission re-check before a queued transfer's mutation. Never
 * accept an old captured epoch, unknown handler or any maintenance phase.
 * A LEGACY proposal is not a live permission: the gameplay integrator must
 * independently install and validate all source-level guard seams.
 */
export function previewQ5GuardedHandler({world,worldId,handlerId,capturedEpoch}={}) {
  const marker = inspectQ5MaintenanceMarker({world,worldId});
  if (!marker.ok) return marker;
  if (!REQUIRED_FROZEN_HANDLERS.includes(handlerId)) {
    return deny('unregistered_hart_handler');
  }
  if (!safeInt(capturedEpoch) || capturedEpoch !== marker.epoch) {
    return deny('stale_handler_epoch');
  }
  return {
    ...marker,
    status:marker.status === 'LEGACY_MODEL_READ_ONLY'
      ? 'LEGACY_ADMISSION_PREVIEW_ONLY' : 'HANDLER_STOPPED_BY_MAINTENANCE',
    // NEVER set a real transfer/debit/write permission.
    canRoute:false,canDebitQ4:false,canWriteQ5:false,canWriteWorld:false
  };
}
