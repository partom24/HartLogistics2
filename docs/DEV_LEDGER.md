# Hart Logistics 2 — Development Ledger

Dated engineering record for **HartLogistics2 only**. The inherited blueprint template's development ledger was example history for a different product, and is not Hart Logistics achievement or acceptance evidence.

## 2026-11-06 — Planning adoption (documentation only)

- Owner supplied Hart Logistics 1.4.1 source archive and HartBots 1.8.2 reference package in the project conversation.
- Owner established a non-negotiable compatibility requirement: **no loss of any current 1.4.1 capability**.
- Requirements captured for Bulk Storage (200,000 each; overflow; controllers across connected banks), Transporter (six-way 4×4 pipe; container ingress only), and Receiver Q4→Q5 with native metadata-rich lane and safe migration.
- Owner reports **Bedrock server 1.26.63.1 and client v26.63**; treated as the reported future test target, not a runtime PASS.
- Official 1.26.50 creator notes place custom block-entity containers in the experimental section; confirm behavior on reported 1.26.63.1 target and owner experiment policy before implementation.
- Owner authorized updating planning and project records in HartLogistics2; explicitly **not** gameplay implementation or modifying HartBots.
- Reset template-only project facts; retained reusable engineering policy and validator.
- **Not performed:** import of gameplay source into Git; Q5 conversion; block creation; Bedrock runtime testing; release approval.
- Review [roadmap](ROADMAP.md), [design](LOGISTICS_DESIGN.md), [migration](Q5_MIGRATION_DESIGN.md), [compatibility tests](COMPATIBILITY_TEST_PLAN.md), and [inbox](IDEA_INBOX.md) before starting any implementation milestone.


## 2026-11-06 — MR transport mechanism decision

- Owner explicitly chose to **replace the Q4 direct-only metadata-rich Hopper fallback** with native custom-container storage on both Collectors and Receivers; preserving a temporary compatibility route is permitted until the native path is validated, but retaining the bypass indefinitely is **not** required.
- Documented future MR intake/custody/output mapping, unload and restart protection, existing placed-block compatibility, and server 1.26.63.1/client v26.63 feature gate. **Planning only; no gameplay source changed.**

## 2026-11-06 — Updater boundaries and import permission

- Reviewed uploaded HartBots `scripts.zip` **statically only**. Reusable patterns include manual lab `-Apply`, pinned Git source, registration preservation, backup/staging, hash verification and rollback; original scripts are hardcoded to HartBots.
- Owner states sole server release-testing target is disposable lab `C:\Servers\Thomas_MCBedrock - Copy (2)`, which may be reset from latest production-derived ZIP; production `C:\Servers\Thomas_MCBedrock` is off-limits before release candidate nomination.
- Owner **explicitly permits importing the production updater script into HartLogistics2** but **forbids its execution until a candidate is nominated**. Nomination is not an automatic deployment approval. No script was run, and no server was modified.
- Added [deployment design](UPDATER_DEPLOYMENT_DESIGN.md). Further source import and updater implementation are not authorized by this planning record alone.

## 2026-11-06 — Owner testing coverage decision

- Owner rejects routine item-name-specific test matrices for equivalent ordinary items: moving cobblestone, glass or sand uses the same ordinary transfer contract absent a relevant mechanical difference.
- Recorded behavioral equivalence testing, multiple IDs only when identity isolation matters, and distinct MR metadata/stack/special-mechanics cases when they affect correctness. No code or server tests were run.

## 2026-11-06 — Full test rig instructions and prior-proof reuse

- Owner requires **all necessary physical rig parameters up front**, including exact one-/two-Sorter column counts, placement, orientations, and verified separation/clearance from other rigs. Unknown restrictions must be resolved before a manual setup is requested; surprise restrictions are a test-design failure.
- Owner further requires a simple **What is being tested** summary at the start of each proposed test, plus reuse of safe testing from previous attempts to avoid unneeded rebuilds and reruns.
- Added [test rig and evidence reuse policy](TEST_RIG_CONTRACT.md), with READY/NOT READY gate, full block-by-block template, and prior-evidence selection. No gameplay source or server was changed.

