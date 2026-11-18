# URCE 1.5 — OSI-inspired multi-bank routing: owner clarification, implementation map, and new-chat handoff

**Date:** 2026-11-18. **Branch:** `planning/urce-150-20261117` in `partom24/HartLogistics2`. **Authority:** Owner conversation and exact repository source/plan review. **Status:** DESIGN / SOURCE-ONLY RESEARCH; no 1.5 gameplay, BDS run, world mutation, release or performance acceptance. **This document supersedes older controller-per-bank/region assumptions as *requirements*, not the older historical evidence.**

## Read this first in the next chat

1. **Source foundation:** `baseline/native-first-142-20261117` is the closed development/source baseline (P4e, no P4g rejection cache), but is **not** accepted on owner BDS or authorized for production. Preserve unchanged 1.4.1 original 72-file import and 1.4.2 gameplay/hash controls; no changes to `addon/` in this planning branch.
2. **Actual objective:** the owner's [`sorter-array.png`](../docs/reference-images/sorter-array.png) and [`storage-room-array.png`](../docs/reference-images/storage-room-array.png) are required visual/topology inputs. Approx. 1,400 Sorters in stacked columns, repeated transport banks, Collector–Receiver linkages, distributed Bulk Storage, and a designated **final bank containing many Wildcard Sorters**. The drawings are owner intent, not coordinates or BDS validation.
3. **Product vocabulary:** **Sorter** = Filter/Auto/Wildcard/Bypass block; **Bulk Storage** = a separate block (target 200,000 ordinary items per member). There is **no 'Bulk Sorter'**. A **bank** is a physical transport run with served Sorters; **network** is the connected multi-bank system. 'Region' was an assistant-introduced implementation term: **NOT** an owner feature requirement.
4. **Historical controller model is optional:** In the original attempt the **first Bulk Storage placed within a bank automatically became its Bulk Controller**. Bulk controllers communicating across banks was a historical design, **not** a requirement to preserve. The owner delegates the number/existence of controllers and internal partitioning to evidence-driven engineering, so long as the full system works efficiently and safely.
5. **Owner routing policy still binds:** Filter first, then live-seeded Auto. If a claimed identity cannot enter any appropriate Filter/Auto destination, or already has an established authoritative Bulk home, use verified available Bulk Storage. **Truly unclaimed items** belong at the final Wildcard bank; **confirmed-full applicable Bulk** permits Wildcard overflow. Unknown/unloaded/disputed home or capacity is not 'full': HOLD/reconcile. See [URCE-ADR-002](URCE_150_OWNER_ROUTING_HOME_AND_OVERFLOW_DECISION_20261117.md). Local ungoverned installations retain exact 1.4.2 behavior.
6. **FIFO is not a product requirement**; preserve Q2/Q3/Q4 payload, identity, persisted journals, no-loss/no-duplication, old-world compatibility, redstone and native Hopper paths. **Do not reuse frozen archived #79/#82 1.5 gameplay or revive Q5 as a mandatory intermediate format.**

## First-principles question and current answer

**Question:** How can cargo pass two or three irrelevant banks with minimal work and reach the bank that legitimately stores it?

**Answer / testable hypothesis:** Distinguish **routing eligibility**, **next-hop forwarding**, **live destination admission**, and **durable custody**. Resolve plausible destination and connectivity from cheap registered configuration; do not scan unrelated Sorter chests or serialize cargo merely to reject a bank. At transit connections verify the next hop and safe ownership handoff without independently rediscovering every destination. At the actual eligible Sorter/Bulk outlet, revalidate live block, power, identity/Auto seed, capacity, physical source and custody before writing.

**Scope caution:** A routing bypass **does not automatically remove a physical hop**. Collector→Receiver queue handoffs and source/destination journals still cost writes where physically necessary. A direct pipe path or logical source→final-destination transfer cannot be assumed safe or even possible until native endpoint, load/unload, restart and recovery behavior are demonstrated. No per-item fictitious packet/metadata modification.

