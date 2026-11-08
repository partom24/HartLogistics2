# Current Development State — Hart Logistics 2

**As of 2026-11-08.** Owner authorizes ongoing development, offline checks and GitHub LAB-test deliveries; involve the owner for blocking issues or BDS testing. Development/merge is not production or public release approval. Only repository: **partom24/HartLogistics2**.

## Active milestone and source

**HL-TRANSPORT-001:** bounded ordinary Transporter input prototype. PG26 adds one ordinary native chest/barrel source, at most 16 pipes and one Sorter column, all within one chunk. Whole stacks move into empty native output slots through the existing journaled writer. Native Hopper paths, Sorter modes/filters/redstone, legacy MR paths and PG25 conservative HOLD remain preserved. No pipe inventory, virtual balance, Bulk/Q5, controller authority or new Collector/Receiver input path.

The immutable 1.4.1 compatibility reference is `addon/`: **72/72 original files unchanged**, import `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`, [hash registry](../BASELINE_HASHES.json). Candidate source/build entry points are under `candidates/`; ignored `build/` output is not source. PG27 derives the exact PG26 predecessor because safe update/rollback validates its installed hashes; there is one inherited gameplay implementation.

## Actual installed LAB and latest finding

- **Installed/running:** PG26 **1.5.9-LAB-PG26**, source `6738497fd7077831abd316e257a4281d97fa0ae8`, owner installer backup **lab-d16a31ba5a8e**. Supplied normal-start log confirms BDS **1.26.63.1** and PG26 ready.
- Latest screenshot: **664 Sorters / 56 Collectors (45 linked, 11 unlinked) / 35 Receivers**, Q4 paged 35/35, **sorter clear | queue clear**. Receiver count was previously 34; record the observation without inferring corruption or claiming unchanged topology.
- **HL-E-072:** new pipe and dedicated inventory icon register/render, but owner reports east/west gaps and `/give` displays the raw translation key. Visual gate **NOT ACCEPTED**. No new Transporter item-transfer success/failure has been demonstrated.
- Legacy caught filter-display unload warnings use unchanged PG25/PG26 code; they do not establish the pipe defect's cause. Raw owner log is not committed; [sanitized evidence](PG27_TRANSPORTER_VISUAL_CORRECTION.md).

## Current correction and evidence

**PG27 1.5.10-LAB-PG27** swaps the two world-model X-arm origins to match Bedrock's model-X reflection, sets the explicit English name `Hart Transporter`, and bumps manifest/status versions. Connection detection and all gameplay code are **byte-identical apart from the version literal**. Dedicated item model, texture, other arms, IDs, states, pack UUIDs and API requirements remain unchanged.

**HL-E-073 OFFLINE PASS:** seven builder checks, three real-callback/visible-model-bound cases covering all 64 masks at positive/negative coordinates, historical wrong-side witness, shared seam and neighbor removal/replacement; 13 synthetic exact-predecessor deployment/rollback checks. Full local **299 Python / 468 Node** pass, generated JS syntax and normal/release structural validators pass. Final commit and GitHub Windows/Linux CI are tracked in the delivery PR. **PG27 BDS NOT RUN.** No temporary runtime instrumentation.

## Next owner action

After final green CI, deliver the [complete PG27 launcher bootstrap and two visual checks](../candidates/pg27/TEST_SESSION.md). Reuse the owner's existing empty rack; no new construction. Verify status/name/continuous east-west seams and removal/replacement. Original [PG26 ordinary/redstone route](../candidates/pg26/TEST_SESSION.md) remains pending and requires a **Sorter**, not a Collector/Receiver endpoint. Do not feed the visual rack until that route's admission/setup is established.

## Reusable acceptance and remaining gates

PG25 normal startup/eight-item ordinary route is **accepted at bounded LAB scope (HL-E-070)**: output eight photographed, input empty owner-confirmed, topology and journals clear. PG25 source `e43ad176c1762d0a354893638bac44c9d13fce8d`, backup **lab-36ead7340407**. No repeat PG25 transfer, reinstall, forced crash or extra restart. Earlier menu/linking, native MR and Dropper/Dispenser observations remain bounded by their entries in the [evidence register](ENGINEERING_EVIDENCE_REGISTER.md) and [development ledger](DEV_LEDGER.md).

Native custom-container MR storage remains **PG03 NO-GO** on stable no-experiments BDS 1.26.63.1; full Q5 migration, spendable Bulk custody, controller authority, crash-atomic persistence and full PG09–11 remain unaccepted. Do not infer those guarantees from normal routing or offline checks. Preserve all existing world state, legacy paths and backups.

**Only LAB target:** `C:\Servers\Thomas_MCBedrock - Copy (2)`, existing production-derived clone, world ThomasServer. Do not ask for a reset or drain existing Receivers. **Protected production:** `C:\Servers\Thomas_MCBedrock`; no production operation or public release authorized. Environment configuration/publish is unchanged. See [roadmap](ROADMAP.md), [current PG plan](PRELIMINARY_GO_NO_GO.md) and [deployment boundary](UPDATER_DEPLOYMENT_DESIGN.md).
