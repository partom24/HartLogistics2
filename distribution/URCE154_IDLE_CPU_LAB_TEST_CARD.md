# HartLogistics 1.5.4 — controlled idle-CPU Bedrock LAB retest

**Nonrelease source candidate, NOT installed. No cargo or topology edits are needed to measure idle CPU.** The owner has installed 1.5.3 in copied LAB from immutable commit `aa108516b4fe5553b152bc6caf51a2cf8635037e`. The owner reported a correct 13-bank supply-loop REJECTION after installing Transporters and replacing the last Collector. This verifies that *with-Transporters topology*, not a requirement for other player rooms to use pipes. The source's missing-pipe cycle-discovery defect (#86) is NOT solved by this performance release.

## Why a new idle test is needed

VS Code diagnostics capture `2026-11-19_19-02-55.mcstats` reported **script_tick median 74.3 ms (p90 100.5 ms, max 156.4 ms)** across 142 values over 142 ticks. The paired JS/TS CPU profiles cover the SAME 17.25 seconds. Of that profile, **9.97 seconds are attributed to logisticsTick**, including 7.10 seconds to native Hopper / visual Transporter safety observations; **6.49 seconds are attributed to schedulerTick**. The full native reader calls `world.getDimension` roughly **198,837** times across the profile. This indicates a severe **idle/no-completed-item-transfer CPU problem**. The profile may include VS Code/diagnostic instrumentation overhead; native LAB timings decide acceptance.

## Reviewed 1.5.3 → 1.5.4 code delta (exact four pack files)

- `main.js` only changes the version and memoizes **known valid Dimension handles**. A native Dimension is a stable world handle; every `getBlock` still rereads its Block. Failed/unknown Dimension reads retry rather than becoming fabricated air. Original Sorter and Receiver Q4/native journal writer bodies are unchanged.
- `urce_152_live_link_guard.js` adds **bounded 20-tick reuse of ONLY negative `REJECT` or `HOLD`** results, keyed to the exact loaded Collector/Receiver registry and read provider. Pending/blocked cargo remains at its custodian; reusing denial is never route permission. **`SAFE_SNAPSHOT` is NEVER reused across ticks**. Player block placement/break, new registered/linked blocks, in-place registry change, changed reader and forced link preflight invalidate cached negatives; a natural retry occurs at 20 ticks even for unobserved changes.
- BP/RP manifest version increments to **1.5.4**; UUIDs, accepted resource geometry, textures and all other pack bytes are unchanged. `@minecraft/server 2.7.0` remains pinned.
- Comprehensive Node regression tests execute the actual live guard and actual main.js dimension functions, while historical Q4/native writer-body parity, exact immutable 1.5.3 predecessor, Windows rollback and synthetic world registration tests remain mandatory. **Green source CI is not a measured BDS improvement**.

## Owner actions only after green exact-HEAD CI and separate LAB authorization

Use the existing Git-managed `distribution/Start-HartLogistics-Lab.ps1` launcher (1.5.4 becomes its default). Run Plan to obtain the full exact Git commit; CheckLab with that SHA on a stopped **COPIED LAB**; then and only by explicit choice, `Install -Apply -ExpectedCommit $sha`. If the installed BP/RP hashes or world registrations don't match exact owner-installed **1.5.3** (commit `aa108516...`), it must REFUSE. Keep previous rollback backups **`lab-0bff63ebe84e`** and **`lab-c77b47f7c165`** plus the new generated backup. Never bypass a preflight or touch production.

**Idle profiler acceptance:** Without introducing new items or altering links, stand in the SAME 13-bank loaded region with the SAME player / server state and VS Code diagnostics. Run a new paired `.mcstats` and CPU profile for a comparable quiet interval. Compare Bedrock `script_tick` p50 / p90, count of `World::getDimension`, time in `logisticsTick → liveLinkCheck → observeSupplyLinkSnapshot`, and `schedulerTick`. A loop in the existing registry should remain **REJECT/HOLD** for ingress and Receiver Q4 drain; no cargo movement should become authorized by negative caching. **Any performance improvement is conditional until measured.**

The new source candidate does not implement optional-pipe-independent generic directed routing or Bulk. If still above the budget, prioritize source-specific dirty-path revalidation and verified item source admission; do not bypass no-loop protection or globally throttle Sorter polling.
