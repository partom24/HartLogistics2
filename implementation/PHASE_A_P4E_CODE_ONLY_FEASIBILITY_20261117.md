# P4e — Code-only feasibility of Sorter-coordinated dense chest admission

**Date:** 2026-11-17. **Scope:** native-first base 1.4.1 only. **Verdict:** **Architecturally achievable** as a responsibility separation, but **a general dense-inventory performance improvement is NOT proven** by this design alone. Do not call this BDS validation, production acceptance, or authorization for a new chest ledger. No gameplay code changed during the feasibility spike.

## Evaluated design

- **Sorter** owns admission *policy*: incoming stack, Filter/Auto/Wildcard priority and when to ask for a slot.
- **Native destination Container/ContainerSlot** owns *inventory truth*: live slots, empty-slot count, exact compatibility, mutable player/vanilla/other-script inventory.
- **Existing safeMovePartial / Q4 queue writer** owns custody and journaled transfer, unchanged.
- The simple diagram is an **architecture view of the existing `findAcceptSlot` decision**, not an independent pipeline or a replacement for exact admission rules.
- No cross-tick capacity cache or additional authoritative per-Sorter slot-count state. The pinned 2.7 API declaration review found no general Hopper/container-content-change event suitable for tracking every possible external writer.

## Code-only evidence

New [source-executed tests](tests/dense_admission_concept_feasibility_141.test.mjs) extract the *actual current 1.4.1* `findAcceptSlot` function from `addon/behavior_pack/scripts/main.js`. The proposed coordinator wraps that exact function and tests a **narrow safe native negative admission case**, while exercising counterexamples to unsound shortcuts. Both use controlled native-shaped Container/ContainerSlot mocks, not BDS.

**13/13 new feasibility tests pass**, including **18,432** comparison scenarios (`1,024` five-position patterns × `3` chest sizes × `3` incoming items × `2` modes), plus targeted 54-slot cases. CI also reruns the previous engine and original-1.4.1 source witnesses. The test suite is permanently wired into the native-first CI workflow. These tests assert identical selected slot, source metadata, compatible-stack priority and accepted/rejected outcomes on modeled inventory; they are not a native runtime speed test.

| Hypothesis | Source-only outcome | Decision |
| --- | --- | --- |
| Existing Sorter as admission coordinator; chest as inventory truth | Equivalent when delegating to exact current `findAcceptSlot` | **GO** as an ownership model; no runtime change required |
| Empty-slot count alone measures item-specific capacity | 54-slot all-occupied chest with one 20/64 matching stack **accepts 44** | **NO**: full *slots* does not mean full *capacity* |
| First `Container.find(stack)` match is the insertion slot | First matching stack can be 64/64 while a later one is 15/64 | **NO**: cannot replace partial-first search |
| `Container.contains(stack)` means cargo fits | Can be true when all matching stacks are 64/64 | **NO**: membership is not available capacity |
| Native `find` alone proves Auto seed under all metadata | Auto seeds by item type (book: enchantment type set), while merger compatibility uses more exact metadata | **NO** on API signatures alone; actual native match semantics not guaranteed |
| Persistent Sorter-owned free-space counter | External removal makes previously rejected full chest immediately eligible | **NO** without complete native invalidation |
| Full chest and **nonstackable** Auto incoming stack | EmptySlotsCount==0 logically excludes any insertion even if a seed exists | **GO** as a narrow *candidate* shortcut with exception fallback; 54→0 `getSlot` calls in the controlled test |
| Full chest with **stackable** item and no compatible partial | Model still needs 54 live slots in worst case; 54→54 for ordinary full-mismatch case | **NO demonstrated general reduction** |

**Pinned API** (verified by existing `recovery/tests/level2_api_270_types.test.mjs`): `Container.find(ItemStack): number | undefined`, `contains(ItemStack): boolean`, `firstEmptySlot(): number | undefined`, `emptySlotsCount: number`, and `ContainerSlot.isStackableWith(ItemStack): boolean`. Their signatures do **not** expose “find an exact metadata-compatible stack with remaining room”, nor “amount-bounded journal-atomic move”. Current public method descriptions do not establish the specific `find` equality semantics needed for a safe negative prefilter. Any mock model of native `find` is illustrative, not evidence of BDS semantics.

## What the spike does and does not establish

- **Established:** Ownership separation is valid and exact existing behavior can be preserved. The full-nonstackable-Auto shortcut can reject without individual slot enumeration, using only a live native count and falling back to the old scan on an unavailable count.
- **Not established:** A meaningful reduction of the observed `~49` destination slot probes per admission for ordinary stackable dense chests. A 54-slot, all-occupied, no-match rejection cannot generally be decided from empty slots alone: a partial compatible stack may still be hidden at the last slot. Without additional trustworthy native semantics, the worst-case live search remains O(N) in the Script API interface.
- **Not established:** Real BDS cost of `Container.find/contains` compared with `getSlot`, exact matching of ItemStack metadata/quantity, or any measured FPS/TPS gain. The 2.7 API types are a contract for *shape*, not performance.
- **Not changed:** No source engine, transfer writer, routing budget, Hopper observation interval, Q4, Collector/Receiver, Bulk, Transporter or production files.

## Recommendation / P4e go-no-go

**GO:** Keep the native chest authoritative and the Sorter as the local admission-policy owner. Retain the current `findAcceptSlot` as the correctness reference. The full-nonstackable-Auto shortcut is safe **in the controlled source model** but likely too narrow to address the measured active stackable-routing bottleneck alone.

**CONDITIONAL, only after targeted BDS semantic proof:** Examine whether native `find/contains` can supply a *negative* exact-stackability hint on full chests, and whether their implementation genuinely saves native boundary calls. Validate identical metadata (names, lore, enchantments, potions, dynamic properties), stack amounts, early full vs late partial, Auto type-only seeds, and external inventory changes. An unknown native equality rule must fail conservative, never shortcut rejection. Preserve the original scan as fallback and rerun source differential and matched owner LAB profiles.

**NO-GO:** A persistent per-Sorter authoritative chest slot ledger, assuming a full chest cannot merge, a blanket `find`-based insertion decision, reducing Hopper observation cadence, or changing custody writer/budgets to obtain synthetic performance numbers.

This result should not be conflated with a completed P4e performance optimization. The [November 17 active profiling evidence](PHASE_A_ACTIVE_ROUTING_REVIEW_20261117.md) remains the reason to investigate dense admission, but **its measured native slot-lookup volume is not reduced yet**.
