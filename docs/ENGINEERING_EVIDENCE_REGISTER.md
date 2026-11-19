# Hart Logistics 2 — Evidence Register

> **MANDATORY STATIC CONTINUITY:** [Canonical original evidence and PowerShell process sources](CANONICAL_EVIDENCE_AND_TOOLING.md), [immutable project index](PROJECT_STATIC_RESOURCES.json), and [root discovery contract](../PROJECT_CONTINUITY.md) retain the real prior tests/tools across branch boundaries. The shortened register in this checkout is supplemental, not authority to declare historical proof missing. Original source acceptance limitations still apply.

The engineering blueprint template's old E-* entries referred to a **different repository/project** and were not Hart Logistics development evidence. Those example claims were replaced. Evidence levels follow [engineering standard](ENGINEERING_STANDARD.md).

| ID | Scope | Evidence level | Source | What it does **not** prove |
| --- | --- | --- | --- | --- |
| HL-E-001 | Original Hart Logistics 1.4.1 owner-uploaded mcaddon | Source artifact fingerprint / SOURCE REVIEW | Original filename and exact SHA-256 in [baseline registry](BASELINE_REGISTRY.md) | Immutable original 1.4.1 source is now committed at `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`; this fingerprint alone does not prove runtime acceptance |
| HL-E-002 | 1.4.1 pack inspection | SOURCE REVIEW / previously reported offline syntax checks | Conversation-file inspection: behavior/resource packs, script, manifests; earlier JSON/JS/PNG parsing reports | Does not establish game behavior, world-migration safety or successful new build |
| HL-E-003 | HartBots 1.8.2 Depot reference | SOURCE REVIEW | Owner-uploaded mcaddon (separate project); no repo queried | No native cross-addon integration, compatibility proof or change authorization |
| HL-E-004 | Native MR transfer capability | **OWNER-REPORTED RUNTIME TESTING**, artifacts not in this repository | Owner reports extensive prior container→container MoveItem/ItemStack method testing with enchanted items, sacks, potions, music discs | Does not verify an experimental *custom block container* on server 1.26.63.1/client v26.63 or a crash-safe cross-chunk transaction |
| HL-E-005 | Owner's environment | OWNER-REPORTED, not yet reproduced | Server launch log: `Version: 1.26.63.1`; client `v26.63` | Not a completed compatibility test or proof pack loaded on that server |
| HL-E-006 | Planning docs in HartLogistics2 | Document update only | HL-PLAN-001; architecture, migration, test plan and decision inbox in this PR | No gameplay implementation, CI success, world tests or release approval |

| HL-E-007 | Baseline Sorter/Collector/Receiver ingress and egress routes | **SOURCE REVIEW** | [1.4.1 route matrix](BASELINE_INGRESS_EGRESS_MATRIX.md): accepted edges E01–E11, unsupported N01–N07, end-to-end routes R01–R06, and function/line trace index against original upload | No new in-game test or proof on owner-reported server 1.26.63.1/client 26.63; behavior remains conditional on orientation/redstone/storage/load/item eligibility |

| HL-E-008 | Uploaded HartBots updater design (not execution) | **SOURCE REVIEW** | Owner's `scripts.zip` SHA-256 `9127f132bc22022ea9d236f1092945f0a7f32a31b0ab0ec2603d39844cb8bfbf`; production script SHA-256 `4f7c136c566a431211b055a9e95f37fc46dce5262dd461b655a6422a0a6f76ee`; [updater design](UPDATER_DEPLOYMENT_DESIGN.md) | Neither updater script has been run or imported as executable HartLogistics tooling; no LAB access, no production access, no deployment verification |

| HL-E-009 | Custom block inventory native API compatibility | **SOURCE/API REVIEW — target runtime NOT TESTED** | [Microsoft Bedrock 1.26.50 notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.50) document experimental `minecraft:block_entity.container` and script access; [BlockInventoryComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockinventorycomponent?view=minecraft-bedrock-stable) returns the standard [Container](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable), which declares `moveItem` and `transferItem`. Focused future gate in [Q5 design](Q5_MIGRATION_DESIGN.md). | No proof yet that **26.63** custom-block inventory is available under the owner's permitted experiment configuration, preserves MR components through custom endpoints, survives restart, or coexists with custom menus. Existing owner-reported vanilla native transfers are not being repeated. |

## Reuse previously accepted testing

The owner reports that several safe transfer behaviors were established during earlier development attempts. **Do not require repeating an unaffected test simply because its work occurred before HartLogistics2.** Preserve the owner-provided observation, scope, versions and relevant behavior when it becomes available; classify it as **OWNER-REPORTED** until the underlying logs/fixtures are reviewed. Document a per-test reuse judgment: **unaffected and reusable**, **affected by a changed contract**, or **new/unproven**. Run **only** focused validations introduced by materially changed behavior. The [test-card policy](TEST_RIG_CONTRACT.md) requires a clear upfront summary and full physical setup if a manual test is actually necessary. No blanket claim of runtime acceptance follows from undocumented prior tests.

## Evidence to capture before implementation/release

