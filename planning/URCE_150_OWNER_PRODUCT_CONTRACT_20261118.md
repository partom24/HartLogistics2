# HartLogistics 1.5 — Owner-approved product end-state contract

**Decision date:** 2026-11-18. **Repository / branch:** partom24/HartLogistics2, planning/urce-150-20261117.  
**Authority:** Direct owner confirmations from the 2026-11-18 URCE continuation conversation.  
**Status:** **OWNER-APPROVED PRODUCT REQUIREMENTS / PLANNING ONLY**. Nothing here asserts an implemented feature, an API proof, a BDS observation, a world migration, acceptance, permission to change gameplay, or release approval.

**Latest clarification:** [URCE-ADR-003 — Transporter as human-readable network infrastructure](URCE_150_OWNER_TRANSPORTER_INFRASTRUCTURE_DECISION_20261118.md) controls over earlier performance wording that implies pipe-by-pipe item movement.

**Read with:** [November 18 routing research handoff](URCE_150_OSI_MULTIBANK_ROUTING_HANDOFF_20261118.md), [URCE-ADR-002 prior item-home policy](URCE_150_OWNER_ROUTING_HOME_AND_OVERFLOW_DECISION_20261117.md), [architecture charter](URCE_150_ARCHITECTURE_AND_DELIVERY_PLAN_20261117.md), [roadmap](../docs/ROADMAP.md).

**Precedence:** This later owner decision **refines/supersedes conflicting product assumptions** in the November 17 ADR-002, November 18 OSI handoff, older Q5/controller plans, and historical 1.5 documents. Retain those documents as provenance and evidence. In particular, a **mandatory final Wildcard bank, required terminal Collector, one Bulk array/controller per bank, named region, and Q5 intermediate migration** are **not** 1.5 product requirements. The owner's pictured final bank with many Wildcard Sorters is a real layout/intention, not a constraint on every valid network. Preserve prior engineering evidence and all compatibility/safety gates.

## Desired player-visible outcome

HartLogistics 1.5 routes ordinary and metadata-rich (MR) items across verifiably connected, directed multi-bank systems with as few productive transactions and unnecessary reads as practicable. A roughly 1,400-Sorter installation with predominantly four- to five-high vertical columns, multiple banks, Hopper/Transporter paths, Collector–Receiver links and distributed Bulk Storage must remain playable during heavy movement. Items always retain a discoverable custody location and exact identity. **No verified home means no movement.** Stability and normal player interactions (placing blocks, eating, playing) matter more than an invented TPS or throughput target; measure rather than assume.

## A. Network membership, topology and routing (accepted)

1. **Automatic, path-based networks.** Verifiable logical item-transfer connections establish a governed network, whether through supported Hopper links, Transporters or Collector–Receiver links. No manually designated network or mandatory Bulk controller is required. A network may consist of only a single Collector and Receiver. Mere proximity/adjacency, or an unreachable Sorter elsewhere, is not membership/route proof. Direction and a valid **source-to-destination** path determine eligibility: if Receiver A cannot logically deliver to Sorter #240, #240 is not a route option for A.
2. **Directed acyclic routing.** Reject a new managed Collector→Receiver connection if it would form a directed cycle (the proposed Receiver can already reach that Collector). Branches and converging paths remain valid. Unknown topology must not be activated on a guess; HOLD/reconcile. Vanilla/external Hopper operations are not assumed to be preventable by Hart script: engineering must detect/exclude unsafe engine-controlled paths without pretending to stop vanilla ticks.
3. **Within-column ordering:** Preserve the current **bottom-to-top** Sorter priority. Across different eligible columns, prefer an empirically **lower transactional cost**. Nearest-to-input may correlate with cost but is **not** the required algorithm. Filter claims precede eligible **live-seeded Auto** claims. Try all eligible accepting destinations, including partial stacks, rather than deciding from the first full chest. A Filter/Auto claim exists independently of available capacity.
4. **Before any new transport:** Determine a legitimate, reachable home or authorized buffer; verify required live admission and bounded custody. Do not speculate by forwarding items through banks hoping to find storage. A physical relay is allowed only when necessary for a selected reachable delivery path and its custody handoff is safe. Unknown routes, unloaded/unverified authorities and disconnected paths **HOLD at the current authoritative custodian**; never bounce back to a Receiver as an extra move.
5. **Compatibility:** An ungoverned/standalone legacy installation retains existing 1.4.2 Filter→Auto→Wildcard, Bypass, redstone, native Hopper compaction and links. No assumed dynamic-property + native-inventory atomic transaction; no unproved physical ACK.

