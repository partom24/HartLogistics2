# Phase A — November 17 fresh-restart / no intentional routing capture

**Owner-provided context:** Fresh Bedrock Dedicated Server restart; **no intentional routing** during collection. This is the **settled/idle-like baseline for the transit-first 1.4.1 candidate**, not an active transit benchmark and not proof that no incidental transfer occurred. The previous LAB updater command was rejected for mismatched Git HEAD; these captures alone do **not cryptographically establish which exact BP main.js was installed**. Confirm the exact LAB file SHA-256 against the source candidate `99045ca7179320f5f5e2d9d56286b4386308df7daa5473b8aa7498bf27c44306` before treating the capture as a commit-pinned performance comparison. No production-world claim.

## Uploaded evidence (raw data retained with owner, not committed)

| Original upload | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `diagnostics_2026-11-17_15-21-44.1.mcstats` | 2,112,938 | `7ba12dcc02cd7ba3c64c194884273143bfadc2f815869c27097a8cc7b1201b01` |
| `diagnostics_2026-11-17_15-21-44.mcstats` | 1,689,918 | `03070bd3212d8476cabe5997c95545bc7f259fbad0e5088a18954fe24ee39933` |
| `Capture_2026-11-17T20-21-33.658Z_JS.cpuprofile` | 5,610,233 | `51a34cb7ed3db43bd65f7268bb4c6b48390d69537ab4add3e560cb622f7b7b71` |
| `Capture_2026-11-17T20-21-33.658Z_TS.cpuprofile` | 5,649,815 | `4500b8ce22152ed2529ea1ebe6395bfae9ea3f2e91a50e1a8f52b7329eb1ea24` |

## Exact native tick parsing

Each `.mcstats` file has a four-line JSON metadata preamble followed by individually base64-gzip-encoded JSON records. `server_tick_timings` generally occurs every second record and contains **two** timing values per timing leaf. The files have disjoint tick ranges; they represent two noncontiguous portions of one timestamped session, **not independent replicates**. Decode every value; do not equate number of JSON records with number of tick timings. P95/P99 below are nearest-rank quantiles; P50 is the ordinary median. Values in microseconds converted to milliseconds.

| Segment | Tick range | Timing values | Script P50 / P95 / P99 (ms) | Level P50 / P95 / P99 (ms) |
| --- | --- | ---: | --- | --- |
| Rotated `.1` | 870914463–870914660 | 198 | 15.792 / 28.657 / 49.376 | 29.088 / 43.186 / 52.357 |
| Unsuffixed | 870914861–870915020 | 160 | 15.572 / 23.248 / 27.735 | 28.620 / 37.913 / 42.313 |
| **Combined** | Two disjoint ranges | **358** | **15.696 / 26.167 / 41.608** | **28.794 / 40.508 / 48.572** |

Combined script: mean 16.876 ms, min 11.819, max 56.068, **1/358 >50 ms**. Combined level: mean 29.621 ms, min 17.690, max 54.268, **2/358 >50 ms**. No >100 ms timings. The timing leaves are independent measurement categories: **do not sum script and level numbers** to estimate total tick time or infer sustained server TPS from P95 alone.

Median `scripting_engine/Memory Used (KB)`: **12,800.548** in earlier segment and **12,801.137** in later segment; near-flat across these observations. The other addons were present (including HartBots/Waypoints/XP Vault), so script and level tick timing are **not exclusively HartLogistics CPU**.

## Profile findings and interpretation boundary

The JS and TS `.cpuprofile` are **the same 400-tick / 20.64-second instrumentation event with different source mappings**, not two additional experiments: their 1,094,979 sample-node sequences and time-delta sequences match exactly. The instrumentation emits repeated native method invocation counts. These are **not CPU-time percentages** and cannot identify native API wall-time latency without matched BDS profiling.

Within the `schedulerTick → processColumn` path, the instrumentation reports approximately:

- **72,800** `World::getDimension` and **72,800** `Dimension::getBlock` native calls (**182 per tick** averaged over 400 profiler ticks);
- **69,600** `Block::typeId` (**174/tick**);
- **59,600** `BlockPermutation::getState` (**149/tick**) for live Hopper redstone;
- **59,200** `Container::firstItem` (**148/tick**) for source occupancy.

Within `collectorInputSources`, the profile reports **55,200** `Dimension::getBlock` neighbor probes (**138/tick**, e.g. six faces over ~23 active Collector inspections/tick in this path). A separate Collector input path records **6,400** `Container::firstItem` (**16/tick**). The native observation and adjacency work therefore persists during no-intentional-routing periods, though it is much cheaper than an active route/destination scan. Profile includes `dequeueToReceiver`, `enqueueFromSource`, and a few native `Container::setItem` invocations; this is **not proof of zero incidental moves**, even though the owner did not intentionally route items. Do not call this a mathematically zero-transfer capture.

## Comparison and next evidence gate

The earlier November 16 settled session reported **script P95 ~24.720 ms**; this session's combined **26.167 ms** is in the same broad range, but capture conditions, power state, item contents, loaded topology, and potentially exact deployed revision were not established as matched. **No causal speedup or regression claim** follows. The prior November 16 active P4b run was **P95 108.958 ms**, which is a *different workload*, not a valid before/after speedup against the present no-routing capture.

**Next:** Confirm actual LAB BP main.js SHA-256, then capture owner-matched **active transit-heavy**, **local Filter matching**, **mixed five-slot**, and **blocked/backpressured** routing workloads without changing this source revision between comparisons. Record column/item populations and exact routes. Compare script P50/P95/P99, level timing/TPS, useful final-chest throughput, Q4/journal state and native profile operations. Preserve the one-tick observation/interception policy, 16/256 movement budgets, compaction/redstone and existing custody writer. Do not start P4e on an alleged improvement established only by idle measurements; no production deployment.
