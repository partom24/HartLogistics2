# U0 first pass — actual 1.4.2 writer, side-effect and custody census

**Inspected exact source:** `planning/urce-150-20261117:addon/behavior_pack/scripts/main.js` (identical to the 1.4.2 baseline BP entrypoint, SHA-256 `2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411`; **4,417 lines**). November 17, 2026. **No gameplay/source modifications.**

This is an **initial direct source census**, not a Bedrock debugger trace, not a guarantee that all transitive callback/write paths are covered, and not proof of exclusivity against native Hoppers/players/foreign add-ons. It uses historical PG22's eight categories for cross-checking but treats current 1.4.2 source as authority.

| Hart write / replay category | Current entrypoint and source evidence | Current custody authority / migration requirement |
| --- | --- | --- |
| 1. Sorter Hopper compaction | `compactSourceHopper` ~3520–3539; separate `container.setItem(write, item)` and `container.setItem(read, undefined)` around 3536–3537, reached by `processColumn` ~3542 | **Physical native Hopper slots**; mutation is two writes, not Q4-journalled. Preserve exact left-pack semantics and actual vanilla Hopper pass-through; shared writer plan must classify this separately |
| 2. Sorter native physical transfer | `processColumn` ~3542–3734 → `safeMovePartial` ~3418; journal prepared ~3445 then src debit ~3449/3453, dst credit ~3460/3467, journal clear ~3470 | **Exact-slot physical Q4 journal** with source/dest positions, amount and signature. Keep journal recovery; never replace with naked `Container.addItem` |
| 3. Collector/Sorter queue ingress | `processCollectorIngress` ~3736; `processColumn` Collector branch; both call `enqueueFromSource` ~2344–2428, `saveQueueJournal` ~2408, Q4 page/meta persistence, src `setItem` ~2417/2421 | **Receiver Q4** for losslessly serializable ordinary items; guard queue commit before debit, unreadable queue HOLD; preserve current 250k Receiver capacity |
| 4. Ejected item-entity Q4 ingress | `processEjectedItemEntity` ~2299, `enqueueFromEjectedEntity` earlier (~2198–2229); `saveQueueJournal`, Q4 commit and `entity.remove()` ~2224 | Separate **world item-entity** custodian and removal after queue commit; ID/restart semantics must be tested; never conflate with ordinary Hopper ingress |
| 5. Receiver Q4 output materialization | `processReceiverDrain` ~3854 → `dequeueToReceiver` ~2430; Q4 debit with `saveQueueJournal` ~2484, native output `setItem` ~2495/2500, journal clear ~2504 | **Queue-owned ordinary → physical native Hopper**; retain exact accepted slot/quantity and no blind rerelease |
| 6. Collector native direct MR route | `processCollectorIngress` ~3736+ direct-only fallback calls `safeMovePartial`; output accepted only when Q4 total known zero; no direct item serialization | **Original ItemStack**, existing physical journal, preserve exact metadata and no Q4 backlog overtaking |
| 7. Physical journal replay | `recoverJournal` ~3335–3403, including destination `setItem` ~3369/3373 and source `setItem` ~3390/3394 | Exact before/after slot witness, distinct recovery source; preserve HOLD when ambiguous or unloaded |
| 8. Q4 queue journal replay | `recoverQueueJournal` ~2535–2716, including source `setItem` ~2597/2601, item entity remove ~2652, and output `setItem` ~2700/2704 | Recovery can have its own physical writes; must share any future writer fence and never overlap new debits |

### Additional side effects that an eight-path inventory census alone misses

- **World/durable property writes:** `setWorldDynamic` ~109; `saveJournal` ~441, `saveQueueJournal` ~429, `saveLogistics` ~415, Q4 `persistQueueEntry/Meta`, registry/menu/link/migration helpers. These may run independently of a physical `setItem`; operations and write ordering require further tracing.
- **Block/frame/equipment:** hand equipment `hand.setItem` ~3010/3013, owner display entity `ent.remove()/kill()` ~513, 553, 624, 644, item frame and controlled block-break/event handlers near the final source quarter. They can change visible/inventory outcomes and must be classified as **UI/display/physical-item interaction** rather than silently omitted as unrelated.
- **Scheduled/runtime entrypoints:** `system.runInterval(schedulerTick,1)` ~4410; `logisticsTick,1` ~4411; display maintenance 100 ticks, mode reconciliation 5, physical and queue recovery 20 each, persistence flush 200. Startup read/migrate/recover and redstone/after-event subscriptions are additional interrupt sources. **No proven native Hopper-content after-event** exists in pinned 2.7, so this cannot become event-only by renaming a timer.
- **Live inventory authority:** native Hopper/chest `Container` and selected `ContainerSlot` are still authoritative at admission and write. Q4 counted queue is authoritative only for proven lossless ordinary identities. A saved registry is a routing hint, not a physical chest-change notification.
- **Unknown external writers:** native Hopper/world/player/other add-on operations are not paused by any proposed Hart-only maintenance epoch, so an exact journaled receipt, conservative HOLD or physically exclusive custody proof is still necessary for cross-container transfers.

### Initial U0 conclusions and remaining trace tasks

1. **Eight historical writer categories remain relevant as a starting census**, but source callbacks, equipment, visual frame operations, startup migration and world-prop writes must be inspected before declaring complete writer capture.
2. The first independent URCE design deliverable can be a **read-only, configuration-based candidate planner** for the Sorter column. Do not let this planner issue source debit, slot writes, queue journal changes or native item-entity removal.
3. No 1.5 source writer should be introduced until active writer/external caller paths, precommit fence and restart-recovery semantics can be described for each current custody path. A synthetic `MODEL_IDLE_ONLY` result from historical PG22 is not enough.
4. Next source-only task: make a matrix of **actual call sites → potential native side effects → owner/epoch → rollback/HOLD**, covering registry storage and block interactions, with tests that fail if a new mutation call site bypasses the census.

**BDS/production status:** no new 1.4.2 test or world modification; unchanged owner LAB and production. The 1.4.2 closeout continues to distinguish design ceiling from performance acceptance.
