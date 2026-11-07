# Hart Logistics — Receiver Q4 to Q5 and Native MR Lane

**Design only. No queue schema has been changed.** All 1.4.1 persisted state and behavior must survive. Related [architecture](LOGISTICS_DESIGN.md) / [test plan](COMPATIBILITY_TEST_PLAN.md).

## Why migration is required

1.4.1 Receivers store a persistent **q4** FIFO queue of quantities and item definitions with an associated journal and recovery logic, and support older q2/q3 formats. The owner expects FIFO and its head-of-line blocking to restrict network-aware sorting throughput. We need destination-aware ordinary-item selection without losing old queue contents, links, counters, recovery, redstone pause or hopper outputs.

## Proposed Q5 state (not final schema)

- **Ordinary lane:** bucketized counts by lossless item identity, capacity accounting, destination-aware scheduling and bulk reserve/acknowledge operations.
- **MR lane:** native ItemStack slots and container operations (where platform support and experiment policy allow). MR stacks **must never** be reconstructed from incomplete serialized properties.
- **Coordinator:** bounded scheduler with MR preference and ordinary-lane fairness. Preserve legacy FIFO behavior for ungoverned/legacy output paths unless a separately tested change is approved.
- **Journal:** durable transaction ID, source, destination, quantity or native slot reference, phase, committed balances and reconciliation markers; exact format and write ordering TBD.
- **Capacity:** preserve legacy Receiver **250,000-item** limit. Whether physical MR slots count against the cap, or add an independent constrained allowance, remains undecided.
- **Native custom block container gate:** verify that target server 1.26.63.1 and client 26.63 offer the necessary *stable* inventory APIs without enabling experiments. If not, no silent dependence on experimental toggles; choose an explicitly approved alternative or defer that feature.

## Explicit MR pathway replacement decision — owner selected native containers

**Decision (2026-11-06):** Retire the **restricted direct-only Q4 MR fallback as the final design**, replacing it with native custom-block ItemStack custody in **both Collectors and Receivers**, provided platform compatibility and data-safety acceptance gates pass.

### Required post-migration routes

| Source | New MR ingress / custody | MR egress (must remain safe) |
| --- | --- | --- |
| Directed Hopper → Collector | Move eligible native ItemStack into Collector's actual MR container, or leave it unchanged in input Hopper if full/unavailable | Collector native MR container → linked Receiver native MR container when transfer can be proven safe |
| Sorter → facing linked Collector | Preserve Sorter filter/priority decisions; safely move MR to Collector native slots rather than rejecting solely for Q4 serialization | Same linked Receiver MR channel; do not bypass Sorter or Collector redstone semantics |
| Receiver native MR slots | Retain exact native stack while downstream is full, paused or unloaded | Receiver → immediately-below Hopper (existing physical path), or Receiver → Transporter → Sorter when that feature is separately approved |
| Dropper/Dispenser actual item ejection → Collector | Must not despawn or remove the item entity before it has an owned safe destination; design a native MR acceptance path for ejected items subject to existing pulse guards | Same guarded Collector → Receiver native MR route; this is a proposed expansion, not a baseline capability |

**Success criterion:** any MR item class accepted by legacy physical routing must still reach its supported destination safely, while a now-blocked MR item can **remain persistently buffered** instead of requiring Q4 to be empty and an immediately available output Hopper. The native path should permit item types previously rejected from Q4, subject to faithful native handling.

### Transition requirements

- Keep legacy fallback functionality **during the migration/compatibility period** so older worlds and older supported feature configurations are not broken. Once new native custody is verified for existing blocks/paths, replace the old fallback rather than carrying both as permanent competing implementations.
- First prove native inventory creation for **already-placed** custom blocks (not just newly placed ones), and that native slots persist over restart, unload and world upgrade; preserve original identifiers.
- A **loaded Collector / unloaded Receiver** must keep MR owned in persistent Collector native slots. Do not move ItemStacks through nonresident block inventories or turn them into serialized buckets.
- If old Q4 records contain MR entries, migrate only those that can be reconstructed with **verified exact fidelity**; otherwise quarantine safely for operator review without deleting or assuming metadata.
- Define exactly-once / reconciliation behavior for failures before destination insertion, after destination insertion and before source acknowledgment. Prevent dual custody across Collector and Receiver.
- No custom-container experiment toggle may be enabled implicitly; if target runtime does not support required behavior, halt that part of the upgrade and preserve pre-migration item custody without shipping a lossy substitute.
- Retiring the old fallback is allowed **only when the equivalent end-to-end capability has passed copied-world regression acceptance**, including the old Hopper→Collector→Receiver-output-Hopper route and all state guards. This is a **behavior-preservation obligation**, not an instruction to keep the old algorithm forever.

