# Hart Logistics 2 — Roadmap

## Outcome

Expand the owner-supplied Minecraft Bedrock Hart Logistics 1.4.1 add-on with Bulk Storage, a high-throughput Transporter, and a safer/higher-throughput Q5 dual-lane Receiver architecture **without losing any 1.4.1 capability or existing world data**. Release is separate from design, code review, tests and merge.

## Completed

- **No Hart Logistics 2 gameplay milestones completed.** The existing repository began as the Project Engineering Blueprint template, whose BP-* achievements are **not** Hart Logistics history.
- Owner supplied Hart Logistics 1.4.1 mcaddon and HartBots 1.8.2 reference mcaddon in conversation; 1.4.1 original archive fingerprint is recorded in [baseline registry](BASELINE_REGISTRY.md). Neither is a committed add-on source tree here.

## Now

- **HL-PLAN-001 — Owner-authorized requirements and architecture planning (active).** Record the two new blocks, multi-controller/closed-loop topology, Q5 migration and MR lane; separate accepted requirements from candidates; identify decisions and compatibility tests needed before an implementation authorization. **This milestone does not authorize code changes.**
- Exit when the owner has reviewed the open implementation gates and approved a design direction. A planning document or PR merge alone is not owner acceptance.

## Next

- **HL-IMPORT-001 (candidate, not approved):** Import the unchanged 1.4.1 behavior/resource source under addon/, pin a Git baseline, record the original archive/hash and establish buildable/source-review fixtures without altering gameplay.
- **HL-TEST-001 (candidate, not approved):** Build preservation tests for 1.4.1: redstone, all Sorter modes, item frames, vanilla hopper and dispenser/dropper routes, linking, q2/q3/q4 data, journal/crash recovery, exact item counts, metadata and unload/reload. All in-game testing is restricted to the disposable LAB server.
- **HL-UPDATER-001 (candidate, not approved):** Adapt guarded HartBots-inspired updater to HartLogistics2 for **LAB-only** installation; source/import reference allowed. Dry-run defaults, strict path/pack checks, staged backup/hash verification, preserve other packs, rollback on error. The HartBots **production updater may be imported as inert reference source**, but **must not be run before a nominated release candidate**. See [updater design](UPDATER_DEPLOYMENT_DESIGN.md).
- **HL-Q5-001 (candidate, not approved):** Implement and test staged Q4→Q5 migration and a metadata-preserving native lane, conditional on platform support and acceptance.
- **HL-TRANSPORT-001 and HL-BULK-001 (candidates, not approved):** Implement Transporter and Bulk Storage with bounded transfer budgets, network-aware routing and failure recovery.

## Later

- HartBots Depot native high-throughput integration via a separately approved interface/change in that project. No HartBots repository access in this project.
- Performance optimization, tuning, more block variants or new release only after baseline and integration acceptance.

## Preliminary subsystem stop/go gates

See [Preliminary Go / No-Go Tests](PRELIMINARY_GO_NO_GO.md). Run only **2–3 related checks in a batch**, reusing setups and prior evidence. Four bundles progress from offline baseline/updater proof to 26.63 MR endpoint proof, old-world upgrade proof, and network feasibility. Gates are **planned but not run**; they do not authorize code by themselves.

## Decisions and blockers

- **Hard gate:** zero 1.4.1 capability loss; the supplied archive remains the comparison baseline, not an accepted Git frozen reference.
- **Hard gate:** native custom block container functionality in 1.26.50 may require the Upcoming Creator Features experiment; verify stable API/target-version compatibility before requiring it. See [Q5 design](Q5_MIGRATION_DESIGN.md).
- **Open:** controller boundary/discovery/failover, pipe extraction control, routing at junctions, wildcard behavior with unavailable banks and MR items, capacity accounting, MR prioritization/fairness, save transaction protocol and legacy upgrade path. See [inbox](IDEA_INBOX.md).
- No gameplay implementation milestone, source import, world migration or release is presently authorized. Importing the **production updater reference** is allowed without permission to invoke it. All release testing takes place in LAB only; production remains protected.