## 2026-11-06 — Unique visuals for new blocks

- Owner requires no reuse of existing block resource assets; the new Bulk Storage (called “bulk sorter” in the request) must never look like Collector or Receiver.
- Added a no-reuse contract for independent Bulk Storage/Transporter models, textures, geometry and icons, plus side-by-side visual acceptance. Exact art direction is open; documentation only, no resource files or code changed.

## 2026-11-06 — Menu-controlled linking

- Owner wants the existing Collector/Receiver link-selection process moved into a **button in a menu**. Chosen design: Collector Link / Relink Receiver action, target Receiver confirmation, no automatic selection on placement, saved link persistence and sneak-placement preserved.
- Inspected original 1.4.1 `selectCollector`, `useReceiver`, placement/interaction code and manifest; no `@minecraft/server-ui` dependency exists yet. Stable module selection and native MR inventory/form interaction are a future LAB test gate.
- Documentation only; no gameplay code, world, server or release files changed.

## 2026-11-06 — Narrow native custom-container API verification gate

- Reviewed Microsoft 1.26.50 custom block container notes and stable `BlockInventoryComponent` / `Container` API reference. The intended custom inventory endpoint is a standard `Container` offering native `moveItem` / `transferItem` methods; 1.26.50 lists creation/access as experimental.
- Defined minimum **26.63 LAB-only** proof of availability under approved world flags, native ordinary→custom→ordinary and custom→custom moves, exact representative MR metadata, blocked transfers and saved persistence. Reuse prior vanilla Container→Container evidence; no blanket item-category re-tests.
- This is **API/source research and test planning only**, not an in-game validation or authorization to enable experiments/change gameplay code.

## 2026-11-06 — Preliminary go/no-go batch plan

- Owner requests preliminary go/no-go test list bundled **2–3 related tests together** to reduce developer/owner setup and test time.
- Planned PG-01–PG-11: offline baseline/updater safety (2), native 26.63 custom MR inventory (3), existing-world Q4→Q5/menu conversion (3), and minimal Transporter/Bulk/controller viability (3). Each has GO and NO-GO criteria, prior-proof reuse and minimum setup.
- All gates NOT RUN and no rig READY. Documentation only; no original add-on, lab or production server changes.

## 2026-11-06 — Conditional acceptance of preliminary gates

- Owner agreed to PG-01–PG-11 preliminary go/no-go plan **provided the inherited template temporary-instrumentation policy is followed**, with testing parameters removed as soon as their purpose ends.
- Required cleanup at each test/task boundary: tagged/registered temporary runtime probes, temporary config flags, diagnostic hooks/assets and wiring deleted when no longer needed; delete registry entries before task acceptance. Shared probe may remain only through explicitly dependent active gates. Permanent out-of-runtime regression tests can remain.
- Release candidate must separately pass `python scripts/validate_blueprint.py --release-gate` and manual scan; no leftover temporary code in runtime pack. **No gate executed and no source/server files changed by this decision.**

## 2026-11-07 — Owner acceptance of six architectural defaults and global migration freeze

- Owner accepted interchangeable Hopper/Transporter Sorter intake; physical Transporter-over-Sorter topology with adjacent ordinary containers treated as deliberate **sources** (storage chests only downstream, not at or above pipe level); durable network IDs and deterministic controller ownership; conservative Bulk unknown-capacity hold; separate MR physical slots with backpressure; and staged Q4→Q5 recovery.
- Migration specifically requires a **server-wide Hart Logistics routing freeze** and automatic legacy Sorter/Collector migration when unloaded chunks become loaded. Unloaded blocks cannot be migrated directly; proposed durable pending/on-load state and block menu notifications, plus safe global resume after verification. Vanilla Hopper ticks are not assumed stopped by add-on freeze.
- Updated PG-07–PG-11 and architecture/Q5 documents; no game code or server paths changed, and no tests executed.

