# Hart Logistics 1.4.1 — Ingress / Egress Preservation Matrix

**Baseline:** owner-uploaded original `HartMods_HartLogistics_1.4.1(1).mcaddon`; SHA-256 `439678c0d68849a43341c126ba6aaaa111317254e137123fde3ac531cec5d1dd`. The original gameplay source has **not** been committed to this repository. All source references below mean `behavior_pack/scripts/main.js` **inside that uploaded archive**, line numbers in the original 1.4.1 file. Also cross-checked against the pack's `behavior_pack/README.md`, which still labels itself 1.4.0.

**Evidence level: SOURCE REVIEW / baseline contract, not a new Bedrock runtime PASS.** “Supported” means the 1.4.1 source implements this path, often with conditions. The original README reports historical tests but does not make *this Git document* a fresh runtime acceptance. The matrix is a **must-not-regress** checklist for every later version.

## A. Per-block ingress and egress

| Block in 1.4.1 | Accepted ingress (where items originate) | Accepted egress (where items go) | Conditions / boundaries | Source anchors |
| --- | --- | --- | --- | --- |
| **Hart Sorter** (`hartsorter:sorter`) | The **vanilla Hopper directly above the top of its contiguous vertical Sorter column**; other vanilla containers may feed that Hopper by vanilla mechanics. Sorters do **not** automatically poll a chest beside them. | Into the **facing-side adjacent** Chest, Trapped Chest, Barrel, or Shulker Box (including colored variants), **or** into an adjacent **Hart Collector** on that facing side. A Sorter→Collector route writes to the **linked Receiver's Q4 queue**, not to an inventory within Collector. | Source Hopper must be unlocked. Eligible Sorter must be unpowered, not in BYPASS/quarantine, and accept by FILTER → destination-seeded AUTO → WILDCARD priority (bottom-to-top within priority). Destination must have space; Collector must be linked and unpowered, and item must pass Q4 serialization safety. Supported physical storage list is **not** any arbitrary container/modded inventory. | `rebuildTopology` L3316–3361; `processColumn` L3380–3506; `supportedStorage`, `destinationFor`, `sorterCollectorRoute` L3028–3109; `autoSorterMatches` L803–817 |
| **Hart Collector** (`hartsorter:collector`) | (1) Inventory of a **vanilla Hopper on any of six adjacent faces, only when that Hopper's output faces the Collector**. (2) Logical transfer from a **facing-side Sorter** (directly into Receiver Q4, not into Collector inventory). (3) A valid **item entity actually ejected by a triggered Dropper/Dispenser pointing at the Collector**, subject to pulse correlation. | To the **linked Hart Receiver's persistent Q4 queue** (Receiver need not be loaded for this path). For a **queue-unsafe item already in a directed Hopper**, a restricted **direct physical fallback** may instead move it straight into the Hopper below the **loaded** linked Receiver. | Collector must be linked and not deliberately powered; input Hopper must be unlocked; Q4 must have room; ejected items must be safely serializable. Dropper/Dispenser is **ejection only**, not polled inventory. Direct fallback requires Receiver loaded + unpowered, Receiver Q4 empty, receiving Hopper present/unlocked/has room; unsafe items otherwise **remain at source**, not destroyed. Pulse-local powered grace is allowed for valid ejection. | `collectorInputSources` L1040–1082; `sorterCollectorRoute` L3082–3109; `ejectedItemCollector`, `processEjectedItemEntity` L2201–2303; `processCollectorIngress` L3508–3607 |
| **Hart Receiver** (`hartsorter:receiver`) | Logical item quantities from **one or more linked Collectors** via persistent Q4 enqueue; the Receiver block has **no normal native item inventory** in 1.4.1. The restricted direct-only fallback delivers **around** the Receiver (source Hopper → output Hopper), not into a Receiver slot. | From Q4 FIFO head **into a vanilla Hopper immediately below the Receiver**. That Hopper may then use ordinary Hopper mechanics or serve as the top input of a subsequent Sorter column. No direct Receiver→Chest or Receiver→Sorter script egress exists. | Q4 cap **250,000 items**; dequeue only while Receiver loaded/unpowered and output Hopper present/unlocked/accepting. Powered Receiver can still accumulate queue ingress. FIFO head blocking and batch budgets remain 1.4.1 behavior. Collector/Receiver need not be loaded concurrently to enqueue safely. | `receiverOutputHopper` L1084–1104; `enqueueFromSource` L2305–2389; `dequeueToReceiver` L2391–2467; `processReceiverDrain` L3609–3646; `processCollectorIngress` L3508–3607 |
| **Vanilla Hopper** (supported path, **not** a Hart block) | Normal vanilla inventory input (e.g. from a Chest or another Hopper); **also** accepts the scripted Receiver dequeue if immediately below Receiver. | Normal vanilla movement to adjacent inventory/Hopper; supplies a Sorter column only when it is **immediately above that Sorter**; a Hopper can also be a Collector input if **pointed directly toward** the Collector. | Hart code respects Hopper `toggle_bit` redstone lock on Sorter source, Collector source and Receiver output. Ordinary Hopper movement beyond Hart boundaries remains vanilla engine behavior. | `hopperIsRedstoneLocked` L995–1009; `hopperOutputOffset` L1011–1024; `collectorInputSources` L1040–1082; `processColumn` L3380–3506 |
| **Dropper / Dispenser** (supported source, **not** a Hart block) | Their own vanilla inventory and pulse behavior. | **Only an actually ejected** `minecraft:item` entity can be captured by a nearby correctly facing Collector; no direct inventory siphoning. Non-item Dispenser actions remain vanilla. | Must be triggered and output toward an eligible Collector; ejected item must pass Q4 safe-serialization check; powered Collector normally blocks intake except short pulse-correlated grace. Manually dropped world items are not accepted by this special path. | `directionalOutputOffset` L1026–1038; `ejectedItemCollector` L2201–2258; `processEjectedItemEntity` L2260–2303; `entitySpawn` subscription L3713–3731 |
| **Chest / Trapped Chest / Barrel / Shulker Box** (vanilla storage destinations) | Receive Sorter insertions **when attached at the Sorter's facing side**; Chest/Barrel/etc. may also receive items through vanilla Hopper mechanics. | May feed vanilla Hoppers by normal game behavior. **Not** directly polled as Collector or Sorter sources by Hart Script API; no direct Receiver output into them. | Sorting uses `findAcceptSlot` and the physical move journal; capacity and stacking checks apply. Filter matching does not make a non-supported inventory an accepted direct Sorter destination. | `supportedStorage` L3028–3034; `destinationFor` L3036–3080; `findAcceptSlot` L3143–3161; `safeMovePartial` L3260–3314 |

