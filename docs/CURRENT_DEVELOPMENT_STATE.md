# Current Development State — HartLogistics2

## Owner acceptance override: existing world, natural builds (2026-11-14)

Use ONLY the existing restored production-derived LAB world for the next hands-on acceptance. The owner chooses component locations, numbers, placement/configuration order, connected networks and item quantities with no imposed test layout. Preserve accepted PG tests as evidence, and do not request micro-rigs. Previous fresh-world/freeform/PG42 source workflows are not the next delivery path. CURRENT P0: the earlier 128-pipe refusal is replaced at SOURCE scope by incremental discovery, but live mutation/unload and throughput proof are outstanding, as is authenticated nonempty 1.4.1 Q4/opaque-MR activation. Other shard/Receiver scaling and real Bedrock acceptance remain; long path witnesses are now compacted with SHA-256 in the source candidate. Complete scale-independent bounded routing and safe in-place populated-world migration before nominating the next test.


**2026-11-14 · Draft PR [#79](https://github.com/partom24/HartLogistics2/pull/79). Not accepted for release.**

## 2026-11-14/15 — Owner LAB scale witness and targeted UCE corrections

**Evidence boundary:** The owner installed pinned 1.5.16-DEV-UCE commit
`29449f0fd3c8fc6d0865bc68382a4810b1b861d3` into the newly generated
`HartLogistics15PerfFlat` world under the guarded LAB-only installer.
Rollback backup `lab-8e0a93fb458d` preserves the actual 1.4.1
performance-patched pack. BDS 1.26.60.6 restarted and logged
`ready; sorters=1387, collectors=0, receivers=0, registry=v2 5 shards / 101879 chars`.
The owner showed the complete 1,387-Sorter / 347-Hopper-column registration
and runtime performance panel after restart. The panel accumulated 1,591
bounded display slices / 25,456 Sorter checks, no slow slices, maximum
script-local slice duration 3 ms. This is **OWNER-OBSERVED RUNTIME** for
large registry persistence and bounded display maintenance, not end-to-end
routing or owner-world upgrade acceptance.

The owner also supplied BDS diagnostic screenshots and JS/TS CPU profiles plus
an `.mcstats` capture in the development conversation. Those raw profiles
are **not yet preserved in Git**; the investigated issue was heavy repeated
native empty-Hopper inventory and journal reads in the still-active legacy
Sorter scheduler. Source commit `c5e02cd5` changes generated 1.5 code to
use live native `emptySlotsCount` with safe per-slot fallback and gates
journal admission only on occupied input. Its generated-main tests passed
[14/14 CI jobs](https://github.com/partom24/HartLogistics2/actions/runs/43662948214).
The *corrected* candidate has **not** been deployed or reprofiled in BDS:
do not claim the measured native-call reduction is already proven.

Further source corrections `3d1359d6`–`66276f01` add complete cross-chunk
double-chest input alias witnesses to deferred Transporter graph certificates
and re-read the **live** reciprocal chest/Container owner before custody.
A setType-like chest collapse or unloaded far half must HOLD even if a cached
graph remains unexpired. Offline generated-main regressions passed at
`66276f01`; native Bedrock mutation/unload acceptance is still outstanding.

**The next full gameplay acceptance remains the original restored
production-derived LAB world with unrestricted player construction, not
another flat-world rig.** The flat world is retained solely as a scoped
performance diagnostic; its shared 1.5 packs MUST be rolled back to the
performance-patched 1.4.1 backup before selecting the restored world.
No existing-world Q4 cutover occurred. Nonempty Q4, opaque/MR migration,
scale-independent Receiver/shard growth, controller/Bulk arbitration and
cold in-place upgrade/rollback remain P0 blockers. No release, merge or
production action was approved. See HL-E-083–085 below.

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
  descending pipes. Verified reciprocal 54-slot double-chest sources are now
  canonicalized to ONE loaded native inventory owner across both aliases;
  uncertain sizes, unloaded halves, foreign-network contacts, and any input
  also selected as a Sorter output HOLD. Approved 27-slot single inventory
  sources remain unchanged. This is source-tested, NOT BDS-certified.
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

- **Cross-writer route-fence closure (2026-11-13):** the original pipe
  destination guard alone was insufficient: an unresolved linked-bank route
  could still be skipped by a `receiver_to_bulk` planner. Runtime
  `ucePipeHasUnresolvedForwarding` now reads the original Filter/Auto/
  Wildcard topology to identify eligible Collector, unloaded, and
  uncertified outputs. Local Bulk spills HOLD at planning **and** in the
  existing single-shard writer's live route proof; cross-shard receiver→Bulk
  spills HOLD at planning **and** `uceFederatedRouteVerified` before each
  side of its journaled transfer. A known full storage output may still
  overflow normally; reverse verified Filter refill remains permissible.
  `tests/test_uce_federated_runtime_route.mjs` and the source/generated
  pipe tests enforce these distinctions. This is **safe deferral**, not
  completed cross-bank forwarding, BDS acceptance, or throughput proof.

**OPEN:** logical interbank Filter/Auto/Bulk/Wildcard policy and custody,
safe MR forwarding, unloaded Receiver ingress, full nonempty Q4 migration,
incremental >128-pipe discovery, real performance and integrated BDS acceptance.
No owner world, LAB/PG35/PG42 archive, native item or production pack was touched.

## 2026-11-13 linked-bank ordinary/MR forwarding (source integrated, no BDS acceptance)

- **Ordinary:** `unified_federated_service.mjs` now supports a proved
  Receiver→Receiver count boundary in addition to prior Receiver↔Bulk. A
  new `IB1|` route-witness kind fence prevents these transfers from being
  confused with a Bulk transfer. The existing prepared/debit/credit/receipt
  global journal, epoch/revision fence, and no-auto-replay HOLD are reused.
  `runtime_bridge.js::uceOrdinaryServiceTick` finds a physically verified
  Sorter→Collector link through one or more connected banks to a live final
  Filter, then transfers up to 64 counts **directly from source to final
  Receiver sealed shards**. Every intermediate bank is read-only; no
  additional intermediate queue, writer or item reconstruction is created.
- **Route:** `uceSelectInterbankFilteredRoute` walks the registered directed
  bank chain, using original Sorter modes/priority, Collector linkage,
  redstone, loaded Receiver evidence and a physically accepting filtered
  destination. Deterministic witness includes the chosen path and output
  owner and is re-evaluated by the shard writer before each side. Cycles,
  unavailable first links and unknown stronger destinations HOLD. A mock
  physical fixture traverses **36 banks / 1,440 stacked Sorters**; this
  does not measure actual Bedrock TPS or the owner's existing world census.
- **MR:** `uceTryInterbankMrHandoff` uses the SAME path with ordinary merge
  disabled and the SAME existing native ItemStack custody writer to transfer
  the original native payload from the source Receiver carrier to the
  final bank Receiver carrier. Both original carrier ticket records are
  staged and independently reconciled before native ACK; interruption
  preserves the global native intent and never clones/rebuilds opaque data.
  Initial empty native host registration is restricted to a real item and
  presently verified link; preexisting RESERVED/ambiguous host still HOLDS.
- **Source test evidence:** real-shard Receiver conservation/interrupt
  `tests/test_uce_federated_real_shards.mjs`; exact route mocks and 1,440
  Sorters `tests/test_uce_pipe_route_mock.mjs`; real production scheduler +
  shards `tests/test_uce_interbank_integrated_runtime.mjs`; native MR
  ticket-order/error mocks and **real registry+native port** tests in
  `tests/test_uce_interbank_mr_mock.mjs` and
  `tests/test_uce_interbank_mr_real_port.mjs`.
  The generated Bedrock `main.js` test executes these functions as well.
  The *earlier* interbank ordinary-only `1b1b324c` had successful
  13-job Actions [run 43500772651](https://github.com/partom24/HartLogistics2/actions/runs/43500772651).
  **Newer MR commits have separate CI; no result is inferred.**
- **Open:** directed-chain-only destination selection (no alternative path
  search, cross-controller Filter/Bulk advertisements, remote Bulk fallback,
  safely bounded graph scans above 128 physical Transporter segments),
  unloaded Receiver and Collector-side MR waiting, full Q4 migration, true
  Bedrock native move/save verification and 200k-item sustained throughput.
  No production/LAB/world/backup mutation or owner BDS request.

## 2026-11-13 — Existing PG08 link UX and double-chest source integration (source only)

- The existing Bedrock 2.2.0 `@minecraft/server-ui` dependency and
  PG08-proven Action/MessageForm concepts now drive actual UCE link/relink,
  Receiver confirmation, Unlink, details and cancellation via
  `candidates/uce/runtime_link_menu.js`. Both original player interaction
  entry points are wired in `prepare_candidate.py`, without duplicate UI
  imports. The *sole* `unified_link_registry.mjs` writer now accepts a
  revisioned null-link receipt to unlink; it first independently verifies
  the native Collector waiting carrier is physically empty with matching
  tickets. Stale forms, expired selection, disconnected player and uncertain
  custody refuse mutation. Source and generated Bedrock-main behavioral
  tests cover these flows. **No new Q4 queue or link writer**.
- **Transporter double-chest INPUT parity:** `runtime_pipe_route.js` now
  reuses the existing reciprocal 54-slot native chest proof, canonicalizes
  either physical chest half to one input owner, deduplicates two pipe
  attachments, and checks *both* halves for foreign pipe connections.
  The same canonical owner ID prevents a Sorter output into the opposite
  half of its OWN connected input. Unloaded/missing half, wrong size, or
  alias across unconnected pipe graphs HOLD. Physical Bedrock alias
  behavior and throughput are not certified by mock tests.
- **Unloaded Collector buffering:** the existing unified scheduler and one
  native carrier / ordinary boundary are being used to stage MR and ordinary
  Collector→sealed Receiver custody while a Receiver block is unloaded.
  The newly added real-source mocks / generated integration tests are
  **source-only**. No hard-crash flush ordering, accepted unload/reload BDS
  gameplay or production rollout is claimed.
- **CI:** PR #79 now groups superseded pull-request workflows for
  cancellation to favor the newest exact-head validation, preserving
  main/manual workflow evidence. The present head must be checked
  independently; older successful jobs are not acceptance of these changes.

Remaining release blockers include global controller/alternate-bank Bulk
arbitration, more-than-128-segment bounded topology discovery, archived
nonempty Q4 cutover/opaque metadata migration, real 200,000-item throughput
and integrated BDS product acceptance. No LAB or production install or
archive/world mutation occurred.

## Owner's current LAB boundary

The authorized LAB host remains C:\\Servers\\Thomas_MCBedrock - Copy (2); production C:\\Servers\\Thomas_MCBedrock is prohibited. The owner-accepted historical PG35/PG42 evidence includes a persistent named/lore PG42 carrier, and must not be repeated or deleted. The owner subsequently reported restoring a production-derived 1.4.1 world onto the LAB on November 13, with BDS version 1.26.60.6. Therefore the prior PG42 world/pack installation cannot be assumed to be active. Any future delivery must verify the exact stopped-LAB predecessor before changing anything. Never run the PG42-only installer against a restored 1.4.1 world, mutate the original restored world, erase historical custody records or replay uncertain journals. Historical rollback tools remain retained, but cannot ship in the HL2 product.

Earlier PG carrier, metadata-rich, custody and journal sessions are bounded evidence and should **not** be repeated as standalone acceptance exercises. The next owner BDS request must be an integrated product session with complete source readiness and an exact pinned, guarded LAB world/pack delivery and rollback plan.

## Critical release path

1. **Code hygiene and integration:** review all shipped runtime/build dependencies, remove genuinely unused debug/prototype paths without deleting historical rollback requirements; enforce one declared HL2 source and one coordinated routing/custody/recovery model; correct source defects with fault-injection tests and exact-head CI.
2. **Existing-world in-place delivery:** safely migrate the actual restored LAB 1.4.1 world without requiring an empty world or altering player-created layout; verify the stopped-LAB predecessor, backup, linked devices, all existing Q4 items and rollback before any authorized install.
3. **Unrestricted player-built Bedrock acceptance:** owner plays normally in that existing restored LAB, building and changing any supported network at chosen positions, counts and order. Verify correct ordinary/MR custody, Bulk, multi-bank routing, redstone and restart without prescribing a test setup.
4. **Populated 1.4.1 cold migration:** preserve existing restored LAB Q4, identities, world blocks and journal evidence, with safe transition and rollback; never substitute fresh-world activation or require the player to empty storage.
5. **Release:** full compatibility acceptance, complete safety/performance evidence, clean temporary-instrumentation registry, reproducible HL2 archive with checksum/source pin, documented limits and explicit owner release authorization.

**Unchanged hard constraints:** no world deletion/reset to force empty activation; no unrecorded ownership replay; no synthesized native metadata; no automatic install/merge/production action; no assumption that source mocks prove Bedrock save atomicity. All source changes remain reviewable in draft PR #79.


## 2026-11-14 — Generated 1.5 hot-path compatibility and restored-world delivery

The active PR #79 candidate is still SOURCE-only, not released. The generated 1.5 legacy processColumn now checks live Hopper/Transporter occupancy before inspecting downstream Sorters or journaled Hopper compaction, reads Container.size once, and checks fresh inventory each eligible tick. The added compiled-main regression covers empty, newly occupied, powered and bypass columns. Original addon source is unchanged. The accepted 1.4.1 CPU profile is diagnostic evidence, not measured 1.5 Bedrock performance.

The original PG42-only full-product LAB installer is not appropriate for the owner's subsequently restored 1.4.1 LAB without verifying the actual predecessor. Existing freeform_lab.py instead now supports only an exact immutable original 1.4.1 pack pair or an authenticated 1.5.16 integrated pair. Staging seals the predecessor file hashes before selecting a genuinely new LAB world; installation requires unchanged hashes. Restore checks a saved original pack rollback tag, restores the exact previous shared pack bytes and new-world-only registrations using the existing two-pack transaction, and only then reselects the old world. Synthetic tests include the actual frozen original pack copy, round-trip restoration, previous-world byte protection, source drift, mixed versions and foreign registration refusal. This work did not inspect or change any owner server or existing world.

Accepted PG carrier, ordinary Q4, metadata, journal and menu findings are retained within their historical scope. Source-level checks are not native BDS integration, crash atomicity or release approval. Nonempty legacy Q4 activation and metadata-rich migration remain HOLD; existing original world data cannot be cut over using empty-world activation. The next owner gameplay boundary is one complete integrated HL2 product run rather than repeated subsystem probes.

**Additional player-scale blockers (source audit):** unified_cold_q4_importer.mjs currently checks up to 512 Receivers and 512 shards and preallocates 48 new-Receiver reserves; runtime_bridge.js checks seal shard count against 512; runtime_pipe_route.js and runtime_bridge.js reject route witness strings over 8,192 characters. These may be legitimate defensive data-size checks individually, but in aggregate cannot silently prevent otherwise valid player growth. Design scalable sealed authority, route witnesses and bounded traversal before unrestricted release, retaining hard limits actually imposed by Bedrock APIs and preserving safe HOLD for genuinely unrepresentable state.

## 2026-11-14 — Source-only unrestricted graph work and existing-world fences

**Classification: SOURCE IMPLEMENTED / CI pending at new documentation head. NOT BDS accepted.** PR #79 now includes:

- `runtime_pipe_route.js` replaces the permanent 128-loaded-pipe refusal with an initial 128-visit synchronous budget and a read-only `system.runJob` generator for larger complete graphs. Incomplete or contradictory discovery never authorizes custody. Completed topology is cached briefly with a monotonic mutation epoch, registry/dirty check and expiry, and native destinations are still reselected. `prepare_candidate.py` registers player place/break, explosion, piston and relevant redstone invalidation; it declines deferred admission if required mutation signals are unavailable. Direct external script block mutations and chunk-unload behavior still require engineering/BDS proof before use in a release.
- Network fingerprints exceeding 4,096 source characters are represented by SHA-256 of all sorted physical membership arrays (not by a truncated location list), allowing compact shard/journal route witnesses. Unit regressions exercise 450 and 900+ connected pipes, stale-job invalidation, distant topology edits, and Node-verified SHA-256 golden vectors. A separate 8,192-character interbank *path* witness ceiling and fixed 512 Receiver/shard staging remain open.
- `unified_migration_preflight.mjs` now reads and validates the original generation-switched 1.4.1 Sorter registry (including >9 shards, original saved count/characters, duplicate coordinates and a stable second read). Missing or corrupt active shards HOLD without falling back to stale v1 data. Automated cases simulate a 1,400-Sorter registry plus drift/tampering.
- `unified_new_world_activation.mjs` now refuses even a Sorter-only historical world with no linked Receivers/Collectors, preventing misuse of empty-world activation as a migration shortcut. Real existing LAB gameplay must instead use an authenticated in-place populated-world upgrade.

**Still not delivered:** authenticated in-place nonempty Q4 activation with opaque/MR fidelity, validated real-world dynamic network construction in any order, complete multi-controller Bulk arbitration, arbitrary Receiver/shard growth, hard-crash native custody proof and actual 200k-queue Bedrock throughput. Source CI does not imply permission to touch the LAB; production and owner backups remain unchanged.

## 2026-11-14 — Long interbank receipts without fixed 8192-character path cutoff

**Source scope only:** `runtime_pipe_route.js::ucePipeCompactInterbankWitness` now preserves existing short `IB1|`/`IBB1|` proofs exactly, but represents over-limit Filter, seeded Auto and remote Bulk route paths as prefixed SHA-256 of their full canonical proof string. Includes final output, ordered Collector/Receiver segments and Auto-vs-Filter suffix in the preimage; journal verification still reconstructs the route before each shard boundary and compares the full authenticated digest. This removes a hidden player topology-size ceiling without truncating route membership or disabling custody validation.

`tests/test_uce_pipe_route_mock.mjs` now exercises a physical 120-bank chain, including an over-8192-character witness, deterministic compact receipt, and a relink that invalidates it. Earlier 90-bank fixture passed routing but was too short to trigger compaction; the new test count deliberately spans the threshold. Node golden digests verify the SHA implementation. Full compiled-main compatibility/early-assembled CI passed at source head `067874893831cf7605512adb2e0a60669fa66af4`; the slower Windows preflight remained in progress at the last check, so **do not infer full exact-head green**. No LAB or production file was read or changed.

**Still open:** native Bedrock topologies and TPS, chunk-unload and out-of-band block mutation invalidation, finite 512 shard/Receiver seal and 48 new-Receiver reserve, multiple-controller allocation, nonempty Q4 native/opaque conversion with backup and in-place cutover, and final freeform owner gameplay on existing restored LAB. Do not request another fixed rig.
