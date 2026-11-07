# Repository Policy

## Authority

`project-blueprint.json` declares the one active source root, frozen reference paths, and archives. Active source may contain submodules, assets, tests or multiple products that are released together; it is *one authoritative implementation tree*, not necessarily one code directory per language.

- **Active source:** eligible to change. Source history and current handoff tell the truth about progress.
- **Frozen references:** read-only, pinned Git tree hashes. Never patch, reformat, merge into, build from, or silently import from these paths. Explicit port decisions can be made into active source with provenance.
- **Archives / historical branches:** evidence only. They can contain obsolete instructions. Not active toolchains, install sources, or hidden dependencies.
- **Generated output:** exclude from Git unless explicitly needed as an identified release artifact; never substitute generated bundles for canonical source.

## Development

One coherent product line on the selected main/default branch. Short-lived branches for review or integration are allowed and merged back; do not make a new persistent branch for each feature/mode. Keep Git history and recorded evidence. Avoid repeated tiny merges solely to claim progress.

Routine source edits need applicable tests, not automatic updates to every record. At meaningful checkpoints, keep the current-state handoff a **short present-tense snapshot** (active source, verified state, current blockers/unknowns, next action), without accumulating date-stamped history. Keep completed milestones in the roadmap, dated engineering history in the append-only ledger, new proof in evidence, and actual architecture decisions in decision records. Link supporting records instead of repeating them. Consult the ledger when historical detail is relevant, not by default. No broad re-test merely because development moved branches: first identify affected accepted contracts.

## Temporary code cleanup

Runtime-connected temporary diagnostics must be tagged and registered; standalone tagged `TEMP_TEST` experiments in declared non-runtime test roots need no per-file registry. Neither may become a runtime dependency or remain after task acceptance; remove associated wiring and any registry entries. Permanent regression tests are retained. See [Temporary Instrumentation Policy](TEMPORARY_INSTRUMENTATION_POLICY.md).

## Ongoing code hygiene

Every meaningful code change should leave its **affected scope** at least as maintainable as before. Prefer reuse over duplicate pathways, remove safely proven obsolete code and wiring, and record outstanding debt with a clear reason and follow-up trigger. Do not refactor unrelated systems, invalidate established runtime evidence, or touch frozen baselines for cosmetic cleanup. See [Code Hygiene Policy](CODE_HYGIENE_POLICY.md).

## Roadmap and conversational scope control

`docs/ROADMAP.md` is the authority for outcome milestones and **Now / Next / Later / Completed** status; `docs/IDEA_INBOX.md` records durable questions, future ideas, risks and deferred decisions. Implementation follows the currently approved milestone, not the newest exploratory question. Explicit owner-requested bounded fixes that don't displace that milestone may proceed directly; record the scope and tests in the PR, not a new milestone. Record justified interruptions and owner-approved priority changes including their cost. Do not turn every speculative discussion into a task/branch or duplicate technical history in the roadmap. See [Roadmap Governance Policy](ROADMAP_POLICY.md).

## Guardrails

Run `python scripts/validate_blueprint.py` before structural acceptance; the check requires core entry points and all declared contract paths, not every optional policy filename. For each new release candidate, run `python scripts/validate_blueprint.py --release-gate`. Neither check creates GitHub rulesets, proves runtime behavior, enforces permissions or prevents direct pushes. Configure required checks and protections separately if the GitHub plan permits.

Project-specific build/test/deploy commands are recorded in current state. No second installer, production target, or new test server/environ­ment without a documented need and user authorization. Backups and migration expectations must match real project risks.
