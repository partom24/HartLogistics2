# PG-23 — Journal-protected native compaction of Sorter source Hoppers

**Status: DERIVED 1.5.6-LAB-PG23 DEVELOPMENT CANDIDATE; SOURCE/OFFLINE VERIFIED ONLY until owner LAB observation.**

## Source-level custody issue (not a reported user loss)

The frozen 1.4.1 source and existing deployed PG20-derived main JS implement `compactSourceHopper(container)`. When a Sorter-column input vanilla Hopper has a gap to the left, it performs two separate item mutations **without a physical journal**:

```javascript
container.setItem(write, item);       // earlier slot receives a native copy
container.setItem(read, undefined);  // old slot is cleared later
```

If execution or persistence is interrupted between these two calls, the source-level intermediate state has both a retained old-slot item and an earlier-slot copy. A *possible* duplication cutpoint exists, but it was **not observed during the owner's emergency-kill test** (that test showed a consistent earlier-save player-inventory rollback). The original compaction is **essential for 1.4.1 fair FIFO-like pass-through**: without packing, an unmatched item stranded behind a repeatedly filled gap can starve. Simply deleting compaction to avoid risk would violate original behavior.

PG22's earlier six-path coordinator model had classified Sorter storage transfer as one category. Source inspection now confirms **intra-Hopper compaction itself is an additional physical write site**, not an ordinary Sorter-to-storage move. An eventual central writer must include it, as well as entity-removal after Dropper/Dispenser Q4 ingress, rather than assuming all physical writes already share the same journal.

## Bounded correction, without changing original addon/

[PG23 exact derived builder](../candidates/pg23/prepare_candidate.py) reconstructs PG20's verified 1.5.5 BP/RP (in turn **unchanged 72-file 1.4.1 + accepted PG08 menu + PG20 opaque MR direct path**), then applies a *single bounded replacement*. The same BP/RP UUIDs, dependency versions, Sorter filter/mode/wildcard behaviors, Collector/Receiver Q4 schema, saved world state, Dropper/Dispenser behavior and existing completed test-proof relationships are preserved.

[PG23 runtime overlay](../candidates/pg23/native_compaction_overlay.js) replaces each copy+clear pair with:

1. Confirm an actual **unpowered vanilla 5-slot Hopper** above a participating Sorter column; source slot holds an inspectable original native ItemStack and earlier target slot is empty. Power redstone still halts all column mutation **before** compaction.
2. Require both current **physical journal and Q4 journal to be absent** and no prior process-local uncertain operation.
3. Write a new **opaque prepared intent** to the existing **`JOURNAL_KEY`** (`pg23-native-hopper-compaction-v1`) including exact source/target Hopper coordinates and source/target slot indices, original type, quantity and bounded signature. Read it back; also recheck the original source and empty destination.
4. Call **exactly one** native `Container.moveItem(read, write, container)`, preserving the original native ItemStack, then verify source slot empty and inspectable ItemStack fields still match.
5. Only after clean immediate readback, clear the single physical marker and verify clear. On ANY exception, unexpected marker/readback or potentially post-move failure, **HOLD**, preserve the pending marker where available and never retry or reconstruct automatically.

The documented stable Minecraft Script API explicitly says `Container.moveItem` can target the **same container**; this justifies the supported operation shape, **not a guarantee that a world-property journal and slot contents save atomically on disk**. [Official stable Container reference](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable).

PG23 adds a **cooperating Hart-script routing freeze** to `processColumn`, `processCollectorIngress`, `enqueueFromSource`, `enqueueFromEjectedEntity`, `dequeueToReceiver`, `safeMovePartial`; and pauses `recoverQueueJournal` while a physical marker remains pending **and `recoverJournal` while a Q4 marker remains pending**, so old physical and Q4 recovery cannot bypass each other's unresolved intent. The completed PG20 physical recovery continues to HOLD on the new opaque marker. This is **not** a globally exclusive write lock: players, normal vanilla Hoppers and third-party addons are not stopped. The freeze may **halt all Hart scripted traffic** if *any* old legacy physical or Q4 marker is pending; this is a deliberate liveness tradeoff that requires owner awareness. It does not delete or rewrite original queued content.

