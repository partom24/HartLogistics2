/**
 * HartLogistics URCE U1 — read-only route model (source-only prototype).
 *
 * No Bedrock imports, world access, native containers, persistent caches or item
 * writes. Nodes/links and item policy facts are CALLER-SUPPLIED evidence, never
 * native capacity or authoritative ItemStack admission.
 *
 * This module deliberately does NOT replace 1.4.2 processColumn, Hopper
 * polling/compaction, physical/Q4 journaled writers, or native auto-seed checks.
 */
const TIERS = ["filter", "auto", "wildcard", "terminal", "bulk"];
const OWNERS = new Set(["sorter", "collector", "receiver", "bulk", "source"]);
const LINKS = new Set(["transporter", "hopper", "collector_receiver", "local"]);
const STATES = new Set(["yes", "no", "unknown"]);

function id(x) { return typeof x === "string" && x.length > 0; }
function state(x) { return STATES.has(x); }

export function buildReadOnlyGraph(nodes, links) {
  if (!Array.isArray(nodes) || !Array.isArray(links)) {
    return { status: "INVALID", reason: "input_not_arrays" };
  }
  const byId = new Map();
  for (const n of nodes) {
    if (!n || !id(n.id) || byId.has(n.id) || !id(n.kind)) {
      return { status: "INVALID", reason: "invalid_or_duplicate_node" };
    }
    byId.set(n.id, { ...n });
  }
  const outgoing = new Map([...byId.keys()].map(k => [k, []]));
  let unknown = false;
  for (const e of links) {
    if (!e || !id(e.from) || !id(e.to) || !byId.has(e.from) ||
        !byId.has(e.to) || !LINKS.has(e.kind)) {
      return { status: "INVALID", reason: "invalid_link" };
    }
    if (e.enabled === false) continue;
    const verified = e.verified === true && e.loaded === true &&
      byId.get(e.from).loaded === true && byId.get(e.to).loaded === true;
    if (!verified) unknown = true;
    outgoing.get(e.from).push({ ...e, verified });
  }
  return { status: "OK", byId, outgoing, unknown };
}

function walk(graph, start) {
  if (!graph || graph.status !== "OK" || !graph.byId.has(start)) {
    return { status: "INVALID", reached: new Map() };
  }
  const queue = [start], reached = new Map([[start, { hops: 0, path: [start] }]]);
  let unknown = graph.byId.get(start).loaded !== true;
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const edge of graph.outgoing.get(at)) {
      if (!edge.verified) { unknown = true; continue; }
      if (!reached.has(edge.to)) {
        const p = reached.get(at);
        reached.set(edge.to, { hops: p.hops + 1, path: [...p.path, edge.to] });
        queue.push(edge.to);
      }
    }
  }
  return { status: "OK", reached, unknown };
}

export function sourceReachability(graph, source) {
  return walk(graph, source);
}

export function checkManagedLink(graph, from, to) {
  if (!graph || graph.status !== "OK" || !graph.byId.has(from) || !graph.byId.has(to)) {
    return { decision: "REJECT", reason: "invalid_endpoint" };
  }
  if (from === to) return { decision: "REJECT", reason: "cycle" };
  // A path from proposed target back to source makes the new managed link cyclic.
  // An unknown reachable segment cannot certify that there is no such path.
  const back = walk(graph, to);
  if (back.reached.has(from)) return { decision: "REJECT", reason: "cycle" };
  if (back.unknown || graph.byId.get(from).loaded !== true) {
    return { decision: "HOLD", reason: "unverified_reverse_reachability" };
  }
  return { decision: "ALLOW", reason: "no_verified_reverse_path" };
}

function orderTier(candidates) {
  // Cost is compared between columns, never between Sorters *within* a
  // column. Grouping first avoids a non-transitive mixed cost/order comparator.
  const columns = new Map();
  for (const c of candidates) {
    const key = c.columnId;
    if (!columns.has(key)) columns.set(key, { members: [], first: c.inputIndex, cost: Infinity });
    const col = columns.get(key);
    col.members.push(c);
    col.first = Math.min(col.first, c.inputIndex);
    const cost = Number.isFinite(c.estimatedCost) && c.estimatedCost >= 0
      ? c.estimatedCost : Infinity;
    col.cost = Math.min(col.cost, cost);
  }
  const sorted = [...columns.values()].sort((a, b) =>
    a.cost - b.cost || a.first - b.first);
  for (const column of sorted) {
    column.members.sort((a, b) => a.bottomUp - b.bottomUp || a.inputIndex - b.inputIndex);
  }
  return sorted.flatMap(c => c.members);
}

/**
 * Return policy-stage candidates only; never assert live admission or authorize
 * a transfer. Offers represent a configuration/identity observation from the
 * caller and must be refreshed against real Bedrock state before any write.
 *
 * claim: yes/no/unknown for Filter/Auto and existing-bulk-home authority.
 * reachable: yes/no/unknown determined from supplied graph, NOT from adjacency.
 * available is intentionally not a field: chest capacity and Auto seed remain
 * live, and their uncertainty is not silently converted into a fallback.
 */