## Required migration protocol

1. **Preflight:** identify original block pack UUID, block ID, dimension and coordinates; detect queue version, q4 journal activity and legacy q2/q3 conversion. Work only on valid/known structures and a copied-world backup.
2. **Quiesce one Receiver:** prevent new intake/output for that Receiver while maintaining a durable reason/marker; do not blanket-pause unrelated Receivers without a documented need.
3. **Recover q4 first:** complete or safely resolve pending q4 journal stages. Any ambiguous write or identity must stop migration in safe hold, not guess.
4. **Snapshot authoritative source:** freeze q4 as read-only migration input. Record total count, per-lossless-identity count, any non-bucketizable item record, links, options, counters and integrity digest.
5. **Stage Q5 elsewhere:** write new Q5 pages/slots using new namespaced keys; do **not** destructively edit q4. Separate complex/MR items only by a proven lossless path. If an existing q4 record cannot recreate native metadata exactly, do **not** claim conversion preserves it.
6. **Validate:** compare quantities, item identities, cap, source metadata fidelity where observable, counters and journal reconciliation. Mark failed/uncertain records explicitly; require a clean result.
7. **Commit authority:** persist a durable cutover marker in a well-defined order so a crash before commit resumes q4, and after commit resumes Q5 only. Never deliver the same item from both formats.
8. **Post-cutover observation:** run high-risk copied-world tests with transfers, restarts and chunk unloads; keep q4 retained as historical recovery evidence but never replay stale q4 as active after Q5 moves items.
9. **Retirement:** remove legacy storage only with an explicit migration-retention policy and verified restore procedure. Do not delete q4 on the first successful boot.

## Edge cases that must be tested

- Empty, partially full and full Receivers; representative ordinary item IDs; **at least two distinct ordinary item identities** for bucket segregation; many unique identities when specifically stress-testing bucket indexing; one massive bucket; q4 page boundaries; genuinely different stack-limit classes. Do not require cobblestone, glass and sand separately if equivalent under the behavior being tested.
- q2/q3 history; q4 journal each phase; power loss before/during/after Q5 cutover; crash after destination insert but before source acknowledgment.
- Redstone pauses, old hopper output, Dropper/Collector links, Receiver placement/breaking, chunk unload and cross-dimensional identities if supported.
- Representative **MR metadata mechanisms** (enchantments, attributes, potion data, lore/name, custom properties, sacks with contents, custom item forms, unusual stack limits or unknown components), selected for the relevant behavior rather than exhaustive item-ID coverage; preserve exact native properties through transfer/restart. Add a specific item regression case only for a proven special semantic or defect.
- Missing or incompatible experimental container feature in an existing non-experimental world: preserve item custody; fail closed, never auto-enable world experiments.
- Transfer starvation/priority behavior at mixed load, including ordinary lane progress while MR items are continuous.
- Controller missing, network split, stale capacity advertisement and wildcard gating.

## Acceptance gates (no shortcut)

- **SOURCE REVIEW:** map every existing 1.4.1 q4 key and exact journal transition; map applicable Minecraft APIs and item metadata limits.
- **OFFLINE PASS:** deterministic property/invariant tests and fault-injection migration fixtures for each crash point, with exact counts and identities.
- **RUNTIME OBSERVED:** actual target 1.26.63.1 server / 26.63 client on copied worlds, with experiment configuration recorded, comparing pre/post data and behavior.
- **INTEGRATION ACCEPTED:** all original paths and new lanes work under load/loop/unloaded conditions; no duplication or loss; owner reviews evidence.
- **RELEASE APPROVED:** owner separately authorizes exact artifact; PR/CI success alone is not enough.

The user's prior native container-to-container MR testing is **owner-reported evidence**, not a Git-committed test fixture or proof that custom block-entity containers are stable in this runtime. Import or link the original test evidence before claiming that specific new integration is proven.

