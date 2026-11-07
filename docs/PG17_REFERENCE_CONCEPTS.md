# PG-17 — Cross-lane hazard audit derived from reference concepts (OFFLINE)

**No referenced code imported or copied.** The owner provided three files for conceptual reference only:
- `custody_writer_boundary.mjs` (one cooperative writer across lanes)
- `native_direct_lane.mjs` (native whole-ItemStack movement vs. partial merges)
- `q5_output_executor.mjs` (Q5 logical debit, physical credit and persistent receipts)

The source uploads remain **outside this repository**, are not dependencies, and are not a replacement for the immutable 1.4.1 `addon/` baseline. [Independent PG-17 implementation](../candidates/transport/cross_lane_hazard_audit.mjs) and [38 Node tests](../tests/test_transport_cross_lane_hazard_audit.mjs) only model hazards; they do not enable transport.

## Concepts retained, independently specified

| Architectural concept | PG-17 independent rule | Not established |
| --- | --- | --- |
| One logical writer for cooperating routes | Model a single global in-flight operation across legacy Q4, direct native, Q5 output and three Bulk traffic categories. A second observed operation is a collision even if its physical endpoints differ. | Actual legacy Q4 must be instrumented before a runtime writer arbiter can claim it controls all lanes. An in-memory arbiter does not survive a restart as a lock. |
| Strict physical source and target observability | Flag shared endpoints, shared journal identity, shared writer identity, conflicting epoch and cross-network in-flight paths. Missing scan or journal markers are HOLD, not a clean idle claim. | Another addon, automation, or player could still change a vanilla chest outside our cooperative writer. |
| Native ItemStack custody | Treat `Container.moveItem` for a **whole native stack to a known empty destination slot** as a candidate API design, preserving native item data without metadata serialization. | This is not a bank credit, verified item provenance, transaction commit, or permission to rerun a failed native move. Partial `setItem` merges require multiple physical writes and are not promoted. |
| Virtual Q5 output | Treat logical debit, destination credit, receipt and cleanup as **separate failure boundaries**; a journal that reads back as COMMITTED is not an atomic transfer guarantee. | No demonstrated crash-atomic virtual-to-physical settlement. |
| Bulk virtual ledger | Keep any proposed 200,000-unit accounting separated from spendable physical custody. | No proven uniquely owned, engine-persistent physical item source or destination. |

Source-independent tests exhaust the **36 ordered pairs** of six conceptual route categories and cover missing full scans, two physical endpoint conflicts, duplicate operation IDs, stale epochs, conflicting marker phases, unreadable observations, whole-stack versus partial-merge design, and mixed Q5/physical crash windows. Every return type has all item/queue/bulk mutation, retry, settlement, reservation-release and journal-clear permissions **false**. `MODEL_IDLE_ONLY` and `MODEL_DESIGN_ONLY` are never runtime authorizations.

## Why this matters for implementation sequencing

1. The existing 1.4.1 Q4 path is intentionally *not rewritten* in PG-17; the model explicitly flags it as protected, not newly authorized. Changing legacy Q4 just to add an unused single-writer wrapper would add regression risk without improving physical custody.
2. An eventual same-scheduler design needs one real writer for **every physical or logical leg**, a durable record of an in-flight operation, and a separate proof that no external writer can bypass it. PG-17 addresses only the first two **conceptually** and always fails closed.
3. A candidate metadata-rich direct route should use the native whole-stack empty-slot operation rather than reconstruct a metadata-heavy ItemStack from a JSON witness. Partial two-slot edits should remain disabled until separately demonstrated.
4. Neither a successful world-property readback nor a clean BDS restart establishes an atomic commit involving a separately saved inventory. Existing PG-14/PG-15 normal-restart evidence remains valid, but is not silently upgraded to crash safety.

## Owner test decision

**No new LAB test is justified by PG-17.** No new pack build or install, no forced BDS termination, no item movement and no production changes. Next engineering work can improve independently testable metadata-preservation and multi-lane simulation while searching for a credible stable-Bedrock custody primitive; a true physical Bulk bank remains blocked pending independent engine-evidenced single-writer and crash consistency guarantees. Official relevant APIs: https://learn.microsoft.com/minecraft/creator/scriptapi/minecraft/server/container, https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itemstack?view=minecraft-bedrock-stable and https://learn.microsoft.com/minecraft/creator/scriptapi/minecraft/server/world?view=minecraft-bedrock-stable.
