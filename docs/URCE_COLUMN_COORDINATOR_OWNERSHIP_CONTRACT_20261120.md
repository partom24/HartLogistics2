# URCE + Column Coordinator — Architectural Ownership and Handoff Contract

**Contract ID:** HL-URCE-OWN-001
**Decision date:** 2026-11-20
**Status:** OWNER-SELECTED ARCHITECTURE / NORMATIVE ENGINEERING DESIGN; **NOT IMPLEMENTATION ACCEPTANCE**.
**Scope:** HartLogistics2 1.5 development, standalone legacy columns and future governed multibank networks.
**Provenance:** Based on the [2026-11-20 lessons and proof-boundary record](URCE_COLUMN_COORDINATOR_PRECONTRACT_LESSONS_20261120.md), the [owner-approved 1.5 product end state](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md), [player-first ADR-004](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PLAYER_FIRST_TESTING_DECISION_20261118.md), and historical [U1 early-decision contract](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_EARLY_DECISION_ROUTING_CONTRACT_20261117.md) and [capacity-first counterexamples](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_U1_COLLECTOR_CAPACITY_FIRST_RESEARCH_20261117.md).
**Implementation reference inspected:** dev/urce-150-runtime-20261118 at commit 0f0034469f6e064d2c211dc1ec8db18c83454646; 1.5.8-dev, @minecraft/server 2.7.0. Recheck HEAD and test state before coding. Design terms in this document are **contracts, not claims that methods already exist**.

**Precedence and preservation:** The November 18 owner product and player-first decisions supersede conflicting historical requirements. This design refines the responsibility split, **not** those product decisions, historic evidence, or protected continuity files. Do not adopt obsolete Q5, frozen #79/#82 runtime, required final bank, mandatory terminal Collector, per-bank controller, FIFO or demo-only item/coordinate rules.

## 1. Mission and nonnegotiable invariants

This contract prevents duplicated ownership of one item and duplicated expensive work while retaining the original native-first Sorter functionality.

1. **Single authoritative custody per quantity/identity.** Only a verified current custodian and an approved, journaled handoff can change Hart-owned custody. No second independent debit path and no speculative credit, refund or replay. “One logical authority” does NOT require one physical central controller or one generic storage format.
2. **Policy is not capacity; capacity is not custody.** A Filter/Auto claim can exist when its chest is full. A route proposal is not a live admission. A matching slot or Q4 balance is not a durable receipt.
3. **Passive Bedrock Hopper transit remains native.** Observing or declining to match cargo in a local column creates no new Hart network ownership. Existing Hopper locks, compaction, pass-through and live Sorter behavior remain. Hart cannot halt vanilla or third-party inventory writers globally.
4. **Managed movement requires a verified reachable home or authorized buffer.** No speculative bank forwarding, invented terminal, bounce-back or guessed Bulk/Wildcard fallback. HOLD at the existing accountable custodian on unknown/unloaded/ambiguous authority.
5. **No stale positive authority.** Column hints, cached chest capacity, saved graph revisions and same-tick observations cannot independently authorize a native write; positive managed-link safety must be based on the required fresh evidence. Bounded negative memoization may only deny/defer, and must support recovery/invalidation.
6. **Live item fidelity.** Keep the original native ItemStack and metadata for physical/native MR operations. Use count-based identities only where lossless representation is proved; never flatten opaque, named, enchanted, custom or otherwise unrepresentable cargo into an ordinary count.
7. **Correct fallback and partial fulfillment.** A failed/full individual candidate does not establish that another Filter, Auto, Wildcard or authorized Bulk route is unavailable; partial acceptance continues with the remainder and preserved budgets.
8. **Fail-closed on uncertainty, not on irrelevant local nonmatches.** Differentiate unknown route/custody from one known-mismatching Filter. Preserve historical standalone behavior when no governed Hart movement is requested.
9. **Bounded work and measurable cost.** Avoid globally scanning unrelated world components on local transit. Bound source polling, graph discovery, queue enumeration, admissions, retries and menu data. Do not select batching/poll intervals from arithmetic-only savings.
10. **Preserve stored worlds.** Original identifiers/UUIDs, Q2/Q3/Q4 saved content, linked endpoints, journals, original 1.4.x functionality and crash recovery remain protected; no silent migration or item deletion.

