# HartLogistics Fresh LAB — Q4 to Unified Custody Migration Strategy (DRAFT)

**Date:** 2026-11-21  
**Planning source:** `fresh-lab` 0.5.7, inspected at `4b4649af6d9d74c853d6ee05a261af7e99f4a926`.  
**Scope:** Source/design planning only. **No gameplay implementation, LAB installation, world mutation, production change, or release authorization.**  
**Destination architecture:** Fresh LAB's native-first routing plus the owner-approved URCE single-authority custody contract. **Do not resurrect Q5 or a FIFO scheduling requirement.**  
**Reference authorities:** `main/docs/UNIFIED_ROUTING_CUSTODY_ENGINE.md`, `main/docs/BASELINE_INGRESS_EGRESS_MATRIX.md`, `main/docs/URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md`, pinned `planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md` at commit `6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2`, and `main/PROJECT_CONTINUITY.md`.

## 1. Readiness finding

The physical infrastructure is sufficient to **plan** migration, but **not** to execute it. Fresh LAB 0.5.7 currently has discovered Hopper/Transporter lanes, linked-bank Collector relays, 200,000-ordinary-item Bulk members, and native MR slot-to-slot transfers with uncertainty fences. The checkout's README expressly keeps hard-stop durability, complete network reconciliation and live BDS acceptance open. These source features are **not** evidence that 0.5.7 is installed or accepted on the owner LAB.

Blocking functional gaps:
1. Fresh LAB has no reader/adopter for original `hartsorter:q2_*`, `q3m_*/q3e_*`, or `q4m_*/q4p_*/q4d_*` data and no compatible original Q4 recovery/cutover logic.
2. Fresh LAB stores Sorter state in `hartlab:s_<dimension>_<x>_<y>_<z>`, Collector links in `hartlab:c_*`, Receiver settings in `hartlab:r_*`; the original registry/link state lives in `hartsorter:registry_v1/v2` and `hartsorter:logistics_v1/v2`. Original world configuration cannot be presumed imported.
3. The owner-requested **independent 250,000-item Collector and Receiver virtual accounts** are not present as working universal accounts in 0.5.7. The original 1.4.1 **Receiver** Q4 alone had a 250,000-item queue capacity; 0.5.7 Bulk has a separate 200,000-item-per-member capacity. Do not conflate them.
4. Source mock routing and journal tests do not prove Bedrock multi-property crash atomicity, externally mutable native inventory receipts, MR hard-stop recovery or full old-world upgrading. Physical route loops/multibank relays and vanilla 1.4.1 parity require further owner LAB proof.

This document establishes migration requirements and staged gates; it does not mark any of the above complete.

## 2. Nonnegotiable invariants

- **Item conservation:** For each independently distinguishable identity, the count/quantity in original authoritative virtual custody plus native source/lane/destination plus new authoritative virtual custody must agree with independently observed deltas. An ambiguous receipt **HOLDS**, never triggers a guessed debit, duplicate credit, auto-refund or replay.
- **Single writer:** Legacy Q4, existing native physical journals, Collector/Receiver/Bulk virtual state and MR native inventories may have only **one accountable custody writer** per logical transfer. Migration cannot leave old and new schedulers independently spending the same balance.
- **No FIFO requirement:** Existing Q4 head/tail/sequence values are migration evidence and recovery identifiers, **not** a promise to preserve dequeue order in the new engine. Items may be grouped only when identity fidelity is provable.
- **Homes before overflow:** Preserve valid standalone Filter → live Auto → Wildcard/Bypass semantics. In governed networks use reachable Filter/live-seeded Auto chests first for claimed cargo, eligible Wildcard/terminal storage for truly unclaimed cargo, then verified appropriate Bulk overflow; never write to Bulk first merely because legacy cargo exists. Do not initiate pointless Bulk churn when Receiver-owned cargo can fill the chest.
- **Exact identity:** Ordinary type-count accounts are for proven lossless plain stacks only. Q4 serializations with names, enchantments, potion variants, durability, unsupported dynamic properties or any opaque identity must remain individually distinguishable or in HOLD until safe native custody/reconstruction is proven. Original native MR ItemStacks stay native; never flatten them into Bulk counts.
- **Location agnostic:** Discover actual block identities, dimensions, original stored references and directed connected paths. **Absolutely no fixed Collector, Receiver, Hopper, Sorter, bank, migration or test coordinates** in gameplay or migration logic. Real detected coordinates may identify real blocks.
- **Never delete old-world data to make an importer pass.** Preserve original pack UUIDs/identifiers, raw legacy props, filter frames, redstone state, links, journals and unknown/unloaded data. Missing evidence is PENDING, not empty.
- **Production protected:** Work on the owner's refreshable copied 1.4.1 LAB only via the separately approved stopped-server guarded process. Nothing in this plan authorizes touching production.

