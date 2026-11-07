# Hart Logistics — Receiver Q4 to Q5 and Native MR Lane

**Design only. No queue schema has been changed.** All 1.4.1 persisted state and behavior must survive. Related [architecture](LOGISTICS_DESIGN.md) / [test plan](COMPATIBILITY_TEST_PLAN.md).

## Why migration is required

1.4.1 Receivers store a persistent **q4** FIFO queue of quantities and item definitions with an associated journal and recovery logic, and support older q2/q3 formats. The owner expects FIFO and its head-of-line blocking to restrict network-aware sorting throughput. We need destination-aware ordinary-item selection without losing old queue contents, links, counters, recovery, redstone pause or hopper outputs.

## Proposed Q5 state (not final schema)

- **Ordinary lane:** bucketized counts by lossless item identity, capacity accounting, destination-aware scheduling and bulk reserve/acknowledge operations.
- **MR lane:** native ItemStack slots and container operations (where platform support and experiment policy allow). MR stacks **must never** be reconstructed from incomplete serialized properties.
- **Coordinator:** bounded scheduler with MR preference and ordinary-lane fairness. Preserve legacy FIFO behavior for ungoverned/legacy output paths unless a separately tested change is approved.
- **Journal:** durable transaction ID, source, destination, quantity or native slot reference, phase, committed balances and reconciliation markers; exact format and write ordering TBD.
- **Capacity (owner accepted):** preserve the legacy Receiver **250,000 ordinary-item count** capacity; **native MR items have separate finite physical-slot capacity** with backpressure rather than consuming those ordinary count buckets. Exact number of MR slots remains to be established from API/runtime and design; the owner has not approved expanding or flattening the original ordinary count cap.
- **Native custom block container gate:** verify that target server 1.26.63.1 and client 26.63 offer the necessary *stable* inventory APIs without enabling experiments. If not, no silent dependence on experimental toggles; choose an explicitly approved alternative or defer that feature.

## Native custom-container API proof — focused 26.63 gate

**What is being tested:** Does an actual `minecraft:block_entity.container` custom block on **dedicated server 1.26.63.1 / client v26.63** expose the standard script `BlockInventoryComponent.container` / `Container` object, and do native `moveItem` / `transferItem` transfers into and out of it preserve an item's exact metadata?

**Why now:** The basic native Container→Container ItemStack transfer mechanism is already **owner-reported as tested**. The new risk is specifically the **custom-block endpoint**, its availability under the owner's world settings, and whether moving into/out of those slots is safe. We must not confuse the stable `Container` methods with stable availability of the custom-block `container` feature.

**Documentation assessment (SOURCE/API REVIEW, not target-runtime PASS):**
- Official 1.26.50 creator notes added custom block containers (up to **54 slots**, world-persistent, with script access) in the **Experimental Technical Updates** section. The base `minecraft:block_entity` component itself was released from experimental; its new *container field* was not. [Release notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.50).
- `BlockInventoryComponent.container` has the ordinary `Container` type. `Container` exposes `moveItem(fromSlot,toSlot,toContainer)`, `transferItem(fromSlot,toContainer)`, `getItem`, `getSlot`, `setItem`, etc. The methods work outside restricted execution and may throw on invalid containers/rules. [Inventory component API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockinventorycomponent?view=minecraft-bedrock-stable) / [Container API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable).
- **Inference, not direct 26.63 observation:** when a custom block exposes this `Container` correctly, it is intended to participate in the same native operations. We have **not** yet established that server 1.26.63.1 exposes it in a non-experimental world or that this particular build has no implementation bug.

