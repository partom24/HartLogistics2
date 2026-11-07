# Hart Logistics 1.4.1 — imported original source

**The original, unmodified 1.4.1 source is present in this repository as of Bundle 0 (2026-11-07).** This directory is no longer a placeholder.

- `behavior_pack/`: exact original 1.4.1 BP manifest, `scripts/main.js`, blocks, recipes, loot definitions and license files (**16 files**).
- `resource_pack/`: exact original 1.4.1 RP manifest, original textures/models/animation/localization and license files (**56 files**).
- Baseline import commit: `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`.
- All 72 files match the owner-uploaded original archive **byte for byte** as proven by Git blob SHA-1 comparisons; per-file SHA-256 and original archive hash are pinned in [BASELINE_HASHES.json](../BASELINE_HASHES.json).
- Original Block IDs: `hartsorter:sorter`, `hartsorter:collector`, `hartsorter:receiver`; manifest UUIDs and 1.4.1 versions unchanged.

**Do not rewrite or normalize the imported baseline files merely for cleanup.** Original pack README version references may still say 1.4.0; those historical source bytes are intentionally preserved. Future changes need dedicated owner authorization, a versioned migration strategy and non-regression evidence. New Bulk Storage/Transporter assets must never reuse old block assets.

Bundle 0 prepared a separate [LAB updater](../scripts/hartlogistics_lab_updater.py) and [permanent offline synthetic tests](../tests/test_hartlogistics_lab_updater.py), but **no LAB installation or in-game test was performed**.

See [Bundle 0 results](../docs/BUNDLE0_RESULTS.md), [baseline registry](../docs/BASELINE_REGISTRY.md) and [1.4.1 route matrix](../docs/BASELINE_INGRESS_EGRESS_MATRIX.md).