## 2. Logical authorities and prohibited overlap

| System | Exclusive decision authority | Allowed inputs/outputs | Forbidden |
| --- | --- | --- | --- |
| **Central scheduler** | Due work selection, fairness, global attempt/work limits and deadline accounting | Registered column deadlines; URCE ingress/drain and recovery work | Implicitly skipping due safety-critical polls because item budget is exhausted; hundreds of uncoordinated timers |
| **Column Coordinator** | Local column observation and configuration-based offer preparation | Live source Hopper presence/lock/slots; ordered Sorter modes/filters; destination identity *hints*; next-due tick | Selecting a remote network home, deciding link safety, serializing Q4 for rejection, writing durable custody or claiming an inventory cache is authoritative |
| **URCE route policy and graph** | Source-specific managed reachability, tier arbitration, eligible destination ordering, managed cycle/unknown-boundary decisions | Read-only column offers, verified connection observations, policy and lineage/revision hints | Native source debit, Q4 or chest mutation, inventing a home from adjacency, accepting inventory capacity from stale hints |
| **Endpoint admission adapter** | Current target-kind-specific eligibility and capacity evidence for an attempted route | Current native chest/slot/Auto seed, live redstone, safely initialized authoritative queue, MR or Bulk authority | Durable ownership transfer; using cached 'full' to erase a claimed destination |
| **Shared custody protocol + existing writer adapters** | Final source/destination revalidation, bounded debit/credit, journal/fence/receipt, ambiguity HOLD and recovery | Selected policy candidate with route proof where required; **fresh** source and destination state; approved native/Q4/MR/Bulk writer | Replanning globally while mid-commit, treating planned route/ACK as commit receipt, unsafe parallel writer creation |
| **Vanilla game and foreign addons** | Their own native inventories, Hopper transfers and player interactions | Observed as external state; their writes may race with Hart reads | Not subject to Hart's script-only pause/journal fence |

**Terminology:** “URCE” is the overall architecture, not a second independent scheduler or an item-moving competitor to the Column Coordinator. The Coordinator is a *component within URCE*. One centralized logical policy module should service standalone and governed candidates, with legacy mode preserving legacy behavior. Design boundaries may be implemented as functions inside existing modules; extra files/classes/services are not mandatory.

## 3. Read-only handoff vocabulary and scope

These are **conceptual data contracts**. They deliberately specify required semantics, not frozen TypeScript API names, object persistence, event subscriptions or an implementation mandate.

### 3.1 ColumnObservation (Coordinator → policy)

Required facts:
- **scope:** STANDALONE_LOCAL or GOVERNED_SOURCE (established from verified membership, not proximity).
- **source identity:** dimension/coordinates/block-kind and a synchronous native source reference valid only for the current attempt; physical slot reference if inspected. Do not retain a live Block/Container/ItemStack as durable network state.
- **column identity:** location and bottom-to-top Sorter ordering; configuration revision and observed scheduler pass.
- **cargo identity hint:** native observed type and only extra Filter keys needed for possible candidates (potion effect/delivery, enchanted-book enchantment-type set). A hint must not erase native ItemStack metadata or prove serialization/admission.
- **offers:** zero or more local Filter, Auto, Wildcard or Bypass-related policy facts; each offer identifies Sorter and expected destination location/kind, its tier, claim YES/NO/UNKNOWN, and the evidence/revision of that claim.
- **uncertainty:** unavailable source, invalid block, unreadable inventory, stale configuration or unverified claimant must be explicit, never silently normalized into NO.
- **observations:** optional recent destination-capacity hints, marked ADVISORY only. No previous 'full' status may skip a currently eligible candidate.

The Coordinator **MUST NOT** mutate Receiver queue state while preparing this observation. Pure candidate discovery must be separated from today's destinationFor() path, which can register a Collector or persist its presence.

### 3.2 RoutePlan (URCE policy → admission)

