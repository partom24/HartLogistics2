# PG33 — Real Receiver Q4 → Transporter → Sorter delivery (one bounded LAB session)

**Delivery state:** Candidate, **not yet approved to install** until exact final SHA and 100% CI are provided. Never use an older PG33 SHA, manually copy pack files, or touch production. This test is ONLY for a newly created disposable LAB rig, NOT the owner's 35 historically populated Receivers.

## 1. Why this test deserves your time

**Gameplay purpose:** Validate a genuinely new ability: a Hart Receiver holding ordinary Q4 items can output **through Transporter pipes to a Sorter and native chest** without requiring the old Hopper directly beneath the Receiver.

**What engineering question it answers:** Does the actual BDS 1.26.63.1 route debit exactly one eligible FIFO Q4 item segment through the existing PG25 journaled writer and physically credit the correct native output *while observing redstone pause*, with no item loss/duplication and no outstanding journals?

**What PASS unlocks:** Scoped acceptance of this **new ordinary Receiver → pipe** output route for further Transporter work. No repeat of PG27 ordinary barrel input, PG31 read-only census, PG32 before-event probe or MR tests.

**What it DOES NOT prove:** Q5 storage/migration, MR/Bulk custody, global freeze, durable crash atomicity, third-party writer isolation, cross-chunk routes, double-chest support or production release.

**Operator work:** One stopped-LAB upgrade from exact PG27 and subsequent guarded rollback; one small, clearly isolated rig and **two** in-game checkpoints (paused queue, then unpowered delivery). Do not repeat tests to manufacture a PASS. No forced crash or extra restart.

**PASS:** With Sorter powered, exactly 8 plain cobblestone move from the test Hopper source into **only the new Receiver Q4 queue**; the output chest remains empty. After unpower, exactly 8 cobblestone appear in the output chest, new Receiver queued count becomes 0, and **both journals clear**. The LAB allowlist prevents historical Receiver queues from being debited through this new route; their original PG27 routing may continue independently.

**HOLD:** Unexpected inventory changes, missing/unloaded block, competing Hopper or inventory, wrong/double chest, failed links, version/registration mismatch, wrong per-Receiver count, unexpected count or identity at output, pending journal or any change outside isolated rig. Stop, retain all backups; do not clear journals, drain historical Q4 queues, delete an occupied Receiver or repair by hand.

## 2. Scope and exact source

- Target ONLY `C:\Servers\Thomas_MCBedrock - Copy (2)`, existing production-derived world `ThomasServer`; hard deny `C:\Servers\Thomas_MCBedrock`.
- Exact installed PG27 1.5.10 is the predecessor; source-only derived PG33 1.5.15. Original 72-file baseline and UUIDs identical; only the existing Q4 dequeue writer gets opt-in pipe admission. Q4 authority remains unchanged.
- No new native container, Q5 property, migration, Bulk capacity, pipe inventory or controller.
- **Additional LAB-only allowlist:** the new pipe route is permitted ONLY for **column (-940,70,-791) and Receiver (-938,70,-791) in the Overworld**. All historical Receiver / other Sorter coordinates remain on their original PG27 behavior, even if pipes happen to be adjacent. This allowlist is deliberately not a production network feature; generalizing it requires a later separately reviewed change.
- New route requires exactly one registered Q4-v4 Receiver, no legacy output Hopper, at most 16 fully loaded same-chunk pipes, one Sorter column, redstone-respected ordinary item, **one non-double 27-slot chest/barrel** in an empty destination slot. Unsupported/opaque queue-head stays queued. Original legacy output Hopper behavior remains as PG27.
- Installer Plan has no LAB access; CheckLab is read-only and hashes two exact PG27 packs/registrations; Install/Rollback require `-Apply`, SHA pin and LAB server stopped. Backups are retained; no automatic restart.
- **Never** move items from an already-populated Receiver into this prototype. Create one new test Receiver/Collector, then leave existing queues and world untouched. If the planned test location is occupied, DO NOT demolish old builds; report the conflict before installation/testing.

## 3. Full copy-paste bootstrap, stopped-LAB preflight and guarded installation

**Stop LAB normally first.** Leave production untouched. The final SHA will be supplied only after CI is fully green. Replace `DELIVERY_SHA` with the exact 40-digit developer-delivered hash:

```powershell
$ErrorActionPreference = 'Stop'
$pg33Pin = 'DELIVERY_SHA'
$pg33 = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-PG33Lab.ps1'
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/partom24/HartLogistics2/$pg33Pin/candidates/pg33/Start-HartLogistics-PG33Lab.ps1" -OutFile $pg33
if (-not (Test-Path -LiteralPath $pg33 -PathType Leaf)) { throw "PG33 launcher missing" }
& $pg33 -Mode Plan -ExpectedCommit $pg33Pin
& $pg33 -Mode CheckLab -ExpectedCommit $pg33Pin
```

Expected Plan: original 72 files immutable; **BP 18 / RP 59**; `No LAB/PROD/world files accessed.` Expected CheckLab: both exact LAB Hart BP/RP print **operation INSTALL**, `PG33 READ-ONLY PREFLIGHT PASS; nothing changed.` On any refusal, **STOP**; do not install.

After complete preflight PASS and the owner's normal stopped-LAB confirmation:

```powershell
& $pg33 -Mode Install -Apply -ExpectedCommit $pg33Pin
```

