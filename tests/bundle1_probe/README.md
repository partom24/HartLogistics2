# Disposable PG-03–PG-05 Bedrock native-container probe

**Status: PREPARED OFFLINE, BDS NOT RUN. Test rig NOT READY until LAB world identifier, pack installation and safe anchor are verified.** This temporary behavior pack remains under tests/ and NEVER modifies the real 1.4.1 \`addon/\` source. \`TEMP_TEST:PG03-05\` is registered in project-blueprint.json; delete this pack/script/recipe and registry entry immediately after this task completes.

**What is being tested:** New custom block native inventories under vanilla non-experimental dedicated server **1.26.63.1/client 26.63**, native \`moveItem\`/\`transferItem\` metadata preservation and blocked destination, persistent native slots and menu coexistence.

**Why now:** These are Q5 feasibility gates; owner-reported ordinary chest→chest native moves are reused and not repeated.

**User action required:** None yet. **NOT READY** until a fresh disposable LAB world inside \`C:\Servers\Thomas_MCBedrock - Copy (2)\` and its exact test anchor are established. Do not use production; do not toggle experiments or cheats.

**Pass condition:** PG03 native slots exist; PG04 exact MR name+lore, identity and counts survive both native methods and a blocked target; PG05 item survives true restart, without duplicated contents and with menu accessible.

## Proposed complete rig geometry (subject to world validation)

In a **fresh clean disposable Overworld LAB world**, choose and record an empty anchor \`(X,Y,Z)\`. **Exactly 4 blocks, one horizontal X row**:

| Relative X | Exact coordinate | Block | Inventory | Facing |
| --- | --- | --- | --- | --- |
| -1 | (X-1,Y,Z) | One normal single Chest | All 27 slots empty | Any |
|  0 | (X,Y,Z) | TEMP \`hlprobe:mr_container\` A | 9 slots empty | Any; interact here |
| +1 | (X+1,Y,Z) | TEMP \`hlprobe:mr_container\` B | 9 slots empty | Any |
| +2 | (X+2,Y,Z) | One normal single Chest | All 27 slots empty | Any |

**Block counts:** 2 probes, 2 chests; **0 Sorters (Sorter column height 0)**, 0 Collectors, 0 Receivers, 0 Hoppers, 0 Bulk Storage, 0 Transporters, 0 redstone components, 0 item frames. No Hopper directions, links or redstone. **No special inter-rig separation required** in the proposed dedicated clean LAB world; the script inspects/edits only the four coordinates above, never searches or moves items outside them. If the selected world is not clean, this clearance assumption must be revalidated BEFORE setup. Air accessible above the line for interaction.

Craft **two temporary probes from one dirt** using the test pack's shapeless recipe; no cheat/game-mode change required for this recipe. Craft two vanilla chests normally. If recipe/block doesn't exist without experimental toggles, PG03 is NO-GO; don't turn experiments on to force a result.

### Owner's 3 checks in one reusable rig

1. **PG03:** Standing-interact with probe A (not sneaking) and select **Check slots**. Require message \`[PG03 PASS]\`; if native GUI swallows scripted form, record menu conflict, not a pass.
2. **PG04:** With all four inventories empty, select **Native moves**. Script constructs one iron sword with distinctive \`nameTag\` and \`lore\`, moves native chest→custom→custom→chest and \`transferItem\` back, checks all slots and a full nine-slot destination. On success it removes only its known test filler; leaves sword in probe A for persistence. If error, **stop: do not destroy filled blocks**.
3. **PG05:** Select **Arm restart**; stop/restart disposable LAB BDS using the approved operator procedure, return to probe A, select **Verify after restart**. In-memory boot marker prevents same-session verification. Capture messages/log, version, exact anchor, experiment flags and whether native inventory GUI and form collide.

**Cleanup:** Remove/discard this dedicated disposable LAB world and temporary pack after the test; do not break a filled custom block without safe item-handling. Delete the temporary script/manifest/block/recipe from Git and \`temporary_instrumentation\` entry **as soon as PG03–05 conclude**, while keeping permanent offline tests and evidence. Do not silently leave a probe deployed. No server files or commands were accessed/executed by creating this plan.
