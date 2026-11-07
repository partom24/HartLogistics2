# Hart Logistics 2 — Roadmap

## Outcome

Expand the owner-supplied Minecraft Bedrock Hart Logistics 1.4.1 add-on with Bulk Storage, a high-throughput Transporter, and a safer/higher-throughput Q5 dual-lane Receiver architecture **without losing any 1.4.1 capability or existing world data**. Release is separate from design, code review, tests and merge.

## Completed

- **No Hart Logistics 2 gameplay milestones completed.** The existing repository began as the Project Engineering Blueprint template, whose BP-* achievements are **not** Hart Logistics history.
- Owner supplied Hart Logistics 1.4.1 mcaddon and HartBots 1.8.2 reference mcaddon. Original archive fingerprint recorded in [baseline registry](BASELINE_REGISTRY.md). **Bundle 0 imported the exact original 1.4.1 BP/RP source into `addon/`: 72/72 unchanged files, pinned by commit and hashes.** HartBots remains a reference upload only.

- **HL-IMPORT-001 — Completed at exact source/hash scope (Bundle 0, 2026-11-07):** imported unmodified 1.4.1 BP/RP source, pinned original Git import commit `0ea3000` and 72 original file hashes. No gameplay implementation or world test.
- **PG-02 — Offline GO (Bundle 0):** guarded HartLogistics LAB updater candidate and 9/9 synthetic safety/rollback tests; actual Windows LAB install remains untested and requires separate permission. See [Bundle 0 results](BUNDLE0_RESULTS.md).

## Now

- **HL-PLAN-001 — Planning ledger milestone.** The owner now reports **Bundle 2 already under development**; this documentation correction does not restart that work, promote undocumented tests, or authorize additional scope. MR-dependent Bundle 2 work must respect the PG-03 compatibility blocker. See [current state](CURRENT_DEVELOPMENT_STATE.md).
- Exit when the owner has reviewed the open implementation gates and approved a design direction. A planning document or PR merge alone is not owner acceptance.

## Next

- **HL-TEST-001 (candidate, not approved):** Build preservation tests for 1.4.1: redstone, all Sorter modes, item frames, vanilla hopper and dispenser/dropper routes, linking, q2/q3/q4 data, journal/crash recovery, exact item counts, metadata and unload/reload. All in-game testing is restricted to the disposable LAB server.
- **HL-UPDATER-001 (partially complete, offline only):** HartLogistics-specific LAB-only Python updater and permanent nine-test safety suite exist and pass synthetic checks. **Actual Windows LAB installation remains untested and unapproved.** The HartBots production updater remains inert reference only and **must not be run before nominated RC**. See [Bundle 0 results](BUNDLE0_RESULTS.md) and [updater design](UPDATER_DEPLOYMENT_DESIGN.md).
- **HL-Q5-001 (candidate, not approved):** Implement and test staged Q4→Q5 migration and a metadata-preserving native lane, conditional on platform support and acceptance.
- **HL-TRANSPORT-001 and HL-BULK-001 (candidates, not approved):** Implement Transporter and Bulk Storage with bounded transfer budgets, network-aware routing and failure recovery.

## Later

- HartBots Depot native high-throughput integration via a separately approved interface/change in that project. No HartBots repository access in this project.
- Performance optimization, tuning, more block variants or new release only after baseline and integration acceptance.

## Preliminary subsystem stop/go gates

See [Preliminary Go / No-Go Tests](PRELIMINARY_GO_NO_GO.md). Limit **owner-performed BDS sessions to 2–3 related checks per complete reusable rig**; run as many automated/offline/CI tests as useful, or authorized automated LAB tests, without artificial 2–3-test pauses, reusing setups and prior evidence. Four bundles progress from offline baseline/updater proof to 26.63 MR endpoint proof, old-world upgrade proof, and network feasibility. The owner has **approved the test plan conditional on prompt removal of temporary testing parameters/hooks under the template policy**. PG-01/02 passed at their offline scope; **PG-03 NO-GO** for the owner-reported nonexperimental BDS 1.26.63.1 target; **PG-04/05 BLOCKED / NOT RUN**; PG-06–PG-11 have no accepted BDS verdict recorded. Owner reports Bundle 2 underway. Plan approval alone does not authorize gameplay code, experiments or LAB deployment.

## Decisions and blockers

- **Hard gate:** zero 1.4.1 capability loss; the supplied archive remains the comparison baseline, not an accepted Git frozen reference.
- **Hard gate / Bundle 1 result:** custom native MR container probe not obtainable on the approved no-experiments BDS 1.26.63.1 configuration; **PG-03 NO-GO** and dependent PG-04/05 not run. Do not enable experiments or drop legacy MR capability; evaluate a supported alternative/version only after evidence and owner decision. See [Bundle 1 results](BUNDLE1_PREPARATION_RESULTS.md).
- **Open:** controller boundary/discovery/failover, pipe extraction control, routing at junctions, wildcard behavior with unavailable banks and MR items, capacity accounting, MR prioritization/fairness, save transaction protocol and legacy upgrade path. See [inbox](IDEA_INBOX.md).
- **Bundle 0 source import and offline LAB updater safeguards were completed.** Bundle 1 yielded a bounded LAB NO-GO and owner-reported LAB cleanup, while **Git-side disposable probe cleanup remains open**. These results do not authorize experiments, production operations or release. Importing the **production updater reference** is allowed without permission to invoke it. All release testing takes place in LAB only; production remains protected.

