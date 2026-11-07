# Adoption Guide

## New project from this template

1. In this repository's GitHub **Settings → General**, owner enables **Template repository** (GitHub UI step; the files cannot do this).
2. Click **Use this template → Create a new repository**.
3. Edit `project-blueprint.json`: real project name, project kind, relevant platform profiles, **one actual active source directory** (or `"."` for root-level code), optional `source.test_roots` for separate test-only trees, frozen references (usually none initially), archives (if any), and release state. For an existing release, do not mark approved without real artifact evidence.
4. Replace the template's sample roadmap with this project's real outcomes and priorities at the declared `planning.roadmap`; set the authorized Now milestone or null. The blueprint's BP-* milestones are **not** the new project's achievements.
5. Replace the sample current-state handoff and evidence with actual new-project facts, or state explicitly that validation is still unverified. A compact project may point `planning.inbox` to a labeled roadmap section and `state.evidence` to a labeled current-state section. Keep applicable shared policies, not duplicated blueprint-specific accomplishments.
6. Put real source in the chosen active directory. Add platform-relevant build/test commands only; use existing working installers rather than inventing parallel ones.
7. Tag and register **runtime-connected** temporary diagnostics; keep them optional and remove them with their wiring at task completion. Standalone `TEMP_TEST` probes inside a declared non-runtime `source.test_roots` directory need tagging but not per-file registration; remove them before task acceptance or release. Deliberately maintained regression tests are permanent assets. See [Temporary Instrumentation Policy](TEMPORARY_INSTRUMENTATION_POLICY.md).
8. Review the *affected* active code for unnecessary duplication, abandoned implementations and hidden legacy dependencies. Remove only what is demonstrably safe, preserve existing behavior/evidence and track remaining concrete debt. Follow [Code Hygiene Policy](CODE_HYGIENE_POLICY.md); do not initiate an unrelated restructuring.
9. Run `python scripts/validate_blueprint.py`. If keeping the template's validator self-tests, run `python tests/test_validate_blueprint.py -v` (targets only that file, not the project's full `tests/` directory). Run the application's own relevant tests through its established commands; do not impose Python test discovery on other languages or frameworks. Before a new release candidate, run `python scripts/validate_blueprint.py --release-gate` as well. Observe GitHub Actions before claiming success.
10. Consider branch protection / required status checks **after** confirming they actually run. An unprotected workflow is not enforced policy.

**One-time starter-state cleanup (new repositories only):** The copied `docs/ROADMAP.md`, `docs/CURRENT_DEVELOPMENT_STATE.md`, `docs/IDEA_INBOX.md`, `docs/DEV_LEDGER.md`, `docs/ENGINEERING_EVIDENCE_REGISTER.md`, `docs/ARCHITECTURE_DECISIONS.md` and `docs/BASELINE_REGISTRY.md` are **examples of the blueprint's own project**, not evidence or history of yours. Replace their contents with genuine project facts, leave honest empty/not-yet-verified sections where applicable, or omit optional records and use the compact contract paths. Clear blueprint-only IDs, claims and links; retain the shared engineering policies and AI instructions that apply. This is a **one-time initialization**, not a documentation checklist to repeat for every change. Do **not** apply this reset to an existing project's real history.

## Existing project adoption

Inventory before touching source: active code, historical branches, current owner-approved objectives, deferred questions and decisions, release artifacts, working update scripts, hard-to-retest evidence, and locked baseline identities. Do not interpret past exploratory questions as approvals. Preserve the existing project's genuine ledger, decisions, verified outcomes and frozen references; only remove inherited blueprint-example records when their origin is confirmed. Reconstruct a truthful roadmap from actual decisions and evidence before deciding what should be built next. Add contract/docs/validator first. **Do not force-restructure** active code (root-level source is supported), copy old source into multiple trees, change identifiers, replace working installers, redo established tests, or auto-publish. Bring the rules to the project, not the reverse.

For projects with more than one valid source package (e.g. game behavior pack + resources), place them under one logical active root; they remain separate modules. Existing version snapshots may be frozen and pinned. Update evidence and handoff based on actual Git state and proven runtime facts.

## What does not automatically happen

- Template copies do not receive later blueprint revisions. Track `standard_version` and adopt deliberate updates.
- Workflow files do not turn on required checks, branch protections, CODEOWNERS enforcement or repository template status.
- The validator cannot prove runtime behavior, permissions, absence of data loss, real owner approvals, or hash validity of files it has not seen.
- No additional test server, CI service subscription, production target, or platform toolchain is required by the universal rules.

## Minimal project example

This is a **complete** `project-blueprint.json` for a new, unreleased project, not an excerpt. Replace `MyDiscordBot` with the actual GitHub repository name and customize the project details and source directory. The example deliberately shares a roadmap with its idea inbox and a current-state handoff with its evidence section, so a small project does **not** need separate inbox or evidence files.

```json
{
  "schema_version": 1,
  "standard_version": "1.3.1",
  "project": {
    "name": "MyDiscordBot",
    "kind": "service",
    "platform_profiles": ["discord", "python"]
  },
  "source": {
    "active": "src",
    "frozen_references": [],
    "archives": []
  },
  "state": {
    "lifecycle": "active-development",
    "current_state": "docs/CURRENT_DEVELOPMENT_STATE.md",
    "evidence": "docs/CURRENT_DEVELOPMENT_STATE.md"
  },
  "release": {
    "approved": false,
    "commit": null,
    "artifact_sha256": null,
    "approval_reference": null,
    "evidence_reference": null
  },
  "temporary_instrumentation": [],
  "planning": {
    "roadmap": "docs/ROADMAP.md",
    "inbox": "docs/ROADMAP.md",
    "current_milestone": null
  }
}
```

**Required accompanying files:** `README.md`, `AGENTS.md`, an existing `src/` directory containing the project's active source, `docs/ROADMAP.md`, and `docs/CURRENT_DEVELOPMENT_STATE.md`. The template already provides the entry-point documents; adapt their contents rather than retaining example project claims. The roadmap must have `## Outcome`, `## Completed`, `## Now`, `## Next`, `## Later`, and `## Decisions and blockers` headings. With `current_milestone: null`, its `## Now` section must say **No active milestone**. Keep a clearly labeled idea-inbox section in that same roadmap, and a clearly labeled evidence section in the current-state handoff.

The validator checks the declared paths and roadmap headings, not the truthfulness of those documents. Record actual project facts before claiming acceptance. When the owner authorizes a milestone, replace `null` with its ID and record that same ID in `## Now`. A release metadata field that is `null` means **not asserted**, not “proven absent.”
