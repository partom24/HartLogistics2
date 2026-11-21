# Migration plan: HartLogistics 1.4.1 → Fresh LAB 0.5.7

**State:** DRAFT / PLANNING ONLY — 2026-11-21  
**Target runtime:** The actual `fresh-lab` **0.5.7** engine. **NOT URCE or Q5.**  
**Origin:** Existing 1.4.1 player world, native inventories, Sorter filters/settings, Collector/Receiver links and per-Receiver Q2/Q3/Q4 stored queues.  
**Scope:** Document the upgrade, prerequisite implementation, and acceptance gates; no world or pack has been changed by this document.  
**Supersedes:** `docs/Q4_TO_URCE_MIGRATION_STRATEGY_20261121.md` (incorrect target architecture).  
**Owner direction:** If an existing Receiver's Q4 balance or new intake requires more custody during draining, Collector/Receiver **virtual capacity may grow dynamically** as needed. Do not make Bulk Storage a prerequisite.

## 1. Actual baseline / target

### Legacy 1.4.1
- **No Bulk Storage blocks or Bulk inventories exist to import.**
- The original **Receiver** has a **250,000-item Q4** virtual queue, with older Q2/Q3 formats and queue journal requiring compatibility. The original Collector does **not** have an equivalent 250,000-item virtual account.
- Original saved Sorter registry / filters, frame settings, links and Receiver identities are persisted in `hartsorter:*` dynamic properties; items may also be in actual Hopper/chest/native slots.
- The original 1.4.1 source in `main/addon/behavior_pack/scripts/main.js` contains reading/migrating Q2/Q3/Q4 and queues, but `loadReceiverQueue()` **is not read-only**: it can repair/migrate/delete old properties. A migration census must use a separate read-only parser.

### Fresh LAB 0.5.7 (source inspection at `fresh-lab` commit `4b4649af6d9d74c853d6ee05a261af7e99f4a926`)
- Actual routing uses discovered Hopper lanes or connected Transporter networks, native endpoint destinations, bank relays and native MR moves. Its five-slot Collector relay buffer is a native entity inventory, **not** a 250,000-item virtual account.
- Fresh 0.5.7 has **200,000 ordinary-item Bulk** members if newly placed, but **no old-world Bulk exists** and ordinary Bulk is optional.
- Fresh 0.5.7 does **not** implement a legacy Q4 importer or general expandable per-Collector/per-Receiver virtual custody/drain adapter today. Those are **prerequisites**, not accepted features.
- Current mock/source tests are not evidence that the exact 0.5.7 code is installed or BDS migration-accepted. Hard-stop/dual-save-domain reliability remains open.

## 2. Immediate hard blocker — installed pack identity / property namespace

Actual repository manifests differ:

| Manifest | Original 1.4.1 header UUID | Fresh LAB 0.5.7 header UUID |
| --- | --- | --- |
| Behavior Pack | `4854d263-05dd-4f79-a21c-7ba969295c2d` | `f450bff5-6b68-42e5-a07d-616f87c01918` |
| Resource Pack | `91316442-0f26-4fbb-88f3-2e39ea843a1a` | `39f2d6c6-9b79-4754-a2e2-fd27c1ec1d63` |

World dynamic properties are scoped by the **Behavior Pack header UUID**. Therefore an unchanged Fresh 0.5.7 pack is **not** automatically authorized to read `hartsorter:*` properties written under the original 1.4.1 UUID. Same block identifiers do **not** solve dynamic-property namespace isolation. This is a release-stopping migration concern, not an ordinary missing function.

**Preferred strategy:** Make a **migration-compatible deployment derivative of the 0.5.7 engine** under the original 1.4.1 Behavior Pack header UUID, with a manifest version **higher than 1.4.1** and exact validated world BP/RP registrations. Preserve and test original Resource Pack identity as well when it is required for world activation and player assets. **0.5.7 is the engine/code target** even if the Bedrock manifest must use a distinct upgrade-compatible version. Do not simply relabel an existing 0.5.7 manifest without migration-specific proof. No other add-on may share that header UUID.

Alternative only after source/BDS proof: run a one-time controlled bridge under the original namespace and transfer a verified manifest to the new namespace through a proven secure channel. Do **not** start both full old/new routing schedulers simultaneously, assume cross-pack dynamic-property access, or patch the production world's LevelDB as a shortcut. Choose one strategy before implementing importer.