## B. Home and fallback routing (accepted)

**Claimed ordinary cargo, or identity already authoritatively resident in Bulk:** attempt eligible Filter then live-seeded Auto first; if none accepts the remainder, admit to **verified reachable Bulk capacity**. Only **authoritatively proven exhausted applicable Bulk** permits the previously accepted Wildcard overflow exception. Unknown/unloaded/disputed Bulk identity, capacity or route is not "full"; preserve custody and HOLD.

**Genuinely unclaimed ordinary cargo:** verify no eligible Filter/Auto claim **and** no existing authoritative Bulk home; unknown remote claims do not establish absence. Attempt valid reachable **Wildcard** destination(s) first. If none can accept, attempt an **available terminal Collector** as an authorized home. If both are unavailable/full, use **verified available Bulk overflow** when safely supported. If no such home can accept, **HOLD in place**. This is the owner-approved November 18 refinement of the earlier assumption that unclaimed items must reach a final bank.

**Terminal Collector is optional:** A Collector at the true end of a directed chain, with no downstream transfer route, may hold unclaimed items in safe, bounded, durable custody as a legitimate final home. A valid network is **not required** to have one. An unloaded/unknown downstream path is **not** evidence of being terminal. No terminal and no other eligible home means **do not transport**. When a terminal Collector is full, backpressure rather than loss, circulating items or a forced return trip. Engineering must prove the Collector's actual persistence, safe capacity, item access and fault behavior; a terminal home is not unlimited storage.

**No-home / no-space invariant:** At each attempted handoff, **if the item has no verified reachable destination or authorized buffer, do not move it**. An item already present in a Receiver/Collector stays with that custodian; don't send it "back" as another transaction. HOLD is a legitimate non-error state, automatically reconsidered on meaningful route/capacity state changes without a costly all-network retry storm.

### Compact decision examples

| Situation | Required outcome |
| --- | --- |
| Cobblestone claimed by Filter, chest full, other Filters/Auto cannot accept, reachable Bulk has room | Bulk, not Wildcard |
| Claimed cobblestone; applicable Bulk authoritatively full | Eligible Wildcard overflow; otherwise HOLD |
| Truly unclaimed cobblestone; valid Wildcard chest has room | Wildcard, independent of empty Bulk |
| Unclaimed cobblestone; Wildcards full; terminal Collector safe and available | Terminal Collector |
| Unclaimed cobblestone; Wildcards and terminal unavailable; safe Bulk capacity verified | Bulk overflow; otherwise HOLD |
| No terminal Collector and no valid other home | Remain at current custodian; network remains valid |
| Candidate remote claim/Bulk/network is unloaded or disputed | HOLD/reconcile; don't invent absence or fullness |
| Managed Collector→Receiver link would close directed cycle | Reject link, preserve established connections |

**MR-specific branch:** MR cargo receives servicing priority over ordinary cargo **without permitting starvation or unsafe serialization**. Preserve native ItemStack exactness (names, enchantments, durability, custom metadata, unknowns); unclaimed MR should attempt an appropriate native **Wildcard** outlet before Bulk. Native MR terminal custody may be used if independently proved. **Ordinary count-based Bulk capacity does not authorize storing MR.** MR Bulk fallback is allowed only if a proven native, durable, non-lossy MR facility exists; otherwise remain in native custody/HOLD. Prior Q4 MR direct-only safety remains until an accepted native replacement, not as the intended permanent 1.5 solution.

## C. Network-wide Bulk and demand-aware redistribution (accepted)

- The default product direction is **sharing safely reachable Bulk Storage capacity across the governed network**, rather than mandatory isolated arrays per bank. A single array may serve the network **if** this does not introduce excessive overhead, unsafe ownership or split/merge faults. Each Bulk Storage member targets **200,000 ordinary items**, with verifiable accounting and independently authoritative balances; no implicit shared unlimited pool or stale global capacity cache.
- **Bulk is an automatic overflow buffer and secondary supply**, not a competing objective to empty virtual balances at all costs. If a Receiver already has enough cobblestone to fill a Filter chest, perform the required Receiver→Hopper/Transporter→Sorter→chest work and **do not initiate Bulk→Sorter→chest transactions** for the same capacity.
- If eligible Receiver cargo does **not** cover available chest space, or no eligible primary traffic exists, redistribute stored Bulk items toward legitimate live Filter/Auto destinations automatically, with **bounded, useful, opportunistic** work. Partial capacity moves only the accepted quantity. Newly arriving cargo must not be starved by Bulk drains.
- For unclaimed items temporarily overflowed into Bulk because no Wildcard/terminal could accept, automatically attempt legitimate Wildcard or terminal delivery when capacity returns, **without needless churn**. Never circulate items just to lower a balance.
- A read-only route/identity summary may avoid unnecessary checks. Actual native destination capacity and item/custody authority must be revalidated at the responsible endpoint. No every-tick global chest scan, duplicate serialization, synthetic admission authority or pointless queue/journal transactions.

