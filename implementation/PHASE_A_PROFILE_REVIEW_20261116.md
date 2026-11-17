# Phase A — P4b Bedrock diagnostics, native hotspot audit, and URCE-safe optimization plan

**Evidence review:** 2026-11-16 source captures, reviewed 2026-11-16 (America/New_York). **Current implementation source:** base-1.4.1 native-first P4b at `9a4e44093fbc9093d9bc985acce5348c8803c842`; subsequent branch documentation commits do not alter engine bytes. **Classification:** owner-provided LAB BDS profiling plus exact source review; optimization proposals **not implemented**, no new BDS acceptance, no production action. This is a preservation record, not a new logging/profiling subsystem.

**Primary archive provenance:** owner upload `diagnostics_2026-11-16_19-44-24.zip`, **18,143,253 bytes**, SHA-256 **`bd808203ca718ffd5e473a311e161dd257d8b8d448e29145bb1a09885ae16f81`**. The uploaded ZIP was directly reopened and all 20 members inspected: 10 native `.mcstats` files (including rotated `.0`/`.1` sections) and five JS/TS profiler pairs. The raw archive is NOT committed to GitHub. A future reader must use this SHA to authenticate a reattached copy; this report preserves useful findings if the chat attachment becomes unavailable.

**Source authority:** [P4b engine](https://github.com/partom24/HartLogistics2/blob/9a4e44093fbc9093d9bc985acce5348c8803c842/addon/behavior_pack/scripts/main.js), [owner-scale review and detailed earlier audit](https://github.com/partom24/HartLogistics2/issues/85#issuecomment-6934732158), [1.4.1/1.5 coexistence constraints](https://github.com/partom24/HartLogistics2/issues/85#issuecomment-6935291849), [current owner-selected URCE direction](https://github.com/partom24/HartLogistics2/blob/main/docs/UNIFIED_ROUTING_CUSTODY_ENGINE.md). The current URCE document *supersedes Q5*. The historical frozen 1.5 branch is not an implementation, test, fixture or design source for Phase A.

## 1. Reproducible parsing and confidence limits

- Each native `.mcstats` member has a three-line metadata preamble followed by individually base64-gzip encoded JSON records, often holding **two** sequential tick values per `server_tick_timings` leaf. Parse every record and every value; join rotated files by tick ID, not filename ordering. For 19:22, three suffixes yielded **400** script-tick values, not just the four records of the tiny unsuffixed file.
- All five TS profiles have exactly the **same sample IDs, timing deltas and start/end times** as their paired JS files. They are **one capture represented twice**, never two experiments or twice the CPU time. Analyze JS once per pair.
- `.mcstats` values under `server_tick_timings` are **microseconds**; divide by 1,000 for milliseconds. Percentiles here use **nearest-rank** positions. Previous written reports sometimes used interpolated percentiles, hence differences of a few tenths of a millisecond. These are distribution descriptors, not confidence intervals.
- V8/Bedrock profiler hits are **samples**, not exact native API invocation counts. Inclusive parent shares overlap nested child shares; sampled shares are **not** percent of all dedicated-server CPU or proof of causality. The `main.js` source dominates this JS script capture, but `script_tick` still represents the server's scripting work, potentially including other add-ons.
- Session timestamps name different conditions/revisions; owner confirmed P4 at 19:27 active, P4b unpowered at 19:44, and a P4 powered/settled capture at 19:22. Deployment/Q4 power/cargo equivalence at 19:38 was **not** independently established. No controlled code-speedup/regression claim is authorized from differences in these rows.

## 2. Five restored native BDS windows

| Session (Nov 16 local) | Tick values | script_tick median ms | P95 ms | P99 ms | >50 ms | level_tick median ms | JS profile duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 19:15 | 236 | 49.605 | 94.481 | 109.861 | 117/236 | 31.678 | 20.359 s |
| 19:22 powered/settled | 400 | 15.782 | 24.720 | 38.371 | 2/400 | 29.880 | 24.556 s |
| 19:27 P4 active | 144 | 55.930 | 76.575 | 85.661 | 105/144 | 28.331 | 16.587 s |
| 19:38 active, provenance incomplete | 238 | 61.782 | 97.273 | 112.573 | 228/238 | 29.366 | 17.403 s |
| 19:44 P4b active/unpowered | 272 | 73.506 | 108.958 | 136.703 | **272/272** | 31.364 | 27.136 s |

The five combined native windows contain **1,290 script_tick values**. The 19:44 native scripting-engine memory used was **~12,744 KB median**, near its 19:15 level, without an evident memory-growth signature in these short windows. Neither peak process memory nor short-window stability proves long-term leak absence. `script_job_tick` was ~0.003 ms median, not a meaningful target. Do not add independent per-tick instrumentation.

**Inference supported by changing workload:** the settled window is dramatically cheaper than active routing, but still spends native work on source Hopper/redstone, Collector adjacency and Receiver block checks. It is invalid to assign the entire timing difference to a code change.

## 3. 19:44 P4b active JS script-profile call tree

**Total JS samples:** 2,065,549 over 27.136 s. **Inclusive parent** buckets (children included, so percentages MUST NOT be added):

| Call tree scope | Inclusive sample share | Why this matters |
| --- | ---: | --- |
| `processColumn` inside `schedulerTick` | **79.1%** | Source checks, eager physical validation, per-slot work, destination lookup and actual admission |
| `findAcceptSlot` inside `processColumn` | **26.5%** | Repeated live destination `ContainerSlot` scanning, especially dense/storage offers |
| `collectorInputSources` | **9.9%** | Six live neighboring Hopper probes plus redundant Collector validation |
| `sorterAt` | **8.5%** | Many live block/type reads occur *before* any filter can reject a noncandidate |
| `hopperIsRedstoneLocked` | **8.5%** | Reads native Hopper state, but repeats Hopper type validation on an already verified source |
| `processReceiverDrain` | **6.5%** | Physical Receiver/Hopper probes happen before checking a zero Q4 queue |
| `compactSourceHopper` | **3.2%** | Already reduced by P4b; not the lead sustained-load target |
| `destinationFor` | **2.8%** | Can repeat Sorter lookup instead of reusing a validated live block |

Direct exclusive native API sample hits in the same JS profile: `Block::typeId` **268,636 (13.0%)**, `Dimension::getBlock` **211,429 (10.2%)**, `Container::getSlot` **205,730 (10.0%)**, `ContainerSlot::hasItem` **205,730 (10.0%)**, `World::getDimension` **157,757 (7.6%)**, `Container::getItem` **114,463 (5.5%)**, `Container::size` **98,676 (4.8%)**. These are sample hits, not calls. Multiple property/query steps frequently surround one logical routing decision.

**Powered/settled profile counterpart (19:22 profile recorded 00:21:59 UTC):** `processColumn` **54.8% inclusive**, `collectorInputSources` **22.1%**, `processReceiverDrain` **13.1%**, but `findAcceptSlot` only **2.1%**. Thus optimizing dense inventory scans *alone* will not solve the baseline/settled cost, and optimizing per-tick timers by reducing cadence will risk latency.

## 4. Actual topology and source anchors

Earlier engineering evidence decoded the 19:44 world's saved logistics registry: **675 Sorters in 182 columns**, of which **536 Filter**, **121 Wildcard**, **15 Auto**, **3 Bypass**. **135 columns were Filter-only**. The same record counts **56 Collectors** (46 linked) and **36 Receivers**, of which **26 had empty Q4 queues**. This is a reconstructed historical snapshot, **not** an acceptance test at the intended ~1,400-Sorter full-build scale. Do not infer unloaded/missing blocks from stale `present:false` alone.

The exact P4b source currently:
- `processColumn`: validates native source Hopper and lock/emptiness, then eagerly calls `sorterAt` and powered/mode checks for **every registered Sorter in the column** before inspecting five source slots. It repeatedly allocates Filter/Auto/Wildcard arrays and uses `src.size` in the inner loop. Selected destinations can call `sorterAt` again through `destinationFor`.
- `findAcceptSlot`: sparse fast paths help empty/single-occupied destinations; dense destinations still visit live `ContainerSlot` entries. It preserves compatible-partial-before-empty, live seeded Auto and enchanted-book enchantment-*type-set* matching.
- `processCollectorIngress`: validates `collectorAt`; then `collectorInputSources` calls `collectorAt` **again** and searches six live faces. Direct MR requires authoritative Q4 zero, loaded/unpowered Receiver and available output.
- `processReceiverDrain`: validates Receiver and output Hopper before `loadReceiverQueue(...).total` reveals there is no cargo.
- `schedulerTick`: visits every Sorter column each tick to observe vanilla Hopper cargo without a proven native Hopper-inventory-change event. Do not add an invented signal or reduce the one-tick observation opportunity.

**Owner-confirmed full-scale geometry, added 2026-11-16:** The [binding Sorter Array PNG](../OWNER_PRODUCT_OBJECTIVE.md) represents the intended repeated layout; **98% of real columns are four or five Sorters high** to keep containers reachable from the same player standing level. The earlier **675 Sorters / 182 columns** snapshot is a *temporarily reduced LAB*, not the normal full layout. At **~1,400 Sorters**, a typical four-to-five-high physical arrangement suggests **roughly 280–350 source columns** (central estimate ~311), not ~378 columns calculated by naively retaining the temporary LAB's 3.71-Sorter average. These estimates are not measured loaded active-column counts, and the top-down image cannot by itself reveal vertical layer count. **Architectural requirement:** keep real 4–5-high column ergonomics, exact repeated-bank connectivity and room for future horizontal expansion; no taller-stack workaround or arbitrary hard five-block software cap. Profile actual loaded, active and blocked columns separately and test correct route selection across all stacked entries.

**Transit-first reassessment (2026-11-16):** The owner established that ~1–2 Filter destinations per item in the intended governed network implies most nonempty source Hoppers are likely transit, not local routes. [P4c/P4d reordered qualification and conditional-compaction plan](PHASE_A_TRANSIT_FIRST_PLAN_141.md) preserves live five-slot match semantics, physical-active compaction, Auto/Wildcard fallback and existing 1.4.1 custody. Optimize *proven local nonmatches* before all-Sorter native block validation; no fixed one-in-three skip scheduler. This is a workload hypothesis until measured in owner LAB.

## 5. Recommended remaining Phase A optimization slices

### P4c-1 — Remove duplicate live-native reads (first, low risk)

1. Resolve the source Hopper's `Container.size` **once per processColumn invocation**, not per loop condition.
2. When a live block has already been positively verified as a Hopper, pass an explicit verified-Hopper context into the lock check so it still reads native `toggle_bit` but avoids a redundant `typeId` getter. Keep the general helper safe for unverified callers.
3. Compute redstone lookup keys from validated registry dimension/coordinates where equivalent, without repeatedly reading `Block.dimension`/`Block.location`; retain correct native event-state fallback and verify actual block identity.
4. Pass live validated Collector Block into `collectorInputSources`, and live Receiver Block into `receiverOutputHopper`. Reuse their Dimension **only inside that synchronous call**; keep six-face Hopper orientation and current redstone validation live.
5. Make Receiver drain **queue-total-first**: read authoritative `loadReceiverQueue(receiver)` and stop before native block/output probes if total is zero. Pending Q4/physical journal checks must remain in their original precedence and errors must HOLD, not assume empty. This exploits the historical **26/36** empty queues.
6. Reuse already validated live Sorter/Dimension/Block in destination resolution; never carry Block/Container views across ticks.

**Gate:** source-differential tests under 1.4.1 semantics plus exact P4b source behavior; then owner LAB matched active and powered sessions. Do not assume the proposed reduction will yield any particular millisecond improvement.

### P4c-2 — Non-authoritative Filter-first local column planner (highest structural opportunity)

Replace eager all-Sorter validation with a **synchronous local candidate-selection stage** using *current registry filter/mode data* and the actual native source ItemStack. Build **ordered candidate indices**, not another engine or writer. Preserve original **Filter → live seeded Auto → Wildcard**, bottom-to-top within each class, with Bypass excluded.

Only a plausible candidate incurs live `sorterAt`, power, destination, link, capacity, `isStackableWith`, and final source verification. All selected decisions are rechecked immediately before mutation. Do **not** memoize native chest occupancy/Auto seeds across ticks.

**Critical compaction condition:** the existing `compactSourceHopper` occurs after confirming at least one *physically active* Sorter, even if the present cargo cannot match that Sorter. An optimization that skips compaction merely because a Filter-first planner finds no route would change vanilla pass-through/starvation behavior. Preserve this physical-active gate (it may short-circuit at the **first** active Sorter), compaction position, and exact five-slot cargo order. Test filters that do not match, powered/all-bypass columns, unloaded entries, redstone changes, live frame/mode mutations and mixed source slots.

This is especially promising for **135 historical Filter-only columns**, but the saved registry snapshot is not an unconditional live-block cache. Rebuild indices on registry changes and always validate selected physical targets.

### P4c-3 — Revisit dense inventory offers *only after* route culling

Once unwanted candidate scans are eliminated, profile `findAcceptSlot` again. Only then evaluate repeat full-chest negative scans within a single synchronous, mutation-free pass, and reuse source ItemStack reads only where a final precommit check still protects mutation. Invalidate all temporary conclusions after a successful source/destination mutation; never reuse metadata-incomplete `exactStackSig` as full MR identity. Avoid speculative substitutions of native `Container.find`, `contains`, `addItem`, `transferItem` or `moveItem` for rules requiring exact slot, limited amount, Auto-seed semantics and journal behavior without exact-version Bedrock proof.

**Deprioritized:** further P4b Hopper compaction micro-tuning (~3.2% active), unrelated UI/proxy reconciliation, world migration reformatting and queue journal redesign. Do not weaken the existing two-write compaction's separate crash-safety obligations.

### P4c-4 — MR compatibility and acceptance *after* sustained-load optimization

Do not confuse performance optimization with MR safety. Source fault evidence shows current 1.4.1 physical journal reconstruction can omit metadata on an injected interrupted direct move. Historical PG20 native whole-stack routing and PG42 native carrier storage passed narrowly, but their **implementation is not part of this 1.4.1 branch**. After the P4 load changes stabilize, address exact MR direct routing/recovery conservatively using native complete ItemStacks where semantically appropriate and source-executed failure tests. No persistent 1.5 carrier, Bulk, Transporter, Q5 queue or generalized new custody writer in Phase A.

## 6. Explicit compatibility contract with the future 1.5 URCE

The owner-selected [URCE](https://github.com/partom24/HartLogistics2/blob/main/docs/UNIFIED_ROUTING_CUSTODY_ENGINE.md) is one *logical* routing/custody authority, **not** one global scheduler or physical parent block. Phase A may create the reusable local routing **control-plane reader** but must NOT create future network authority:

| Phase A optimization may own | Reserved for later URCE |
| --- | --- |
| Local column topology and Filter/Auto/Wildcard *candidate ordering* | Regional network ownership, distributed Filter adverts, governed Bulk policy and route authorizations |
| Native Hopper input observation/lock/compaction in an intake-specific adapter | Transporter as alternate input to the **same** Sorter semantics, without Hopper-specific assumptions |
| Validated live Sorter/Collector/Receiver block references for one operation | Durable cross-region epochs, seals, controller failover, long-range topology |
| Read-only local candidate plans rebuilt on configuration changes | One coordinated custody, ledger/journal writer and Q4→URCE migration |
| Standalone 1.4.1 Filter → Auto → Wildcard, protected redstone/BYPASS | Explicitly governed Filter → Bulk → wildcard fallback; final governed Auto precedence remains a separate decision |
| Existing Q2/Q3/Q4 and physical journals, unchanged contracts | New native MR physical custody slots, ordinary count accounts, safe migration/fencing |

**Reject in Phase A:** a physical Sorter-column controller block; an independent column/Collector/bank authority; new cross-tick inventory/destination occupancy/negative-route caches; a global script loop replacing regional coordination; reduced polling cadence or transfer budgets to hide CPU; a new durable accounting format, partial migration or Q5 intermediary; priority changes to preempt future Bulk governance; unauthorized use of frozen 1.5 implementation.

## 7. Evidence-to-acceptance sequence

1. **Source-only:** implement P4c-1 as independent small changes with original 1.4.1 and current P4b differential regression. Test all 1,024 five-slot Hopper occupancy patterns, filter enchantment/potion semantics, Auto seed changing live, partial-stack priority, stale/unloaded column entries, all redstone modes, nonmatching Filter-only compaction and interrupted Q4/physical journal refusal. Require full existing Windows/Linux CI and pinned `@minecraft/server@2.7.0` types. No “faster” claim based only on mocked call counts.
2. **Owner LAB performance:** one exact clean-commit stopped-LAB upgrade, exact installed BP/RP and world registrations, preserved backups and diagnostics. Repeat matched *powered/settled* and *active/unpowered* windows with identical Sorter/Collector/Receiver topology, input item distribution, Receiver queued/backpressure, power and outgoing paths. Native `.mcstats` and Script Profiler are preferred; debugger breaks separate from performance runs. Measure script p50/p95/p99, level work, raw sampled call paths and JS memory without adding telemetry.
3. **End-to-end functional proof:** verify actual source removal, final destination chest receipt, Collector/Receiver queue conservation, status/journals, filter/mode/redstone, mixed/opaque items and normal restart where affected. Reuse accepted old tests for unchanged semantics rather than repeating PG20/PG42 feasibility. Treat actual abrupt-crash atomicity as a distinct unresolved gate.
4. **P4c-2 then P4c-3** only if preceding fixes pass. Do not merge all speculative optimizations at once. Reprofile after each causal change under the same owner-specified workload. Both **675 active-Sorter temporary layout** and eventually the restored **~1,400-Sorter** owner full-array context matter; the former cannot certify the latter.
5. **Completion:** Stage/Phase A needs successful native-first 1.4.1 behavior, safe saved Q4 and MR compatibility, demonstrated active-routing responsiveness/throughput at representative owner scale and measured performance suitable for server tick budget. The recovery mandate's prior 19.5 TPS and script p95 10 ms/p99 25 ms values are **provisional engineering targets**, not secretly adopted acceptance limits. Current active script p95 ~109 ms is clearly unacceptable for steady 20 TPS, but a numeric future gain cannot be promised without controlled trials.

**Result:** Start with **P4c-1 duplicate native work elimination** and the **P4c-2 non-authoritative local Filter planner**, while keeping native Hopper observation, every custody writer, Q4 saved data, original standalone routing policy and future URCE controller/custody boundaries intact. Perform MR hardening after the sustained-load work, per owner direction. This is a documentation-only plan, with no gameplay source or LAB change.