Required facts:
- Scoped source/custodian identity and original local offer provenance.
- Ordered *candidate attempts*, each with exact tier, claimant/owner block identity, proposed reachable destination, route kind and the minimal verified path/evidence; include a deterministic local-order tie break and empirical transaction-cost ordering between eligible columns when applicable.
- Explicit **claim vs live admission** distinction: a Filter claim remains a claim when capacity is zero; Auto only becomes positively seeded by an actual current seed test; an unknown remote claim cannot be treated as NO.
- **network proof status:** NOT_REQUIRED_LOCAL, FRESH_SAFE_OBSERVED, RECHECK_REQUIRED, HOLD_UNKNOWN, or REJECT_CYCLE. NOT_REQUIRED_LOCAL only applies to an established local/legacy physical storage route for which network observation is not an authority requirement. Do not use it to bypass governed reachability.
- **routing disposition:** LOCAL_TRANSIT (known no local eligible route; preserve native behavior), CANDIDATES, HOLD(reason), REPLAN(reason), or REJECT_MANAGED_LINK(reason). A routing plan cannot return COMMITTED.

RoutePlan is an ordered **proposal**, not a receipt or reservation. No executePermitted flag supplied by planner code is sufficient for an item writer. No global negative conclusion is permitted from one column's NO_LOCAL_CLAIM.

### 3.3 AdmissionEvidence (endpoint adapter → custody)

Required facts:
- Exact current destination kind and state (present/loaded, redstone status, inventory/queue validity, native capacity, partial-stack compatibility, current Auto seed).
- For Q4: only after cargo's required safe representability test, use authoritative queue admission; loadReceiverQueue() may migrate/repair saved state and is NOT a pure peek. Do not read Q4 first for an item that current rules reject before serialization. For native direct-only cargo, preserve authoritative zero-backlog checks before transfer.
- For native storage: a full inventory may still have one compatible partial stack; do not use emptySlotsCount == 0 as blanket denial.
- For MR and future Bulk: the adapter must prove the correct type of authority, capacity and exact identity; ordinary Bulk capacity never authorizes MR insertion.
- Distinguish DENIED_KNOWN_FULL from UNKNOWN_UNAVAILABLE; neither result allows route policy to falsely declare all claims exhausted.

Admission evidence applies to a particular item/amount/attempt, **not** an indefinite capacity announcement.

### 3.4 CustodyAttempt (policy + admission → exclusive writer)

An attempt MUST bind:
- Verified current source custodian, physical location/slot or authoritative account and original item identity; requested quantity and remaining per-column/global budget.
- Candidate destination and relevant source-specific route proof; **fresh** valid managed-link checks including all linked inputs needed for a Receiver drain when origin is unknown.
- Current admission evidence, actual positive movable amount and established metadata representation capability.
- Journal/fence/recovery preconditions and unique operation/custody context appropriate to the existing writer. Caller-supplied operation IDs or graph revisions cannot stand in for a native physical receipt.

The custody layer MUST reread/revalidate source and destination at the necessary precommit boundary, own the only mutation, and return a bounded outcome:
- **COMMITTED(amount, exact identity, accounted custodian):** only with verified write/recovery semantics, then update route hints and counters.
- **NO_ADMISSION(reason):** no transfer, try next *permitted* candidate or HOLD as policy requires.
- **REPLAN/RETRY_LATER:** inputs/revisions changed, with no new custody movement.
- **HOLD_AMBIGUOUS(reason):** a write/recovery outcome cannot be safely classified; fence dependent transfers and preserve evidence/journal.
- **ERROR_NO_MUTATION:** confirmed failed before any debit/credit. Do not label an ambiguous post-intent failure as no mutation.

These names describe expected behavior; they are NOT existing exported functions or a decision to add a persistent per-item routing record.

## 4. Required execution ordering

### 4.1 Local standalone / native Hopper column

