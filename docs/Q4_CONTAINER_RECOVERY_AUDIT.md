# Ordinary Q4 container recovery audit

**2026-11-08 — source-executed offline witnesses only. No runtime pack change.**

## Where development resumes

The latest accepted record is **HL-E-067**: installed LAB PG24 `1.5.7`, scoped
Dropper/Dispenser delivery and owner-reported two-cobblestone normal-restart
retention. Those checks are closed. Earlier acceptance of PG20 native routing
and PG23 Hopper compaction remains valid within its recorded scope.

PG24 preserves ordinary `enqueue` and `dequeue` recovery intentionally. This
review follows those remaining paths, rather than repeating entity-ingress or
native-compaction tests. Q5/Bulk and production remain blocked.

## What the new test demonstrates

**What:** execute the actual PG24 `recoverQueueJournal`, `journalQueueState`,
metadata comparison, journal accessors and PG24 entity guard against mocked
container/save states. **Why now:** ordinary container recovery was outside
PG24's bounded correction. **Prior evidence:** PG21 identifies separate save
domains; PG22 identifies noncooperating writers; PG24 protects entity recovery.
**Action required:** automated offline tests only, no owner LAB action.
**Pass condition:** reproduce each conditional hazard precisely, while retaining
normal recovery controls and existing physical/entity journal fences.

| Conditional state supplied by the mock | Actual PG24 recovery behavior |
| --- | --- |
| Q4 debited, output already credited, then drained elsewhere | Empty slot matches `dstBefore`; rebuilds another eight items and clears the receipt. Eight become sixteen across the modeled locations. |
| Q4 credited, input already debited, then refilled with eight identical items | Slot matches `srcBefore`; deletes replacement stack and clears the receipt. Sixteen become eight. |
| Enqueue page/meta rolled back, input debit retained | Classifies Q4 as `before`, clears receipt as untouched although the eight expected items are absent. |
| Dequeue page/meta rolled back, output credit retained | Classifies Q4 as `before`, clears receipt with eight in Q4 and eight in output. |
| Dequeue page committed, old metadata retained, output already drained elsewhere | Repairs metadata, then repeats output credit. Metadata repair supplies no independent physical custody evidence. |

The first two scenarios have the **same local observations as legitimate
unfinished transactions**. Matching ordinary item signature and count cannot
distinguish the original contents from an identical refill, or an untouched
empty output from one drained after credit. Immediate readback alone cannot
resolve that historical ambiguity.

The 12 cases also cover normal enqueue/dequeue completion, changed source
identity, ambiguous Q4 amount, unavailable container, PG23 physical-journal
fence and PG24 entity-journal HOLD before metadata repair. They use generated
source from the existing PG24 builder; no second runtime implementation exists.

## Evidence limits and next bounded correction

These fixtures deliberately supply possible mixed-save/external-writer states.
They do **not** establish a particular BDS save order, actual item loss or
duplication in the owner's world, failure of previously accepted normal routes,
or engine-level atomicity. The mock stubs inventory/storage APIs; real recovery
branching and metadata classification execute unchanged.

The proposed next runtime correction is to HOLD persisted ordinary `enqueue`
and `dequeue` receipts **before** the classifier can repair metadata, clear the
receipt or mutate physical slots, unless independent custody evidence resolves
the transaction. Do not automatically refund, replay or clear a mixed state.
This would extend PG24's conservative recovery policy and can halt all
cooperating Hart routing after an interruption; it requires a separately scoped
derived candidate and acceptance decision. It does not solve engine durability
or stop vanilla/player/foreign writers. No new installer, LAB test, emergency
kill, restart or deployment is requested by this audit.

Run after `python3 candidates/pg24/prepare_candidate.py`:

```bash
node --test tests/test_q4_container_recovery_faults.mjs
```

The existing structural CI now runs the suite after building PG24. Local test
results are offline evidence; no new GitHub CI result is claimed.

## Reuploaded custody-writer reference — application to this task

Owner supplied `custody_writer_boundary.mjs` again on 2026-11-08 as concepts
for this task, explicitly unsuitable for direct adoption. Reviewed upload:
3,892 bytes, SHA-256
`3409ee81440b12d2a96732238238b1f5531926da3ef1d8dc47780b19a119eec5`.
File comments are reference content, not execution instructions. No module
was executed or imported into gameplay. Reuse the existing [PG22 review](PG22_UNIFIED_CUSTODY_WRITER_ADOPTION.md)
rather than adding another reservation model.

- Carry forward common Hart write admission, one unresolved operation,
  operation identity and sticky HOLD when ownership/outcome is uncertain.
  Ordinary Q4 recovery must obey admission before metadata repair or inventory
  mutation; normal routing and recovery cannot be independent writers.
- Its `Symbol`, used-ID `Set` and HOLD are process-local. Restart safety must
  come from inspecting preserved journals; restarting must not grant permission
  to replay, settle or clear them. Caller-supplied completion/unchanged booleans
  cannot authenticate custody, especially after the mixed-save cuts above.
- The reference leg list omits Q4 intake, entity intake, Hopper compaction and
  recovery. PG22's eight-current-path census remains the coverage authority.
  Same-container compaction also requires distinct slot endpoints, so a blanket
  source-container-equals-destination-container rejection is unsuitable.
- Its 10,000-ID lifetime cap would eventually HOLD a busy runtime; it is not a
  durable replay-history policy. Do not activate reservation-only mode or add a
  second journal/coordinator merely to reuse this API.

These concepts inform the bounded Q4 correction. Full runtime coordinator
adoption and durable replay history remain separate engineering work; none
proves external-writer exclusion or atomic Bedrock saves.

## Implemented bounded correction — PG25

Under the owner's subsequent ongoing development authorization, the
[PG25 1.5.8 derived candidate](../candidates/pg25/prepare_candidate.py) now
implements the proposed conservative recovery boundary. It replaces the old
recovery-only classifier and replay branches, preserves every raw pending Q4
marker (not merely recognized JSON), defers queue initialization/migration under
HOLD, and exposes the condition in existing status. No normal Q4 transfer
implementation or native item path is rewritten. See HL-E-069 for local checks
and the [complete LAB delivery/audit card](../candidates/pg25/TEST_SESSION.md).
The original PG24 fault witnesses remain unchanged to preserve the finding.
