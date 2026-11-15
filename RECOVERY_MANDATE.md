# HARTLOGISTICS2 RECOVERY MANDATE — NATIVE-FIRST, BASELINE-ONLY

**Status:** binding engineering foundation for this recovery branch. **Established:** 2026-11-14. **Owner authority:** this mandate. **Evidence classification:** source inventory and API documentation, NOT gameplay or performance acceptance.

## 0. Authority, source isolation and freeze

1. **Canonical implementation source is the immutable, owner-supplied Hart Logistics 1.4.1**, imported at Git commit `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`. The original 72 BP/RP files in `addon/` are immutable and verified against `BASELINE_HASHES.json`. Preserve exact IDs, UUIDs, block states, queue keys, filters, item identities, modes, links, redstone and all prior supported paths.
2. **Recovery branch:** `recovery/native-first-141-20261114`, created **directly from the 1.4.1 source-import commit**. Do not branch from, cherry-pick, copy, compare for implementation, adapt code from, or use design/test/artifact/ledger data from the 1.5 development branch. The old branch's identity may be referenced **only** for archival exclusion and administrative verification. No source from 1.5 is a recovery input.
3. **Archived 1.5 line:** `dev/uce-shared-ordinary-ledger-20261111`; PR #79 closed without merging and marked FROZEN / DO NOT MERGE. This is a **development freeze**, not a GitHub-enforced protected branch: current connection does not provide branch-protection mutation and GitHub reports `protected: false`. Repository administrator must install a **read-only/no-push branch ruleset or branch protection** (and preserve the exact head SHA) before calling it technically locked. **Tracked administrator blocker:** [GitHub issue #82](https://github.com/partom24/HartLogistics2/issues/82). Do not push further changes to the branch. Do not infer that closing a PR prevents pushes.
4. Never deploy recovery changes to production; preserve the owner production server, existing worlds and Q4. LAB work only after a candidate with explicit preservation safeguards. No world reset, no draining legacy Receivers as an upgrade prerequisite, no cheats/experiments to manufacture a passing result, no implicit release.
5. The companion root documents are mandatory: [complete recursive file/function census](BASELINE_141_RECURSIVE_CENSUS.md), [per-function native/state effects](BASELINE_141_FUNCTION_EFFECTS.md), [native-first mechanics/scale decision table](NATIVE_FIRST_MECHANICS_AUDIT.md), **[Level 1 official native API reference](LEVEL1_NATIVE_API_RESEARCH_141.md)** and **[Level 1 all-40 mechanism decisions](LEVEL1_MECHANISM_DECISIONS_141.md)**. New implementation must cite a specific census anchor and mechanics ID. Do not mark a proposed native substitute as validated without version-specific BDS proof.

## 1. Engineering rule: native capability first, **before coding**

For each behavior, in this order:

1. **Native vanilla behavior:** Can Bedrock itself move, retain, filter, time, display or protect the item/block correctly? Establish which interactions the vanilla engine owns.
2. **Stable documented native API:** Can an available `@minecraft/server` call, event, component, `Container` operation, `ItemStack`, block permutation, or dynamic property provide the missing bridge? Check the actual baseline manifest (`@minecraft/server 2.7.0`, minimum engine `1.26.50`) against the nominated LAB BDS runtime.
3. **Empirical API feasibility:** Where documentation does not establish behavior (especially Hopper inventory-change signals, custom persistent inventories, multi-record crash atomicity, metadata fidelity and engine save order), run narrow **offline proofs first**, then targeted BDS feasibility checks using backed-up LAB data when required. Distinguish a supported method from a supported transaction guarantee.
4. **Minimal custom gap:** Only implement the unmet logistics rule or persistence protocol. Do not reproduce native inventory functionality in JavaScript merely because code can do it.
5. **Performance and correctness proof:** Compare against equivalent 1.4.1 behavior, track native API calls and actual server tick health, and preserve exact item quantities and metadata. A source test or smaller workload does not confer scaled integration acceptance.

**Rule of evidence:** `BASELINE SOURCE`, `OFFICIAL API DOCUMENTED`, `CANDIDATE / PROPOSED`, `OFFLINE PASS`, `BDS OBSERVED`, `FULL INTEGRATION ACCEPTED`, `OWNER RELEASE APPROVED` are different. Never silently promote a lower level.

## 2. Recovery stages, methodical and recursive

