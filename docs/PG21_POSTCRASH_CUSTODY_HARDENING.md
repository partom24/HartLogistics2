# PG-21 — Physical custody hardening after automatic player rollback (source-only)

**Status: DESIGN + OFFLINE NON-MUTATING ACCOUNTING MODEL. Not a LAB gameplay candidate, not a release, not an actual world repair.**

## Why this work exists

The owner tested the deployed **1.5.5-LAB-PG20** on BDS 1.26.63.1, with a redstone-delayed input Hopper holding **256 cobblestone + one enchanted book**. The owner emergency-killed BDS and later explicitly confirmed **all five test stacks reappeared automatically in their player inventory upon rejoining**, without manual removal. This is **HL-E-057, owner-confirmed earlier-save rollback behavior**. It is not an intentionally implemented Hart Logistics fall-back. The kill timing relative to journal writes, physical moves, and durable flushes is not known. No added copy in the source chest, Receiver Q4 or another target can be ruled out from the player inventory alone.

A separate follow-up test used **more redstone repeaters** and a **normal restart**, not an emergency kill. In this run the **output Hopper** visibly held four full cobblestone stacks plus an enchanted book, the **input Hopper** was empty, and `/hartlogistics:status` showed `1.5.5-LAB-PG20` with **sorter clear / queue clear**. This is **HL-E-058: scoped mixed-cargo normal-restart PASS**, not an abrupt-crash persistence guarantee. The second run's screenshot did not show the book tooltip; the earlier independent HL-E-052 single-book test did show Protection I.

## The crash-consistency problem to solve

A full accounting boundary for these tests includes **five distinct physical/logical domains**, each of which may be persisted or observed at a different time:

1. **Player inventory**, separately saved and potentially rolled back.
2. **Feeding chest**, which can contain items before they enter the transfer Hopper.
3. **Collector input Hopper**, which vanilla and third-party writers can access.
4. **Receiver output Hopper**, where the original native `ItemStack` should land.
5. **Linked Receiver Q4**, where ordinary cobblestone may be represented as a persisted queued quantity instead of a live physical stack.

Additionally the **physical sorter journal** and **queue journal** are separate persistence records. One status line reading `clear` after restart means there is no presently *readable pending journal*, not that any of the five domains and two journals shared one atomic flush.

### Demonstrated limitation in PG-20

The PG20 derived direct-only code reads the source item, writes a world-property intent, checks immediate readback, runs one `Container.moveItem`, checks source/destination immediate state, and clears the journal. That prevents *old lossy JSON item reconstruction* and avoids speculative retry on pending opaque intents. **It does not authenticate an exclusive writer or make `world.setDynamicProperty` crash-atomic with Hopper and player inventory saves.** The last favorable BDS rollback could occur entirely before PG20's transfer began.

Vanilla Hopper slots are **not** physically sealed from a player, Minecraft's Hopper mechanics, other scripts, or the host. An item tooltip/fingerprint can compare visible properties but cannot authenticate opaque third-party component provenance or identity of a stackable item. Even a 257-item count after a forced crash could be a mixture of pre- and post-flush state across domains.

## New conservative contract implemented

[crash_origin_reconciliation.mjs](../candidates/transport/crash_origin_reconciliation.mjs) and [tests](../tests/test_crash_origin_reconciliation.mjs) are a **read-only, pure Node model**. They never touch Minecraft, mutate items, clear journals, authorize replay, reconstruct an enchanted book, release capacity or grant production approval.

- Accepts **explicit expected counts** and a post-restart observation for *each* player/chest/input Hopper/output Hopper/Receiver Q4 domain, with independent `sorter` and `queue` status.
- If any domain (especially the linked Receiver Q4) is **not inspected**, returns **INDETERMINATE**, even when all 257 items visibly reappeared in player inventory. **Unknown is never coerced to zero.**
- With **complete known observations**, a count above 257 returns **HOLD / apparent duplicate**; below 257 **HOLD / apparent missing**. Visible book metadata mismatch also **HOLD**. Any PENDING journal **HOLD**, and unreadable journal **INDETERMINATE**.
- Only if every domain has been accounted for, both journals clear, source destinations empty, and player inventory contains all 257 automatically after an abrupt restart does it return **ROLLBACK_CONSISTENT**; the output is explicitly **EVIDENCE_ONLY**. A fully accounted 257-item transfer after a **normal** restart is **DELIVERY_CONSISTENT**, again **EVIDENCE_ONLY**.
- An observed split across domains whose item counts sum to 257 is **ACCOUNTED_BUT_UNPROVEN** because type/count does not uniquely establish physical provenance.
- **All verdicts** carry `canTransfer=false`, `canRetry=false`, `canSettle=false`, `canClearJournal=false`, `canCreateItem=false`, `canReleaseCapacity=false`, and `productionApproved=false`.

The actual owner crash observation is embedded as `OWNER_PG20_CRASH_REPORT` with **the player's auto-return confirmed**, but **feeding chest and linked Receiver Q4 unexamined**. Its classification **must remain INDETERMINATE**. This is a deliberate correction against declaring a crash-atomic PASS from favorable partial evidence.

## Priority engineering plan before another gameplay candidate

**A. Stronger source admission, not faster replay.** Require an enforceable single-writer physical inventory boundary and a demonstrable live controller/epoch fence before moving objects into new Q5, Bulk or multi-controller banks. No regular user-accessible chest or Hopper can be assumed exclusive by a config flag or a script readback.

**B. Complete domain accounting.** Keep player/chest/input/output/Q4 location observations separate and versioned. Never infer that a world rollback restored all of them as a unit. Distinguish the *owner's reported saved-world snapshot* from an actual PG20 journal recovery operation.

**C. Preserve opaque native items in place.** Continue whole-stack native transfers only under known-safe shape; never turn an unknown enchanted book into a serialized replacement or manually create a compensation book. On ambiguous state, **HOLD with a report**. A forensic read-only auditor must not itself touch the pending physical journal or inventory.

**D. Durable transaction/fencing proof.** PG16 source-level counterexamples and PG18 controller-region arbitration show why ordinary player-writeable vanilla inventory plus world dynamic property can't yet prove true exclusive/atomic custody. Identify a *documented, stable, non-experimental* engine primitive that really enforces both exclusivity and save consistency, **or keep the new permanent high-capacity physical custody lanes BLOCKED**. No number of repeat emergency kills substitutes for that contract.

**E. Operational fall-back.** An earlier Bedrock save rollback may be useful in some failures, but Hart Logistics must never rely on it for exactly-once semantics. The default on unresolved intent stays **HOLD/no replay/no clear**, not silently treating `player restored` as an acknowledged committed transfer.

## Evidence and authorization

- **HL-E-059 (OFFLINE ONLY):** new mixed-domain rollback-vs-atomicity source model and deterministic test matrix, added to CI after PG20 owner evidence. This does not promote the crash experiment to a pass.
- **Existing accepted behavior remains**: HL-E-052 scoped normal-restart Protection I and HL-E-058 mixed-cargo normal-restart tests. Do **not** ask the owner to rerun them.
- **Not included:** new behavior/resource pack, custom block, world data, JavaScript gameplay patch, BDS process interaction, automatic backup/restore, production change, experiments, or a new physical custody permit.
- **Future decision:** a new LAB gameplay candidate requires a concrete and independently tested custody mechanism, not just more post-hoc accounting. Keep original 72-file `addon/` 1.4.1 immutable.