1. The central scheduler observes all required due deadlines under the conservative existing **one-tick baseline** until an alternative proves equivalent.
2. Honor global journal/queue fences, current source Hopper existence, validity, redstone lock and native firstItem() empty fast path.
3. Coordinator determines cheap Filter/Bypass transit eligibility **for every occupied source slot needed to prove transit**, preserving necessary compaction. If all eligible local Sorters provably miss, leave item to native Hopper transfer and return without destination/Transporter scanning.
4. For potentially accepted cargo, share one policy implementation for Filter → live-seeded Auto → Wildcard and bottom-to-top within each tier. Bypass and power/quarantine behave as legacy.
5. Resolve only attempted live Sorter/destination kinds, validate exact native Auto seed/slot acceptance; recheck native source; use the existing protected physical or Collector writer.
6. Continue remaining quantity/other eligible candidates under original movement budgets; no negative cached chest capacity suppression.

**Compatibility rule:** Introducing URCE must not require a remote source-global scan to keep a previously valid standalone Sorter column functional.

### 4.2 Governed Collector/Receiver or multibank route

1. Capture current authoritative source identity and verified governed network membership. Coordinator may provide only local eligible claims; remote reachable destinations are URCE's responsibility.
2. URCE builds minimal source-reachable candidate plans with governed fallback policy; only selected reachable and authorized next hops are eligible.
3. Reject cheap, authoritative impossibilities (invalid link, disabled endpoint, nonmatching Filter, unsupported route kind) before expensive inventory/graph work where equivalent and side-effect-free.
4. For potential **queueable** Collector cargo, prove safe serialization/representation **before** an authoritative Q4 load/room check; a general “queue capacity first” reorder was previously proven behavior-changing and is prohibited without a new equivalence proof.
5. For a native/direct-only path, preserve the currently required Receiver queue-zero-backlog proof, actual native output slot capacity, power and journal rules. An unqueueable Dropper/Dispenser item entity retains native world custody when no proven route exists.
6. Verify managed-link safety using current sufficient source-specific topology evidence, then perform custody precommit. A full-network observer can be optimized only after same-decision proof across cycles, disconnected paths and unknown boundaries.
7. Receiver discharge: check authoritative Q4 nonempty and actual native output presence/lock; a *pure* item-specific capacity preflight may skip unnecessary topology work if equivalence is proved. Existing drain guards **all** incoming Collector links because Q4 does not encode authoritative per-item origin. Preserve that safety fence.
8. After a committed transfer, update only derived planner/Coordinator hints; neither subsystem independently credits a source, an account or a destination.

**Unverified network state ⇒ no new Hart forwarding**; never infer actual item motion merely from Transporter visual adjacency.

## 5. Routing policy and priority are singular

- **Standalone:** existing Filter → live-seeded Auto → Wildcard; Bypass and bottom-to-top within columns; native Hopper pass-through/compaction.
- **Governed ordinary claimed or existing authoritative Bulk home:** first all applicable reachable accepting Filter and live-seeded Auto destinations; then verified Bulk capacity; use Wildcard only if applicable Bulk is **authoritatively proven exhausted**. Unknown/unloaded Bulk status is not full.
- **Governed genuinely unclaimed ordinary:** verify no remote/local Filter/Auto claim and no authoritative Bulk home; then reachable Wildcard → optional real terminal Collector → proven Bulk overflow → HOLD.
- **MR:** exact native ItemStack preservation, service priority without starving ordinary, native Wildcard where policy permits; ordinary count-only Bulk is ineligible. Terminal/MR Bulk requires its own proven durable native facility.
- **Across eligible columns:** cost-aware selection uses actual or calibrated transaction cost, without overriding tier precedence and intra-column bottom-to-top order; do not invent a hardcoded nearest-block rule.
- **Partials:** iterate through other eligible same-priority destinations and later allowed stages with the remaining exact quantity. Claims and capacity must remain distinct.
- **No terminal, no Bulk, or only Collector/Receiver pairs is valid topology.** An unavailable downstream edge is not proof that a Collector is terminal. Directed managed cycles are rejected; branch/merge allowed.

One policy authority serves both paths; separate adapters handle physical admission/custody. The policy must not change silently when switching between modes.

## 6. Scheduling and budgets

