# URCE U0 — Active Runtime Writer, Callback and Side-effect Census (2026-11-20)

**Audit:** HL-URCE-U0-001. **Status:** SOURCE-TRACED writer/callback census with source-only guard committed; runtime behavior, atomicity and BDS integration are NOT thereby certified. **No gameplay edits, migration or LAB action.**

**Baseline:** partom24/HartLogistics2 branch dev/urce-150-runtime-20261118 at commit 657cdb08cfcc97c2bb6ef649ccf1a9e6308c3256 (documentation HEAD when census began), with identical gameplay source blob main.js **780b22746a50055ca4eef8030b4a301bf6248f8f** used through subsequent documentation/test commits. Manifest 1.5.8-dev, @minecraft/server 2.7.0. This audit is intentionally tied to gameplay *blob* instead of treating the moving development branch as immutable.

**Owner architecture:** [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md) and [pre-contract lessons](URCE_COLUMN_COORDINATOR_PRECONTRACT_LESSONS_20261120.md). Historical owner product/ADR-004/evidence in [canonical catalog](CANONICAL_EVIDENCE_AND_TOOLING.md) remain authoritative. U0 maps the actual current runtime; it does **not** imply the unified future router or coordinator already exists.

## 1. Actual executable module closure reviewed

Entry: addon/behavior_pack/scripts/main.js, 4,627 lines and 179 top-level named function declarations, plus module-scope callbacks. All imported local JS modules were examined:

| Module | SHA of gameplay blob | Runtime role | Direct mutation class |
| --- | --- | --- | --- |
| main.js | 780b22746a50055ca4eef8030b4a301bf6248f8f | Sorter, Collector/Receiver, world data, event handlers, journaling | Native inventories, Q4, world properties, UI/frames |
| urce_150_readonly_runtime.js | af4dfe9c48b0e57568176fe098da4be04f154502 | Transporter visual + player inspection | **Block setPermutation for visuals**; no cargo writer |
| urce_152_live_link_guard.js | e23e10d6e833a252a8a4da351df5d008a05c9f66 | Snapshot/memo of link safety | In-memory cache only |
| urce_152_link_snapshot_gate.js | a363b6f84048cbf269581e57e76b275e4c7bbf25 | Endpoint/graph observations | Read-only graph and injected world reads |
| urce_152_native_hopper_witness.js | 57f5438593cd7a1df77739252fca8dc630aa8cf0 | Native Hopper path witness | Read-only |
| urce_152_transporter_bank_probe.js | 1ad8a5b6943d8d9b64d0ff8613f31d8cac0f99eb | Visual-bank Transporter component probe | Read-only |
| urce_152_route_model.js | 9ac2180a869af226d35c613c777919a9d71caa3d | Pure route/graph proposal | Read-only, not main.js policy authority |

The current runtime has **no implemented adaptive Column Coordinator, Bulk custody writer, universal URCE planner integration or new MR native-carrier endpoint writer**. Imported “readonly” Transporter module DOES write native block visual permutations on player events. “Readonly” in its header refers to cargo and persistence authority, not a literal ban on all world mutation.

## 2. Transitive runtime entrypoint → writer map

The following entrypoint mapping follows actual main.js/module declarations and their named calls. Read-only control paths are included because several cause state changes downstream.

