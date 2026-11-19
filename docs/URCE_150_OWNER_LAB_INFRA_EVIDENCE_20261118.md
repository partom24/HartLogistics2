# HL-E-URCE150-INFRA-002 — Owner player-LAB infrastructure validation and next Transporter model

**Evidence collected 2026-11-18. Canonical cross-branch owner observation record.**

This file is a **permanent, textual owner-evidence carry-forward** on `main`. It preserves the observed facts in the owner's screenshots and subsequent clarification. Full historical evidence remains separately pinned in [the original evidence archive](project-reference/evidence/MAIN_HL_E_CHRONOLOGY.md); this record is an *addition*, not a rewrite of older accepted history. Its branch-specific interpretation matches [the URCE development ledger](https://github.com/partom24/HartLogistics2/blob/dev/urce-150-runtime-20261118/docs/ENGINEERING_EVIDENCE_REGISTER.md).

## Source installation, environment, visuals

Owner installed **1.5.0 infrastructure-only preview**, exact source commit `7fa7951f4a45f6e2a344856f3a715134d50f0fd8`, into the copied LAB using the one-file PowerShell launcher. Installation reported saved rollback backup `lab-ad81804f1005`. The prior magenta/black rendering failure was **resolved by owner-clearing stale Minecraft client files from an earlier reused 1.5.0 resource-pack attempt**. This was not a missing source geometry, invalid JSONC comments, or evidence that `texturepack-required` fixed anything.

## Observed player-first acceptance

1. A stack of new Transporters and other blocks **placed as expected with no missed placements**, preserving ordinary player responsiveness. Owner reported same general behavior for visual Bulk preview, not active Bulk custody.
2. A connected set of Transporters responded to inspection with **6 Transporters / no nearby native endpoints**; a second user-built layout reported **8 Transporters**, with **8 Sorters, 1 Collector and 1 Receiver** nearby. These are live **undirected visual topology counters**, not a directed route certificate or item custody proof.
3. Owner built **two banks** and explicitly confirmed that **the two Collectors linked to the two Receivers**. Screenshots show successful Collector→Receiver link messages and active Receiver state. Treat link establishment as **owner-confirmed**, not an open "please reproduce" item. At the photographed moment, Receiver queues were **0/250000** and output Hoppers marked **missing**; this does **not** establish indefinite delivery or an infinite valid route. Owner expects the links to support continued routing when a valid output path exists.
4. Existing vanilla Hopper routing remained active. Owner describes similar overall timings and successful block placement. The VS Diagnostics capture shows nonzero script/Server Tick work, but does not provide an independently extracted numeric TPS, p95 or before/after throughput result. **Qualitative responsiveness PASS; quantitative 1.5 performance comparison not demonstrated.**

No player acceptance requires arbitrary developer-chosen XYZ, a fixed rig, prescribed bank geometry or restricted ordinary item IDs. Native-MR routing remains structurally separate.

## Owner-directed follow-up visual change

The **fourth supplied screenshot** is from an earlier HartLogistics attempt and is a requested model direction: bring back a **4×4 pixel center-core Transporter** with thin arms joining face-adjacent **known blocks it can interact with**. This means a small 4×4×4-pixel center within one Minecraft block cell, **not** a four-by-four-world-block multiblock. A previous PG27 prototype is the preferred visual precedent; it has independently owner-accepted east/west seams [HL-E-074](https://github.com/partom24/HartLogistics2/blob/main/docs/PG27_TRANSPORTER_VISUAL_CORRECTION.md). Retain **visual infrastructure** as Transporter's primary job, not per-segment physical cargo transit. Do not reintroduce historical PG26 Q5 or its abandoned custody path.

## Engineering disposition

New source candidate **1.5.1** restores PG27-style connected geometry while protecting the existing 1.4.2 cargo engine; uses native player placement/break events for **visual-only** neighbor states, no per-Transporter tick loop. BP/RP headers/modules/dependency increment together from 1.5.0 to 1.5.1 to avoid the proven cache-version collision. A separate one-file PowerShell Plan/CheckLab/Install/Rollback flow checks exact 1.5.0 predecessor hashes and supports owner choice to update only the copied LAB. Source CI and synthetic installer/rollback passed at [commit b51b966bee6db3d6ed73761ccd87d4701805234a](https://github.com/partom24/HartLogistics2/commit/b51b966bee6db3d6ed73761ccd87d4701805234a), [GitHub Actions run 44450801857](https://github.com/partom24/HartLogistics2/actions/runs/44450801857).

The owner has **NOT yet installed or Bedrock-tested 1.5.1**; the player test should evaluate arms joining and disappearing against whichever valid player arrangement they select, and check existing two bank links without rebuilding them. Bulk storage remains intentionally inactive in both previews.

**Boundary:** The linked endpoints are accepted. "Routes forever" remains a *design expectation*, not evidence of measured indefinite item flow; no claims of full URCE functional routing, MR custody, Bulk storage, cross-chunk capacity, zero-loss transfer, or 1400-Sorter performance PASS are made.
