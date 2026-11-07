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

## PG-08 LAB menu-linking result and next unblocked slice (2026-11-07)

- **PG-08 independent menu/linking slice — functional LAB GO, owner-confirmed:** at 1.5.1-LAB-PG08 on BDS 1.26.63.1/client 26.63, original Collector/Receiver identities and registry loaded, explicit A/B link/relink, unlink, cancellation without state change, and link persistence after an owner-confirmed server restart. See [evidence register](ENGINEERING_EVIDENCE_REGISTER.md) HL-E-023–030 and [LAB rig card](../candidates/pg08/TEST_SESSION.md). **Testing is finished; physical C/A/B/dummy cleanup pending.** Backup `lab-5af88e18cff3` retained. The original 72 `addon/` BP/RP source files and production remain untouched.
- **Not a full PG-08 Q5 GO or release:** native MR/custom block inventory PG-03 NO-GO; PG-04/05 blocked; PG-06/07 full native migration blocked. Read-only candidate reports Q5 **not installed**, not pending/in-progress/complete per-block migration. No Q5 storage, new gameplay Transporter/Bulk or cross-API menu collision passed by inference.
- **NEXT (underway, offline only):** advance six-face ordinary Transporter region authority / fail-closed topology model and controller safety scenarios; retain Hopper equivalence and original MR direct-only custody. The new 13-case [offline authority model](../tests/test_transport_authority_model.py) rejects partial graphs/contested ownership without electing controllers, admitting items or changing worlds. **Separate authorization is required before making or installing gameplay Transporter/Bulk blocks.** Controller election and ownership-on-partition remain open decisions, not accepted designs.

## Ordinary Transporter/Bulk first executable core — offline milestone (2026-11-07)

- **DONE — code and CI only:** independent `candidates/transport/ordinary_network_core.mjs` six-face local routing, validated input/output port policy, 200,000-count/member Bulk reservation model and conservative full/unknown routing, epoch/revision fencing, and duplicate receipt rejection. [27 real JavaScript tests](../tests/test_transport_bulk_core.mjs) and prior 13 Python authority scenarios passed GitHub CI. See [core constraints](TRANSPORTER_BULK_OFFLINE_CORE.md) and evidence HL-E-032.
- **NOT DONE:** playable block/texture, controller election, durable physical item custody, actual slot/bank attachment routing, crash-safe journal, Bulk split/merge and multi-controller authorization, or a runtime LAB test. Existing `addon/` source remains immutable and MR/Q5 native custody is still blocked.
- **NEXT:** standalone fault-injected durable journal and reconstruction model to establish crash/retry guarantees before any actual physical item movement or Bedrock integration. No repeat PG-08 rig or owner-side actions requested for this offline stage.

## Ordinary transfer journal milestone — offline fault proof (2026-11-07)

- **DONE, standalone Node model only:** [append-only journal and fault test matrix](TRANSPORT_JOURNAL_FAULT_MODEL.md) with **27 simulated crash/replay/corruption tests**. Every possible post-intent interruption remains ambiguous and is quarantined/HOLD until separately authoritative receipt evidence exists; never retry source debits merely because the ACK was lost. Journal bank accounting is modeled for new empty 200,000-item ordinary Bulk members only.
- **NOT DONE:** Bedrock Script API-compatible durable persistence, authenticated physical source/destination receipts, crash-atomic transfer and reconciliation; actual new blocks, assets, controller elections and cross-chunk routing remain open. Node `fsync` on synthetic files is not Bedrock-world durability evidence. Do not ask owner to test or enable experiments.
- **NEXT unblocked safety work:** verify Minecraft-supported persistent journal/receipt primitives on the installed stable API using source research and an isolated non-deploying adapter design; if crash-atomic custody is unavailable, maintain HOLD and propose bounded reconciliation instead of claiming item movement is safe. Original 1.4.1 and PG-08 LAB install remain unchanged.

## PG-13 next LAB gate — shadow journal persistence (2026-11-07)

