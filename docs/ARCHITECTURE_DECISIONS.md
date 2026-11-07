# Hart Logistics 2 — Architecture Decisions

**Owner-confirmed requirements only; no gameplay source implementation is implied.** For unresolved choices see [inbox](IDEA_INBOX.md). Inherited blueprint-specific ADR examples were replaced when adapting this repository for Hart Logistics.

## HL-ADR-001 — Non-regression 1.4.1 baseline
**Status:** Owner required; accepted in planning.  
**Decision:** Preserve **every** Hart Logistics 1.4.1 capability and saved-world identity; no deletion, behavior loss, item duplication, unsound metadata transformation or manual Receiver purge is acceptable as a release tradeoff.  
**Consequences:** Preserve original manifest UUIDs, block IDs, q2/q3/q4 data and journal, redstone/filters/links, hopper and dispenser/dropper behavior. No code changes until explicit authorization.

## HL-ADR-002 — Bulk Storage and cooperative controllers
**Status:** Owner-confirmed requirements; membership/failover algorithm undecided.  
**Decision:** 200,000 bucketizable items per Bulk Storage block; capacity adds across a connected network. First designated Bulk Storage in a Receiver-to-Collector bank/region is its controller. Controllers coordinate local and remote filtered routing, Bulk overflow and only-last-resort network wildcard. Valid topology includes one controller across an entire closed loop and multiple controllers across interconnected banks.  
**Consequences:** Implement deterministic region IDs, controller failover and capacity reconciliation before routing.

## HL-ADR-003 — Transporter is an input-only container conduit
**Status:** Owner-confirmed requirements; input designation undecided.  
**Decision:** Normal-sized placed block with ~4×4 pipe center, six-way connections, high-speed transfers from Receiver/Bulk to Sorter. Adjacent ordinary containers can be **sources** but must never be Transporter **destinations**. Native hoppers remain valid in all old layouts.  
**Consequences:** Protect filtered output chests; final storage requires Sorter, not direct pipe insertion.

## HL-ADR-004 — Q5 safe hybrid storage
**Status:** Owner-confirmed direction; schema/protocol undecided.  
**Decision:** Migrate q4 without loss; ordinary lane uses compact bucketized counts and destination-aware selection; metadata-rich lane uses native Minecraft ItemStack-preserving transfers. Prioritize MR service without accidental starvation. Collectors/Receivers evolve as storage endpoints while retaining legacy use.  
**Consequences:** Stable native API compatibility and staged q4→Q5 journal/cutover must be proven before adoption.

## HL-ADR-008 — Replace direct-only Q4 MR fallback with native custodied MR storage

**Status:** Owner-selected architecture 2026-11-06; implementation and runtime acceptance pending.  
**Decision:** Collectors and Receivers become persistent native custom-container endpoints for metadata-rich ItemStacks, using native slot-to-slot transfers whenever supported and recoverable. This **supersedes any recommendation to retain the original Q4 direct-only Hopper fallback permanently**. Existing 1.4.1 ingress/egress *behavior* remains a strict release contract; the old fallback may be retired **after** its MR delivery capability and old-world routes are demonstrably preserved in the new path.  
**Rationale:** Q4 serialization and its empty-queue + instantly available destination requirement were limiting workarounds; native custody allows blocked MR items to wait safely and supports MR-rich throughput.  
**Consequences / gates:** Retain legacy fallback only as a transitional compatibility mechanism; do not silently enable experiments or remove working behavior. Prove native block inventory availability on the owner-reported server 1.26.63.1/client v26.63, native slot persistence on existing placed blocks, metadata integrity, backpressure, unload/restart transfer safety and redstone/hopper/Sorter compatibility. No gameplay source changes authorized.

## HL-ADR-005 — HartBots reference without repo changes
**Status:** Owner-confirmed scope.  
**Decision:** Use uploaded HartBots 1.8.2 Depot source to inform 200k-style bucket storage and plan future Transporter extraction. A native cross-pack transfer interface may be authorized later, but **only HartLogistics2 repository is accessible in this project**.  
**Consequences:** No HartBots implementation or release work now; fallback via Depot output inventory can be explored separately.

## HL-ADR-006 — Planning phase only
**Status:** Owner-confirmed.  
**Decision:** Design and repository-documentation updates are permitted. Gameplay changes, source import, migration, world edits and release remain unapproved.  
**Consequences:** Active roadmap milestone is HL-PLAN-001; keep evidence claims bounded and owner decisions separate.