## OSI inspiration — responsibility map, not seven runtime subsystems

| OSI analogy | URCE concern | Required boundary |
| --- | --- | --- |
| L7 application | Filter / seeded Auto / existing Bulk home / final Wildcard policy | Claims independent of whether a chest is full; preserve standalone priority |
| L6 representation | Lossless ordinary identity versus MR native ItemStack | Never flatten name, enchantment, custom data or unknown items into buckets |
| L5 session | Prepared/pending/committed/ambiguous transfer and restart reconciliation | No speculative ACK, replay, deletion or refund |
| L4 transport | Reliable ownership transfer, backpressure and bounded batches | One shared custody contract, not one writer per bank or subsystem |
| L3 network | Plausible destination, bank reachability, route revision, next hop and loop prevention | Configuration may exclude impossible Filter candidates; cannot assert live chest space |
| L2 link | Collector–Receiver handoff and Transporter connections | Verify actual connection/ownership before handoff; fail closed on unknown |
| L1 physical | Hopper, inventory/container, pipe and native ItemStack behavior | Native Bedrock reads/writes authoritative at admission, no invented Hopper change event |

**Implement as three cooperative responsibilities:** (1) read-only policy/topology routing, (2) physical forwarding and endpoint admission, (3) cross-cutting shared custody/repair. Never create seven schedulers, a TCP/IP protocol, global per-tick scan, stale chest-capacity mirror or mandatory per-bank controller to match the analogy.

## Candidate routing decision / forwarding contract (PROPOSAL ONLY)

1. Intake: preserve existing native Hopper/source and journal gates. Read the minimum safely available identity; if source, route state or custody is uncertain, do not move it.
2. Discover: from registered Filter configuration and verified connections, produce an ordered set of *plausible* destinations and next hops. Treat Auto seed as **live**, not as a permanent routing directory fact; an unknown/unloaded remote claim does not prove the item is unclaimed. A destination announcement never certifies capacity.
3. Select: obey Filter → live-seeded Auto across authorized eligible destinations with existing within-column ordering where relevant. Do not send to Bulk or Wildcard simply because the first candidate is full; continue allowed destinations and quantities.
4. Forward: if the current bank has no eligible reachable local destination, relay toward the chosen next hop without inspecting unrelated chests. Only reuse a route while its configuration/topology revision and needed live authority remain valid. Unknown/disconnected path: HOLD or replan without creating duplicate custody.
5. Admit: at an eligible destination, verify physical Sorter/filter/power, source ItemStack, exact native partial/empty slot and metadata compatibility or authoritative Receiver/Bulk account. Only then authorize the bounded writer; continue with any remainder.
6. Overflow: claimed-but-blocked, or authoritative identity already held in Bulk → verified eligible Bulk capacity; genuinely unclaimed → designated final Wildcard bank; applicable Bulk **proved full** → Wildcard exception; unknown capacity/home → HOLD.
7. Safety: bounded hop/path attempts, no endless circulation, no item deletion from TTL-like exhaustion. Durable journal/receipt/epoch and recovery must unambiguously establish the owner of each quantity. A transport ACK alone is not physical proof.

## Bulk Storage and Collector/Receiver model comparison

| Model | Plausible benefit | Main risk / disposition |
| --- | --- | --- |
| First Bulk Storage per bank is controller | Localized capacity and routing owner | Extra controller election, replication, inter-bank negotiation; **historical only** |
| One physical Bulk Storage is network controller | Simple single coordinator | Loaded-state dependency and potential bottleneck; **not default** |
| Read-only logical network directory + independently authoritative Bulk member balances + shared custody writer | Fewer mandatory control blocks, clear separation of routing from storage | Requires identity, serialized write ownership, reload/split/merge correctness; **preferred research candidate, not approved code** |
| Optional internal subdivisions/controllers | Failure or throughput isolation if required | Extra complexity; **only when measured proof justifies** |

