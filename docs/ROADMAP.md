# Hart Logistics 2 — Roadmap (URCE planning line, 2026-11-17)

## Outcome

Preserve all Hart Logistics 1.4.1 capabilities and world data through a versioned **1.4.2 native-first baseline**, then build a safe, higher-throughput **1.5 Unified Routing and Custody Engine (URCE)** for the owner's pinned [Sorter/storage-room arrangements](../OWNER_PRODUCT_OBJECTIVE.md) at approximate 1,400-Sorter scale. Maintain exact ItemStacks where needed and count-based ordinary item storage only where native custody is proven. Every runtime/owner acceptance and release requires distinct evidence.

## Completed

- Immutable exact original 1.4.1 source and 72-file fingerprint retained (`0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`).
- **HL-142-BASELINE-001 — Development/source closeout:** branch `baseline/native-first-142-20261117`, P4e physical admission and Q4 custody preserved, P4g cache removed, BP/RP version 1.4.2 and guarded LAB transition. [Exact baseline/evidence](../implementation/BASELINE_142_CLOSEOUT_20261117.md). **No** complete owner-BDS performance or production-release claim.
- Source-only P4g correctness but runtime NO-GO for duplicate rejection reuse; no cross-tick global capacity ledger is adopted. Current architecture performance ceiling accepted as development decision; unresolved dense scans recorded.
- Historical 1.5 design and model evidence classified; the selected architecture is URCE and the old Q5 queue-format plan is superseded.

## Now

**HL-URCE-PLAN-001 — Owner-authorized URCE 1.5 architecture planning, active.**

**Goal:** deliver a source-traceable URCE planner/custody architecture and staged integration gates using current 1.4.2 as the only *runtime* foundation. Start with the [routing early-decision implementation contract](../planning/URCE_150_EARLY_DECISION_ROUTING_CONTRACT_20261117.md), [architecture and execution charter](../planning/URCE_150_ARCHITECTURE_AND_DELIVERY_PLAN_20261117.md), [selected historical 1.5 reference map](../planning/URCE_HISTORICAL_15_REFERENCE_REVIEW_20261117.md) and [source-observed 1.4.2 writer census](../planning/URCE_150_ACTIVE_142_WRITER_CENSUS_20261117.md).

**Boundary:** documentation/source-only analysis now. No Bulk/Transporter runtime, Q5 migration, code from frozen #79/#82 branch, owner-world upgrade, LAB installation or release. Keep identical BP/RP addon files to 1.4.2 baseline.

**Exit:** complete current writer/source-effects census and candidate planner input/output/equivalence design, explicit durability/HOLD and q2/q3/q4 migration state machine, source-only fault/performance test plan, unresolved native capability proofs and owner decisions before first 1.5 gameplay authorization.

## Next

- **HL-142-ACCEPT-001 — Separate owner 1.4.2 LAB acceptance:** exact deployed SHA, pack registry bump and rollback, Q4 preserved data, no loss/duplication/metadata changes, Filter/Auto/Wildcard/Bypass/redstone/Hopper behavior and useful throughput on both pinned array layouts. Scope is independent of URCE *planning*; 1.5 runtime requires this compatibility gate to be acceptably resolved.
- **HL-URCE-U1-001 — Proposed read-only planner prototype:** only after U0/plan acceptance, source-executed 1.4.2 differential tests with no native writes, no owner installed pack. Revalidate live destination at last responsible moment.
- **HL-URCE-U2-001 — Proposed unified writer/migration proof:** only after separate authorization and durable physical/journal ownership evidence. Full q2/q3/q4 census, unknown HOLD, no Q5 interim format.

## Later

- Verified native MR custody and 1.5 integration, bounded regional controllers, ordinary Receiver/Bulk accounts (250,000/200,000 respective accepted capacity targets), Transporter into Sorter path, split/merge/restart/multi-region integration, native profiler comparisons at owner scale, then explicit versioned release authorization.

## Decisions and blockers

- **Selected architecture:** URCE control-plane candidate planner + native live data-plane admission + shared custody rule; not a world-wide synchronous scheduler or virtual chest cache. Historical [URCE design contract](https://github.com/partom24/HartLogistics2/blob/main/docs/UNIFIED_ROUTING_CUSTODY_ENGINE.md) remains authoritative.
- **Historical skeleton allowed as selective *reference*:** graph/unknown-topology checks, writer census, bounded pipe source, physical ambiguity HOLD and compatibility tests; old Q5 schema and frozen unified-custody implementation must not be merged.
- **Unresolved:** 1.4.2 owner LAB acceptance; durable transaction/physical receipt and Q4 recovery; script-owned maintenance fence cannot disable vanilla/foreign writers; no-experiment MR inventory; controller election, partitions and revisions; network-governed Auto versus Bulk priority; real useful throughput at 1,400 Sorters.
- **No production apply:** CI/source PASS is not a release. Preserve pack UUID, original world keys, native Hopper observations and game data.