**Read the Hopper row literally:** the Sorter's data source is a Hopper *above* the Sorter, while the Receiver's data sink is a Hopper *below* the Receiver. A Hopper can play both roles by placing **Receiver → Hopper → Sorter** vertically. Neither Sorter nor Receiver has its own inventory container in 1.4.1.

## B. Direct edge acceptance matrix

**Legend:** **YES** = code-supported, **COND** = conditional special path, **NO** = no Hart Logistics 1.4.1 direct path, **VANILLA** = vanilla behavior outside the Hart routing implementation. **Arrows describe item custody and Script API routing, not necessarily physical inventory inside each custom block.**

| ID | Ingress source | Egress destination | Baseline | Exact requirement / limitation |
| --- | --- | --- | --- | --- |
| E01 | Chest / Barrel / other vanilla source | Hopper | **VANILLA** | Hopper vanilla pull/feed; depends on layout. Does not mean Sorter/Collector polls source directly. |
| E02 | Hopper immediately above top Sorter | Sorter routing logic | **YES** | Source must be `minecraft:hopper`, unlocked; at least one eligible Sorter in contiguous column. |
| E03 | Sorter routing logic | Adjacent supported storage (Chest, Trapped Chest, Barrel, Shulker Box) | **YES** | Sorter's **facing side**, filter/mode match, available slot and safe transfer. |
| E04 | Sorter routing logic | Facing-side Collector → linked Receiver Q4 | **COND** | Linked/unpowered Collector; Q4-safe item; queue capacity and journal available. No Collector inventory slot. |
| E05 | Adjacent Hopper whose output points into Collector | Collector → linked Receiver Q4 | **COND** | Linked/unpowered Collector; unlocked Hopper; safe queue representation; capacity. All six adjacent directions considered. |
| E06 | Triggered Dropper/Dispenser actually ejecting a world item toward Collector | Collector → linked Receiver Q4 | **COND** | Correct facing, qualifying pulse/entity, safe item; no inventory polling; not for projectile/fluid actions or hand-dropped items. |
| E07 | Queue-unsafe item in input Hopper pointing to Collector | Hopper immediately under **loaded** linked Receiver | **COND: direct-only fallback** | Receiver Q4 **empty**, Receiver/Collector unpowered, source and destination Hoppers unlocked, destination slot accepts. Does **not** pass through Q4. Not defined for Sorter→Collector or Dropper ejection. |
| E08 | Linked Collector (queued amounts) | Receiver's persistent Q4 store | **YES** | Receiver can be unloaded; requires accepted item representation, capacity and transaction journal. |
| E09 | Receiver Q4 FIFO head | Hopper immediately below Receiver | **COND** | Receiver loaded/unpowered; below Hopper exists/unlocked/has room; FIFO head reconstructible. |
| E10 | Receiver output Hopper | Further Hopper or ordinary storage | **VANILLA** | After output reaches Hopper, vanilla Hopper mechanics and orientation determine onward routing. |
| E11 | Receiver output Hopper directly above a new Sorter column | New Sorter → supported storage or Collector | **YES** | E09 followed by E02+E03/E04, with independent Sorter mode/space/redstone checks. |
| N01 | Chest directly adjacent to Collector (no directed Hopper) | Collector queue | **NO** | Collector polls only **directed Hopper** inventories. |
| N02 | Chest directly adjacent to Sorter (without Hopper above) | Sorter | **NO** | Sorter reads the top Hopper only; may send **to** supported side storage. |
| N03 | Hopper directly into Receiver, without Collector linkage | Receiver queue | **NO** | Receiver accepts linked Collector queue changes, not physical Hopper ingress. |
| N04 | Receiver directly into Sorter or Chest (without Hopper below) | Downstream destination | **NO** | Only the immediately-below Hopper is a scripted Receiver output. |
| N05 | Dropper/Dispenser inventory (not actually ejecting) | Collector | **NO** | No direct inventory siphon. |
| N06 | Sorter → facing Collector with non-Q4-safe item | Receiver Q4 | **NO** | Unserializable item remains in Sorter's source Hopper; direct-only Collector Hopper fallback does not apply. |
| N07 | New Transporter / Bulk Storage or Q5 lane | Any 1.4.1 block | **NOT PRESENT** | Future architecture; do not label planned ingress/egress as current or validated. |

