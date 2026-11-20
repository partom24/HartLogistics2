# URCE: 101-column / five-item longitudinal comparison

**Date:** 2026-11-20
**Status:** Focused, source-executed JavaScript model. **Not** full-runtime Node/CI, native Bedrock, or release acceptance.
**Owner intent:** Revisit this same model after each URCE implementation stage, always with a pinned baseline and the new source.
**Before U1-A source:** main.js blob 780b22746a50055ca4eef8030b4a301bf6248f8f, commit 657cdb08cfcc97c2bb6ef649ccf1a9e6308c3256.
**After U1-A/U1-B:** main.js blob 9b8770268005bf59e75d30aae82a329f3663d828; pure helper blob 1892b4168a972ad634c6ae20306e1af7d71d5dd9.
**Contract:** [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md).

## Fixed workload

- 101 columns, each with five vertically connected Filter Sorters: 505 Sorters total; one five-slot source Hopper per column.
- Cobblestone to column **21**; Dirt to **41**; Gravel to **61**; Stone to **81**; Sand to **101**.
- Five types repeat 20 times: **100 single items**. Injection every **8 ticks**; simulated residence **8 ticks** at a nonmatching source, then native-like advance one column. 1,600 simulation ticks.
- Other Filters hold nonmatching Diamond settings. One matching Filter and ordinary target chest per designated destination. No managed Collector/Receiver/Transporter, Bulk, MR, redstone or external writes.
- 6,000 nonmatching item-column visits x eight ticks = 48,000 occupied nonmatch observations, plus 100 occupied matching observations. 161,600 source-column inspections from one-tick polling.
- Both compared runs executed actual source-extracted processColumn, compactSourceHopper, findAcceptSlot and destinationFor code against instrumented block/inventory stubs and the current helper where applicable. The fixture injected a simplified exact-type Filter matcher and a simple physical debit/credit writer. It did NOT execute real saveJournal, Q4, runtime startup/periodic callbacks or Bedrock. The known north-facing direction was stubbed, omitting 100 equal facing-state reads on both sides. This is a selected hot-path accounting model, not the full native call budget.

## Direct pre/post U1-A and U1-B results

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Scheduled column polls | 161,600 | 161,600 | 0 |
| Dimension.getBlock | 210,300 | 210,300 | 0 |
| Block.typeId | 210,400 | 210,300 | **-100** |
| BlockPermutation.getState (Hopper only) | 161,600 | 161,600 | 0 |
| Block.getComponent(inventory) | 161,700 | 161,700 | 0 |
| Block.getRedstonePower | 48,500 | 48,500 | 0 |
| Container.firstItem | 161,695 | 161,695 | 0 |
| Container.getItem | 385,800 | 385,800 | 0 |
| Container.firstEmptySlot | 48,205 | 48,205 | 0 |
| Container.emptySlotsCount | 100 | 100 | 0 |
| Container.getSlot | 95 | 95 | 0 |
| ContainerSlot methods/getters, six kinds | 570 | 570 | 0 |
| Container.setItem | 200 | 200 | 0 |
| **Selected native stub subtotal** | **1,389,165** | **1,389,065** | **-100 (-0.0072%)** |
| JS matchesFilter invocations | 240,700 | 240,700 | 0 |
| JS sorterMode invocations | 530,700 | 530,700 | 0 |
| Source debits / destination credits | 100 / 100 | 100 / 100 | 0 |
| Chest totals | 20 items each x 5 | 20 items each x 5 | 0 |

**Why only 100 calls saved:** The original destinationFor looked up dest.typeId for Collector, then again in supportedStorage on storage targets. The new read-only destination observer classifies it once, for 100 admissions. The scheduler, filters, slots and custody remain as before.

**Possible JavaScript overhead:** New helper boundaries run around 48,100 times for transit qualification, 100 times for candidate ordering and 100 times for destination observation in this workload. This may add JS-only call overhead despite the 100 fewer native type reads; neither server timing nor even net JS CPU savings were measured.

## Do not conflate with earlier theoretical adaptive results

Earlier conversations used **1,394,505** as a broader **modeled** pre-development selected-call total including estimated background native persistence calls. It was not source-executed full-runtime evidence. The focused subtotal above excludes that background and thus is NOT the identical accounting scope.

The previously proposed **1,051,047** (adaptive only), **580,337** (adaptive + Coordinator) and **356,505** (fixed four-tick reference) are **hypothetical future configurations**, not code that U1-A/U1-B implements. In particular a slower poll interval still has an unresolved item-interception safety gate.

## Stage outcomes and next comparisons

| Stage | Runtime status | Finding |
| --- | --- | --- |
| Pre-U1 | Inlined column decisions; one-tick polls | Focused 1,389,165 source-call baseline |
| U1-A | Pure local transit and priority decisions integrated | Calls effectively unchanged |
| U1-B | Pure destination observation integrated | 100 fewer typeId reads |
| U1-C and later | Future stages | Rerun from same fixture and pin source revision |
| Adaptive/persistent coordinator | Not yet implemented | No realized reduction attributed |

**At every subsequent stage:** rerun the same destinations, stream, source residence, initial capacity, filter placement and time horizon. Preserve the same metrics and item conservation checks, report both additional JS function work and real native API operations, and label whether evidence is arithmetic-only, source-executed isolated functions, full-runtime VM or BDS LAB profiling. Report savings only when actually measured within that scope.

**Safety:** This particular network has no managed routing or Q4. It does not test Q4-to-URCE migration, crashes, topology cycles, Bulk, MR or an unloaded/foreign-writer scenario. Those require separate tests. The [LAB copy of production](OWNER_LAB_WORLD_REFRESH_POLICY_20261120.md) is expendable for migration rehearsals, not production itself.
