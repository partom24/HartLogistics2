# HartLogistics migration: 1.4.1 → Fresh LAB 0.5.7

**Status:** Owner-guided strategy; PLAN ONLY (2026-11-21). No runtime code, LAB world or production world changed by this document.
**Target:** The actual Fresh LAB **0.5.7** engine. **Not URCE and not Q5.**
**Migration destination (owner correction):** For each detected connected HartLogistics storage network, identify the **entry Receiver of its last storage array** and consolidate **all upstream HL-owned in-transit inventory** into that single Receiver. That Receiver must expand its virtual storage as needed. Temporary ticking areas around relevant actual Collector and Receiver locations are approved.
**Supersedes:** `docs/Q4_TO_URCE_MIGRATION_STRATEGY_20261121.md` (rejected target). This file supersedes earlier revisions proposing item-by-item selection of the 'most appropriate' Receiver or opportunistic direct chest delivery during the migration.

## Near-term Q4 drain milestone

**Planned, November 21, 2026.** This strategy originated on 0.5.7. Use the current Fresh branch for development and 0.5.11 as the performance reference. The approved terminal-Receiver destination and migration sequence below still apply.

1. Prove access under the original pack identity in a copied world. Census legacy queues, sidecars, journals and owned native cargo without mutation. Resolve the terminal Receiver from placed blocks and saved links. Hold ambiguous networks for the existing owner-selection procedure.
2. Exercise one synthetic legacy Q4 source and one expandable terminal Receiver. Reuse the original custody and recovery semantics where applicable. A virtual-to-virtual transfer needs its own demonstrated idempotent receipt. Checkpoint, interrupt, restart and reconcile each side of the transfer. Verify exact quantities and identity with a single spendable owner.
3. Extend to multiple upstream sources and networks. Use bounded work and temporary chunk coverage where needed. Keep a blocked source quiet between retries, and keep terminal outbound sorting paused through consolidation. Reconcile all in-transit goods, engage the persisted routing lock at the completion barrier, issue the one-time player notice and validate before releasing Fresh delivery.
4. Compare Fresh alone and Fresh with the adapter on the same copied layout and traffic. Measure idle, productive, blocked and post-drain conditions. Record script P95/P99, total server tick time, items delivered per second, and reconciled balances. Require idle and blocked costs within the repeat-run Fresh range and explain any throughput loss. Start with synthetic custody before considering the protected 16,388-item Receiver.

[Performance evidence and salvage rationale](ENGINE_TICK_COMPARISON_20261121.md)

## 1. Ground truth

- **1.4.1:** Receivers have up to 250,000 items in Q4 virtual queues, with potential Q2/Q3 sidecars and interrupted journals. Original Collectors did *not* have matching 250K virtual accounts. Original saved sorter settings, item-frame filters and Collector→Receiver links are in `hartsorter:*` world dynamic properties. Physical native inventories can also hold in-flight items.
- **1.4.1 has NO Bulk Storage.** There is no legacy Bulk ledger, block or requirement to migrate. Never create Bulk merely to perform a migration.
- **Fresh LAB 0.5.7:** Has placed-geometry Hopper and Transporter lanes, actual Collector/Receiver links, relay Collector five-slot native buffers, native metadata-rich (MR) transfers, and optional **new** 200K/member Bulk Storage. It currently does **not** have a Q4 importer, expandable 250K+ logical per-Collector/per-Receiver accounts, or a cross-network virtual consolidation adapter. All of these migration capabilities must be implemented and proven before deployment.
- The old `loadReceiverQueue()` function is **mutating**, including Q2/Q3 conversion/repair. It is not a safe read-only census function. The source-only/mock LAB tests do not prove live BDS migration safety.

## 2. Pack identity is the first compatibility gate

| World pack | 1.4.1 header UUID | Fresh 0.5.7 header UUID |
| --- | --- | --- |
| Behavior Pack | `4854d263-05dd-4f79-a21c-7ba969295c2d` | `f450bff5-6b68-42e5-a07d-616f87c01918` |
| Resource Pack | `91316442-0f26-4fbb-88f3-2e39ea843a1a` | `39f2d6c6-9b79-4754-a2e2-fd27c1ec1d63` |

