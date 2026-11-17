# Phase A P4e decision and narrow native full-container candidate

**Date:** 2026-11-17. **Decision:** Optimize **the current exact-slot admission path first**; **do not replace Q4 with native `Container.addItem()`** until an equivalent restart-recoverable transaction protocol is demonstrated. Base 1.4.1 only; no Bulk, Transporter or future 1.5 custody system. No production deployment.

## What the external research established

1. AE2 and Fabric Java provide destination-managed insertion and/or genuine transaction capabilities unavailable as a shared cross-inventory transaction through the pinned Bedrock 2.7 interface.
2. Owner-uploaded Create Logistics 2.0.2 uses `addItem` *and snapshots whole destination inventories*, trading explicit slot-search work for O(container size) copying and best-effort compensation. It cannot prove a cheap, Q4-equivalent owner-BDS path for arbitrary vanilla chest external writers and sudden restarts. Its separate compatibility BP still scans capacity and slots manually.
3. The owner-uploaded Bedrock Energistics Core 0.12.0 is not an exact vanilla chest admission/custody implementation; its item-machine representation does not preserve all possible native ItemStack properties.
4. Upstream Bedrock ASN export also uses `addItem` and acknowledges that successful destination credit followed by failed source debit can duplicate an item. This failure model is unacceptable as a Q4 replacement.
5. The current P4d active BDS profiles recorded about **356,699** and **332,329** native `getSlot()` calls under `findAcceptSlot()` within ~20-second captures; a separate native `hasItem()` invocation is made for essentially every slot. These are API-call counts, not milliseconds of proven latency.

**Consequence:** native `addItem` remains a meaningful *experimental contract*, but using it as the actual 1.4.1 cross-chest writer without a durable destination-placement receipt cannot guarantee journal replay after a crash. In-memory chest snapshots are not a substitute. Do not switch to that architecture based on insertion throughput alone.

## The implemented P4e candidate (bounded optimization, not a redesign)

`addon/behavior_pack/scripts/main.js::findAcceptSlot`:

- Reuse the already-read **live native `emptySlotsCount`**. If it establishes `occupied===size`, every slot is occupied and therefore `ContainerSlot.hasItem()` is redundant in this synchronous admission decision. Read `ContainerSlot.typeId` directly; still examine actual live amount, maxAmount and `isStackableWith()` for a matching partial slot. Do **not** assume a full chest is uninsertable.
- If an occupied count contradicts a missing/throwing native slot `typeId`, **discard provisional results and restart the original live scan**, preserving Auto seed, compatible-before-empty, and free-slot behavior in the face of inconsistent observations.
- For **nonstackable AUTO only**, a positively reported completely full native chest cannot admit any item and may be rejected before scanning. Other full chests must still prove whether any exact compatible partial capacity exists.
- Outside the positively full-native-count path, use the existing code verbatim. No cross-tick cache, additional Sorter ledger, altered Hopper cadence, budget, precedence, physical active check, source compaction or custody writer.

**Expected modeled work for a full 54-slot chest receiving a stackable nonmatch:** `getSlot 54→54`, `hasItem 54→0`; exact compatibility unchanged. **Expected modeled work for full nonstackable AUTO:** `getSlot 54→0`. **Not** a proven CPU or TPS gain; `emptySlotsCount` cost and native call latency require BDS measurement. This is intentionally smaller than the original objective of eliminating the ~49 native **getSlot** calls, which remains unsolved.

The patched engine SHA-256 is `5c4a2d414302ef10d76fef21932928592caf2fab84cd000c5b0085cefcdd1b91`. Previous transit-first P4d SHA-256 `99045ca7179320f5f5e2d9d56286b4386308df7daa5473b8aa7498bf27c44306` is added as an **exact allowed LAB upgrade origin**. The updater still rejects unknown local HEAD, modified assets and unrecognized installed engine contents.

## Validation boundary

- Source-executed [differential tests](tests/dense_full_native_admission_141.test.mjs) compare actual `findAcceptSlot` from this candidate to frozen previously deployed P4d source at commit `798ae788`. Includes dense full/near-full, exact partial last slot, metadata mismatch, AUTO seed rules, native count unavailable, contradiction fallback, and 18,432 five-position 9/27/54-slot permutations. `test_hartlogistics_lab_updater.py` guards the exact P4d→candidate upgrade origin.
- Existing original 1.4.1 regression witnesses, P4d differential tests, pinned native 2.7 declarations, deterministic packaging and Windows/Linux updater tests remain required.
- All source tests are models; they **do not prove** the native `emptySlotsCount` getter is cheaper than a per-slot `hasItem()`, or that Bedrock permits the assumed stable, synchronous occupied count. Owner should **confirm candidate file SHA**, execute identical full/dense and local partial routing workloads on BDS, capture VS native method counts and script P50/P95/P99, and audit Q4 journals and useful throughput.
- **Stop/go:** retain only if BDS demonstrates a meaningful improvement without a single admission/custody regression. If the improvement is negligible, revert the narrowed optimization and prioritize an isolated native-`addItem` semantic/custody research harness **outside the production engine**. Never accept a native insertion writer without a demonstrably durable recoverable receipt or other equivalent source-and-destination protocol.

The original owner layout target remains approximately 1,400 Sorters, 4–5 high in most columns; real BDS acceptance there remains separate.
