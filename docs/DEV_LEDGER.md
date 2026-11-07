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

## 2026-11-07 — Bundle 0 executed: PG-01 and PG-02 (offline scope)

- **PG-01 GO:** imported the exact original 1.4.1 BP/RP source (16 BP + 56 RP files) to `addon/` on the existing planning branch, commit `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`. Verified all **75/75 Git blob SHA-1** values against local original source bytes (72 source + 3 import helpers); SHA-256 original archive `439678c0d68849a43341c126ba6aaaa111317254e137123fde3ac531cec5d1dd`. No source content rewritten.
- **PG-02 offline GO:** developed `scripts/hartlogistics_lab_updater.py` and permanent `tests/test_hartlogistics_lab_updater.py`; **nine** offline synthetic checks passed, including exact LAB path guard, UUID/hash gate, JSONC preservation, no-write plan, staged SHA install/backup and rollback for injected pack/registry failure. Tooling commit `2fe2871e14340ae3a434e46ef1d03112b94b2735`. CI now executes permanent safety tests.
- Production updater archive/scripts were never executed (even in dry-run). No Minecraft server was accessed. No world setting/experiment changed, no gameplay features implemented and no release authorized. Bundle 1 and any actual LAB operation require separate approval.
- Simulated temporary directories were removed after tests; no temporary runtime flags, probes or experimental wiring remain. See [Bundle 0 results](BUNDLE0_RESULTS.md).

## 2026-11-07 — Owner clarification: 2–3 checks only for hands-on BDS work

- Owner specifically limited **their own hands-on BDS testing** to 2–3 related checks per reusable, fully specified rig/session, not all tests or development work.
- **Autonomous offline/synthetic/CI and separately authorized automated LAB verification have no 2–3-count limit.** If 100 checks can run without owner intervention, complete all useful checks without artificial stop points. Actual failures/safety/authorization boundaries still stop dependent actions.
- Updated preliminary gates, test-rig contract, compatibility plan, roadmap, and contributor instructions. Immediate cleanup of temporary instrumentation remains mandatory at the end of its real dependency, irrespective of test count.
- Documentation only; no tests, runtime changes or server operations were triggered by this clarification.

## 2026-11-07 — Begin Bundle 1 test-only preparation

- After owner instruction to continue, prepared an isolated temporary custom-container BDS test BP and offline contract tests under `tests/` without changing any original 1.4.1 addon file.
- Probe checks native 9-slot custom-block inventory, `Container.moveItem`/`transferItem` and exact one-class MR name+lore metadata, full destination backpressure, restart persistence and script menu coexistence.
- `TEMP_TEST:PG03-05` registered as active in project blueprint; must delete temporary probe/wiring/registry after task. Actual BDS test not run, no server accessed or settings changed.

## 2026-11-07 — Bundle 1 supplemental offline simulations and disposable pack artifact

- Added a test-only Node VM simulation for native Container handoffs, blocked-target return/throw variants, exact metadata checks, menu callback and restart marker behavior; these are **mock-only**, NOT BDS acceptance.
- Added deterministic temporary `.mcpack` packager and CI artifact (7-day expiry) so the single test BP can be installed in a future authorized disposable LAB world without changing `addon/`.
- Important hygiene: the static Python probe checks, Node simulator, packager, CI steps and disposable test pack are **all temporary** and must be deleted with the `temporary_instrumentation` entry on task closure; retaining CI tests that depend on deleted probe assets would be a test-spec defect.

## 2026-11-07 — Bundle 1 offline simulations PASS; runtime gates remain pending

- CI run **42344178135 completed success**. Relevant new prep tests: 12 Python static probe-contract checks, JS syntax check, **11 Node mock-only scenarios** of native transfer, leftover/throw cases, no unintended source mutations, metadata corruption detection and boot-gated restart check. Old tests continue passing. No Bedrock runtime invocation occurred.
- `tests/bundle1_probe/build_probe.py` packaged a deterministic 3,547-byte `.mcpack` and uploaded temporary artifact ID **13563080206**, expires 2026-11-14 UTC. The probe is an isolated test-only pack, not a release. Only the LAB environment may ever run it.
- **PG-03, PG-04, PG-05 = NOT RUN in BDS**. Actual custom inventory feature flags, ItemStack custody and UI collision require real 26.63 integration. The owner won't be asked for a rig before the LAB world/anchor can be made READY. No server accessed.

## 2026-11-07 — Correct Bundle 1 distribution workflow

- Owner requested original Git-sourced delivery via PowerShell rather than a separate downloadable .mcpack. The previous archive was redundant.
- Removed the temporary .mcpack packager and GitHub Actions upload/build steps; the original temporary BP source remains Git-tracked under tests/bundle1_probe/behavior_pack.
- Bundle 0's installer was Python, not PowerShell, and does not install this isolated test BP. PowerShell source installer remains to be built and Windows synthetic-tested; do not report LAB readiness until then. No servers were accessed.

## 2026-11-07 — Delivered PowerShell Git-to-LAB updater for Bundle 1

- Implemented `tests/bundle1_probe/Update-HartLogistics-Bundle1Lab.ps1` with **source-only Plan**, clean Git-only **Sync**, read-only exact-LAB **CheckLab**, staged/hash-verified **Install**, owned-lease/hash-preserving **Cleanup**. Hardcoded LAB root, pinned Git source, specific test pack UUID, no experiment/cheat changes, no original addon changes.
- Created Windows native `Test-PowerShellUpdater.ps1` temporary synthetic suite, executed **46 assertions in Windows PowerShell 5.1 and 46 in PowerShell 7** (CI run 42377591621), plus Linux structural checks. It tests JSONC preservation, ownership, exact registry restoration and fail closed on unrelated changes. Future commits may rerun additional tests.
- Added operator guide for Git clone/fast-forward, Plan/CheckLab, explicit Install/cleanup. **Actual LAB BDS, PG03/04/05 tests remain NOT RUN**. Installer/CI probes tracked as temporary; delete on task acceptance.