Saved world dynamic properties are scoped by Behavior Pack header UUID. The unchanged 0.5.7 pack cannot be assumed to read old `hartsorter:*` Q4 records. Preferred solution: a **migration-compatible build of the 0.5.7 runtime** that retains the original 1.4.1 Behavior Pack identity under a valid upgraded manifest version and validated RP activation. Confirm on a stopped, cloned 1.4.1 world, including correct custom block identifiers and a **single routing engine**. Alternative bridge only with equivalent BDS-proof source ownership; never let old and new full schedulers run concurrently, or edit production LevelDB as a shortcut. Retain rollback from a pristine world backup.

## 3. Detect the final storage array and its entry Receiver

**Terminology:** A *storage array* is one registered receiver-led bank with its actual Hopper/Transporter lane, Sorters and output endpoints. Its *entry Receiver* is the Receiver that accepts material into that bank. A *storage network* is the collection of arrays connected by actual supported Collector→Receiver links and downstream sorter/lane-to-Collector relays. Coordinates are identifiers read from real blocks, never hardcoded layout assumptions.

1. Read/import 1.4.1 saved link records and discover existing 0.5.7 physical relay relationships. Build a **directed bank graph** with Receivers as bank-entry vertices and verified downstream Collector/Receiver relays as edges. Partition it into connected storage networks. Do not mistake physically neighboring but unlinked systems for one network.
2. For each connected network, identify the **last downstream storage array** by graph reachability. In a simple `A → B → C`, **C's entry Receiver** is the target for **all** verified in-transit custody held by A, B and C. In a directed acyclic network, an unambiguous downstream terminal is a **unique reachable sink Receiver**, not the final Sorter, last Hopper, final chest, or an intermediate relay Collector.
3. **Cycles and multiple final branches:** A closed loop has no natural last array. Multiple sinks have no unique last. HOLD automatic consolidation for that component and support a **persisted owner-selected terminal Receiver**. Verify the selected Receiver is reachable from every contributing upstream bank via the supported directed graph (or explicitly split/disambiguate a component). Do not invent edges, infer a terminal from coordinates, or silently move inventories between independent networks.
4. Source configuration and graph topology can change; record a generation/fingerprint and revalidate it before committing each source transfer. If the target disappears or graph becomes ambiguous, retain current authoritative custody and HOLD.
5. Make the selected terminal visible in status: network ID, Receiver dimension/real coordinate, detected or manually bound, graph-generation hash, contributing upstream sources, and any HOLD reason. Selection must not depend on the player standing in a particular chunk.

## 4. What must drain into the terminal

**Yes:** All verifiably HL-owned *in-transit* inventory from upstream original Receiver Q4/Q3/Q2 queues, held migrated Receiver/Collector virtual balances, and separately reconciled items in HL-controlled physical Hopper/native relay/Collector slots that belong to that network and have not yet been delivered.

**No:** Ordinary items already delivered into their correct storage chests, items in players' inventories, unrelated containers, or new Bulk Storage that never existed in 1.4.1. Do not empty final storage chests to populate the terminal.

- First produce a **read-only census**: original sorter registry, settings, link records, per-Receiver queue pages and item definitions, hashes and item quantities, original journal states, and observed native in-flight contents. Missing/unloaded/corrupt states count as UNKNOWN, never zero.
- Preserve ItemStack identity and exact metadata. Fresh 0.5.7's native MR move does not automatically prove old Q4 serialized MR restoration. Unsupported identities remain individually HELD with a recovery path; do not flatten named/damaged/enchanted items.
- **No FIFO requirement.** Legacy Q4 ordering/page numbers remain evidence for integrity and recovery, not the new processing order.
- A migration-owned transfer is a **custody change, not necessarily a physical Hopper movement**. For verified virtual Q4 balances, use durable idempotent source debit→target credit/reconciliation with one spendable owner, without re-inserting everything into the physical Hopper network. This adapter is new code; it does not exist in current 0.5.7.
- A native item in a real Hopper/Collector buffer cannot be virtually credited without an observed and recovery-safe withdrawal or established checkpoint. Do not fabricate an item from a physical scan or count an inventory item alongside a virtual credit. Let in-flight cargo complete to a safe checkpoint or apply a proven native custody transfer and journal before credit.
- Keep the terminal Receiver's **outbound sorting paused during consolidation** so the test can verify that all eligible upstream transport custody actually arrived. Then enable normal Fresh 0.5.7 delivery from the terminal bank to its original Filter/Auto and appropriate other destinations. Items may remain in its virtual account under ordinary backpressure.

