# Hart Logistics 2: full-runtime native call-cost development gate

**Scope:** source/CI-only performance proof, no gameplay source changes, no LAB or production install.
**Implementation:** `runtime/tests/urce_full_runtime_native_budget.test.mjs` (Node VM ESM loader).
**Companion micro-gate:** `runtime/tests/urce_native_api_budget_trace.test.mjs` (intentionally stubs several Hart functions).

## Why this gate is required

The older 1,442-column trace executed a selection of real tick functions but **replaced**
`collectorAt`, `receiverAt`, `collectorInputSources`, `receiverOutputHopper`, and
`liveLinkCheck` with costless implementations. Consequently its zero
`System.currentTick` result did **not** include the real Collector route validator.
The actual validator in `main.js` reads the native tick clock every call and may
rescan native Hopper/Transporter topology. Also previously missing were the
100-tick legacy display pass, 5-tick mode maintenance, recovery intervals and
event-triggered spawn retry/pipe-visual paths.

## Execution rules

The full-runtime gate evaluates the real, unchanged add-on JS ESM entrypoint
`addon/behavior_pack/scripts/main.js` and all its recursively imported runtime
modules in a shared Node `vm.SourceTextModule` context, with **only the
`@minecraft/server` module implemented by counted stubs**. It does not
substitute Hart routing, Collector, Receiver, Q4, source discovery, or topology
functions. `runInterval`, `run`, `runTimeout` and subscribed events are
clocked by a deterministic fixture. All seven recurring jobs must register or
the test fails. Native Block, Dimension, Container, ContainerSlot, BlockPermutation,
journal/dynamic-property, and `System.currentTick` accesses are counted.

The reporter emits `HART_FULL_RUNTIME_NATIVE_TRACE` JSON (counts and
per-tick averages). Each fixture is explicitly **synthetic**. The suite measures
native API **invocations only**, not Bedrock latency, TPS, item entity physics,
chunk activity, inter-addon contention, or actual CPU percent. Mocked native
APIs have simplified semantics, so Bedrock profiler evidence remains mandatory.

## Mandatory separate workloads

| Gate | Fixture | Proves/guards |
| --- | --- | --- |
| FULL-NATIVE-01 | 1,442 empty Sorter source Hoppers, 73 linked Collectors with empty Hopper inputs, 54 Receivers, 100 steady ticks | Every scheduled job; block/type, Hopper locks, inventory components and firstItem, journal reads, no cargo writes, no native tick getter |
| FULL-NATIVE-02 | 24 Sorters, 73 linked Collectors with stationary input stacks, 54 Receivers and deliberately unsupported native boundary, 21 ticks | Real guarded negative route verification, live tick getter, broad native/visual observers and negative-result expiry, no custody debit |
| FULL-NATIVE-03 | One Collector Hopper with a fresh stack, one Receiver, genuine safe topology | Actual source debit, Q4 journal/property writes, Receiver drain and output Hopper credit; bounded admission reads |
| FULL-NATIVE-04 | 64 legacy (non-implanted) Sorters, 100 ticks | Real entity-local 100-tick display reconciliation and 5-tick visual maintenance; separates this from native-frame steady state |
| FULL-NATIVE-05 | One unrelated spawned `minecraft:item`, 73 linked Collectors | Full item-spawn filtering and four retry timers; existing per-Collector native inspection cost is no longer invisible |
| FULL-NATIVE-06 | Player block placement with no nearby pipes | Event-triggered local visual queue, no full-room scan or cargo mutation |

Keep the old micro-gate because its small isolated seam is fast and useful,
but **never interpret it as a whole-mod call budget**.

## Baseline from exact full-runtime source-fixture run

In the 1,442/73/54 empty fixture: **2,188 `Dimension.getBlock` calls/tick**,
**2,315 `Block.typeId` calls/tick**, **1,569 inventory component lookups/tick**,
**1,515 `Container.firstItem` calls/tick** and **1,642 block permutation-state
reads/tick**. The 73 Collector input Hoppers contribute 73 additional emptiness
reads not counted in the earlier Sorter-only figure. Native tick reads are zero
only in this *genuinely empty* fixture.

In the 73 stationary-Collector fixture, real `liveLinkCheck` executes
`System.currentTick` **73 times/tick** even when persistent negative topology
results suppress most repeated scans. This is an accepted **known present cost**
for the gate; do not change the test to hide it. A later runtime optimization
can lower the budget, but raising the baseline requires explicit review and
owner BDS profiling. The fixture's 21-tick sampling includes negative-memo expiry.

For one successful ingress/drain, native activity also includes Q4 property
reads/writes, ContainerSlot inspection, both custody inventory writes and fresh
source-specific route checks. Test verifies final physical inventory amounts,
not just a count of mocked write calls.

## Next-round review policy

1. A normal source-candidate CI build **must pass both micro and full-runtime
   budgets** before a preview artifact is considered. The full-runtime gate
   fails closed if any scheduled task is silently omitted or any measured
   native API invocation exceeds its explicit workload budget.
2. Compare structured `HART_FULL_RUNTIME_NATIVE_TRACE` output with the
   preceding accepted commit, especially **when a gate still passes**;
   a moving profile can reveal a dangerous trend below an upper bound.
3. Every new periodic loop, native inventory accessor, property read,
   route/network observer or retried event handler needs a corresponding
   fixture/budget. Preserve scenarios with different network shapes;
   the owner's bank room is not a mandatory product topology.
4. Do **not** solve a budget failure by replacing a Hart function with a mock.
   Do not make Q4 journal semantics, source custody or native Hopper direction
   less strict to achieve a cheaper count. When a new route is legitimately
   supported, revise the gate with a documented before/after call census.
5. Before gameplay acceptance, independently validate on a stopped copied LAB
   with BDS `.mcstats` and paired JS/TS CPU captures. A source mock cannot
   certify 20 TPS or eliminate production risk.

**No runtime source, saved world, release pack, LAB, or production data was
modified by this test-only change.**
