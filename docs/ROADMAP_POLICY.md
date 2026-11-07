# Roadmap Governance and Conversation Intake Policy

**Mandatory across all projects; proportional to project scope.** A roadmap is the authoritative map of **where the project has been, where it is, and where it is going**. A chat thread, a recent experiment, or the latest idea does not replace the roadmap.

## Roadmap contract

Keep one concise, current `docs/ROADMAP.md` for each project, linked from the README and current handoff. It contains:

- **Outcome:** the enduring user-facing purpose and definition of success, not merely a list of code changes.
- **Completed:** accepted milestones and actual evidence/links, without converting a source PASS into runtime acceptance.
- **Now:** at most one owner-authorized primary milestone (or clearly state **No active milestone**). Record its ID, outcome, boundaries, success/exit criteria, acceptance evidence required, blockers/dependencies and next concrete action. Independently authorized parallel work is an explicitly documented exception, not a default.
- **Next:** proposed milestones in dependency order. A proposal is **not** permission to implement.
- **Later:** ideas/longer-term options without implied commitments or dates.
- **Decisions and blockers:** choices requiring owner direction and specific conditions for revisiting them.

Do not invent release dates, progress percentages, approval, completed acceptance, or test results. Milestones describe delivered capabilities or validated decisions, not arbitrary PR/commit counts. Existing project evidence and detailed engineering logs stay in their respective authoritative documents rather than being duplicated in the roadmap.

## Conversation and question handling

When the owner asks a question or explores an alternative:

1. **Answer the question as asked first.** A "could we", "what if", "why", comparison, screenshot observation, or brainstorm is **not by itself** authorization to change scope, write code, create new branches, run tests, deploy, or release.
2. If it has lasting project implications, capture it concisely in the declared `planning.inbox` (possibly a labeled section within the roadmap for a compact project) with an ID, source/context, type (question, idea, defect, risk, decision), impact, proposed disposition, and when to revisit. The inbox is a **triage queue**, not an automatic task list. Ordinary one-off questions need not be logged.
3. Triage as **answered/closed**, **deferred**, **decision needed**, **candidate for a named milestone**, or **urgent blocker**. Unknowns remain unknown; do not prematurely promote a hypothesis into an accepted design.
4. **Only owner-approved reprioritization** moves proposed work into **Now**. Record the tradeoff when a milestone is paused or displaced. Clear directives to implement an already-scoped milestone and directly requested bounded maintenance need no redundant authorization.
5. **Exceptions:** actual safety, data-loss, security, or functional blockers may require stopping unsafe work immediately and investigating within existing safeguards. State the interruption, record it and seek an explicit scope decision before unrelated implementation or broad pivots. This is not a loophole to turn every curiosity into an emergency.
6. At milestone checkpoints (or when asked for a review), re-examine deferred items against project goals, risk and capacity; close, keep, or propose them. Do not grow a permanent untriaged pile.

**Direct bounded maintenance is not reprioritization.** An explicit owner request to correct a contained defect, regression, test or documentation problem may proceed without creating a new milestone or changing `planning.current_milestone`, provided it does not displace the current objective, require a new architecture/release decision, or expand scope. Record the request, changed behavior and relevant checks in the PR or concise handoff, not a new roadmap item or repeated register entries. If it grows into new feature work or displaces committed priorities, request an explicit priority decision first.

## Development execution and handoff

Before starting a meaningful implementation increment, identify the **Now** milestone and its expected outcome, or the explicit bounded maintenance request. If neither is authorized, focus on discussion/triage rather than speculative product code. Maintain a narrow execution plan aligned with the roadmap and avoid research rabbit holes unless they unblock the accepted milestone.

At meaningful checkpoints, update milestone status and evidence, the next action, and the current-state handoff. On acceptance, move the milestone to Completed and remove task-scoped temporary instrumentation. A source-level check cannot certify gameplay, runtime, integration or release acceptance.

## Enforcement boundaries

`scripts/validate_blueprint.py` checks roadmap/inbox paths, required section headings, and the declared current milestone's placement in **Now**. GitHub checks cannot prove that an idea was faithfully triaged, that the user approved a priority change, or that a milestone's acceptance evidence is sufficient. Review and human authorization remain required.

Adopt this standard in existing projects by first documenting the **actual** current milestone and open decisions. Do not alter active implementations, rewrite past history, or restart proven work solely to create a roadmap.