| External root / trigger | Transitive path(s) | Actual side effect / authority |
| --- | --- | --- |
| system.runInterval(schedulerTick,1), main.js:4620 | schedulerTick → rebuildTopology (in-memory); processColumn → compactSourceHopper | **Same-Hopper native setItem**, 3700–3701. Compaction is unjournaled local rearrangement and is distinct from inter-container custody |
| Same Sorter scheduler root | processColumn → destinationFor → registerCollector / saveLogistics **or** presence reactivation saveLogistics | Dynamic-property logistics/endpoint registration during supposed “destination lookup”; may invalidate live-link guard |
| Same Sorter scheduler root | processColumn → sorterCollectorRoute → loadReceiverQueue → initialize/migrate/cleanup when needed | Q4 metadata/pages/definitions/legacy cleanup and logistics persistence may occur **before item custody writer** |
| Same Sorter scheduler root | processColumn → enqueueFromSource → saveQueueJournal → persistQueueEntry/Meta → src.setItem → saveQueueJournal(clear) | Collector/Receiver Q4 credit, native Hopper debit and queue journal; 2508–2592 |
| Same Sorter scheduler root | processColumn → safeMovePartial → saveJournal → src.setItem → dst.setItem → clear | Physical storage admission and protected native inter-container transfer; 3582–3636 |
| system.runInterval(logisticsTick,1), main.js:4621 | logisticsTick → processCollectorIngress → enqueueFromSource | Directed Hopper → Collector → Receiver Q4 credit/native debit (same Q4 writer) |
| Same logistics scheduler root | processCollectorIngress → loadReceiverQueue → safeMovePartial → recordDirectReceiverTransfer → persistQueueMeta | Non-Q4-native/direct-only item goes to Receiver output Hopper only with authoritative zero queue backlog, live destination and physical journal; counters/metadata may persist afterward |
| Same logistics scheduler root | processReceiverDrain → loadReceiverQueue → receiverLinkSafety → dequeueToReceiver | Q4 debit → output native setItem credit via Q4 journal, 2594–2670; all linked incoming Collector routes are checked because Q4 has no authoritative per-item origin |
| world.afterEvents.entitySpawn, main.js:4179 | system.runTimeout → processEjectedItemEntity → enqueueFromEjectedEntity | Safe Q4 receipt/journal then exact item-entity remove, 2321–2393; retries when entity/triggered-bit timing uncertain |
| system.runInterval(recoverJournal,20), 4624 | recoverJournal → saveJournal(clear) **or** native src/dst.setItem + clear | Physical journal repair; ambiguous outcomes retain journal and do not guess |
| system.runInterval(recoverQueueJournal,20), 4625 | recoverQueueJournal → loadReceiverQueue(force) → Q4 repair/legacy cleanup → src/dst.setItem **or** entity.remove → clear | Q4 enqueue/dequeue/entity repair, including native inventory and entity mutations; ambiguous outcomes HOLD |
| Both active tick paths | processColumn/processCollectorIngress/processReceiverDrain error branches → recoverJournal or recoverQueueJournal | Recovery can execute synchronously in routing error paths, not only scheduled 20-tick callback |
| system.run startup callback, main.js:4586 | loadRegistry → saveRegistry(v1→v2 fallback); migrateLegacyCollectorsIfNeeded → saveLogistics; loadReceiverQueue(force=true) for **each Receiver** → Q4 migration/cleanup/init; recoverJournal and recoverQueueJournal | Startup includes persistent migration, journal repairs and possible item writes; not a read-only hydrate |
| system.runInterval(flushLogistics,200), 4626 | flushLogistics → saveLogistics | Periodic dirty ledger flush |
| system.runInterval(reconcileDisplays,100), 4622; entityLoad after-event:4174; startup delayed cleanup | reconcileDisplays/reconcileLoadedDisplay → removeDisplay, syncDisplay → spawnEntity, equipment change, entity dynamic prop/tag/teleport/remove | Legacy filter display entity lifecycle and orphan cleanup; does not own cargo but is a real entity/world writer |
| system.runInterval(reconcileModeVisuals,5), 4623 | syncSorterModeVisual | Sorter block.setPermutation visual mode repair |
| world.beforeEvents.playerInteractWithEntity, 4205 | system.run → setFilter → player-hand setItem; saveRegistry; syncDisplay/mode visual; giveOrDrop | Player filter consumption/return, registry, entities and block visual writes |
| world.beforeEvents.playerInteractWithBlock, 4342 | system.run → setSorterMode **or** setFilter **or** selectCollector/useReceiver | Registry, player inventory, Collector/Receiver registration/status, link persistence and live-link invalidation |
| world.afterEvents.playerInteractWithBlock, 4340 | nativeFrameMirror → saveRegistry, syncSorterModeVisual, removeDisplay | Native Item Frame filter mirror/quarantine, mode/registry/visual changes. Physical frame ItemStack belongs to vanilla |
| world.afterEvents.playerPlaceBlock (main.js:4450) | addEntry / registerCollector / registerReceiver → saveRegistry/saveLogistics; syncSorterModeVisual; deferred nativeFrameFresh → plantEmptyNativeFrame | Registry/link state and physical native Item Frame block placement/rollback |
| world.beforeEvents.playerBreakBlock, 4491 | cancels controlled Sorter break → system.run → eraseOwnedFrame, setType **or** Dimension.runCommand(setblock air destroy), removeEntry → saveRegistry → giveOrDrop | Physical block mutation, possible item return and player inventory/world item spawn |
| world.afterEvents.playerBreakBlock, 4536 | removeEntry → saveRegistry/removeDisplay/eraseOwnedFrame/giveOrDrop; markLogisticsAbsent → saveLogistics | Registry cleanup and protected filter refund; preserves Collector/Receiver link record while marking absent |
| world.afterEvents.entityHitBlock, 4523 | system.run → clear mirrored frame filter and quarantine → saveRegistry → syncSorterModeVisual | Registry and permutation change after physical frame item removal by vanilla |
| world.afterEvents.playerSpawn, 48 | delayed showNativeFrameUpgradeNotice | Writes **player** dynamic property notice acknowledgement |
| world.beforeEvents.itemUse, 4199 | playerTargetsSorterServiceFace → ev.cancel | Cancels vanilla action; no Hart container writer |
| system.beforeEvents.startup, 4562 | custom command registration; onRedstoneUpdate → updateHartRedstoneState | Registration/in-memory redstone telemetry, no item transfer; /status path sendDiagnostics only reads normal status counters |
| urce_150_readonly_runtime afterEvents.playerPlaceBlock/playerBreakBlock | scheduleVisualsNear → system.run(flushTransporterVisuals) → updateTransporterVisual | **Block.setPermutation** native Transporter arm visual updates (no cargo) |
| urce_150_readonly_runtime beforeEvents.playerInteractWithBlock | system.run → scheduleVisualsNear + inspect / player messages | In-memory multi-tick bounded topology diagnostic, may schedule visual permutation repair but no cargo custody |
| Main world.afterEvents.playerPlaceBlock/playerBreakBlock guard subscriptions (lines 21–22) | liveLinkGuard.invalidate | In-memory graph invalidation, no direct world writer |

