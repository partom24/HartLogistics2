# Hart Logistics — Compatibility and Acceptance Matrix

**Planning checklist, not execution evidence.** Target reported by owner: **Dedicated server 1.26.63.1; client 26.63**. The original 1.4.1 pack minimum **1.26.50** remains a separate compatibility claim requiring testing. All **in-game, release and migration tests occur exclusively** at LAB `C:\Servers\Thomas_MCBedrock - Copy (2)`, on copied/disposable worlds; production `C:\Servers\Thomas_MCBedrock` is out of bounds. See [updater design](UPDATER_DEPLOYMENT_DESIGN.md).

**Route coverage authority:** [Source-traced 1.4.1 ingress/egress matrix](BASELINE_INGRESS_EGRESS_MATRIX.md), especially E01–E11 and R01–R06. A future implementation must prove preservation of all currently accepted edges and their conditions, including negatives N01–N07 (no new unintended bypass).

## Preliminary feasibility batches

[Preliminary Go / No-Go Tests](PRELIMINARY_GO_NO_GO.md) defines **PG-01–PG-11** in four organizational groups (2 offline baseline/updater gates; 3 native MR feasibility; 3 existing-world migration/menu; 3 network feasibility). **PG-01/02 = GO at their documented offline scope; PG-03 NO-GO in owner LAB; PG-04/05 BLOCKED; PG-06–PG-11 NOT RUN; no BDS rig built.** These are targeted stop/go decisions, **not complete release regression**. **No fixed limit applies to autonomous offline, CI or authorized automated LAB tests**; only owner-performed BDS sessions should group 2–3 checks per reusable setup. Do not require later network feasibility tests before beginning authorized baseline preparation.

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

## Focused native custom-container compatibility proof

