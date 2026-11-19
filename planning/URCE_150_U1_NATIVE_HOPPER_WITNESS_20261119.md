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

## Increment 2 — visual Transporter bank-component observation (SOURCE-ONLY)

- `planning/src/urce_u1_transporter_bank_probe.mjs` reads directly adjacent Transporter blocks from injected native-shaped calls and groups bounded face-connected physical runs without querying inventory or assuming a global room/controller is one bank. A complete simple run with exactly one Receiver and one Collector is labeled **CANDIDATE_SINGLE_BANK**; branches, splits and multi-endpoint components remain **UNCLASSIFIED_COMPONENT**. This is just a visual classification hint.
- A visual-only **potential loop** is a reason to HOLD, never sufficient by itself to REJECT a proved-safe physical route or ALLOW a new link. The positive native Hopper witness remains a stronger REJECT when its actual directed return path is confirmed.
- Source regressions exercise two-bank visual return, 13 distinct translated/rotated bank-shaped runs, an open chain, disconnected/unknown Transporters, a branching component and bounded scan budgets. The owner's corrected R19 is a worksheet linkage, not a Minecraft-world block coordinate, so it is not fabricated into the runtime probe.
- **Still not wired to installed 1.5.1 gameplay.** Full directed cargo topology, cycle guard at `useReceiver()`, and safe treatment of existing saved loops remain blocking #86. No `addon/`, manifests, installer, LAB or production modifications.

## Increment 3 — compose pre-commit, read-only supply link snapshots

`planning/src/urce_u1_link_snapshot_gate.mjs` composes the native positive Hopper witnesses with complete simple (one Receiver + one Collector) **managed Transporter bank intent**. It excludes the selected Collector's previous outgoing link when modeling a relink without modifying that saved link. Candidate source→destination reachability can REJECT a provable supply return; unknown chunk/unsupported native Hopper path/ambiguous pipe component/global scan cap HOLD. A fully loaded supported open bank chain returns only `SAFE_SNAPSHOT` and **never** `persistPermitted` or physical execute permission.

The synthetic 13-bank model deliberately uses no known owner coordinates. The owner's real 13-bank **storage structure exists without placed Transporters, Receivers or Collectors**. The no-HL-fixture test confirms zero route is created from the conceptual workbook. The prior two-bank linked loop remains a distinct prohibited regression.

The next source milestone is a Bedrock invocation boundary with topology-change invalidation and safe live revalidation. **No 1.5.1 gameplay link path is changed in this increment**, and the earlier 1.4.2 source writer remains current. Returning `SAFE_SNAPSHOT` is not itself link permission; the runtime must establish same-tick actual loaded facts, revised graph, saved-link epoch, pre-save check and ingress fence and must preserve Q4 on failure. A true game release requires incremented manifests + exact-predecessor LAB/rollback CI and explicit owner LAB authorization.
