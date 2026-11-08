# PG-24 — Q4 ejected-item custody LAB test card (READY only after all CI green)

**What is new:** Normal Dropper/Dispenser item ejection into a Collector is unchanged from 1.4.1 **except** that PG24 now verifies the exact world-property intent, Q4 page, item definition, queue metadata and still-live source item entity **before removing the entity**. If an old `entity_enqueue` journal is found after interruption, PG24 **HOLDs** instead of automatically deleting a possibly recovered item entity or clearing its Q4 receipt.

**Why test at all:** This is a changed *normal ejected-item intake* path, not the previously accepted PG20 native enchanted-book route or PG23 same-Hopper compaction. A single successful ejection/receipt into a linked test Receiver suffices as a narrow smoke test. **Do not repeat PG08/13/14/15/20/23 tests. Do not force-kill the server, fabricate a pending journal, toggle experiments/cheats or change production.**

**Pass:** Exactly **one cobblestone** leaves the test Dropper and appears once in the linked Receiver's isolated output Hopper, with source Dropper empty, no scattered extra entity, no Q4 backlog remaining in the test Receiver, active `1.5.7-LAB-PG24` and `Journals: sorter clear | queue clear`. One clean normal restart is **not required** to evaluate the new code. Offline fault tests cover the interrupted journal and refusal cases without risking a cloned-world item.

**No item metadata claims:** A vanilla cobblestone item tests the Q4 serialization route, not a metadata-rich book. The PG20 Protection I/PG23 Hopper compaction evidence remains accepted and must not be rerun.

## LAB-only installation — exact command blocks supplied

- **LAB root:** `C:\Servers\Thomas_MCBedrock - Copy (2)`, world `ThomasServer`, BDS 1.26.63.1, client 26.63, no cheats/experiments. **NEVER** target production `C:\Servers\Thomas_MCBedrock`.
- **Starting version:** installed, unmodified `1.5.6-LAB-PG23`, identical to the generated PG23 BP/RP hashes. Both old Q4/physical journals must be **clear before replacing packs**; if pending, leave the world unchanged and preserve evidence. Keep PG23 backup **`lab-e7e9c09faeeb`** and earlier backups.
- **Before any PowerShell install:** With PG23 LAB running, `/hartlogistics:status` must show `1.5.6-LAB-PG23` and `sorter clear | queue clear`. Then **stop only LAB BDS normally**. The scripts never stop or restart servers.
- **New launcher bootstrap:** This file is not assumed to exist on your computer. Paste **all of** the following PowerShell into your operator terminal while LAB BDS is stopped:

```powershell
$pg24 = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-PG24Lab.ps1'
Invoke-WebRequest 'https://raw.githubusercontent.com/partom24/HartLogistics2/main/candidates/pg24/Start-HartLogistics-PG24Lab.ps1' -OutFile $pg24
Unblock-File -LiteralPath $pg24
if (-not (Test-Path -LiteralPath $pg24)) {
    throw 'PG24 launcher download missing'
}
$pg24Plan = @(& $pg24 -Mode Plan)
$pg24Plan
$pg24Pin = $null
foreach ($line in $pg24Plan) {
    if ($line -match '^Pinned Git source: ([0-9a-f]{40})$') {
        $pg24Pin = $Matches[1]
    }
}
if (-not $pg24Pin) {
    throw 'PG24 Plan did not provide a valid source commit'
}
& $pg24 -Mode CheckLab -ExpectedCommit $pg24Pin
```

  **Gate:** Require `PG24 READ-ONLY PREFLIGHT PASS; nothing changed.` This checks **only** the exact authorized LAB and expected 1.5.6 predecessor hashes/registrations. If refused, **STOP**; don't attempt manual copy, workaround, backup restore, cheats or experiment flags. The launcher isolates its Git checkout under `%LOCALAPPDATA%\HartLogistics2-PG24-LAB`. No pack is installed during Plan/CheckLab.

- **Only after preflight PASS**, deliberately execute this exact second command with the same pinned SHA:

```powershell
& $pg24 -Mode Install -Apply -ExpectedCommit $pg24Pin
```

  If `main` moves in between, Install refuses a mismatched SHA and requires a fresh read-only preflight; **never reuse a stale pin**. Record the installer `lab-XXXXXXXXXXXX` backup tag. Installation protects all third-party pack registrations, JSONC comments and the original cloned world; no reset or production operations. Do not run any rollback unless an actual issue warrants it and the precise backup tag is known.

