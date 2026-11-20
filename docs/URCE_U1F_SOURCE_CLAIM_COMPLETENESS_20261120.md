# URCE U1-F — Source-specific item-claim completeness ledger

**Date:** November 20, 2026
**Development branch:** `dev/urce-150-runtime-20261118`
**Status:** Implemented a **pure, offline/read-only proof contract and test fixtures**. No gameplay routing cutover, no independent in-world item-claim enumerator yet, no Q4→URCE migration or BDS approval.
**Precedence:** [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md), [pre-contract lessons](URCE_COLUMN_COORDINATOR_PRECONTRACT_LESSONS_20261120.md), [U1-E](URCE_U1E_SAME_TICK_TOPOLOGY_SHADOW_REUSE_20261120.md) and owner-approved [product contract](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md).

## Purpose

An OBSERVED Collector/Receiver Hopper + Transporter graph is **not** complete destination-claim evidence. It may omit Sorter/Auto/Wildcard/terminal/Bulk claimants, foreign/native paths, unobserved boundaries and unloaded chunks. A proven connected route cannot establish that no alternative or higher-priority home exists. U1-F explicitly distinguishes:

- A **topology observation** (U1-E; current live native graph; claim coverage UNKNOWN),
- An **independent, same-tick source-closed claimant census** that includes every relevant owner and physical/native/foreign boundary,
- Each owner's item-specific claim (Filter configuration, **live native Auto seed**, Wildcard registration, terminal status, authoritative Bulk home), and
- Live destination capacity and custody (still **outside** U1-F and URCE policy).

The ledger cannot authorize an item write, fallback, queue admission, migration or positive route lease.

## What was committed

- `addon/behavior_pack/scripts/urce_source_claim_coverage.js`:
  - `auditSourceClaimCoverage()` validates a detached U1-E graph, source-reachable known/unknown edges, matching source and tick, explicit independent enumeration provenance, declared closure for network boundaries/Sorter discovery/destination discovery/external native routes/item identity, an **exact** reachable claimant-node set, exactly one correctly typed item-specific claim observation per owner, fresh observation timestamp and a tier-appropriate evidence kind.
  - Missing, duplicated, stale, mismatched, unloaded or unverified source-reachable claims report HOLD / coverage UNKNOWN, never NO CLAIM. Owner not source-reachable must not be included. Source-scoped semantics prevent unrelated disconnected owners from changing the claimant list.
  - Unknown Auto seed remains `claim:"unknown"` and forces conditional fallback to remain unresolved, even when every claimant has been *enumerated*.
  - `evaluateAuditedGovernedShadow()` feeds an accepted, supplied **closed-world** census into the existing U1-D `evaluateSourceScopedShadow()`; reconciles optional local offers and avoids duplicating them in remote candidates. All returned results have `executePermitted:false` and `persistPermitted:false`.
  - The pure module has **no Bedrock import, getBlock, inventory read, persistent state, journal call, scheduler or cargo writer**.
- `runtime/tests/urce_u1f_claim_coverage.test.mjs`:
  - Staged conditions: no independent enumeration, partial U1-E graph, missing/unexpected owner, duplicates, stale tick/native Auto seed, cached-full incorrectly treated as native Auto rejection, unknown reachable edge, mismatched local offer and unseeded Auto.
  - A **synthetic closed source census for all 505 Sorters** of the repeatable 101-column setup, repeated for 100 individual item-specific snapshots. Each selects the correct matching Filter at columns 21/41/61/81/101 and never authorizes custody.
- No changes to `main.js`, active link guard, Q4 page/meta/journal keys, physical journal, native Hopper/Sorter scheduling, Collector/Receiver writers, any world or manifest.

## Proof boundary — essential for future work

**This stage does NOT claim we already have complete in-game item-claim enumeration.** Its closed-world input flags, kind and timestamps are **caller-supplied evidence**. They are checked for structural and internal consistency, but JavaScript cannot verify that the underlying Bedrock world actually lacks hidden claimants or outside writers. In the current runtime, **no trusted producer supplies this evidence**. An OBSERVED U1-E graph alone is insufficient; the ledger rejects it without a separate enumeration.

The `COMPLETE_FOR_SHADOW` return means *the independently supplied closed graph model is internally accounted for*. It does NOT mean the actual game world's full routing policy or capacity was proved. A future implementation must establish the source-closed enumeration in BDS, including unloaded/unknown boundaries and live Auto seed, before this gate can safely be used to compare real governed fallback. Even then the result stays nonexecuting until custody and migration gates are separately met.

## Source-executed checks performed

- Executed the **actual committed U1-F, U1-D and U1 route-model JavaScript** in V8. A complete synthetic source graph with Filter yes / Auto no (fresh native-seed-labelled evidence) / Wildcard yes produced ordered conditional Filter then Wildcard shadow stages; **no write authority**.
- With an unseeded Auto, even though every owner was enumerated, the planner returned Filter only and `unresolved:true`. No unsafe Wildcard fallback.
- Missing enumeration, partial graph and stale Auto observations returned HOLD with no cargo permission.
- Repeated the **100-item / 101-column** synthetic source-decision model: 161,600 one-tick inspections, 48,000 proven nonmatching Hopper observations, 100 local candidate handoffs, 100 expected item captures, 20 per type, zero candidate-order differences.
- Separately executed 100 **offline synthetic closed-world claimant-plan checks** against a 506-node graph (source plus 505 Sorters): **100/100** selected the designated Filter home, with no incorrect offline plans. These tests artificially supply all 505 claims for each item; they are **not gameplay enumeration cost** or native-call savings.
- U0 source writer-surface check: **10 imported runtime modules**, **46** existing native/world mutation call sites and **18** dynamic-property writer-helper sites; U1-F is *not imported by main.js* and contributes zero new gameplay writes. New module and test pass V8 JavaScript syntax checks.

## Work not claimed as completed

The normal Node `--experimental-vm-modules --test` suite, CI, owner BDS LAB, real destination-claim closure, full native ItemStack identity, queue migration/durable cutover, and actual server CPU/TPS benchmarking remain **unverified**. The current code still performs one-tick source inspection and retains every original custody writer and Q4 recovery.

## Next gate

**U1-G or equivalent** should build an independently observable source-reachable claim catalog (per-Source network membership + Sorter/Auto/terminal/Bulk identity and freshness), with bounded work and explicit unloaded/foreign-writer uncertainty, then measure its *actual* native-API and JS cost before any conditional fallback or custody cutover. Reuse only existing same-tick topology observations where sufficient, rather than repeating global world walks.

The [LAB world is an expendable copy of the 1.4.1 production world](OWNER_LAB_WORLD_REFRESH_POLICY_20261120.md); production is not expendable. Never assert that source-only proofs authorize a release.