## HL-ADR-007 — Runtime target and experiment gate
**Status:** Reported environment; API decision pending.  
**Decision:** Owner's server is **1.26.63.1**, client **v26.63**, recorded as a future test target. Existing 1.4.1 minimum **1.26.50** is not silently raised. Native custom block container inventory use cannot be assumed stable on this target; obtain specific proof and policy decision before requiring experiments.  
**Consequences:** Version and feature compatibility matrix is a prerequisite to implementation; no claim of successful in-game test.

## HL-ADR-009 — Lab-only testing and production-excluded updater

**Status:** Owner-confirmed deployment boundary, 2026-11-06; implementation pending.
**Decision:** Use the HartBots uploaded updater system as a model for HartLogistics. The only allowed server release/integration-testing location is the disposable lab `C:\Servers\Thomas_MCBedrock - Copy (2)`. No tests or changes to production `C:\Servers\Thomas_MCBedrock` before an identified release candidate is nominated. Owner **expressly permits importing the HartBots production updater script as a reference**, but prohibits running it, including dry-run, until nomination; candidate nomination does **not** automatically authorize writing to production.
**Consequences:** Develop guarded LAB-only tooling first, not an automated production route. Adapt hardcoded HartBots repository, IDs, pack versions and paths; require full cold backup, source/artifact pinning and distinct owner approval for any later production promotion. See [updater design](UPDATER_DEPLOYMENT_DESIGN.md).

## HL-ADR-010 — Risk-based item test coverage, not exhaustive ordinary IDs

**Status:** Owner-confirmed testing policy 2026-11-06.
**Decision:** Tests target meaningful item mechanics, transfer contracts, and failure cases; ordinary unmodified items with equivalent behavior do **not** require separate named cases (e.g. cobblestone, glass and sand). Use representative ordinary items, **two distinct ordinary identities where bucket isolation matters**, and different stack-limit classes only where inventory semantics matter. Specifically verify separate **MR metadata mechanisms** and any proven item-specific defects.
**Reason:** Avoid redundant slow tests while maintaining comprehensive 1.4.1 regression and new-path conservation coverage.
**Consequences:** Do not drop tests for old ingress/egress, redstone, crashes, full destinations, filter discrimination, identities or native MR fidelity. See [compatibility test plan](COMPATIBILITY_TEST_PLAN.md).

## HL-ADR-011 — Fully specified manual rigs and up-front test explanation

**Status:** Owner-confirmed test workflow 2026-11-06.  
**Decision:** Every proposed test begins with a short **What is being tested** summary, why the test is required, what is already proven, action needed, and expected result. **Reuse accepted prior evidence** for unchanged behavior instead of routinely rerunning tests. Before a physical LAB test, give the owner a complete **READY** rig card (exact Sorter count/column height, block coordinates/orientations, links, redstone, distances from other rigs or explicitly none, steps, reset and pass/fail).  
**Rationale:** The owner should not build a rig and then be told it was too close to another, too far away, or used an undocumented number of Sorters; nor repeat safe prior experiments needlessly.  
**Consequences:** Unknown topology/spacing requirements make the card NOT READY; if discovered afterward, correct the instructions rather than attributing error to the user. Old evidence is reused only for its actual scope; new risks get narrow differential tests. See [test policy](TEST_RIG_CONTRACT.md).

## HL-ADR-012 — New blocks get original distinct resource assets

**Status:** Owner-confirmed requirement, 2026-11-06.  
**Decision:** New Hart Bulk Storage and Hart Transporter must have original independent geometry, textures, icons and block-specific visual assets; no copying, aliasing or recoloring existing 1.4.1 Sorter/Collector/Receiver resources. Bulk Storage must not look like Collector or Receiver; old assets stay unchanged.  
**Reason:** Immediately identifiable function and resource-pack regression avoidance.  
**Consequences:** Distinct namespaced resource definitions, side-by-side visual acceptance and no new resource references to old block assets. Exact art direction remains open. “Bulk sorter” provisionally refers to planned Bulk Storage, not a third new block. See [asset contract](RESOURCE_ASSET_POLICY.md).

## HL-ADR-014 — Transporters interchangeable with Hoppers as Sorter inputs

