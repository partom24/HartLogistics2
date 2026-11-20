# URCE U1-E — Reuse Same-tick Topology Evidence Without a Second Observer

**Date:** November 20, 2026  
**Branch:** `dev/urce-150-runtime-20261118`  
**Status:** Source implementation and source-executed verification; **not** an enabled new cargo route, BDS acceptance, or Q4 migration.  
**Contract:** [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md), [U0 writer audit](URCE_U0_ACTIVE_RUNTIME_WRITER_CENSUS_20261120.md), [U1-C/D shadow handoff](URCE_U1CD_SHADOW_HANDOFF_20261120.md).

## Why this stage is needed

U1-D's separate shadow planner previously accepted caller-provided graphs but did not reuse the active runtime's **actual** same-tick native/Transporter observation. Creating a second independent topology scan would duplicate expensive native reads. Conversely, the current native Hopper witness, visual Transporter observer and read-only route model all explicitly report **incomplete global/claim coverage**: an observed path can support cautious cycle checks but does not demonstrate every item home or absence of remote claims.

This stage provides one read-only projection of the observation *already made* by the current Collector/Receiver live link guard, with no new native world reads and no capacity/custody authority.

## Implementation

- Added `addon/behavior_pack/scripts/urce_152_shadow_evidence_bridge.js` with `projectObservedShadowGraph(observation)`. It accepts the **existing** `observeSupplyLinkSnapshot` result and creates new, detached graph nodes/links using the same directed native Collector→Receiver edges and verified single-Receiver/single-Collector logical bank-intent Receiver→Collector edges as the active safety gate. Unclassified/branching bank legs remain unverified, not promoted to available routes. Known directed cycles are reported as CYCLE; incomplete observations and saved-record conflicts stay PARTIAL/HOLD. No Block/ItemStack/inventory objects are returned.
- Extended `urce_152_live_link_guard.js` with `peekShadowEvidence({collectors,receivers,getBlock,currentTick})`. It returns only the newly derived shadow graph from a **matching materialized same-tick snapshot**, and refuses before a live check, across ticks, after invalidate(), when registry identities or their saved field contents change, or with a different world reader. It does not initiate another observation, read block state or reuse a negative memo entry as positive authority.
- Both the projection and accessor always return `sourceClaimCoverage:"UNKNOWN"`, `worldCoverage:"UNKNOWN"`, `executePermitted:false`, `persistPermitted:false`, and `mayAuthorizeCargo:false`. Even an OBSERVED graph **cannot** be passed to managed planning with inferred `coverage:"COMPLETE"`. Only later independently validated item-claim enumeration can establish that coverage, and even then live native admission and custody fencing remain mandatory.
- **main.js remains byte-identical to the post-U1-C/D source** (blob `f8f91bd45fdd3f3d89e221daa095976446f7fbee`), so no new shadow probe runs on a Sorter or Collector logistics tick. Existing one-tick polling, Q4 migration, queue/physical writers, receiver origin safety, journals and recovery paths are unchanged.
- Updated `runtime/tests/urce_u0_writer_surface.test.mjs` for the new imported runtime module; its direct native mutation count remains 46 and world-property helper call sites remain 18.
- Added `runtime/tests/urce_u1e_same_tick_shadow_evidence.test.mjs` for read-reuse, detached graph mutation isolation, next-tick/changed-reader/changed-link/forced-invalidation refusal, Hopper-cycle rejection, unloaded-boundary HOLD and no-custody authorization.

## Evidence actually executed

1. **Actual committed sources run in V8**: safe linked Collector/Receiver pair without any Transporter, directed cycle from native Hopper return path, unloaded Hopper output, and Receiver lacking output Hopper. Active guard safety yielded `SAFE_SNAPSHOT`, `REJECT`, `HOLD` and `SAFE_SNAPSHOT` respectively in these synthetic fixtures. Projection yielded `OBSERVED`, `CYCLE`, `PARTIAL` and `OBSERVED`. Additional `getBlock` calls from the shadow projection: **0 in all four cases**. The clean observed graph still reported claim coverage UNKNOWN.
2. **Full-runtime V8 rehost of existing `urce_full_runtime_native_budget.test.mjs` native-stub fixture**: the actual main.js plus imported module code, seven scheduled callbacks, and genuine Q4/native writers were evaluated with the fixture's existing Bedrock API counters and an **in-memory replacement for the Node ESM loader**. Before/after results were exactly equal on four fixture categories:

