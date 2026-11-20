# Owner LAB World — Copy and Refresh Policy (2026-11-20)

**Status: Owner-confirmed operational fact and permission for LAB testing.**
**Applies to:** HartLogistics2 development, U1/URCE migration rehearsals, candidate verification and future branches.
**Source:** Direct owner statement on 2026-11-20. This is a standing clarification; no world was changed in documenting it.

## Known world provenance

- The owner's **LAB world is a copy/paste copy of the owner's 1.4.1 production world**.
- The LAB world is **expendable**. It is not an independently valuable save that must be maintained in its current test state.
- The LAB world **may be refreshed or recreated from a copy whenever useful for testing**. Changes to the LAB copy do not need to be preserved as a continuing gameplay world.
- A copy is a **snapshot**, not a synchronized live production environment; verify the actual source version and state whenever a new copy is made.

## Practical implications for URCE / Q4 migration testing

1. **Realistic starting point:** Use the copied 1.4.1 world as a representative existing-world baseline for URCE/Q4 and compatibility rehearsals, not solely newly created empty worlds.
2. **Repeatability:** The LAB can be reset to a fresh independent copy to rerun migration, journal recovery, interrupted transactions and alternate candidate builds. The team need not preserve experimental item routing, changed inventories, links or test structures inside an expendable LAB iteration.
3. **Production is never the disposable target.** The original 1.4.1 production world and production BDS are protected. All testing, migration and destructive operations must be directed only at the explicitly identified LAB target.
4. **Safe refresh operation:** Before replacement, verify source and destination paths, confirm that the destination is the LAB world, stop the LAB BDS, copy from an authorized source without modifying that source, and verify world/packs/registries at the resulting LAB before restarting. Use the current guarded owner-approved deployment workflow. Never reuse a historical version-specific installer without adapting/validating it.
5. **Backups and evidence remain separate:** Expendable LAB world state does not imply permission to delete established deployment backups, source archives, diagnostics, profiler captures, historic proof, or the production world. Preserve previously retained backups and any run-specific evidence required to assess tests.
6. **No acceptance by provenance alone:** A cloned 1.4.1 production world provides valuable compatibility conditions but does not by itself prove Q4→URCE durability, native MR fidelity, sudden-crash recovery or release readiness. Required migration and conservation tests still apply.
7. **No mandatory retention of an individual LAB iteration:** Future branches should not halt routine LAB testing solely to protect changes made within an expendable copy. A refresh does not authorize production deployment or deletion and must still obey stopped-server and target-verification safeguards.

## Discoverability and precedence

- This fact is intentionally discoverable from the root **README.md** and **AGENTS.md** on `main`, `dev/urce-150-runtime-20261118`, and `planning/urce-150-20261117`.
- Consult `PROJECT_CONTINUITY.md` and `docs/CANONICAL_EVIDENCE_AND_TOOLING.md` for the separately protected source/evidence/release process; neither is overridden by this clarification.
- This policy supplements [HL-URCE-OWN-001](URCE_COLUMN_COORDINATOR_OWNERSHIP_CONTRACT_20261120.md) and the [U0 audit](URCE_U0_ACTIVE_RUNTIME_WRITER_CENSUS_20261120.md). It does **not** modify any addon code, world, pack, Q4 journal or migration logic.
