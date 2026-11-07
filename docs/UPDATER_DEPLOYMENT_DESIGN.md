# Hart Logistics 2 — Updater Reference, LAB Testing and Production Exclusion

**Status (2026-11-06): design and source-reference inspection only. No updater was executed and no server path was accessed.** The owner has explicitly permitted **importing the production updater script into HartLogistics2 before a release candidate exists**, but **prohibits running it, including dry-run/preflight against production, until a release candidate is nominated**. Production mutation also requires a separately authorized release/promotion operation.

## Exact server boundaries

| Environment | Exact Windows path | Permitted operations |
| --- | --- | --- |
| LAB / copied server | `C:\Servers\Thomas_MCBedrock - Copy (2)` | **Only authorized server for in-game testing, trial releases, migration experiments and regression acceptance**. Owner may delete this entire disposable lab and replace it with their latest production-derived ZIP without retaining any local world state. Lab installation/rebuild/test operations are future work requiring approved scripts and use. |
| PRODUCTION / live server | `C:\Servers\Thomas_MCBedrock` | **Absolutely no edits, deletions, backup/restore mutations, script execution, or gameplay testing here until an identified release candidate has been nominated.** Nomination is necessary but not sufficient for deployment: require subsequent explicit owner approval, validated artifact and a distinct promotion operation. |
| GitHub | `partom24/HartLogistics2` | **Only permitted repository**. HartBots is a supplied-file reference; do not access the HartBots repository. |

The names are similar: do **not** validate by string prefix, loose substring, or wildcard. Validate canonical absolute path identity before any future write. Check for junction/reparse-point redirection and refuse an ambiguous target. Production is always a **hard deny** for lab update commands, even if manually supplied as a parameter. Never run the production updater as a way to check compatibility before nomination. No auto-restart, automatic post-merge deployment, or production target fallback.

## Uploaded HartBots updater evidence (source read only)

**Uploaded archive:** `scripts.zip`  
**Archive SHA-256:** `9127f132bc22022ea9d236f1092945f0a7f32a31b0ab0ec2603d39844cb8bfbf`

Nine files were inspected, not run:

| Source filename inside uploaded archive | Behavior to adapt | Import/runtime disposition |
| --- | --- | --- |
| `scripts/HartBots-Git.ps1` | Clean worktree, exact Git origin/branch and SHA, stopped-server checks, exact lab path | Implement for **HartLogistics2 only**; old HartBots origin checks are unsuitable. |
| `scripts/HartBots-Registry.ps1` | Surgical JSONC registry editing, preserve comments and unrelated pack entries, reject ambiguity | Adapt to existing Hart Logistics BP/RP identities; regression-test in LAB. |
| `scripts/Install-HartBots-Lab.ps1` | Dry-run by default, staged copy, backups, hash checks, failure rollback | Adapt for LAB-only target, never production; original HartBots IDs/versions/paths cannot be reused. |
| `scripts/Update-HartBots-Lab.ps1` | Opt-in `-Apply` and repeated lab guards | Adapt after source import/build process is authorized. |
| `scripts/Sync-HartBots-Source.ps1` | Restricted fast-forward source sync without server mutation | If needed, permit only HartLogistics2 origin and validated branch, never HartBots. |
| `scripts/Package-HartBots-Release.py` | Reproducible packaging, manifest/dependency checks, checksums | Adapt to actual Hart Logistics BP/RP source and manifest versions. |
| `scripts/Enable-HartBots-GitDeploy.ps1` | Optional post-merge automatic deployment | **Do not enable/adopt an automatic Git deployment hook** without explicit approval. Prefer manual lab apply. |
| `scripts/Promote-HartBots-Production.ps1` | Cold full-server backup, exact promotion source-tree pinning, stopped BDS check, staged replacement, rollback, two switches for production apply | **Explicitly approved for import into this repository as reference source. Execution prohibited before a nominated release candidate; not approved for deployment as written.** Hardcoded HartBots source/version/UUID values are NOT valid for Hart Logistics. |
| `scripts/validate_blueprint.py` | Structural checks | Already present as HartLogistics2 template validator. Do not replace it with HartBots's copy. |

