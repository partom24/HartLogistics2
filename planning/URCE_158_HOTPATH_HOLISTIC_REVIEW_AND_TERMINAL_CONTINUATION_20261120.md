# URCE 1.5.8 source-only runtime performance and safety review — two full passes

**Branch:** `dev/urce-158-hotpath-safety-20261120`.
**Fixed baseline:** `8bb696129a668699e0867aa1e6786a8716d1ef3a`.
**Scope:** production source optimization under source-only CI, **NOT** installed 1.5.8 or a same-version 1.5.7 pack. Production, copied LAB, world, journal and owner Q4 queues untouched.

## First pass: all shipped scheduler and event paths

The new `runtime/tests/urce_full_runtime_native_budget.test.mjs` executes the exact `main.js` ESM entrypoint and all imported Hart runtime modules against counted Bedrock API stubs. It drives all **seven** real `runInterval` jobs (`schedulerTick`, `logisticsTick`, `reconcileDisplays`, `reconcileModeVisuals`, `recoverJournal`, `recoverQueueJournal`, `flushLogistics`) and source event dispatch/retry timers. The narrow micro test alone was insufficient: it replaced Collector, Receiver, source and route guard functions and could not measure the expensive native clock. Keep both gates and label them correctly.

Full-runtime source review covers: physical Sorter source Hopper admission/compaction and live native output/Filter/Auto/wildcard semantics; every Collector input face; redstone lock; per-link Hopper/Transporter positive route witnesses; Receiver Q4 queue meta and journal custody; direct-only non-stackable fallback; 100-tick legacy entity display reconciliation; 5-tick mode maintenance; independent 20-tick journal recovery; itemSpawn retries; block placement visuals and player UI. The high-value constant-cost calls identified are:
1. Re-fetching the SAME verified Collector/Receiver Block again inside adjacent Hopper discovery: 73+54 native reads/tick in the full 1,442/73/54 fixture.
2. Probing an output Hopper for 54 Receivers whose already-initialized authoritative Q4 queue is **empty**, even though no writer could execute.
3. Native `System.currentTick` in `liveLinkCheck` for every stationary Collector's guard (73 reads/tick), despite multiple checks taking place in one synchronous `logisticsTick` callback.
4. Native Collector block/redstone reads for an item spawn that fails the existing immutable `-0.35/+1.35` spatial admission bound.

## Implemented with single-stack correctness conditions

- `collectorInputSources(e, verifiedCollectorBlock?)` and `receiverOutputHopper(e, verifiedReceiverBlock?)` accept *only same-call already verified* blocks. UI/status paths still revalidate normally. No Block object is stored across callbacks or ticks. Redundant `hopperIsRedstoneLocked` `typeId` checks are bypassed only immediately after a verified `minecraft:hopper` identity; redstone `toggle_bit` is **still read live**.
- `processReceiverDrain` now calls `loadReceiverQueue(receiver)` (original authoritative source) before reading output Hopper, and skips it for a zero Q4 total. For every positive queue, it still checks live Receiver presence/power, actual output Hopper/power, `receiverLinkSafety` and the **unchanged** `dequeueToReceiver` journal/credit writer. No persisted registry `queued` counter is used as a clearance. No Q4 migration, journal or persistent data format changed.
- `liveLinkCheck` reads the native tick at most once per **synchronous** `logisticsTick` invocation, lazily only when routing needs it. The caller uses `try/finally` to invalidate the scoped clock even on early HOLD or native exception. Standalone UI/player/relink checks outside that callback still call native `system.currentTick` freshly. No per-tick safety snapshot or positive permission lives outside the existing guard semantics; negative HOLD/REJECT TTL stays 20 actual native ticks.
- `ejectedItemCollector` performs the existing precise dimension/link and spatial exclusion *before* Collector `getBlock`/power lookup. Near candidates still execute the identical vanilla triggered-bit, Hopper/Dropper distinction, power, source facing and Q4 admissions. The four short retry windows remain unchanged for late vanilla pulses; no new capture acceptance.

## Second pass: single-product measured source budgets

The **same complete shipped runtime** is exercised after these changes. All native metrics below are pure source-executed invocation counts from deterministic mock worlds, **not Bedrock native CPU or actual TPS**.

| Scenario/operation | Exact prior calls | Exact after calls | Scope |
|---|---:|---:|---|
| 100-tick empty, `Dimension.getBlock` | 218,800 | **200,700** | 1,442 Sorter source columns, 73 linked Collector records, 54 Receiver records |
| 100-tick empty, `Block.typeId` | 231,500 | **200,700** | Same |
| 100-tick empty, inventory `getComponent` | 156,900 | **151,500** | Same |
| 100-tick empty, permutation `getState` | 164,200 | **158,800** | Same |
| 100-tick empty, `Container.firstItem` | 151,500 | **151,500** | Must still check native Hopper source emptiness |
| 100-tick empty, `Block.getRedstonePower` | 12,700 | **12,700** | Do not skip powered Collector/Receiver gate |
| 21-tick stationary cargo, native `System.currentTick` | 1,533 | **21** | 73 linked stationary inputs and one blocked native boundary |
| 21-tick stationary cargo, `Dimension.getBlock` | 17,113 | **13,312** | 24 Sorters, 73 Collectors, 54 Receivers |
| One Q4 routed item batch, native `System.currentTick` | 2 | **1** | Exactly two physical `Container.setItem` writes still performed |
| Five retries on unrelated item entity, `Dimension.getBlock` | 3,300 | **2,560** | 73 Collector records, one Receiver, no Sorters |
| One pipe visual placement | 7 | **7** | Preserve local face observation, no cargo mutation |

