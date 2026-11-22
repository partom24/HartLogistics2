# Fresh routing performance and Q4 offline integration · November 22

## Source and server evidence

| Runtime | What the source does | Consequence for Fresh |
|---|---|---|
| [Original 1.4.1](https://github.com/partom24/HartLogistics2/blob/0ea3000/addon/behavior_pack/scripts/main.js) | The one-tick scheduler rotates its starting column and spends its budget on movement. Empty columns can all be visited. Logistics separately polls Collectors and Receivers. The Q4 journal and definition records preserve ownership across interruptions. | Retain Q4 definition verification and replay protection. Keep network discovery outside the per-item hot path. |
| [Last 1.5.x attempt, URCE 1.5.13](https://github.com/partom24/HartLogistics2/tree/64405b02fd99b6aee42108423ddf575bc3484c46) | The scheduler retains its live movement checks. Receiver link safety iterates linked Collectors. The governed Filter observer rechecks the witnessed path, target and physical admission. | Preserve refusal on ambiguous routes, stale endpoints and full destinations. A stalled queue must not start a network traversal every tick. |
| [Fresh LAB 0.5.13 before this change](https://github.com/partom24/HartLogistics2/tree/5658a0aa40f834b0f705710a23715aa513cbe0f1) | Indexed destinations, staggered passive Hopper taps, and live checks at the addressed tap avoid sweeping all Sorters on every tick. The shared block helper still looked up the dimension on every call. Empty active Hoppers incurred per-slot reads. | Reuse each dimension handle within the script runtime. Read each block and inventory live. Use the native empty-slot count to skip empty Hoppers. |

Earlier offline idle measurements on the 13-bank workload were 829.56 block lookups/tick on original 1.4.1, 234 on URCE 1.5.13 and 56.88 on Fresh 0.5.11. The installed 1.5.11 stalled-drain profile attributed 9.40 of 10.19 inclusive Receiver-drain seconds to link safety. That capture predates the final 1.5.13 changes. The historical Fresh timing capture included a 202.892 ms peak. These are different workloads and builds. [Historical measurements and provenance](ENGINE_TICK_COMPARISON_20261121.md)

Microsoft recommends profiling a representative workload, reducing repeated native queries, limiting ticking areas and splitting long background tasks into bounded steps. For Fresh, keep the tick deadline for an item passing a Filter. The census can yield between work units. Keep census enumeration out of ordinary routing. When moving beyond the one-shot rehearsal, verify a frozen checkpoint once and then check the current account, receipt and destination on each bounded debit. The current trial deliberately still performs the full audit per command. A production-scale drain needs a durable single-writer cutover before it can use that optimization. [Bedrock scripting performance](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/script-performance?view=minecraft-bedrock-stable) · [Scheduling and job guidance](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/system-run-guide?view=minecraft-bedrock-stable)

## Matched Fresh measurements

Node v24.22.3 executed the same instrumented fixture against the baseline above and this revision. One warmed-up dimension, 101 Hopper columns, 505 Filter Sorters. The five destinations at columns 21, 41, 61, 81 and 101 each received 20 items per traffic run. Managed traffic used five 20-item stacks. The inline workload injected one item every eight ticks. The mock simulates native forwarding separately. A linked Fresh bank and its background checks are present, so compare before and after within this fixture. Absolute totals differ from the historical standalone URCE column model.

| Workload | Dimension resolutions | Block reads | Item-slot reads | Empty-slot-count reads | Result |
|---|---:|---:|---:|---:|---|
| Idle, 128 ticks | 3,600 → 0 | 3,600 → 3,568 | 0 → 0 | 3,328 → 3,328 | No cargo |
| Managed, five stacks | 100,718 → 0 | 100,711 → 100,701 | 89,300 → 71,650 | 79,845 → 83,475 | 100 delivered in 3,161 ticks both times |
| Inline, 100 singles | 46,903 → 0 | 46,903 → 46,802 | 61,000 → 61,000 | 43,401 → 43,401 | 100 delivered in the 1,600-tick window both times |

The first successful use still resolves each distinct dimension ID. A new script runtime starts cold. Position-specific block reads, redstone checks, route generation checks, and current inventory admission remain live. The active-tap path trades some occupancy reads for fewer item-stack reads. These counts cover selected JS-to-engine operations. Actual cost and tail latency require matched BDS captures.

## Offline Q4 integration

The rehearsal assumes a single writer executing with the **original pack identity**, plus Fresh configuration for the bank. The test constructs this configuration. A Fresh identity with no original receipt fails before issuing an item. BDS packaging, configuration migration and the original writer freeze remain prerequisites for a copied-world test. No route command or startup callback is installed by this change.

The fixture uses the real controlled dispatch and audit against synthetic committed Q4 pages, resolves the Receiver from the committed address, and passes a one-unit virtual source through Fresh target selection, shipment journaling, Hopper admission and scheduled arrival. It keeps the original barrel proof separate from the destination chest. The second receipt records issuance into the lane. Destination inventory is checked independently. A restart after an uncertain native insertion leaves a pending receipt for inspection. Repeating the offer cannot insert again. The original barrel status command alone does not include the second trial receipt.

Fixture totals after delivery and runtime restart: 30 Receiver-owned, 32 held, 1 in the original barrel, 1 in the Filter chest. Tests also exercise a powered Receiver, missing identity and interruption after insertion. The metadata scope here is one eligible plain building material. The last actual BDS checkpoint is still [the November 21 handoff](Q4_HANDOFF_2026-11-21.md).

Run the full offline suite with `node --test tests/*test*` from a shell that expands the glob. Run either new case directly with `node tests/mock_routing_test.cjs --column-budget` or `node tests/mock_routing_test.cjs --q4-route`.

For BDS measurement, pair the CPU profile with diagnostics from the same time window and record the source revision, number of active banks, items offered/delivered and temporary chunks. Compare settled idle, sustained successful routing and a full destination. The isolated dispatch copy runs a different entry point from normal Fresh routing. Profile that copy only for census/dispatch costs.
