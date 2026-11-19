# Hart Logistics 2 — Roadmap (URCE planning line, 2026-11-17)

## Outcome

Preserve all Hart Logistics 1.4.1 capabilities and world data through a versioned **1.4.2 native-first baseline**, then build a safe, higher-throughput **1.5 Unified Routing and Custody Engine (URCE)** for the owner's pinned [Sorter/storage-room arrangements](../OWNER_PRODUCT_OBJECTIVE.md) at approximate 1,400-Sorter scale. Maintain exact ItemStacks where needed and count-based ordinary item storage only where native custody is proven. Every runtime/owner acceptance and release requires distinct evidence.

## Completed

- Immutable exact original 1.4.1 source and 72-file fingerprint retained (`0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`).
- **HL-142-BASELINE-001 — Development/source closeout:** branch `baseline/native-first-142-20261117`, P4e physical admission and Q4 custody preserved, P4g cache removed, BP/RP version 1.4.2 and guarded LAB transition. [Exact baseline/evidence](../implementation/BASELINE_142_CLOSEOUT_20261117.md). **No** complete owner-BDS performance or production-release claim.
- Source-only P4g correctness but runtime NO-GO for duplicate rejection reuse; no cross-tick global capacity ledger is adopted. Current architecture performance ceiling accepted as development decision; unresolved dense scans recorded.
- Historical 1.5 design and model evidence classified; the selected architecture is URCE and the old Q5 queue-format plan is superseded.

## U1 Collector/Receiver early-capacity research — closed (source only)

[Actual Q4 loader + serialization-order source tests](../planning/URCE_150_U1_COLLECTOR_CAPACITY_FIRST_RESEARCH_20261117.md) resolve the last U1 first-principles question: **NO-GO for unconditional capacity-first**. It saves serializer work only for full queueable items; rejected/unserializable items would now invoke q4 initialization/migration/cleanup and change unreadable-queue errors. Direct-only metadata-rich cargo must confirm authoritative queue total zero, and unsupported ejected items remain world-owned. Keep existing 1.4.2 order. First-principles local routing research is source-only complete, with BDS-dependent Block handoff a separate unapproved candidate.

## U1 source-only decision — completed evidence, not gameplay

[U1 actual 1.4.2 routing differential](../planning/URCE_150_U1_LAZY_ROUTING_SOURCE_PROOF_20261117.md) now includes 14 source-only tests of naive lazy Filter/Auto/Wildcard and same-attempt native Sorter Block reuse. Outputs and physical journal traces were equivalent in modeled cases. **Naive lazy route rewrite is rejected**: it increased native Sorter block reads in 120/144 mixed cases and did not reduce destination `getSlot` calls. Fresh same-attempt Block reuse saves modeled Sorter block lookups in aggregate but retains dense admission cost and has two individual regressions; no runtime integration authorized.

## Owner routing clarification — selected for governed URCE

[URCE-ADR-002: Existing homes, Bulk overflow, and genuine Wildcard](../planning/URCE_150_OWNER_ROUTING_HOME_AND_OVERFLOW_DECISION_20261117.md): Filter/Auto destinations are attempted first; when a valid Filter/Auto claims the item but no destination admits it, or its identity already lives in authoritative Bulk, use Bulk while verified room exists. **Wildcard is for truly unclaimed items, or an explicit verified-full Bulk exception.** Unknown/unloaded Bulk capacity never counts as full. This refines the older blanket 'Bulk before any Wildcard' language; no 1.4.2 gameplay changes.

## New owner topology and OSI mapping clarification — 2026-11-18

**Takeover / current implementation research map:** [OSI-inspired multi-bank routing and owner decisions](../planning/URCE_150_OSI_MULTIBANK_ROUTING_HANDOFF_20261118.md). The physical **bank** and connected **network** remain relevant; a named controller **region** is NOT an owner requirement. There is **Bulk Storage**, not a Bulk Sorter. The first Bulk Storage placed being its bank's controller and controller-to-controller routing are historical proposals only; evaluate a read-only logical network directory plus independently accountable Bulk members and shared custody first. The owner intends **many Wildcard Sorters on the final bank** for genuinely unclaimed items and proven-full Bulk exceptions; maintain ADR-002's Filter/Auto/Bulk/HOLD rules.

**OSI-inspired research hypothesis:** separate cheap claim/destination/next-hop selection from intermediate physical forwarding and final native capacity checks, with exact durable custody across every actual ownership boundary. An irrelevant bank should not scan Sorter destination chests; skipping reclassification is not proof that physical Collector–Receiver hops or journal writes vanish. **Source-only comparison first** (four-bank traversal, Auto seed changes, Bulk home and full/unknown behavior, last-bank Wildcard, unload/restart), then BDS validity and performance gates. Do not reproduce seven protocol layers, a globally polled routing table or unproven native item-transfer atomicity.

## Owner-approved 1.5 product end state — 2026-11-18 (supersedes older product assumptions)

