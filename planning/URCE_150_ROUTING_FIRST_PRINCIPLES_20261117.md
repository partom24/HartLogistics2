# URCE routing — answer the inexpensive questions first

> **Document role:** Evidence review and design rationale. The normative, testable decision boundaries are in [URCE-ADR-001 — Route eligibility before native admission](URCE_150_EARLY_DECISION_ROUTING_CONTRACT_20261117.md). No URCE gameplay change is authorized here.

**Decision review:** 2026-11-17. **Basis:** actual 1.4.2 engine `addon/behavior_pack/scripts/main.js` on `baseline/native-first-142-20261117` (P4e source with version string 1.4.2). This is a *read-only architecture decision*, **not a runtime feature, performance claim, or permission to bypass Q4**.

## The three independent questions

1. **Routing eligibility:** *Which Sorter might accept this item according to its policy?* Use source and known configuration. Do not inspect destination slots or serialize the payload.
2. **Live admission:** *Is that particular eligible target still physically present, enabled and able to accept at least one unit now?* Use live native block, redstone, container/queue and exact partial-stack compatibility; defer until the candidate is attempted.
3. **Custody:** *How many units can we durably and exactly transfer without losing/duplicating identity?* Use current Q4/physical journals and verified original ItemStack. Do not confuse a routing decision with an insertion receipt.

**Simpler URCE hypothesis:** a **small, lazy per-source tiered decision tree**, not a world-wide route snapshot or per-tick inventory-capacity ledger. Do not create a global planner or reroute engine before proving these early exits are missing and valuable.

## Actual 1.4.2 Sorter path, grounded in source

1. `schedulerTick` (~3936): if not ready or pending physical/queue journal, stop; rebuild dirty *configuration* column groups; round-robin each column with a global **256** movement budget. **Still polls every column every tick** because native Hopper content-change events are not proven.
2. `processColumn` (~3542): resolve dimension/Hopper, stop if locked, obtain native inventory, `firstItem()` empty stop. No Sorter or destination lookups for empty Hopper.
3. `provenTransit` (~3565): when *all* configured Sorters are Filter/Bypass, scan all occupied source slots and prove every one misses all configured Filters. If so, check just enough live Sorter state to preserve necessary **Hopper compaction/pass-through**, then **return without any destination scan**. It already answers an important early-negative question.
4. Otherwise `activeSorters` (~3622) eagerly calls `sorterAt`, `blockIsRedstonePowered` and `sorterMode` **for every Sorter in the column**, before examining each source stack's potential targets; then `compactSourceHopper`.
5. For each source slot, `processColumn` (~3646) constructs `specific` Filter matches with `matchesFilter`, then *all* Auto and *all* Wildcard groups, concatenates into `targets`, then tries candidates in that priority order, bottom-to-top.
6. Each attempted candidate rechecks mode and Filter, runs `destinationFor` (~3077, live Sorter/direction/destination inventory/Collector registration), then `sorterCollectorRoute` or `findAcceptSlot` (~3180). A full chest can still have an admissible **partial stack**; native `emptySlotsCount===0` alone is **not rejection proof**. Auto's seed must be live, with enchanted-book enchantment-type exception.
7. Only after a positive admission and positive bounded `want` does the engine call `safeMovePartial` or `enqueueFromSource`, with original **16 per column**, exact slot/quantity/identity journal and fail-closed recovery. Continue with remaining item quantity/other candidates while budget and source allow. Finally compact only if transfers created gaps.

`sorterMode` (~653) is currently a lightweight registry lookup. `matchesFilter` (~2901) first compares `ItemStack.typeId` and, only for potions or enchanted books, checks the specific potion identity or enchantment *type set*. For other Filter items (including gear/tools) the match is by base item ID. That establishes a safe cheap **first-stage filter** but does not establish whether native physical destination slots can stack the exact item.

## Proposed early-stop ladder

| Earliest stage | Cheapest conclusive question / input | Safe action | Work avoided |
| --- | --- | --- | --- |
| 0. Global | Not ready, journal still pending, or no remaining budget? | Stop scheduling new Hart transfers; keep original recovery path | Every source and destination read |
| 1. Live intake | Hopper missing, powered/locked, inventory unavailable or `firstItem()` empty? | Stop this column, leaving vanilla inventory intact | Sorter block/status and destination reads |
| 2. Source + *configuration* only | No configured Filter could match **any** occupied source slot, and no Auto or Wildcard eligible in the column? | **Transit**, but preserve the original condition for compacting a Hopper under at least one physically active Sorter; never silently drop that step | All destination resolutions and 27/54-slot scans |
| 3. Per-item route tier | For this stack, no Filter matches its type/potion/ench-book policy? | Skip Filter candidates without block/destination reads; **still evaluate Auto/Wildcard** | Filter live block checks, destination reads and admission |
| 4. Per-candidate live eligibility | Sorter missing, quarantined, Bypass, powered or route invalid? | Skip only this candidate; use live state (not stale config) | Destination inventory resolution and native scan |
| 5. Destination kind | No supported storage, invalid/missing native container, Auto points to Collector, Collector unlinked or powered or Receiver missing? | Skip candidate, not all lower-priority candidates | Exact capacity scans, queue serialization/journaling |
| 6. Final native/queue admission | Auto has no **live** seed, chest has no exact partial/empty slot, queue unreadable or has no authoritative room? | Leave item at source and try next candidate; ambiguous queue/inventory never authorizes write | Serialization/physical journal and item mutation |
| 7. Exact custody | Quantity is zero, source changed, item is not safely serializable for Q4, journal pending/uncertain, or destination changed? | No new transfer; durable **HOLD** on ambiguous ownership | Dangerous debit, duplicate/replay or metadata loss |
| 8. Done | Source slot empty or global/column budget exhausted? | Stop this source/column; otherwise continue next priority/candidate as in 1.4.2 | Useless further target checks |