The directory is an *in-engine logical view*, not a new physical block or a second source of custody authority. Each Bulk Storage may contribute 200,000 ordinary items only under a verifiable balance/ownership record; summing balances is not license for independent concurrent credits. A Collector admits/forwards at a verified connection; a Receiver maintains durable intake/output and the existing 250,000 ordinary-item compatibility boundary. A Collector is not automatically a bank controller. Existing native Hoppers remain valid; future Transporters are additive. MR remains exact native custody with backpressure until endpoints are proven.

## Source mapping: concrete 1.4.2 starting points

| Actual current source | Relevant future boundary |
| --- | --- |
| `rebuildTopology()` | Current *local vertical-column* discovery, not a bank/network graph; retain and extend connectivity separately |
| `schedulerTick()` / `processColumn()` | Every eligible column is still visited each tick; P4d proves Filter-only local transit in some cases; test bank-level skip without breaking Hopper compaction and pass-through |
| `matchesFilter()` / `sorterMode()` | Reuse exact policy semantics; nonmatching Filter is cheap, Auto seed is live |
| `destinationFor()` | Live block/destination resolution currently can register Collector and write logistics; extract read-only discovery separately from side-effectful endpoint validation |
| `findAcceptSlot()` | Native capacity authority at actual destination; no persistent chest-capacity cache |
| `processCollectorIngress()` / `processReceiverDrain()` / `logisticsTick()` | Existing directed Hopper–Collector–Receiver physical/queue boundaries; no network forwarding assumption yet |
| `safeMovePartial()` / `recoverJournal()` / Q4 queue journal writers & replay | Existing durable constraints; must adopt all item-writing and recovery entrypoints into one proven authority before new 1.5 writers |

**Already learned (DO NOT re-run as though untested):** P4e ~51.69 native destination `getSlot` reads/admission on owner active workload; P4g callback-local rejection cache had no observed reuse and is excluded from 1.4.2; naive U1 lazy local route rewrite increased Sorter block lookups in 120/144 modeled mixed columns with no native slot-read savings (**NO-GO**); sharing freshly checked native Block per synchronous attempt is research-only; queue-capacity-before-serialization is **NO-GO** in general because `loadReceiverQueue()` can migrate/write Q2/Q3/Q4 for cargo rejected by the serializer. The OSI-inspired *bank-level* next-hop hypothesis must prove novel avoided native/custody work, not repeat rejected local rewrites.

## Source-only model and later native acceptance matrix

| Scenario | Critical invariant / measurement |
| --- | --- |
| Four-bank path: Filters only in Bank 4 | First 3 banks avoid irrelevant Sorter/destination reads; count real physical custody handoffs, not only JS checks |
| Owner-shape multi-bank stacked 1,400-Sorter model | Configuration updates, route search/lookup work, `sorterAt`/`destinationFor`/`findAcceptSlot`/`getSlot` counts and journal writes against exact 1.4.2 baseline |
| Changing Filter or live Auto seed during transit | No falsely proven nonmatch/claim; safe route invalidation and final live revalidation |
| Full or partial legitimate destination | Try remaining Filter/Auto targets, transfer exact amount, then correct Bulk fallback |
| Existing Bulk identity; separate unclaimed identity | Existing Bulk home before Wildcard; truly unclaimed reaches final Wildcard bank |
| Bulk confirmed full versus unloaded/unknown | Only proven full permits claimed-item Wildcard overflow; unknown HOLD |
| Disconnected bank, route loop, rejoining network | No stale path transfer, no item loss/duplication, no infinite circulation |
| Collector→Receiver interruption, restart, stale journal | Exactly one authoritative debit/credit; unknown outcome durable HOLD |
| MR books, named/custom items, mixed 5-slot Hoppers | Preserve full native ItemStacks and legacy Hopper compaction/redstone; never flatten |
| Final bank Wildcard full or unavailable | Backpressure/HOLD; no unbounded recirculation |

