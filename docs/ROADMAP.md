# Hart Logistics 2 — Roadmap

## Outcome

Expand the owner-supplied Minecraft Bedrock Hart Logistics 1.4.1 add-on with Bulk Storage, a high-throughput Transporter, and a safer/higher-throughput Q5 dual-lane Receiver architecture **without losing any 1.4.1 capability or existing world data**. Release is separate from design, code review, tests and merge.

## Completed

- **No Hart Logistics 2 gameplay milestones completed.** The existing repository began as the Project Engineering Blueprint template, whose BP-* achievements are **not** Hart Logistics history.
- Owner supplied Hart Logistics 1.4.1 mcaddon and HartBots 1.8.2 reference mcaddon. Original archive fingerprint recorded in [baseline registry](BASELINE_REGISTRY.md). **Bundle 0 imported the exact original 1.4.1 BP/RP source into `addon/`: 72/72 unchanged files, pinned by commit and hashes.** HartBots remains a reference upload only.

- **HL-IMPORT-001 — Completed at exact source/hash scope (Bundle 0, 2026-11-07):** imported unmodified 1.4.1 BP/RP source, pinned original Git import commit `0ea3000` and 72 original file hashes. No gameplay implementation or world test.
- **PG-02 — Offline GO (Bundle 0):** guarded HartLogistics LAB updater candidate and 9/9 synthetic safety/rollback tests; actual Windows LAB install remains untested and requires separate permission. See [Bundle 0 results](BUNDLE0_RESULTS.md).

## Now

- **HL-PLAN-001 — Owner-authorized requirements and architecture planning (active).** Record the two new blocks, multi-controller/closed-loop topology, Q5 migration and MR lane; separate accepted requirements from candidates; identify decisions and compatibility tests needed before an implementation authorization. **This milestone does not authorize code changes.**
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

See [Preliminary Go / No-Go Tests](PRELIMINARY_GO_NO_GO.md). Limit **owner-performed BDS sessions to 2–3 related checks per complete reusable rig**; run as many automated/offline/CI tests as useful, or authorized automated LAB tests, without artificial 2–3-test pauses, reusing setups and prior evidence. Four bundles progress from offline baseline/updater proof to 26.63 MR endpoint proof, old-world upgrade proof, and network feasibility. The owner has **approved the test plan conditional on prompt removal of temporary testing parameters/hooks under the template policy**. PG-01/02 GO at documented scope; PG-03 NO-GO; PG-04/05 BLOCKED; PG-06–11 NOT RUN. Plan approval alone does not authorize gameplay code, experiments or LAB deployment.

## Decisions and blockers

- **Hard gate:** zero 1.4.1 capability loss; the supplied archive remains the comparison baseline, not an accepted Git frozen reference.
- **Hard gate:** native custom block container functionality in 1.26.50 may require the Upcoming Creator Features experiment; verify stable API/target-version compatibility before requiring it. See [Q5 design](Q5_MIGRATION_DESIGN.md).
- **Open:** controller boundary/discovery/failover, pipe extraction control, routing at junctions, wildcard behavior with unavailable banks and MR items, capacity accounting, MR prioritization/fairness, save transaction protocol and legacy upgrade path. See [inbox](IDEA_INBOX.md).
- **Bundle 0 source import and offline LAB updater preparation were specifically authorized and completed**. This does not authorize Q5, new blocks, in-game probes, any server changes or release. Importing the **production updater reference** is allowed without permission to invoke it. All release testing takes place in LAB only; production remains protected.


## Bundle 1 closed, 2026-11-07

The Windows Git-to-LAB PowerShell probe passed synthetic tests and owner-observed install/cleanup, but the custom native block identifier was unavailable on the non-experimental 1.26.63.1 BDS target. **PG-03 NO-GO, PG-04/05 BLOCKED**. Owner subsequently confirmed final LAB cleanup; every disposable probe/launcher and CI wiring has been removed. Only evidence and original 1.4.1 source remain. Next step: evaluate the [lossless MR storage alternatives](MR_CUSTODY_ALTERNATIVES_12663.md) and obtain owner direction before a new runtime spike; no gameplay implementation is approved.

## Proposed next independent slice (2026-11-07)

[Safe execution plan](NEXT_SAFE_EXECUTION_SLICE_12663.md) proposes preserving existing native MR bypass while first proving ordinary Transporter topology and Bulk overflow model offline. All tests are independent of the experimental custom inventory feature; actual new block/gameplay implementation remains a separate authorization gate. No BDS manual rig requested.

## Bundle 2 initiated — offline-only (2026-11-07)

After explicit owner authorization, source-derived PG-06 legacy identity/link/queue checks, PG-07 **abstract** crash/restart and frozen shadow-Q5 model, and PG-08 standalone link/confirmation/revision menu policy checks passed offline (25/25; [results](BUNDLE2_PREPARATION_RESULTS.md)). Actual PG-06/07/08 BDS gates **NOT RUN**, PG-03 native MR blocker persists. No original addon behavior, Q5 state, UI component, server flags or worlds changed. Menu UI is the next independently feasible candidate, **not** automatic approval for rollout.

## PG-08 candidate implementation (2026-11-07)

A first *isolated, uninstalled* Collector/Receiver menu candidate now exists under `candidates/pg08` with a source-hash-verified offline derived-pack build and targeted JS/Python mock test suites. It is **not implemented in the active 1.4.1 `addon/`**, has not passed verified CI or any BDS check, and cannot be treated as accepted runtime UI. Prior PG-08 abstract model test status remains separate. Candidate iteration must prove source/build checks first; a narrowly approved LAB install then tests cancel/relink/unchanged sneak behavior only after the failed 1.5.0 registered pack/world state is assessed. Q5 and native MR custody stay blocked.
