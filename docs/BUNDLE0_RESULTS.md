# Bundle 0 — PG-01 / PG-02 Offline Gate Results

**Performed 2026-11-07 on `docs/hart-logistics-planning`; no Minecraft server accessed or changed.** The original HartBots production updater was **never invoked**, including dry-run. This report is source verification and synthetic updater safety, **not** Bedrock gameplay/runtime acceptance, authorization to install, release approval, or evidence for Q5.

## What was tested?

Can we import the owner-supplied **Hart Logistics 1.4.1** behavior/resource source without any byte changes, and prepare a **HartLogistics-only LAB updater** whose default is non-mutating and whose safety/rollback mechanisms pass synthetic failure tests?

| Gate | Result | Evidence | Boundaries |
| --- | --- | --- | --- |
| **PG-01 — Original source and identity** | **GO — exact Git source** | Imported **72 original BP/RP files** (16 BP + 56 RP), compared Git blob SHA-1 for every file with `blob <len>\\0<original bytes>` computed from the user's original archive: **72/72 exact**. The three non-gameplay baseline helper/docs files also matched their prepared-source hashes (**75/75 total**). Original mcaddon SHA-256: `439678c0d68849a43341c126ba6aaaa111317254e137123fde3ac531cec5d1dd`. | No Minecraft runtime/world testing or altered gameplay. Import source commit **`0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`**. |
| **PG-02 — LAB installer safety** | **GO — offline/synthetic only** | New `scripts/hartlogistics_lab_updater.py` and permanent `tests/test_hartlogistics_lab_updater.py`. **9/9 tests PASS** using isolated temporary filesystem fixtures: exact LAB path allowlist, source UUID/hash/version validation, unrelated registry JSONC preservation, ambiguous registration refusal, pinned-origin contract, dry-run no writes, staged SHA copy+backup, rollback on pack move failure and rollback on registry update failure. The updater's normal offline invocation also reported no Minecraft server access. | **Windows LAB install remains untested/not authorized.** Real `--apply` requires a future separately approved operator action on the exact LAB server, stopped BDS, real world registration discovery, clean pinned Git SHA and no path redirection. |

### Frozen source identities

- Original BP `4854d263-05dd-4f79-a21c-7ba969295c2d`; original RP `91316442-0f26-4fbb-88f3-2e39ea843a1a`.
- Version **1.4.1**; engine minimum **1.26.50**; `@minecraft/server` **2.7.0**; original three block IDs unchanged.
- At import commit, Git tree: **`addon/behavior_pack` = `6a2f0a36551b82d8d3ca9b1859308e380f53b7b4`**, **`addon/resource_pack` = `6d2ff1436b78c0df5679655f582dada3e6e1539b`**.
- `BASELINE_HASHES.json` holds the original archive SHA-256 and per-file source SHA-256. The original 1.4.1 pack README version typos were **not corrected**, because this import must remain byte-for-byte unchanged.
- The project's `source.active` is `addon`; `source.frozen_references` intentionally remains empty because the structural validator forbids source-active and frozen directories from overlapping. The immutable import commit + the exact original hashes serve as the source pin until a separately declared frozen copy is needed.

### Updater safety and limitations

- Python updater is **HartLogistics-only** (not imported HartBots runtime code), dry-run by default; only exact `C:\Servers\Thomas_MCBedrock - Copy (2)` is an acceptable target. Production `C:\Servers\Thomas_MCBedrock` is refused even when supplied explicitly.
- The real apply path requires Windows, a stopped `bedrock_server.exe`, non-symlink/non-junction LAB paths, unambiguous existing matching BP/RP installations, a safe world from `server.properties`, and a 40-character clean Git commit matching `partom24/HartLogistics2`. It never targets another repository or production. Only world BP/RP registrations for the exact Hart Logistics UUIDs are changed.
- Synthetic staging copies both source packs, verifies file SHA-256, backs up existing pack directories/registry bytes, replaces in the simulated LAB, verifies post-install SHA-256, and restores originals after controlled faults.
- The temporary synthetic directories were cleaned at the end of every test. No `TEMP_TEST`/`TEMP_DEBUG` runtime flags, temporary probes or test-only apply parameters remain. The permanent test module resides outside the runtime source.
- **Not tested:** PowerShell compatibility (not used), actual Windows path/junction behavior, running BDS checks on LAB, LAB installed-world registration variations, backup operations on the real server, runtime changes or in-game behavior. Those are later LAB integration gates and **not implied by PG-02 offline GO**.

## Next gate and authorization

**PG-03–PG-11 remain NOT RUN.** Bundle 1 requires separately scoped authorization to build/deploy a **temporary custom-container probe** to LAB after an exact READY rig card is prepared. This Bundle 0 approval does not authorize that work or any server execution.

The frozen HartBots production updater script is allowed to be imported as **inert reference** but may **not be executed before a nominated release candidate**. Production modification requires a second explicit owner approval even after nomination.