**What is being tested:** Standard `Container.moveItem` / `transferItem` into and out of a new native **custom-block** container on 26.63; exact ItemStack metadata and persisted slots after reload. **Not being retested:** previously established vanilla container-to-container ItemStack transfer behavior. The test includes one ordinary inventory→custom→ordinary transfer, one custom→custom transfer, blocked/full acceptance and a targeted MR fidelity check. Verify native `minecraft:inventory` availability and world experiment settings before moving an item. No setup request until a complete [READY LAB rig](TEST_RIG_CONTRACT.md) is prepared. See [Q5 custom-container gate](Q5_MIGRATION_DESIGN.md#native-custom-container-api-proof--focused-2663-gate).

## Candidate temporary ticking-area migration accelerator

**What is being tested:** Can an existing 1.4.1 registered-but-unloaded chunk be **temporarily loaded, checked and migrated**, and its uniquely named Hart Logistics ticking area **removed immediately** without unintended vanilla Hopper transfers? Within existing **PG-07**, not another separate go/no-go test. Check availability of stable `world.tickingAreaManager` on 26.63, its per-pack `hasCapacity`/chunk quota, named `createTickingArea` and `removeTickingArea`, retry/restart cleanup and on-normal-load fallback. The manual `/tickingarea` command requires cheats; the **stable scripting manager is a distinct API**. Do not change cheats or experiment flags. Pass requires **zero leftover Hart-owned areas**, a safe global routing gate and exact preserved item/link state; never indiscriminately use `removeAllTickingAreas`. See [updated migration candidate](Q5_MIGRATION_DESIGN.md#optional-pack-scoped-ticking-area-migration-accelerator--updated-api-findings-2026-11-07).

## MR fallback replacement acceptance gate

- On **pre-upgrade 1.4.1 worlds**, first verify the original E07/R06 direct-only Hopper path. Then confirm that, under Q5, the same directed Hopper source can retain an MR stack in a Collector's native inventory while the Receiver is unloaded and in the Receiver while downstream Hopper is blocked, without changing item identity or required redstone semantics.
- Preserve normal Sorter→Collector ingress and Receive→Hopper→Sorter downstream output; prove MR items can use the native lane when Q4 serialization was formerly unsafe.
- Force unload/restart/crash attempts at every custody handoff; confirm exactly one persistent owner for each MR ItemStack and no silent fallback to metadata-destroying JSON.
- Confirm newly placed and already-existing block entities both have usable persistent native slots on the **server 1.26.63.1/client v26.63** target *under the user's approved world settings*. No automatic experiment enablement.
- **Do not require keeping the old bypass implementation after the native behavior is verified and accepted**. The protected contract is lossless end-to-end capability and existing path access.

## Owner-approved network intake and global migration checks

**What is being tested:** Verify **Hopper and Transporter feed identical Sorter rules** (priority, filter/auto/wildcard, redstone) in one explicitly specified column rig. Transporter runs atop Sorter; any adjacent ordinary container is a **source**, no storage chest at or above Transporter level, and no direct Transporter→storage chest output. Test one input at a time, with no guessed extra sorter heights or spacing. Reuse 1.4.1 Hopper evidence where unchanged.

**What is being tested:** Verify persistent controller IDs and deterministic authority under a single loop and multi-controller split/merge; verify a missing/unloaded/stale Bulk member is **unknown, not full**, and cannot trigger early wildcard routing. Verify separate finite MR slots backpressure without changing ordinary Receiver 250k count behavior. Favor deterministic offline transactions/boundaries; build LAB rig only for unresolved integration.

**What is being tested:** During Q4→Q5, **all Hart Logistics routing handlers** observe a durable world-wide maintenance gate, including already scheduled legacy paths. Test pre-freeze/in-flight checkpoints, server restart while paused, staged Receiver cutover, old Sorter/Collector/Receiver activation after previously unloaded chunks load, and menu status PENDING/MIGRATING/VERIFIED/BLOCKED. An unloaded block must not be claimed migrated. Confirm vanilla Hopper movement is either safely isolated or reconciled; do not claim the script pause stops vanilla game mechanics. **Resume only after a validated global/late-load version gate.**

**Preliminary-bundle mapping:** Keep **2–3 owner-performed BDS checks per rig**, while allowing unlimited safe autonomous subtests within their authorized environment; no newly requested large rigs: PG-07 checks global freeze/deferred migration and journal recovery, PG-08 checks menu notification and link preservation, PG-09 checks interchangeable Hopper/Transporter intake, PG-10 checks unknown Bulk capacity and MR backpressure, PG-11 checks deterministic controller authority and partitions. See [preliminary gates](PRELIMINARY_GO_NO_GO.md).

## Accounting invariant

For each transaction and lossless item identity, **total owned by source queues + in-flight reserved units + destination accepted inventory/storage** must remain conserved, accounting for explicitly player-extracted or item-consumed quantities. An item is never owned by two places. MR items additionally need byte/semantic fidelity checks (enchantments, name, lore and relevant components) using the authoritative native APIs.

## Evidence procedure

Record source commit, original archive SHA-256, pack manifest versions and UUIDs, world copy ID, server/client versions, experiments, scripts/commands, measured results and fault-injection point. A PASS for blueprint validation does not satisfy any of these runtime tests. Never release without owner approval.

## Menu-based link workflow regression

**What is being tested:** A player can open a Collector menu, choose **Link / Relink Receiver**, select and confirm the intended Receiver, and preserve existing links when canceled. Reuse already accepted item transport/metadata evidence; **do not** repeat unrelated sorting tests. Focus on new UI behavior: opening the menu, no implicit link on placement, saved 1.4.1 link preservation, relink/cancel/unlink confirmation, stale destination, two-player isolation, sneaking to place adjacent blocks, Receiver linked-Collector status, redstone unaffected and interaction with new native MR container inventory. Any manual test requires a [READY rig](TEST_RIG_CONTRACT.md) on LAB only. See [UI design](UI_LINKING_DESIGN.md).

## Owner cleanup and MR alternatives, 2026-11-07

Owner successfully unregistered the temporary probe in LAB with original registry restoration. The disposable test code and all temporary instrument entries are removed from Git. PG-03 NO-GO on target 1.26.63.1/no-experiments; PG-04/05 BLOCKED. See [evidence](BUNDLE1_PREPARATION_RESULTS.md) and [native custody candidate comparison](MR_CUSTODY_ALTERNATIVES_12663.md). No next BDS rig is authorized until a new design and test scope are approved.

## Bundle 2 offline model progress — 2026-11-07

[Bundle 2 preparation evidence](BUNDLE2_PREPARATION_RESULTS.md) records 25/25 new pure-Python source, Q4→shadow-Q5 recovery and menu-policy checks PASS. This is independent offline preparation, **not** PG-06/PG-07/PG-08 BDS acceptance. PG-03 native MR inventory remains NO-GO on the required no-experiment 1.26.63.1 target. No menu, Q5 storage or legacy placed-block upgrade has been installed into the owner's cloned LAB world. Optional pack-scoped ticking-area migration accelerator remains untested pending a proven safe cutover path.

## Unexpected installed LAB version vs world registrations — 2026-11-07

Owner's read-only preflight observed LAB shared folders with Hart BP/RP pack manifests **1.5.0** (original Hart UUIDs), while the `ThomasServer` registry arrays showed **no** matching entries for either Hart UUID. Production and in-world data were not inspected; current script **does not** establish running pack versions or saved q4 custody. **Stop deployment/migration attempts** until active pack registration, world-local folders and 1.5.0 provenance are established without writes. Do not replace installed 1.5.0 with Git-imported 1.4.1. Evidence: [LAB preflight](BUNDLE2_LAB_PREFLIGHT_RESULTS.md).
