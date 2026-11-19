> **MANDATORY STATIC CONTINUITY:** [Canonical original evidence and PowerShell process sources](CANONICAL_EVIDENCE_AND_TOOLING.md), [immutable project index](PROJECT_STATIC_RESOURCES.json), and [root discovery contract](../PROJECT_CONTINUITY.md) retain the real prior tests/tools across branch boundaries. The shortened register in this checkout is supplemental, not authority to declare historical proof missing. Original source acceptance limitations still apply.

> **Owner player-first testing clarification — 2026-11-18:** [URCE-ADR-004](../planning/URCE_150_OWNER_PLAYER_FIRST_TESTING_DECISION_20261118.md). Any valid player-created network geometry and legitimate item can be used in eventual acceptance. Exact XYZ and demo-specific item allowlists are not prerequisites; ordinary versus MR structure still matters. This supersedes historical rigid test-rig cards, not LAB/production safety gates. Documentation only.

> **2026-11-18 cross-branch native MR evidence correction:** [full audit of 79 branch evidence-register snapshots, main HL-E chronology, curated NMR and archived PG42 PR](../planning/URCE_150_CROSS_BRANCH_NATIVE_MR_EVIDENCE_REUSE_AUDIT_20261118.md). **PG20 native MR movement and PG42 persistent nine-slot native entity inventory on BDS 1.26.63.1 were already accepted at scoped LAB level.** Their primitive availability is **NOT a pre-code blocker**. Custom-*block* PG-03 NO-GO is a different optional endpoint. Do **not** request repetition of PG20/PG42 or copy frozen PR #79 runtime. URCE carrier adoption, Q4 migration, foreign-writer isolation, unload/crash recovery and full integration acceptance remain real engineering work.

> **Latest Transporter owner correction — 2026-11-18:** [URCE-ADR-003](../planning/URCE_150_OWNER_TRANSPORTER_INFRASTRUCTURE_DECISION_20261118.md): visible, player-understandable network connectivity is the Transporter's primary role. URCE may perform safe endpoint-to-endpoint custody moves without per-segment item traversal; native MR movement/entity-inventory *primitive feasibility has a scoped BDS PASS* (PG20/PG42), while integration safety remains OPEN; the earlier 'fast pipe' characterization is superseded. Source-only planning, no code or test authorization.

> **URCE P4→performance/code-readiness update — 2026-11-18:** [BDS capture and Transporter/batching evidence](../planning/URCE_150_TRANSPORTER_BATCHING_BDS_CAPTURE_EVIDENCE_20261118.md) and [pre-code proof gate matrix](../planning/URCE_150_PRECODE_READINESS_AND_PROOF_GATES_20261118.md) are current for source-only design. Owner product choices are closed; full U0, directed-graph U1, durable custody U2, URCE-specific carrier/Transporter integration U3 and 1.4.2 LAB acceptance remain pending; native MR primitive feasibility is already proven. No gameplay code/test/runtime/release was approved by this review.

> **Current owner-end-state update — 2026-11-18:** [Owner-approved HartLogistics 1.5 product contract](../planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md) supersedes the earlier product defaults in the historical snapshot below, including mandatory controller/region/Q5/final-Wildcard assumptions. Active milestone remains **HL-URCE-PLAN-001, documentation/source-only**. No gameplay changes, owner LAB runs, production operations, runtime acceptance or release approval were made by this update.

> **URCE planning branch — 2026-11-17:** [Active 1.5 architecture plan](../planning/URCE_150_ARCHITECTURE_AND_DELIVERY_PLAN_20261117.md), [historical 1.5 skeleton reference triage](../planning/URCE_HISTORICAL_15_REFERENCE_REVIEW_20261117.md). The following older transport/recovery roadmap state is historical only. The code on this branch remains **the exact 1.4.2 gameplay baseline**, with no URCE runtime, Bulk/Transporter, Q5 data or owner-world migration.

> **2026-11-17 baseline handoff**: [1.4.2 native-first closeout](../implementation/BASELINE_142_CLOSEOUT_20261117.md) supersedes the historical active 1.5 Transporter milestones in this file for the new **1.4.2 baseline branch**. These prior 1.5 PGxx results remain reference evidence, not new 1.4.2 runtime components. The next selected architecture is **URCE**, not Q5. No release or BDS acceptance is claimed.

# Current Development State — Hart Logistics 2

**As of 2026-11-06**  
**Lifecycle:** owner-authorized planning only; no gameplay implementation or new release.

## Active source and project reality

