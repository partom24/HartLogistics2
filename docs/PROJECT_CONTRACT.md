# Project Contract · human companion to project-blueprint.json

The checked-in JSON file is the machine-readable declaration. Code hygiene is a mandatory qualitative review governed by [Code Hygiene Policy](CODE_HYGIENE_POLICY.md); it is not a synthetic metric or a Boolean that automatically proves maintainability. Its `temporary_instrumentation` array lists active task-scoped debugging/testing source files. Each record identifies the task, file, ID and kind. The source must have a matching temporary tag, and both record and code are deleted when the task is complete.

| Field | Meaning |
| --- | --- |
| `schema_version` | Validator contract format; currently 1 |
| `standard_version` | Adopted engineering standard version |
| `project.name` | Repository project name; update after using template |
| `project.kind` | e.g. blueprint, game, mod, service, library, utility; descriptive, not permission |
| `project.platform_profiles` | Known profile names; choose generic if none fit |
| `source.active` | **One** repository-relative directory containing authoritative implementation, or `"."` for root-level implementations. Declared frozen/archive subtrees remain excluded from active authority. |
| `source.test_roots` | Optional array of repository-relative test-only directories outside or inside the active tree. They are not extra implementation/build roots; declared temporary test helpers in them are validated. |
| `source.frozen_references` | Array of `{path, git_tree_sha}` frozen directories, each SHA exactly 40 hex digits |
| `source.archives` | Non-active repository-relative historical directories |
| `planning.roadmap` | Relative Markdown path for the authoritative milestone roadmap. |
| `planning.inbox` | Relative Markdown path for deferred questions/ideas/decisions. |
| `planning.current_milestone` | ID of the sole authorized **Now** milestone, or `null` if none. An ID must appear in the Now section; null requires the explicit statement `No active milestone`. This validates structure, not actual authorization. |
| `state.lifecycle` | Meaningful current status; not a test result |
| `release.approved` | Historical approval of the identified artifact; **not** approval of any newer development source |
| `release.commit` | Full 40-character source commit of the approved release |
| `release.artifact_sha256` | SHA-256 of the actual distributable, not a Git blob/tree hash |
| `release.approval_reference` | Human decision location (issue, release approval, ledger reference) |
| `release.evidence_reference` | Evidence supporting the scoped release approval |

A repository's active source might be `src`, `source`, `app`, `scripts`, or `"."` for root-level source. If permanent tests live outside that tree, declare their test-only directory in optional `source.test_roots`. Historical reference/archive subtrees remain excluded from active source even when the root is active. Do not create extra directories merely for uniformity. Update the contract and actual state after adoption.

The validator requires `README.md` and `AGENTS.md` plus each declared roadmap, inbox, handoff and evidence path; other policies/registers are optional separate filenames. Compact projects may reuse roadmap as the declared inbox and current state as declared evidence with labeled sections. Run `--release-gate` on each new candidate rather than treating approval of an earlier release as a perpetual development-code restriction.

The validator checks shape and certain invariants; it cannot know whether a test happened, an artifact was published, or owner approval was actually granted. Never manufacture these facts to make checks green.
