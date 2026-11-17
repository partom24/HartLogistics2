# Phase A P4e — November 17 16:25:31 active-routing LAB audit

**Owner condition:** during intentional routing on the 1.4.1 Phase A P4e candidate test session. **Scope:** BDS native diagnostics and VS Debugger profiles, not a full 1,400-Sorter acceptance, not a production-world run. This run follows the [16:22:48 pre-routing capture](PHASE_A_P4E_PRE_ROUTING_BASELINE_20261117.md). No game-state or exact installed engine SHA-256 is embedded in the uploaded telemetry; first compare the installed LAB `scripts/main.js` with candidate engine digest `5c4a2d414302ef10d76fef21932928592caf2fab84cd000c5b0085cefcdd1b91` before treating the run as exact deployed-source proof.

## Direct owner upload provenance

| Native file | Bytes | SHA-256 |
| --- | ---: | --- |
| `diagnostics_2026-11-17_16-25-31.0.mcstats` | **2,196,290** | `9c746c976d689f1babdfffe85f3c33c140b97edfd365ad6962ffba745d9bae20` |
| `diagnostics_2026-11-17_16-25-31.mcstats` | **1,363,646** | `846dc299b686286f5dddc25f33d57701ec16de294c8b67fcba417ddc0d6dda17` |
| `Capture_2026-11-17T21-25-19.698Z_JS.cpuprofile` | **11,752,129** | `bb8906e6dcf65a9dd55990603dab7e53817c6fac5dd7721a5d69ae4fd0cb7502` |
| `Capture_2026-11-17T21-25-19.698Z_TS.cpuprofile` | **11,802,870** | `903755773343bcf1b8a84b467869a65f1bf9dc3adcbb7851a241012dd2fa4a5a` |

The two `.mcstats` files share one session timestamp and have **contiguous tick ranges**: 870980434–870980635 and 870980636–870980769. Each native timing record has two `server_tick_timings` values per leaf: all 202 + 134 = **336** values per timing category are included, not just one per JSON record. Decode after the four-line JSON header using base64-gzip. All timings below are **microseconds divided by 1000**, with nearest-rank P95/P99 and arithmetic median P50. The JS/TS profiles have identical sequences of **2,211,314** native-node samples and matching time deltas, and each spans **19.72736 seconds** (`endTime-startTime`); they represent **one profiling event in two source mappings**, not two replicates. Profile and .mcstats windows must not be assumed perfectly synchronized.

## Timing distribution and load progression

| Condition / segment | Samples | Script P50 | Script P95 | Script P99 | Script >50 ms | Level P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P4e pre-routing 16:22:48, combined | 346 | 15.341 ms | 25.862 ms | 38.343 ms | 1/346 | 36.834 ms |
| P4e active initial 16:25:31 `.0` | 202 | **34.402 ms** | **50.502 ms** | **59.922 ms** | 11/202 | 39.092 ms |
| P4e active later 16:25:31 unsuffixed | 134 | **52.971 ms** | **72.215 ms** | **81.769 ms** | 87/134 | 37.272 ms |
| **P4e active combined** | **336** | **39.254 ms** | **68.885 ms** | **76.391 ms** | **98/336 (29.2%)** | **38.304 ms** |

Active script: min **25.832 ms**, max **98.292 ms**, zero values >100 ms. Active level: min **18.209 ms**, max **52.536 ms**, **2/336 >50 ms**. Medians of `scripting_engine / Memory Used (KB)`: active **12,803.794 KB** (34 readings) vs pre-routing **12,740.670 KB** (35 readings). Overworld `chunks/Overworld/ticking` remains **260** across all 17 active snapshots; other add-ons were present. Script and level timings are separate categories; **do not sum** them to infer per-tick budget or sustained TPS. An increase in later-script timing is observed but source, volume of cargo, backpressure and other-script contribution are not separately identifiable.

Earlier November 17 **P4d** active sessions reported script P95 of **91.297 ms** and **77.217 ms**. P4e's combined active P95 of **68.885 ms** is lower numerically, but **different traffic, topology, exact deployed SHA confirmation, inventory fullness and source conditions have not been shown to be controlled**. This is **not a proven P4d→P4e speedup**.

## Native profiler ancestry: admission remains O(slots) in practice

