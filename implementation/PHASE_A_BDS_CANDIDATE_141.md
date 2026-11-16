# Phase A — Hart Logistics 1.4.1 BDS test candidate handoff

**Status: PHASE A SOURCE IMPLEMENTATION PACKAGED FOR BDS TESTING; BDS ACCEPTANCE NOT YET PERFORMED.**

**Current scope:** Genuine native-first conversion of the **original 1.4.1 feature set**, using only canonical source at commit `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`. No new Bulk Storage, Transporter, Q5, or 1.5 custody implementation. Existing Q2/Q3/Q4 and FIFO behavior are compatibility obligations, not redesign topics. The owner reference [Sorter array](../OWNER_PRODUCT_OBJECTIVE.md) and storage-room array remain the scale/functional goals.

## Verified pre-BDS candidate identity

- **Last verified package source:** commit `5e9478fa874f133746ca009e93d1e34a157d59f0`, [successful GitHub Actions #43897251730](https://github.com/partom24/HartLogistics2/actions/runs/43897251730). Later documentation-only commits do not alter the pack's 72 source bytes; always use the successful workflow for the **exact checkout** that is installed.
- **Deterministic `.mcaddon` SHA-256:** `27e5825abfcfa271f12a4fb713aa9519f9255ebb9883478b5ff3ef87e382329e`. Workflow rebuilds twice, checks equal digests, and verifies all 72 packed source file bytes against that checkout.
- **Pre-BDS verdict:** canonical source provenance, 1.4.1 gameplay tests, pinned 2.7 API declarations, cross-platform synthetic updater safety, release hygiene and pack assembly are **offline PASS**. No candidate BDS startup, integration or TPS testing is claimed. **This is the Phase A build ready to enter controlled LAB testing, not owner release approval.**

## Build identity and reproduction

- **Source branch:** `implementation/native-first-engine-141-20261115`, not `main`. Use the **exact source commit recorded on the successful GitHub Actions run**. Do not install or label a previous failed CI artifact.
- **Workflow:** [`native-first-engine.yml`](../.github/workflows/native-first-engine.yml). Download the artifact named `HL2-141-native-first-SOURCE-ONLY-UNVERIFIED` from that run; it contains `HartLogistics_native-first_141_SOURCE_ONLY_UNVERIFIED.mcaddon`.
- **Contents:** original 1.4.1 behavior and resource packs. The BP has `@minecraft/server 2.7.0` and `min_engine_version [1,26,50]`; the BP/RP UUIDs, pack version `[1,4,1]`, block IDs, geometry, textures and the other 71 original gameplay files are unchanged.
- **Deterministic packaging:** the native `.mcaddon` builder now uses fixed ZIP entry metadata and sorted byte-preserving source entries. CI independently builds twice, verifies identical SHA-256, and verifies that every BP/RP member equals its checked-out source byte-for-byte.
- **Build from the matching checked-out branch:** `python3 tools/engine_candidate_guard.py`, then `node --check addon/behavior_pack/scripts/main.js`, then `python3 tools/build_mcaddon.py --output dist/HartLogistics_native-first_141_SOURCE_ONLY_UNVERIFIED.mcaddon`. Source tests run in the workflow. Workflow packaging validation verifies the file listing and every byte of both packed BP/RP against the checked-out source, not merely a token inside `main.js`.
- **No production deploy.** The artifact is for a backed-up, owner-controlled **LAB** only; a validated ZIP and source tests are **not** an installed BDS test.

## Why the remaining custom boundaries are intentional

- **M01/M03/M35:** The 2.7 stable declarations provide no documented lossless vanilla Hopper inventory-change after-event. `firstItem()` inside the existing 1-tick Sorter loop remains **polling**, not native event architecture. It is retained only as the bounded observation gap needed for original routing and owner layouts, pending native BDS cost/arrival confirmation. Do not replace it with `onTick`, comparator signals or a disguised alternative polling scheduler.
- **M04:** Left-compaction protects original unmatched-slot progress; 2.7 `moveItem` has no partial amount or established same-container ordering/runtime equivalence. Continue using the source-compatible path until an isolated BDS proof justifies replacing it.
- **M15/M16 and mode rendering:** Native Item Frames and native block permutations own the implanted Sorter presentation. Regular display and mode reconciliation now skip native-frame owners; historical non-frame filters retain compatibility maintenance, and startup/orphan/entity-load cleanup remains.
- **M17/M18:** Native redstone-consumer callbacks, Hopper lock state and actual Dropper/Dispenser ejection events remain the primary engine-owned signals. Hart still applies original mode/pulse policy.
- **M19/M20:** Collectors/Receivers have no original native inventory component, and a vanilla Hopper cannot insert into virtual linked Q4 or drain a 250k Receiver with an atomic save. Directed Hopper ingestion and Q4-to-Hopper materialization remain custom; native Hoppers own onward physical movement.
- **Original item safety:** Keep original physical journal, Q4 queue journal, world migration and opaque-item fail-closed conditions. Native transfer method presence is not a persistent cross-inventory transaction guarantee.

Detailed code anchors and proof dispositions: [`NATIVE_BOUNDARY_DECISIONS_141.md`](NATIVE_BOUNDARY_DECISIONS_141.md); full original mechanism map: [`NATIVE_FIRST_MECHANICS_AUDIT.md`](../NATIVE_FIRST_MECHANICS_AUDIT.md).

## Repository-approved Phase A LAB updater (source checkout, not manual ZIP replacement)

A checked-in `.gitattributes` rule sets `addon/** -text` so Windows Git does not convert original BP/RP source bytes to CRLF. This is required for the immutable original hashes and the exact candidate digest to validate on the Windows LAB host. Use a freshly checked-out source tree after this rule; never normalize the original add-on files in place.


The Phase A source branch now contains the established [guarded LAB updater](../scripts/hartlogistics_lab_updater.py) brought from main, with [offline synthetic regression tests](../tests/test_hartlogistics_lab_updater.py). It accepts **only** the exact Phase A `scripts/main.js` SHA-256 `fcc640ba886de86dcbfabbb1d8e9683980691d6cc595dde5f5d21ccdb9ec9bbb`; all other original 1.4.1 add-on files must match the immutable `BASELINE_HASHES.json`. This is not a generic bypass of original source hashes.

The original version/pack UUIDs are retained. The updater refuses unknown installed files, wrong world registrations and installed pack versions other than **1.4.1** (including historical 1.5.10 LAB); this is a deliberate state-safety gate, **not** an invitation to downgrade. The named world is discovered from the authorized LAB's `server.properties`; unrelated packs and registry JSONC are preserved. If a 1.4.1 world registration already matches, the updater leaves its bytes unchanged. The exact source checkout and Git SHA must match with no local modifications; the BDS process must be stopped. It stages, SHA-verifies, backs up and supports rollback of pack replacements.

**Only when the owner-authorized LAB host is available and the owner has approved an apply:** on the exact clean checkout at the successful workflow's `head_sha`, with BDS stopped and no automatic restart, run `python scripts/hartlogistics_lab_updater.py --commit <FULL_40_CHARACTER_SHA>` for a non-mutating **LAB-only preview**, inspect the plan, and then run `python scripts/hartlogistics_lab_updater.py --commit <SAME_SHA> --apply` after explicit LAB approval. Never run it in production or against another path. On non-Windows, preview performs an offline source check only and never reads a BDS server.

If LAB still contains a different-version PG27 or an unknown installed pack, **STOP** and preserve that LAB. The owner decides whether to restore the original 1.4.1 LAB snapshot. Do not overwrite, decrement versions, reset Q4, or silently treat unrelated 1.5 data as upgrade input. No manually copying the BDS ZIP or `.mcaddon` into an existing LAB installation; the Git-pinned updater is the endorsed procedure. The `.mcaddon` is a separately packaged candidate artifact.

## Owner-controlled BDS entry and rollback protocol

1. **Confirm BDS engine version and `@minecraft/server` compatibility.** Minimum manifest engine is `1.26.50`; the test runtime must support the exact pinned 2.7 native APIs. Record BDS version and exact GitHub Actions SHA.
2. **Preserve production untouched.** Make independent, verified **snapshot files** of the single owner-authorized LAB world before any update. Keep originals for baseline/rollback and the candidate's trial. Protect Receiver Q4, journals, filters, cargo and loaded/unloaded chunks. No draining, reset or forced migration.
3. **Use only the one authorized LAB server root.** Do not set up a second live server in another path to make comparisons. Baseline and candidate must be tested **sequentially** from controlled snapshots in the exact allowlisted LAB location, never with two writers on the same saved world. The candidate keeps the same BP/RP UUIDs and version as original; never install the two concurrently.
4. **Boot in correctness/debug mode first.** Use the already-installed **VS Code Bedrock Debugger**, BDS logs and existing `hartlogistics:status` command. Confirm pack loads, custom component registration succeeds, no Script API errors, no unexpected Q4 migration or journal replay, and all original arrays/link IDs resolve. Check item/metadata identity using existing inventory/debug inspection.
5. **Then capture performance separately** with no stopped breakpoints: BDS diagnostics/watchdog and built-in Script Profiler (`/script profiler start` / `/script profiler stop`; optional `/script diagnostics startcapture` / `/script diagnostics stopcapture` where supported). Retain original native `.cpuprofile`, diagnostics and server logs; no new logging/telemetry pack.
6. **Baseline-versus-candidate comparison** must use equivalent snapshots, loaded chunks, intervals and other enabled packs. The approximately 1,400-Sorter reference topology and existing storage-room array must be exercised naturally—not replaced with one-column approximations. Provisional >=19.5 TPS target is not a certified product limit; item correctness is mandatory.
7. **Stop and restore snapshot** on unexplained loss/duplication, damaged metadata, incorrect Filter → Auto → Wildcard priority, BYPASS/redstone violation, migration or Q4 ambiguity, failed custom block load, unexpected world write, or watchdog/performance regression. Do not disable the watchdog or claim acceptance from CI.
8. **Report BDS evidence before authorizing release.** This test handoff does not approve production deployment.

## Pre-BDS owner boundary

**The next required interaction is access to the owner's Windows LAB environment**, not a source-code decision. The previously reported installed LAB may still carry version **1.5.10-LAB-PG27**; that is a historical report, **not a current inventory**. The guarded updater will refuse that pack/version rather than downgrade it. When BDS testing is scheduled, verify the current installed LAB pack identity and preserve a clean 1.4.1 production-derived LAB snapshot before allowing any `--apply`. No other server root, automatic reinstallation, or production path is authorized.

**No manual physical rig request is ready** until real owner-world coordinates/loaded chunks have been checked. Use the existing owner reference arrangements rather than constructing an artificial one-Sorter substitute. Test rig cards, if needed, must follow [the existing test-rig contract](../docs/TEST_RIG_CONTRACT.md). The owner has not yet supplied Phase A BDS profiling or runtime observations.

## LAB functional acceptance matrix

| Gate | Required BDS proof (pass/fail with exact original vs candidate snapshots) |
| --- | --- |
| A1 startup | Both BP/RP load; 1.4.1 block IDs/UUIDs and stored registry survive; no script errors |
| A2 idle scale | Owner-sized native Hopper/Sorter arrays, empty and loaded; measure 1-tick observation cost with native profiler and BDS tick diagnostics |
| A3 routing | Specific Filter → destination-seeded Auto → Wildcard, bottom-to-top tie order, BYPASS, late seed removal, unmatched vanilla pass-through, full/partial chest slots |
| A4 cargo | Distinct metadata-rich items, enchanted book type-sets, potion variants, max stacks, nonstackables and all compatible original item identity paths |
| A5 physical/redstone | Lock/unlock source Hopper, powered Sorter/Collector/Receiver, vanilla Hopper timing, backpressure, blocked output and preserved no-write conditions |
| A6 Collector | All six possible directed Hopper positions and opposing/non-pointing negative cases; actual Dropper/Dispenser ejection only (no inventory siphon) |
| A7 Receiver/Q4 | Q2/Q3/Q4 migration on preserved snapshots, FIFO, 250k logical cap, 200k backlog, blocked/locked output, journal fail-closed ambiguity, reload/restart and chunk unavailability |
| A8 presentation | Native Item Frame insert/remove/physical return, legacy displays, mode indicator persistence, late loaded chunks, orphan entity cleanup after restart |
| A9 throughput | Native Script Profiler and diagnostics from identical sustained/idle/blocked windows with other packs present; TPS, native call hotspots and useful items/sec |
| A10 final reconciliation | No unexplained count/metadata delta across source Hoppers, target storage, physical outputs and existing Receiver queue; same saved-world topology and links |

All gates remain **UNTESTED IN BDS** until actual owner-authorized LAB evidence is collected. An unsafe or missing guarantee is a blocked gate, not a permission to revise 1.4.1 semantics.

## Non-goals and release boundary

This source-only candidate may be **ready to test** without being **accepted for release**. No 1.5 architecture, Q5, new block families, custom telemetry suite, reinterpretation of FIFO or artificial owner build restrictions. Do not deploy to production automatically. See the takeover [`TAKEOVER_NATIVE_FIRST_141.md`](../TAKEOVER_NATIVE_FIRST_141.md) for overarching constraints.
