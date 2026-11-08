/**
 * OFFLINE ONLY. History-first Q5 maintenance transition write-order model.
 *
 * This designs the first one-way maintenance activation, NOT a Bedrock
 * transaction, property writer, migration command, pack, or runtime freeze.
 *
 * On each modeled transition, update the monotonic history record FIRST,
 * then the matching marker record. A crash between records MUST read as HOLD
 * with the existing q5_world_guard_read model, never as a clean LEGACY
 * permission. Old Q4 remains authoritative; no migration or Q5 output.
 *
 * Important unsolved problems:
 *  - Crash before the first write leaves the old LEGACY state.
 *  - Reverting BOTH properties to old backup bytes is undetectable (ABA).
 *  - Property persistence/order across BDS crashes is unverified.
 *  - No global handler stop, vanilla isolation or verified MR lane exists.
 *  - Input evidence booleans are synthetic assertions, NOT BDS evidence.
 */
import {
  inspectQ5MaintenanceMarker,
  Q5_GUARD_MARKER_KEY,Q5_GUARD_HISTORY_KEY,
  Q5_GUARD_MARKER_SCHEMA,Q5_GUARD_HISTORY_SCHEMA
} from './q5_world_guard_read.mjs';

export const Q5_MAINTENANCE_TRANSITIONS=Object.freeze({
  LEGACY:Object.freeze(['REQUESTED']),
  REQUESTED:Object.freeze(['FROZEN','BLOCKED']),
  FROZEN:Object.freeze(['STAGING','BLOCKED']),
  STAGING:Object.freeze(['VERIFYING','BLOCKED']),
  VERIFYING:Object.freeze(['RESUME_PENDING','BLOCKED']),
  RESUME_PENDING:Object.freeze(['BLOCKED']),
  BLOCKED:Object.freeze([])
});

export const Q5_QUIESCENCE_FIELDS=Object.freeze([
  'allHartHandlersAudited',
  'allHartCallbacksStopped',
  'inFlightHartMutationsZero',
  'worldRegistryComplete',
  'sorterJournalClear',
  'queueJournalClear',
  'physicalCustodyJournalClear',
  'vanillaIngressIsolated'
]);

const name=s=>typeof s==='string' && s.length>0 && s.length<=256;
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const noAuthority=Object.freeze({
  canRoute:false,canMigrate:false,canResume:false,
  canDebitQ4:false,canWriteQ5:false,canWriteWorld:false,
  canClearJournal:false,canSettle:false
});
const denied=reason=>({ok:false,status:'HOLD',reason,...noAuthority});
const fields=(o,keys)=>o && typeof o==='object' &&
  !Array.isArray(o) && Object.keys(o).length===keys.length &&
  keys.every(key=>Object.prototype.hasOwnProperty.call(o,key));

function rawPair(world) {
  if (!world || typeof world.getDynamicProperty!=='function') {
    return denied('world_read_unavailable');
  }
  let a,b;
  try {
    a=[world.getDynamicProperty(Q5_GUARD_MARKER_KEY),
       world.getDynamicProperty(Q5_GUARD_HISTORY_KEY)];
    b=[world.getDynamicProperty(Q5_GUARD_MARKER_KEY),
       world.getDynamicProperty(Q5_GUARD_HISTORY_KEY)];
  } catch (_) { return denied('world_read_failed'); }
  if(a[0]!==b[0] || a[1]!==b[1]){
    return denied('marker_changed_while_reading');
  }
  return {ok:true,raw:a};
}

