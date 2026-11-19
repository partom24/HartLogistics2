# HartLogistics — retained project evidence and historical tool source

**Project-static, read-only archival material** retained on `main` and mirrored into active URCE branches. The filenames and Git blob checksums are enumerated by [the immutable-source manifest](../PROJECT_STATIC_RESOURCES.json) and discovered through [the canonical catalog](../CANONICAL_EVIDENCE_AND_TOOLING.md). Unlike branch-only Git links, the original content is physically preserved in this stable tree.

- `evidence/`: complete original main HL-E register; native-MR curated evidence and cross-branch audit; PG42 session; owner product and player-first acceptance contracts; recovered PowerShell process; original release policy.
- `tooling/`: byte-for-byte historical PG27, UCE, fresh-world and full-product PowerShell launchers and corresponding guarded Python backends/tests, deliberately named `.ps1.txt` / `.py.txt` instead of executable extensions.
- `owner-reference-images/`: the original owner-supplied Sorter-array and storage-room layout images, byte-identical to `main/docs/reference-images`.

**DO NOT EXECUTE any archived PowerShell or Python reference as the current updater.** They are pinned to historical world states and pack versions and may be destructive or refuse when run against a new candidate. The current 1.5 preview still requires a separately implemented/tested compatible PowerShell front end and explicit rollback. These files preserve tool *process/source*, not authorization or a runnable current distribution. Never merge frozen UCE gameplay merely because archived documentation is included.

Accepted observations remain bounded by their source evidence; the archive is **not** a fresh BDS test, an experimental-feature approval, production release, or world migration plan. The archive does not import another repository. Future static additions must preserve original proof and add a new versioned entry; do not silently rewrite these originals.

Run `python scripts/check_project_continuity.py` to verify every archived file's original Git blob identity, even when the historical branch is absent.
