/**
 * Offline source-shaped Q4 World reader. No game pack imports this file.
 *
 * Uses only the stable-shaped read operations getDynamicPropertyIds() and
 * getDynamicProperty() exposed by a caller-supplied object. TWO matching scans
 * reject obvious in-session source drift. A double read is not an atomic
 * snapshot across Bedrock world property writes, saved chunks or inventories.
 * Never calls the old loadReceiverQueue() (which can write/migrate records).
 */
import { readOnlyQ4Snapshot } from './q5_q4_readonly_snapshot.mjs';

export const Q4_QUEUE_JOURNAL_KEY = 'hartsorter:queue_journal_v1';
export const Q4_PHYSICAL_JOURNAL_KEY = 'hartsorter:journal_v1';
export const Q4_READ_PROPERTY_LIMIT = 500000;

const refuse = reason => ({ ok: false, status: 'HOLD', reason,
  canMigrate: false, canRoute: false, canClearQ4: false, canWriteWorld: false
});

function readPass(world, receiver) {
  let keys;
  try { keys = world.getDynamicPropertyIds(); }
  catch (_) { return refuse('property_id_read_failed'); }
  if (!Array.isArray(keys) || keys.length > Q4_READ_PROPERTY_LIMIT ||
      keys.some(k => typeof k !== 'string' || k.length > 256) ||
      new Set(keys).size !== keys.length) return refuse('invalid_property_id_listing');
  const qk = receiver.queueKey;
  const prefixes = [
    'hartsorter:q4m_' + qk,
    'hartsorter:q4p_' + qk + '_',
    'hartsorter:q4d_' + qk + '_'
  ];
  const selected = keys.filter(k => k === prefixes[0] ||
    k.startsWith(prefixes[1]) || k.startsWith(prefixes[2])).sort();
  const pairs = [];
  let qj, pj, qjAfter, pjAfter;
  try {
    qj = world.getDynamicProperty(Q4_QUEUE_JOURNAL_KEY);
    pj = world.getDynamicProperty(Q4_PHYSICAL_JOURNAL_KEY);
    if (qj !== undefined || pj !== undefined) return refuse('journal_not_clear');
    for (const key of selected) {
      const raw = world.getDynamicProperty(key);
      if (typeof raw !== 'string') return refuse('missing_or_nonstring_q4_value');
      pairs.push([key, raw]);
    }
    qjAfter = world.getDynamicProperty(Q4_QUEUE_JOURNAL_KEY);
    pjAfter = world.getDynamicProperty(Q4_PHYSICAL_JOURNAL_KEY);
  } catch (_) { return refuse('world_property_read_failed'); }
  if (qjAfter !== undefined || pjAfter !== undefined) return refuse('journal_changed_during_scan');
  return { ok: true, pairs };
}

/**
 * Does not publish the snapshot as a new owner; downstream Q5 model must keep
 * canMigrate=false pending independently authenticated freeze/version fences.
 * A live adapter must enforce all other routing entry-points stopped first.
 */
export function sampleQ4WorldReadOnly({receiver, world}={}) {
  if (!receiver || typeof receiver.queueKey !== 'string' ||
      typeof world?.getDynamicPropertyIds !== 'function' ||
      typeof world?.getDynamicProperty !== 'function') return refuse('read_interface_unavailable');
  const a = readPass(world, receiver);
  if (!a.ok) return a;
  const b = readPass(world, receiver);
  if (!b.ok) return b;
  if (JSON.stringify(a.pairs) !== JSON.stringify(b.pairs)) {
    return refuse('q4_changed_between_observations');
  }
  const model = readOnlyQ4Snapshot({
    receiver, records: new Map(b.pairs),
    queueJournalClear: true, physicalJournalClear: true
  });
  if (!model.ok) return model;
  return {
    ...model, doubleReadOnly: true, canMigrate: false, canRoute: false,
    canClearQ4: false, canWriteWorld: false
  };
}