| Stage | Required operation | Deliverable / exit gate | State at foundation |
| --- | --- | --- | --- |
| **R0 Archive & isolate** | Freeze old 1.5 work without merging; create recovery from exact 1.4.1 import; verify ancestry/72 hashes; request native branch protection where connector cannot enact it. | Old PR closed, branch untouched; branch ancestry verified; actual push protection explicitly classified. | **Partial:** PR archived; new baseline-only branch created; hard GitHub protection outstanding. |
| **R1 Exhaustive baseline census** | Visit **every tracked directory and file** from the exact baseline tree, classify runtime/persistence/resource/documentation/CI, enumerate **every named function** and all event/interval entrypoints in `main.js`, map mechanisms to line anchors. | `BASELINE_141_RECURSIVE_CENSUS.md` has full file tree + 1.4.1 function ledger, nothing silently skipped. | **Source inventory prepared; no runtime inspection.** |
| **R2 Native feasibility matrix** | For each custom mechanism, identify existing vanilla behavior and stable native Script API alternatives; call out missing signals, persistence guarantees, version ambiguity and non-native logic. | The 40-row mechanics audit, official-API-specific Level 1 reference, Level 1 all-40 decision matrix, exact-2.7 typing follow-up and falsifiable LAB proof gaps. | **Level 1 official documentation/source review recorded in root; exact 2.7.0 typing extraction and Level 2 BDS verification outstanding. No native replacement approved.** |
| **R3 Correctness and recovery contract** | Derive edge/path, metadata fidelity, Q2/Q3/Q4 upgrade, sorter priority, Hopper pass-through, redstone, unloaded receiver, entity ejection, and crash recovery cases from **1.4.1 only**. | Executable native-first compatibility matrix; unsafe/ambiguous custody HOLD, no loss/duplication; zero legacy feature regressions. | **Not performed.** |
| **R4 Instrument before implementation** | Establish baseline-native API/tick/TPS/throughput measurements on owner-scale loaded arrangements; then profile each candidate using the same procedures. No new custom scheduler without idle-cost and active-throughput evidence. | Matched idle/saturated/blocked/backlog captures, instrumented call counts and repeatable performance acceptance limits. | **Not performed on recovery branch.** |
| **R5 Minimal replacement implementation** | Starting from frozen 1.4.1 semantics, implement only independently proven gaps; preserve native Hopper/filter/item operations when sufficient. No 1.5 source/artifact reuse. | Reproducible build, source-executed fault tests, original 72 hashes unchanged, every custom boundary linked to an R2 finding. | **Not started.** |
| **R6 Complete integrated BDS acceptance** | Validate on **owner's existing restored production-derived LAB world**, with natural stacked columns, many banks/links/Receivers, existing Q4 data, metadata-rich and ordinary items, redstone, restart/unload, backpressure and backlog. Owner controls placements; no artificial one-column product acceptance. | Exact artifact/source, item-count and identity reconciliation, measured TPS and throughput, accepted paths and recovery. | **Not performed.** |
| **R7 Release authorization** | Proven safe cutover and rollback, performance non-regression, no stale writers/temporary probes, explicit owner go/no-go. | Owner-approved artifact only; no automatic release or production apply. | **Blocked.** |

### Recursive review protocol (applies to every iteration)

- Traverse the **entire baseline tree**, not a shortlist: read file type/role, linkage, state effects, native alternative, perf scaling and tests; record `reviewed / needs verification / excluded historical` for each path.
- For each named function: classify as **pure data/helper**, **native integration**, **custom policy**, **persistence/custody**, **scheduled workload**, or **UI/resource**. Inspect transitive callers/callees for major effects, not just its signature. Every major side-effecting function gets a mechanism ID and explicit native-first decision.
- A red/unknown native substitute must become a **bounded proof task**, not a speculative redesign. Continue iterating over call paths until no unexplained native/custom boundary remains.
- Do not fabricate CPU limits, native events, Q4 atomicity, or metadata guarantees. A configuration value is not a platform capacity. Budgets and suggested targets in the mechanics table are **proposals to validate**, never physical build caps.
- An implementation must fail the acceptance gate when evidence for **native alternatives, correctness, or real performance** is missing, even if CI is green.

## 3. Non-negotiable product contract

Preserve all 1.4.1 functionality, item metadata and filters, existing physical/native Hopper routes, Filter→Auto→Wildcard priority and BYPASS, redstone semantics, frame interaction, Collector/Receiver links, dropper/dispenser actual-ejection semantics, unload behavior, q2/q3/q4 queues and journals. Existing worlds must upgrade without destroying/emptying a Receiver. Extend toward high-throughput Transporters, interconnected storage banks, multiple Receivers and Bulk, without arbitrarily constraining valid owner layouts or hiding lag by reducing item throughput.

## 4. Benchmark and threshold rules

- **Grounding scale:** baseline source permits 250,000 queue items/Receiver and batches of 16 with global item-move budgets of 256; these are inherited implementation values, **not proven performance ceilings**. Use an approximately **1,400-Sorter** owner-scale topology and at least one **200,000-item backlog** as acceptance workloads. Validate larger loads and connected banks rather than impose a topology limit.
- **Provisional performance targets, NOT accepted limits:** stable **≥19.5 server TPS** under the representative workload, and the measured HL-specific scripting workload preferably **p95 ≤10 ms / p99 ≤25 ms per sampled tick**; idle workload should show nearly zero expensive destination/queue scans. These are engineering hypotheses requiring matched trials on the actual server with other packs present; revise only through documented evidence. Engine's nominal 20 TPS corresponds to a 50 ms tick budget shared by all systems.
- **Zero tolerance:** unexplained item loss, duplication, metadata mutation, wrong filter/priority, invalid redstone bypass, journal auto-replay on ambiguity, or irreversible migration. Time-based targets never override these conditions.
- Benchmark three comparable windows per scenario after a warm-up; record duration, topology, loaded chunks, Q4 balances, methods/API counts, per-subsystem script p50/p95/p99, actual server TPS, items/s and conservation. Native API availability ≠ measured speed.

## 5. Change control and repository governance

This document controls recovery work on this branch. The 1.4.1 original archive hashes and owner mandate outrank speculative design. A change to the mandate requires explicit owner direction and visible versioned revision; no engineering agent unilaterally relaxes it. Never import 1.5 development material. The archive branch is excluded from all future recovery implementations, tests and decisions.

This foundation **does not** certify any implementation, any Bedrock API behavior under the target server, nor actual branch-level push protection. Those are separate, explicit gates.
