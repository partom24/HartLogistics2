# Hart Logistics — Compatibility and Acceptance Matrix

**Planning checklist, not execution evidence.** Target reported by owner: **Dedicated server 1.26.63.1; client 26.63**. The original 1.4.1 pack minimum **1.26.50** remains a separate compatibility claim requiring testing. All **in-game, release and migration tests occur exclusively** at LAB `C:\Servers\Thomas_MCBedrock - Copy (2)`, on copied/disposable worlds; production `C:\Servers\Thomas_MCBedrock` is out of bounds. See [updater design](UPDATER_DEPLOYMENT_DESIGN.md).

**Route coverage authority:** [Source-traced 1.4.1 ingress/egress matrix](BASELINE_INGRESS_EGRESS_MATRIX.md), especially E01–E11 and R01–R06. A future implementation must prove preservation of all currently accepted edges and their conditions, including negatives N01–N07 (no new unintended bypass).

## Test selection and physical-rig contract

**Before every test request**, give the owner a short **“What is being tested”** summary (purpose, why it is needed now, previously accepted evidence, whether a manual setup is necessary, and expected PASS). The mandatory [Test Rig Cards and Evidence Reuse policy](TEST_RIG_CONTRACT.md) defines this format.

**Before any physical LAB build**, provide a complete **READY** rig card with exact number of Sorters (one vs two in a column, for example), all other block counts, block-by-block XYZ and facing, Hopper directions, links, redstone, initial inventory, topology and **verified distance/clearance from every relevant nearby rig** (or expressly **no special inter-rig separation**), and reset instructions. A hidden setup constraint discovered after a conforming build is our test-specification defect; don't require avoidable rebuilds.

**Evidence reuse first:** classify each test as **previously accepted/unaffected (skip)**, **previously accepted/affected (focused regression)**, **owner-reported previous success (record scope, avoid unnecessary rerun)** or **new/unproven (source review/automation, manual only if justified)**. Do not repeat unrelated 1.4.1 or prior native-ItemStack tests just to start a new milestone. Existing evidence is not automatically proof of changed queue migration, cross-chunk native inventory or other new end-to-end behavior.

## Risk-based item selection — owner testing policy (2026-11-06)

**Do not limit each routing or throughput test to a predetermined named item, and do not repeat equivalent tests for cobblestone, glass, sand, etc. solely because their IDs differ.** For ordinary unmodified items with the same relevant inventory and serialization semantics, one representative is sufficient for a given routing/transfer invariant; use any suitable readily available item. Test *behavior*, not arbitrary item names.

| Test dimension | Required coverage | Item-selection rule |
| --- | --- | --- |
| Ordinary transport, sorting, queueing, batching | Quantity conservation, ingress/egress, routing modes, full/partial destinations, hop chains, throughput, restart and blocked paths | Representative ordinary bucket-safe item(s); **no forced cobblestone/glass/sand suite** |
| Item identity separation | Different bucket IDs never merge or route to one another's filters | Use **at least two distinct ordinary item identities** to verify segregation; specific IDs arbitrary |
| Stack/inventory limits | Stack size or other relevant inventory behavior differs (e.g. nonstackable vs stackable, partial stack acceptance) | Select representatives of **genuinely different mechanics**, not every item in each class |
| MR-native lane | Metadata survives through native slots and moves; no lossy conversion | Representative *distinct metadata mechanisms* (e.g. enchantments, potion properties, contained inventories/sacks, item names/lore/custom components) as required by supported item APIs |
| Special integrations/bugs | Dropper vs Dispenser ejection, item-specific components or a reproduced problematic case | Test the specific item/feature **only when its semantics materially affect the path**; preserve reproduction fixtures for actual defects |

Item count, unique item identity, stack behavior, inventory ownership and state transitions remain strict assertions. Randomized or property-based tests may exercise broader identities without making each one a mandatory named regression test. If a future defect shows two apparently equivalent items behave differently, add a **focused, evidence-backed exception**, not a blanket item catalog.

The source-traced [1.4.1 ingress/egress matrix](BASELINE_INGRESS_EGRESS_MATRIX.md) remains the route coverage authority. **Reducing redundant item examples does not reduce coverage of old capabilities, failure states, metadata or crash safety.**

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

## Unique block resource acceptance

