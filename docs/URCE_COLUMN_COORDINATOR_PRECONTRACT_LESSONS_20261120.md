# URCE + Column Coordinator — Pre-contract lessons and proof boundaries (2026-11-20)

**Status:** Owner accepted the **architectural direction** on 2026-11-20. This is a **lessons-learned handoff before the implementation ownership contract**, not a finished API contract, a deployed feature, an optimization acceptance, or permission to change LAB/production. No gameplay/runtime files were changed by this documentation exercise.

**Evergreen discoverability:** Canonical document is on the repository's main branch; identical discovery mirrors are intended for the active URCE planning and development branches. New branches should carry this document or link to its main version. Start with PROJECT_CONTINUITY.md and docs/CANONICAL_EVIDENCE_AND_TOOLING.md for the separately protected, immutable historical evidence; this newer engineering note **does not replace** those sources or their pinned SHA/provenance.

**Current implementation inspected:** partom24/HartLogistics2, branch dev/urce-150-runtime-20261118, commit 0f0034469f6e064d2c211dc1ec8db18c83454646, manifest 1.5.8-dev with @minecraft/server 2.7.0. Branch names and runtime implementation can advance; verify actual HEAD before development.

## 1. Accepted direction and responsibility boundaries

The owner selected a three-part logical model:

| Concern | Owns | Does not own |
| --- | --- | --- |
| **Column Coordinator** | Per-column source-Hopper observation, scheduler deadlines, local Sorter order/filter-index and configuration-derived candidate hints; optionally *non-authoritative* destination availability observations | Network-global destination arbitration, managed link safety, durable item custody, second chest inventory ledger |
| **URCE routing authority** | Network-wide source-specific reachability, route policy and candidate arbitration, managed cycle/unknown-boundary checks, directed network decisions | Native inventory truth, spontaneous authorization from a cached graph or chest count, direct item debit/credit |
| **Shared custody protocol** | Final live source/destination admission, correct item quantity/identity, native/Q4/MR/Bulk adapter-specific transfer fencing, journaling and recovery | Recomputing global routing at every transfer as an inherent requirement, treating an intent or route snapshot as a receipt |
| **Vanilla Bedrock** | Native Hopper movement and external inventory changes | Hart-owned logical authorization or durability guarantees |

**One logical custody contract does not imply one physical controller or one universal transfer routine.** Keep existing protected physical and Q4 writers; future MR/Bulk adapters need separate proven storage mechanisms under the same ownership invariant. No second independent source debit path.

**Passive transit is distinct from a managed handoff.** An item traversing an irrelevant, nonmatching local Sorter column can remain under vanilla Hopper control, with no Hart transaction. “No local Filter claim” is not “no network home.” For a new Hart-managed forwarding operation, no verified reachable home/authorized buffer means **no new Hart movement**; unknown must HOLD at the existing authoritative custodian. Do not claim Hart can freeze vanilla or other addons' transfers.

## 2. What is already implemented in the reviewed code

- main.js rebuildTopology() groups vertical Sorters and processColumn() handles current native Hopper, Filter/Auto/Wildcard/Bypass, compaction and protected storage/Collector movement.
- schedulerTick() currently visits **all registered columns every tick** under the global movement budget; there is **no persistent Column Coordinator or adaptive per-column poll schedule**.
- The **Filter/Bypass-only transit-first fast path already exists**: empty Hopper exits before Sorter/destination reads; when all occupied source stacks are proven nonmatching, destination chest scans and network checks are avoided. Preserve the required native source compaction semantics. Do **not** count this existing saving as a new optimization.
- findAcceptSlot() already uses native Container occupancy/slot interfaces, permits compatible partial stacks even in full chests, and checks Auto seed live. A chest's overall full/empty bit is not an item-specific admission decision.
- destinationFor() can register a Collector/update its present state, causing persistence. Therefore **candidate discovery is not always read-only** in current source; the future contract must separate pure discovery from registration/maintenance side effects.
- main.js already executes Collector ingress, Receiver drain, Q4 custody, physical journals and crash recovery. Existing safeMovePartial(), enqueueFromSource(), dequeueToReceiver(), related entity/direct-only writers and recovery must remain protected. An exact transitive callback-to-writer census is still required for new writers.
- urce_152_live_link_guard.js actively handles Collector/Receiver live safety; reuses read-only observations within a tick and only bounded negative HOLD/REJECT results across ticks, **not positive cargo permission across ticks**. The observer includes native Hopper witness and visual Transporter-bank inspection.
- urce_152_route_model.js is a read-only routing **prototype**, not the active global arbitration engine in main.js. The URCE engine is therefore **partially operational, not fully unified**.
- urce_150_readonly_runtime.js operates Transporter visuals/player diagnostics; visible pipe connectivity is not proof of item movement or native cargo custody. Bulk Storage remains a preview, not implemented integrated Bulk custody.

