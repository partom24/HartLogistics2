# PG-19 — Legacy native-item recovery metadata hazard (SOURCE-EXECUTED OFFLINE)

**Status: blocking source-level compatibility hazard, NOT an observed BDS hard-crash or production data-loss incident.** This review executes selected, **unchanged original 1.4.1 functions** under injected Node container/journal exceptions. It does not install a pack, open a world, modify `addon/`, run BDS, request an experiment or repair any inventory.

## Why this is a distinct issue after PG-18

The existing [baseline route matrix](BASELINE_INGRESS_EGRESS_MATRIX.md) and [MR invariants](../tests/test_legacy_mr_offline_invariants.py) correctly document direct-only MR routing. The old conceptual Python test explicitly **assumes atomic native movement**; it does not execute the actual 1.4.1 move/recovery functions. PG-14/15 separately used test-owned chests and **clean BDS restarts**, not arbitrary metadata-rich item interruption.

The original direct-only path for an item that cannot be safely placed in the Q4 queue is:
`processCollectorIngress` → `safeMovePartial` → `saveJournal` → source `setItem` debit → destination `setItem` credit → clear journal. The happy path uses `sourceItem.clone()`, which preserves native metadata; **that path is not the problem**. However, an exception or interrupted persistency between the debit and credit can lead `recoverJournal` to **recreate** the destination using `rebuildTransportItem(tx.item,...)`.

The journal item comes from `serializeTransport` → `serializeFilterItem`, a representation originally intended for the filter interface. It records type, name, lore, enchantments, selected dynamic properties and durability; it does **not** record `getCanDestroy`, `getCanPlaceOn`, `keepOnDeath`, `lockMode`, or any general opaque/custom component. The reconstruction path uses `new ItemStack` plus known fields and does not restore these omitted attributes. **Only potion variants get an additional round-trip check** at the direct-transfer preflight. `exactStackSig`, used to classify physical recovery, also omits those fields and dynamic properties. Matching item type/name/lore/durability/enchantments does not establish exact native identity.

Relevant unchanged original source anchors:
- `addon/behavior_pack/scripts/main.js`: `serializeFilterItem`, `rebuildItem`, `exactStackSig`, `recoverJournal`, `safeMovePartial`, `processCollectorIngress`.
- [Permanent source-executed fault tests](../tests/test_legacy_mr_recovery_faults.mjs) isolate the **actual function bodies** from the repository baseline and provide only mock Bedrock container/world calls. This is narrower and more faithful than reimplementing the algorithm as a new simulator.

## Reproducible failure witness — what it does and does not mean

The isolated fixture uses one nonstackable `minecraft:diamond_sword` with Adventure `canDestroy`/`canPlaceOn`, `keepOnDeath`, `lockMode`, custom dynamic property, name and lore. Its mock `maxAmount=1` ensures the legacy Q4 serializer refuses it and takes the direct-only path.

1. **No injected failure:** the unchanged `safeMovePartial` clones the source to the destination; the full mock metadata remains intact and journal clears. This distinguishes normal happy-path functionality from the recovery hazard.
2. **Exception on source debit:** source still has original ItemStack, destination empty, pending journal exists. The unchanged recovery code detects the untouched prepared move and clears the marker; modeled item remains intact.
3. **Exception after source debit, before destination credit:** source and destination are both empty while intent is persisted. The unchanged recovery code interprets `srcAfter && dstBefore`, rebuilds a destination item from the limited filter payload, and clears the marker. Name/lore/dynamic-property fields survive the mock reconstruction; Adventure `canDestroy`/`canPlaceOn`, `keepOnDeath`, `lockMode` revert to defaults. **This is a source-executed demonstrated metadata-loss window under injected API failure.**
4. **Exception only while clearing the completed journal:** destination already contains the full clone. Subsequent recovery recognizes completed physical transfer and clears the journal without reconstruction. Modeled metadata remains intact.
5. **Fingerprint collision:** two otherwise matching stacks with distinct dynamic properties, owner/Adventure flags and lock settings produce the same unchanged `exactStackSig`. Signature equality is **not** authenticated item provenance.

The fixture's fake Container and `setWorldDynamic` implement test fault ordering, not Bedrock's underlying disk-flush or actual native component behavior. Thus these traces **do not prove** that a real stable BDS process persisted such a state during a power outage, nor that the observed user's inventories have ever lost data. The code path exists and is executable under a modeled exception; operational crash frequency and real metadata behavior still require separately bounded LAB validation.

## Compatibility implications and immediate boundaries

- **Do not advertise** a guarantee of *all-metadata, all-failure* preservation for 1.4.1's existing direct-only fallback. The known happy path remains valid at its previously supported scope.
- **Do not alter** the 72 source baseline files, saved-world queue/journal format, 1.4.1 pack UUIDs, other mods or owner worlds as an automatic fix.
- **Do not silently change `recoverJournal` to discard uncertain states or emit replacement items.** Any safe candidate must treat ambiguous exact native MR custody as HOLD and never manufacture a partially described ItemStack, debit twice or clear forensic evidence prematurely. Recovery policies for ordinary provably round-trippable items must remain independently evaluated.
- **Do not assume `Container.moveItem` alone closes the persistent cross-domain journal/inventory cutpoint**; PG-15/16 already establish the limit of clean restart versus unproven crash atomicity.
- **Retain legacy operation and backups pending a separately authorized bounded patch candidate.** This issue affects the promise of lossless metadata in failure recovery; changing it requires compatibility review and a focused test *only for newly affected failure paths*, not a repeat of PG-08 menu or PG-14/15 ordinary cobblestone work.

## Next decision / issue gate

This is a **real source-level engineering issue**, not just a speculative future Bulk design question. Before attempting to ship Q5 native MR replacement or any claim of universally lossless transfer recovery, choose and authorize a bounded correction strategy **in a derived candidate, not the protected original**. A conservative first option is to refuse all automatic MR reconstruction after an ambiguous partial move, keep the durable marker, and enter an operator-auditable HOLD state; the actual location of the item and any repair path still need independent custody proof. Any gameplay edit and LAB install require separate explicit authorization under `AGENTS.md`.

The owner does **not** need to perform a new physical test for this offline finding. **Stop at the issue/authorization boundary** rather than inventing a gameplay fix, modifying production, or setting experiments without approval.

**Evidence:** HL-E-046 — original source execution with modeled slot/property failures, exact Node assertion count and CI result to be recorded on the matching GitHub run.
