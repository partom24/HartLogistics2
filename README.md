# HartLogistics Fresh LAB 0.5.10

This LAB build discovers native Hopper lanes and connected Transporter banks from existing Collector-to-Receiver links. Original block identifiers, models, frame interactions and stored Sorter settings are retained.

## Install and inspect

Use the source updater and pinned LAB installer described in [GIT_WORKFLOW.md](GIT_WORKFLOW.md). Select a Collector and interact with its Receiver. The Receiver immediately reports its discovered transport blocks and Sorters. Saved links register at startup. Placing or breaking blocks in a discovered area automatically refreshes the affected bank. Use `/scriptevent hartlab:status` to inspect both banks. Setup inspects existing construction. The historical build_layout function is a world-building fixture and is unnecessary for discovery.

## How a Receiver finds its destinations

- A single face-adjacent Hopper is the default inlet. Discovery follows its actual output, including turns and drops, until the first non-Hopper. A native inventory at the end can catch bypassed items. A dead-end Hopper retains leftovers and can require manual emptying.
- A face-adjacent Sorter associates its contiguous vertical stack with that tap. Separate columns and arbitrary stack heights are supported. A Sorter touching competing taps needs an explicit association.
- If the Receiver has zero or several adjacent transport blocks, look at the Receiver and run `/scriptevent hartlab:select_receiver`. Look at the real inlet and run `/scriptevent hartlab:bind_inlet`. Registration stores the selected block in the Receiver's dimension.
- For an offset column, select the Receiver as above, look at its lane Hopper or Transporter and run `/scriptevent hartlab:select_tap`, then look at a Sorter in the column and run `/scriptevent hartlab:bind_column`. Repeat for additional columns. Registering a new inlet replaces the previous inlet. Column bindings only apply while the anchor is a Sorter and the tap is reachable.
- Directed loops, unknown outputs, unavailable blocks and competing downward Hopper pulls suspend discovery. Player block edits in the discovered area invalidate that Receiver's index. Use `/scriptevent hartlab:refresh` after command, piston or external edits.
- FILTER and seeded AUTO destinations precede WILDCARD. BYPASS is excluded. When matching chests are full, claimed ordinary cargo uses verified Bulk capacity, then an available WILDCARD. Metadata-rich cargo goes directly to an available WILDCARD. If every eligible output is full, cargo waits at its source. Facing-side storage has priority among compatible adjacent inventories. The lane itself is excluded from destination selection.

Within each destination priority group, columns follow the discovered lane order. Each column fills from the lowest eligible Sorter upward. A shipment must fit in its selected inventory.

## Transporter bank

Keep the existing Hopper bank connected. For a second bank, link a separate Collector to its Receiver. Use `/give @s hartlogistics:transporter 10` and place a connected pipe above each Sorter column, with the first pipe touching the Receiver. A Receiver uses one inlet and one transport method per lane. Positions and orientations come from the placed blocks.

Transporter discovery walks face-connected pipes in breadth-first order and supports branches, turns and loops. Pipes have no inventory. The Collector selects a destination with the shared Sorter rules, verifies the pipe path to the tap, and moves the source stack directly into the destination inventory using a native container transfer. A full matching destination holds the stack at the source. Pipe arms update on player edits and bank discovery. After rebuilding a lane with commands, run `/scriptevent hartlab:refresh`.

## Bulk Storage in LAB 0.5.0

Give yourself a block with `/give @s hartlogistics:bulk_storage 1`. Place it touching a lane block. For the first Hopper test use the side of the inlet so every downstream column is reachable on refill. Registration follows the constructed lane. Multiple discovered members contribute 200,000 ordinary items each. Interact with a member to inspect stored counts; network status includes the number of members.

Verified ordinary vanilla stacks can use counted storage. The Collector currently supplies real inventory slots. When a claim cannot accept the remainder, admission journals that native withdrawal, records a Receiver-owned credit, then commits the virtual debit and Bulk credit together in the member's record. Overflow skips physical transport. Admission rate from native input is still subject to the existing intake cycle. Named and metadata-bearing stacks stay on the native route. An unresolved native boundary stops Bulk handling for that network for inspection. A confirmed Receiver credit can finish on subsequent access without replaying the withdrawal. Ordinary player removal is prevented while contents or an intent remain.

Filtered and live-seeded AUTO destinations take priority. A partly available chest receives the quantity it can accept. When all verified members are full a matching remainder can use wildcard. Unclaimed ordinary items can use wildcard first. This build covers a single discovered delivery lane and its directly attached members; terminal Collector storage and general multi-bank reconciliation are future integration work.

When intake has no productive dispatch on a refill opportunity, stored cargo can refill an eligible chest. Hopper refill enters the lane at the member tap and travels downstream; Transporter refill checks the connected pipe route. Chest delivery counters and Bulk stored balances are separate. Use a dedicated loaded LAB lane and avoid command-editing populated members. Bulk lookup, throughput, art, and save/crash behavior require BDS validation.

To test both methods, fill a filtered output, offer 64 ordinary blocks, and inspect the member for 64 stored. Free exactly 32 matching spaces. Verify the chest gains 32 and Bulk shows 32. Repeat with the second transport method.

## Fresh LAB 0.5.6 flow controls and direct relay

Power a Collector to pause new intake there. Power a Receiver to pause new intake from every linked Collector and pause its Bulk refills. Removing power resumes admissions. Already dispatched items drain to their selected destination. Other banks continue operating. Status lists powered controls.

At a remote Receiver, a face-connected Transporter can end against a linked return Collector. A Sorter can also output directly into an adjacent linked Collector. An unseeded wildcard or an appropriate filter works for the Sorter relay. A bare pipe exit handles items left without a matching Sorter route. Link the return Collector to the next Receiver. A Collector linked to the same Receiver is ineligible as its own output.

