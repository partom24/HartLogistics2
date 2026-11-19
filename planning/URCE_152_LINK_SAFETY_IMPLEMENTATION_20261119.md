# URCE 1.5.2 — Bedrock-facing cycle guard source candidate

**Owner authorization:** uninterrupted source-controlled URCE engineering toward playable 1.5; no owner-LAB/world write or release permission granted. The owner's 13 bank storage structure is built but still lacks its Transporters/Receivers/Collectors. Two-bank prior closed link fixture is separate.

## Runtime integration

- New Bedrock-side pure route model and Hopper/Transporter bank observers are generated from reviewed U1 source and loaded as ordinary behavior-pack modules. The 1.5.1 dynamic six-arm 4x4 geometry and visual module are unchanged.
- A live source-only control-plane facade takes current 1.4.2 Collector/Receiver registry records and bounded synchronous getBlock observations, never querying or writing native inventory. Proven managed supply return => REJECT; unavailable/ambiguous => HOLD; a safe known snapshot is only eligible for immediate live caller revalidation, not a physical transfer or durable receipt.
- The Collector->Receiver UI checks a fresh snapshot before save, refuses a loop without modifying previous links, and restores in-memory old link on registry save failure. A new block/register/link event invalidates per-tick guard cache.
- Existing saved links are checked before native Hopper Collector intake, Sorter->Collector queue offer or ejected item-entity queue intake. Receiver Q4 backlog/recovery and its physical drain still use original implementations. Vanilla Hopper/foreign flow is not authoritatively stoppable.
- All seven original 1.4.2 physical and Q4 writer/replay function bodies are source-compared to the pinned 1.5.1 predecessor. U0 direct mutation census now covers all seven behavior-pack scripts; five new U1 modules contain zero recognized native writers.

## Limits and next proof

**Do not call CI a Bedrock acceptance.** A source snapshot cannot guarantee that chunks, foreign scripts and external mechanics never change without a registered player block event. The guard rechecks per tick and invalidates upon player place/break and link/endpoint registration changes, but native BDS event/restart semantics and owner-scale cost remain untested. An installed 1.5.1 predecessor is required by the guarded installer; owner should not manually bypass unknown predecessor refusal.

The owner can begin populating the built 13-bank structure only when an approved safe LAB test iteration is ready. No counted Bulk writer, universal new cargo path or native MR carrier migration is introduced in this candidate. No generic source-graph claim permits item movement; Q4/physical writers preserve their original admission checks. G1 transitive writer census, graph completeness on mixed native endpoints, saved-loop recovery, performance and native in-world acceptance remain open.

## 2026-11-19 performance/safety increment — bounded per-tick topology reuse

After the 1.5.2 initial gameplay candidate, a source review identified a **real growth bug**: the old live guard keyed decisions by an ever-increasing tick but did not discard prior-tick entries. Continuous item routing would therefore retain decisions indefinitely. The corrected guard now clears all link decisions and its observed topology at tick rollover; an explicit mutation invalidation also clears it, and a deliberately forced fresh pre-save check evicts prior same-tick decisions.

For all Collector links checked in one unchanged tick, the guard shares **one** bounded native-Hopper/Transporter observation; subsequent link-specific decisions reuse that read-only graph rather than re-reading the whole network. The same-tick cache is only eligible while the original Collector/Receiver record arrays, all IDs/positions/presence/links, and the stable Bedrock read-provider identity match. In-place edits, changed source provider, a placement/break event, a confirmed link write, or a later tick force re-observation. A source-only regression uses a 13-bank-shaped graph to demonstrate one observation for multiple distinct links in the same tick, bounded memory across 240 ticks, and fail-closed invalidation.

**Remaining limitation:** This is not a replacement for route-aware incremental invalidation under out-of-band/foreign world changes, nor is it a measured BDS TPS/latency proof. The guard still makes one bounded observation per tick with eligible active cargo and an unchanged topology. A true larger-scale performance acceptance requires owner LAB profiling. This does not grant native custody or establish destination capacity.

## 2026-11-19 — Cross-probe native read deduplication

The snapshot now contains a **per-observation** read-through cache shared by the Hopper-facing witness and the Transporter bank component observer. The two observers previously issued overlapping `dimension.getBlock` reads at the same Collector/Receiver positions and adjoining runs; sharing preserves their independent read budgets while eliminating duplicated native Block fetches. The cache key includes dimension and integer XYZ, and records loaded blocks, `undefined` (unavailable), and thrown read errors without recasting unknown into air. Objects are released on snapshot invalidation/tick rollover—no persistent chunk/block cache.

New source-executed tests cover a 13-bank-shaped set, compare real block-reader invocation counts with probe-local reads, and confirm a failed native lookup is still unknown to both consumers. This reduces redundant native calls; it does not certify real BDS tick cost or permit physical transfer without item-home/custody proof. The exact 1.5.2 candidate blob allowlist is repinned.

## 2026-11-19 next LAB testing readiness — quarantining already queued Receiver cargo

**Previously open source gate:** The initial 1.5.2 candidate guarded Hopper/Sorter/entity Collector ingress, but **did not fence items already durably queued in a Receiver** before `processReceiverDrain()` called the protected Q4/native writer. An existing loop could therefore continue to discharge old cargo despite incoming link guards. This was an actionable blocker for a safe owner loop regression.

**Implemented without changing the Q4 writer:** `receiverLinkSafety(receiver)` evaluates each registered incoming Collector link against the current same-tick, native/visual directed safety snapshot. When at least one linked source is `REJECT` (cycle) or `HOLD` (unknown), `processReceiverDrain()` **does not call `dequeueToReceiver()`**, and the native Q4 queue contents, counters and journal remain at their existing custodian. Check happens only when a queue is actually nonempty, and once per drain invocation. An unlinked legacy Receiver preserves the previous drain behavior (a safe snapshot cannot invent a source path for it). This is deliberately conservative for a Receiver with multiple incoming Collectors: Q4 does not prove which one contributed each individual item, so the entire queue is held until all incoming links are safe.

**Player observation:** interacting with a Collector or Receiver now includes `route safety` in the read-only block status: `CYCLE BLOCKED`, `ROUTE HOLD (reason)`, `verified snapshot`, or `no managed source`. This is a **route-state label**, not a per-item HELD count or proof of delivered native custody. No status action changes cargo or saves links.

**Source-executed regression:** actual `main.js` receiver drain function is executed in harness to prove loop and unknown route have **zero native queue debits**, zero cargo movement and unchanged Q4 custody; the valid unlinked receiver still drains, idle queues do not trigger topology scans, multi-source unknown/cycle holds, and status labels distinguish cases.

**Acceptance scope:** These are source and synthetic tests. BDS world-block discovery, unloaded chunks, vanilla Hopper feedback and exact deployed predecessor are not verified here. Blocking [issue #86](https://github.com/partom24/HartLogistics2/issues/86) remains OPEN until the user witnesses actual rejection and custody preservation in copied LAB. Full 13-bank item routing, Bulk custody and 1,400-Sorter load remain beyond this narrow link-safety test.
