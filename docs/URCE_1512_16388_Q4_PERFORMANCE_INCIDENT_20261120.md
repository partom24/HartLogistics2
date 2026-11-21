# URCE protected Receiver: real BDS 16,388-Q4 stalled-drain + script-tick spike

**Observed:** 2026-11-20 local BDS time, profiles named `Capture_2026-11-21T00-35-11.561Z_JS.cpuprofile` and `_TS.cpuprofile`; diagnostics `diagnostics_2026-11-20_19-35-32.mcstats` and `.0.mcstats`. **Source installed in copied LAB:** 1.5.11-dev, NOT new 1.5.12 candidate. Source branch for mitigation: `dev/urce-1512-inert-native-terminus-20261120`. This report records aggregates only; no raw owner profile or world/registry data is uploaded to GitHub.

## Owner's actual live evidence

The owner manually toggled the redstone on a protected Receiver several times, comparing a powered `PAUSED` state with an unpowered `active` state. The screenshot displays **2 linked online Collectors**, **16,388/250,000 Q4**, **output Hopper: 0**, **route safety: verified snapshot**, and **lifetime received/delivered 52,951/36,563** before and after toggling. These values reconcile: `52951-36563=16388`. **No items were delivered during the observed attempts**. On unpower, script time spikes immediately; returning to powered promptly restores typical timings. Do not propose another test on this Receiver, ask the owner to power it down, unlink it, or bypass Q4.

## Decoded actual BDS diagnostics

Each `.mcstats` file contains a JSON metadata header plus many independently base64+gzip compressed per-tick stat JSON records; decoded **338 tick records** across consecutive tick indices `874417079..874417416`. `server_tick_timings/script_tick` exists on **169 records**, with values in microseconds. Following observed three-phase tick alignment:

| Phase | Tick range | Samples | Mean script tick (ms) | Median (ms) | Peak (ms) |
|---|---|---:|---:|---:|---:|
| Powered / quiet before | 874417079–874417217 | 70 | 27.86 | 26.58 | 53.71 |
| Receiver unpowered / hot | 874417219–874417295 | 39 | 131.04 | 125.76 | 191.82 |
| Powered again / quiet after | 874417297–874417416 | 60 | 27.03 | 24.41 | 70.71 |

Ratio **131.04 / 27.86 = 4.70x**. This is not merely a static configuration-time cost: it persists across dozens of live scripting samples while the Receiver is unpowered. The actual BDS captures establish **a serious server-tick regression**, not a theoretical source-stub performance claim.

## JavaScript profiler actual hot stacks

The JS and TS profile files resolve the **same** 1,106,357 samples spanning **26.75 seconds of sample deltas** and approximately **26.80 seconds elapsed**; their samples are not independent repeats and must not be double-counted. Profile inclusive time is nesting-aware and overlaps parent/child calls; the rows are NOT additive:

| Node/function (installed 1.5.11) | Inclusive sampled time |
|---|---:|
| `logisticsTick` | 14,210.85 ms |
| `processReceiverDrain` | **10,194.35 ms** |
| `receiverLinkSafety` | **9,402.87 ms** |
| `liveLinkCheck` (both sites) | 11,039.87 ms |
| `observeSupplyLinkSnapshot` | **9,382.67 ms** |
| `observeTransporterComponents` | 6,543.01 ms |
| `observeNativeHopperWitness` | 2,438.41 ms |
| `schedulerTick` | 11,283.72 ms |
| `sorterJournalPending` | 3,409.60 ms |
| `getQueueJournal` | 2,223.57 ms |

The graph walk's dominant observed `Dimension::getBlock` invocation node alone accounts for **4,051 ms inclusive**; the native block observer and `Block::typeId` are a major portion of the remaining time. No sampled `dequeueToReceiver` call appeared in this same profile. **Be precise:** a sampling profiler cannot prove zero calls occurred, but the owner's unchanged Q4/received/delivered screenshots corroborate no actual drained cargo during the attempts.

## Source root causes: safety check is not a delivery home

