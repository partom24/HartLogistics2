# Bundle 1 — Git → PowerShell → disposable LAB (PG-03–PG-05)

**Operator-ready source delivery, 2026-11-07.** The [temporary PowerShell updater](../tests/bundle1_probe/Update-HartLogistics-Bundle1Lab.ps1) is Git-tracked and has passed **synthetic Windows PowerShell 5.1 and PowerShell 7 tests**, not a real Windows BDS deployment. The pack is deliberately a **source directory**, **not** an .mcpack download. **PG-03/04/05 remain NOT RUN** in BDS.

## What this does

Copies exactly four **temporary native-container test BP files** from a clean, pinned Git checkout into the authorized disposable server:

- **LAB only:** `C:\Servers\Thomas_MCBedrock - Copy (2)`
- **Never production:** `C:\Servers\Thomas_MCBedrock`
- **Git repository only:** `partom24/HartLogistics2`; branch `docs/hart-logistics-planning`
- **Independent probe pack UUID:** `ad7c1f31-7f76-41ab-bd84-94a7b9617124`
- **Target folder:** `behavior_packs\_HartLogistics_PG03-05_TEMP_ONLY`

It updates only that independent test BP and its single world registration in the LAB's currently selected world. It does **not** change the original Hart Logistics 1.4.1 BP/RP, world item inventories, server cheats, experiments, production files, or HartBots updater.

**Guards:** exact non-overridable LAB root, no path junctions/symlinks, expected BDS files, safe world `level-name`, single valid world behavior-packs registry, stopped **LAB** BDS, pinned clean Git origin/commit, exact source file inventory and SHA-256 stage verification. Registry backup and exact byte restoration on cleanup; refuse overwrite or concurrent changes. Default Plan never opens server paths.

## One-time Git setup (PowerShell on the Windows host)

You need **Git for Windows** and **Windows PowerShell 5.1 or PowerShell 7**. Choose a local workspace that is **not inside either Minecraft server directory**.

```powershell
git clone --branch docs/hart-logistics-planning --single-branch https://github.com/partom24/HartLogistics2.git C:\HartLogistics2
Set-Location C:\HartLogistics2
$tool = '.\tests\bundle1_probe\Update-HartLogistics-Bundle1Lab.ps1'
```

If you already have a clean checkout of this exact repository and branch, **do not clone again**; use it as your workspace. For future source refreshes:

```powershell
& $tool -Mode Sync
```

Sync fast-forwards the authorized Git branch only; it **does not install anything**.

## Preview first — no server changes

```powershell
& $tool -Mode Plan
& $tool -Mode CheckLab
```

`Plan` reads Git-tracked source only and never opens Minecraft server paths. `CheckLab` **reads** the exact authorized LAB's `server.properties`, current world registration and expected paths without modifying files. If it refuses, **stop and review the refusal**; do not bypass safeguards or substitute a similarly named server path.

## Install source into LAB

First confirm the selected LAB world is disposable, keep a copy/backup if you want to retain that LAB world, and **stop the LAB BDS cleanly**. The production server does not need to be stopped as long as its process path is distinguishable. Then:

```powershell
$sha = (git rev-parse HEAD).Trim()
& $tool -Mode Install -Commit $sha -Apply
```

The script stages and SHA-verifies the four source files, stores a registry byte-for-byte backup and lease, atomically adds **only** the test pack's registration, then verifies the installed hash. It refuses if the probe is already registered, the target/lease/stage exists unexpectedly, Git is dirty, or BDS LAB is running.

After a successful install, start the **LAB server only** as usual. There is no special `.mcpack` import, cheats change, experiment switch, or vanilla source replacement.

## Actual BDS test scope — not yet run

See the [PG-03–PG-05 rig design](../tests/bundle1_probe/README.md). The script allows **one** combined in-game session checking native slots, native MR moves and persistence/menu behavior. The rig consists of **2 temporary probe blocks + 2 ordinary single chests**, with **no Sorters/Hoppers/redstone**. **Do not build the manual rig until a specific world/anchor is confirmed and the card is marked READY.** The installer makes source deployment ready, not the in-game feature itself.

## Cleanup immediately after the test

After collecting results, confirm there is no valuable MR item still held by test blocks (or the entire **disposable LAB test world** will be discarded). Stop **LAB BDS**, then use the **same Git checkout**:

```powershell
$sha = (git rev-parse HEAD).Trim()
& $tool -Mode Cleanup -Commit $sha -Apply -ConfirmProbeCleared
```

The script checks its deployment lease, installed pack hashes and world registry hash, restores the exact original registry bytes, and deletes only its own test BP/lease. It **refuses** if another registration changed since installation; do not force-delete anything. If the process crashes, preserve the lease and backups and report the error before taking action.

Finally, once PG-03–PG-05 are accepted/abandoned, project development removes the **temporary** Git script, probe block, recipe, runtime handlers, mock tests, CI wiring and `temporary_instrumentation` entries under the template policy. Keep only the evidence and any deliberately permanent offline regression tests.

## Acceptance boundary

GitHub Windows synthetic CI does not verify Microsoft Bedrock custom inventory availability, script menu competition, or a true restart on 1.26.63.1. Those are **PG-03/04/05 NOT RUN** until tested on BDS. If a custom container requires an unapproved experimental toggle, stop and record a NO-GO; never enable cheats or experiments to make this probe work.

**Historical archive:** The older `.mcpack` CI artifact was a delivery mistake and is not used by this workflow.