## 2026-11-07 — Owner asks about ticking-area-assisted unloaded-block migration

- Confirmed from official Bedrock documentation: named ticking areas keep chunks active, world maximum 10 areas, up to 100 chunks/area, radius ≤4; command requires cheats/appropriate authority. Script command access on the owner's dedicated 1.26.63.1 runtime remains **untested**.
- Re-read original 1.4.1 locally uploaded `main.js`: Sorter registry and Collector/Receiver logistics entries persist dimension/XYZ coordinates, permitting a candidate targeted chunk worklist (subject to completeness verification).
- Documented **optional**, one-area-at-a-time, named/owned/leased migration accelerator under the existing global routing freeze, with vanilla Hopper safety, crash/restart lease reconciliation, **immediate removal of only Hart-owned areas**, and on-load fallback when unavailable.
- Incorporated the optional test in **PG-07**, no new bundle. No ticking area was created; no server or gameplay source was changed.

## 2026-11-07 — Corrected pack metadata and stable ticking-area API guidance

- Microsoft manifest docs define `metadata.product_type=addon` as pack classification, **not** a cheat-setting bypass. Achievement eligibility is a separate concern.
- Bedrock **1.26.10** released `TickingAreaManager` into **stable `@minecraft/server` 2.6.0**. Original 1.4.1 uses 2.7.0. Pack-scoped `world.tickingAreaManager` has its own ticking-chunk capacity and cannot manage other packs'/commands' areas, unlike cheat-restricted manual `/tickingarea`.
- Corrected Q5 migration and PG-07 to prioritize this stable manager without enabling cheats or experiments, and retain the ordinary-on-load fallback if 26.63 LAB proof fails. Immediate removal/lease recovery and vanilla Hopper safety remain mandatory. No code or server files changed.

## 2026-11-18 — Owner approves URCE 1.5 product end state and final fallback/retrieval rules

- Consolidated owner-confirmed directed loop-free automatic path networks (Hopper, Transporter, Collector–Receiver), source-specific reachability, valid branching/merging and rejection of cycle-making managed links; local bottom-to-top order plus low real transaction-cost choices across eligible columns.
- Owner accepted optional terminal Collector as a legitimate unclaimed home, valid networks **without** a terminal Collector, and the rule **no verified home → do not transport**. For genuinely unclaimed ordinary items: Wildcard first, terminal Collector second, verified Bulk fallback third, otherwise HOLD at authoritative custody; no forced Receiver return. Keep claimed/previous Bulk-home conditional routing and unknown-capacity HOLD.
- Owner favors shared network-reachable Bulk when safe/efficient; automatic **demand-aware** redistribution only when Receiver cargo cannot use all valid destination capacity or no productive primary flow exists; avoid gratuitous virtual-to-physical movement. Prioritize exact native MR and Wildcard over any unproved MR Bulk storage, without serialization.
- Approved /status-equivalent menus with true power/queue/custody metrics; **HOLD/HELD/STORED**, item identity, detailed MR metadata, reasons and location; common searchable/paginated read-only-by-default storage browsers that do not scan a 250,000-item Receiver on menu open; explicit safe retrieval of selected HELD/terminal items. BDS playability under load is the acceptance objective.
- Three final owner-approved dispositions: Wildcard→terminal→verified Bulk→HOLD for unclaimed ordinary cargo; opportunistic redistribution of unclaimed Bulk overflow when a proper home reopens; deliberate, identity-safe player retrieval. The [product contract](../planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md) now supersedes contradictory historical *product* defaults without erasing evidence.
- **Planning/docs only**. No source, gameplay, native test, LAB or production action; no runtime/compatibility/acceptance/release claim. Existing HL-URCE-PLAN-001 remains active.