## 5. Dynamically expand the terminal Receiver

**Primary target:** the beginning Receiver of the final storage array, **not** every upstream Receiver. Temporarily expandable Collectors or intermediate Receivers remain allowed as safety buffers only, and must ultimately be included in the terminal drain.

- Calculate a provisional terminal capacity from its own verified current custody **plus all verified upstream outstanding transport balances** and already committed or reserved incoming credits. Example: A owns 200K, B 240K, C already 180K → C must safely hold **620K**. This is a custody/accounting total, not a requirement to fill physical chests.
- Storage expansion must be **durably persisted**, not just a raised numeric cap: bounded sharded dynamic properties, generation/checkpoint records, checksums, idempotent receipts and readback verification. Bedrock has real persistence limits; stop/halt when a new page cannot be proven written. Do not assume truly limitless memory.
- Prepare target allocation before a source debit can commit. Any uncertainty about intermediate write order, crash or native/world save boundary results in **HOLD and reconciliation**, never a retry that can duplicate items.
- When temporarily expanded Collector/Receiver accounts receive new legitimate intake during migration, account for it separately and drain it into the same terminal. Fence or throttle new intake as necessary to achieve a finite, auditable consolidation pass. Never admit more cargo simply because a counter was incremented.
- The terminal may retain its high-water allocation after draining to chests. Never shrink below its actual held balance or referenced recovery records.

## 6. Temporary ticking areas: load what is required to converge

**Owner-approved:** Create **temporary** ticking areas around each participating actual Collector/Receiver as needed to inspect legacy properties, confirm their physical state and safely transfer custody toward the network's **single designated terminal**. This does **not** authorize permanent chunk-loading of every bank.

Fresh 0.5.7 already has `routeChunks`, `coverRoute`, `coverChunks`, `releaseIdleChunks`, and `world.tickingAreaManager` capacity/ready checks. Reuse or extend that shared coverage manager with migration leases; do not create another competing manager.

1. Discover actual source and terminal blocks from saved identity + inspected graph. Request source and terminal chunks, plus any intermediate banks/natively occupied route segments **only if needed for discovery, physical reconciliation or native movement**. A ledger-only virtual transfer does not require each Hopper to tick.
2. Wait for ready, revalidate block identity, dimension, graph generation, source journal and target's durable capacity, then commit the one-owner transfer. The target is **never chosen by nearest coordinates, free chest or individual item filter** during this consolidation phase.
3. Enforce manager `hasCapacity()` and `maxChunkCount` and observed BDS tick performance. Queue/rotate sources if coverage is exhausted; do not require all network nodes loaded simultaneously. Leases share overlapping chunks with ordinary routing and cannot evict chunks still used by another task.
4. On completion, pause, invalid route, failure, or restart, reconcile and release any stale migration leases. Never leave permanently leaked ticking areas. Preserve HOLD status and its original source custodian when coverage fails.

Show migration progress: terminal Receiver, upstream sources total/processed, original pending amount, safely credited at terminal, unresolved native cargo, total reconstructed identities, terminal account allocation/high-water, ticking chunks in use, journal exceptions and reasons for HOLD.

## 6A. Post-consolidation routing lock and one-time player notification

**Owner requirement (2026-11-21):** **After all eligible HL-owned in-transit items in each connected network have been transferred to its final array's entry Receiver**, engage a **persisted global HartLogistics routing lock** for the duration of the actual **1.4.1 → Fresh LAB 0.5.7 system migration**. All users must receive a **one-time migration notice** explaining why routing is locked. Normal routing resumes only when the migration is validated and explicitly released by its controlled state machine. This is a planned capability; current 0.5.7 does not implement it.

**Sequence and durable state:**

```text
PRECHECK / CONSOLIDATING
    -> VERIFIED_CONSOLIDATED [all network inventories accounted]
    -> ROUTING_LOCKED       [atomically fence new dispatch/admission]
    -> MIGRATING            [migrate links, registries, storage engine/state]
    -> VALIDATING           [readback, parity, reconciliation, recovery checks]
    -> ACTIVE_0_5_7         [release lock only after all gates pass]
                          or -> LOCKED_HOLD [failure, uncertainty, restart]
```

