# PG33 — Receiver Q4 → Transporter → Sorter ordinary delivery

**Status:** Developer source candidate; source/CI tests pending. **NOT authorized for LAB installation yet.** No launcher or deployment tool exists for PG33 in this phase. Do not manually copy packs or alter registrations.

## The practical feature, why it matters, and what success unlocks

**Feature:** Let a pre-existing, registered Receiver with an already-committed Q4 queue deliver **eligible stackable queued items** through up to 16 Transporter pipes (same chunk), into an existing Sorter column, then into an **empty slot** in an ordinary destination chest/barrel. This adds an ordinary physical output alternative to a direct Hopper under the Receiver; it does **not** create Q5 storage or a second Receiver queue.

**Why:** Today PG27's ordinary Transporters can accept chest/barrel inputs, but Receiver queue output still depends on its original Hopper egress. PG28 tested a source-only sketch and closed without deployment. PG33 is a hardened, rebuildable candidate for that missing gameplay route, without attempting migration or re-running the earlier diagnostics.

**What future bounded LAB success would unlock:** Acceptance of *this particular ordinary Q4 Receiver output via Transporter* in a small fixture, opening further Transporter integration. It would **not** prove crash-atomicity or native MR/Bulk/Q5 ownership.

## Explicit source constraints

- Build solely from PG27 1.5.10; original immutable 72-file 1.4.1 `addon/` unchanged. Candidate version 1.5.15 is a build identifier, not installed evidence.
- Q4 remains sole queue authority. Extend **the existing** `dequeueToReceiver` journaled debit/physical-credit writer using optional precommit evidence. No new Q4 storage, no physical writer in the overlay, no migrations initiated, no old Q2/Q3 head initialized.
- Only one loaded, physically verified registered Receiver, one Sorter endpoint, <=16 fully loaded same-chunk pipes, no competing inventory/Receiver/Hopper outputs. A Hopper **beneath** the Receiver takes precedence; a second disconnected pipe attachment also refuses.
- Respect Sorter Filter > Auto > Wildcard priority, redstone power, bypass, output block and empty native slot, and PG25 held journal/recovery. New pipe output does **not** merge into occupied native slots, enqueue into Collectors, or handle nonstackable/metadata-opaque Q4 heads.
- Reconfirm Q4's committed metadata string and the same FIFO queue-head ID/amount/serialized identity before the existing dequeue transaction journal begins. Refuse topology, selected Sorter, destination or Q4-state drift. A source-only recheck is **not** a guarantee against external vanilla/foreign concurrent writes or crashes.
- If any guard fails, do nothing; never repair/force-clear/auto-replay an unresolved journal. The existing Hopper path must remain byte-behavior-compatible.

## Future LAB test—purpose, PASS and evidence (not currently requested)

**Purpose:** Prove Receiver queued item delivery through a real Transporter graph, *not* merely a script callback or a visual connection.

**Setup:** One existing registered Q4 Receiver **in a safe, unloaded-ambiguity-free isolated area**; first ensure any legacy output Hopper is absent without disturbing stored/queued items, or use a new Q4 Receiver filled through the existing Collector pathway if the pre-existing configuration cannot be safely modified. One Receiver → short same-chunk Transporter line → one Sorter → ordinary chest/barrel with empty slots. A temporary new Receiver would be preferable to editing any of the owner's **35 populated historical Receivers**, subject to a future approved rig plan. No world reset or queue drain.

**Required PASS evidence:** Record exact Q4 queued count and output slot counts and identities *before*; demonstrate powered pause does not debit Q4, unpowered exact queued delta equals physical output increase for one approved ordinary item stack, both journals clear, Hopper-precedence remains unchanged on existing paths, and no Q5 migration. Verify output after normal LAB restart only if separately scoped; no forced crash or reboot as a default.

**HOLD:** Any unknown source/graph or extra endpoint, unavailable chunk, power ambiguity, pending journal, Q4-v4 mismatch or unknown item, missing/mismatched count, unexpected Hopper/Collector transfer, or installer/preflight mismatch. Stop; retain all backups and do not manually repair queue.

**Not tested here:** Actual Bedrock Q4 debit, world-save crash consistency, lossless MR variants, cross-chunk topology, double chests, vanilla Hopper/foreign add-on isolation, Q5/Bulk migration or production.

## Source preparation only

When CI is available, run the automatic source gates:

```bash
python -m unittest discover -s tests -p 'test_pg33_candidate_build.py' -v
python candidates/pg33/prepare_candidate.py
node --check --input-type=module < build/pg33-lab/behavior_pack/scripts/main.js
node --test tests/test_pg33_receiver_q4_mock.mjs
```

The generated `build/pg33-lab` is **not** a Bedrock deployment approval. Existing LAB stays PG27 until a **separate guarded exact-PG27 stopped-LAB upgrade/rollback package** is implemented and has green CI. Explicitly explain the test objective and success unlock *before* requiring any owner time.
