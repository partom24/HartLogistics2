# URCE 1.5 — Transporter, batching, BDS playability and November 17 measured capture

**Date:** 2026-11-18. **Authority:** Owner's discussion of the P4→URCE handoff and Transporter purpose, exact 1.4.2 source, owner-uploaded November 17 BDS capture, and official Bedrock Script API documentation. **Scope:** architecture/evidence only, not gameplay or performance acceptance.  
**Later owner clarification:** [URCE-ADR-003 — Transporter network infrastructure](URCE_150_OWNER_TRANSPORTER_INFRASTRUCTURE_DECISION_20261118.md) supersedes any reading of the Transporter as a mandatory pipe-by-pipe item mover or intrinsically fast transfer block.

**Related:** [owner product contract](URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md), [pre-code proof gate](URCE_150_PRECODE_READINESS_AND_PROOF_GATES_20261118.md), [source writer census](URCE_150_ACTIVE_142_WRITER_CENSUS_20261117.md).

## 1. Owner-accepted direction and its boundaries

1. The extensive **P4 native-first optimization** of the 1.4.2 source is the baseline. Further meaningful performance work overlaps **URCE** responsibilities (choosing necessary routes, avoiding useless admission, selecting transaction density and safe custody). Do not redo rejected P4g callback-local cache or naive U1 lazy-rewrite research, or alter the P4e baseline to pursue these ideas.
2. A high routing workload is often a **temporary burst** in the owner's expected gameplay pattern. **Clear legitimate backlog as quickly as is safe while maintaining a playable, stable BDS**, rather than minimize each tick's script cost at the expense of a long continuous backlog. Include a separate sustained-arrival case because a large installation can remain busy indefinitely. The owner did **not** adopt a numeric mandatory TPS threshold.
3. **Number of items transferred, number of transfer transactions, fixed cost per transaction, and peak tick cost are different quantities.** Prefer more items per *verified productive* transfer where it amortizes work, without exceeding safe storage, true ItemStack, journal or tick limitations.
4. **Vanilla Hoppers remain supported and are not a mechanism to speed up internally.** The **Transporter's real primary purpose is human-understandable network infrastructure**: its connected visible path expresses logical reachability. Items may move safely between actual custody endpoints **without ever entering intermediate Transporter blocks**. High-density useful movement and short backlog duration are URCE engine goals, not mandatory Transporter-by-Transporter motion or intrinsic block throughput. Do not claim a native Hopper can be made faster or that remote endpoint delivery is proven.
5. Preserve the product contract: **verified reachable home before Hart-script movement**, no loops, no unnecessary Bulk competition against available Receiver traffic, no Transporter-to-ordinary-output-chest bypass, Filter→live-seeded Auto priorities, per-column bottom-to-top, MR fidelity/priority, HOLD/backpressure and safe Q2/Q3/Q4 world data. Native Hoppers and foreign writers cannot be globally stopped by a Hart script routing HOLD.

**Status distinction:** The above are accepted **product goals / architectural boundaries**, not an owner-approved 32/64-item cap, a specific scheduler, a native transfer protocol, or runtime integration authorization.

## 2. Actual 1.4.2 source transaction model

Source: `addon/behavior_pack/scripts/main.js` on this planning branch, exact 1.4.2 P4e development baseline (4,417 lines; expected SHA-256 `2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411`).

- `PER_COLUMN_BATCH=16`, `COLLECTOR_BATCH=16`, `RECEIVER_BATCH=16`; Sorter and logistics stage budgets are each 256 items per tick. `schedulerTick` and `logisticsTick` each run at `system.runInterval(..., 1)`. These are **attempted quantity budgets**, *not* measured useful items/tick and not a unified 256-item end-to-end network budget.
- Successful native Sorter `safeMovePartial` (source lines ~3418–3471) performs physical source/destination `setItem` and prepares/clears a persistent physical journal **once per successful transaction**, regardless of quantity. A full source stack and exact accepting slot can avoid repeated overhead if one verified quantity is moved safely, but no physical cross-domain crash-atomicity has been proved.
- Q4 `enqueueFromSource` and `dequeueToReceiver` separately journal and update the affected queue page/meta plus a source or output inventory slot per transaction. Q4 transactions may merge same-identity entries; changing batch size can change page/write frequency, recovery witnesses and fairness. Neither operation is a free count change.
- Vanilla Hopper progression and slot capacity remain real bottlenecks; a larger input to a Hopper does **not** prove higher eventual chest throughput. Nonstackable/MR items cannot be counted as interchangeable 64-item ordinary batches. For any path, there may be multiple real custody boundaries, even when logical route lookup is skipped.

## 3. November 17 BDS capture: provenance and measured signals

