# URCE U1-A — Read-only Column-local Decision Integration

**Date:** 2026-11-20
**Status:** Source implementation committed on \`dev/urce-150-runtime-20261118\`; **local decision-boundary increment only**, not completed URCE routing authority, not adaptive scheduling, not Bedrock BDS or migration acceptance.
**Contract:** [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md)
**Predecessor audit:** [U0 writer census](URCE_U0_ACTIVE_RUNTIME_WRITER_CENSUS_20261120.md)
**Owner-LAB policy:** [Expendable 1.4.1 production-copy LAB](OWNER_LAB_WORLD_REFRESH_POLICY_20261120.md)

## Implemented changes (source branch only)

- Added **addon/behavior_pack/scripts/urce_column_local_decisions.js**: pure destination **type** classification, read-only local Filter/Bypass transit proof using injected live source-Hopper reads, and stable Filter → Auto → Wildcard candidate order. It has **no Bedrock import, registration, route authority, custody writer, journal or persistence access**; it stores no cross-tick cargo or chest state.
- Updated **main.js** to import/call the three functions from the active processColumn and destinationFor paths. Removed the duplicate inline transit decision, candidate list and supportedStorage type test.
- Maintained legacy safeguards: inspect **all** relevant occupied Hopper slots to prove nonmatch, fail conservative on unavailable native reads or matcher errors, keep same-Hopper compaction in the live caller, defer native Auto seed until attempted destination admission, obey powered/bypassed/quarantined Sorters, retain bottom-to-top candidate order.
- Kept **destinationFor() Collector registration/presence update unchanged** as an explicit control-plane side effect **downstream** of pure classification; it is not yet a pure destination getter. This is intentional. A subsequent U1-B must separate registration and observation with equivalent lifecycle semantics before allowing a truly pure candidate resolver.
- Current one-tick scheduler, batch/budget constants, all Q4/physical journal keys, Collector/Receiver queue operations, recovery, startup migrations, event handlers and player/filter logic were **not changed**. This stage introduces no URCE-vs-Q4 migration/cutover.

## Test and evidence scope

- Added **runtime/tests/urce_u1a_column_local_decisions.test.mjs**. Uses the *actual* helper file as a SourceTextModule in Node and compares to 1.5.8 legacy reference logic; includes 1,024 permutations of five Sorter modes × six Hopper slot patterns = **6,144 transit cases**, conservative exception/unknown cases, priority ordering, storage kinds and writer isolation.
- Updated **runtime/tests/urce_u0_writer_surface.test.mjs** to include the new module in the imported closure with **zero direct mutation sites**.
- Conducted an **in-memory V8 source execution** of the *fetched committed helper text*, comparing **6,144 transit**, **3,072 candidate order**, **10 destination types** and **3 negative safety** cases: **9,229 comparisons, zero decision differences**. This was an independent direct-function comparison, not execution of the Node test file or full Bedrock script runtime.
- Recomputed the U0 source change guard across **eight** local import modules: **46 direct mutation-method source occurrences and 18 world-property helper call sites, zero guard differences**. The helper contributes **zero** new mutation sites.
- Parsed the modified main.js (after removing ESM imports purely for syntax validation) with a JavaScript engine: **PASS**.
- Compared **23 named safety-sensitive functions** between the pre-change main.js blob \`780b22746a50055ca4eef8030b4a301bf6248f8f\` and updated blob \`c0bfc2f18acdb937f519d12d79d145c93804bc3d\`: identical source for both custody journals, Q4 loading/ingress/discharge, recovery, native physical writer, compaction, routing budgets, relevant filter and destination admission routines.
- **Not yet performed:** Node \`--experimental-vm-modules --test\` CI execution of the new unit test or existing full-runtime test suite, BDS profiling/real transfers, LAB copied-world migration rehearsal, or owner-playable acceptance. Do not treat source-equivalence counts as latency or native item conservation proof. The code is a development candidate only.

## Why this is safe with future Q4 → URCE migration

This increment *does not* add any new durable custodian, change Q4 page/meta schema, modify migration/recovery, rewrite the physical/Q4 journal or change the world identity. It merely moves already-used local decision logic to an isolated read-only module and calls it from the existing runtime.

Future U2 still requires a world-wide Hart-script maintenance fence, read/reconcile all old Q2/Q3/Q4/physical and queue journals, verify single authoritative custody and native MR identity, stage new accounts without deleting old data, cut over durably under proven recovery semantics, and prove copied existing-world LAB behavior. The 1.4.1 production world remains protected; the LAB copy may be refreshed for repeatable test runs.

## Next incremental development gate

**U1-B:** Separate side-effect-free destination observation from controlled Collector registration and queue initialization. Add source-executed tests for the currently side-effectful destinationFor() and status/Auto paths, including missing/removed/replaced Collectors and failed persistence; compare current behavior before changing calls. Keep existing writers and one-tick polling until that passes. After that, broaden U1 shadow candidate planning to actual governed destination routes without admitting extra cargo.

**Do not enable:** adaptive 2/4-tick polling, new custody debit/credit adapter, old Q4→Q5 migration, stale route approval, source-scoped graph pruning, or any LAB/production deployment by implication.
