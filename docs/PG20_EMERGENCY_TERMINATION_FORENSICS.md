# PG-20 owner-reported emergency BDS kill: preserve-first forensic card

**State: ABRUPT TERMINATION REPORTED; OUTCOME NOT YET OBSERVED. No repeat kill authorized or required.**

## Report and proof boundary (2026-11-07)

Following the previously accepted PG20 1.5.5-LAB-PG20 single-book *normal*-restart test (HL-E-052) and a supplementary dual-routing observation (HL-E-053), the owner reports placing **four stacks of cobblestone (4 × 64 = 256 ordinary items) plus one enchanted book** into **a chest feeding the input Hopper** and performing an **emergency server kill**. The report does not specify the exact terminate method, process path, timing of the kill relative to the transfer, whether the same Protection I test book was reused, or the saved/loaded physical and journal state. Interpret the named server as *in the ongoing LAB context*, but **verify LAB-only scope** before directing any restart, recovery or mutation. No evidence of disappearance, duplication, crash atomicity, physical transfer outcome or hardware power-loss is yet supplied.

This is **HL-E-054: OWNER-REPORTED ABRUPT PROCESS TERMINATION; FORENSIC RESULT PENDING**, not a PASS or FAIL. It is not equivalent to the earlier controlled PG15 PRE/POST source-level interruption markers or clean restart. **Do not run a second crash experiment.**

## What may have been in flight

- The chest and native Hopper are **vanilla physical inventory writers**. Items can have moved between their inventories before the kill even if the owner placed all 257 in the chest earlier. The snapshot at kill-time is unknown.
- Original PG20 source sends **Q4-serializable cobblestone** from the Collector input Hopper into the linked Receiver's **Q4 persisted queue**; that Receiver may later drain to its output Hopper. Existing queued backlog and ordinary activity change global `/hartlogistics:status` totals, so a net +256 count is **not** a valid one-to-one proof without isolating the test Receiver and all its physical inventories.
- A Q4-unsafe enchanted book uses the PG20 **whole-stack native direct-only** route only if the destination Receiver is loaded, its **queue backlog is zero**, output Hopper has an **empty slot**, and other gating conditions pass. The book may remain in the source chest or input Hopper if queued cobblestone or other conditions prevent the bypass. Do **not** assume it has traversed based only on a prior PG20 pass.
- PG20 interrupted `opaqueTag: "pg20-native-opaque-v1"` recovery intentionally **HOLDs without replay, clearing or manufacturing an ItemStack**. Q4 has its own journal and recovery logic. Clear journal after restart is evidence of no *currently pending* marker, **not proof** of item conservation across sudden process termination.
- No source-level evidence shows a single engine atomic commit across vanilla chest/Hopper state and world dynamic properties. Same type/count after the kill cannot uniquely prove metadata fidelity, provenance, cutpoint or external-writer exclusion.

## Immediate containment and observation

**If the server is still off:** Confirm the process terminated in `C:\Servers\Thomas_MCBedrock - Copy (2)` (the LAB), **not** `C:\Servers\Thomas_MCBedrock` (production). Preserve a separate read-only copy of the **stopped** `LAB\worlds\ThomasServer` tree, plus original console/host log and exact kill command/method. Do not edit live world files, restore/replace registration JSON, clear dynamic properties, restart repeatedly or run the updater. Copy world only when stopped; snapshots made *after* a restart have a different evidentiary status. If a stopped-world copy is impractical, record this and **do not claim pre-restart disk evidence exists**. Resume the LAB once, by normal procedure, only after preservation/safety checks.

**If already restarted:** Don't kill it again or roll back. Avoid interacting with the test inventories except **opening them to look** and record what is present. Do not refill, remove, manually move the book, break blocks, force Hopper transfers, toggle redstone or modify scripts. Take screenshots/recordings of:

1. Full **source chest** contents (27 slots) and the adjacent **input Hopper** (5 slots).
2. The **Receiver output Hopper** (5 slots) and any other **test-connected container** the 256 cobblestone or book could have entered. Include enchantment tooltip if book found. Record **any missing/duplicate book**, its visible state and remaining cobblestone stacks without modifying them.
3. `/hartlogistics:status`: exact running pack version, registry/Collector/Receiver counts, **both journal states**, queue totals and writes, and any `PG20 PHYSICAL JOURNAL HOLD` or recovery errors in BDS script logs. Capture **linked test Receiver queue details** where existing UI exposes them, separate from the pre-existing world-wide million-item queue.
4. Exact observed kill method/time, current LAB restart state, timing of screenshot vs restart, and whether other existing automation remained active. Use the **previously recorded PG20 baseline** for orientation only; normal background queues change.

**Hard stop:** If either journal reads PENDING/HOLD, an item seems missing, duplicated or modified, or recovery errors appear, preserve the world and all source/output physical inventories **unchanged**. Do not attempt manual compensation, replay, property deletion, reinstallation, rollback or repeated restart. Escalate for forensic review on the preserved LAB copy. Do not promote the candidate to production.

## Acceptance grading

- **PASS as a bounded crash observation only** after recording actual postkill source/queue/output physical inventory and journals and demonstrating the specific test item accounting with known timing. A visually correct count after one kill is still **not** an atomic persistence or universal MR guarantee.
- **AMBIGUOUS** if quantities cannot be reconciled because the exact prekill distribution/timing, background movements or Receiver queue entries are not known. Do not mark failure or success merely from different `/status` global counts.
- **HOLD / INVESTIGATE** if any pending physical marker, unresolved Q4 journal, apparent missing/duplicate item or metadata mismatch. Make no automatic changes.

**No production operations, no forced rerun, no additional candidate code or world mutations are implied by this incident card.**
