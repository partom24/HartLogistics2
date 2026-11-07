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

## 2026-11-07 — Downloadable, Git-backed one-file PowerShell LAB launcher

- Prepared verified standalone `Start-HartLogistics-Bundle1Lab.ps1` (SHA-256 `7590f4901bf526f14602641b06ca95e5540a5783492998e561ab0bd94c9684ed`), byte-for-byte matching Git blob `abe4dec65eeabcff911ca7833ad126716a02fcb2` in `tests/bundle1_probe/`.
- Launcher clones/fast-forwards only authorized Git source to a local user workspace, prints source plan by default, checks LAB read-only when selected, and installs/cleans the temporary pack only on explicit `-Apply` via the guarded core updater. `Cleanup` also needs explicit inventory-cleared confirmation.
- Source parser and refusal-without-Apply checked on Windows; both 48-assertion synthetic PowerShell 5.1/7 suites and blueprint CI passed in run 42377972891. No server accessed; BDS PG03-05 **NOT RUN**.
- Launcher and its `TEMP_TEST:PG03-05-LAUNCH` registry entry are temporary; delete as soon as test work completes, along with temporary probe/CI wiring.

## 2026-11-07 — Owner ran real Windows LAB updater normal cycle

- Owner reported one successful full launcher cycle at `cc7ffed1621c927ac52cd5de1bc28f88298ebcc4`: Plan (source only), CheckLab (read only, `worlds\ThomasServer` in exact LAB-copy path), Install -Apply (owned source BP + lease), Cleanup -Apply -ConfirmProbeCleared (restored world registry, removed owned probe).
- **GO at updater normal-install/cleanup observation scope**, not a claim that files were independently inspected afterward, nor that BDS runtime tested native containers. PG-03–PG-05 remain **NOT RUN**. Temporary LAB installation has been removed; Git temporary probe/instrumentation stays ACTIVE only for pending in-world checks. Need verify disposable world before any physical rig instructions.

## 2026-11-07 — Correct redundant LAB-world clarification

