# Project Roadmap — Project Engineering Blueprint

## Outcome

Provide a reusable, project-agnostic GitHub engineering standard that keeps projects maintainable, evidence-based, releasable only with approval, and focused on outcomes instead of conversational drift. The blueprint is governance/tooling, not a runtime product.

## Completed

- **BP-001 — Foundational engineering template (v1.0.0).** One active source, immutable reference policy, evidence/release gates, AI instructions, platform profiles and structural CI. Evidence: existing engineering register and prior passing GitHub Actions.
- **BP-002 — Temporary test/debug lifecycle (v1.1.0).** Task-scoped helpers tagged and registered, non-essential in normal operation, removed at task acceptance. Evidence: accepted policy, structural CI and recorded tests.
- **BP-003 — Sustainable code hygiene (v1.2.0).** Scoped cleanup, reuse, evidence-bound regression safety and maintenance-debt review. Evidence: accepted policy and passing structural checks.
- **BP-004 — Roadmap and conversation-triage governance (v1.3.0).** Mandatory milestone roadmap, question/idea intake, owner-controlled reprioritization and structural check. This milestone documents the blueprint update; it does not claim adoption by existing repositories or runtime tests.

## Now

- **BP-007 — v1.3.1 stabilization (merged; acceptance pending).** The scoped v1.3.1 PR was merged on 2026-11-04 and its main-branch structural CI passed. Owner acceptance is not inferred from merging. Bounded corrections are implemented in [PR #3](https://github.com/partom24/Project-Engineering-Blueprint/pull/3): status reconciliation, event-based documentation updates, declared test roots, root-level source and shallow CI. The PR passed structural CI and 32/32 tests; acceptance remains a separate owner decision. Scope is blueprint-only, with no consumer adoption or release. The release gate applies to a future release candidate, not this maintenance PR.

## Next

- **Candidate BP-005 — Selective adoption reviews.** Choose which existing repository to align next; inventory its real current milestone and decisions without changing working code or deployment. **Not approved for execution.** Exit criteria if selected: project-specific roadmap and question intake grounded in actual source/evidence, with focused CI checks.
- **Candidate BP-006 — Maintain validator parity.** Investigate improvements only when a real project adoption identifies a concrete validation gap. **Not approved for execution.**

## Later

- Consider additional language/platform profiles only as demonstrated needs arise; do not create speculative infrastructure.
- Consider automation to surface relevant deferred questions at milestone checkpoints only if manual triage becomes burdensome.

## Decisions and blockers

- **Owner acceptance still to be recorded:** BP-007 is already merged and structurally validated; the bounded follow-up does not imply release or automatic adoption into consumer repositories.
- GitHub workflow success proves structural/offline checks only, not semantic compliance or human-approved priorities.
