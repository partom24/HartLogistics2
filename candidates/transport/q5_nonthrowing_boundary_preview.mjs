/**
 * OFFLINE / NON-DEPLOYABLE: non-throwing Q5 event -> precommit composition.
 *
 * Composes the reviewed PG27 event decision and single-use legacy marker fence.
 * Does not subscribe to Bedrock events, mutate ev.cancel, invoke callbacks,
 * operate on inventories, write world properties, build a pack or grant routing.
 *
 * A "would" result is only a source-shaped decision. In particular:
 * - external vanilla/foreign writers are not isolated;
 * - a history pair can undergo unobserved ABA restoration;
 * - no Bedrock durable bootstrapping, crash ordering or atomicity is proven;
 * - exact real target ownership and cancellation semantics remain unverified.
 */
import { previewQ5EventBoundary } from './q5_event_boundary_policy.mjs';
import { createQ5LegacyFenceSession } from './q5_legacy_precommit_fence.mjs';

const NO_AUTHORITY = Object.freeze({
  canInstall:false, canFreezeWorld:false, canRoute:false,
  canMigrate:false, canResume:false, canDebitQ4:false,
  canWriteQ5:false, canWriteWorld:false, canClearJournal:false
});

function held(reason, {wouldRequestManagedBeforeCancellation=false,
                      externalIsolationRequired=true}={}) {
  return {
    ok:false, status:'HOLD', reason,
    wouldRequestManagedBeforeCancellation,
    wouldCallHartHandler:false,
    wouldInvokeNativeEffect:false,
    externalIsolationRequired, requiresPrecommitFence:true,
    abaExcluded:false, crashAtomicityProven:false,
    ...NO_AUTHORITY
  };
}

const valid=s=>typeof s==='string' && s.length>0 && s.length<=256;

/**
 * Return source-shaped capture/precommit decisions WITHOUT any effect executor.
 * Each new instance represents one process session. The private WeakMap and
 * underlying fence both reject replays and tickets from an old process.
 */
export function createQ5NonThrowingBoundaryPreview() {
  const fence=createQ5LegacyFenceSession();
  const tickets=new WeakMap();

  function captureEvent({
    world,worldId,eventKind,ownership,targetKind,managed,capturedEpoch,
    handlerId,sourceKey
  }={}) {
    let decision;
    try {
      decision=previewQ5EventBoundary({
        world,worldId,eventKind,ownership,targetKind,managed,capturedEpoch
      });
    } catch (_) {
      return held('event_policy_read_failed');
    }
    // A model's "wouldCancel" includes ordinary LEGACY interception; never
    // translate it into a live Bedrock cancellation side effect.
    const managedBefore=ownership==='hart' && managed===true &&
      decision?.phase==='before' && decision.wouldCancelBeforeEvent===true;
    if (decision?.status==='FOREIGN_EVENT_UNTOUCHED_MODEL_ONLY') {
      return {
        ...held('foreign_event_unmodified_model_only',{
          externalIsolationRequired:false
        }),status:'FOREIGN_UNTOUCHED_MODEL_ONLY'
      };
    }
    if (decision?.status==='VANILLA_TOPOLOGY_EDGE_UNRESOLVED') {
      return held('vanilla_topology_edge_unisolated');
    }
    if (decision?.status!=='LEGACY_EVENT_ELIGIBILITY_MODEL_ONLY' ||
        decision.wouldRunHartCallback!==true ||
        decision.requiresPrecommitFence!==true || decision.epoch!==0) {
      return held('event_not_legacy_eligible:'+
        (decision?.reason||decision?.status||'unknown'),{
          wouldRequestManagedBeforeCancellation:
            managedBefore && decision?.wouldRunHartCallback===false
        });
    }
    // An afterEvent may already have changed vanilla physical custody, so a
    // later Hart-only precommit check cannot certify its entire event.
    if (decision.phase==='after') {
      return held('after_event_external_effect_not_isolated');
    }
    if (!valid(worldId) || !valid(handlerId) || !valid(sourceKey)) {
      return held('missing_explicit_event_fence_context',{
        wouldRequestManagedBeforeCancellation:managedBefore
      });
    }
    let capture;
    try {
      capture=fence.capture({world,worldId,handlerId,sourceKey});
    } catch (_) {
      return held('fence_capture_failed',{
        wouldRequestManagedBeforeCancellation:managedBefore
      });
    }
    if (!capture?.ok || !capture.token) {
      return held('fence_capture_hold:'+(capture?.reason||'unknown'),{
        wouldRequestManagedBeforeCancellation:managedBefore
      });
    }
    const ticket=Object.freeze({kind:'Q5_NONTHROWING_OFFLINE_TICKET'});
    tickets.set(ticket,{
      token:capture.token,world,worldId,handlerId,sourceKey,
      eventKind,targetKind,used:false
    });
    return {
      ok:true,status:'LEGACY_EVENT_CAPTURE_MODEL_ONLY',ticket,
      phase:decision.phase,eventKind,
      wouldRequestManagedBeforeCancellation:false,
      wouldCallHartHandler:false,wouldInvokeNativeEffect:false,
      externalIsolationRequired:false,requiresPrecommitFence:true,
      abaExcluded:false,crashAtomicityProven:false,...NO_AUTHORITY
    };
  }

  function previewPrecommit({
    ticket,world,worldId,handlerId,sourceKey,mutationSite
  }={}) {
    if (!ticket || typeof ticket!=='object' || !tickets.has(ticket)) {
      return held('unknown_or_restarted_event_ticket');
    }
    const record=tickets.get(ticket);
    if (record.used) return held('event_ticket_replayed');
    // Consumption occurs before all potentially failing checks. No retry.
    record.used=true;
    if (world!==record.world || worldId!==record.worldId ||
        handlerId!==record.handlerId || sourceKey!==record.sourceKey) {
      return held('event_precommit_context_changed');
    }
    let result;
    try {
      result=fence.precommit({
        token:record.token,world,worldId,handlerId,sourceKey,mutationSite
      });
    } catch (_) {
      return held('precommit_marker_read_failed');
    }
    if (!result?.ok || result.wouldPassLegacyFence!==true) {
      return held('precommit_hold:'+(result?.reason||'unknown'));
    }
    return {
      ok:true,status:'LEGACY_PRECOMMIT_ELIGIBILITY_MODEL_ONLY',
      mutationSite,eventKind:record.eventKind,
      wouldRequestManagedBeforeCancellation:false,
      wouldCallHartHandler:false,wouldInvokeNativeEffect:false,
      externalIsolationRequired:true,requiresPrecommitFence:true,
      abaExcluded:false,crashAtomicityProven:false,
      ...NO_AUTHORITY
    };
  }

  return Object.freeze({captureEvent,previewPrecommit});
}
