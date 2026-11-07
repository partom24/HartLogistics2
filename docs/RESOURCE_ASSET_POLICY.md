# Hart Logistics 2 — New Block Resource Asset Contract

**Owner-confirmed design requirement: 2026-11-06. Planning only.**

## No reuse of existing assets

**Both new blocks**, Hart Bulk Storage and Hart Transporter, must use original dedicated block-specific resource assets. **No current Hart Logistics 1.4.1 Sorter, Collector or Receiver model, texture, icon, geometry, material mapping or block-specific visual asset may be copied, reused, aliased or simply recolored** under a different name. Existing 1.4.1 resource files and references must remain untouched.

The phrase "bulk sorter" is provisionally interpreted as the already-planned **Bulk Storage** block; this requirement does **not** authorize creating a third block.

| Visual component | Bulk Storage | Transporter |
| --- | --- | --- |
| In-world shape | New machine silhouette immediately distinguishable from Collector and Receiver | Original narrow plumbing/pipe shape with 4×4-pixel visual cross-section in a standard 16×16 grid |
| Geometry/model | Unique new block geometry; no reused legacy geometry IDs | Unique model with six-way connectivity and original junction states |
| Textures/UVs | Dedicated new textures and UVs, not cosmetic recolors of existing blocks | Dedicated pipe textures, fittings and end-cap visuals |
| Inventory item/icon | New original recognizable Bulk Storage icon | New original Transporter icon |
| Special appearance | Controller/extender differentiation is possible but **not yet decided** | Straight, elbow, T, cross and multiway variants are required by connectivity; exact aesthetics TBD |
| Preservation | Existing Sorter, Collector and Receiver visuals remain unchanged | Existing Sorter, Collector and Receiver visuals remain unchanged |

**Acceptance gate:** visually review both placed new blocks *beside* the three original blocks and compare their inventory icons, normal viewing distance, orientations and visual states. **Bulk Storage must never be mistaken for Collector or Receiver.** Transporter must clearly read as piping. Verify existing resource registrations do not change and neither new block references any original block-specific asset.

**Asset preparation:** after authorized source import, inventory/pin hashes and resource references of original block textures, models, icons, animations and manifests; create new uniquely named and namespaced assets. Do not alter originals to accommodate the additions.

**Unresolved art decisions:** Bulk Storage palette/silhouette/details; whether the controller has a visible indicator; pipe joint/cap design, visual flow effects and collision/hitboxes. No artwork has been created and no gameplay implementation is authorized.

Manual visual checks in the LAB must begin with a [complete READY test rig card](TEST_RIG_CONTRACT.md), not unannounced setup or spacing requirements.