**Other mutation effects:** The native Item Frame physically accepts/ejects its own item under vanilla event processing; Hart's interaction cancellations and mirrored registry must stay compatible. UI/status reads may initialize or migrate queues, and link/status interactions register endpoints. Do not infer read-only authority from an interaction label.

## 3. Actual direct native/world mutation sites

Source-only method-call scan across the **seven imported runtime modules** finds **45** direct mutation-method call occurrences in main.js and **one** in the visual Transporter module. This count is a lexical coverage count for the explicitly guarded API set, **not 46 independent cargo writer implementations or a BDS call count**. Distinct direct method sites and their owning functions:

| Class | Functions (source lines) | Mutations |
| --- | --- | --- |
| Native Hopper / chest / output cargo | compactSourceHopper 3684; safeMovePartial 3582; enqueueFromSource 2508; dequeueToReceiver 2594 | setItem: 2 + 4 + 2 + 2 = **10 source call sites**; item writes are branch-dependent |
| Recovery native cargo | recoverJournal 3499; recoverQueueJournal 2699 | setItem: **4 + 4**; entity.remove: **1** additional repair path |
| Ejected item transfer | enqueueFromEjectedEntity 2321 | entity.remove: **1** after queue credit |
| Player filter return and consumption | giveOrDrop 3087; setFilter 3101 | addItem:1, spawnItem:2, hand.setItem:2 |
| Block and frame mutations | syncSorterModeVisual 788; plantEmptyNativeFrame 4251; eraseOwnedFrame 4288; controlled break callback 4515–4516 | setPermutation: 2, setType: 3, Dimension.runCommand: 1 |
| Legacy entity display maintenance | removeDisplay 642; equipDisplayEntity 650; syncDisplay 669; reconcileDisplays 716; reconcileLoadedDisplay 766 | Entity remove/replace/equipment/spawn/tag/property/teleport; **not cargo custody** |
| Player notice | showNativeFrameUpgradeNotice 30 | player.setDynamicProperty |
| Property gateway | setWorldDynamic 149 | world.setDynamicProperty |
| Constructed temporary ItemStacks | rebuildQueueItem 2106; rebuildItem 3014 | ItemStack.setDynamicProperty on **uncommitted local objects**, not an inventory write |
| Transporter physical visuals | urce_150_readonly_runtime.js updateTransporterVisual 36 | Block.setPermutation once, conditionally after actual neighbor difference |

There are **18 direct setWorldDynamic(...) call occurrences** distributed across 11 named functions: saveRegistry(3), saveLogistics(1), saveQueueJournal(2), saveJournal(2), persistQueueMeta(1), ensureQueueDefinition(1), persistQueuePage(2), clearQueueEntry(1), cleanupLegacyReceiverQueue(1), cleanupLegacyQ3Queue(3), cleanupUncommittedQ4(1). These are the world-property persistence and deletion gateways. All direct native property writes use setWorldDynamic except one distinct player acknowledgement property and two ItemStack reconstruction properties.

