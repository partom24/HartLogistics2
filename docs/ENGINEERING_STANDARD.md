# Engineering Standard · v1.3.1

## Non-negotiable cross-project contracts

1. **One implementation authority.** Each repository declares a single active source path, or one logical active source root containing multiple modules. Multiple historical snapshots may coexist, but cannot become implicit build inputs. `main` is the normal unified development line; short-lived integration PRs are acceptable, ongoing feature-specific product lines are not the default.
2. **Preserve known-good source.** Approved release/baseline reference paths remain byte-for-byte unchanged and are pinned in the registry and machine-readable contract. Make a new baseline rather than edit an old one. A Git commit or tag is supplementary provenance, not a reason to mutate a reference tree.
3. **Custody of user state.** Persisted data, identities, migrations, ownership, inventories, savegames, credentials, deployment config and externally visible contracts have explicit protection. Prioritize no destructive change over speed or convenience. Define risk per project; do not impose a Minecraft item-transfer model on unrelated software.
4. **Evidence is bounded.** Record what was tested, the commit/artifact, the environment, the observed result and what remains unknown. Don't convert a source-only review into a runtime PASS, or an observed feature into whole-system acceptance.
5. **A human approves releases.** Shipping requires an explicit decision. Record the exact commit, release artifact checksum and relevant acceptance evidence. Main-branch activity is never automatic publication.
6. **Reproducible safe path.** Prefer one established build/deploy/update path with validation, dry-run where feasible, backup/rollback for risky stateful updates, and clear refusal on unexpected conditions. No surprise production deployment or additional infrastructure.
7. **Accurate human/AI handoff.** Keep current state concise and actual; historical logs are append-only evidence. No repeating already accepted tests without a concrete changed risk.
8. **Temporary testing/debugging code expires with its task.** Runtime-connected temporary diagnostics must be tagged `TEMP_TEST:<ID>` or `TEMP_DEBUG:<ID>`, registered against their task and non-essential to normal operation. Standalone non-runtime `TEMP_TEST` probes in declared `source.test_roots` need a tag but no per-file registry. Remove both kinds and their wiring at task acceptance/completion; the release gate rejects leftovers. Retain deliberate permanent non-runtime regression suites without temporary markers. See [Temporary Instrumentation Policy](TEMPORARY_INSTRUMENTATION_POLICY.md).
9. **Sustainable code hygiene.** For each meaningful change, reuse the authoritative implementation before creating another; keep affected modules comprehensible and remove safely verified dead, duplicated, obsolete, or temporary structures and wiring. Avoid unnecessary abstraction, competing workflows, historical source in active builds, and indefinite cleanup placeholders. Preserve proven behavior, data, public contracts, and baselines. Keep unresolved debt explicit, risk-scoped, and tracked. No sweeping unrelated refactor just to satisfy style. See [Code Hygiene Policy](CODE_HYGIENE_POLICY.md).
10. **Outcome-led roadmap and deliberate prioritization.** Maintain a current roadmap with completed, active, next and later milestones and evidence boundaries. One primary owner-authorized milestone is active at a time unless explicitly agreed otherwise. Exploratory questions are not implementation directions; durable proposals go to the inbox. Explicitly requested, bounded maintenance that does not displace the active objective can proceed without a new milestone; significant scope or priority changes need an owner decision. Safety-critical blockers may pause unsafe work, not authorize unrelated implementation. See [Roadmap Governance Policy](ROADMAP_POLICY.md).
11. **Proportionality.** The same principles apply to every project; implementation weight follows risk. A small utility may keep evidence and ideas in labeled sections of its handoff/roadmap; a stateful multiplayer system needs fuller safeguards and distinct records as useful. Optional policy files are reference guidance, not mandatory duplicated paperwork.
12. **Development versus candidate release:** historical approval of an artifact does not freeze later development. Normal validation permits tagged task-scoped diagnostics in later work; the explicit `--release-gate` rejects them for a new candidate, and review must find any untagged helpers.

## Evidence vocabulary

| State | Exactly what it establishes |
| --- | --- |
| SOURCE REVIEW | Static/code/document inspection; not proof the code executed |
| OFFLINE PASS | Named build, test, lint or simulated fixture passed in a specified environment |
| RUNTIME OBSERVED | A behavior was actually witnessed in the target runtime, within recorded limits |
| INTEGRATION ACCEPTED | Defined acceptance criteria for an integrated subsystem were met in a documented environment |
| RELEASE APPROVED | Owner explicitly authorized an identified artifact for a specified audience/environment |

A later stage is **not** implied by an earlier one. A regression can invalidate a specific prior acceptance but must not erase unrelated historic proof.

## Standard changes

Version the engineering standard. A new version may strengthen checks, but never silently rewrite project-specific source, frozen baselines, or deployment. Existing repositories adopt changes through a reviewed integration, not automatic template synchronization.
