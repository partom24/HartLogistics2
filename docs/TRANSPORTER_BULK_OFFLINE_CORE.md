# Ordinary Transporter + Bulk Storage — executable offline safety core

**Status:** isolated candidate, **not installed or connected to Minecraft**. This work follows the owner-confirmed PG-08 LAB menu/linking GO. The protected original `addon/` 1.4.1 BP/RP files are unchanged. No LAB/production access and no experiment/cheat flags.

## Why this slice exists

Native MR inventory custody for new custom blocks remains unavailable under the no-experiment requirement on stable BDS 1.26.63.1 (PG-03 NO-GO). The ordinary-item Transporter routing and Bulk Storage accounting can advance independently without changing the existing 1.4.1 safe direct MR/Hopper path.

Instead of adding an unfinished custom block, [`ordinary_network_core.mjs`](../candidates/transport/ordinary_network_core.mjs) provides deterministic, pure JavaScript **decision primitives** that can later be adapted to Bedrock after the remaining authority/transaction gates are resolved.

## Implemented candidate contracts (no world mutation)

| Contract | Implemented behavior | Safety boundary |
| --- | --- | --- |
| Six-way graph routing | Only Manhattan-axis-adjacent pipe positions, shortest deterministic paths, no diagonal or phantom loaded/unloaded edge | Entire expected network and membership must be supplied as known; unknown boundaries block |
| Controller authority | Exactly one live current-epoch claim for a local region; cross-region routes held | Does **not** elect controllers, assign durable regions or allow split/merge authority by guess |
| Port direction | Deliberate verified adjacent ordinary container → **Transporter input**; Transporter → **Sorter intake only** | Direct pipe → chest output or HartBots virtual Depot access refused; future runtime must verify actual inventory identities and redstone |
| Bulk capacity | **200,000 individual ordinary items per member**, verified-count accounting and deterministic multi-bank batch planning | MR/unknown/custom metadata excluded; no stack-count approximation or hidden physical storage |
| Routing priority | Verified filtered route, then automatic, then verified Bulk capacity, then wildcard **only after every expected Bulk member is confirmed full** | Missing, stale, unloaded or unknown capacity holds; unavailable filtered destination holds |
| Reservation & ACK model | Unique transaction ID, topology/epoch revalidation, revision fence, all-or-nothing planned reservations, exact receipt matching, duplicate replay idempotence | These are **in-memory pure state transitions**, not durable compare-and-swap, physical item transfer or crash-proof acknowledgment |
| Physical removal | Never report a populated/reserved Bulk member removable | Actual block-breaking, item recovery and split/merge remain unimplemented |

The test suite [`test_transport_bulk_core.mjs`](../tests/test_transport_bulk_core.mjs) runs **27 Node tests**, including 120 deterministic receive-and-acknowledge sequences, capacity limit/partition cases, input/output direction, metadata exclusion, stale authority, duplicate IDs and JavaScript prototype-key edge cases. GitHub Linux CI runs these tests alongside the prior 13 Python authority and seven topology scenarios. These are **offline proofs of code behavior under modeled inputs**, not BDS runtime evidence.

## Explicitly NOT implemented

1. **Actual Minecraft Transporter or Bulk blocks.** No new registration, textures, resource packs, custom block inventory, new script subscriptions, Hopper behavior or world save changes. New block assets must be original and visually distinct from Sorter/Collector/Receiver.
2. **Controller election and durable leases.** The incoming topology snapshot assumes already-proven persistent network/region IDs, complete member discovery and controller claims. Its revision/epoch are **preconditions**; a malicious or stale provider can fabricate them. Never use raw client-provided snapshots as authoritative.
3. **Durable custody.** No journal, on-disk CAS or physical source/destination move. `physicallyVerified: true` in a synthetic receipt is a **test precondition**, not automatic proof that an ItemStack moved. A runtime adapter must obtain authoritative physical acceptance and persist acknowledgment in a crash-safe order before advancing counts.
4. **End-to-end routes to individual Bulk members.** The model verifies a local Transporter path and separately verified bank balances. It does **not** prove a physical path from the chosen pipe endpoint to *each* Bulk bank. That mapping and each destination's reservation/ownership must be checked in any future runtime adaptor before allocating items.
5. **Production-ready classification.** `classification: ordinary`, `losslessIdentity: true`, and `metadataFree: true` must be established by a conservative server-side ItemStack classifier. Unknown custom components default to MR hold. Client input is never authoritative.
6. **Cross-controller and cross-chunk commits**, Sorter integration, real-world redstone, throughput, unload/restart, break evacuation, or receipt recovery. Existing 1.4.1 routes continue to be the only implemented gameplay routes.

## Acceptance and next gates

- **Offline candidate GO:** all 27 real JS unit tests and previous preservation/authority checks pass CI with no `addon/` diff. This means only the pure logic contract is ready for design review.
- **Still open:** exact deterministic first-Bulk controller election, persistent discovery and epoch lease ownership, split/merge inventory custody, verified member→route attachment, physical receipt journal/CAS, and safe full/broken Bulk behavior. See [design inbox](IDEA_INBOX.md) HL-Q-002/003/006/008/010/012. None is silently settled by this code.
- **Next safe unit of work:** implement and fault-test the *durable* reservation/recovery protocol in a standalone candidate with artificial crashes before attaching a single real Sorter/Hopper/Transporter and creating original art. A later **bounded, owner-approved LAB installation** is needed to test actual Bedrock behavior; this offline milestone does not install anything or request a new manual rig.
- **MR remains separate:** PG-03/04/05 and full PG-06/07 Q4→Q5 migration remain blocked, and the 1.4.1 direct-only metadata-rich fallback must not be replaced until native custody is proven.
