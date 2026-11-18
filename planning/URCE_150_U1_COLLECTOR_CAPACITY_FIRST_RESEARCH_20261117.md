# URCE U1 — Collector/Receiver early-capacity research and decision

**Owner request:** Complete the research on early stopping and unnecessary item payload during routing.  
**Date:** November 17, 2026 (owner-local; CI UTC November 18).  
**Scope:** Current 1.4.2 native-first engine, exact gameplay script SHA-256 `2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411`, on isolated `planning/urce-150-20261117`. **SOURCE-ONLY research** — no addon gameplay, manifests, owner LAB/production, or Q4 journal changed.

## Question

Can HartLogistics reject a Collector→Receiver offer using *authoritative* queue-fullness **before** doing the expensive metadata-rich `serializeQueueItem(stack)` round-trip, without changing observable behavior, saved-world writes, migration/HOLD, or direct-only ItemStack handling?

**Answer: Not as a blanket source reorder.** The optimization saves one serialization call for a verified full, queueable item in a source-only model, but provably changes behavior for legitimate rejected/unserializable items when the Receiver queue has never been loaded, has legacy Q2/Q3 data, or has invalid Q4 metadata. There is no generic cheap proof that an arbitrary native ItemStack can safely enter Q4; the present serializer itself performs live component collection and reconstruction validation.

## Exact 1.4.2 call-path facts

| Path | Current order | Earliest proved safe stop |
| --- | --- | --- |
| `sorterCollectorRoute(dest,stack)` (~3121) | Linked Collector → live power → Receiver exists → **serializeQueueItem** → `loadReceiverQueue` (try/catch) → authoritative room → candidate | Skip absent link, power, missing Receiver *before any serialization/queue load*. If item isn't safely serializable, return **without loading or migrating the Receiver queue**. If serialized, load authoritative queue and reject when full |
| `processCollectorIngress` (~3736) | Native input Hopper / block / power → source `firstItem` → per-stack serialization → if queueable, load Q4/room and enqueue; if nonqueueable, load Q4 to confirm **zero** backlog before attempting exact native direct-only transfer | Reject empty/locked/unavailable source early; keep authoritative Q4 read in direct-only path. A stale `receiver.queued` count cannot prove that direct-only cargo may pass |
| `processEjectedItemEntity` (~2299) | Journal fence → verified Dropper/Dispenser route → Receiver → live entity ItemStack → **serializeQueueItem**; if unsupported, leave world item; if supported, `enqueueFromEjectedEntity` checks authoritative Q4 and entity removal is journaled after queue commit | Reject unsupported serialized identity **before enqueue or entity removal**. Queue-first would load/migrate Receiver state for items deliberately left in the world |
| `loadReceiverQueue` (~1729) | Return existing q4 `queueCache` if present; else read Q4 dynamic-property metadata, validate/synchronize Receiver fields, potentially clean old Q3/Q2 shards or migrate legacy Q3/Q2 or initialize an empty Q4 queue | It is **not a pure peek**. `receiver.queued` is not a substitute for loaded authoritative Q4 state; simply hoisting `loadReceiverQueue` adds world-state operations for previously rejected cargo |
| `serializeQueueItem` (~1904) | Check nonstackable eligibility → gather native name/lore/enchantments/durability/dye/potion/canDestroy/canPlaceOn/dynamic props → rebuild one ItemStack → compare native compatibility or strict nonstackable fingerprint → bound encoded metadata | Unsafe native ItemStack cannot be declared serializable from `typeId`/quantity alone. Current serializer's early checks already reject common unsupported nonstackables |

There is also a second Q4 load in the committed `enqueueFromSource` writer; the current q4 `queueCache` path can reuse the validated queue, **but it does not turn the routing preflight into a durable physical receipt**.

## Executable proof and counterexamples

[Native-shaped source execution suite](tests/urce_collector_capacity_order_142.test.mjs) extracts and executes the **actual** 1.4.2 `sorterCollectorRoute`, `loadReceiverQueue`, `processCollectorIngress`, `processEjectedItemEntity`, and `serializeQueueItem` function bodies. The proposed capacity-first `sorterCollectorRoute` is created by a guarded source replacement **in test memory only**; functions use explicit modeled Bedrock API edges, authoritative Q4 metadata/legacy effects and serialized item identity.