Pinned source entrypoints:
- https://github.com/partom24/HartLogistics2/blob/0f0034469f6e064d2c211dc1ec8db18c83454646/addon/behavior_pack/scripts/main.js
- https://github.com/partom24/HartLogistics2/blob/0f0034469f6e064d2c211dc1ec8db18c83454646/addon/behavior_pack/scripts/urce_152_route_model.js
- https://github.com/partom24/HartLogistics2/blob/0f0034469f6e064d2c211dc1ec8db18c83454646/addon/behavior_pack/scripts/urce_152_live_link_guard.js
- https://github.com/partom24/HartLogistics2/blob/0f0034469f6e064d2c211dc1ec8db18c83454646/addon/behavior_pack/scripts/urce_152_link_snapshot_gate.js

## 3. Earliest-safe-exit decisions, not cheapest-looking API ordering

Desired **logical** sequence: ready/journal/movement-budget fence → loaded/unlocked live source and native nonempty test → cheapest authoritative local Filter/Auto/Wildcard eligibility → validate attempted candidate's live block/route kind/redstone → establish *appropriate item representation* → authoritative destination admission, including live seed/partial/queue state → required fresh managed topology proof → common protected transfer/custody writer → update hints. It is a staged decision model, not a promise that any one API order is always optimal.

**Critical U1 research NO-GO:** Do **not** unconditionally hoist loadReceiverQueue() before serializeQueueItem() to reject full queues. The queue loader can initialize, synchronize, migrate or clean legacy Q2/Q3/Q4 state; rejected/unrepresentable items should not cause those effects. Nonqueueable native/direct-only items have a different zero-backlog condition. Prior source-executed counterexamples explicitly rejected blanket queue-capacity-before-serialization ordering. The observed route safety cost is not justification for violating these side-effect boundaries.

A cheap *read-only and proven* impossibility check may be moved earlier; an authoritative live capacity or maintenance operation cannot be assumed cheap/pure. Retain source-slot rechecks, exact metadata and no guessing from receiver.queued or old chest capacities.

Historical decision/source:
- https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_U1_COLLECTOR_CAPACITY_FIRST_RESEARCH_20261117.md
- https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_EARLY_DECISION_ROUTING_CONTRACT_20261117.md

## 4. Column Coordinator rules learned from the 101-column thought experiments

- Grouping 4–5 Sorters into a column **is already source-implemented**. A coordinator should primarily be an inexpensive **local scheduling/configuration index**, not a full inventory scanner or second routing engine.
- Keep configured Filter eligibility distinct from **live Auto seed** and **live slot capacity**. A previously full chest can become partially/fully available through a player, Hopper or third-party addon; a previously available chest can fill or break. A stale “full” hint must not skip an eligible candidate or authorize Wildcard/Bulk fallback.
- Use native firstItem(), emptySlotsCount, firstEmptySlot(), getSlot() and exact isStackableWith() where safe; avoid copying all unrelated ItemStacks. For a Hopper with one item already in slot 0, a validated single-occupant path may avoid repeated five-slot scanning/compaction, but must fall back if occupancy is ambiguous, item moved or other slots contain items.
- Cached mode/Filter indexes need exact invalidation/requalification on player actions, registry changes, reloads and before actual movement; special potion and enchanted-book matching semantics must be preserved. Prefer the **simplest measured representation**, not a compulsory global item directory.
- Preserve Filter before *live-seeded* Auto; preserve bottom-to-top order within a column; future network candidate arbitration considers verified reachability/cost and product-specific Bulk/Wildcard/terminal policy. One maintained policy implementation should serve local/governed contexts, not two competing rule sets.
- A local no-match must not trigger native destination chest scans or a global Transporter scan. Conversely, a global remote-claim absence cannot be inferred from just one column.
- Compaction remains important: vanilla Hopper input fills early slots and local Sorter removal may create gaps; optimized source scans must not strand trailing, unmatched stacks.

**Scope of scenario estimates:** Earlier conversations used 101 columns × five Sorters, first a single cobblestone target and then five repeating ordinary items with targets 20 columns apart. All reported pre/post counts and adaptive savings were **hypothetical accounting under specified residence/arrival/scheduler assumptions**, NOT execution of proposed code in full-runtime tests and NOT BDS benchmarks. Do not promote exact numerical totals or implied interception guarantees into acceptance criteria. Implement an executable source-based fixture and verify the counts and item outcomes.

