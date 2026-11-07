# Hart Logistics 2 — Logistics Architecture and Block Specification

**Status: owner requirements captured; planning only, NOT implemented or tested.** For uncertainties see [decision inbox](IDEA_INBOX.md), for Receiver migration see [Q5 design](Q5_MIGRATION_DESIGN.md), for acceptance see [test plan](COMPATIBILITY_TEST_PLAN.md).

For exact pre-existing item ingress/egress acceptance see the **[source-traced 1.4.1 ingress/egress matrix](BASELINE_INGRESS_EGRESS_MATRIX.md)**. Future block integration must not change any existing E01–E11 path without a lossless compatibility adapter.

## Non-negotiable preservation

Every 1.4.1 capability remains supported: existing Sorter FILTER/AUTO/WILDCARD/BYPASS modes and filter semantics, item-frame filtering, Collector/Receiver links, vanilla hoppers and legacy output paths, redstone controls, dropper/dispenser behavior, original identities, queue recovery, legacy q2/q3 conversion and all saved-world state. A network without new blocks must keep the original operating behavior. New routing policies must be opt-in through a correctly established network, never silently applied globally.

## Network context

The owner's diagram includes several **transport banks** joined by Collector→Receiver linkages, with an input system and distributed Bulk Storage. Both of these are valid:
- **Single closed loop with one controller**, managing routing across all connected transport banks.
- **Interconnected regions with multiple Bulk Storage controllers**, coordinating advertised filter destinations, capacity and routes.

A controller is responsible for a *routing region*, not necessarily one bank; physical bank count does not determine controller count. The first Bulk Storage block placed **between a Receiver and Collector** in the relevant region is intended to become the controller; it is **not** a replacement for the Collector. Precise region election/membership rules are unresolved. No cross-repository access is implied.

## New block 1: Hart Bulk Storage

**Owner requirements**
- Stores **200,000 individual ordinary items per block** as compact, lossless item-ID/count buckets. Every additional member contributes **another 200,000**, forming one shared capacity for that connected storage network.
- Overflow is held when a corresponding filtered chest cannot fit more items; when filtered destinations are available, items should be delivered there first.
- Controllers collectively decide whether an item is sorted locally, forwarded to a remote filtered destination, or held as overflow. Ordinary items in this governed network must **not be placed in a wildcard Sorter while usable Bulk Storage space exists**.
- The first Bulk Storage block in its designated controller region becomes that region's controller. Further Bulk Storage blocks extend capacity without competing for controller authority.
- Controllers communicate across the connected network; local delivery, cross-bank routing, fallback and route loops require explicit policies.

**Proposed design boundaries (not yet decided):**
- Network identity, region boundaries and membership may require persistent IDs independent of geometry; exact discovery mechanism not chosen.
- Keep one authoritative durable owner for each item quantity; pooled network capacity should not imply uncontrolled duplicate copies of bucket balances.
- Controller election/failover and merging/splitting regions require deterministic reconciliation with safe behavior during unloads.
- "Completely out of space" needs an exact definition for inaccessible, chunk-unloaded, paused and disconnected members.
- Capacity is a count of individual items, not slots or stacks. MR item capacity is a separate open question.
- Breaking a populated Bulk Storage block must not silently lose contents; choose block-protection, safe evacuation or item-drop behavior before implementation.

## New block 2: Hart Transporter

**Owner requirements**
- A high-throughput, six-direction-connected transport pipe occupying one normal block position, visually **~4×4 texture pixels in cross-section within the normal 16×16 grid**, resembling plumbing.
- Supports straight, elbow, T, cross, vertical and six-way connections as the topology demands.
- Transporters may **pull from any supported ordinary container as input**. They **must NOT directly distribute into ordinary containers**. Final chest insertion remains a Sorter responsibility.
- Primary path: **Receiver or Bulk Storage → Transporter network → Sorter** for storage. Other Transporters relay items.
- Vanilla hoppers remain valid existing paths. No new Transporter may invalidate or require removal of any hopper-based 1.4.1 route.
- Must also be able to pull Depot items from **HartBots 1.8.2** in the future. HartBots Depot uses its own compact virtual storage, not a standard native container; direct access requires a **later, separately authorized inter-add-on transfer interface**. The current fallback could use a conventional output inventory; its throughput and exact wiring need testing. Do not change HartBots now.

**Important engineering limits**
- "Any theoretical amount" means scalable, bounded batching/streaming with no arbitrary routing-throughput cap tied to vanilla hopper rates; not infinite items per tick or unbounded RAM.
- Transfers must be conservative and idempotent: reserve source amount, verify destination acceptance, commit/acknowledge, and recover after interruption without duplicates.
- Address junction path selection, endpoint discovery, destination reservation, loop/TTL handling, backpressure and fairness before implementation.
- Transporter extraction from adjacent filtered chest must not accidentally empty stored results. Exactly how to mark/configure input faces is unresolved.
- Standard six-face geometry does not imply opening a connection to every adjacent container. Model collision/hitbox and water behavior remain open.

## Dual-lane design (owner requirement)

One connected transport *system* carries two **logical lanes**, not necessarily two physical pipes:

