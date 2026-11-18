# URCE U1 implementation increment 1 — source-only graph and policy planner

**Date:** 2026-11-18. **Authorization:** owner's “ok, lets get to it then” after explicit agreement to **U1 source-only code**. **Branch:** \`planning/urce-150-20261117\`. **Scope:** read-only JavaScript source and Node tests under \`planning/\` only. **No gameplay code or world mutation.**

## Source delivered

- [Pure graph/candidate module](src/urce_u1_route_model.mjs): builds an explicit directed source-reachability graph from supplied verifiable nodes and edges, distinguishes unverified/unloaded from absent, models managed link rejection/unknown reverse paths, and returns policy-ordered **candidates requiring live admission**, never an authorized item transfer.
- [Node tests](tests/urce_u1_route_model.test.mjs): source-specific routing, cycle rejection, branch/merge, Filter/Auto precedence, bottom-to-top ordering, cost across columns, claimed vs unclaimed ordinary fallback, terminal optional, unknown HOLD, unreachable exclusion, MR no ordinary Bulk, variable fixtures and 1,400 Sorter-shaped graph.
- **Transporters are topology-only in this model**. No per-pipe native item movement or queue/journal. Native Hoppers and Collector–Receiver links appear as typed directed links but *Bedrock physical verification is outside U1*.

## Evidence boundary

Pure caller-provided \`claim\`, \`verified\`, \`estimatedCost\` and \`applicableBulkState\` are **not** engine-derived truth; no code may use them as final native admission or custody authority. The module deliberately has no Bedrock import or writer. A Filter/Auto claim and live native chest admission are independent: later candidates may be considered only after earlier verified live admission fails. No live Auto-seed proof, exact item-type filter calculation, per-stack quantities or Q4 journal is supplied here.

**Prior 1.4.2 U1 evidence preserved:** naive lazy Sorter local rewrite is a NO-GO; within-column P4e already avoids Filter mismatches; no performance improvement for large chest scans is claimed from a graph-only module. This module adds **source-specific multi-bank reachability selection**, not another implementation of a failed column micro-optimization.

**Review before runtime integration:** full U0 callback/writer census, exact route snapshot observation/invalidation, cycle semantics for Hopper/external connections, live priority/Auto-seed and cost measurement, complete U2 native/Q4 custody agreement, and source-only original 1.4.2 behavioral differential with journal traces. PG20/PG42 native primitive feasibility is already accepted and must not be repeated.

**Status:** SOURCE-ONLY CODE, not installed, not integration or BDS PASS; runtime integration remains a separate owner authorization.