## 5. Adaptive polling: scheduling is easy; correctness is not

- The currently observed baseline is **one source-Hopper inspection per column per tick**. One shared scheduler with independent per-column next-due ticks is preferable to hundreds of runInterval callbacks.
- Candidate adaptive modes: every 1 tick when active/uncertain, 2 ticks when safely eligible, 4 ticks for validated quiet configurations. These are **unapproved rates**, not proof of lossless sorting or performance results.
- The trigger for speeding up cannot depend solely on discovering an item: a 2-tick residence between ticks 0 and 4 can be invisible to a four-tick observer. An empty recent poll does NOT prove no item passed in between.
- Hopper minecart **above** a normal Hopper is a real input arrangement to include in tests. Fast filling upstream and fast residence/transit **through the Sorter source Hopper** are different questions. Nominal ordinary Hopper transfer intervals alone do not prove the minimum observed residence or phase safety, especially under burst/external writer configurations.
- A skipped inspection due to movement-budget exhaustion or scheduler work cap violates even the nominal interval. Track worst inspection lateness separately from move quantity and make scheduling fair and bounded.
- Until BDS phase/residence tests prove a slower policy for each supported configuration, treat one-tick polling as the conservative baseline. An event is useful for invalidation/wakeup only when Bedrock actually exposes a reliable event for the event in question; **do not invent a Hopper-inventory-change event**.
- Test multiple arrival offsets, 1/2/4/8-tick residence, ordinary Hopper chains, minecart-over-Hopper inputs, packed and sparse five-slot sources, redstone, full outputs and source mutations while idle. Item conservation and correct interception take priority over a lower call count.

## 6. URCE topology cost: where to offload work

- Current active link safety can observe **all** known native Receiver Hopper witnesses and Transporter endpoint components during a positive managed route decision, rather than just the relevant source's route. This was a principal active-routing hot path in the owner's earlier profiling discussion, but source costs and profiler inclusive timings must not be misrepresented as a proven per-transfer saving.
- Potential work reduction: maintain cheap endpoint/incoming-link indexes; reuse same-tick composed graph structures; gate managed safety behind conclusive local/identity/admission negatives; investigate source-reachable observation instead of re-traversing unrelated components.
- Source-scoped observation requires **full proof of cycle/unknown-boundary semantics**, including directed back-edges, converging paths, unloaded Hopper boundaries, Transporter components and topology changes outside Hart events. A topology revision counter is not sufficient proof that physical vanilla paths have not changed. No positive across-tick route authorization by cache.
- Receiver Q4 queue currently lacks authoritative per-item origin-Collector records; live drain protects against unsafe linked sources by checking all relevant incoming links. Preserve that HOLD rule until a validated replacement ownership model exists.
- Transporters are visible logical infrastructure: moving an item through every pipe is not a requirement. Native Hopper movement and actual endpoint custody handoffs remain real; never infer a physical receipt from a drawn line or a graphical connection.

## 7. Player-approved URCE product policy to preserve

The later 2026-11-18 owner product contract supersedes older per-bank controllers, compulsory final Wildcard or terminal and Q5 assumptions:

- Automatic path-based networks; directed acyclic managed routing, branch and merge support; source-to-destination reachability, not proximity.
- Filter claims before eligible live-seeded Auto; actual destination admission checks continue through compatible partial stacks and other candidate destinations. Compare cross-column transaction cost without overriding policy/local Sorter order.
- For governed claimed ordinary cargo or known Bulk home, attempt Filter/Auto, then verified reachable Bulk; Wildcard only when applicable Bulk authoritatively exhausted. For truly unclaimed ordinary cargo: reachable Wildcard → optional terminal Collector → verified Bulk overflow → HOLD. Unknown remote claim/Bulk status cannot be silently interpreted as full, absent or a reason to forward.
- Bulk Storage is a Bulk controller/storage member, **not a Bulk Sorter**; future network-wide capacity must have independently authoritative member accounts and safe split/merge authority.
- MR cargo retains exact native ItemStack fidelity; do not serialize or flatten unrepresentable identities into ordinary count buckets. Current native MR feasibility evidence is accepted only at scoped primitive level (PG20 direct native movement, PG42 native entity inventory survival through ordinary restart); native MR endpoint custody, crash/unload handling and safe integration remain OPEN.
- No speculative bank-to-bank bouncing, no needless Bulk draining when current Receiver cargo already serves demand. Every item must remain accounted to a discoverable custodian; HELD/STORED identity and reason must be player-visible.
- Test any valid player-built topology and any legitimate item identity; deterministic 101-column, 1,400-Sorter or named-cobblestone fixtures are tests, **not gameplay layout or item allowlists**.
- Preserve Q2/Q3/Q4 saves, world/pack identities, redstone, Dropper/Dispenser behavior, existing links/journals, and no-loss/no-duplication recovery. FIFO is not a new requirement; do not revive Q5 or frozen #79/#82 gameplay.