## C. Accepted example end-to-end routes

| Route | End-to-end chain | Status and notes |
| --- | --- | --- |
| R01 — Local sorting | **Chest → Hopper (above Sorter) → Sorter → Chest / Trapped Chest / Barrel / Shulker Box** | **Supported combination** of vanilla Hopper feed + Sorter-selected destination. Mode/filter/redstone/space requirements apply. |
| R02 — Remote sorted storage | **Chest → Hopper → Sorter → Collector → Receiver [Q4] → Hopper → Sorter → Chest** | **Supported combination** (the user's example). Collector must be facing-side destination of upstream Sorter and linked to Receiver; downstream Hopper must be immediately below Receiver and above downstream Sorter; matching/space conditions apply at both Sorters. Queue-unsafe MR items may stop at first Hopper. |
| R03 — Farm intake | **Chest → Hopper (pointed at Collector) → Collector → Receiver [Q4] → Hopper → Chest** | **Supported combination**. Normal container→Hopper and output Hopper→Chest legs are vanilla. Receiver must have output Hopper directly below. |
| R04 — Pulse-only farm | **Dropper / Dispenser [item ejection] → Collector → Receiver [Q4] → Hopper → storage** | **Conditional.** Only actual item ejection aimed at Collector is admitted; unsuitable/non-item outputs do not enter Q4. |
| R05 — Remote overflow / multi-bank relay | **Hopper → Sorter [wildcard] → Collector → Receiver [Q4] → Hopper → Sorter → Collector → Receiver [Q4] → Hopper → storage** | **Supported combination if each leg passes current conditions**, but there is **no 1.4.1 network-wide controller or loop prevention guarantee**. New designs must address cycles and wildcard gating without removing this path. |
| R06 — Existing metadata-preserving direct-only special case | **Hopper (pointed at Collector) → Collector [control] → directly to Hopper below loaded Receiver → vanilla downstream storage** | **Highly conditional**; Q4 empty and output available. The item never resides in Collector or Receiver native slots, and does not wait in Q4. The original unsafe item remains in source if path unavailable. |

**Clarifications:** The above are **valid design compositions of source-implemented edges**. Their actual use in a particular world depends on block orientation, redstone, queue condition and load state. This register does not assert every illustrated chain was re-tested on the owner's 1.26.63.1 server / v26.63 client.

## D. Metadata and failure-boundary rules retained from 1.4.1

- Q4 queue eligibility is tested **per ItemStack** via `serializeQueueItem`, reconstruction and round-trip checks (L1865–1930). Not every item in a broad class is necessarily supported or rejected; do not promise “all potions” or “all non-stackables” in Q4.
- `safeMovePartial` uses a cloned live ItemStack for physical inventory insertion but still performs serialization safety preflight and writes a physical transfer journal (L3260–3314). **Existing live transfer compatibility is not universal arbitrary-metadata support.**
- Q4 rejects/holds unsafe items instead of flattening them. Direct-only fallback is specifically for a **Hopper→Collector** source with empty Q4 and a reachable output Hopper (L3508–3607). If blocked, original remains at source.
- Powered Sorter pauses **that Sorter**, not necessarily downstream Sorters; powered Collector pauses ingress; powered Receiver pauses dequeue but linked ingress can continue; powered vanilla Hopper is an explicit no-mutation gate. See L966–1010 and L3380–3685.
- In Q4, a blocked or un-reconstructible **FIFO head stops Receiver dequeue** (L2391–2467), without claiming items disappeared. Q5 aims to improve routing while preserving this legacy path until explicitly approved.
- **Not currently present:** Transporter, Bulk Storage, native MR inventory in Hart Collector/Receiver, Q5, native HartBots Depot extraction. These are planned capabilities, not accepted 1.4.1 ingress/egress.

## Planned Q5 replacement of MR fallback (not a 1.4.1 baseline fact)

**Owner decision 2026-11-06:** Replace E07/R06's **restricted direct-only fallback** with **native MR storage in both Collector and Receiver**; do not preserve the exact bypass algorithm permanently. **This section is a future requirement, not a claim about 1.4.1 code.**

| 1.4.1 evidence | Required future behavior | Migration acceptance |
| --- | --- | --- |
| **E07 / R06:** unsafe item travels Hopper → Collector control → Receiver output Hopper only when Q4 is empty and output is immediately available | Directed Hopper → Collector native MR slots → linked Receiver native MR slots → existing below-Receiver Hopper or an approved Transporter-to-Sorter path | Safe source extraction, native exact metadata, persistent buffering, original Hopper destination preserved, redstone guard retained |
| **N06:** Sorter → Collector unsafe MR cannot enter Q4 | Sorter → Collector native MR storage → Receiver native MR storage → destination | Existing Sorter filter priority, matching, storage-capacity and pause rules must still govern acceptance |
| **E06/R04:** ejected Dropper/Dispenser items currently require queue-safe serialization | Investigate native MR uptake only for qualifying triggered item ejections | Keep existing pulse safety; no deletion of unmatched/unsafe ejected item before durable ownership |
| **E09/E11:** Receiver Q4 → Hopper below → next Sorter | Maintain existing Receiver → Hopper below → Sorter and downstream storage for both supported lanes | No forced Transporter installation; existing linked hopper/sorter networks still work |

The migration is **replacement of mechanism, preservation of capability**, so the phrase “preserve the fallback” in old planning discussion is **not** the final requirement. Keep old fallback during migration only where necessary to prevent regression, then retire it after evidence-based native replacement approval. See [Q5 design](Q5_MIGRATION_DESIGN.md).

## E. Regression evidence to collect after source import

| Test group | Required preservation proof |
| --- | --- |
| R01/E02/E03 | Modes FILTER/AUTO/WILDCARD/BYPASS; supported storage types; full/partial inventories; powered individual Sorter + Hopper lock; untouched standalone behavior |
| R02/E04/E08/E09/E11 | Link preservation; safe q4 queue; remote Receiver unloaded during ingress; FIFO drain; receiver Hopper-to-next-Sorter chain |
| R03/E05/E07 | Six-face *directional* Hopper acceptance; locked/unlocked states; prove that **native MR Collector→Receiver buffering** replaces fallback behavior safely after migration; before cutover, legacy direct-only behavior remains intact for old-world compatibility |
| R04/E06 | Real Dropper/Dispenser pulse capture; deliberate Collector power rejection; same-pulse grace; no manual-item or unrelated entity interception |
| R05 | Chained network hops; sustained queue pressure and backpressure; absence of involuntary routing changes without new controller |
| MR identities | Native Sorter direct moves preserve accepted item properties; unsupported q4 serialization is rejected; no duplicate or missing items across restart/journal |
| Saved worlds | IDs, existing links, redstone, Hopper routes, q2/q3/q4 conversion and current queues survive new version |

## Source trace index

**Archive:** `HartMods_HartLogistics_1.4.1(1).mcaddon`  
**Inside:** `HartMods - Hart Logistics BP...` behavior pack → `scripts/main.js` (extracted `behavior_pack/scripts/main.js`), line count **4,160**. The exact enclosing pack filename may vary by archive extraction; the script functions and preserved archive SHA-256 are authoritative.

| Behavior | Code region |
| --- | --- |
| Hopper direction, lock, and Collector's six-side intake | `hopperIsRedstoneLocked` L995–1010; `hopperOutputOffset` L1011–1025; `collectorInputSources` L1040–1083 |
| Receiver's immediately-below output Hopper | `receiverOutputHopper` L1084–1098 |
| Safe Q4 eligibility | `serializeQueueItem` L1865–1930 |
| Collector source types and ejected entity handling | `ejectedItemCollector` L2201–2259; `processEjectedItemEntity` L2260–2304 |
| Physical Receiver queue intake/drain | `enqueueFromSource` L2305–2390; `dequeueToReceiver` L2391–2468 |
| Sorter destination whitelist and linked Collector queue | `supportedStorage` L3028–3035; `destinationFor` L3036–3081; `sorterCollectorRoute` L3082–3110 |
| Sorter column + filter priority | `rebuildTopology` L3316–3361; `processColumn` L3380–3507 |
| Collector direct-only fallback + Receiver drain | `processCollectorIngress` L3508–3608; `processReceiverDrain` L3609–3647 |
| Scheduled processing and event-driven ejection | `logisticsTick` L3648–3686; `schedulerTick` L3687–3712; `entitySpawn` L3713–3732 |

**Review rule:** Any planned change affecting an E/R route above must retain that route or have an explicit testable compatibility adapter. Failure to reproduce an existing supported route is a release blocker, not an acceptable feature tradeoff.

## Future link-control transition — not 1.4.1 behavior

The owner selected **menu-based linking** for the next version. Source-reviewed old entry points are `selectCollector`, `useReceiver` (approximately lines 2058–2092) and Collector placement/interaction handlers (approximately lines 3876–4023). The original standing-click or placement-to-select *gesture* may be replaced; **existing links, Collector→Receiver ingress, saved link identities, redstone and sneak-place ability must remain valid**. The new menu behavior is documented in [UI linking design](UI_LINKING_DESIGN.md), not presented as current 1.4.1 implementation.
