# Bundle 1 — Native Custom-Container Probe: Preparation and Offline Evidence

**LATEST STATUS (2026-11-07): PG-03 NO-GO on target no-experiments 1.26.63.1; PG-04/05 BLOCKED/NOT EXECUTED. Earlier preparation statuses below are superseded.** No original 1.4.1 BP/RP file changed and no server/world was accessed. The test-only script is tagged `TEMP_TEST:PG03-05` and registered while active.

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

**Delivery corrected:** Use Git-tracked source under [tests/bundle1_probe/behavior_pack](../tests/bundle1_probe/behavior_pack), not the separately packaged .mcpack. Earlier CI run 42344178135 did build historical artifact 13563080206, but the packaging/upload steps and packager have now been retired. The intended guarded PowerShell source-to-LAB installer is **not implemented or Windows-tested yet**; Bundle 0's Python installer operates on the original BP/RP, not this independent test pack. Do not use the archived artifact as the installation route.

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

## Updated 2026-11-07 — PowerShell workflow delivered

The earlier entry saying the PowerShell updater was missing is **superseded**. The [Git-tracked updater](../tests/bundle1_probe/Update-HartLogistics-Bundle1Lab.ps1) has Plan, Sync, CheckLab, Install and Cleanup. [Windows CI 42377591621](https://github.com/partom24/HartLogistics2/actions/runs/42377591621) passed **48 synthetic assertions each** on Windows PowerShell 5.1 and PowerShell 7 (96 assertions across both executions), plus structural checks. It tested source staging, world pack registration, exact SHA-256 and byte-restoring cleanup, JSONC variants, overwrite refusal and fail-closed third-party edits.

Use [operator instructions](BUNDLE1_POWERSHELL_LAB_GUIDE.md) for Git clone, safe preview, explicit install and cleanup. **No actual BDS LAB run occurred; PG-03/04/05 still NOT RUN**. The retired `.mcpack` archive should not be used.

## One-file PowerShell launcher available (2026-11-07)

The owner-facing [standalone PowerShell launcher](../tests/bundle1_probe/Start-HartLogistics-Bundle1Lab.ps1) downloads **source by Git**, not a separately packaged `.mcpack`, and delegates to the guarded Windows-tested updater. Its actual repo blob SHA-1 was verified against the distributed file (`abe4dec65eeabcff911ca7833ad126716a02fcb2`). Default mode only clones/updates a **local Git checkout** and previews the plan; CheckLab is read only; Install and Cleanup demand explicit `-Apply`. The launcher/parser/guard job and both PowerShell synthetic suites succeeded in [CI 42377972891](https://github.com/partom24/HartLogistics2/actions/runs/42377972891). **Actual Windows LAB BDS tests remain NOT RUN**. See [operator guide](BUNDLE1_POWERSHELL_LAB_GUIDE.md).

## 2026-11-07 — Owner-observed actual Windows LAB updater cycle

**Source of evidence:** Owner-provided PowerShell transcript, not an independent filesystem audit or Bedrock runtime log. Executed from `PS C:\HartMods>` using `Start-HartLogistics-Bundle1Lab.ps1` with Git commit `cc7ffed1621c927ac52cd5de1bc28f88298ebcc4`.

| Operation | Owner-observed output | Gate |
| --- | --- | --- |
| `Plan` default | Source-only plan, exact pinned Git checkout `C:\Users\Administrator\AppData\Local\HartLogistics2-PG03-05` | **PASS — observed** |
| `CheckLab` | Read-only preflight selected `C:\Servers\Thomas_MCBedrock - Copy (2)\worlds\ThomasServer`; probe registration was False | **PASS — observed** |
| `Install -Apply` | Installed source at `C:\Servers\Thomas_MCBedrock - Copy (2)\behavior_packs\_HartLogistics_PG03-05_TEMP_ONLY`; lease at `C:\Servers\Thomas_MCBedrock - Copy (2)\_HartLogistics_PG03-05_TEMP_LEASE` | **PASS — normal install path observed** |
| `Cleanup -Apply -ConfirmProbeCleared` | Reported original world-registration bytes restored and only owned temporary probe removed | **PASS — normal cleanup path observed** |

**Meaning:** Git-backed PowerShell launcher worked on the owner's Windows machine against the **approved LAB-copy path** for one normal install/cleanup cycle. This upgrades the updater's deployment evidence beyond CI's synthetic tests. It **does not** prove interrupted-install recovery on the actual machine, BDS pack loading, native custom-block support, script UI coexistence, or the actual item-transfer/persistence gates. The selected world is named `ThomasServer` inside the LAB copy; **confirm it is safe/disposable before any in-world test or world reset**. No evidence says the production root was accessed. **After Cleanup the temporary probe is not installed**, so the next BDS session requires another explicit `Install -Apply` while LAB BDS is stopped.

**Verdicts:** PowerShell source updater normal LAB cycle **GO (observed scope only)**; **PG-03/PG-04/PG-05 = NOT RUN**. Temporary code remains ACTIVE for named follow-up BDS tests; the user-provided cleanup removed the LAB deployment, **not** the test source and instrumentation registry in Git (still needed for PG-03–PG-05). Maintain prompt cleanup when those tests conclude.


## PG-03 target-runtime NO-GO, 2026-11-07

The owner installed the standalone test behavior pack into the approved cloned LAB world and supplied screenshots: Creative search did not show the probe; Minecraft rejected the exact /give @s hlprobe:mr_container 2 command with an unexpected-identifier syntax error. Therefore the block was not registered/available to the player. No probe block was placed; PG-04 transfer and PG-05 restart tests could not be conducted. The screenshots alone cannot prove the exact parser error or exclude other pack-loading issues.

**Official platform version gate:** Minecraft Bedrock 1.26.50 creator notes place the *container field* of minecraft:block_entity in Experimental Technical Updates, even though the base minecraft:block_entity component itself is stable. The Minecraft Beta/Preview 26.70.23 release notes dated November 3, 2026 only then announce that the container field was released from experimental and custom BlockInventoryComponent became non-experimental. The 26.70.23 change is in Preview, **not evidence of stable availability in the owner's current BDS 1.26.63.1.**

Sources:
- https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.50?view=minecraft-bedrock-stable
- https://feedback.minecraft.net/hc/en-us/articles/50103892132365-Minecraft-Beta-Preview-26-70-23

**Decision:** PG-03 = NO-GO for the current 1.26.63.1/26.63 **no-experiments** configuration. PG-04 and PG-05 = BLOCKED / NOT EXECUTED, not failed MR transfers. Do not require the owner to keep trying identifiers, enable cheats or Upcoming Creator Features, build the four-block rig, upgrade server/client version without separate approval, or implement custom native MR slots on this target. Preserve original Hart Logistics 1.4.1 native ItemStack/direct MR fallback and Q4 custody. Investigate a separately approved supported lossless approach or an owner-approved future stable runtime version; experimental behavior cannot be silently introduced.

**Cleanup dependency:** The owner's last transcript reported a fresh -Mode Install -Apply, and there was no subsequent successful Cleanup. Assume the disposable test BP and deployment lease are STILL installed. Because no probe block was obtained in the observed session, it can be unregistered after stopping LAB and confirming no probe item/block was created elsewhere. Use the existing verified one-file PowerShell launcher: -Mode Cleanup -Apply -ConfirmProbeCleared. Preserve source and temporary instrumentation in Git **until the owner confirms LAB cleanup**, since removing the Git installer prematurely would prevent safe source-backed cleanup. Upon confirmation, promptly delete the temporary probe source, launchers, mocks, tests, CI steps, and blueprint temporary_instrumentation registrations, retaining this failure evidence. Never touch the protected production server or discard the cloned LAB world.