**Write-bearing metadata paths that a simple direct API grep misses:** saveRegistry's generation switch/cleanup; loadRegistry v1→v2 fallback; loadReceiverQueue's synchronization/cleanup/migration/initialization; queueCache/receiver/collector field updates; persistQueueEntry/clearQueueEntry page changes; queued/received/delivered and accepted counters; link edits in useReceiver; filter/mode/quarantine changes in player and frame callbacks; registry array push/splice; budget/progress state. These mutate in-memory authority and often persist through helpers above.

## 4. “Looks like a read” functions that are NOT guaranteed side-effect free

| Function | Who calls it | Potential side effect that would violate a pure Coordinator/Planner boundary |
| --- | --- | --- |
| **destinationFor** 3239 | processColumn, setSorterMode, sorterDestinationSummary, autoSorterMatches | registerCollector/saveLogistics if missing, or mark present/saveLogistics; link guard invalidation in register |
| **loadReceiverQueue** 1865 | routing/admission, status, sorterDestinationSummary, drain, journal recovery, counters and startup | q4 initialize; q2/q3 migration; stale legacy cleanup; persistQueueMeta/Logistics; queueCache/receiver state updates |
| **loadRegistry** 289 | startup | legacy Registry v1→v2 saveRegistry migration |
| **selectCollector/useReceiver** 2244/2251 | player interaction | registration/saveLogistics even while showing status; link mutation on confirmed user action |
| **collectorStatus/receiverStatus** 2180/2212 | player status | transitively loadReceiverQueue and safety/Block reads; status read can induce migration/cleanup |
| **sorterDestinationSummary** 3313 | setFilter diagnostics/status | destinationFor and potentially loadReceiverQueue through its branch |
| **autoSorterMatches** 969 | no active caller found in the named-call scan | Its body invokes destinationFor; do not reintroduce it into pure planning without evaluating side effects |
| **reconcileDisplays/reconcileModeVisuals** | periodic jobs | entity and physical permutation mutations despite “reconciliation” framing |
| **updateTransporterVisual** in urce_150 module | player placement/break/inspection scheduling | native block permutation write, no cargo movement |

A future pure read-only planner MUST NOT invoke one of these as a pure getter. Explicit maintenance/admission adapters can retain necessary behavior after the handoff, with identical legacy persistence timing unless deliberately proven otherwise.

## 5. Authority/fencing and existing safety observations

- **One script file currently contains multiple authoritative writer paths.** They are not simultaneously parallel JS threads; however multiple scheduled/events/recovery paths converge on the same physical and Q4 authorities. A shared ownership contract must cover all of them, including a custom block's event and player inventory actions.
- **Physical journal**: saveJournal performs fresh world.getDynamicProperty(JOURNAL_KEY) before opening a new physical transaction; sorter idle journal read-through does not grant commit authority. safeMovePartial debits source then credits destination with recovery. Not an atomic native-inventory-plus-world-property transaction.
- **Q4 journal**: enqueueFromSource and enqueueFromEjectedEntity commit page/metadata before native source/item-entity removal; dequeueToReceiver debits Q4 then credits output. Recovery compares available evidence, leaves ambiguous intent pending.
- **Native MR direct-only**: processCollectorIngress uses Q4 authoritative zero-backlog and live output/Hopper before safeMovePartial. Ordinary Q4 serialization must remain ahead of Q4 load where the item would otherwise be rejected without a load. Source-executed U1 counterexamples already rejected unconditional capacity-first queue loading.
- **Q4 origin gap**: Receiver queue does not authoritatively record source Collector per item; receiverLinkSafety checks all incoming source links. Do NOT shortcut this via an unproven per-item origin index.
- **Hopper compaction**: compactSourceHopper writes within the source Hopper outside transaction journaling; source slots can shift; final source revalidation remains mandatory.
- **Independent Bedrock/foreign writers**: no global script fence can stop native Hopper transfer or a third-party addon changing source/destination. A valid path at inspection is not an unconditional physical receipt.

## 6. Risk and decision register revealed by this source census