**Minimum new acceptance proof (LAB only; no current READY rig):**
1. Verify configured experiment flags and whether the custom block with `minecraft:block_entity.container` loads and exposes `minecraft:inventory`, and that its `container` is valid and has the configured slots. **Do not enable experiments without owner approval.**
2. Use the standard native API for **one source ordinary inventory → custom-block inventory → destination ordinary inventory** transfer, then **custom-block inventory A → custom-block inventory B** for Collector→Receiver semantics. No conversion through JSON/string definitions.
3. Verify an owner-chosen **representative MR metadata mechanism** (not every potion/disc/enchanted item again) matches before/after native moves. Where the item has nested inventory/custom components, use a separate targeted case only if these semantics genuinely differ.
4. Verify source and destination exact ownership/counts under full/blocked destination; reload and restart persistence of the new custom-block inventory. This is a new endpoint/persistence check, **not a retest of general native ItemStack methods**.
5. Verify existing placed Collector/Receiver upgrade strategy separately; a successful brand-new probe block does not prove an older block gains persistent slots, nor that the scripted Link menu coexists with the native container interface.
6. If any custom-inventory feature is absent or experimental-only under prohibited settings, **stop this design branch safely**, keep legacy item custody and seek an approved supported alternative/version policy; never switch to lossy metadata serialization.

**Execution:** do not ask the owner to build anything until a complete [READY rig card](TEST_RIG_CONTRACT.md) provides exact block counts, XYZ/face layout, spacing/isolation, scripts, world settings, expected counts and metadata checks. No production server access. No gameplay code or LAB test is authorized or performed by this planning record.

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

## Owner-approved world-wide routing freeze and automatic on-load migration

**Accepted direction (2026-11-07):** Before any Hart Logistics Q4→Q5 or placed-block compatibility migration, establish a **durable server/world-wide Hart Logistics maintenance epoch**. All scripted Sorter, Collector, Receiver, Transporter, Bulk Storage and controller **ingress, dequeue, reservations and routing** must honor the global stop gate, including old 1.4.1 execution paths. Freezing only one Receiver is **superseded**. The freeze is for the **Hart Logistics add-on's transfers**, not an assertion that vanilla Hoppers or other add-ons stop ticking everywhere; any vanilla physical transfer that could enter a partially migrated inventory must be separately blocked, isolated or accounted for.

**Critical loaded-chunk boundary:** An **unloaded** Sorter or Collector cannot ordinarily have its block/component inventories directly read/written by server scripting. Mark old instances **PENDING** in durable migration metadata and process them **automatically when their chunk becomes accessible**. Receivers (which own Q4 data) must also be migrated/verified on load. Do not claim an unloaded block has been migrated, forcibly load every chunk without owner approval, or clear pending state to manufacture success. Microsoft stable Dimension.getBlock docs describe unloaded-chunk access as returning undefined or raising LocationInUnloadedChunkError: https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/dimension?view=minecraft-bedrock-stable . Global persistent world dynamic properties survive restarts (https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/multiplayer-scripts?view=minecraft-bedrock-stable). This is API documentation, not a test on 26.63.

### Proposed protocol, contingent on source review and LAB proof

1. **Enter maintenance:** Before scheduling any first Q5 move, persist a global migration epoch/maintenance flag. Ensure script schedulers, source intake hooks, queue drains, ejection capture, collector ingest, manual menu actions that affect links, and new network controllers all check the gate; prevent a race with any previously scheduled transfer.
2. **Inventory the world safely:** Use existing persistent registries where authoritative to identify known Sorters, Collectors, Receivers and their link/queue records. Preserve block UUID/ID, locations, item ownership, q4 pages/journals and filters. Mark known unloaded targets PENDING; do not read unavailable block entities. Discover unknown legacy blocks lazily on load, with versioned activation checks.
3. **Migrate loaded pieces automatically:** On any relevant block-load/registration/interaction scan path, verify migration epoch and record version **before permitting new routing**. Sorters retain filter/mode/frame state; Collectors retain links, accepted ingress and (if supported) gain native MR custody; Receivers recover q4 journal and perform staged Q5 cutover. Each block obtains a durable state PENDING → MIGRATING → VERIFIED or BLOCKED; repeated/restarted calls are idempotent.
4. **Keep routed traffic stopped while ambiguous:** No old-mode or Q5 routing may proceed for a PENDING/MIGRATING/BLOCKED block; no duplication/reconstruction of MR. A server-wide resume requires proof that **all participating blocks can safely operate** and that any later-loading legacy block is automatically held/migrated before it routes. If full global readiness cannot be proven because blocks remain unloaded, **do not silently report completion**: preserve maintenance state, display pending counts where reliable, and require a deliberately validated lazy-resume protocol or operator decision. Avoid an unbounded server-wide freeze without a visible explanation and recovery procedure.
5. **Verify and resume:** Reconcile item counts, live native ItemStacks, saved links, Q4 journals and transfer custody across restart. Persist a durable version/commit authority marker and then clear the global routing gate only when the protected invariant has been proven. Crash before/after marker must resume safely; retain Q4 evidence but never double replay.
6. **Inform players in menus:** Collector, Receiver, Sorter and any relevant controller menus/status surfaces display **Migration pending**, **Migrating — routing paused**, **Migration complete**, or **Migration requires attention** when the block is loaded/interacted with; offer read-only details and clear failure explanation. An **unloaded block cannot show its menu** until reached/loaded. A world-level summary should indicate maintenance status and remaining pending/blocked counts if the registry supports reliable counts. Do not promise a menu for a block currently in an unloaded chunk.