- Repository: **partom24/HartLogistics2** only.
- **Only authorized server testing target:** disposable lab `C:\Servers\Thomas_MCBedrock - Copy (2)`. **Protected production:** `C:\Servers\Thomas_MCBedrock` — no edits until a release candidate is nominated; no execution of production updater before nomination; further owner approval required before production apply. [Deployment design](UPDATER_DEPLOYMENT_DESIGN.md).
- Declared intended implementation root: **addon/**, currently a README placeholder. **The real 1.4.1 behavior/resource source is not yet committed.**
- Supplied reference: owner-uploaded Hart Logistics 1.4.1 mcaddon (see [baseline registry](BASELINE_REGISTRY.md)). HartBots 1.8.2 mcaddon was supplied for Depot comparison only; no HartBots repository access.
- The repo retains template engineering policies, structural validator in scripts/ and its tests in tests/. Template example achievements have been replaced in the project-specific handoff, roadmap, evidence and decision documents.
- Blueprint project now describes HartLogistics2; current milestone **HL-PLAN-001** authorizes specification and questions, not implementation.
- Release state: **not approved**. No distributable Hart Logistics 2 artifact exists in this repo.

## Verified, reported and unknown

- **SOURCE REVIEW (supplied files, not repo):** prior inspection identified a behavior pack, resource pack, Sorter/Collector/Receiver, q4 persistent queue and existing support paths; original uploaded 1.4.1 archive hash recorded in the baseline registry. Exact 1.4.1 route contracts and their source function/line anchors are documented in the [ingress/egress matrix](BASELINE_INGRESS_EGRESS_MATRIX.md). This does not claim new runtime validation.
- **OFFLINE checks on supplied source:** earlier local inspection reported JSON parsing, JS syntax and PNG headers. These are NOT in-game tests or CI proof of an imported Git revision.
- **Owner-reported testing:** metadata-rich ItemStacks can be preserved via native container-to-container methods. Detailed fixtures and observation logs are not yet committed.
- **Owner architecture decision:** permanently replace the restricted Q4 MR direct-only bypass with **native custom-container MR custody in Collectors and Receivers**, **after** a safe compatibility transition; see [Q5 design](Q5_MIGRATION_DESIGN.md) and [baseline matrix](BASELINE_INGRESS_EGRESS_MATRIX.md). No source change or runtime acceptance is implied.
- **SOURCE REVIEW (uploaded updater archive):** HartBots updater `scripts.zip` was inspected without running anything. Its production promotion script is **approved for reference import** but prohibited from execution until candidate nomination; none of its hardcoded HartBots paths/versions/identities may be used unchanged. [Deployment design](UPDATER_DEPLOYMENT_DESIGN.md).
- **API documentation finding:** Microsoft's custom block inventory is intended to expose normal `BlockInventoryComponent.container`/`Container` methods (`moveItem`, `transferItem`); availability and correctness on **26.63** remain untested. A focused custom-endpoint LAB gate is planned, not a repetition of established native vanilla-container transfers. See [Q5 design](Q5_MIGRATION_DESIGN.md).
- **Owner-accepted 2026-11-07 design choices:** Hopper and Transporter interchangeable at the Sorter intake, deliberate adjacent-container source layout above Sorters (no storage output chests at/above pipe Y), persistent deterministic controller network identity, fail-closed unknown Bulk capacity, separate finite MR physical slots, and a **durable global Hart Logistics routing pause** for Q5 with automatic **on-load** legacy block migration and menu status. Unloaded block migration cannot occur until its chunk becomes accessible; vanilla Hopper ticks are not inherently paused. Design/proof still pending; see [logistics design](LOGISTICS_DESIGN.md) and [Q5 migration](Q5_MIGRATION_DESIGN.md).
- **Unknown:** complete world-upgrade safety, Q5 migration feasibility under interrupted writes, controller reconciliation, native custom block inventory availability without experiments, transport throughput and end-to-end item conservation.
- Structural GitHub Actions/validator results for **this planning change** are not yet recorded; check the PR before claiming PASS.

## Planned preliminary gate batches

The owner **approved the [PG-01–PG-11 preliminary test plan](PRELIMINARY_GO_NO_GO.md) conditional on immediate temporary-test cleanup under the existing [template instrumentation policy](TEMPORARY_INSTRUMENTATION_POLICY.md)**. Execute related checks 2–3 at a time with reused evidence and rigs; remove their temporary parameters and wiring as soon as no longer needed and before task acceptance, not merely before release. All gates are **NOT RUN**; no manual rig is READY. Any NO-GO stops only the affected dependent implementation. No new gameplay source or server test has been authorized.

## Optional ticking-area migration accelerator — under review

Owner proposed temporary ticking areas to proactively load known legacy blocks during Q4→Q5. Corrected Microsoft API review: `world.tickingAreaManager` was stable in 1.26.10 (`@minecraft/server` 2.6.0) and provides **per-pack areas independent of the cheat-restricted `/tickingarea` command**. Hart Logistics 1.4.1 declares 2.7.0, but actual 26.63 use is untested. `metadata.product_type="addon"` is a classification, not a cheat-toggle safeguard. Ticking areas still keep vanilla mechanisms active. Added [optional Q5 design](Q5_MIGRATION_DESIGN.md#optional-temporary-ticking-area-assisted-migration--feasibility-candidate-2026-11-07) and one **optional PG-07 subcheck** requiring clean named area removal/recovery with **no cheat or experiment toggles**. This is **NOT RUN / NOT APPROVED** as executable migration code. Automatic on-normal-chunk-load migration remains the safe fallback.

## Next bounded action

Review [design](LOGISTICS_DESIGN.md), [Q5 migration plan](Q5_MIGRATION_DESIGN.md), and [open decisions](IDEA_INBOX.md) with the owner. Do not write, import or release gameplay source until expressly authorized.

