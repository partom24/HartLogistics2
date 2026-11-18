# URCE-ADR-003 — Transporter is human-readable network infrastructure, not a required item conveyor

**Owner decision:** 2026-11-18, continuation of P4→URCE batching/playability review.  
**Status:** **OWNER-ACCEPTED PRODUCT INTENT / PLANNING ONLY**. No gameplay code, native transfer endpoint, BDS test, deployment or release authorized by this record.  
**Priority:** Later owner clarification supersedes earlier descriptions of a Transporter block primarily as a "high-throughput pipe" or requiring every item to physically traverse the pipe.  
**Related:** [owner 1.5 contract](URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md), [batching and BDS capture](URCE_150_TRANSPORTER_BATCHING_BDS_CAPTURE_EVIDENCE_20261118.md), [pre-code gates](URCE_150_PRECODE_READINESS_AND_PROOF_GATES_20261118.md), [network routing handoff](URCE_150_OSI_MULTIBANK_ROUTING_HANDOFF_20261118.md).

## Exact owner clarification

> "the transporters’ *real* purpose is to build a storage network infrastructure. It is totally possible to move items and they never actually transit through a transporter. Its main purpose is to make the system relatable and understandable to humans that did not develop the product."

## Binding interpretation

1. **Visible network infrastructure / legibility first.** Players physically place Transporters to express an understandable connection/topology between storage and routing components. A non-developer should be able to look at the layout and reasonably understand which parts are connected, how banks join, and where movement is plausible. Transporters are not merely decorative: their validated configuration contributes to the engine's *directed logical reachability graph*.
2. **Connectivity ≠ physical custody traversal.** A valid Transporter path is **evidence of intended and verified logical reachability**, not an instruction to place an ItemStack into every pipe block or advance it one block per tick. URCE may choose a verified source→destination operation whose actual inventory/custody endpoints are separated by many Transporters; an item may **never reside in or transit through any Transporter block**. Do not create mandatory per-block queues, virtual item positions, journals, or writes solely to animate packet movement.
3. **Routing/custody remains authoritative.** Before movement, choose a verified eligible home (Filter→live Auto/conditional Bulk/Wildcard/optional terminal Collector), check direction, reachability, power, and applicable path rules; then require **native admission and durable custody safety** at the *real* source/destination and any genuinely necessary intermediate ownership boundaries. A visible connected pipe does **not** certify that a distant unloaded/invalid endpoint can be mutated, nor eliminate a native Hopper/Collector–Receiver custody handoff when physics or APIs require one. Unknown conditions HOLD; no speculative teleportation or invented atomic transaction/ACK.
4. **Performance benefit belongs to URCE, not pipe animation.** The larger-transfer and shorter-burst-load objectives come from *engine decision-making and legally supported endpoint movements*. The Transporter can enable an alternative logical network path that does not inherit vanilla Hopper-per-hop motion, but we must **prove** the native transaction and persistence model rather than assume every Transporter itself is a fast item mover.
5. **Vanilla Hoppers remain actual native transport and valid connections**, with their real timing and native movement semantics unchanged. Players can use Hopper-only paths, Transporter paths, Collector–Receiver links and combinations when safely supported. Preserve existing 1.4.2 standalone behavior and redstone/Sorter intake guarantees. Transporters cannot bypass Filter/Auto admission or write directly into ordinary output chests.
6. **No forced mechanism or extra subsystem.** A Transporter does not require a native inventory, per-block buffer, repeated "tick forwarding", arbitrary item-routing metadata, physics animation, fixed 16/32/64 capacity, or literal OSI packet stack. If later engineering needs a specific buffer at a real physical handoff, that is a separate proven custody endpoint, not a universal property of every pipe segment. Visual assets are unique to Transporter, as already accepted.

## Concrete acceptance models

| Owner-shape scenario | Correct behavior |
| --- | --- |
| Receiver A connected logically through 30 Transporter blocks to reachable matching Sorter | Route can be selected through validated topology; **0 mandatory per-Transporter item custody states**; only actual proved endpoint/necessary handoff writes |
| Same endpoints connected through 2 Transporters | Same routing/custody policy; avoid per-segment transaction scaling unless the native implementation genuinely requires physical boundaries |
| Transporter segment removed/broken/powered in a way that invalidates a route | Invalidate reachability; do not move an item into a no-longer-reachable home; HOLD safely until reverified |
| A link would create a directed loop | Reject managed link / exclude unsafe path; same network is okay when no directed cycle exists |
| Connected layout but destination full/unloaded/unknown or no eligible home | No speculative movement; item remains with authoritative custodian |
| Native Hopper-only leg is unavoidable | Preserve actual native Hopper progression; do not claim virtual Transporter topology accelerates that Hopper |
| Item moves from native source to valid endpoint without visiting the visible Transporter blocks | **Expected and valid** if all routing, admission and custody proofs are met |
| Nondeveloper inspects built network | Distinguishable Transporter visual topology and understandable connection behavior; no hidden requirement that every segment holds items |

## Engineering questions—not missing owner decisions

- Which block orientations, adjacency/connection masks, Collector–Receiver links, redstone controls and loaded-state checks are sufficient to establish the *observable* directed graph? Do not infer a valid connection from appearance alone.
- Which native API can move exactly the authorized quantity between real endpoints (possibly across chunks), and how do source debit, destination receipt, saved state, conflicts and recovery remain safe? Existing Container.moveItem/transferItem signatures and custom-block inventory experiments are not sufficient proof.
- How to invalidate cached routes when Transporters are placed/broken without expensive world scans, and handle unloaded endpoints without inventing graph completion?
- Which topology/connection information should be visible in the block UI to make the infrastructure intuitive, while preserving the already approved lightweight paginated storage browser?
- How does one measure cost-per-useful-item against path length, without adding a per-segment execution cost or mixing native Hopper travel with URCE logical-path delivery?

## Implementation boundary

**Product behavior is settled.** A candidate architecture may keep Transporters as **topology-only components** and move items directly between physical custody endpoints where safe. It must not assert a native cross-chunk or nonexperimental MR endpoint is available until demonstrated on the exact owner BDS. The pre-code U0/U1/U2/U3 proof gates and separate implementation/LAB/release authorizations still apply.
