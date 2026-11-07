# PG-15 LAB-only pre/post native-move interrupted handoff test

**Status: isolated candidate; not installed. Actual BDS evidence is pending.** Do not run commands until the guarded 1.5.4 upgrade is authorized and succeeds.

## Purpose and safety boundary

PG-14 owner-observed one-cobblestone chest-to-chest transfer and matching SETTLED journal survived a **normal LAB BDS restart**, and PG-14 cleanup was already **CLEAN PASS** (HL-E-039). PG-15 tests the two unresolved **interrupted intent windows** deliberately, **without killing a server**:

- **PRE cut:** save a verifiable HANDOFF_INTENT and deliberately skip the native item move. After a normal restart, the item must still be in Chest A, and the journal must report **HOLD/no retry**.
- **POST cut:** save the same class of HANDOFF_INTENT, perform **one** native Container.moveItem and physically verify the one cobblestone reached Chest B, but deliberately **skip SETTLED**. After a normal restart, the item must still be in B and the journal must report **HOLD/no replay/auto-settlement**.

These are controlled omissions that simulate **application-level interruption points**. They are **NOT** forced process crashes, power-loss tests, atomic disk-write proofs, verified unique physical item identity, general Bulk Storage or Q5 readiness. No actual BEDROCK server has yet run PG-15.

Only one experiment-owned world dynamic property, hartlogistics:pg15_intent_cut_v1, is created/cleared. PG-08 menus, PG-13 shadow, PG-14 completed custody helper and Q4 continue from accepted earlier versions. Original 72-file 1.4.1 in addon/ and every non-Hart pack stay unchanged.

## Exact LAB-only install gate

- Authorized LAB: C:\Servers\Thomas_MCBedrock - Copy (2), world ThomasServer, BDS 1.26.63.1. **Production C:\Servers\Thomas_MCBedrock never accessed.**
- Expected installed predecessor: exact compiler-generated **1.5.3-LAB-PG14** BP/RP hashes and world Hart pack registrations. Version-only matching is insufficient: mismatched file hashes REFUSE.
- New LAB candidate **1.5.4-LAB-PG15**; same Hart Logistics BP/RP UUIDs, stable server dependency 2.7.0 and server-ui 2.2.0; no new custom blocks/items.
- Owner-run launcher at candidates/pg15/Start-HartLogistics-PG15Lab.ps1 with source-only Plan, read-only CheckLab, stopped-server Install -Apply and exact-tag backup/rollback. A new install backup tag must be retained along with all PG08/PG13/PG14 backups. Nothing installs just by merging Git.
- Do not enable cheats or experiments, change world settings, force-kill the server, or run any other custody/queue command during a pending PG15 cut.
- **Do not roll back or remove PG15 while its INTENT marker is pending.** A pack rollback restores pack files/registrations, not world dynamic properties; removing the commands before controlled cleanup could strand the PG15 marker. Preserve the LAB and report unexpected HOLD rather than forcing rollback or deleting world files.

## Reuse existing two test-only single chests

Owner's original isolated stonebrick test hall, near player (-953,69,-800). Both chest coordinates must be completely free of other mechanisms, separated from other chests, with air on five adjacent sides and solid inert floor:

| Chest | Absolute block coordinates | Before each cut |
| --- | --- | --- |
| A, source | (-955, 69, -804) | Exactly 1 plain ordinary cobblestone in slot 0; 26 other slots empty |
| B, destination | (-951, 69, -804) | All 27 slots empty |

Never replace blocks at those coordinates if they are now occupied by unrelated equipment. Use a disposable test cobblestone, no valuables. If old chests have been removed, two test-owned isolated **single** vanilla chests can be placed as in PG-14. The code refuses double chests, unknown slots, nearby automation, wrong player dimension/area, foreign items, or uncleared PG-14 custody markers.

## Check A — stopped BEFORE native move (one restart)

1. Start LAB BDS with successfully installed PG15 1.5.4. Confirm both test chests and one cobblestone in A slot 0 only.
2. While standing in the hall, enter:

       /hartlogistics:cutpre

   Expected **PRE CUT PASS** and **INTENT persisted; intentionally NO item moved. HOLD, NO RETRY**. No physical move was attempted.
3. Stop **LAB BDS only normally**, restart, rejoin and enter:

       /hartlogistics:cutaudit

   Expected **RESTART CUT AUDIT PASS: PRE intent persists; observed A_ONE_B_EMPTY. Recovery HOLD, no move, no retry, NO auto-settlement.**
4. After photographing the result, **manually remove the one cobblestone from Chest A**, keeping B empty. Then enter:

       /hartlogistics:cutclear

   Expected **CLEAN PASS**. This clears only the PG15 test marker. If either audit/clear yields HOLD unexpectedly, **stop**, preserve journal/chest contents and share evidence; don't force repeated transfer or manual repair.

## Check B — stopped AFTER native move, BEFORE settlement (second restart)

1. With the first PG15 cut ledger already **CLEAN PASS**, place exactly one disposable ordinary cobblestone in Chest A slot 0 again, with B completely empty.
2. Run **once only**:

       /hartlogistics:cutpost

   Expected **POST CUT PASS: 1 test cobblestone moved A to B; INTENT intentionally not SETTLED. HOLD, NO RETRY.** This is the **only** physical item move in PG15 and only when explicitly requested.
3. Stop **LAB BDS only normally**, restart and rejoin. Run:

       /hartlogistics:cutaudit

   Expected **RESTART CUT AUDIT PASS: POST intent persists; observed A_EMPTY_B_ONE. Recovery HOLD, no move, no retry, NO auto-settlement.** There should be exactly one cobblestone in Chest B and none in Chest A.
4. After photographing, manually remove the single cobblestone from Chest B. With both chests empty, enter:

       /hartlogistics:cutclear

   Expected **CLEAN PASS**. No second move, no third restart, and no PG14/PG13 cleanup repeat.

## Stop rules and evidence grading

- **Any HOLD other than the explicitly expected recovery HOLD, incorrect source/destination content, permission error, unloaded chunk, failed journal write, missing marker, or script exception:** stop and preserve evidence. Do not retry cutpost or clear unless a successful separate-session audit and empty chests were independently established.
- A premature second cut returns **HOLD** and changes nothing. A duplicate clear after CLEAN PASS returns **HOLD**, as expected for an already-cleared ledger.
- Provide one screenshot each of PRE CUT, PRE restart audit, PRE CLEAN, POST CUT, POST restart audit and POST CLEAN; BDS script error excerpt if any. These establish only deliberate-cut clean-restart safety and refusal of automatic replay. The original 1.5.3 normal-restart acceptance remains independent.
- True abrupt BDS termination, power loss, concurrent/foreign access, atomically linking physical inventories with journal, one-of-a-kind item provenance, metadata-rich MR and production Bulk/Transporter are **STILL NOT ACCEPTED** by this gate.
