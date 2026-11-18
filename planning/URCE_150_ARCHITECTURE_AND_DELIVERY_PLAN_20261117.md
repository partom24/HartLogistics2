# Hart Logistics 1.5 — Unified Routing and Custody Engine (URCE) planning charter

**Planning branch:** `planning/urce-150-20261117`  
**Base:** `baseline/native-first-142-20261117` (1.4.2 native-first development baseline)  
**Decision owner:** November 17, 2026 — the owner closed 1.4.1 native-first development as **1.4.2** and authorized **planning** URCE using the old 1.5 skeleton as a *selective reference*.  
**Status:** **DESIGN / SOURCE REVIEW ONLY**. No 1.5 gameplay, pack manifest change, Q4 migration, feature rollout, LAB install or release authorization.

The selected [URCE design contract on main](https://github.com/partom24/HartLogistics2/blob/main/docs/UNIFIED_ROUTING_CUSTODY_ENGINE.md) is authoritative for this new architecture. **URCE** (Unified Routing and Custody Engine) is the name used in the repository; the old Q5-style queue-first architecture is obsolete. This branch does **not** adopt the frozen #79/#82 unified-custody source, cherry-pick its commits or copy its mock ledgers.

## 1. Success is a product result, not an engine rename

The owner's pinned [Sorter array and storage-room array](https://github.com/partom24/HartLogistics2/tree/main/docs/reference-images) are the target scale/layout, including approximately **1,400 Sorters** stacked in columns. Standalone networks without new 1.5 blocks must behave **exactly** like original 1.4.1 / versioned 1.4.2 under the same inputs and saved state.

### Non-negotiable compatibility

- **Filter → live-seeded Auto → Wildcard**, original bottom-to-top order and Bypass semantics for standalone/local routing. Item frames, redstone, native Hopper pass-through/locks/compaction, Dropper/Dispenser actual ejection, Collector↔Receiver links and world identities remain.
- Preserve original ItemStack identity and metadata. Ordinary item/count representation is allowed **only** where a lossless server-side classifier proves the identity can be safely represented as counts; unknown/custom or metadata-rich items stay in native custody with backpressure.
- q2/q3/q4 world/queue/journal data and ambiguous physical transfers must remain untouched or durably reconciled **without blind replays, destructive migration, forced draining or FIFO reintroduction**.
- Preserve current movement opportunities/cadence and budgets until matched BDS evidence supports a change. Never disguise polling or a timer as an event-driven inventory signal; native Bedrock owns actual inventory truth.

### Performance hypothesis to prove

In the 1.4.2 P4e active profile, `findAcceptSlot` uses ~**51.69** `Container.getSlot()` calls per normal Sorter admission; P4g's callback-local negative reuse had **no observed hits** in its active BDS sample. URCE should reduce *unnecessary candidate admission attempts* through a **configuration-based routing planner** before expensive live capacity checks, rather than add a stale global chest-capacity ledger. Not every inventory attempt can be optimized away; near-full physically admissible candidates still require a live authority check.

**Do not promise a 20 TPS/1,400-Sorter outcome without actual measured throughput, native tick distributions, memory, and no-loss/no-duplication integrity.**

## 2. Architecture responsibility and the authority boundary

| Boundary | Allowed responsibility | Forbidden shortcut |
| --- | --- | --- |
| **Logical column/router planner** | Maintain index of registered/filter/topology information, route priorities and possible candidates; build a deterministic read-only candidate sequence; requalify actual physical block/mode/filter before moving | Maintain live inventory-slot or Auto-seed capacity as truth; replace vanilla Hopper observation with unsupported events |
| **Native destination adapter** | At the final responsible moment ask native live container if an exact bounded stack can fit, retain exact metadata and selected-slot information where needed | Assume `addItem` remainder provides a journaled destination receipt; infer space from `contains`/first matching full stack |
| **Shared custody interface** | One logical Hart debit/credit/recovery boundary with explicit writer ownership/intent and fail-closed HOLD | Run old/new separate source debits or treat caller-supplied ACK as physical custody proof |
| **Ordinary Receiver account** | Preserve existing 250,000 ordinary-item capacity and current queue semantics until verified migration; batched count movement for proven lossless identities | Require Q5 queue format or silently reserialize metadata-rich items |
| **Native MR path** | Preserve whole ItemStacks in native finite inventory/physical route with verified fidelity and backpressure | Flatten enchantments/custom components into ordinary count buckets or invent a nonexperimental custom-container guarantee |
| **Future regional controller + Bulk** | Verified member identity, epoch, capacity and partition/split/merge authority; 200,000 ordinary items per Bulk member once proven | Infer unloaded/unknown banks are full or allow competing regional writers |
| **Future Transporter adapter** | Input from deliberately connected native source and handoff into Sorter-column authority, bounded graph, native redstone rules | Pipe directly to arbitrary chest, own a hidden item bank, or bypass Sorter admission and custody |

No requirement for one global per-tick work loop or a single synchronous worldwide controller. A **unified logical custody rule** is distinct from one physical controller and must not become an N-sorter worldwide bottleneck.

## 3. Execution sequence — planning now, gameplay separately gated

### U0 — Baseline acceptance and architecture inventory (start now, read-only)

1. Pin 1.4.2 gameplay+manifest hashes, release/owner-world gates and original source function inventory. Make a **complete read/write/side-effect entrypoint census** from the *active 1.4.2 code*, not obsolete PGxx overlays.
2. From the historical PG22 study, explicitly start with eight Hart writer entrypoint categories: (a) native Hopper compaction, (b) Sorter physical insertion, (c) Collector/Q4 ingress, (d) item-entity/Q4 ingress, (e) Receiver/Q4 egress, (f) Collector native direct MR, (g) physical-journal recovery, (h) Q4-journal recovery. Verify the current signatures and dynamic-property names; don't assert coverage based solely on an old count.
3. Classify each call as **native-managed**, **local read-only planner**, **custody mutation**, or **migration/read-only**; record caller/recovery interactions, possible external writers, native supported API/gaps and exact BDS proof.

**Exit:** complete traceable writer coverage and current 1.4.2 source/no-change statement; explicit 1.4.2 owner acceptance still pending.

### U1 — Read-only routing planner contract (first novel design deliverable)

**Required implementation contract:** [URCE-ADR-001: Route eligibility before native admission](URCE_150_EARLY_DECISION_ROUTING_CONTRACT_20261117.md) now states exactly what may be rejected at each stage, what remains live, how remainders continue, and the pass/no-go evidence. It takes precedence over illustrative algorithms in this charter. **U1 early-decision research conclusion:** [Collector/Receiver authority and serialization order no-go](URCE_150_U1_COLLECTOR_CAPACITY_FIRST_RESEARCH_20261117.md) closes the proposed queue-capacity-before-serialization experiment. Unsafe native cargo must be rejected without invoking Q4 load/migration/cleanup, and direct-only physical movement still needs authoritative zero backlog. **No gameplay change approved; move next source planning to U0/U2 writer/authority/custody proof.**

**U1 source-only gate result:** [Dedicated actual-source differential and performance-tradeoff record](URCE_150_U1_LAZY_ROUTING_SOURCE_PROOF_20261117.md). Naive lazy live lookups **NO-GO** (mixed cases regress and do not reduce native chest scans). Same-attempt native Block handoff is **research-only** pending BDS validity, redstone, Collector side-effect and real workload proof. Do not mistake read-count results for tick-time acceptance.

**First-principles gate first:** Before choosing indexes, controller topology or a new scheduler, use the [actual 1.4.2 routing decision tree and earliest-safe-exit audit](URCE_150_ROUTING_FIRST_PRINCIPLES_20261117.md). Build the smallest lazy Filter→Auto→Wildcard candidate sequence that preserves source Hopper compaction and only resolves live destinations after policy eligibility. The first testable outcome is **fewer expensive native admissions for correctly excluded candidates**, not a new route object or faster JavaScript iteration.

1. Define `planCandidates(snapshot, incoming, column)` *purely* from registered configuration and known loaded route structure, returning ordered *plausible* Sorter targets with reasons and unresolved-state HOLD when warranted. This is a **proposal contract**, not a new runtime API promise.
2. For standalone columns, prove priority equivalence to 1.4.2, including Filter, Auto (requiring live seeds), Wildcard, Bypass, redstone, unknown filter type and bottom-to-top order. A planner may **never** remove Auto/Wildcard candidates based on stale inventory content.
3. Separate **routing source qualification** from **final live destination admission**, preserving exact journal placement and no-loss/no-duplication. No hidden chest state or per-tick latency workaround.
4. Establish source-only differential tests against frozen 1.4.2 canonical functions for mixed five-slot Hoppers, same-type/different-metadata stacks, multiple Sorters/columns, full/partial/unloaded destinations, BYPASS/power and reordering. Record *number of candidate checks avoided*, CPU/native calls, and whether tests model live state or prove it.

**Exit:** new read-only planner is demonstrably equivalent and cheaper in selected modeled cases, with no gameplay modification. Owner approval required to use it in runtime.

### U2 — Shared custody/maintenance and migration contract (before any new writer)

1. Define a **single Hart-script-owned maintenance fence and writer adoption census**; coordinate existing Q4 and physical journals, including unresolved HOLD before activation. It does not stop vanilla Hopper/player/other-addon changes.
2. Classify ordinary count identities and metadata-rich ItemStacks conservatively. Separate inventory authority, route intent, escrow/physical receipt evidence, durable revision/epoch, and commit/recovery. A world property plus a native chest write is **not assumed atomic**.
3. Specify read-only q2/q3/q4 inventory, queue, links and journal census across loaded/unloaded regions, plus interrupted upgrade rollback, duplicate IDs and unknown opaque items. No Q5 intermediate schema and no migration that drains existing Receiver cargo.
4. Model crash points around journal preparation, physical debit, destination credit, world persistence, region partition and external interleaving. **Unknown outcome HOLD** with no speculative retry/refund, erasure or settlement.
5. Enforce writer exclusivity across local 1.4.2 and URCE pathways before any new gameplay. Adapt only after real native target-version capabilities prove this boundary.

**Exit:** source-only fault matrix, migration state machine, durability/gap list and credible engine-supported evidence plan. Not sufficient for BDS release.

### U3 — Isolated native viability gates

- Verify named BDS/script API and nonexperimental endpoint capabilities (especially custom block/entity MR inventory); no default experiment changes.
- Measure at least one native physical handoff with the exact Q4-equivalent receipt/recovery requirements under restart/unload; maintain single-writer ownership and existing world backups.
- Require deliberate owner LAB approval for a separate non-release candidate; no production writes.

### U4 — Future integration, only after U0–U3 gates

- First integrate a routing-only planner into a copy of the 1.4.2 baseline under new versioned 1.5 branch with no Bulk/Transporter feature behavior, then test real owner-scale workload.
- Only after shared custody writer+durability/migration gates, integrate ordinary Receiver account, bounded native MR path, and opted-in regional Bulk/Transporter in separately accepted slices.
- Test unload/partition, multiple controller regions, 200,000 per-bank ordinary count, receiver 250,000, item frames, wired/unwired old standalone networks and full owner arrays. Keep exact item counts and metadata through normal restart and ambiguous-crash HOLD states.
- Distinguish test CI/BDS local PASS, whole-product acceptance and owner release authorization.

## 4. Measures and decision thresholds (not invented performance targets)

Baseline measurements: `schedulerTick` calls, `processColumn` workload, `destinationFor` invocations, `findAcceptSlot` size/emptySlotsCount/getSlot/hasItem, actual throughput/items delivered, script p50/p95/p99, level tick/tps/watchdog, native memory and Q4 intent states. Compare **same topology/cargo/load conditions** against exact 1.4.2 installed bytes; do not count JS/TS duplicate CPU profiles twice.

**Stop conditions:** loss/duplication, changed native item components, wrong Filter/Auto/Wildcard ordering, mistaken unloaded bank assumptions, unknown durable receipt auto-settled, unexpected world or registry migration, or sustained performance regression. NO-GO stops source promotion and owner deployment.

**Open owner decisions, to resolve during planning:** Auto precedence relative to future Bulk in explicitly governed networks; multi-region controller authority/split-merge/failover; acceptable native MR endpoint in the no-experiments BDS; authoritative physical transaction and global-maintenance-fence semantics; priority of first 1.5 *read-only planner prototype* versus custody research after 1.4.2 owner acceptance.

## 5. Separation and provenance rules

- `implementation/native-first-engine-141-20261115` remains **historical P4e/P4g investigation**.
- `baseline/native-first-142-20261117` is the **1.4.2 native-first development baseline**, source/versioned, not production or owner-full-scale accepted.
- `planning/urce-150-20261117` is **design-only** based on exact 1.4.2 assets and source; no 1.5 runtime changes.
- The mainline 1.5 documentation and *standalone* synthetic models may inform contracts, but copy no frozen #79 unified-custody implementation, require no Q5 queue format and do not merge historical 1.5 prototype code into `addon/`.
- Preserve license, original UUID/world keys and original owner reference images; all 1.5 implementation requires a new authorization/acceptance gate distinct from the current planning request.

See [reference-by-reference disposition](URCE_HISTORICAL_15_REFERENCE_REVIEW_20261117.md).
