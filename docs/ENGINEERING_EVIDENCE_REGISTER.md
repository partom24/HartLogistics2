# Hart Logistics 2 — Evidence Register

The engineering blueprint template's old E-* entries referred to a **different repository/project** and were not Hart Logistics development evidence. Those example claims were replaced. Evidence levels follow [engineering standard](ENGINEERING_STANDARD.md).

| ID | Scope | Evidence level | Source | What it does **not** prove |
| --- | --- | --- | --- | --- |
| HL-E-001 | Original Hart Logistics 1.4.1 owner-uploaded mcaddon | SOURCE ARTIFACT + GIT IMMUTABLE IMPORT | Original filename and SHA-256 in [baseline registry](BASELINE_REGISTRY.md); exact source import commit `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`; 72 original BP/RP Git blob hashes matched | Does not prove runtime behavior or safe saved-world upgrade |
| HL-E-002 | 1.4.1 pack inspection | SOURCE REVIEW / previously reported offline syntax checks | Conversation-file inspection: behavior/resource packs, script, manifests; earlier JSON/JS/PNG parsing reports | Does not establish game behavior, world-migration safety or successful new build |
| HL-E-003 | HartBots 1.8.2 Depot reference | SOURCE REVIEW | Owner-uploaded mcaddon (separate project); no repo queried | No native cross-addon integration, compatibility proof or change authorization |
| HL-E-004 | Native MR transfer capability | **OWNER-REPORTED RUNTIME TESTING**, artifacts not in this repository | Owner reports extensive prior container→container MoveItem/ItemStack method testing with enchanted items, sacks, potions, music discs | Does not verify an experimental *custom block container* on server 1.26.63.1/client v26.63 or a crash-safe cross-chunk transaction |
| HL-E-005 | Owner's environment | OWNER-REPORTED, not yet reproduced | Server launch log: `Version: 1.26.63.1`; client `v26.63` | Not a completed compatibility test or proof pack loaded on that server |
| HL-E-006 | Planning docs in HartLogistics2 | Document update only | HL-PLAN-001; architecture, migration, test plan and decision inbox in this PR | No gameplay implementation, CI success, world tests or release approval |

| HL-E-007 | Baseline Sorter/Collector/Receiver ingress and egress routes | **SOURCE REVIEW** | [1.4.1 route matrix](BASELINE_INGRESS_EGRESS_MATRIX.md): accepted edges E01–E11, unsupported N01–N07, end-to-end routes R01–R06, and function/line trace index against original upload | No new in-game test or proof on owner-reported server 1.26.63.1/client 26.63; behavior remains conditional on orientation/redstone/storage/load/item eligibility |

| HL-E-008 | Uploaded HartBots updater design (not execution) | **SOURCE REVIEW** | Owner's `scripts.zip` SHA-256 `9127f132bc22022ea9d236f1092945f0a7f32a31b0ab0ec2603d39844cb8bfbf`; production script SHA-256 `4f7c136c566a431211b055a9e95f37fc46dce5262dd461b655a6422a0a6f76ee`; [updater design](UPDATER_DEPLOYMENT_DESIGN.md) | Neither updater script has been run or imported as executable HartLogistics tooling; no LAB access, no production access, no deployment verification |

| HL-E-009 | Custom block inventory native API compatibility | **SOURCE/API REVIEW — target runtime NOT TESTED** | [Microsoft Bedrock 1.26.50 notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.50) document experimental `minecraft:block_entity.container` and script access; [BlockInventoryComponent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/blockinventorycomponent?view=minecraft-bedrock-stable) returns the standard [Container](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/container?view=minecraft-bedrock-stable), which declares `moveItem` and `transferItem`. Focused future gate in [Q5 design](Q5_MIGRATION_DESIGN.md). | No proof yet that **26.63** custom-block inventory is available under the owner's permitted experiment configuration, preserves MR components through custom endpoints, survives restart, or coexists with custom menus. Existing owner-reported vanilla native transfers are not being repeated. |

| HL-E-010 | PG-01 immutable original source import | **OFFLINE SOURCE HASH PASS** | [Bundle 0 results](BUNDLE0_RESULTS.md): 72/72 original BP/RP files and 75/75 including import helpers match expected SHA-1 Git blobs; source trees pinned at `0ea3000` | No gameplay implementation or Bedrock runtime acceptance. |
| HL-E-011 | PG-02 guarded HartLogistics LAB updater | **OFFLINE SYNTHETIC PASS (9 tests)** | [Bundle 0 results](BUNDLE0_RESULTS.md), [safety tests](../tests/test_hartlogistics_lab_updater.py), [LAB updater](../scripts/hartlogistics_lab_updater.py); exact path refusal, staging/hashes/backups, restoration after interrupted pack or registry writes | Does not authorize/verify Windows LAB application, real-world registries or any production operation. |

## Reuse previously accepted testing

The owner reports that several safe transfer behaviors were established during earlier development attempts. **Do not require repeating an unaffected test simply because its work occurred before HartLogistics2.** Preserve the owner-provided observation, scope, versions and relevant behavior when it becomes available; classify it as **OWNER-REPORTED** until the underlying logs/fixtures are reviewed. Document a per-test reuse judgment: **unaffected and reusable**, **affected by a changed contract**, or **new/unproven**. Run **only** focused validations introduced by materially changed behavior. The [test-card policy](TEST_RIG_CONTRACT.md) requires a clear upfront summary and full physical setup if a manual test is actually necessary. No blanket claim of runtime acceptance follows from undocumented prior tests.

## Evidence to capture before implementation/release

1. Source commit/tree and original mcaddon checksum, pack UUIDs and exact Bedrock engine/API versions.
2. World-copy and experiment settings, test commands and retained before/after item metadata records.
3. Q4 journal crash-injection evidence at each cutover boundary; total/per-item conservation and idempotence.
4. Native MR transfer fidelity observations covering exact components and failure paths.
5. All 1.4.1 feature regression paths, no-new-block legacy mode, loaded/unloaded regions and multi-controller topology.
6. Distinguish SOURCE REVIEW → OFFLINE PASS → RUNTIME OBSERVED → INTEGRATION ACCEPTED → RELEASE APPROVED. None is implied by a document merge.

