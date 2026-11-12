# UCE integrated LAB acceptance — owner handoff (NOT YET APPROVED)

This is one intended **integrated custody/routing** BDS session, not a source-test
approval or archived 1.4.1 migration. Do not begin until exact-head GitHub CI,
safe installer preflight, and an independent LAB world backup are confirmed.

## Authorized environment

- LAB only: `C:\Servers\Thomas_MCBedrock - Copy (2)`.
- Do not touch the production server, archived original 1.4.1 ZIP, HartBots,
  other add-ons, or unrelated worlds.
- Do not copy pack files manually, change permissions/experiments, edit
  `server.properties`, clear queues, or restart automatically.
- Only the two Hart Logistics packs and their world registration entries may
  be changed by the guarded launcher, with a recorded rollback backup.
- Guard expects an **exact, source-identical PG33 1.5.15** installed in LAB;
  any mismatch is a STOP, not permission to force an overwrite.

## Source and stopped-LAB gate (PowerShell)

Download the Git-tracked
`candidates/uce/Start-HartLogistics-UCELab.ps1` into a neutral Downloads
path; after the final review pin the exact 40-character SHA `<PIN>`.

```powershell
$run = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-UCELab.ps1'
$pin = '<PIN>'
& $run -Mode Plan -ExpectedCommit $pin
& $run -Mode CheckLab -ExpectedCommit $pin
```

`Plan` accesses only source; `CheckLab` is read-only. Installation,
when explicitly authorized for the first session and with BDS stopped:

```powershell
& $run -Mode Install -Apply -ExpectedCommit $pin
```

Keep the printed `lab-XXXXXXXXXXXX` backup tag. There is no auto-restart.
Do **not** use any manual patch scripts or production paths.

## First in-game acceptance

A truly empty, separately backed-up LAB logistics world can activate UCE
using the operator-only `/hartlogistics:activate_empty_lab`. The command
must refuse if *any* legacy Receiver, Collector, Q2/Q3/Q4 page, entity/queue
journal, or UCE ownership exists; never empty or delete Q4 to force the gate.

If the current authorized LAB world has Q4 data, run the read-only
`/hartlogistics:migration_preview` first and **HOLD** activation. Use
a separately prepared empty LAB test world; do not reset the historical LAB
world as an improvised workaround.

After successful empty-world activation, record screenshots/diagnostic output
of one *integrated* session:

1. Two newly placed Receivers register unique accounts; Collector links,
   existing 1.4.1 Sorter filter/mode controls, and unpowered/paused behavior
   remain functional.
2. One shared Transporter graph has deterministic common ingress with multiple
   Receivers, Filter before seeded Auto before Wildcard, plus separate networks
   and no duplicate Bulk bank claims.
3. Ordinary item flows through Collector/Transporter -> Receiver account ->
   Bulk members -> eligible Sorter or original output Hopper, including full
   and blocked destinations, capacity and overflow holds.
4. Metadata-rich **native** items (named/enchanted tools and enchanted books)
   travel through native custody unchanged, including direct Sorter output
   and Dropper/Dispenser ejection to a Collector where physically supported.
5. Power a Collector, Receiver, Sorter, and Hopper; observe separate ingress
   and egress redstone gates without silent item retirement.
6. Restart the *LAB BDS only*, compare inventory and UCE status before/after;
   record unresolved-intent HOLDs as safety findings, never clear a journal
   simply to continue.

Use `/hartlogistics:status` before/after. Record item counts, occupied
carrier slots and screenshots; do not claim metadata hidden-NBT proof from
source-only readbacks. Do not attempt to break stored Bulk/Receiver ownership
blocks to test recovery. A fault that cannot be reconciled safely is a HOLD.

## Rollback / hard stop

With LAB BDS stopped and the exact pinned source and tag from Install:

```powershell
& $run -Mode Rollback -BackupTag 'lab-XXXXXXXXXXXX' -Apply -ExpectedCommit $pin
```

Keep original world backups and deployment backups. Successful source tests,
this checklist, and gameplay observations are still **not** production or
archived-world migration approval. The second acceptance session requires a
repeatable, cold restorable 1.4.1 ZIP migration and a separate owner decision.