| Lane | Items | Representation | Priority |
| --- | --- | --- | --- |
| **MR (metadata-rich)** | Enchanted equipment/books, potions, music discs, item sacks with contents, named/custom-data items and any item not losslessly representable by a bucket | Native Minecraft-managed ItemStack slots; native container-to-container transfer semantics wherever available | Preferred service for MR sorting/storage; lane fairness and exact scheduler weights TBD |
| **Ordinary bulk** | Items demonstrably safe to represent by identity + quantity | Q5 count buckets and reserved batch transfers | Large-volume batched movement without per-item serialization |

**Never flatten an MR item into a type/count bucket or fall back to lossy serialization.** Missing native capacity must result in holding/backpressure, not item deletion. A custom item whose semantics cannot be proven must default to the safe MR lane.

The Collector and Receiver should evolve into native-ItemStack-preserving storage endpoints, **without losing their existing behavior**. Receiver Q5 is a hybrid: a bucketized ordinary queue plus an MR-native lane; existing Receiver **250,000-item** capacity is not silently changed. MR slot-count inclusion in that cap must be decided.

### Critical version gate

Owner reports **server 1.26.63.1 and client v26.63** as the intended test environment (reported 2026-11-06, **not tested**). The 1.4.1 manifest declares a **1.26.50** minimum and **@minecraft/server 2.7.0** dependency. Microsoft's 1.26.50 release notes classify `minecraft:block_entity.container` as an **experimental** feature, even though the base block-entity component is stable. Do **not** assume an experimental world toggle is authorized or acceptable on existing worlds; verify native container behavior for both server 1.26.63.1/client 26.63 and older supported versions. Existing placed-block upgrade and dynamic-property custody require copied-world tests.

## MR fallback replacement: accepted owner decision (2026-11-06)

The owner chose **migration to native custom-container inventory** over indefinite preservation of the old Q4 **Hopper → Collector → direct Receiver output Hopper** MR workaround. **The delivered capability is protected, not the old internal algorithm.** This is a planned, gated replacement, not permission to delete any existing code now.

- Make Collectors and Receivers **persistent native MR inventory endpoints**. Keep their existing block IDs, links, redstone semantics, hopper ingress/egress and standard Q4→Q5 migration. Both Hopper→Collector and Sorter→Collector should be able to admit MR items to the Collector's native slots once proven safe, with metadata intact.
- MR items can **wait inside the Collector while the linked Receiver is unloaded/full**, and in the Receiver while its next output is blocked. Native slots, not lossy JSON, own the MR ItemStacks. Intake must fail closed when slots are full, preserving the original source item.
- When both native endpoints are accessible, design verified native slot-to-slot transfers, with backpressure, restart and journal/acknowledgment safety. **A native in-memory move does not by itself prove crash-atomic transfer** across containers/chunks; document custody and recovery before implementation.
- Preserve the **old hop route externally**: a Receiver still delivers safely to the hopper below or a subsequently approved Transporter path, and Sorters remain responsible for final ordinary-container distribution. Do not bypass established redstone gates, filter choices or old hopper-only installations.
- During migration, retain the **legacy direct-only fallback as a guarded compatibility path only until the new MR path is supported, migrated and runtime-accepted**. Do not remove it prematurely; after acceptance, it can be retired in favor of equivalent-or-better native MR delivery. No permanent retention requirement for the old direct-only algorithm.
- Native custom block inventories on server **1.26.63.1** / client **v26.63** remain an **API stability / experiment-policy gate**. This owner decision selects the target architecture; it does **not** authorize enabling experiments or claim custom block container support has been verified.

MR service priority must be honored without starving ordinary items, and native inventory slot limits/backpressure are mandatory. See [Q5 migration](Q5_MIGRATION_DESIGN.md) and the [baseline route matrix](BASELINE_INGRESS_EGRESS_MATRIX.md).

## Network-wide routing priorities

For an ordinary item on an explicitly governed network:
1. Choose a matching **filtered** destination that can accept items (local/remote path cost and reservations TBD).
2. If no accepting filtered destination, retain in shared **Bulk Storage** overflow while capacity is genuinely usable.
3. Consider a **wildcard Sorter** only when shared Bulk Storage is truly full according to an owner-approved consistency rule.
4. Never allow a stale advertisement or cyclic route to silently lose/duplicate an item.

MR items use native ItemStack preservation and preferred handling; whether MR items may occupy Bulk Storage or wildcard fallback is unresolved and cannot be inferred from ordinary bucket rules.

## Accepted vs pending

**Accepted requirements:** zero 1.4.1 regression; two blocks and their purposes; 200k/additional Bulk Storage; distributed or single controller topology; Transporter input-only to ordinary containers; six-face 4×4 pipe; native hoppers continue; Q4→Q5 safe migration; MR-native lane and prioritized service; future HartBots Depot extraction.

**Not decided:** controller region identity/election, connection topology, input selection, item identity classification, destination capacity reservations, MR inventory size/slot accounting, throughput targets, wildcard on partitions/unloads, experimental API policy, controller failover and block removal. See [inbox](IDEA_INBOX.md).