**P0 PASS:** On a copied 1.4.1 LAB world with BDS stopped for install, verified versioned candidate loads old saved properties *without writing to them*, original custom blocks remain valid, exactly one engine is active, and pack activation/rollback match guard checks. No assumption of success from merely matching code-level `hartsorter:*` strings.

## 3. Conservation and routing requirements

1. **No missing, duplicated or flattened items**: count separately by type and metadata-relevant identity, and reconcile original Q4, native items, new virtual custody and final chests. Unknown/unfinished journal means HOLD.
2. **No required Bulk**: migration must work with **zero Bulk blocks** and never summon/create Bulk as an upgrade side effect. Later player-placed Bulk may be used under 0.5.7's proven normal routing policy.
3. **Do not physically empty Q4 merely to convert formats.** Prefer a staged, read-through old Q4 ledger or a verified non-spendable copy into a new account. Native Hoppers should run only for a legitimate routed delivery.
4. **No FIFO requirement**: original Q4 sequence/page identifiers remain essential audit/recovery facts, not ordering requirements for the new scheduler.
5. **Use actual placed block identities and graph**, not hardcoded positions or demonstration rigs. Upgrade already-built Hopper, Sorter, Collector and Receiver topology. A dead-end or unknown path is HOLD, not a false receipt or forced rewire.
6. **One spendable owner per item**. Original Q4 and new virtual balances must never both authorize spending the same cargo. Route plans, reservations or journal intents are not receipts.
7. **Normal home policy governs draining**: valid Filter and live-seeded Auto destinations first for claimed cargo, applicable Wildcard/optional other authorized outputs under 0.5.7 rules; check live partial-stack capacity, redstone and path. No destination means hold at the current authoritative owner. Bulk cannot be presumed available.
8. **Preserve metadata**: Q4 can hold serialized item definitions, but not every native ItemStack attribute is necessarily reconstructible. Verify each Q4 item class; if it cannot be materialized with identity fidelity, quarantine and expose an inspect/retrieve path rather than flattening or discarding it. Fresh 0.5.7's existing native MR transfer handles actual native stacks, not automatically old serialized Q4 definitions.
9. **No destructive downgrade after cutover**. Keeping original Q4 bytes for audit does not make an old 1.4.1 scheduler safe to reinstall after 0.5.7 spending has begun. Rollback requires an explicit balance reversal/export/reconciliation, or restoring the untouched pre-upgrade world snapshot.

## 4. Dynamic Collector / Receiver capacity during migration

The owner explicitly authorizes **dynamic expansion** to accommodate migration draining. Implement it as durable **logical custody capacity** rather than an unlimited Minecraft container or an unbounded single JSON property.

- Every legacy Receiver starts with enough recognized capacity for its **entire verified outstanding Q4 amount**, even if close to 250,000. Every Collector starts with the capacity needed for its verified own deposits / legitimate incoming relays; do **not** invent legacy Collector balances that were never stored in 1.4.1.
- When a verified intake/relay cannot be serviced immediately, **grow the owning Collector or Receiver account before admitting it**. The new authorized capacity must cover old owned amount + the intended newly accepted quantity + already outstanding reservations. If expansion or persisted accounting fails, stop intake/backpressure **without removing cargo from its source**.
- Use bounded sharded dynamic properties and durable generation/epoch metadata, checksum/total validation, per-account high-water marks and source/destination receipts. One Bedrock string property is limited, and increasing a numeric capacity field does not increase Bedrock's persistence limits. Expansion must prove actual readable/writable shard capacity and safe recovery.
- Choose a minimum-reserved capacity from verified present and committed quantities, **not** a global fixed 250k ceiling. A Collector may have no virtual cargo. A Receiver with 240k preserved and another accepted 30k may safely own 270k only after a proved 30k custody credit; never claim those extra 30k from a counter alone.
- As destinations drain, retain the accounting needed for crash recovery. Reclaim unused shards or lower a logical allocation only when nothing references them, after proof. Capacity may remain at high-water mark if that is simpler. Whether unlimited-by-policy expansion remains a general 0.5.7 feature after migration is a separate product decision; migration must never depend on automatic shrinking.
- **No double-capacity credit**: a legacy Q4 amount and its staged copy constitute **one** account's items. Show `legacy backed`, `staged unspendable`, and `new authoritative` separately from actual quantity.

## 5. Proposed execution phases

### P0 — Pack identity / copied-world compatibility gate
Verify old vs new UUIDs, on-disk registrations, new version and block identifier survival. Create a future upgrade-compatible 0.5.7 build only after source/offline tests. Ensure old routing script is never running alongside the new routing engine. LAB only; production is protected.

