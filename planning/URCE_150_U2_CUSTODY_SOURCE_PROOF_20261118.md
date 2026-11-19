# URCE U2 source-only custody intent / crash safety — incremental proof

**Scope:** owner-authorized source-only safety implementation, not a real writer or runtime custody ACK.

**File:** [pure custody protocol model](src/urce_u2_custody_protocol.mjs), [11 Node tests](tests/urce_u2_custody_protocol.test.mjs).

The design deliberately distinguishes:

1. An **eligible route** — read-only candidate, not physical custody authority.
2. A **verified live admission/intent** — still only PLAN_ONLY; no physical writer permission.
3. A **durable journal/physical mutation** — belongs to a separately reviewed writer, not this model.
4. An **ambiguous crash** — HOLD with no auto-replay, release or speculative reconciliation.

Actual 1.4.2 physical and Q4 writers remain authoritative for their existing lanes. The model refuses unverified/unloaded destinations, wrong quantities, external authority, pending journals and native MR in ordinary counted Bulk. It keeps an unmodified native MR stack and does not create a serializable duplicate.

**Batch calculations** for a 64-item stack show a *hypothetical* 4 / 2 / 1 transactions under 16 / 32 / 64 caps, with fixed journal/native write counts; no actual BDS performance or native 64-item slot admission is asserted.

**Not solved by this source model:** durable receipt across multiple BDS world/native storage objects, access control against player/Hopper/foreign writers, exact native carrier lifecycle, 1.4.1→1.5 Q4 migration, dynamic-property partition ownership, acceptance and restart on the owner's copied world. Before any new writer, the code must call a proven physical admission + recovery boundary. Prior PG20/PG42 native primitive existence is accepted and must not be retested simply to rediscover feasibility.

**Deliberate limitation:** a model which always HOLDS any interrupted operation proves absence of *speculative* retries, not progress or autonomous crash reconciliation. A playable URCE candidate will need a demonstrated normal path plus explicit recoverable/held fault states.
