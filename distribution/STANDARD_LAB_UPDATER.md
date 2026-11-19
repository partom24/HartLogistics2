# Standard Git-managed HartLogistics LAB updater

**Owner process decision — 2026-11-19.** New candidates must NOT require downloading a new PowerShell file. Maintain one stable tracked entrypoint: `distribution/Start-HartLogistics-Lab.ps1` on the active development branch. The matching versioned launcher and Python backend stay tracked in that same repository. For the current candidate, the stable entrypoint dispatches to the existing guarded **1.5.0 → 1.5.1** operator. It does not change BP/RP, worlds, backups or the release boundary.

## One-time Git checkout (Windows PowerShell)

Use a separate source folder (not the Minecraft server and not an existing unrelated 1.4.1 checkout):

```powershell
git clone --single-branch --branch dev/urce-150-runtime-20261118 https://github.com/partom24/HartLogistics2.git C:\HartMods\HartLogistics2-URCE
Set-Location C:\HartMods\HartLogistics2-URCE
```

If you already have a clean clone on **that exact branch**, reuse it. Never replace or forcibly reset an existing source tree.

## Every future LAB candidate (same commands and same filename)

```powershell
Set-Location C:\HartMods\HartLogistics2-URCE
git pull --ff-only origin dev/urce-150-runtime-20261118
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode Plan
```

**Plan** reads Git source and validates the pinned candidate but does not contact LAB. Record the full **40-character** `Source SHA` in its output. The matching code revision must have **successful exact-HEAD CI**. Stop the copied LAB server yourself, then:

```powershell
$sha = '<40-character SHA printed by Plan>'
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode CheckLab -ExpectedCommit $sha
# If CheckLab passes and you choose to install:
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode Install -Apply -ExpectedCommit $sha
```

Record the **new** `lab-XXXXXXXXXXXX` backup tag printed by Install. On a later explicit decision to roll back the installed pack files/registries (server stopped), use that **specific** backup tag and the installed candidate's **original** source SHA:

```powershell
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode Rollback -BackupTag 'lab-XXXXXXXXXXXX' -Apply -ExpectedCommit $sha
```

A subsequent Git pull does **not** silently deploy an add-on, rewrite Bedrock pack/world registrations, clear caches, restart BDS or touch `C:\Servers\Thomas_MCBedrock`. `Install -Apply` remains a distinct explicit owner action for **only** `C:\Servers\Thomas_MCBedrock - Copy (2)`; the backend verifies stopped server, known predecessor file hashes, UUIDs, versions, registry integrity, backup and rollback. A pack rollback does not revert blocks the player placed in the world.

## Standardization requirements for following 1.5.x versions

- Keep the **stable** `distribution/Start-HartLogistics-Lab.ps1` filename/flags and checked-out source process. Do not provide new launcher downloads as the normal handoff. No automatic deployment hook on `git pull`.
- Add a **new versioned** guarded PowerShell/Python candidate pair when BP/RP source changes; increment both manifests/dependency and pin exact supported predecessor bytes. Do not loosen an existing candidate's hash check to accept arbitrary versions.
- Extend the stable wrapper's small, audited candidate registry and update its default. **Retain prior versioned launchers** for exact backup rollback. Use `-CandidateVersion` explicitly when rolling back an older supported candidate after future releases.
- Every real candidate must validate source Git origin/branch, clean HEAD, full SHA, PowerShell preflight, staged file/registry hashes, interrupted-apply rollback and standalone Windows synthetic upgrade/rollback tests. CI success is not native BDS testing.
- Refuse unrecognized versions, wrong branch/checkout, dirty worktree, symlinked sources, stale pin, unexpected LAB predecessor, production directory, missing backup or any ambiguous ownership. Do not work around a `REFUSED` by hand copying pack files.
- `main` remains the canonical archive for historical evidence and old operator processes. The current stable launcher is part of the **active URCE branch**; new branches must carry it forward.

## 2026-11-19 — 1.5.3 installed-1.5.2 repair path

The owner has **already installed 1.5.2 from exact commit `df9479c87efedebeca9bab8f8f8c4a1fe1148e21`** into the copied LAB using CheckLab followed by explicit `Install -Apply`. They retained installer backup `lab-0bff63ebe84e`. The in-game 1.5.2 status command loads and 1,442 Sorters / 60 Collectors / 38 Receivers / 294,294 queued Q4 items are visible. A new, owner-built two-bank fixture shows **all link attempts HELD: invalid_native_observation**, so 1.5.2 is not accepted for loop guarding. This is a real code/testing blocker, not a request to rebuild the physical 13-bank storage structure.

The stable launcher on the development branch now **defaults to 1.5.3**. The versioned backend `scripts/hartlogistics_153_lab_updater.py` requires the exact **already installed 1.5.2 predecessor** and four reviewed file changes (BP/RP manifests, main script, pure link observer); no new files in the packs, no world queue migration. It must refuse unknown pack bytes or altered registrations. Older 1.5.1/1.5.2 wrappers remain available via explicit `-CandidateVersion` for historical work as appropriate; they do not bypass the new guarded update.

Use the **same Plan / CheckLab / Install -Apply / Rollback -Apply commands above**. Never paste the angle-bracket SHA placeholder literally; assign `$sha` the exact 40-character source commit printed by Plan. CheckLab and a stopped copied-LAB server remain mandatory before Install; this documentation does not authorize installing until the owner chooses to do so. Preserve all Q4 data and both old and new backup directories.

See [1.5.3 two-bank retest card](URCE153_LEGACY_LINK_FIX_LAB_TEST_CARD.md). **No item cargo test until valid forward link and prohibited back-edge rejection are observed in native Bedrock.**

## Historical versioned safety candidate — 1.5.2

The fixed entrypoint `distribution/Start-HartLogistics-Lab.ps1` now defaults to **1.5.2**, preserving the same Plan/CheckLab/Install/Rollback flags and Git-pull workflow. The guarded backend is `scripts/hartlogistics_152_lab_updater.py`, with a pinned, immutable **1.5.1 exact-pack predecessor**. `-CandidateVersion 1.5.1` retains the historical versioned 1.5.1 wrapper (for an explicitly selected prior candidate), but must not be used to bypass the current 1.5.2 source/compatibility gates.

**Critical owner state:** The owner confirms all 13 **physical storage runs** are built in copied LAB, but no Transporter, Receiver or Collector has been placed in this 13-bank array. The older owner-confirmed 2-bank Collector/Receiver link loop is a *different* regression fixture. Do not infer current 13-bank link registration from the workbook; do not require owner to reconstruct the 13-bank storage room. The current link-safety source candidate is *not* a playable full URCE/Bulk system.

**Install authority remains separate.** Only after a successful exact-HEAD source/Windows updater CI and explicit owner approval may a stopped copied LAB CheckLab determine if the actual installed BP/RP bytes and registrations match 1.5.1. If absent/older/unknown, the updater must REFUSE (do not hand-copy files, skip predecessor versions, or touch production). A Git pull is not an install.

## Current acceptance scope

Owner-confirmed 1.5.1 Transporter compact 4×4 geometry and face-adjacent HartLogistics visual connections are **scoped visual PASS** (HL-E-URCE151-VISUAL-003). Actual full URCE routing, Bulk custody, native MR carrier integration, quantitative performance and release remain open. This distribution-only change does not enable any new custody writer or touch owner LAB/production files.
