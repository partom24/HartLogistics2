# HL2 freeform LAB — next integrated-product acceptance session

**Use this guide instead of the PG42-dependent five-stage full-product launcher.**

## Intent

The previous LAB worlds and their backups may have been deleted intentionally.
That is fine. This workflow **never reads, restores, reuses or backs up a LAB
world**. It does not require PG35, PG42, or a prior integrated-LAB LevelDB.
It never touches production or the original HartLogistics 1.4.1 archive.

Prepare and Finish are the *two operator commands*. Everything else is normal
Bedrock operation; no manual pack registrations, manual world folder creation,
world duplication, or arbitrary coordinates are required.

- Pin the exact head of draft PR #79 after all 14 CI jobs pass.
- Use **only** `C:\Servers\Thomas_MCBedrock - Copy (2)` (authorized LAB).
- The LAB Bedrock Dedicated Server must be stopped before each command.
- The existing installed shared Hart Logistics packs must be recognizable
  integrated UCE 1.5.16, not a PG42 probe. If missing/unknown, **stop**:
  never manufacture provenance or overwrite unrelated mods.
- Other HartMods packs and all other existing worlds remain untouched.
- Only shared Hart Logistics BP/RP change; the pack transaction may retain a
  small pack-only rollback copy. No test-world backups are created.

## Command 1 — Prepare the next fresh world

Use the pinned commit `<PIN>` and the new launcher
`candidates/uce/Start-HartLogistics-FreeformLab.ps1`.

```powershell
$pin = '<PIN>'
$run = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-FreeformLab.ps1'
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/partom24/HartLogistics2/$pin/candidates/uce/Start-HartLogistics-FreeformLab.ps1" -OutFile $run
& $run -Mode Prepare -ExpectedCommit $pin
```

The script validates the installed integrated product and current LAB, refuses
a world-name collision, and updates only `server.properties.level-name` to
`HartUCEFreeformLab`. It does not create a world or delete anything.
Expected result: `READY_FOR_WORLD_GENERATION`.

Start **only the LAB BDS**, allow it to generate `HartUCEFreeformLab`, then
stop LAB BDS cleanly. Do not enter old worlds; no HL2 activation yet.

## Command 2 — Finish product installation

With the LAB server stopped:

```powershell
& $run -Mode Finish -ExpectedCommit $pin
```

The script validates the BDS-generated world, verifies its two pack registries
are absent or genuinely empty, then attaches the current source-tested HL2
behavior and resource packs. If the installed shared packs already match, it
skips the needless pack replacement and makes **no backup**. Otherwise, it
makes only a pack rollback copy as part of the existing atomic replacement.
No previous LAB world is consulted. Expected:
`READY_FOR_FREEFORM_GAMEPLAY`.

Start LAB BDS, join the fresh world, run `/hartlogistics:status`, then (once,
after confirming empty world) `/hartlogistics:activate_empty_lab` followed by
`/hartlogistics:status`. New-world bootstrap should offer **48 new Receiver
reservations**, not the previous 32. If it refuses, keep the world unchanged and
report the exact result.

## Freeform acceptance contract

**Build naturally. No test-specific X/Y/Z, height, orientation, or construction
order is prescribed.** The only constraints are real interface directions and
physically valid network connections; a valid route must work regardless of
how it was built.

Exercise an integrated path including stacked Sorters, Transporters, Collector
links, Receivers, original Hopper behavior, filters, Bulk Storage and ordinary
items. Verify normal empty Bulk pickup/mining without an admin operation. Then
exercise metadata-rich native items, blocked outputs, redstone and restart
persistence against the same arrangement.

A correctly connected setup that fails is a **product defect**, not an
instruction to reconstruct the world to fit code assumptions.

Source CI does not establish BDS acceptance, performance parity, hidden NBT
fidelity, archived 1.4.1 migration approval, or production readiness.

## Important scope

The currently installed `ee73ab6` build does **not** contain the empty Bulk
pickup fix or the new 48-Receiver bootstrap. This fresh-world run must use the
new pinned source after CI passes. Never try `/setblock air` or destroy
registered nonempty storage to work around a missing feature.

The workflow does not launch BDS automatically, access production, restore
deleted world histories, clear journals or auto-reconcile ambiguous writes.
