# Hart Logistics 2 — Evidence Register

The engineering blueprint template's old E-* entries referred to a **different repository/project** and were not Hart Logistics development evidence. Those example claims were replaced. Evidence levels follow [engineering standard](ENGINEERING_STANDARD.md).

| ID | Scope | Evidence level | Source | What it does **not** prove |
| --- | --- | --- | --- | --- |
| HL-E-001 | Original Hart Logistics 1.4.1 owner-uploaded mcaddon | Source artifact fingerprint / SOURCE REVIEW | Original filename and exact SHA-256 in [baseline registry](BASELINE_REGISTRY.md) | No runtime acceptance or Git-frozen tree; source is not yet committed |
| HL-E-002 | 1.4.1 pack inspection | SOURCE REVIEW / previously reported offline syntax checks | Conversation-file inspection: behavior/resource packs, script, manifests; earlier JSON/JS/PNG parsing reports | Does not establish game behavior, world-migration safety or successful new build |
| HL-E-003 | HartBots 1.8.2 Depot reference | SOURCE REVIEW | Owner-uploaded mcaddon (separate project); no repo queried | No native cross-addon integration, compatibility proof or change authorization |
| HL-E-004 | Native MR transfer capability | **OWNER-REPORTED RUNTIME TESTING**, artifacts not in this repository | Owner reports extensive prior container→container MoveItem/ItemStack method testing with enchanted items, sacks, potions, music discs | Does not verify an experimental *custom block container* on server 1.26.63.1/client v26.63 or a crash-safe cross-chunk transaction |
| HL-E-005 | Owner's environment | OWNER-REPORTED, not yet reproduced | Server launch log: `Version: 1.26.63.1`; client `v26.63` | Not a completed compatibility test or proof pack loaded on that server |
| HL-E-006 | Planning docs in HartLogistics2 | Document update only | HL-PLAN-001; architecture, migration, test plan and decision inbox in this PR | No gameplay implementation, CI success, world tests or release approval |

## Evidence to capture before implementation/release

1. Source commit/tree and original mcaddon checksum, pack UUIDs and exact Bedrock engine/API versions.
2. World-copy and experiment settings, test commands and retained before/after item metadata records.
3. Q4 journal crash-injection evidence at each cutover boundary; total/per-item conservation and idempotence.
4. Native MR transfer fidelity observations covering exact components and failure paths.
5. All 1.4.1 feature regression paths, no-new-block legacy mode, loaded/unloaded regions and multi-controller topology.
6. Distinguish SOURCE REVIEW → OFFLINE PASS → RUNTIME OBSERVED → INTEGRATION ACCEPTED → RELEASE APPROVED. None is implied by a document merge.

