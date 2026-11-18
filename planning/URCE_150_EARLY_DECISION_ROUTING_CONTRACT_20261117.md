# URCE-ADR-001 — Route eligibility before native admission

**Date:** 2026-11-17  
**Status:** **Accepted for URCE planning and source-only differential testing** — not gameplay/deployment authorization  
**Authority:** Hart Logistics 1.4.2 source at `baseline/native-first-142-20261117:addon/behavior_pack/scripts/main.js`; engine SHA-256 `2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411`  
**Related:** [existing source-path/early-exit review](URCE_150_ROUTING_FIRST_PRINCIPLES_20261117.md), [writer census](URCE_150_ACTIVE_142_WRITER_CENSUS_20261117.md), [URCE plan](URCE_150_ARCHITECTURE_AND_DELIVERY_PLAN_20261117.md)

## Decision and boundaries

**Question:** What is the routing path, is there a simpler one, what minimal item information do we need, and where can we stop costly work earliest?

**Decision:** First attempt a **small, lazy, tier-ordered eligibility walk**. Never ask a destination an expensive inventory question until cheaper, authoritative policy and live block checks establish that the destination is a plausible candidate. **Do not** begin with a network-wide planner, global item index, new scheduler, persistent chest-capacity ledger, transaction rewrite or cross-tick negative cache. Retain them only as separate hypotheses with independent performance/correctness proof.

A negative result has a **scope**. An item can be excluded from *one Filter*, *one Sorter*, or *one destination*, yet still be admissible at the next Filter, seeded Auto or Wildcard. A source item can be partially moved and still require later candidates. Do not use a negative candidate decision to drop/erase cargo or suppress native Hopper pass-through.

Three authorities must remain separate:

1. **Routing policy** (inexpensive): registry mode and configured Filter match determine whether a Sorter **might** accept an item.
2. **Live admission** (expensive only if needed): actual Sorter, redstone, adjacent native container/Collector, exact live Auto seed and exact native slot/queue capacity determine whether that candidate **can** accept now.
3. **Custody** (only after positive admission): bound quantity and original live ItemStack, then the existing journaled Q4/physical debit-and-credit/recovery boundary. A native `Container.addItem` remainder is not a durable cross-inventory placement receipt.

## Current 1.4.2 source path — preserve its behavior

`schedulerTick` checks readiness and both journal fences, rebuilds dirty configuration columns, and polls each column each tick under global budget **256**. `processColumn` first validates native source Hopper presence, redstone lock and `firstItem()` nonemptiness. Existing **Filter/Bypass-only all-nonmatch transit** returns before destinations, while preserving a necessary source Hopper compaction when a live active Sorter exists.

The non-transit branch then *eagerly* checks the physical status of every Sorter in a column, compacts the Hopper, and for each occupied source slot builds three arrays: matching Filter, all Auto, all Wildcard. Those are attempted **Filter → live-seeded Auto → Wildcard** and **bottom-to-top within each priority**. For each attempted target, the source slot is re-read; the live Sorter/mode/redstone and `destinationFor` are checked, followed by `findAcceptSlot` or `sorterCollectorRoute`. Only a positive admission reaches the journaled writer, with **16 per column** and **256 globally**. Partial moves can continue to later slots/candidates.

`matchesFilter` first compares `typeId`; potion Filters also match effect+delivery, enchanted books match enchantment **type sets** (not levels), and other Filter policy matches by base type. These **policy** rules do not certify native ItemStack stackability or preserve metadata by themselves. `findAcceptSlot` still needs a live native destination check; even a completely full chest may have a compatible partial stack.

Existing `destinationFor` may register/update a Collector. Deferring a call changes *when* that side effect occurs, so equivalence must include registration/link behavior, not just moved-item counts.

## Required early-exit ladder

| Gate | Cheapest authoritative question | Safe exit / next action | What must NOT be assumed |
| --- | --- | --- | --- |
| **G0: transfer fence** | Ready? both journals safe? positive budget? | Stop new Hart transfers; keep recovery path intact | Pending is not empty/settled |
| **G1: native source** | Hopper exists, unlocked, native inventory valid, `firstItem()` nonempty? | Stop this column if false | Script inventory access does not replace vanilla Hopper timing |
| **G2: configured policy/transit** | Can any configured Filter match the observed Hopper items? Are Auto/Wildcard eligible? | Skip proven-ineligible Filter targets; transit only if **all routing alternatives** provably absent, honoring existing compaction | A failed Filter does not reject Auto/Wildcard; unresolved source reads cannot prove transit |
| **G3: lazy tier** | For current live item, is this Filter an exact policy match? Or an Auto/Wildcard policy candidate? | Skip nonmatch **without Sorter block/destination lookup** | Recheck current mode/Filter before any write |
| **G4: live Sorter** | Correct block present, not Bypass/quarantined/powered? | Skip this candidate only | Registry state alone is not physical authority |
| **G5: route kind** | Actual supported storage or valid Collector→Receiver relationship? Auto target is storage? | Skip invalid candidate, continue appropriate next tier | Live `destinationFor` may have registration side effects; preserve observed behavior |
| **G6: admission** | Exact native partial/empty capacity and live Auto seed, or authoritative queue state/room? | No safe space → next candidate; unknown → preserve fail-closed legacy behavior | Full chest ≠ no compatible partial; no stale capacity/Auto-seed cache |
| **G7: custody** | Source still holds item? Positive bounded transfer? Native identity/journal safe? | Perform existing exact journaled transfer, or HOLD when ownership is ambiguous | Route match or `addItem` remainder is not commit evidence |
| **G8: completion** | Source empty or global/column budget exhausted? | Stop only when baseline would; otherwise continue same target/remainder/next target | Partial success is not necessarily full completion |