Direct handoffs use a five-slot persistent native entity inventory inside the Collector. The next bank pulls original stacks from it. A downstream Receiver can pause while accepted items wait there. Drain the buffer before breaking the Collector. A world edit that forcibly removes an occupied Collector leaves its buffer at that address for recovery by replacing and linking the block.

Physical Hopper lanes may admit one additional compatible ordinary stack from the same Collector for the same destination, up to two admissions per shipment. Both quantities must fit. A power signal stops further admissions while the active shipment drains. Temporary chunk coverage reuses the cached set while the shipment runs.

Offline routing tests cover both direct connections, named items, power and resume, Bulk refill, and overlapping Hopper delivery. Live BDS validation remains pending for this version.

## Collector input

A Hopper pointing into the Collector supplies its contents for routing. Its presence reserves the input even while empty or redstone-locked. Multiple incoming Hoppers take turns. With no incoming Hopper, the existing direct adjacent-container input is available.

## Shipment identity and recovery

The experiment still serializes shipments on overlapping lanes. Native Hoppers move the items. Script inspects the addressed tap for delivery and checks empty lanes before dispatch or during stalled-shipment recovery. Keep test lanes dedicated to addressed traffic. Manual inserts, Hopper minecarts and external feeders can introduce indistinguishable items. Native transfer rates, route length and stalls affect throughput.

Status reports session totals. When a live shipment closes in recovery, recorded destination transfers count as delivered and the remainder counts as unconfirmed. A restart intent has no verified session dispatch quantity.

New shipment records identify the Receiver and actual lane. Restart recovery waits for the original lane to empty. Inspect its physical output and clear items from a dead end as needed. An unresolved 0.2.0 shipment record suspends new dispatch because its fixture bank name cannot safely identify the current lane.

## Validation

Run `node tests/mock_routing_test.cjs` for translated and rotated banks, directed paths, delivery, metadata, full inventory handling, explicit bindings, unavailable chunks and restart recovery. For BDS 1.26.60.6:

1. Capture setup and status with the installed banks loaded. Check the ten-Hopper installation for forty discovered Sorters. Record other Receivers separately.
2. Set a distant FILTER and feed one named item, then an ordinary stack. Count the source, lane, output and destination before and after. Repeat with seeded AUTO, WILDCARD and BYPASS. Fill a matching inventory and check the eligible overflow destination. Fill all eligible outputs and verify the input holds.
3. Run both banks together, then interrupt one shipment with a restart. Inspect native inventories and total item quantities before adding more traffic.
4. Capture equal-duration idle and busy Script Profiler traces, server tick timings, item counts and status counters. Production throughput and BDS timing remain unmeasured.

The offline suite also exercises a 10-Transporter, 40-Sorter bank alongside an active Hopper bank. In LAB, send a named stack past a wildcard to a distant matching filter, fill the destination, and repeat after interrupting and reconnecting the pipe. Verify the chest contents, pipe arms and status counts on BDS.

## Fresh LAB 0.5.7 metadata-rich cargo

Metadata-rich (MR) cargo stays in its original native slot until a reachable final inventory has an empty slot. Filter claims precede live-seeded Auto, then cargo can use Wildcard if no matching output accepts it. An output Collector can extend the search into its linked Receiver's bank. A visited Receiver closes a cycle. Redstone pause, no available eligible storage, or an unavailable route can leave the item at its source. Ordinary Bulk balances are reserved for plain stacks. An MR shipment on either lane uses a single native slot-to-slot move after verifying its path. It does not ride through the individual Hoppers. Local source slots rotate and a Collector gives ordinary input a turn after two successful MR admissions.

Use `/scriptevent hartlab:mr_status` to inspect readable Collector inputs, including paused inputs, and outstanding reconciliation records. Inventory slot numbers start at zero. Native source chests and input Hoppers remain available for ordinary player withdrawal. A record contains both endpoints and slots. After an interrupted move, inspect both inventories. Move any remaining item out of the recorded source slot by hand, then use `/scriptevent hartlab:mr_clear <record-id>` to release that slot. Clearing a record moves no items. Punch an installed filter out of its native frame before removing its Sorter.

For LAB acceptance use two identically named books with different enchantments, a damaged named tool, two potion variants, and a plain stack. Check both bank types, the remote Collector relay, and a mixed source under load. Pause the downstream Receiver, restart, then resume and compare actual source and final chest items including enchantment levels, damage, lore and potion variant. Fill the matched chest and check source retention and ordinary progress. Hard-stop durability across native inventory and world-property saves still requires a controlled BDS test.

## Fresh LAB 0.5.9 inline Hopper inputs

Ordinary items inserted into a discovered Hopper lane can be collected when they reach a tap with a matching FILTER and an output that can fit the stack. Loaded filtered taps are checked in four staggered groups, one group per tick. The native Hopper chain carries items between taps. Status reports these transfers under "lane input delivered". Collector shipment counters track their own traffic.

This path skips powered Hoppers, paused Receivers, recovery traffic and items of the same type as an active shipment on the shared lane. Local AUTO, WILDCARD, Bulk overflow and metadata-rich intake from inside the lane are outside this build's passive filter handling.

LAB baseline on 0.5.8: with the Collector idle, all 256 chest-fed stone bricks bypassed the downstream filter and reached the catch chest. Repeat with room for four stacks in filtered storage. Compare the idle, busy and post-drain Server Timings captures in the same world.

### 0.5.10 cold registration fix

Deferred chunk discovery now completes the Sorter index on an idle bank. Status shows the number of passive filter taps and cumulative readable tap checks. These counters distinguish a registered lane from one actively checking its Hoppers.
