# PG35 — guarded, genuinely empty LAB world (two BDS boots)

**Scope:** UCE 1.5.16-DEV-UCE, draft PR #79. Source code, GitHub CI and
synthetic fixtures are not Bedrock runtime approval. The completed PG34
owner BDS status and migration preview exposed 145399 Q4 queued items,
including 16 metadata-rich/unknown items (correct migration HOLD).
This PG35 test is specifically to bring up **new-world UCE custody and
routing without touching that legacy Q4 world**.

## Safety boundaries

Only `C:\Servers\Thomas_MCBedrock - Copy (2)` is eligible. The active
historical LAB world `worlds\ThomasServer` and the owner's full original
HartLogistics 1.4.1 server ZIP are preserved. The world backup already
recorded is `ThomasServer-pre-UCE-20261112-170124`; pack deployment
rollback backup is `lab-60fc34c74377`.

Unlike a new pack deployer, PG35 does **not** reinstall either BP/RP or
touch their existing files. The same server-shared addon files remain.
It only changes **one** `level-name` value in the LAB's
`server.properties`, after preserving the original bytes in
`_HartLogisticsWorldSwitchBackups/pg35-uce-empty-world/`.
It does not create the new world via a fake `level.dat`, remove worlds,
change experiments/cheats, or automatically start BDS.

The new name is fixed: `HartUCEEmptyLabPG35` (must not already exist).
The owner starts BDS normally ONCE so Bedrock itself generates the new
world. The initial generation has no copied world registrations:
do not attempt UCE gameplay or activate during this startup.
After graceful BDS stop, the guarded Bind command copies **only**
`world_behavior_packs.json` and `world_resource_packs.json` from
the original world to the new world, exact bytes including unrelated
mod entries and ordering. No Q4 metadata, world database, player inventory,
`level.dat` or ledger is copied. A second normal BDS start loads
the new world with its registered packs.

## Operator bootstrap and source pin

Run *only when BDS is stopped* after the PG34 command handoff is complete:

```powershell
$pg35Pin = '<EXACT_SHA_FROM_PR_CI>'
$run = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-UCELab.ps1'
$checkout = Join-Path $env:LOCALAPPDATA 'HartLogistics2-UCE-LAB'
# Existing guarded UCE launcher syncs and verifies exactly the new Git SHA.
& $run -Mode Plan -ExpectedCommit $pg35Pin
$worldScript = Join-Path $checkout 'candidates\uce\lab_world_switch.py'
python $worldScript --mode plan --commit $pg35Pin
python $worldScript --mode check --commit $pg35Pin
```

If both checks PASS, the owner may run the one-property switch:

```powershell
python $worldScript --mode stage --commit $pg35Pin --apply
```

Record output, check `STAGED`, then start LAB BDS *normally* to generate
the new world. **Do not** attempt to activate UCE or build rigs on this first
world initialization, because the pack registrations are not attached yet.
Gracefully stop LAB BDS. Then:

```powershell
python $worldScript --mode bind --commit $pg35Pin --apply
```

Record `BOUND`; no restart is performed. Start LAB BDS normally for the
**second** time. Verify it loads `HartUCEEmptyLabPG35`, that HartLogistics
and other registered mods are present, and no script-loader errors are
reported. First invoke `/hartlogistics:status` and capture screenshot.
On this **genuinely new world only**, operator may then invoke
`/hartlogistics:activate_empty_lab` and record exact output. Stop if HOLD
or an unexpected nonzero legacy queue or missing addon occurs.

The full UCE physical rig remains a separate READY-card gate. Do not
improvise block placement or claim full end-to-end acceptance from initial
activation alone.

## Restore old Q4 world selection

With LAB BDS stopped, while the source checkout still has the exact pin:

```powershell
python $worldScript --mode restore --commit $pg35Pin --apply
```

This restores only the original `server.properties` bytes. It does not
erase the new world or copy any Q4 state. It refuses if the current
properties no longer match the exact staged hash; do not bypass such a
refusal. Restart BDS normally only after successful restore and a decision
to return to the historical LAB world. All backups remain on disk.

## Evidence contract

- **What:** launch a never-used BDS world with the existing UCE and
  other packs, verify zero historical Q4 custody, then activate UCE.
- **Why:** PG34 BDS proved command handling and source census, but the
  nonempty Q4 world contains 16 opaque items and cannot cold-activate.
- **Prior:** exact-head 13/13 PG34 CI and owner screenshots of status and
  read-only migration HOLD; neither proves new-world activation.
- **Operator action:** two normal LAB BDS starts with one stopped bind in
  between; capture loader/error logs and `status` / activation output.
- **Pass:** BDS-generated new world, original `ThomasServer` untouched,
  correct pack registrations, successful zero-Q4 activation with proper
  sealed authority readback and no startup script faults.
- **Fail/HOLD:** any pack mismatch, existing target, changed world
  registration, BDS process running during a guarded operation, unexpected
  Q4 legacy ownership, or failed readback. Preserve backups and output.

**Do not test old ZIP restoration or nonempty Q4 migration here.**
Those remain separate release gates; the 16 opaque item identities cannot
be guessed, flattened or dropped.