export function planReadOnlyCandidates({
  graph, source, itemClass, offers, existingBulkHome = "unknown",
  applicableBulkState = "unknown"
}) {
  if (!graph || graph.status !== "OK" || !id(source) ||
      !["ordinary", "mr"].includes(itemClass) || !Array.isArray(offers) ||
      !state(existingBulkHome) ||
      !["open", "full", "unknown"].includes(applicableBulkState)) {
    return { status: "INVALID", reason: "invalid_input", stages: [] };
  }
  const reach = walk(graph, source);
  if (reach.status !== "OK") return { status: "INVALID", reason: "unknown_source", stages: [] };
  if (graph.byId.get(source).loaded !== true) {
    return { status: "HOLD", reason: "source_unloaded", stages: [] };
  }
  let unresolved = reach.unknown;
  let hasClaim = false;
  const grouped = Object.fromEntries(TIERS.map(t => [t, []]));
  for (let i = 0; i < offers.length; i++) {
    const o = offers[i];
    if (!o || !id(o.nodeId) || !TIERS.includes(o.tier) ||
        !graph.byId.has(o.nodeId) ||
        !Number.isInteger(o.bottomUp ?? 0) || (o.bottomUp ?? 0) < 0) {
      return { status: "INVALID", reason: "invalid_offer", stages: [] };
    }
    if (!reach.reached.has(o.nodeId)) {
      // Never select a remote destination that this source cannot reach.
      continue;
    }
    if (o.tier === "filter" || o.tier === "auto") {
      if (!state(o.claim)) return { status: "INVALID", reason: "claim_not_proven", stages: [] };
      if (o.claim === "unknown") { unresolved = true; continue; }
      if (o.claim === "no") continue;
      hasClaim = true;
    }
    if (o.verified !== true) { unresolved = true; continue; }
    if (o.tier === "bulk" && itemClass === "mr") continue; // ordinary account cannot hold MR
    grouped[o.tier].push({
      nodeId: o.nodeId, tier: o.tier,
      columnId: o.columnId ?? o.nodeId, bottomUp: o.bottomUp ?? 0,
      estimatedCost: o.estimatedCost,
      inputIndex: i, path: reach.reached.get(o.nodeId).path,
      liveAdmissionRequired: true
    });
  }
  for (const tier of TIERS) grouped[tier] = orderTier(grouped[tier]);
  const stage = tier => grouped[tier].length
    ? [{ tier, candidates: grouped[tier].map(({inputIndex, ...o}) => o) }] : [];
  const primary = [...stage("filter"), ...stage("auto")];
  // A positive Filter/Auto claim remains a claim even when its actual chest
  // cannot admit the item; fallback is conditional on later live admission.
  if (hasClaim) {
    let fallback = [];
    // Unknown reachable claims/topology block *fallback*, never confirmed
    // primary candidates. The latter still require live revalidation.
    if (!unresolved && itemClass === "ordinary") {
      if (applicableBulkState === "open") fallback = stage("bulk");
      else if (applicableBulkState === "full") fallback = stage("wildcard");
    }
    return {
      status: primary.length || fallback.length ? "CANDIDATES" : "HOLD",
      reason: unresolved ? "unverified_additional_routes" :
        primary.length || fallback.length ? "requires_live_admission" : "no_verified_home",
      stages: [...primary, ...fallback],
      conditionalFallback: true,
      unresolved
    };
  }
  // Unknown remote claims or prior Bulk home prohibit declaring cargo
  // genuinely unclaimed and forwarding toward a speculative Wildcard.
  if (unresolved || existingBulkHome === "unknown") {
    return { status: "HOLD", reason: "claim_or_topology_unknown", stages: [], unresolved: true };
  }
  if (itemClass === "mr") {
    const stages = stage("wildcard");
    return { status: stages.length ? "CANDIDATES" : "HOLD",
      reason: stages.length ? "requires_live_native_admission" : "no_verified_native_home",
      stages, conditionalFallback: false, unresolved: false };
  }
  if (existingBulkHome === "yes") {
    if (applicableBulkState === "unknown") return {
      status: "HOLD", reason: "bulk_capacity_unknown", stages: [], unresolved: true
    };
    const stages = applicableBulkState === "full" ? stage("wildcard") : stage("bulk");
    return { status: stages.length ? "CANDIDATES" : "HOLD",
      reason: stages.length ? "requires_live_admission" : "no_verified_home",
      stages, conditionalFallback: false, unresolved: false };
  }
  const stages = [
    ...stage("wildcard"), ...stage("terminal"),
    ...(applicableBulkState === "open" ? stage("bulk") : [])
  ];
  // A later stage is only tried if all earlier live candidates fail.
  return { status: stages.length ? "CANDIDATES" : "HOLD",
    reason: stages.length ? "requires_live_admission" :
      applicableBulkState === "unknown" ? "bulk_capacity_unknown" : "no_verified_home",
    stages, conditionalFallback: true, unresolved: applicableBulkState === "unknown" };
}