**Evidence ladder:** source differential and fault injection → exact native nonexperimental endpoint/transaction proof on isolated authorized LAB → representative workload native Script Profiler + BDS diagnostics + VS Debugger → owner full-layout, persisted-world acceptance → separate release authorization. Compare actual item throughput, server script/level tick p50/p95/p99, costly native calls, memory, conservation and saved-world recovery; synthetic call counts do not prove TPS.

## Immediate next engineering work (documentation/source-only until explicit implementation authorization)

1. Finish U0 **exact 1.4.2 read/write/callback census**, including transit compaction, physical writes, Q4 queue/entity recovery, dynamic-property, filters, display and implicit registration side effects. Distinguish Hart script locks from native/foreign writers.
2. Specify a minimal **bank graph and route claim interface** grounded in the owner's PNG without inventing coordinates, bank count, flow direction or region boundaries. Decide what can be persisted as configuration, what needs live native verification and what remains unknown.
3. Build **source-only comparative four-bank and owner-shape tests** for local classification versus destination-directed next-hop forwarding, including repeated physical/journal writes, no false bypass, Auto changes, unload and final Wildcard exception.
4. Complete U2 custody/maintenance/migration fault model before *any* 1.5 writer: q2/q3/q4 migration without draining, non-atomic native/world writes, verified endpoint, ownership epochs and conservative HOLD.
5. Decide controller-free Bulk ownership and optional subdivisions only after those tests; isolate native API and BDS viability gates. Plan new 1.5 gameplay only after owner authorization and separate 1.4.2 acceptance resolution.

## Current open engineering questions — not demands for owner architecture choices

- How are banks discovered from Collector↔Receiver links and connected Transporters, and when does one pipe component form multiple bank segments? The PNG indicates intent, not exact coordinates.
- Can route forwarding avoid *physical* custody handoffs, or only repeated routing evaluation? What native Bedrock operation establishes receipt through unloaded or cross-chunk routes?
- How do live Auto seeds and remote/unloaded claim checks constrain shortcut proofs without re-scanning all chests?
- Is an authoritative Bulk identity home network-wide or scoped to verified connected capacity, and how are splits/reconnections reconciled?
- What minimal sharded transaction identity and maintenance fence can coexist with vanilla Hoppers and external inventory writers without a single worldwide bottleneck?
- What physical MR carrier and exact ItemStack endpoints pass the target nonexperimental API and restart tests?

## Repository links and boundaries

- [1.4.2 development closeout](../implementation/BASELINE_142_CLOSEOUT_20261117.md); [active 1.4.2 writer census](URCE_150_ACTIVE_142_WRITER_CENSUS_20261117.md).
- [Current URCE charter](URCE_150_ARCHITECTURE_AND_DELIVERY_PLAN_20261117.md); [routing early-exit ADR-001](URCE_150_EARLY_DECISION_ROUTING_CONTRACT_20261117.md); [owner storage policy ADR-002](URCE_150_OWNER_ROUTING_HOME_AND_OVERFLOW_DECISION_20261117.md).
- [U1 lazy source proof](URCE_150_U1_LAZY_ROUTING_SOURCE_PROOF_20261117.md); [Collector serializer-order NO-GO](URCE_150_U1_COLLECTOR_CAPACITY_FIRST_RESEARCH_20261117.md); [source/owner layout record](../docs/OWNER_LAYOUT_REFERENCE.md).
- **Do not change** `main`, `baseline/native-first-142-20261117`, original gameplay `addon/`, world/production files, protected images, manifests, pack UUIDs, or the frozen #79/#82 source as part of this documentation handoff.

**Bottom line:** Borrow computer networking's **destination/next-hop routing, separation of control and physical forwarding, backpressure, loop protection and safe acknowledgments**; do **not** recreate OSI protocols. Design routing so irrelevant banks do not do storage work, and design custody so skips/hand-offs cannot lose or duplicate items. Controller/region implementation is open to evidence, not an owner-mandated topology.
