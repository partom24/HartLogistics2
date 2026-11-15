# LEVEL 1 — Official native Bedrock API research for Hart Logistics 1.4.1

**Status: Level 1 research complete at documentary/source scope; no BDS execution and no architectural replacement approved.**  
**Date:** 2026-11-14 (America/New_York). **Source-of-truth:** immutable 1.4.1 import `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`. **Working branch:** `recovery/native-first-141-20261114`. This report uses **only** original 1.4.1 source, the already established recovery inventory and official public Microsoft/Mojang documentation. It does **not** use artifacts, code, test output or design findings from the archived 1.5 line. No code replacement, server modification, new test world or data migration occurred.

Read together with [the binding mandate](RECOVERY_MANDATE.md), [the original 1.4.1 mechanics and scale table](NATIVE_FIRST_MECHANICS_AUDIT.md), [all baseline file/function locations](BASELINE_141_RECURSIVE_CENSUS.md), and [the Level 1 disposition for each M01–M40](LEVEL1_MECHANISM_DECISIONS_141.md).

## 0. How to interpret evidence and API version

The baseline BP manifest specifies **`@minecraft/server 2.7.0`, min_engine_version `[1,26,50]`**, not the version shown on the current Microsoft "stable" reference page. The latter is a **moving latest-version page** and currently includes additions from 2.8, 2.9, 2.10+ and even visible pre-release-marked members. An API appearing in that page **does not prove it is exposed by 2.7.0**. Check the official [module changelog](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/changelog?view=minecraft-bedrock-stable) before calling something 2.7-eligible. **Post-Level-1 update:** The exact public `@minecraft/server@2.7.0` npm TypeScript declarations have now been retrieved in a separate source-only GitHub Actions job; **11 critical signatures and event contracts have been verified**, with [method-level decisions](recovery/NATIVE_TRANSFER_AND_CUSTODY_LEVEL2_DECISIONS.md) and [CI evidence](https://github.com/partom24/HartLogistics2/actions/runs/43672957630). **The game/BDS runtime has still not been exercised.** Other capability families without individual 2.7 declaration checks remain version candidates. The version classification below is therefore either (a) already invoked by the canonical 1.4.1 source, (b) explicitly introduced by or before 2.7 in the changelog, (c) later than 2.7, or (d) documentation candidate whose exact 2.7 availability still requires the original package's typings.

**2.7.0 type-package follow-up — now completed for 11 critical contracts:** Microsoft's [Script Module Versioning](https://learn.microsoft.com/en-us/minecraft/creator/documents/scriptversioning?view=minecraft-bedrock-stable) identifies versioned npm TypeScript declarations as the version-specific API reference. GitHub Actions now retrieves the exact public `@minecraft/server@2.7.0` npm package into temporary scratch and checks the type declarations for Container movement/query APIs, ItemStack identity helpers, World properties, WorldAfterEvents, BlockCustomComponent, System and Entity.addItem. **11/11 pinned-type checks passed.** See [verified run](https://github.com/partom24/HartLogistics2/actions/runs/43672957630) and [native transfer/custody decisions](recovery/NATIVE_TRANSFER_AND_CUSTODY_LEVEL2_DECISIONS.md). Other method families require individual version-typing examination before implementation, and **typed availability is not a Bedrock runtime, metadata or durability guarantee**.

**Level 1 statuses**:
- **E — baseline-observed/native documented:** baseline code already uses the interface, or official changelog shows it by 2.7. Not a speed or transactional guarantee.
- **C — documented candidate (unless individually confirmed by pinned 2.7 typings in the Level 2 report):** additional contract verification may still be needed; even pinned availability never authorizes gameplay use without semantic/custody proof.
- **X — excluded for 2.7:** documented addition after 2.7, pre-release, unsupported for custom blocks, or conceptually not the needed signal.
- **G — native primitive exists but Hart-specific gap remains:** no native built-in for the complete requested semantics.
- **U — undocumented/unknown guarantee:** cannot infer crash atomicity, ordering, exclusivity, save durability, metadata safety or speed from the method name.

**Performance notation:** `S` registered Sorters; `C` columns; `H` Sorter rows/column; `I` slots/input; `D` slots/output; `K` Collectors; `R` Receivers; `Q` virtual queue records; `E` helper entities; `L` blocks in route. Complexity is workload reasoning, **not** measured CPU. A single native method may itself scan `D` slots internally. Replacing a manual scan with a native method does not establish lower server cost without profiling.

**Documentary negative finding:** In the documented 2.7-appropriate World events, no event is established for *every native Hopper or chest inventory content change*. `playerInventoryItemChange` is explicitly a player-inventory event; a block **open/close** event (added only in **2.8**) is not a Hopper transfer event. `BlockCustomComponent.onTick` is periodic polling at each block, not a content-change event. This is a critical constraint on M01/M03/M19/M35.

## 1. Inventory, physical custody and accepting slots

### N01 — Vanilla Hopper, Dropper/Dispenser, chest/barrel/Shulker physical behavior | E / G

**Docs:** [block inventory API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockinventorycomponent?view=minecraft-bedrock-stable); [Container](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable). The actual 1.4.1 Hopper/Sorter/Collector routing contracts come from the [pinned baseline source](https://github.com/partom24/HartLogistics2/blob/0ea3000651c116b0fa1acc2836ab7e1bcfbc6269/addon/behavior_pack/scripts/main.js).

**What Bedrock owns:** vanilla Hopper transfer rules and tick scheduling; vanilla storage inventory, slots and redstone lock; actual Dropper/Dispenser activation and item ejection. **What it does not establish:** Hart's Filter→Auto→Wildcard routing and bottom-to-top priority, its 250,000-item Receiver FIFO, or an API callback for all Hopper changes. Native Hopper movement may race with script observations; removing a scan is unsafe unless the exact expected interception behavior is preserved. **Scaling:** native work occurs within the engine for each active block but is not free, and script calls across `C` idle columns still scale `O(C)`. Avoid building an alternative Hopper simulator.

### N02 — `BlockInventoryComponent.container` and `Block.getComponent("minecraft:inventory")` | E

**Exact documented interface:** `BlockInventoryComponent.container?: Container`, available for blocks that actually have an inventory component (e.g., vanilla chests). `Block.getComponent(...)` yields undefined if absent; an unloaded/invalid block may throw. Baseline 1.4.1 already uses native `minecraft:inventory` access. **Important limitation:** the existence of a read-only block inventory interface does **not** demonstrate that arbitrary custom Hart blocks can be assigned a persistent block inventory through BP JSON. Do not assume a new native custom-block inventory exists from this accessor. **Scale:** obtaining a component for all `S` Sorters per tick is unnecessary if only `C` active inputs matter. **L2:** determine legal persistent custom inventory hosts before designing a Collector/Receiver replacement.

### N03 — `Container.size` / `Container.emptySlotsCount` / `Container.isValid` | E/C

**Documented contracts:** `size: number` = slot count, `emptySlotsCount: number` = number of empty slots, `isValid: boolean` = currently accessible container validity; `size` and `emptySlotsCount` can throw if invalid. **Correct empty test:** `emptySlotsCount === size` implies all slots empty (provided the container is valid). **Incorrect tests:** `emptySlotsCount === 0` does **not** mean the destination cannot merge partial matching stacks; `emptySlotsCount` is NOT total item count or a native content-change event. **Scale:** one cheap eligibility observation *might* reduce repeated `I`-slot scans, but only profiling can measure its cost. Do not trust snapshots after world changes. **L2:** empty→nonempty, full-but-stackable, unloaded, and powered transitions.

### N04 — `Container.getItem(slot)` / `Container.getSlot(slot)` / `ContainerSlot.getItem()` | E

`getItem(index): ItemStack | undefined` returns item value or undefined without changing the slot. `getSlot(index): ContainerSlot` yields an object referencing that native slot; `ContainerSlot.getItem(): ItemStack | undefined` returns a copy. Slot reads can throw for bounds or invalid/unloaded container; `ContainerSlot.isValid` checks validity. **Not provided:** an atomic multi-slot read or stable snapshot while other engine actors can write. **Scale:** explicit scans `O(I)` or `O(D)` at each invocation; repeated native API boundary calls could dominate scheduler cost. Read only the slots necessary for a live decision and revalidate at write/ACK.

### N05 — `Container.firstItem()`, `firstEmptySlot()` | C

Both return **a slot index** (`number | undefined`), **not an ItemStack**. `firstItem()` finds the first occupied slot; `firstEmptySlot()` finds the first empty slot. These exist in the official changelog's **2.1.0** Container additions (therefore eligible for 2.7 in principle). They can skip a hand-written scan for a first candidate but do **not** supply Filter/AUTO matching, destination partial-stack preference, or atomic validation. **Scale:** internally unknown; don't assume O(1) or faster than manual iteration. **L2:** slot order, stale reads, and partial-stack merge precedence.

### N06 — `Container.contains(itemStack)` / `find(itemStack)` / `findLast(itemStack)` | C / G

Officially added in **2.1.0**; signatures `contains(ItemStack): boolean`, `find(ItemStack): number | undefined`, `findLast(ItemStack): number | undefined`. All take an **ItemStack**, not a type-ID string. The contract says "find an item", but does not guarantee comparison semantics match Hart AUTO's *type-ID or enchanted-book enchantment-type set*; nor does it guarantee an efficient indexed lookup. The methods may inspect `D` slots. **L1 verdict:** candidate for simple presence, **not native implementation of AUTO filtering**. **L2:** compare exact AUTO semantics and runtime work with `autoSorterMatches`.

### N07 — `ItemStack.isStackableWith(other)` | E / G

Returns false for nonstackable items even when their identity/type match. For stackable items it checks type **and custom data/properties**; it ignores counts for compatibility. It is **not** an exact general identity comparator, not an enchanted-book FILTER policy and not a destination-space check. Baseline uses or depends upon stackability decisions. **Scale:** native comparison cost varies by metadata; do it only when a candidate destination item was actually read. **L2:** partial/full stacks, named/lored/enchanted items and opaque custom properties.

### N08 — `Container.addItem(stack)` | C / U

`addItem(itemStack: ItemStack): ItemStack | undefined` places content in the first available slot(s), stacking with compatible existing items, and returns **remainder** if not fully admitted. Cannot be invoked in restricted-execution mode; can throw container-rule errors. **Crucial:** it credits the *destination*; it does not atomically debit an unrelated source container or Q4 balance. Using it as a full move without a proven debit/fence creates duplication risk. **Scale:** native destination search may scale with `D`. **L2:** remainder, slot order and exact metadata in complete/partial cases.

### N09 — `Container.transferItem(fromSlot, toContainer)` | C / U

`transferItem(fromSlot: number, toContainer: Container): ItemStack | undefined` transfers from one native container into another (or to the first available slot in itself). Returns **the items that could not be transferred**, or undefined on full transfer. Restricted-execution writes prohibited; can throw container-rule errors. **Benefits:** source and destination are both native containers, so explicit JavaScript debit/credit loops may be unnecessary. **Does not document:** target slot order matching Hart priority, amount-limited transfer, update + world dynamic property as one durable transaction, all-save atomicity, or cost of searching `D` slots. **L2:** identity/count, partial full, native Hopper movement while powered, crash/restart outcomes.

### N10 — `Container.moveItem(fromSlot, toSlot, toContainer)` | C / U

`moveItem(fromSlot: number, toSlot: number, toContainer: Container): void` moves between named native slots, even within the same container. No count parameter in the documented signature; it is **not** an arbitrary move of exactly N items and does not promise Hart's preferred partial stack merge policy. Writes prohibited in restricted execution. **L2:** merge vs swap/occupied destination behavior, ordered Hopper compaction, metadata, full/partial, crash and alias containers.

### N11 — `Container.setItem(slot, stack?)` / `ContainerSlot.setItem(stack?)` | E / U

These directly **replace** the given slot, or clear it with undefined. They do not perform a cross-container transaction or custom queue debit. For metadata-rich items, using an *original native clone* avoids some reconstruction, but precise slot visibility/save order remains unknown. Must never use `clearAll()` to "fix" a failed transaction. **Scale:** one slot write may be cheaper than repeated per-slot scanning, but persistent commit costs are not documented. **L2:** exceptions, write/readback and restart.

### N12 — `Container.swapItems` / native slot transformations | C / G

`swapItems(slot, otherSlot, otherContainer): void` swaps full item stacks across slots; no Hart-specific safety or FIFO guarantee. Native same-container `moveItem` and `swapItems` are candidates to replace compaction **only** if their exact slot/result behavior preserves vanilla Hopper throughput and anti-starvation semantics. These are **not** custom routing engines. **L2:** an ordered five-slot Hopper before and after three input patterns.

## 2. Identity, metadata, filters and native storage hosts

### N13 — `ItemStack.clone()` | C / U

`clone(): ItemStack` is documented to create an **exact copy including custom data/properties**. It does not by itself transfer ownership: two live copies can exist, and the API has no linked debit of the original. Copying a `clone` into world dynamic properties is **not** possible as a native `ItemStack` value; permitted property value types are primitives and vectors. This is a key separation: native **in-memory fidelity** ≠ native **durable carrier** or single-writer custody. **L2:** actual original ItemStack survives in a proven native inventory through reload/restart/rollback, while original source is retired safely.

### N14 — `ItemStack` core properties / item components | C / G

`typeId`; `amount` (bounded by item maximum and 1–255 API range, not a 250k virtual balance); `isStackable`; `getComponent(id)`, `getComponents()`, `hasComponent(id)`; `getLore()`, `getRawLore()`, `getCanDestroy()`, `getCanPlaceOn()`; `getDynamicProperty...` and tags. Components can expose potion, enchantment, book and other native metadata. **Do not assume** a `typeId + amount + lore` JSON rebuild is faithful to arbitrary opaque item data. **L2:** per-class behavior vs original 1.4.1 filter rules and arbitrary custom mod metadata. **Scale:** read metadata on actual candidate items, not during every idle Sorter scan.

### N15 — `ItemEnchantableComponent.getEnchantments()` | C / G

Returns an array of enchantments. The engine exposes native enchantments, but Hart's filter convention for enchanted books uses **enchantment type-set**, not necessarily levels nor native stack compatibility. The method cannot replace the comparison policy. **L2:** book type-set equivalence, levels ignored where required, unknown enchantments; compare exact 1.4.1 match behavior. Docs: [ItemEnchantableComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itemenchantablecomponent?view=minecraft-bedrock-stable).

### N16 — `ItemPotionComponent` / native potion effect and delivery identity | C / G

Component `minecraft:potion` exposes `potionEffectType` and `potionDeliveryType` (read-only). Useful for typed identity; documentation does not show generic arbitrary potion-NBT serialization, nor prove filter matching and physical-stack fidelity for every custom potion. **L2:** potion, splash and lingering variants, effects and data properties against canonical filter acceptance. Docs: [ItemPotionComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itempotioncomponent?view=minecraft-bedrock-stable).

### N17 — Native item frame and block state | E / G

The baseline already includes **native Item Frame filters** (`minecraft:frame`), custom sorter modes and block permutations. Original `nativeFrameMirror` and frame ownership handlers demonstrate that native frames are not a purely theoretical option. Physical frame contents belong to the engine, eliminating the need to synthesize a second ItemStack for already-migrated filters. **Limits:** player-hit and rotation/mode UX are still Hart policy; legacy display owners and save data must remain compatible. **Scale:** static frame/block rendering is preferable to per-100-tick scripted entity resurrection, but native rendering work is not zero. **L2:** rotated/stacked frames, break/refund, unload and old-world visual migration.

### N18 — `EntityInventoryComponent.container` and entity `minecraft:inventory` JSON | C / U

Entities with a native inventory expose a `Container`; the native entity component has `inventorySize`, `containerType`, `canBeSiphonedFrom`, `private` and `restrictToOwner` flags. Minecraft entity BP `minecraft:inventory` can describe an inventory (default size 5; configurable). **These are engine inventory features**, but the documented `private` flag describes *death drops* and `restrictToOwner` describes ownership access; neither is documented as preventing **all** player, Hopper, command, script, unload or foreign-addon mutations. A persistent entity is not automatically crash-atomic or always loaded. **L2:** authenticated persistent carrier, same save epoch, foreign modification and unload/destroy handling. Do not adopt until these risks are closed. Docs: [EntityInventoryComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityinventorycomponent?view=minecraft-bedrock-stable), [entity inventory JSON](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_inventory?view=minecraft-bedrock-stable).

### N19 — `Entity.addItem(stack)` | C / U

The official changelog explicitly **added `Entity.addItem` in 2.7.0**. It returns a remainder ItemStack or undefined after adding to an entity inventory; still cannot atomically debit a source Q4 key. A more direct native alternative than manually fetching/setting every carrier slot **if** a secure carrier exists. **L2:** exact entity inventory, overflow, durability and owner rights. Docs: [Entity](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable), [changelog](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/changelog?view=minecraft-bedrock-stable).

### N20 — `EntityEquippableComponent` / `EquipmentSlot` | E / G

Used by original `equipDisplayEntity` for the old filter-display proxy. Can equip a visual entity's slot but still creates/manages an actual world entity. **Native frame or static block permutation should come first** for a filter already physically present. No scaling benefit is established by merely moving the same proxy to a different equipment method. Docs: [EntityEquippableComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityequippablecomponent?view=minecraft-bedrock-stable).

### N21 — `BlockPermutation.getState/withState` and `Block.setPermutation` | E / G

Native state and permutation functions are available; `Block.setPermutation` is a world mutation and is prohibited in restricted callbacks. Persisted **mode display** can be represented by block state, as the original BP already does; none of these methods supplies Hart routing priority itself. If original mode is durable in registry **and** block state, reconcile consistency on actual configuration/placement/unload, not via unbounded repeated world-wide scans. **L2:** state loss/replacement, redstone and visuals on reload and unintended block updates. Docs: [BlockPermutation](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockpermutation?view=minecraft-bedrock-stable), [Block](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/block?view=minecraft-bedrock-stable).

### N22 — Declarative BP/RP block assets and components | E / G

`minecraft:geometry`, `minecraft:material_instances`, `minecraft:item_visual`, `minecraft:loot`, recipes, render controllers, static textures and block permutations use **native content pipelines**. These replace custom rendering where visuals can be encoded statically, but do not implement persistent virtual queues or item sorting. Baseline exact assets may never be overwritten in place. **L2:** schema-validation on nominated BDS/client, original visual alignment and frame hit targets. Docs: [block component catalog](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/blockcomponentslist?view=minecraft-bedrock-stable).

## 3. Events, redstone, scheduling and loaded-world boundaries

### N23 — `world.afterEvents.playerPlaceBlock` / `playerBreakBlock` / interaction events | E / G

Already used by baseline for registration, frame and link UX. Work is per **relevant player event**, instead of an unconditional `O(S)` scan. **Not complete topology authority**: explosions, pistons, commands, scripts, unloaded chunks and changes not caused by players may bypass these specific events. A native event narrows dirty sets but does not eliminate readback or world validation. **L2:** non-player block changes and stale registry handling. Docs: [WorldAfterEvents](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/worldafterevents?view=minecraft-bedrock-stable).

### N24 — `world.beforeEvents.*` / restricted execution | E / G

Before events permit certain cancellations but world mutation APIs generally **throw** in restricted-execution mode. Original baseline explicitly defers several actions using `system.run` to avoid mutating in before-events. Deferral means **recheck the live block, player, source and cargo**, as identity may change before write. `WorldBeforeEvents` is not a native transaction barrier. **L2:** filter insert/refund and breaking callbacks, no double-consumption or stale actions. Docs: [WorldBeforeEvents](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/worldbeforeevents?view=minecraft-bedrock-stable).

### N25 — `BlockCustomComponent.onPlace/onPlayerBreak/onPlayerInteract` | C / G

Native custom block callbacks let Hart work on events for its **own** blocks. They can reduce registration/UI polling and are appropriate for the original custom Sorter/Collector/Receiver JSON components. They do **not** directly observe all vanilla chest/Hopper content mutations. Their restricted mode and invocation semantics must be checked before mutation. **L2:** prove coverage of changes used by routing, including non-player block mutations. Docs: [BlockCustomComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockcustomcomponent?view=minecraft-bedrock-stable).

### N26 — `minecraft:redstone_consumer` + `BlockCustomComponent.onRedstoneUpdate` | E

**Already used in original 1.4.1.** Native JSON component `minecraft:redstone_consumer` has `min_power` (0–15) and `propagates_power`; its callback reports `powerLevel`, and `previousPowerLevel` was added by 2.6. Documentation says available without Upcoming Creator Features for **block format 1.26.0+**, and the baseline block JSON uses 1.26.30. It can eliminate pointless repeated *custom-block* polling, **not necessarily vanilla Hopper lock checks**. Callback validity after unload/reload and a first negative-power transition still need proof. Docs: [redstone consumer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_consumer?view=minecraft-bedrock-stable), [redstone callback](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockcomponentredstoneupdateevent?view=minecraft-bedrock-stable).

### N27 — `Block.getRedstonePower()` / vanilla Hopper `toggle_bit` state | E / G

`getRedstonePower(): number | undefined` can be undefined when not applicable and throws on invalid/unloaded positions. For vanilla Hoppers, original code reads permutation `toggle_bit` (the engine owns the actual lock). Never treat undefined/exception as proof of unpowered/available when custody relies on the gate. Recheck at transaction boundaries. **Scale:** do not query thousands of irrelevant blocks each tick; one change-driven cached state still needs a trusted freshness rule. Docs: [Block](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/block?view=minecraft-bedrock-stable).

### N28 — `BlockCustomComponent.onTick` + JSON `minecraft:tick` | C / G

A custom block with a **`minecraft:tick` component** may invoke `onTick`; attaching `onTick` without `minecraft:tick` causes a content error. JSON tick `interval_range` can be exact or randomized, `looping` can repeat or be one-shot. **Crucial:** this is still **per-block polling**, not a native Hopper-inventory-change signal, and it cannot be installed on arbitrary vanilla Hopper blocks as if their behavior were custom Hart block components. It can make `O(S)` callbacks, not solve the fundamental problem. **L2:** reject unless profiling demonstrates genuine reduction and equivalent interception. Docs: [tick component](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_tick?view=minecraft-bedrock-stable), [BlockCustomComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockcustomcomponent?view=minecraft-bedrock-stable).

### N29 — `system.run` / `runTimeout` / `runInterval` / `runJob` | E / G

`run` defers work to an available future time; timing within/after a tick is **not guaranteed under load**. `runInterval` is periodic. `runJob(generator)` time-slices the generator but **does not detect inventory mutation** and is not an item-transfer primitive. `runJob` was introduced in the 1.12.0-era API, so is 2.7-eligible in principle. Native schedulers control execution, not Hart priority, latency or time-budget policy. **L2:** worst-case slot, route and journal work vs tick deadline and original priority. Docs: [System](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/system?view=minecraft-bedrock-stable).

### N30 — `WorldAfterEvents.playerInventoryItemChange` | X for Hopper observations

The documented signal fires on **the player's inventory**. It is neither generic `ContainerItemChange` nor Hopper transfer notification; using it as a Sorter scheduler replacement would miss vanilla Hopper arrivals. It may help a player-specific UI feature, not M01's need. **L1 verdict: REJECT** for generic Sorter/Hopper inventory change. Docs: [WorldAfterEvents](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/worldafterevents?view=minecraft-bedrock-stable).

### N31 — `WorldAfterEvents.entitySpawn` + `EntityItemComponent.itemStack` | E / G

The original 1.4.1 baseline already subscribes to item entity spawns and reads `entity.getComponent("minecraft:item").itemStack`. That supplies the **actual spawned item value**, not authenticated Dropper/Dispenser provenance, causal redstone pulse, or a durable queue credit. Events must be scoped to validated source location, direction, power pulse, and original item identity; absent entity on restart is not proof of transfer. **Scale:** proportional to relevant spawn events, not periodic scanning of all dispensers. **L2:** mixed entity spawn sources, normal reload, interrupted credit and world item removal. Docs: [WorldAfterEvents](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/worldafterevents?view=minecraft-bedrock-stable), [EntityItemComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityitemcomponent?view=minecraft-bedrock-stable).

### N32 — `Dimension.getBlock` / `getEntities` (filtered) / `getEntitiesAtBlockLocation` | E / G

`Dimension.getBlock(location): Block | undefined` returns undefined for unloaded chunk and may throw; there is no license to treat unavailable blocks as empty/full. `getEntities({type, location, maxDistance})` is a **spatially filtered native query**; `getEntities({type})` across a whole dimension is a broad census, potentially expensive even if the API returns few entities. `getEntitiesAtBlockLocation` restricts to a location. A dimension-wide sweep per 100 ticks is not made cheap by being "native." **Scale:** query scope and frequency matter; prefer local repair near changed Sorters. Docs: [Dimension](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/dimension?view=minecraft-bedrock-stable).

### N33 — `Dimension.spawnEntity/spawnItem` / `Entity.remove` / `Entity.teleport` | E / U

Native entity creation, deletion and teleporting exist. These are **world mutations**, not free graphics calls; they can throw or fail when chunks are unavailable. Spawning a proxy is not equivalent to drawing static block geometry. Dropping an ItemStack as an entity transfers it into world-entity lifecycle and introduces despawn/pickup/ownership risk. **Scale:** avoid recurring `O(E)` spawn/teleport of stable filter visuals. **L2:** eliminate routine proxy churn and prove old-world visuals.

### N34 — `Block.isValid` / `Container.isValid` / `Entity.isValid` | E / G

Validity checks are useful but do not prove that the object is still the same owner or that the inventory/mode has not changed. An entity's ID can remain readable after invalidation; its inventory access may still fail. Never bridge unload by assuming successful prior reads remain current. **L2:** chunk unload/reload and stale reference invalidation, exact owner/location readback. Docs: [Block](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/block?view=minecraft-bedrock-stable), [Container](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable), [Entity](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable).

## 4. World storage, journal limits and diagnostics

### N35 — `World.getDynamicProperty` / `setDynamicProperty` | E / G / U

Documented property values are **boolean, number, string, Vector3, undefined** — **not** an arbitrary ItemStack, Container or transaction. Baseline Q4 and registry use native world dynamic properties for serial JSON. Writes and reads belong to the script pack's world data; this does not establish crash-atomic writes with adjacent Hopper inventories or between two properties. **Scale:** costs can grow with string size, number of writes and startup reads; measure bytes and item throughput, not only entry count. **L2:** full-page updates, restart/rollback and pending journal recovery. Docs: [World](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/world?view=minecraft-bedrock-stable).

### N36 — `World.setDynamicProperties(record)` | C / U

Available in the changelog from **2.3.0**, so a 2.7 candidate. Writes a map of property names to values in one API call; documentation **does not guarantee atomic persistent commit across keys**, nor with native container mutations. It might reduce script↔native call count, but only a failure-injection study establishes durability behavior. **Do not replace a journal with a batch setter simply because the API is plural.** Docs: [World](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/world?view=minecraft-bedrock-stable), [changelog](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/changelog?view=minecraft-bedrock-stable).

### N37 — `World.getDynamicPropertyIds` / `getDynamicPropertyTotalByteCount` | C

Read-only enumeration and **total byte count**. These are observational diagnostics, not per-Receiver capacity guarantees, data integrity checks or native queues. Use them on operator request or bounded sample, not as a whole-world per-tick scan. Original queue page caps (`64 entries, `30,000 chars`) and registry shard target (`24,000 chars`) are **implementation values**, not official platform maximum sizes or measured throughput. **L2:** report byte count, exact property errors and real serialized shard costs. Docs: [World](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/world?view=minecraft-bedrock-stable).

### N38 — Native custom command registry / console status | E / G

Original `system.beforeEvents.startup` registers `hartlogistics:status` using the engine custom-command registry. Read-only command invocation is a suitable operator-facing diagnostics route; command callbacks may require deferral to unrestricted execution for world state access. A new status command does not eliminate the need for engine profiler and server tick measurement. **L2:** nonmutating command output and overhead when diagnostics disabled. Docs: [Script API reference](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/minecraft-server?view=minecraft-bedrock-stable), [System](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/system?view=minecraft-bedrock-stable).

### N39 — Native `/script profiler` and `/script diagnostics`; VS Code BDS debugger | C

Microsoft documents `/script profiler start` and `stop`, producing a `.cpuprofile`; since 1.19.10 the script profiler covers native Bedrock API calls as well as JS. `/script diagnostics startcapture/stopcapture` offers additional captures. The official BDS debugger guide documents local debug settings and `/script debugger listen 19144` (disabled by default). **Caveat:** exact permissions, availability, server configuration and result interpretation on the nominated LAB must be verified; do not change production settings. CPUProfile API-call samples are **not automatically real server TPS or per-subsystem elapsed time**, and native APIs still consume engine resources. **L2:** use owner-authorized LAB-only capture, warmed idle/active/blocked windows, items/s, server tick timings, native-call mix. Docs: [Performance in Scripting](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/script-performance?view=minecraft-bedrock-stable), [debugger BDS](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/vscode-debugger?view=minecraft-bedrock-stable), [script command](https://learn.microsoft.com/en-us/minecraft/creator/commands/commands/script?view=minecraft-bedrock-stable).

## 5. Explicit disqualifications and version traps

| Tempting option | Level 1 disposition and reason | Correct next step |
| --- | --- | --- |
| Generic `Hopper inventory change event` | **X — no documented 2.7 signal.** Player inventory changes are not Hopper changes. | If a different official stable event is claimed, require its exact signature, introduction version and Hopper-source semantics before testing. Otherwise design minimal correct observation, measure `O(C)` cost. |
| `blockContainerOpened` / `blockContainerClosed` | **X for 2.7**, added in **2.8.0**, and fires open/close, **not content mutations by vanilla Hopper**. | Do not base 1.4.1 scheduling on it. |
| `BlockCustomComponent.onBlockStateChange` / `BlockComponentBlockStateChangeEvent` | **X for 2.7**, class added in **2.8.0**; custom block state changes ≠ generic Hopper slot changes even on later versions. | Use original 2.7-compatible callbacks plus validation. |
| `World.virtualContainerManager` / virtual container item change | **X for recovery's stable 2.7 baseline**: current reference marks virtual manager pre-release, and corresponding changelog items are newer. The docs describe **memory-only** virtual containers, not durable Q4 queues. | Do not adopt an experimental in-memory container as persistence. |
| `Block.getParts()` | **X for 2.7**, added in **2.9.0**; not a substitute for original double-chest identity proof. | Use documented 2.7 physical inventory/block validation. |
| `minecraft:tick` / `onTick` for Sorters | **Insufficient**: still per-block periodic logic and requires tick JSON; source work could scale `O(S)`. | Require actual lower total engine work and no missed Hopper transfers; don't assert event-driven. |
| `Container.firstEmptySlot()` for output availability | **Insufficient**: full container can still accept merges; method only locates an empty slot. | Examine compatible partially filled stacks and native transfer remainder. |
| `ItemStack.isStackableWith` for nonstackable metadata equivalence | **Insufficient**: returns false for nonstackable even identical type/item. | Preserve native physical original where needed; test identity, do not flatten. |
| `Container.transferItem` as complete queue settlement | **Insufficient**: native-to-native movement alone is not atomic with Q4 dynamic-property debit/journal. | Separate physical-operation feasibility from persistent transaction proof. |
| `World.setDynamicProperties` as ACID transaction | **U — no such published guarantee** for world+physical cargo or multi-record durable crash recovery. | Keep HOLD/fence until actual failure model and BDS cut tests. |
| Custom Hart block `minecraft:inventory` as guaranteed native container | **U — not established** by `BlockInventoryComponent`, which only reads existing inventory-bearing blocks. | Confirm creator block component support and persistence on exact target; don't assume a custom block can mimic vanilla chest. |
| `EntityInventoryComponent.private/restrictToOwner` as total custody isolation | **U**: described as death-drop and owner access settings, not proof against all vanilla/script/foreign writers. | Prove actor access, unload, death/destroy, crash and reload. |
| `Dimension.getEntities({type})` as cheap scoped maintenance | **Insufficient**: type-only search may traverse all matching dimension entities. | Prefer bounded spatial queries and no global per-tick/per-100-tick scans. |

## 6. Working decision rule for Level 2

Level 1 may certify a **documented primitive**, identify a **known version incompatibility**, or establish that **a native method is insufficient to replace Hart policy**. It may **not** certify throughput, metadata preservation across restarts, arbitrary custom-container persistence, Q4 correctness, atomic ownership or actual item survival on abrupt BDS termination. No invasive LAB test, new queue, new scheduler, or new transport implementation is authorized by this report.

Level 2 should test **six grouped questions**, not 40 separately:

1. **Physical native movement / slot rules:** `getItem`, `getSlot`, `addItem`, `moveItem`, `transferItem`, `swapItems`, `firstItem`, `firstEmptySlot`; one source/destination contract with full, partial, incompatible, linked double-chest and metadata item classes.
2. **Idle Hopper observation / native timing:** whether any 2.7 stable Hopper-specific signal exists (currently undocumented), how little reading catches items in time, redstone and block unload behavior. Do not precommit to event scheduling.
3. **Native filtering/identity:** `clone`, `isStackableWith`, enchantable/potion, native item frames; compare actual four-mode Hart priority and metadata.
4. **Persistent native ownership:** entity native inventory, direct physical move, dynamic-property records and crash/unload; prove one owner per item and ambiguity HOLD before designing any native carrier.
5. **Native block lifecycle/visuals:** redstone consumer, native permutation/frame, player vs nonplayer placement/break, no global entity sweep.
6. **Operational diagnostics and scaling:** built-in script profiler/capture plus real server tick health and useful throughput, at original stacked multi-bank owner scale.

**L2 gates are technical questions, not user-run micro-rigs or 1.5-derived tasks.** Reuse canonical 1.4.1 and the owner's authorized LAB path; any eventual tests must preserve worlds and have explicit bounded rollback.

## 7. Primary reference index (official Microsoft / Mojang)

All links below are the official, living reference; reread and cross-check the [2.7.0 changelog](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/changelog?view=minecraft-bedrock-stable) for version introduction.

- [Server module and available versions](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/minecraft-server?view=minecraft-bedrock-stable)
- [Official script module versioning and version-specific npm typings](https://learn.microsoft.com/en-us/minecraft/creator/documents/scriptversioning?view=minecraft-bedrock-stable)
- [Server API changelog](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/changelog?view=minecraft-bedrock-stable)
- [Container](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable)
- [ContainerSlot](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/containerslot?view=minecraft-bedrock-stable)
- [BlockInventoryComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockinventorycomponent?view=minecraft-bedrock-stable)
- [ItemStack](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itemstack?view=minecraft-bedrock-stable)
- [ItemEnchantableComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itemenchantablecomponent?view=minecraft-bedrock-stable)
- [ItemPotionComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itempotioncomponent?view=minecraft-bedrock-stable)
- [EntityInventoryComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityinventorycomponent?view=minecraft-bedrock-stable)
- [EntityItemComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityitemcomponent?view=minecraft-bedrock-stable)
- [EntityEquippableComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityequippablecomponent?view=minecraft-bedrock-stable)
- [Entity](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable)
- [Block](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/block?view=minecraft-bedrock-stable)
- [BlockPermutation](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockpermutation?view=minecraft-bedrock-stable)
- [BlockCustomComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockcustomcomponent?view=minecraft-bedrock-stable)
- [BlockComponentRedstoneUpdateEvent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockcomponentredstoneupdateevent?view=minecraft-bedrock-stable)
- [World](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/world?view=minecraft-bedrock-stable)
- [WorldAfterEvents](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/worldafterevents?view=minecraft-bedrock-stable)
- [WorldBeforeEvents](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/worldbeforeevents?view=minecraft-bedrock-stable)
- [Dimension](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/dimension?view=minecraft-bedrock-stable)
- [System](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/system?view=minecraft-bedrock-stable)
- [Block redstone consumer JSON](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_consumer?view=minecraft-bedrock-stable)
- [Block tick JSON](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_tick?view=minecraft-bedrock-stable)
- [Block component catalog](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/blockcomponentslist?view=minecraft-bedrock-stable)
- [Entity inventory JSON](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_inventory?view=minecraft-bedrock-stable)
- [Performance in Scripting](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/script-performance?view=minecraft-bedrock-stable)
- [BDS script debugger](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/vscode-debugger?view=minecraft-bedrock-stable)
- [Script command](https://learn.microsoft.com/en-us/minecraft/creator/commands/commands/script?view=minecraft-bedrock-stable)

**Read-only research outcome:** All 39 N-coded native capability families above have an official source URL and a falsifiable compatibility boundary. None is certified as a complete production replacement by Level 1 alone.