- Keep **one logical due-work owner** even if implementation retains current schedulerTick/logisticsTick and independent recovery callbacks. Do not introduce one system.runInterval per column.
- Each column can maintain nextDueTick, lastObservedTick, activity and a cadence qualification, but this is **scheduler metadata**, not durable cargo custody.
- The existing one-tick polling behavior is the comparison baseline. Two- and four-tick adaptive cadences are **hypotheses** and MUST NOT be enabled by “quiet” alone. A 1–2-tick item that passes between four-tick polls is invisible; minecart-above-Hopper and vanilla/custom fast transfers need BDS phase testing.
- An empty native firstItem() read is still polling, not an item-arrival event. Do not invent a generic Hopper inventory-change callback. Player/block events can invalidate configuration but cannot prove all native/foreign contents unchanged.
- Separate **due source inspections** from **successful movement quantity**, **transaction attempts**, **topology observations**, **journal reads/writes**, **wall-clock latency**, and **peak tick work**. Preserve item-movement fairness and avoid starving due column inspections behind a exhausted transfer budget; if a deadline is missed, measure/report lateness and retain safe fallback.
- Bounded recovery and Q4 draining must continue regardless of the coordinator's activity heuristic. Older Receiver queue cargo is not a new source-Hopper arrival event.
- Batch size 16/32/64 and adaptive 1/2/4 are evaluation cases, not approved constants or automatic speed guarantees.

## 7. Invalidation, uncertainty and recovery

- **Column revision** changes with Sorter registration/removal/reorder, mode/filter changes, relevant column reconfiguration and restart. A Filter-index negative is usable only when all required modes/filters are known and current for this local evaluation.
- **Network revision** changes with managed Collector/Receiver link and topology-affecting known block changes. Route snapshots must still validate relevant physical edges where Bedrock/foreign changes are not fully observable; revision equality alone cannot grant a positive transfer.
- **Destination observations** are advisory and local to their observation time. A prior negative capacity result must not prevent reconsideration after player/Hopper changes or incorrectly advance to Wildcard/Bulk; do not promote it into an authoritative item-home ledger.
- **External writers:** Players, vanilla Hoppers and other addons may change source or destination between reads. Revalidate on the final source/destination path; insufficient state becomes HOLD/REPLAN, not a guessed ACK.
- **Native world unknown/unload:** Unknown means unknown; not absent, disconnected, full, drained, terminal or zero outstanding quantity.
- **Recovery:** Keep Q2/Q3/Q4 migrations and existing journals protected. A world dynamic-property update and a native inventory write are not assumed atomic. On ambiguous cutpoint preserve custodian/journal, do not guess duplicate/replay/rollback. Registry/menu reads must not unexpectedly perform custody mutations; any intentional migration/repair requires an explicit controlled side-effect boundary.
- **Status/UI:** Distinguish queued, HELD and intentionally STORED items per authoritative custodian; do not double count across coordinator, URCE and Q4. A read-only menu must not scan/deserialize 250,000 entries or initiate movement.

## 8. Existing runtime migration / writer adoption plan (implementation stages, not authorizations)

**Stage 0 — Pin/reconcile evidence and callbacks:** Complete **transitive U0 census** of all scheduled/event/UI/startup/migration/recovery routes reaching native mutations. Include same-Hopper compaction; Sorter physical storage; Collector and entity Q4 ingress; Receiver Q4 discharge; direct-only native transfer; physical/Q4 replay; registry/Collector registration, filter, item frame and player-visible side effects. Annotate who currently writes and when.

**Stage 1 — Pure local observation boundary:** Extract pure candidate discovery from side-effectful destinationFor() registration and live mutation; add source/column-specific tests proving mode/filter/compaction equivalence. Keep one-tick polling and existing writers.

**Stage 2 — Unified routing policy in shadow/differential mode:** Compare the source-only URCE route model against real local routing and candidate order. No second writer, no routing-mode cutover until same item outcomes and side-effect parity. Adopt one policy implementation for standalone and governed scope with explicit fallback differences.

**Stage 3 — Shared custody writer adoption:** Wrap **existing** writers with a common authority/fence/outcome contract without duplicating inventory mutation. Ensure physical and Q4 journal provenance, partials, ambiguity and migration unchanged. New Bulk/MR writers cannot be enabled before their own U2/U3 proof.

**Stage 4 — Coordinator scheduling and safe hot-path optimizations:** Introduce per-column due metadata while retaining one-tick behavior initially; prove single-occupant Hopper fast paths, local indices and same-synchronous-attempt native reference reuse before enabling. Each optimization has its own differential correctness and native-call gate.

