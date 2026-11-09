# PG30 — Q5 isolated property persistence LAB session

**READY only after final reviewed SHA and all CI jobs pass.** Temporary diagnostic; not Q5 migration, a routing freeze, or a release.

## What / why / prior evidence / owner action / pass

**What:** On stable nonexperimental Bedrock BDS 1.26.63.1, check normal-restart persistence of two separate LAB-only world dynamic-property keys: temporary PG30 history and marker.

**Why now:** Offline history-first maintenance models detect inconsistent record pairs, but Bedrock runtime persistence of the actual Script API write/readback sequence is unverified.

**Evidence reused:** Accepted bounded PG27 Transporter and PG25 Q4 journal routing; PG29's real Q4 read-only observation and verified PG27 rollback. Do not repeat visual, inventory, hopper or MR tests.

**Owner action:** Exact guarded stopped-LAB PG27 to PG30 installation; four GameDirectors commands across one normal restart; verify test-key cleanup and exact guarded PG30 to PG27 rollback. No block rig, item movement or experiments.

**PASS:** Initial CLEAN; after history write HISTORY_ONLY; after normal BDS restart HISTORY_ONLY persists; after marker write BOTH_PRESENT; after cleanup CLEAN; after rollback PG27 and clear journals.

**HOLD:** Any unknown test value, write failure, missing command, journal HOLD or unsafe rollback. Stop and preserve current state. No forced crash, LevelDB editing, pack file copying, cheat/experiment changes or Q4 journal clearing.

Temporary instrumentation: TEMP_TEST:PG30-Q5-PERSISTENCE, registered in project-blueprint.json. It must be removed from the repo after the test and verified cleanup, and its PR must not merge. It does not access real Q5 maintenance keys or any Q4 data.

## LAB scope

- Authorized LAB: C:\Servers\Thomas_MCBedrock - Copy (2), world ThomasServer (owner's preserved cloned world).
- Production C:\Servers\Thomas_MCBedrock is protected.
- No Sorters, Receivers, Collectors, Transporters, inventories, coordinates, redstone or test item placement.
- Existing PG27 packs must hash exactly to the pinned predecessor. Stop the LAB normally before installing and rolling back. Never remove backups.

## 1. Pinned launcher download and preflight

Developer supplies exact DELIVERY_SHA only after final CI and review. In PowerShell:

    $pg30Pin = 'DELIVERY_SHA'
    $pg30 = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-PG30Lab.ps1'
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/partom24/HartLogistics2/$pg30Pin/candidates/pg30/Start-HartLogistics-PG30Lab.ps1" -OutFile $pg30
    Test-Path -LiteralPath $pg30 -PathType Leaf
    & $pg30 -Mode Plan -ExpectedCommit $pg30Pin
    & $pg30 -Mode CheckLab -ExpectedCommit $pg30Pin
    & $pg30 -Mode Install -Apply -ExpectedCommit $pg30Pin

Plan: source-only BP 18 / RP 59, no LAB/PROD/world files accessed.
CheckLab: exact installed PG27 hash and version/registration preflight, no changes.
Install: LAB-only backup tag lab-<12 lowercase hex> printed. Record the **new** tag; never use an old PG29/PG27 backup. Stop immediately on any refused step.

## 2. First LAB start: history-only

Start LAB normally and connect. In-game, as a GameDirector, run exactly:

    /hartlogistics:status
    /hartlogistics:q5pcheck
    /hartlogistics:q5pstart
    /hartlogistics:q5pcheck

Expect status version 1.5.12-LAB-PG30-Q5-PROPERTY-PROBE with sorter and queue journals clear.
The first q5pcheck should print CLEAN: both temporary keys absent.
q5pstart and second q5pcheck must show HISTORY_ONLY: test history present and marker absent.

If any unexpected output, STOP and share evidence. Never repeat q5pstart to force a PASS.

## 3. One ordinary LAB restart: read, marker, cleanup

Stop LAB normally; start LAB normally again. Reconnect and run:

    /hartlogistics:status
    /hartlogistics:q5pcheck

Expected same PG30 version and clear journals; q5pcheck still reads HISTORY_ONLY after the restart. This is only normal-restart evidence, not crash atomicity.

Then, without another restart, run exactly:

    /hartlogistics:q5pfinish
    /hartlogistics:q5pcheck
    /hartlogistics:q5pclear
    /hartlogistics:q5pcheck

Expect finish and next check to report BOTH_PRESENT. Cleanup and final check must report CLEAN: both temporary keys verified absent.

The cleanup command touches only exact PG30-owned keys and can finish an interrupted partial test-key clear. If it reports HOLD or does not read back CLEAN, **do not roll back or hand-edit world keys**. Preserve screenshots/output for diagnosis.

## 4. Exact guarded rollback and final normal restart

Once PG30 test keys are verified CLEAN and status journals are clear, shut down LAB normally. Use the fresh PG30 Install backup tag:

    & $pg30 -Mode Rollback -BackupTag 'lab-REPLACE_WITH_ACTUAL_NEW_PG30_BACKUP' -Apply -ExpectedCommit $pg30Pin

Expected: PG30 LAB ROLLBACK COMPLETE; launcher saves another safety backup. Keep both, and all previous world/pack backups.

Start LAB normally and check:

    /hartlogistics:status

Expected: 1.5.10-LAB-PG27, sorter clear | queue clear. PG30 temporary commands are absent.

Owner shares outputs for first CLEAN/HISTORY_ONLY, postrestart HISTORY_ONLY, BOTH_PRESENT/CLEAN and final PG27 status. No other Bedrock cargo tests.

## Evidence boundary

Only the exact isolated property keys may be written by these temporary commands; ordinary Hart routing, Q4 queues, native item movement, links, journals, world block types and real Q5 maintenance records remain unchanged.

A successful test proves only that these two temporary strings can be written/read and that the isolated history string persisted across a **normal** BDS stop/start at the tested runtime. It does not prove power loss, two-property durability ordering, exactly-once custody, a global Hart writer freeze, vanilla hopper isolation, native MR lossless serialization, Q5 authority cutover or production readiness.