**Hard requirements:** Global freeze is additive safety for the upgrade and must not become a permanent gameplay disable switch by accident. Never stop vanilla server processing across unrelated add-ons or world inventories, silently upgrade experiments, erase Q4, auto-unlink Collectors or migrate inaccessible native ItemStacks by serializing them. LAB-specific temporary probes, flags and diagnostics must be removed at task completion per [temporary instrumentation policy](TEMPORARY_INSTRUMENTATION_POLICY.md).

## Optional pack-scoped ticking-area migration accelerator — updated API findings (2026-11-07)

**What is being tested:** Can the dedicated 26.63 server use the native, **stable** `world.tickingAreaManager` to load known legacy chunks temporarily for Q4→Q5 migration **without enabling cheats**? **Status:** documentation supports it; LAB runtime test not run.

### Critical correction: addon manifest, command and stable API are different

- `"metadata":{"product_type":"addon"}` is a **pack classification**, not a cheat toggle, grant of command permission, or world setting. Microsoft says it should not change in-game functioning. Achievement eligibility for add-ons is separate from permitting cheats, with version-specific bugs and fixes. [Manifest reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/addonsreference/packmanifest?view=minecraft-bedrock-stable).
- The **manual** `/tickingarea` command is listed as **Requires Cheats: Yes** for command usage. **We should not use this path for Hart Logistics migration.** [Command reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/commandsreference/examples/commands/tickingarea?view=minecraft-bedrock-stable).
- **Preferred native Script API:** Microsoft made `TickingAreaManager`, `TickingAreaOptions` and `World.tickingAreaManager` **stable in Bedrock 1.26.10 with `@minecraft/server` 2.6.0**. Original 1.4.1 already declares **2.7.0**, so the dependency is sufficiently recent on paper. The actual 1.26.63.1 dedicated-server feature still needs a narrow LAB check. [Official release notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.10?view=minecraft-bedrock-stable) / [Script API changelog](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/changelog?view=minecraft-bedrock-stable).

### Proposed one-region-at-a-time protocol

1. **Freeze Hart Logistics routing** using the existing durable maintenance epoch. The ticking-area accelerator does not stop vanilla Hoppers, other add-ons or redstone from ticking; account for their potential transfers before migrating item custody.
2. **Build a candidate worklist** from the legacy Sorter registry and Collector/Receiver dimension+coordinate records. Stale or undiscovered blocks remain protected by on-load version checks; never mark an unloaded block as migrated without inspection.
3. **Use `world.tickingAreaManager`**, whose areas have a **pack-specific ticking-chunk quota independent of command-created ticking areas** and cannot inspect or remove another pack's/command's areas. Check `chunkCount`, `maxChunkCount`, `hasCapacity(options)`. **Do not apply the manual command's ten-area/100-chunk limits to this manager.** [Manager reference](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/tickingareamanager?view=minecraft-bedrock-stable).
4. **Create exactly one small named area** for an identified pending region using `createTickingArea(identifier,options)`, await its promise (resolves after loaded/ticking), then revalidate block identity, registry version and safe vanilla ingress. Persist a lease/epoch and use bounded timeouts and resource limits.
5. **Migrate and reconcile** with the ordinary idempotent Q4→Q5 and native-slot protocols. Persist VERIFIED only after exact item/metadata/link checks. **Immediately call `removeTickingArea(identifier)`** and verify no Hart migration area or stale lease remains; never indiscriminately remove all areas.
6. **On failure/restart**, reconcile only Hart-owned manager areas against the lease journal, remove stale ones, and resume migration safely or mark BLOCKED. Never clear the global freeze on an ambiguous migration.
7. **If the native manager is unavailable**, disable the accelerator and retain automatic migration when legacy chunks ordinarily load. **Do not enable cheats or experiments, or silently fall back to command-created ticking areas.**

