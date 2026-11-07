# HartMods — Hart Logistics 1.4.0

**Compact sorting, collection, persistent remote routing, and redstone-aware logistics for Minecraft Bedrock.**

Hart Logistics adds compact routing intelligence around ordinary vanilla hoppers
and storage instead of replacing the storage system with a separate digital network.

## Blocks

### Hart Sorter
- Services the vanilla hopper directly above its column.
- Filtered mode routes matching items.
- An empty filter acts as a wildcard/catch-all.
- Can output into supported storage or directly into a Hart Collector.
- Filter configuration uses a native Item Frame on the front: right-click with an item to insert, punch the frame to retrieve it.
- Cycle FILTER / WILDCARD / AUTO / BYPASS by right-clicking the colored upper-front indicator.
- Existing filtered Sorters remain operational until their filter is removed; conversion to native frames happens individually on normal filter transitions.
- Activatable items such as Ender Pearls and Wind Charges can safely be used as filters.
- Power an individual Hart Sorter to pause only that Sorter.

Powered Sorters are skipped by the routing logic. Other unpowered Sorters in the
same column can continue claiming their own matching items, and skipped items can
continue toward later Sorters or overflow.

### Hart Collector
- Accepts continuous directed input from vanilla Hoppers.
- Can receive directly from a Hart Sorter.
- Droppers and vanilla Dispensers are **ejection-only**: Hart Logistics does not
  siphon their stored inventories.
- Multiple Collectors can link to one Receiver.
- Power a Collector to pause ingress.

### Hart Receiver
- Owns a persistent asynchronous queue with a 250,000-item capacity.
- Collector and Receiver do not need to be loaded at the same time.
- Outputs into the vanilla hopper directly below it.
- Power a Receiver to pause dequeue/output while queued ingress can continue.

## Redstone behavior

Hart Logistics retains the redstone control model introduced in 1.3.2:

- **Powered Hart Sorter** → that Sorter stops claiming items.
- **Powered Hart Collector** → ingress pauses.
- **Powered Hart Receiver** → unloading pauses.
- **Powered vanilla Hopper** → Hart Logistics treats it as a hard logistics gate
  and does not bypass the vanilla lock through Script API inventory mutation.
- Removing power resumes operation automatically.

### Sorter columns and vanilla hopper locking

Powering one Sorter does not inherently disable the rest of the column. Items
that would have matched a powered Sorter can pass onward to later Sorters or overflow.

As with normal Minecraft redstone, the physical redstone layout can also power
or lock adjacent vanilla hoppers. For example, powering the top Sorter directly
under a source hopper may also lock that hopper. That is normal vanilla behavior
and can be used intentionally to pause the whole lane.

## Dropper / Dispenser behavior

Droppers and vanilla Dispensers retain their normal pulse semantics.

- A valid ejected `minecraft:item` aimed at an **unpowered** Collector can be captured.
- If the Collector is deliberately held powered, the ejected item is **not** captured.
- A short pulse-local exception allows a normal source button pulse to work when
  that same pulse momentarily powers the adjacent Collector.
- Manually dropped items are not treated as Dropper/Dispenser output.
- Projectile, fluid, equipment, and other non-item Dispenser actions remain vanilla.

## Persistent queue storage

Receiver queues use the q4 paged/deduplicated format introduced in 1.3.1:

- up to 64 logical FIFO entries per compact queue page;
- exact item definitions are stored once per Receiver;
- queue pages reference compact definition IDs;
- existing q2/q3 queues migrate forward automatically;
- queue-journal crash recovery remains in place.

Receiver capacity remains **250,000 items**.

## Validation

The 1.3.2 redstone controls were validated on a production-scale world. Version 1.4.0 additionally validates native-frame operation, migration, and queue accounting.

Validated behaviors include:

- powered Collector pause/resume;
- powered Receiver pause/resume with queued ingress continuing;
- powered individual Sorters skipping only themselves;
- later unpowered Sorters in the same column continuing to work;
- powered Sorter matches passing to overflow;
- Dropper and Dispenser capture when Collector is unpowered;
- Dropper and Dispenser rejection when Collector is deliberately powered;
- automatic resume after power removal;
- 128-item alternating A/B redstone stress test with exact conservation:
  **64 sticks + 64 cooked chicken delivered, 128/128 total**;
- no stranded queue entries or loaded-source backlog after the stress test.

The existing q4 queue-engine validation from 1.3.1 remains applicable:
- 16 Receivers migrated;
- 86,859 queued items preserved;
- largest migrated Receiver retained 45,716 queued items;
- persistent dynamic-property footprint reduced from about 3.53 MiB / 26,194
  properties to about 496 KiB / 473 properties.

## Common layouts

Local sorting:

    Hopper bus -> Hart Sorter -> Chest / Barrel

Remote farm:

    Hopper / Dropper / Dispenser -> Hart Collector
        -> persistent queue -> Hart Receiver -> Hopper -> storage

Remote category routing:

    Hopper bus -> Hart Sorter -> Hart Collector
        -> persistent queue -> Hart Receiver -> storage

Remote overflow:

    Hopper bus -> unfiltered Hart Sorter -> Hart Collector
        -> central overflow Receiver

## Recipes

- **Hart Sorter:** Hopper + Comparator + Redstone Dust + Iron Ingot
- **Hart Collector:** Hopper + Ender Pearl + Redstone Dust + Copper Ingot
- **Hart Receiver:** Hopper + Ender Pearl + Redstone Dust + Gold Ingot

## Admin diagnostics

Game Directors / operators can run:

    /hartlogistics:status

The command is read-only and reports Sorters, registry storage, Collector/Receiver
counts, queue totals, q4 queue-store footprint, lifetime counters, and journal state.

Temporary redstone-transition logging used during TEST3/TEST4 validation is not
retained from the previous 1.3.2 release.

## Compatibility

Validated on Minecraft Bedrock Dedicated Server **1.26.51.1**.

Backward compatibility is intentionally preserved:
- same pack UUIDs;
- same `hartsorter:*` namespace and block identifiers;
- existing placed blocks and Sorter filters remain valid;
- existing Collector/Receiver links remain valid;
- existing q4 Receiver queues remain valid.

Technical IDs:

    hartsorter:sorter
    hartsorter:collector
    hartsorter:receiver

## Installation / upgrade

Install:
- HartMods - Hart Logistics BP 1.4.0
- HartMods - Hart Logistics RP 1.4.0

Existing world pack bindings should use:

    "version": [1, 3, 2]

Do not keep duplicate pack folders with the same UUID.

## License

Hart Logistics is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**.
See `LICENSE` and `NOTICE.md`.

## Persistent transport limitation (1.4.0)

Some metadata-rich or non-stackable items, including filled maps, enchanted books, banners and firework rockets, cannot currently enter the persistent Collector/Receiver queue safely. When no safe direct transfer is available (for example, the Receiver still has a backlog), these items remain at their source hopper rather than being transferred without their properties. This may block the source hopper until the Receiver queue empties or the item is removed. Native Sorter filtering and persistent remote transport have different metadata support requirements.
