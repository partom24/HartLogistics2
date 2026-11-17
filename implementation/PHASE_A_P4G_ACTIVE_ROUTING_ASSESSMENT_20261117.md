# Phase A P4g owner active-routing capture — stop/go assessment

**Owner condition:** active routing on Nov 17, 2026, after the P4g code-only green gate. The owner **did not capture a P4g pre-routing session**. Analyze the owner-supplied active BDS diagnostics and VS Debugger profiles directly and compare with earlier P4e active routing; do **not** substitute an assumed identical idle baseline or infer a matched P4e-to-P4g performance delta.

## File provenance

| Owner upload | Bytes | SHA-256 |
| --- | ---: | --- |
| `Capture_2026-11-17T22-04-33.835Z_JS.cpuprofile` | 9,430,035 | `f2912ba9986c40dc399962e2eec8801f3f569e4c7c777fe88b548d3daf6ede51` |
| `Capture_2026-11-17T22-04-33.835Z_TS.cpuprofile` | 9,483,579 | `8d13fd9d81b1657185ae4f1418c3285374d408f35864ba831432bf90f7b6e7b0` |
| `diagnostics_2026-11-17_17-04-48.0.mcstats` | 2,189,414 | `ab2a08bf102ddad85be921ca98cab3daf75cc534cbd2ea2bd9adaf52834f5ccb` |
| `diagnostics_2026-11-17_17-04-48.mcstats` | 522,544 | `341e7a69ac3d3cb48811e4f4b45f61414eeea938c4b0cd90642da1910accb3e1` |

The JS and TS profiles have **identical 1,720,722 sample-ID arrays and time-delta arrays**: one profiler recording with two source mappings, **578 nodes**, 19.613274 seconds per profile; not independent repeat experiments. `.mcstats` logs use a four-line JSON metadata header then base64-gzip JSON records. The `.0` segment contains tick IDs 870990349–870990550 (**202 records/timing samples**) and unsuffixed contains 870990551–870990601 (**51 records**, **50 timing samples**). The files are contiguous; don't manufacture a timing sample for the last record. Timing entries are native microseconds/1000, nearest-rank P95/P99 and arithmetic median P50. Native profile method hit counts are *invocations*, not elapsed time.

## Native timing distributions

| Condition | Script samples | Script P50 | Script P95 | Script P99 | Script >50 ms | Level P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P4e active, earlier owner 16:25:31 | 336 | 39.254 ms | 68.885 ms | 76.391 ms | 98/336 (29.2%) | 38.304 ms |
| P4g active, 17:04:48 `.0` | 202 | 28.943 ms | 52.269 ms | 62.911 ms | 15/202 | 40.194 ms |
| P4g active, 17:04:48 unsuffixed | 50 | 55.105 ms | 76.307 ms | 79.246 ms | 39/50 | 41.048 ms |
| **P4g active combined** | **252** | **31.754 ms** | **65.592 ms** | **76.307 ms** | **54/252 (21.4%)** | **40.265 ms** |

P4g active script min **21.347 ms**, max **79.246 ms**, mean **37.230 ms**; P4g level P99 **43.784 ms**, max **64.271 ms**. P4g scripting-engine memory median **12,733.360 KB** across 26 samples. The Overworld ticking-chunk count was **257** throughout 13 snapshots, whereas P4e active recorded **260**; other add-ons remain loaded. The P4g later segment rose from 52.269 ms P95 to **76.307 ms P95**. `script_tick` and `level_tick` are separate categories; do not add them together as total tick time or infer sustained TPS.

The absent P4g pre-routing run is **not a blocker to examining active P4g source-call behavior**. Earlier P4e pre-routing script P95 was 25.862 ms, but cannot be assumed to equal a P4g idle/pre-routing baseline.

## Direct source-call comparison — the key gate

Only trace native method hitCounts descending through **`schedulerTick → processColumn`**, and distinguish `destinationFor`, `findAcceptSlot`, and `safeMovePartial`. The two profiles have near-equal duration (~19.6–19.7 sec), but **different amounts and mix of traffic**.

