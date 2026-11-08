# PG25 1.5.8 — bounded ordinary Q4 recovery hardening

**LAB candidate, not yet BDS-accepted.** Upgrade only exact PG24 `1.5.7` using
the guarded Git-backed launcher. No production operations or experiments.

**What:** verify the new build starts with clear journals and the existing
ordinary Hopper→Collector→Q4→Receiver output route still completes.
**Why now:** PG25 changes pending-Q4 recovery, startup gating and status, so a
target-runtime check of clean startup and normal routing is needed.
**Prior evidence:** reuse PG08 menus, PG20 native MR, PG23 compaction and PG24
Dropper/Dispenser acceptance. Do not repeat their rigs, item classes or restarts.
**User action:** one stopped-LAB upgrade/start and one eight-item ordinary route.
**Pass:** `1.5.8-LAB-PG25`, unchanged device topology, both journals clear,
input emptied and exactly eight ordinary items at isolated output.

The pending/malformed/mixed-save HOLD paths are exercised offline. **Do not
inject a real journal, interrupt a transfer, kill BDS or create an ambiguous
inventory state to test recovery.** No extra post-transfer restart is needed.
Temporary runtime instrumentation: **NONE**.

## Before stopping LAB

Run `/hartlogistics:status` on the existing PG24 install. Expected active version
is `1.5.7-LAB-PG24`, last recorded topology 664 Sorters / 56 Collectors
(45 linked) / 34 Receivers. If you intentionally changed topology since that
record, preserve the actual pre-update counts for comparison.

**Both journals must be clear.** If PENDING/HOLD, unexpected version, errors or
unexplained counts appear, stop this procedure and report that evidence. The
installer cannot inspect/repair journal properties in the world database.
Do not empty Receivers, clear properties, reinstall, or reset the cloned world.

Check the existing test input/output are empty and preserve any leftover items.
Stop only LAB BDS normally through its existing stop mechanism. Keep all prior
world/pack backups. No change to production BDS or its directories is needed.

## Complete source acquisition and pinned installation

Run in Windows PowerShell. These commands require the source change to have
landed on `main` with successful CI; use the delivered final source pin.
The launcher obtains the full clean checkout itself. No manual pack copying.

```powershell
$ErrorActionPreference = 'Stop'
$pg25 = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-PG25Lab.ps1'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/partom24/HartLogistics2/main/candidates/pg25/Start-HartLogistics-PG25Lab.ps1' -OutFile $pg25
if (-not (Test-Path -LiteralPath $pg25 -PathType Leaf)) { throw 'PG25 launcher download missing' }
& $pg25 -Mode Plan
if (-not $?) { throw 'PG25 source-only Plan failed' }
$pg25Check = & $pg25 -Mode CheckLab
if (-not $?) { throw 'PG25 CheckLab failed; do not install' }
$pg25Check | ForEach-Object { Write-Host $_ }
$pg25Pins = @($pg25Check | Select-String '^Pinned Git source: ([0-9a-f]{40})$')
if ($pg25Pins.Count -ne 1) { throw 'No unique PG25 preflight SHA' }
if (-not (($pg25Check | Out-String).Contains('PG25 READ-ONLY PREFLIGHT PASS'))) { throw 'Missing successful PG25 preflight' }
$pg25Pin = $pg25Pins[0].Matches[0].Groups[1].Value
Write-Host ('Verified PG25 source pin: ' + $pg25Pin)
```

Confirm that pin matches the tested source delivered with the candidate. Then:

```powershell
& $pg25 -Mode Install -Apply -ExpectedCommit $pg25Pin
if (-not $?) { throw 'PG25 install did not complete; preserve output and stop' }
```

If `main` advances between CheckLab and Install, the launcher refuses the
changed SHA. Obtain a new successful matching preflight; do not bypass it.
Retain the printed `_HartLogisticsDeployBackups\lab-<12 hex>` tag and full shell
output. CheckLab/Install require stopped LAB and exact PG24 BP/RP hashes,
versions, world path and registrations. Other add-ons and registration comments
are preserved. No server auto-start occurs.

