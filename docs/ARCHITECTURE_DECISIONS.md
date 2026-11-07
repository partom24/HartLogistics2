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
**Decision:** Use the HartBots uploaded updater system as a model for HartLogistics. The only allowed server release/integration-testing location is the disposable lab `C:\\Servers\\Thomas_MCBedrock - Copy (2)`. No tests or changes to production `C:\\Servers\\Thomas_MCBedrock` before an identified release candidate is nominated. Owner **expressly permits importing the HartBots production updater script as a reference**, but prohibits running it, including dry-run, until nomination; candidate nomination does **not** automatically authorize writing to production.
**Consequences:** Develop guarded LAB-only tooling first, not an automated production route. Adapt hardcoded HartBots repository, IDs, pack versions and paths; require full cold backup, source/artifact pinning and distinct owner approval for any later production promotion. See [updater design](UPDATER_DEPLOYMENT_DESIGN.md).

Record any new actual decision with owner context, alternatives, implications, status and superseded ID rather than rewriting prior intent.

