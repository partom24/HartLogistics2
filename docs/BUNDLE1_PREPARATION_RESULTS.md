# Bundle 1 — Native Custom-Container Probe: Preparation and Offline Evidence

**Prepared 2026-11-07 (historical offline snapshot).** At preparation time PG-03/04/05 were NOT RUN in BDS; no server/world was accessed. The original 1.4.1 BP/RP source was untouched and temporary instrumentation registered.

**Bundle 1 disposition, 2026-11-07: NO-GO for the owner's nonexperimental BDS 1.26.63.1 configuration.** In the later disposable LAB attempt the guarded PowerShell installer reported probe pack registration, but the owner could not find `hlprobe:mr_container` in Creative inventory and Bedrock rejected `/give @s hlprobe:mr_container 2`. A usable native custom-container endpoint was therefore not established. **PG-03 = NO-GO; PG-04/05 = BLOCKED / NOT RUN.** The earlier offline passes did not validate runtime behavior; no MR item fidelity, restart or menu trial took place. Custom block container availability was documented as experimental in 1.26.50; lack of the endpoint is consistent with the current no-experiments limitation, but the observed error by itself does not prove the exact engine cause. Do not enable experiments or cheats to force the probe.

**Owner-reported LAB cleanup completed:** `Start-HartLogistics-Bundle1Lab.ps1 -Mode Cleanup -Apply -ConfirmProbeCleared` returned `CLEANED: original world registration restored; only owned temporary probe removed.` This reports restoration of the original LAB registration and owned probe cleanup—not an independent world audit or Git source cleanup.

## Purpose

Determine whether **server 1.26.63.1 / client v26.63** under the owner's approved non-experimental world settings exposes a custom block's native `minecraft:block_entity.container` as a normal `Container`, permits native `moveItem` and `transferItem` with metadata fidelity, persists through a real restart, and allows a scripted ActionFormData menu instead of a competing native GUI.

**Previously accepted:** Owner-reported vanilla-to-vanilla Container ItemStack transfer capability, unchanged original 1.4.1 source. No exhaustive arbitrary item suite is proposed.

## Completed offline checks (not BDS evidence)

| Scope | Result | What it actually establishes |
| --- | --- | --- |
| GitHub structural validation | **PASS** | Repository/template structure and tracked temporary instrumentation are consistent |
| 12 Python probe-contract tests | **12/12 PASS** | Test manifest, stable dependencies, probe JSON, no original identifiers/commands, native APIs wired, blocked handling present, restart logic and temp registration |
| Node.js syntax check | **PASS** | Probe script parses as JavaScript |
| 11 Node mock scenarios | **11/11 PASS** | Under simulated containers, checks transfers, full target variants (source retained/remainder returned/throw), detection of metadata corruption, source deletion, missing inventory, incorrect rig, nonempty source, cancellation, restart marker gating |
| Test-only packager | **PASS** | Deterministic `.mcpack` built with four exact pack files and no original add-on runtime files |

**Full CI run:** [42344178135](https://github.com/partom24/HartLogistics2/actions/runs/42344178135), completed successful. Other regression tests also passed (37 template and 9 LAB-updater offline tests), but do not count as BDS MR acceptance.

**Delivery corrected:** Use Git-tracked source under [tests/bundle1_probe/behavior_pack](../tests/bundle1_probe/behavior_pack), not the separately packaged .mcpack. Earlier CI run 42344178135 did build historical artifact 13563080206, but the packaging/upload steps and packager have now been retired. At this earlier preparation checkpoint the guarded PowerShell source-to-LAB installer was not yet implemented or Windows-tested; it was subsequently used by the owner as described in the disposition above. Bundle 0's Python installer handles original BP/RP, not this independent test pack. Do not use the archived `.mcpack` artifact.

## Actual BDS gates — final target-runtime disposition

| Gate | Real BDS proof required | Verdict |
| --- | --- | --- |
| **PG-03** | Block with native nine-slot container loads and exposes `minecraft:inventory` under the approved settings | **NO-GO:** test block not recognized/obtainable in LAB |
| **PG-04** | Name+lore MR stack survives ordinary→custom→custom→ordinary→custom native transfers; full target does not erase custody | **BLOCKED / NOT RUN:** no PG-03 endpoint |
| **PG-05** | Persisted native MR survives actual restart and scripted menu opens reliably without unintended container GUI | **BLOCKED / NOT RUN:** no PG-03 endpoint |

**Manual LAB rig:** [test-only rig card](../tests/bundle1_probe/README.md) specifies exactly **2 probe blocks and 2 single Chests**, no Sorters/Hoppers/redstone, X-1/X/X+1/X+2 positions, expected outcomes and cleanup. **Not constructed** because the probe block was unavailable; this was not an MR transfer or restart trial. Never ask the owner to improvise missing spacing, links or sorter height.

**Compatibility finding:** Minecraft 1.26.50 described custom block containers under experimental updates. In this no-experiments 1.26.63.1 LAB attempt, the endpoint could not be obtained. This does not disprove ordinary vanilla `Container` transfers or prove an MR ItemStack lost metadata. Do not enable experiments automatically. [Microsoft release notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.50).

## Temporary-test lifecycle and authority

All probe sources, recipe, special block, Python static tests, Node mocks, packager, CI steps, generated artifact and `project-blueprint.json.temporary_instrumentation` entry are **temporary**. Delete their repo/runtime wiring **immediately once PG-03–PG-05 are completed or abandoned**, retain only this results document and supported permanent quality tests. Before task acceptance verify normal repository and actual pack behavior without probes. Run release-gate validation only after removing them. No auto deployment, experiments, cheats, production edits or original HartBots updater invocation.

**Open closeout:** Remove temporary probe source, tests, CI wiring and the `project-blueprint.json.temporary_instrumentation` registration from Git, then validate the normal repository and release gate; the owner's LAB cleanup does not by itself meet source-cleanup requirements. MR custody requires a newly proved compatible endpoint. Bundle 2 is already under development according to the owner and is not automatically canceled, restarted or redirected by this Bundle 1 NO-GO.
