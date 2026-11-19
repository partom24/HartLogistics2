# URCE U1 native Hopper topology witness — implementation increment (2026-11-19)

**Branch:** `dev/urce-150-runtime-20261118`. **First physical-bank development slice after owner confirmation of the already built 13-bank LAB.** [Owner bank definition](URCE_150_OWNER_BANK_DEFINITION_STORAGE_ARRAY_20261119.md), [loop defect #86](https://github.com/partom24/HartLogistics2/issues/86), [original 1.4.2 writer census](URCE_150_ACTIVE_142_WRITER_CENSUS_20261117.md).

## What the code adds

- `planning/src/urce_u1_native_hopper_witness.mjs` accepts injected native-shaped `getBlock(dimension, {x,y,z})` responses and exact 1.4.2-style Collector/Receiver registry entries. It verifies loaded endpoint types and traces **only directed vanilla Hopper output orientations** using the same `facing_direction` mapping as the protected original code.
- A verified Receiver-output-Hopper chain terminating at a known loaded Collector produces a *positive* directed **Receiver → Collector** witness. An existing verified Collector → Receiver link joins those observations in U1's read-only graph; a positive cycle may **REJECT** a newly proposed link or mark an already saved loop. No inventory slots, dynamic properties, Q4 journals or gameworld objects are modified.
- A missing/unknown chunk, unsupported Sorter/Transporter/chest boundary, stale registry, unknown physical direction, read-cap or hop-cap stops inference. The observer **never authorizes a link**. No negative path observation proves the absence of every alternate managed/vanilla source route.
- Per-call reads are deduplicated and bounded. No global per-tick source Hopper/Transporter scan, persistent destination directory, speculative item flow or installed-world code is added.
- `planning/tests/urce_u1_native_hopper_witness.test.mjs` covers four Hopper-facing directions, the exact **two-bank closing-link defect**, persisted two-link cycle without modifying saved data, unloaded/unknown/unsupported boundaries, false visual-Transporter adjacency, reversed Hopper, read/hop limits, invalid registry and reader failure, and a **13-bank-shaped, translated synthetic chain** with 12 distinct Collector→Receiver links.

## Crucial scope and proof boundary

**SOURCE-ONLY WITNESS, NOT AN INSTALLED FIX.** The owner confirms 13 banks **physically present** in copied LAB. We have **not** obtained native Hopper directions, the 12 active Collector→Receiver link registrations, their actual world geometry or complete source paths. The illustrative offline array does not claim to reproduce their XYZ positions, native reachability or real Bedrock load state.

The existing `addon/behavior_pack/scripts/main.js` still lacks pre-commit link cycle validation. No new release/version, BP/RP, asset, world registration or LAB installer is changed here. Native client-side Transporter visual connections alone remain undirected and must never grant movement/cycle safety.

## Next implementation gate

1. Compose native positive Hopper witnesses with a bounded **Transporter/bank observation and explicit graph-coverage certificate** that can distinguish verified route closure from unknown branches. Use player-accessible block events and native read-only directional facts; never equate an arm with cargo output.
2. Integrate the supported pre-commit check into a **new versioned gameplay candidate**. Prohibited verified back-edges REJECT; incomplete paths HOLD without changing previously persisted links. Audit existing cycles and fence Hart-controlled forwarding without dropping Q4 queues or assuming native Hopper ticks can be disabled.
3. Protect standalone 1.4.2 behavior and source-executed journal traces; add Windows synthetic install/rollback from the exact installed version. Require passing CI, then a separately authorized copied-LAB BDS test using the owner's existing 2-bank and 13-bank layouts.

**Non-negotiable:** a source-only graph witness is never native custody/admission or a durable receipt. Existing world load/unload and external/vanilla inventory operations are not synchronized by this observer.
