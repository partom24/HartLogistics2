# HartLogistics 1.5.8 — approved Git-pull PowerShell LAB test card

**Scope:** source-reviewed 1.5.8 hotpath cost reduction only. This is NOT a terminal Hopper routing repair, Bulk custody enablement, public release or live BDS performance acceptance. The original Q4 physical writer protection and terminal HOLD remain in place. Do not power down the affected redstone gate, release queued cargo, repair a blocked route by hand, or change production.

## One stable Git source / PowerShell operator

The approved source checkout is `C:\HartMods\HartLogistics2-URCE` on `dev/urce-150-runtime-20261118`. Keep that same checkout and the existing stable `distribution/Start-HartLogistics-Lab.ps1`; do not download a standalone script, import an mcaddon, cherry-pick, overwrite, reset or switch to a separate development branch.

In PowerShell:

```powershell
Set-Location C:\HartMods\HartLogistics2-URCE
git status --short
git branch --show-current
git pull --ff-only origin dev/urce-150-runtime-20261118
if ($LASTEXITCODE -ne 0) { throw 'Git pull failed; do not run installer' }
$sha = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[0-9a-f]{40}$') { throw 'Cannot pin full source SHA' }
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode Plan -CandidateVersion 1.5.8
```

**Required:** exact-HEAD CI must be green. Plan must print the exact `$sha`, validate the three reviewed changed files, and perform source-only checks without opening LAB. If the checkout is dirty, wrong branch or non-fast-forward, STOP; do not force-reset or silently delete files.

Stop only `C:\Servers\Thomas_MCBedrock - Copy (2)\bedrock_server.exe` yourself. Production may stay online. Run read-only preflight:

```powershell
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode CheckLab -CandidateVersion 1.5.8 -ExpectedCommit $sha
```

CheckLab requires the stopped authorized copied LAB with exact installed **1.5.7** BP/RP files and matching world registrations; it must reject any other version, mismatched file, changed registry or unrecognized state. Its checks do not edit the server.

If CheckLab prints PASS and you separately choose to install:

```powershell
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode Install -Apply -CandidateVersion 1.5.8 -ExpectedCommit $sha
```

Copy the exact newly printed `lab-XXXXXXXXXXXX` backup tag. Keep ALL prior backups and Q4. Do not restart BDS automatically or reset the world. The guarded installer should report 1.5.8 and new backup path; on mismatch or refusal **do not hand-copy packs or bypass the guard**.

**Rollback** (only if necessary, with copied LAB stopped, with the exact installed source SHA and backup tag; the old source checkout must be available):

```powershell
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode Rollback -CandidateVersion 1.5.8 -BackupTag 'lab-XXXXXXXXXXXX' -Apply -ExpectedCommit $sha
```

Do not paste the placeholder tag literally. Rollback restores pack files and world pack registrations from the verified backup; it does not undo in-world changes.

## Live-BDS acceptance, no Q4 cargo release

1. With the redstone safety gate still **powered**, start copied LAB BDS. Confirm the in-game version reports `1.5.8-dev`. Do not modify any original storage banks or powered blocks.
2. Record idle and matched controlled-workload VS Debugger CPU profiles and BDS `.mcstats`, server tick and script cost exactly as used for 1.5.7. Capture current vs baseline within matched sample windows; synthetic Node CPU mock profiles are **not** Bedrock TPS.
3. Re-check the existing Collector/Receiver route status, queue count, lifetime totals and Hopper output while the problematic terminal route remains on HOLD. **No queued-item movement permitted.** Stop immediately if the route unexpectedly changes to SAFE or cargo moves.
4. Record performance deltas, status, test server version, commit SHA and installer backup tag. Continue terminal-Hopper repair as a *separate* source-reviewed candidate after proof, never as part of this speed test.

No installation into production, no world reset, no automatic BDS restart, and no Q4 redistribution are authorized by this document.