Authoritative product sources:
- https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md
- https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PLAYER_FIRST_TESTING_DECISION_20261118.md
- https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_CROSS_BRANCH_NATIVE_MR_EVIDENCE_REUSE_AUDIT_20261118.md

## 8. Pre-contract proof matrix / acceptance ordering

| Gate | Necessary before declaring it completed | Status at this handoff |
| --- | --- | --- |
| **U0 full writer/side-effect census** | Trace all system intervals, world callbacks, player/UI events, entity paths, startup/migrations, direct inventory/Q4/world mutations and recovery, including transitive calls | OPEN; previous lexical sweeps are not sufficient |
| **U1 routing equivalence and authority handoff** | A single candidate policy with explicit local vs managed scope and side-effect-free proposals; compare current/next routing, fallback order, partials, redstone, registry updates | PARTIAL/PROPOSED |
| **U2 custody and migration** | Shared logical Hart ownership protocol and exact adapters, interrupted write cutpoints, ambiguity HOLD, q2/q3/q4 compatibility, foreign writer interactions | Existing physical/Q4 writers; unified new-writer proof OPEN |
| **U3 native MR endpoint integration** | Reuse native-carrier primitive proof; integrate safe source/Receiver ownership, finite capacity, metadata fidelity, unload/restart/abrupt-crash behavior | Primitive available at historical scope; integration OPEN |
| **Coordinator + adaptive cadence** | Differential tests against unchanged 1-tick runtime; multi-slot, races, activity phase, worst poll lateness and native BDS Hopper timing | NOT IMPLEMENTED / UNPROVEN |
| **Topology optimization** | Same decisions as full snapshot across cycles, unknowns, all relevant incoming links and physical/external mutations, at lower native reads | PROPOSED / UNPROVEN |
| **Performance and release** | Real full-runtime instrumented native calls, BDS Script Profiler/VS Debugger/diagnostics, end-to-end item count/identity, player responsiveness, approved LAB, separate release approval | NOT ESTABLISHED by models |

**Tests to add before freezing changes:** full-runtime 101-column × five-Sorter model with five repeating item types and destination columns spaced 20 apart; baseline and redesigned code executed rather than arithmetic-only simulation; isolated no-match, mixed Auto/Wildcard and partial-stack cases; capacity-changing external writers; broken/unloaded chests; Collector/Receiver and terminal/Bulk candidates; native MR exactness; loaded/unloaded, branch/merge/cycle/Transporter graph; persistence/recovery cutpoints; random coordinates/rotations; transient burst and steady-state samples. Compare destination lookup counts, slot API calls, full native runtime calls, graph scans, journal writes, moves/quantities, worst tick latency, poll lateness and conservation. No native-call reduction by itself proves server-time reduction.

## 9. Questions to settle in the NEXT formal ownership contract

1. Exact handoff shape from Coordinator local observations to URCE planner (candidate, source identity, configuration revision, uncertainty), and whether local-only routes can use a common policy module without invoking a global graph.
2. A pure discovery interface distinct from destinationFor() registration side effects, source revalidation and durable writers.
3. Explicit HOLD/NO_LOCAL_CLAIM/NO_SPACE/UNKNOWN/REPLAN distinctions; a denial at one candidate cannot erase other eligible candidates or authorize speculative fallback.
4. Exact movement authority and fault/recovery semantics for source Hopper, ordinary storage, Q4, native MR and future Bulk, including concurrency with vanilla and third-party writers.
5. Minimal observability/validity contract for positive network-route decisions and route-specific graph optimization.
6. Scheduler deadlines, conservative cadence eligibility, integration with global budgets, admission fairness and appropriate performance stop/go tests.

**Design disposition:** Adopt the Column Coordinator + URCE routing + shared logical custody protocol. Do **not** freeze the adaptive intervals, cache scheme, graph observer optimization, batching policy or new writer until each passes its own correctness/performance proof. This handoff records lessons and pending evidence, **not** an implementation API specification or a completed URCE engine.
