# HartLogistics URCE 1.5.10 — direction-aware Hopper / Sorter column gameplay candidate

**Created:** 2026-11-20. **Branch:** `dev/urce-1510-directional-columns-20261120`.
**Predecessor:** owner's actual copied LAB 1.5.9 installed via guarded CheckLab/Install from immutable Git `2b65ccdcef56117f97bdb9995afbc0eb27d2d9cb`. Do **not** touch production or replace the existing installed 1.5.9 with branch source files. The owner retains the 1.5.9 LAB backup for separate historical recovery.

## Owner BDS observations and defect

The owner successfully started BDS `1.26.60.6` with `[Hart Logistics 1.5.9-dev] ready; sorters=1442, collectors=73, receivers=54, registry=v2 9 shards / 202323 chars`. A fresh governed Collector linked to Receiver at `minecraft:overworld 469,73,-497`, and original Q4 accepted four ordinary test items. An initial valid Hopper/Sorter/Filter/storage arrangement subsequently showed `queued 0`, `lifetime received/delivered 4/4`. A second valid arrangement, with a passive chest neighboring the Receiver-output Hopper and no desired Hopper-facing change, did not route fresh items. Note: `4/4` is a lifetime counter, **not** proof of delivery after the layout change.

The 1.5.9 source's `inspectDirectSorterOutlet` indiscriminately rejected **every** inventory next to a Receiver/Hopper, including a vanilla chest at the same height as a downward-facing Hopper; it also rejected any adjacent known native Hopper or Hart-managed block even if no outgoing physical edge existed. This is an engine defect for densely packed player columns. It must not force owner-built storage room reconfiguration.

## Source fix: no phantom horizontal edge from a downward Hopper

`addon/behavior_pack/scripts/urce_159_direct_sorter_home.js` still requires the current registered Receiver, its verified **downward** unpowered native Hopper, the exact vertical registered Sorter column, and positive item-specific Filter/Auto/Wildcard live storage admission before original Q4 dequeue. It now evaluates the **direction** of native Hopper transfer, not mere side adjacency.

- Vanilla passive chests/barrels/inventories are valid next to the Receiver or downward Hopper on **all four horizontal sides and both y-levels**. A normal vanilla container does not draw sideways from a downward Hopper.
- Adjacent native Hoppers with actual recognized facing may be outgoing from *themselves*, but are **not additional outgoing edges of the central downward Hopper**. Sideward incoming sources remain independent, and Q4 discharge still requires an empty output Hopper.
- Adjacent known Hart Collector, Receiver, Sorter, Transporter or Bulk blocks do not become a directed route merely by touching another block. A separate actual managed link or terminal graph route must still pass its own source-local graph guard; adjacency grants no link or custody authority.
- Third-party/unknown side inventories with potentially active extraction, unloaded adjacent blocks, or unrecognized native Hopper directions still **HOLD**.
- Actual Hopper extraction underneath verified destination storage, unknown native destination, unregistered Sorter extent, unknown Auto claim, redstone/locked state, changed graph, verified cycle and incomplete general transport authority still **HOLD**.

The protected main JS custody engine, queue representation, original Q4 journals, physical Sorter writer, resource models, pack UUIDs, scheduling intervals and total count of cargo writers are unchanged. Only the script `VERSION` becomes `1.5.10-dev`; the 1.5.10 manifests are a distinct version to avoid Bedrock's previous same-version cache problem.

## Coverage and interpretation

`runtime/tests/urce_159_direct_sorter_home.test.mjs` now checks:
- **GO-17:** all four sides, both heights, native chest and barrel => 16 valid direct outlets and item homes.
- **GO-18:** all four sides, both heights, six recognized Hopper directions => 48 valid neighbor configurations.
- **GO-19:** five Hart block neighbor kinds with 101 unrelated registered parallel columns each => no phantom outgoing side edge.
- **GO-20:** a *real non-Bypass* destination under-storage Hopper extractor still HOLDs.
- Prior GO-01..GO-16, source graph cycle/unknown, claimant, full Filter/Auto, redstone, unknown foreign inventories and native metadata HOLD remain guarded.

`runtime/tests/urce_full_runtime_native_budget.test.mjs` **FULL-NATIVE-08** uses the entire shipped JS module graph and native stubs: exact four-item Collector => Q4 => Receiver native Hopper => Filter Sorter => intended chest, **zero** deposited into an adjacent passive chest, via the unchanged original Q4 and physical journals. FULL-NATIVE-07 without the extra chest remains the control; 101-column 505-Sorter/five-item fixed workload and 1,442-Sorter idle native-call budgets repeat as source tests. **These are not real Bedrock TPS or player-built outcomes.**

## Versioned LAB safety

New `scripts/hartlogistics_1510_lab_updater.py` authorizes ONLY **one** immutable installed predecessor: `2b65ccdcef56117f97bdb9995afbc0eb27d2d9cb`'s full 1.5.9 BP/RP trees (32 BP / 60 RP files). Source delta is pinned to exactly **four** files: BP manifest, RP manifest, `main.js` version banner, and the read-only direct-outlet observer. Every other source byte is compared with immutable Git history. Any other files, version, stale SHA, world pack registration or source drift **REFUSED**; no automatic same-version replacement. Synthetic copied-LAB upgrade/rollback tests preserve world Q4 opaque bytes and byte-exact restored packs/registries; Windows PowerShell 5.1 and 7 launchers preserve strict error semantics.

Use `distribution/Start-HartLogistics-Lab.ps1` **on the new 1.5.10 branch** with `-Mode Plan -CandidateVersion 1.5.10`. After current exact-HEAD green CI and *owner's choice to proceed*, stop copied BDS, run `-Mode CheckLab -CandidateVersion 1.5.10 -ExpectedCommit <full SHA>`. Only if CheckLab passes may the owner separately invoke `-Mode Install -Apply ...`. No operation from this source development touches LAB or production. Actual Bedrock player proof is pending.

**Next owner BDS test:** Reproduce both valid screenshots/arrangements with fresh separate four-item counts, check intended chest receives all four and passive neighboring chest receives none, check Q4 zero once delivered, repeat with passive neighboring native Hoppers and densely packed adjacent registered columns. Do not release, unlink, pause, or otherwise change the previously protected powered Receiver with approximately 16,982 Q4 items.

**Product boundary:** The owner requires arbitrary valid player Hopper/Sorter column layouts and all logical multi-bank paths. The 1.5.10 candidate repairs directional *local-column* adjacency. A physically connected nonterminal destination, a real downstream extraction Hopper, source-wide multiple unknown branches, cross-bank Bulk overflow, opaque native MR retrieval and arbitrary Hopper-minecart/foreign extraction remain separate governed-routing work, **not certified as implemented**. No local patch should be described as completion of the overall network.