- **Start LAB normally** after installation. Run `/hartlogistics:status`; expect `Hart Logistics 1.5.7-LAB-PG24`, both journals clear, existing Sorter/Collector/Receiver registry broadly consistent (previously 665 Sorters / 56 Collectors / 34 Receivers while PG23 rig remained), with normal background Q4 count changes. **Stop on any pending/HOLD or unexpected absence of the pack**.

## One exact, isolated Dropper/Collector/Receiver route

The prior PG20 test-owned Collector/Receiver setup used the Overworld stonebrick hall. **Reuse that same linked test pair only if it still exists, remains linked, is empty, and the following positions are actually available**. Do not overwrite a previous owner's item, remove an occupied Hopper, or create a second unknown Receiver. If the old test rig has already been cleared, do not guess a new location: report its absence and a fresh, exact bounded card can be prepared.

| Block | Exact XYZ | Required state |
| --- | --- | --- |
| Existing test-only Collector C | **(-960,69,-809)** | `hartsorter:collector`, already linked to R; **unpowered** |
| Existing test-only Receiver R | **(-950,70,-809)** | `hartsorter:receiver`, linked from C; no old test Q4 backlog |
| Existing Receiver output Hopper H-out | **(-950,69,-809)** | Five empty slots; output east into inert stop `(-949,69,-809)`; unpowered |
| **NEW vanilla Dropper D** | **(-960,69,-810)** | Immediately **north** of C; output must point **south (+Z) into C**; initially all 9 inventory slots empty |
| **NEW stone button** | Rear/north face of D | One short activation pulse; not directly connected to preexisting redstone |
| Original PG20 test source Hopper H-in | **(-961,69,-809)** | **Leave unchanged** if present. The test uses the new north-side Dropper, not this Hopper |
| Sorter / extra Hopper / additional Dropper / chest / Transporter / Q5 / Bulk | **0 new** | Not part of this changed test |

**Geometry:** `D(-960,69,-810) -> south (+Z) -> C(-960,69,-809) [link] R(-950,70,-809) -> H-out(-950,69,-809)`. There must be no extra blocks or attached storage on the new Dropper's ejection face and no unintended power to C/R. The south-facing Dropper may eject into the solid Collector; this is the documented existing vanilla-ejected-item recognition path. Do not break original stonebrick floor/walls or touch other mods.

**Initial inventory:** One disposable **ordinary cobblestone item**, no book or metadata-rich item. Verify D and H-out empty, and C/R linked. If any other existing test-owned item is present, preserve it and stop—do not silently remove or overwrite it.

## One manual observation (no reboot)

1. Place **one cobblestone** into Dropper D and close the UI; inspect H-out is empty.
2. Press the button **exactly once**. Allow several normal ticks. Look at D, H-out, area around C, and `/hartlogistics:status`. **PASS:** D empty, one cobblestone in H-out, no other dropped entity from that pulse, Q4 test Receiver has no newly retained backlog, `1.5.7-LAB-PG24`, both journals clear. This is one observable ordinary entity→Q4→Hopper operation, not proof of cross-save crash atomicity.
3. **STOP** on missing/duplicate item, a cobblestone left on floor, test Q4 backlog that does not drain, journal PENDING/HOLD, unexpected `PG24 ejected entity custody uncertain` log, wrong active pack version or any other change. **Do not press twice**, move uncertain items, clear journal, force another restart, reinstall or roll back simply to retry.

A dropped item that stays as an ordinary Minecraft entity when no source route is recognized is **not permission to delete it**; keep that state for analysis. The changes intentionally cannot recover a pending `entity_enqueue` without independent custody evidence. The offline source-executed tests validate this fail-closed condition; **never create a pending real journal to test it**.

**Cleanup after PASS (optional):** Take the **one test-owned cobblestone** from H-out into personal inventory, verify H-out empty, and remove only the **new** Dropper and button. Leave the existing PG20 C/R/Hopper test pair in its chosen state; if all PG20/PG23 rigs are already accepted and you want to clean the room, do so separately without disturbing live network items. No temporary commands, probe blocks, saved test property, new UUIDs or experimental APIs were introduced.

**Evidence requested for this sole new path:** initial `1.5.7` status with clear journals, one H-out with exactly one cobblestone, Dropper empty and one final status with both journals clear, plus any log warning. A single successful ejection test is the only necessary LAB runtime check for PG24.
