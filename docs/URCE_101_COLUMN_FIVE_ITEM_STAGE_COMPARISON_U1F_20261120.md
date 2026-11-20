# Recurring 101-column / five-item comparison — After U1-F

**Date:** November 20, 2026
**Baseline:** [101-column comparison record](URCE_101_COLUMN_FIVE_ITEM_STAGE_BASELINE_20261120.md)
**Prior stage:** [U1-E comparison](URCE_101_COLUMN_FIVE_ITEM_STAGE_COMPARISON_U1E_20261120.md)
**Source handoff:** [U1-F claim completeness](URCE_U1F_SOURCE_CLAIM_COMPLETENESS_20261120.md)

## Unchanged 101-column workload

101 independent columns with five Sorters each (505 total); Cobblestone, Dirt, Gravel, Stone, Sand repeat 20 times at eight-tick injection and simulated Hopper residence. The matching destination columns are 21, 41, 61, 81 and 101. Total 100 items and 1,600 model ticks. Ordinary native storage, no Collector/Receiver/Transporter/Bulk/MR/Q4.

| Metric | Pre-U1 | After U1-E | After U1-F |
| --- | ---: | ---: | ---: |
| One-tick source inspections | 161,600 | 161,600 | **161,600** |
| Occupied nonmatching native-transit observations | 48,000 | 48,000 | **48,000** |
| Local candidate frames | 100 | 100 | **100** |
| Correct modeled deliveries | 100 | 100 | **100** |
| Delivery totals per destination | 20 each | 20 each | **20 each** |
| Incorrect candidate order | 0 | 0 | **0** |
| Selected native-stub subtotal | 1,389,165 | 1,389,065 expected | **1,389,065 expected** |
| Live U1-F claim-census computations | 0 | 0 | **0** |

The **101-column decision replay was executed again using the actual committed local decisions and offer bridge**, giving 100 expected captures with no differences. The selected native-stub subtotal after U1-F is **carried forward, not freshly measured in the full native-call-count fixture**: gameplay `main.js` and its imported path are byte-identical to U1-E. Hence U1-F adds **zero native calls to this live routing path**; no CPU/TPS speedup is claimed.

**New isolated U1-F regression:** In a *synthetic, explicitly closed graph* containing all 505 Sorter claimant nodes plus a source, 100 repeated five-item snapshots each produced one correct Filter route using source-executed read-only policy. The model deliberately inspects 505 configured claims per item—**50,500 simulated owner observations in offline tests**—but this is **not executed inside gameplay**, not a suggested algorithmic budget, not native inventory reads, and not proof that Minecraft automatically exposes all eligible remote claimants.

### Stage performance conclusion

U1-F introduces a correctness/proof gate only, not a scheduling or native-call optimization. The cumulative known 100 fewer `Block.typeId` calls from U1-B remain the sole focused measured saving (~0.0072%). Additional JS and native cost of a future **real** source-closed enumerator remains unknown and should be profiled separately before it is enabled.

**Do not substitute** the older 1,394,505 broad arithmetic estimate for this focused 1,389,165 pre-U1 source-executed subtotal. The fixture has no active Q4, graph forwarding, native MR, Bulk, foreign writers, unload or real Bedrock runtime. Those have separate U0/U2/U3 acceptance tests.
