# START HERE — HartLogistics native-first 1.4.1 recovery: new-chat takeover

**Handoff prepared:** 2026-11-16. **Repository:** [partom24/HartLogistics2](https://github.com/partom24/HartLogistics2). **Working branch:** [implementation/native-first-engine-141-20261115](https://github.com/partom24/HartLogistics2/tree/implementation/native-first-engine-141-20261115). **Do not work from default `main` as though it contains the active recovery implementation.**

**READ THIS FIRST IN A NEW CHAT.** It consolidates the project objective, owner decisions, frozen baseline, evidence, current candidate, CI, actual blockers and next engineering work. The linked source documents and original files are the authoritative details. The handoff does not authorize production changes or declare Bedrock tests passed.

## 0. One-minute executive handoff

> **Current task:** Complete a **true native-first conversion of Hart Logistics 1.4.1**. Eliminate custom logistics mechanics **only where vanilla Bedrock or the verified stable native Script API can own them**, and retain only the minimum Hart-specific routing and compatibility code. Preserve all **existing** 1.4.1 gameplay, saved worlds and metadata. Target the owner's pictured [Sorter array](https://github.com/partom24/HartLogistics2/blob/c40745834824806d6adefa487fb5bc5084fe057d/docs/reference-images/sorter-array.png) and [storage-room array](https://github.com/partom24/HartLogistics2/blob/c40745834824806d6adefa487fb5bc5084fe057d/docs/reference-images/storage-room-array.png) at their natural scale.
>
> **Do not start:** Bulk Storage, Transporter, Q5, a generalized 1.5 custody engine, any resurrected 1.5 implementation, or another debate about settled FIFO design.
>
> **Most recent correction:** Calling `Container.firstItem()` on every Sorter **every tick** is **still custom polling**, not an architectural native replacement. The 1.4.1 candidate currently does this. Its green tests show source behavior and fewer scripted slot accesses, **not** eliminated polling or proven native performance.
>
> **Owner's telemetry decision:** Use **VS Code Minecraft Bedrock Debugger, existing server diagnostics and built-in Script Profiler**. Do not build a custom telemetry framework, duplicate per-tick logger or extra results ledger.
>
> **Status:** Source-only implementation candidate exists, native packaging succeeds, **147 tests pass**; no BDS/runtime or owner-world performance/visual acceptance. **Stage A / base 1.4.1 conversion is not complete.**
>
> **Next chat:** Do actual native-mechanism substitution analysis and incremental implementation against **original 1.4.1**, not more scheduler micro-optimizations or custody/FIFO research. Check repository state first. Preserve the immutable input baseline and separate implementation branch. Never represent a file build or mock pass as BDS acceptance.

## 1. Owner instructions, in precedence order

1. **The two pictures are the overall product objective.** The reference folder [`main/docs/reference-images`](https://github.com/partom24/HartLogistics2/tree/main/docs/reference-images) contains `sorter-array.png` and `storage-room-array.png`. Their **commit-pinned** identities are recorded in [OWNER_PRODUCT_OBJECTIVE.md](OWNER_PRODUCT_OBJECTIVE.md), with a CI presence guard. They are **owner-approved product references only**, **not** permission to use frozen 1.5 code, tests or design records.
2. **For now ONLY convert the base 1.4.1 engine.** Preserve Sorter / Collector / Receiver, existing vanilla Hoppers, original Filter → destination-seeded Auto → Wildcard priority, BYPASS, redstone pause, frame/filter and mode interactions, physical storage, Dropper/Dispenser actual-ejection behavior, links, unloaded blocks, and Q2/Q3/Q4 migration/state compatibility. All existing item quantity/metadata and persisted worlds must survive. **No new Bulk Storage, Transporters, Q5 or 1.5 custody architecture**. Future 1.5 custody development requires **separate** owner direction.
3. **FIFO is a settled requirement.** Do **not** revisit, redesign or repeatedly center it. Preserve the existing behavior as a test/compatibility constraint. Q4 journal recovery is likewise **existing 1.4.1 compatibility**, not permission to build a generalized 1.5 custody engine now.
4. **Native-first is the central architectural requirement.** Investigate native vanilla mechanics, native block states/events/components, native ItemStack/Container operations and actual engine ownership. A JavaScript loop calling one native method every tick is **not** the desired conversion. Reduce custom mechanisms, not merely the number of `getItem()` calls. When a true native replacement cannot satisfy the existing layout and semantics, record the *specific* missing guarantee and retain minimal custom logic rather than fabricate an event.
5. **Use existing native debugging/profile tools.** VS Code Minecraft Bedrock Debugger, BDS diagnostics and built-in Script Profiler. Separate paused breakpoint debugging from performance captures. No custom telemetry subsystem, alternate instrumentation engine or auxiliary logging ledger.
6. **Original 1.4.1 is the sole implementation input.** The archived 1.5 branch/PR are excluded as code, tests, examples, fixtures, designs, performance evidence and migration inputs. Links to the archived branch are for administrative freeze only; **do not open it for design**.
7. **No production deployment or world changes.** Only owner-authorized, preserved production-derived LAB world testing after identifying the exact build and protections; no new forced build layouts, draining Receivers, resetting Q4 or rewriting saved worlds.
8. The owner wants substantive forward progress without repeated requests to choose routine next steps. Continue within these boundaries, execute relevant repo tasks, show genuine verified results; ask the owner only for necessary runtime access/approval when the work reaches it.

## 2. Repository identity, branches and source isolation

| Item | Exact reference and rule |
| --- | --- |
| Repository | [`partom24/HartLogistics2`](https://github.com/partom24/HartLogistics2) |
| **Canonical owner-supplied 1.4.1 import** | Commit **`0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`**. Original [`addon/behavior_pack/scripts/main.js`](https://github.com/partom24/HartLogistics2/blob/0ea3000651c116b0fa1acc2836ab7e1bcfbc6269/addon/behavior_pack/scripts/main.js) plus original RP/BP assets; [`BASELINE_HASHES.json`](BASELINE_HASHES.json) enumerates **72 original gameplay files**. This import is NEVER overwritten as the authoritative baseline. |
| **Read-only/provenance recovery branch** | [`recovery/native-first-141-20261114`](https://github.com/partom24/HartLogistics2/tree/recovery/native-first-141-20261114), pre-handoff HEAD **`641a05dfd7a546cb36841259ed0d9eca7bb04d66`**. Carries census, owner rules, native API matrix, source tests and source guard. No changes to the original 72 addon files. |
| **Active isolated implementation branch** | [`implementation/native-first-engine-141-20261115`](https://github.com/partom24/HartLogistics2/tree/implementation/native-first-engine-141-20261115), pre-handoff HEAD **`bacaf52f96684bab90a8f0a6b724d3edd05d2273`**. Descends through recovery from exact 1.4.1. Of 72 original addon files, **only `addon/behavior_pack/scripts/main.js` is changed**. Manifest, pack IDs, block IDs, model, textures, other 71 files are unchanged. Read [implementation/ENGINE_STATUS.md](implementation/ENGINE_STATUS.md). |
| **Default `main`** | HEAD `c40745834824806d6adefa487fb5bc5084fe057d` at handoff. Contains the owner images and many historical documents, **not** the active native-first implementation. Its root `README.md` historically says no gameplay source imported; do not treat that stale statement as current recovery status. |
| **Archived 1.5 line** | `dev/uce-shared-ordinary-ledger-20261111` is **frozen and excluded**. PR [#79](https://github.com/partom24/HartLogistics2/pull/79) CLOSED, **NOT merged**. Branch is **not GitHub-enforced protected** as checked. Administrative [issue #82](https://github.com/partom24/HartLogistics2/issues/82) remains open for a true no-push protection/ruleset. No recovery work may derive from that branch. |
| API version | Original BP manifest `@minecraft/server 2.7.0`, minimum Minecraft engine `1.26.50`. A pinned **public npm TypeScript declaration package** was checked in CI. A declared method does **not** prove native BDS behavior, persistence or performance. |
| Release state | **No approved production release.** Neither the native-first candidate nor its GitHub Actions artifact has passed LAB/BDS integration, owner layout acceptance, or TPS testing. |

**Preservation:** Both the actual frozen original import and the recovery branch retain the baseline files. The implementation candidate is **not** a merged mainline change. Never merge, version-bump, deploy, modify owner world or change metadata from CI alone.

## 3. Current candidate: actual code changes versus native architecture

Active candidate path: [`addon/behavior_pack/scripts/main.js`](addon/behavior_pack/scripts/main.js). Current script still has **`system.runInterval(schedulerTick, 1)`** and **`system.runInterval(logisticsTick, 1)`**.

| Original mechanism | Candidate source change | What is proven | Architecture/real-world caveat |
| --- | --- | --- | --- |
| M01/M03 Sorter input | Calls native `Container.firstItem()` before detailed 5-slot input reads, Sorter lookups and compaction. | Source-mock at **1,387 eligible empty columns:** **0 scripted `getItem()`** reads versus **20,805** from unchanged original; candidate makes **1,387 `firstItem()`** calls. | **STILL ONE POLLED NATIVE QUERY PER EMPTY COLUMN PER TICK**. No evidence that native engine work/TPS improved, no native item-arrival event proven. Not an architectural solution. |
| M04 compaction | Skips final packing pass if no item moved; original initial left-pack remains. | Source tests and 1.4.1 comparison for controlled cargo. | No actual Hopper interleaving/performance proof. |
| M19 Collector ingestion | Native `firstItem()` short-circuit for empty directed source Hoppers. | Fewer synthetic per-slot reads. | Still repeated Collector polling; not a native cargo change event. |
| M35 logistics loop | Avoids duplicate outer block lookups and idle Q4 journal read; called functions still validate blocks. | Source-controlled mock behavior. | Still a per-tick custom logistics loop. |
| M15/M16 legacy filter displays | Native `world.afterEvents.entityLoad` for targeted known/orphan proxy repair, **one startup** dimension-wide orphan sweep, periodic registered-owner repair. | Callback *type* exists in pinned 2.7 declarations, and original-source helper tests pass. | Needs BDS check for event delivery, old-world chunk loading/repair, and faithful appearance. |
| M27 opaque direct admission | On unreadable current Q4 queue, defers instead of trusting stale cached zero. | Source-tested fail-closed state; otherwise original behavior kept. | A narrow legacy safety change, **not** a new custody architecture or FIFO redesign. |

These are genuine *candidate code changes*, but **not yet the core architectural elimination** originally requested. Do not overclaim them.

**Available native capability and unresolved limits:**
- `Container.transferItem(fromSlot, toContainer)` exists in **2.7 types**, but has **no amount or chosen destination slot argument**; not a drop-in for Hart's 1–16 item/slot-controlled physical moves.
- `Container.moveItem(fromSlot, toSlot, toContainer)` exists; **no partial amount parameter**, return is `void`; same-container ordering/merge and vanilla timing need BDS proof.
- `Container.addItem(itemStack)`, `firstItem()`, `firstEmptySlot()`, `contains()`, `find()`, `ItemStack.clone()`, `isStackableWith()` are available as appropriate tools; none alone provides custom Filter/Auto/Wildcard semantics or a durable virtual Q4 atomic commit.
- Exact 2.7 `WorldAfterEvents` typings did **not** expose a **general vanilla Hopper inventory-content-change** event. `onTick` or `runInterval` is a tick callback, **not** an equivalent event. Comparator output is lossy about actual item type/quantity changes. Do not invent a trigger.
- Native redstone consumers, block states/permutations, vanilla Hopper lock/transport, native item frames and block interactions are the strongest actual **engine-owned** surfaces. Original 1.4.1 already uses some; identify remaining duplicative scripting and remove only with behavior/layout proof.
- Q4 is existing **250,000-item-per-Receiver** virtual storage with legacy Q2/Q3 migration and journal. Keep original compatibility; a new generalized 1.5 custody engine is **out of scope**.
- Sorter priority is original **specific Filter → live destination-seeded Auto → Wildcard**, with vertical bottom-to-top order inside priority; BYPASS preserves vanilla flow. Original Auto ordinary item matching uses **typeId** (not every item metadata bit), while enchanted-book matching uses enchantment **type sets**. Do not use vanilla `contains()` to silently change it.
- Collector reads only actual **vanilla Hoppers pointed into Collector**, not arbitrary adjacent containers; Dropper/Dispenser require actual vanilla ejection. Receiver outputs through a vanilla Hopper below, subject to lock/capacity.

Detailed native rejection/acceptance gates:
- [Native-first mechanics audit, all 40 mechanism IDs](NATIVE_FIRST_MECHANICS_AUDIT.md)
- [Pinned 2.7 native transfer/custody decisions](recovery/NATIVE_TRANSFER_AND_CUSTODY_LEVEL2_DECISIONS.md)
- [Native Sorter arrival/trigger screen](recovery/NATIVE_SORTER_TRIGGER_SCREEN.md)
- [Exact source-executed Level 2 evidence](recovery/LEVEL2_SOURCE_EVIDENCE.md)
- [Full original function/effect census](BASELINE_141_RECURSIVE_CENSUS.md) and [per-function side effects](BASELINE_141_FUNCTION_EFFECTS.md)

## 4. Objective images are mandatory, but DO NOT expand the active phase

The following two mainline images are immutable owner-identified reference targets:

| Reference | GitHub-pinned source | Recorded original Git blob identity |
| --- | --- | --- |
| **Sorter array** | [`sorter-array.png`](https://github.com/partom24/HartLogistics2/blob/c40745834824806d6adefa487fb5bc5084fe057d/docs/reference-images/sorter-array.png) | `b80669b845803aca1060578f6997ebe035ae68db` |
| **Storage-room array** | [`storage-room-array.png`](https://github.com/partom24/HartLogistics2/blob/c40745834824806d6adefa487fb5bc5084fe057d/docs/reference-images/storage-room-array.png) | `4c2cfb68c85576b9c898351741bb8b4ab5b6c383` |

Both determine **owner layout, scale and eventual real build functional acceptance** for what base **1.4.1 already supports**. No requirement to add a new Bulk block, Transporter, Q5 or 1.5-style network/custody in order to close **this** phase. Do not assert a block-by-block image interpretation or claim they have been runtime reproduced; the provided links establish the owner goal, not an accepted world test.

## 5. Tests, build artifact, verified workflow and what they prove

**Most recent pre-handoff CI confirmed against current code:**

| Workflow | Green run and exact tested source commit | Meaning |
| --- | --- | --- |
| **Implementation** | [GitHub Actions #43764978320](https://github.com/partom24/HartLogistics2/actions/runs/43764978320), commit `bacaf52f96684bab90a8f0a6b724d3edd05d2273` | Immutable original ancestry/asset guard PASS; **35 candidate source-executed tests PASS** (includes 2 differential tests looping **192 Sorter** and **96 Collector** mock scenarios); **99 original 1.4.1 source-executed regression tests PASS**; **13 exact-2.7 API type checks PASS**; candidate .mcaddon zip packaging PASS. **147 tests total, no failed tests.** |
| **Recovery** | [GitHub Actions #43764975998](https://github.com/partom24/HartLogistics2/actions/runs/43764975998), commit `641a05dfd7a546cb36841259ed0d9eca7bb04d66` | Unchanged original source provenance/72-asset hash/census PASS; **99 source-only original tests** and **11 pinned-2.7 type checks** PASS (**110 total**). |

**These results do not prove any actual BDS execution, any owner-world functional/visual acceptance, tick/TPS improvement, native API behavioral equivalence, hot-reload safety, crash durability or item conservation.** They are valuable **offline/source** gates, nothing more.

**Test files and runners:**
- [Candidate engine source tests](implementation/tests/native_first_engine.test.mjs): **33 tests** against candidate source functions and controlled native-shaped mocks.
- [1.4.1 differential tests](implementation/tests/compatibility_differential_141.test.mjs): **2 test cases**, execute **288 deterministic synthetic Sorter/Collector scenarios** against original and candidate function bodies. They are **not** 288 separate BDS tests.
- [Pinned native event tests](implementation/tests/native_display_api_270.test.mjs): **2**, plus original [11 native type contract tests](recovery/tests/level2_api_270_types.test.mjs), run with public `@minecraft/server@2.7.0` npm `index.d.ts`.
- Original tests: `recovery/tests/level2_source_contracts.test.mjs` (31), `level2_journal_faults.test.mjs` (13), `level2_native_scheduler_screen.test.mjs` (11), `level2_native_semantic_gaps.test.mjs` (14), `level2_q4_recovery_states.test.mjs` (21), `level2_direct_only_guards.test.mjs` (9) — **99 total**.
- [Candidate workflow](.github/workflows/native-first-engine.yml): it swaps in the **pinned original** script for the original regression suite and restores candidate source; it does **not** conflate candidate changes with original-baseline results.
- [Candidate guard](tools/engine_candidate_guard.py): enforces immutable 1.4.1 ancestry, all original other pack assets/manifest and only the one changed engine script in `addon/`.
- [Recovery-only provenance guard](tools/recovery_baseline_guard.py): disallows all gameplay source changes on the recovery branch.

**Packaged source-only candidate:** GitHub Actions artifact **`HL2-141-native-first-SOURCE-ONLY-UNVERIFIED`** in [run #43764978320](https://github.com/partom24/HartLogistics2/actions/runs/43764978320); underlying file name `HartLogistics_native-first_141_SOURCE_ONLY_UNVERIFIED.mcaddon`; artifact ID **`14181329574`** and **expires 2026-11-29** at the time it was checked. Rebuild from exact source/workflow if expired. **Never silently label a source-only artifact production-ready.**

**No actual server test has yet run.** There is no telemetry capture to interpret or claim.

## 6. Native debugger/diagnostics/profiler are THE telemetry path

The owner already uses **VS Code Minecraft Bedrock Debugger**, **BDS server diagnostics**, and the official **Script Profiler**. The approved minimal [testing protocol](implementation/TELEMETRY_PROTOCOL_141.md) is a reference for using those **existing tools**, not a commission for a new telemetry subsystem.

- Correctness: VS breakpoints/watches/call stacks and existing `sendDiagnostics` values; normal gameplay verification.
- Performance: normal execution **without stopped breakpoints**; BDS diagnostics/watchdog and built-in Script Profiler `.cpuprofile`, native calls/function hot spots, tick health.
- If appropriate and available in the authorized LAB runtime: `/script profiler start` / `/script profiler stop`, `/script diagnostics startcapture` / `/script diagnostics stopcapture`. Confirm commands against installed BDS version.
- Do **not** add always-on per-tick `Date.now()`, global counters, extra dynamic-property writes, event-overlogging, extra ledger/test-results logger, or an instrumented replacement of the current gameplay candidate.
- Functionality/data safety and item identity are assessed by actual test-world state, not inferred from a profile. Owner controls the world and permission to run tests.

The owner explicitly corrected an earlier assistant attempt to turn telemetry into another project. **Use the tools already in place.**

## 7. Status, exact outstanding engineering tasks and stop gates

**Stage A / base native-first 1.4.1 conversion = NOT COMPLETE.** The project documentation uses named gates **R0–R7**, not a formal separate "Stage A" identifier. The last response to the owner said: source-tested candidate exists, package ready for guarded LAB evaluation, **BDS acceptance/true native architectural substitution remains outstanding**.

### Engineering tasks for the next chat, in priority order

1. **Verify present state:** Read THIS file, [RECOVERY_MANDATE.md](RECOVERY_MANDATE.md), [OWNER_PRODUCT_OBJECTIVE.md](OWNER_PRODUCT_OBJECTIVE.md), [implementation/ENGINE_STATUS.md](implementation/ENGINE_STATUS.md), [the original 1.4.1 main.js at pinned import](https://github.com/partom24/HartLogistics2/blob/0ea3000651c116b0fa1acc2836ab7e1bcfbc6269/addon/behavior_pack/scripts/main.js) and the **current candidate `main.js`**. Check the actual branch HEAD and CI; the handoff precommit SHAs may be historical after new commits. Do not load archived 1.5 for guidance.
2. **Return to genuine native elimination, not another polling tweak.** Prioritize M01/M03/M04/M15–17/M19/M20/M35: determine which responsibilities can be **handed to vanilla Hopper physics, native block state/redstone, native item frames/interaction events, or verified Container transfers** with 1.4.1 layout/behavior intact. Write a falsifiable per-mechanism **native-owned / minimal custom gap / requires BDS proof** disposition, with exact source call site and 2.7 API guarantee. Do not claim an event or cross-transaction property Bedrock does not expose. The full 40-row matrix already exists—**build on it**, do not restart generic research.
3. **Implement real reductions only after the native-contract decision.** Make small independently testable edits on the isolated implementation branch. Preserve 1.4.1 item identity, filter semantics, redstone and previously saved worlds. Do not introduce a competing scheduler, full ItemStack reserialization system, changed Q4 schema or 1.5 custody redesign. If no native alternative can safely eliminate a per-tick observation, explicitly retain/contain the *minimum necessary* custom boundary and **state that limit**, rather than making unsupported performance claims.
4. **Keep strict source tests and pinned-version checks.** Run/check GitHub Actions on the exact new HEAD; candidate/tests/packaging must remain truthful. Regression tests do not certify runtime.
5. **Next runtime gate:** When real BDS/owner-authorized LAB access is available, use the owner's VS debugger + native server profiler/diagnostics to compare **exact original 1.4.1** and **candidate** on both reference arrangements: empty/loaded/active, modes/redstone, blocked outputs, unload/reload/restart, legacy data, metadata-rich cargo, full queue constraints and throughput. No unilateral production/world changes; no approval-by-assumption.
6. **Do not mistake user-stated completeness for evidence.** Report precisely what is done and what remains. A baseline 1.4.1 source/CI artifact is available, but the conversion is **not native-first complete** or BDS accepted.

### Explicit stop/avoid list

- **No Bulk Storage / Transporter / Q5 / new 1.5 custody work yet**; owner deferred all.
- **No FIFO debate or speculative queue redesign**; original is settled. Source tests can preserve old behavior but are not an agenda.
- **No frozen 1.5 source or PR comparison**. PR #79 only for archival administration.
- **No naive native full-stack move** as replacement for partial 16-item journalled transfers without genuine guarantees.
- **No invented Hopper-change event**, no comparator-based lossless cargo observer, no "onTick = event-driven" euphemism.
- **No duplicate custom telemetry suite**, logging engine or added capture ledger; use VS/BDS tools.
- **No changing default main, production, live world, or the owner reference images**.
- **No BDS/TPS/persistence claims** from GitHub Actions, npm d.ts files, scripts or ZIP validation.
- **No unnecessary questions** about already-settled owner decisions. Proceed within repo/scope; request access only at the actual runtime boundary.

## 8. Source evidence and full reference navigation

Read the following in this order, as needed:

1. [RECOVERY_MANDATE.md](RECOVERY_MANDATE.md) — binding scope, proof hierarchy, original-world preservation, R0–R7.
2. [OWNER_PRODUCT_OBJECTIVE.md](OWNER_PRODUCT_OBJECTIVE.md) — binding images, correct current-phase interpretation.
3. [implementation/ENGINE_STATUS.md](implementation/ENGINE_STATUS.md) — exactly what the interim candidate currently does and its architectural limitation.
4. [NATIVE_FIRST_MECHANICS_AUDIT.md](NATIVE_FIRST_MECHANICS_AUDIT.md) — **all 40 original custom mechanisms** with native candidates and costs.
5. [LEVEL1_NATIVE_API_RESEARCH_141.md](LEVEL1_NATIVE_API_RESEARCH_141.md) — 39 native capability families and official documentation.
6. [LEVEL1_MECHANISM_DECISIONS_141.md](LEVEL1_MECHANISM_DECISIONS_141.md) — original M01–M40 per-mechanism classifications.
7. [BASELINE_141_RECURSIVE_CENSUS.md](BASELINE_141_RECURSIVE_CENSUS.md) and [BASELINE_141_FUNCTION_EFFECTS.md](BASELINE_141_FUNCTION_EFFECTS.md) — original 72 files, all original 180 named functions and side effects.
8. [recovery/NATIVE_SORTER_TRIGGER_SCREEN.md](recovery/NATIVE_SORTER_TRIGGER_SCREEN.md) — **why generic native Hopper arrival trigger is unresolved**.
9. [recovery/NATIVE_TRANSFER_AND_CUSTODY_LEVEL2_DECISIONS.md](recovery/NATIVE_TRANSFER_AND_CUSTODY_LEVEL2_DECISIONS.md) — exact 2.7 native Container/ItemStack limits for physical movement; do not drift into future custody redesign.
10. [recovery/LEVEL2_SOURCE_EVIDENCE.md](recovery/LEVEL2_SOURCE_EVIDENCE.md) — 99 original source tests and 11 pinned-type checks; source-only evidence tier.
11. [recovery/LEVEL2_Q4_CUSTODY_FAULT_MATRIX.md](recovery/LEVEL2_Q4_CUSTODY_FAULT_MATRIX.md) — compatibility regression/reference only, **not** a request to reopen FIFO or 1.5 custody.
12. [implementation/TELEMETRY_PROTOCOL_141.md](implementation/TELEMETRY_PROTOCOL_141.md) — owner-selected native VS/BDS tools only.
13. [implementation/tests/](implementation/tests/) and [recovery/tests/](recovery/tests/) — reproducible source-executed regressions.
14. [GitHub Actions: implementation run #43764978320](https://github.com/partom24/HartLogistics2/actions/runs/43764978320) and [recovery run #43764975998](https://github.com/partom24/HartLogistics2/actions/runs/43764975998) — last known pre-handoff green evidence.
15. [GitHub issue #82](https://github.com/partom24/HartLogistics2/issues/82) — administrative hard-lock of archived branch, **not** an engineering implementation input.

## 9. Copy-paste starter prompt for the next ChatGPT conversation

> Continue the HartLogistics2 project at `partom24/HartLogistics2`. **Start by reading `TAKEOVER_NATIVE_FIRST_141.md` on branch `implementation/native-first-engine-141-20261115` and its linked mandate, objective images, native-mechanism audit and engine status.**
>
> The current assignment is **genuinely native-first conversion of original Hart Logistics 1.4.1 only**. Preserve everything originally working, both owner's Sorter/storage-room array layout goals, original 1.4.1 saved worlds/Q4, metadata, Sorter priority, Hopper/redstone and Collector/Receiver behavior. Do **not** work on Bulk Storage, Transporters, Q5 or a 1.5 custody engine. **FIFO design is settled and not a debate.** Never read/import the frozen 1.5 development branch. Do not touch production.
>
> Be vigilant: the existing candidate still runs a 1-tick custom scheduler. Its `firstItem()` substitution is **not** a true architectural native replacement or proven TPS win. Investigate/remove genuinely duplicative custom mechanisms using actual Bedrock engine ownership, with precise 2.7 API contract and original-source equivalence. If a native guarantee is missing, retain only the minimal justified custom gap; do not invent events or write another speculative scheduler. The current candidate is source-tested but not BDS accepted.
>
> **Debug/telemetry:** use owner's existing VS Code Minecraft Bedrock Debugger, BDS diagnostics and Script Profiler; **no new telemetry layer, logger or ledger**. Verify the branch HEAD/CI and continue useful source/implementation work without asking me to redecide established matters. Test real BDS only with preserved owner-authorized LAB access. Record actual changes and proof levels; report the true Stage A status, not an imaginary completion.

**Handoff completion standard:** A successor can read this one file, open the linked evidence, identify the correct branch and source, recognize the owner's non-negotiables and avoid the already-corrected detours. **The handoff is documentation, not engine completion.**
