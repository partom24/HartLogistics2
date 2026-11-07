# PG-08 LAB menu smoke session — NOT READY for owner placement yet

**Target:** BDS 1.26.63.1, client 26.63; existing owner LAB clone
`C:\Servers\Thomas_MCBedrock - Copy (2)\worlds\ThomasServer`.
Never use production, enable experiments, reset the clone, or install the old PG-03 probe.

**Actual owner LAB preflight evidence (2026-11-07):** Owner ran `CheckLab` against the already-identified cloned LAB `ThomasServer` at pinned source SHA `82adedea7f1e79284118765f596ae2ac0bbe01d8` using Python 3.12. Console: `LAB PREFLIGHT PASS: READ-ONLY. Nothing installed.` This resolves the earlier preflight blocker only. **No install was done, and this manual rig is still NOT READY** until explicit approval of the narrow LAB-only Hart Logistics BP/RP install and a confirmed safe absolute Overworld XYZ. Do not start placing blocks or execute Install on the strength of a read-only preflight alone.

## What we will prove

**What:** A Collector menu explicitly links, relinks and unlinks a Receiver, with real confirmation/cancellation, saved-world persistence, and normal sneak-placement. **Why now:** It changes only the Collector/Receiver UI/linked-ID write, not the MR native storage blocked by PG-03.

**Previous evidence:** 1.4.1 original routes and all 72 BP/RP source bytes preserved; GitHub CI runs Node menu mocks and Python/Linux/Windows synthetic installer/rollback tests. Those are **not BDS menu acceptance** and are not an excuse to repeat every item type's old routing.

**Owner action:** No blocks or settings now. Wait until candidate CI, versioned LAB-only installer and **read-only actual LAB preflight** pass. Then nominate a safe empty **absolute Overworld coordinate (X,Y,Z)**. Do not guess an unoccupied region. **Readiness: NOT READY** until those prerequisites and real XYZ/clearance are documented.

## Single proposed rig (not constructed)

Once the absolute anchor is identified as safe, the complete block list is:

| Object | Exact relative position | Count | Facing / notes |
| --- | --- | ---: | --- |
| Hart Collector C | (X, Y, Z) | 1 | Orient away from existing networks; not attached to Sorters |
| Hart Receiver A | (X+3, Y, Z) | 1 | No Hopper beneath; link target A |
| Hart Receiver B | (X+6, Y, Z) | 1 | No Hopper beneath; relink target B |
| Dummy ordinary building block | Placed while sneaking against C, then removed | 1 | Check original sneak-place |
| Sorter, Hopper, redstone, item contents | **None** | **0** | No inventory transfer or MR fidelity is under test |

Minimum isolation: no neighboring installed Hart Logistics Collector/Receiver/Sorter paths, vanilla Hopper/container network or unrelated rigs within **8 blocks of any of the three test blocks**; verify protected structures are not displaced. Inspect all three target spaces, the block beneath each Receiver and the selected placement face before the session. All test inventories and queues must be empty. Absolute anchor, dimension and available clearance must be verified and filled into this card **before marking READY**. Do not ask the owner to improvise a site.

## Three manual checks, one reusable rig

1. **Menu and gesture:** Place C/A/B; placing C must not select a Receiver. Standing interaction with C shows Hart Collector menu with Link/Relink, Unlink, Details and Close. Close leaves link unchanged. Sneak-place one harmless block against C: it must place normally, without showing/arming the menu. Remove only that dummy block.
2. **Confirmation and cancel:** In Collector menu select Link, choose Receiver A, confirm; C shows A. Start Relink to B but cancel; C still shows A. Then confirm Relink to B; C shows B. Do not test throughput or add items.
3. **Persistence and unlink:** Stop/restart LAB BDS under the owner's normal controlled server procedure; re-open C and confirm B is still linked. Select Unlink, cancel, verify B remains; then confirm Unlink and verify C reports unlinked. No second restart required unless menu readback/persistence is uncertain.

**Pass:** Only confirmed actions change the saved link; pre-existing links elsewhere remain intact; no unexpected inventory or Hopper interactions; target version loads with no script errors. If any new block is unavailable, menu does not open, old link changes on cancel, or saved link is missing after restart: **stop, mark PG-08 NO-GO, preserve world/logs and do not deploy elsewhere**.

## Preflight, installation and rollback discipline

Source from `main` after the PG08 readiness PR is merged, via `Start-HartLogistics-PG08Lab.ps1` and its guarded Python 3.11 helper. Default `Plan` only checks source. `CheckLab` is read-only, against the exact LAB with stopped BDS. `Install -Apply` may run **only after explicit owner approval** for that LAB install and preflight PASS; installer creates backups of only the Hart Logistics BP/RP and original registry bytes while preserving other registrations. The failed Hart Logistics 1.5.0 code need not be preserved by the user, but the transaction backup is retained for safe restoration.

`Rollback -BackupTag <exact tag> -Apply` is available only when the installed candidate still matches the source and registration; it restores Hart Logistics packs and version entries while retaining unrelated current JSONC content. It **does not revert world data changed by gameplay**. Do not remove the world or other packs. Always stop LAB BDS before install or rollback; production may stay running and must never be touched.

After the last check: empty the three blocks; remove only test-owned objects (and the test dummy), ensure no physical items or in-flight transfers remain. Normal Collector/Receiver absent records may remain for future same-coordinate replacement by 1.4.1 design. Test-only instrumentation: **none installed** (candidate is a menu feature spike, not a PG-03 probe). Full Q5/MR acceptance remains BLOCKED/NOT RUN.

**Status records:** PG-08 currently **OFFLINE VERIFIED / REAL BDS NOT RUN**, and this rig is **NOT READY** until actual LAB preflight and exact safe anchor are established. These constraints are mandatory even when CI is green.
