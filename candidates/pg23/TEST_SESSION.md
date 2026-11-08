# PG-23 — Native Hopper Compaction LAB Test Card (READY after green CI and exact PG20 preflight)

**What is being tested:** The native five-slot Hopper above a Hart Sorter must pack a metadata-rich item from a later occupied slot into the earliest empty slot **without creating any duplicate or flattened item**. This is the new PG23 intra-Hopper path, not the already accepted Collector→Receiver MR bypass.

**Why now:** Protected 1.4.1 and deployed PG20 source contain an **un-journaled pair of `Container.setItem` writes** for source-Hopper compaction: write a clone into the earlier slot, then clear the old slot. A crash/error between the two calls has a possible duplicate state. PG23 replaces that with one stable API `Container.moveItem(read, write, sameContainer)` plus conservative opaque physical intent and HOLD. These are **source-level conditional hazards**, not a reported real item duplicate. The physical journal is not save-atomic with inventory.

**Prior evidence reused:** HL-E-052 PG20 one-book Protection I Collector→Receiver transfer and normal restart; HL-E-058 mixed 256+book routing and normal restart; HL-E-057 favorable earlier-save player rollback after a forced kill. PG08 UI, PG13 cleanup, PG14 chest native move and PG15 controlled cuts are reused. **Do NOT repeat them, test another hard kill, or re-run completed PG13 commands.**

**Owner action:** After automated builder, fault tests and LAB installer tests are green, one **guarded PG20 1.5.5→PG23 1.5.6 LAB installation**, then **two narrow manual checks with one isolated Sorter/Hopper test pair**. No production, cheats, experiments, world reset or extra instrumentation.

**Pass condition:** A single disposable Protection I book originally placed in Hopper slot 4 is relocated into slot 0 exactly once with unchanged visible enchantment; it survives **one normal LAB restart** there with both journals clear, no unexpected PG23 HOLD and no duplicate copy.

## Exact target, source and installation gate

- **Test ID:** PG-23 / single native same-Hopper compaction under one actual Sorter column and a clean restart.
- **Candidate:** `1.5.6-LAB-PG23` derived exclusively from original immutable 1.4.1 + owner-accepted PG08/PG20. The protected 72 source files and pack UUIDs do not change. No PG13/14/15 temporary runtime commands or new test commands.
- **LAB:** `C:\Servers\Thomas_MCBedrock - Copy (2)`, world `ThomasServer` (owner-confirmed previous production world clone), Overworld, BDS 1.26.63.1, client 26.63, no experiments/cheats. **Production `C:\Servers\Thomas_MCBedrock` is forbidden.**
- **Predecessor:** Must be exact **unmodified PG20 1.5.5-LAB-PG20** behavior/resource packs with matching world registrations and original known hashes. Any mismatch is a **REFUSED stop**, not an invitation to manually replace files. The installer preserves other mods, JSONC registry comments and the cloned world.
- **Before installing:** While PG20 LAB is running, run `/hartlogistics:status`. Require active version 1.5.5 and `Journals: sorter clear | queue clear`. Do not install or restart through a pending/HOLD or script error. Do **not** remove the earlier PG20 test rig if it still contains items.
- **Normally stop LAB BDS**, then copy/paste the following complete PowerShell bootstrap. There is no assumption a PG23 script already exists in Downloads:

```powershell
$pg23 = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-PG23Lab.ps1'
Invoke-WebRequest 'https://raw.githubusercontent.com/partom24/HartLogistics2/main/candidates/pg23/Start-HartLogistics-PG23Lab.ps1' -OutFile $pg23
Unblock-File -LiteralPath $pg23
Test-Path -LiteralPath $pg23
& $pg23 -Mode Plan
& $pg23 -Mode CheckLab
```

  The `Test-Path` result must be `True`. The launcher downloads/fast-forwards the authorized clean Git source into its isolated `%LOCALAPPDATA%\HartLogistics2-PG23-LAB` checkout; `Plan` touches no LAB. `CheckLab` is read-only. If either refuses, **STOP and report**, not install. Confirm that the same pinned full Git SHA appears in Plan/CheckLab. Only after `PG23 READ-ONLY PREFLIGHT PASS`, deliberately execute:

```powershell
& $pg23 -Mode Install -Apply
```

  The launcher may fast-forward `main` independently for Install. **Verify the printed source SHA matches CheckLab** before trusting the preflight; if changed, re-run CheckLab against that SHA, do not proceed on stale evidence. Preserve the exact `lab-XXXXXXXXXXXX` backup tag. Never touch production or run a full-world rollback automatically.

- **Normally restart LAB BDS once after installation**, before setting up the rig, then run `/hartlogistics:status`: expect `1.5.6-LAB-PG23`, both journals clear and otherwise sane pre-existing 664 Sorters / 56 Collectors / 34 Receivers topology (or actual owner-observed current counts, plus only deliberate test changes). Do not require an exact global Q4 count because real-world traffic continues.

## Exact isolated two-block rig

