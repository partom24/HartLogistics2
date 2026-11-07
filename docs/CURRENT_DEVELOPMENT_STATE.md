**LATEST 2026-11-07 CLOSEOUT:** Owner confirmed LAB probe Cleanup SUCCESS; all disposable PG-03–PG-05 test source, installers, CI steps and blueprint temporary instrumentation removed from Git. PG-03 NO-GO on no-experiments 1.26.63.1; PG-04/05 BLOCKED; PG-06–PG-11 NOT RUN. Original 1.4.1 BP/RP unchanged. Native MR custody alternatives documented in [MR_CUSTODY_ALTERNATIVES_12663.md](MR_CUSTODY_ALTERNATIVES_12663.md). Prior dated statements below are archived history, NOT current instructions.

**LATEST BUNDLE 1 GATE:** PG-03 = NO-GO for custom native block inventory under BDS 1.26.63.1 without experiments. Owner Creative search and /give rejection show no registered probe. PG-04/05 BLOCKED. Owner subsequently confirmed successful LAB cleanup; temporary Git pack, launchers, mocks, tests and CI wiring have now been removed. Details: docs/BUNDLE1_PREPARATION_RESULTS.md. Older statements below are historical.

# Current Development State — Hart Logistics 2

**As of 2026-11-07**  
**Lifecycle:** owner-authorized Bundle 0 foundation complete (baseline import and LAB updater offline safeguards), plus ongoing planning; no Hart Logistics 2 gameplay feature implementation, LAB installation or release.

## Active source and project reality

- Repository: **partom24/HartLogistics2** only.
- **Only authorized server testing target:** disposable lab `C:\Servers\Thomas_MCBedrock - Copy (2)`. **Protected production:** `C:\Servers\Thomas_MCBedrock` — no edits until a release candidate is nominated; no execution of production updater before nomination; further owner approval required before production apply. [Deployment design](UPDATER_DEPLOYMENT_DESIGN.md).
- **Actual active source:** `addon/behavior_pack` and `addon/resource_pack`, containing the unmodified **72-file 1.4.1 source** imported under Git commit `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`; complete Git blob SHA-1 checks match original. Baseline [Bundle 0 results](BUNDLE0_RESULTS.md) and [registry](BASELINE_REGISTRY.md).
- Supplied reference: owner-uploaded Hart Logistics 1.4.1 mcaddon (see [baseline registry](BASELINE_REGISTRY.md)). HartBots 1.8.2 mcaddon was supplied for Depot comparison only; no HartBots repository access.
- The repo retains template engineering policies, structural validator in scripts/ and its tests in tests/. Template example achievements have been replaced in the project-specific handoff, roadmap, evidence and decision documents.
- Blueprint project describes HartLogistics2; owner separately authorized and completed **PG-01/PG-02 Bundle 0 foundation only**. This does **not** approve gameplay changes, in-game test probes, LAB installation or release.
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

## Bundle 0 results — completed at offline scope

**PG-01 GO:** All 72 original 1.4.1 BP/RP files imported with exact Git blob SHA-1 match; original SHA-256 recorded. **PG-02 GO (OFFLINE ONLY):** new HartLogistics LAB updater candidate and nine synthetic tests passed; actual Windows/LAB installation/stop checks remain untested and unapproved. See [Bundle 0 results](BUNDLE0_RESULTS.md).

**PG-03–PG-11 NOT RUN.** No source behavior, server paths, cheat/experiment settings, world data or production environment modified. Original HartBots production updater never executed.

## Next bounded action

Bundle 0 is complete at the scoped offline level. Owner decision is required before **Bundle 1 (PG-03–PG-05)** custom-inventory probe implementation and any subsequent LAB operation. Do not infer permission from the preliminary test plan or CI.


## Bundle 1 disposable probe preparation (2026-11-07)

Prepared a **test-only** `tests/bundle1_probe/behavior_pack` for PG-03–PG-05; it cannot run unless explicitly installed in a fresh disposable LAB world. The native slot check, move/restart test menu and static guard tests do **not** alter the actual `addon/` baseline. The temporary script is tagged/registered and must be removed with the entire probe pack and its registry entry promptly upon completion. **PG-03–PG-05 BDS results: NOT RUN.**

