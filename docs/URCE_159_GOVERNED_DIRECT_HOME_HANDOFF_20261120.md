# URCE 1.5.9 source handoff — first governed native home / single custody lane

**Date:** 2026-11-20. **Working branch:** `dev/urce-159-governed-home-20261120`.  
**Read first:** [development entrypoint](../DEVELOPMENT_START_HERE.md), [continuous development](../AGENTS.md), [historical canonical evidence](CANONICAL_EVIDENCE_AND_TOOLING.md), [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md), and the [pinned owner product requirements](https://github.com/partom24/HartLogistics2/blob/6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2/planning/URCE_150_OWNER_PRODUCT_CONTRACT_20261118.md).

**Operational status:** DEVELOPMENT SOURCE; **not installed, not BDS LAB accepted, not full URCE, not production/release ready.** Confirm live branch HEAD, CI, both pack manifests and actual LAB predecessor before using an operator. Previous [1.5.8 source-only candidate](https://github.com/partom24/HartLogistics2/blob/dev/urce-150-runtime-20261118/docs/URCE_158_SOURCE_CANDIDATE_AND_PLAYABLE_DELIVERY_GATES_20261120.md) passed packaging without enabling governed gameplay; do not use it as this milestone's replacement.

## Source implementation that advances real gameplay

Version **1.5.9-dev** introduces a narrowly defined **physically verified Receiver → downward Hopper → complete vertical Sorter column → native chest/barrel** governed route. It is intentionally NOT an arbitrary Transporter/multi-bank graph or generic last-bank outlet. The Bedrock native reader re-verifies the actual Receiver, output Hopper direction/lock, exact registered and loaded Sorter blocks, column continuity, output storage, side native/managed/foreign inventory paths and output storage Hopper extraction before accepting a source-local route. Unknown/unloaded/ambiguous topology HOLDs. The existing live graph/managed loop guard remains primary; an observed source-local native Sorter boundary can be resolved only when the HOLD names that exact Receiver. Incomplete general network/source-wide claim coverage never becomes a universal NO CLAIM declaration.

For the next Q4 head item, the source checks exact Filter and live native Auto claims, native destination admission including compatible partial stacks, native Sorter power and Wildcard only when truly unclaimed. A positive *home observation* is still not a custody receipt. Claimed/full with Bulk authority unknown, native MR without proven carrier, and unknown boundary continue HOLD. There is no guessed remote Bulk, terminal, fallback or rewritten item count.

**Crucially, cargo writes remain in existing functions only:** `enqueueFromSource` Q4 ingestion, `dequeueToReceiver` Q4 journal/debit/native Hopper credit and `safeMovePartial` physical Sorter journal/native Hopper debit/storage credit. The new `urce_159_direct_sorter_home.js` only reads and returns a non-authorizing proposal; it never persists or mutates inventory. Unlinked legacy Q4 Receivers retain original 1.4.2 behavior. Other governed paths remain fail-closed until their destination and single-authority custody can be proved.

This is the first **source-executed full-runtime governed cargo delivery**, rather than a read-only graph/planner alone. It is **not proof of Bedrock actual player-built correctness**, generic Hopper-minecart/third-party extraction absence, arbitrary network routes, or all item classes. Do not release the owner's powered ~16,982-item held Receiver or reset any LAB/production world.

## Actual copied LAB predecessor question and guarded solution

The latest owner BDS screenshots prove **1.5.7-specific diagnostics actually ran**, including a solid cobbled-deepslate Hopper terminator, but **do not prove exactly installed BP/RP file hashes or the 1.5.7 installer backup tag**. The prior 1.5.8 updater wrongly treated exact installed predecessor as resolved by a source CI simulation. This handoff explicitly distinguishes these.

The new `scripts/hartlogistics_159_lab_updater.py` recognizes only **two full immutable pack source predecessors**, each with exact full-tree byte hashes:

- `1.5.7`: `8bb696129a668699e0867aa1e6786a8716d1ef3a`.
- `1.5.8`: `b81e32ed23ce18283e6edcd3a8809d6fcf6bf71a`.

The **read-only stopped copied-LAB CheckLab** checks actual installed BP and RP source hashes, versions, UUIDs and active world registrations; mixed/unknown/tampered state **REFUSED**. `Install -Apply` is separate owner-controlled action after green exact-HEAD CI and a passing read-only stopped-LAB check. It never contacts production or automatically installs on Git pull. The original native world Q4 data is unchanged; synthetic tests verify both distinct exact predecessor upgrade/rollback and byte-preserving registry/world files. Older `Start-HartLogistics-15xLab.ps1` operators remain preserved. The user-facing stable launcher dispatches `1.5.9` to the tracked `distribution/Start-HartLogistics-159Lab.ps1` on this branch.

**Actual installed LAB predecessor remains UNKNOWN until the user's local read-only CheckLab is executed.** No claim of source-only code actually opening the real LAB or native-world fingerprint.

## Mandatory repeated source tests and performance records

The [1.5.9 workflow](https://github.com/partom24/HartLogistics2/actions/workflows/urce-159-governed-source.yml) runs Linux + Windows synthetic operator gates, source syntax, protected U0 zero-new-writer fence, owner U1 route/claim closure, link/cycle checks, Q4/U2/journal/custody/recovery, full shipped `main.js` with Bedrock native-call instrumentation, resource validation and deterministic BP/RP packaging. **Check the exact current HEAD's workflow conclusion; this document is not a certificate.**

The fixed 101-column/five-item workload remains **101 columns / 505 Sorters, 100 one-item arrivals, 1,600 ticks, 48,000 proven nonmatching transit observations, 100 Filter captures, exactly 20 in each of five destination chests, zero candidate ordering differences**. Re-execute the exact fixture after each gameplay change rather than quoting a prior stage. The 1,389,065 selected native-stub subtotal is *carried forward*, not remeasured or a BDS TPS result.

The new **FULL-NATIVE-07** source-executed shipped runtime test proves four ordinary items move: native input Hopper → original Q4 enqueue journal → original Receiver Q4 dequeue journal → original native Receiver-output Hopper → original physical Sorter journal → native Filter chest. Source, queue and output account for the same **four items**, no new writer. FULL-NATIVE-03 verifies a managed Receiver **with no home retains Q4 custody**, and WIRE-10 validates the original *unlinked* legacy Q4 drain still works. Fail-closed native side path, unknown, redstone, foreign inventory, false home, full claimed chest/Bulk unknown, Auto seed, MR and extractor scenarios are separate source-executed tests. Instrumented source call counts are **not** native BDS latency or owner playability evidence.

## Highest-value continuation after this real integration

1. Confirm an **actual native BDS player-first direct-lane exercise on an owner-approved disposable LAB**, using any valid player-created location, ordinary item ID, native Filter/Auto and chest. Observe correctly delivered quantities, no Q4 migration/replays, redstone HOLD, restart and external Hopper/minecart extraction. **The owner, not source CI, chooses when to install/apply.**
2. Generalize the exact source-closed claimant census to real source-reachable columns, Hopper and Transporter branches, rather than treating a complete Collector/Receiver graph as full item-claim evidence. Reuse bounded same-tick graph observations; do not double-scan global blocks or invent cache authority.
3. Expand only after proven single-authority precommit/restart to general managed paths and Bulk ordinary balancing, native PG20/PG42 MR carrier integration and paginated HELD/STORED retrieval, preserving Q2/Q3/Q4 format, all ownership journals and productive transaction-cost goals.
4. Repeat BDS startup/stabilized/active-routing native server diagnostics and VS profiles plus player placement/eating tests, alongside the 101-column fixed control. Performance issue #87 and generic optional-Transporter loop safety #86 remain unaccepted; do not infer BDS TPS from source mock counters.

**Standing boundary:** never modify production world, server or player state as part of source work. Do not reinterpret source/test/packaging PASS as completed owner product scope.
