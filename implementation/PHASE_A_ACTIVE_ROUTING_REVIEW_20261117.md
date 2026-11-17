# Phase A — November 17 multi-period active-routing BDS and profile audit

**Owner context:** items were being routed during multiple capture periods, following the fresh-restart no-intentional-routing capture recorded in [PHASE_A_IDLE_BASELINE_20261117.md](PHASE_A_IDLE_BASELINE_20261117.md). **This is live LAB evidence, not a controlled P4b → P4d same-workload experiment.** The previous updater command was refused for Git HEAD mismatch; the attached diagnostics do **not themselves authenticate the installed Behavior Pack script SHA**. Confirm the LAB file against the P4c/P4d source digest **`99045ca7179320f5f5e2d9d56286b4386308df7daa5473b8aa7498bf27c44306`** before claiming exact candidate provenance. The raw files remain with the owner; hashes below permit reidentification. Do not install or update production.

## 1. Source evidence

Four native `.mcstats` members, representing **two independent timestamped routing sessions**, were decoded completely. Their tick ranges are contiguous within each session. Two JS profiles and their TS views are **two separate ~19–20-second profiling sessions**; each JS/TS pair has identical `samples` and `timeDeltas` sequences and must **not** be double counted. Profile timestamps do **not establish exact one-to-one overlap with the `.mcstats` sample windows**; their labels are kept separate.

| Owner filename | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `diagnostics_2026-11-17_15-25-14.0.mcstats` | 2,101,962 | `262e0bcf2fe91e8a1461c4899d6bac5d038472839e40ff7501cf6cfd59196d8c` |
| `diagnostics_2026-11-17_15-25-14.mcstats` | 737,266 | `dd5af9aa001e7f36ffc0b20eee2c2a5e81c45d7f29eb0a99f52ad5d78da8e438` |
| `diagnostics_2026-11-17_15-25-52.0.mcstats` | 2,103,110 | `f9334d726928223b4f5c97e3288dc13991885b10ba490b46e25a555b30038eec` |
| `diagnostics_2026-11-17_15-25-52.mcstats` | 530,158 | `3c5444c098fa988720b028c79e43dc21300e3d34e169cf6010a9726b3ef57264` |
| `Capture_2026-11-17T20-25-01.997Z_JS.cpuprofile` | 11,952,210 | `f99e37ada39eb711afabe472b8a14cd44a4a473819c6960c40b1ddc38cc94d5e` |
| `Capture_2026-11-17T20-25-01.997Z_TS.cpuprofile` | 12,000,610 | `5b53692f2355f676e3792ce6b7b0140157872a3efbfc1e6c0697c7f01b677390` |
| `Capture_2026-11-17T20-26-39.953Z_JS.cpuprofile` | 11,480,899 | `51a9c7cc25b54b65946476899741e002bd968df569e94cc40cae9422895f15f9` |
| `Capture_2026-11-17T20-26-39.953Z_TS.cpuprofile` | 11,531,040 | `6ed43744b5188a5c282dc9877fc07faba72dd38fff7daa429dbff2acd761f93d` |

Native `.mcstats` has a four-line JSON metadata preamble followed by per-line base64-gzip-encoded JSON records. Read *both* `server_tick_timings` values in each record, convert microseconds to ms, and join rotated files by session/tick ranges, not by suffix ordering. Quantiles below are nearest-rank P95/P99; P50 is arithmetic median of the two central sorted values for even N. `scripting_engine / Memory Used (KB)` is recorded at a lower frequency.

## 2. Native timing results

| Condition | Native samples | Script P50 | Script P95 | Script P99 | Script >50 ms | Level P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Nov 17 no intentional routing (earlier baseline) | 358 | 15.696 ms | 26.167 ms | 41.608 ms | 1/358 | 40.508 ms |
| Routing session 15:25:14 (ticks 870917249–870917510) | **262** | **62.526 ms** | **91.297 ms** | **128.300 ms** | **246/262 (93.9%)** | **38.486 ms** |
| Routing session 15:25:52 (ticks 870917627–870917878) | **252** | **55.775 ms** | **77.217 ms** | **82.687 ms** | **209/252 (82.9%)** | **37.365 ms** |

Other values: routing 15:25:14 script mean 66.487 ms, max 131.157 ms, seven script values >100 ms; level max 53.231 ms with one level value >50 ms. Routing 15:25:52 script mean 58.727 ms, max 106.314 ms, one script value >100 ms; level max 49.592 ms with zero level values >50 ms. The routing sessions' script P95 difference is ~15.4%, **not a revision improvement measurement**: these are differing activity windows. Both show sustained script cost above the 50 ms total-tick target. Level and script timing leaves are separate categories and are **not additive**; do not infer actual TPS from them alone.