The LAB stonebrick hall interior was previously confirmed approximately X=-968.64 to -937.30 and Z=-817.56 to -776.30, floor top Y=69. Choose these exact new spaces **only if empty** and clear of other logistics, redstone and Hopper feeds. Do not move this rig to alternative guessed positions if occupied; stop so a new bounded card can be prepared.

| Component | Count | XYZ | Orientation / configuration |
| --- | ---: | --- | --- |
| Hart Sorter S (`hartsorter:sorter`) | **1** | **(-944,69,-814)** | One vertical column of **exactly one Sorter**, facing **east (+X)**, rear/service face **west (-X)**. New default **WILDCARD** with no filter. The east adjacent cell `(-943,69,-814)` must be empty/inert (NOT a Chest, Barrel, Collector or any storage). |
| Vanilla input Hopper H | **1** | **(-944,70,-814)** | Directly atop S, Hopper nozzle directed **east (+X)** into the inert stop below. All **five slots initially empty**, **unpowered/unlocked**. |
| Inert stone brick (`minecraft:stone_bricks`) | **1** | **(-943,70,-814)** | Solid non-container directly in front of H's nozzle, preventing vanilla item output. No storage/Hopper below or next to H. |
| Collector / Receiver / connected Chest / second Sorter / item frame | **0** | None | No links, Q4 work or extra column. |
| Redstone / pressure plates / repeaters / additional Hoppers | **0** | None | Do not reuse the prior crash-delay circuit; it is a distinct experiment. |

**Top/side view, +X east:**

```text
Y=70: [Hopper H pointing east] -> [solid stone brick]
Y=69: [Sorter S facing east]   -> [air / inert floor, no destination]
        x=-944                    x=-943, z=-814
```

**Isolation:** The above placement is approximately seven horizontal blocks from the earlier PG20 output Hopper `(-950,69,-809)` and is not face-adjacent to it. Do not connect to the existing PG20 Collection/Receiver loop or redstone line. The relevant legacy Sorter intake is exactly **one vertical Hopper immediately atop one Sorter**, not a radius search. All four horizontal neighbors of S and H must be free of connected external automation; no additional arbitrary distance rule.

**Initial physical inventory:** exactly one new, disposable `minecraft:enchanted_book` with a readable **Protection I** enchantment and no other items. All five H slots empty before insertion. No valuable original-world item. S's default WILDCARD mode may have no destination, so the book remains in H after compaction rather than being routed elsewhere.

## Two focused manual checks

1. **Compaction fidelity.** Open H and place the test-owned enchanted book *once* into **slot 4** (the rightmost slot); leave slots 0–3 empty. Close H and allow ordinary server ticks, then reopen. **PASS:** same book in **slot 0** (leftmost), slots 1–4 empty, tooltip still **Protection I**, S still present, no unanticipated item elsewhere and `/hartlogistics:status` still `sorter clear | queue clear`. Do not insert a second book or force a transfer. **STOP** on missing/duplicate/unmodified slot movement when properly configured, altered metadata, repeated logs, journal HOLD or other network changes. A one-second screen capture before/after helps establish slot relocation.
2. **Normal restart retention.** Leave the **same one** book in Hopper slot 0, normally stop/restart **LAB only** once, then inspect H and `/hartlogistics:status`. **PASS:** one identical Protection I book still in slot 0, other H slots empty, sorter and queue journals clear, no repeated native move, status `1.5.6-LAB-PG23`. **STOP** on missing/duplicate item, wrong enchantment, journal HOLD or new script warning.

**No emergency server kill**, fault-injection world property, cheats, experiments or gameplay probe is needed. The offline source-executed tests already exercise failures before/after the native same-container move and journal uncertainty. A normal restart is not a crash-atomic disk transaction proof.

## Cleanup, provenance and refusal

- After both checks pass, take the sole disposable test-owned book out of H, confirm H empty, then remove only **these three newly placed test rig blocks** (1 Sorter, 1 Hopper, 1 inert stone brick). Do not disturb the prior PG20 test rig, prior held items, existing original-world Sorters, cloned world floor or backups. The new Sorter registration should disappear after block removal under the ordinary existing registry cleanup path; verify status only if needed, no forced world migration.
- PG23 has **zero temporary runtime commands, debug hooks, probes, new UUIDs, world properties or saved test switches**. Its opaque compaction intent uses the pre-existing single physical journal and is cleared after success. An interrupted marker remains until independently audited; the installer/rollback is **not** a journal repair mechanism.
- Preserve screenshots of preinsert H slots, moved book tooltip, after-normal-restart H and journal status, installed version, exact Git SHA and installer backup tag. Save script log warning if any.
- **If any pending physical or queue journal appears:** STOP, leave original item wherever visible, do not reinsert, move/clear the journal, break occupied H/S, roll back the pack or restart hoping for auto repair. Send the exact status/log. Vanilla Hopper and foreign script writes are still outside Hart's cooperative journal gate.
- **Evidence grade after success:** scoped `RUNTIME OBSERVED` one-Hopper native compaction + normal-restart visible enchantment, not true crash-safe atomicity, global single-writer physical exclusivity or production approval.
