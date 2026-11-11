# PG32 — One-shot Bedrock beforeEvent cancellation proof (temporary LAB only)

**Status:** Temporary source/test candidate; **do not install until exact final Git SHA and CI are green** and a developer provides the pinned commands. After the bounded test, guarded rollback to the already-installed PG27 is required. Close this PR **without merging** temporary runtime commands.

## What is being tested, why, prior evidence, action, PASS

**What:** On the owner's stable **nonexperimental BDS 1.26.63.1 LAB**, prove that the actual, pre-existing PG27 `world.beforeEvents.playerInteractWithBlock` callback can return early **without throwing**, synchronously setting `ev.cancel = true` for **one explicitly armed operator's Collector click**. Verify the same Collector works normally immediately afterward.

**Why now:** Merged Q5 PRs #64/#65/#72/#74/#75 are source/offline safety models, not proof that a nonthrowing Bedrock before-event cancellation executes before the original UI mutation/deferred code. This is the next narrow runtime feasibility gate for a future world-wide maintenance stop.

**Previously accepted and reused:** PG08 Collector UI and linking were owner-tested, PG27 running/visual behavior observed, PG30 temporary world-property normal-restart test completed, PG31 35-Receiver Q4 read-only census/rollback completed. **Do not repeat their item cargo, MR, Transporter, Q4 census, reboot-durability, or block geometry tests.**

**Operator action:** One exact PG27 → PG32 stopped-LAB update, one armed Collector interaction and one immediate unarmed interaction, then exact guarded rollback to PG27. There is **no new block/physical rig to build**; use one *existing accessible* Collector in an isolated safe area of the already-cloned ThomasServer LAB world, empty hand, without changing inventory, filters, links or block state.

**PASS:** First click is cancelled and PG32 reports `last=CANCEL_READBACK_TRUE cancelled=1 armed=NO`. The ordinary unarmed Collector menu opens on the next click (close it without modifying anything). Both before and after status show clear journals; PG32 rollback restores PG27. Report this as **bounded runtime nonthrowing callback cancellation**, NOT global migration/freeze proof.

**HOLD/stop:** unknown command; wrong version; journal not clear; unexpected inventory/Q4 status; no cancellation readback; unexpected menu/action on armed click; inability to reopen menu; source/preflight refusal. Do not retry the click to manufacture a PASS or force a rollback if hashes disagree. Run `q5cancelclear` to disarm if the diagnostic is still armed.

## Boundaries

- **Only** `C:\Servers\Thomas_MCBedrock - Copy (2)`, world `ThomasServer`; **never** production `C:\Servers\Thomas_MCBedrock`.
- PG32 derives exact PG27 `1.5.10` into temporary `1.5.14-LAB-PG32-NOTHROW-BEFORE-EVENT`, preserving the original pack UUIDs, 72-file source baseline, Q4 queue/journal, all other mods, PG25 HOLD and Transporter gameplay.
- Three `GameDirectors` / no-cheats temporary commands are in **this test branch only**: `q5cancelarm`, `q5cancelcheck`, `q5cancelclear`.
- A single `hartsorter:collector` player interaction from the arming player's ID is eligible, for **at most 1200 server ticks**. No canceled click is replayed. Wrong player, wrong block, unarmed, expired, or unknown state flows into the original PG27 callback unchanged.
- The temporary operator arm exists **in server memory only**, disappears on restart, and writes **no dynamic property**, Q4 page, journal, inventory, block, metadata or migration state.
- This does **not** stop other Hart callbacks, ticking routes, vanilla Hoppers, other players, foreign add-ons, or physical writers. It does not test Q5 durable marker/epoch, identity, migration, writer fencing, atomicity, restart recovery, or loaded/unloaded Receiver safety.
- Keep PG27 and all older backups; stop LAB before all installs/rollbacks. No server auto-restart, world reset, forced crash, experiment toggle or production operation.

## 1. Pinned launcher download and source-only/stopped-LAB checks

After developer supplies exact final commit, replace `DELIVERY_SHA` with the **full 40-character pinned SHA**; execute this in PowerShell. Stop LAB normally before CheckLab/Install:

```powershell
$pg32Pin = 'DELIVERY_SHA'
$pg32 = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-PG32Lab.ps1'
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/partom24/HartLogistics2/$pg32Pin/candidates/pg32/Start-HartLogistics-PG32Lab.ps1" -OutFile $pg32
Test-Path -LiteralPath $pg32 -PathType Leaf
& $pg32 -Mode Plan -ExpectedCommit $pg32Pin
& $pg32 -Mode CheckLab -ExpectedCommit $pg32Pin
& $pg32 -Mode Install -Apply -ExpectedCommit $pg32Pin
```

Plan should print `PG32 SOURCE PASS`, **BP 18 / RP 59**, and `No LAB/PROD/world files accessed.` CheckLab must report read-only preflight PASS on *exact installed PG27* (it refuses different versions and hashes). Install prints a fresh `lab-<12 lowercase hex>` backup tag: capture it verbatim for rollback. Do not use an older PG31 tag.

## 2. One bounded nonthrowing interaction

Start LAB normally, log in, verify status **1.5.14-LAB-PG32-NOTHROW-BEFORE-EVENT** and **sorter clear | queue clear**.

At one existing **Collector** with no item in hand (do not build or break any block):

```text
/hartlogistics:status
/hartlogistics:q5cancelcheck
/hartlogistics:q5cancelarm
```

The initial check should report `last=NOT_RUN cancelled=0 armed=NO`. Arm should report one eligible Collector interaction within 60 seconds. **Right-click the Collector once** while armed. The normal menu should **not** open. Then:

```text
/hartlogistics:q5cancelcheck
```

Expected `last=CANCEL_READBACK_TRUE cancelled=1 armed=NO`. Do **not** arm again. Right-click that same Collector **once, unarmed**, confirm its ordinary menu opens, then close it **without changes**. End with:

```text
/hartlogistics:q5cancelclear
/hartlogistics:status
```

Expected status journals clear. If PG32 reports `EXPIRED`, `CANCEL_EXCEPTION_HOLD`, `CANCEL_READBACK_FAILED`, or click behavior is unexpected, report exact output; classify as HOLD, not PASS. Disarm with `q5cancelclear`. No Q4 data should be edited or cleared.

## 3. Exact PG27 restoration (not optional)

Stop LAB normally. With the **new PG32 installation backup tag**, and the **same pinned commit**:

```powershell
& $pg32 -Mode Rollback -BackupTag 'lab-REPLACE_WITH_PG32_INSTALL_TAG' -Apply -ExpectedCommit $pg32Pin
```

Expected `PG32 LAB ROLLBACK COMPLETE` plus a new safety-backup tag. Preserve both tags and earlier backups. Restart LAB normally and check:

```text
/hartlogistics:status
```

Expected `1.5.10-LAB-PG27`, clear journals and no PG32 command registration. If the guarded rollback refuses, stop, retain backups and share output; **never manually copy pack files or edit world registries**.

## Evidence handoff / cleanup

Provide: initial PG32 status, one-shot `q5cancelcheck` readback and whether the normal menu was absent/present for each click, final PG32 status, actual rollback console lines/tags, and postrollback PG27 status. No Q4 screenshots or item movement tests needed. Once owner evidence and exact rollback are verified, **close temporary PG32 PR without merge**. Preserve retained source-only regression tests separately if appropriate; remove temporary runtime source/registration with the branch.