1. **Completion barrier:** Do not declare consolidation complete merely because source virtual balances appear zero. Require every identified connected storage network to have its correct entry Receiver, each upstream ledger fully credited, no outstanding unresolved physical native items or journals counted as transferred, all source receipts reconciled, total-by-identity matching, and an explicit final census. A network with unknown/missing source or unmatched in-flight goods remains pending/HOLD; do not falsely declare all transferred.
2. **Lock without a race:** The final convergence checkpoint and lock transition must fence every HL routing writer together. There can be no unlocked scheduling tick between the final inventory snapshot and the lock. If normal intake is allowed while consolidating, the final transition must revalidate all new arrivals and retry the barrier if cargo appeared; do not silently omit new inbound stock.
3. **Global lock scope:** While locked, prevent **HL script-controlled** Collector admissions, Receiver dispatches, relay forwarding, bulk withdrawals/refills, scheduled routing, new transport sessions, and all scripting commands/interaction paths that would resume cargo movement. Preserve read-only status, inspection, safe recovery diagnostics and the ability to see what is held. Ordinary vanilla Hoppers are native and cannot be assumed frozen by a script flag; explicitly drain/reconcile pre-existing physical transfers and test the actual lock boundary before changing ownership. Do not place hardcoded redstone or break blocks to enforce it.
4. **Persistent fail-closed state:** Store migration epoch, lock reason, phase, graph/account checksums, time/version of last good checkpoint and incomplete writer/journal markers in durable 0.5.7-compatible world state. Startup must inspect the persisted state **before any routing scheduler is registered or allowed to admit items**. On crash/restart or validation error, stay LOCKED_HOLD; never auto-unlock merely because the code finished loading.
5. **Single authority:** Old Q4 writer and new 0.5.7 engine must never run simultaneously. The global lock is the inter-engine handoff fence, not a substitute for the per-account idempotent debit/credit receipts or the manifest UUID access gate. No production upgrade on the live world without owner approval, backup and separate validation.
6. **Unlock gate:** After schema/config migration, verify **every network** and terminal Receiver balance, migrated filter/link settings, native MR preservation, persistent journals, chunk cleanup and restart recovery. Only then switch to active 0.5.7 and release the global routing lock. If any network fails, remain locked, show the specific blocker and provide an owner-controlled remediation/retry path; never silently resume partial routing.

**One-time notification, including offline players:**

- On the first **ROUTING_LOCKED** transition, notify all currently online players through a normal Minecraft player-visible message (chat/title, with accessible wording) that **HartLogistics routing is temporarily paused for a storage-system migration, stored items remain accounted for, and normal routing will resume after verification**. Do not imply a time estimate.
- Track a **durable per-player delivery marker keyed to the unique migration epoch**, independent of player session or name where the available supported player identity permits. Never rely on an ephemeral entity/session ID as long-term proof. Set the marker **only after** the notification has actually been issued.
- A player who was offline receives the same one-time information **on their next join** if the lock is still active. A player joining only after successful completion receives a **one-time completed-migration notice** instead, not a false “currently locked” message. This guarantees eventual notice for players who connect; there is no claim that disconnected players can be messaged without another service.
- Subsequent joins and repeated server ticks must **not** repeat the notice for the same migration epoch. A genuinely new migration epoch may legitimately notify the same player once again.
- Example locked message: **“HartLogistics: Storage migration in progress. Item routing is temporarily locked while the system is upgraded and verified. Your stored items are being preserved. Routing will resume once migration checks pass.”**
- Read-only `hartlab:status` (or migration-specific status) should continue showing a persistent **Routing Locked — Migration** reason while the transient chat notice is shown only once. No gameplay routing operation should misleadingly report success when lock prevents it.

**Acceptance:** A→B→C network finishes consolidation then locks **before any new writer**, multiple independent networks trigger one global lock only after all finish; attempts to admit/dispatch/relay while locked are rejected; status remains available; reload/server crash preserves locked state; validation failure stays locked; full success unlocks; simultaneous online players each receive exactly one message, offline-on-next-join players receive one, later joining players get the appropriately worded completion notice, repeated joins/ticks do not spam, and a new epoch can notify again.

## 7. Implementation phases (not yet accepted)