Installed 1.5.11 `main.js`:
1. `processReceiverDrain` loads a nonzero Q4, observes the Receiver/output Hopper, then calls `receiverLinkSafety` **on every enabled tick** before trying any Q4 dequeue. With two linked Collectors, `receiverLinkSafety` invokes `liveLinkCheck`, the source-wide native Hopper and Transporter graph observer, and in some cases a forced fresh observation. For a large but completely stationary Q4, this unproductive validation repeats each active tick.
2. `receiverLinkSafety` returns `SAFE_SNAPSHOT` whenever linked topology has no proven return cycle. It sets `routeKind:"DIRECT_NATIVE_SORTER"` only if the singular, positively closed local Sorter route exists.
3. The original Q4 drain **only permits** `NO_MANAGED_INPUT` (legacy unlinked route) or `SAFE_SNAPSHOT` **with** `routeKind:"DIRECT_NATIVE_SORTER"`. Any otherwise safe managed multi-bank graph without that home is **correctly HOLD**. The status string `verified snapshot` was misleading because it did not distinguish safe cycle/link topology from safe item/home delivery.

The **performance defect** was repeatedly rechecking the expensive native graph despite having no implemented home. The **functional gap** is still a missing safe multi-bank item-home/custody path, not a bad player-built Receiver or a reason to silently release Q4.

## Source-only mitigation on the still-uninstalled 1.5.12 branch

`main.js::processReceiverDrain` now:
- Retains the Q4 meta authoritative read and actual Receiver Hopper/power proof. No persisted queue state is inferred from a hint; no new writer is introduced.
- If a Receiver has a linked Collector, checks for a same-dimension registered vertical source column immediately under that Receiver's Hopper **before** any source-wide graph scan. If missing, **HOLD without native graph walk**.
- If such a column is registered, invokes the existing bounded live **read-only** `directSorterOutlet`; if it does not return `CLOSED_DIRECT_OUTLET`, **HOLD without source-wide graph walk**. Actual item-specific admission and cycle checks are still required and unchanged when the preflight passes.
- Does not memoize a positive check across ticks; a changed physical player layout may be re-observed next attempt. An unlinked 1.4.2 legacy Receiver keeps its original path. Q4 queue journal, page/metadata and all physical writer statements are untouched.
- `linkSafetyLabel` on status now displays `verified link topology; no governed item home (QUEUE HOLD)` for link-safe but not delivery-qualified managed Receivers. This is a diagnostic fix, not delivery authorization.

**Executable full shipped-runtime simulation** `FULL-NATIVE-11`: 1,442 Sorters, 2 Collectors, 1 Receiver, synthetic **16,388** Q4 items (metadata `r=52951,d=36563,q=16388`), non-eligible native end. Executes 40 ticks of actual shipped scripts and asserts Q4 metadata unchanged, 0 Hopper cargo, **0 `Container.setItem` calls, 0 Q4 journal writes**. Counts average **1,458 `Dimension.getBlock` per tick** from the entire unrelated active Sorter world and bounded Receiver/source checks, without repeated full Hopper/Transporter source graph exploration. These are native **stubs**, so cannot be claimed as an actual Bedrock TPS pass.

Prior source gate `WIRE-08/09` still checks actual eligible local closed-outlet fixtures can run full graph checks and refuse cycle/unknown without any debit; `WIRE-10` confirms legacy drain. Previous 1.5.11 chest, 1.5.12 inert block, real Q4 writer, and fixed 101-column tests retained. Guarded exact immutable 1.5.11→1.5.12 lab updater blob SHA pins updated to match these reviewed bytes, **but no LAB changes occurred**.

**Critical product boundary:** This is deliberately **containment only**. It does **not** drain the protected 16,388-item queue or implement arbitrary managed multi-bank routing. A verified directed home, single-Q4 journal transfer, foreign-path safety, legitimate Filter/Auto/Wildcard/Bulk/MR claim routing, no speculated receive, and BDS performance profiling are still prerequisites before enabling this Receiver. Do not advise toggling it again, doing a test installation on the active queue, or overriding safety checks. Do not give prior 1.5.12 source SHA after this modification; a new fully passing HEAD commit and its own stopped-LAB read-only preflight are required.
