# PG-16 — Conservative abrupt-crash and exclusive-custody gate (OFFLINE)

**Status: source-only.** 32 Node scenarios. No new Minecraft pack, ItemStack move, server/world access or experiments. Installed 1.5.4-LAB-PG15, the owner's HL-E-041 results, and protected 72-file baseline 1.4.1 remain unchanged.

## Why normal-restart PG-15 is not sufficient

PG-15 owner evidence includes an actual one-cobblestone POST move with an unsettled HANDOFF_INTENT, surviving normal LAB BDS restart as HOLD/no retry, then a successful test-marker cleanup. The PRE run was reconstructed after manual removal and restoration of the original test cobblestone; it did not prove continuous physical provenance. No real sudden process failure/power loss or exclusive foreign-writer exclusion was demonstrated.

The documented stable Bedrock Container.moveItem moves one slot across containers and can throw. World.setDynamicProperty and setDynamicProperties operate separately on stored world properties. Neither documented API describes a **single crash-atomic transaction spanning the physical chest inventory and that journal property**, nor an exclusive lock over player and foreign add-on access to vanilla chests.

Official references:
- https://learn.microsoft.com/minecraft/creator/scriptapi/minecraft/server/container
- https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/world?view=minecraft-bedrock-stable

This is lack of a demonstrated guarantee, NOT a claim that Bedrock has actually lost or cloned an item.

## Executable source-only contracts

[custody_crash_gate.mjs](../candidates/transport/custody_crash_gate.mjs) and [32 Node tests](../tests/test_transport_custody_crash_gate.mjs):

1. **Admission gate.** Requires one exact ordinary test-item identity, a complete loaded local graph and current-epoch single controller, exact 27-slot source and destination snapshot, physically exclusive ownership of both endpoints, live fencing of competing writers, and independently established journal/inventory crash-atomic persistence. A player-accessible **minecraft:chest** always yields REFUSE with reason exclusive_physical_custody_not_demonstrated, no matter what the claimant says.
2. **Conservative abrupt-termination model.** Enumerates 20 hypothetical saved-state combinations at BEFORE_INTENT, INTENT_WRITTEN_BEFORE_MOVE, MOVE_RETURNED_BEFORE_SETTLEMENT, and SETTLEMENT_WRITTEN cutpoints. It deliberately allows old/new source and destination contents to be saved independently. **This is an overapproximation of potentially unsafe outcomes, not a reproduced Bedrock failure or a claim that every combination occurs.**
3. **Non-mutating recovery classification.** HANDOFF_INTENT is always HOLD/no replay; missing or apparent duplicate item counts HOLD. A matching SETTLED marker, empty source and single target item yields OBSERVATION_ONLY, not an authority to settle/credit, repeat a debit, clear a marker or release capacity.
4. **Indistinguishable-history witness.** Genuine native movement of the original cobble into B and a foreign writer removing it from A and adding a different but identical cobble to B yield the same visible item ID, quantity, positions and HANDOFF_INTENT. There is no unique provenance in those observations.
5. **No production grants.** Even a fully asserted synthetic "engine-enforced" proof profile returns only MODEL_PREREQUISITES_ONLY. Test data can never authenticate itself or open a real-world transaction.

## Crash cutpoint matrix

| Cutpoint | Journal values modeled | Possible saved A / B item counts | Automatic recovery |
| --- | --- | --- | --- |
| Before intent | EMPTY, RESERVED | 1 / 0 | None |
| Intent written, move omitted | RESERVED, HANDOFF_INTENT | 1 / 0 | None: HANDOFF_INTENT HOLD |
| Native move returned, SETTLED omitted | RESERVED, HANDOFF_INTENT | 1 / 0; 0 / 1; 0 / 0; 1 / 1 | None; missing or duplicate HOLD |
| SETTLED written | HANDOFF_INTENT, SETTLED | 1 / 0; 0 / 1; 0 / 0; 1 / 1 | At most OBSERVATION_ONLY, no mutation |

The 0 / 0 and 1 / 1 traces are explicitly modeled **independent saved snapshot outcomes** that have NOT been observed in BDS. They demonstrate why a crash-safety claim needs proof of save ordering/atomicity, not merely source review or a clean restart.

## Decision and next engineering boundary

**PG-16 design-level result: physically spendable ordinary-item Bulk banks are STILL BLOCKED.** A test-owned vanilla chest suffices for API mechanics but is not an exclusively owned storage cell. A persistent dynamic-property marker is not a documented atomic commit spanning that cell. Safe existing Q4 behavior, PG-08 menus, standalone graph rules and hypothetical capacity accounting remain separate, unaffected milestones.

The next engineering task is to identify an enforceable, Bedrock-stable **single-writer item custody boundary** (or an engine-supported atomic physical move + journal commit), and then verify it in an isolated, disposable LAB test only if credible. No owner commands, server crashes, new pack install, or test rig are currently justified by this offline model.