| Stage | Engineering objective | Acceptance gate |
| --- | --- | --- |
| P0 — Identity | Upgrade-compatible **0.5.7** manifest/build with access to old data | Read old properties in a cloned 1.4.1 world with one active engine and no data mutation |
| P1 — Census | Pure read-only Q2/Q3/Q4, registry and journal parser | Original quantities and identities reconcile; corrupt/missing states explicit |
| P2 — Graph | Read and stage legacy filters, frames, links and topology **without activating new routing writers**; discover connected networks | Correct unique final-array entry Receiver; cycles/branches require explicit binding |
| P3 — Custody | Expandable terminal Receiver, optional temporary Collector/Receiver buffers, native in-flight recovery and fenced debits/credits | No double-spend or loss across failure injection and restart |
| P4 — Consolidate | Temporarily cover source/terminal chunks and drain **all upstream HL transit custody** into terminal account | All eligible upstream balances zero, terminal exactly credited, no unresolved cargo falsely considered transferred |
| P5 — Routing lock + player notice | Atomically lock **all HL routing** after verified consolidation; issue a durable one-time notification per player/epoch, including later joiners | No item movement/new admission during lock; lock survives restart; all online/returning players receive one non-spamming notice |
| P6 — Migrate + validate | With routing globally locked, switch 1.4.1 state/configuration to the upgrade-compatible 0.5.7 engine; reconcile all migrated accounts and recoverability | Every network and item identity passes readback, native inventory, configuration and restart tests; otherwise stay locked |
| P7 — Unlock + resume | Release migration coverage, clear lock only after all acceptance checks, enable final bank's normal 0.5.7 sorting | Chests fill through normal native Hopper/Transporter routing; no-Bulk support; lock never clears on failure |
| P8 — Production gate | Full source plus BDS proof on cloned 1.4.1 player world with profiler/diagnostics | Owner explicitly approves version-pinned production change after verified backup |

### Critical BDS tests

- A→B→C with many Q4 Receiver balances: **C entry Receiver** receives the entire correct aggregate without physically streaming all virtual items through Hoppers; its virtual storage expands past 250K.
- Independent networks get their own C; branched graph with unique terminal accepted; cycles and multiple sinks HOLD until explicit reachable binding.
- Loaded and unloaded sources; remote terminal; covered overlapping chunks; capacity exhausted; timer cleanup; stop/restart with no duplicate ticking areas or items.
- Two-part debit/credit crash, unreadable Q4 page, unresolved 1.4.1 journal, 0.5.7 account allocation exhaustion; each scenario preserves one clear owner and auditable HOLD.
- Metadata-rich legacy Q4 and native collector/relay inventories are either preserved exactly or reported as safe HOLD; no fabrication from plain item identifiers.
- No preexisting Bulk; original world blocks/frames/filters and modes remain; normal last bank's sorting only starts once account convergence passes.
- Verified terminal consolidation → durable routing lock with no race; blocked Collector/Receiver/relay/Bulk operations; lock surviving BDS restart and failed validation; exactly-once per-player notice across online, offline, returning and post-completion joins; failed lock must never route.
- Compare equal-duration BDS idle and active `.mcstats`, `.cpuprofile`, VS Debugger findings and user-facing tick responsiveness. Never claim mock-only tests equal live migration acceptance.

## 8. Safety and immediate next task

Do not modify a production world, automatically migrate on pack load, silently overwrite old Q4 properties, reinstall a 1.4.1 writer after new 0.5.7 credits have been spent, or claim undo is safe without restoring a **pristine pre-migration world backup**. Game-world backups and gated install are a separate explicit owner-approved action.

**Next source-only engineering work:** (1) prove pack UUID/read access under an upgrade-compatible 0.5.7 build; (2) build a side-effect-free 1.4.1 census; and **(3) build a topology graph detector that reports exactly one final-array entry Receiver per connected storage network or an explicit ambiguity**. Stage/read legacy configuration before consolidation as needed, but **do not activate or cut over new engine writers until the post-consolidation global routing lock is durably engaged**. No item may move until the relevant custody transfer tests pass.

**Definition of done:** After complete verified consolidation, each connected storage network has **one terminal Receiver at the start of its last storage array** owning all eligible former upstream HL transit balances and appropriate expandable capacity. Then a **persistent global routing lock and one-time player notifications** precede engine migration and final validation. Only a fully reconciled, successful 0.5.7 deployment unlocks and resumes normal routing. Any unresolved source/HOLD item must prevent false completion. No lost/duplicated cargo, no fixed locations, no required Bulk, no URCE, no Q5.
