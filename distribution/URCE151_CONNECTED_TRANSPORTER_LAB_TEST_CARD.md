# HartLogistics 1.5.1 — owner LAB connected-Transporter visual acceptance

**This is a new, versioned 1.5.0 → 1.5.1 update candidate, not an instruction to change a world yet.** The **only gameplay/asset differences** from the owner's installed 1.5.0 are the 4×4-core Transporter model, six visual connection states, event-driven connection refresh, and the independent version number. Existing Sorter 1.4.2 cargo/Q4 and Collector/Receiver links remain unchanged. Bulk Storage stays an inactive preview.

## Evidence already accepted — do not make the owner repeat it

- The owner reported that **two separately player-built banks** each linked a Collector to a Receiver, and furnished screenshots showing link messages. This establishes **successful link setup**, not perpetual item movement or a new URCE transport custody path. The Receivers at the photographed moments reported **0 queued/delivered and "output hopper: missing"**; transfer-throughput acceptance needs its own explicit evidence.
- The owner placed a stack of Transporters and other blocks with **no missed placements**. On-screen Transporter inspection reported **6** on one stack and **8** near the banks, with sorter/collector/receiver endpoint counts. This establishes inspection and bounded local layout functionality, not directed or certified routing.
- The owner's visual/rendering incident was **resolved after clearing old 1.5.0 client-cached resource files**. Do not re-open it without new evidence. Do not change the same RP under the same version. The source commit used for those owner tests was **7fa7951f4a45f6e2a344856f3a715134d50f0fd8**, with rollback backup **lab-ad81804f1005**.
- Owner reports **similar timing while Hopper routing was active** and no obvious missed actions. A VS Diagnostics screenshot shows nonzero server tick/scripting load, but there is **no exact p95, total TPS or measured 1.5 comparative throughput from this screenshot**. Preserve the operational observation without inventing numerical performance PASS.
- The **fourth screenshot** is a visual design reference to historical PG26/PG27/PG33's narrow pipe, not an approval to revive PG26 routing or Q5. [Accepted PG27 seam evidence](../docs/project-reference/README.md), original history [PG27 source and correction](https://github.com/partom24/HartLogistics2/blob/main/docs/PG27_TRANSPORTER_VISUAL_CORRECTION.md).

## What changes in 1.5.1

- The Transporter keeps identity `hartsorter:transporter`, with **4×4×4 pixel core** and 4×4 cross-section directional arms extending to its neighbor-facing block boundary. This is a small model *inside one Minecraft block cell*, not a 4×4-world-block multiblock.
- Six arms are shown **only when a directly face-adjacent known endpoint exists**: Transporter, Sorter, Collector, Receiver, Bulk Storage, native Hopper, Chest, Trapped Chest or Barrel. No visual connection to ordinary stone/air. **A visible arm does not certify a directed cargo route or native inventory admission.**
- Placement/break events refresh the affected pipe and its nearest six neighbors, coalesced into at most **8 visual positions per tick**. A model state only changes when needed. There is **no new per-block onTick, global polling timer or cargo writer**; unavailable/unloaded neighbors are not silently treated as disconnected.
- The original **PG27 east/west model reflection correction** is preserved. Two separate world and held-item geometries are used, with the existing accepted 1.5 teal texture. A right-click of a previously placed Transporter refreshes its local visual state after upgrade.
- Both pack header/module versions and BP→RP dependency are increased to **1.5.1**. Prior 1.5.0 pack identities are preserved, but old and new payloads cannot share an ambiguous version.

## LAB installation (after exact-head CI passes)

Download **`Start-HartLogistics-151Lab.ps1`** from the exact reviewed commit / passing Actions artifact. The one-file PowerShell launcher uses its own isolated Git checkout, verifies a *source pin*, checks that installed packs are the original **exact 1.5.0 predecessor**, verifies JSONC registry bytes and preserves unrelated mod entries.

```powershell
$sha = "<full reviewed 1.5.1 candidate Git SHA>"
$launcher = "$env:USERPROFILE\Downloads\Start-HartLogistics-151Lab.ps1"
& $launcher -Mode Plan -ExpectedCommit $sha
# Stop copied LAB BDS yourself, then:
& $launcher -Mode CheckLab -ExpectedCommit $sha
# Only after PASS and explicit decision to update:
& $launcher -Mode Install -Apply -ExpectedCommit $sha
```

The installer **never touches production, resets worlds, or restarts BDS**, and records a **new** backup tag when installation completes. To restore **only the old installed packs and registrations** later, stop BDS and use the *new backup tag* with `-Mode Rollback -BackupTag lab-XXXXXXXXXXXX -Apply -ExpectedCommit $sha`. A pack rollback does **not** undo player-created blocks or world state. Never substitute the old `Start-HartLogistics-150Lab.ps1` for this upgrade.

## Player-led checks — any valid layout, no prescribed coordinates

1. Start copied LAB normally and confirm both packs load at **1.5.1** without Content Log missing geometry. Client may need to evict an actual older cached version if a real conflict is identified; do not indiscriminately clear unrelated packs.
2. Build any small or large arrangement of Transporters. Confirm the 4×4 core and arms visually join at each side. Rotate your view, test east/west, up/down, branches, straight runs and loops.
3. Place a **known** face-adjacent component (existing Sorter, Collector, Receiver, Bulk, Hopper, Chest or Barrel); arm should appear. Place an ordinary non-endpoint block; no arm should appear. Remove a neighbor; the corresponding arm should disappear without changing other arms. Test existing pipe if convenient by interacting once.
4. Use the two existing linked banks if convenient; do **not** rebuild them. Verify Collector→Receiver relationships still exist. With output Hopper missing in the photographed test, do **not** claim completed delivery; use your normal configuration for any cargo regression when you choose.
5. Place/break another stack of blocks, move, open chests and Sorter UIs and observe responsiveness while Hopper routing is active. Record the BDS diagnostics capture if you choose to make a quantitative comparison. Item choice, coordinates and bank layout are player-controlled.
6. Interact with Transporter: **inspection counts topology** but never says a directed route is certified. Interact with Bulk: **no custody enabled**. No new 1.5 network/physical cargo path is advertised by this visual test.

**PASS for this slice:** correctly joined 4×4 model, recognized neighbors only, appearance/disappearance on placement/break, stable gameplay responsiveness and intact prior 1.4.2/Collector/Receiver functionality. **Not proven:** native MR custody, Bulk transfers, automatic network routing, cross-chunk reachability, infinite delivery or comparative throughput.

On any `REFUSED` by updater, stop and return the entire output. Preserve the owner's original backup and do not manually overwrite versioned RP/BP files.
