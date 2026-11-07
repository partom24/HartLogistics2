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

Record any new actual decision with owner context, alternatives, implications, status and superseded ID rather than rewriting prior intent.

