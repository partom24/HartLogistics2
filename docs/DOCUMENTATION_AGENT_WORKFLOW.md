# HartLogistics2 — Documentation Agent Workflow

## Purpose

Move routine recordkeeping out of the development/testing conversation. Development can proceed while a separate Codex Worktree chat prepares small, reviewed documentation-only changes. This does **not** run autonomously merely because the role file exists; a dedicated Codex session must be started, and handoffs must be provided when their evidence is not already accessible through Git.

Project-scoped Codex role: [hartlogistics_docs](../.codex/agents/hartlogistics_docs.toml). All repository safety and evidence requirements in [AGENTS.md](../AGENTS.md) still apply.

## One-time activation (after the setup PR is reviewed and merged)

1. Refresh the HartLogistics2 checkout so the new .codex/agents/hartlogistics_docs.toml exists on the starting branch. Start a **new Codex chat**, selecting **Worktree** rather than Local, based on the current main branch. Do **not** hand this chat off into the active development checkout.
2. Ask Codex to use the **hartlogistics_docs** custom agent role. A named subagent spawned inside a development chat can help with analysis, but subagents share the parent environment; this is not a substitute for a dedicated Worktree chat when independent progress and file isolation are required.
3. Give the Worktree chat the latest milestone handoff or an existing development PR/commit to inspect. The Worktree may initially be detached HEAD; use **Create branch here** in the Codex chat header before publishing proposed docs changes. Use a short-lived branch for each reviewed documentation PR, not a permanent parallel product branch.
4. The documentation agent edits only its allowlisted Markdown records, checks the changed-file list and diff, then creates a documentation-only PR for human review. **No merge, auto-merge, production operation, or gameplay change is authorized by this workflow.**
5. Keep the development chat on its current milestone. Only a material contradiction over custody, approval, test outcome, or state authority should interrupt it.

## Development-to-documentation handoff

A handoff is needed **only at a meaningful boundary**: a merged implementation milestone, a new source-level risk with accepted evidence, a completed owner LAB test, a material NO-GO/blocker, or an explicit owner decision. Do not write full ledgers during each coding/test exchange.

The development agent should supply one compact handoff, preferably in the implementation PR description or a single message to the documentation chat. Use this template; omit fields that truly do not apply:

```text
Milestone / purpose:
Source: repository, commit SHA or exact PR, affected behavior:
Evidence: existing HL-E IDs; new evidence artifact link or accessible text:
Checks: test name, CI run, versions/environment, actual outcome:
Owner observation: exact report/screenshots provided, before/after/restart ordering:
Classification: SOURCE REVIEW / OFFLINE PASS / RUNTIME OBSERVED /
                INTEGRATION ACCEPTED / OWNER-REPORTED (with limits):
Proof reuse: unaffected accepted checks, changed contract needing coverage:
Decision / authorization: exact owner decision, or NONE:
Still unknown / explicitly not proven:
Next bounded development action:
```

Do not make the owner retype a result already captured in a readable record. If evidence exists only in screenshots or chat messages that the separate Worktree chat cannot access, provide that material or a short accurate observation in the handoff. Never pretend the threads share chat attachments, unseen images or uncommitted local changes.

## Documentation ownership and minimum edits

| Record | Documentation-agent responsibility |
| --- | --- |
| [DEV_LEDGER.md](DEV_LEDGER.md) | Append dated engineering events; never rewrite accepted history to match a new hypothesis |
| [ENGINEERING_EVIDENCE_REGISTER.md](ENGINEERING_EVIDENCE_REGISTER.md) | Preserve evidence IDs, provenance, levels and limits; add only newly justified evidence |
| [CURRENT_DEVELOPMENT_STATE.md](CURRENT_DEVELOPMENT_STATE.md) | Keep a concise present-tense handoff (source, accepted scope, blockers, next action); avoid repeating historical entries |
| [ROADMAP.md](ROADMAP.md) | Change Now/Next/Later/Completed only when actual owner-approved status changes |
| [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) | Record genuine owner decisions, not proposals or hypothetical options |
| Relevant PG/milestone Markdown | Update a milestone's accepted outcome and surviving limits without duplicating all previous records |

Changes not supported by incoming evidence are out of scope. Read implementation, tests, CI, commits and prior docs as evidence; do not modify those files or run gameplay/Windows LAB/production operations. Validation for documentation can consist of Markdown review, link checks, and inspection of the PR diff; no physical testing is implied.

## Gate before proposing a documentation PR

- All changed paths are within the explicit documentation-agent write boundary in its Codex role.
- Each acceptance label has a test environment, artifact or named owner observation and a clearly stated limitation.
- The latest evidence is reconciled against prior HL-E IDs without duplicates or retroactive upgrading.
- The roadmap reflects only verified milestones and recorded permissions.
- The PR summary lists the source commit/PR, documents updated, remaining unknowns and the next bounded action.
- Non-blocking questions are included in the PR for later review; work on the next development milestone need not stop.

**Not automated by this setup:** starting a Codex chat, creating a local worktree, automatically copying private chat screenshots, invoking the agent on every Git push, or automatically merging its PRs. Those actions require a separate explicit workflow/authorization.
