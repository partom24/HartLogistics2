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
