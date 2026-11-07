# Development Ledger · append-only

## 2026-11-03 — Initial universal blueprint
- Scope: one cross-platform engineering template and local structural validator, with optional domain-specific risk profiles.
- Decisions: single active source, immutable declared references, evidence levels, owner-gated release, risk-scaled operational safeguards.
- Evidence: source authored and registered; GitHub Actions result and runtime adoption not yet claimed.
- Follow-up: run local/CI validation, enable repository template setting, and adopt in existing projects selectively.

Add dated entries for meaningful changes. Do not rewrite previous PASS/FAIL observations to make a narrative simpler; link a correction if needed.

## 2026-11-03 — CI test isolation and first accepted offline gate
- Initial structural check passed but temporary test project inherited GitHub repository identity; one self-test failed.
- Fixed fixture isolation and added coverage for uncustomized template repository names. Updated GitHub Actions checkout and Python setup runtime versions.
- Actual GitHub Actions commit `cd061acc813618ae0c6b0acc725711a0c3aa64fa`, run 41758054525: structural contract PASS; 7/7 self-tests PASS.
- Still open: enable Template repository in GitHub settings; configure branch protections if desired. No runtime/platform acceptance claimed.

## 2026-11-04 — Temporary testing/debugging lifecycle standard v1.1.0
- Requirement: every task-scoped test/debug command, function, class, hook and related structure is tagged, tracked, and non-essential to normal operation.
- Task accepted/completed => remove temporary implementation plus callers, imports, registrations, flags and registry entries; disabled/dead code is not an acceptable substitute.
- Dedicated permanent regression test suites may remain outside normal runtime; temporary task-only scaffolding may not.
- Updated engineering standard, AGENTS, repository/release policy, PR checklist, contract, adoption guide, ADR, standalone policy and validator tests.
- GitHub Actions run 41821776217: structural contract and new self-tests PASS. This is offline source validation, not runtime proof of non-dependence.

## 2026-11-04 — Standard v1.2.0: code hygiene and sustainable maintainability
- Approved a project-agnostic maintainability rule: reuse established code, prefer simple designs, avoid duplicate systems and hidden legacy dependencies, remove safely verified dead/obsolete code and unnecessary scaffolding in the affected scope, track material unresolved debt with rationale.
- Protect existing behavior, persistent state, frozen baselines and accepted test evidence; never require sweeping refactoring or use line counts / formatting as proxy for safety.
- Updated policy, engineering standard, AI instructions, PR/release/repository guidance, ADR, adoption guide and README; included code hygiene policy in mandatory structural checks and regression tests.
- CI and acceptance distinction: structural checks verify only repository/document requirements. Human review and scoped tests must establish real maintainability and non-regression.

## 2026-11-04 — Standard v1.3.0: outcome-first roadmap and question triage
- Requirement: one concise truthful roadmap per project showing delivered milestones, one owner-approved current milestone or none, candidates in Next/Later, success criteria, dependencies, and explicit decisions/blockers.
- Exploratory questions, suggestions, screenshots, and 'what if' discussions are not automatically implementation instructions; answer them and capture durable ideas for appropriate milestone review. Scope pivots require owner priority choice and displaced-work record.
- Added docs/ROADMAP.md, docs/IDEA_INBOX.md, docs/ROADMAP_POLICY.md, machine-readable planning contract, policy/AI/PR guidance and structural/self-tests. Existing project repositories and runtime code are unaffected.
- Pending: inspect actual GitHub CI run for source-level validation and record the result. No real project adoption or release is implied.

## 2026-11-04 — BP-007: v1.3.1 maintenance proposal
- Goal: concise AI instructions, proportionate documentation requirements, and explicit release-candidate checks rather than confusing a prior release approval with current source.
- Preserved: single active source, frozen references, persistent state, roadmap priority control, task instrumentation cleanup, evidence boundaries and owner-gated releases.
- Evidence: SOURCE REVIEW at authoring. CI/test results and owner acceptance are separate; no consumer or production runtime modified.

## 2026-11-05 — BP-007 merge reconciliation and focused contributor-friction corrections
- PR #2 was merged on 2026-11-04; main commit `d8e70e283defd311fffd28a45400967b16b240c0` passed [CI run 41936225671](https://github.com/partom24/Project-Engineering-Blueprint/actions/runs/41936225671). Merge and offline PASS do not constitute owner acceptance.
- Bounded follow-up: clarify event-based record updates, support explicitly declared test-only roots and root-level source without relaxing historical-source custody, and reduce unnecessary CI checkout history. No consumer code, deployment or release in scope.

## 2026-11-05 — Historical handoff material consolidated into the ledger

- The current-state handoff previously accumulated date-stamped implementation history. Its detailed timeline has been retired from the startup document; the historical events remain preserved here and in the [engineering evidence register](ENGINEERING_EVIDENCE_REGISTER.md).
- Additional historical verification preserved from that handoff: code hygiene v1.2.0 had [run 41824566732](https://github.com/partom24/Project-Engineering-Blueprint/actions/runs/41824566732) PASS on commit `34c8d8919dca35e5890806e61d8fc0a4d9e51af2`. Roadmap governance v1.3.0 had [PR run 41930143367](https://github.com/partom24/Project-Engineering-Blueprint/actions/runs/41930143367) PASS (21/21 tests) on head `4598ad4ca78a161a4217e0dedb7f9baef2f61d88`; it did not prove runtime acceptance.
- The template repository setting was observed enabled on 2026-11-04. BP-007's concise AI entry point, proportional policy-file requirements and separate new-candidate `--release-gate` were integrated through [PR #2](https://github.com/partom24/Project-Engineering-Blueprint/pull/2), with [main-branch run 41936225671](https://github.com/partom24/Project-Engineering-Blueprint/actions/runs/41936225671) PASS. Follow-up layout/validation corrections landed through [PR #3](https://github.com/partom24/Project-Engineering-Blueprint/pull/3), with [main-branch run 42108717812](https://github.com/partom24/Project-Engineering-Blueprint/actions/runs/42108717812) PASS (32/32 tests).
- Earlier handoff notes: v1.1.0 temporary diagnostic lifecycle had [run 41821776217](https://github.com/partom24/Project-Engineering-Blueprint/actions/runs/41821776217) PASS. The v1.2.0 source review could not prove safe cleanup from static checks; the v1.3.0 planning validator could not prove owner authorization. Following the v1.3.0 update there was temporarily no active roadmap milestone; BP-007 is now declared `Now`, with owner acceptance still unrecorded.
- **Scope of this change:** preserve historical results without forcing future contributors to reread them on every task. The current-state file now reports present facts and links here when history is needed. No source implementation, release, or consumer project changed.
