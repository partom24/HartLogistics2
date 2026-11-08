# PG26 1.5.9 — first ordinary Transporter input prototype

**LAB ONLY; BDS not yet run.** This is a new pipe block and a bounded input
adapter for existing Sorter rules. It is not a released Transporter/Bulk/Q5
network. Installed predecessor must be exact accepted PG25 `1.5.8`.

**What:** new dedicated narrow pipe model, six-face connections, and a
single-source → pipes → one Sorter column → native output inventory route.
**Why now:** PG25 is accepted; the ordinary Transporter input can be developed
without custom MR containers or virtual Bulk/Q5 storage. New block registration,
resource rendering and this new native input endpoint require BDS observation.
**Reuse:** PG25 startup/ordinary Q4, PG24 ejection, PG23 Hopper compaction, PG20
whole-native moves and original Sorter modes. Offline actual-source cases cover
FILTER/AUTO/WILDCARD/BYPASS dispatch, topology refusals, journal gates, native
faults and redstone. Those are not repeat owner tests.
**Owner action:** two checks in one precisely specified new layout: visual
registration/connections, then a powered-pause/unpowered whole-stack route.
**Pass:** original blocks look unchanged; pipe looks like new silver/blue narrow
plumbing; new model connects in all six directions; eight plain items stay at
source while paused and arrive intact at the new Sorter output after unpause;
PG26 status shows both journals clear.

No MR book, new persistent storage, forced crash, injected journal, extra restart
or repetition of the old Collector/Receiver eight-item test. Temporary runtime
instrumentation: **NONE**; the Transporter is the actual planned feature block.

## Scope and deliberate limits

- At most 16 connected pipes, exactly one **single chest or barrel** at/above
  intake height, exactly one Sorter column. Unknown/unloaded frontier, multiple
  sources/columns, double chest, foreign inventory or virtual C/R endpoint holds.
- Ordinary queue-safe stacks only. Whole stack → empty destination slot through
  the existing native writer. No partial split/merge or MR transfer on the new
  pipe path. Insufficient empty-slot capacity/budget leaves source untouched.
- Hopper-fed columns keep their existing behavior/budget/compaction. New pipe
  columns can move a whole stack up to 64 under the existing global budget.
- No direct pipe→storage-chest route: the Sorter selects and writes its output.
  No Collector/Q4 destination on the new pipe input, Bulk, controllers, network
  persistence, cross-chunk transfer, or durable disk/external-writer guarantee.
- World collision is disabled for the thin pipe; selection is a full-block box
  for predictable placement. Geometry and inventory model are new assets.

## Before update: existing accepted PG25 stays the comparison

Read `/hartlogistics:status` while LAB is running: PG25 `1.5.8`, both journals
clear, last recorded 664 Sorters / 56 Collectors (45 linked) / 34 Receivers.
Preserve actual current counts if you intentionally changed the old world.
Do not repeat its finished transfer or reinstall PG25. Stop LAB BDS normally.
Keep installer backup `lab-36ead7340407` and all existing world/pack backups.
No production server or files are involved.

## Complete bootstrap, source-only Plan and pinned upgrade

