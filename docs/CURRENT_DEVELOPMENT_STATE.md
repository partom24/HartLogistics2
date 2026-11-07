# Current Development State — Hart Logistics 2

**As of 2026-11-07**  
**Lifecycle:** Bundle 0 source/offline safety GO; Bundle 1 custom MR endpoint NO-GO on current target; **Bundle 2 development underway (owner-reported)**. No new gameplay capability or release is accepted by this status document.

## Authority and preserved baseline

- **Only Git source:** `partom24/HartLogistics2`. Under `addon/`, original 1.4.1 BP/RP 72-file source remains byte-identical to imported baseline `0ea3000`, with pack identities and saved-state contracts protected; see [baseline registry](BASELINE_REGISTRY.md).
- **LAB-only test target:** `C:\Servers\Thomas_MCBedrock - Copy (2)`. **PRODUCTION** `C:\Servers\Thomas_MCBedrock` must not be modified or used for tests; the production updater may not even be dry-run before RC nomination, and production apply needs separate approval.
- Requirements remain: no 1.4.1 feature, route, metadata, item, link, journal or world-state loss; Q4→Q5 cutover safety and no unapproved experiment/cheat flags.

## Evidence, limitations, current blockers

- **PG-01 GO:** exact original import. **PG-02 GO at offline/synthetic scope only:** nine LAB-updater safety tests; no inference of deployed update safety. See [Bundle 0 results](BUNDLE0_RESULTS.md).
- **Bundle 1 prep only:** CI [42344178135](https://github.com/partom24/HartLogistics2/actions/runs/42344178135) passed 12 Python static probe checks, JavaScript syntax and 11 Node mock cases. Mock PASS is **not BDS capability evidence**.
- **Bundle 1 owner-run LAB attempt:** after guarded PowerShell probe installation, Creative inventory did not show `hlprobe:mr_container` and Bedrock rejected `/give @s hlprobe:mr_container 2`. For the owner's **BDS 1.26.63.1 / nonexperimental** configuration, **PG-03 = NO-GO; PG-04/05 = BLOCKED / NOT RUN**. No MR transfer, persistence or menu behavior was measured. Experimental support in Bedrock release documentation is consistent with the compatibility finding, but the command failure alone is not definitive engine-root-cause proof. [Details](BUNDLE1_PREPARATION_RESULTS.md).
- **LAB cleanup owner-reported complete:** `Start-HartLogistics-Bundle1Lab.ps1 -Mode Cleanup -Apply -ConfirmProbeCleared` returned `CLEANED: original world registration restored; only owned temporary probe removed.` **Repository cleanup still due:** temporary `tests/bundle1_probe` code/tests/wiring and `project-blueprint.json.temporary_instrumentation` remain present at this documentation checkpoint. Do not mark full task closeout until removed and verified.
- **MR direction:** Preserve the desired persistent exact-ItemStack custody in future Collectors/Receivers; the selected **custom-block native container mechanism** is blocked for this target. Continue preserving working 1.4.1 MR fallback behavior until an alternate **proven** lossless mechanism safely supersedes it. Vanilla-container-backed storage or a later version are **feasibility candidates only**, not an authorized implementation or proven crash-safe design. See [ADR](ARCHITECTURE_DECISIONS.md) and [inbox](IDEA_INBOX.md).
- **Bundle 2:** owner says already in development. Its implementation/tests were not independently verified in this docs correction, and this record does not restart it. Dependent PG-06 native storage and PG-07/08 integrated claims remain gated by proven custody; unrelated authorized work can continue. Migration freeze, optional pack-owned ticking areas and link UI retain separate applicable requirements/evidence.

## Next safe actions

1. Complete **Git-side Bundle 1 temporary-instrumentation cleanup** and structural/release-gate checks, without editing the original 1.4.1 source or disrupting Bundle 2.
2. Continue already authorized Bundle 2 work and document its actual source/test proof separately; do not count blocked custom-container gates as completed.
3. Evaluate a stable no-experiments MR endpoint independently for metadata integrity, backpressure, save/restart/unload, cross-chunk transaction safety and existing-world upgrades before selecting a replacement architecture.

Dated evidence: [development ledger](DEV_LEDGER.md), [engineering register](ENGINEERING_EVIDENCE_REGISTER.md); outcome milestones: [roadmap](ROADMAP.md).
