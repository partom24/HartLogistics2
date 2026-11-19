# Recovered PowerShell-first HartLogistics LAB distribution process

**Review: 2026-11-18.** The earlier Python-centric distribution audit missed the actual historical operator workflow because it looked only in current branch scripts/, not historical candidates/ subtrees. This is a source review, NOT runtime or production authorization.

## Exact source references

- [PG27 PowerShell launcher on main](https://github.com/partom24/HartLogistics2/blob/main/candidates/pg27/Start-HartLogistics-PG27Lab.ps1), [its guarded Python backend](https://github.com/partom24/HartLogistics2/blob/main/candidates/pg27/lab_deploy.py) and [round-trip installer tests](https://github.com/partom24/HartLogistics2/blob/main/tests/test_pg27_lab_deploy.py). Similar launchers exist for PG08, PG13, PG14, PG15, PG20, PG23, PG24, PG25 and PG26 on main.
- [UCE one-file launcher](https://github.com/partom24/HartLogistics2/blob/dev/uce-shared-ordinary-ledger-20261111/candidates/uce/Start-HartLogistics-UCELab.ps1) and [UCE guarded backend](https://github.com/partom24/HartLogistics2/blob/dev/uce-shared-ordinary-ledger-20261111/candidates/uce/lab_deploy.py) on the archived UCE branch.
- [UCE fresh-world PowerShell launcher](https://github.com/partom24/HartLogistics2/blob/dev/uce-shared-ordinary-ledger-20261111/candidates/uce/Start-HartLogistics-FreeformLab.ps1) and [fresh-world backend](https://github.com/partom24/HartLogistics2/blob/dev/uce-shared-ordinary-ledger-20261111/candidates/uce/freeform_lab.py).
- [UCE integrated-product PowerShell launcher](https://github.com/partom24/HartLogistics2/blob/dev/uce-shared-ordinary-ledger-20261111/candidates/uce/Start-HartLogistics-FullProductLab.ps1) and [backend](https://github.com/partom24/HartLogistics2/blob/dev/uce-shared-ordinary-ledger-20261111/candidates/uce/full_product_lab.py).

## Historical operator process — the missing link

**The user-facing distribution entrypoint was one PowerShell file. Python was the guarded implementation beneath it, not the manual first command.**

1. **Plan:** Source-only inspection/build. Does not contact the Minecraft server.
2. **CheckLab:** Read-only preflight against the stopped, exact copied LAB, verifies existing installed pack versions and hashes, world registrations and pinned source.
3. **Install -Apply -ExpectedCommit FULL_SHA:** Write only on explicit request, with exact Git SHA matching preflight. Builds from checked source and uses the guarded Python backend for staged BP/RP replacement, backup, verification and rollback on failure.
4. **Rollback -BackupTag lab-XXXXXXXXXXXX -Apply** (and for historical UCE also **-ExpectedCommit FULL_SHA**): checks exact backup, current candidate and registered versions, restores pack data through a separate guarded transaction. No automatic BDS restart.
5. **The PowerShell front-end** checks Windows, Git for Windows and Python >=3.11, creates/uses an isolated checkout beneath LOCALAPPDATA (not the Minecraft server root), verifies correct HartLogistics2 origin, branch, clean worktree, fast-forward-only fetch, and exact expected SHA before dispatching to the candidate-matched Python backend.
6. **A different test path for fresh worlds:** The UCE Freeform launcher uses **Plan / Prepare / Finish / Restore**; Prepare selects a new unused LAB world, the player manually starts/stops BDS to generate it, and Finish binds the validated new product packs to that generated world. The FullProduct launcher additionally has Stage, Bind, Install, Rollback and Restore check/write modes. This is distinct from updating a world with existing Q4 data.

## Important distinctions

- This is the **release-to-LAB/testing operator flow**, NOT evidence of a released HartLogistics production PowerShell promotion tool. The HartBots Promote-HartBots-Production.ps1 mentioned in older docs is a reference-only import concept, not an approved executable HartLogistics production updater.
- Historical PG27 is version 1.5.10 from PG26 1.5.9; historical UCE is 1.5.16 from PG33 1.5.15. Those exact predecessor chains and frozen code are **not reusable** for the newly developed 1.5.0 infrastructure preview.
- **Current branch gap:** dev/urce-150-runtime-20261118 provides scripts/hartlogistics_150_lab_updater.py plus CI-packaged mcaddon, but has **no current one-file PowerShell Plan/CheckLab/Install/Rollback launcher** and the Python 1.5 updater lacks an explicit post-install rollback command. The old 1.4.2 Python updater cannot be used for 1.5.
- Therefore the previous instruction to manually detach Git HEAD and run Python directly was an **incomplete owner-facing distribution recommendation**; withdraw it as canonical. Current CI success is not sufficient to tell the owner to install the current 1.5 preview.
- Restore the operator-friendly PowerShell front-end against the **actual new development branch**, exact SHA/predecessor/pack hashes, and add deliberate rollback and synthetic Windows-script/installer tests. Preserve source evidence and prior owner BDS proofs; don't revive historical UCE gameplay code or Q5.
- Before any release, the existing docs/RELEASE_POLICY.md still requires runtime evidence, checksummed artifact, owner approval and a separate production promotion gate.

**Conclusion:** The repo's real historical process was versioned one-file PowerShell, Git-backed, Python-guarded Plan -> CheckLab -> Install -> Rollback (or fresh-world Prepare -> Finish -> Restore). The current distribution review must be corrected to this model.