## 3. Read-only legacy census and evidence manifest (M0)

Build a source-only read-only census, without calling the original `loadReceiverQueue()` as a pure read: that function can migrate formats, remove old shards and persist metadata.

Read and inventory:
- `hartsorter:registry_v1`, `hartsorter:registry_v2` plus generation shards; Sorter coordinates, mode, filters, item-frame metadata and any quarantines.
- `hartsorter:logistics_v1`, `hartsorter:logistics_v2`; all Collectors and Receivers, identities, saved links, `queueKey`, present/unloaded status, old Q2 generation/shards, counters and any duplicate/contradictory ownership.
- `hartsorter:q2_*`, `hartsorter:q3m_*`, `hartsorter:q3e_*`, `hartsorter:q4m_*`, `hartsorter:q4p_*`, `hartsorter:q4d_*` for each original `queueKey`. Q4 meta uses `{v:4,h,t,n,q,r,d}`, compact pages of up to 64 entries and definition sidecars. Verify every referenced definition and page, unique sequence, valid quantity, `sum(entry.amount) == q`, and no unexpected orphan property.
- `hartsorter:queue_journal_v1` and `hartsorter:journal_v1`: raw bytes, operation kind, source/destination/slot and ambiguous before/after receipts. **Do not silently run repair or clear any journal.**
- Existing Hopper/chest/entity native inventories, legacy MR at physically inspected loaded boundaries and any Fresh-LAB `hartlab:*` properties that would collide with a resumed/copy-refreshed world.

Emit a bounded, machine-comparable, **read-only migration manifest**: per-Receiver original identity, queueKey, configuration digest, queue type/amount digest, distinguishable item-definition digest, counts by type and MR class, pending journals, unloaded/unknown segments, all property byte hashes and a whole-world summary. Show a human-readable summary without dumping 250,000 entries or secrets. Do not treat `getDynamicPropertyIds()` as proof every relevant physical block is currently loaded.

**M0 PASS:** every readable account independently balances, no missing definition or duplicate Receiver custody identity, all legacy journals are classified clear or unresolved, and all unloaded/unknown blocks remain explicitly pending. Otherwise migration remains HOLD with a precise reason.

## 4. Import configuration without moving cargo (M1)

Implement a one-way, idempotent, shadow importer for original Sorter settings and frame ownership plus Collector→Receiver links. Create candidate `hartlab:*` entries only when the old identity maps unambiguously to the **same actual block** in the **same dimension**, and when there is no contradictory existing new state. Preserve original block modes, filters, orientation, link targets, user-facing interactions, redstone and 1.4.1 native Hopper output/terminal behavior. Unknown/unloaded references are PENDING; never replace with defaults such as Wildcard or an arbitrary adjacent Receiver.

Compare legacy-versus-new configuration checksums and topology/claim behavior. A translated layout, moved bank or non-demo location must work unchanged.

**M1 PASS:** one-to-one verified mappings for all loadable existing Sorters/Collectors/Receivers; legacy saved links and priority behavior preserved; unsupported/unknown entries visible and fenced; original keys untouched. Return a diff before any write.