function readKnownPair(world,worldId) {
  if(!name(worldId))return denied('invalid_world_identity');
  const start=rawPair(world);
  if(!start.ok)return start;
  const validated=inspectQ5MaintenanceMarker({world,worldId});
  if(!validated.ok)return denied('maintenance_state_refused:'+validated.reason);
  const end=rawPair(world);
  if(!end.ok)return end;
  if(start.raw[0]!==end.raw[0] || start.raw[1]!==end.raw[1]){
    return denied('maintenance_changed_during_validation');
  }
  let marker,history;
  try{
    marker=JSON.parse(end.raw[0]);
    history=JSON.parse(end.raw[1]);
  }catch(_){return denied('corrupt_maintenance_record');}
  if(!fields(marker,['schema','worldId','epoch','phase','revision','authority']) ||
     !fields(history,['schema','worldId','highestEpoch','revision','everEntered']) ||
     marker.schema!==Q5_GUARD_MARKER_SCHEMA ||
     history.schema!==Q5_GUARD_HISTORY_SCHEMA ||
     marker.worldId!==worldId || history.worldId!==worldId ||
     !integer(marker.epoch) || !integer(marker.revision) ||
     !integer(history.highestEpoch) || !integer(history.revision)){
    return denied('unrecognized_maintenance_record_shape');
  }
  return {ok:true,marker,history,validated,raw:end.raw};
}

function claimsAcceptable(claims) {
  return claims && typeof claims==='object' &&
    Q5_QUIESCENCE_FIELDS.every(key=>claims[key]===true);
}

/**
 * Return an ordered two-record WRITE PLAN to be *simulated*, not executed.
 * Every transition stays under Q4 authority, including RESUME_PENDING.
 * The first LEGACY transition is the only allowed epoch increment.
 *
 * The current marker is read multiple times, not as an atomic BDS snapshot.
 * Model success never authorizes world property writes or live maintenance.
 */
export function planQ5MaintenanceRecordTransition({
  world,worldId,targetPhase,quiescenceClaims
}={}) {
  const prior=readKnownPair(world,worldId);
  if(!prior.ok)return prior;
  const {marker,history,validated}=prior;
  const steps=Object.prototype.hasOwnProperty.call(
    Q5_MAINTENANCE_TRANSITIONS,marker.phase)
    ? Q5_MAINTENANCE_TRANSITIONS[marker.phase] : null;
  if(!steps || !steps.includes(targetPhase)){
    return denied('illegal_maintenance_transition');
  }
  const initial=marker.phase==='LEGACY';
  if(initial && (validated.status!=='LEGACY_MODEL_READ_ONLY' ||
     marker.epoch!==0 || marker.revision!==0 ||
     history.highestEpoch!==0 || history.revision!==0 ||
     history.everEntered!==false)){
    return denied('legacy_bootstrap_not_fully_verified');
  }
  if(!initial && (validated.status!=='MAINTENANCE_STOP_MODEL_ONLY' ||
     history.everEntered!==true)){
    return denied('maintenance_epoch_unverified');
  }
  if(targetPhase!=='REQUESTED' && targetPhase!=='BLOCKED' &&
     !claimsAcceptable(quiescenceClaims)){
    return denied('world_quiescence_claims_missing');
  }
  if(marker.revision===Number.MAX_SAFE_INTEGER ||
     marker.epoch===Number.MAX_SAFE_INTEGER ||
     history.revision===Number.MAX_SAFE_INTEGER){
    return denied('maintenance_counter_exhausted');
  }
  const epoch=initial ? marker.epoch+1 : marker.epoch;
  const revision=marker.revision+1;
  const nextHistory={
    schema:Q5_GUARD_HISTORY_SCHEMA,worldId,
    highestEpoch:epoch,revision,everEntered:true
  };
  const nextMarker={
    schema:Q5_GUARD_MARKER_SCHEMA,worldId,
    epoch,phase:targetPhase,revision,authority:'Q4_ONLY'
  };
  return {
    ok:true,status:'HISTORY_FIRST_WRITE_PLAN_ONLY',
    worldId,previousPhase:marker.phase,targetPhase,epoch,revision,
    previousRaw:Object.freeze([...prior.raw]),
    writes:Object.freeze([
      Object.freeze({key:Q5_GUARD_HISTORY_KEY,
        value:JSON.stringify(nextHistory)}),
      Object.freeze({key:Q5_GUARD_MARKER_KEY,
        value:JSON.stringify(nextMarker)})
    ]),
    historyFirst:true,
    assertionsAreRuntimeProof:false,
    crashAtomicityProven:false,
    oldQ4RemainsAuthoritative:true,
    ...noAuthority
  };
}
