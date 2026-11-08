# PG27 — Transporter east/west visual correction

**What:** correct the world-model east/west arms and show `Hart Transporter` instead of a raw translation key. **Why now:** the owner's PG26 screenshots show gaps on that axis and the untranslated name. **Prior evidence:** PG26 installed from `6738497fd7077831abd316e257a4281d97fa0ae8`, backup `lab-d16a31ba5a8e`; BDS 1.26.63.1 startup confirmed. Latest screenshot shows 664 Sorters / 56 Collectors (45 linked, 11 unlinked) / 35 Receivers, Q4 paged 35/35 and both journals clear. This is registration/rendering evidence with a visual defect; ordinary Transporter item routing is still unaccepted. Accepted PG25 tests stay closed.

**Action required:** one guarded LAB update and two visual checks below, reusing the existing rack. **Pass:** correct name and continuous east/west connections, including removal/replacement. **Temporary runtime instrumentation: NONE.** No experiments, live-journal injection, forced kill, production operation or world reset.

## Update the existing PG26 installation

Keep the placed Transporters and existing rig. Leave new-route inventories empty during these visual checks. No requirement to drain existing Receivers or dismantle old rigs. Both journals were clear in the supplied screenshot; check again before the normal LAB shutdown if any new routing occurred.

Stop only LAB BDS normally. Keep all previous world/PG20/PG25/PG26 backups, especially `lab-d16a31ba5a8e` and `lab-36ead7340407`. The launcher refuses a running LAB, unexpected pack bytes, registration, source SHA or target path. It never restarts BDS.

The developer supplies the final green main-branch SHA with the handoff. Substitute that exact 40-character SHA for `DELIVERY_SHA` below; do not use the old PG26 SHA or infer approval from a newer main revision.

```powershell
$pg27 = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-PG27Lab.ps1'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/partom24/HartLogistics2/main/candidates/pg27/Start-HartLogistics-PG27Lab.ps1' -OutFile $pg27
Test-Path -LiteralPath $pg27 -PathType Leaf
$pg27Commit = 'DELIVERY_SHA'
& $pg27 -Mode Plan -ExpectedCommit $pg27Commit
& $pg27 -Mode CheckLab -ExpectedCommit $pg27Commit
& $pg27 -Mode Install -Apply -ExpectedCommit $pg27Commit
```

Expected: Python 3.12 (already installed; 3.11+ supported), source-only PASS BP 18 / RP 59, read-only preflight PASS, then INSTALL COMPLETE and a **new** backup tag containing PG26. Only canonical LAB `C:\Servers\Thomas_MCBedrock - Copy (2)` is authorized. The launcher obtains the full clean pinned checkout at `%LOCALAPPDATA%\HartLogistics2-PG27-LAB`; no manual pack copy or `.mcpack` step.

Start LAB normally and reconnect the client so it receives resource pack **1.5.10**. Run `/hartlogistics:status`: require **1.5.10-LAB-PG27**, `sorter clear | queue clear`. Preserve the owner's existing topology; do not rebuild just to match earlier PG26 card counts. If this gate fails, provide the relevant status/error and do not put items into the new route.

## READY rig card — reuse the owner's existing empty visual rack

- **No new construction:** reuse the six-way Transporter cross shown near the owner's HUD positions x -951..-954, y 69..73, z -806..-814. These are viewpoint positions, not invented exact block coordinates. The test selects the two actual east/west neighbors of the existing junction by coordinate direction.
- **Additional blocks/machines/columns/containers/supports:** zero. Use the existing junction and its two neighboring free Transporters; do not move attached machines or inventories. No item input/output, Sorter mode, facing or powered transfer state is required for rendering.
- **Orientation:** east is increasing world X; west is decreasing X; north/south are Z. Ignore apparent left/right as the camera rotates. No new spacing or separation constraint; this check grants no routing authority to the rack or nearby machines.
- **Source items:** zero; existing held Transporter is enough for the name check. Breaking a free test pipe returns that same test-owned pipe for replacement; retrieve it if needed before replacing. Keep nearby inventories and all non-test blocks untouched.

### A — Name and placed connections

Hover the existing Transporter in inventory: expect **Hart Transporter**. Inspect the existing cross from both sides: expect continuous pipes to both east and west neighbors, with no inward gap or arm pointing into empty space. North/south/up/down should still render as before. Wait at least one second for connection ticks after a block change.

### B — East/west removal and replacement

Remove only a free test Transporter directly east of the junction. The junction's east arm should retract; west and the other occupied directions stay connected. Replace it: the east seam closes. Repeat on the west side. No chest, Sorter, Collector or Receiver needs moving. Return the rack to its original arrangement; keep items out until the visual result is accepted.

Report the name and whether each X-side retracts/reconnects correctly. A screenshot of any remaining gap is useful. No PG25 transfer repeat or extra post-test restart is requested.

## Remaining PG26 route scope

The original [PG26 ordinary/redstone route](../pg26/TEST_SESSION.md) remains pending. This patch leaves all routing/custody logic and same-chunk constraints unchanged. That route requires one input chest/barrel and a **Sorter**, with a native output below the pipe intake. Collector/Receiver endpoints are intentionally refused by this first prototype. The visual rack itself is not evidence of an eligible item route. Do not feed a Receiver-attached cross to test this prototype.

## Rollback

PG27 → PG26 preserves Transporter identifiers/states and reintroduces the known visual issue. If rollback is needed, stop LAB normally with clean journals; use the **new PG27 install backup tag**, not `lab-d16a31ba5a8e` (that older backup contains PG25):

```powershell
& $pg27 -Mode Rollback -BackupTag 'lab-REPLACE_WITH_NEW_TAG' -Apply -ExpectedCommit $pg27Commit
```

The placeholder is intentionally refused until replaced by the actual `lab-` plus 12 lowercase hex characters printed at PG27 installation. Unexpected post-install edits cause refusal. No journal repair, world rollback or production action is performed.
