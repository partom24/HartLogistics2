# Custody feasibility after PG-17 — stable entity-inventory claims and proof gaps

**2026-11-07 status: DOCUMENTATION / SOURCE REVIEW ONLY.** No new candidate pack, gameplay code, simulated admission grant, owner BDS run, experiment, new Minecraft block/entity or production operation. This narrows the previously identified **entity-inventory option C** in [MR custody alternatives](MR_CUSTODY_ALTERNATIVES_12663.md); it does not re-approve that option. Existing PG-15 runtime and PG-16/17 offline evidence retain their original, bounded scope.

## Question

Can an entity's stable native `minecraft:inventory` become a safe, finite, persistent metadata-rich (MR) custodian for Collector/Receiver **on the owner's no-experiment BDS 1.26.63.1**, without invalidating legacy 1.4.1 worlds? Separately, can it solve physically spendable 200,000-item Bulk Storage?

**Current decision: neither claim is proven.** A documented native inventory is only a candidate physical endpoint. It is not an authenticated single writer, a unique custody token or a transaction that atomically commits an ItemStack move and a separate journal. Preserve the legacy 1.4.1 direct-only MR route and every original item and saved-world contract.

## What official stable documentation actually establishes

| Stable API / data-driven property | Documented behavior | Critical interpretation / evidence still missing |
| --- | --- | --- |
| Entity `minecraft:inventory` | Defines an inventory with `inventory_size`, `container_type`, `can_be_siphoned_from`, `private`, `restrict_to_owner` | The existence of these fields does not prove an exact proposed entity definition loads without experiments on **1.26.63.1**, persists with full MR content through restart/unload, or is private from *other add-on scripts*. |
| `can_be_siphoned_from: false` | Disallows extraction by a Hopper via this inventory property | Only the documented Hopper-siphon path is covered, not all external writers, players, death, commands, entity removal or other scripts. |
| `restrict_to_owner: true` | Inventory access restricted to its owner or the entity itself | No independent proof this prevents other authorized scripts/commands/world changes; ownership initialization and stability are untested. |
| `private: true` | Prevents inventory items dropping on death | **Not a data-preservation guarantee.** If an entity is removed or dies, the absence of drops may *increase* irreversible loss exposure unless custody transfer is independently secured. Do not set this as a supposed anti-duplication fix. |
| `EntityInventoryComponent.container` | Script interface to an entity's native Container | Native stacks can be addressed with Container APIs, but neither identity provenance nor cross-inventory/world-property crash atomicity follows. |
| `Container.moveItem` / `transferItem` | Native inventory operations | A successful call + readback and clean BDS restart (as in PG-14/15) do not document a single persisted transaction spanning physical inventory, entity lifecycle, and world dynamic properties. |
| `World.setDynamicProperties` | Sets multiple world dynamic properties | The stable API description supplies no guarantee of atomic commit together with an entity inventory mutation. A successful in-memory readback is not a disk-commit receipt. |

Official sources: [entity inventory component](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_inventory?view=minecraft-bedrock-stable), [EntityInventoryComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityinventorycomponent?view=minecraft-bedrock-stable), [Container](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable), and [World](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/world?view=minecraft-bedrock-stable). These documentation observations are **source review, not owner-installed runtime tests**.

The [26.70.23 **Preview**](https://feedback.minecraft.net/hc/en-us/articles/50103892132365-Minecraft-Beta-Preview-26-70-23) removes experiment requirements from the *custom block* container field for that Preview; this does **not** alter the installed stable 1.26.63.1 verdict from PG-03. The [26.70.20 Preview](https://feedback.minecraft.net/hc/en-us/articles/49576818675597-Minecraft-Beta-Preview-26-70-20) additionally describes `show_ui_on_interaction:false`; disabling a UI is not an exclusive inventory lock.

## Two independent problems must remain separate

**Finite MR buffering on a new entity custodian:** The candidate might keep full native ItemStacks and apply strict backpressure. Before any new MR acceptance, it must prove physical identity, capacity, zero foreign access, no unseen removal/despawn, correct world/chunk persistence and a safe exact-old-world upgrade path. No buffer is created or acknowledged before those proofs. The entity is not a surrogate inventory inside every already-placed 1.4.1 Collector/Receiver just because it shares coordinates.

**Spendable ordinary-item Bulk:** A hypothetical inventory cannot be silently equated with a 200,000-unit virtual ledger. At 64 items per full stack, 200,000 units would require **at least 3,125 fully occupied stack slots**, even before partial stacks, non-64-stackables or item types. No stable entity inventory size or performance capacity at that scale was established; a collection of custodians creates additional identity, unload, reconciliation and crash boundaries. Real Bulk debits/credits remain **BLOCKED** under [PG-16](PG16_CRASH_BOUNDARY.md) and [PG-17](PG17_REFERENCE_CONCEPTS.md).

## Fail-closed proof obligations before any LAB pack proposal

1. **Exact target and ownership:** Pin the owner-approved LAB BDS/client and script/pack manifest versions. First establish without experiments that a deliberately non-interactive, bounded native inventory entity can be defined and located; specify who owns it and show an independent world identifier resilient to restart/unload. No tests against production.
2. **Access exclusion, not flags alone:** Demonstrate all applicable player interaction, vanilla Hopper, foreign script/other-addon, removal/death and entity-despawn paths cannot change custodied contents unnoticed. A merely cooperative Hart-only writer arbiter is insufficient. If this cannot be shown, reject entity custody rather than trust `private` or a self-declared lock.
3. **Native MR fidelity:** Use whole ItemStack operations into verified empty slots and check exact supported metadata classes through a normal restart, unload/reload and blocked/full-target scenario. Reject lossy JSON reconstruction and partial two-slot merge; refuse a source debit when destination custody is uncertain.
4. **Crash consistency:** Require credible engine evidence for atomicity of any physical move and journal change, *or* design a bounded human-auditable HOLD state that makes no further item removal, replay, bank credit or release in every ambiguous failure. A forced shutdown would only test sampled outcomes, never prove all crash orders.
5. **Legacy upgrade and cleanup:** Demonstrate 1.4.1 placed Sorters/Collectors/Receivers, links, q2/q3/q4 and journals survive untouched, including loaded/unloaded migration. Specify exact chunk/coordinates/rig and a stop/rollback path **before** any owner action; never remove a custodian that still holds an item. The cloned LAB world is not disposable empty space.
6. **Capacity and concurrency:** Establish a measured bounded native slot maximum and controlled entity count before setting a throughput/capacity promise. A second controller, player, Hopper, or stale epoch must never be able to claim the same item. Keep finite MR slots separate from Receiver ordinary 250k and Bulk ordinary 200k accounting.

**Gate outcome:** NONE PASSED for the proposed entity custodian. No rig is READY, no LAB install is requested, and the owner need not repeat PG-08/13/14/15 work. Once independently supported, a proposed narrow no-experiments LAB test still requires explicit scope approval and a fully READY [test rig card](TEST_RIG_CONTRACT.md). If exclusivity or durability cannot be justified, retain the legacy lossless MR bypass until a future supported custom-block inventory/version and approved migration provides a better basis.

## Engineering next action

Use these criteria to decide **whether the entity custodian is worth a future isolated LAB proof**. In parallel, keep purely offline topology, filter/overflow and controller decision models separate from physical transfer authority. Do not modify `addon/`, issue new commands, enable experiments, create hidden holders in a live world, re-run accepted tests or upgrade the LAB BDS merely to investigate this candidate.
