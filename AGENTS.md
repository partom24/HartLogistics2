# Hart Logistics 2 — contributor operating contract

## Current owner engineering mandate (2026-11-13)

The owner explicitly authorizes continued HartLogistics2 implementation,
integration, source tests, GitHub CI and reviewable development PR changes
**without recurring permission prompts**. Deliver one coherent product preserving
all 1.4.1 behavior and data, with one custody authority, one routing authority,
one coordinated transfer/recovery mechanism, and cold Q4 migration.
Treat previous PG experiments as bounded evidence, not a mandate to rerun them.
Retain useful regression fixtures and immutable historical pack reconstruction
only where needed for safety or rollback; remove temporary runtime probes from
the release tree after the relevant LAB cleanup. The current draft work is PR #79,
branch `dev/uce-shared-ordinary-ledger-20261111`. This development mandate does
**not** authorize an automatic world cutover, LAB install, production access,
public release, or merge. Request owner BDS involvement only for a complete
integrated product candidate or an unavoidable safety boundary.

## Authority and repository boundary

- **Only authorized GitHub repository: partom24/HartLogistics2.** Do not read or write any other repository, including HartBots.
- Read [project-blueprint.json](project-blueprint.json), [roadmap](docs/ROADMAP.md), [current state](docs/CURRENT_DEVELOPMENT_STATE.md), [design](docs/LOGISTICS_DESIGN.md), [Q5 migration](docs/Q5_MIGRATION_DESIGN.md) and relevant source before proposing changes.
- Current owner authority covers **HL2 gameplay source implementation, tests, generated candidate packages and reviewable PRs**. The immutable Bundle 0 baseline remains a protected reference, not the active product. The only interactive BDS/server work permitted is an owner-authorized, stopped, guarded LAB operation with exact source hashes, backups and rollback; do not infer authorization for a new install from a CI pass. Production and other add-ons remain denied; HartBots references are inert only.
- The original owner-uploaded 1.4.1 mcaddon is the compatibility baseline. Its **72 original BP/RP source files remain protected** under `addon/` (source import `0ea3000`; [hash inventory](BASELINE_HASHES.json)). Active HL2 source is generated through `candidates/uce/prepare_candidate.py` and `candidates/transport/`, including native custody, Receiver accounts, multi-Receiver Transporter routing and Bulk. Source CI is not complete BDS acceptance.

## Non-negotiable compatibility contract

1. **No loss of any 1.4.1 capability**: preserve Sorter/Collector/Receiver functions, modes, filters, linking, hopper paths, dropper/dispenser handling, redstone semantics, Q4 data, q2/q3 migration, and recovery. No optimization may silently weaken these contracts.
2. **Persisted state is critical**: preserve pack UUIDs, block identifiers, saved links, block states, queue keys, journal behavior and original items. Existing worlds must not require manually emptying Receivers to upgrade.
3. **Separate decisions from hypotheses**: an agreed requirement is not yet implemented or tested. [Open questions](docs/IDEA_INBOX.md) are *not* permission to code.
4. **Q4 → Q5 must be lossless**: stage new storage separately, verify exact item counts/identities and journal state, atomically commit authority, preserve rollback evidence without replaying stale data after cutover.
5. **MR items require native item fidelity**: do not silently serialize, flatten, delete or duplicate item metadata. **Owner choice:** replace the 1.4.1 direct-only MR Hopper fallback with native persistent MR storage on both Collector and Receiver, but only after copied-world validation proves the preserved *capability*; legacy bypass may remain temporarily during migration. Native container APIs and version/experiment gates must be confirmed before code relies on them.
6. **New block visual identity**: Bulk Storage and Transporter must use new dedicated models, textures, icons and block-specific resource assets, never repurposing or recoloring 1.4.1 Sorter/Collector/Receiver assets. Bulk Storage cannot resemble Collector or Receiver; original assets remain untouched. See [asset contract](docs/RESOURCE_ASSET_POLICY.md).
7. **Native hoppers remain valid** in all formerly supported positions; new Transporters are an additive path, not a mandatory replacement.
8. **Up-front test summary and prior-proof reuse**: every proposed test begins with **what is being tested, why now, prior evidence, action required, and pass condition**. Do not repeat previously accepted, unaffected tests. Reuse previous owner evidence with its scope recorded; only add narrow regression checks where the changed path creates new risk. A manual rig requires a complete [READY test rig card](docs/TEST_RIG_CONTRACT.md) specifying Sorter counts/columns, coordinates, orientation and separation before the owner builds anything.
9. **Testing claims are bounded**: SOURCE REVIEW and OFFLINE PASS are not RUNTIME OBSERVED or INTEGRATION ACCEPTED. Owner-reported native MR testing is valuable but its artifacts have not been imported to Git. **Test by meaningful item behavior/class and failure condition, not arbitrary named item IDs**: cobblestone, glass and sand are interchangeable for ordinary transfer unless a proven mechanical difference matters. Keep targeted MR metadata, distinct identity, stack behavior and item-specific defect coverage. See [test plan](docs/COMPATIBILITY_TEST_PLAN.md).
10. **Release requires owner approval**, identified source, target-runtime evidence, and release gate. No automatic promotion from a passing build or PR.

