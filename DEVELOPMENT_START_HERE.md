# HartLogistics2 — development pickup and delivery entrypoint

**Owner BDS terminal-chest issue / 1.5.11 source candidate:** [exact chest-end HOLD at 469,72,-498, directed native Hopper proof, Q4-only Filter home credit, safety gates and stopped-LAB handoff](docs/URCE_1511_NATIVE_TERMINAL_CHEST_HANDOFF_20261120.md). This is source-tested, **not installed or Bedrock-accepted**; the owner's 1.5.10 LAB remains unchanged.


**Current 1.5.10 directional-column candidate (owner's all-valid-column layout requirement):** [BDS layout regression, directional Hopper neighbor proof, exact 1.5.9-origin guarded updater, and next LAB acceptance](docs/URCE_1510_DIRECTIONAL_COLUMNS_LAB_HANDOFF_20261120.md). This source-only candidate is not BDS-accepted or a full multi-bank URCE release. The owner's 1.5.9 installed LAB remains separate and untouched.


**Owner-approved operating direction:** 2026-11-20. This is a **navigation and execution directive**, not an acceptance certificate or replacement for protected historical records.

**Whenever resuming development, even when first handed a current build, a file path, a manifest, a source file, a commit or a recent stage handoff: READ THIS FIRST, then follow the pointers below.** Do not let the newest stage number, commit message, current installed candidate or source file become the sole project brief.

## One authoritative reading path

1. **Operating rules:** [AGENTS.md](AGENTS.md) — see **Active continuous-development directive** at the top. It governs how “continue” and “don't stop until a playable build” should be interpreted within actual tool, session and safety limits.
2. **Evidence and historical provenance:** [PROJECT_CONTINUITY.md](PROJECT_CONTINUITY.md) → [canonical evidence and tooling](docs/CANONICAL_EVIDENCE_AND_TOOLING.md) → [immutable-source resource index](docs/PROJECT_STATIC_RESOURCES.json). These three protected files remain unchanged and retain precedence for historical evidence. Do not redo PG20/PG42 primitive tests or assert historical tools absent from a shortened branch.
3. **End product and player-first design:** [owner-approved 1.5 product contract](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md), [player-first ADR-004](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PLAYER_FIRST_TESTING_DECISION_20261118.md), and [owner reference layouts/images](https://github.com/partom24/HartLogistics2/tree/main/docs/reference-images). Valid arbitrary player layouts/items, not one demonstration room, define gameplay scope.
4. **Architecture:** [HL-URCE-OWN-001](docs/URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md), [pre-contract lessons](docs/URCE_COLUMN_COORDINATOR_PRECONTRACT_LESSONS_20261120.md), [URCE architecture / migration](docs/UNIFIED_ROUTING_CUSTODY_ENGINE.md) and [U0 transitive writer census](docs/URCE_U0_ACTIVE_RUNTIME_WRITER_CENSUS_20261120.md).
5. **Current, not historical, implementation:** Verify the actual checked-out **branch, commit, manifest, gameplay source and passing test status**. The working 1.5 code-development branch on this date is `dev/urce-150-runtime-20261118`, manifest `1.5.8-dev` / `@minecraft/server 2.7.0`. Verify again: branch and date are not a permanent HEAD pointer. The other branches may contain historical 1.4.x code or older/abbreviated state notices; do not mistake those for the current implementation. See [current development state](docs/CURRENT_DEVELOPMENT_STATE.md) for historical context but **not** as the sole source of active truth.
6. **Latest scoped handoffs:** [1.5.9 governed direct native-home gameplay candidate and actual-LAB predecessor gate](https://github.com/partom24/HartLogistics2/blob/dev/urce-159-governed-home-20261120/docs/URCE_159_GOVERNED_DIRECT_HOME_HANDOFF_20261120.md) is the current source-development handoff; source CI is not BDS acceptance. Earlier stage evidence remains available through  [current 1.5.8 candidate readiness, source CI and playable-delivery gates](docs/URCE_158_SOURCE_CANDIDATE_AND_PLAYABLE_DELIVERY_GATES_20261120.md), then [U1-F read-only claim proof](docs/URCE_U1F_SOURCE_CLAIM_COMPLETENESS_20261120.md) and [fixed 101-column / five-item comparison](docs/URCE_101_COLUMN_FIVE_ITEM_STAGE_BASELINE_20261120.md). Stage handoffs record evidence and suggestions, **not mandates to implement the next alphabetic stage**. Check whether they are superseded by newer verified code/evidence.

## How to decide the next task

The highest-level **product deliverable** is a correct, native-first, integrated, performant URCE engine with lossless Q4-to-URCE migration and all owner-approved network/Bulk/MR/retrieval capability. The **immediate engineering delivery goal** is an installable, meaningfully integrated, **playable LAB development candidate** with an honest feature/acceptance scope; this is not equivalent to feature completion or public release.

Before doing work, state what **actually works**, what is only a model/contract/shadow, the real blocker to integrated gameplay, the exact safety preconditions, a simpler/native alternative if applicable, and the next highest-value implementation. Prioritize an integrated end-to-end route over more read-only scaffolding unless scaffolding is a demonstrated blocker. A milestone letter is not a task selector. Prefer genuine product progress and measurable work reduction to extra files, code paths or architectural ceremony.

After each meaningful change: execute whatever tests are actually available, address failures, run the established **101-column/five-item control comparison** and relevant full-runtime native budget and multibank/Q4/recovery tests, label each proof level correctly (source reasoning, source-executed stubs, actual Node CI, Bedrock LAB), and keep source revisions and results pinned. Report item destinations, conservation, native calls and JS allocations/timing separately. Do not label carried-forward estimates new measurements.

## Nonnegotiable design and deployment boundaries

- **One logical routing policy, one accountable custody authority, existing protected physical/Q4 writer adapters.** No second source-debit, speculative network forwarding or unjournaled Bulk/MR writer. New route proposals are not receipts. Do not promote incomplete claim directories or cached chest capacity to live route authority.
- **Native-first:** preserve vanilla Hopper transit and correct 1.4.1 Sorter/Collector/Receiver gameplay; Filter → live Auto → Wildcard and governed Bulk/terminal fallback follow the owner contract; unknown/unloaded claim or bulk status is not NO/FULL.
- **Lossless upgrade:** preserve Q2/Q3/Q4, pack UUIDs, saved links/journals, metadata-rich native ItemStacks and interrupted recovery. No Q5 or revival of frozen branches. No destructive production migration.
- **No automatic BDS clearance:** the LAB is a refreshable copy/paste snapshot of the owner's 1.4.1 production world ([policy](docs/OWNER_LAB_WORLD_REFRESH_POLICY_20261120.md)); it is expendable, but lab deployment/refresh must use the established owner-approved guarded process. The real production world remains protected. Source edits do not authorize server changes.
- **Scope boundaries:** report the most complete verifiable deliverable within the tools/session rather than claiming asynchronous progress. If tools, safety or an owner decision block further work, name the precise blocker and needed action.

## Anti-drift pickup check

Before automatically following a handoff's “Next: U1-G”, ask: **Does that stage produce integrated playable capability or close a specific hard blocker? Can existing source/native Bedrock do it more simply? What test would demonstrate actual improvement?** If the answers are weak, change the development plan. Keep the owner's finished-product contract and architecture; change execution priorities, not product requirements.

**This index is purposely short and stable.** Do not prepend another multi-paragraph stage chronology here. Update specific handoffs and the canonical owner contracts when truly needed; current stage evidence belongs in linked documents, not as a new competing authority.