| Full-runtime fixture | Before U1-E | After U1-E | Result |
| --- | ---: | ---: | --- |
| 1,442 empty Sorter source Hoppers + 73 Collectors + 54 Receivers, 100 ticks | 1,035,015 counted native-stub calls | 1,035,015 | Equal |
| 24 Sorters + 73 Collector links/54 Receivers, blocked topology, 21 ticks | 42,167 | 42,167 | Equal |
| One Collector → Q4 → Receiver output transfer, 1 tick | 110 | 110 | Equal; four debited from source and four credited to Receiver output |
| 64 legacy display Sorters, 100 ticks | 41,851 | 41,851 | Equal |

   These subtotals count the fixture's emitted native-stub categories, excluding event registration/scheduling calls; they are **not BDS timings or native server TPS**, nor standard Node `vm.SourceTextModule` execution. The V8 rehost executed real modules while replacing the test-only ESM bootstrap.
3. **Fixed 101-column five-item decision replay** against the unchanged real Coordinator helper: 161,600 modeled 1-tick inspections, 48,000 nonmatching occupied observations, 100 candidate frames, 100/100 intended captures (20 per item type), 0 order differences and 0 U1-E shadow peeks.
4. **U0 transitive runtime module closure:** ten imported runtime JS modules, 46 prior direct native/world mutation sites, 18 prior `setWorldDynamic` helper calls and no new direct writer sites; read-only U1-D is still not imported into main. Test source compiled in a V8 syntax check.

**Limits:** The normal Node `--experimental-vm-modules --test` suite and GitHub CI were not run from this chat; neither were BDS LAB, real game-world topology/migration or player responsiveness measurements. The source tests and full-native rehost do not replace those acceptance gates.


## Added source-mapped multibank differential

Added `runtime/tests/urce_u1e_multibank_graph_parity.test.mjs`. This executes the actual active Collector/Receiver link gate plus the guarded projection for a directed multi-bank chain **without Transporters**:

| Native connected-bank fixture | Active gate | Shadow graph | Extra world reads |
| --- | --- | --- | ---: |
| Verified two-link Hopper chain | SAFE_SNAPSHOT | OBSERVED; reaches R2, C2, R3, C3 | 0 |
| Additional C3→R2 saved link creates a directed cycle | REJECT | CYCLE | 0 |
| Hopper boundary unloaded along source-reachable route | HOLD | PARTIAL | 0 |
| Separate disconnected Receiver bank has an unloaded boundary | SAFE_SNAPSHOT for unaffected source | PARTIAL overall; claim coverage UNKNOWN | 0 |

These four cases were run directly using the **actual committed JavaScript sources** inside V8 with instrumented world-reading stubs. They demonstrate the difference between source-specific safety and globally incomplete claim/topology observation. They do **not** establish that the shadow graph can authorize network forwarding or that it knows all reachable Sorter/Auto/Bulk homes. The repeatable Node test file was committed, but the standard Node runner remains unexecuted here.

## No-go / next development gate

This is **observability plumbing** only, not a universal graph, a verified item home, or a routing cutover. Never treat the snapshot's `OBSERVED` status or `SAFE_SNAPSHOT` link status as complete source claim coverage. Do not use a cached graph for next-tick positive custody authority, infer path absence from unloaded blocks, prune source reachability without complete cycle/unknown proof, or add an unjournaled writer.

Next: execute the committed Node suite in the developer environment, and build network-specific differential cases for saved Collector/Receiver links and real Hopper/Transporter arrangements (including detached banks, branches, unverified interfaces and replaced endpoints). Only then connect an opt-in read-only diagnostic to the normal runtime's **already materialized** observation. The [LAB world is a refreshable copy of 1.4.1 production](OWNER_LAB_WORLD_REFRESH_POLICY_20261120.md); the production world remains protected.
