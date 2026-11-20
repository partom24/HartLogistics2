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

## 2026-11-19 explicit owner LAB equipment correction — HL-E-URCE150-13BANK-PREINSTALL-006

**Current 13-bank storage LAB:** Owner confirms that while the full storage-bank structure exists, **no Transporters, Receivers or Collectors have yet been placed in the 13-bank LAB build**. This is an *unpopulated physical testbed*, not a demonstrated network or an existing 12-link registration. The worksheet's twelve green link segments indicate planned connectivity, not placed links. **This supersedes any wording above suggesting the 13-bank build already has its HartLogistics hardware installed.**

**Earlier two-bank evidence:** Previous successful Collector→Receiver link UI observations and owner-reported prohibited two-bank loop belong to a separate prior test configuration. They remain relevant evidence for cycle-guard regression, but they cannot be used to claim present HL blocks, saved links or physical directed paths in the unpopulated 13-bank LAB. Do not infer the current layout, placement, installed version or material state from older images.

**Engineering authority:** User directs uninterrupted *source-controlled development* with standard validation, and prefers no routine progress interruptions. This does not authorize unrequested LAB installation, world changes or production server modification. First deliver the safe code, CI and versioned guarded installer; owner can populate the existing storage array for later test without rebuilding its physical banks.

## 2026-11-19 owner standing development instruction and current LAB census — HL-E-URCE152-LAB-STATUS-007

**Current copied LAB hardware census (owner statement):** "i havent placed any transporters, receivers or collectors in the lab yet." Treat this as the owner's **current overall copied LAB state**, rather than a claim limited to the 13-bank storage-array region. The physical 13-bank storage structure remains built. The historic two-bank Collector/Receiver link/closed-loop screenshots retain their accepted **past-test evidence**, but are **not evidence of currently installed blocks or active managed links** in this LAB.

**Continuity instruction:** "going forward, as long as the project is on track, there's no need to stop developing until there's an issue or testing is needed." Continue authorized source-controlled development through CI/source proof gates without routine approval pauses. Stop or seek owner involvement for an actual blocker, explicit owner-world installation, Bedrock tests needing owner hardware/actions, or a release/production gate. This is not blanket authorization to modify the copied LAB or production server.

**Engineering implication:** A completed automated 1.5.2 source/Windows validation cannot substitute for item-flow observations or BDS in a LAB with no HartLogistics test equipment currently placed. Do not ask the owner to repeat historic screenshots merely to progress source code. All new tests must be clearly separated into source/synthetic versus later owner-built native BDS proof.

## 2026-11-19 owner LAB links BLOCKED — HL-E-URCE153-TWOBANK-LINK-HOLD-008

**Owner images and directly observed player messages:** In the *current, built, small two-bank fixture* inside copied LAB, owner selected a Collector then interacted with a Receiver. The game displayed:
- `[Collector] ... network: minecraft:overworld 461,71,-493 | queued 64/250000` and `route safety: ROUTE HOLD (invalid_native_observation)`.
- `[Hart Logistics] Link HELD (route unverified): invalid_native_observation. Existing link retained.`
- Another view of a Collector at a different point showed a Receiver network at `minecraft:overworld 457,71,-502` with `queued 0/250000`, likewise a **ROUTE HOLD (invalid_native_observation)**.
- Screenshot shows player-placed compact connected Transporters, Collector faces, native storage runs and two-bank physical context. The owner explicitly states: **"this is with the small two bank system for testing"**. This corrects older wording that no Hart endpoints had been placed anywhere in the current LAB: the two-bank *test area* now has new physical hardware, while the separate 13-bank storage structure is not evidenced to have its own Hart endpoints.
- A prior in-game screenshot verified `[Hart Logistics 1.5.2-dev]` startup and the existing **60 Collector/38 Receiver registry records, 49 links and 294,294 queued**, but not live link acceptance. These registry records are historical persisted entries and are not proof of currently loaded endpoints.

**Interpretation, carefully scoped:** The guard is failing *before* a valid link-cycle decision. The string `invalid_native_observation` is generated by the source when its global native witness returns `INVALID`. The original witness hard-rejects duplicate endpoint IDs or overlapping positions across the entire long-lived registry, a plausible historical type-replacement issue; a specific collision in the owner's binary world save was not dumped and therefore is **not independently proven**. The observed symptom itself establishes a real 1.5.2 **source/BDS test blocker**. Do not suggest clearing registry, Q4 pages, saved links or server files to make tests pass.

