# Bundle 1 — Native Custom-Container Probe: Preparation and Offline Evidence

**Prepared 2026-11-07. BDS PG-03, PG-04, PG-05 are NOT RUN and not accepted.** No original 1.4.1 BP/RP file changed and no server/world was accessed. The test-only script is tagged `TEMP_TEST:PG03-05` and registered while active.

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

**Temporary packaged artifact:** [View run and download `TEMP-HartLogistics-PG03-05-LAB-ONLY`](https://github.com/partom24/HartLogistics2/actions/runs/42344178135). GitHub downloads a ZIP containing `HartLogistics_PG03-05_DISPOSABLE_LAB_ONLY.mcpack`. Artifact ID `13563080206`, expires **2026-11-14 UTC**. Its contents are for the **disposable LAB only**, not the real addon. Git source: [probe README](../tests/bundle1_probe/README.md).

## Actual BDS gates — unresolved

| Gate | Real BDS proof required | Verdict |
| --- | --- | --- |
| **PG-03** | Block with native nine-slot container loads and exposes `minecraft:inventory` under the approved settings | **NOT RUN** |
| **PG-04** | Name+lore MR stack survives ordinary→custom→custom→ordinary→custom native transfers; full target does not erase custody | **NOT RUN** |
| **PG-05** | Persisted native MR survives actual restart and scripted menu opens reliably without unintended container GUI | **NOT RUN** |

**Manual LAB rig:** [test-only rig card](../tests/bundle1_probe/README.md) specifies exactly **2 probe blocks and 2 single Chests**, no Sorters/Hoppers/redstone, X-1/X/X+1/X+2 positions, expected outcomes and cleanup. **NOT READY** until the exact disposable LAB world and safe anchor are verified. Never ask the owner to improvise missing spacing, links or sorter height.

**Critical compatibility risk:** Minecraft 1.26.50 introduced custom block container support in its experimental updates, and it was not confirmed in non-experimental BDS 26.63. If PG-03 fails, stop dependent probes; do not enable experiments automatically. [Microsoft release notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.50).

## Temporary-test lifecycle and authority

All probe sources, recipe, special block, Python static tests, Node mocks, packager, CI steps, generated artifact and `project-blueprint.json.temporary_instrumentation` entry are **temporary**. Delete their repo/runtime wiring **immediately once PG-03–PG-05 are completed or abandoned**, retain only this results document and supported permanent quality tests. Before task acceptance verify normal repository and actual pack behavior without probes. Run release-gate validation only after removing them. No auto deployment, experiments, cheats, production edits or original HartBots updater invocation.

**Next dependency:** Real BDS runtime access, a validated clean disposable LAB world/anchor and one fully READY rig. The automation performed here does not prove any custom-container behavior on the owner's server.