Before acceptance, compare Bulk Storage and Transporter geometry, textures, icons and placed-world appearance **side by side with 1.4.1 Sorter, Collector and Receiver**. Fail if any original block-specific asset is reused, copied or aliased, if Bulk Storage resembles Collector/Receiver, or if existing block appearances change. Also validate six-direction Transporter visual states. See [asset contract](RESOURCE_ASSET_POLICY.md); when a LAB rig is required, supply a complete [READY rig card](TEST_RIG_CONTRACT.md) first.

## New design: validate before accepting

| Area | Required test |
| --- | --- |
| Bulk capacity | 200,000 items per block; N blocks capacity N × 200,000; filled/unloaded/disconnected member behavior |
| Controllers | First relevant Bulk Storage placement; single closed loop; multi-bank multi-controller; controller failover; merge/split; cross-dimension bounds |
| Routing | Local vs remote matching filtered destination; full chests; overflow; wildcard last with accurate full-state; broken pathways; no loops |
| Transporters | All six faces, junctions, extraction from allowed input, no direct chest outputs, native hopper path unaffected |
| High throughput | Full/partial/blocked batches; bounded time/memory/write rate; near-capacity/long pipes; fairness |
| MR lane | Native ItemStack metadata fidelity: enchanted/sacks/potions/music discs/named/custom; no lossy serialization; bounded slots/backpressure; existing placed Collector/Receiver native containers persist across reloads |
| Q4→Q5 | Idempotent per-Receiver conversion; recovery at every write boundary; mixed legacy format data; no double replay; **retire Q4 MR direct-only fallback only after native Collector+Receiver MR custody replaces E07/R06 in verified old-world routes** |
| Partition | Chunk unload, server restart, redstone pause, controller disagreement, delayed transfer ACK, rerouting without duplicates |
| Versioning | 1.26.63.1 server + 26.63 client; stable/experimental API flags; separately test minimum-version support if still promised |
| HartBots | Later: coexistence without cross-pack data access; depot output via native inventory fallback; direct interface only after separate authorization |

## MR fallback replacement acceptance gate

- On **pre-upgrade 1.4.1 worlds**, first verify the original E07/R06 direct-only Hopper path. Then confirm that, under Q5, the same directed Hopper source can retain an MR stack in a Collector's native inventory while the Receiver is unloaded and in the Receiver while downstream Hopper is blocked, without changing item identity or required redstone semantics.
- Preserve normal Sorter→Collector ingress and Receive→Hopper→Sorter downstream output; prove MR items can use the native lane when Q4 serialization was formerly unsafe.
- Force unload/restart/crash attempts at every custody handoff; confirm exactly one persistent owner for each MR ItemStack and no silent fallback to metadata-destroying JSON.
- Confirm newly placed and already-existing block entities both have usable persistent native slots on the **server 1.26.63.1/client v26.63** target *under the user's approved world settings*. No automatic experiment enablement.
- **Do not require keeping the old bypass implementation after the native behavior is verified and accepted**. The protected contract is lossless end-to-end capability and existing path access.

## Accounting invariant

For each transaction and lossless item identity, **total owned by source queues + in-flight reserved units + destination accepted inventory/storage** must remain conserved, accounting for explicitly player-extracted or item-consumed quantities. An item is never owned by two places. MR items additionally need byte/semantic fidelity checks (enchantments, name, lore and relevant components) using the authoritative native APIs.

## Evidence procedure

Record source commit, original archive SHA-256, pack manifest versions and UUIDs, world copy ID, server/client versions, experiments, scripts/commands, measured results and fault-injection point. A PASS for blueprint validation does not satisfy any of these runtime tests. Never release without owner approval.

## Menu-based link workflow regression

**What is being tested:** A player can open a Collector menu, choose **Link / Relink Receiver**, select and confirm the intended Receiver, and preserve existing links when canceled. Reuse already accepted item transport/metadata evidence; **do not** repeat unrelated sorting tests. Focus on new UI behavior: opening the menu, no implicit link on placement, saved 1.4.1 link preservation, relink/cancel/unlink confirmation, stale destination, two-player isolation, sneaking to place adjacent blocks, Receiver linked-Collector status, redstone unaffected and interaction with new native MR container inventory. Any manual test requires a [READY rig](TEST_RIG_CONTRACT.md) on LAB only. See [UI design](UI_LINKING_DESIGN.md).
