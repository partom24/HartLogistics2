# Level 2 source-only Q4 custody / native handoff fault matrix

**Source:** immutable original 1.4.1, commit `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`. **Authorized activity:** original-source execution with synthetic Node mocks and exact public `@minecraft/server@2.7.0` type declarations; **NO BDS, LAB, production, gameplay modifications, or 1.5 inputs**. **Status:** `SOURCE DECISIONS VERIFIED / ENGINE DURABILITY UNKNOWN`. Date: 2026-11-14 (owner local).

**Verified CI:** [GitHub Actions 43674615159](https://github.com/partom24/HartLogistics2/actions/runs/43674615159) at `b74a068e2f6ae1efca927636fd1b18f3ebfdf4d1`: baseline provenance PASS, **99/99** source-executed tests PASS, **11/11** exact 2.7.0 declaration tests PASS, **110 total tests** (including one complete idle-scheduler-to-Hopper-read witness). This report and its crosslinks are later documentation commits with separate workflow results; never treat a success on an earlier SHA as testing later code.

**Original code anchors:**
- [`enqueueFromEjectedEntity` L2118 and actual entity removal](https://github.com/partom24/HartLogistics2/blob/0ea3000651c116b0fa1acc2836ab7e1bcfbc6269/addon/behavior_pack/scripts/main.js#L2118)
- [`enqueueFromSource` L2305 (queue-before-source ordering)](https://github.com/partom24/HartLogistics2/blob/0ea3000651c116b0fa1acc2836ab7e1bcfbc6269/addon/behavior_pack/scripts/main.js#L2305)
- [`dequeueToReceiver` L2392 (virtual debit-before-physical credit)](https://github.com/partom24/HartLogistics2/blob/0ea3000651c116b0fa1acc2836ab7e1bcfbc6269/addon/behavior_pack/scripts/main.js#L2392)
- [`journalQueueState` L2469 and `recoverQueueJournal` L2496](https://github.com/partom24/HartLogistics2/blob/0ea3000651c116b0fa1acc2836ab7e1bcfbc6269/addon/behavior_pack/scripts/main.js#L2469)
- [`processCollectorIngress` L3508 (direct-only fallback)](https://github.com/partom24/HartLogistics2/blob/0ea3000651c116b0fa1acc2836ab7e1bcfbc6269/addon/behavior_pack/scripts/main.js#L3508)
- [`recordDirectReceiverTransfer` L1741](https://github.com/partom24/HartLogistics2/blob/0ea3000651c116b0fa1acc2836ab7e1bcfbc6269/addon/behavior_pack/scripts/main.js#L1741)

## 1. Source-derived transaction ordering and custody boundary

| Transaction | Actual original operation order | Source-level recovery branch | Native API opportunity / limit |
| --- | --- | --- | --- |
| **Hopper → Q4 (ordinary)** | Journal prepare → queue page/entry credit → queue metadata commit → physical source Hopper debit → journal clear | Page/metadata before = clear untouched journal; after = finish source debit; conflicting/unknown = retain | Native container slot reads/clone exist, but **no documented 2.7 native Hopper→World-property atomic move**. `Container.transferItem` cannot deposit cargo into a primitive virtual FIFO. |
| **Q4 → Hopper (ordinary)** | Journal prepare → queue head/page debit → queue metadata commit → physical Hopper destination credit → clear | Before = clear untouched; after = finish physical destination credit; already credited = clear; mismatch = retain | `Container.addItem` may help native slot admission, but it does **not** commit virtual FIFO debit atomically or promise Hart partial-stack slot precedence. |
| **Dropper/Dispenser item entity → Q4** | Journal → virtual queue credit/metadata → remove original item entity → clear journal | Queue after: remove exact matching entity ID if accessible; missing entity and source block loaded: clear, **assuming removal already completed** | Native `EntityItemComponent` and `Entity.remove` exist, but do not document atomic native world-entity removal plus virtual queue credit. Entity lifetime/pickup/despawn assumptions require BDS. |
| **Opaque source Hopper → physical Receiver output Hopper** | Only when queue empty, output Receiver loaded, redstone valid, native output has capacity → physical move → diagnostic/lifetime counter update | Uses physical journal/`safeMovePartial` recovery, not Q4 journal. If diagnostic count persistence fails, source explicitly declines to replay already-moved cargo | Native `moveItem/transferItem` are **candidate** physical primitives but have no amount parameter in the 2.7 declarations and no documented cross-journal atomicity. |

## 2. New source-executed tests

| Suite | Cases | Canonical functions executed | Result |
| --- | ---: | --- | --- |
| [`level2_q4_recovery_states.test.mjs`](tests/level2_q4_recovery_states.test.mjs) | **21** | Actual `journalQueueState`, `queueMetaMatches`, `queueSlotState`, `recoverQueueJournal` | PASS: queue metadata switch, untouched/after enqueue and dequeue, identity/quantity conflicts, unavailable Hopper/Receiver, unreadable queue, entity removal matching, entity missing/unloaded |
| [`level2_direct_only_guards.test.mjs`](tests/level2_direct_only_guards.test.mjs) | **9** | Actual `processCollectorIngress`, with injected native-shape source Hopper/output Receiver mocks | PASS: FIFO backlog gate, loaded Receiver requirement, powered Collector/Receiver, locked input/output Hoppers, stale-queue-counter fallback, post-transfer counter failure |
| Previous source-only suites | **69** | Canonical scheduler, native slot acceptance, item serialization, physical journaling, redstone and filter/Auto behavior | PASS — distinct source witness domains |
| Separate version declaration suite | **11** | Pinned npm 2.7.0 TypeScript declarations (read, not executable game API) | PASS — method signatures/version availability only |

**Mock limitations:** A mocked Hopper slot is not an actual native inventory; a JavaScript error cut is not a BDS crash or saved partial world state; mock entity availability is not proof of Bedrock despawn/pickup/restart behavior. These tests establish control-flow outcomes **given specified observed states**.

## 3. Specific custody hazards: source-known versus runtime-unknown

| Finding | Exact original source behavior | Risk if premise fails | Evidence / priority | Mandatory design gate |
| --- | --- | --- | --- | --- |
| **L2-Q4-01 — Unknown Q4 state can enable direct bypass** | At `processCollectorIngress` L3561–3566, code starts from cached `receiver.queued`, **catches `loadReceiverQueue` failure without stopping**, and allows opaque direct physical transfer if fallback count equals zero and Receiver/output are valid | If actual Q4 backlog exists but queue read fails/stored count is stale zero, direct cargo may overtake FIFO items; bookkeeping then also cannot load Q4 and falls back to counters. | **SOURCE-CONFIRMED conditional fail-open; high-priority correctness blocker**. Test reproduces mocked unreadable queue + cached zero. **No claim this occurred on owner BDS.** | **Do not authorize native direct movement when current authoritative queue state is unknown**. Preserve physical item at source or explicit safe HOLD. Do not infer zero from stale count. |
| **L2-Q4-02 — Absent entity assumed already removed** | At `recoverQueueJournal` L2596–2628, if credited entity ID cannot be fetched and the originating Dropper/Dispenser block is loaded, original code clears journal as "completed" | If the entity became absent for a reason other than Hart's intended removal (pickup/despawn/entity lifecycle, save ambiguity), the proof of exactly one owner needs reconsideration | **SOURCE-CONFIRMED inference; runtime ambiguity**. No BDS evidence of a loss/duplication incident. | Require an independently provable entity custody transition or an explicit HOLD rule for uncertain ownership before certifying native event→queue handoff. |
| **L2-Q4-03 — Hopper redstone read failure can appear unlocked** | `hopperIsRedstoneLocked` in original source catches state-read failure and returns false; earlier Level 2 test proves that mocked branch | If a state error happens while the source Hopper is actually powered, script may edit an inventory the engine would consider locked | **SOURCE-CONFIRMED fail-open under exception; runtime occurrence unknown** | Unknown native power/state must **not** grant permission to move; define revalidation or HOLD at the transaction boundary. |
| **L2-Q4-04 — Journal replay requires correct state observations** | Source matches `qBefore/qAfter`, exact metadata snapshot and source/destination amounts/signatures; when they conflict it retains journal | A non-atomic engine save could present combinations beyond the trusted recovery matrix; it would be unsafe to infer settlement from only one record | **SOURCE test passes** conflicting-state HOLD. **Actual durability unknown** | Native API replacement cannot remove journal or change commit ordering based on type signatures or mocks. Demonstrate full BDS persistence state transitions when authorized. |

The first three are **targeted engineering risks** found without implementing any new scheduler, FIFO, carrier or transport engine. They are **not proof of production corruption**. The owner mandate requires preserving 1.4.1 world data and sorting semantics, so these are blocking questions for eventual native substitutions.

## 4. Recursive decision gates after these tests

1. **M19/M20/M27 (native Hopper interfaces):** Keep original redstone-facing and physical capacity policies. The exact 2.7 signature of `Container.transferItem` or `moveItem` cannot replace Hart's original **1–16 item** scripted move as a drop-in; fully native transfers remain candidates **only** for cases proved semantically compatible.
2. **M21–M24 (virtual Q4):** `World.setDynamicProperties` is an API for multiple property values, not a certified atomic database; 250,000 virtual items and migration remain Hart-specific, and unknown queue loads must never imply empty/available.
3. **M25/M30/M40 (opaque and entity cargo):** Preserve the original native ItemStack where possible, but ensure the item has **one unambiguous owner** across each boundary. Entity removal/restart guarantees cannot be answered by source-level tests.
4. **M01/M35 (scheduling):** Scheduler tuning cannot correct unknown queue ownership, and a newly "native" transport operation must not bypass the original FIFO/journal gates. These decisions precede any rewriting.
5. **R6 (BDS):** No target BDS version/runtime was exercised, no TPS/CPU results obtained, no real metadata-rich items moved, no world reset/update. Actual engine validation remains outside the **source-only** authorization.

## 5. Next work allowed without owner involvement

Continue **read-only source + exact 2.7 declaration** assessment, classify unresolved native placement / inventory/custody surfaces against original code and test only concrete decision paths with deterministic, source-executed mocks. A green CI check may authorize **evidence recording**, **not** replacing runtime files or accepting the addon as functional at scale.

**Bottom line:** The native inventory API offers useful operations, but the central question is not "can Bedrock move this stack?" It is "**when is that movement authorized, does it respect Hart's FIFO/priority semantics, and how is single ownership proven after interruption?**" These gates remain even if physical transfer is native.