## D. Storage, HOLD visibility and player interaction (accepted)

**Common Collector, Receiver and Bulk Storage experience:** clear current power state, relevant queue/capacity, delivered/received activity and equivalent existing /status data; include block-specific operational/status information. A powered/paused Receiver legitimately retaining a large queue must **not** display every such item as a routing failure.

- **HOLD** describes a route/admission condition preventing further movement, with an intelligible reason (e.g., no eligible destination, full, disabled/powered, unknown/unloaded, link not reachable). **HELD** is the count of affected items **owned by that block**, never double-counted upstream. **STORED** identifies items intentionally residing in authorized Bulk or terminal Collector custody. Queued, HELD and STORED figures must have explicit non-duplicated meanings.
- **What is held matters more than a number.** Every retained item must be discoverable by identity, quantity, **holding block/location**, status and reason. An enchanted sword cannot vanish inside a count of held items. MR items must be **individually distinguishable** where metadata differs; show custom name, enchantments, durability and other supported attributes without flattening or serializing native ItemStacks for display. Mark unavailable/unloaded details as unverified rather than presenting stale data as fact.
- **Shared inventory browser:** Collector, Receiver and Bulk menus use a consistent **overview → searchable/filterable, paginated item-type list → details** pattern. Provide direct HELD view; meaningful grouping for ordinary stacks; MR-specific detail. Queue and type counts plus utilization visible on overview. Bulk shows per-item-type balances, with safe MR inspection if such custody is ever proved.
- **250,000-item Receiver scale:** opening a menu **must not scan or render the entire queue**. Maintain bounded/update-aware summary indexes that respect actual custody writes and recovery, and load just requested pages or details. Many dozens of types cannot produce an unbounded form. Menu browsing is **read-only by default** and does not trigger routing/migration/physical custody writes.
- **Safe retrieval:** A player can deliberately retrieve selected HELD items and items legitimately held by terminal Collectors, including distinct MR items, through explicit verified actions; inspection itself never removes them. Retrieval must obey exact identity, availability, custody, journal and anti-duplication checks. The native extraction mechanism and interface details require proof, not invented API support.
- Apply this capability-based inspection to relevant HartLogistics storage-capable blocks; support for arbitrary third-party/foreign virtual containers is **desirable only where safely feasible**, not a 1.5 release prerequisite. Keep the accepted Collector menu's explicit **Link / Relink Receiver** interaction and confirmation; no unprompted link on placement.

## 2026-11-18 performance, Transporter and pre-code follow-up

The owner accepts P4/1.4.2 as the native-first optimization boundary for URCE planning and distinguishes **items moved**, **transaction count**, **per-transaction native/journal work** and **peak tick cost**. **Transporters primarily construct a human-readable logical storage network; they do not require item traversal or a per-block transfer.** URCE is responsible for safe high-throughput endpoint movements along verified routes, avoiding Hopper-per-hop costs where feasible; native Hoppers themselves remain unchanged. Prefer clearing legitimate bursts quickly while the BDS remains playable, with a separate continuous-load proof. **16/32/64 are comparison candidates, not approved runtime settings.** See [the measured November 17 BDS capture and batching evidence](URCE_150_TRANSPORTER_BATCHING_BDS_CAPTURE_EVIDENCE_20261118.md) and [open pre-code proof gates](URCE_150_PRECODE_READINESS_AND_PROOF_GATES_20261118.md). The owner did not approve a numeric TPS hard limit or 1.5 code in this follow-up.

## E. Performance, scope and proof boundaries (accepted)

