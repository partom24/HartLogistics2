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

## Easiest option: download one PowerShell launcher

[Download/inspect the launcher source](../tests/bundle1_probe/Start-HartLogistics-Bundle1Lab.ps1) from GitHub, or use the owner-provided verified standalone file. Save it to an ordinary Windows folder **outside both Minecraft server directories**.

The launcher **uses Git for Windows** to clone or fast-forward only `partom24/HartLogistics2` at `docs/hart-logistics-planning` into `%LOCALAPPDATA%\HartLogistics2-PG03-05`, obtains the exact Git commit and delegates to the independently validated source updater. The downloaded launcher is **not an .mcpack** and contains **no game-source copy**. The source stays in Git.

Run it in PowerShell from the directory where you saved it:

```powershell
.\Start-HartLogistics-Bundle1Lab.ps1
.\Start-HartLogistics-Bundle1Lab.ps1 -Mode CheckLab
```

First command clones/updates **local Git files only** and prints the plan; it **does not read or modify Minecraft server files**. Second command reads only the exact LAB world/settings/pack registry to check feasibility. **Do not change cheats or experiments.**

When the disposable LAB world has been verified, stop its BDS cleanly and run:

```powershell
.\Start-HartLogistics-Bundle1Lab.ps1 -Mode Install -Apply
```

After the test, preserve/discard the disposable test inventories as intended, stop LAB BDS and remove the temporary probe:

```powershell
.\Start-HartLogistics-Bundle1Lab.ps1 -Mode Cleanup -Apply -ConfirmProbeCleared
```

Cleanup **refuses** if the registry or installed probe changed unexpectedly. Do not force removal or silently discard MR test items. If Windows blocks the downloaded script because of its file security mark, review the source and use the file's Properties → **Unblock** (or `Unblock-File` for this reviewed file) instead of disabling execution policy globally.

The launcher is temporary code tracked as `TEMP_TEST:PG03-05-LAUNCH`. CI on Windows parses it and confirms Install without explicit `-Apply` **refuses before touching LAB**. The Git-tracked launcher blob SHA-1 is `abe4dec65eeabcff911ca7833ad126716a02fcb2`; SHA-256 of its verified downloaded copy is `7590f4901bf526f14602641b06ca95e5540a5783492998e561ab0bd94c9684ed`. [Windows verification run](https://github.com/partom24/HartLogistics2/actions/runs/42377972891).

If you prefer using your existing Git checkout rather than the standalone launcher, follow the direct source workflow below.

## Alternative: direct Git checkout (PowerShell on Windows)

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

## Owner-observed LAB Install/Cleanup smoke test — 2026-11-07

The owner executed the downloaded one-file launcher in PowerShell and reported **Plan PASS, read-only CheckLab PASS, Install -Apply PASS and Cleanup -Apply -ConfirmProbeCleared PASS** against `C:\Servers\Thomas_MCBedrock - Copy (2)` (selected LAB world `worlds\ThomasServer`). Pinned source commit: `cc7ffed1621c927ac52cd5de1bc28f88298ebcc4`. This confirms a normal LAB install/cleanup path from operator output, **not** BDS runtime compatibility. **Probe is no longer installed** after Cleanup. To run PG-03–PG-05, reconfirm the LAB world is disposable and prepare a READY anchor/rig card, then reinstall with `-Mode Install -Apply` while LAB BDS is stopped. Do not enable experiments/cheats or use production. See [evidence](BUNDLE1_PREPARATION_RESULTS.md#2026-11-07--owner-observed-actual-windows-lab-updater-cycle).