**Current authority:** [URCE 1.5 owner-approved product contract](../planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md). Automatically connected **reachable directed acyclic** logistics networks; a Collector–Receiver pair alone may form a network, branches/merges allowed and managed cycle-making links rejected. Preserve Filter→live-seeded Auto, bottom-to-top within a column and favor lower real transactional cost among eligible columns. **No verified home → no movement**; optional terminal Collector is a valid final home, not a network requirement. Genuinely unclaimed item fallback: eligible Wildcard → available terminal Collector → verified Bulk overflow → HOLD in present custody. Claimed/previous Bulk-home rules, verified-full exception and unknown HOLD from ADR-002 still apply.

Favor safe **network-wide Bulk** over mandatory per-bank pools; redistribute automatically only for useful spare capacity, never compete pointlessly with active Receiver cargo. Prioritize exact native MR custody/Wildcard without lossy serialization. Show block /status metrics plus accurate per-item **HOLD/HELD/STORED** and metadata; shared searchable, paginated, read-only-by-default Collector/Receiver/Bulk inventory browser must remain responsive with **250,000** queued items, with separate deliberate safe item retrieval. Primary performance goal is **playable stable BDS** under routing, not an invented TPS claim. Terminal Collector absent is a valid network configuration. Arbitrary external virtual-storage integration is not promised. The design has **owner approval only**: no implementation, native MR proof, LAB acceptance or release authorization.

Earlier statements on this roadmap about the final Wildcard bank describe the owner's pictured layout, **not** the now-accepted universal product requirement.

## Performance handoff and pre-code readiness — 2026-11-18

**Owner's direction:** close the P4 native-first optimization line as the current *development* baseline; URCE should avoid irrelevant route/admission work and coordinate **higher-density useful endpoint transfers** where safely proved, rather than assume every item physically moves through each Transporter. **Transporters primarily create visible, human-readable logical storage network infrastructure**, [URCE-ADR-003](../planning/URCE_150_OWNER_TRANSPORTER_INFRASTRUCTURE_DECISION_20261118.md); unchanged vanilla Hoppers remain actual physical movers where used. The owner expects exceptional logistics bursts to drain promptly **without making BDS unpleasant to play**, and asks that **items delivered, transactions, per-transaction native/journal work, peak tick cost and backlog duration** be judged separately. No 16/32/64 runtime batch size or specific numeric TPS gate was approved.

**Measured evidence:** [November 17 CPU profiles + Q4 diagnostics](../planning/URCE_150_TRANSPORTER_BATCHING_BDS_CAPTURE_EVIDENCE_20261118.md) show P4e had **9,425** Sorter admission checks / **487,223** native `getSlot` reads / **21** completed Sorter transactions across ~19.7 s; actual Q4 delivery in one separate diagnostics window was **38 items / 330 game ticks**, not a measure of all Sorter cargo. The capture cannot establish actual Sorter items/transaction or that the 16-item limit was binding; optimize *unproductive admissions first* and then prove denser productive transfers in matched tests. Stable Container movement has no explicit move-quantity argument; custom-*block* inventory is an unproved/experimental optional endpoint, but the already accepted **PG42 native entity-inventory carrier** and **PG20 native MR route** establish usable scoped primitive feasibility on BDS 1.26.63.1.

**Readiness:** [Pre-code gate matrix](../planning/URCE_150_PRECODE_READINESS_AND_PROOF_GATES_20261118.md). Owner product behavior is settled, but U0 complete writer census, U1 directed-graph cost/read proof, U2 physical/Q4 custody state machine, U3 **URCE carrier/Transporter integration** and 1.4.2 owner-LAB acceptance are **OPEN**; **native MR movement/storage primitive feasibility is CLOSED** via [cross-branch audit](../planning/URCE_150_CROSS_BRANCH_NATIVE_MR_EVIDENCE_REUSE_AUDIT_20261118.md). Do not repeat PG20/PG42. Continue **HL-URCE-PLAN-001** source/documentation work; no 1.5 gameplay code, LAB execution or release is authorized here.

## Player-first owner acceptance policy — 2026-11-18

[URCE-ADR-004](../planning/URCE_150_OWNER_PLAYER_FIRST_TESTING_DECISION_20261118.md) supersedes historical exact-XYZ, exact item-ID and prescribed test-rig demands. The owner will test as a **player** using **any valid layout** and **any legitimate item**, with MR/non-MR distinctions only where routing structurally differs. The 1,400-Sorter reference and source-only fixed models are workload examples, never mandatory physical acceptance geometry. Fixed coordinates, identities and case fixtures belong only in optional defect reproduction/automated tests; acceptance judges player-visible behavior, conservation and playability. Keep LAB safety, evidence reuse and explicit implementation/release gates intact.

## 1.5 player-facing infrastructure preview — development branch