Source-executed assertions require the new **lowered** ceilings or exact counts; no budget raised to pass a regression. Focused tests also prove near spawned items still reach the powered/triggered source validation and valid Q4 ingress/drain preserves the physical item amount exactly (4 in, 4 out, with zero source remainder).

The native call tests mock API costs. They cannot predict a proportional Bedrock wall-time reduction, native tick distribution, or safety against external add-ons/unloaded chunks. Profiler capture during owner's 1.5.7 routing previously showed script_tick median **139.7 ms** and high `receiverLinkSafety`/native `Dimension.getBlock` sampled CPU. It is NOT a controlled A/B comparison with these changes. #87 remains BLOCKING for native performance acceptance.

## Rejected as unsafe or of diminishing benefit

- No global throttling/skipping loaded Hopper or Sorter input checks: changes transit visibility and vanilla passage semantics.
- No positive route cache across unobserved world changes. Bedrock may change Hopper facing, place a bypass, load a chunk or make a new lower-pull branch without passing through our event callback. Current **same-tick sharing only** and negative memo HOLD/REJECT remain.
- No assuming the owner's 13 banks, visual Transporter arms or `minecraft:air` represent complete coverage; Transporters currently **do not transport cargo**.
- No bypassing fresh `saveJournal(tx)` native property preflight, queue journal or Q4 recovery; no unsafe fake acknowledgement or direct debit to save native reads.
- No replacing real power and Hopper toggle-bit reads with stale state; no precomputed inventory contents or blanket elimination of `Container.firstItem`.
- No simplifying metadata, ContainerSlot, native frame, Auto matching or Filter identity checks to match the test fixture; item loss/duplication unacceptable.

After those guarded changes, persistent cost is dominated by the mandatory **1,442 fresh native source Hopper reads** plus 438 directional Collector-adjacent probes in the artificial 1,442/73/54 configuration. Eliminating them safely requires new authoritative native change observation or a proven graph/dirty revision contract, neither presently available. Remaining opportunities are predominantly riskier than their source-only call savings. This is the point of **heavy diminishing returns** for low-risk generic optimizations.

## Direct-network Hopper terminal continuation — #86

`planning/src/urce_u1_solid_terminal_probe.mjs` detects a facing Hopper terminating against a narrow explicit set of inert vanilla blocks such as cobbled deepslate, with an independent lower-Hopper pull check on every horizontal segment. `planning/src/urce_u1_terminal_graph_review.mjs` now composes it with the original native Collector/Receiver directed graph using **one shared bounded read cache inside the same call** and checks only **source-reachable** unknown terminal boundaries.

`planning/tests/urce_u1_terminal_composed_graph.test.mjs` exercises:
- Receiver→Hopper→Collector→Receiver→Hopper→Collector→Receiver→solid **three-bank** chain, deliberately without Transporters;
- a long directional segment terminating at the owner's **observed coordinates** `minecraft:cobbled_deepslate @ minecraft:overworld 448,72,-478`, from Receiver `minecraft:overworld|448|73|-523` (geometric reproduction, not verified Bedrock runtime);
- a return Collector→earlier Receiver closed cycle (REJECT), lower Hopper pulling from the bus (HOLD), chests/barrels/Sorters/dispenser/foreign storage (HOLD), missing chunks and invalid directions (HOLD), and global Block read-budget exhaustion (HOLD);
- disconnected historic/unloaded Receiver records that must not falsely obstruct an otherwise verified *local* source branch.

**Critical permission boundary:** the combined terminal review reports `LOCAL_TERMINALS_PROVED` for a proved inert local sink, but ALWAYS sets `mayTransferCargo:false`, `mayAuthorizeLink:false`, `persistPermitted:false`, `coverageComplete:false`. It is not yet imported by the live 1.5.7 route guard and cannot release the owner's 16,982 Q4 items. A local stopper does not categorically prove minecart/foreign side-channel absence or every branch of a real world.

### Next acceptance gates

1. Before runtime integration, validate real BDS Hopper pulling, unloaded sections and potential Hopper-minecart extraction against a disposable native server. Add a bounded incremental path observation that does not double-scan each Receiver/chain on every routed tick. If topology freshness or route coverage is unproven, HOLD.
2. Integrate only under a **new versioned 1.5.8+ candidate** with immutable installed-1.5.7 predecessor check, original protected writer parity, explicit return-cycle and Q4 nonmutation source tests, same-cost full-runtime budget, Windows synthetic LAB install/rollback and exact-head CI.
3. After a read-only stopped copied-LAB preflight, the owner independently chooses a still-powered diagnostic test. No automatic Q4 release or deepslate-removal retest.
4. Native performance (#87) and generic optional-Transporter loop safety (#86) remain OPEN. Never represent the new mock call budgets as 20 TPS.

**Status:** safe low-risk hotpath source improvements + first/second-pass suite passed; terminal composed graph source proof passed; no downloadable or installable gameplay build authorized by these tests.
