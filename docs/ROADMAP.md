# Hart Logistics 2 — Roadmap (1.4.2 baseline checkpoint, 2026-11-17)

## Outcome

Protect the original 1.4.1 Minecraft Bedrock world and feature contract while completing a native-first 1.4.2 development baseline; then plan the next 1.5 **Unified Routing and Custody Engine (URCE)** to scale the owner's [Sorter and storage-room arrays](../OWNER_PRODUCT_OBJECTIVE.md). Source completion, owner BDS acceptance, 1.5 implementation, and release are distinct gates.

## Completed

- Immutable original 1.4.1 BP/RP imported at `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`; 72 file hashes preserved.
- **HL-142-BASELINE-001 — CLOSED at development/source scope only.** Native-first 1.4.2 code baseline is the previous P4e engine (P4g repeat-rejection cache excluded), with 1.4.2 pack metadata and unchanged identifiers, Q4, Hopper/Sorter/Collector/Receiver behavior and API dependency. [Acceptance evidence and outstanding owner gates](../implementation/BASELINE_142_CLOSEOUT_20261117.md). This is NOT a release or a claim of proven owner-scale throughput.
- Prior P4e/P4g LAB profiling demonstrates current dense admission cost and P4g's lack of measured reuse; further 1.4.x speculative cache development deliberately stopped.

## Now

**No active milestone.** The 1.4.2 architecture/optimization iteration is closed. Only preservation, CI, guarded LAB compatibility verification and bounded defects remain on this branch. No 1.5 gameplay development or deployment starts here.

## Next

- **HL-142-ACCEPT-001 — Pending owner LAB/compatibility gate.** Confirm exact installed source/version, world registry bump and rollback, old data/q2/q3/q4 journals and metadata, routing/filters/redstone/vanilla Hopper behavior, delivered item counts and natural owner-scale performance. Acceptance must identify unresolved source/throughput work honestly; owner release is separate.
- **HL-URCE-PLAN-001 — Owner-authorized separate 1.5 design planning.** Create a separate branch from the closed 1.4.2 baseline; use selected [URCE contract](https://github.com/partom24/HartLogistics2/blob/main/docs/UNIFIED_ROUTING_CUSTODY_ENGINE.md) and individually vetted historical 1.5 design/skeleton references. First define planner and custody contracts, migration and tests; no Q5 schema, Bulk/Transporter gameplay or frozen 1.5 source merge.

## Later

- URCE source prototype only after planning decisions and safety gates; unified writer/custody, regional authority, ordinary Bulk Storage, Transporter, native metadata-rich lane and exact old-world migration.
- Integrated LAB benchmark at 1,400-Sorter owner layout, no-loss/no-duplication/metadata conservation, then distinct release review and production approval.

## Decisions and blockers

- **Accepted boundary:** 1.4.2 is an architectural performance ceiling decision, **not** a measured 20 TPS certification. Dense 27/54-slot negative admissions remain costly; no general stale capacity cache.
- **Preservation:** do not lower polling cadence or budgets to hide load. Keep physical Q4 writer, saved-world registry, pack UUIDs, Filter→Auto→Wildcard, nonstackable/MR identity and native Hopper behavior.
- **Historical exclusion:** Q5 is superseded by URCE; archived unified-custody branch #79/#82 may be cited as a rejected study but not copied/merged as a runtime foundation. Approved standalone source-only historical concepts can inform new independent design contracts.
- **Open owner acceptance:** exact LAB upgrade from 1.4.1 to 1.4.2; redstone, frame, Q4/migration, mixed cargo, full destination and real 1,400-Sorter performance. No release or production apply approved.
