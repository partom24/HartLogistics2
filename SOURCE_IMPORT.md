# Hart Logistics 1.4.1 — source import baseline

This archive contains the **unmodified unpacked source assets** from the supplied
`HartMods_HartLogistics_1.4.1(1).mcaddon`. The original BP/RP source files
(including all JSON, JavaScript, textures, models, LICENSE and NOTICE.md) have
not been rewritten. SHA-256 hashes are recorded in `BASELINE_HASHES.json`.

## Folders

- `addon/behavior_pack/` — Bedrock behavior pack, `scripts/main.js`, blocks,
  crafting recipes and loot definitions.
- `addon/resource_pack/` — Bedrock resource pack, textures, animation, model,
  display entity and localization.
- `tools/build_mcaddon.py` — standard-library rebuild helper (not part of the
  runtime add-on).

## Baseline identities (do not change during import)

- Behavior-pack UUID: `4854d263-05dd-4f79-a21c-7ba969295c2d`
- Resource-pack UUID: `91316442-0f26-4fbb-88f3-2e39ea843a1a`
- Version: `1.4.1`; minimum engine specified by manifests: `1.26.50`
- Runtime dependency: `@minecraft/server` `2.7.0`
- Block identifiers: `hartsorter:sorter`, `hartsorter:collector`,
  `hartsorter:receiver`
- Persisted queue state includes q2/q3 compatibility and q4 storage. Do not
  rewrite queue keys, world properties, block state, or migration logic without
  explicit migration and regression tests.

## Import into the existing HartLogistics2 repository

1. Copy `addon/` and `tools/` into the repository. Do not remove the existing
   template policies, CI, or `AGENTS.md` before they are deliberately adapted.
2. Set `project-blueprint.json` to describe HartLogistics2 rather than the
   inherited blueprint: declare `source.active` as `addon`, select the
   `minecraft-bedrock` platform profile, and replace its example milestone,
   status, evidence, and history with truthful Hart Logistics records.
3. Preserve the original pack UUIDs and identities to avoid breaking old
   worlds. Never bump pack versions solely because files were imported.
4. Run structural validation of the adapted contract, then test the addon
   itself separately in an appropriate Bedrock test world/server before
   claiming runtime acceptance or distributing a new release.

## Rebuild locally

From the source archive root:

```bash
python tools/build_mcaddon.py
```

This creates `dist/HartMods_HartLogistics_1.4.1.mcaddon` using the two
source pack directories. It is a **repackaging**, not a gameplay change or a
validated new release.

## Baseline audit notes

- Pack manifests and `scripts/main.js` identify version 1.4.1, but the two
  bundled pack READMEs still refer to 1.4.0 and contain some outdated setup
  descriptions. They were deliberately preserved unchanged in this baseline.
- The existing README documents a queue transport limitation for some
  metadata-rich/non-stackable items when safe direct transfer is unavailable.
- Offline review checked 20 JSON parse operations, JavaScript syntax,
  pack linking and 44 PNG file headers. No Bedrock runtime/integration test
  was performed as part of this source import preparation.
