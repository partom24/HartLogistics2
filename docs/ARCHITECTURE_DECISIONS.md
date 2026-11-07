# Architecture Decision Register

Keep decisions that materially affect this project; do not try to document every behavior of the underlying platform.

## ADR-001 — Single authoritative active source
**Status:** Accepted.  
**Decision:** Each project declares one logical active implementation source. Frozen/archived material may be inspected but cannot become implicit dependencies.  
**Reason:** Avoid competing versions, mistaken source ports, and stale AI handoffs.

## ADR-002 — Evidence and releases remain separate
**Status:** Accepted.  
**Decision:** Offline checks, runtime observation, integrated acceptance, and release approval require distinct evidence.  
**Reason:** A passing script does not imply a deployable artifact or authorize publication.

## ADR-003 — Platform profiles extend, never replace, universal rules
**Status:** Accepted.  
**Decision:** Optional engine/language-specific profile notes introduce only applicable checks.  
**Reason:** Minimize ceremony and avoid imposing a game-server model on a Python library or a Discord bot.

## ADR-004 — Temporary testing/debugging code is task-scoped
**Status:** Accepted 2026-11-04.  
**Decision:** Tag and register temporary testing/debugging helpers, ensure core operation does not depend on them, and delete the code plus wiring when its task is accepted/completed. Permanent regression suites may remain outside runtime.
**Reason:** Avoid obsolete diagnostic commands, misleading AI source reviews, and unintended production dependencies.

## ADR-005 — Maintainability is continuous and evidence-bound
**Status:** Accepted 2026-11-04.  
**Decision:** Require proportional code hygiene in every meaningful change: reuse existing systems, avoid unnecessary duplication and complexity, remove safe-to-delete dead scaffolding in the affected scope, track material unresolved debt, and preserve known-good behavior. Do not demand sweeping, unrelated refactors or cosmetic line-count targets.  
**Reason:** Prevent lifecycle accumulation of obsolete code and competing solutions without creating regressions from indiscriminate cleanup.

## ADR-006 — Roadmap-led execution, questions captured before reprioritization
**Status:** Accepted 2026-11-04.  
**Decision:** Every project maintains an outcome-oriented milestone roadmap (Completed/Now/Next/Later) and deferred-question inbox. Only the owner-authorized current milestone directs implementation; exploratory questions are answered and, when consequential, captured without triggering development. Priority changes document the displaced work and reason. Urgent blockers may stop unsafe work but do not authorize speculative rewrites.  
**Reason:** Preserve strategic focus and make progress visible while keeping good suggestions available for deliberate future decisions.

## ADR-007 — Proportional docs and explicit release candidate gate
**Status:** Implemented in main on 2026-11-04; owner acceptance not recorded.  
**Decision:** Use concise task-first AGENTS instructions, require declared contract paths instead of every optional policy filename, and enforce candidate temporary-code cleanliness separately from historical artifact approval.  
**Reason:** Reduce repetitive AI reading and small-project overhead while retaining safety and release gates.

## Recording future decisions
Use **ID, decision, context, alternatives, implications, evidence, status, and supersedes**. Mark old decisions superseded instead of rewriting the past.
