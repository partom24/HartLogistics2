# URCE 1.5 — Cross-branch native MR evidence reuse and readiness correction

**Review:** November 18, 2026. **Requested by owner:** "Verify stable native MR storage and endpoint transfers" is **not a pre-code feasibility blocker**; check evidence ledgers across branches.  
**Scope:** Review of all **79 repository branch refs** returned by GitHub's branch listing and their `docs/ENGINEERING_EVIDENCE_REGISTER.md` snapshots, plus the active [curated NMR-01–10 ledger](../recovery/NATIVE_MR_HISTORICAL_EVIDENCE_141.md), [main register](https://github.com/partom24/HartLogistics2/blob/main/docs/ENGINEERING_EVIDENCE_REGISTER.md), [historical PG42 session card](https://github.com/partom24/HartLogistics2/blob/dev/uce-shared-ordinary-ledger-20261111/candidates/uce/PG42_TEST_SESSION.md), and [archived closed PR #79](https://github.com/partom24/HartLogistics2/pull/79). This is **evidence reuse**, not an import of frozen gameplay, an implementation change, or new BDS testing.

## Audit result and correct status

**CLOSED for URCE pre-code planning: native MR movement and native entity-inventory *primitive availability* on owner's no-experiments stable BDS.** The older "native storage not proven, therefore cannot start coding" statement in the November 18 pre-code matrix was **incorrect**. PG-03 custom-block-container NO-GO concerns a *different optional mechanism* and does not negate the demonstrated entity-carrier approach.

| Evidence | What is actually accepted | What it does not establish |
| --- | --- | --- |
| **HL-E-004 / NMR-01** | Owner-reported native `ItemStack` and `moveItem` testing for enchanted items, potions, sacks, music discs | Independent field-by-field fixtures and crash-atomic transfer |
| **HL-E-052 / PG20 / NMR-05** | BDS 1.26.63.1 owner-LAB scoped pass: **Protection I enchanted book** in native Hopper→linked Collector→Receiver output Hopper direct routing; empty source, intact visible enchantment and clear journals after normal restart | Persistent item buffer inside Collector/Receiver; arbitrary metadata, cross-chunk, foreign-writer safety or hard-crash atomicity |
| **HL-E-063 / PG23 / NMR-08** | Native same-Hopper enchanted-book movement, with owner-observed ordinary-restart retention | Inter-system durable receipt or general multi-hop custody |
| **PG39/41/42 / NMR-09** | PG42 isolated fresh LAB, no experiments, **BDS 1.26.63.1**: successfully created **native persistent nine-slot entity inventory**, stored a named/lore paper ItemStack, and later owner-reported read-only audit showing **same entity ID `-8589934221`**, occupied slot and intact name/lore after an ordinary restart | Connected Collector/Receiver storage, enchantments tested *inside entity carrier*, cross-chunk/unload/death/foreign-writer safety, abrupt-process-kill durability, or independent boot-log correlation for postrestart photo |
| **HL-E-009 / PG-03 / NMR-02** | Proposed custom-*block*-container probe unavailable without experiments; focused NO-GO for **that endpoint type** | No inference that native **entity** inventory fails |
| **NMR-07 / PG20 emergency stop** | Owner observed post-kill automatic player-inventory item return; exact cutpoint and whole-world reconciliation **indeterminate** | No hard-crash atomicity pass; not evidence native storage primitive is impossible |
| **NMR-10 / PG34** | Runtime Q4 migration correctly HELD 16 unknown/MR rows rather than flattening them | Not a native inventory availability failure |

**Historical provenance:** `main` carries the extensive chronological HL-E evidence entries, and `dev/uce-shared-ordinary-ledger-20261111` carries subsequent owner-LAB/source integration evidence and PR #79 notes. The current 1.4.2/URCE planning line has a **shorter** evidence register, but explicitly links its curated NMR carry-forward. Many of the 79 branches are successive snapshots and share identical evidence-register blob SHAs; **branch count is not an independent test count**. Other branch-specific entries describe earlier/no-proof phases and do not supersede later accepted PG20 and PG42 scope. No contradictory later runtime NO-GO of native entity inventory was found.

## Gate correction and implementation consequence

1. **Do not repeat PG20/PG42 merely to prove native movement or carrier availability.** Reuse them as existing owner-LAB GO evidence for the scoped primitives. Do not require the user to reconstruct isolated rigs or reinstall archived PG42.
2. **MR carrier design candidate:** Start URCE U2/U3 from the **demonstrated persistent native inventory entity** model (an architectural direction, **not permission to copy frozen PR #79 code**). Ordinary custom-block `minecraft:block_entity.container` support is optional; its experimental PG-03 problem is **not a 1.5 code-generation prerequisite**.
3. **Unresolved integration is real but different:** Mapping a finite native carrier to Collector/Receiver authority; admission and MR egress; exact per-identity recovery, unload/death/split and no-loss/no-duplication; Q2/Q3/Q4 migration; owner-LAB end-to-end test, and safe interrupted commit/physical receipt are **U2/U3 implementation/acceptance tasks**, not evidence that native MR storage cannot exist.
4. **A clean restart is not a hard crash.** PG20/23/42 do not certify durability of a journal and entity/native inventory across a power cut; classify and HOLD ambiguous cases. This remains a custody implementation/release gate, not an argument to repeat primitive discovery.
5. **Pre-code boundaries elsewhere stand:** exact 1.4.2 transitive writer census (U0), directed graph and source-only comparative proof (U1), a coherent custody/recovery protocol (U2), and separate gameplay/LAB/release permissions. Work that does not introduce a new writer can proceed under its expressly authorized source-only scope without a new carrier feasibility test.
6. **Owner preference reiterated in PR #79:** avoid proliferating small manual carrier probes; consolidate later LAB testing into product-valued integration acceptance, reuse existing evidence exactly at its original scope.

## Decision ledger correction

**G4a native MR storage feasibility: CLOSED — previously demonstrated, reusable.**  
**G4b URCE endpoint/custody *integration*: OPEN — normal implementation and acceptance scope, not pre-code discovery blocker.**  
**G3 cross-domain reliable custody/legacy-world migration: OPEN — safety design and release gates apply.**

This audit **does not** change code, world, saved items, original source fingerprints, pack identities, BDS configuration, any protected archived world, or the no-implementation-permission status of the current planning branch.
