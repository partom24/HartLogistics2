# Phase A P4e — 2026-11-17 16:22:48 owner pre-routing LAB capture

**Owner condition:** *Pre-routing*: the owner has not yet started the intentional active-routing test period. This **does not mean zero item transfers or zero admission attempts**. Data represent a runtime LAB snapshot, **not a measured active-routing performance gain** and **not production acceptance**. The uploaded data do not establish installed `main.js` SHA-256, so confirm the exact P4e engine digest below before labeling a commit-pinned BDS comparison.

## Raw uploaded data provenance

| Original owner filename | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `diagnostics_2026-11-17_16-22-48.0.mcstats` | 2,101,586 | `d869725c8c9ce0d1ee6711d02bd24d82d2382da4a68e756986afdc7165701b7d` |
| `diagnostics_2026-11-17_16-22-48.mcstats` | 1,577,590 | `7078eee2086ce77f399318cbc07dfaa89849f58b502806afe4537fa8e03b69b5` |
| `Capture_2026-11-17T21-22-29.169Z_JS.cpuprofile` | 9,268,575 | `61e8bd0555b48d8516b17e0aecd864e358edf54c04c3b401071b9583f440d7b1` |
| `Capture_2026-11-17T21-22-29.169Z_TS.cpuprofile` | 9,318,839 | `ff43c094001ab5f1f341a3ea31f67b4c3539d44cb81325619621b2e5abc7eff4` |

Two `.mcstats` files are **contiguous tick ranges** within the same native recording (not independent experiments). Four-line JSON metadata header, followed by per-line base64-gzip JSON records. Each `server_tick_timings` record contains **two timing values per child**, converted from microseconds to milliseconds. P95/P99 use nearest-rank quantiles; P50 is ordinary median. Both `.cpuprofile` files are **identical profiler sample/time-delta streams** with different source mappings: 543 nodes, **1,746,457 samples each**, timestamp span **19.67596 seconds** (2026-11-17 21:22:07.632–21:22:27.308 UTC), not two independent captures. The `.mcstats` and CPU profile window cannot be assumed synchronized to the same native ticks.

## Complete native .mcstats timing summary

| Segment | Native tick range | Timing values | Script P50 | Script P95 | Script P99 | Level P95 | Script >50 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Rotated `.0` | 870978110–870978305 | 196 | 16.412 ms | 26.745 ms | 48.535 ms | 36.352 ms | 1 |
| Unsuffixed | 870978306–870978455 | 150 | 14.651 ms | 21.399 ms | 38.343 ms | 37.008 ms | 0 |
| **Combined** | **870978110–870978455** | **346** | **15.341 ms** | **25.862 ms** | **38.343 ms** | **36.834 ms** | **1/346** |

Combined script mean **16.896 ms**, min **11.391 ms**, max **62.241 ms**; level median **28.217 ms**, mean **28.231 ms**, max **43.898 ms**, zero level values >50 ms. Scripting-engine `Memory Used (KB)` median **12,740.670 KB** across 35 readings (near-flat). Overworld ticking-chunk counter **260** across 18 native snapshots. Other add-ons (HartBots, Waypoints, XP Vault, etc.) are loaded, so script and level tick categories are not exclusive HartLogistics timings. **Do not add script and level timing leaves or infer sustainable TPS from these two leaves alone.**

Comparison with owner November 17 **P4d no-intentional-routing** capture: script P50 **15.696 ms**, P95 **26.167 ms**, P99 **41.608 ms**, level P95 **40.508 ms**, from **358 timing samples**, versus today's **15.341 / 25.862 / 38.343 / 36.834 ms**. The small difference is **not proof of improvement**: topology, stranded item state, uptime, source hash and exact workload synchronization are not controlled.

## Profiler: heavy negative-admission work before intentional routing

These are **instrumented native method invocations** by call-stack ancestry, not CPU wall-time percentages or independent time samples. Under `schedulerTick → processColumn → findAcceptSlot`:

| Native call | Observed in 19.676 s |
| --- | ---: |
| `Container::size` / `emptySlotsCount` | **6,320** each |
| `Container::getSlot` | **324,092** |
| `ContainerSlot::typeId` | **304,517** |
| `ContainerSlot::hasItem` | **28,550** |
| `ContainerSlot::amount` / `maxAmount` | **36,840** each |
| `ContainerSlot::isStackableWith` | **8** |

The `findAcceptSlot` path averages **~51.28 native slot lookups per normal stackable admission attempt** (`324092/6320`). Among those same Sorter destination lookups, only **~8.81%** invoked `hasItem()` (`28550/324092`). This pattern is consistent with the P4e full-occupancy shortcut avoiding many redundant live slot-occupancy calls, **if the pinned candidate was installed**. Because the former P4d source calls `hasItem()` on every inspected dense slot, the call-count difference is a strong *mechanistic* signature, **not** a matched-control BDS speedup. The large remaining `getSlot` and `typeId` counts demonstrate that the costly negative dense search is still present. The extremely low `isStackableWith` count suggests most examined slots were never plausible compatible partial candidates, but these data do not prove how many individual chests were actually full or what distinct item types they contained.

A separate `logisticsTick → processReceiverDrain → dequeueToReceiver → findAcceptSlot` path adds **546** `Container::size` / `emptySlotsCount` calls, **2,590** `getSlot`, **2,590** `typeId` and **zero** `hasItem` calls, bringing **total across all `findAcceptSlot` paths** to **6,866** occupancy/size reads, **326,682** `getSlot`, **307,107** `typeId`, **28,550** `hasItem`. Overall `getSlot/size ≈47.58`.

**Very important:** The user labeled this recording *pre-routing*, but the profiler contains actual transport-path activity: about **16 native `Container.setItem` calls** under Sorter `safeMovePartial`, **33** under Collector `enqueueFromSource`, and **28** under Receiver `dequeueToReceiver`, plus **64** under Hopper compaction. These are native call counts, not confidently verified end-to-end transfer/item amounts. Therefore the session has no *intentional* active test flow but is **not a zero-move idle control**; existing cargo/blocked destinations or queued work may be active. An exact cause cannot be derived from method counts.

## Current decision and next native gate

**P4e source candidate** SHA-256: `5c4a2d414302ef10d76fef21932928592caf2fab84cd000c5b0085cefcdd1b91` (Git commit `caca805f5c3225731b729191dcf5ddd0ef3a63b5`; source engine unchanged since `dec0d6d`). The P4d source SHA-256 is `99045ca7179320f5f5e2d9d56286b4386308df7daa5473b8aa7498bf27c44306`. This capture **does not authenticate the installed LAB source bytes**; owner may compare deployed `scripts/main.js` SHA-256 before treating it as P4e evidence.

**Continue owner BDS evidence:** With a confirmed exact installed candidate and no source/topology changes between periods, capture (1) pre-routing/preloaded cargo condition, (2) sustained matching local Filter traffic to partially filled chests, (3) full/blocked destinations rejecting stackable items, and (4) mixed five-slot Hopper content. Record physically full destinations and useful item throughput, Q4 journal state and any loss/duplication symptoms. Compare BDS script P50/P95/P99, level/tick/TPS, `getSlot`, `typeId`, `hasItem`, `isStackableWith` and real delivered items under the same setup. The 1,400-Sorter scale test remains separate.

**Go/no-go:** The source-only optimization appears to be exercised (native `hasItem` far below `getSlot`), but **does not eliminate expensive dense scans**. The current pre-routing median/P95 do not establish a native performance win. Do not claim P4e complete or production ready and do not switch to a nonjournalled native `addItem()` writer.