- Built **derived 1.5.2-LAB-PG13** candidate and guarded installer strictly upgrading accepted/unchanged 1.5.1-LAB-PG08; original baseline protected. Four operator commands create and check a **simulated** RESERVED → HANDOFF_INTENT marker in two tiny namespaced world dynamic properties; no physical item is moved. Shadow commands are restricted to the existing isolated Overworld room, no cheats, no experiments or new block assets. See [test scope/card](../candidates/pg13/TEST_SESSION.md).
- Offline checks (15 live-JS callback mocks, six source/build invariants, 13 synthetic updater/rollback checks) and four cross-platform CI jobs passed. **PG-13 actual BDS manual test pending**. It tests only whether the stable world property store preserves a pair of checksummed markers after a **normal** LAB restart and the script correctly holds ambiguous transactions. This is not crash-atomic ItemStack custody acceptance.
- If successful, next must establish trustworthy actual source/destination physical receipt, controller epoch, loaded-chunk and durable handoff/reconciliation before any ordinary Bulk/Transporter item routing. PG-03/06/07 native MR blocker remains; no deployment to production implied.

## PG-13 LAB normal restart observed — supporting persistence gate PASS (2026-11-07)

- **Owner-observed PASS:** `BEGIN PASS`/ `INTENT PASS` screens, then after clean LAB BDS 1.26.63.1 stop (exit 0)/start, `RESTART READBACK PASS` and `HOLD_AMBIGUOUS_HANDOFF`; runtime pack identified as 1.5.2-LAB-PG13. This proves synthetic dynamic-property state survived an ordinary clean restart **only**. Source-held nonstackable enchanted-book/saddle q4 warnings are not a PG13 defect. See evidence HL-E-035.
- **Not yet observed:** diagnostic `shadowclear` cleanup (owner should run it if not already), crash-atomic or multi-key write guarantees, any actual physical ItemStack move, or Bulk/Transporter gameplay. Do **not** infer world consistency or item-custody release from shadow markers.
- **Next focused implementation:** fail-closed read-only physical vanilla container snapshot/identity and a *bounded single-item, test-owned* handoff + authoritative readback design. Keep existing LAB build/backup unchanged until a separate owner-approved test, and preserve original 1.4.1 and all other mods.

## PG-14 first bounded vanilla inventory custody LAB acceptance prepared (2026-11-07)

- Built isolated 1.5.3-LAB-PG14 candidate from protected 1.4.1 + owner-tested PG-08/PG-13, no change to gameplay baseline. Fixed single-chest coordinates **(-955,69,-804)** and **(-951,69,-804)** in existing room and just one user-owned plain cobblestone; explicit read-only inspect, one native move with pre-/post- 27-slot snapshots and two PG14-only journal markers, read-only restart status and tightly gated cleanup. The [owner card](../candidates/pg14/TEST_SESSION.md) has the full rig, command sequence and stop conditions.
- Offline gate: **24 Node VM physical custody/error scenarios**, six source-hash/compiler invariants, 13 synthetic LAB deploy/rollback tests. Windows and Linux CI must pass before any install. Existing 1.5.2 installed pack hash must match exact PG-13 compiler output or installer refuses.
- **Pending actual BDS proof:** normal restart source/destination slot and durable SETTLED marker visibility. Still **not** crash-atomic, no actual Bulk/Transporter routing and no native MR/Q5 acceptance; all other mods and production remain untouched.

## PG-14 LAB physical one-item custody gate passed — still not crash atomic (2026-11-07)

- **Owner-observed clean-restart PASS** for one test-owned plain cobblestone from isolated vanilla single chest A `(-955,69,-804)` to B `(-951,69,-804)`: exact precondition `INSPECT PASS`, one-shot native transfer `TRANSFER READBACK PASS` with journal `SETTLED`, then after normal LAB restart `RESTART CUSTODY READBACK PASS`, A empty, B exactly one cobblestone; B UI corroborated one cobble. Earlier Large Chest/54-slot refusal proves no transfer in unsafe geometry, not a transfer bug. See HL-E-037.
- **Cleanup: owner-observed PASS (HL-E-039).** Earlier screenshot shows `CLEAN PASS` for two PG14 test keys with both chests empty; later duplicate clear correctly refuses with `HOLD` because no SETTLED transaction remains. **Remaining:** no forced-crash or power-loss tests, no atomic journal+inventory commit guarantee, controller/region concurrency, unloaded chunks, metadata-rich items or scalable Bulk/Transporter gameplay.
- **Next source work:** strengthen durable reconciliation of `RESERVED`, `INTENT` and `SETTLED` against actual physical inventories using fail-closed stale-state and provenance checks, with synthetic fault cases before requesting any next LAB test. Preserve 1.4.1 and production isolation.