**Branch:** `dev/urce-150-runtime-20261118`. [Runtime preview scope and limitations](../planning/URCE_150_INITIAL_RUNTIME_INFRASTRUCTURE_PREVIEW_20261118.md). Unique Transporter and Bulk block geometry/textures, read-only in-game Transporter adjacency inspection (12 nodes/tick) and unchanged 1.4.2 cargo are being packaged as an **explicitly incomplete, unapproved 1.5.0 development slice**. No Transporter item forwarding, Bulk custody or 1.5 routing is enabled yet. No specific player layout, coordinates or item IDs are required. This separate branch is for candidate building, not owner LAB/production deployment.

## Now

**HL-URCE-DEV-001 — owner-authorized ongoing URCE 1.5 code development active (2026-11-18).** Stop only for a genuine unresolved decision, safety issue, or a playable runtime candidate for player testing. Finish source/custody safety gates while building successive compatible increments. Do not mutate/deploy the owner's LAB or protected worlds without a separate controlled testing authorization. The first accepted increment is the read-only U1 planner and actual 1.4.2 source differential. **Preexisting 1.4.2 native-first gameplay remains the reference, not an accepted 1.5 runtime.** Initial graph/candidate implementation is restricted to `planning/src/`, `planning/tests/`, test-only CI and planning evidence; see [U1 source-only increment](../planning/URCE_150_U1_SOURCE_IMPLEMENTATION_20261118.md). The initial code runs on supplied graph/policy facts and does **not** integrate Bedrock, replace the P4e runtime or provide a live custody writer. Preserve the same milestone ID; do not open a second active milestone.

**Goal:** deliver a source-traceable URCE planner/custody architecture and staged integration gates using current 1.4.2 as the only *runtime* foundation. Start with the [routing early-decision implementation contract](../planning/URCE_150_EARLY_DECISION_ROUTING_CONTRACT_20261117.md), [architecture and execution charter](../planning/URCE_150_ARCHITECTURE_AND_DELIVERY_PLAN_20261117.md), [selected historical 1.5 reference map](../planning/URCE_HISTORICAL_15_REFERENCE_REVIEW_20261117.md) and [source-observed 1.4.2 writer census](../planning/URCE_150_ACTIVE_142_WRITER_CENSUS_20261117.md).

**Boundary:** documentation/source-only analysis now. No Bulk/Transporter runtime, Q5 migration, code from frozen #79/#82 branch, owner-world upgrade, LAB installation or release. Keep identical BP/RP addon files to 1.4.2 baseline.

**Exit:** complete current writer/source-effects census and candidate planner input/output/equivalence design, explicit durability/HOLD and q2/q3/q4 migration state machine, source-only fault/performance test plan, unresolved **integration/custody** proofs (not already accepted PG20/PG42 primitive feasibility) and separate code authorization before first 1.5 gameplay increment.

## Next

- **HL-142-ACCEPT-001 — Separate owner 1.4.2 LAB acceptance:** exact deployed SHA, pack registry bump and rollback, Q4 preserved data, no loss/duplication/metadata changes, Filter/Auto/Wildcard/Bypass/redstone/Hopper behavior and useful throughput on both pinned array layouts. Scope is independent of URCE *planning*; 1.5 runtime requires this compatibility gate to be acceptably resolved.
- **HL-URCE-U1-001 — Proposed read-only planner prototype:** only after U0/plan acceptance, source-executed 1.4.2 differential tests with no native writes, no owner installed pack. Revalidate live destination at last responsible moment.
- **HL-URCE-U2-001 — Proposed unified writer/migration proof:** only after separate authorization and durable physical/journal ownership evidence. Full q2/q3/q4 census, unknown HOLD, no Q5 interim format.

## Later

- Integrated already-demonstrated native MR carrier custody into URCE and prove end-to-end acceptance, optional engineering partitions/controllers, ordinary Receiver/Bulk accounts (250,000/200,000 respective accepted capacity targets), Transporter into Sorter path, split/merge/restart/multi-region integration, native profiler comparisons at owner scale, then explicit versioned release authorization.

## Decisions and blockers

- **Selected architecture:** URCE control-plane candidate planner + native live data-plane admission + shared custody rule; not a world-wide synchronous scheduler or virtual chest cache. Historical [URCE design contract](https://github.com/partom24/HartLogistics2/blob/main/docs/UNIFIED_ROUTING_CUSTODY_ENGINE.md) remains authoritative.
- **Historical skeleton allowed as selective *reference*:** graph/unknown-topology checks, writer census, bounded pipe source, physical ambiguity HOLD and compatibility tests; old Q5 schema and frozen unified-custody implementation must not be merged.
- **Unresolved:** 1.4.2 owner LAB acceptance; durable transaction/physical receipt and Q4 recovery; script-owned maintenance fence cannot disable vanilla/foreign writers; URCE-specific native MR *custody integration* (the primitive is proven); optional partition/ownership reconciliation; existing-Bulk-home scope and remote-claim availability under the owner-confirmed conditional priority; real useful throughput at 1,400 Sorters.
- **No production apply:** CI/source PASS is not a release. Preserve pack UUID, original world keys, native Hopper observations and game data.
