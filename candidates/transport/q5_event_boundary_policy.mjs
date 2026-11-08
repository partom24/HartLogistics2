/**
 * Q5 PG27 event-cancellation policy model, OFFLINE / NON-DEPLOYABLE.
 *
 * Bedrock beforeEvents may cancel vanilla actions, while afterEvents cannot
 * undo a vanilla item ejection or block edit. A live maintenance gate must
 * not simply throw at callbacks: lost cancellation and unhandled vanilla
 * inventory changes could corrupt physical/virtual custody.
 *
 * This module **only returns decisions**; it does not subscribe to events,
 * mutate ev.cancel, remove an item, call a writer, or grant a gameplay permit.
 * Ownership, managed-face classification and callback epoch are synthetic
 * inputs and MUST be independently established by the actual Bedrock source.
 */
import { inspectQ5MaintenanceMarker } from './q5_world_guard_read.mjs';

export const Q5_EVENT_POLICY = Object.freeze({
  before_item_use: Object.freeze({
    phase:'before',targets:['sorter_service_face']
  }),
  before_interact_block: Object.freeze({
    phase:'before',targets:['sorter_service_face','sorter_mode_indicator',
      'collector','receiver']
  }),
  before_interact_entity: Object.freeze({
    phase:'before',targets:['owned_filter_display']
  }),
  before_break_block: Object.freeze({
    phase:'before',targets:['owned_filter_frame','sorter','collector','receiver']
  }),
  after_entity_spawn: Object.freeze({
    phase:'after',targets:['ejected_item']
  }),
  after_place_block: Object.freeze({
    phase:'after',targets:['sorter','collector','receiver']
  }),
  after_frame_hit: Object.freeze({
    phase:'after',targets:['owned_filter_frame']
  }),
  after_break_block: Object.freeze({
    phase:'after',targets:['sorter','collector','receiver']
  }),
  deferred_entity_ingress: Object.freeze({
    phase:'deferred',targets:['ejected_item']
  }),
  deferred_player_mutation: Object.freeze({
    phase:'deferred',targets:['sorter_service_face',
      'sorter_mode_indicator','collector','receiver','owned_filter_display']
  }),
  deferred_frame_mutation: Object.freeze({
    phase:'deferred',targets:['owned_filter_frame']
  })
});
// Freeze nested target lists too; adding a target at runtime must not
// silently convert a previously foreign/unknown action into a Hart callback.
for (const spec of Object.values(Q5_EVENT_POLICY)) Object.freeze(spec.targets);
export const Q5_EVENT_KINDS = Object.freeze(Object.keys(Q5_EVENT_POLICY));
const valid=s=>typeof s==='string'&&s.length>0&&s.length<=256;
const noPermission=Object.freeze({
  canRoute:false,canMigrate:false,canResume:false,canDebitQ4:false,
  canWriteQ5:false,canWriteWorld:false,canClearJournal:false
});
const deny=(reason,more={})=>({
  ok:false,status:'HOLD',reason,
  wouldCancelBeforeEvent:false,wouldRunHartCallback:false,
  wouldScheduleRetry:false,externalIsolationRequired:true,
  requiresPrecommitFence:true,...noPermission,...more
});

/**
 * "managed" means this exact PG27 event/face/ownership combination is a Hart
 * callback that would ordinarily intercept an event. This flag is not self-
 * authenticating: a live adapter MUST derive it from real source-level checks.
 */
export function previewQ5EventBoundary({
  world, worldId, eventKind, ownership, targetKind, managed, capturedEpoch
}={}) {
  if (typeof eventKind!=='string' ||
      !Object.prototype.hasOwnProperty.call(Q5_EVENT_POLICY,eventKind)) {
    return deny('unknown_event_entrypoint');
  }
  const rule=Q5_EVENT_POLICY[eventKind];
  if (!['hart','foreign','unknown'].includes(ownership)) {
    return deny('unclassified_event_owner');
  }
  if (ownership==='foreign') {
    // Never indiscriminately cancel vanilla interactions elsewhere in world.
    return {
      ok:true,status:'FOREIGN_EVENT_UNTOUCHED_MODEL_ONLY',
      phase:rule.phase,wouldCancelBeforeEvent:false,
      wouldRunHartCallback:false,wouldScheduleRetry:false,
      externalIsolationRequired:false,requiresPrecommitFence:false,
      ...noPermission
    };
  }
  if (ownership==='unknown' || !valid(targetKind)) {
    return deny('event_ownership_unverified');
  }
  if (!rule.targets.includes(targetKind)) {
    return deny('event_target_not_catalogued');
  }
  if (typeof managed!=='boolean') {
    return deny('event_face_or_action_unverified');
  }
  if (managed===false) {
    // Example: sneaking to place a vanilla hopper against a Hart Receiver.
    // Hart does not own the vanilla action, but migration must account for
    // a possible new container/topology change; never claim global isolation.
    return {
      ok:true,status:'VANILLA_TOPOLOGY_EDGE_UNRESOLVED',
      phase:rule.phase,wouldCancelBeforeEvent:false,
      wouldRunHartCallback:false,wouldScheduleRetry:false,
      externalIsolationRequired:true,requiresPrecommitFence:false,
      ...noPermission
    };
  }
  if (!valid(worldId)) return deny('unknown_world_identity');
  const current=inspectQ5MaintenanceMarker({world,worldId});
  // An unbootstrapped or torn marker is exactly as unsafe as active
  // maintenance: stop Hart processing, but do NOT forge a success.
  if (!current.ok) {
    return {
      ...deny('maintenance_marker_hold:'+current.reason),
      phase:rule.phase,
      wouldCancelBeforeEvent:rule.phase==='before'
    };
  }
  const isLegacy=current.status==='LEGACY_MODEL_READ_ONLY' &&
    current.wouldPermitLegacy===true;
  if (rule.phase==='deferred' &&
      (!Number.isSafeInteger(capturedEpoch) ||
       capturedEpoch!==current.epoch)) {
    return {
      ...deny('deferred_epoch_stale'),
      phase:rule.phase,
      externalIsolationRequired:!isLegacy
    };
  }
  if (!isLegacy) {
    return {
      ok:true,status:'MAINTENANCE_HART_EVENT_BLOCKED_MODEL_ONLY',
      phase:rule.phase,epoch:current.epoch,
      wouldCancelBeforeEvent:rule.phase==='before',
      wouldRunHartCallback:false,wouldScheduleRetry:false,
      // External vanilla effects are not stopped by Hart Script API:
      externalIsolationRequired:true,
      requiresPrecommitFence:true,
      ...noPermission
    };
  }
  return {
    ok:true,status:'LEGACY_EVENT_ELIGIBILITY_MODEL_ONLY',
    phase:rule.phase,epoch:0,
    // "managed" only includes the PG27 cases that already intercept.
    wouldCancelBeforeEvent:rule.phase==='before',
    // This is a source-semantics model, NOT an executable invocation permit.
    wouldRunHartCallback:true,
    wouldScheduleRetry:false,
    externalIsolationRequired:false,requiresPrecommitFence:true,
    ...noPermission
  };
}