A future network-governed **unknown/unloaded Bulk state** may require HOLD and reconciliation; this ADR does **not** silently change standalone 1.4.2 fallback behavior. An unavailable candidate and a genuinely capacity-full candidate are not the same fact.

## Minimal implementation-shaped algorithm (proposal, not code)

```text
Maintain current journal gates, Hopper polling, compaction and budgets.
For each current source Hopper slot:
  Read native ItemStack once for policy eligibility; use typeId first.
  For tier = Filter, then Auto, then Wildcard:
    For registered Sorter in bottom-to-top order:
      If policy proves it cannot match: SKIP candidate without world/block read.
      Read current Sorter, redstone, mode/quarantine; skip if invalid.
      Resolve ONE adjacent destination; skip unsupported route kind.
      Read live Auto seed + native exact slot capacity, or current Receiver queue.
      If admission fails: try next candidate, preserving source item.
      Re-read source slot; bound quantity; use existing Q4/physical writer.
      If source empty or budget exhausted: stop as existing source does.
      Otherwise preserve remainder and continue exactly as current routing does.
```

No persistent candidate list or route index is mandatory. A generator, a few inline loops or other very small local implementation is sufficient if it preserves ordering. **Do not materialize all tiers or preload all chests** merely to call the result a planner.

### Earliest payload reduction

- **Policy-stage identity:** `typeId` first; include potion effect+delivery or enchanted-book enchantment-type set only when a possible Filter needs those checks.
- **Never flatten the original native ItemStack** for policy decisions. No early transport serialization, deep metadata clone, chest snapshot or Q4 journal payload.
- **Collector hypothesis:** actual `sorterCollectorRoute` calls `serializeQueueItem(stack)` before `loadReceiverQueue(receiver)` and capacity check. A separately tested authoritative **queue-capacity-before-serialization** path might avoid costly serialization on full queues; it must preserve queue-load errors, unknown/HOLD behavior and accepting-route cost. Do not trust stale `receiver.queued`.
- **At the write boundary:** reread the actual source slot after any compaction or transfer; a cached policy key is not proof of the source item's current location/identity.

## Differential acceptance (before any gameplay changes)

**Required baseline:** frozen source-executed 1.4.2 `processColumn` and present Q4 functions; compare to a source-only lazy candidate proposal. Record both **logical outcome** and **native-call counts**. At minimum cover:

1. Empty, redstone-locked and unavailable Hopper; all-Bypass; powered/missing/quarantined Sorter; Filter-only all-nonmatch transit with compaction; mixed five-slot Hopper.
2. Filter → Auto → Wildcard and bottom-to-top sequence, duplicate Filters, multiple partial destinations, source remainder/continued route and **16/256** budgets; no change to redstone or one-tick observation.
3. Base-type Filter, potion effect+delivery, enchanted-book enchantment-type set, different name/lore/durability/enchants, native nonstackables.
4. Auto with and without live seed; Auto facing Collector; full chest with exact partial compatible stack; external chest/source mutation, unload and contradictory native observations.
5. Valid/unlinked/powered Collector, unreadable/full Q4 Receiver, metadata-rich queue rejection, actual ejection/Receiver direct-only paths unaffected; pending and ambiguous journals preserved.
6. Realistic 4–5-high columns and matched representative owner ~1,400-Sorter layouts; no loss/duplication and exact item identity on actual BDS, not just in mocks.

**Metrics:** Sorter block reads, `destinationFor` resolutions, `findAcceptSlot` invocations, native `getSlot` calls, queue serialization calls, delivered items and journal state; native script/level P50/P95/P99, memory and useful throughput in later owner LAB. Baseline savings must be **incremental to 1.4.2's existing transit-first shortcut**, not attributed to URCE twice. Avoid counting JS and TS views of one CPU profile as independent observations.

**GO:** same observable behavior and custody, fewer **expensive** native resolutions/admissions under matched scenarios, and eventually meaningful native BDS improvement. **NO-GO:** only cheap JS array comparisons saved, no material destination work avoided, or any correctness/compatibility regression. Do not introduce global mapping/caching to manufacture a result.

## Explicit non-goals and next step

This ADR does not implement the URCE network controller, Bulk Storage, Transporters, MR escrow, Q4 migration, new custody writer or an event-driven Hopper watcher. The selected mainline URCE contract controls later regional authority and undecided governed-network Auto/Bulk/Wildcard priority; no Q5 schema or frozen #79/#82 implementation may be adopted.

**U1 source-only research result:** [Actual 1.4.2 differential and owner-shape call counts](URCE_150_U1_LAZY_ROUTING_SOURCE_PROOF_20261117.md). **Proposal A, naive lazy, NO-GO**: 144 mixed modeled columns had 246 more `sorterAt` calls and no `getSlot` reduction. **Proposal B, same-attempt native Block reuse, research-only**: 1,301→894 `sorterAt` calls on the same mixed cases, with two regressions and identical 4,801 `getSlot` calls; 350×4 constructed columns 2,100→1,050 `sorterAt` but still 18,900 `getSlot` each. The detailed model, native limits and stop/go criteria are in that report. **Do not change `addon/` or deploy LAB** on these source-only results; establish native reference validity/Collector timing before any runtime integration.

**Summary decision:** Stop costly evaluation at the earliest authority that can **prove** a negative; keep uncertain capacity and exact custody live.
