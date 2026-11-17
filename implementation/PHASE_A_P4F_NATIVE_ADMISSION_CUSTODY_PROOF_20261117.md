# Phase A P4f — Native addItem custody boundary (source-only)

**Date:** 2026-11-17. **Scope:** HartLogistics **base 1.4.1 only**, pinned `@minecraft/server@2.7.0`. This is a **research gate**, not a new engine candidate, Bedrock runtime measurement, Q5 protocol, Bulk Storage or Transporter. Existing P4e engine source SHA-256 **`5c4a2d414302ef10d76fef21932928592caf2fab84cd000c5b0085cefcdd1b91` remains unchanged**.

## Decision question

Can a destination-managed `Container.addItem(boundedStack)` replace the expensive explicit destination search while preserving our journal's exact restart-recoverable ownership, *without a full chest snapshot or a new custody protocol*?

The pinned `2.7.0` declaration contracts (checked separately by CI) are:

- `Container.addItem(itemStack: ItemStack): ItemStack | undefined` — destination insertion and an **unaccepted remainder**, **not a source debit** and **not a placement/commit receipt**.
- `Container.transferItem(fromSlot: number, toContainer: Container): ItemStack | undefined` — can operate from the source slot but exposes **no bounded quantity parameter**; it cannot directly honor Hart's 16-per-column budget for arbitrary 64-item source stacks.
- `Container.moveItem(fromSlot, toSlot, toContainer): void` — no quantity limit and explicit destination slot; doesn't eliminate selection. The API shapes alone say nothing about crash atomicity or native timing.

The [owner active native diagnostic audit](PHASE_A_P4E_ACTIVE_ROUTING_REVIEW_20261117.md) showed about **51.69 native `getSlot` calls per Sorter admission**, so the cost target remains urgent. Java AE2/Fabric and owner-supplied Bedrock Create Logistics/ASN examples informed this question, but external use of `addItem` plus rollback is not evidence of Q4 equivalence.

## Executable research artifact

[Fault-injection / indistinguishability tests](tests/native_additem_custody_boundary_141.test.mjs) run **actual current 1.4.1 `safeMovePartial`, `slotState`, and `recoverJournal` function bodies** inside controlled native-shaped JavaScript containers. They also simulate a destination-managed partial-stack-first `addItem` interface with only a remainder return. The mock is intentionally favorable to native insertion: it preserves simple item identity and predictable stack compatibility. **It does not establish actual BDS placement, metadata semantics, speed or atomicity.** An asserted information ambiguity remains valid if the native call can insert an ordinary item indistinguishable from one inserted externally.

### Proof by indistinguishable restart state

A journal records offer **five stone** from a source stack of **ten**, together with even a **complete 54-slot pre-transfer destination snapshot**. The destination had a partial stone stack at slot 9 (20/64). Consider two independent histories after the journal is prepared:

| History A — native insertion never occurs | History B — native insertion occurs |
| --- | --- |
| Another vanilla Hopper/player adds five identical stone to slot 9 | `addItem` accepts five stone into slot 9 |
| Source still holds ten; slot 9 now holds 25 | Source still holds ten; slot 9 now holds 25 |
| Correct Hart action: **do not debit source** | Correct Hart action: **debit source by five** |

The durable prepared journal and **every observable source and destination slot** are the same. No deterministic recovery algorithm that sees only those facts can both preserve Hart's cargo in A and avoid duplication in B. A full snapshot does not solve the ambiguity when unrelated writers can change the chest; a unique transaction identity or other authoritative native completion evidence would be needed.

The symmetric failure happens with **source-first debit**: after debit, an externally supplied matching item looks identical to Hart's completed native insertion. A recovered remainder is likewise impossible when the call crashes before its result is logged: some accepted amount can be indistinguishable from an external top-up.

This is a **counterexample against the proposed journal+addItem interface under vanilla multi-writer assumptions**, not a claim that every imaginable native API, future Bedrock feature, custom escrow, or exclusive-owner storage model is incapable of transactions. The actual Q4 exact-slot journal also treats unexpected conflicts conservatively and is not presented as a perfect defense against arbitrarily identical external writes.

### Why our existing exact-slot Q4 is retained

The tests exercise actual source journal preparation, debit, destination credit, and recovery across before-debit / after-debit / after-credit synthetic interruption points, plus a conflicting destination. Q4 has a **named destination slot and before/after quantity** to check, can finish a known missing credit, clear an already completed transfer, and hold ambiguous states without blindly overwriting the chest. That is a narrower, explicit recovery contract. Native `addItem` can spread an offer over **more than one destination slot**, so replacing the journal with one destination slot record is insufficient.

A fully durable 54-slot snapshot adds O(54) reads and stored state before native insertion, taking us back toward the same hotspot while still not resolving external-writer indistinguishability. This is not permission to introduce a 1.5 custody engine into base 1.4.1.

## P4f go/no-go

- **NO-GO for base 1.4.1:** Replacing `safeMovePartial`/exact-slot `recoverJournal` with naive destination-first or source-first native `addItem`, an in-memory full-chest rollback snapshot, or a persistent Sorter-owned capacity ledger. The existing BDS source and LAB deployment remain unchanged.
- **KEEP as a research option:** If a *native* transfer/receipt with bounded count and recoverable identity becomes available in the pinned implementation or if BDS reveals undocumented guarantees, test it behind an isolated harness. Do not infer such guarantees from TypeScript signatures.
- **RETURN to the measurable bottleneck:** Prioritize reducing the **number of destination admission attempts** or using a native, **safe exact-compatible candidate predicate** before any `getSlot` scan. Inventory `find/contains` semantics would need real pinned 2.7 Bedrock proof; a type-only query cannot reject metadata-compatible partials or certify Auto seeds. Investigate whether repeated negative offers target the **same destination + item within one synchronous column execution**, but do not introduce even short-lived caching without evidence of repetition and an explicit invalidation correctness proof. Keep real-world full-chest and mixed-cargo tests.

## Remaining BDS gate

The user's previous P4e active capture is **not a controlled throughput or exact installed-SHA comparison**. If another runtime test is requested, first verify the existing installed `main.js` SHA-256 and observe **unique destination/item pairs versus repeated offers**, source cargo outcome and Q4 journal state. Do not deploy a speculative Q4 rewrite or claim P4f has demonstrated BDS cost improvements.

**Conclusion:** The economically attractive native operation has an insufficient *custody receipt*. The next useful performance work is reducing **repeated need to ask** a container, or establishing a specific native admission predicate—**not another wholesale inventory or transaction engine**.
