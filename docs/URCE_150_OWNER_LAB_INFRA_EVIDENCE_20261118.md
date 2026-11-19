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


## 2026-11-19 owner follow-up — HL-E-URCE151-VISUAL-003

**OWNER-CONFIRMED / FOUR IN-GAME SCREENSHOTS — SCOPED VISUAL PASS.** After the 1.5.1 connected-model candidate was prepared, the owner supplied four in-game screenshots and explicitly confirmed: "**all the transporters are the correct size/shape and connecting to HL blocks**."

**Accepted without repetition:** visible compact Transporter shape/scale and arm connections to HartLogistics components in the owner's player-built layouts. This closes the primary requested PG27-style 4×4-core visual correction and HL-block adjacency-appearance checkpoint. The November 18 line above saying 1.5.1 was not yet player-tested is **superseded for this specific visual scope** by this November 19 owner observation.

**Not newly verified by these screenshots:** exact installer invocation or installed Git SHA / pack hash; all six directions and all non-Hart native endpoints; arm removal/disconnection under block break; across-restart visual repair; item transport, Bulk custody, MR fidelity, directed route selection, sustained 1.5.1 Hopper throughput, p95/TPS, rollback or release. Do not turn visual adjacency into a routing certificate or require the owner to repeat the already accepted model-and-HL-connection visual test. Earlier 1.5.0 Collector-to-Receiver linkage and placement/responsiveness observations retain their own scoped standing.

**Engineering continuation:** keep the 1.5.1 payload stable during remaining acceptance work, continue source-only U1/U2 routing/custody invariants, and request targeted Bedrock evidence only for a materially different remaining capability.


## 2026-11-19 owner correction — HL-E-URCE151-LINK-CYCLE-004 (BLOCKING)

**New owner-reported physical topology of the previously accepted two-bank link installation:** `Receiver 1 -> Collector 1 -> Receiver 2 -> Collector 2 -> Receiver 1`. Both individual Collector-to-Receiver link messages were already accepted; the newly disclosed fact is that the source/supply arrangement returns to its origin. The intervening Receiver-output-to-Collector-input supply legs are an **owner statement**; old screenshots and undirected visual Transporter inspection do not establish their exact directed Hopper/Sorter route. Do not invent positions or require the owner to reproduce the two already-confirmed links.

**This configuration is NOT an accepted URCE route.** Prior owner product policy explicitly rejects managed Collector->Receiver links that close directed supply cycles (2026-11-18 product contract §A.2). If the reported paths are verified as item-carrying edges, the last added link must have been refused. In actual 1.5.1 source, `useReceiver()` immediately persists `col.link = receiver.id` with no directed-cycle check. The offline U1 graph would reject the loop but is not integrated with the installed link UI or 1.4.2 writer.

**Impact and boundary:** Missing gameplay enforcement is a blocker, not a player-approved exception. No proof of actual items infinitely circulating, loss, Q4 corruption or server instability follows from the link messages. Existing world links/Q4 journals must not be silently deleted or rewritten. A source-only cycle check does not stop native Hopper ticks or prove a safe item custody handoff. Track [blocking implementation defect #86](https://github.com/partom24/HartLogistics2/issues/86), [owner-shape source regression](../planning/tests/urce_u1_owner_loop.test.mjs), and require versioned, guarded new candidate plus native acceptance before declaring this fixed.

## 2026-11-19 owner layout readiness — HL-E-URCE150-THIRTEEN-BANK-PHYSICAL-005

**OWNER-REPORTED, scoped physical construction:** The owner confirms the entire **13-bank storage system shown in the updated Storage Array workbook is already built in the copied LAB**. The project had not yet reached functionality that could exercise it. It is therefore an **existing real-world testing asset**, not a proposed construction exercise; do not ask the owner to rebuild the storage array just to meet an assistant-generated test rig.

**Not established by this report:** Whether all 12 schematic Collector→Receiver links are registered/operating in the installed candidate, whether every Hopper/sorter/Transporter path is detected and correctly directed, which 1.5.x build is installed, whether the existing 13-bank network is acyclic, active Bulk custody, live item transfers, sustained throughput, MR integrity, or BDS performance. Preserve distinctions between a workbook-specified topology, owner-reported physical construction, owner-confirmed *two-bank* link UI success, and Bedrock-verified runtime graph/custody behavior. The owner's corrected cell R19 belongs to a continuous linkage.

**Engineering handoff:** Use [the 13-bank bank-definition document](../planning/URCE_150_OWNER_BANK_DEFINITION_STORAGE_ARRAY_20261119.md) and the physical LAB as future direct integration/performance target. First close blocking [cycle-enforcement issue #86](https://github.com/partom24/HartLogistics2/issues/86), implement a Bedrock-derived directed bank graph, avoid new unauthorized writers and preserve actual structures/world data. This observation alone authorizes no LAB install or world mutation.
