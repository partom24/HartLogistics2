# HL2 visual-maintenance performance regression: inherited 1.4.1 100-tick spike

**Observed:** Owner's restored **Hart Logistics 1.4.1** LAB profiling, 2026-11-13,
seven `.mcstats` captures. This evidence belongs to the **1.5/HL2
compatibility acceptance** target. Do not treat it as permission to patch the
unchanged 1.4.1 release, worlds, original Q4 source, or current LAB deployment.

## Owner evidence and scope

- Original restored LAB census: **1,387 Sorters, 56 Collectors, 36 Receivers**,
  46 linked Collectors, **279,458** queued Q4 items.
- Capture windows contained **1,119 distinct ticks**. Median scripting
  timing was approximately **57–58 ms**, with 77–78% of script readings above
  50 ms. These numbers are reported script times, **not per-add-on CPU attribution
  or proven TPS**.
- **11 script spikes >150 ms**, all aligned to **tick % 100 == 62**,
  roughly **208–378 ms**. The original 1.4.1 source schedules
  `system.runInterval(reconcileDisplays, 100)`; that routine reconciled all
  registered Sorters, then globally enumerated every display helper entity in
  Overworld, Nether, and End on a single tick.
- **Correlation is strong, not a function-level CPU proof.** Other add-ons
  share the engine, and `.mcstats` does not attribute function CPU costs.

## HL2 source correction (draft PR #79, not deployed)

The generated 1.5 product inherited the same full 100-tick routine from its
1.4.1/PG33 predecessor. The 1.5 builder now **removes the inherited
whole-registry reconciliation body**, replaces it with
`uceReconcileDisplaysIncremental()`, and schedules one **bounded slice each
tick**. Source: `candidates/uce/runtime_display_reconcile.js`; binding:
`candidates/uce/prepare_candidate.py`.

The maintenance budget is **16 Sorter entries per tick**, round-robin.
At 1,387 Sorters one complete registry pass requires **87 ticks**.
The existing local `syncDisplay`/`removeDisplay` implementations still
handle ordinary filter visuals and physical native-frame exceptions; unloaded
Sorter entries are **not treated as missing/deleted owners**.
The previous **dimension-wide `getEntities({type: DISPLAY_ID})`** census is
absent from the generated main. Existing Sorter-break cleanup still removes
locally owned displays.

This is a **visual maintenance workload budget**, **not** a count limit on
Sorters, a routing graph limit, a per-bank physical arrangement requirement, or
a logistics transport-item budget. It must not restrict the owner's freeform
construction.

`/hartlogistics:perf` (session monitoring opt-in) reports observed display
slice counts, entries checked, slow slices and maximum slice wall time, in
addition to the integrated custody scheduler timing. Default monitoring remains
off, no new world property or persistent custody writer is introduced.

## Non-regression gates

- `tests/test_uce_display_reconcile_scale.mjs` executes the actual bounded
  helper at **1,387 entries**, checks all entries are eventually serviced,
  a maximum of 16 per invocation, correct native-frame/unloaded handling,
  registry growth/shrink, and bounded monitor reporting.
- Generated-main test in `tests/test_uce_candidate_build.py` re-executes the
  **compiled** same function and requires no surviving global
  `dim.getEntities({type: DISPLAY_ID})`, no 100-tick sweep, no unbounded
  startup pass, and the unchanged original 1.4.1 source.
- Early CI runs the source test; the generated candidate's Python test runs
  the compiled variant. Source or CI passing is **not** measured BDS
  performance or release approval.

## Remaining scale risks / BDS acceptance

- The median approximately 57 ms script load is **not explained by one periodic
  spike**. A separate every-tick scan exists in the integrated direct-Sorter
  service; the other routing, collector, receiver and native journal costs
  require real-world profiling. Do not reduce scan/transport capacity without
  proving no loss of expected throughput or filter priority.