**Status:** Owner-confirmed, 2026-11-07.  
**Decision:** A Transporter and a vanilla Hopper are alternative valid ways to feed the **same Sorter column intake**, including the same filters, priority, pause/redstone and destination acceptance. Preserve 1.4.1 Hopper layouts without requiring pipes. **Transporters run along the top of Sorter columns.** An ordinary container adjacent to a Transporter is intentionally a **source**, not a filtered output chest; do not require a separate input-face toggle solely to protect a chest the owner will not place next to piping. Storage chests are placed downstream of Sorters, **not at the same Y level as or above Transporters** in the intended layout. Transporters never write directly into ordinary storage containers.  
**Consequences:** Shared Sorter intake adapter; do not duplicate/weaken existing sorter logic. Ordinary neighboring containers are intake-only under this explicit placement convention; no forced auto-extraction from unrelated unsupported inventories. Test source recognition and chest placement assumptions in one precise rig. See [logistics design](LOGISTICS_DESIGN.md).

## HL-ADR-015 — Persisted deterministic controller network ownership

**Status:** Owner-approved design principle, 2026-11-07; concrete topology/election algorithm still to be engineered.  
**Decision:** Use durable network identities, controlled network discovery, and deterministic controller/item/capacity authority across single-loop and multi-controller networks, including chunk unload/reload, splits and merges.  
**Consequences:** An inaccessible/unloaded member must not be interpreted as an erased owner or free capacity; suspend ambiguous routing and reconcile before resuming. Specific region rules, controller tie-breaks and crash protocol remain engineering design tasks.

## HL-ADR-016 — Conservative Bulk overflow and separate MR capacity

**Status:** Owner-approved, 2026-11-07.  
**Decision:** A missing, unreachable, unloaded or stale Bulk capacity advertisement does **not** mean "Bulk full". Only verified exhaustion of usable ordinary Bulk capacity permits wildcard routing; otherwise **hold items safely**, not guess. The Receiver's Q5 ordinary-count capacity stays distinct from **finite native MR physical slots**, which backpressure when full; MR stacks are never flattened.  
**Consequences:** Track verified capacity with expiry/ownership; unknown capacity blocks premature wildcard decisions. Keep existing legacy 250,000 ordinary-count queue contract unless separately authorized to alter it; actual MR slot number still needs API/UX validation.

## HL-ADR-017 — Global Hart Logistics routing freeze for Q4→Q5 migration

**Status:** Owner-confirmed intent, 2026-11-07; fail-safe resume/on-load implementation not proven.  
**Decision:** Place all Hart Logistics routing handlers into a durable, server-wide **maintenance freeze** before staging Q5. Migrate/verify already-loaded legacy Sorters/Collectors/Receivers and **automatically migrate those currently unloaded when their chunks later become available**. Show migration state in block menus/status, including blocked/pending explanations, without requiring individual manual upgrade clicks.  
**Technical boundary:** Minecraft scripting cannot directly inspect/modify a genuinely unloaded block; do not report it migrated before load. Vanilla Hopper operation is not stopped merely by pausing Hart scripts. Resume only with proven version gating, crash-safe migration ownership and safe disposition of remaining unloaded/pending blocks. Keep migration freeze observable rather than indefinite without operator recovery.  
**Consequences:** This supersedes Q5's earlier per-Receiver-only quiescence concept. Protect Q4 journal/links/counters, avoid loss/duplication. See [Q5 migration plan](Q5_MIGRATION_DESIGN.md).

Record any new actual decision with owner context, alternatives, implications, status and superseded ID rather than rewriting prior intent.

## HL-ADR-013 — Menu-button Collector/Receiver linking

**Status:** Owner-selected, 2026-11-06; implementation and LAB verification pending.  
**Decision:** A Collector configuration form has an explicit **Link / Relink Receiver** button. After selection, clicking a Receiver prompts confirmation before writing the new link. Collector placement or ordinary interaction alone must no longer arm linking. Receiver also has a status menu.  
**Preservation:** Existing 1.4.1 saved link IDs, linked item movement, redstone and sneak-placement behavior remain; changing the click gesture is an owner-requested UI improvement.  
**Implementation gate:** The 1.4.1 manifest does not yet include `@minecraft/server-ui`; add a stable compatible 2.x module at implementation time, use canceled before-interaction plus deferred form, and test collision with native MR inventory on server 1.26.63.1/client 26.63. See [UI design](UI_LINKING_DESIGN.md).
