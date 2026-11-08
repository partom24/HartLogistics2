# PG27 — Transporter world-axis and name correction

## Owner evidence (HL-E-072)

PG26 installed from `6738497fd7077831abd316e257a4281d97fa0ae8`; owner install output reports backup **lab-d16a31ba5a8e**. Supplied normal-start log identifies BDS **1.26.63.1**, BP 1.5.9 and `[Hart Logistics 1.5.9-LAB-PG26] ready`. The owner's later screenshots show the distinct new pipe and held icon, but horizontal end segments do not meet adjacent pipes on the reported east/west axis. `/give` feedback displays `tile.hartlogistics:transporter.name`.

Latest visible status: **664 Sorters / 56 Collectors (45 linked, 11 unlinked) / 35 Receivers**, Q4 paged 35/35, **sorter clear | queue clear**. Receiver count was previously 34; this is recorded as observed topology, not attributed to an error or silently described as unchanged. No Transporter item transfer was demonstrated. The original route card's new Sorter is not established by these pictures; do not infer that the visible Receiver is a supported pipe endpoint.

The log's caught filter-display `LocationInUnloadedChunkError` warnings concern unchanged legacy `syncDisplay`/`reconcileDisplays` code, byte-identical across PG25/PG26. They do not establish this pipe defect's cause. The raw log contains unrelated identifiers/configuration and is not committed; only this sanitized summary is retained. An unrelated missing configured pack is outside this change.

## Cause and bounded correction

PG26 world-neighbor detection correctly uses world east +X and west -X. Visibility flags bind the matching named bones. The authored geometry instead put the `east` bone on **positive model X**, and `west` on negative model X. Bedrock block geometry reflects model X into world X; the two end arms therefore render away from their neighbors. A central junction with both flags true can look plausible while one-sided ends leave conspicuous gaps. Y/Z arms are already aligned.

PG27 derives PG26 and changes exactly five generated pack files:

- World geometry: east origin `[2,6,-2]` → `[-8,6,-2]`; west the reverse. The dedicated inventory model, texture, UVs, other arms and visibility expressions are unchanged.
- Transporter block: explicit English `minecraft:display_name: "Hart Transporter"` avoids the raw RP translation key in server feedback. The only existing locale is en_US; RP language bytes remain unchanged. This is not a new localization system or a claim that the client's language file failed to load.
- BP/RP manifests and main-script version literal: **1.5.10-LAB-PG27** ensures an identifiable update and updated resource-pack version. Stable API requirements, UUIDs, IDs and states remain unchanged.

All actual routing, registration callbacks, topology admission, redstone, filtering, journals and recovery are **byte-identical** apart from that version literal. PG26's bounded native whole-stack route remains the sole implementation; no second writer, hotfix toggle, debug command or temporary runtime instrumentation.

The PG26 builder/resources are unchanged because the installed predecessor's exact hashes are required for safe upgrade/rollback. PG27's small derived builder and version-specific deployment adapter reuse the established stopped-LAB hash/registry transaction machinery. This retained predecessor chain is intentional deployment provenance, not a parallel gameplay implementation. Baseline `addon/` remains 72/72 unchanged.

## Offline evidence (HL-E-073)

- Seven builder checks require the exact five-file delta, unchanged gameplay/item model/texture/state, correct version/API/UUID preservation, deterministic output, no overwrite and fail-closed visual anchors.
- Three Node regression cases execute the **actual compiled callback** and generated visibility expressions, then transform model bounds into world coordinates. They cover all 64 masks at positive/negative coordinates, reproduce PG26's reversed east-only arm, require PG27's neighboring east/west end faces to meet, and exercise X-neighbor removal/replacement. These cross the script/resource boundary missed by PG26's separate flag/model assertions; they do not emulate BDS rendering.
- Thirteen synthetic deployment cases exercise exact PG26→PG27 upgrade, rollback, registry comments/unrelated mods, pack/hash/world/backup drift, mid-transaction restoration and unsafe CLI refusal. No actual server/world access.
- Full local **299 Python + 468 Node** pass; generated JS syntax and normal/release structural validators pass. The structural release check does not authorize a release.
- Final commit and GitHub Linux/Windows CI are recorded in the delivery PR. PG27 target-runtime result remains **NOT RUN** until owner evidence arrives.

## Next owner checkpoint

Use the [two-check existing-rack card](../candidates/pg27/TEST_SESSION.md): update through the versioned guarded launcher, verify name/seams, then east/west removal/replacement. No new construction or repeated PG25 transfer. PG26 ordinary/redstone routing remains pending and separate. New-route inputs stay empty while visual acceptance is outstanding; existing Receiver queues need no draining. No production operation or environment publication.


## Owner closeout — HL-E-074

**Scoped visual success, 2026-11-08:** owner confirms east/west corrected and connections to chests, barrels and double chests pass; screenshots show those connections. Running PG27 and both clear journals are screenshot-observed. Delivered source e6442137f238ee55201dafa05068fe1047ea2f43; [final main CI 12/12 PASS](https://github.com/partom24/HartLogistics2/actions/runs/42499886661). These results supersede the pending visual instructions above. Do not repeat these checks.

No item transfer, name-feedback or explicit neighbor remove/replace result is separately established. Ordinary route/redstone remains pending. Receiver extraction is unimplemented; double-chest extraction remains guarded out. Next steps and acceptance boundaries are in the [current handoff](CURRENT_DEVELOPMENT_STATE.md). No temporary runtime instrumentation to remove; keep the owner's reusable rigs and backups.

## Later ordinary route owner handoff (HL-E-076)

Following the scoped **visual** closeout HL-E-074, [closed PG28 PR #48](https://github.com/partom24/HartLogistics2/pull/48) includes a distinct owner-reported PG27 LAB result: a barrel→Transporter→Sorter ordinary movement after lever unpowering, ordinary mixed cargo shown in output, enchanted book retained at the source barrel, and PG27 1.5.10 status with 665 Sorters / 56 Collectors (45 linked) / 35 Receivers, Q4 paged 35/35 and both journals clear. This is a qualified **OWNER-REPORTED SCOPED RUNTIME OBSERVATION**. The handoff references screenshots not directly available to the documentation channel, so exact pre/post amounts, pause behavior, metadata fidelity and broader integration acceptance are not inferred. Earlier visual acceptance remains separate and fully retained.

PR #48's separate proposed Receiver Q4→Transporter source was **closed unmerged**; its source-only tests do not establish that Q4 was consumed on PG27 or that Q5 is active. Later read-only Q5 source work and the uninstalled PG29 draft are covered by HL-E-078–082 in the [evidence register](ENGINEERING_EVIDENCE_REGISTER.md).
