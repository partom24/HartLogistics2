# HartLogistics 1.5.2 — guarded Collector/Receiver links (copied LAB only)

**SOURCE CANDIDATE; NOT INSTALLED, NOT BDS-PROVED AND NOT RELEASED.** The owner has already built the physical 13-bank storage structure and confirms that no Transporters, Receivers or Collectors are currently placed in the copied LAB. No need to rebuild the storage structure or retest the already accepted 4x4 connected-Transporter appearance. The prior two-bank UI link success and closed-loop defect belong to a separate test and cannot prove live link registration in the unpopulated 13-bank build.

## What changed

- Versioned BP/RP 1.5.2 identity protects cached client resources and leaves accepted 1.5.1 Transporter geometry, textures, original Sorter/Hopper Q4/native physical transfer bodies and 250,000 Receiver queue format unchanged.
- A read-only direct/native Hopper and managed bank topology observer checks **proposed** Collector→Receiver links. Verified directed supply back-edges are REJECTED before saving. Unloaded/unverified/ambiguous paths HOLD without destroying the previously saved link.
- Already saved links are rechecked before Hart-controlled ingress via Hopper Collector, Sorter→Collector or ejected item entity. Unsafe/unknown routes remain at their existing custodian. No existing Receiver queue or journal is deleted or reserialized; native vanilla Hopper movement cannot be disabled by Hart.
- Strict synthetic source, Windows installer/rollback and exact-image preservation tests are required. There is **no newly enabled general URCE routing or Bulk custody**.

## Future owner LAB sequence — only after green exact-HEAD CI and separate owner approval

Use the permanent Git-managed launcher described in [STANDARD_LAB_UPDATER.md](STANDARD_LAB_UPDATER.md). Pull the development branch, run Plan to obtain the full SHA, stop copied LAB BDS, run CheckLab and, by explicit choice, Install -Apply.

**The new updater requires an exact, known installed 1.5.1 predecessor.** If the actual copied LAB has older/unknown bytes, CheckLab correctly REFUSES. Do not manually copy files, force a branch, bypass the preflight or modify production to make it pass. Record the new installer backup tag and preserve the rollback path.

After approval and safe installation, the owner may choose any legal layout for player-first tests; the existing 13-bank structure is the final large-layout target once the missing Hart blocks and links have been placed. Targeted tests: two-bank return-link REJECT, valid acyclic forward links, no installed/source cycle before any transfer, unknown chunk HOLD, existing saved-cycle ingress HOLD, no loss/duplication after normal restart, unchanged Sorter/Hopper/MR/Q4 behavior, and game responsiveness. Native Script Profiler, diagnostics and VS Debugger measure actual load; source-only cases are not those measurements.

**Do not claim the prohibited-loop defect is closed** until source-integrated safety, saved-link quarantine, same-tick/live invalidation and owner BDS observations are accepted. This candidate remains development-only.

## First bounded owner Bedrock test — loop guard, before any sustained cargo

After the **exact-head** source, packaging and Windows synthetic updater suite is green and an owner explicitly approves stopped copied-LAB installation:

1. **Preflight only:** Pull the approved Git branch, run the *same Git-managed* `distribution/Start-HartLogistics-Lab.ps1 -Mode Plan` to obtain a full SHA; then `-Mode CheckLab -ExpectedCommit <full SHA>` against the actual stopped copy. Expected: the exact 1.5.1 installed predecessor matches. If the installed candidate/registry differs, **STOP**; never bypass the refusal, overwrite unknown packs or operate production.
2. **Explicitly approved Install -Apply:** Record exact installed SHA and rollback tag. The owner has placed **no Hart Receivers, Collectors or Transporters in the current LAB**; use an owner-chosen small safe test setup, not a rebuild of the 13-bank physical storage structure.
3. **Link-only minimal topology:** Place R1 and C1 on one visually connected Bank run and R2 and C2 on a second. Initially no loop-closing links. Select C1, interact with R2 to create the legal forward link; expect success. Then select C2, interact with R1, which would create R1→C1→R2→C2→R1; expect `REJECTED (supply loop)`, existing C2 link retained, no new loop. Reverse order must also refuse the closing edge. Inspect both block statuses for `route safety` and reasons.
4. **Safe HOLD check:** With the proposed return path uncertain/unloaded or broken, expect `HELD (route unverified)` rather than pretending to prove no cycle. Existing saved connection and all queue/journal data must remain intact. If native BDS treats a visual arm as connected but link routing does not prove direction, record that discrepancy rather than claiming successful cargo routing.
5. **Only after link-state safety PASS:** optional controlled cargo/restart proof in a reversible owner-selected sandbox. Compare actual journal/queue counts, item identities and native Hopper contents before and after. An existing deliberately saved loop must not be created through gameplay by bypassing the UI; no direct editing of world dynamic properties to force a cycle. Native VS Debugger and Bedrock diagnostics/profiler—not synthetic timers—provide performance evidence.

This first step is **a link-and-HOLD acceptance**, not acceptance of full URCE 1.5 multi-bank delivery or Bulk. We have not installed anything and do not know the exact current LAB pack SHA. If the preflight reports a missing/older candidate, that is a genuine owner testing blocker to resolve by a separately approved predecessor path.
