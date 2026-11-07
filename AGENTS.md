# Hart Logistics 2 — contributor operating contract

## Authority and repository boundary

- **Only authorized GitHub repository: partom24/HartLogistics2.** Do not read or write any other repository, including HartBots.
- Read [project-blueprint.json](project-blueprint.json), [roadmap](docs/ROADMAP.md), [current state](docs/CURRENT_DEVELOPMENT_STATE.md), [design](docs/LOGISTICS_DESIGN.md), [Q5 migration](docs/Q5_MIGRATION_DESIGN.md) and relevant source before proposing changes.
- The owner has approved **planning/documentation only** at present. Do not implement features, alter runtime packs, publish, or change HartBots without fresh explicit authorization.
- The original owner-uploaded 1.4.1 mcaddon is the compatibility baseline; its source is not yet committed. The addon/ directory currently contains a placeholder, not an executable pack.

## Non-negotiable compatibility contract

1. **No loss of any 1.4.1 capability**: preserve Sorter/Collector/Receiver functions, modes, filters, linking, hopper paths, dropper/dispenser handling, redstone semantics, Q4 data, q2/q3 migration, and recovery. No optimization may silently weaken these contracts.
2. **Persisted state is critical**: preserve pack UUIDs, block identifiers, saved links, block states, queue keys, journal behavior and original items. Existing worlds must not require manually emptying Receivers to upgrade.
3. **Separate decisions from hypotheses**: an agreed requirement is not yet implemented or tested. [Open questions](docs/IDEA_INBOX.md) are *not* permission to code.
4. **Q4 → Q5 must be lossless**: stage new storage separately, verify exact item counts/identities and journal state, atomically commit authority, preserve rollback evidence without replaying stale data after cutover.
5. **MR items require native item fidelity**: do not silently serialize, flatten, delete or duplicate item metadata. **Owner choice:** replace the 1.4.1 direct-only MR Hopper fallback with native persistent MR storage on both Collector and Receiver, but only after copied-world validation proves the preserved *capability*; legacy bypass may remain temporarily during migration. Native container APIs and version/experiment gates must be confirmed before code relies on them.
6. **Native hoppers remain valid** in all formerly supported positions; new Transporters are an additive path, not a mandatory replacement.
7. **Testing claims are bounded**: SOURCE REVIEW and OFFLINE PASS are not RUNTIME OBSERVED or INTEGRATION ACCEPTED. Owner-reported native MR testing is valuable but its artifacts have not been imported to Git.
8. **Release requires owner approval**, identified source, target-runtime evidence, and release gate. No automatic promotion from a passing build or PR.

Follow [engineering standard](docs/ENGINEERING_STANDARD.md), [repository policy](docs/REPOSITORY_POLICY.md), [code hygiene](docs/CODE_HYGIENE_POLICY.md), [temporary instrumentation](docs/TEMPORARY_INSTRUMENTATION_POLICY.md), and [release policy](docs/RELEASE_POLICY.md) whenever relevant. Avoid speculative refactors, duplicate implementations, unsafe cleanups and persistent per-feature branches.

## Current allowed work

Refine planning documents, compare agreed requirements with the 1.4.1 upload, enumerate design decisions and prepare test plans. The next boundary is an **explicit owner decision** to import source or begin implementation; do not infer it from technical discussion.

