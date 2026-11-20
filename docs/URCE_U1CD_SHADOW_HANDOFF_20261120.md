# URCE U1-C + U1-D — Read-only offer bridge and source-scoped shadow

**Date:** November 20, 2026
**Status:** Development implementation on `dev/urce-150-runtime-20261118`. Not a released URCE routing authority, writer, adaptive scheduler or BDS-validated candidate.
**Authority:** [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md), [U0 writer census](URCE_U0_ACTIVE_RUNTIME_WRITER_CENSUS_20261120.md) and [U1-A/B](URCE_U1B_PURE_DESTINATION_OBSERVATION_20261120.md).
**Interpretation of U1-D:** The owner said move to C and D; the existing contract defines C as shadow routing but does not separately specify D. This increment defines D as **source-scoped shadow policy / differential verification**, not a custody cutover or optimized topology observer.

## U1-C — local candidate handoff

- Added `addon/behavior_pack/scripts/urce_column_offer_bridge.js`, importing the already-tested `orderedLocalSorterCandidates` from `urce_column_local_decisions.js`.
- `prepareLocalColumnFrame()` returns the exact existing Filter → Auto → Wildcard candidate order. Main's live `processColumn` now calls that frame and consumes only `frame.targets`.
- The default `captureOffers=false` **does not** construct shadow offers or inspect another inventory, destination, Q4 queue, route graph or Transporter. One small return object is added for each candidate-bearing source observation; this is a potential **JS allocation cost**, not a native call reduction.
- With explicit `captureOffers=true`, the bridge produces source-only Filter/Auto/Wildcard offers preserving bottom-to-top indices. Filter claims are confirmed by the original matcher, **Auto claims remain UNKNOWN**, and every local offer sets `verified:false`: adjacent blocks do not imply network reachability or admission.
- A source cannot be marked as having a global home from a local nonclaim. No game ItemStack, Block reference or inventory cache is retained across ticks.
- The live matcher exception behavior remains unchanged rather than converting an exception into a false negative.

## U1-D — managed-route shadow proof gate

- Added `addon/behavior_pack/scripts/urce_source_scoped_shadow.js` as a **source-only**, nonexecuting adapter to the existing `urce_152_route_model.js` policy function `planReadOnlyCandidates`.
- For STANDALONE_LOCAL, no local candidates means `LOCAL_TRANSIT`, *not* a managed HOLD. Existing candidates mean `LOCAL_CANDIDATES` requiring live native admission.
- For GOVERNED_SOURCE, the shadow requires explicit `coverage:"COMPLETE"`, a valid source-graph supplied by the caller, captured local offers, independently supplied verified-node evidence and any additional remote offers. Missing coverage/graph/scope → SHADOW_HOLD.
- The shadow returns only `SHADOW_CANDIDATES`, `SHADOW_HOLD` or `SHADOW_INVALID`, wrapping the existing planner. **Every result has `executePermitted:false` and `persistPermitted:false`**. It cannot authorize an actual transfer even with a source-consistent graph.
- U1-D is **not imported into main.js**. This is deliberate: computing a graph on every occupied Hopper would repeat expensive observations and violate native-first hot-path objectives. No new managed route is activated.
- No new Bulk/MR native adapter, Q4 migration, journal or global transport authority is introduced. Source-specific topology pruning remains independently unproven.

## Tests and observed behavior

- Added `runtime/tests/urce_u1cd_shadow_contract.test.mjs`: real ESM source modules under Node VM, mixed five-Sorter candidate parity, optional captured Filter/Auto/Wildcard offers, local nonclaim/pass-through, remote reachability, source claim-coverage HOLD, safe cycle refusal and route non-authorization.
- Added `runtime/tests/urce_101_five_item_stage_gate.test.mjs`: repeatable 101 × five Filter columns, five items repeating 20 times, destination columns 21/41/61/81/101, 8-tick synthetic dwell, 1,600 ticks. Tests the **actual** helper/bridge sources against a simple legacy ordered-candidate comparator, not journals/native movement.
- Source-executed V8 direct tests on committed bridge/model/shadow: **5,120** five-mode-set × item candidate comparisons; **zero differences**. Governed proof-gated Filter path returns SHADOW_CANDIDATES but unresolved Auto blocks speculative fallback, and both missing coverage and cycle evidence HOLD.
- Corrected 101-column model replay through actual `proveLocalColumnTransit` and new frame: 161,600 modeled source inspections, 48,000 occupied proven-transit observations, **100** candidate-frame invocations, 100 intended captures, 20 each for five items, zero order differences.
- Recomputed U0 mutation surface across nine imported runtime modules: **46** previously accounted native/world mutation sites and **18** world-property helper calls, **zero** added sinks. U1-D shadow module was checked separately and is not in runtime import closure.
- Syntax checks on modified source and tests passed after import-stripping for static analysis. **Actual Node test process/CI, full-module VM native accounting, and BDS LAB execution have not been performed here.** Do not label this as a source-executed full runtime trace.
- Shared local and governed routing **authority cutover is still OPEN**. The shadow diagnostic is evidence plumbing only.

## No-go and next requirements

Do not enable shadow as a second item writer, read Q4 from shadow policy, mark Auto seeded without live check, interpret partial network coverage as no remote claimant, or infer positive graph proof from cached Filter/Collector adjacency. Do not enable 2/4-tick adaptive polling, source-scoped graph pruning or Q4→URCE migration without their independent proof gates.

Next: run the committed Node tests/full-runtime native budget with the current branch, differential-test actual mapped Collector/Receiver network graphs with unknown/unloaded branches, and measure whether the live candidate-frame allocation changes JS CPU time. Only then consider an opt-in governed shadow diagnostic that reuses (never duplicates) existing safe graph evidence. The production world is protected; the [LAB is an expendable 1.4.1 production-copy](OWNER_LAB_WORLD_REFRESH_POLICY_20261120.md).
