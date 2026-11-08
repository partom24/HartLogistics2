# Hart Logistics — Open Design Decisions

**These questions are not implementation authorization.** Owner-directed planning is active under HL-PLAN-001. Accepted requirements appear in [architecture](LOGISTICS_DESIGN.md). Grouped here by risk and decision order; default when uncertain is no change/no loss to 1.4.1 worlds.

| ID | Priority | Decision needed | Why it matters | Status / revisit |
| --- | --- | --- | --- | --- |
| HL-Q-025 | Critical | What bounded, non-lossy recovery should replace legacy `recoverJournal`'s partial ItemStack reconstruction on interrupted direct-only MR moves, without weakening normal existing transfers or saved-world journal compatibility? | PG-19 source-executed injection shows a post-debit/pre-credit handler can create an item missing Adventure flags, keep-on-death and lock mode while clearing the journal; old `exactStackSig` omits additional metadata. No real BDS crash was demonstrated. | **Requires owner-authorized derived-candidate safety design and targeted LAB validation; frozen 1.4.1 source unchanged** |
| HL-Q-001 | Critical | Which supported nonexperimental platform/version or inventory mechanism can provide lossless persistent MR custody after the custom-block PG-03 NO-GO? | On owner's BDS 1.26.63.1 LAB without experiments, Creative and `/give` did not offer `hlprobe:mr_container` despite reported pack registration; PG-04/05 were blocked. Minecraft 1.26.50 documents custom-block container creation in experimental updates. Ordinary Container→Container transfers are separately owner-reported. | **Current custom-block mechanism NO-GO; compatible alternative/version needs proof and owner decision** |
| HL-Q-002 | Critical | **What precise boundaries, connections and tie-breakers define network membership and controller region?** | **Owner-approved principles:** persistent network IDs, controlled discovery, deterministic controller ownership. Must choose the concrete algorithm for single-loop and multi-controller split/merge. | **Direction accepted; implementation algorithm open** |
| HL-Q-003 | Critical | On controller unload, destruction, split/merge or simultaneous first placement, who owns item and capacity records? | Prevent double controller authority and lost storage on failover. | Design proof needed |
| HL-Q-004 | Critical | **How should valid deliberate adjacent source containers be recognized and protected from unrelated extraction?** | **Owner-approved layout:** Transporter along Sorter tops; any adjacent ordinary container is intentionally a source, and no output chest is placed at or above Transporter Y. No mandatory per-face toggle just to avoid those absent output chests. | **Placement rule accepted; source whitelist/safety details open** |
| HL-Q-005 | Critical | **How many native MR slots are supported/needed for Collector and Receiver, and whether Bulk accepts MR at all?** | **Owner decided:** separate physical MR slots and backpressure; ordinary Receiver 250,000-count lane unaffected. Actual sizes and Bulk MR applicability need evidence/approval. | **Separation accepted; sizing and Bulk eligibility open** |
| HL-Q-006 | High | **How is usable Bulk capacity verified across partitions and stale/unloaded members?** | **Owner decided:** unknown/stale/offline ≠ full; hold items safely, never wildcard just because capacity information is absent. Need a bounded reconciliation/alert strategy. | **Fail-closed behavior accepted; implementation accounting open** |
| HL-Q-007 | High | Which item types are known lossless buckets vs native-only MR, especially custom item components and metadata-rich items? | Avoid silent flattening. | Item classification matrix and examples |
| HL-Q-008 | High | How do Transporters choose outgoing faces and destinations at T/cross/six-way junctions, and prevent routing loops? | Makes routing deterministic and throughput scalable. | Proposed algorithm needed |
| HL-Q-009 | High | What are MR vs ordinary service weights, starvation protections, and use of legacy FIFO outside managed networks? | MR prioritized as required, ordinary still makes forward progress. | Owner scheduling preference and tests |
| HL-Q-010 | High | What actions are allowed when player breaks a populated Bulk Storage or native-storage Collector/Receiver? | Never silently delete 200k items / native stacks. | Design break/evacuation policy |
| HL-Q-011 | High | What is the rollback strategy after Q5 has already processed new transactions, and how long do we retain Q4? | Retained Q4 is stale after cutover; rollback must not re-add moved items. | Migration design and user acceptance |
| HL-Q-012 | High | How do we handle blocked, full, disconnected or delayed destinations and exact in-flight acknowledgment across unloaded chunks? | Crash/partition safety and transaction durability. | Protocol needed |
| HL-Q-013 | Medium | Pipe shape/collision/UVs, connection rules, orientation and visual variant choices for 4×4 plumbing? | UI/model reliability. | Visual review before assets |
| HL-Q-014 | Medium | Does the 1.4.1 minimum engine version 1.26.50 remain required, or is 1.26.63.1 merely the testing target for a later new release? | Avoid accidental pack version break. | Owner compatibility-policy decision |
| HL-Q-015 | Later | What stable cross-addon native bucket API will HartBots Depot expose, and what transfer ACK contract will guarantee conservation? | Future native Depot extraction requires separate HartBots work, not authorized today. | Revisit when owner authorizes HartBots compatibility change |
| HL-Q-016 | High | Should existing q4 standalone Receivers retain FIFO default, while Q5 only activates advanced routing for managed networks? | No 1.4.1 regression vs improving head-of-line blocking. | Owner decision |
| HL-Q-017 | Critical | What nonexperimental exact-ItemStack native storage can preserve metadata on already placed Collector/Receiver blocks? | Owner's **outcome** of replacing the direct-only MR restriction remains, but custom-block native-container **mechanism** is blocked by PG-03 on 1.26.63.1. Vanilla-container-backed storage or a newer approved runtime is **only a candidate**. Prove capacity/ownership, exact item data, break/blocked/unloaded behavior, saved-world migration and crash-atomic transactions. | **Mechanism open; do not auto-replace Bundle 2 or claim PG-06 acceptance** |

