# HartLogistics Fresh LAB 0.3.1

This LAB build discovers native Hopper lanes from existing Collector-to-Receiver links. Original block identifiers, models, frame interactions and stored Sorter settings are retained.

## Install and inspect

Use the source updater and pinned LAB installer described in [GIT_WORKFLOW.md](GIT_WORKFLOW.md). Start the LAB server and run `/scriptevent hartlab:setup_io`. Each linked Receiver reports its discovered Hopper and Sorter counts. Setup inspects existing construction. The historical build_layout function is a world-building fixture and is unnecessary for discovery.

## How a Receiver finds its destinations

- A single face-adjacent Hopper is the default inlet. Discovery follows its actual output, including turns and drops, until the first non-Hopper. A native inventory at the end can catch bypassed items. A dead-end Hopper retains leftovers and can require manual emptying.
- A face-adjacent Sorter associates its contiguous vertical stack with that tap. Separate columns and arbitrary stack heights are supported. A Sorter touching competing taps needs an explicit association.
- If the Receiver has zero or several adjacent Hoppers, look at the Receiver and run `/scriptevent hartlab:select_receiver`. Look at the real inlet and run `/scriptevent hartlab:bind_inlet`. Registration stores the selected block in the Receiver's dimension.
- For an offset column, select the Receiver as above, look at its lane Hopper and run `/scriptevent hartlab:select_tap`, then look at a Sorter in the column and run `/scriptevent hartlab:bind_column`. Repeat for additional columns. Registering a new inlet replaces the previous inlet. Column bindings only apply while the anchor is a Sorter and the tap is reachable.
- Directed loops, unknown outputs, unavailable blocks and competing downward Hopper pulls suspend discovery. Player block edits in the discovered area invalidate that Receiver's index. Use `/scriptevent hartlab:refresh` after command, piston or external edits.
- FILTER and seeded AUTO destinations precede WILDCARD. BYPASS is excluded. A full specific destination holds the item at source. Facing-side storage has priority among compatible adjacent inventories. The lane itself is excluded from destination selection.

## Collector input

A Hopper pointing into the Collector supplies its contents for routing. Its presence reserves the input even while empty or redstone-locked. Multiple incoming Hoppers take turns. With no incoming Hopper, the existing direct adjacent-container input is available.

## Shipment identity and recovery

The experiment still serializes shipments on overlapping lanes. Native Hoppers move the items. Script inspects the addressed tap for delivery and checks empty lanes before dispatch or during stalled-shipment recovery. Keep test lanes dedicated to addressed traffic. Manual inserts, Hopper minecarts and external feeders can introduce indistinguishable items. Native transfer rates, route length and stalls affect throughput.

New shipment records identify the Receiver and actual lane. Restart recovery waits for the original lane to empty. Inspect its physical output and clear items from a dead end as needed. An unresolved 0.2.0 shipment record suspends new dispatch because its fixture bank name cannot safely identify the current lane.

## Validation

Run `node tests/mock_routing_test.cjs` for translated and rotated banks, directed paths, delivery, metadata, full inventory handling, explicit bindings, unavailable chunks and restart recovery. For BDS 1.26.60.6:

1. Capture setup and status with the installed banks loaded. Check the ten-Hopper installation for forty discovered Sorters. Record other Receivers separately.
2. Set a distant FILTER and feed one named item, then an ordinary stack. Count the source, lane, output and destination before and after. Repeat with seeded AUTO, WILDCARD and BYPASS. Fill a matching inventory and check that its input waits.
3. Run both banks together, then interrupt one shipment with a restart. Inspect native inventories and total item quantities before adding more traffic.
4. Capture equal-duration idle and busy Script Profiler traces, server tick timings, item counts and status counters. Production throughput and BDS timing remain unmeasured.

Transporters, Bulk Storage and full 1.4.1 migration remain later work.
