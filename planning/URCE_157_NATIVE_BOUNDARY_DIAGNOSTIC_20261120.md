# URCE 1.5.7 native Hopper boundary forensic observer (2026-11-20)

## Confirmed owner issue

The owner connected an **acyclic** physical sequence of native Hoppers and real Hart Collector/Receiver blocks, with a terminal storage array. No transporters needed or cargo movement through Transporters. A linked Collector near 483,71,-482 displays `ROUTE HOLD (unverified_native_supply_boundary: unsupported_native_boundary)` and its Receiver at 482,73,-482 holds 16,982 Q4 items. Counts 52,950 lifetime received minus 35,968 delivered equal 16,982. Owner powered the block to pause and preserve items. See #86.

The reason originates in the **read-only native witness**: when it starts below a Receiver and follows a directed Hopper chain into a **loaded unsupported block type**, it adds `{from:receiver.id,reason:"unsupported_native_boundary"}`. A source-reachable result causes the link snapshot gate to HOLD. The gate's `observationReason` lacks block details; the Receiver status drops the child reason entirely.

## 1.5.7 diagnostic-only correction

In native witness, add only **read-only details** to existing unknown entry: the exact dimension, boundary XYZ, typeId, originating Receiver ID. The graph, native edges and `coverageComplete:false` do not change. In link gate, format the existing HOLD's nested `observationReason` with these fields, e.g. `unsupported_native_boundary [minecraft:chest @ minecraft:overworld 100,72,-420 from receiver R]`; no `decision`, proof level, or link mutation change. In `main.js receiverLinkSafety`, forward `observationReason` to `linkSafetyLabel` so both Collector and Receiver display the precise block. The original 1.4.2 native physical/Q4 writers and all other five control-plane modules remain unchanged.

New pure source-executed tests verify non-authorizing HOLDS for chest, Sorter, barrel, dispenser; evidence correct dimension+XYZ+type+Receiver; no Q4/registry changes; unloaded/unknown boundaries stay HOLD; truly air termination does not invent blockage; positive verified cycles still REJECT; receiver nested reason forwarded; no cargo-writing API in changed control-plane. Exact-history source/runtime parity tests and native-call budget trace still required. **This deliberately does not turn any unknown path SAFE**.

## Why source diagnosis before implementing a terminal bypass

A vanilla Hopper ending at a chest/Sorter might be a legitimate final storage sink *or a path into another native Hopper via container extraction*. Our graph currently cannot distinguish those cases without additional directed evidence. Blanket terminal authorization could let an actual feedback loop circulate saved cargo. The targeted diagnosis identifies the owner's actual block before another conditional scan or performance-intensive graph observer is designed. Do not force the owner to break or relink their physical array, and leave the powered block ON through this test. Source CI green cannot override actual BDS findings. Planned next repair requires positive native direction/terminal evidence, reader budget and fail-closed unknown.

This artifact is a source candidate only, backed by exact 1.5.6 predecessor pack SHA `63f3443b863c1e674c0cb3f2b5026806167b09f9` and transactional 1.5.7 updater. Owner retains control of stopped copied LAB installation and future Q4 release.