## Safety and compatibility limits

- **Source identity:** One native `moveItem` replaces two JavaScript `setItem` calls; exposed fields (name, lore, enchantments, Adventure restrictions, lock/keep flags, item dynamic properties, potion/durability/dye where inspectable) are checked. Not every opaque third-party item component can be witnessed or independently authenticated.
- **Persistence:** Readback inside the running process does not prove two saved world records flush together; a hard crash may persist the journal and Hopper differently. Existing PG20 opaque marker HOLD remains, with **no automatic compensation**. PG21's five-domain accounting and PG22's coordinator adoption gaps remain open.
- **Throughput:** Each actual left-pack move now performs an extra intent+clear in world dynamic properties (potentially multiple times per active Sorter source Hopper). It may increase tick cost on a world with 664+ Sorters. The LAB candidate needs bounded functional and performance observation before any further rollout.
- **Starvation:** When a native item cannot be safely inspected, Hopper becomes invalid, a marker persists, or `moveItem` throws, compaction stops rather than inventing/removing an item; the original Hopper may not compact until an operator resolves the obstruction. This is safer but less live.
- **Scope:** Normal unaffected Collector→Receiver direct MR whole transfer, PG08 linking, PG13/14/15 accepted prerequisites and Q4 storage are **not repeated** just because a new candidate exists. No new custom blocks, experiments, extra world property keys, probes, cheats, commands, runtime hardware crash test, production access, Q5/Bulk or automatic migration is part of PG23.

## Verification and test handoff

- **4 baseline fault-injection Node tests** source-execute the original protected `compactSourceHopper`: the injected exception after its first `setItem` leaves the old slot and new slot both holding identical test ItemStacks in a mock; this is **not a reproduced live Bedrock disk duplicate**.
- **22 further Node regression tests** source-execute the **compiled PG23's actual** `pg23CompactSourceHopper`, `pg23TransportMayRun`, PG20 fingerprint and existing saveJournal bodies in a deterministic fake Hopper/ItemStack/world. Cases include metadata fidelity; multiple left moves; no-gap zero writes; Q4/physical marker freezes; read/write exception before or after native move; foreign slot mutation; unreadable metadata; failed journal clear; pending marker refuses retry; and source-level gate preservation.
- **6 Python builder invariants** prove the original 72-file hash baseline, exact pack footprint/version/API UUID, resource retention, old two-setItem removal and source-anchor rejection.
- **13 synthetic Python LAB install/rollback cases** verify exact 1.5.5 PG20 predecessor and 1.5.6 PG23 registrations, preservation of third-party pack entries, backup, refusal on altered source/world and guarded rollback. Windows PowerShell real launcher Plan and unsafe-mode parsing are CI verified. **No real LAB/production action was performed during development.**
- **Mandatory source pin:** [Windows launcher](../candidates/pg23/Start-HartLogistics-PG23Lab.ps1) now requires the **exact CheckLab Git SHA** via `-ExpectedCommit` for Install, refusing an independent main-branch advancement. The owner gets full download and copy-paste commands in the [one-Hopper / one-Sorter READY test card](../candidates/pg23/TEST_SESSION.md); the tool never silently replaces manual test permission.
- **Evidence HL-E-061:** original 1.4.1/PG20 unjournaled compaction hazard — SOURCE LEVEL, not observed live BDS duplication.
- **Evidence HL-E-062:** PG23 1.5.6 source/mock/build/synthetic installer CI proof once final checked Git SHA passes all jobs — OFFLINE CANDIDATE, no runtime acceptance.

**OFFLINE CI:** [all 8 CI jobs passing at source head e3cc04d4](https://github.com/partom24/HartLogistics2/actions/runs/42438003472); no runtime BDS observation or deployment by development.\n\n**Next step:** owner-initiated guarded PG20→PG23 LAB install and **two** focused isolated Sorter/Hopper observations, after complete CI. This is a **true changed path**, unlike already passed PG20 Collector-native routing. No further emergency kill is required or requested.
