# Disposable PG-03–PG-05 Bedrock native-container probe

**Status: PREPARED OFFLINE, BDS NOT RUN. Test rig NOT READY until LAB world identifier, pack installation and safe anchor are verified.** This temporary behavior pack remains under tests/ and NEVER modifies the real 1.4.1 \`addon/\` source. \`TEMP_TEST:PG03-05\` is registered in project-blueprint.json; delete this pack/script/recipe and registry entry immediately after this task completes.

**What is being tested:** New custom block native inventories under vanilla non-experimental dedicated server **1.26.63.1/client 26.63**, native \`moveItem\`/\`transferItem\` metadata preservation and blocked destination, persistent native slots and menu coexistence.

**Why now:** These are Q5 feasibility gates; owner-reported ordinary chest→chest native moves are reused and not repeated.

**User action required:** No new world or server clone is needed. **Owner-established environment:** LAB at \`C:\Servers\Thomas_MCBedrock - Copy (2)\` uses \`worlds\ThomasServer\`, a **clone of the owner's prior production world**, not a fresh empty world. **NOT READY only for a specific isolated test anchor XYZ and current world/pack validation**. Never reset/delete this existing clone merely to execute PG-03–PG-05; do not modify production, cheats or experiments.

**Pass condition:** PG03 native slots exist; PG04 exact MR name+lore, identity and counts survive both native methods and a blocked target; PG05 item survives true restart, without duplicated contents and with menu accessible.

## Owner correction: Git source and PowerShell LAB update

The exact temporary probe source is already tracked under tests/bundle1_probe/behavior_pack in the authorized HartLogistics2 Git repository. The earlier .mcpack artifact was an unnecessary alternate delivery channel; CI no longer builds or uploads it. Do not manually download or import an .mcpack.

Required delivery is a guarded PowerShell update process using an exact pinned, clean Git checkout. Once implemented and separately authorized, it should stage only the independent disposable probe behavior-pack files into the exact LAB root, verify file hashes, safely register and later unregister only the probe in a disposable LAB world, and preserve all original 1.4.1 BP/RP identities and unrelated packs. It must fail closed for wrong Git origins, unapproved paths, running BDS, unexpected world configuration, or symlink/junction paths. No experiments or cheats are to be changed.

**Current status:** Bundle 0 implemented a Python LAB updater for the original BP/RP; no equivalent PowerShell test-probe installer has been built or Windows-tested yet. It is not safe to treat that Python updater or the historic CI artifact as deployment approval. Do not access either server to improvise the missing workflow. PG-03/04/05 remain NOT RUN and the manual rig remains NOT READY.

## Proposed complete rig geometry (subject to world validation)

In the **existing production-derived LAB clone** (world name \`ThomasServer\`), choose and record an **unoccupied, isolated Overworld location** with an empty four-block horizontal X line at anchor \`(X,Y,Z)\`. **Exactly 4 blocks in that line**, with no removal or overwrite of existing blocks:

| Relative X | Exact coordinate | Block | Inventory | Facing |
| --- | --- | --- | --- | --- |
| -1 | (X-1,Y,Z) | One normal single Chest | All 27 slots empty | Any |
|  0 | (X,Y,Z) | TEMP \`hlprobe:mr_container\` A | 9 slots empty | Any; interact here |
| +1 | (X+1,Y,Z) | TEMP \`hlprobe:mr_container\` B | 9 slots empty | Any |
| +2 | (X+2,Y,Z) | One normal single Chest | All 27 slots empty | Any |

**Block counts:** 2 probes, 2 chests; **0 Sorters (Sorter column height 0)**, 0 Collectors, 0 Receivers, 0 Hoppers, 0 Bulk Storage, 0 Transporters, 0 redstone components, 0 item frames. No Hopper directions, links or redstone. **Existing-world isolation required:** Keep the four-block rig away from existing sorters/collectors/receivers, storage, linked chests, hoppers, redstone, farms, and players' valuable structures; avoid any adjacent ordinary inventory or connected mechanism outside the two specified empty chests. No specific metre/chunk separation can be responsibly certified without the chosen XYZ; **anchor and clearance must be checked before marking READY**. The script inspects/edits only the four defined coordinates, never searches/moves items outside them. Air accessible above the line for interaction.

Craft **two temporary probes from one dirt** using the test pack's shapeless recipe; no cheat/game-mode change required for this recipe. Craft two vanilla chests normally. If recipe/block doesn't exist without experimental toggles, PG03 is NO-GO; don't turn experiments on to force a result.

### Owner's 3 checks in one reusable rig

1. **PG03:** Standing-interact with probe A (not sneaking) and select **Check slots**. Require message \`[PG03 PASS]\`; if native GUI swallows scripted form, record menu conflict, not a pass.
2. **PG04:** With all four inventories empty, select **Native moves**. Script constructs one iron sword with distinctive \`nameTag\` and \`lore\`, moves native chest→custom→custom→chest and \`transferItem\` back, checks all slots and a full nine-slot destination. On success it removes only its known test filler; leaves sword in probe A for persistence. If error, **stop: do not destroy filled blocks**.
3. **PG05:** Select **Arm restart**; stop/restart disposable LAB BDS using the approved operator procedure, return to probe A, select **Verify after restart**. In-memory boot marker prevents same-session verification. Capture messages/log, version, exact anchor, experiment flags and whether native inventory GUI and form collide.

**Cleanup:** **Preserve the existing production-derived LAB clone. Do not reset/delete it as routine cleanup.** Once the last test completes, first verify and safely empty the two native probe inventories and both test chests, then remove **only the four placed test blocks** in the isolated location. If the probe contents cannot be confirmed safe, **stop instead of breaking or uninstalling the pack**. After confirming the test blocks are gone and the LAB BDS is stopped, use the PowerShell launcher cleanup for only the temporary pack/registry/lease. Do not break a filled custom block without safe item-handling. Delete the temporary script/manifest/block/recipe from Git and \`temporary_instrumentation\` entry **as soon as PG03–05 conclude**, while keeping permanent offline tests and evidence. Do not silently leave a probe deployed. No server files or commands were accessed/executed by creating this plan.

**Cleanup clarification:** `tests/test_bundle1_probe.py`, `tests/bundle1_probe/offline_sim.cjs`, and their CI steps are **also temporary**, not permanent regression tests. Delete them with the probe pack when PG-03–PG-05 close. Only keep evidence and genuinely independent permanent tests.

## PowerShell Git-source installer — delivered

A [temporary Git-source installer](Update-HartLogistics-Bundle1Lab.ps1) now exists and passed Windows PowerShell 5.1 and PowerShell 7 **synthetic tests**. It supports source-only Plan, Git Sync, read-only CheckLab, and guarded Install/Cleanup into the sole LAB root. Earlier statements saying it was not yet implemented are superseded. See [full operator guide](../../docs/BUNDLE1_POWERSHELL_LAB_GUIDE.md). **The real BDS compatibility checks remain NOT RUN and the manual rig NOT READY.** Remove this temporary installer, BP and synthetic test harnesses immediately on task completion.

## Simplified operator download

For a single downloadable Windows `.ps1` instead of manual `git clone`, use the [temporary bootstrap launcher](Start-HartLogistics-Bundle1Lab.ps1). It obtains this exact source from Git, then calls the guarded source updater. [Exact commands and prerequisites](../../docs/BUNDLE1_POWERSHELL_LAB_GUIDE.md). The launcher is temporary tracked instrumentation; no game packs or binaries are embedded.
