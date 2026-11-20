# HartLogistics 1.4.1 parity — mandatory compatibility and regression gate

**Date:** 2026-11-20. **Source branch:** `dev/urce-159-141-parity-20261120`. **State:** Source remediation under evaluation, **NOT** a deployable or BDS-accepted 1.5.9 build.  
**Baseline authority:** [original 1.4.1 source-review ingress/egress matrix](BASELINE_INGRESS_EGRESS_MATRIX.md); [owner-approved product contract](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md); [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md).  
**The original uploaded 1.4.1 mcaddon was not re-executed in BDS as part of this source change.** The canonical matrix records original source-review evidence; source-model parity is not owner LAB parity acceptance.

## Owner-reported regression / source-confirmed mechanism

The original 1.4.1 Receiver **only** needed the native Hopper directly beneath its block to accept a scripted Q4 drain; *the Hopper's subsequent movement and facing direction were vanilla Minecraft behavior*. That includes a sideways output Hopper pointed toward a native Chest/Barrel/Shulker Box and a directed chain of Hoppers ending there. Existing 1.4.1 networks were not required to have a downward-facing Receiver Hopper aligned above a complete registered Sorter column.

In 1.5.9, a new governed Q4 drain gate recognized **only** an exact Receiver→down-facing Hopper→vertical Sorter column→registered storage home. The native link guard reported a Hopper-ending Chest as `unsupported_native_boundary`; a linked Receiver without the recognized direct-Column route would HOLD rather than dequeue. This is a **behavioral compatibility regression**, even though the items stay preserved in Q4.

The new feature branch supplies a narrowly bounded **positive native terminal witness** in `urce_159_direct_sorter_home.js`: verify the live Receiver, immediate output Hopper, native Hopper facings 0–5, bounded directed Hopper segments, and terminal Chest/Trapped Chest/Barrel/Shulker. Known cycles, unloaded blocks, invalid storage, redstone lock, and **known Hopper extracting under the terminal** remain HOLD. An `unsupported_native_boundary` may be resolved only when it was the **sole source-reachable** unknown, still belongs to the exact Receiver after a **forced fresh** graph observation, and matches the newly inspected terminal block type and coordinates. No negative global graph/claim assertion is made.

On a verified `DIRECT_NATIVE_TERMINAL` lane the **existing** `dequeueToReceiver` Q4 journal/debit/native output-Hopper credit runs unchanged. Vanilla Hopper machinery remains responsible for any subsequent movement into the chest. The terminal witness contains NO native inventory writer, persistence, or cache. It is not a new global home policy, native MR carrier or Bulk path. Full-route BDS proof remains outstanding.

## Mandatory 1.4.1 route parity inventory

| Gate | Original capability (source review) | Required test | Current evidence |
| --- | --- | --- | --- |
| P01 | Hopper directly above Sorter column; Filter/Auto/Wildcard/Bypass and native supported storage | Source modes, ordinary/MR, powered Sorters, Hopper locking, destination admission | Original 101-column source decision fixture + selected tests; BDS unverified |
| P02 | Directed Hopper on any of **six** Collector faces | Every facing correct/reversed + lock + link/unload | Legacy source code retained; BDS unverified |
| P03 | Receiver Q4 → immediately-below Hopper, **any vanilla output orientation** | Down/N/S/E/W Hopper terminal; native Hopper chain; chest/barrel/trapped/shulker; capacity/backpressure | **Regression in 1.5.9**; feature-branch source witness and regression tests added, BDS unverified |
| P04 | Collector→Receiver Q4 while Receiver unloaded; existing links/queues remain valid | Queue replay, 250K cap, Q4 journal, recovery and restart | Synthetic source tests only; real world upgrade unverified |
| P05 | Dropper/Dispenser only when actively ejecting a qualifying item at Collector | Pulse correlation, no incidental pickup, powered grace | Original path retained; BDS unverified |
| P06 | Hopper directed Collector path → safe queue or restricted MR fallback while awaiting native MR replacement | Exact ItemStack identity, fallback safety, redstone, backpressure | Original source retained; URCE MR replacement not yet accepted |
| P07 | Receiver output Hopper can also be the input directly above a Sorter; Sorter→Collector chaining | Repeated bank-to-bank delivery and deliberate no-unsafe-loop proof | Narrow 1.5.9 lane passes source-model; arbitrary networks unverified |
| P08 | Existing 1.4.1 pack identifiers, saved link/registry and Q2/Q3/Q4 persistence | CheckLab on copied world, unchanged pack UUIDs, interruption/recovery and rollback | Version-specific updater/source synthetic tests; owner BDS required |
| P09 | Unsupported item is never silently destroyed/flattened | Exact metadata-rich native paths and journal replay | Scoped original/PG20/PG42 evidence; integrated URCE not yet accepted |

**All nine categories must retain an owner-observable player-first capability or have an explicitly approved and BDS-tested equivalent replacement.** A “safe HOLD forever” is not acceptance if 1.4.1 delivered normally, and simply weakening cycle safeguards to restore throughput is equally unacceptable.

## Test evidence and open gates

- Added `runtime/tests/urce_159_legacy_native_terminal_parity.test.mjs` to check all six Hopper outputs; supported storage endpoints; two-Hopper chain; unverified, locked, extraction, cycles; fresh exact-source native boundary; single custody writer; shipping dequeue journal/debit/credit and HOLD preserving queue balance.
- Added dedicated **feature-branch source-only GitHub CI** `.github/workflows/urce-159-141-parity.yml` with the original 1.5.9 direct Sorter, fixed 101-column/five-item test, full-runtime Q4/native-stub budget and U0 writer checks. **Check its actual workflow conclusion** before claiming CI green.
- Real committed helper and the exact shipping `liveLinkCheck` and `dequeueToReceiver` functions have been executed in synthetic V8 stubs: all six facing values returned the positive native terminal; a known extraction Hopper refused; source-scope link required two observations; a four-item Q4 drain recorded the original journal, Q4 debit and Hopper credit once, while HOLD performed **zero writes**.
- No Bedrock BDS movement, chunk reload, normal Node runner or owner acceptance is established solely by these synthetic V8 checks. The new source branch has **not** been re-pinned into the strict 1.5.9 LAB installer, distributed as a build or installed. Do NOT use the old 1.5.9 updater with these unreviewed changed source bytes.

## Required continuation

1. Execute new feature-branch CI, diagnose every failure, and verify that 1.5.9 direct-Column, native-loop checks, original 101-column outcomes and Q4 writers still pass.
2. Re-run matching **original 1.4.1 vs candidate** source/BDS behavioral fixtures in the owner-approved disposable LAB: Receiver Hopper facing any orientation into normal storage, and controlled Hopper chain ending in storage. Include missing/locked/filled chest, under-chest Hopper extractor, foreign input, relink and a provable cycle. Compare item counts and custody logs.
3. Close the broader parity matrix, not only P03. The original archive may require re-upload if its exact 1.4.1 bytes are needed for a fresh executable direct differential; the existing source-reviewed matrix remains the contract.
4. Re-pin versioned pack/install sources in an incremented **new** guarded candidate after review. Do not loosen immutable predecessor or current source hashes, trigger source auto-install or touch production. **Owner approval** is required for copied-LAB apply.
5. Preserve the owner project-wide read order in `AGENTS.md` and `DEVELOPMENT_START_HERE.md`; treat this finding as a product compatibility blocker, not another alphabetic research stage.
