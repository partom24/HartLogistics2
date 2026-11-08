/**
 * OFFLINE ONLY: single-use, per-session pre-commit marker fence model.
 *
 * This is a source-shaped prototype of the missing PG27-to-Q5 maintenance
 * boundary, NOT a Bedrock runtime hook. No world writes, callbacks, transfers,
 * queue mutation, journal settlement, real write permission, or cutover.
 *
 * A token is created only after reading a *previously bootstrapped* pair of
 * Q5 maintenance marker/history records. Its precommit check must re-read
 * the full pair, reject all maintenance phases, require the same raw bytes,
 * and consume the token on every attempt. This catches ordinary observable
 * callback drift, marker revision changes, restart, and replay in mocked
 * synchronous execution. It CANNOT detect an ABA (changed-then-restored)
 * history, unobserved vanilla/foreign mutations, or establish crash atomicity.
 */
import {
  inspectQ5MaintenanceMarker,
  Q5_GUARD_MARKER_KEY, Q5_GUARD_HISTORY_KEY
} from './q5_world_guard_read.mjs';
import { REQUIRED_FROZEN_HANDLERS } from './q5_shadow_staging.mjs';

export const Q5_LEGACY_FENCE_SITES = Object.freeze([
  'physical_inventory_move',
  'item_entity_remove',
  'q4_queue_append',
  'q4_queue_debit',
  'journal_write',
  'journal_recovery',
  'registry_or_frame_mutation'
]);
const allowedSites = new Set(Q5_LEGACY_FENCE_SITES);
const allowedHandlers = new Set(REQUIRED_FROZEN_HANDLERS);
const valid = s => typeof s === 'string' && s.length > 0 && s.length <= 256;
const deny = reason => ({
  ok:false, status:'HOLD', reason, wouldPassLegacyFence:false,
  canRoute:false, canMigrate:false, canResume:false, canDebitQ4:false,
  canWriteQ5:false, canWriteWorld:false, canClearJournal:false
});
const noPermission = {
  canRoute:false, canMigrate:false, canResume:false, canDebitQ4:false,
  canWriteQ5:false, canWriteWorld:false, canClearJournal:false
};

function stablePair(world) {
  if (!world || typeof world.getDynamicProperty !== 'function') {
    return deny('missing_read_interface');
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
  } catch (_) { return deny('marker_read_failed'); }
  if (first[0] !== second[0] || first[1] !== second[1]) {
    return deny('marker_changed_within_pass');
  }
  return {ok:true, raw:first};
}

/**
 * There is no real atomic read API here. Require a stable raw pair both
 * before and after the existing read-only marker validator. This catches
 * observed drift but NEVER makes two property reads crash-atomic.
 */
function verifiedLegacyPair(world,worldId) {
  const first = stablePair(world);
  if (!first.ok) return first;
  const validated = inspectQ5MaintenanceMarker({world,worldId});
  if (!validated.ok) return deny('control_denied:' + validated.reason);
  if (validated.status !== 'LEGACY_MODEL_READ_ONLY' ||
      validated.wouldPermitLegacy !== true || validated.epoch !== 0) {
    return deny('maintenance_active_or_unknown');
  }
  const final = stablePair(world);
  if (!final.ok) return final;
  if (first.raw[0] !== final.raw[0] || first.raw[1] !== final.raw[1]) {
    return deny('marker_changed_during_validation');
  }
  return {ok:true,raw:final.raw};
}

/**
 * A fresh session represents fresh runtime memory. Tokens from an earlier
 * session/restart are not recognized. Nothing here saves a token in the world.
 *
 * Model-only output "wouldPassLegacyFence" is NOT a real write authorization.
 * Runtime release additionally needs a separately reviewed source-wide guard
 * integration, durable epoch/monotonic history, external writer isolation,
 * safe event cancellation, and physical custody crash tests.
 */
export function createQ5LegacyFenceSession() {
  const issued = new WeakMap();
  // Once this running session has observed maintenance or inconsistent control,
  // it cannot silently resume legacy routing after the marker looks normal.
  // A restart still requires independently durable, monotonic history proof.
  let holdLatched = false;

  function capture({world, worldId, handlerId, sourceKey}={}) {
    if (!valid(worldId) || !valid(sourceKey)) return deny('unknown_world_or_source');
    if (!allowedHandlers.has(handlerId)) return deny('unknown_hart_handler');
    if (holdLatched) return deny('maintenance_session_latched');
    const pair = verifiedLegacyPair(world,worldId);
    if (!pair.ok) {
      holdLatched = true;
      return pair;
    }
    const token = Object.freeze({
      kind:'Q5_LEGACY_FENCE_OFFLINE_TOKEN',
      worldId, handlerId, sourceKey
    });
    issued.set(token,{world,worldId,handlerId,sourceKey,raw:pair.raw,used:false});
    return {ok:true,status:'CAPTURED_LEGACY_MODEL_ONLY',
      token,wouldPassLegacyFence:false,...noPermission};
  }

  function precommit({
    token,world,worldId,handlerId,sourceKey,mutationSite
  }={}) {
    // Tokens are unforgeable within one session; no plain JSON or old-session
    // object can gain admission. WeakMap also prevents a copied token key.
    if (!token || typeof token !== 'object' || !issued.has(token)) {
      return deny('unknown_or_restarted_fence_token');
    }
    const record=issued.get(token);
    if (record.used) return deny('fence_token_replayed');
    // Consume BEFORE checking any mutable world state. A failed attempt must
    // not retry a potentially ambiguous write or become valid after rollback.
    record.used=true;
    if (holdLatched) return deny('maintenance_session_latched');
    if (world !== record.world || worldId !== record.worldId ||
        handlerId !== record.handlerId || sourceKey !== record.sourceKey) {
      holdLatched=true;
      return deny('fence_context_changed');
    }
    if (!allowedSites.has(mutationSite)) {
      holdLatched=true;
      return deny('unclassified_mutation_site');
    }
    const pair=verifiedLegacyPair(world,worldId);
    if (!pair.ok) {
      holdLatched=true;
      return pair;
    }
    if (pair.raw[0] !== record.raw[0] ||
        pair.raw[1] !== record.raw[1]) {
      holdLatched=true;
      return deny('marker_or_history_changed_after_capture');
    }
    return {
      ok:true,status:'LEGACY_PRECOMMIT_MODEL_ONLY',
      // A synthetic eligibility answer; it must not be wired to a mutation.
      wouldPassLegacyFence:true,mutationSite,worldId,handlerId,
      ...noPermission
    };
  }

  return Object.freeze({capture,precommit});
}