**Owner binary source:** [Capture_2026-11-17T22-04-33.835Z_TS.zip on main](https://github.com/partom24/HartLogistics2/blob/main/Capture_2026-11-17T22-04-33.835Z_TS.zip), 14,687,102 bytes; also directly attached and decoded in this conversation. It contains **four distinct roughly 20-second CPU profiles** (JS and TS symbol maps for the same profile, **not independent runs**) and six `.mcstats` files representing **three diagnostic sessions**. The owner-provided raw source is evidence; the numbers here are derived, **not** a controlled test of batching. Preserve timestamps and never merge non-concurrent CPU and Q4 windows as though they sampled the same ticks.

### CPU profiles — source-attributed calls

| Nov 17 local capture | Profile time | Ready scheduler callbacks | Calls/sec (proxy) | Sorter admission attempts | Native `getSlot` reads | Successful Sorter transactions | Q4 ingress transactions | Q4 drain transactions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 15:26:39 | 19.424 s | 229 | 11.79 | 6,139 | 328,909 | 28 | 16 | 16 |
| 16:22:29 | 19.676 s | 259 | 13.16 | 6,320 | 324,092 | 8 | 33 | 28 |
| 16:25:19, P4e | 19.727 s | 193 | 9.78 | **9,425** | **487,223** | **21** | 35 | 36 |
| 17:04:33 | 19.613 s | 217 | 11.06 | 6,166 | 324,240 | 48 | 20 | 113 |

**Derivation:** Count `findAcceptSlot`-attributed `Container.size` as admission attempts; `Container.getSlot` as live slot reads; source/destination `setItem` from `safeMovePartial` in pairs as completed physical Sorter transactions. Queue ingress/drain counts are from their individual source write calls. The 1-per-tick ready scheduler callback is a **proxy** for observed cadence under profiling, **not independent true TPS**; an actual live server timing series is required for TPS attribution.

P4e averaged **51.69 destination-slot reads/admission**, but completed only **21** Sorter transactions across **9,425** attempted admissions (~**0.223% success by attempt**). This signals substantial native destination-inspection work, but a failed admission is **not necessarily futile**: genuine full/partial and live Auto requirements can mandate checking. Trace samples do **not** include per-transaction moved quantity or a 16-item-limit saturation histogram. Sorter quantity in P4e is bounded only by **21–336 items** over 193 observed callbacks (0.109–1.741 items/callback). These bounds are **not measured item counts**.

### Q4 diagnostic counter deltas — actually measured item quantities

The `.mcstats` `hartsorter:q4m_*` lifetime received/delivered and queued metadata permit per-session item deltas. Each session had **36 Receiver accounts** in the observed metadata, **10 with positive queues**.

| Diagnostic start (local) | Game ticks | Actual Q4 received | Actual Q4 delivered | Received / tick | Delivered / tick | Queue start → end |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 16:22:48 | 340 | 0 | 0 | 0.000 | 0.000 | 283,198 → 283,198 |
| 16:25:31 | 330 | 47 | 38 | 0.142 | 0.115 | 282,891 → 282,900 |
| 17:04:48 | 250 | 29 | 40 | 0.116 | 0.160 | 282,326 → 282,315 |

These values measure **Q4 Receiver account movements only**, *not* all physical Sorter→chest transfers or vanilla Hopper delivery. Conservation of Q4 counters holds within each session: Δreceived − Δdelivered = Δqueued. A large outstanding queue does not establish that any Receiver had a viable output route: redstone, destination room, loaded state, and queue-head eligibility are unrecorded or incomplete.

### Timing in the same diagnostic windows

| Diagnostic start | Script category median | Script category p95 | Script category p99 | Level category p95 |
| --- | ---: | ---: | ---: | ---: |
| 16:22:48 | 15.7 ms | 26.5 ms | 41.3 ms | 38.1 ms |
| 16:25:31 | 40.7 ms | **69.8 ms** | **82.8 ms** | 39.5 ms |
| 17:04:48 | 31.5 ms | **67.4 ms** | **77.5 ms** | 42.3 ms |

Derived from the **first** `server_tick_timings` value, treated as microseconds; the precise first/second-field semantics have not been independently verified. **Do not equate these category p95s with whole-server tick p95, sum timing categories, assert Hart caused the spikes, or treat profiler calls/s as accepted TPS.** Competing add-ons, normal BDS activity and profiler overhead are not isolated. An idle/no-routing comparator is still absent.

**Observed interpretation:** The capture supports researching **fewer expensive destination admissions**, not a claim that the 16-item cap caused the weak Q4 rate. The productive-transfer sample is too sparse to establish how much a larger cap would help.

## 4. Density and throughput: keep the axes separate

For a *hypothetical* ordinary 64-item stack, identical capacity, complete safe native slot admission and one `safeMovePartial` transfer per batch:

| Max item quantity / transaction | Transactions | Source + destination native writes | Prepare + clear physical journal writes |
| --- | ---: | ---: | ---: |
| 16 | 4 | 8 | 8 |
| 32 | 2 | 4 | 4 |
| 64 | 1 | 2 | 2 |

This illustrates amortized **fixed transaction costs only**, not measured BDS performance. A stack-level transfer can still need full/partial native checks; a 64-item transfer could require multiple destination slots or fail to fit as one slot operation. No single call is proven to combine physically separated custody boundaries.

**Equal average rate need not mean equal transaction cost:** 16 items every tick versus 64 every four ticks both average 16 items/tick. A larger true batch may reduce overhead, but does **not** shorten drain time until achieved deliveries/tick rises. Four times fewer transactions can be offset by the cost/variance of a larger operation, downstream Hopper throughput or tick spikes. The desired optimization combines (a) lower total CPU/native/journal work per 1,000 delivered items, (b) higher *actual* useful throughput/shorter backlog duration, and (c) bounded peak tick cost and responsive player input.

## 5. Target-BDS/native capability caution — current official documentation

- The [stable Container API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable) documents `moveItem(fromSlot,toSlot,toContainer)` and `transferItem(fromSlot,toContainer)`; **neither specifies an arbitrary numeric move amount**. `transferItem` returns untransferred items, not a documented durable, crash-atomic multi-domain commit receipt. A source split/partial move therefore needs an independently justified protocol and recovery proof. The live doc reflects its version/view; test exact pinned **@minecraft/server 2.7.0** on target BDS.
- The [stable BlockInventoryComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockinventorycomponent?view=minecraft-bedrock-stable) describes native inventories **on blocks that have the component**, but that does **not** establish a stable **custom-block** inventory.
- The [1.26.50 official creator notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.50) put **custom block-entity container** support and scripting access to those custom inventories in **Experimental Technical Updates**. Also `@minecraft/server` diagnostics-manager script API is described there under beta. No default experiment toggles, beta dependency or unsupported custom-block MR endpoint are authorized. **Native persistent entity-inventory carrier feasibility is ALREADY demonstrated** by PG42 on BDS 1.26.63.1 and native direct MR transfer by PG20; see [cross-branch audit](URCE_150_CROSS_BRANCH_NATIVE_MR_EVIDENCE_REUSE_AUDIT_20261118.md). The experimental custom-*block* alternative is not a pre-code blocker. URCE-specific carrier custody, interrupted writes, unload and Q4 migration remain integration/acceptance work.
- The [Microsoft scripting performance guidance](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/script-performance) recommends profiling repeated native calls and bounded work. The 20-TPS/50-ms normal tick target is an overall BDS budget, **not** a 50-ms allowance for this add-on. A proposed **40-ms p95 / 50-ms p99 whole-server target is provisional engineering research**, not owner-approved acceptance and not established by this capture. No standard stable per-tick whole-server latency signal in the pinned 2.7.0 API has been proven for an auto-throttle.

## 6. URCE performance proof sequence (no gameplay code authorized)

**P1: Make routing selective.** Source-only four-bank and 1,400-Sorter owner-shape models: count rejected candidate checks, native slot reads, Sorter lookups, journal writes and *necessary* physical hops. Compare to exact P4e source with live Auto seed, full/partial, redstone and HOLD. No P4g repeat.

**P2: Measure dense *productive* transfers.** Source-only controlled identical 64-item ordinary stacks with demonstrably admitting native-shaped endpoints, differing sizes and partials; 16/32/64 quantity caps **independent of** transaction budget. Recompute exact native write count, q4 page/meta/journal operations, group identity and fault cutpoints; MR/nonstackable are separate. Never assume 64-item all-in-one when a physical slot cannot accept it.

**P3: Native endpoints and fault safety.** Only with explicit LAB authorization, test visible logical Transporter path→verified actual custody endpoints (including a case with **zero per-Transporter custody transitions**), short/long paths, native exact MR ItemStack, redstone, unload/restart, and every credit/debit cutpoint. Do not open a path that bypasses Sorter routing or unsafe Q4 custody.

**P4: Real BDS comparison.** Matched no-routing, ordinary routing and heavy productive backlog with 16/32/64 candidates after safe implementation authorization. Capture genuine item totals by stage/tick, moved-quantity histogram, P50/P95/P99 *whole-server* ticks, script/native costs, time to clear backlog, time above normal load, FPS/input responsiveness, memory, player count, and no-loss/dup evidence. Include a steady-state arrival test and same-world native Hopper physical-progress versus URCE logical-path/endpoint-delivery contrast; do not require a per-segment Transporter movement trace.

**Acceptance direction (not numerical promise):** Prefer the variant minimizing *time to drain* and *work per delivered item* **while playability and custody remain safe**. If burst density causes noticeable gameplay stalls, use bounded transaction-count/time controls even if the backlog takes longer. No claims of 20 TPS, direct teleport, or batch win from this source-only capture.
