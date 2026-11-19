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
