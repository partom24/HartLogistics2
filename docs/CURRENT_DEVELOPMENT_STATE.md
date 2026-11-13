# Current Development State — HartLogistics2

**2026-11-13 · Draft PR [#79](https://github.com/partom24/HartLogistics2/pull/79). Not accepted for release.**

## Development authority and source

The owner has directed uninterrupted integration and code hygiene until a meaningful product-level Bedrock acceptance boundary. The source of truth is the draft UCE branch `dev/uce-shared-ordinary-ledger-20261111`, not the historical PG27 prototype. PR #79 at the previous exact verified checkpoint `3922a97e5bb8f1b061e0270289e704f099972939` passed [13/13 GitHub Actions jobs](https://github.com/partom24/HartLogistics2/actions/runs/43422021084); **all later commits need their own CI classification**. No corresponding full-system Bedrock acceptance, Q4 archive migration or release authorization is established.

- **Immutable reference:** original 72-file 1.4.1 BP/RP at `addon/`; preserve hashes, UUIDs, IDs, saved links, metadata, filters, redstone and q2/q3/q4 properties. The baseline is not the new product source.
- **Executable HL2 candidate:** `candidates/uce/prepare_candidate.py` derives PG33 plus the current UCE runtime bridge, pipe router, unified physical/virtual custody and ordinary/native modules into ignored `build/uce-integrated`. No separate Q5 scheduler/queue is active under UCE. Full release builder consolidation remains incomplete.
- **Verified source features:** Receiver ordinary balance capacity 250,000; Bulk storage 200,000 each; internal and federated revisioned transfers; native nine-slot persistent carrier with conservative journal/restart HOLD; ordinary escrow; Dropper/Dispenser native ingress; multi-Receiver Transporter routing, Sorter Filter/Auto/Wildcard priority, bounded connected pipes, power-aware output, startup seal checks and empty-LAB activation. These are source-tested features, **not individually or collectively an accepted BDS product**.
- **Current packaging repair:** `tools/build_mcaddon.py` no longer silently packages original 1.4.1 when invoked without an explicit source; `--source baseline` and `--source hl2-uce --acknowledge-unapproved-source` are distinct. The unapproved archive carries its warning and refuses PG40/PG42 test markers in its runtime; tests were added. This change is pending exact-head CI and is not a release artifact.

## Optional performance diagnostics (source-integrated; runtime unverified)

The UCE candidate now supports an **operator-only, session-scoped, OFF-by-default**
performance panel through the existing Bedrock custom-command registry. It
does not add a scheduler, queue, persistence key or custody writer:

- `/hartlogistics:perf_on` enables source-side diagnostics for the current
  server process, resetting counters. `/hartlogistics:perf_off` disables them.
  `/hartlogistics:perf` shows the current state and metrics.
- The unified scheduler retains identical execution and safety fences with the
  toggle either way. While enabled, local JavaScript wall-time measurements flag
  UCE service ticks at **25 ms**, individual MR/ordinary/Bulk/federated calls at
  **12 ms**, and observed transfer gaps of at least **40 game ticks**. The
  optional ledger-shard sampler reads at most **one extra shard every 100 game
  ticks**, warning at **22,400 characters**, escalating at **26,000**, against
  the existing **28,000-character** shard limit.
- Counters and warnings remain in memory; rate-limited warnings use the server
  script log. No metadata-rich ItemStack payload, item name/lore, arbitrary
  inventory contents or raw dynamic-property JSON is copied into logs.
- Transfer gaps may be idle/unloaded or backpressured, rather than lag; wall time
  is not measured BDS TPS. Native item metadata and actual engine storage bytes
  cannot be inferred from shard string length. The panel is **not** a crash
  durability guarantee or substitute for product-scale profiling.
- This code is not deployed to the LAB or production. Its source-level checks
  and exact-head CI must pass before BDS validation; no release approval is
  implied by implementation.

## Transporter-fed legacy vertical Sorter columns (source integrated; BDS unverified)

The original 1.4.1 design has multiple stacked Sorters beneath one input Hopper,
and the integrated Transporter must feed that same vertical column, **not** a
single Sorter per pipe. The former UCE pipe reader registered only the top
Sorter and was a compatibility defect.

- Draft PR #79 now traverses each physically contiguous, registered Sorter
  column beneath a loaded Transporter. Every row remains subject to the
  original Filter > seeded Auto > Wildcard precedence, bottom-to-top
  deterministic tie-breaking, native destination availability and power
  gates. Route selection is revalidated before committing item custody.
- Unknown/unloaded or unregistered lower Sorters, duplicate registry ownership,
  and graphs beyond the existing **128 connected Transporter** budget HOLD
  conservatively; neither unknown destinations nor bank capacity are treated
  as verified. This is not a 128-Sorter limit. Transporter segments and
  Sorters in columns are counted separately.
- The registry is indexed once for each graph inspection, avoiding a repeated
  linear scan of all registered Sorters for every stacked row. The graph route
  witness encodes each verified **contiguous** column as its top coordinate
  and row count, instead of repeating every Sorter coordinate; modeled
  128-pipe/1,024-Sorter witnesses fit the existing 8,192-character federated
  transfer fence while still changing when a column's membership changes.
  Source mock regressions include eight-level columns, blocked/unavailable
  rows, and **128 pipes with 1,024 stacked Sorters**. These are modeled
  geometry and routing checks, **not** Bedrock throughput/TPS or full-system
  acceptance.
- **Still not done:** complete controller-to-controller cross-bank forwarding
  over Collector→Receiver links and product-scale BDS integration. Stacked
  Sorter discovery alone does not establish the requested multi-region
  cohesive logical storage system. No LAB install or world mutation occurred.

## 2026-11-13 source compatibility correction (not product acceptance)

The original requirements are not new planning tasks: the base storage whitelist,
Sorter-column geometry, Collector handoff, unloaded queue behavior and
multi-bank controller routing are in the protected 1.4.1 source and existing
architecture/evidence documents.

- **Runtime correction in PR #79:** `runtime_pipe_route.js` uses the exact
  1.4.1 `supportedStorage` whitelist and existing `uceDirectStorageOwnerBlock`
  proof for Sorter output. Single chests, trapped chests, barrels and all
  Shulker variants are eligible; only verified reciprocal 54-slot double-chest
  aliases are accepted, with one canonical native owner ID for both halves.
  Changed/unloaded companion blocks HOLD instead of reusing the old route.
- **Input correction:** a verified single 27-slot vanilla source may feed a
  loaded connected Transporter at any vertical position; the former
  `source.y >= receiver.y` restriction incorrectly rejected legitimate
  descending pipes. Double-chest source aliases still HOLD until unique
  cross-component source ownership is proven. Supported source classes now
  match the original vanilla storage whitelist (27-slot safe shapes only).
- **Missing-forwarding safety fence:** a matching Collector-facing Sorter is
  *not* silently skipped in favor of a later Wildcard or weaker local route.
  An unloaded or unverifiable higher-priority output also HOLDs. This
  prevents known misrouting; **it does not implement the missing
  Transporter→Sorter→Collector→next-bank transfer**.
- **Enforced regressions:** `tests/test_uce_pipe_route_mock.mjs` exercises
  exact original `supportedStorage`/`blockContainer` and live HL2
  `uceDirectStorageOwnerBlock`, including canonical double-chest identity,
  modes, output precedence, Collector hold, source types/elevation and
  two independent 48-pipe banks with **1,536 stacked Sorters total**.
  `tests/test_uce_candidate_build.py` now reruns the same behavioral
  regressions on the routing function bodies extracted from the *assembled*
  `main.js`. These are modeled loaded blocks, not a BDS observation.
- **Evidence boundary:** `a7991368` achieved a completed successful source
  workflow [43443267166](https://github.com/partom24/HartLogistics2/actions/runs/43443267166).
  Later commits change runtime/tests; their *own* exact-head CI must finish
  before describing them as PASS. New 1,536-Sorter geometry is not a 200k
  throughput, 1,400 production-world census, or interbank delivery result.

**OPEN:** logical interbank Filter/Auto/Bulk/Wildcard policy and custody,
safe MR forwarding, unloaded Receiver ingress, full nonempty Q4 migration,
incremental >128-pipe discovery, real performance and integrated BDS acceptance.
No owner world, LAB/PG35/PG42 archive, native item or production pack was touched.

## Owner's current LAB boundary

The authorized LAB host remains `C:\Servers\Thomas_MCBedrock - Copy (2)`; production `C:\Servers\Thomas_MCBedrock` is prohibited. Owner observations progressed beyond PG27 through PG35 and PG42. The active LAB world `HartUCECarrierLabPG42` has an installed temporary PG42 carrier probe and a persistent named/lore carrier witness. PG35 and earlier ThomasServer LevelDB remain preserved. **Do not run the older PG33-specific UCE installer against this LAB, clear PG42 world records, delete PG42 provenance, or replay unresolved custody.** Historical PG40/PG42 pack-reconstruction and rollback tools are retained because removing them before safe LAB cleanup would strand installed-state rollback. They must not be in the integrated runtime/release archive.

Earlier PG carrier, metadata-rich, custody and journal sessions are bounded evidence and should **not** be repeated as standalone acceptance exercises. The next owner BDS request must be an integrated product session with complete source readiness and an exact pinned, guarded LAB world/pack delivery and rollback plan.

## Critical release path

1. **Code hygiene and integration:** review all shipped runtime/build dependencies, remove genuinely unused debug/prototype paths without deleting historical rollback requirements; enforce one declared HL2 source and one coordinated routing/custody/recovery model; correct source defects with fault-injection tests and exact-head CI.
2. **Full-product LAB delivery:** establish a guarded installer/rollback from the actual PG42 environment into a *separate safe integrated-world target* without altering PG35 or PG42 evidence; require exact predecessor and unchanged other packs, before owner involvement.
3. **Integrated Bedrock acceptance:** ordinary and MR real item transfers, multiple Receivers, Bulk, Transporter, Sorter modes, Hopper/Dropper/Dispenser, inventory limits, redstone, blocked/full/unloaded graph, restart and diagnosed HOLD. The owner should run a single coherent product test instead of repeated PG probes.
4. **Archived 1.4.1 cold migration:** verify access to the original restorable ZIP and its Q4 census, implement repeatable non-destructive activation on a separate restored LAB copy. `unified_cold_q4_importer.mjs` has a source-tested engine for ordinary Q4 but **the compiled runtime only exposes read-only `migration_preview` and empty-world `activate_empty_lab`; no owner-safe nonempty-world activation is currently wired to real backup verification**. Opaque/metadata-rich legacy Q4 rows HOLD because hidden metadata cannot be reconstructed losslessly from unknown serialized definitions. This is **not** completed migration support; do not use empty-world activation on an archive.
5. **Release:** full compatibility acceptance, complete safety/performance evidence, clean temporary-instrumentation registry, reproducible HL2 archive with checksum/source pin, documented limits and explicit owner release authorization.

**Unchanged hard constraints:** no world deletion/reset to force empty activation; no unrecorded ownership replay; no synthesized native metadata; no automatic install/merge/production action; no assumption that source mocks prove Bedrock save atomicity. All source changes remain reviewable in draft PR #79.