| HL-Q-018 | High | What are the actual LAB `level-name`, pack installation locations and controlled shutdown/restart procedure? | Updater must fail closed; do not assume HartBots template world name/paths are correct. | Verify only on LAB before updater implementation |
| HL-Q-019 | Medium | What LAB updater invocation and backup/rebuild workflow should be used: manual dry-run/`-Apply` with backup, or separately approved full lab restore from the owner's ZIP? | Lab may be disposable but routine updates still need audited, deterministic behavior. | Owner preference before tool implementation |
| HL-Q-020 | High | How is a release candidate formally nominated and what separate approval permits any production updater execution/production apply? | Production path must stay untouchable during development; importing script is explicitly allowed without running. | Release-governance definition needed |

| HL-Q-021 | Medium | Which original silhouette, texture palette and icon should Bulk Storage use, and should its controller status be visible? | Distinction from existing blocks is mandatory; precise art direction is not decided. | Decide at asset design review; [asset policy](RESOURCE_ASSET_POLICY.md) |

| HL-Q-023 | Critical | What **durable global Hart Logistics routing-freeze epoch**, per-block on-load migration trigger and safe resume protocol handles unloaded blocks without indefinite deadlock? | Owner approved world-wide freeze and automatic deferred migration on chunk load; vanilla Hopper transfers and unknown unloaded-block registries require explicit custody checks. | **Safety direction accepted; concrete protocol and LAB proof open** |



| HL-Q-024 | High | Does stable `world.tickingAreaManager` reliably and safely load registered legacy chunks on dedicated 26.63, with cleanup and vanilla-Hopper-safe migration? | Stable since Bedrock 1.26.10 / Script API 2.6.0, has per-pack capacity distinct from the cheat-restricted manual `/tickingarea` command. Use no cheat/experiment toggles. | **Optional PG-07 proof remains NOT RUN** |

## Decisions already confirmed

