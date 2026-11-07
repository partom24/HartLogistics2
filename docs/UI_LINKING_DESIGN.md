# Hart Logistics 2 — Menu-Driven Collector/Receiver Linking

**Owner-selected design (2026-11-06). Planning only; not implemented.**

## What changes

The Collector → Receiver linking action will move to an explicit **Link / Relink Receiver** button in a Minecraft configuration menu, rather than automatically arming a link on Collector placement or ordinary standing interaction. **Saved links and logistics behavior are retained.** This supersedes the old linking *gesture*, not its persistence or transport function.

## Source baseline / feasibility

- 1.4.1 source `behavior_pack/scripts/main.js`: `selectCollector` selects and stores a per-player pending Collector; `useReceiver` commits it (approximately lines 2058–2092). Collector placement currently auto-selects (approximately 4010–4023).
- The current `beforeEvents.playerInteractWithBlock` cancels normal standing Collector/Receiver interaction, schedules work with `system.run`, and deliberately **leaves sneak-interact alone** so a player can place adjacent Hoppers or blocks (approximately lines 3876–3980).
- The original manifest declares `@minecraft/server` **2.7.0**, but **does not declare `@minecraft/server-ui`**. A compatible stable server-ui 2.x dependency must be added and tested when code implementation is authorized.
- Minecraft `@minecraft/server-ui.ActionFormData` supports button-based menus; `MessageFormData` supports yes/no confirmations. These forms are shown in non-restricted execution, e.g. from `system.run` after canceling the intercepted event. This makes the plan technically plausible; in-game UI/native-container coexistence remains unverified on **server 1.26.63.1 / client v26.63**.

## Proposed user workflow

1. **Standing interact with a Collector** opens **Hart Collector** menu. Show linked Receiver identity (or unlinked), status, **Link / Relink Receiver**, **Unlink Receiver** (confirm), and Close.
2. Pressing **Link / Relink Receiver** arms a **per-player pending Collector**. Merely opening or closing the menu must not modify stored links.
3. Interact with the intended **Receiver**. Show a confirmation with the Collector and Receiver identities; do not immediately relink.
4. On confirmation, **revalidate** source/destination and ownership, then persist. Existing link stays unchanged if canceled, menu fails, stale block is chosen, or writing state fails. Report success only after persistence.
5. Interacting with a Receiver without a pending link opens its own status menu, including linked Collectors and Close. Menu entries may grow later but should remain simple.
6. **Placement** registers a Collector or Receiver and presents a short hint; placement alone does **not** arm linking.
7. **Sneak-interact** continues to permit normal block/Hopper placement against either block. Existing Sorter item-frame filtering, rail-mode controls and redstone behavior are untouched.

## Native MR inventory interaction constraints

- Menu buttons manage linking and show read-only status; they are not a claim that `ActionFormData` can display raw native inventory slots.
- When Collector/Receiver become native MR storage containers, the block's default inventory interface must **not race or replace the link menu**. Cancellation of standing interaction before deferred form display is the candidate path; verify on the actual 26.63 LAB runtime.
- Do not promise an **Open Native Inventory** button until there is a proven, supported API to do so. MR slots should remain safe even when a form is rejected, canceled or another UI is open.
- Require stable UI dependencies and the owner's accepted experiment policy; no implicit world experiment changes.

## Compatibility, safety, and testing

- Existing 1.4.1 saved Collector↔Receiver links load unchanged and display correctly. Previously linked networks continue transporting items when nobody opens a menu.
- Separate pending sessions by player; prevent stale sessions, overlapping forms, double-confirmation and one player's actions from modifying another's link. Exact session expiration and authorization policy still need design.
- Unlink and relink require explicit confirmation; no silent links on placement, click or cancellation. Fail closed if link persistence is uncertain.
- **What is being tested:** Menu opens and Link button reliably selects and confirms the intended Receiver without losing any existing link. **Reused evidence:** Old 1.4.1 routing/identity mechanisms; no arbitrary-item transport retest. **New evidence:** UI display, cancel/relink, saved-world link migration, sneak-placement, multiplayer and native MR inventory conflicts.
- If manual in-world testing is necessary, use only LAB `C:\Servers\Thomas_MCBedrock - Copy (2)`, with a complete [READY rig card](TEST_RIG_CONTRACT.md) giving exact block counts, topology, placement, distances and expected outcomes.

## Open choices

Authorization to link/unlink (all players vs operators/owners); pending session expiration and concurrent relink policy; optional status screens; whether another explicit gesture is useful for access to MR storage. These details do **not** block source import or documenting this chosen workflow.

**No UI code, manifest dependency, gameplay source, server file or world was changed by this document.**
