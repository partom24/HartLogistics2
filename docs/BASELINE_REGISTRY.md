# Hart Logistics 1.4.1 — Baseline Registry

## BL-001 — Owner-supplied original add-on (external baseline)

- File originally uploaded: **HartMods_HartLogistics_1.4.1(1).mcaddon**
- SHA-256 of the supplied original archive: **439678c0d68849a43341c126ba6aaaa111317254e137123fde3ac531cec5d1dd**
- Source inspection date: 2026-11-06; **exact original source imported to Git** on 2026-11-07. Immutable import commit `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`. The separately supplied original archive remains external.
- Behavior pack UUID: **4854d263-05dd-4f79-a21c-7ba969295c2d**
- Resource pack UUID: **91316442-0f26-4fbb-88f3-2e39ea843a1a**
- Existing block identities: **hartsorter:sorter**, **hartsorter:collector**, **hartsorter:receiver**
- Source manifests declare **1.4.1**, minimum engine **1.26.50**, and dependency **@minecraft/server 2.7.0**.
- Queue/storage contract: q4 pages and journal with q2/q3 migration, Receiver capacity **250,000 items**, existing links, controls and persisted keys.
- Existing pack READMEs still say 1.4.0 in places; this is a documentation mismatch in the original files, not permission to change baseline bytes.
- Evidence state: original artifact fingerprint, **72/72 exact Git blob SHA-1 source-file matches**, plus local syntax/source checks; **no Bedrock runtime or release acceptance**. Git trees pinned below.

**Preservation requirement:** no lost 1.4.1 capability, item, identity, filter, linkage, redstone gate, hopper path or queue on upgrade.

Full current **ingress/egress path preservation matrix**: [1.4.1 ingress and egress](BASELINE_INGRESS_EGRESS_MATRIX.md). It enumerates supported and conditional Sorter, Collector, Receiver and Hopper routes, including item-entity ejection and direct-only unsafe-item fallback.

## Actual immutable Git source baseline (PG-01 GO)

- Source import commit: **`0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`**.
- Behavior-pack directory Git tree SHA-1: **`6a2f0a36551b82d8d3ca9b1859308e380f53b7b4`**.
- Resource-pack directory Git tree SHA-1: **`6d2ff1436b78c0df5679655f582dada3e6e1539b`**.
- Original archive SHA-256 and each 1.4.1 file SHA-256 are in [`BASELINE_HASHES.json`](../BASELINE_HASHES.json); see [Bundle 0 results](BUNDLE0_RESULTS.md).
- Template validator forbids `source.frozen_references` paths overlapping active source `addon`, so the original source is instead pinned by this immutable import commit and hash inventory while `source.frozen_references=[]`. A future separately stored frozen copy may use that mechanism.

## Future Git-frozen baseline gate

**Completed:** owner authorized source import in Bundle 0; all original file Git object hashes were checked. The historical import commit and BP/RP tree SHA values above are the frozen reference evidence; structural policy does not allow active `addon` to simultaneously be marked as its own frozen path. No runtime acceptance is inferred.

Retain owner-provided original, copied test-world backups and immutable release artifacts as separate types of evidence; do not call a syntax check a successful world migration.