- **BL-001:** 1.4.1 is inviolable baseline; no current capability loss acceptable.
- **D-001:** Bulk Storage adds 200,000 bucketized ordinary-item capacity per member and filters outrank overflow; network wildcard only when bulk space is exhausted.
- **D-002:** The first Bulk Storage between Receiver and Collector acts as controller, *not Collector*; one controller can govern a complete closed loop; multiple controllers can coordinate in larger networks.
- **D-003:** Transporter is a six-way ~4×4 pipe, high-throughput, extracts from supported containers but **does not directly distribute to normal containers**; hoppers remain valid.
- **D-004:** Q5 must migrate q4 losslessly while adding destination-aware batching and native MR handling; MR prioritized; original q2/q3/q4 paths protected.
- **D-007 (owner choice retained; Bundle 1 constraint added 2026-11-07):** Replace Q4's restricted direct-only MR fallback **only after** a proven lossless persistent ItemStack custody mechanism preserves its successful behavior and old-world compatibility. The previously selected **custom-block container mechanism** is unavailable under the current nonexperimental PG-03 configuration; PG-04/05 did not execute. No alternate mechanism has been approved. See [HL-ADR-008](ARCHITECTURE_DECISIONS.md).
- **D-005:** HartBots Depot is a reference; future native integration is deferred. No HartBots repo access.
- **D-006:** Current phase is **documentation/planning only**, no gameplay implementation.
- **D-008:** LAB `C:\Servers\Thomas_MCBedrock - Copy (2)` is the only server release-testing location and is disposable. PRODUCTION `C:\Servers\Thomas_MCBedrock` is protected until release candidate nomination.
- **D-009:** HartBots production updater script is **approved for import into HartLogistics2** but **may not be executed before a nominated release candidate**. Separate explicit production authorization still required for any production modification.
- **D-012 (owner asset policy, 2026-11-06):** Both Bulk Storage and Transporter get entirely new block-specific geometry, textures and icons. No existing 1.4.1 block asset reuse; Bulk Storage must be unlike Collector or Receiver. See [asset policy](RESOURCE_ASSET_POLICY.md).
- **D-011 (owner testing policy, 2026-11-06):** Before any LAB rig request, provide an up-front **what is being tested** summary and a fully specified **READY** rig including exact sorter columns, block placement, connections, spacing/isolation, steps and results. Unknown constraints mean NOT READY. Previously accepted/unaffected results should be reused, with evidence boundaries, rather than retesting prior safe behavior. See [test rig/evidence policy](TEST_RIG_CONTRACT.md).
- **D-010 (owner testing policy, 2026-11-06):** Test by **behavioral equivalence classes**, not arbitrary item types. Cobblestone, glass and sand do not each need separate ordinary-movement tests absent a relevant mechanical difference. Test actual differences (MR fidelity, distinct bucket identity, stack limits, special mechanics, proven item-specific bugs) with representative cases; see [test plan](COMPATIBILITY_TEST_PLAN.md).

## Menu linking — confirmed and remaining details

- **D-013 (owner choice, 2026-11-06):** Link/relink initiation moves into an explicit button on the Collector menu, with Receiver selection and confirmation. Normal placement/right-click must not silently arm linking; existing saved links and transport behavior persist. See [UI design](UI_LINKING_DESIGN.md).
- **HL-Q-022 (open):** Decide link/unlink player permissions, pending-selection expiration and simultaneous edits. Test UI behavior alongside future native MR inventory on 26.63 without experimental assumptions. These do not prevent baseline source import.

## 2026-11-07 — Owner accepted defaults

- **D-014:** Hopper and Transporter are interchangeable **Sorter input mechanisms**; same filter/priority/redstone decisions; old Hopper-only routes stay supported.
- **D-015:** Transporter goes **on top of Sorter columns**; neighboring ordinary containers are deliberately source inventories, **not** storage chests. Final storage is handled by downstream Sorters, with no output chests at Transporter Y or above. No forced extra per-face input toggle.
- **D-016:** Persistent controller/network identities, controlled discovery, deterministic controller authority; exact membership/election/recovery design still pending.
- **D-017:** Unloaded/stale/unknown Bulk capacity is not 'full'; hold safely rather than permit wildcard prematurely.
- **D-018:** Receiver Q5 native MR slots have independent finite capacity and backpressure, separate from ordinary-count lane; exact slot quantity remains to be proven.
- **D-019:** Q4→Q5 enters a **global Hart Logistics routing pause**, uses crash-safe staged migration, **automatically processes unloaded legacy blocks when they load**, and shows status in block menus. No claim of migrating genuinely unloaded blocks or pausing vanilla Hopper mechanics.

## Native MR architecture blocker, 2026-11-07

HL-Q-001 and HL-Q-017 cannot be closed positively on target 1.26.63.1: custom block container remains experimental and PG-03 NO-GO without toggles; PG-04/05 BLOCKED. Choose a verified stable lossless native ItemStack custody mechanism or a future explicitly approved stable runtime version. Do not enable cheats/experiments or weaken metadata fidelity. See docs/BUNDLE1_PREPARATION_RESULTS.md.

## MR custody alternatives needing owner decision (post-2026-11-07 PG-03 NO-GO)

[MR custody alternatives on 1.26.63.1](MR_CUSTODY_ALTERNATIVES_12663.md) compare a guarded vanilla inventory backing block (physical-world footprint and Hopper security), persistent container entity (entity lifecycle and duplication risks), and waiting for stable no-experiment custom block containers in a future server/client release. **None is approved or validated.** Legacy direct-only MR bypass remains preserved as interim behavior, not a new persistent queue. Stop experimental API use; all prior Bundle 1 temporary code is deleted after confirmed LAB cleanup.