### PG-07 focused proof (no additional test batch)

**GO for accelerator:** Stable manager works in the owner's approved non-cheat, non-experimental LAB configuration; a previously unloaded registered block loads, migrates exactly once without vanilla Hopper interference, and the named area is removed—including after interrupted operations.

**NO-GO for accelerator:** Missing manager, unsafe Hopper tick, item/link loss, repeated migration or uncleared area/lease. This does **not** automatically invalidate the safe on-load fallback; continue global Q5 safety checks separately.

**Cleanup rule:** A supported self-cleaning migration manager can become production functionality, but every created temporary ticking area and test-only probe must be promptly removed. Follow [temporary instrumentation policy](TEMPORARY_INSTRUMENTATION_POLICY.md). No manual LAB rig is READY; [exact test rig card](TEST_RIG_CONTRACT.md) required before requesting any build. No gameplay code or server settings changed by this planning record.

## Required migration protocol

1. **Preflight:** identify original block pack UUID, block ID, dimension and coordinates; detect queue version, q4 journal activity and legacy q2/q3 conversion. Work only on valid/known structures and a copied-world backup.
2. **Freeze Hart Logistics routing server-wide:** durably activate the global maintenance epoch before any Q5 writes, and pause all old/new add-on-controlled ingest, dequeue, sort, route, reserve and relay handlers. Existing vanilla Hopper physical mechanics do not automatically stop; account for and prevent unsafe concurrent vanilla-to-Hart transfers.
3. **Enumerate and gate loaded/unloaded blocks:** mark registered Sorters, Collectors and Receivers as version-checked or PENDING; don't claim unloaded block entities migrated. On chunk activation, automatically run the relevant migration/verification before enabling the block. Recover q4 journal first for Receivers; ambiguous writes/identities remain BLOCKED, not guessed.
4. **Snapshot authoritative source:** freeze q4 as read-only migration input. Record total count, per-lossless-identity count, any non-bucketizable item record, links, options, counters and integrity digest.
5. **Stage Q5 elsewhere:** write new Q5 pages/slots using new namespaced keys; do **not** destructively edit q4. Separate complex/MR items only by a proven lossless path. If an existing q4 record cannot recreate native metadata exactly, do **not** claim conversion preserves it.
6. **Validate:** compare quantities, item identities, cap, source metadata fidelity where observable, counters and journal reconciliation. Mark failed/uncertain records explicitly; require a clean result.
7. **Commit authority:** persist a durable cutover marker in a well-defined order so a crash before commit resumes q4, and after commit resumes Q5 only. Never deliver the same item from both formats.
8. **Post-cutover verification and controlled resume:** inspect affected loaded/pending and later-loading legacy blocks; keep all dependent routes frozen until ownership/version gates and crash recovery are sound. Publish migration pending/success/failure in loaded block menus and a world-level summary. Only resume globally under a proven safe migration-completion/lazy-load protocol. Keep q4 as historical recovery evidence, never replay stale q4 after Q5 movements.
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


## Native MR gate outcome, 2026-11-07

PG-03 = NO-GO for 1.26.63.1 without experiments; native custom block inventory container field is experimental until a newer 26.70.23 Preview. Owner LAB /give command rejected custom item, though the deployment installer succeeded. PG-04/05 BLOCKED, so do not implement custom native slots for existing Collector/Receiver or begin lossless Q5 migration based on unsupported endpoint. Preserve the original direct MR fallback, metadata and ordinary q4 custody. A safe stable runtime alternative or an owner-approved future stable version is required. See docs/BUNDLE1_PREPARATION_RESULTS.md.
