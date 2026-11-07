# Hart Logistics 1.4.1 — Baseline Registry

## BL-001 — Owner-supplied original add-on (external baseline)

- File originally uploaded: **HartMods_HartLogistics_1.4.1(1).mcaddon**
- SHA-256 of the supplied original archive: **439678c0d68849a43341c126ba6aaaa111317254e137123fde3ac531cec5d1dd**
- Source inspection date: 2026-11-06. Source-ready extraction exists as a conversation attachment **outside this GitHub repository**.
- Behavior pack UUID: **4854d263-05dd-4f79-a21c-7ba969295c2d**
- Resource pack UUID: **91316442-0f26-4fbb-88f3-2e39ea843a1a**
- Existing block identities: **hartsorter:sorter**, **hartsorter:collector**, **hartsorter:receiver**
- Source manifests declare **1.4.1**, minimum engine **1.26.50**, and dependency **@minecraft/server 2.7.0**.
- Queue/storage contract: q4 pages and journal with q2/q3 migration, Receiver capacity **250,000 items**, existing links, controls and persisted keys.
- Existing pack READMEs still say 1.4.0 in places; this is a documentation mismatch in the original files, not permission to change baseline bytes.
- Evidence state: supplied artifact fingerprint and SOURCE REVIEW / local syntax checks. **No Git tree is pinned** and no new runtime or release claim is made.

**Preservation requirement:** no lost 1.4.1 capability, item, identity, filter, linkage, redstone gate, hopper path or queue on upgrade.

Full current **ingress/egress path preservation matrix**: [1.4.1 ingress and egress](BASELINE_INGRESS_EGRESS_MATRIX.md). It enumerates supported and conditional Sorter, Collector, Receiver and Hopper routes, including item-entity ejection and direct-only unsafe-item fallback.

## Future Git-frozen baseline gate

After explicit owner authorization to import the unchanged 1.4.1 source, pin its actual Git tree SHA in project-blueprint.json under source.frozen_references and verify every original file against the source archive hash manifest. Until then, source.frozen_references intentionally remains **empty**. The word 'baseline' here does **not** mean this source already exists in Git or has passed new runtime acceptance.

Retain owner-provided original, copied test-world backups and immutable release artifacts as separate types of evidence; do not call a syntax check a successful world migration.