Follow [engineering standard](docs/ENGINEERING_STANDARD.md), [repository policy](docs/REPOSITORY_POLICY.md), [code hygiene](docs/CODE_HYGIENE_POLICY.md), [temporary instrumentation](docs/TEMPORARY_INSTRUMENTATION_POLICY.md), and [release policy](docs/RELEASE_POLICY.md) whenever relevant. Avoid speculative refactors, duplicate implementations, unsafe cleanups and persistent per-feature branches.

## Deployment boundary

- LAB: `C:\Servers\Thomas_MCBedrock - Copy (2)` is the **only authorized Minecraft integration and release-testing server**. Its existing ThomasServer, PG35 and PG42 world evidence are **not disposable**; create a fresh separately named test world using an exact, guarded stopped-BDS workflow instead of overwriting or rebuilding those worlds. Future updater must use the exact canonical allowlist.
- PRODUCTION: `C:\Servers\Thomas_MCBedrock` is a **hard deny for all test activity**. No production edits until a release candidate has been nominated. **Import of a production updater script is permitted, execution (including dry-run) is not permitted before nomination; nomination does not itself authorize a production apply.**
- Treat [updater deployment design](docs/UPDATER_DEPLOYMENT_DESIGN.md) as mandatory for any build/install/deploy work. HartBots scripts in the uploaded ZIP are references, not authorized executable HartLogistics tools.

## Historical PG test evidence and current integration acceptance

The [PG-01–PG-11 preliminary plan](docs/PRELIMINARY_GO_NO_GO.md) is historical
bounded evidence, **not a requirement to rerun isolated probes or obtain
permission for each implementation slice**. Reuse previously accepted
unaffected visual, native MR, carrier, custody and journal findings. Continue
automated fault, source and integration tests without interruption. The
owner's current mandate limits additional hands-on BDS work to **two meaningful
product-level sessions**: integrated custody/network routing, then archived 1.4.1
cold migration/full acceptance, except a material unresolved compatibility
safety issue. A manual session requires a complete [READY test card](docs/TEST_RIG_CONTRACT.md)
explaining purpose, exact setup, actions, pass/fail and rollback; no unexplained
micro-rigs. Retain the [temporary instrumentation cleanup policy](docs/TEMPORARY_INSTRUMENTATION_POLICY.md):
a historical PG probe remains only while its installed LAB rollback/evidence
requires it, never in the released runtime. PG-01/02 passed scoped gates,
PG-03 NO-GO, PG-04/05 blocked; do not imply PG-06–11 acceptance or
experiment authorization from the older plan.

## Accepted implementation defaults (2026-11-07)

- Hopper and Transporter are interchangeable **Sorter input** mechanisms sharing priority/filter/redstone rules; pipe atop Sorter columns, adjacent ordinary container means **source**, not final storage; never pipe→ordinary chest output. No output chest at/above pipe Y in intended topology.
- Persist network IDs and deterministic controller ownership; never infer wildcard permission from stale/unloaded Bulk storage. Keep separate finite native MR slots/backpressure from ordinary Receiver queue counts.
- Q4→Q5 migration **stops all Hart Logistics script routing server-wide** under a durable maintenance epoch. Unloaded legacy blocks are **PENDING** until auto-migrated on chunk load, not magically mutated while unloaded. Show status in block menus when loaded; do not assume vanilla Hopper mechanics globally stop. Ensure proven safe resume/rollback before clearing the freeze. See [Q5 migration design](docs/Q5_MIGRATION_DESIGN.md).
- These are implementation constraints under the current mandate; experiments, LAB installation, world cutover and production remain separately gated.

## Optional ticking-area migration proposal (not yet approved)

