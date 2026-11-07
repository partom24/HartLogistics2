# Bundle 2 — owner-reported LAB pack preflight

## 2026-11-07 — Owner read-only LAB pack-preflight evidence (version and registration mismatch)

Owner executed `scripts/diagnostics/Read-HartLogistics-Bundle2Lab.ps1` from their Windows LAB copy. Reported:
- LAB: `C:\Servers\Thomas_MCBedrock - Copy (2)`; selected world: `ThomasServer`.
- LAB `bedrock_server.exe` file version **1.26.63.1**, not independently observed running process.
- Top-level installed pack directories `HartMods_HartLogistics_BP` and `HartMods_HartLogistics_RP` have manifests matching the 1.4.1 original **header UUIDs**, but the manifests declare **version 1.5.0**.
- The tested world registry `world_behavior_packs.json` and `world_resource_packs.json` contain **no entries matching the known Hart UUIDs**. Diagnostic output reads `Hart BP registry: not registered` and `Hart RP registry: not registered`, not missing file.
- Disposable Bundle 1 PG-03 pack UUID unregistered, test pack folder absent, owned lease absent.
- The diagnostic is **read-only** and did not inspect alternate per-world pack folders, `level.dat`, LevelDB, saved Collector/Receiver links, q4 queue data, BDS running logs, or the origin/source of the installed 1.5.0 files. Do not claim 1.5.0 is actively loaded; do not claim which add-on code actually runs. This is a **registration/version provenance discrepancy**, not PG-06/07/08 pass/fail.

**HOLD** every attempted existing-world upgrade, 1.4.1 → 1.5.0/2.0 replacement, Q5 cutover, pack updater apply, manual world registry changes, and new runtime UI until the installed-versus-registered state is reconciled and 1.5.0 provenance preserved. Original 1.4.1 source import and saved-world baseline are separate from the discovered 1.5.0 LAB folders. Do not overwrite or delete the 1.5.0 files. User can run a further **read-only** check of the two registry-file contents and any world-local pack manifests if needed, without reconfiguring server settings.

## Decision

**No deployment action yet.** Confirm which add-on versions are enabled for the active world and whether world-local packs or alternate UUIDs explain the discrepancy. The current 1.5.0 pack folders require preservation and independent provenance; they are **not** the 1.4.1 Git baseline. The absence of known Hart UUIDs from world registration suggests the shared pack folders are not activated for this world, but it does not prove runtime load paths from this output alone. Do not write or auto-fix either registry file. The original PG-06/07/08 BDS gates remain NOT RUN.
