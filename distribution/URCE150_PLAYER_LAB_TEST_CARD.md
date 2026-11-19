# HartLogistics 1.5.0 — owner-player infrastructure LAB test card

**Product under test:** HartLogistics 1.5.0 development *infrastructure preview* on the **copied LAB only**, not production. This is **not** a full 1.5 network routing/Bulk/custody acceptance build. Current sorting/Collector/Receiver/Q4 behavior remains the unchanged 1.4.2 implementation; new Transporter/Bulk blocks are a visual infrastructure prototype.

**Distribution entrypoint:** [Start-HartLogistics-150Lab.ps1](Start-HartLogistics-150Lab.ps1), the one-file PowerShell source-pinned operator launcher. It clones or fast-forwards an isolated trusted checkout, not your existing C:\HartMods checkout; its guarded backend only targets the original exact copied LAB, and refuses unrecognized pack source/world registrations. **Do not manually copy the .mcaddon into an existing LAB world or bypass a refused preflight.**

## Before touching the LAB

1. Choose the exact **green** GitHub Actions run for the development branch/commit. Download its **one-file PowerShell launcher** (from the successful-run artifact or the exact pinned commit). Record the full SHA. The included .mcaddon and build-manifest are source artifacts and checksums, not an alternate authority to install.
2. **Plan (no server access):** Run the script with `-Mode Plan -ExpectedCommit FULL_SHA`; it prints the exact verified source and never touches LAB/production.
3. Stop the copied LAB BDS yourself. **CheckLab (read-only):** Run `-Mode CheckLab -ExpectedCommit FULL_SHA`. It must verify the exact known preceding packs, world registry, source and stopped process. **REFUSED means stop and bring back the entire output for diagnosis.** Do not delete/change files to force a match.
4. Only after CheckLab PASS, run `-Mode Install -Apply -ExpectedCommit FULL_SHA`. **Save the printed `lab-XXXXXXXXXXXX` backup tag**. No world reset, no automatic server restart, no production access. Any existing world data/migration concerns remain outside this preview's new custody paths.
5. Start the LAB server yourself. Inspect BDS load errors/script warnings, current world, pack/version/UUID, normal frame/Sorter functionality, and block registration before testing any new object.

## Player-first checks — use ANY valid layout and legitimate items

- Place a Transporter and a Bulk Storage block wherever you like. Confirm separate models/textures, inventory availability in Creative or `/give`, name and placement/break behavior. Record the actual item/block ID **only when needed to reproduce a failure**; there is no developer-prescribed XYZ or mandatory rig shape.
- Connect a network of adjacent Transporters with any number/shape, plus legacy Sorter/Collector/Receiver/Hopper endpoints. Interact with a Transporter; it should report **visible Transporter count and adjacent endpoint categories**. This is **undirected visual adjacency only**; do not infer directed route certification or cargo custody.
- Try a loop or connection across currently unloaded chunk boundaries. The preview should report a physical loop or incomplete boundary, not silently invent a trustworthy route. Keep player inventory, block placement and movement responsive during a larger network scan.
- Interact with the Bulk Storage preview. It should **explicitly say custody is inactive**, not accept/debit items or claim network storage capacity. Items **need not transit through Transporter blocks**; they are primarily human-visible infrastructure.
- Exercise previously working 1.4.2 sorting, native Hoppers and queue-driven Collector/Receiver movement on an appropriately configured **player-created valid layout**, selecting any legitimate ordinary items. For MR items, preserve the native identity and distinguish verified prior behavior from changes in this preview; no restricted item-ID allowlist.
- Record any error: source commit, relevant BDS logs/VS diagnostics/profile, actual configuration/item metadata and what the player observed. Optional exact coordinates are reproduction evidence **after** the issue, not a criterion for test validity.

## Results and safe return

**PASS** for this limited preview means new blocks register/display, local adjacency status behaves under varied valid player-built layouts, no script errors or gameplay responsiveness regression, and the preexisting 1.4.2 engine remains intact. **NOT PASSED**: actual URCE directed transfer/Bulk storage, durable MR carrier ownership, crash recovery, automated 1.5 migration or production approval. Those are separate later builds.

If you choose to return to the **exact previous installed LAB packs**, stop the LAB server, save any new test observations, then run the same script from the same pinned source SHA with `-Mode Rollback -BackupTag lab-XXXXXXXXXXXX -Apply -ExpectedCommit FULL_SHA`. The backend verifies current 1.5 hashes, saved prior pack fingerprints, exact backup registries and unrelated world-registration preservation **before writing**. Rollback does **not** undo gameplay changes you manually made in the test world, and never deletes existing world data; use your world backups separately if you want to revert player-created blocks/content. Keep the generated backup of the preview too.

No live server or saved world has been changed by source-only CI. Initial LAB acceptance is owner-run and not yet proven.

## 2026-11-18 missing texture incident note

The owner reported magenta-and-black checkerboards near the existing storage array under the first 1.5.0 candidate. Treat this as a **rendering acceptance failure**, not a player-placement fault. Before further gameplay tests, run the **read-only** [resource delivery diagnostic](Diagnose-HartLogistics-LABResources.ps1), inspect `texturepack-required` and client Creator Content Log, and preserve world/backup states. Source atlas/PNG checks do not establish client RP activation. [Full incident and evidence](../docs/URCE_150_RESOURCE_RENDERING_INCIDENT_20261118.md). No fixed XYZ or item selection required.

## Original multi-addon registry comments are supported

The owner confirmed world_resource_packs.json includes legitimate inline // comments and has been restarted/tested repeatedly. The initial resource doctor incorrectly rejected those comments with strict ConvertFrom-Json. Its corrected parser accepts JSONC without editing the original file. Do not remove comments, manually rewrite registrations, reinstall the add-on, or restrict testing layouts merely to run this read-only diagnostic.