Native method `hitCount` is a **method-invocation count**, not time spent in a native API. Values below are attributed by ancestry to `schedulerTick → processColumn → findAcceptSlot`, thus excluding independent Receiver admission and unrelated scripts.

| Sorter admission path, one ~19.7-second profiler recording | P4d prior 20:25:01 period* | P4e pre-routing 21:22:29 | **P4e active 21:25:19** |
| --- | ---: | ---: | ---: |
| Normal `Container.size` / `emptySlotsCount` (proxy for admission invocations) | 6,840 | 6,320 | **9,425** |
| `Container.getSlot` | 354,809 | 324,092 | **487,223** |
| `ContainerSlot.hasItem` | 354,809 | 28,550 | **80,387** |
| `ContainerSlot.typeId` | 309,723 | 304,517 | **431,056** |
| `ContainerSlot.amount` / `maxAmount` | 55,157 | 36,840 | **85,806** |
| `ContainerSlot.isStackableWith` | 31 | 8 | **21** |
| `getSlot` per normal admission | 51.87 | 51.28 | **51.69** |
| `hasItem` per normal admission | 51.87 | 4.52 | **8.53** |

*P4d is the previous **distinct-workload** profiling period and is included for a structural call-shape comparison only. The source P4d called `hasItem()` on every dense scanned slot, unlike the new full-native-count fast path. The new profile shows **80,387 / 487,223 = ~16.5%** `hasItem` relative to slot lookups; this is strong evidence the P4e code path is exercised, but the files do not authenticate the exact installed source.

The P4e active capture has **~49% more** ordinary Sorter destination-admission invocations than its own pre-routing recording (`9425/6320`), plus **~50% more** Sorter `getSlot` calls (`487223/324092`), and **still ~52 getSlot per admission**. The optimization removes a separate native occupancy check when all slots are known occupied but **does not remove the per-slot `getSlot` and `typeId` checks**. **85,806 `amount` observations but only 21 stack-compatibility comparisons** are consistent with many same-type candidates already being full, so the exact `isStackableWith` check rarely occurs; these call counts **do not reveal actual item types or which chests were full**.

Separate `logisticsTick → processReceiverDrain → dequeueToReceiver → findAcceptSlot` path: active **615** normal `size/emptySlotsCount` reads, **2,900 `getSlot`**, **2,899 `typeId`**, **5 `hasItem`**. All `findAcceptSlot` paths together: **10,040** size/count reads, **490,123 `getSlot`**, **433,955 `typeId`**, **80,392 `hasItem`**, **21 stackability comparisons**. Sorter `safeMovePartial` path contains 42 native `Container.setItem` calls; Collector ingress contains 35; Receiver dequeue path includes journal writes and mutation calls. Therefore this is genuinely active transfer work, but native method counts do **not** measure delivered item quantities or certify no loss/duplication.

## Engineering verdict and proposed next gate

**Confirmed in owner instrumentation:** the **P4e hasItem optimization changes the native-call shape significantly**, but **the expensive negative 27/54-slot destination search survives essentially unchanged**, and active script P95 is **68.885 ms**. The profile cannot establish how much latency was saved because native method-call counts are not execution-time percentages and workload differs. Do not claim P4e full performance acceptance.

**Recommended follow-on:** No further speculative capacity ledger, no cross-tick full-chest rejection cache, and no replacement of Q4 with nonjournaled `Container.addItem`. Prioritize a **separate native admission + recoverable custody proof** (exact bounded offer and remainder, slot visibility after native placement, restart replay and multi-writer chest changes) or another *verified native predicate for exact partial-stack capacity*. If no such native contract exists, the current explicit slot writer remains the safe lower bound, and the ongoing cost must be managed by supported source-level routing qualification and workload-aware design. A result that merely reduces `hasItem` without reducing ~52 live slot lookups/attempt is insufficient to establish scalable improvement.

**Owner follow-up evidence:** confirmation of installed LAB engine SHA-256; comparable P4d/P4e traffic and starting inventory states; items successfully deposited per second, count of blocked/full target chests, Q4 journal recovery/error evidence, and any confirmed item loss/duplication. Full approximately 1,400-Sorter 4–5-high layout remains a separate target. The observed active script latency above 50 ms does not support declaring the engine performance-complete.
