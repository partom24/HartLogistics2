# HartLogistics 1.5.3 — existing two-bank LAB link-safety retest

**SOURCE CANDIDATE ONLY. No owner 1.5.3 installation or BDS acceptance yet.** This fixes the blocker found in the owner's **already-built, small two-bank test area**; the separate 13-bank storage structure requires no rebuilding. The 1.5.2-dev screenshots proved `invalid_native_observation` / `Link HELD (route unverified)` for Collector→Receiver interactions. That does **not** prove a directed loop or make the owner's physical build incorrect.

## Exact predecessor and change boundaries

- **Installed and owner-confirmed source:** `df9479c87efedebeca9bab8f8f8c4a1fe1148e21`, 1.5.2 BP/RP. Existing original installation backup tag: `lab-0bff63ebe84e`; retain it and every subsequent tag.
- **New version:** 1.5.3 BP/RP with unchanged UUIDs, connected 4×4 Transporter appearance, original 1.4.2 Sorter, physical/Q4 writer/replay functions and existing on-disk registry/queue format.
- **Four reviewed changed pack files:** behavior and resource pack manifests, behavior `main.js` (new version and useful HOLD reason display), and the read-only `urce_152_link_snapshot_gate.js` module (historical endpoint normalization, native proven cycle handling). No new pack files or item writer/custody changes.
- Only the **read-only model input** excludes superseded historical opposite-type records when a matching physical block is loaded at a duplicate ID. It **never** clears or changes any saved historical Collector, Receiver, link, Q4 queue page, q2/q3/q4 journal, received/delivered count or metadata-rich ItemStack. Unknown/relevant conflicts still HOLD; verified directed back-edges still REJECT.
- Previous owner status displayed **294,294 queued items** across 38 Receivers, and one recent test view showed **64 items queued** at a linked Receiver. Avoid relinking that established historical path while checking a new link, unless you have separately established its custody plan. Do not erase old records to resolve the source bug.

## Owner-operated LAB actions only after green exact-HEAD CI and explicit choice

Run the **same Git-managed launcher**, without downloading a separate PowerShell file:

```powershell
Set-Location C:\HartMods\HartLogistics2-URCE
git pull --ff-only origin dev/urce-150-runtime-20261118
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode Plan

# Replace this with the EXACT full 40-character SHA printed by Plan:
$sha = '<full lowercase commit SHA from Plan>'
# With the COPIED LAB Bedrock server stopped:
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode CheckLab -ExpectedCommit $sha
# Only after PASS, and only when choosing explicitly to install:
& .\distribution\Start-HartLogistics-Lab.ps1 -Mode Install -Apply -ExpectedCommit $sha
```

`CheckLab` must confirm the exact owner-installed 1.5.2 predecessor. A mismatching source SHA, BP/RP byte difference, registry mismatch, running BDS or unknown prior installation must **REFUSE**. Do not bypass with manual copying, direct manifest edits, client cache reuse or world state edits. A newly successful install generates a **new** rollback backup tag; preserve the earlier 1.5.2 backup too. No production access.

## Specific in-game retest — use the owner's existing two banks

1. Start only copied LAB BDS and confirm `[Hart Logistics 1.5.3-dev] Status`. Capture any script Content Log errors, but do not run a cargo stress test.
2. Use the **already-built small two-bank setup**. On an unlinked test Collector, select it and interact with the appropriate Receiver for a **legal first forward link**. Expected **linked successfully**, not a global `invalid_native_observation`. Inspect Collector/Receiver `route safety` status.
3. On the second distinct test Collector, attempt the **return link** that would close `Receiver 1 → Collector 1 → Receiver 2 → Collector 2 → Receiver 1`. Expected `REJECTED (supply loop)`; its previous link must be retained. A reverse link-order trial is optional if non-destructive.
4. If any link still **HOLDs**, capture the *exact* `reason` and any appended observation reason. A HOLD means a legitimate observation uncertainty—not permission to force link persistence or to edit Q4 to accommodate the test. We should correct the code/source observation before changing the setup to satisfy an erroneous rule.
5. **No cargo** until first forward/return-link behaviors pass, status is coherent, and existing 64-queued/294,294-persisted Q4 custody has remained stable. Later owner-authorized source tests can then check controlled movement/restart without duplication.

This is a **loop-link and HOLD smoke test**, not an end-to-end URCE 13-bank, Bulk Storage, MR routing or high-load performance acceptance. Keep [blocking issue #86](https://github.com/partom24/HartLogistics2/issues/86) OPEN until native BDS loop-safety proof.
