# Bundle 2 — Existing-world compatibility, Q4→Q5 safety and menu feasibility

**Status: OFFLINE PREPARATION COMPLETE (2026-11-07). PG-06, PG-07 and PG-08 have not been executed or accepted in BDS.** This report records what was actually tested, which gates remain blocked, and how to advance without risking the owner's previously-production world clone. No source-file change to the original 1.4.1 BP/RP; no Q5 state written to a world; no LAB or production BDS accessed; no cheats/experiments changed; no temporary game probe created.

## Scope of the owner-approved original Bundle 2

| Gate | Original acceptance | What could be done now | Result |
| --- | --- | --- | --- |
| **PG-06** | Already placed 1.4.1 Collector/Receiver preserve blocks, links, native inventories and Hopper routing through upgrade | Source checks: original block IDs, re-registration preserving existing links and queue IDs/counters, original manifest unchanged | **Offline checks PASS; in-game PG-06 NOT RUN; native MR upgrade blocked by PG-03** |
| **PG-07** | Global script maintenance, Q4→Q5 crash/idempotency and loaded/late-loaded blocks, optional temporary ticking-area accelerator with cleanup | Pure Python **non-runtime shadow migration model** with frozen Q4 snapshots, shadow Q5, one modeled authority marker, simulated crashes, unresolved journals, unloaded records, conservative resume and Hopper-isolation precondition | **Offline model PASS; actual Q5 cutover BLOCKED, PG-07 BDS NOT RUN** |
| **PG-08** | Collector Link/Relink/Unlink menus, Receiver confirmation and status, saved links, sneak-place, migration status, native GUI compatibility | Pure Python menu policy model: per-player sessions, cancel, stale/revision conflict, failed save rollback, two-player isolation, unlink confirmation, unloaded status | **Offline model PASS; real UI NOT IMPLEMENTED/NOT RUN; native inventory UI coexistence blocked** |

## Execution evidence

- [GitHub Actions run 42384039945](https://github.com/partom24/HartLogistics2/actions/runs/42384039945) completed **success** on the development branch (commit `17dfb39edf4f51b8d230877345a9df7ce1f2706a`).
- New [permanent offline Bundle 2 tests](../tests/test_bundle2_offline_safety.py): **25/25 PASS** — 5 baseline source contracts, 8 Q4→shadow-Q5 migration/incident tests, 12 menu-policy tests.
- Existing 37 blueprint, 9 LAB-updater, 12 legacy MR, and 7 Transporter topology tests also pass: **90 total test methods**. Additional data-driven cases are nested in those methods; these are **not** 90 BDS tests.
- Test models never import `@minecraft/server`, install a behavior pack, access the user's world, serialize real MR items or exercise Minecraft UI.

## Verified source-level facts (not a world-upgrade test)

- The source still uses block identifiers `hartsorter:sorter`, `hartsorter:collector`, `hartsorter:receiver`, ordinary Receiver cap **250,000**, the existing q2/q3/q4 key family and queue journals.
- Re-registering an already-known Collector merges the fresh block coordinates/flags without clearing its saved `link`; an existing Receiver keeps `queueKey`, `queued`, `received`, `delivered` unless missing. This is a source-level preservation mechanism, not proof a new container component can be added to an already placed block.
- Version 1.4.1 currently arms linking at Collector placement/interact, and `useReceiver` changes `col.link` *before* `saveLogistics()`. An upgraded menu needs confirmation and **failure-safe persistence/revalidation**, not a direct reuse of that mutation. Test models make cancellations/failed writes leave the prior saved link unchanged.
- Current `beforeEvents.playerInteractWithBlock` preserves **sneaking passthrough**, cancels standing use and defers script actions via `system.run`. Microsoft's [ActionFormData](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-ui/actionformdata?view=minecraft-bedrock-stable) and [MessageFormData](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-ui/messageformdata?view=minecraft-bedrock-stable) support the proposed button/confirmation UX, but their `show` methods are disallowed during restricted execution and real client/server presentation still needs BDS evidence. Version 1.4.1 has **no** `@minecraft/server-ui` manifest dependency yet; that change is **not** made by this Bundle 2 preparation.
- Q4 queue metadata is authoritative once present, and q2/q3 legacy keys are read/recovered through source functions. A Q5 implementation must not replay stale Q4 after new-authority writes and must preserve any unresolved q4 journal for recovery.

## Hard safety boundaries and outcome

1. **PG-03 remains NO-GO** on no-experiments BDS 1.26.63.1. No safe custom native MR Collector/Receiver slots were proven. PG-06's native-slot upgrade, PG-07's Q5 MR-lane cutover and PG-08's native-inventory/menu coexistence cannot be marked GO or smuggled through this batch.
2. **Physical vanilla Hopper movement continues during a Hart script freeze.** The offline model requires `vanilla_hoppers_isolated` before a staged cutover, but **does not implement or test** that isolation in Bedrock. Missing Hopper control is a real blocker.
3. **Global freeze + Q4 journal:** any unresolved journal, unknown metadata count, unloaded block, post-commit shadow mismatch or missing late-load gate must hold routing. Offline modeled authority means *one* logical queue format is authoritative; it is **not** evidence Minecraft saves are atomic across multiple dynamic properties.
4. **Menu confirmation:** never silently relink on placement; preserve previously saved link on cancel/stale/expired/failed persist; reject replay and cross-player access. Status for an unloaded block must never pretend it completed migration. The test model proves these policies are internally consistent, **not** that existing Bedrock UI behaves accordingly.
5. **Existing-world preservation:** LAB is `C:\Servers\Thomas_MCBedrock - Copy (2)\worlds\ThomasServer`, **a clone of the owner's previous production world**. Never replace/reset it for these tests; production `C:\Servers\Thomas_MCBedrock` is protected. No new rig is READY; owner need not build one at this stage.
6. **No change to original 1.4.1:** no new UI dependency, menu code, revised link semantics, new Q5 state, block components or pack UUID changes have been committed under `addon/behavior_pack` or `addon/resource_pack`.

## Next independent work and owner touchpoint

**Best independently progressable PG-08 slice:** prepare a minimal **LAB-only menu implementation** on a controlled candidate branch/copy, preserving saved links and sneak-place, and run extensive automated fault/race tests. It must **not** claim custom MR slot/menu coexistence or Q5 migration status COMPLETE while PG-03 is blocked. Before actual LAB installation, provide the owner a verified Git-source PowerShell updater and one complete READY rig card with exact XYZ, two or three hands-on checks, existing-network isolation, cleanup and expected output. No manual setup requested yet.

**Keep PG-06/07 held** for native MR storage and Hopper ownership, rather than weakening requirements to force Bundle 2 GO. The optional pack-scoped ticking-area accelerator is only relevant when a safe migration engine exists; do not call or test it as a way around native-slot capacity.

**Current decision:** Bundle 2's **offline preparation is complete; real gates remain NOT RUN / dependencies BLOCKED**. Advancement to menu gameplay code and LAB execution is not implied by this report alone. Do not merge, release, update experiments or modify production.

## Subsequent owner LAB preflight: deployment baseline mismatch

The owner ran the read-only pack diagnostic and found original-Hart-UUID top-level BP/RP folders **version 1.5.0** but no original-Hart-UUID entries in `ThomasServer`'s two pack-registration arrays. The retired Bundle 1 test pack/lease was absent. The 1.5.0 source is not in the authorized 1.4.1 import and must be preserved and reconciled before any updater apply or BDS menu test. This does **not** advance PG-06/07/08 runtime results; see [preflight report](BUNDLE2_LAB_PREFLIGHT_RESULTS.md).
