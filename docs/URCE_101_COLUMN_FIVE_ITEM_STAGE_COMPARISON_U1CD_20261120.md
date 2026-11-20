# Fixed 101-column / five-item comparison — after U1-C and U1-D

**Date:** November 20, 2026
**Fixed scenario and pre-U1 baseline:** [Longitudinal comparison](URCE_101_COLUMN_FIVE_ITEM_STAGE_BASELINE_20261120.md).
**Status:** Actual decision-source synthetic replay for C; native API totals *carried forward by unchanged native call paths*, not independently measured in a full-runtime trace. D is deliberately source-only and absent from the live runtime import closure.

## Scenario held constant

101 five-Filter columns = 505 Sorters; five repeating items (Cobblestone, Dirt, Gravel, Stone, Sand); destinations 21, 41, 61, 81 and 101; 100 items, one every eight ticks, eight ticks of simulated residence per intermediate Hopper, 1,600 ticks. Five independent native chest targets. No Collector/Receiver/Q4/Transporter/Bulk/MR.

## Stage result

| Metric | Pre-U1 legacy | After U1-B | After U1-C | After U1-D | Evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| Source-Hopper inspections | 161,600 | 161,600 | 161,600 | 161,600 | Same one-tick scheduler |
| Occupied Filter nonmatch observations | 48,000 | 48,000 | 48,000 | 48,000 | Synthetic decision replay |
| Candidate-bearing frame invocations | N/A | N/A | 100 | 100 | U1-C actual helper executed |
| Final captures | 100 | 100 | 100 | 100 | Model; 20/item type |
| Misordered local candidate selections | 0 | 0 | 0 | 0 | 5,120-case order differential and model |
| `Dimension.getBlock` | 210,300 | 210,300 | **210,300 expected unchanged** | **210,300 expected unchanged** | Previous focused native-stub count; no changed native-call path |
| `Block.typeId` | 210,400 | 210,300 | **210,300 expected unchanged** | **210,300 expected unchanged** | Original U1-B 100-read saving persists |
| `Container.getItem` | 385,800 | 385,800 | **385,800 expected unchanged** | **385,800 expected unchanged** | No new source-slot reads in C/D |
| **Selected native-call subtotal** | **1,389,165** | **1,389,065** | **1,389,065 expected** | **1,389,065 expected** | C/D native paths unchanged; no fresh full-native count |
| Governed graph shadow evaluations in gameplay | 0 | 0 | 0 | 0 | D not imported into gameplay |

**Native-call reduction attributable to C or D: zero in this scenario.** U1-C creates a small JS frame on 100 matching observations; net JS CPU / TPS is **not measured**. U1-D adds no live per-tick work. The cumulative only previously measured native read reduction remains 100 Block.typeId reads from U1-B, or 0.0072% of the selected-source baseline. These scope-specific figures are not directly comparable to the earlier broader 1,394,505-call theoretical model.

**Caution:** The model's synthetic Hopper residence and accepted moves do not establish actual interception timing, exact metadata custody, Q4 integrity, source-specific graph safety or BDS performance.

**Permanent regression files:** `runtime/tests/urce_101_five_item_stage_gate.test.mjs` and `runtime/tests/urce_u1cd_shadow_contract.test.mjs`. Repeat the same model after every later stage and add full-runtime/BDS evidence separately. Any change in native count or item outcome must be attributed to the exact source branch/blob and the new implementation, not a forecast.
