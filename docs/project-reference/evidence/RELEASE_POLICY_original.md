# Release Policy

**Development is not publication.** Source merged to the main branch is not automatically an approved public or production release.

A release should identify which accepted roadmap milestone(s) it satisfies and where scoped acceptance evidence lives. A roadmap milestone marked Completed does **not** itself constitute release authorization. Exploratory suggestions in the idea inbox are not release scope.

## Promotion gates

1. **Identify:** exact source Git SHA, build entry point and source/asset identities.
2. **Validate source:** static checks, schema/migration guards and chosen platform-specific offline tests, with recorded outcomes.
3. **Validate context:** real runtime/target environment and integration behavior when applicable. A small script with no separate runtime integration may document “not applicable” with justification; do not invent a test.
4. **Clean temporary instrumentation:** remove completed task-scoped runtime test/debug helpers and their wiring; normal operation must work without them. On the **new release candidate tree**, run `python scripts/validate_blueprint.py --release-gate` to reject any nonempty `temporary_instrumentation` registry **or remaining tagged standalone test-only probes** in declared test roots, even if an older artifact was approved. Review for untagged helpers and runtime linkage as well; static checks cannot reliably find them. Permanent regression suites outside runtime are not shipped execution paths.
5. **Review code hygiene:** inspect shipped active code for discarded experimental scaffolding, stale/duplicate execution paths, unjustified complexity and undocumented debt; remove only where safety is established. Preserve intentional compatibility/safety code and existing data contracts. Record what remains and why. Refer to [Code Hygiene Policy](CODE_HYGIENE_POLICY.md).
6. **Review risk:** backward compatibility, persisted/user state, dependencies, performance, security, operator steps, outstanding limitations and rollback/recovery.
7. **Owner approval:** explicit decision for the intended audience/environment. Not inferred from PR merge, version bump or CI PASS.
8. **Record artifact:** immutable distribution file/checksum (SHA-256), source commit, release notes, version and acceptance references. Frozen released source may be registered without changing earlier baselines.

For `release.approved=true`, `project-blueprint.json` records the **last specifically approved artifact** with exact `commit`, `artifact_sha256`, `approval_reference`, and `evidence_reference`. This does not approve later development. Every new release needs its own candidate gate and owner decision; metadata completeness is not proof of cleanliness or runtime acceptance.

## Deployment safeguards

Prefer one documented and validated path. Refuse unexpected worktree, version, target, permissions, running-process or saved-state conditions. For stateful deployment, use verified backups and rollback/reconciliation; for stateless libraries, avoid invented infrastructure. No automatic production publish without explicit project-specific authority.

The blueprint repository itself is an engineering template and has **no approved distributable release** at initial creation.
