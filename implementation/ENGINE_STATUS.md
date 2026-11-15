# HL2 native-first engine — implementation and completion status

**Branch:** `implementation/native-first-engine-141-20261115`  
**Base:** canonical immutable 1.4.1 import `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269` through the baseline-only recovery branch.  
**Scope:** first real engine implementation, no 1.5 source, no owner-world access, no production deployment.  
**Status:** **SOURCE-ONLY IMPLEMENTATION CANDIDATE — NOT COMPLETE / NOT RELEASE APPROVED.**

The owner has directed: **complete the engine**. Engineering output is assessed against both immutable reference-image objectives documented in [OWNER_PRODUCT_OBJECTIVE.md](../OWNER_PRODUCT_OBJECTIVE.md): the [Sorter array](https://github.com/partom24/HartLogistics2/blob/c40745834824806d6adefa487fb5bc5084fe057d/docs/reference-images/sorter-array.png) and the [storage-room array](https://github.com/partom24/HartLogistics2/blob/c40745834824806d6adefa487fb5bc5084fe057d/docs/reference-images/storage-room-array.png). Green source tests do **not** count as owner-layout acceptance.

## Source changes actually implemented

**Only** `addon/behavior_pack/scripts/main.js` is changed from the 1.4.1 original. The original 71 remaining gameplay files, pack manifests, UUIDs, custom block IDs, textures and assets are unchanged. The recovery branch remains unchanged and preserves its original 72 gameplay hashes.

| M-ID / original subsystem | Native-first implementation now on this separate branch | What it demonstrably changes | What remains unverified |
| --- | --- | --- | --- |
| **M01/M03: Sorter idle input observation** | Before Sorter eligibility, compaction or slot scans, call pinned-2.7 `Container.firstItem()` once on the source native Hopper. If empty, return with no scripted slot or Sorter block reads. Invalid/unloaded inventory also defers. | A controlled run of **1,387 eligible empty columns** makes **0 scripted `getItem()` calls** versus **20,805** original 1.4.1 scripted calls; performs 1,387 native `firstItem()` calls instead. | Native API internal cost, tick interleaving, actual arrival interception and **TPS** on BDS. |
| **M04: Source Hopper compaction** | Preserve original ordered compaction before active routing but skip the second pass if **no item actually moved**. | Removes one redundant five-slot pass from nonmoving nonempty columns; no change to intentionally packed source order in tested cases. | Native Hopper timing and all vanilla race/interleaving conditions. |
| **M19/M35: Collector idle intake** | Use the native source Hopper `Container.firstItem()` predicate before per-slot reading. Invalid native container defers; redstone lock remains respected. | Removes scripted per-slot reads for empty directed Hopper inputs. | Real-world timing and native getter cost. |
| **M35: Logistics idle loop** | Eliminate duplicate Collector/Receiver world lookups at the outer loop, retaining validation inside `processCollectorIngress`/`processReceiverDrain`. Avoid reading absent Q4 journal twice per idle tick. | Fewer native block lookups and idle dynamic-property reads, while original round-robin budgets and unresolved-journal stop remain. | BDS per-tick CPU and actual throughput. |
| **M15/M16: Legacy filter-display maintenance** | Keep one **startup** orphan census; regular 100-tick reconciliation only inspects known registered owners. Use native 2.7 `world.afterEvents.entityLoad` to validate, repair or remove legacy display proxies as they load; also remove known stale owner proxy locally. | Removes routine three-dimension global entity scans while preserving startup cleanup and local legacy display maintenance. | Native callback delivery and visual behavior on natural owner-world chunk unload/reload; orphan cases without entity load. |
| **M27: Opaque item direct-only admission** | If authoritative current Q4 queue load fails, do **not** move opaque cargo based on an old cached `Receiver.queued` count; leave source contents unchanged. | Closes the source-confirmed conditional unknown-queue direct-admission path without revisiting the established FIFO design. | Actual engine persistence and production data behavior. |

**Deliberate non-changes:** No invented native Hopper cargo-change event; no replacement for `schedulerTick` with speculative distributed callbacks. No `Container.moveItem`/`transferItem` drop-in for amount-limited operations: pinned 2.7 methods do not supply an N-item parameter or a cross-Q4 crash-atomic guarantee. No new queue serialization, Transporter, Bulk Store, or Q5 implementation. Native visual assets and existing item frames remain intact.

## Source verification and packaging

- [Implementation candidate tests](tests/native_first_engine.test.mjs): **33** executing altered original function bodies against controlled native-shaped mocks.
- [Baseline differential test](tests/compatibility_differential_141.test.mjs): **192 Sorter and 96 Collector** deterministic comparison scenarios, executing both pinned original and altered source. Intended safety change for unreadable queues is isolated separately from known-queue equivalence.
- [Original baseline evidence](../recovery/LEVEL2_SOURCE_EVIDENCE.md): **99** immutable 1.4.1 source-only regression cases, executed using the actual original file extracted with `git show` in CI.
- [Pinned native declarations](tests/native_display_api_270.test.mjs): **2** entityLoad-specific checks plus **11** previous exact `@minecraft/server 2.7.0` signature checks.
- [Independent scope guard](../tools/engine_candidate_guard.py): confirms original 1.4.1 ancestry, all original unmodified pack assets/manifests, and **only** one candidate engine source file changed.
- [Engine CI workflow](../.github/workflows/native-first-engine.yml): executes candidate tests, the canonical original regressions, pinned native API declarations, then generates an **uninstalled, non-release** .mcaddon in GitHub Actions artifacts. Artifact is explicitly named `HL2-141-native-first-SOURCE-ONLY-UNVERIFIED`.

These tests **do not** exercise actual `@minecraft/server` runtime, native `Container.firstItem()` internals, any item on BDS, real tick performance or abrupt server persistence failure.

## What prevents declaring the **whole HL2 engine complete**

1. **R6 physical Bedrock acceptance**: no execution of this modified source in target BDS or owner-preserved production-derived LAB. Need compare exact native behavior and useful throughput on both owner reference array arrangements, including 1,400-Sorter-scale loaded topology and linked storage, before asserting speedup or compatibility.
2. **HL2 feature completeness**: original 1.4.1 provides Sorter/Collector/Receiver. Planned **Bulk Storage, Transporter, interconnected networks and Q5 metadata-rich expansion** are **not implemented by this candidate**. Neither the existing 1.4.1 source nor the two picture filenames alone supplies a safe, finished implementation contract. Do not invent their behavior or misrepresent the candidate as the complete new engine.
3. **Native physical transfer equivalence**: no BDS proof of `Container.moveItem` or `transferItem` amount/slot/metadata compatibility with original custom journals. Leave existing working custody protocol untouched until exact equivalence.
4. **Presentation and migration**: native entityLoad-based legacy display cleanup, startup sweeps, block state, item frames, redstone and unloaded/loaded builds require verification on actual owner world; these source tests do not demonstrate the visual product objective.
5. **Owner release boundary**: no automatic production deployment, world manipulation, base version bump or replacement of 1.4.1. The archival hard protection of frozen 1.5 remains a separate administrative GitHub issue [#82](https://github.com/partom24/HartLogistics2/issues/82).

**Correct current label:** "native-first source implementation candidate with reproducible tests and packaged non-release artifact." Do not call it a completed game engine, measured performance win, or final release.

**Next real gate:** authorized Bedrock runtime/LAB acceptance and an independently specified, owner-accepted implementation path for remaining full HL2 features. The image references and all compatibility constraints remain binding.
