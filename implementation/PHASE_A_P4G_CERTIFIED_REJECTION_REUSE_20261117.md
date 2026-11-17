# Phase A P4g — Certified, callback-local negative admission reuse

**Date:** November 17, 2026. **Scope:** native-first base **1.4.1 only**; no Bulk, Transporter, Q5, URCE migration, persistent chest ledger or scheduler/cadence change. **Status:** new source candidate awaiting owner BDS runtime verification; source CI is a separate gate.

## Decision derived from evidence

The owner P4e active VS Debugger profile shows **487,223** native Sorter destination `getSlot` calls for approximately **9,425** `findAcceptSlot` normal calls in ~19.7 seconds (**51.69 calls/attempt**). Neither profiler nor .mcstats provides item identity and destination identity for each attempt, so it **cannot tell how many negative scans were duplicates**. The prior source-run [repeated-negative witness](tests/repeated_negative_admission_141.test.mjs) executes the real `processColumn` and proves one five-slot Hopper can cause **5 × 54 = 270** redundant scans against the same full chest. That is possible, **not an owner-world frequency measurement**.

Following the source-only [P4f native insertion custody no-go](PHASE_A_P4F_NATIVE_ADMISSION_CUSTODY_PROOF_20261117.md), keep the exact-slot Q4 writer and improve repeated read-only qualification instead.

## P4g deliberately narrower than the early hypothetical cache

**Do NOT cache arbitrary `findAcceptSlot() === undefined`.** A rejection may depend on Auto live seeds, metadata, a native stackability failure, or an unknown/contradictory occupancy observation. A general cache would conflate those conditions.

Actual `findAcceptSlot(container, stack, requireAutoSeed, negativeProof)` now optionally returns a **negative certificate**, `negativeProof.fullNoTypeCapacity=true`, *only if*:

1. A **live native `emptySlotsCount`** positively reports zero empty slots (`occupied===size`);
2. All `getSlot().typeId` readings in that dense scan agree with a full valid native container; any missing, throwing or contradictory type observation falls back to the original scan and prevents certificate;
3. Every occupied slot of the incoming **typeId** has a valid quantity at its maximum slot capacity. **If even one same-type partial exists, including a metadata-incompatible partial, no certificate is issued**; errors/unknown quantities are not evidence of no space;
4. Incoming stack is stackable (`stack.maxAmount>1`), no compatible slot was selected, and the original lookup returned a negative. A positive placement result never produces the certificate.

**Why type-only reuse is safe under this certificate:** If all slots are occupied and every stack of this *type* is already at its native maximum, no item of that same type can be admitted regardless of names, lore, other metadata or Auto type seed, until the chest changes. This does not extrapolate a native `isStackableWith` result to arbitrary cargo.

`processColumn()` keeps a `Map` **only within one synchronous, non-yielding invocation**, keyed by the actual active Sorter registry entry and checked for the same current mode, type and maxAmount. It may skip re-running `findAcceptSlot` for later source Hopper slots that carry the same type. The Map is thrown away at function return and **cleared after any successful Hart-controlled move**; it is **never persisted, shared across columns, or retained across ticks**. Per-attempt `destinationFor(e)`, active-mode and Filter checks remain live. Any uncertified rejection still scans exactly as before.

The narrow optimization relies on normal synchronous Bedrock script execution with no intervening external inventory writes during that single callback. Owner BDS still needs to validate the runtime behavior/invalidation assumptions. Native Hopper/player modifications between invocations are always reobserved, never cached.

## Source-level effects and test requirements

| Controlled case | Previous P4e | P4g candidate | Correctness requirement |
| --- | ---: | ---: | --- |
| Five 1-item stacks of same type, one full 54-slot incompatible chest | **270** `getSlot` calls | **54** | All five remain in source; no journal/writes |
| Same-type full stacks, incoming differing metadata | 54 for every source offer | 54 for first certified negative; later callback-local same type skips | No room remains independent of metadata |
| Chest has **any** same-type partial with incompatible metadata | Full live scan per attempted offer | Same | Later matching metadata still admitted |
| AUTO with stale/missing seed, sparse chest | Full scan/regular path | Same | No stale negative reuse |
| Any successful transfer | Existing bounded native Q4 write | Same; clear all provisional rejections | Preserve partial-first, routing priority and budget |
| Subsequent tick after native player/Hopper removes an item | New full live qualification | New full live qualification | No cross-tick cache or missed admission |
| Native full-count contradiction or unknown quantity | Original fallback/scan | Same, no certificate | Never fail closed from an unsupported native observation |

