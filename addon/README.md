# Intended Hart Logistics add-on source root

**Placeholder only: no gameplay source is committed here.**

The owner supplied the original Hart Logistics **1.4.1** mcaddon separately. A source-ready, unmodified extraction (behavior pack + resource pack) was prepared outside this repository, but it has **not** yet been imported. Import requires an explicit follow-up development decision.

When authorized, the intended layout is:
- behavior_pack/ — original manifest, scripts, blocks, recipes and loot tables.
- resource_pack/ — original manifest, textures, models, animations and localization.

Preserve original block IDs, pack UUIDs, q2/q3/q4 compatibility and all other 1.4.1 behavior. Do not put a re-serialized replacement or a stub implementation in place of the real source. See [baseline registry](../docs/BASELINE_REGISTRY.md) and [current state](../docs/CURRENT_DEVELOPMENT_STATE.md).

