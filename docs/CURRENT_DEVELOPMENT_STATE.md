# Current Development State — HartLogistics2

**2026-11-13 · Draft PR [#79](https://github.com/partom24/HartLogistics2/pull/79). Not accepted for release.**

## Development authority and source

The owner has directed uninterrupted integration and code hygiene until a meaningful product-level Bedrock acceptance boundary. The source of truth is the draft UCE branch `dev/uce-shared-ordinary-ledger-20261111`, not the historical PG27 prototype. PR #79 at the previous exact verified checkpoint `3922a97e5bb8f1b061e0270289e704f099972939` passed [13/13 GitHub Actions jobs](https://github.com/partom24/HartLogistics2/actions/runs/43422021084); **all later commits need their own CI classification**. No corresponding full-system Bedrock acceptance, Q4 archive migration or release authorization is established.

- **Immutable reference:** original 72-file 1.4.1 BP/RP at `addon/`; preserve hashes, UUIDs, IDs, saved links, metadata, filters, redstone and q2/q3/q4 properties. The baseline is not the new product source.
- **Executable HL2 candidate:** `candidates/uce/prepare_candidate.py` derives PG33 plus the current UCE runtime bridge, pipe router, unified physical/virtual custody and ordinary/native modules into ignored `build/uce-integrated`. No separate Q5 scheduler/queue is active under UCE. Full release builder consolidation remains incomplete.
- **Verified source features:** Receiver ordinary balance capacity 250,000; Bulk storage 200,000 each; internal and federated revisioned transfers; native nine-slot persistent carrier with conservative journal/restart HOLD; ordinary escrow; Dropper/Dispenser native ingress; multi-Receiver Transporter routing, Sorter Filter/Auto/Wildcard priority, bounded connected pipes, power-aware output, startup seal checks and empty-LAB activation. These are source-tested features, **not individually or collectively an accepted BDS product**.
- **Current packaging repair:** `tools/build_mcaddon.py` no longer silently packages original 1.4.1 when invoked without an explicit source; `--source baseline` and `--source hl2-uce --acknowledge-unapproved-source` are distinct. The unapproved archive carries its warning and refuses PG40/PG42 test markers in its runtime; tests were added. This change is pending exact-head CI and is not a release artifact.

## Owner's current LAB boundary

The authorized LAB host remains `C:\Servers\Thomas_MCBedrock - Copy (2)`; production `C:\Servers\Thomas_MCBedrock` is prohibited. Owner observations progressed beyond PG27 through PG35 and PG42. The active LAB world `HartUCECarrierLabPG42` has an installed temporary PG42 carrier probe and a persistent named/lore carrier witness. PG35 and earlier ThomasServer LevelDB remain preserved. **Do not run the older PG33-specific UCE installer against this LAB, clear PG42 world records, delete PG42 provenance, or replay unresolved custody.** Historical PG40/PG42 pack-reconstruction and rollback tools are retained because removing them before safe LAB cleanup would strand installed-state rollback. They must not be in the integrated runtime/release archive.

Earlier PG carrier, metadata-rich, custody and journal sessions are bounded evidence and should **not** be repeated as standalone acceptance exercises. The next owner BDS request must be an integrated product session with complete source readiness and an exact pinned, guarded LAB world/pack delivery and rollback plan.

## Critical release path

1. **Code hygiene and integration:** review all shipped runtime/build dependencies, remove genuinely unused debug/prototype paths without deleting historical rollback requirements; enforce one declared HL2 source and one coordinated routing/custody/recovery model; correct source defects with fault-injection tests and exact-head CI.
2. **Full-product LAB delivery:** establish a guarded installer/rollback from the actual PG42 environment into a *separate safe integrated-world target* without altering PG35 or PG42 evidence; require exact predecessor and unchanged other packs, before owner involvement.
3. **Integrated Bedrock acceptance:** ordinary and MR real item transfers, multiple Receivers, Bulk, Transporter, Sorter modes, Hopper/Dropper/Dispenser, inventory limits, redstone, blocked/full/unloaded graph, restart and diagnosed HOLD. The owner should run a single coherent product test instead of repeated PG probes.
4. **Archived 1.4.1 cold migration:** verify access to the original restorable ZIP and its Q4 census, implement repeatable non-destructive activation on a separate restored LAB copy. Opaque/metadata-rich legacy Q4 records presently HOLD rather than lose hidden metadata; this is **not** completed migration support.
5. **Release:** full compatibility acceptance, complete safety/performance evidence, clean temporary-instrumentation registry, reproducible HL2 archive with checksum/source pin, documented limits and explicit owner release authorization.

**Unchanged hard constraints:** no world deletion/reset to force empty activation; no unrecorded ownership replay; no synthesized native metadata; no automatic install/merge/production action; no assumption that source mocks prove Bedrock save atomicity. All source changes remain reviewable in draft PR #79.
