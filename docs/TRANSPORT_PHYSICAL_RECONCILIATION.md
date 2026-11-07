# Ordinary physical custody — read-only reconciliation model (after PG-14)

**Status: independent offline pure JavaScript; zero Minecraft world access and no new LAB installation.** User's PG-14 owner-observed screenshots establish one ordinary cobblestone moved with a saved `SETTLED` receipt and survived a **clean server restart**. That bounded pass does *not* establish interrupted transfer atomicity.

## Precisely implemented

[`physical_reconciliation_core.mjs`](../candidates/transport/physical_reconciliation_core.mjs) accepts a previously verified transaction identity, current region/epoch ownership assertion, saved journal entry, and two **complete** 27-slot vanilla chest observations. It returns a fixed classification with all automated mutation permissions set to **false**. The [26 Node test cases](../tests/test_transport_physical_reconciliation.mjs) cover unreadable/unloaded containers, mismatched and stale authority, extra items, metadata-rich items, wrong slot, missing receipt, foreign item, contradictory terminal records, before/after ambiguity, and duplicate observation.

| Recorded phase | Live A source / B destination | Offline classification | Permitted automatic action |
| --- | --- | --- | --- |
| `RESERVED` | A has one plain item; B empty | HOLD_PRE_HANDOFF-equivalent | None |
| `RESERVED` | A empty; B contains one | Reservation/physical mismatch → HOLD | None |
| `HANDOFF_INTENT` | A one; B empty | **HOLD**: possible never-moved operation | **Never retry** |
| `HANDOFF_INTENT` | A empty; B one | **HOLD**: possibly-moved operation | **Never auto-settle or release** |
| `HANDOFF_INTENT` | Both, neither, extra/unknown slots | Conflict/incomplete observation → HOLD | None |
| `SETTLED` | Matching exact eight-field stored receipt, A empty, B one | **OBSERVED_SETTLED**, read-only | None |
| `SETTLED` | Receipt missing/mismatch, A still one, unknown item | HOLD and preserve evidence | None |
| `ABORTED` | Any disposition | HOLD for forensic review; cannot infer custody from phase alone | None |
| Any | Unknown chunk/controller, non-single chest, bad inventory identity | HOLD | None |

The returned `OBSERVED_SETTLED` **does not mean an authenticated exactly-once physical operation**; it means a declared receipt and a present-time vanilla item snapshot agree. It never grants withdrawal, a bank credit, a repeated move, a new durable journal write, or cleanup. The model is intentionally one ordinary item at two dedicated vanilla single chests; it is not a full transport scheduler or Bulk Storage ledger.

## Limits that remain blocking

- A server-reported `minecraft:cobblestone` at a position is **not** a unique physical object ID. If another player swaps indistinguishable cobblestones between observations, ordinary readback cannot detect it. The live adapter must establish exclusive access/custody separately; `authority.exclusive=true` and `metadataFree=true` here are **synthetic test inputs**, not automatically true.
- Two sampled chest snapshots are not an atomic cross-inventory snapshot, and a dynamic-property write is not guaranteed atomic with `Container.moveItem`. A sudden BDS termination may preserve an intent and items inconsistently; this offline model deliberately leaves both "not moved" and "apparently moved" intents in HOLD.
- No custom native MR inventory, Q5 migration, new Transporter/Bulk block, item count virtual bank, physical packing, region/controller election or cross-chunk movement is introduced. PG-03 MR blocker remains.
- Existing PG-08/PG-13/PG-14 LAB installs and rollback archives are not touched. **No owner action is required for this offline core.** The last PG-14 test marker cleanup must be independently confirmed before planning any further owner-side physical test.

## Next engineering gate

If further physical recovery tests are proposed, they must target deliberate interruption **without valuable items**, demonstrate stable server-side exclusive ownership of both involved inventories, prove that an observed `HANDOFF_INTENT` never triggers a second debit after restart, and prescribe an operator-auditable reconcile/repair path for unknown physical outcomes. Until then no automatic transfer recovery or large Bulk-item acceptance is justified.