1. Source commit/tree and original mcaddon checksum, pack UUIDs and exact Bedrock engine/API versions.
2. World-copy and experiment settings, test commands and retained before/after item metadata records.
3. Q4 journal crash-injection evidence at each cutover boundary; total/per-item conservation and idempotence.
4. Native MR transfer fidelity observations covering exact components and failure paths.
5. All 1.4.1 feature regression paths, no-new-block legacy mode, loaded/unloaded regions and multi-controller topology.
6. Distinguish SOURCE REVIEW → OFFLINE PASS → RUNTIME OBSERVED → INTEGRATION ACCEPTED → RELEASE APPROVED. None is implied by a document merge.


## Current URCE native MR feasibility disposition — 2026-11-18

**Cross-branch audit:** [79-branch evidence-ledger review](../planning/URCE_150_CROSS_BRANCH_NATIVE_MR_EVIDENCE_REUSE_AUDIT_20261118.md) reconfirms that [PG20 native enchanted-book routing](../recovery/NATIVE_MR_HISTORICAL_EVIDENCE_141.md) and [PG42 persistent nine-slot native entity-inventory storage](https://github.com/partom24/HartLogistics2/pull/79) already have **scoped owner-LAB runtime PASS evidence on BDS 1.26.63.1**. **Native MR primitive feasibility is CLOSED as a pre-code discovery blocker.** PG-03 custom-*block* inventory NO-GO is a separate candidate. Do not repeat PG20/PG42; preserve original accepted scope and never silently promote it to end-to-end crash-safe URCE custody, Collector/Receiver integration, Q4 migration or release acceptance.

## Curated cross-phase native MR evidence — owner authorized 2026-11-16

The original HL-E-001–009 table above is an **early planning snapshot**, not an exhaustive current test register. Later owner-observed Bedrock evidence is carried forward in [native MR historical evidence (NMR-01–10)](../recovery/NATIVE_MR_HISTORICAL_EVIDENCE_141.md) with explicit source, version, scope, acceptance and non-claim. In particular, **PG20 direct native enchanted-book routing and normal-restart retention** and **PG42 native nine-slot entity inventory with named/lore item and normal-restart readback** have **bounded LAB runtime evidence**. The custom-block PG-03 NO-GO does **not** negate PG42 entity inventory. Full transaction-atomic custody, opaque metadata preservation, old-Q4 migration and the active P4b build's MR recovery are **not thereby accepted**. The curated record is the sole owner-authorized *historical evidence* exception to recovery-branch source isolation: **do not import archived 1.5 code, design modules, tests, assets, Q5 requirements or measured performance**. This note is documentation-only and does not change 1.4.1 implementation priorities.

## 2026-11-18 — HL-E-URCE150-INFRA-002: Player-first dual-bank, Transporter inspection, responsiveness

**Evidence source:** Owner's five in-game and VS Diagnostics screenshots of the copied LAB running the 1.5.0 preview installed at exact commit `7fa7951f4a45f6e2a344856f3a715134d50f0fd8`. Previous visual resource incident resolved by owner removing stale 1.5.0 client cached files.

**Owner observed/confirmed:**
- A stack of blocks (including the new Transporter and Bulk Storage) **all placed successfully with no missed placements**. Visuals appeared correctly after cache resolution.
- Transporter inspection responded: one screenshot printed **`Transporters: 6 | nearby native endpoints: none`**, another printed **`Transporters: 8 | nearby native endpoints: sorter: 8, collector: 1, receiver: 1`**. This is *undirected local visibility*, not certified directed reachability or actual Transporter custody.
- **Two player-built banks:** Owner confirmed each Collector successfully linked to a Receiver. Screenshots show link acknowledgments for two Receiver locations and active Receiver status. **Link success is accepted and should not be retested without evidence of a regression.** Screenshots showed empty 0/250000 queue and `output hopper: missing` at that time; not evidence of completed indefinite transfer or actual delivery.
- Existing Hopper routing stayed active. Owner reports performance/timing **appeared similar** to before and placements remained responsive. VS Diagnostics screenshot shows live graph and commands but **cannot be used as a numeric total TPS or comparison** without a saved, labeled profile/measurement. Retain user observation as qualitative preliminary acceptance, not quantifiable 1.5 throughput.
- The fourth screenshot (a previous project attempt) is an explicit **owner-approved visual direction**: return to PG27-style **4×4 pixel centered Transporter with six thin connection arms** that join directly adjacent supported blocks. **Not a 4×4 Minecraft-cell multiblock.** No original route code imported.

**Next bounded development action:** [1.5.1 connected Transporter visual slice test](../distribution/URCE151_CONNECTED_TRANSPORTER_LAB_TEST_CARD.md), retaining the accepted PG27 axis reflection fix and stable 1.4.2 cargo. Use native placement/break event-driven visual connection updates, no per-Transporter tick and no speculative item transit. This new update must be a distinct 1.5.1 RP/BP version with an exact old 1.5.0→new backup/rollback chain, because reusing 1.5.0 was the confirmed client-cache incident cause.

**Explicit nonclaims:** No full URCE routing, Bulk custody, durable MR path, zero item loss over infinite time, verified throughput speedup, general cycle routing, or completed Receiver destination handoff is established by these photos. Source-only tests and CI are separate from owner BDS acceptance.