**Nonnegotiable:** a failed higher-priority candidate does **not** mean the item is undeliverable. It must be able to try the next Filter, seeded Auto, and then Wildcard. After a partial successful transfer, stopping the entire source route would change existing multi-destination behavior. A missing/unloaded future regional Bulk member cannot be treated as a known-full bank, and network-governed Wildcard fallback must respect the still-open URCE policy.

## Smallest useful simplified path to test

```text
Recover / validate budget
    ↓
Live input Hopper? unlocked? nonempty?  —NO→ RETURN
    ↓
Inspect minimum source identity (typeId; potion/enchant-type details only if needed)
    ↓
Can a configured Filter match?  —NO→ bypass all Filter target lookups
    ↓
Lazy tier order: matching Filter → Auto → Wildcard
    ↓
For ONE candidate: live Sorter/redstone/mode → live destination kind
    ↓
Live seed/capacity or authoritative queue room (at most one candidate at a time)
    ↓
Only then: exact identity/quantity, journal, debit/credit, recovery
    ↓
Source empty or budget depleted? —YES→ STOP; otherwise next eligible route
```

Do not eagerly build complete `specific + auto + wildcard` arrays if a lazily evaluated Filter suffices. Do not eagerly resolve all Sorter blocks on any nonempty input if a cheap configured-policy rejection already excludes most of them. **But** the current column is generally only a few Sorters tall; cheap registry loops and tiny JS arrays may not be measurable, while one native 54-slot negative scan is expensive. Verify improvement before introducing any index/map/durable state. A global item-type index is **not** the default; only consider it if independently measured network-scale route-candidate count justifies its invalidation complexity.

### Payload minimization

- Initial route key = source slot reference + `typeId`, with *optional* potion identity or enchantment-type set, only when relevant to potential Filter rules.
- Keep original native `ItemStack` authoritative; do **not** pre-clone or serialize full metadata for mere policy matching.
- The existing `sorterCollectorRoute` performs `serializeQueueItem(stack)` **before** `loadReceiverQueue` and full-capacity check. For a proven full queue, that serialization is wasted; **research** a two-phase cheap eligibility/fullness ordering *without* trusting stale `receiver.queued`, changing the unreadable-queue fence, or penalizing the common accepting route. This is a concrete early-payload opportunity, not an approved code change.
- Physical destinations only build their journal transport identity **after** `findAcceptSlot` produces an actual slot and amount; preserve this.
- If a source compaction runs before routing, reread live slot identities before any debit; source slot positions may have changed. Do not keep stale per-source route snapshots as physical authority.

## Falsifiable engineering checks — before URCE gameplay

1. Source-only differential: original 1.4.2 `processColumn` vs proposed lazy tiers for mixed five-slot Hoppers and 4–5 Sorters. Compare ordered candidate attempts, move count, source/destination, compaction, route priorities and every Q4 journal transition. Include Filter, Auto seed, Wildcard, Bypass, missing/powered Sorters, all-bypass, no match, distinct potion identities, enchanted books, partial destinations and metadata-incompatible stacks.
2. Count **live native block queries, destination resolutions, expensive `findAcceptSlot` invocations, and actual slot reads** (not just JS iterator allocations), showing where any work was *actually* eliminated. Report separately: candidate policy rejections, live Sorter rejections, physical admission failures and successful deliveries.
3. Use matched owner BDS native debugger/profiler/diagnostics with unchanged cargo+topology to validate the call pattern. Do not build a permanent telemetry subsystem; source tests and selective breakpoint/callgraph review are adequate for the design decision.
4. Reject this simplification if it only saves cheap JavaScript comparisons while native admission scans and measured script time remain unchanged, or if it changes Hopper pass-through/custody. Do not simply introduce another global index, controller or cache to claim progress.

## First-principles verdict

**Answer the negative question at the earliest authority that can prove it.** Configuration can say a route **cannot match**; it cannot say a physical destination has no capacity. Native inventory can say a specific exact stack fits **now**; it cannot independently prove a cross-inventory transaction. The Q4 custody boundary can authorize and recover a bounded write; it must not be invoked for a route we already know will be rejected.

**Next discrete action:** independently model a lazy, tiered **read-only candidate sequence** against the exact 1.4.2 source, *before* beginning a controller graph or new writer. This remains 1.5 planning/source-only work.