| Sorter-path native operation, one profile | P4e active (~19.727 s) | P4g active (~19.613 s) |
| --- | ---: | ---: |
| `BlockInventoryComponent::container` under `destinationFor` | **9,425** | **6,166** |
| `Container::size` under `findAcceptSlot` | **9,425** | **6,166** |
| `Container::emptySlotsCount` under `findAcceptSlot` | **9,425** | **6,166** |
| `Container::getSlot` under `findAcceptSlot` | **487,223** | **324,240** |
| `ContainerSlot::typeId` under `findAcceptSlot` | **431,056** | **273,321** |
| `ContainerSlot::hasItem` under `findAcceptSlot` | **80,387** | **72,060** |
| `ContainerSlot::isStackableWith` under `findAcceptSlot` | **21** | **48** |
| `getSlot` per `findAcceptSlot` normal call | **51.694** | **52.584** |
| `Container::setItem` under Sorter `safeMovePartial` | **42** | **96** |

The P4g candidate checks `rejectedFullTypes.get(e)` **after** `destinationFor(e)` successfully retrieves the live storage container, but **before** `findAcceptSlot`. **A true reuse hit must produce a destination container resolution with no corresponding native admission `Container.size` call.** Instead **both are exactly 6,166** in the P4g profile. Code review confirms the Sorter chest path calls `findAcceptSlot` only in this location. This is strong direct evidence that **zero full/type certified rejections were reused during this recording**. Even though total `getSlot` volume fell by ~33.45%, `findAcceptSlot` admissions fell by ~34.58%, and individual scans remained full-length. The faster reported script timings **cannot be credited to P4g's certified rejection reuse**. A different mix of successful traffic is also visible: Sorter `safeMovePartial` path made 96 native `setItem` calls vs 42 in P4e, so workload is plainly not controlled. These are native write calls, not exact item counts or verified custody outcomes.

The new P4g source adds callback-local certificate Map management and type/maxAmount lookups. In P4g the profile has **4,670 `ItemStack::typeId` and 4,670 `ItemStack::maxAmount` accesses directly under `processColumn`** rather than `findAcceptSlot` or `matchesFilter`, consistent with the new certificate/check sites. Those reads are real additional native calls, although their CPU latency is unknown. **No persistent cache, transaction writer or tick-scheduler change** was introduced.

## Decision: P4g practical performance gate — NO-GO on current evidence

**Source-only correctness gate:** passed at [GitHub Actions 44185286787](https://github.com/partom24/HartLogistics2/actions/runs/44185286787), 162 candidate tests and 99 original-1.4.1 regressions, 5/5 jobs green. The controlled 5-identical-stack case saved 216 native slot reads out of 270; it remains valid as a **possible** repeated offer.

**Owner's active runtime gate:** did **not** demonstrate a reusable duplicate scan, and did **not** establish a matched P4e→P4g native improvement. Do **not** label P4g BDS performance accepted. Unless the owner intends a materially different workload with repeated same-type source stacks against the same Sorter chest, there is no evidence to justify retaining extra per-callback Map bookkeeping merely because the candidate is CI green.

**Recommendation:** stop extending 1.4.1 chest-admission caches, do **not** add cross-tick or cross-column capacity assumptions, and **prefer the simpler P4e code path for the final 1.4.1 base** if no other runtime evidence demonstrates P4g value. Reverting an installed candidate must go through the guarded lab updater/approved source process, not ad hoc overwrites; do not infer the owner's exact installed file SHA from profiler labels. No gameplay source or LAB deployment was modified during this review. Preserve Filter→Auto→Wildcard, redstone/Bypass, Hopper observation, 16/256 budgets, exact-slot Q4 recovery and original world data. The 1.4.1 capability/throughput/integrity acceptance gates remain open.

**Architecture consequence:** further 1.4.1 optimization should not turn into an unverified global capacity ledger. Once the owner accepts the safe native-first **1.4.1 foundation** (including source identity and item integrity), devote architectural effort to the selected **1.5 Unified Routing and Custody Engine (URCE)** with qualified candidate planning and a shared transaction boundary, **not resurrected Q5**. This is a development recommendation, not authorization for 1.5 code, Bulk or Transporter implementation.
