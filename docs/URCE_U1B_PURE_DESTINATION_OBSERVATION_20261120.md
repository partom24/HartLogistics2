# URCE U1-B — Pure Destination Observation and Legacy Side-effect Parity

**Date:** 2026-11-20
**Status:** Source implementation on dev/urce-150-runtime-20261118; source-executed equivalence checked; **not BDS acceptance or Q4 migration**.
**Predecessors:** [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md), [U0 writer census](URCE_U0_ACTIVE_RUNTIME_WRITER_CENSUS_20261120.md), [U1-A local routing decisions](URCE_U1A_COLUMN_LOCAL_DECISIONS_20261120.md).
**Owner LAB:** The actual LAB is an [expendable copy of 1.4.1 production](OWNER_LAB_WORLD_REFRESH_POLICY_20261120.md); the production world is never a test/reset target.

## Implemented

The new, Bedrock-import-free **urce_column_local_decisions.js** now exports:

1. classifySorterDestinationType(typeId, collectorId): pure accepted destination-kind lookup.
2. proveLocalColumnTransit(sorters, source, modeOf, matches): synchronous **read-only** Hopper nonmatch qualification.
3. orderedLocalSorterCandidates(...): stable Filter → Auto → Wildcard ordering, preserving bottom-to-top within each tier.
4. **observeSorterDestination(entry, sorterAt, facingOffset, collectorId)**: synchronous native world *read-only* probe that identifies the actual adjacent physical Sorter destination by kind and Block. No Collector registration, queue loads, Hopper mutation, persistent properties, journal access, cache or route approval. Returns undefined on unavailable/nonmatching block or unreadable getBlock.

The current main.js destinationFor(entry) invokes observeSorterDestination() and then **retains the exact legacy downstream effects**: Collector registration when missing, persistence of reappearing Collector presence, or live native inventory-component retrieval for supported storage. All use sites of destinationFor() remain unchanged. No modification to item movement or receiver queue ownership has been made.

This is a controlled split, **not** a claim that destinationFor(), status reads or loadReceiverQueue() are already pure. Future route planners should invoke the read-only probe; maintenance/admission paths remain explicit and must continue receiving the same effects until proved otherwise.

## Verification performed

- The **actual committed helper source** was executed in an isolated JavaScript V8 context: **6,144** five-Sorter transit × slot cases, **3,072** candidate-order comparisons, **10** destination-type kinds and **3** negative/unknown tests: **9,229 comparisons with zero differences** against legacy reference decisions.
- Ran **90** additional source-executed read-only destination-probe cases across destination kinds, directions and unloaded states: **zero differences**.
- Extracted and executed both the **original source function** destinationFor() from gameplay blob 780b22746a50055ca4eef8030b4a301bf6248f8f and the **modified source function** from current main.js against **60** identically configured Collector and storage fixtures; **zero observed behavioral or registration/persistence trace differences**.
- Added a repeatable test **runtime/tests/urce_u1b_destination_side_effect_parity.test.mjs** using the current actual destinationFor body and a pinned legacy reference implementation. It covers 72 combinations plus two failure-injection cases (Collector registration/persistence failure). The repeatable test was **committed, not executed through Node CI** in this interaction.
- Expanded **runtime/tests/urce_u1a_column_local_decisions.test.mjs** with read-only destination probe / unknown-state cases and integration assertions.
- The already established U0 direct-writer guard includes the helper file with **zero** direct native/world mutation sites. Existing actual cargo writers and Q4/page/journal formats have not been edited.

**Important distinctions:** The source-executed comparisons are deterministic reference checks, **not measured Bedrock API calls or BDS timings**. Unit test source has not been run under the normal Node test runner/CI here; full-runtime native-budget tests, startup/Q4 migration acceptance and owner LAB are pending.

## Future controlled work

- **U1-C:** Build *shadow/read-only* policy observations spanning local columns and managed routes, without a new writer. Compare eligible claimant, route tier, fallback, unknown handling and per-Source connected topology against current behavior. Distinguish legacy standalone transit from governed HOLD.
- Before moving a side-effectful maintenance call away from its current execution point, test and preserve its lifecycle/failure behavior; queue initialization and q2/q3→q4 migrations must not silently move into read-only planning.
- **U2 custody and migration** remains an independent gate. Q4 data stays the current live custodian until the durable single-authority cutover is separately proven against real copied existing-world LAB scenarios.

**Hard NO-GO now:** New per-column timers or 2-/4-tick polling; negative or stale cache as positive route authority; new Q4/Bulk/MR writer; destructive reformat; source-specific graph pruning without cycle/unknown equivalence; LAB/production changes without appropriate deployment validation.
