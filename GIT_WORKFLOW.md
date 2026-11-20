# Fresh LAB: Git-managed source and explicitly pinned installation

This is **independent from the URCE / 1.5.x history**. `fresh-lab` is an orphan branch in `partom24/HartLogistics2`. It contains only the new 0.2.0 Fresh LAB BP/RP, assets, test files, and the PowerShell launcher. The 1.4.1 archive was used for original block visuals and selected interactions.

Source checkout (Windows): `C:\HartMods\HartLogistics2-Fresh-LAB`

Authorized server: `C:\Servers\Thomas_MCBedrock - Copy (2)`

Authorized world: `LabWorld`

## First setup

Use the `Bootstrap-FreshLabGit.ps1` from the bootstrap ZIP, first without `-Apply`, then with `-Apply`. This clones the included Git bundle and publishes **only** the previously absent `fresh-lab` branch to the pre-existing HartLogistics2 repository. Git credentials must already be available to PowerShell's Git. If branch publication fails, the source checkout remains on disk and no server change occurs.

## Routine workflow

Run from PowerShell (quotes required because the path contains no spaces, but kept for clarity):

```powershell
$launcher = 'C:\HartMods\HartLogistics2-Fresh-LAB\scripts\HartLogistics-FreshLab.ps1'
powershell -ExecutionPolicy Bypass -File $launcher -Mode Status
powershell -ExecutionPolicy Bypass -File $launcher -Mode Update
powershell -ExecutionPolicy Bypass -File $launcher -Mode Install
```

`Update` fetches and fast-forwards the **source** branch only; it does NOT install any BDS packs. Copy the full 40-character SHA printed by `Status`/`Update`. With LAB BDS stopped, and only after reviewing `Install`'s dry-run:

```powershell
powershell -ExecutionPolicy Bypass -File $launcher -Mode Install -Commit <FULL_40_CHARACTER_SHA> -Apply
```

`Install` checks the exact branch, Git remote, clean checkout, pinned HEAD SHA, LAB-only server directory, `LabWorld` name, active world directory, pack UUIDs, pack manifest versions, and BDS process executable path. It creates backups of the previous BP/RP and world activation JSON before replacement. It does not change production or stop any process.

**No `git pull` for deployment, no force push, no automatic installation after `Update`, and no production-world switching.**

## Publishing future source revisions

Commit and push changes **only** on `fresh-lab` using your authorized Git workflow. Then `-Mode Update` and a pinned `Install -Apply` as above. The initial SHA from the included bundle is a reproducible baseline. No server is changed by cloning, fetching, or pushing source.

## Testing

The 0.2.0 routing source includes an offline mock test. Run `node tests/mock_routing_test.cjs` when Node.js is available. This is not a replacement for live Bedrock diagnostics or an item-integrity test in `LabWorld`.
