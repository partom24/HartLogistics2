# URCE U1 — Source-executed lazy routing versus 1.4.2

**Date:** November 17, 2026 (owner-local); CI 2026-11-18 UTC. **Scope:** URCE *planning/source-only research*, not an addon candidate, native BDS performance test, LAB change, custody migration or release.

**Question:** Can routing cheaply exclude impossible candidates before live native work, preserve original outcomes and exact Q4, and meaningfully cut the expensive work we previously profiled?

**Authority:** Exact Hart Logistics 1.4.2 engine `addon/behavior_pack/scripts/main.js`, SHA-256 `2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411`. [Binding early-exit contract](URCE_150_EARLY_DECISION_ROUTING_CONTRACT_20261117.md). **Gameplay remains unchanged.**

## Executable evidence

[Source-only differential suite](tests/urce_lazy_routing_differential_142.test.mjs) loads actual current 1.4.2 `processColumn`, `sorterMode`, `matchesFilter`, `findAcceptSlot`, `compactSourceHopper`, `destinationFor`, `sorterCollectorRoute`, `safeMovePartial` and `exactStackSig` function bodies. It builds two explicit alternatives via **guarded, exact source replacements inside test memory**: neither is installed in `addon/`.

- **Proposal A (naive lazy):** stop pre-validating *all* Sorters once per column; first prove any active Sorter exists to preserve compaction, then enumerate matching Filters, Auto and Wildcard in priority order and validate each candidate as needed.
- **Proposal B (shared native Block):** same cheap policy stage, but defer Sorter validation until an actual transfer attempt and supply **that same freshly fetched native Block** to a counterfactual `destinationFor(entry, precheckedSorter)`. Never keep native Block across ticks/callbacks. This removes the immediate redundant `sorterAt` lookup within `destinationFor`.

Tests compare **observable source/destination inventory states, complete ordered mock side-effect/journal traces, moved counts, native destination-resolution invocation counts, native-shaped `getSlot` calls and physical Q4 preparation/clear events** against the *actual* unmodified source. The real source physical writer is executed; native Container and queue/item-entity interfaces are source-only mock objects, not Bedrock runtime. Collector entrypoints and queue serialization are partially modeled at the boundary; **the full queue journaling/recovery implementation is not claimed to be proven here**.

**CI test coverage:** 14 dedicated source-only tests, including 144 deterministic mixed 4–5-high columns, a controlled 350 × four-high column scenario (1,400 Sorters), repeated matching blocked destinations, Filter-only transit/compaction, Auto+Wildcard with metadata, a full Collector→Receiver, missing/powered/quarantined Sorters, source lock/absence and original 16-item column budget. The 1.4.2 candidate tests and independent 99 original 1.4.1 source regression witnesses continue to run separately.

## Exact reproducible source-model outcomes

| Scenario (read counts, not CPU timings) | Original P4e / 1.4.2 | Naive lazy (A) | Shared Block (B) |
| --- | ---: | ---: | ---: |
| Five source slots × four eligible **full** Filter targets — `sorterAt` | **24** | **41** | **21** |
| Same repeated-full example — `getSlot` | **1,080** | **1,080** | **1,080** |
| 144 mixed columns — aggregate `sorterAt` | **1,301** | **1,547** (+246) | **894** (−407) |
| 144 mixed columns — scenarios with *more* `sorterAt` | — | **120/144** | **2/144** |
| 144 mixed columns — `getSlot` | **4,801** | **4,801** | **4,801** |
| 350 four-high columns (1,400 Sorters) — `sorterAt` | **2,100** | **1,750** | **1,050** |
| Same 1,400-Sorter arrangement — `getSlot` | **18,900** | **18,900** | **18,900** |
| Same 1,400-Sorter arrangement — Q4 journal preparations | **350** | **350** | **350** |

The 350-column workload is **constructed to have many Filter mismatches, a full Auto candidate with no matching live seed, requiring a negative admission scan, and an accepting Wildcard chest**; it is **not the owner's exact real inventory mix or a wall-clock benchmark**. Mixed-test randomization uses a fixed seed and 9-slot modeled inventories, not actual native dense 54-slot workloads for every case.

The key observation: **both proposals preserve the same number of actual native destination admission checks in these models.** The exact P4e engine already excludes nonmatching Filters from the destination candidate list. Laziness alone cannot avoid a genuine 54-slot admission for a Filter/Auto/Wildcard target that remains eligible. Source-only lookup-count savings do **not** establish BDS script-time, server TPS or throughput gains.

### Explaining the two remaining mixed-case regressions

Proposal B can still reread a **missing/powered/invalid candidate** separately for multiple occupied source slots. The original eagerly validates every Sorter once, then omits invalid entries for the entire callback. The proposal therefore reduces total lookups but is **not universally monotone** in native block work. We must not disguise this with a cache across ticks or assert that it always wins.

A candidate that preserves a single live block for an entire callback would have to prove that no redstone, unload, block replacement or Collector side effect can invalidate the reference across physical writes. These tests establish neither that native guarantee nor full external-writer concurrency behavior.

## Engineering disposition

**NO-GO — A, naive lazy:** Reject as a blanket 1.5 routing refactor. It adds block lookups in 120/144 mixed modeled columns, while saving zero destination slot reads and leaving custody unchanged. Replacing the existing `activeSorters` list with a lazy generator **is not sufficient** to earn architectural complexity.

**RESEARCH CANDIDATE ONLY — B, live Block handoff:** Stronger source-model result; its reduction comes from eliminating duplicate *Sorter block resolution* within a synchronous attempt, **not** from avoiding dense destination admissions. Before any actual gameplay integration, confirm native Block validity/redstone and Collector registration timing on BDS, and either remove or accept the two individual regression cases with a defensible cost budget. **Do not** assume the 50% source-model Sorter lookup reduction implies 50% runtime improvement.

**KEEP — 1.4.2 baseline and all current custody:** Do not alter `addon/`, original Hopper polling, Filter→Auto→Wildcard priority, existing Transit-first, Q4 physical/queue writers or budgets. Source-only tests do not close the owner 1.4.2 acceptance gate.

**Next cheapest potentially useful question:** When Collector-linked Receiver capacity is **authoritatively** full, can we avoid `serializeQueueItem` without adding redundant queue I/O or changing unreadable-queue and unsupported-item semantics? This is a separate tightly scoped two-order source proof; not permission for a new queue format or any of the older Q5 schemes.

## Reusable lesson for 1.5 URCE

The architecture principle is validated, but **its benefit is conditional**:

1. Configuration/policy mismatch can stop further *candidate-specific* native work.
2. Native Sorter block lookups and live destination admission are different costs; share a fresh block within one synchronous attempt only with a proven validity contract.
3. Actual chest capacity cannot be inferred from Filter policy, loaded topology or a previous failed attempt.
4. Design evidence must always show **what native work was eliminated**, not simply that a JavaScript iterator was replaced.
5. The simplest proven route wins; no worldwide scheduler, cross-tick chest cache or global controller is justified by this source-only trial.

**Status:** U1 source-only equivalence research performed. Proposal A NO-GO, B remains an isolated BDS-dependent candidate. Owner LAB performance, exact 1,400-Sorter physical array and complete durable custody acceptance still pending.
