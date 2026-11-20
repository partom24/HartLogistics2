# 101-column / Five-item longitudinal comparison — After U1-E

**Date:** November 20, 2026  
**Original model:** [Pre-U1 baseline](URCE_101_COLUMN_FIVE_ITEM_STAGE_BASELINE_20261120.md).  
**Previous stage:** [U1-C/D comparison](URCE_101_COLUMN_FIVE_ITEM_STAGE_COMPARISON_U1CD_20261120.md).  
**Current change:** [U1-E same-tick evidence reuse](URCE_U1E_SAME_TICK_TOPOLOGY_SHADOW_REUSE_20261120.md).

## Fixed scenario

101 independent five-Filter columns (505 Sorters); one ordinary-item Hopper per column; 100 single items consisting of 20 repetitions of Cobblestone, Dirt, Gravel, Stone and Sand. Eight ticks between injections and eight-tick modeled residence at each intermediate nonmatching source. Destination columns 21, 41, 61, 81 and 101. Duration 1,600 ticks; five ordinary storage chests, no managed Collector/Receiver/Transporter, Q4, MR or Bulk.

## Results

| Metric | Before U1 | After U1-B | After U1-C/D | After U1-E |
| --- | ---: | ---: | ---: | ---: |
| Scheduled column inspections | 161,600 | 161,600 | 161,600 | **161,600** |
| Occupied proven-nonmatching observations | 48,000 | 48,000 | 48,000 | **48,000** |
| Candidate-bearing observations | 100 | 100 | 100 | **100** |
| Successful modeled item captures | 100 | 100 | 100 | **100** |
| Items per destination | 20 | 20 | 20 | **20** |
| Candidate-order differences | 0 | 0 | 0 | **0** |
| Selected source-path native-stub call subtotal | 1,389,165 | 1,389,065 | 1,389,065 expected | **1,389,065 expected** |
| U1-D / U1-E governed shadow evaluations on live path | 0 | 0 | 0 | **0** |

The **101-column delivery/ordering figures were rerun with the actual committed Coordinator helper and offer bridge**. The selected native-call subtotal is **carried forward, not a new 101-column native-stub measurement**, because `main.js` and its local hot-path imports are unchanged from U1-C/D. The new U1-E projector is loaded with the existing guard but never called by gameplay. Therefore U1-E realizes **zero additional native-call savings** for this non-networked scenario.

Separate four-scenario **full-runtime native-stub V8 rehost** compared pre/post U1-E (see the [U1-E handoff](URCE_U1E_SAME_TICK_TOPOLOGY_SHADOW_REUSE_20261120.md)) and found all counted runtime categories identical. This is not a BDS profile, so no TPS/lag improvement is claimed. One-time module-load JavaScript overhead and any future opt-in projection allocation remain unmeasured.

**Next stage comparison:** retain the 100-item/101-column control as the backward-compatibility gate, and add a **networked multi-bank scenario** for U1-E's actual feature area, including unknown native boundaries and partial verified graph observations. A no-Collector fixture cannot demonstrate the value or cost of a Collector/Receiver graph reuse feature.