## 5. Implement new Collector/Receiver virtual custody as a separate prerequisite (M2)

Define explicit **250,000-item capacity per Collector** and **250,000-item capacity per Receiver**, with independent ownership, HELD/STORED distinctions and restart-safe indexed property shards. Use bounded per-property serialization under Bedrock's 32,767-character string limit, checksummed generation/epoch metadata and authoritative sums. Item capacity means quantity, not one JSON entry per item. Native MR requires a different proven carrier/accounting path. Preserve **200,000 ordinary-item capacity per Bulk member** separately.

New arrivals must pass the one-writer fence and charge **exactly one** custodian. Before verified transfer, cargo is owned by its source; after verified transfer it belongs to the target account or final native output. A mere routing proposal, Bulk reservation, or pending journal is not ownership transfer. Expose per-block identity, amount, type and reason via bounded inspection; an unmapped legacy Q4 account is not silently zero.

**M2 PASS:** source-executed bounded storage/overflow/full/backpressure, metadata exclusion, native receipt fault and normal restart tests; BDS proof of account persistence and conservation before enabling migration.

## 6. Preferred migration mechanism — adopt in place, then commit authority (M3)

**Do not physically empty original Receivers into Hoppers, chests or Bulk as a migration technique.** That adds thousands of unnecessary item transactions and exposes native Hopper timing/stall windows.

Preferred migration is per-Receiver and idempotent:
1. **FENCE:** Stop all Hart script custody admissions, drains, recovery-mutators and old/new writers via one maintenance state. Ensure the original pack's old scheduler is not simultaneously running; vanilla/other writers are **not** controlled by the script fence. Maintain native inventory uncertainty as HOLD.
2. **READ:** On the copied 1.4.1 LAB, capture original raw q2/q3/q4, links, queues, journals and manifest without mutation. Any unresolved journal, missing block/definition or unreadable cargo class is a STOP, not permission to default-empty.
3. **PREPARE:** Build verified new Receiver identity and *non-spendable* staged ordinary balances, with exact distinguishable item signatures and explicit nonordinary hold records. Prefer a zero-copy legacy-Q4 compatibility view if moving representation cannot be proved durable; either way, original Q4 remains preserved.
4. **VERIFY:** Compare total and per-identity quantities against independently parsed Q4 rows and original Receiver records, and test safe reconstruction of Q4-represented exceptional items. Verify staged hashes, ownership and link/Sorter config; restart copied LAB and read back both sides **before** any cutover.
5. **CUTOVER:** Write one durable, receiver-scoped authority/epoch decision referring to the validated source/stage digests. The new engine consults this marker *before* any spend. Legacy data becomes sealed/non-spendable but stays archived in-world; no new Q4 writer may run. New account becomes spendable **only** after restart/readback confirms committed marker plus staged balances.
6. **RESUME:** Unfence only verified independent Receiver accounts; allow genuine live homes to receive cargo with chests-first/controlled-Bulk fallback. Leave unknown/ambiguous Receivers HOLD and visible.
7. **RECONCILE:** Check actual native slots and all virtual accounts at each deliberate test checkpoint; retain original Q4 bytes, cutover manifest and reconciliation records until a later separately approved cleanup.

**Crash rule:** Bedrock multi-key dynamic properties and native container edits are not assumed atomic. If staged data, authority epoch, original queue digest or pending receipt disagree after any restart, **stop routing that account**; never choose whichever balance looks more favorable. Separate staging and committed spending with a readback boundary. A post-cutover downgrade to a legacy pack is **not** automatically safe: legacy software could re-spend preserved Q4. Reversal requires a distinct reconciliation/export plan; normal rollback is permissible only before new custody is spendable.

If an in-place legacy-Q4 adapter can be made the **sole** runtime account reader/writer without changing persistence representation, evaluate it against the staged-copy option using transaction count, restart ambiguity and recovery complexity. **Prefer the less destructive proven option**, not a format conversion for its own sake.