## 2026-11-18 — P4 optimization handoff, measured BDS capture and pre-code URCE gates

- Owner states P4 was optimized until further gains overlapped URCE's responsibility; adopts this as the **planning handoff boundary**, not accepted runtime proof. Wants exceptional heavy routing bursts drained promptly with high useful transaction density while maintaining responsive block placement, eating and playability, plus separate sustained-throughput assessment.
- Owner clarifies **vanilla Hoppers are not to be sped up by Hart**, and the **Transporter** is intended as the high-throughput alternative. Record separate quantities for items moved, successful transfers, native/journal work, peak tick cost and backlog clearance. 16, 32 and 64-item transfer quantities are source/LAB **candidate experiments**, not selected gameplay limits.
- Reopened exact 1.4.2 `main.js`: 16-item per-column, Collector and Receiver budgets; 256-item stage globals, once-per-tick `schedulerTick/logisticsTick`, physical `safeMovePartial` debit/credit/journal, Q4 journal/page/meta writes. An expanded lexical audit found 175 named top-level functions and ~60 mutation/property expression lines, including player `addItem`, display commands, frames and item-entity flows; a verified *transitive* U0 census remains open.
- From the owner-uploaded 14,687,102-byte Nov 17 capture, P4e ~19.727s / 193 ready scheduler callbacks / 9,425 Sorter admissions / 487,223 native destination `getSlot` reads / 21 completed Sorter transfers. Separate Q4 diagnostic window 330 ticks / 47 received / 38 delivered. Neither provides actual Sorter moved-item quantities or proof that 16 was limiting. [Evidence and limitations](../planning/URCE_150_TRANSPORTER_BATCHING_BDS_CAPTURE_EVIDENCE_20261118.md).
- Current Microsoft stable `Container.moveItem/transferItem` signatures lack an explicit item-count parameter and no documented durable commit receipt; 1.26.50 creator notes classify custom block-entity inventory as experimental. Exact pinned 2.7.0 nonexperimental native MR storage/Transporter custody remains an engineering BDS gate.
- Consolidated [pre-code gating matrix](../planning/URCE_150_PRECODE_READINESS_AND_PROOF_GATES_20261118.md). Owner product choices resolved, **U0 writer closure, U1 graph/differential, U2 custody, U3 native, measured owner-LAB comparison and separate authorization remain OPEN**. Docs only; no 1.5 code, pack, LAB, world, production or release change.

## 2026-11-18 — Owner corrects Transporter purpose to visible storage network infrastructure

- **Authoritative owner clarification:** Transporters principally build a visible, human-relatable **storage network topology**; items can be routed and delivered without physically traversing any intermediate Transporter block. The Transporter is **not primarily a mandatory high-throughput per-block conveyor**. Supersedes the earlier summary of Transporter as the fast physical mover.
- Separate **logical Transporter connection graph** from actual **item custody endpoints/writes**. A validated graph can authorize route selection, never prove native capacity, a safe cross-chunk endpoint or durability; actual Hopper/Collector–Receiver handoffs still occur where necessary. No per-pipe queue/journal/transfer required merely for a visible connection; no invented native remote transfer.
- New [URCE-ADR-003](../planning/URCE_150_OWNER_TRANSPORTER_INFRASTRUCTURE_DECISION_20261118.md) updates the product contract, BDS batching evidence, pre-code gates and roadmap. Remaining U0/U1/U2/U3 proofs and gameplay/LAB permissions remain open. **Docs only; no runtime changes.**

## 2026-11-18 — Owner rejects re-opening proved native MR viability; cross-branch ledger audit