- Bundle 1 temporary probe additionally has mock-only offline Node simulations and a deterministic test-only packager. The generated `.mcpack` is **not a Hart Logistics release**. GitHub Actions artifact is temporary. All PG-03–PG-05 runtime gates remain NOT RUN until evidence from BDS.

- **Bundle 1 offline preparation evidence:** GitHub Actions run [42344178135](https://github.com/partom24/HartLogistics2/actions/runs/42344178135) passed structural validation, 12 temporary static probe checks, Node syntax, **11 mock-only transfer/restart/error scenarios**, and creation of a disposable `.mcpack` test artifact. **BDS PG-03/04/05 still NOT RUN.** The test-only BP is not a HartLogistics2 distributable release, and its temporary code/CI wiring must be deleted after the tests complete.

## Bundle 1 source delivery correction

Owner requires Git-tracked probe source delivered via guarded PowerShell LAB updates, not .mcpack artifacts. Removed ongoing artifact generation; the disposable pack source remains under tests/. A PowerShell installer does not yet exist and must be validated separately from the existing Python updater. PG-03/04/05 are NOT RUN, lab rig NOT READY, no world accessed.

## PowerShell LAB delivery ready for operator use (2026-11-07)

- The [temporary Git-source PowerShell installer](../tests/bundle1_probe/Update-HartLogistics-Bundle1Lab.ps1) is now implemented and has passed synthetic Windows PowerShell 5.1/7 execution checks, including exact registry recovery. Earlier records describing it as unimplemented are superseded. See [operator guide](BUNDLE1_POWERSHELL_LAB_GUIDE.md).
- This does **not** mean installation on the owner's LAB succeeded. PG-03/04/05 BDS behavior remains **NOT RUN** and the in-world manual rig remains NOT READY until world/anchor validation. No server operations performed here; temporary code remains tracked for prompt cleanup.

## Downloadable PowerShell launcher ready (2026-11-07)

The verified one-file [Git-backed PowerShell launcher](../tests/bundle1_probe/Start-HartLogistics-Bundle1Lab.ps1) is operator-ready. It fetches only the authorized project/branch to a local user checkout, delegates to the guarded source updater, defaults to a source-only plan and requires `-Apply` for LAB mutations. [Latest Windows CI 42377972891](https://github.com/partom24/HartLogistics2/actions/runs/42377972891) succeeded. Original BP/RP intact, no actual LAB touched, **PG03/04/05 NOT RUN**. See [exact usage](BUNDLE1_POWERSHELL_LAB_GUIDE.md).

## Owner-observed real LAB PowerShell deployment cycle (2026-11-07)

Owner-provided terminal transcript at source commit `cc7ffed1621c927ac52cd5de1bc28f88298ebcc4` showed **Plan, CheckLab, Install and Cleanup successful** on the exact allowed LAB-copy path and selected world `ThomasServer`. Installer claims restored registry/removed only temporary test BP. This is **actual Windows LAB updater smoke-test success**, beyond synthetic CI; **not** evidence of any BDS run. The probe was cleaned up, so it must be reinstalled before PG-03–PG-05. Confirm disposable LAB world and rig anchor first. [Detailed transcript interpretation](BUNDLE1_PREPARATION_RESULTS.md#2026-11-07--owner-observed-actual-windows-lab-updater-cycle).

## Clarification — known LAB world provenance, no duplicate owner question

The owner reconfirmed that \`C:\Servers\Thomas_MCBedrock - Copy (2)\worlds\ThomasServer\` is **the previously established clone of their past production world**. This was documented in the earlier server-boundary design and should not have been asked again. It is the intended LAB test copy, not a fresh empty disposable world. The PG-03–PG-05 rig should occupy a safely empty isolated location in this existing clone, with no world reset/deletion as standard cleanup. Only the exact anchor/clearance remains to be selected/validated. BDS PG-03–PG-05 remain NOT RUN.