**Stage 5 — Adaptive rates and bounded topology proof:** Optional and independent. Require BDS minimum-residence/interception evidence before slower polling; require native and synthetic equivalent loop/HOLD/unknown decisions before pruning global topology observation. Negative cache cannot authorize, same-tick caching cannot become cross-tick positive authority.

**Stage 6 — Product integrated acceptance:** Complete governed multibank/Bulk/terminal/MR/UI/retrieval pathways as their proofs permit, owner-playable LAB acceptance and independent release approvals. No source test, this design document or existing LAB evidence silently authorizes a production/world migration.

## 9. Verification obligations and measurable gates

| Gate | Must pass / demonstrate | Status at contract creation |
| --- | --- | --- |
| U0 complete mutation entrypoint census | Every direct/transitive script callback/writer/side-effect and recovery path mapped; no second live debit | OPEN |
| Local route/compaction differential | Same observed item destinations, quantities, filtering, special identity, redstone/Bypass/partial behavior, necessary compaction as pinned source | OPEN for proposed refactor |
| Planner isolation | Read-only routing/proposals have **zero native or persistent writes**, including Collector registry side effects and queue migration; controlled maintenance retains original semantics | OPEN |
| Route priority and fallback | Local and governed exact tier/order/partial/fallback outcomes, source reachability and unknown/terminal/cycle handling across arbitrary valid layouts | OPEN |
| Custody conservation | Source debit + destination/Q4 credit, journals, recovery and exact native MR identity; ambiguous crash/foreign writes HOLD rather than duplicate/erase | Existing scoped proofs; unified/new writers OPEN |
| Scheduler correctness | No missed eligible cargo across arrival phase/residence, source Hopper position, Hopper minecart above, redstone, multi-slot, unknown/power; bounded due-poll lateness | Adaptive NOT PROVED |
| Topology differential | Same SAFE/HOLD/REJECT as original full observer for branch/merge/cycles/unloaded/unknown/native changes; no stale positive | Proposed pruning NOT PROVED |
| Native-call budgets | Instrument real full-runtime modules including source, Collector/Receiver, observers, frame maintenance and recovery, not isolated sorter only | Additional scenarios needed |
| BDS/player acceptance | VS Debugger + .mcstats + Script Profiler, real source/destination item counts, identity, restart recovery, responsiveness during placements/eating/traffic; no arbitrary fixed rig | NOT PROVED by synthetic models |

The 101-column single-cobblestone and repeating-five-item scenarios are **proposed reproducible performance fixtures**, not BDS evidence; prior exact arithmetic call totals are not frozen budgets. Also stress approximately 1,400 Sorters, many different column heights and arbitrary legitimate items, source/destination unload, redstone, random rotations, bank links without Transporters, and converging loops. Test the existing **full runtime**, not just the planner module.

## 10. Explicit GO / NO-GO rules and deferred choices

**GO for source-controlled implementation preparation:** ownership boundaries and authority separation in this document are accepted; use them to produce the detailed function interface and U0/U1/U2 validation tests while preserving active gameplay until evidence supports change.

**NO-GO for automatic enablement:** slower-than-one-tick polling; stale positive route/chest capacity caches; source-reachable-only topology proof without cycle/unknown equivalence; new or dual custody writers; capacity-before-serialization Q4 reordering; destructive migration; experimental APIs/pack toggles; bypass of existing journal fences based on a planner plan; any public/production release without separate approval.

**Engineering choices left open:** actual module/function names; whether a per-column Filter index beats a simple five-entry scan; exact working set of authoritative live admission; number/priority of native calls and BDS time; proven source-specific observer boundary; fair budget implementation; safe batching; separate durable native MR/Bulk adapter; UI and retrieval proof. Those must be decided from native correctness and measured incremental benefit, not aesthetics.

**Success criterion:** A correct native-first system in which an unrelated item does almost no Hart work, eligible cargo follows the correct verified path, every Hart-controlled transfer has one accountable custody outcome, and the server remains playable under real user arrangements. **No code, state migration, LAB or production action is created by this document.**