### P1 — Read-only 1.4.1 census
Parse original registry, logistics, original Collector/Receiver link identities, each Receiver's Q2/Q3/Q4 shards/pages/definitions and all `hartsorter:journal_v1` / `hartsorter:queue_journal_v1` pending entries. Produce per-Receiver item-type and distinct metadata identities, totals and raw content hashes; inventory native Hopper/chest sources separately on loaded blocks. Treat unloaded/missing/corrupt as UNKNOWN/PENDING, never zero. Census must not trigger legacy repair writes.

### P2 — Config/physical topology reconciliation
Map existing settings and linked block identities into 0.5.7's `hartlab:s_*`, `hartlab:c_*`, `hartlab:r_*` schema on exact current block positions and dimensions, with idempotent checksums and no defaults replacing existing Filter/Auto/Wildcard/Bypass. Discover native placed Hopper/output paths and any new Transporters without coordinates assumed. Compare original vs new observed behavior before enabling cargo writers.

### P3 — Add real expandable Collector/Receiver custody and Q4 drain adapter
Implement the durable per-block virtual accounts and a **single** writer/reader for legacy-backed balances. Prepare one account's migrated quantities as **unspendable** or use an exact read-through Q4 compatibility store. Verify types, amounts, per-entry distinction and original journal outcomes. Commit a single accountable authority switch with a safe stopped/restart readback checkpoint before the new engine spends; original state stays archived and fenced. Implement 0.5.7 egress:
- Receiver/Collector logical cargo → verified native final destination on Transporter route where existing endpoint transfer model is safe;
- or Receiver/Collector logical cargo → actual native Hopper ingress with journal/proven receipt on Hopper routes, then vanilla Hopper transfer under normal mechanics.
Do not claim the current 0.5.7 physical source-only adapter already performs virtual Q4 egress. No blind Hopper flood; HOLD on full, powered, unavailable, missing claim or ambiguous journal. The Q4 buffer is not a Bulk replacement or required Collector-to-Receiver round trip.

### P4 — Controlled draining and observation
After independently proven cutover, gradually resume per-bank 0.5.7 dispatch. Favor actual final storage, avoid needless interbank movement, and honor naturally limited Hopper throughput. Expand Collector/Receiver capacity **only for genuinely admitted additional custody**. Keep normal native physical movement, Bulk optional and independent. Expose per-block `legacy remaining`, `new held`, `in flight`, `delivered`, `capacity/high-water`, `HOLD reason`, and `unresolved journals`; do not double-count.

### P5 — Acceptance and owner-authorized production cutover
Pass source tests, failpoint/restart tests, and owner-approved copied-world BDS checks for:
- 0 Bulk Storage; existing Sorter filters, frames, Auto seeds and saved links;
- empty, part-full and near-250k Q4 Receivers; many item kinds; growth beyond 250k; no fixed locations;
- actual Hopper and Transporter lanes, multiple linked banks, redstone/power, partial/full destinations, chunk unload, arbitrary player layout;
- mixed native MR and legacy serialized Q4 item classes; strict matching identity and no hidden flattening;
- interrupted source debit/destination credit/virtual credit, restart/corrupt page/recovery HOLD, re-run migration idempotence;
- full inventory/source/holding/output conservation, actual BDS diagnostic and Script Profiler timings and ordinary player responsiveness;
- original 1.4.1 ingress/egress parity and real copied-world block/pack activation; no permanent HOLD on routes that previously worked.

Actual production is separate and requires an explicitly approved verified backup, exact pinned upgrade candidate, stopped-server preflight, owner authorization and an independent recovery/cutover plan.

## 6. Immediate implementation recommendation

**First implement P0 identity compatibility verification and P1 read-only census together, with pure offline fixtures.** They determine whether the old world's actual Q4 state can be read under the target 0.5.7 engine and what bounded storage representation is required. Then implement P2 config import and P3 expandable custody. Do not introduce a second standalone engine, URCE layers, Q5, hardcoded coordinates, obligatory Bulk blocks or tests that move production items merely to inspect legacy state.

**Definition of done for this plan:** A 1.4.1 world can load the 0.5.7 engine (compatible upgrade build), keep every block/filter/link/item, let existing Q4-owned contents drain into legitimate destinations as routes permit, and safely retain any leftovers in expandable Collector/Receiver accounts when full/unavailable. Every remaining item has one discoverable owner, and no unverified transfer duplicates or destroys cargo.
