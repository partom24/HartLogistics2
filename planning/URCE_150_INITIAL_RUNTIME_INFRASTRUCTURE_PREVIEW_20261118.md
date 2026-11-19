# URCE 1.5 — initial player-facing infrastructure preview (NOT cargo-routing acceptance)

**Development branch:** \`dev/urce-150-runtime-20261118\` from owner-authorized source-only \`planning/urce-150-20261117\`. **Status:** source-created candidate, not yet BDS-tested or accepted. **Deployment:** no owner LAB or production changes by this commit.

## What this build actually does

- Preserves original HartLogistics 1.4.2 sorting, Hopper, Collector, Receiver and Q4 runtime behavior and code, adds only one imported read-only UI/graph preview.
- Adds **dedicated Transporter and Bulk Storage block definitions, dedicated geometry files, and unique independently drawn textures**; not recolored Sorter/Collector/Receiver assets.
- Player can place **any layout** of Transporters and inspect them by ordinary interaction. The scanner follows adjacent visible Transporter blocks over arbitrary coordinates, yields after up to 12 nodes per tick, reports visible pipes/endpoints, warnings on loops and unloaded chunks. No per-block inventory, journal or cargo movement.
- Bulk Storage is an **explicit inactive preview shell**. Its status visibly says no inventory/custody is active. Do NOT use this build to test Bulk contents or URCE end-to-end routing. An inaccessible/unloaded area is reported as incomplete, never proven connected.
- Pack version advances both BP and RP from 1.4.2 to **1.5.0** on this separate development branch while preserving pack and module UUIDs and the pinned \`@minecraft/server 2.7.0\`.
- \`runtime/tests/urce_150_readonly_runtime.test.mjs\` mocks the actual event subscription, player actions and block scans across freely chosen placements. No fixed physical rig or fixed item acceptlist is imposed.

## Boundaries and next development

This is a **playable infrastructure visualization slice only**: the visible adjacency readout is NOT directed route authority, a native item admission certificate, the owner-approved Filter/Auto/Bulk fallback implementation, or proof of any Transporter item throughput. The 1.4.2 logistics writer remains unchanged; true URCE custody integration and Bulk storage still require fault-safe source/target handoffs, migration and conservative HOLD. Native MR movement and PG42 entity inventory have prior scoped owner-LAB proof and should not be re-probed solely for feasibility.

**Player-facing acceptance:** if the owner later separately authorizes LAB installation, they may build any valid layout and click Transporters/Bulk anywhere. Check block visuals, place/break, adjacent endpoint counts, error handling, chunk unload and responsiveness under normal activity. No mandatory exact XYZ, column count or specific item IDs. Old 1.4.2 functionality remains a regression obligation; an actual BDS session is needed before claiming a playable runtime PASS.

**Safety:** This preview never changes an inventory, creates a queue, forwards a native item, or serializes MR cargo. Do not deploy to a protected existing world or production; use the guarded owner LAB updater/backup process only after permission, with the exact versioned commit.
