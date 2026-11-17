# Hart Logistics 1.4.2 — native-first development baseline closeout

**Owner decision:** November 17, 2026. **Status:** **base 1.4.2 development baseline closed** for further *1.4.1-era optimization research*. This is **NOT** production approval, whole-product owner acceptance, guaranteed TPS, or a claim that all 1,400-Sorter cases are performance-complete.

## Scope and immutable provenance

- Original owner 1.4.1 import: `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`; `BASELINE_HASHES.json` retains the immutable **72 original 1.4.1 file digests**.
- Historical implementation/research branch: `implementation/native-first-engine-141-20261115` remains unchanged, including P4g source and its measured **no-useful-hit** runtime audit.
- New **independent 1.4.2 baseline branch**: `baseline/native-first-142-20261117`; gameplay engine is the last P4e engine at commit `5c974dd62696708dfa0d8ae35607cacfcdb17346`, with only displayed `const VERSION` changed from **1.4.1 to 1.4.2**. P4g's optional proof argument, `rejectedFullTypes` Map, and same-callback cache are **not** present.
- Both BP and RP manifests have header/module version **[1,4,2]**, with the BP→RP dependency updated to **[1,4,2]**. UUIDs, block identifiers, geometry/textures, metadata, native `@minecraft/server 2.7.0` dependency and minimum BDS engine version remain as in the original source. No Bulk Storage or Transporter blocks, Q5 schema, or URCE runtime are included.
- Signed off as **an acceptable optimization ceiling for the existing standalone/local-per-column architecture**, *not* as a new verified performance limit on BDS.

## Evidence and explicit limits

- The P4e native `hasItem()` fast path was exercised; ~9,425 admissions incurred **487,223** Sorter destination native `getSlot()` calls, ~**51.69** per scanned destination in a 19.7-second active-routing profile. Script P95 **68.885 ms**, but other add-ons and workloads contribute. No matched TPS proof or clean item-conservation acceptance from this profile alone.
- P4g code-only correctness passed **162 candidate + 99 original 1.4.1** tests in five CI jobs, but [active P4g BDS](https://github.com/partom24/HartLogistics2/blob/implementation/native-first-engine-141-20261115/implementation/PHASE_A_P4G_ACTIVE_ROUTING_ASSESSMENT_20261117.md) showed **6,166 destination container resolutions and 6,166 admission scans**, strongly consistent with **zero reused rejections**. P4g extra bookkeeping is excluded from 1.4.2.
- Native destination-managed `Container.addItem()` was rejected as an unproven Q4 substitute because it returns a remainder, **not** a durable exact-slot receipt and coordinated source debit. Full snapshots and cross-tick chest capacity ledgers are not adopted.
- No change to **Filter → Auto → Wildcard**, bottom-to-top order, Bypass, vanilla Hopper observation/redstone/pass-through, Collector/Receiver links, native ItemStack fidelity, existing queue/journal recovery, 16-per-column and 256 global budgets, or legacy q2/q3/q4 data. FIFO is not a new requirement.
- **Remaining acceptance debt:** exact installed 1.4.2 source SHA/BDS load; protected old-world upgrade/restart; Q4 existing data and journals; count- and metadata-preserving full, partial, locked, unavailable, Filter/Auto/Wildcard/Bypass cases; full reference-array workload, useful item throughput and observed server responsiveness. Do not label those tests passed based on code CI or a profile alone.
- **No owner production server or existing LAB files changed by creating this baseline.** A 1.4.2 artifact is a **non-release development/compatibility candidate**. Actual LAB apply, future promotion and production release are separate owner decisions.

## Source identity

```
BP main.js SHA-256          2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411
BP manifest.json SHA-256    2700f13cc3324235e280af597fdad9931569ae32f300a4ff55aa558b33db6817
RP manifest.json SHA-256    a761e781ae5b36519139b99d45d90679b7e1b7ce920dcfb3e11d9c338441aaf6
```

These are independently pinned by the 1.4.2 source guard. LAB updater accepts verified legacy version **1.4.1** and already installed *exact* **1.4.2**, patches only Hart pack registry version entries, verifies staged and installed bytes, retains backup and attempts full rollback on error. Never bypass fail-closed rejections by manually copying a pack or editing the world registry.

## Branch and next phase boundary

- **1.4.2 branch:** frozen *architectural scope* and source identity, subject only to bounded regression fixes, owner compatibility checks and release gating. Its old P4g files are historical tests and not part of the 1.4.2 build/test suite.
- **1.5 URCE planning branch:** independently branched from this 1.4.2 baseline, documentation/design first. The selected [URCE contract](https://github.com/partom24/HartLogistics2/blob/main/docs/UNIFIED_ROUTING_CUSTODY_ENGINE.md) governs future architecture; the old Q5 format is superseded.
- Historical 1.5 skeleton/reference artifacts may be **read for specific design lessons** (graph validation, maintenance fences, native custody HOLD and user interface), but the frozen #79/82 unified-custody branch remains **DO NOT MERGE/COPY**. Historical source-only mocks and 1.5 candidate packs do not establish native runtime guarantees. Nothing in a planning branch authorizes new gameplay, Bulk/Transporter integration, migration, LAB changes or release.