**1.5.3 source response:** Normalize only the read-only observed endpoints using actual currently loaded block type at duplicated historical positions; preserve original registry and all persistent Q4 data; unreadable/ambiguous *relevant* nodes still HOLD. Also correctly REJECT an already verified native directed cycle before dereferencing a non-`OK` graph. Source tests cover owner-sized stale registries, queue persistence, safe first link, unsafe closing link, and unknown collisions. Version-pinned install and exact-HEAD source/Windows CI remain required. No new owner install has occurred in this record. Issue [#86](https://github.com/partom24/HartLogistics2/issues/86) remains OPEN until BDS retest.

## 2026-11-19 owner native Bedrock link rejection — HL-E-URCE153-TWOBANK-ACCEPT-009

**Native player screenshot after owner-reported copied-LAB 1.5.3 installation:** In the already built **small two-bank test arrangement**, the active Collector shows `network: minecraft:overworld 458,68,-491`, `queued 0/250000`, `route safety: verified snapshot`, and `lifetime accepted: 0`. The red in-game interaction message states **`[Hart Logistics] Link REJECTED (supply loop): cycle. Existing link retained.`** Owner confirms in plain language that the *other pair* linked successfully but **these two endpoints at the end** would not link. The positive link success is **owner-reported**, while the refusal and status are directly **screenshot-observed**.

**Acceptance achieved:** First **Bedrock-native** evidence that the source cycle-guard rejects a new verified loop-closing Collector→Receiver edge and leaves an existing link in place; legal forward linkage is separately owner-confirmed. This resolves the specific "all links HOLD invalid_native_observation" test blocker reported for installed 1.5.2. The source documentation and existing two-bank images are not a substitute for this actual in-game result.

**Do NOT over-claim:** Status `verified snapshot` is the graph observer's decision, **not** a native transport receipt. No items were fed through the observed Collector (`lifetime accepted: 0`), no actual queue ingress/drain, Q4 replay, restart, old saved-loop fencing, 1,442-Sorter load, 13-bank routing or Bulk custody has yet been verified by this observation. The old `294,294` global Q4 backlog was shown in a previous screenshot, not remeasured in this frame. No authorization to clear or reserialize existing registry/Q4 data.

**Next scoped owner test:** one item on the already verified *acyclic* linked pair with clean local Q4 baseline, directed vanilla Hopper input and safely contained/locked Receiver output; observe exact Q4 custody before releasing an item to a controlled destination. Capture before/after item counts, queue journal state and restart if safe. Do **not** flood/activate the 13-bank storage or confuse Transporter visual arms with physical item movement. Existing backups `lab-0bff63ebe84e` (previous 1.5.2) and `lab-c77b47f7c165` (1.5.3 install) retained. Issue #86 stays open for existing-loop and custody acceptance; link-save gate alone is PASS.

## 2026-11-20 updated 13-bank with-Transporters acceptance — HL-E-URCE153-FULL-PIPE-CYCLE-010

Owner first reported the entire 13-bank system could be connected in a loop **without Transporters**, then subsequently confirmed: **"i did place all the transporters down, broke and replaced the last collector and it was properly rejected"**. Therefore **with-pipes full-array loop rejection is owner-confirmed**, but the pre-pipe network allowed a prohibited closed link and optional-pipe-independent discovery remains open #86. The owner's layout (13 banks, Receiver→Collector local pairs) is NOT a required template for any other player's storage room. Do not hard-code coordinates/counts, do not mandate Transporters, and do not conflate visual arms with directed cargo proof.

## 2026-11-20 Bedrock/VS Code idle profiler baseline — HL-E-URCE153-IDLE-CPU-011

Owner stopped gameplay expansion after seeing very high timings with **no completed item routing**. Uploaded two alternate views of the SAME VS Code 17.2486s CPU profile and an independent Bedrock `.mcstats` over 142 ticks. Aggregated metrics (private attachment not checked into repo): `script_tick` median **74.288 ms**, p90 **100.536 ms**, max **156.447 ms**; `level_tick` median **30.321 ms**. CPU rooted in Hart `logisticsTick` **9.966s** and `schedulerTick` **6.490s** of the same 17.248s capture. Within Collector ingress `liveLinkCheck` cost **7.866s**, with `observeSupplyLinkSnapshot` **7.103s** and repeated Hopper / Transporter observations. Native profile attributes 198,837 `World::getDimension` calls. Note the installed intake engine tests `firstItem()` before a link check: absence of completed routing does not prove every input Hopper is empty; a stationary input may repeatedly trigger guard work. Full content of all 38 Q4 saved queues has not been audited in this capture. Timing units are interpreted as microseconds based on `.mcstats` grouping, and the debugger may add instrumentation overhead.

**Source response:** [performance issue #87](https://github.com/partom24/HartLogistics2/issues/87), narrowly staged 1.5.4 negative-only 20-tick retry and native Dimension-handle caching. Requires exact-HEAD Windows source/updater CI before separately approved copied-LAB update and controlled native reprofile at same room/load; no world data changes or user cargo load test requested. No speculative positive route caching, no global Scheduler slowdown, no new pipe-required topology logic.
