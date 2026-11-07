# Code Hygiene and Sustainable Maintainability

**Mandatory across platforms; proportional to the size, risk, and maturity of the project.**

## Purpose

Prevent accumulated technical debt, duplicate systems, discarded experiments, and confusing legacy paths from becoming the product. "Clean" means **correct, comprehensible, maintainable, and demonstrably safe to change**, not short code at any cost or stylistic perfection.

## For every meaningful development task

1. **Before editing:** Identify the active implementation authority, existing behavior, relevant contracts, and known proven tests. Reuse functioning implementations before adding parallel mechanisms. Check whether a new abstraction is actually needed.
2. **While editing:** Prefer the simplest adequate design; use meaningful names, clear module boundaries, single responsibilities where useful, and supported native/platform features. Avoid speculative frameworks, unnecessary indirection, duplicated business logic, hidden mutable state, obsolete compatibility shims, and extra scripts/install paths without a demonstrated need.
3. **At task completion:** Review the **affected scope** for dead code, unused imports, abandoned branches, duplicate logic, outdated comments/instructions, debug instrumentation, and obsolete feature flags. Remove safely proven obsolete parts together with their references. Verify behavior and persistence/integration boundaries appropriate to the changes. If removal cannot be proven safe, do **not** delete it merely to satisfy style; record what remains and why.
4. **Record genuine debt:** A known issue that cannot safely be resolved within the task's scope should have an owner or tracking location, impact/risk, evidence, and a specific trigger for revisiting it. Avoid indefinite "cleanup later" placeholders. An intentionally duplicated or complex implementation should have a brief rationale.
5. **Keep the evidence honest:** Existing tests and prior runtime proof remain valid within scope. Use focused regression checks for affected contracts. Update current state, evidence, and architectural decisions if behavior or guarantees change.

## Boundaries: cleanup must not create regressions

- **No sweeping unrelated refactors** as a condition of delivering a small feature or bug fix. Changes should leave the touched area at least as maintainable as before, without introducing new risk. Large cleanups need their own bounded task and acceptance criteria.
- **Never alter frozen baselines, archives, existing user state, schema/IDs, wire protocols, public APIs, runtime assets or deployment behavior** as cosmetic housekeeping. A real migration or breaking change requires a separately approved, evidence-backed plan.
- **Preserve meaningful history in Git and evidence records**, not duplicated legacy production implementations. Historical source is reference-only and not a hidden build dependency.
- **Do not delete required diagnostics, deliberately maintained test suites, compatibility support, or safety checks merely because they look redundant.** Distinguish task-scoped temporary code (which must be removed on acceptance) from intentionally supported product behavior and non-runtime regression testing.
- **Never substitute formatting, file length, line-count quotas, comment density, or a generic static score for correctness and maintainability.** Tools may assist review but cannot establish semantic safety.

## Integration/release review

A meaningful PR or task handoff should briefly state changed behavior, relevant checks, affected compatibility boundaries and material unresolved debt. Mention reuse, cleanup and deliberately retained complexity when applicable; do not require an itemized narrative or placeholder entries for unaffected areas.

An approved release must not knowingly ship abandoned experiments, dead mandatory execution paths, or task-specific temporary instrumentation. This is a **review and acceptance requirement**: the portable blueprint validator checks that this policy exists, not whether arbitrary code is genuinely clean. Do not claim a green CI check proves code quality.