## 7. Fault/functional acceptance matrix (M4)

Automated source and fault-injection tests first; then owner-authorized copied-world BDS with inventories counted before/after.

- Empty Q4, partially filled Q4, near-250,000 Q4, mixed q2/q3/q4 and stale-but-valid legacy sidecars; missing/corrupt pages; orphan definitions; duplicate/changed Receiver ownership.
- Original queue `enqueue` or `dequeue` journal pending at each potential persist/native-edit interruption; sorter physical journal pending; native output already moved/refilled; same-type replacement and mixed save domains. HOLD rather than duplicate/recreate.
- All nine original 1.4.1 ingress/egress categories, especially Receiver→immediately-below native Hopper of **any vanilla facing**, onward chains to chest/barrel/shulker, Collector ingress on six faces, redstone, Filter/Auto/Wildcard/Bypass, frames, Dropper/Dispenser and replacement/reload.
- Two independently linked banks plus arbitrary valid rotated/transposed/discovered paths; same-source/multi-bank contention, missing chunks, relink and disconnect; physical loops must not cause endless replay or false destinations.
- Claimed cargo filling partial destination stacks first, ordinary 200K Bulk overflow/refill only when appropriate, independent 250K Collector and Receiver caps, full destination/backpressure and optional terminal Collector. No FIFO-order gate.
- Two same-name differently enchanted books, named/damaged tools, potions and ordinary stacks; exact original native ItemStack fidelity and metadata; unsupported/unreconstructible Q4 item retained in HOLD, not flattened.
- Controlled clean restart at each precommit/commit stage; simulated hard-stop/corrupt/mixed-save cases. Native hard-stop BDS only under an independently reviewed safe plan; source mocks alone do not certify it.
- Preserve 101-column/five-item result parity (505 Sorters, 100 arrivals, exact five-chest distribution) and add actual owner-shape two-bank/full-room runs. Compare VS Debugger, BDS `.mcstats`, Script Profiler `.cpuprofile`, true item conservation, tick responsiveness, native calls and needless journal/transport operations. Current Fresh LAB throughput is bounded by native Hopper timing in Hopper lanes; do not mislabel mock throughput a performance improvement.

**M4 PASS:** zero missing/duplicate identity or quantity, old configurations retained, every original supported route still operational, ambiguous cases fenced, no hardcoded positions, repeatable recovery and actual BDS evidence for declared scope. A permanent HOLD on a formerly valid 1.4.1 route is a compatibility FAIL.

## 8. Release/cutover gates (M5)

1. Create a fresh exact copy/paste of production 1.4.1 world in the approved **disposable LAB** and verify pack/source fingerprint before rehearsal. Do not experiment on real production.
2. Perform read-only M0 report and retain protected original backup plus exact manifest/item counts. Resolve all ambiguities from the source evidence, not by discarding data.
3. Dry-run M1–M3 on LAB; repeat stop/restart/cutover/idempotency and integrity tests, including a second attempted migrator invocation that changes **nothing**.
4. Execute full M4 acceptance and collect player-first BDS performance (block placing/eating during busy routing), native crash/restart and final per-identity conservation.
5. Only after signed-off review and a distinct owner production authorization, plan actual stopped-server upgrade and post-cutover observation. No implicit world switch, no auto-apply or auto-cleanup of Q4 props.

## 9. Implementation order and task completion contract

**Next implementation task (not begun by this planning document):** build the pure, read-only original Q2/Q3/Q4/registry/logistics/journal parser and the **migration manifest/differential fixtures** against the immutable 1.4.1 main source. It must not import the old scheduler or mutate the world. Demonstrate exact count and identity matching on synthetic and approved copied-world data first.

Then configuration bridge (M1), virtual 250K accounts (M2), dual-state authority protocol (M3), fault/real-LAB proof (M4), and eventual owner-gated release (M5). All evidence remains in the existing canonical project evidence register; this draft is a plan, **not** another evidence ledger. Keep future implementation commits separate from production operations.
