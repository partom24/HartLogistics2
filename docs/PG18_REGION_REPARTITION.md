# PG-18 — Offline region-repartition and controller-candidate safety

**2026-11-07 — OFFLINE CANDIDATE ONLY.** This proposal strengthens the previously tested six-neighbor graph and old controller-claim HOLD model. It is **not** an approved controller election algorithm, runtime lease, migration, item-transfer permission, installed pack, or evidence of physical custody. Original 1.4.1 gameplay and every PG-08/13/14/15 derived LAB candidate are unchanged.

## Goal and accepted constraints

The owner accepted persistent network identities, deterministic controller ownership and conservative handling of splits, merges, unloads and stale capacity. A concrete election algorithm and transaction safety remain engineering questions (HL-Q-002/003). Current [offline route authority](../tests/test_transport_authority_model.py) refuses claims from incomplete graphs, but does not formulate a deterministic **future** region map. The new [pure Node model](../candidates/transport/region_repartition_proposal.mjs) and its [adversarial tests](../tests/test_transport_repartition_proposal.mjs) cover that separate planning need.

**Provisional policy, NOT an owner-approved runtime default:** If a complete same-dimension graph is independently proven, propose connected six-face components, rank each component's *live, unique* Bulk controller identifiers lexically, and assign suggested region identifiers using the next epoch. The ranking is independent of input order or first placement. No rank confers item or journal authority.

## Candidate protocol: the missing commit barrier matters

1. **Freeze:** Assert a globally durable Hart-script routing freeze at the *old* epoch. This is a requirement of the model, **not** proof that vanilla Hoppers, players or other add-ons are stopped. A network-only freeze is insufficient.
2. **Scan:** Require the complete old predecessor-controller inventory and every expected graph node, all currently loaded, with no unknown boundary. Unloaded/missing chunks are **UNKNOWN**, not evidence of a removed bridge, newly freed capacity or split network.
3. **Drain/HOLD:** Require a complete global cross-lane writer/journal scan and no pending operations. Any unsettled Q4, native, Q5 or Bulk leg remains HOLD under the independent [PG-17 rule](PG17_REFERENCE_CONCEPTS.md).
4. **Fence old owners:** Every previously claimed controller must be explicitly reported fenced for the old epoch; duplicate, stale or unknown acknowledgments refuse. These **caller-supplied assertions are not cryptographic or Bedrock-authenticated fencing**.
5. **Propose, do not promote:** Derive complete six-neighbor components and candidate controllers. Every resulting object is `PLAN_ONLY`, with `canAssumeControllerAuthority=false`, `canCommitEpoch=false` and **all** transfer/debit/credit/retry/settle/reservation/journal-clear/production permissions false.
6. **Missing future gate — actual epoch handoff:** No engine-enforced durable compare-and-swap, authenticated writer fencing, item custody, crash-atomic inventory/journal commit or proof of global non-Hart writer exclusion has been identified. Therefore **no route or Bulk capacity operation is admitted**, even when this model returns a complete proposed map. An eventual adapter must prove and test an actual commit barrier before any routing/merging/unfreezing.

The resulting region identifiers are **suggested**, not persisted or authoritative. They may change after a re-partition and are never themselves physical inventory IDs or licenses to release items. A region lacking any live eligible controller causes the entire proposal to HOLD; no automatic rescue/failover is inferred.

## Scenario verdicts

| Situation | Model result | Scope |
| --- | --- | --- |
| Complete loaded known graph, synthetic global freeze, empty pending ledger, fully fenced predecessor inventory | `PLAN_ONLY` | Candidate region IDs and deterministic ranked controllers; no runtime authority |
| True topology split *independently declared and fully loaded* with a candidate in each resulting component | `PLAN_ONLY` | Two proposed component owners; **not** two simultaneously active writers |
| Bridge chunk unloaded, unknown neighbor, missing node or partial region graph | `HOLD` | Never treat missing as split/full/free capacity |
| Two old owner claims but only one acknowledged fence, stale epoch, overlapping region claims | `HOLD` | Never silently take over or infer failed controller is fenced |
| Pending/unreadable in-flight operation, missing global writer scan or network-only pause | `HOLD` | Preserve Q4/Q5 and physical handoff evidence; no retry |
| Graph region without a live controller; duplicated ID, foreign network or dimension, contested same node | `HOLD` | No silent election or cross-world borrowing |

All observations here are synthetic inputs, not verified from a running BDS process. The code has no Minecraft imports, no I/O, and cannot write files, inventories, properties or packs. It never calls or changes original 1.4.1 Q4 routing or real Bulk/Transporter block APIs.

## Distinct blockers and next decisions

- **Controller authority:** A stable-world API-level or engine-enforced *durable fencing and atomic claim transition* must be established, including old-owner retirement and unknown unloaded chunks. A second controller cannot merely time out its predecessor and claim item rights.
- **Global writer arbitration:** PG-17's one-at-a-time Hart-lane safety idea remains conceptual; this proposal only ranks per-region candidates. It never permits concurrent per-region item writers or bypasses existing Sorter priority/Hopper rules.
- **Native MR:** PG-03 on installed nonexperimental BDS 1.26.63.1 is still NO-GO; a candidate entity inventory was reviewed source-only (HL-E-044), not accepted. Keep the original 1.4.1 native direct-only MR capability intact.
- **Physical Bulk:** The PG-16 exclusive-custody and crash-atomicity blockers remain. A 200,000-count virtual ledger is not physical item custody. Unknown bank capacity cannot trigger wildcard routing.
- **Migration:** Durable world-wide maintenance freeze, unloaded-on-load migration, rollback and safe resume still need independent design and eventual scoped owner LAB acceptance. Vanilla Hoppers can move during a Hart-script freeze.

**No owner actions or repeated PG-08/13/14/15 tests are justified by PG-18.** The test suite is run entirely by CI. A physical rig will be specified in full and separately authorized only after a credible supported runtime proof primitive exists.

## Evidence classification

**HL-E-045: OFFLINE PURE JS MODEL + 49 NODE TEST CASES PASS** (structural GitHub Actions step on [run 42429436690](https://github.com/partom24/HartLogistics2/actions/runs/42429436690)). This evidence can validate the source candidate's deterministic behavior and refusal cases. It cannot validate the completeness of a real world scan, persistence or exclusion of foreign writers; the inputs are modeled claims only.
