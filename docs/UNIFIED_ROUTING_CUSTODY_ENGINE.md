# Hart Logistics — Unified Routing and Custody Engine (URCE)

**Decision status: owner-selected architectural direction, 2026-11-16. Design contract, NOT a claim of implemented code, Bedrock acceptance, or release authorization.**

## Supersession: Q5 is obsolete

**Q5 is an outdated architectural decision made on limited understanding of the requirements.** It treated the next product as a Receiver Q4→Q5 queue upgrade and encouraged building routing, Bulk and custody around a new queue format. That architectural choice is **superseded**, not merely renamed. No future engine is required to implement a Q5 queue, Q5 key schema, FIFO scheduling or a transitional Q5 runtime.

Historical Q5-named documents, offline tests, source prototypes, and old issue descriptions remain **immutable provenance** of what was considered, tested or rejected. Their names and outcomes do not establish current requirements. Do not delete/rename historical identifiers to make the record look different. In particular, **Q4 and earlier q2/q3 saved data, journals and migration compatibility remain mandatory**; deprecating Q5 must never be conflated with deleting or draining Q4.

The historical unified-custody branch documented in [issue #79](https://github.com/partom24/HartLogistics2/issues/79) is **FROZEN / ARCHIVED / DO NOT MERGE**. Its published findings can inform new design reviews, but **its implementation must not be fetched, copied or reused as the new development baseline** (see [issue #82](https://github.com/partom24/HartLogistics2/issues/82)). That draft never passed whole-product BDS integration acceptance.

## What URCE must achieve

One **logically unified** routing and custody architecture across existing Sorters/columns, Collectors, Receivers and vanilla Hopper routes, and future Transporters, regional Bulk Storage controllers and metadata-rich native custody. It must maintain one authoritative ownership/accounting interpretation per item/quantity and reconcile every Hart-controlled write. One logical authority does **not** mean a giant per-tick scan, one physical controller for every region, or one synchronous worldwide performance bottleneck.

**Preserve 1.4.1 compatibility:** original block/pack identities, Filter/Auto/Wildcard/Bypass, Item Frames, vanilla Hopper and Dropper/Dispenser paths, redstone, links, physical journals, queue and saved-world state. A network without correctly established new blocks must keep the original operating behavior. Source-only CI, isolated native-carrier tests and model proofs are not product acceptance.

### Responsibility boundaries

| Part | Responsibility | Must NOT do |
| --- | --- | --- |
| Local Sorter-column planner | Identify eligible local candidates from registry rules, preserving live validations and original priority for standalone routing | Become a Bulk controller, make durable ownership claims, or write a second inventory ledger |
| Collector / input adapter | Validate and admit approved Hopper/item-entity and future pipe input | Independently queue/debit an item outside the common custody boundary |
| Regional Bulk controller | Govern persistent network/region identity, verified shared capacity, local/remote routing choices and region authority; first designated Bulk member serves as controller, others add 200,000 ordinary-item capacity each | Replace Collectors or Sorters, infer unloaded capacity as full, or seize items on ambiguous split/merge |
| Receiver ordinary account | Preserve existing 250,000 ordinary-item capacity and supply efficient batched count-based movement where identity is provably lossless | Force a specific Q5 queue format or reserialize metadata-rich stacks |
| Native MR lane | Keep original ItemStacks in proven finite native slots with backpressure and exact fidelity | Flatten unknown/custom item metadata into ordinary count buckets |
| Shared custody/transaction boundary | Fence sources, destination admission, journals/intent, identity, revision/epoch, ownership and recovery | Let a second legacy/future path debit, credit, retry, settle or clear a transfer independently |
| Transporter | Connect up to six faces; read deliberately connected ordinary-container sources and deliver into Sorter intake using identical filter/redstone semantics | Insert directly into vanilla output chests or bypass Sorter authority |

**Control plane versus data plane:** stable routing/topology/filter information may be indexed and rebuilt on configuration/topology changes. Inventory contents, live Auto seeds, redstone, physical block identity, output capacity, controller/region epoch and actual source/destination are verified at the last responsible moment. Do not assume a native Hopper-content-changed event that has not been established in pinned Bedrock APIs.

### Routing rules

- **Standalone/legacy:** preserve actual 1.4.1 Filter → seeded Auto → Wildcard (with Bypass and redstone behavior). No global policy change simply by upgrading.
- **Explicitly governed ordinary network:** verified accepting local or remote Filter destination first. The offline model historically placed seeded Auto before Bulk, but **its final placement remains an explicit open integration decision**; do not silently remove Auto, let Bulk bypass a valid Filter, or accept an unverified route. With no qualifying destination, use proven usable shared Bulk space for overflow. Wildcard only after *all expected usable Bulk space is authoritatively verified full*. An unavailable Filter, route or unknown/unloaded Bulk state is not proof of fullness; HOLD/reconcile as appropriate.
- **MR:** native ItemStack custody and prioritization without starvation of ordinary items; unresolved Bulk eligibility, wildcard rules and native capacity must fail closed.
- **Network authority:** verified deterministic controller and member identity for a single closed loop or multiple cooperating regions, including load/unload, partition, reconnection, split and merge. Reservations and ACKs must not imply physical transfer proof by caller assertion alone.

### Efficiency requirements inherited from the 1.4.1 audit

- Make per-tick work proportional to **live sources and plausible candidates** instead of repeatedly validating every Sorter, Receiver, adjacent Hopper and route after an unrelated HOLD.
- Build on the existing *logical* Sorter-column structure: its topmost block identifies the intake, but it is **not** a new physical custody/controller authority.
- Share native Dimension and live Block references within a synchronous pass; avoid duplicated Collector and Receiver lookups; use queue-total-first empty Receiver gates where authoritative.
- Do not lower Hopper polling cadence, item admission opportunities or transfer budgets merely to obtain better script-tick timings. Do not introduce stale cross-tick inventory/Auto-seed caches as a shortcut.
- Keep bounded independent region work from being unnecessarily blocked by unrelated regions, **but only where durable transaction/journal semantics establish non-overlap**. The Bedrock JS executor is not assumed to run parallel scripts.
- Profile and test using native Bedrock `.mcstats`, Script Profiler `.cpuprofile`, and VS Debugger; compare warmed real cargo workloads, p50/p95 script time, sampled call paths, actual source/terminal item counts, memory, responsiveness and journal/identity conservation. The observed P4b active script median 73.51 ms/p95 108.85 ms is **not** an acceptance pass or a causal UCE benchmark.

### Migration: Q4 → unified authority, not Q4 → Q5

1. Complete and accept the native-first **1.4.1 foundation** first; no Bulk/Transporter feature development in that phase.
2. Design a durable **world-wide Hart script routing maintenance fence** and enumerate every legacy and future write/callback/recovery entry point. This does not automatically pause vanilla Hoppers or foreign writers.
3. Read and reconcile all q2/q3/q4 records, physical and queue journals, Collector links, Sorter state, unknown/unloaded blocks and opaque item identities **without deleting them or assuming an empty world**. Unloaded pieces remain PENDING until available; unknown custody HOLDS.
4. Stage new URCE accounts/identities only with lossless per-item classification and verifiable native MR custody. No Q5 intermediate format required.
5. Commit single future authority only after credible durability, restart, migration, and physical custody rules have been proven. Unknown post-intent outcomes HOLD with no speculative replay, refund, release or journal clearing.
6. Verify legacy world behavior and integrated multi-bank network at representative scale before owner-approved release. Production untouched without distinct approval.

### Explicit unresolved gates

Native nonexperimental MR endpoint support on BDS 1.26.63.1 (custom-block inventory PG-03 NO-GO), durable cross-inventory versus dynamic-property crash recovery, verified single-writer physical custody, region election/partition, item classification, Auto placement in governed policy, unknown-route fallback, receiver/account lifecycle, legacy opaque Q4 import and performance in representative 675+ Sorter systems. The old offline source models and partial carrier observations close **none** of the whole-product acceptance requirements by themselves.

## Historical source references

- [Original Q5 migration proposal — superseded](Q5_MIGRATION_DESIGN.md)
- [Active logistics requirements](LOGISTICS_DESIGN.md)
- [Architecture decisions](ARCHITECTURE_DECISIONS.md)
- [Baseline ingress/egress matrix](BASELINE_INGRESS_EGRESS_MATRIX.md)
- [Owner's multi-bank reference layouts](OWNER_LAYOUT_REFERENCE.md)
- [Historical unified custody and writer-adoption audit](PG22_UNIFIED_CUSTODY_WRITER_ADOPTION.md)
- [Q5 archival issue / frozen implementation](https://github.com/partom24/HartLogistics2/issues/79)
