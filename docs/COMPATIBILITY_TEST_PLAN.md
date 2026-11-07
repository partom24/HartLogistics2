# Hart Logistics — Compatibility and Acceptance Matrix

**Planning checklist, not execution evidence.** Target reported by owner: **Dedicated server 1.26.63.1; client 26.63**. The original 1.4.1 pack minimum **1.26.50** remains a separate compatibility claim requiring testing. All tests use copied/backed-up worlds and original source hashes.

**Route coverage authority:** [Source-traced 1.4.1 ingress/egress matrix](BASELINE_INGRESS_EGRESS_MATRIX.md), especially E01–E11 and R01–R06. A future implementation must prove preservation of all currently accepted edges and their conditions, including negatives N01–N07 (no new unintended bypass).

## Baseline: preserve 1.4.1 exactly

| Area | Required test |
| --- | --- |
| Sorters | FILTER, AUTO, WILDCARD, BYPASS; item-frame filter insert/remove; destination full/partial; rotation/stacking; all priorities |
| Collectors | Linked destination; native hopper/direct input and existing supported dropper/dispenser capture; redstone pause and resume |
| Receivers | 250,000-item q4 cap; FIFO legacy mode; native hopper extraction and redstone controls; existing link persistence |
| Recovery | Every existing q4 journal transition; q2/q3 migrations; restarting during load, intake and drain |
| Inventory custody | No item loss/duplication; exact quantities and supported metadata; no unsafe conversion; full/unloaded destination |
| Saved worlds | Existing placed blocks, block states, UUIDs, links, configuration, dynamic properties and item state survive upgrade |
| Standalone | Existing 1.4.1-style networks without either new block behave as before |

## New design: validate before accepting

| Area | Required test |
| --- | --- |
| Bulk capacity | 200,000 items per block; N blocks capacity N × 200,000; filled/unloaded/disconnected member behavior |
| Controllers | First relevant Bulk Storage placement; single closed loop; multi-bank multi-controller; controller failover; merge/split; cross-dimension bounds |
| Routing | Local vs remote matching filtered destination; full chests; overflow; wildcard last with accurate full-state; broken pathways; no loops |
| Transporters | All six faces, junctions, extraction from allowed input, no direct chest outputs, native hopper path unaffected |
| High throughput | Full/partial/blocked batches; bounded time/memory/write rate; near-capacity/long pipes; fairness |
| MR lane | Native ItemStack metadata fidelity: enchanted/sacks/potions/music discs/named/custom; no lossy serialization; bounded slots/backpressure |
| Q4→Q5 | Idempotent per-Receiver conversion; recovery at every write boundary; mixed legacy format data; no double replay |
| Partition | Chunk unload, server restart, redstone pause, controller disagreement, delayed transfer ACK, rerouting without duplicates |
| Versioning | 1.26.63.1 server + 26.63 client; stable/experimental API flags; separately test minimum-version support if still promised |
| HartBots | Later: coexistence without cross-pack data access; depot output via native inventory fallback; direct interface only after separate authorization |

## Accounting invariant

For each transaction and lossless item identity, **total owned by source queues + in-flight reserved units + destination accepted inventory/storage** must remain conserved, accounting for explicitly player-extracted or item-consumed quantities. An item is never owned by two places. MR items additionally need byte/semantic fidelity checks (enchantments, name, lore and relevant components) using the authoritative native APIs.

## Evidence procedure

Record source commit, original archive SHA-256, pack manifest versions and UUIDs, world copy ID, server/client versions, experiments, scripts/commands, measured results and fault-injection point. A PASS for blueprint validation does not satisfy any of these runtime tests. Never release without owner approval.

