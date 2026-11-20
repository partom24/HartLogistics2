# HartLogistics 1.5.7 — read-only Hopper boundary diagnostic LAB test

**This is a DIAGNOSTIC test build, not a queue release or generalized routing fix.** Existing owner copied LAB runs 1.5.6; this upgrade requires the exact immutable 1.5.6 pack predecessor commit `63f3443b863c1e674c0cb3f2b5026806167b09f9`. Only five pack files change: behavior/resource manifests, `main.js` status text, `urce_152_native_hopper_witness.js`, and `urce_152_link_snapshot_gate.js`. Saved Q4 data, protected 1.4.2 item writers, linked endpoints and Transporter assets are unchanged.

## What owner already proved

Screenshots from the real copied LAB:
- Collector near `483,71,-482`, 1 native Hopper input, active, waiting 0, linked to Receiver `minecraft:overworld 482,73,-482`.
- Its route safety says `ROUTE HOLD (unverified_native_supply_boundary: unsupported_native_boundary)`.
- Receiver has 1 linked/online Collector, **16,982 queued**, output Hopper inventory 0, lifetime received 52,950/delivered 35,968; counts reconcile.
- Owner states the intended path is **Receiver → native Hopper chain → Collector → Receiver → native Hopper chain → Collector → Receiver → native Hopper chain → storage end**, with no loop. Transporters are NOT required and currently carry no cargo.
- Owner has **powered/paused** the affected block to retain Q4 and will keep it powered until an evidence-backed fix is safe.

**Exact source cause:** The Hopper-only observer reports `unsupported_native_boundary` when an actual chain from a Receiver reaches a non-air block other than a known Collector. The Collector's earlier status revealed the reason, but not the block position/type. The Receiver's status suppressed that detail. It might be a legitimate storage endpoint, Sorter, or a truly uncertain route. No guessing which block caused it.

## Owner test instructions — DO NOT release stored cargo

After strict stopped copied-LAB Plan → CheckLab PASS → owner-approved Install -Apply, start the copied LAB and confirm `Hart Logistics 1.5.7-dev`. **Leave the affected redstone-powered block ON, do not move, drain, unlink, rebuild or add items.**

1. Interact with the **same Collector** near `483,71,-482`. Its message should continue to say `ROUTE HOLD (unverified_native_supply_boundary...)`, but now append a visible **block type, native dimension, XYZ coordinates and originating Receiver ID**, e.g. `[minecraft:chest @ minecraft:overworld x,y,z from receiver ...]`. Example values are illustrative, NOT a prediction of the owner's actual block.
2. Interact with the Receiver linked to that Collector at `482,73,-482`. It should now also display the nested reason; this status must not release or rewrite queue items.
3. Record the **exact text** (screenshots or copied chat) plus Receiver `queued`, `lifetime received/delivered`, `output hopper`, and `state PAUSED` when powered. Item counts should remain stable given no other permitted sources/drains.
4. Stop immediately if route status unexpectedly changes to `verified snapshot` or if items move. **This build does not authorize a transition from HOLD to SAFE**, and has no writers.

These observations tell us which actual loaded block creates the boundary. Only then design source-scoped terminal/continuation classification that prevents accidental reverse feedback. A chest/Sorter cannot blindly be certified as a sink, since native Hoppers may extract from some containers. Build a second guarded native-verified candidate to address the HOLD, with regressions for terminal storage, Native Hopper pull, loops, unloaded boundaries and genuine uncertain branches. No full-world per-tick scanning: performance issue #87 remains open.

## Preservation and rollback

Keep all historic owner LAB backups including `lab-0bff63ebe84e`, `lab-c77b47f7c165`, `lab-6868c8d64947`, plus 1.5.5/1.5.6 tags and the new generated 1.5.7 tag. Stop only the COPIED LAB for install/rollback. No production server or saved Q4 mutation. Source CI and synthetic Windows rollback prove code/transaction contracts, **not** live Bedrock routing correctness, performance or queue release. User will be given exact full SHA and copy-ready PowerShell Plan/CheckLab then separate Install after CI passes.
