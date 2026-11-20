# URCE native-call performance tracing — mandatory source preflight (2026-11-20)

## Why this gate exists

The owner correctly identified that tests based on mocked `@minecraft/server` APIs were verifying correctness but **not profiling calls to native Bedrock**. Native `System.currentTick` happened to be expensive in owner BDS and consumed **36.0%** of the measured 1.5.5 JS CPU capture. The existing source suite still passed. 1.5.6 removed that hot read, but 1.5.6 owner Bedrock still showed script_tick p90 **97.7 ms** and about **16.4%** above 50 ms; the source has not reached a reliable quiet 20-TPS criterion. **Issue #87 remains an active blocker.**

## New mandatory source-executed trace

`runtime/tests/urce_native_api_budget_trace.test.mjs` executes source-extracted **actual current** `main.js` functions: `schedulerTick`, `logisticsTick`, `processColumn`, `processCollectorIngress`, `processReceiverDrain`, journal idle gate and Dimension-handle cache. The test **does not implement a fake replacement scheduler or routing algorithm**. It supplies counted/mocked Bedrock world/Dimension/Block/Container APIs and model endpoints, with three deliberately distinct scenarios:

- **Empty-input upper bound:** 1,442 individual one-Sorter columns, 73 *linked* Collector records and 54 Receiver records in an overworld, all modeled active and loaded, sampled for 40 scheduler+logistics passes. Every source Hopper reports empty. Those records/columns are **synthetic scale fixtures**, not claims that the owner's saved records are all loaded, nor that the owner's physical Sorters are arranged one per column. This intentionally exercises a conservative upper bound for idle block reads.
- **Small empty-data smoke:** 24 columns and two each Collector/Receiver, with native access counters, independent journal protection and zero item writes.
- **Stationary linked input (known hot risk):** 1,442 columns and 73 linked Collectors whose input Hoppers contain a stationary item, for 20 scheduler+logistics passes. All link safety checks return HOLD; no source debit or queue mutation can occur. The test records that such a setup **currently attempts up to 73 link guard checks per tick**, and does **not** claim the observer's real BDS latency is simulated.

The test counts and fails if source changes exceed explicit bounds for `World.getDimension`, `Dimension.getBlock`, `Block.typeId`, `getComponent(inventory)`, `Container.firstItem`, Sorter journal and Receiver/Q4 native dynamic reads, Collector source discovery, Receiver output lookups, link safety invocations and item writes. `System.currentTick` is a throwing getter that must be accessed **zero times** in these idle loops. Each successful run emits structured `HART_NATIVE_BUDGET_TRACE` JSON to the CI log with per-tick call totals, not invented milliseconds.

The development workflow now requires the trace to pass before producing a preview artifact, and captures a source-only Node `--cpu-prof` profile in a separately labeled GitHub Actions artifact. This profile measures **V8 source/mock runtime cost**, not BDS native time, chunk loading, disk latency, network overhead, container operations or actual server TPS. Do **not** report it as a Bedrock performance result.

## Distinct correctness and native performance gates

1. **Source correctness:** Existing custody, Q4 persistence, direct native journal protection, route safety, version/pack integrity and rollback tests must pass with source equivalence.
2. **Source performance regression:** The counted native API trace and source-only CPU profile must run at the exact Git HEAD for each candidate. Increases in expensive calls, new per-tick native accessors, new item writers at idle, unexpected route checks or unbounded graph scans require a source-level fix or explicit reviewed budget revision before offering a build.
3. **Real Bedrock performance acceptance:** A controlled *owner-stopped copied LAB* installation and then the owner's actual BDS/VS Code `.mcstats` and JS `.cpuprofile` under comparable loaded-region conditions remain essential. The source mock cannot establish an FPS/TPS target. Report median, p90/p99, incidence of >50ms, hotspot attribution, and potential debugger overhead. A passing mock **never overrides a failing BDS sample**.
4. **Operational independence:** Source tests use no owner world, saved Q4 queues, production paths, or installed LAB. A clean Git checkout, exact commit, and stopped copied-LAB Plan → CheckLab → explicit Install still gate the deployment.

## Known limitations and next engineering priority

A full empty registry already demands a source-block observation for each active column each tick, because the 1.4.2 Sorter contract protects matching items from simply passing through a native Hopper. This trace quantifies that cost but cannot justify globally skipping polls or faking a native inventory event. Similarly, a **stationary item in a Collector input** can force repeated topology observations; the 20-tick negative HOLD/REJECT memo can mitigate that in BDS, but legal item routes still revalidate each tick. A subsequent optimization must use a proven change signal and bounded/source-specific path evidence, preserve safe fail-closed behavior and exact Q4 custody, and avoid assuming Transporters or the owner's 13-bank room are mandatory.

This pre-release gate documents and prevents *avoidable API call regressions*; it does not certify unlimited scale. Track owner native acceptance in [performance issue #87](https://github.com/partom24/HartLogistics2/issues/87) and generic optional-Transporter network link safety in [issue #86](https://github.com/partom24/HartLogistics2/issues/86).