New [source-executed differential tests](tests/certified_negative_admission_141.test.mjs) compare the actual P4g `findAcceptSlot` against the frozen previous P4e version across 18,432 mixed 9/27/54-slot cases and targeted bad-native-data cases. Updated [processColumn repeated-offer tests](tests/repeated_negative_admission_141.test.mjs) exercise the real current source and read native-shaped boundary counts. Prior original-1.4.1, Q4 and pinned API witnesses remain active.

The P4g gameplay engine SHA-256 is **`0578e8eb205d9c68fde8926a82c07241b68979c86160c8df4665e316ba2e8b26`**. The previous P4e SHA **`5c4a2d414302ef10d76fef21932928592caf2fab84cd000c5b0085cefcdd1b91`** remains an **exact allowed LAB upgrade origin**, not a general trust of modified installed files. All other original pack files and assets remain byte-identical.

## Owner LAB acceptance gate — not yet passed

First verify exact P4g installed `main.js` SHA; preserve previous P4e captures for context, not as matched controls unless conditions can be reproduced. With the exact same 1,400-Sorter topology, target chest fullness and feed pattern before/after, capture:

- Native `Container::getSlot`, `ContainerSlot::typeId`, `hasItem`, `Container::size` on Sorter `findAcceptSlot`; the optimization reduces number of `findAcceptSlot` invocations, not per-call scan length.
- Script tick P50/P95/P99, level tick distribution, measured useful item throughput and source Hopper pass-through. Avoid treating other loaded add-ons' script time as solely Hart's.
- Filter → Auto → Wildcard, different metadata (especially similarly named/custom items), nonstackables, power/BYPASS, full and partial chest, external player/Hopper chest mutation between ticks, missing destination and Q4 journal/recovery integrity.
- A clear **no-duplication/no-loss** item count under normal and blocked destination workloads; no new crash-injection request is implied by a source-only change.

**GO/NO-GO:** Source equivalence is necessary, not sufficient. Keep P4g only if matched owner BDS demonstrates meaningful reduction in native `getSlot` volume and script cost without behavior or custody changes. If duplicates are rare or the Map/certification overhead offsets savings, revert P4g to P4e and treat this performance avenue as exhausted. **Do not start 1.5 gameplay just because this source candidate exists**; first decide whether 1.4.1 foundation is acceptable and close its native acceptance gate.

## CI result — source-only gate PASSED

**Green HEAD:** `c8e9a8b4e157c5738516b45fe77b209776af2111` (test harness forwarding corrected; the P4g gameplay engine bytes remain those of commit `6d36640d2c5acbac71f78106a38e4b0b3a72e3d1`).

**GitHub Actions:** https://github.com/partom24/HartLogistics2/actions/runs/44185286787 — **5/5 jobs passed**: engine provenance and source-executed candidates (**162/162**), independently executed original 1.4.1 regression witnesses (**99/99**), pinned 2.7 declarations, synthetic guarded LAB updater safety on Linux/Windows, and non-release BP/RP candidate artifact. The source candidate SHA-256 is still `0578e8eb205d9c68fde8926a82c07241b68979c86160c8df4665e316ba2e8b26`. These tests do not count as owner BDS performance or conservation acceptance.

**Transition consequence:** P4g source-only hypothesis is proven in a controlled repeated-rejection scenario. Until matched owner BDS demonstrates how often those certified repeats occur and checks useful item throughput and custody, the broader 1.4.1 performance gate remains open. If source-correct P4g has negligible real gain, reject its extra local state and retain the simplest accepted P4e candidate; direct additional architecture work toward **1.5 URCE** only after the remaining 1.4.1 acceptance baseline is agreed. Do not add experimental Bulk/Transporter changes to 1.4.1.

## Owner active-routing evidence and P4g no-go — November 17

[Four-file P4g native audit](PHASE_A_P4G_ACTIVE_ROUTING_ASSESSMENT_20261117.md) (file hashes and exact call ancestry recorded): combined script P95 **65.592 ms** over **252** samples; ~19.61-second VS profile **6,166** native Sorter destination resolutions and **6,166** normal `findAcceptSlot` scans. In current source the certified cache skip follows `destinationFor` and precedes `findAcceptSlot`; no Sorter `firstEmptySlot` early-path activity was observed in this profile. Equality therefore indicates **zero P4g cache skips demonstrated**, although 324,240 native Sorter `getSlot` calls is less than the prior **487,223** in a distinct-workload P4e run. The scans per admission remain **52.58** versus **51.69**. 96 Sorter `setItem` calls under `safeMovePartial` vs 42 in P4e confirm differing traffic. The owner did not capture P4g idle baseline, but **missing idle does not explain away the direct no-skip result**. Runtime performance benefit is **not proven**; no broad per-tick or global cache is justified. The code-only suite remains green, but **recommend reverting the speculative P4g Map candidate to simpler P4e for final 1.4.1 once the owner chooses the baseline**. Do not overwrite installed LAB files outside guarded updater procedure.
