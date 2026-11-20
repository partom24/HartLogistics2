# URCE 1.5.8 — source candidate readiness, regressions and playable-delivery blockers

**Date:** November 20, 2026  
**Active source branch:** `dev/urce-150-runtime-20261118`  
**Last green gameplay/tooling source workflow pin:** `f7b9160a48feac445bdb9d088701e6862e99280e`  
**Evidence:** [1.5.8 source/package + Windows synthetic rollback workflow](https://github.com/partom24/HartLogistics2/actions/runs/44829528545); [immutable canonical continuity workflow](https://github.com/partom24/HartLogistics2/actions/runs/44829528622).  
**Authority:** [development startup](../DEVELOPMENT_START_HERE.md), [continuous development](../AGENTS.md), [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md), [pinned owner-approved product contract](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md), and [historical evidence catalog](CANONICAL_EVIDENCE_AND_TOOLING.md).

## What is actually integrated and what is not

**Integrated/playable baseline within the source candidate:** the original Sorter, Collector/Receiver, Hopper, native chest/barrel admission, filter/seeded Auto/Wildcard/bypass and Q4 queue/journal/recovery paths remain the only item-custody writers. The 1.5.8 source retains lower-cost local Sorter transit and destination observation through the pure `urce_column_local_decisions.js` and `urce_column_offer_bridge.js` helpers. Native Collector/Receiver loop-guard observations remain fail-closed. The owner-accepted 4×4 connected Transporter and Bulk block assets are present; neither is proof of active network-wide item movement or Bulk custody.

**Not yet integrated:** a trusted real-world source-closed Filter/Auto/Wildcard/terminal/Bulk item-claim catalog, executable governed multi-bank home selection, native MR carrier integration, independent authoritative Bulk balances, distributed receiver/Bulk redistribution, discoverable HELD/STORED inventory/retrieval, safe unified-coordinator custody migration or Q4→URCE cutover. U1-D/E/F shadow plans and isolated U2 protocols are deliberately **nonexecuting**. The source candidate is **not the finished playable URCE feature set**, owner LAB accepted, or production safe.

## Immediate CI recovery completed on active branch

1. Updated the protected U0 writer **census register only** to acknowledge five audited zero-direct-writer U1 helper scripts. Native physical and Q4 writer signatures and original protected counts were not silently rebased.
2. Re-pinned the 1.5.8 LAB updater to the exact reviewed current main.js and live-link guard Git blobs and the five exact newly added pure helper blobs. The strict 1.5.7 predecessor, unchanged BP/RP identities, full pack file-set equality, every expected file addition, native/source blob rejection, stopped copied-LAB checks, registry and rollback integrity remain fail-closed. Added a tampered-new-helper refusal regression.
3. Restored first-screen canonical evidence discovery in AGENTS.md and README.md; immutable historical catalog files were not edited.
4. Made the 101-column/five-item fixture and full U1-A/B/C/D/E/F, U2, live link/Q4/journal, full-runtime native-stub, original physical-writer, operator and package checks mandatory in the **active 1.5.8** CI workflow. These are source and disposable synthetic tests, not native BDS tests.

**Green source workflow at `f7b9160...`:** Linux validated and packaged the candidate; Windows validated PowerShell syntax and tested synthetic exact-1.5.7→1.5.8 installation, refusal, interruption and rollback. This does **not** establish that the owner's LAB currently has the required predecessor installed, nor authorize running `-Apply`.

## Recurring 101-column / five-item comparison

Same exact [original workload](URCE_101_COLUMN_FIVE_ITEM_STAGE_BASELINE_20261120.md) and [after-U1-F comparison](URCE_101_COLUMN_FIVE_ITEM_STAGE_COMPARISON_U1F_20261120.md): 101 columns × five Sorters (505 total), 100 ordinary items (20 each Cobblestone, Dirt, Gravel, Stone, Sand), Hopper-like eight-tick residence/injection, 1,600 model ticks. Destination columns 21, 41, 61, 81, 101. No Q4, managed networks, Bulk or MR in this fixed fixture.

| Metric | Pre-U1 baseline | U1-F prior stage | 1.5.8 source CI `f7b9160...` |
| --- | ---: | ---: | ---: |
| Scheduled source column polls | 161,600 | 161,600 | **161,600** |
| Occupied nonmatching transit observations | 48,000 | 48,000 | **48,000** |
| Candidate-bearing frames | 100 | 100 | **100** |
| Modeled items delivered | 100 | 100 | **100** |
| Items per destination | 20 each | 20 each | **20 each** |
| Candidate-order differences | 0 | 0 | **0** |
| Selected native-stub call subtotal | 1,389,165 | 1,389,065 expected | **1,389,065 carried forward, not remeasured here** |
| BDS native player-interaction test | no | no | **no** |

The exact runtime helper module fixture emitted `URCE_101_STAGE` with `occupied=48100`, `transitCount=48000`, `frameCalls=100`, five delivery totals of 20, zero order differences and `nativeCallsNotMeasured:true`. This is a reproducible source-model result, **not** observed Bedrock throughput, improved TPS or evidence of adaptive per-column polling. The cumulative 100 fewer selected native type reads from U1-B are the only focused source-stub reduction in this workload, approximately 0.0072%; neither the updater fix nor the shadow-only U1 modules adds a new live item writer.

A separate full-runtime 1,442-Sorter/73-Collector/54-Receiver native-stub budget is tested in CI. Its results must never be conflated with the 101-column historical selected-call totals or native BDS CPU.

## Q4 and owner-world safety

- Preserve legacy Q2/Q3/Q4 keys, page/meta/definition formats, queues, ownership, journal ordering, recovery, direct-only MR safeguards and no speculative replay. No Q5 intermediate migration. The U0 native-writer fence, same-source link tests and synthetic Q4 transfers/recovery are green; **world restart/unload migration is not proven**.
- In the historical copied LAB report, a Receiver still had about **16,982 queued Q4 items** behind a deliberately powered/fail-closed terminal-Hopper boundary. Treat that figure as prior owner evidence, not a fresh inventory census. Do not unpower it, release queued items, or reinterpret a visual/deepslate stopper as universal native extraction safety.
- Only the explicitly authorized **copied LAB**, after the user independently chooses it, may be used for stopped-server read-only CheckLab and separately approved Install. Git pulls and source commits do not install packs. Never touch production BDS or production world.

## Highest-value playable-delivery work (priority by safety and player value, not stage letters)

1. **Native-directed route safety (#86):** prove the relevant Hopper terminal, lower-pull, foreign inventory, unload/reload and cycle behavior in disposable native BDS. Reuse already written read-only source terminal probes. Do not release actual items merely because a source graph recognizes cobbled deepslate.
2. **Real source-reachable claim coverage:** produce a bounded item-specific, source-closed catalog from actual live Sorter registry and native source/route evidence, distinguishing UNKNOWN/unloaded/foreign paths and live Auto seeds; measure native API reads. Only complete proven census may support a *nonexecuting* differential plan until custody gate is met. No guessed absence of remote Filter/Auto/Bulk.
3. **Single effective custody engine and safe migration:** reuse proved native PG20 MR movement and PG42 durable native entity inventory at their historical scope; design journaled exact native ItemStack ownership, Q4 read-only migration adapter, interrupted-write/restart protection and a reversible, stopped-LAB migration rehearsal. No parallel custody writer.
4. **Real network capacity/UI:** implement independently authoritative ordinary Bulk members (200,000-item target each) and optional bounded terminal Collector custody, safe demand-aware redistribution, HELD/STORED searchable paginated inspection and deliberate verified retrieval, all with unknown-capacity HOLD.
5. **Native performance (#87) and owner play:** compare measured BDS idle/stabilized/active-routing diagnostics, real player block placement/eating, queue age, item conservation, MS-per-tick distribution and restart behavior. The 101-column fixture remains the exact longitudinal regression, not a substitute for the larger owner player-built network.

**Delivery conclusion:** The 1.5.8 **source-controlled, reproducibly packaged, operator-guarded development candidate is available for an explicitly approved copied-LAB test**. A **fully integrated and player-accepted URCE 1.5 product is not yet available**. Do not stop development at a stage label or mistake source CI for native acceptance.