## Check 1 — normal LAB startup

Start LAB BDS normally. Run `/hartlogistics:status`.
PASS: `1.5.8-LAB-PG25`, device counts match the pre-update state, both journals
clear, no script startup error or unexplained PG25 Q4 HOLD. Queue totals may
change because the existing world network remains active; they are not test
item accounting. Stop on failure and preserve logs/state.

## Check 2 — existing isolated ordinary route, no new rig

Use the previously accepted PG20/24 test pair only if it still matches this
layout. **Do not rebuild or move existing infrastructure if it differs**;
report the mismatch so the card can be corrected first.

| Existing block | XYZ | Required state |
| --- | --- | --- |
| Input Hopper H-in | (-961,69,-809) | Faces east (+X) into C; unpowered; all five slots empty |
| Collector C | (-960,69,-809) | Linked to R; unpowered |
| Receiver R | (-950,70,-809) | No retained test backlog; linked from C |
| Output Hopper H-out | (-950,69,-809) | Directly below R; all five slots empty; faces east into inert stop |
| Inert output stop | (-949,69,-809) | Non-inventory solid block; no onward output |
| New blocks / Sorters / chest / redstone / probes | None | No additional rig is required |

Preserve the existing stonebrick support and room. No attached feeding chest,
Dropper, Dispenser, player action or other automation should feed this pair
during the observation. Check that any retained PG24 Dropper/Dispenser is empty
and do not pulse it. No added spacing changes: use the same accepted pair;
if another rig now touches its input/output or powers it, report that condition.

1. Put **exactly eight** ordinary queue-safe items of one identity in H-in;
   plain cobblestone is suitable. Do not use the earlier enchanted book.
2. Let the normal route run. Inspect all five slots in H-in and H-out.
3. PASS: H-in empty, H-out contains exactly eight of that identity and nothing
   else; the isolated Receiver's queue has no newly stuck test backlog; final
   `/hartlogistics:status` still shows PG25 and both journals clear.

Send the pre/post status, final H-in/H-out inventories and install output with
the pinned SHA/backup tag. No repeat pulses or additional restart. After PASS,
retrieve only the eight test-owned items and verify H-out empty; no blocks or
temporary properties need cleanup. Do not touch world backlog or other mods.

## If HOLD or unexpected inventory appears

Stop testing; do not replenish, move uncertain items, clear journals, force a
restart or use rollback as an attempted custody repair. Record status and
exact errors, last known source/destination counts and when it occurred. Stop
LAB normally when preservation is needed and retain a separate cold copy of
the entire LAB world and logs using your established backup process; preserve
the original copy. Bring that evidence back for an independent custody audit.

PG25 deliberately offers **no clear/retry/compensate command**. A process-local
HOLD cannot be unlocked by deleting a marker. A reboot with the same persisted
receipt remains HOLD. Missing or duplicate items in an earlier mixed save are
not automatically corrected. Vanilla Hoppers/players/foreign add-ons are not
frozen by the Hart script gate.

## Binary rollback, only after state is understood

Rollback restores pack versions/registrations, **not world inventory or Q4
transactions**. PG24 has the older automatic ordinary-Q4 recovery behavior;
never use it with an unresolved receipt. Preserve evidence and obtain a scoped
recovery decision first. For a clean-journal compatibility rollback only, stop
LAB normally and supply the exact PG25 installation backup tag:

```powershell
$pg25BackupTag = Read-Host 'Exact PG25 install backup tag (lab- followed by 12 lowercase hex characters)'
if ($pg25BackupTag -cnotmatch '^lab-[0-9a-f]{12}$') { throw 'Invalid backup tag' }
& $pg25 -Mode Rollback -BackupTag $pg25BackupTag -Apply -ExpectedCommit $pg25Pin
if (-not $?) { throw 'PG25 rollback refused; preserve output and stop' }
```

Rollback uses the original pinned source checkout without fetching a newer
branch. Preserve all backups. Restart LAB normally only after a successful
clean-state rollback. No operation here authorizes production deployment.