| Case | Existing serialization-first | Capacity-first counterfactual | Decision |
| --- | --- | --- | --- |
| Valid authoritative full Q4 + queueable cargo | Serialize, load Q4, reject | Load Q4, reject **without serializer** | **Possible work saved**, same final routing result in the modeled case; no BDS timing measurement |
| Near-full Q4 + valid cargo | Serialize → load → positive room | Load → serialize → positive room | Same candidate result; ordering differs; no demonstrated normal-path improvement |
| Unqueueable metadata / item, even if Q4 valid | Reject **without Q4 load** | Read Q4 and possibly synchronize Receiver | **Different side effects**, not general-equivalent |
| Unqueueable item + old Q3/Q2 | Reject with **no migration** | May migrate, clean legacy shards, update registry | **NO-GO**, can mutate saved-world state for cargo that will never enter Q4 |
| Unqueueable item + unreadable/corrupt Q4 | Reject without loading/logging Q4 error | Load, catch/log corrupted queue | **Different failure behavior**; does not preserve existing fail-closed boundary |
| Valid queueable cargo + invalid Q4 | Serialize then log/read failure | Read/log failure without serialization | Same rejection, different work/call order; does not prove safety for all cargo |
| Full `queueCache` entry | Serialize then cached Q4 rejection | Cached rejection, no serializer | Only an existing cache-path model; **not** proof of fresh external-write authority or new durable commit identity |
| Nonqueueable Collector direct-only cargo | Confirm authoritative queue total **zero** before exact physical transfer | A generic queue-full preflight cannot certify safe direct-only movement | **Must preserve existing zero-backlog fence and journal** |
| Nonqueueable Dropper/Dispenser entity | Leave item entity in world, no enqueue/removal | Early queue loading is extra work/state mutation for rejected item | **Keep existing identity gate first** |

The suite also directly executes the native-shaped actual serializer, showing its native property collection, rebuild and compatibility checks; and executes actual direct-Collector/ejected-item guards for zero backlog, backlog, unreadable queue and unsupported world-owned items. Synthetic exceptions and storage hooks are **models**, not BDS atomicity proofs.

## Gate decision

**NO-GO — unconditional capacity-first reorder** across the Sorter→Collector route. It cannot preserve the original invariant that unqueueable cargo does *not* initialize/migrate/clean a Receiver queue. No Q4, source debit, direct-only path, item-entity ownership, or journal writer may be changed merely to skip one serializer.

**NO-GO — `receiver.queued` quick rejection, new full-queue cache, external chest-capacity cache or Q4 rollback guess.** A stored count alone cannot resolve native live identity, persistent journal ambiguity, external changes or old queue metadata. An additional capacity/eligibility state machine would itself need full migration/recovery proof and should not enter 1.4.2.

**No proven general cheaper `serializeQueueItem` precheck.** A `maxAmount` or known-item-type whitelist is not a lossless ItemStack identity proof. The existing serializer already short-circuits unsupported nonstackables, and unknown/custom items must stay protected.

**Existing ordering accepted for present architecture:** link/power/Receiver check → safe metadata round-trip → authoritative Q4 load/room → existing custody write. This is an *engineering stop decision*, not a declaration that serialization is cheap. The amount of BDS time actually spent in serialization has not been isolated or measured against Receiver fullness; the gain case remains a theoretical conditional optimization.

## Relationship to earlier U1 routing evidence

[U1 lazy candidate differential](URCE_150_U1_LAZY_ROUTING_SOURCE_PROOF_20261117.md) already found:
- Simple lazy Filter/Auto/Wildcard rewrite **NO-GO**: more live Sorter block checks in many cases and **zero fewer native destination slot reads**.
- Fresh native Block reuse **source-model candidate only**: fewer `sorterAt` calls in aggregate, but no reduction in the dominant `findAcceptSlot`/native `getSlot` work, two individual mixed regressions, and unresolved real BDS Block validity/Collector registration timing.
- P4g's owner active-routing profile had no demonstrated certified negative-rejection reuse. Do **not** resurrect cross-tick chest capacity bookkeeping.

**U1 conclusion:** We have completed the *source-only first-principles early-decision research*. The current 1.4.2 code already rejects several routes at the earliest safe policy/identity boundary. The remaining expensive checks either require live native capacity or an authoritative Q4 state and cannot be safely elided by simple reordering. Resist a large new URCE planner whose only validated effect is fewer cheap JS operations.

## Next URCE planning priority (not authorized gameplay)

Proceed to **U0/U2 authority and custody**: finish the complete active 1.4.2 writer/side-effect census; specify region/configuration candidate eligibility without conflating topology with chest fullness; and prove the native metadata-rich and Q4 migration/receipt/HOLD boundaries **before** integrating new 1.5 writers. Develop source-only fault tests for restart, queue journal, player/Hopper interleavings and unknown regions. The prior 1.5 skeleton may inform interfaces but frozen #79/#82 and Q5 runtime should not be merged.

**LAB validation still open:** any same-attempt Block handoff needs native BDS confirmation; no native timing or owner-world workload was measured here. The 1.4.2 protected baseline and production installation remain unchanged.
