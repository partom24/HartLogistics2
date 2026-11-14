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
