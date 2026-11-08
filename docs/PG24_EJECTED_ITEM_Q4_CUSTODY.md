# PG-24 — Q4 ejected-item entity custody readback and conservative recovery

**State:** derived `1.5.7-LAB-PG24` candidate under offline verification; **not installed** in LAB, not authorized for production and not a proven crash-atomic writer.

## Source hazard (HL-E-064)

The frozen 1.4.1 code retained through PG23 has a historical Q4 `entity_enqueue` journal, used when an ordinary vanilla Dropper or Dispenser ejects a `minecraft:item` into a linked Collector. Normal execution follows:

1. Write Q4 journal; persist affected queue entry and metadata.
2. Remove the exact spawned item entity using `entity.remove()`.
3. Clear the Q4 journal.

On recovery, `recoverQueueJournal()` first evaluates the Q4 state; if the Q4 queue is classified **after**, the code attempts to look up `world.getEntity(tx.entityId)`. If the entity cannot be resolved and the original source chunk is loaded, the old code **clears the pending journal**, treating absence as proof that removal already completed. However, in the original world save/recovery context **an absent entity is not authenticated evidence of completed item removal**: it could have been picked up by a player, moved/unloaded, despawned, removed by another add-on, or persisted at a different save cutpoint than world dynamic properties. Clearing the journal permits routing of Q4 credit without a resolved original-source custody witness. An old journal with two persistence domains may therefore be silently marked settled even though the entity's fate is unknown.

A new Node test executes the **actual PG23 source recovery function**, injects an "after" Q4 receipt with no retrievable entity and a loaded source block, and demonstrates the original code clearing the journal. This is a **conditional source-level false-settlement risk**, not evidence of any observed real BDS duplicate or loss. Microsoft documents that `Entity.id` is intended to remain consistent across world loads and `World.getEntity` returns an entity *or undefined*, but neither source gives the add-on an atomic entity/queue save primitive. See [stable Entity API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable) and [stable World API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/world?view=minecraft-bedrock-stable).

## Bounded derived correction (HL-E-065)

[PG24 derived build](../candidates/pg24/prepare_candidate.py) compiles from **exact PG23 1.5.6 BP/RP** (which derives from PG20, PG08 and the unchanged 72 original 1.4.1 files). It modifies only this Q4 ejected entity path and related shared Hart-script HOLD readback. The original BP/RP UUIDs, block definitions/assets, world queue keys, q4 schema, API dependency version, Sorter/Collector/Receiver functionality, prior PG20 whole-native MR and PG23 same-Hopper compaction are preserved.

[PG24 custody helper](../candidates/pg24/entity_custody_overlay.js) enforces:

1. After writing the Q4 prepared journal, **read it back exactly** before any queue entry/page mutation. Mismatch is a local **HOLD**, not permission to attempt item removal.
2. Persist Q4 entry/page/sidecar and metadata as normal. Immediately **re-read the saved Q4 metadata, page entry, item definition and prepared journal**, confirming exact expected queue entry/amount, serialized type/data signature, total/received metadata and transaction identity. A failed readback is **HOLD** and leaves the entity alone.
3. Before physically removing the item entity, check that the **same entity ID** is still valid and is an actual `minecraft:item`, and read its current `ItemStack` type/data/amount. If another writer moved, changed, collected or invalidated it, **HOLD without deletion**. No reserialized replacement, synthetic item, artificial player inventory or extra item credit is created.
4. Call the existing `entity.remove()` **only after** the in-process checks. A throw before/after removal leaves the prepared intent where present, causes process-local HOLD and blocks subsequent Hart scripted paths.
5. Clear the exact Q4 journal only after successful normal operation, then verify immediate clear. A failed clear also holds. **These readbacks are within a running process, not proof of durable disk flush.**
6. On any subsequent `recoverQueueJournal` encounter with a persisted `entity_enqueue` marker, **HOLD before** the old `journalQueueState` classifier can modify queue metadata, remove any entity or clear the journal. The marker requires independent forensic custody review; the code never guesses whether the missing entity was picked up or successfully removed. A sticky process-local HOLD also cooperates with PG23's global scripted routing gate. This does **not** freeze vanilla Hoppers/players or foreign scripts.

The intentionally conservative recovery condition applies to **this one entity-intake journal kind**, not to `enqueue` for ordinary physical Hoppers or `dequeue` for normal Receiver output. Existing PG23 Q4/physical cross-journal gates remain. The owner-accepted prior Q4 paths are unchanged in normal happy-path behavior.

## Explicit limitations and operational tradeoffs

- **Global liveness:** If a `kind:"entity_enqueue"` journal is present on start because of a previous BDS termination or mid-transaction exception, this change prevents the **entire cooperating Hart routing system** from making new transfers until independent audit. That is intentional custody-first behavior, but a potentially significant availability regression. Do **not** install PG24 on any LAB with an already pending physical/Q4 journal; the installer cannot safely repair old item receipt states.
- **No external writer lock:** A short-lived JavaScript write-admission guard cannot stop a player pickup, a vanilla item entity tick, or another add-on. Same-tick validation is not proof of exclusive identity/custody.
- **No atomic disk guarantee:** The Q4 journal, Q4 page/definition/meta and physical Minecraft item entity live in different persistence domains; `getDynamicProperty` readback confirms what the process sees *now*, not what a future hard crash will persist. A single successful owner LAB ejection cannot promote Q5/Bulk or prove hard-crash exactly-once recovery.
- **Costs:** Reads an affected Q4 page and definition/meta for **each** successfully ingested ejected entity; this may add work to very large automated Dropper/Dispenser farms, but does not add journal writes or modify the global 664+ Sorter scheduler.
- **Scope:** No new assets/blocks, no experiments/cheats, no temporary command, no shell injection, no new UUID or world key, no physical build in LAB, no forced BDS kill, and no production or adjacent repository access.

## Evidence and targeted acceptance

- **HL-E-064** — source-executed original PG23 entity-absence recovery **false-settlement witness** (simulation only).
- **HL-E-065** — 26 source-executed PG24 Node cases for ordinary ejection/merge, prepared intent, Q4 page/definition/meta readback, changed/collected entities, removal/clear exceptions and replay refusal; 6 immutable-source builder tests; 13 synthetic 1.5.6→1.5.7 installer/rollback tests; and Windows PowerShell launcher parsing/Plan. [9/9 GitHub CI jobs passed](https://github.com/partom24/HartLogistics2/actions/runs/42440814708) on verified source head `b2fe0e31`; [PR #40](https://github.com/partom24/HartLogistics2/pull/40) awaits final merge and owner LAB preflight. No real runtime verification yet.
- **Owner testing:** once exact green CI and guarded 1.5.6 PG23 predecessor CheckLab pass, **one ordinary cobblestone item** via a new north-side Dropper into the *already-linked* isolated PG20 test Collector/Receiver (if still present and empty). [Full test card](../candidates/pg24/TEST_SESSION.md) includes complete PowerShell download/Plan/CheckLab/Install commands, coordinates and cleanup. **No restart, crash test, extra PG23 compaction test or rerun of already accepted PG20 MR transfer is requested.**
- **Current LAB remains** `1.5.6-LAB-PG23` until deliberate owner application. Keep its backup `lab-e7e9c09faeeb` and all original cloned world contents.

A **successful owner test is only a scoped normal ejected-item receipt**. Broader durable entity/Q4 atomicity and exclusive native MR/Q5/Bulk custody remain blocked.