**Production reference SHA-256:** `4f7c136c566a431211b055a9e95f37fc46dce5262dd461b655a6422a0a6f76ee` for `scripts/Promote-HartBots-Production.ps1` inside the uploaded ZIP. The original script targets `C:\servers\Thomas_MCBedrock`, pins HartBots v1.6.34→1.7.13, and checks HartBots pack IDs and source tree. **Never execute the unchanged reference:** its guards are HartBots-specific and it references the live server. The owner explicitly allows **importing** it, not running it.

**Import and implementation are separate events.** A copy of the HartBots production updater may be kept in a clearly labeled **non-autoinvoked reference** location in HartLogistics2 during planning, retaining its provenance. Only later, when authorized, develop a HartLogistics-specific script using the authorized repository, pack identities and verified candidate source. Being checked into Git does not authorize its execution. This document does not claim the original updater scripts have already been committed or adapted; the supplied ZIP remains an external reference.

## Required HartLogistics-specific lab updater contract (future)

1. **Exact authority:** verify `partom24/HartLogistics2` is the sole source remote, clean selected commit and unmodified approved source, plus an identified `addon/behavior_pack` and `addon/resource_pack` after separately authorized import.
2. **Exact source identity:** preserve existing **behavior UUID `4854d263-05dd-4f79-a21c-7ba969295c2d`**, **resource UUID `91316442-0f26-4fbb-88f3-2e39ea843a1a`**, old block IDs and Q4/Q5 data; do not apply HartBots fixed versions or Git tree SHA.
3. **Safe preflight:** dry-run by default and no mutations; verify LAB root, intended world from configuration (do not assume filename/level-name solely from template), pack locations, target UUID collisions, pack dependency and versions, server stopped/auto-restart disabled, free disk, and no reparse-point redirection. Refuse if unknown.
4. **Opt-in apply:** independently triggered `-Apply` must rerun all guards. Take an appropriate LAB backup or immutable staging snapshot, stage exactly the two Hart Logistics packs, verify all file SHA-256 hashes and registries, update only Hart Logistics pack registrations while preserving unrelated add-ons, and roll back after any failure.
5. **Lab test:** on copied world only, verify exact source/pack SHA, versions, loader logs, source-traced [1.4.1 ingress/egress matrix](BASELINE_INGRESS_EGRESS_MATRIX.md), native metadata fidelity, migration failure cases, redstone/hopper compatibility and controller routing. Owner reports Bedrock server **1.26.63.1** and client **v26.63**; this is not yet reproduced.
6. **Optional complete lab reset:** permitted by owner as a separate explicitly chosen path using their latest ZIP. Never infer permission to reset any other directory, especially production.
7. **Release candidate preparation:** produce reproducible `.mcaddon`, exact source commit, pack version/UUIDs and SHA-256 manifest. Successful lab tests do not auto-nominate a release candidate or permit production work.

## Production updater import, release and execution gate

- **Import:** allowed now as repository reference source. It may be reviewed, documented and eventually adapted into guarded HartLogistics code; do not register it as a deployment hook or scheduled action.
- **Before a nominated candidate:** **do not run the production updater**, including a dry run; **no writes to `C:\Servers\Thomas_MCBedrock`**.
- **After candidate nomination:** the owner must separately authorize any execution and explicitly authorize production mutation. Validate nominated exact commit/artifact, pack IDs/version, cold full-server backup, server stopped and no auto-restart, registries, destination root, rollback steps and signed-off lab acceptance.
- **No shortcuts:** no copying files, promoting packs, adjusting world registries or world state in production merely because an updater script exists or a PR is merged.

## Known open deployment decisions

- Actual `level-name` in LAB/PROD and whether there are multiple worlds/pack locations; must be verified on LAB before coding assumptions.
- Whether the owner wants command-line-only manual lab installs or a guarded one-command updater with an explicit apply step.
- LAB backup retention vs always-disposable reset process, operator control of server stop/restart, and expected test capture/log output.
- Exact Git checkout location, release naming/versioning, packaging artifact identities, approval record and process used to nominate a release candidate.

This deployment architecture is a **planning artifact, not code implementation or test evidence**.
