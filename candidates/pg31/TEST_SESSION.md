# PG31 — One-session world-wide Q4 read-only census

**Delivery status:** Draft; do not install until final exact SHA and all CI jobs are green. This temporary PR must close without merging after verified LAB rollback.

## What, why, prior evidence, action, pass

**What:** Enumerate and structurally decode **every registered Q4 Receiver** using the proven Q4 read-only decoder, instead of the PG29 largest-Receiver-only observation. The scan performs two complete world-wide sweeps, checks global Q4 metadata key coverage, double-reads each Receiver and verifies total queued item count against the loaded PG27 registry.

**Why:** Any future Q5 shadow staging needs all-or-HOLD source evidence. One successful 90,070-item Receiver says nothing about the other 34 Receivers, orphan Q4 metadata, a pending journal or missing page.

**Prior accepted evidence reused:** PG25 ordinary Q4 recovery HOLD, PG27 installed visuals and ordinary Transporter routing, PG29's single-Receiver snapshot observation and exact rollback, and PG30's isolated normal-restart property persistence plus independently verified key cleanup and PG27 restoration. Do NOT repeat the earlier cargo, frame, Dropper, Dispenser, Hopper, MR or restart-persistence tests.

**Owner action:** One guarded exact-PG27→PG31 stopped-LAB install; one in-game read-only command and ordinary status; stopped-LAB guarded rollback to PG27 and final status. No test rig, world edits, inventory interactions, item transfers or new experiments.

**PASS:** The temporary command reports **STRUCTURAL PASS** for the complete registered Receiver count and total Q4 items; both journals are clear; no Q5 writes, no Q4 migration and final runtime returns to PG27.

**HOLD:** Missing/unsafe Q4 pages or definitions, orphan Q4 metadata, q2/q3 leftovers, pending journal, changed registry, missing read interface or unexpected exception. On HOLD preserve output and stop; no repair, replay, migration, force-clear or arbitrary retry.

**Boundary:** A structural double-read is NOT a Bedrock durable atomic snapshot, authenticated ordinary/MR identity proof, global freeze, external vanilla isolation, native block residency or Q5 cutover. The command writes no persistent key. Q4 stays authoritative.

## LAB scope

Only \`C:\Servers\Thomas_MCBedrock - Copy (2)\` with the owner's preserved \`ThomasServer\` world. Production \`C:\Servers\Thomas_MCBedrock\` is protected. Original 72 source files and native pack UUIDs unchanged. Temporary \`TEMP_TEST:PG31-Q4-WORLD-CENSUS\` source is in this development branch, not main.

## 1. Exact pinned, stopped-LAB preflight

Shut down LAB normally. After developer supplies the final exact 40-character commit, use:

    $pg31Pin = 'DELIVERY_SHA'
    $pg31 = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-PG31Lab.ps1'
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/partom24/HartLogistics2/$pg31Pin/candidates/pg31/Start-HartLogistics-PG31Lab.ps1" -OutFile $pg31
    Test-Path -LiteralPath $pg31 -PathType Leaf
    & $pg31 -Mode Plan -ExpectedCommit $pg31Pin
    & $pg31 -Mode CheckLab -ExpectedCommit $pg31Pin
    & $pg31 -Mode Install -Apply -ExpectedCommit $pg31Pin

Plan expected: original 72 files immutable; BP **23**, RP **59**, no LAB/PROD/world access. CheckLab is read-only and requires exact installed PG27 packs/registrations. Install prints a NEW \`lab-<12 lowercase hex>\` backup tag; capture and retain exactly that tag and all older backups. Never use old PG29 or PG30 tag.

## 2. One in-game Q4 world census

Start LAB normally, reconnect, enter:

    /hartlogistics:status
    /hartlogistics:q5census

Expected status version: \`1.5.13-LAB-PG31-Q4-WORLD-CENSUS\`, both journals clear. The census output has three lines:

1. \`[PG31 Q4 WORLD READ ONLY] STRUCTURAL PASS: 35 registered Receivers, <current Q4 total> queued Q4 items in <entry count> queue entries.\`
2. \`Largest Receiver Q4: <count> items, <entry count> entries; fingerprint fnv32:<...>.\`
3. \`NO Q5 WRITES, NO AUTHORITY CHANGE. Q4 remains authoritative.\`

The exact total may change from 120,444 because ordinary PG27 routing is still active; the command compares a **single invocation's** Q4 properties and current loaded Receiver totals, not an arbitrary screenshot from a previous tick. Do not assume 35 is a frozen world-wide count if the owner intentionally changed the world after prior screenshot. Capture all output. A single PASS suffices; **do not repeat** to accumulate confirmations.

If HOLD or command not found, share the exact messages and do not attempt to fix live Q4 state or invoke migration/cleanup commands.

## 3. Exact rollback to installed PG27

If structural PASS and both journals clear, stop LAB normally. Use the NEW backup tag from the PG31 install:

    & $pg31 -Mode Rollback -BackupTag 'lab-REPLACE_WITH_NEW_PG31_BACKUP' -Apply -ExpectedCommit $pg31Pin

Expected: \`PG31 LAB ROLLBACK COMPLETE\`, a new extra safety backup, and no auto-restart. Preserve all backups. Restart LAB normally, reconnect, and enter:

    /hartlogistics:status

Expected: \`1.5.10-LAB-PG27\`, sorter clear | queue clear. If rollback is refused, stop and provide the output; don't manually copy pack files or replace saved-world files.

## Evidence and closeout

Send the first PG31 status+census screenshots, exact rollback terminal output and final PG27 status screenshot. On accepted evidence, the temporary PR is closed without merging its operator commands or registry entry, and the documentation channel records the bounded findings. Existing BDS production is never touched.

No Q5 staging world properties are created and no authoritative state changes occur during this test. One successful complete census is only source-structure observation under ordinary BDS execution; it does not establish global maintenance isolation, lossless native MR slots, crash-atomic transaction history or production readiness.