- Owner reminded us that LAB \`C:\Servers\Thomas_MCBedrock - Copy (2)\` is **a clone of the previous production world**, already disclosed and documented. User should **not** be asked whether \`ThomasServer\` is a disposable world again.
- Corrected PG-03–PG-05 rig/PowerShell handoff: use an isolated four-block region in the **existing copied world**, do not create a new disposable world, and **never reset/delete the clone for routine cleanup**. Verify inventories are empty, remove owned blocks only, then uninstall the temporary pack safely while BDS is stopped. If any MR item remains, preserve and investigate.
- No gameplay code, pack registration, world or server changed by this documentation correction. Runtime gates remain NOT RUN.


## PG-03 target-runtime NO-GO, 2026-11-07

The owner installed the standalone test behavior pack into the approved cloned LAB world and supplied screenshots: Creative search did not show the probe; Minecraft rejected the exact /give @s hlprobe:mr_container 2 command with an unexpected-identifier syntax error. Therefore the block was not registered/available to the player. No probe block was placed; PG-04 transfer and PG-05 restart tests could not be conducted. The screenshots alone cannot prove the exact parser error or exclude other pack-loading issues.

**Official platform version gate:** Minecraft Bedrock 1.26.50 creator notes place the *container field* of minecraft:block_entity in Experimental Technical Updates, even though the base minecraft:block_entity component itself is stable. The Minecraft Beta/Preview 26.70.23 release notes dated November 3, 2026 only then announce that the container field was released from experimental and custom BlockInventoryComponent became non-experimental. The 26.70.23 change is in Preview, **not evidence of stable availability in the owner's current BDS 1.26.63.1.**

Sources:
- https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.50?view=minecraft-bedrock-stable
- https://feedback.minecraft.net/hc/en-us/articles/50103892132365-Minecraft-Beta-Preview-26-70-23

**Decision:** PG-03 = NO-GO for the current 1.26.63.1/26.63 **no-experiments** configuration. PG-04 and PG-05 = BLOCKED / NOT EXECUTED, not failed MR transfers. Do not require the owner to keep trying identifiers, enable cheats or Upcoming Creator Features, build the four-block rig, upgrade server/client version without separate approval, or implement custom native MR slots on this target. Preserve original Hart Logistics 1.4.1 native ItemStack/direct MR fallback and Q4 custody. Investigate a separately approved supported lossless approach or an owner-approved future stable runtime version; experimental behavior cannot be silently introduced.

**Cleanup dependency:** The owner's last transcript reported a fresh -Mode Install -Apply, and there was no subsequent successful Cleanup. Assume the disposable test BP and deployment lease are STILL installed. Because no probe block was obtained in the observed session, it can be unregistered after stopping LAB and confirming no probe item/block was created elsewhere. Use the existing verified one-file PowerShell launcher: -Mode Cleanup -Apply -ConfirmProbeCleared. Preserve source and temporary instrumentation in Git **until the owner confirms LAB cleanup**, since removing the Git installer prematurely would prevent safe source-backed cleanup. Upon confirmation, promptly delete the temporary probe source, launchers, mocks, tests, CI steps, and blueprint temporary_instrumentation registrations, retaining this failure evidence. Never touch the protected production server or discard the cloned LAB world.

## 2026-11-07 — Final owner-confirmed LAB cleanup, Git probe deletion, MR design evaluation

- Owner ran the downloaded launcher from PowerShell at Git SHA `e5a1ff6809758a45f330f2398691e8f76b4698b6` with `-Mode Cleanup -Apply -ConfirmProbeCleared`, reporting `CLEANED: original world registration restored; only owned temporary probe removed.` The LAB world remains the owner's production-derived clone. No production target touched.
- **PG-03 NO-GO** due to unregistered custom item under current no-experiment 1.26.63.1; PG-04/05 BLOCKED. In the Git development branch removed all `tests/bundle1_probe/` files, `tests/test_bundle1_probe.py`, the retired launcher/operator guide, all temporary CI steps and three blueprint temp registrations. Structural CI passed following deletion; source `addon/` and the permanent Bundle 0 Python updater are unchanged.
- Compared three non-lossy candidates and a future stable-version gate in [MR alternatives memo](MR_CUSTODY_ALTERNATIVES_12663.md). No new runtime candidate approved. Original MR direct-only fallback preserved until an owner-approved, proven storage path exists.

## 2026-11-07 — Post-Bundle 1 independent offline invariants

- Added permanently useful offline-only tests for original 1.4.1 metadata-rich ItemStack direct bypass, and conservative conceptual ordinary Bulk/filter/wildcard choices. Exhaustively checked 256 direct-gate combinations and 125 three-bank capacity-state combinations, mocked pre/post-move restart, without accessing BDS or modifying addon.
- Model explicitly ASSUMES atomic native transfer. It is **not** proof of Bedrock persistence, crash atomicity, custom native inventories, or future network implementation. No test-only runtime code was added; temporary instrumentation remains empty.

## 2026-11-07 — Follow-on offline Transporter graph and MR-safe milestone

- User requested move forward after PG-03 closeout. Proposed an **ordinary-network-first** development order so MR direct-only 1.4.1 path stays safe until a native custodian is proven. Added offline-only deterministic 6-neighbor pipe topology tests, loop and split/merge scenarios (720 node insertion orders), plus [safe execution note](NEXT_SAFE_EXECUTION_SLICE_12663.md).
- No live Transporter/Bulk code was implemented, no original `addon/` files changed, and no server accessed. Controller election and unloaded topology remain future gates, not accepted algorithms.

## 2026-11-07 — Owner authorized Bundle 2; non-runtime safety tests first

- Began Bundle 2 PG-06–PG-08 using no-world-write offline checks: legacy placed-block identity/link/queue compatibility, modeled durable maintenance/Q4→Q5 authority under interruption, and modeled Collector/Receiver menu link/relink/unlink confirmation and multi-player safety.
- PG-03 native MR endpoint remains NO-GO, so no staged native ItemStack custody, Q5 cutover, block conversion, server deployment or real menu UI implementation was performed. **PG-06/07/08 actual BDS = NOT RUN**.
- These are permanent conceptual and source-preservation tests, not temporary gameplay instrumentation. No change to test rig/world/cheats/protected production.

## 2026-11-07 — Bundle 2 offline preparation PASS (not BDS gates)

- New pure Python `tests/test_bundle2_offline_safety.py`: **25/25 methods PASS** (5 legacy source contracts, 8 shadow migration and crash gate model, 12 menu/workflow policy checks). [Successful CI 42384039945](https://github.com/partom24/HartLogistics2/actions/runs/42384039945), 90 methods total including earlier suites.
- [Report](BUNDLE2_PREPARATION_RESULTS.md) explicitly separates tested abstractions from untested Bedrock behavior; main 1.4.1 BP/RP unchanged, no server touched, no temp instrument created. PG-06/PG-07/PG-08 real BDS remain NOT RUN and native MR aspects blocked by PG-03 NO-GO. Future PG-08 gameplay prototype requires controlled new candidate and installer, not shortcutting Q5 or saved-link safety.

## 2026-11-07 — Read-only owner handoff for Bundle 2

Prepared fixed-path, non-mutating PowerShell preflight `scripts/diagnostics/Read-HartLogistics-Bundle2Lab.ps1`. It reads only the approved cloned LAB server properties, original BP/RP registrations and manifests, and retired PG03 probe leftovers. It does not read world LevelDB, access PROD, or edit any files. CI uses disposable synthetic runner fixture and confirms hashes unchanged after run. No future LAB GUI, Q5 cutover or gameplay upgrade is implied.

## 2026-11-07 — Owner read-only LAB pack-preflight evidence (version and registration mismatch)

Owner executed `scripts/diagnostics/Read-HartLogistics-Bundle2Lab.ps1` from their Windows LAB copy. Reported:
- LAB: `C:\Servers\Thomas_MCBedrock - Copy (2)`; selected world: `ThomasServer`.
- LAB `bedrock_server.exe` file version **1.26.63.1**, not independently observed running process.
- Top-level installed pack directories `HartMods_HartLogistics_BP` and `HartMods_HartLogistics_RP` have manifests matching the 1.4.1 original **header UUIDs**, but the manifests declare **version 1.5.0**.
- The tested world registry `world_behavior_packs.json` and `world_resource_packs.json` contain **no entries matching the known Hart UUIDs**. Diagnostic output reads `Hart BP registry: not registered` and `Hart RP registry: not registered`, not missing file.
- Disposable Bundle 1 PG-03 pack UUID unregistered, test pack folder absent, owned lease absent.
- The diagnostic is **read-only** and did not inspect alternate per-world pack folders, `level.dat`, LevelDB, saved Collector/Receiver links, q4 queue data, BDS running logs, or the origin/source of the installed 1.5.0 files. Do not claim 1.5.0 is actively loaded; do not claim which add-on code actually runs. This is a **registration/version provenance discrepancy**, not PG-06/07/08 pass/fail.

**HOLD** every attempted existing-world upgrade, 1.4.1 → 1.5.0/2.0 replacement, Q5 cutover, pack updater apply, manual world registry changes, and new runtime UI until the installed-versus-registered state is reconciled and 1.5.0 provenance preserved. Original 1.4.1 source import and saved-world baseline are separate from the discovered 1.5.0 LAB folders. Do not overwrite or delete the 1.5.0 files. User can run a further **read-only** check of the two registry-file contents and any world-local pack manifests if needed, without reconfiguring server settings.

## 2026-11-07 — Owner corrected Hart 1.5.0 registration and retention policy

- Owner pasted full `world_behavior_packs.json` and `world_resource_packs.json`: both **DO register** Hart 1.5.0 by original Hart UUID. Earlier diagnostic said otherwise due to array-enumeration bug. User also reported no per-world pack folders, only top-level pack folders. Corrected report, current state and diagnostic parser/Windows synthetic multi-entry fixture.
- Owner confirms an existing backup and states the **failed 1.5.0 update is disposable**. Do not spend additional time preserving it; the existing cloned LAB world's inventory/links and unrelated add-on registrations remain protected. No auto deletion, 1.4.1 reinstall or server access in this change; BDS Bundle 2 tests remain NOT RUN.

## 2026-11-07 — Maintenance-pause unlink guard source fix (new development chat)

- Source audit found a gap in **Bundle 2's offline PG-08 policy model**: relink confirmation rejected transactions during a Q5 maintenance pause, but unlink confirmation did not check that pause. A menu built from this model could otherwise change a saved Collector link during a supposed read-only migration window.
- Patched `tests/test_bundle2_offline_safety.py` to gate unlink confirmation on `paused` and added two focused offline regression methods: maintenance-blocked unlink retains the persisted link, and a stale unlink cannot erase a later confirmed relink. New suite count is **27 test methods** (previous last accepted run had 25; 90 methods total across older suites). **The new methods have not been executed in CI/BDS as of this commit; do not claim 27/27 PASS or 92 total PASS.**
- This is not a gameplay implementation. Original 72 BP/RP baseline files, pack identities, Q4 world data, updater scripts, and both LAB/PROD environments remain untouched. PG-06/07/08 actual BDS gates remain NOT RUN. Keep Q5/MR custody blocked as recorded.
- Time-protection rule: spend next implementation effort on the narrow independent menu source seam, and require a working, version-compatible `@minecraft/server-ui` + safe link persistence demonstration before extending to native MR, Q5, Transporter, Bulk, or owner-run physical rigs. Stop any new task whose prerequisite is still PG-03 NO-GO rather than creating speculative downstream tests.

## 2026-11-07 — PG-08 isolated executable menu candidate, source only

- At the owner's instruction to continue carefully, developed a **separate candidate**, not a mutation of the immutable original `addon/` source, in `candidates/pg08/menu_overlay.js`. It replaces only the original standing Collector/Receiver link gesture in a derived source build, keeps the original event dispatch and sneak-interact passthrough, and uses stable `@minecraft/server-ui` 2.2.0 `ActionFormData`/`MessageFormData`. The native MR inventory dependency and Q5 migration remain out of scope.
- The derived candidate implements Collector status, explicit Link/Relink selection and Receiver confirmation, Unlink confirmation, no implicit placement selection, per-player expiring selection, stale original-link and loaded-block validation, and one-property link write/readback with attempted rollback. If rollback cannot be confirmed, further link changes are held **for that running script session**; crash-durable hold has NOT been proven. Q5 status explicitly reads `not installed`, not `complete`.
- `candidates/pg08/prepare_candidate.py` verifies **all 72 baseline SHA-256 hashes** and unique source anchors before copying to a fixed local `build/pg08-lab` output. Build is OFFLINE ONLY, refuses overwrite and redirected build folders, does not package or deploy automatically. Candidate manifests use the original pack UUIDs and placeholder version 1.5.1 with an explicit install prohibition; original BP/RP stay byte-for-byte unchanged. **Do not install this candidate onto the existing 1.5.0-registered cloned LAB world until compatibility and owner-approved deployment safety are established.**
- Added actual-candidate JS form/storage mocks (`tests/test_pg08_menu_mock.cjs`, nine scenarios) and Python candidate build tests (`tests/test_pg08_candidate_build.py`, six methods), wired into CI along with compiled ESM syntax check. Source-anchor presence was independently checked in the connector (**all five unique**), but repository checkout/network and GitHub PR CI have not provided an executable test result for these latest commits. **Tests NOT VERIFIED PASS; BDS NOT RUN**. Do not add these to accepted offline totals.
- Next evidence gate is successful Node + Python offline execution, then explicit review of old 1.5.0 saved-world compatibility and candidate write/rollback semantics, then a separately authorized LAB-only install with 2–3 user-performed checks. Preserve all 1.4.1 capability, original item metadata and the existing LAB clone. No production, experiment, HartBots or real world operations authorized/performed.

## 2026-11-07 — PG-08 post-merge LAB readiness hardening (PR #3)

- Owner explicitly authorized merge of the previous clean Bundle 2 planning and candidate PR #2. GitHub confirms **merged to main** as `647db54fc57ce4e2c652ef01964e7aef1dcd5df2`; post-merge Linux structural and Windows read-only checks PASS. **This was a Git merge, NOT a LAB/production add-on installation.**
- An independent follow-up draft PR #3 (`feature/pg08-lab-readiness`) hardens actual candidate UI against **ABA stale links** (per-Collector session revisions), and **player disconnect while async link/unlink confirmation is unresolved** (per-player form tokens, leave cleanup). The Node mock suite now executes **12** cases, rather than only the prior nine.
- Added a strict LAB-only Python installer `candidates/pg08/lab_deploy.py` using the existing Bundle 0 transactional updater functions and a Git-backed PowerShell launcher `candidates/pg08/Start-HartLogistics-PG08Lab.ps1`. Source Plan, stopped-server read-only CheckLab, explicit Install -Apply and exact-tag Rollback -Apply are separate; no automatic server operations. Known existing LAB Hart Logistics 1.4.1 or failed 1.5.0 must match both installed pack manifests and world JSONC registration; exact LAB `ThomasServer` and shared Hart pack folders are pinned; preserve other mods and the world.
- Expanded synthetic deployment tests to **12 Python methods** covering actual 1.5.0 multi-mod registrations, write-free Plan, staged swap with preserved original pack/registry backups, strict identity/refusal, failure rollback, roundtrip restoration and third-party JSONC changes. Run on Linux and Windows. Git for Windows revealed CRLF normalization of the frozen 1.4.1 LICENSE, so added `.gitattributes` `-text` for the original BP/RP trees: **preserve original bytes, never relax SHA256 acceptance**.
- CI [run 42393680538](https://github.com/partom24/HartLogistics2/actions/runs/42393680538) **PASS** on both Linux and Windows for the latest candidate/docs predecessor, including PowerShell syntax/unsafe entry refusal. This confirms **offline/CI** only, not in-game UI, existing 1.5.0 saved-world compatibility, actual Windows LAB installation or a BDS GO.
- Proposed [PG-08 single-rig smoke card](../candidates/pg08/TEST_SESSION.md): 1 Collector, 2 Receivers, 1 harmless sneak-placement dummy, no Hoppers/Sorters/items, 3 manual behavioral checks, with exact absolute safe XYZ/clearance and actual read-only LAB preflight **still pending**. **Manual BDS rig NOT READY; PG-08 BDS NOT RUN.** No server/world/experiment/production touched and no owner testing requested yet.

## 2026-11-07 — PG-08 actual Windows preflight revealed Python launcher version gate

- Owner ran the released `Start-HartLogistics-PG08Lab.ps1 -Mode CheckLab` from PowerShell in `C:\\HartMods`; it **refused before Git/LAB/server/world access** when `py.exe -3.11` could not locate Python 3.11. The owner confirmed `python --version` = **3.12.10**, already installed. No actual LAB preflight was performed and **PG-08 BDS remains NOT RUN**.
- Corrected the Git-backed LAB launcher to select working `python.exe` first (fallback `py.exe -3`) and accept Python **3.11+ in the 3.x line** while refusing older/missing runtimes. No new dependencies, experiment flags, server operations, gameplay or baseline changes. This is a narrow operator compatibility correction, not authorization to install.
- Windows CI [42395295381](https://github.com/partom24/HartLogistics2/actions/runs/42395295381) verified an **actual source-only PowerShell Plan execution with Python 3.12.10** in an ephemeral Git checkout, plus structural and read-only Windows checks. Early draft workflow runs exposed a source patch text corruption and a shallow-Git synthetic fixture; both were corrected before this PASS. It does **not** attest to actual LAB CheckLab or candidate load. Next owner step: refresh launcher file from `main` after this fix merges, rerun **CheckLab only** and provide its output. No need to install Python 3.11.

## 2026-11-07 — PG-08 actual cloned LAB read-only preflight PASS (owner-supplied console)

- Owner executed `& $script -Mode CheckLab` on the LAB Windows machine using the refreshed Git-backed PG-08 launcher. Console confirms **Python 3.12** from `C:\Program Files\PyManager\python.exe`, **pinned Git commit `82adedea7f1e79284118765f596ae2ac0bbe01d8`**, dedicated checkout `C:\Users\Administrator\AppData\Local\HartLogistics2-PG08-LAB`, and exact authorized LAB root `C:\Servers\Thomas_MCBedrock - Copy (2)`.
- It identified only the Hart Logistics BP `behavior_packs\HartMods_HartLogistics_BP` and RP `resource_packs\HartMods_HartLogistics_RP` as prospective replacement targets. Final console line **`LAB PREFLIGHT PASS: READ-ONLY. Nothing installed.`** Owner-supplied output; no independent file inspection or BDS runtime observation. This establishes the *actual LAB read-only preflight* gate as GO at this source revision only.
- **No `Install -Apply` was executed.** Original LAB pack registration/world state, Q4 queues and other packs are not reported as changed. PG-08 gameplay test **NOT RUN**; native MR/Q5 remain blocked/not implemented. Before any owner-directed LAB install, obtain explicit authorization for the narrow Hart Logistics BP/RP replacement; source pinned to exact commit, stopped LAB server, stable installer backup and rollback remain mandatory. Manual rig **NOT READY** until verified safe absolute Overworld XYZ/clearance is selected. No production access or experiment/cheat changes.

## 2026-11-07 — owner-reported PG-08 LAB install and BDS startup (first real runtime evidence)

- After explicit approval of the narrowly scoped LAB-only menu trial, the owner ran `& $script -Mode Install -Apply` from the Git-backed PowerShell launcher. It reported `PG08 LAB INSTALL COMPLETE` for **only** `behavior_packs\HartMods_HartLogistics_BP` and `resource_packs\HartMods_HartLogistics_RP` at the exact LAB root `C:\Servers\Thomas_MCBedrock - Copy (2)`; Git pin **`846889dfa2516c303bea79d663746f02deb7f26e`**, Python 3.12, and retained backup **`C:\Servers\Thomas_MCBedrock - Copy (2)\_HartLogisticsDeployBackups\lab-5af88e18cff3`**. This is owner-provided console output, not an independent filesystem attestation or a full-world backup.
- The owner then restarted **LAB BDS** and provided startup output: pack stack registers `HartMods - Hart Logistics BP | PG08 LAB ONLY` UUID `4854d263-05dd-4f79-a21c-7ba969295c2d`, version **1.5.1**; `Server started.`; the script logged `[Hart Logistics 1.5.1-LAB-PG08] ready; sorters=664, collectors=54, receivers=31, registry=v2 5 shards / 104891 chars`. Evidence level **OWNER-REPORTED TARGET BDS STARTUP OBSERVED**, scope: candidate module imported, registry loaded, script initialization completed. No in-game menus, saved-link edit persistence, item-route acceptance or production release proven.
- Startup excerpt also included `Persistent queue left unsupported/non-stackable item at source: minecraft:enchanted_book` and `minecraft:saddle`. Source review of unchanged 1.4.1 `processCollectorIngress` shows these messages occur if unsupported items cannot use the direct physical Hopper output path (offline/blocked Receiver or queue backlog); code intentionally **does not serialize them into Q4 and leaves them at source**. These warnings do not by themselves prove item loss or a PG-08 menu defect; they also do not prove the item contents were independently inspected. No need to retest legacy MR custody solely for these warnings.
- **Next gate:** choose and verify an empty, isolated **absolute Overworld XYZ** satisfying [PG-08 rig card](../candidates/pg08/TEST_SESSION.md) and then execute **3** narrow menu checks: no automatic placement selection + sneak-place, link/relink cancel+confirm, saved-link restart+unlink. Do not place blocks or claim PG-08 gameplay acceptance before the rig is READY. Keep rollback backup `lab-5af88e18cff3`; no server experiment/cheat changes or production operations.

## 2026-11-07 — PG-08 test room measured, isolated rig coordinates selected

- Owner supplied two Overworld screenshots of the LAB testing structure: an elevated view of a large stonebrick-covered building and an interior view of an apparently empty stonebrick test room at player position around **(-939,69,-778)**. Owner then measured opposite **inside** room corners **(-937.30,69.00,-776.30)** and **(-968.64,69.00,-817.56)**. These are player positions, not coordinates of placed/tested blocks; do not claim underlying floor or hidden cavities inspected.
- Selected one reusable menu-only test row on visible floor (air placement Y=69 over expected Y=68 stone floor): **Collector C (-953,69,-797)**; **Receiver A (-950,69,-797)**; **Receiver B (-947,69,-797)**; one temporary sneak-placement dummy **(-953,69,-796)**. The locations are centered comfortably within the measured interior, with ~9+ blocks to the closest X wall and ~20 Z clearance. No Sorter, Hopper, items, redstone, external network or Q5 migration needed.
- Updated [PG-08 test session](../candidates/pg08/TEST_SESSION.md) to the **READY geometry and 3-check hands-on card**, including up-front scope, all coordinates, no assumptions about under-floor contents, a stop-if-obstructed physical inspection, BDS restart, pass/fail, evidence, and safe cleanup. Screenshots visibly show no machinery on the room floor, but **no physical block placement or in-game UI interaction has yet been reported**. PG-08 menu BDS acceptance remains **NOT RUN**. Retain rollback tag `lab-5af88e18cff3`, never touch production.

## 2026-11-07 — PG-08 first live Receiver A confirmation (owner screenshots)

- Owner shared screenshots of actual LAB Bedrock `Confirm Receiver` MessageForm showing **Collector `minecraft:overworld|-953|69|-797`** and **Receiver A `minecraft:overworld|-950|69|-797`** with **Cancel / Link** buttons. Follow-up screen has the green success message `[Collector] Link confirmed to Receiver minecraft:overworld|-950|69|-797.` This is **OWNER-PROVIDED BDS UI RUNTIME OBSERVED** evidence for one confirmed Collector → Receiver A link on `Hart Logistics 1.5.1-LAB-PG08`. All block positions match the planned LAB room card.
- A separate view displays the cyan `[Collector] Selection armed. Interact with the intended Receiver to confirm.` prompt after the A success message. This proves a subsequent selection was armed, **not** that its Receiver B confirmation was canceled or completed. No persisted-link readback/restart, unlink, menu close/cancel effects, or sneak-placement observation is established by these particular screenshots.
- **Next narrow checks:** interacting with Receiver B `(-947,69,-797)` and choosing Cancel, then inspect Collector C to verify A still linked; subsequently confirm B and verify B in Collector menu; only then test LAB restart/unlink. Do not claim PG-08 all checks PASS before user observation. Preserve rollback `lab-5af88e18cff3`; no production changes.

## 2026-11-07 — PG-08 in-game B link, unlink, and Receiver/Collector readback

- Owner-supplied LAB gameplay screenshots (same three-block room) after the initial A link show **green `[Collector] Link confirmed to Receiver minecraft:overworld|-947|69|-797.`** for Receiver B, a subsequent actual **Unlink Receiver** confirmation dialog targeting B, and **green `[Collector] Receiver unlinked.`**. This establishes **runtime UI confirmed link/relink to B and explicit unlink success notification**; it does not independently prove the link remained unchanged when an action was canceled.
- The owner's subsequent screenshots show the **Hart Receiver** UI reporting `Linked Collectors: 0` at one Receiver and `Linked Collectors: 1` at the other. A separate real **Collector Details** output reports `network: minecraft:overworld -950,69,-797 | queued 0/250000`, `Inputs: 0`, `waiting: 0`, and `lifetime accepted: 0`. This is runtime readback that Collector C is **currently linked to Receiver A** at `(-950,69,-797)` after the previous B/unlink screenshots, consistent with an additional A re-link. The screenshots alone do not prove the server restarted between changes or that B cancellation retained the prior link.
- **PASS (bounded):** actual UI link confirmation to A and B, explicit unlink success message, current Collector Details link readback to A, Receiver linked-Collector counts, and zero physical test throughput. **PENDING:** user confirmation of cancel-without-write (both relink and unlink), persistence across actual LAB BDS restart, and whether the wooden dummy's placement was specifically performed while sneaking. Preserve three-block rig and rollback backup `lab-5af88e18cff3`; original source and other world networks remain out of scope.

## 2026-11-07 — PG-08 Receiver B link readback in requested post-restart screenshot sequence

- In direct response to the request to **restart LAB BDS and inspect Collector Details**, the owner supplied three more screenshots from the isolated room. Collector Details reports **`network: minecraft:overworld -947,69,-797`**, **`Inputs: 0`**, **`waiting: 0`**, **`queued 0/250000`**, and **`lifetime accepted: 0`**. Receiver menus separately report **`Linked Collectors: 0`** and **`Linked Collectors: 1`**, consistent with the A/B test rig's confirmed B link.
- **Evidence classification:** OWNER-PROVIDED BDS RUNTIME LINK READBACK **PASS** for active B link, after an *instructed* restart. The screenshot itself does not prove a process stop/start; **restart persistence remains conditional until the owner confirms the restart occurred**. The observed game-day count is not an adequate substitute for restart proof. No item routing was tested.
- No additional link/relink positive-path test is required: successful A and B confirmations, explicit unlink, and current Collector/Receiver readbacks were already observed. Only negative cancel-without-change cases and the above restart confirmation remain before closing PG-08. Keep rollback backup `lab-5af88e18cff3`. No production or experiment changes.

## 2026-11-07 — PG-08 restart persistence confirmed by owner

- In direct follow-up to the BDS restart-persistence check, owner explicitly confirmed: **"yes, i followed the test guide and restarted the lab"**. This establishes that the previously supplied Collector Details screenshot reporting **Receiver B at `minecraft:overworld|-947|69|-797`** was obtained **after the owner stopped and restarted the LAB BDS** as instructed.
- Evidence: **OWNER-CONFIRMED BDS RESTART + POST-RESTART IN-GAME READBACK — PASS** for PG-08's existing link persisting through restart. The screenshot also showed `Inputs: 0`, `waiting: 0`, and `queued 0/250000`; Receiver menus showed 0/1 linked Collectors. No second restart or repeat of the successful positive A/B link operations is required.
- **Still pending for full PG-08 acceptance:** confirmation that **Cancel** on Relink-to-A while B is linked leaves B unchanged, and that **Cancel** on Unlink leaves B unchanged. Sneak-placement gesture was suggested by a wooden test block adjacent to C, but not specifically confirmed in words. Keep test-owned blocks until completed; rollback tag **`lab-5af88e18cff3`** remains retained. No MR/Q5 acceptance, general throughput regression, production operation or world reset implied.

## 2026-11-07 — PG-08 unlink cancellation UI screenshot sequence

- Owner supplied a four-frame LAB screenshot sequence in response to pending cancellation checks. Collector C menu shows `Linked Receiver: minecraft:overworld|-947|69|-797` before the action; a real `Unlink Receiver` confirmation form targets B and displays the `Cancel` and `Unlink` buttons; a subsequent Collector C menu still displays `minecraft:overworld|-947|69|-797`. This shows the **existing B link unchanged across the visible sequence**, consistent with a canceled unlink.
- **Evidence limitation:** The `Unlink` button is visually highlighted on the confirmation screen, not activated by the screenshot. A still image does not prove which button was pressed or show an explicit canceled action; do not upgrade the negative `Cancel` behavior to a formally witnessed PASS until the owner confirms. The screenshots do not contain a `Confirm Receiver` form targeting A for the separate **cancel relink-to-A** case.
- The already verified **restart persistence PASS** and the earlier confirmed link/unlink positive paths stand. No additional server restart, new rig, deployment or repeated positive-path confirmation needed. Preserve LAB-only backup `lab-5af88e18cff3`; cleanup only after remaining negative evidence is settled.

## 2026-11-07 — PG-08 menu-only BDS functional GO; close manual tests and begin ordinary Transporter authority safety

- In response to the two outstanding cancellation questions, the owner expressly confirmed **both** procedures were followed: **Cancel on Relink-to-A kept Collector C linked to B**, and **Cancel on Unlink kept Collector C linked to B**. Earlier screenshots show B-targeted Unlink dialog and post-cancel Collector menu still linked to `minecraft:overworld|-947|69|-797`. Relink cancellation is **owner-reported observation** (not independently screenshot-confirmed), accepted at that evidence level; do not demand a repeat.
- Together with actual BDS UI link confirmation A, relink B, explicit unlink, Collector/Receiver status readbacks, and owner-confirmed LAB BDS restart with B link intact, this closes the **PG-08 isolated menu/linking runtime functional checks as GO** on **BDS 1.26.63.1 / client 26.63**, candidate `1.5.1-LAB-PG08` built from source pin `846889dfa2516c303bea79d663746f02deb7f26e`. No more hands-on menu test needed. The wooden dummy adjacent to Collector is visible but the precise sneak gesture was not separately captured; unchanged 1.4.1 sneak-place event guard and limited owner-followed procedure evidence are reused, not a claim that every path was newly retested. This is **not** a native MR/container, Q4→Q5 migration status, item-throughput, PG-06/07, or production acceptance.
- **Closeout cleanup pending owner confirmation, not a test blocker for continuing independent offline work:** no temporary probe, experiment flag, debug hook or extra pack was installed by PG-08. After checking no items/queues, owner may remove only the test-owned Collector C `(-953,69,-797)`, Receivers A/B `(-950/-947,69,-797)`, and dummy wooden block `(-953,69,-796)`. Do not reset the cloned world or erase any unrelated blocks. Keep LAB rollback backup `lab-5af88e18cff3`; no automatic pack rollback or production change.
- Owner explicitly requested **move on without further PG-08 checks**. Next independent slice is ordinary-only Transporter/Bulk network authority. Added permanent **offline-only** `tests/test_transport_authority_model.py` candidate with **13 scenarios** (locally 13/13 PASS): forbid routing under unknown/unloaded graph boundaries, duplicate/absent/stale controller claims, old split/merge epochs, cross-controller-region traffic and disconnected paths; allow only fully witnessed local graph+claimed ownership. This is a conservative **design hypothesis**, not elected controller algorithm, game code, item movement or approval to deploy. Existing 1.4.1 protected `addon/` remains unchanged; PG-03 remains NO-GO and native MR path held.