Median `scripting_engine / Memory Used (KB)`: approximately **12,915.522** for routing 15:25:14 and **12,918.124** for routing 15:25:52, versus ~**12,800.548** in the earlier no-routing baseline. The loaded `chunks/Overworld/ticking` counter is **260** across all three sessions. The server also loads other Behavior Packs, so script-tick time is **not an exclusive HartLogistics CPU timer**. The capture lacks exact live nonempty-column counts, local Filter-hit/transit ratios, successful items per second, blocked-destination counts, item conservation inventory audit and confirmation of exact deployed source SHA.

## 3. Profiling analysis — destination admission is the dominant *observed native-call volume*

These `.cpuprofile` files were emitted with many samples representing native method invocations; method `hitCount`/samples are **not CPU wall-time percentages**. Attribute native invocation nodes to their ancestor stack (e.g. `schedulerTick → processColumn → findAcceptSlot`) and do not sum overlapping inclusive parent totals.

| Native calls attributed to `findAcceptSlot` | Profile started 20:24:39Z (19.637 s) | Profile started 20:26:18Z (19.424 s) |
| --- | ---: | ---: |
| `Container::getSlot` | **356,699** | **332,329** |
| `ContainerSlot::hasItem` | **356,699** | **332,329** |
| `ContainerSlot::typeId` | 311,613 | 259,249 |
| `ContainerSlot::amount` | 56,417 | 66,846 |
| `Container::size` | **7,237** | **6,839** |
| Implied getSlot per admission scan (`getSlot / size`) | **~49.3** | **~48.6** |

The actual pinned `findAcceptSlot` function reads `container.size` once for the normal stackable-item admission path and loops over native `getSlot` / `hasItem` / `typeId` on dense destinations. Therefore the ratio indicates a large number of **near-complete destination inventory scans**, especially full/mostly full chests or nonmatching compatible-partial searches. It is *not* a measured count of blocked attempts or a proof every destination is a 54-slot double chest; actual inventory sizes were not captured. Repeated live dense destination scanning is now the clearest P4e target.

Within `processColumn`, native `Container::getSlot` counts were **354,809** and **328,909** respectively, strongly attributing this work to Sorter destination admission rather than Collector/Receiver drain. The profile also reports `sorterAt`/dimension lookup work and `compactSourceHopper` native reads, but their native-call volumes are much lower than the dense admission scans. These are different workload periods; sample-count differences do not themselves prove a cost reduction.

The JS/TS profiles are duplicate representations per timestamp: 20:25:01 has **1,913,116** samples; 20:26:39 has **2,164,680** samples. The profile creation-name times differ from the in-profile start/end times and cannot establish exact synchronization with each separately named `.mcstats` timing stream.

## 4. Plan reassessment and stop/go boundary

**Validated:** P4c/P4d conservative prequalification plus original compaction/custody semantics remains the appropriate foundation for the future sparse-destination network. These captures show substantial **active** residual cost in native destination admission, rather than evidence for reverting early rejection or lowering Hopper polling cadence. The November 16 P4b active reference script P95 (~108.958 ms) is higher than these sessions, but **the input, backpressure, route populations and exact deployed source have not been matched**; claiming a measured P4d percentage improvement would be invalid.

**Next P4e source-only investigation:** Focus on negative/dense admission repeat work. Review whether a *single synchronous, mutation-free offer* can avoid duplicated native `ContainerSlot` checks with no metadata loss, no partial-stack priority regression, no stale native object across ticks, no cross-tick cache and no second custody writer. Require source-executed differential coverage for 1–54-slot chests (empty/sparse/dense/full), partial compatible stacks, exact metadata, Auto live seeds, powered/bypass, Collector/Receiver admission, source slot order and any mutation or native read failure. Preserve original 16-item per-column, 256 global, and one-tick Hopper observation opportunities. Do **not** take the tempting shortcut of skipping subsequent full-chest checks across ticks; external/native changes remain possible and pinned 2.7 does not prove a destination-content event sufficient to authorize that.

**Next owner runtime validation:** First confirm deployed LAB engine SHA, then capture matched **transit-heavy Filter-only**, **local Filter admission**, **blocked/full chests**, and **mixed five-slot** scenarios. Keep topology/active routes and starting inventory state controlled across builds, compare throughput and Q4/journals in addition to script/level P50/P95/P99 and profile-call path counts. Full ~1,400-Sorter 4–5-high owner layout remains a separate acceptance gate. The source candidate is **not release-accepted**.