1. **Player experience is the performance gate:** normal block placement, eating and gameplay remain responsive while logistics is active; BDS remains stable. No fixed 20/50 TPS promise, arbitrary throughput target or success claim from modeled native-call counts. Collect actual server tick/script timing, throughput, queue age, memory, conservation and error/restart evidence on approved rigs.
2. **Preserve the baseline:** 1.4.1 compatibility and the 1.4.2 source baseline, saved Q2/Q3/Q4, IDs/UUIDs, journal and recovery semantics, MR exactness, vanilla Hopper paths and redstone. FIFO is **not** a requirement. No Q5 intermediate format or archived 1.5 implementation mandate.
3. **1.5 feature boundary:** the integrated network/custody/transport/Bulk/storage-inspection behavior above is the goal. No automatic HartBots Depot integration, broad network-management service or arbitrary third-party inventory integration added by implication. New physical Bulk Storage and Transporter have unique assets and preserve Hopper alternatives.
4. **Governance:** All decisions in this file are *product acceptance of design intent*, **not implementation authorization**. Planning/source-only research on this branch; no gameplay pack, world, LAB, production updater, frozen source, release or production operations without respective explicit authorization. Historical experimental API findings are not stable target-BDS proof.
5. **Research required before design freeze for implementation:** complete transitive U0 writer/callback/side-effect census; directed network graph and cycle detection including native Hopper limitations; low-cost candidate routing proof against owner-shape model; independently authoritative cross-bank Bulk custody and home/reconciliation; reuse proven PG42 native entity-inventory storage and PG20 native MR routing evidence, then design URCE carrier integration and safe retrieval; transactional ownership/restarts/Q4 migration; bounded menu indexes and safe extraction; native actual-load acceptance after authorization. These are **engineering proof obligations**, not invitations to re-open settled owner product choices.

## F. Source-only and later owner-LAB acceptance cases

| Case | Expected evidence |
| --- | --- |
| Direct Collector→Receiver-only network, without Bulk or terminal | Valid small network; HOLD items with no home |
| Multi-bank 1,400-Sorter shaped graph; unreachable remote Sorter | Reachability-correct routes, no false matches; quantify skipped native reads and physical hops |
| Branch and merge; attempted back-edge | Preserve valid noncyclic links, reject only directed cycle; unknown fail closed |
| Filter/Auto tie across columns | Bottom-to-top within column; justified low transaction-cost candidate choice; live eligibility/admission |
| One shared Bulk array, bank disconnect/reconnect/unload | No invented shared capacity, stale homes, double credits or orphaned items |
| Receiver supplies all newly free chest space while Bulk has backlog | No unnecessary Bulk transfer; receiver continues productive delivery |
| Receiver shortfall/free space, or no traffic | Bounded automatic partial Bulk redistribution with durable custody |
| Unclaimed Wildcard full; terminal present/absent; Bulk fallback full/unknown | Correct fallback order and HOLD, no "bounce back" transaction |
| Temporary unclaimed Bulk home, later Wildcard/terminal free | Opportunistic reclassification without churn or item loss |
| MR named enchanted sword with no home | Safe native HOLD; visible exact identity, metadata, custodian and reason; deliberate safe retrieval |
| Powered Receiver with 250,000 items / dozens of types | Responsive pages and filtered summaries; paused ≠ no-home error; no full scan on opening |
| Restart/unload with transfer pending | Exactly one custodian, conserved quantity and metadata, no false receipt or speculative replay |
| Owner LAB heavy gameplay alongside routing | Stable, playable BDS, no unapproved server/world mutation; native profiled evidence |

## Engineering work that remains OPEN (not owner product decisions)

- Define route topology observation and revision/invalidation; determine which Hopper connections can be soundly represented without controlling vanilla ticks.
- Prove admissible lower-cost column ordering and bounded routing without extra native calls, preserving physical handoffs that really exist.
- Design authoritative Bulk balances/custody across network splits, merges, home identity and provisional unclaimed overflow.
- **Reuse** already accepted PG20 native MR routing and PG42 native nine-slot persistent entity storage on the target BDS; prove only the **changed URCE integration** (Collector/Receiver carrier ownership, exact MR admission/egress, retrieval, unload/crash and Q4 migration). Do not repeat primitive discovery or require experimental custom-block inventories. [Cross-branch evidence audit](URCE_150_CROSS_BRANCH_NATIVE_MR_EVIDENCE_REUSE_AUDIT_20261118.md). Unsafe serialization remains prohibited.
- Implement source-only safety/performance comparisons and, later **only with approval**, full LAB gameplay and source-verified/owner-accepted release gates.

**Next working sequence:** complete source-only U0 read/write census, model a minimal directed graph/claims interface and loop rejection, then write U2 custody/recovery and menu indexing/extraction proof plans. No source or server action is authorized by this document.
