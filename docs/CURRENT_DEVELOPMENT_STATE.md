# Current Development State — Hart Logistics 2

**As of 2026-11-08.** Owner authorizes ongoing development, offline checks and GitHub LAB-test deliveries; involve the owner for blocking issues or BDS testing. Development/merge is not production or public release approval. Only repository: **partom24/HartLogistics2**.

## Active milestone and source

**HL-TRANSPORT-001:** bounded ordinary Transporter input prototype. PG26 adds one ordinary native chest/barrel source, at most 16 pipes and one Sorter column, all within one chunk. Whole stacks move into empty native output slots through the existing journaled writer. Native Hopper paths, Sorter modes/filters/redstone, legacy MR paths and PG25 conservative HOLD remain preserved. No pipe inventory, virtual balance, Bulk/Q5, controller authority or new Collector/Receiver input path.

The immutable 1.4.1 compatibility reference is `addon/`: **72/72 original files unchanged**, import `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`, [hash registry](../BASELINE_HASHES.json). Candidate source/build entry points are under `candidates/`; ignored `build/` output is not source. PG27 derives the exact PG26 predecessor because safe update/rollback validates its installed hashes; there is one inherited gameplay implementation.

## Installed LAB and accepted visual scope

**Running:** 1.5.10-LAB-PG27, delivered source `e6442137f238ee55201dafa05068fe1047ea2f43` ([PR #46](https://github.com/partom24/HartLogistics2/pull/46)). Owner screenshot confirms version, 664 Sorters / 56 Collectors (45 linked, 11 unlinked) / 35 Receivers, Q4 paged 35/35 and **sorter clear | queue clear**. PG27 installer backup tag has not been supplied; do not invent it. Preserve older backups lab-d16a31ba5a8e and lab-36ead7340407.

**HL-E-074 — scoped visual success:** owner confirms east/west corrected and chest, barrel and double-chest connections pass; screenshots show the placed connections. Close these rendering checks without repeating them. This does not establish item extraction from any container. Explicit removal/replacement behavior and corrected inventory-name feedback were not separately confirmed; do not claim those observations. Receiver nonconnection is an unimplemented endpoint, not another X-axis rendering failure.

PG27 changes only two world-arm origins, English display name and versions. Gameplay is unchanged. **HL-E-073 OFFLINE:** 299 Python / 468 Node pass; [12/12 final main CI jobs PASS](https://github.com/partom24/HartLogistics2/actions/runs/42499886661), including Windows launcher/upgrade/rollback. Original 72-file baseline unchanged; no temporary runtime instrumentation.

## Work remaining and next steps

1. **Next bounded checkpoint:** complete the pending ordinary native route/redstone validation using the existing PG26 route card, adapting only if the owner's actual layout differs. Single chest/barrel → Transporters → Sorter → native output; exact input/output counts, powered pause/resume and clear journals. Reuse accepted visuals and PG25 evidence; no reinstall or new visual rack.
2. **Next development slice:** review Receiver Q4 extraction into the Transporter/Sorter path, defining queue debit, physical insertion, pending-receipt HOLD, unload/backpressure and rollback before implementation. Reuse authoritative writers; an arm-only change must not imply working extraction. Automate source/fault checks before requesting a narrow BDS session. Receiver support is not implemented or accepted yet.
3. **Double-chest extraction:** currently deliberately refused (shared 54-slot inventory/aliasing). Visual connection success does not remove that guard. Establish single inventory identity and exactly-once source admission before expanding support.
4. Full network/controller, cross-chunk routing, native MR storage, Q5 migration and Bulk remain separate gated work. Maintain ongoing development autonomy; involve owner for actual BDS checks or blocking issues.

[Visual closeout and limits](PG27_TRANSPORTER_VISUAL_CORRECTION.md), [pending ordinary route card](../candidates/pg26/TEST_SESSION.md). No new test is required merely to repeat accepted rendering.

## Reusable acceptance and remaining gates

PG25 normal startup/eight-item ordinary route is **accepted at bounded LAB scope (HL-E-070)**: output eight photographed, input empty owner-confirmed, topology and journals clear. PG25 source `e43ad176c1762d0a354893638bac44c9d13fce8d`, backup **lab-36ead7340407**. No repeat PG25 transfer, reinstall, forced crash or extra restart. Earlier menu/linking, native MR and Dropper/Dispenser observations remain bounded by their entries in the [evidence register](ENGINEERING_EVIDENCE_REGISTER.md) and [development ledger](DEV_LEDGER.md).

Native custom-container MR storage remains **PG03 NO-GO** on stable no-experiments BDS 1.26.63.1; full Q5 migration, spendable Bulk custody, controller authority, crash-atomic persistence and full PG09–11 remain unaccepted. Do not infer those guarantees from normal routing or offline checks. Preserve all existing world state, legacy paths and backups.

**Only LAB target:** `C:\Servers\Thomas_MCBedrock - Copy (2)`, existing production-derived clone, world ThomasServer. Do not ask for a reset or drain existing Receivers. **Protected production:** `C:\Servers\Thomas_MCBedrock`; no production operation or public release authorized. Environment configuration/publish is unchanged. See [roadmap](ROADMAP.md), [current PG plan](PRELIMINARY_GO_NO_GO.md) and [deployment boundary](UPDATER_DEPLOYMENT_DESIGN.md).
