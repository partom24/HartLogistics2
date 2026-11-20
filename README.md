# HartLogistics Fresh LAB 0.2.0 — Addressed Physical Hopper Routing

**Source-only, standalone LAB upgrade.** This is a *new* routing implementation on top of the unchanged original 1.4.1 Sorter, Collector, Receiver models, textures, and basic filter/mode interactions. No URCE, 1.5.x routing, virtual item queue, serialized shipments, or custom transporter is included. The old 1.4.1 pack is only the source of the three original models and interactions.

## Exact target / safety

- LAB only: `C:\Servers\Thomas_MCBedrock - Copy (2)` and `worlds\LabWorld`
- Does not stop or change production `ThomasServer` or any process on a different `bedrock_server.exe` path.
- Upgrades the already installed `HartLogistics_Fresh_LAB_BP` / `HartLogistics_Fresh_LAB_RP` from **0.1.0 to 0.2.0** (same LAB UUIDs). Existing LAB BP, RP and world pack-activation JSON files are backed up, with new 0.2.0 pack manifests.
- No GitHub or source repository is touched.

## Install (Git-managed)

Follow [GIT_WORKFLOW.md](GIT_WORKFLOW.md) and the bootstrap ZIP instructions. Do **not** use the old per-version ZIP installer. A branch update changes source only; a pinned `Install -Apply` deploys to the LAB world. Existing in-game setup and `hartlab:setup_io` details below still apply.

## Routing behavior

- The Collector reads every slot of its adjacent input inventory (above first), including mixed item types. Only actual native `ItemStack`s are transferred.
- The linked Receiver chooses from ALL 40 main or ALL four experimental Sorters, with an index built from stored filter/mode configurations. No hardcoded allowed-item list and no hardcoded item-to-Sorter matching.
- Exact FILTER matches (including legacy enchanted-book enchantment types and potion effect/delivery variants) and AUTO matches to storage inventory contents are selected before WILDCARD destinations. BYPASS is never a destination. When a matching specific destination exists but is full, the source item waits for space rather than silently going to a wildcard.
- Any **adjacent native inventory** can be a destination; the Sorter's primary facing side is preferred. Unrelated Sorters and intermediate Hoppers do not run item-filter decisions.
- Items enter the first Hopper by a single native `Container.transferItem` from the Collector's source inventory. They then advance by **normal native Hopper movement** across the visible line. On each tick while in flight, **only the preaddressed destination Hopper** is checked for arrival. Once the item arrives there, a native transfer deposits it to adjacent storage.
- An addressed lane has **one active shipment at a time**. This is necessary because plain Hoppers do not preserve packet/address metadata. Two lanes can operate simultaneously. There is NO restriction to one item *type* or one Sorter *destination*: the Hopper lane serves arbitrary item stacks and all registered Sorters, but it serializes the stacks on each line.
- No custom item serialization/reconstruction, item entities, or per-hop JavaScript movement. Item metadata remains in native inventories, including non-stackables and unusual item custom data; some Minecraft-native container restrictions still apply.
- Full or missing destination *before dispatch*: source item is held. Unexpected obstruction *after dispatch*: the item moves on to the native catch barrel. After a server restart during a shipment, any remaining items are allowed to drain to the catch barrel rather than replayed or reconstructed.
- Hopper rate and distance govern latency. This build is intended to produce an honest baseline for CPU profiles, throughput, item correctness and the physical-arrival hypothesis.

## Test plan

1. Set different FILTER frame items across all 40 Sorters, and test them in any order. Change modes while the server is running. Use AUTO with a seed item in an adjacent chest and WILDCARD with unmatched items.
2. Mix ordinary stacks, potions, tools, enchanted items, named items, non-stackables and other metadata-rich items in the Collector input barrel. Compare items before/after exactly.
3. Fill a matching chest; verify the source item remains untouched. Free a slot; verify delivery resumes. Test a filled chest mid-flight; verify the remainder reaches the catch barrel.
4. Feed both lanes simultaneously; evaluate `/scriptevent hartlab:status`, VS script profiler and BDS diagnostics.
5. Change filters or Break/replace a native chest and use `/scriptevent hartlab:refresh` for edits performed with external world commands.
6. Restart while a shipment is moving; ensure items are present in a native inventory (source, conveyor, chest or catch). Never use a production world for this trial.
7. Compare the count of every item and all metadata across sources, destinations and catches. The mock-simulation passing is **not** a guarantee of Bedrock live-runtime correctness.

## Not in this transport experiment

- Bulk Storage, Transporter-specific custom blocks, dynamic routing of arbitrary new conveyor topologies, unbounded multi-packet concurrency, full migration of an existing 1.4.1 world, native Hopper speed upgrades, or a persistent Collector/Receiver virtual queue.
- Redstone pause rules for active in-flight transfers are not enforced yet. Do not energize a Hopper line mid-test unless deliberately testing interruption handling.
- A single Hopper line cannot reliably distinguish multiple simultaneous address-assigned stacks with identical item types. The initial implementation serializes them as an explicit correctness tradeoff; a broader routing design will need separate research and profiling.

## Verification performed without BDS

- All source JSON parses, script syntax checks, pack-version/UUID consistency and original 1.4.1 visual asset hashes.
- Included offline mock simulation of native Hopper propagation, both lanes, distant addressed destination, mixed source items, named nonstackables, and full-destination HOLD.
- No actual 1.26.60.6 server was available to run or profile inside this workspace; treat live-runtime behavior as the next validation gate.

## License

MPL-2.0. Original HartLogistics 1.4.1 geometry/texture/interaction attribution and LICENSE/NOTICE files retained.