- Audited the `docs/ENGINEERING_EVIDENCE_REGISTER.md` revision on **all 79 repository branch refs**, main chronology, curated [NMR-01–10](../recovery/NATIVE_MR_HISTORICAL_EVIDENCE_141.md), PR #79, and original PG42 session card. Branches contain historical snapshots, not independent new BDS tests.
- The native MR **movement primitive is demonstrated** (HL-E-052 / PG20 Protection I enchanted book via Hopper→Collector→Receiver output, normal-restart retention; HL-E-063 / PG23 native Hopper move). The persistent native entity **storage primitive is demonstrated** (PG42 nine-slot carrier with name/lore-bearing paper, same entity ID/occupied slot on owner-reported clean-restart BDS 1.26.63.1 readback). The unsuccessful PG-03 *custom block* probe is not a blocker for PG42's nonexperimental native *entity* approach.
- Reclassified G4a MR primitive feasibility as **CLOSED / reusable evidence**, not a reason to postpone URCE code generation or demand more owner primitive tests. G4b *URCE product integration/custody* remains an engineering/development/acceptance task: one authoritative carrier per real owner, lifecycle/unload, exact MR admission/retrieval, interrupted physical+journal states and old Q4 compatibility. No claim of full product/abrupt-crash acceptance.
- Linked [cross-branch audit](../planning/URCE_150_CROSS_BRANCH_NATIVE_MR_EVIDENCE_REUSE_AUDIT_20261118.md) and corrected active product contract, readiness matrix, performance memo, roadmap and handoff. **Docs only**, no archived code import, LAB/world/production change, implementation or release grant.

## 2026-11-18 — Owner clarifies player-first, open-layout and open-item acceptance

- **Owner-approved test philosophy:** product must be exercised as a player would use it. No exact absolute XYZ, mandatory rig diagram, prescribed developer layout, fixed bank count or preselected item identity as acceptance prerequisites. **Any valid topology and any legitimate item** are acceptable input to a functional test. Actual product constraints (direction, connections, redstone, admission, native chest semantics) still apply.
- Do not hardcode acceptance allowlists by item ID into gameplay, rig scripts or test acceptance. The accepted exception is **ordinary vs metadata-rich/nonrepresentable** item routing: test the structurally different paths and exact native metadata preservation. Item-specific examples remain optional regression fixtures; unusual owner-chosen items are valuable edge-case discovery.
- Historical [Test Rig Contract](TEST_RIG_CONTRACT.md) was revised so fixed XYZ and block-by-block maps are **optional repro examples**, not mandatory owner-LAB prerequisites; source-only deterministic rigs remain valid test instruments, not the production acceptance definition. Accepted prior tests are not invalidated. Use natural, player-oriented integrated checks with readable outcomes and record exact details *after* a defect when useful.
- See [URCE-ADR-004](../planning/URCE_150_OWNER_PLAYER_FIRST_TESTING_DECISION_20261118.md). Documentation-only update; no gameplay code, server, world, LAB run or release action.

## 2026-11-18 — Owner authorizes U1 source-only code generation

- Owner explicitly approved the earlier proposed **U1 source-only routing-model/test development increment** (“ok, lets get to it then”). Permission is limited to read-only source and CI tests, **not gameplay pack / BDS runtime, protected LAB/production world writes, new native custody writers or release**.
- Added [pure U1 graph/policy planner](../planning/src/urce_u1_route_model.mjs), [Node tests](../planning/tests/urce_u1_route_model.test.mjs), CI step on the existing planning branch and [implementation scope/evidence record](../planning/URCE_150_U1_SOURCE_IMPLEMENTATION_20261118.md). It models source-reachable directed paths, optional graph-only Transporter segments, cycle rejection, Filter→Auto policy candidates, bottom-to-top within a column, explicit estimated-cost ordering between columns and strict unverified HOLD. Native admission and Q4/physical transactions remain entirely outside the module.
- Testing uses arbitrary fixture IDs/topologies; no hardcoded gameplay item allowlists, absolute XYZ constraints, forced terminal/Bulk or per-Transporter inventory. Await CI before claiming the entire suite PASS.

## 2026-11-18 — U1 actual 1.4.2 routing/admission source boundary