| ID | Source-observed concern | Pre-implementation consequence / proof required |
| --- | --- | --- |
| U0-R1 | **setFilter** consumes one mainhand item at 3174–3177 before saveRegistry at 3182, with no local catch/rollback in this branch | Existing potential failure window if persistence throws. Test and design a safe writer/failure response **separately**; do not silently rewrite gameplay as part of Coordinator extraction |
| U0-R2 | **destinationFor** can persist endpoint discovery while processColumn or status asks for a destination | Split pure destination classification from controlled Collector registration; differential-test missing/replaced Collector, failed save and stale “present” status |
| U0-R3 | **loadReceiverQueue** can persist/init/migrate even when called from status or admission | Planner and UI read-only contracts require pure snapshots or explicit, fenced initialization/maintenance. Preserve Q2/Q3/Q4 proof semantics, not a naive rename |
| U0-R4 | **Sorter source compaction** is an unjournaled within-Hopper mutation | Do not assume Coordinator observation is pure if it invokes processColumn/compact. Preserve necessary local compaction, especially sparse five-slot sources, and prevent stale slot references |
| U0-R5 | **Two cadence roots** exist (schedulerTick/logisticsTick) plus recovery/maintenance callbacks | One logical scheduling authority does not imply immediate merger. Account all attempts/callbacks before re-budgeting; do not starve Receiver drain or recoveries |
| U0-R6 | **Status/legacy display and native-frame** paths write entities, block permutations, player items, registry and logistics independently of item routing | The census must remain broader than eight cargo writer categories. Filter-index invalidation must include every frame, mode, registry and block action |
| U0-R7 | **Transporter 'readonly'** module changes visual block states on player events | A proposed blanket no-native-mutation policy must target *route planning*, not harmless verified visual maintenance; no visual frame is route/custody proof |
| U0-R8 | Positive link safety is same-tick only; full snapshot and per-route graph checks still cost native work | Reuse only currently sufficient physical evidence; next-tick positive movement requires fresh safety. Source-scoped optimization remains independently unproven |
| U0-R9 | No complete integrated MR/Bulk custodians; current ordinary Q4 and native direct-only are specialized | Do not claim unified custody complete or add parallel new writers without U2/U3 proof and migration fence |
| U0-R10 | The direct-sink guard is lexical; indirect native behavior, setters, future dynamic imports and third-party writes can escape a simple token list | Maintain **transitive** audit and full-runtime simulation/owner LAB validation. Keep direct-sink test as change alarm, not safety certification |

## 7. Validation and next implementation boundary

**Added source-only change alarm:** runtime/tests/urce_u0_writer_surface.test.mjs enumerates all seven local imported scripts, direct mutating method-call counts by containing function, the 18 world-property helper-call sites, and established scheduler/custody roots. New gameplay modules/direct mutation call sites should require explicit review and updating this audit rather than slipping into URCE. The guard counts **source sites**, not runtime calls; it does not replace the above transitive mapping.

**Verified by source inspection:** imported runtime closure, 179 named main functions, seven periodic jobs, named event/callback entrypoints, 45 direct listed mutation method occurrences in main plus one Transporter visual, 18 world-property helper sites, and all enumerated cargo/recovery/registration/frame/status paths. The file snippets and source blob are pinned above. This census is a basis for implementing the next read-only boundary without accidentally creating a second writer.

**Not yet established:** execution of the new Node test in CI; whole-runtime trace under the proposed new architecture; native BDS acceptance; hard-crash atomicity; safe foreign-writer fencing; adaptive 2/4-tick residence; cycle-safe bounded topology pruning. No source-only grep result, commit or mock is a replacement for these tests.

**Next stage under HL-URCE-OWN-001:** U1-A extract/introduce strictly read-only local offer and destination-kind proposal functions with no new item/world writes, initially with **current one-tick scheduler and existing writers unchanged**. First create side-effect/priority differential fixtures for destinationFor, loadReceiverQueue, source compaction and Filter→Auto→Wildcard; then integrate by narrow boundary under test. New write adapters, migration or adaptive scheduling do not follow implicitly.

### Reference source paths

- [Active main.js at inspected gameplay source revision](https://github.com/partom24/HartLogistics2/blob/657cdb08cfcc97c2bb6ef649ccf1a9e6308c3256/addon/behavior_pack/scripts/main.js)
- [Active visual module](https://github.com/partom24/HartLogistics2/blob/657cdb08cfcc97c2bb6ef649ccf1a9e6308c3256/addon/behavior_pack/scripts/urce_150_readonly_runtime.js)
- [Live guard](https://github.com/partom24/HartLogistics2/blob/657cdb08cfcc97c2bb6ef649ccf1a9e6308c3256/addon/behavior_pack/scripts/urce_152_live_link_guard.js)
- [URCE owner-approved architectural contract](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md)
- [Historical U1 capacity ordering NO-GO](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_U1_COLLECTOR_CAPACITY_FIRST_RESEARCH_20261117.md)
