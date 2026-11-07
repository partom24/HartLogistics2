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

Owner proposed temporary ticking areas to proactively load known legacy blocks during Q4→Q5. Official Bedrock docs support named areas but impose world quota/permissions; they keep vanilla mechanics ticking. Added [optional Q5 design](Q5_MIGRATION_DESIGN.md#optional-temporary-ticking-area-assisted-migration--feasibility-candidate-2026-11-07) and one **optional PG-07 subcheck** requiring clean area removal/recovery and no unapproved cheat toggle. This is **NOT RUN / NOT APPROVED** as executable migration code. Automatic on-normal-chunk-load migration remains the safe fallback.

## Next bounded action

Review [design](LOGISTICS_DESIGN.md), [Q5 migration plan](Q5_MIGRATION_DESIGN.md), and [open decisions](IDEA_INBOX.md) with the owner. Do not write, import or release gameplay source until expressly authorized.

