# PG-14 LAB one-cobblestone custody proof — owner test card

**Status: offline candidate only until CI and owner expressly authorize a LAB install. No game installation, server access or inventory movement was performed by development tooling.**

## Exact purpose

PG-13 **passed** two checksummed marker writes across a **normal** BDS 1.26.63.1 stop/restart. PG-14 adds the next non-generalized prerequisite: whether the stable Bedrock vanilla Container.moveItem API can move **exactly one operator-supplied ordinary cobblestone** between **two disposable isolated single chests** in the owner-designated LAB hall, with source/destination slot readback and a world dynamic-property receipt visible after a **normal** restart.

No Bulk Storage or Transporter blocks are introduced. This does **not** establish a power-loss atomic commit, safe production transfers, scalable virtual storage, native metadata-rich MR, cross-chunk route election or Q5 migration. There is no built-in actual-world item duplication recovery: an interrupted physical move stays **HOLD_AMBIGUOUS_HANDOFF** and must not be re-issued.

## Install boundary and parentage

- Candidate **Hart Logistics 1.5.3-LAB-PG14**, derived from protected original 1.4.1 → accepted PG-08 1.5.1 → owner-confirmed PG-13 1.5.2. All original 72 source files remain unchanged; PG-08 menus and PG-13 shadow commands remain, and existing Q4/item logistics behavior is unchanged.
- Exactly previous **1.5.2-LAB-PG13** compiled BP and RP files are required by SHA-256 before guarded pack replacement. Both Hart Logistics pack UUIDs unchanged. Other mod registrations, JSONC comments and world saves preserved; transaction backup created. Retain prior PG08 backup lab-5af88e18cff3 and the earlier PG13 backup tag (not yet reported to developer).
- Production C:\Servers\Thomas_MCBedrock strictly forbidden. Authorized LAB only C:\Servers\Thomas_MCBedrock - Copy (2), world ThomasServer. Installer never changes allow-cheats or experiments, and does not start/stop BDS.
- Git-backed launcher at candidates/pg14/Start-HartLogistics-PG14Lab.ps1 with Plan, CheckLab, Install -Apply and matching exact-tag Rollback. Explicit owner approval needed before real Install.

## Physical rig (only after successful LAB installation)

Keep existing three Hart Collector/Receiver blocks and wooden PG-08 marker intact. Use the **same LAB stonebrick hall**, with floor surface Y=69 and operator near (-953, 69, -800).

| Test-owned block | Exact block coordinates | Inventory |
| --- | --- | --- |
| **Chest A — source** | (-955, 69, -804) | Exactly **1 regular minecraft:cobblestone in chest slot 0**, all other 26 slots EMPTY |
| **Chest B — destination** | (-951, 69, -804) | All 27 slots EMPTY |

Place both as **two separated single vanilla minecraft:chest blocks**, four blocks apart with open sides and tops. Space below must be solid and non-automating. **No Hoppers, droppers, dispensers, item-transport pipes, redstone, Sorters or automation adjacent.** If either coordinate is occupied, do not break/replace it; stop and report. No commands granting items, no changing cheats or experiments. Use a disposable test-owned single cobblestone and two chests; no valuable items.

## Exactly four bounded actions

1. From inside the room type:

       /hartlogistics:custodyinspect

   Expected **INSPECT PASS**; no changes. If refused, inspect rig conditions manually; do not run transfer.
2. Once and only once, type:

       /hartlogistics:custodytransfer

   Expected **TRANSFER READBACK PASS**. This action writes two PG14-only reservation/intent keys, invokes exactly **one** native Container.moveItem(0, 0, destination), and re-reads all 27 slots in both chests. Source should now be empty; destination slot 0 should hold the same single cobblestone. Script never creates, clones or destroys an ItemStack. If unexpected item, partial readback or HOLD appears, **stop**. Do not retry, move items manually, clear keys or use server restart as a repair; provide screenshot and errors.
3. After successful transfer, stop **LAB BDS only** normally and restart. Rejoin room and type:

       /hartlogistics:custodystatus

   Expected **RESTART CUSTODY READBACK PASS: journal SETTLED and chest A empty / chest B exactly 1 cobblestone. No replay.** Capture screenshot. This proves only normal-restart receipt + physical slot readback, not hard-crash atomicity.
4. After screenshot, manually take the test cobblestone from Chest B, leaving **both chests completely empty**, then type:

       /hartlogistics:custodyclear

   Expected **CLEAN PASS**. Only two PG14 test properties cleared; PG13 markers, other Hart data and existing Q4 unchanged. Remove the two test-owned empty chests only if desired; leave all old Hart blocks alone.

## Stop/preserve evidence when unexpected state appears

- HOLD_AMBIGUOUS_HANDOFF, HOLD_RESERVED, HOLD_BAD_PROGRESS, chest not loaded, unknown item, inventory mismatch, script exception, unknown command or live source/destination content change are **not reasons to retry**. Keep both chests and journal markers and provide BDS script errors and the exact observed slots.
- PG-13 /hartlogistics:shadowclear should be completed *before* the new test if it was not already run, but PG-14 does not clear PG-13 markers.
- A screen saying SETTLED alone is **not** crash-atomic custody evidence. The test's acceptance is strictly **one clean restart** with saved journal + physical slots. Power loss, process kill, split regions, unloads, concurrent players, metadata-rich MR and 200,000-count Bulk banks remain separate gates.