Only after final source/CI delivery on `main`, run in Windows PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
$pg26 = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-PG26Lab.ps1'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/partom24/HartLogistics2/main/candidates/pg26/Start-HartLogistics-PG26Lab.ps1' -OutFile $pg26
if (-not (Test-Path -LiteralPath $pg26 -PathType Leaf)) { throw 'PG26 launcher missing' }
& $pg26 -Mode Plan
if (-not $?) { throw 'Source-only Plan failed' }
$pg26Check = & $pg26 -Mode CheckLab
if (-not $?) { throw 'CheckLab failed; do not install' }
$pg26Check | ForEach-Object { Write-Host $_ }
$pg26Pins = @($pg26Check | Select-String '^Pinned Git source: ([0-9a-f]{40})$')
if ($pg26Pins.Count -ne 1 -or -not (($pg26Check | Out-String).Contains('PG26 READ-ONLY PREFLIGHT PASS'))) { throw 'No unique successful pinned preflight' }
$pg26Pin = $pg26Pins[0].Matches[0].Groups[1].Value
Write-Host ('PG26 verified pin: ' + $pg26Pin)
```

Confirm the pin equals the tested source delivered for this candidate, then:

```powershell
& $pg26 -Mode Install -Apply -ExpectedCommit $pg26Pin
if (-not $?) { throw 'Install incomplete; preserve output and stop' }
```

The launcher obtains the full source checkout itself. No manual pack copying or
`.mcpack` download. Exact PG25 hashes/versions/world/registrations and stopped LAB
are required. A changed SHA between preflight and Install is refused. Retain the
new printed backup tag and command output. No BDS auto-restart occurs.

Start LAB normally. Confirm active **1.5.9-LAB-PG26**, unchanged original device
counts before adding the new rig, both journals clear, no startup/component error
or missing-texture warning. On mismatch, preserve logs and stop; do not retry an
install or toggle cheats/experiments.

## Complete new layout — inspect clear space before placing anything

Use Overworld. Check **x -934..-928, y 69..74, z -818..-807** is clear of existing
blocks/inventories/redstone except the existing floor. If occupied, stop and
report the conflict; do not demolish or move old world infrastructure.

Nearest documented old rig is PG23 at x=-944; closest new block is x=-933,
leaving at least 11 blocks in X. Existing C/R test pair is farther west
(x=-960/-950). The visual rack and active pipe run below are six or more blocks
apart in Z, so they share no face or redstone. Check for any other undocumented
nearby rig/automation before building; do not connect this prototype to a live
network. Keep the original wooden floor/stonebrick room and other mods intact.

**Exact new counts:** 10 Transporters, **one Sorter**, one barrel, one single
chest, one lever, three stonebrick support blocks. No Collector, Receiver,
Hopper, Dropper, Dispenser, extra Sorter, frame probe or test command.

| Block | XYZ | Orientation/state |
| --- | --- | --- |
| Active Sorter S | (-932,69,-809) | Output face south (+Z); use its normal UI to select **WILDCARD**; no filter item needed |
| Output single chest O | (-932,69,-808) | Immediately south of S, at Sorter level; 27 empty slots; no adjacent chest/automation |
| Active pipe P0 | (-932,70,-809) | Directly above S |
| Active pipe P1 | (-931,70,-809) | East of P0 |
| Active pipe P2 | (-930,70,-809) | East of P1 |
| Input barrel I | (-929,70,-809) | East of P2; 27 empty slots; opening direction cosmetic |
| Barrel support | (-929,69,-809) | One new stonebrick block |
| Lever | North face of S, occupying (-932,69,-810) | Attached to S, initially **ON**; use this to pause the Sorter |
| Visual rack centre J | (-932,72,-816) | Pipe with six pipe neighbors below |
| J north / south | (-932,72,-817) / (-932,72,-815) | One pipe at each position |
| J east / west | (-931,72,-816) / (-933,72,-816) | One pipe at each position |
| J up / down | (-932,73,-816) / (-932,71,-816) | One pipe at each position |
| Rack support pedestal | (-932,69,-816), (-932,70,-816) | Two new stonebrick blocks; **no Sorter below this rack** |

`I --west--> P2 -- P1 -- P0 --down--> S --south--> O`.
Pipes contain no inventory. The ordinary barrel is intentionally the sole input;
the final output chest is below pipe height and selected by the Sorter.

## Check 1 — new visual asset and six-direction registration

Find **Hart Transporter** in the Creative construction inventory/search and
obtain exactly 10. If the identifier/model is unavailable, stop and report the
status/content log; do not enable experiments or obtain an older probe pack.
Place the layout above with I/O empty and the lever ON. Sneak-place pipes on
the Sorter/pipe faces as needed, preserving the specified positions.

Wait one second for connection ticks. P0 should bend from east to down, P1 run
straight east/west, P2 connect to the barrel, and J show all six arms. Remove
**only J's upper pipe** once; the centre's upper arm should disappear within a
second. Put it back; the arm should return. Other shapes are covered by the
offline 64-mask resource checks. Capture the active run and six-way rack beside
the new original Sorter. The new pipe and its inventory model must be visibly
distinct from original machines, with no purple/missing surfaces. Existing
Sorter/Collector/Receiver appearances must remain unchanged.

No items move during this visual check. The rack has neither source nor Sorter.

## Check 2 — new native input and redstone gate

Confirm S is WILDCARD, lever ON, I/O both empty and no other source touches the
run. Put **eight plain cobblestone** in I. Wait at least one second.

1. **Paused:** I still holds eight; O empty. No journal should become pending.
2. Turn the lever OFF. Allow normal ticks. **Running:** I empty; O contains
   exactly eight in one slot; other output slots empty. Read status: PG26 and
   both journals clear. The new Sorter adds **one** to the pre-rig count;
   Collector/Receiver counts should not change. Global queue counters are not
   evidence for this direct Sorter→chest route.

Send the install pin/backup output, running status, visual model/rack picture,
and paused/final input/output observations. No extra restart, MR book,
Collector/Receiver transfer or repeated ejection/compaction test.

**Stop** on an unexpected extraction, duplicate/missing item, item movement while
paused, pending/HOLD journal, unknown endpoint, script error or asset defect.
Preserve source/output/world/logs; do not replenish, clear a marker, force a
restart or roll back to try again. Return the exact observations for diagnosis.

## Cleanup and rollback boundary

After PASS, retrieve only the eight new test-owned items; confirm I/O empty.
The rig may remain for the next changed-path test. If removing it, remove only
these 10 pipes, one new Sorter, empty barrel/chest, lever and three supports;
leave the floor, original rigs and backups intact. No new world-property key or
temporary runtime command requires cleanup.

Rollback changes packs/registration, not transactions or world contents.
Use only for clean-journal compatibility rollback after diagnosis. Remove all
new Transporter blocks/items from this test before reverting to PG25, which
does not define the new identifier. Preserve world evidence first. Stop LAB
normally, use the original pinned source checkout and the exact PG26 install
backup tag (not PG25's old backup):

```powershell
$pg26BackupTag = Read-Host 'Exact PG26 install backup tag (lab- followed by 12 lowercase hex characters)'
if ($pg26BackupTag -cnotmatch '^lab-[0-9a-f]{12}$') { throw 'Invalid backup tag' }
& $pg26 -Mode Rollback -BackupTag $pg26BackupTag -Apply -ExpectedCommit $pg26Pin
if (-not $?) { throw 'Rollback refused; preserve output and stop' }
```

No live HOLD receipt can be repaired by a pack rollback. Preserve the existing
PG25 backup and all world snapshots. No production operation is authorized.
