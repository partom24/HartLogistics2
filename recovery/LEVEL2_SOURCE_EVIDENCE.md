# Level 2 source-only verification — original Hart Logistics 1.4.1

**Status:** SOURCE-EXECUTED / MOCK PASS, **not Bedrock runtime acceptance**. **Authorized scope:** source-only tests (no installed pack, no LAB/production access, no world mutation). **Date:** 2026-11-14 (America/New_York).

**Canonical implementation:** untouched `addon/behavior_pack/scripts/main.js` at original import `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`; source-only extraction from the actual 1.4.1 file. The archived 1.5 branch supplied **no code, mock, fixture, implementation, or test output**.

**Verified test run:** [GitHub Actions 43671712318](https://github.com/partom24/HartLogistics2/actions/runs/43671712318), exact commit `de7c41e25f41e7e5c97cef390ff6d77739b74d77`. Baseline provenance job PASS, 1.4.1 source-executed Level 2 job **43/43 PASS, 0 failed**. This report itself is documentation and has its own later CI revision; do not infer that a future change is tested by the earlier SHA.

## Source-only test implementation

| Test file | Cases | Original source executed | Native method / architecture decision affected |
| --- | ---: | --- | --- |
| [`recovery/tests/level2_source_contracts.test.mjs`](tests/level2_source_contracts.test.mjs) | **30** | `schedulerTick`, `processColumn`, `compactSourceHopper`, `findAcceptSlot`, `serializeQueueItem`, `exactStackSig`, `hopperIsRedstoneLocked`, `blockIsRedstonePowered`, `sourceIsTriggered`, `reconcileDisplays`, `normalizeQueuePage`, `persistQueuePage`, `queueDefinitionHash` | Hopper observation and idle-work cost; Native `Container.emptySlotsCount/firstEmptySlot/transferItem` substitution constraints; ItemStack fidelity; redstone/events; Q4 page guards; visual census |
| [`recovery/tests/level2_journal_faults.test.mjs`](tests/level2_journal_faults.test.mjs) | **13** | `safeMovePartial`, `recoverJournal`, `safeJsonParse`, `splitRegistryPayload`, `saveRegistry` | Native inventory movement plus custom transaction journal; simulated pre-debit, debit-only, credit-only, complete and ambiguous states; registry generation-switch ordering |

The first suite uses original function bodies isolated with JavaScript VM contexts. The second executes the original physical transfer/recovery functions against deterministic mock Containers and a *serialized-string* mock dynamic property. The tests verify **decisions and source effects**; no mock is presented as proof of how Bedrock's engine handles a real `Container.transferItem`, `Container.moveItem`, world save, real ItemStack metadata, concurrent writers or server tick performance.

**Run locally (Node.js only):** `node --test recovery/tests/*.test.mjs`. These two suites run after `python3 tools/recovery_baseline_guard.py` in the recovery GitHub workflow; the original 72-file add-on and 1.4.1 ancestry gate must pass before the source-only job.

## Determinate findings from executing the ORIGINAL code

| ID | Source-executed finding | Architectural significance | Evidence boundary |
| --- | --- | --- | --- |
| **F01 / M01** | With **1,387 synthetic idle columns**, `schedulerTick` invokes `processColumn` for **all 1,387 per tick** and rotates the start. The 256-item movement budget ends early only if work actually moves items. | A movement budget is **not** a no-work scan budget. Faster per-move native methods cannot alone remove O(C) idle observation. | Source call count only; not TPS/CPU attribution. |
| **F02 / M03–M04** | An empty but eligible five-slot Hopper causes **15 getItem calls** within the actual `processColumn` + two `compactSourceHopper` passes; Sorter eligibility is checked first. | `emptySlotsCount` may be a valuable early native check, but it is **not** an event and is not yet benchmarked; powered Hopper/Sorter exits before inventory work. | Synthetic Container counts, not native timing. |
| **F03 / M07/M10** | `findAcceptSlot` **prefers a compatible partial stack even if a lower-index empty slot exists**; a fully occupied container can still accept a merge. | Replacing its logic with `firstEmptySlot` or interpreting `emptySlotsCount===0` as blocked **would violate baseline semantics**. | Real native `transferItem` slot choice remains unproven. |
| **F04 / M25/M40** | Q4 serialization rejects an unknown nonstackable item and a candidate whose reconstructed ItemStack is not stack-compatible; accepts a conservatively reconstructed ordinary stack in the mock. | The original virtual queue has a deliberate fidelity boundary; cannot flatten opaque items. | Simulated ItemStack behavior only; does not prove real metadata preservation. |
| **F05 / M40** | Two synthetic stacks differing only by an undisclosed `hidden` field produce the same original `exactStackSig`. | The hand-written journal signature is **not a general proof of every possible metadata field**; one must not use it to certify opaque custody. | No demonstrated real Bedrock duplication/loss; original serialization may reject some item classes. |
| **F06 / M17** | `hopperIsRedstoneLocked` reports lock for native `toggle_bit=true/1`, but **returns unlocked on a state-reading exception**. | Source-level fail-open behavior needs explicit safety review for any custody mutation on uncertain power state. | A thrown mock read does not prove a real engine exception occurs. |
| **F07 / M15–M16** | `reconcileDisplays` queries all **three dimensions even with zero Sorters**. With 1,387 registry entries, it evaluates all 1,387 and still performs three broad display queries. | Native frames/static geometry and scoped local repair may eliminate recurring work. | Source counts only, no inferred render CPU or entity cost. |
| **F08 / M21–M22** | Q4 packed-page parser rejects out-of-bounds/sparse/zero rows; page writer refuses over-limit serialized strings before writing and makes one property write for a bounded page. | Preserve these invariant checks if native persistence APIs are used; batch property writes do not prove atomic durability. | Mocked world property, no persistence readback. |
| **F09 / M11–M12** | Original physical move writes a journal, then source debit, destination credit, then journal clear. Mock recovery handles prepared untouched, debit-only, credit-only, completed, ambiguous and unavailable states according to its code paths. | **Keep a durable custody contract** around native movement until actual engine save semantics are verified. | Synthetic interruption, not a crash / disk-atomicity pass. |
| **F10 / M13** | Registry splitting avoids cutting a UTF-16 surrogate pair; inactive shards write before new generation metadata; simulated metadata write failure leaves previous generation marker. | Retain generation switching and verification when changing persistence. | JavaScript write order only, not stable world-save ordering. |

## Level 2 grouped proof status

| Group | Status under this owner authorization | What remains unproved |
| --- | --- | --- |
| P1 Hopper observation/scheduling | **Source-executed witness PASS** | Whether an equivalent lower-work native observer exists and actual server tick cost |
| P2 Native movement/slot rules | **Original source semantics PASS** | Actual `Container.moveItem/transferItem/addItem` engine behavior, slot selection and metadata |
| P3 Metadata and persistent ownership | **Q4 rejection/signature witnesses PASS** | Real original ItemStack persistence, complex opaque metadata, secure host and crash lifecycle |
| P4 Native event/redstone/visuals | **Original source behavior PASS** | Callback coverage on Bedrock, actual unloaded/changed-world visuals and redstone state |
| P5 Q4 property and physical recovery | **Original source fault mock PASS** | Real multi-property/physical save ordering and nonempty Q4 migration in BDS |
| P6 Profiling and scale | **Source call-volume witnesses PASS** | Actual 20 TPS server health, API cost, useful items/s, queue drain on owner world |

## Explicit rejection criteria already derivable from SOURCE

- **Do not propose** `firstEmptySlot()` as an equivalent full replacement for `findAcceptSlot`: F03 disproves the equivalence.
- **Do not propose** `runJob`, `onTick` or player-inventory events as if they provided a documented native Hopper-item-change signal: see [Level 1 API research](../LEVEL1_NATIVE_API_RESEARCH_141.md).
- **Do not equate** a correct mocked native Container transfer with a crash-safe Q4 debit or exact metadata preservation.
- **Do not treat** successful source execution as runtime performance evidence. No Level 2 test measures Bedrock TPS or exercises real engine APIs.
- **Do not import** any 1.5 implementation or tests, alter the original `addon/`, or run an owner-world session under this source-only authorization.

## Closure criteria for any future implementation

A native substitution recommendation requires (1) original 1.4.1 M-ID and behavior, (2) official API contract and exact 2.7 method availability, (3) **source-only semantic compatibility**, (4) smallest remaining Hart-only logic, (5) cost model and **actual BDS measurements when authorized**, (6) identity/queue/transaction and restart proof, and (7) an identified exact artifact. A documentary candidate or these 43 source tests alone can never close those runtime gates.

**Current decision:** source-only foundation is in place. No new native substitute has been implemented or selected as proven. The administrative lock of the frozen branch remains unresolved separately in [issue #82](https://github.com/partom24/HartLogistics2/issues/82).