Expected: `PG33 LAB INSTALL COMPLETE` with a **new** `lab-<12 lowercase hex>` backup tag containing the exact prior PG27 pack/registrations. Record that exact tag. Preserve `lab-90c35fd06150` from PG32 and all earlier PG27/PG31 backups. Do not restart automatically.

Start LAB normally, verify `/hartlogistics:status` reports **1.5.15-LAB-PG33**, Q4 35/35 historical Receivers (before placing test R), migrations 0, **sorter clear | queue clear**. Any mismatch is HOLD; don't build the rig.

## 4. READY rig card — ONLY in verified clear, empty LAB space

Use Overworld and first inspect the full bounding area **x -941 to -934, y 69 to 72, z -793 to -789**. This is a prospective test location, **not proof that the region is empty**. If it contains old machines, redstone, chests, inventories, pipes or another add-on's blocks, **STOP; do not break them**. No world reset, old queue draining or relocation of existing items.

The entire active path fits in chunk X=-59 (-944..-929) and Z=-50 (-800..-785).

**New rig inventory:** 2 Transporters, 1 Sorter, 1 Collector, 1 Receiver, 1 vanilla Hopper, 2 **single** chests, 1 lever and 3 plain stonebrick supports. Output chest must have **all 27 slots empty**. No double chests, powered/foreign adjacent sources, neighboring pipe networks or output Hopper beneath R.

| Role | XYZ | Exact instruction |
|---|---|---|
| Output Sorter S | **(-940,69,-791)** | Face output **south (+Z)**; select **WILDCARD**; no filter |
| Output single chest O | **(-940,69,-790)** | South of S, ordinary 27 empty slots, no adjacent chest |
| Transporter P0 | **(-940,70,-791)** | Immediately above S |
| Transporter P1 | **(-939,70,-791)** | East of P0 |
| Test Receiver R | **(-938,70,-791)** | East of P1; NO Hopper at (-938,69,-791); support with stonebrick |
| Test Collector C | **(-936,70,-791)** | Two east of R; support with stonebrick |
| Input Hopper H | **(-935,70,-791)** | Immediately east of C, spout **west (-X) toward Collector**, support with stonebrick |
| Input single chest I | **(-935,71,-791)** | Above H, initially empty |
| Sorter pause lever | **(-940,69,-792)** | On north face of S; initially ON (powered) |
| R/C/H supports | **(-938,69,-791), (-936,69,-791), (-935,69,-791)** | Three ordinary stonebrick blocks; NO inventory under R |

Path: `I ↓ Hopper → Collector C → (linked Q4) Receiver R → P1 → P0 ↓ Sorter S → O`.

Do not place an input chest next to a pipe. Do not attach any additional pipe to R. Pipe arms displaying connections are only visual; the route must pass live graph admission.

After rig placement, **select C** using existing Collector interaction/menu and **link to R** using existing Link/Relink workflow. Confirm the *new* Receiver status reports **1 Collector linked**, queued **0**, **output hopper missing** (expected: the route uses pipes), and both journals clear. The old generic Receiver help text about a Hopper is legacy UI, not a reason to add a Hopper.

## 5. Two owner checkpoints — real gameplay PASS, not a diagnostic

**Check A — powered pause and Q4 custody.**

Confirm lever ON and output O empty. Put **exactly 8 plain vanilla cobblestone** in input chest I; no other items. Let the Hopper feed C and Q4. Use the Receiver interaction to inspect **R's specific queue** (do not infer from changing world-total `/status` because old global queues remain active). Expected: I/H become empty, **new R queued = 8**, O still empty, S powered; `/hartlogistics:status` journals clear. Capture R's queue line and O emptiness together. If this state does not occur, HOLD; do not unpower.

**Check B — unpowered physical delivery and conservation.**

Turn the SAME lever OFF once. Allow a normal tick and inspect: new R queued **0**, O has **exactly 8 plain cobblestone in one slot**, I/H remain empty and both journals clear, migrations 0. Capture the output slot, per-Receiver queue and `/status` journal lines. No second item batch or repeat test.

**On HOLD:** Leave any queued items in test Receiver untouched. Do not destroy C/R/H or drain/clear Q4. Stop and share evidence for a recovery/rollback decision; a PG27 rollback can leave queued items safely in R but will not provide this new pipe egress. Never dismantle an occupied R just to tidy the rig.

## 6. Mandatory exact PG27 rollback and evidence

Stop LAB normally. Use only the **new exact PG33 Install tag**; never substitute PG32/PG31 backups:

```powershell
& $pg33 -Mode Rollback -BackupTag 'lab-REPLACE_WITH_THIS_PG33_INSTALL_TAG' -Apply -ExpectedCommit $pg33Pin
```

Expected `PG33 LAB ROLLBACK COMPLETE` and another retained safety backup. No auto restart. If hash/registry differs, script refuses; do not manually copy files. Start LAB normally, run `/hartlogistics:status` and verify original **1.5.10-LAB-PG27**, journals clear, migrations 0, original 35 historical Receivers still registered (plus any newly placed test R if retained). **Do not destroy a new Receiver until its queue is independently verified empty**; preserve all backup tags.

**Evidence to provide:** initial PG33 version/journals, Check A R=8/O=0, Check B R=0/O=8, before/after output stack identity, final PG33 journals, exact rollback PowerShell output/tag, restored PG27 status. This establishes only bounded ordinary Receiver-pipe delivery, not Q5 migration or crash-save correctness.

**No installation request until final-head CI and route safety review explicitly mark PG33 test-ready.**
