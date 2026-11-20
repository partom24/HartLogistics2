# URCE 1.5.4 — measured idle overhead and fail-closed bounded mitigations (2026-11-20)

## Source of measurements and owner topology

Analyzed exact owner-supplied `diagnostics_2026-11-19_19-02-55.mcstats` and both same-capture VS Code JS/TS profiles `Capture_2026-11-20T00-02-43.202Z`. No raw full profiles have been committed. Profile interval 17.248562 s, 1,114,770 samples; top-level `logisticsTick` **9.966 s** and `schedulerTick` **6.490 s**, leaving about 0.793 s for other callbacks/addons. Inclusive `processCollectorIngress` 9.259 s, `liveLinkCheck` 7.866 s, `observeSupplyLinkSnapshot` **7.103 s**. Within the snapshot, `observeNativeHopperWitness` **3.474 s**, `observeTransporterComponents` **3.203 s**. The native profile also attributes **4.126 s** to `World::getDynamicProperty` in the Sorter scheduler journal guard and 3.890 s to ~198,837 native `World::getDimension` samples across all Hart paths. These are profiled capture attributions, not guarantees that changing a line produces those exact runtime gains.

Bedrock `.mcstats` file spans 142 ticks; 71 records each report 2 `server_tick_timings` values. Across 142 script_tick values: min 53.738 ms, median 74.288 ms, p90 100.536 ms, p99 132.022 ms, max 156.447 ms (assuming recorded timing units are microseconds). Level tick median 30.321 ms, p90 39.042 ms. This is a true idle/low-throughput performance blocker, not a claim that all input inventories are empty: ingress checks `source.container.firstItem()` before link guard, so one or more loaded Hoppers may have **stationary** items without any successfully completed transfer.

Owner also demonstrated a full 13-bank supply loop is rejected **after placing Transporters** and replacing the final Collector, while the same system had been able to close a loop **without** Transporters. Thus optional-pipe directed network discovery is incomplete (#86). Do not introduce the earlier planned whole-room adjacency scanner into the hot path while #87 is unresolved; a room layout cannot be the product topology.

## Mitigation scope and proof obligations

This release is deliberately limited to two behaviors that **cannot grant new cargo authority**:

1. **Dimension-handle reuse:** `main.js getDimension` memoizes successful native Dimension handles (not mutable Blocks, chunk observations, ItemStacks or inventories). Invalid/throwing dimensions are retried and never cached as loaded. Source-executed Node tests verify 10,000 reads use one native Dimension lookup while every Block still uses a fresh getBlock call, including chunk failures and all three Bedrock dimensions.
2. **Negative-only 20-tick memo:** `urce_152_live_link_guard.js` reuses only `HOLD`/`REJECT` across 20 ticks with registry/read-provider identity checking and event invalidation; positive `SAFE_SNAPSHOT` is **not cached past its tick**, and an explicit player link/relink always forces fresh observation. This reduces repeated topology scans for already-prohibited cyclic networks and stalled unknown routes, never bypassing route safety. Unobserved out-of-band changes might keep a now-legal path on HOLD until the bounded retry, which is a liveness delay rather than unsafe movement. Fails open to neither active transfer nor queue debit.

No native/Q4 writer bodies, 1.4.2 sorting/FIFO semantics, transport capacity, physical Hopper permissions, queue pages, or world state formats change. The new versioned 1.5.4 installer pins EXACT immutable owner-installed 1.5.3 SHA `aa108516b4fe5553b152bc6caf51a2cf8635037e`, hashes exactly 4 reviewed pack files, and forbids any unaudited delta.

## Remaining work before generic loop independence and full routing

No public claim of 20 TPS until owner in-game profiling. The `schedulerTick` per-tick property check and legal active Collector guard can still dominate while items remain in a source Hopper. A robust next increment must distinguish idle-but-nonempty from eligible cargo, move topology discovery to incremental dirty-revision snapshots with a fixed native call budget, and prove each supported item route from actual source→destination direction and custody. Avoid Transporter-required assumptions and no-op physical loops; HOLD when unknown. Native Hopper changes triggered by foreign addons, pistons and unloads may be unobserved by player place/break, so reuse of **positive** reachability across ticks remains prohibited until a sound revision witness exists.

Separate performance issue [#87](https://github.com/partom24/HartLogistics2/issues/87) from cycle correctness [#86](https://github.com/partom24/HartLogistics2/issues/86). Source-only CI and synthetic Windows backups are not Bedrock runtime proof.
