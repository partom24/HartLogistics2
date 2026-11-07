# PG-13 LAB — Shadow Journal Persistence Gate (BDS 1.26.63.1)

**Status: prepared for one owner-run LAB-only acceptance session after guarded deployment; NO actual PG-13 BDS evidence yet.**

## Exact statement of what is being tested

Whether **the stable Bedrock `@minecraft/server 2.7.0` world dynamic-property store** can retain a small, checksummed, two-step **simulated ordinary Transporter transaction record** after a **normal LAB server stop/restart**, and whether the reloaded script correctly reports **HOLD_AMBIGUOUS_HANDOFF** rather than assuming an item moved.

**This is a prerequisite for actual Bulk Storage custody, not a test of real item transfer.** There are **zero** new blocks, Hoppers, Sorters, storage inventories, items or routing modifications. The existing PG-08 1.5.1 menu behavior stays intact. It is deliberately not a forced-kill crash-atomicity test.

The commands are restricted to an operator player standing in the owner's previously measured isolated LAB Overworld room. They use `cheatsRequired:false` and never enable cheats/experiments. Source reference: `candidates/pg13/shadow_overlay.js`.

## Installation and boundary

- **Actual BDS:** 1.26.63.1 with client 26.63. LAB root **`C:\Servers\Thomas_MCBedrock - Copy (2)`**, world **`ThomasServer`**. Production `C:\Servers\Thomas_MCBedrock` is strictly prohibited.
- **Starting pack:** expected PG-08 `1.5.1-LAB-PG08` (exact compiler-generated BP/RP hashes). Any other pack version or modified content causes installation refusal.
- **New derived candidate:** `1.5.2-LAB-PG13` with same Hart Logistics UUIDs and same `@minecraft/server` 2.7.0 and UI 2.2.0 APIs. Only the compiled behavior script and two pack manifests differ from the prior installed PG-08. Protected original `addon/` 1.4.1 and other add-ons remain unchanged.
- **Git-backed owner launcher:** `candidates/pg13/Start-HartLogistics-PG13Lab.ps1`, modes **Plan**, **CheckLab**, **Install -Apply**, **Rollback -BackupTag lab-... -Apply**; separate clean checkout, exact head pin, stopped LAB BDS, exact installed-pack hashes, transactional pack/registration backup and rollback. The launcher does not automatically update the world or restart Minecraft.
- **Do not install/rollback until the owner explicitly authorizes the bounded LAB operation.** The installer preserves unrelated world registration comments and packs. Existing PG-08 backup `lab-5af88e18cff3` is retained; the PG-13 install prints a **different** backup tag that restores PG-08 on rollback. Pack backup does not undo subsequent world dynamic-property edits (which may be explicitly cleaned by `shadowclear`).

## Exactly where

From a standing position **inside the existing room** near **(-953, 69, -797)**, in `minecraft:overworld`. Valid room bounds are approximately X `[-968.7,-937.0]`, Y `[68,73]`, Z `[-817.7,-776.0]`. No test blocks need to be placed. No old PG-08 Collector/Receiver rig needs to be rebuilt.

## The three focused checks

1. **Prepare shadow only.** With LAB BDS running and no old PG-13 test markers, run in Minecraft chat:
   ```text
   /hartlogistics:shadowbegin
   /hartlogistics:shadowintent
   ```
   Expected: green/gold `PG13 LAB Shadow` text containing **BEGIN PASS** and **INTENT PASS**, each explicitly stating **No items moved**. Both writes get immediate readback checks; command registration requires operator permission but **not cheats**. If either command is unknown or reports `HOLD` unexpectedly, stop and retain evidence without repeating writes.
2. **Ordinary LAB restart and readback.** Stop **LAB BDS only** normally, restart it, rejoin the same room, run:
   ```text
   /hartlogistics:shadowcheck
   ```
   Expected: **`RESTART READBACK PASS: reserved + intent persisted; recovery HOLD_AMBIGUOUS_HANDOFF. No items moved.`** This means the script instance changed and both checksummed dynamic-property keys survived a normal server restart. **Same session** is not a pass; corrupted/partial entries must report HOLD, not recreate data.
3. **Cleanup only this diagnostic state.** After capturing the result, run:
   ```text
   /hartlogistics:shadowclear
   ```
   Expected: **`CLEAN PASS: only PG13 shadow keys cleared; no items moved.`** This removes only `hartlogistics:pg13_shadow_reserve_v1` and `hartlogistics:pg13_shadow_intent_v1`. No `hartsorter:` queue, native inventory, registration or block state is touched.

## Pass/stop criteria

**PASS only if** both shadow writes return successful readbacks, the script on the restarted LAB reads the same pair and explicitly reports `RESTART READBACK PASS` plus **HOLD_AMBIGUOUS_HANDOFF**, and scoped cleanup succeeds. Show screenshots of the begin/intent result and post-restart check; supply BDS console script errors if any.

**STOP and report** if command unavailable/permission error, checksum or missing state HOLD, unexpected changes to established PG-08 links/menus, missing scripts, or any item movement attributed to this test. Never enable cheats/experiments or repeatedly re-arm uncertain records.

**What this does NOT prove:** that two dynamic property writes are atomic, that power-loss or `taskkill /f` durability is safe, that a real source ItemStack was debited or destination credited, that a new Bulk/Transporter block exists, that controller ownership/region election is solved, or that Q5/native MR migration can proceed.

## Evidence level and next gate

- Build/Node VM/synthetic installer CI green → **OFFLINE candidate proof only**.
- Actual BDS restart + screenshot → **world dynamic-property persistence under clean restart**.
- Only after this gate: research/implement a **safe and authoritative physical custody reconciliation** before any real item-moving candidate. Do not treat this diagnostic proof as a green light for Bulk Storage release.