- Without the old global entity enumeration, preexisting unowned display helper
  entities at **locations unrelated to any registered Sorter** are not
  automatically reaped by this periodic routine. Block-local removal still
  cleans owned displays. A bounded cleanup mechanism may be needed if old
  orphan helpers are actually observed; do not reintroduce a one-tick world
  census as a silent workaround.
- Acceptance on a backed-up LAB copy of the real architecture should compare
  `.mcstats` scripting percentiles, specifically the 100-tick phase pattern,
  a function-level `.cpuprofile` of display/custody routines, transfer
  throughput, and real TPS over multiple stable windows.
- A visible source limitation (e.g. lack of completed Q4 metadata-rich cutover)
  remains unresolved independently of this performance change. Never deploy
  this draft over the restored production-world copy as an unapproved upgrade.

**Evidence status:** OBSERVED 1.4.1 periodic script timing; SOURCE-CONFIRMED
inherited 1.5 display sweep; SOURCE-CORRECTED generated 1.5 scheduling
pending exact-head CI and BDS performance acceptance.

## Follow-up: actual 1.4.1 script CPUProfile, 2026-11-14

Two uploaded files (`*_JS.cpuprofile` and `*_TS.cpuprofile`) contain
**the same** 12.962-second sample sequence and time deltas, with only the
source URL/line rendering changed. **Do not double-count** them as independent
profiling sessions. The profiler's `hitCount` matches recorded native API
invocations; percentages below are **recorded API-call shares**, not
CPU-time attribution or TPS.

At real 1,387-Sorter owner scale:

| Recorded native API family | Calls |
| --- | ---: |
| `Container::size` | 400,436 |
| `Container::getItem` | 363,050 |
| `ItemStack::isStackableWith` | 140,600 |
| `Block::typeId` | 123,619 |
| `Dimension::getBlock` | 106,741 |
| `World::getDimension` | 93,433 |

The profile contains 1,485,347 API-call samples in 12.962 seconds.
Ancestry under `schedulerTick > processColumn` accounts for **1,355,758
(91.28%)** of recorded calls; `logisticsTick` accounts for 111,518
(7.51%). The hottest nested call ancestry:

- `schedulerTick > processColumn > findAcceptSlot`: 439,931 recorded
  calls (29.62%), primarily repeated `size`, `getItem`,
  `isStackableWith`.
- `schedulerTick > processColumn > compactSourceHopper`: 280,676
  (18.90%), primarily Hopper slot observations.
- `reconcileDisplays` contributes only 1,956 calls in this short
  capture; this **does not refute** the separate `.mcstats` 100-tick
  wall-time spike evidence, which is measured differently.

The 1.5 UCE scheduler already freezes the original 1.4.1
`schedulerTick` while unified authority is active, avoiding the legacy
`compactSourceHopper` pass. However, its own direct Sorter lane scans
active physical columns and can redundantly fetch native dimensions and
scan storage inventories.

**Further 1.5 changes committed:** per-invocation caching of dimension
handles in `uceSorterDirectServiceTick` (not block/slot state; every
column is still checked each tick), and reuse of the native
`findAcceptSlot` result already verified in
`uceSorterColumnWinner` before beginning the transaction. Exact route
and slot proofs still run at the mutation/ACK boundary.

Tests in `tests/test_uce_141_cpuprofile_api_regression.mjs` exercise the
actual source/compiled functions with 1,387 columns in three dimensions;
they verify three dimension lookups, **all 1,387 live block observations**,
and a new full observation next tick. This does **not** impose new
placement rules, introduce a skipped-column scan window, or claim
Bedrock CPU improvements without a comparative in-game profile.

**Remaining high-priority performance work:** determine `uceSorterDirectServiceTick`
native API volume and custody throughput on the same loaded physical
topology, inventory-acceptance scans in both native/ordinary lanes,
repeated per-bank topology discovery, and carrier/journal I/O. Any
scan-budget change must preserve priority, redstone, hopper pass-through,
Collector reachability, safety and per-tick throughput rather than
simply hiding work by delaying transfers.