Q5 migration may **investigate the stable `world.tickingAreaManager` Script API** (released in Bedrock 1.26.10 / server API 2.6.0) to load recorded legacy chunks under the global routing freeze. It is **not** the cheat-restricted manual `/tickingarea` command; `metadata.product_type="addon"` does not toggle cheats. The [Q5 candidate design](docs/Q5_MIGRATION_DESIGN.md#optional-temporary-ticking-area-assisted-migration--feasibility-candidate-2026-11-07) requires exact ownership, one small area at a time, no unapproved cheat changes, safe vanilla Hopper handling, durable recovery and **immediate deletion of only Hart-owned areas**. Use only named pack-owned `removeTickingArea`; preserve on-load migration fallback and never toggle world cheats/experiments. This is a proposed PG-07 subcheck, not authorization for command execution or deployment.

## Current allowed work

Continue implementing, reviewing and testing HL2 on the existing draft development
PR. Perform code hygiene, integration regressions, fault injection and packaging
validation without repeat prompts. **Do not automatically install a LAB pack,
switch worlds, clear custody, run BDS or migrate archived Q4.** As of this mandate,
the owner LAB is on a separate PG42 diagnostic world, not the original PG33
installer predecessor. Preserve PG35/PG42 worlds, their native-carrier evidence,
and exact historical rollback tools until owner-authorized cleanup. PG42's
`tests/pg42_probe.js` remains temporary and must never enter generated HL2
runtime or a release artifact. Existing-world cold Q4 metadata-rich data still
requires non-destructive migration and separate full-system acceptance.

## Approved future link interaction

Owner-selected UI design: explicit **Link / Relink Receiver** button inside the Collector menu; select Receiver and confirm before storing. No implicit linking on placement, preserve all saved links, transport behavior and sneak-place. Before code changes, check stable `@minecraft/server-ui` dependency and native inventory UI collision for 26.63. See [menu design](docs/UI_LINKING_DESIGN.md).

## Owner-required LAB patch instructions: complete copy-paste bootstrap

- **Always provide the owner with complete executable PowerShell commands to obtain any newly introduced Git-tracked launcher** before asking them to invoke it. Never assume a new `Start-HartLogistics-PGxxLab.ps1` file already exists in Downloads or that an earlier `$pg15` variable now points to PG20. A plain repository link, path, or command against an undownloaded local script is **not sufficient**.
- Select the **exact Git-tracked launcher matching the actual candidate**. For integrated HL2 the current source is `candidates/uce/Start-HartLogistics-FullProductLab.ps1` on draft PR #79, **not** the old PG33 or an assumed `main/candidates/pgNN` path. Only after all source checks pass, supply `Invoke-WebRequest -OutFile` from the exact validated Git SHA, `Test-Path`, an explicit SHA pin, `-Mode Plan`/appropriate read-only checks, backup tags and exact `-Apply` commands. The launcher checks out its pinned clean repository internally; no manual pack copying or free-form world edits.
- The integrated handoff uses **CheckStage → Stage → owner BDS-generated new world → CheckBind → Bind → CheckInstall → Install** under stopped-BDS and exact-source controls. Prior BDS observations and historical PG42 carrier world are preserved; never apply the PG33-only `CheckLab` path to the current PG42 environment. Show rollback/restore order so PG42 is never loaded with the UCE product pack. Reuse completed owner steps rather than repeating them. The launcher must never enable cheats/experiments, auto-restart BDS, clear custody or touch production.
- When a user reports an install/restart without available readable status data, record **owner-reported install/restart**, not an invented runtime status PASS. The next instruction is only the remaining status/changed-path validation, not reinstallation.

## Owner-preferred LAB test distribution

Temporary probe source is distributed via the authorized Git checkout and a guarded PowerShell LAB update pathway, **not manual mcpack downloads**. Bundle 0's Python updater only handles the original packs. Before installing independent probe source, build/validate a separate PowerShell path under the same strict LAB-only and temporary-instrumentation cleanup rules. No unapproved production or LAB operations.

## Bundle 1 closeout (2026-11-07)

The owner confirmed **Windows LAB cleanup**, with the original pack-registry bytes restored. The disposable PG-03–PG-05 behavior pack, PowerShell installers/launcher, CI simulations and all three `temporary_instrumentation` entries were deleted from Git; **do not regenerate or re-deploy them** by default. PG-03 NO-GO, PG-04/05 BLOCKED under non-experimental BDS 1.26.63.1. See [completed evidence](docs/BUNDLE1_PREPARATION_RESULTS.md) and [supported-storage alternatives](docs/MR_CUSTODY_ALTERNATIVES_12663.md).

## LAB clone fact — do not re-ask (2026-11-07)

Owner explicitly established: LAB \`C:\Servers\Thomas_MCBedrock - Copy (2)\worlds\ThomasServer\` is a **clone of their previous production world**, not an initially empty disposable world. This fact was already known before the owner re-confirmed it. For PG-03–PG-05, **do not ask again** whether LAB is cloned/disposable or instruct creating/deleting/resetting this world. Test only in a validated isolated area, clean up test-owned blocks after verifying inventories, then unregister the probe. LAB rebuild from a newer production-derived copy is possible **only when separately chosen/authorized**, not a test default.

## 2026-11-07 PG-03 native custom-container gate failure

Owner BDS LAB screenshots: /give @s hlprobe:mr_container 2 is rejected as unexpected identifier, Creative search empty. Official 1.26.50 puts minecraft:block_entity.container in experimental, and newer 26.70.23 Preview announces its promotion. Under no-experiments BDS 1.26.63.1, PG-03 NO-GO, PG-04/05 BLOCKED; do not prompt for a physical rig, experiments or implicit version upgrade. Preserve 1.4.1 behavior/MR fidelity. The owner subsequently CONFIRMED LAB Cleanup. Temporary Git test pack, launchers and instrumentation have been deleted; the old no-cleanup warning is superseded. See docs/BUNDLE1_PREPARATION_RESULTS.md.
