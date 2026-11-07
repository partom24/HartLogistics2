# Hart Logistics 2 — contributor operating contract

## Authority and repository boundary

- **Only authorized GitHub repository: partom24/HartLogistics2.** Do not read or write any other repository, including HartBots.
- Read [project-blueprint.json](project-blueprint.json), [roadmap](docs/ROADMAP.md), [current state](docs/CURRENT_DEVELOPMENT_STATE.md), [design](docs/LOGISTICS_DESIGN.md), [Q5 migration](docs/Q5_MIGRATION_DESIGN.md) and relevant source before proposing changes.
- The owner has approved **planning/documentation only** at present, with explicit permission to **import the provided HartBots production updater as inert reference source** into this repository. Do not execute production updater scripts (even dry-run) or access/modify the live server before a nominated release candidate, and require separate explicit owner authorization for any subsequent production operation. Do not implement features, alter runtime packs, publish, or change HartBots without fresh explicit authorization.
- The original owner-uploaded 1.4.1 mcaddon is the compatibility baseline; its source is not yet committed. The addon/ directory currently contains a placeholder, not an executable pack.

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

- LAB: `C:\Servers\Thomas_MCBedrock - Copy (2)` is the **only authorized Minecraft integration and release-testing server**; disposable, may be rebuilt from an owner's ZIP. Future updater must use exact canonical allowlist.
- PRODUCTION: `C:\Servers\Thomas_MCBedrock` is a **hard deny for all test activity**. No production edits until a release candidate has been nominated. **Import of a production updater script is permitted, execution (including dry-run) is not permitted before nomination; nomination does not itself authorize a production apply.**
- Treat [updater deployment design](docs/UPDATER_DEPLOYMENT_DESIGN.md) as mandatory for any build/install/deploy work. HartBots scripts in the uploaded ZIP are references, not authorized executable HartLogistics tools.

## Preliminary go/no-go tests

Use [preliminary PG-01–PG-11 bundles](docs/PRELIMINARY_GO_NO_GO.md) before undertaking each major subsystem. Bundle 2–3 focused checks, reuse accepted prior work, start with a plain-language purpose, prepare the full READY rig card before manual LAB setup, and stop dependent features on NO-GO. **Owner accepted this preliminary test plan only with strict [temporary instrumentation cleanup](docs/TEMPORARY_INSTRUMENTATION_POLICY.md): remove probes, test parameters, hooks and associated registry entries as soon as their last test dependency ends, before task acceptance—not only at release.** Track and tag temporary runtime helpers, keep any shared 2–3-test probe only for explicitly active dependent checks, and run the release gate before RC. All current gates are NOT RUN; plan acceptance alone does not authorize source import, gameplay changes or deployment.

## Accepted implementation defaults (2026-11-07)

- Hopper and Transporter are interchangeable **Sorter input** mechanisms sharing priority/filter/redstone rules; pipe atop Sorter columns, adjacent ordinary container means **source**, not final storage; never pipe→ordinary chest output. No output chest at/above pipe Y in intended topology.
- Persist network IDs and deterministic controller ownership; never infer wildcard permission from stale/unloaded Bulk storage. Keep separate finite native MR slots/backpressure from ordinary Receiver queue counts.
- Q4→Q5 migration **stops all Hart Logistics script routing server-wide** under a durable maintenance epoch. Unloaded legacy blocks are **PENDING** until auto-migrated on chunk load, not magically mutated while unloaded. Show status in block menus when loaded; do not assume vanilla Hopper mechanics globally stop. Ensure proven safe resume/rollback before clearing the freeze. See [Q5 migration design](docs/Q5_MIGRATION_DESIGN.md).
- These approvals are **design choices, not implementation authorization**. Source import, gameplay changes, experimental flags, LAB execution and production remain governed by existing gates.

## Current allowed work

Refine planning documents, compare agreed requirements with the 1.4.1 upload, enumerate design decisions and prepare test plans. The next boundary is an **explicit owner decision** to import source or begin implementation; do not infer it from technical discussion.

## Approved future link interaction

Owner-selected UI design: explicit **Link / Relink Receiver** button inside the Collector menu; select Receiver and confirm before storing. No implicit linking on placement, preserve all saved links, transport behavior and sneak-place. Before code changes, check stable `@minecraft/server-ui` dependency and native inventory UI collision for 26.63. See [menu design](docs/UI_LINKING_DESIGN.md).