## After PG-14: offline read-only physical/journal reconciliation model (2026-11-07)

- Built [pure JavaScript physical reconciliation core](../candidates/transport/physical_reconciliation_core.mjs) with **26 modeled fail-closed snapshot/receipt tests**. It never repeats or settles a journal `HANDOFF_INTENT` automatically, even when one cobblestone appears to be present in Chest B. It verifies fully known single-chest snapshots and expected receipt before classifying already-SETTLED state as observed, read-only. See [matrix](TRANSPORT_PHYSICAL_RECONCILIATION.md), HL-E-038.
- Still cannot establish unique identity of an ordinary cobble, exclusive controller lock, snapshot atomicity or world-save crash atomicity. The LAB remains at owner-tested 1.5.3; no new install, chest or further physical move is authorized by this code.
- **Next:** fail-closed manual reconciliation/isolated failure-injection design for one disposable test item, including proof that no recovery path moves an item a second time; do not integrate Bulk/Transporter virtual storage or PG-06/07 Q5 until explicit custody safety is established.

## PG-15 deterministic interrupted handoff LAB gate prepared (2026-11-07)

- In source only, derived [1.5.4-LAB-PG15](../candidates/pg15/TEST_SESSION.md) from hash-gated 1.5.3-LAB-PG14. No new blocks, experiments, automatic game/item operations or changes to `addon/`. Owner test only after stopped-LAB guarded install. Two controlled CUT commands isolate an intent written **before** a deliberately skipped physical move and an intent written **before** one physical move but with settlement deliberately skipped. Both must be read after normal BDS restarts and must stay **HOLD/no replay**.
- Offline gate: **27 JavaScript VM fault and restart scenarios**, 6 candidate identity tests, 13 synthetic upgrade/rollback checks and cross-platform CI. Manual read-only audit + owner-empty chests required for scoped test-marker cleanup. PG14 physical clean restart and marker cleanup were already accepted and do not need rerun.
- **Still blocked:** sudden BDS termination / power-loss guarantee, native inventory+world dynamic-property atomicity, exclusive controller authority under concurrent players/automation, unique provenance of ordinary item counts, metadata-rich Q5 and Bulk Storage. Deliberate clean-restart cutpoint PASS is useful application fail-closed evidence, not a release gate.

## PG-15 owner-controlled pre/post handoff normal-restart acceptance complete (2026-11-07)

- **PRE INTENT** was recorded and held without moving an item, but the operator removed the cobblestone too early, then restored it and performed a clean LAB restart. The resulting `RESTART CUT AUDIT PASS: PRE` with `A_ONE_B_EMPTY`, HOLD/no retry, and subsequent `CLEAN PASS` are **reconstructed acceptance**, not proof the same item remained untouched at the source throughout.
- **POST INTENT** achieved complete owner-observed clean-restart acceptance: one disposable plain cobblestone native-moved from A to B without settlement, `RESTART CUT AUDIT PASS: POST` read the persistent `HANDOFF_INTENT` and `A_EMPTY_B_ONE` after clean LAB BDS restart, recovery stayed HOLD/no repeat/auto-settle; then `CLEAN PASS` verified two empty test chests and cleared only PG15 diagnostic marker. Evidence **HL-E-041**. PG15 owner testing closed; no repeated operator action needed.
- **Next boundary:** controlled fault-recovery design against actual abrupt interruption and strict external inventory ownership; cannot infer true crash-atomic durable item custody, unique provenance, Q5 native metadata fidelity, or Bulk/Transporter release from normal-restart tests. Keep production and original 1.4.1 protected.

