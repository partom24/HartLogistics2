# PG-22 — From reference custody writer to a real unified Hart custody coordinator

**Status: SOURCE-ONLY / OFFLINE ADOPTION AUDIT. No Bedrock runtime writer, no LAB pack, no transfer authorization.**

## Source review: three owner-supplied reference-only modules

The owner renewed access to three standalone source files and specifically identified **`custody_writer_boundary.mjs`** as useful to strengthen the new custody work. These files are *conceptual reference only*: **no source or imports from the three reference modules are committed to this repository**. The implementation below was independently authored.

### Which ideas are useful, and what they do not establish

| Reference | Design idea worth adopting | Boundary established by the file itself |
| --- | --- | --- |
| `custody_writer_boundary.mjs` | One Hart-managed writer identity and one active logical operation across native, Q4, Q5, Bulk; reject duplicate IDs; HOLD on unresolved outcome; require stronger completion evidence | Its active runtime defaults to **DISABLED**; test mode is **RESERVATION_ONLY**. Active token, completed-ID `Set` and sticky HOLD are **process-memory-only**, lost on BDS termination. Completion flags come from the caller. No Bedrock writer can be authorized and no world-property/inventory mutation exists in this module. |
| `native_direct_lane.mjs` | Keep whole original native `ItemStack` and avoid metadata reconstruction; leave uncertain movement/journal in HOLD | Its per-owner world-property intent and immediate source/destination readback do **not** certify a single cross-lane writer or durable atomic inventory+world-property commit. Two separate `setItem` operations for plain-stack partial merge are still vulnerable to a partial cut. |
| `q5_output_executor.mjs` | Phase intent → Q5 logical debit/checkpoint → destination mutation → readback → receipt → marker removal; never automatic replay of ambiguous output | It **assumes** the caller owns exclusive scheduling; it cannot supply that exclusivity. Q5 checkpoint, world-property intent and vanilla output inventory are separate persistence domains, not one proven crash-atomic commit. Nothing in the uploaded file enables arbitrary MR item reconstruction. |

**Key conclusion:** The custody writer is a **good foundation for cooperative Hart writer serialization**, but a **Symbol/token and in-process ID list are not a durable lock**, caller booleans are not an engine attestation, and an add-on scheduler cannot by itself stop a player, vanilla Hopper, or foreign script from touching the same physical container. A favorable rollback to the owner's player inventory is evidence of a prior save point, not a certified transaction rollback.

## How this complements existing work

[PG-17](PG17_REFERENCE_CONCEPTS.md) already modeled cross-lane overlap of six conceptual routes; **PG-22 does not duplicate or replace PG-17**. [PG-21](PG21_POSTCRASH_CUSTODY_HARDENING.md) accounts for actual player/chest/input-Hopper/output-Hopper/Receiver Q4 persistence differences. PG-22 now addresses a missing **adoption gate**: an eventual coordinator is meaningless if even one old 1.4.1/PG20 entry point continues to debit/credit independently.

[Independent PG22 offline adoption audit](../candidates/transport/unified_writer_adoption_audit.mjs), expanded after **PG23's exact-source audit**, now lists **eight existing Hart entry-point categories** that would have to be captured by a single scheduler:

1. **Sorter internal vanilla Hopper slot compaction** (PG23 identified a separate two-write physical hazard).
2. Sorter physical source → adjacent storage moves.
3. Collector / Sorter ordinary → Q4 ingress.
4. **Dropper/Dispenser ejected-item entity removal after Q4 ingress** (a separate physical writer).
5. Receiver Q4 → ordinary output.
6. PG20 direct-only MR whole-native bypass.
7. Physical journal recovery.
8. Q4 queue journal recovery.

The initial PG22 evidence HL-E-060 documented six categories before source review discovered the two separate write sites. This revision corrects the **coverage census**, not the historical evidence or a claim of runtime integration.

It also accounts separately for **five future paths**, which must remain **NOT_IMPLEMENTED** until admitted (Q5 output, Bulk receive/send/internal and world migration).

The model refuses an incomplete/duplicated entry-point census, a single legacy route bypass, an unknown future handler, stale controller epoch, absent global migration freeze, incomplete restart journal scan, any old pending or ostensibly COMMITTED journal that has not been independently audited, duplicate operation IDs and attempts to reactivate an already retired ID after restart. A clean reported census yields only **`MODEL_IDLE_ONLY`**, never permission to mutate, settle, clear or promote. The model cannot attest that a claimant truly integrated all handlers, that `Set` history survived a crash, or that its synthetic epoch is a crash-safe CAS token.

Its [24 Node tests](../tests/test_unified_writer_adoption_audit.mjs) specifically cover all eight individually uncoordinated current paths, the five planned routes, partial scans, pending journal phases, stale epochs, repeated IDs and falsely asserted physical-writer exclusion. All reported capabilities remain **false**, including for an apparently clean startup.

## Proposed architecture for an actual future runtime candidate

1. **Adopt a single Hart-managed scheduling front door.** Existing Sorter, Collector, Receiver, Q4 recovery and PG20 direct bypass must route through it, along with future Q5/Bulk; no parallel shadow scheduler or separate owner-specific bypass. Retain exact original world keys and compatibility semantics during migration. Observe the current physical and Q4 journals as separate old evidence until a safe cutover is proven.
2. **Freeze before coordinator rollout.** Start under the already-approved world-wide **Hart script-routing maintenance epoch**; only claim migration authority after a full census of known routes and pending physical/Q4 intents. The freeze does not claim that Minecraft vanilla Hoppers or other add-ons also stop.
3. **Persist operation identity/epoch and prevent replay.** A memory lock may serialize callbacks in one tick, but persisted intent IDs and durable retired-ID evidence must be separate; restart with unknown intent/order remains HOLD. No booleans from a local JS caller may masquerade as durable evidence.
4. **Fence the actual final mutation.** A planned transaction must recheck controller/epoch/source/destination right before using the engine API, and abort on invalidation. Even complete same-tick observations do not prove that all related world records are saved atomically.
5. **Acknowledge external-writer limitation.** Vanilla containers accessible to players, vanilla Hoppers or other scripts cannot be certified physically exclusive based solely on script-side reservation. If no stable Bedrock API controls them, refuse new persistent MR/Q5/Bulk custody claims.
6. **HOLD means no retries, compensation or ledger clearing.** Pending/ambiguous intents survive operator review. Existing PG20 live MR route and owner-accepted normal restart tests remain as-is; the source-only model does not add a new live item recovery policy.

## Explicit no-go and test boundary

**PG-22 is not a testable game pack.** The owner need not install/pull files, repeat the PG20 clean-restart or emergency-kill tests, change experiments, or rebuild LAB. The protected **72-file 1.4.1 `addon/`** remains byte-identical. The latest **1.5.5-LAB-PG20** stays deployed in LAB; production stays off limits.

Before a true next LAB candidate is offered, we need independent proof of an **engine-enforceable physical single-writer boundary and a durable journal/inventory recovery rule**, or else keep high-capacity persistent MR, Q5 and Bulk paths HOLD. A completed PG22 model run must **never** be promoted to a gameplay gate.
