# HartLogistics — canonical evidence, tools and project facts

**Permanent project discovery index.** Maintained at [`main`](https://github.com/partom24/HartLogistics2/blob/main/docs/CANONICAL_EVIDENCE_AND_TOOLING.md) and copied without semantic variation to active development branches. Its entries refer to **immutable Git commits** (not whichever content a branch happens to hold today). [Machine-readable IDs and exact refs](PROJECT_STATIC_RESOURCES.json). **Do not substitute a shortened branch-local evidence register for the original chronology.**

## Authority and provenance order

| Question | Find here first | Boundary |
| --- | --- | --- |
| What was historically observed and with what acceptance level? | [Original `main` HL-E evidence register](https://github.com/partom24/HartLogistics2/blob/56a7b47212630c771ecee2b9dc2af20808e30e8a/docs/ENGINEERING_EVIDENCE_REGISTER.md), especially HL-E-004, HL-E-009, HL-E-052, HL-E-063 | Full historical ledger **at a fixed revision**; new branch-local ledgers are supplemental, never supersede original tests |
| What native MR evidence can URCE reuse? | [Curated NMR-01–10 carry-forward](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/recovery/NATIVE_MR_HISTORICAL_EVIDENCE_141.md) and [cross-branch native MR audit](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_CROSS_BRANCH_NATIVE_MR_EVIDENCE_REUSE_AUDIT_20261118.md) | Reuse *primitive* evidence, do not silently certify atomic custody, real integrated 1.5 Bulk or abrupt-crash safety |
| Where is the PG42 original native carrier persistence session? | [Archived PG42 session card](https://github.com/partom24/HartLogistics2/blob/c0de08258faacd97799c6a41c62ff1aef2bfbf40/candidates/uce/PG42_TEST_SESSION.md), [closed/unmerged PR #79](https://github.com/partom24/HartLogistics2/pull/79) | Historical scoped owner-LAB entity inventory; no import of frozen archived UCE code |
| What is the owner-approved 1.5 product end-state? | [URCE owner product contract](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md) and [existing owner reference images](https://github.com/partom24/HartLogistics2/tree/56a7b47212630c771ecee2b9dc2af20808e30e8a/docs/reference-images) | Reference images express intended player experience; do not invent fixed routing coordinates |
| What player testing is permitted? | [Owner's player-first decision ADR-004](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PLAYER_FIRST_TESTING_DECISION_20261118.md) | Any valid layout, any legitimate item; MR and ordinary distinct where semantics require; exact tests are optional bug repro |
| How did the owner actually distribute and test previous builds? | [PowerShell process recovery](https://github.com/partom24/HartLogistics2/blob/05a37c1c78fe9afb4554c9857d9a7c284dcd68be/docs/URCE_150_POWERSHELL_DISTRIBUTION_PROCESS_RECOVERY_20261118.md) and source scripts below | One-file PowerShell operator launcher plus safe Python backend; don't replace with improvised manual Python instructions |
| What permits public or production release? | [Release policy at original main](https://github.com/partom24/HartLogistics2/blob/56a7b47212630c771ecee2b9dc2af20808e30e8a/docs/RELEASE_POLICY.md) | Source tests, LAB installation and production promotion are **distinct** approvals |

## Exact native-MR proof classification — do not rediscover or exaggerate

- **PG20 / HL-E-052:** owner-LAB scoped PASS of a Protection I enchanted book via native Hopper→Collector→linked Receiver-output Hopper, normal restart with a visibly intact book, empty source and clear journals. **Not** proof of Collector/Receiver persistent native entity buffer, arbitrary metadata, hard-crash atomicity, foreign-writer fencing or release.
- **PG23 / HL-E-063:** owner-LAB native same-Hopper compact/move with ordinary restart observation. **Not** universal atomic native-item custody evidence.
- **PG42 / NMR-09:** owner-reported scoped persistence of a nine-slot *native entity-inventory carrier* with a named/lore item and clean-restart readback on BDS 1.26.63.1. Evidence supports native carrier feasibility; **not** full URCE endpoint integration or abrupt-failure durability.
- **PG-03 / HL-E-009:** unavailable custom-**block** inventory without experiments on the tested server. This optional block endpoint result **does not negate** PG42 native **entity** inventory.
- **Design disposition:** MR movement and native carrier *primitive feasibility* are already accepted at these specific scopes; URCE ownership, Q4 migration, unload/foreign writer handling, recovery and end-to-end acceptance remain engineering work.

## PowerShell owner-LAB candidate process — static tools, original source

| Historic launcher / backend | Pinned original source | Purpose and limitation |
| --- | --- | --- |
| PG27 `Start-HartLogistics-PG27Lab.ps1` | [Main PG27 PowerShell launcher](https://github.com/partom24/HartLogistics2/blob/56a7b47212630c771ecee2b9dc2af20808e30e8a/candidates/pg27/Start-HartLogistics-PG27Lab.ps1) | Plan source-only; CheckLab read-only stopped server; Install with `-Apply -ExpectedCommit`; Rollback with `-BackupTag -Apply`; old PG26 1.5.9→PG27 1.5.10 only |
| PG27 `lab_deploy.py` | [Guarded Python backend](https://github.com/partom24/HartLogistics2/blob/56a7b47212630c771ecee2b9dc2af20808e30e8a/candidates/pg27/lab_deploy.py) and [synthetic tests](https://github.com/partom24/HartLogistics2/blob/56a7b47212630c771ecee2b9dc2af20808e30e8a/tests/test_pg27_lab_deploy.py) | Exact predecessor manifests, pack hashes, registries; backup/rollback; no manual bypass |
| UCE `Start-HartLogistics-UCELab.ps1` | [Archived PowerShell launcher](https://github.com/partom24/HartLogistics2/blob/c0de08258faacd97799c6a41c62ff1aef2bfbf40/candidates/uce/Start-HartLogistics-UCELab.ps1) and [Python backend](https://github.com/partom24/HartLogistics2/blob/c0de08258faacd97799c6a41c62ff1aef2bfbf40/candidates/uce/lab_deploy.py) | Equivalent one-file Plan/CheckLab/Install/Rollback for old UCE 1.5.16, **frozen historical code, not an active installer** |
| Fresh-world `Start-HartLogistics-FreeformLab.ps1` | [Archived PowerShell launcher](https://github.com/partom24/HartLogistics2/blob/c0de08258faacd97799c6a41c62ff1aef2bfbf40/candidates/uce/Start-HartLogistics-FreeformLab.ps1) and [backend](https://github.com/partom24/HartLogistics2/blob/c0de08258faacd97799c6a41c62ff1aef2bfbf40/candidates/uce/freeform_lab.py) | Plan→Prepare→owner BDS start/stop→Finish; Restore; generated new LAB world instead of arbitrary existing world overwrite |
| Integrated full-product new-world launcher | [Archived FullProduct PowerShell](https://github.com/partom24/HartLogistics2/blob/c0de08258faacd97799c6a41c62ff1aef2bfbf40/candidates/uce/Start-HartLogistics-FullProductLab.ps1) and [backend](https://github.com/partom24/HartLogistics2/blob/c0de08258faacd97799c6a41c62ff1aef2bfbf40/candidates/uce/full_product_lab.py) | Stage/Bind/Install/Rollback/Restore, stopped LAB, new world; frozen |
| Current 1.5 preview (branch-specific, not a static tool) | [Current development branch](https://github.com/partom24/HartLogistics2/tree/dev/urce-150-runtime-20261118) | Source-only CI .mcaddon and a dedicated Python updater; **not yet a matching full PowerShell launcher or manual post-install rollback** as of 2026-11-18 |

**Why this matters:** when a branch lacks these files, they **still exist** at the pinned links above. Do not claim there was never a PowerShell workflow or require the owner to remind you. For new distribution, adapt the *process* after verifying current versions and tests, not the obsolete historical code.

## Fixed owner decisions for all future branches

1. **Native-first** with URCE network-wide source-specific routing; Filter exact > seeded Auto > Wildcard, bottom-to-top within a column, reject invalid transit before costly native admission, no speculative authority on unverified route.
2. **Transporter builds human-understandable storage-network infrastructure.** Items need not travel through a Transporter. Do not reinterpret it as a required per-block inventory conveyor.
3. **Bulk storage is the Bulk controller**, not a Bulk sorter. Multi-bank storage and HOLD/custody need proven ownership; unknown is HOLD, not bounce or invented admission.
4. **Player-first tests:** any valid layout, number of banks and chosen ordinary item; MR/native identity preserved through a structurally separate route. Deterministic coordinates/IDs may be used in offline regression fixtures, never as player acceptance restrictions.
5. **Native evidence reuse** must retain original scope; archived prototype code and abandoned Q5 are not endorsed. Q4 data is protected; 1.4.2 runtime/performance claims are never promoted from source-only tests into BDS measurements.
6. **Distribution:** use the one-file Git-backed PowerShell operator interface (Plan/CheckLab/Install/Rollback) with verified checkout SHA and stopped LAB, guard both pack identities/versions/hashes and registered world; full rollback and no automatic BDS restart. Never run archived launchers unchanged on a new build.

## Branching and no-loss maintenance contract

- **Authoritative evergreen location:** `main/PROJECT_CONTINUITY.md`, `main/docs/CANONICAL_EVIDENCE_AND_TOOLING.md`, `main/docs/PROJECT_STATIC_RESOURCES.json`. Additional branch copies are **discovery mirrors**, not new evidence.
- **Existing active branches:** `planning/urce-150-20261117` and `dev/urce-150-runtime-20261118` carry the same static index/validator. Historical branches are frozen records; don't rewrite dozens of historic commits just to add a banner.
- **Future branch creation:** branch from a synchronized source that contains the continuity files, or copy them verbatim. Add `AGENTS.md` and `README.md` links; do not delete/rename protected catalog paths. The validator runs in main CI, active-branch CI, and on PR.
- **Before answering or coding:** check this catalog; follow the pinned source and its evidence scope. A branch-local absence means "not in this checkout", **not** "not proved / never developed".
- **When catalog maintenance is necessary:** update `main` first with exact source ref, reason, scope and explicit non-claims. Mirror changes to active branches and run `python scripts/check_project_continuity.py`; tests require the retained registry and owner process IDs.