- Added isolated [U1 baseline adapter](../planning/src/urce_u1_142_adapter.mjs) and [source-executed differential boundary tests](../planning/tests/urce_u1_source_gate_differential_142.test.mjs). The adapter receives caller-proved directed topology and cheap registry observations, then eliminates *unreachable* remote columns from a new-network candidate set before any future native chest check. It does not change P4e per-column behavior or movement.
- Tests run the exact SHA-pinned 1.4.2 `matchesFilter` and `findAcceptSlot` implementations with native-shaped nonwriting mock slots; measure native reads rather than claiming measured BDS TPS. Unknown live Auto seed remains HOLD. Arbitrary non-MR identities used; the owner testing policy does not permit hardcoded gameplay item lists.
- Existing P4e lazy local routing NO-GO is preserved; no claim its local/native admission count is reduced by this adapter. New-network cross-bank skip is distinct from a local Sorter optimization. No gameplay, new writer, owner LAB or world changes.

## 2026-11-18 — Owner authorizes uninterrupted URCE development through playable candidate

- Owner instruction: continue developing with no routine incremental approvals until a genuine unresolved safety/design issue, essential clarification or player-testable runtime candidate. Scope now permits **code generation toward a new URCE runtime**; it does NOT permit owner LAB installation, owner-world upgrade/migration, production deploy or release. Protect original 1.4.1 and 1.4.2 source/registry evidence.
- U1 1.4.2 source-executed routing gate [GitHub Actions 44425978366](https://github.com/partom24/HartLogistics2/actions/runs/44425978366) **PASS** on exact `414521dc955896ecde72ccf01ef966ba035d83ef`, including previous original-compatibility suite and new seven-source tests.
- Expanding U0 regression guard: [exact 1.4.2 callback/native writer census test](../planning/tests/urce_u0_writer_census_142.test.mjs) inventories 175 functions, seven scheduler roots, direct native mutable calls and anonymous block break commands. Conservative static overapproximation; source-only PASS is not Bedrock/external-writer exclusivity proof.

## 2026-11-18 — U2 source-only custody state model; correct active milestone

- Added [U2 fault-closed custody protocol model](../planning/src/urce_u2_custody_protocol.mjs) and [11 tests](../planning/tests/urce_u2_custody_protocol.test.mjs) plus [evidence boundary](../planning/URCE_150_U2_CUSTODY_SOURCE_PROOF_20261118.md). Models live intent versus durable writer authority, rejects unknown/foreign/unloaded or pending journal cases, refuses ordinary-account MR serialization, and never grants automatic replay/commit on uncertain native witnesses. Source-only safety model is not actual native transaction durability or a playable product.
- Corrected `project-blueprint.json` active milestone to `HL-URCE-DEV-001` to match the current `docs/ROADMAP.md`. The preceding exact-head CI U0 commit source and native API tests passed, but its LAB-updater structural jobs refused because the previous planning milestone ID remained declared; this is bookkeeping, not a BDS or custody runtime failure.

## 2026-11-18 — Canonical static evidence and PowerShell source recovery

- Owner required that original historical proofs and the Git-backed one-file PowerShell LAB release/testing procedure stop disappearing across branches. Added [permanent project entrypoint](../PROJECT_CONTINUITY.md), [canonical original evidence and tool source catalog](CANONICAL_EVIDENCE_AND_TOOLING.md), and [machine-readable pinned source manifest](PROJECT_STATIC_RESOURCES.json), mirroring the authoritative `main` catalog without rewriting branch-specific acceptance.
- [Offline preservation gate](../scripts/check_project_continuity.py) and [regressions](../tests/test_project_continuity.py) reject loss of HL-E original ledger, PG42, owner player-first contract, and PG27/UCE/Freeform PowerShell references. Added [CI](../.github/workflows/project-continuity.yml). Historic candidate-specific PowerShell tools are references; current URCE runtime still needs its own verified installer/rollback.
- No gameplay source, pack, BDS LAB, world, historical evidence or production deployment changed.
