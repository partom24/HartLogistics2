# PG29 — Q5 read-only LAB check (one session)

**NOT READY until final source pin and all CI jobs PASS.** Temporary diagnostic only; not a Q5 migration or runtime release.

## What / why / prior evidence / action / pass

**What:** On existing BDS 1.26.63.1 nonexperimental LAB, test whether real ordinary Receiver Q4 dynamic-property records can be read twice and decoded structurally without invoking the legacy Q4 loader or changing items, queues, links, journals or gameplay.

**Why now:** Q5 bucket aggregation, shadow planning and read-only Q4 decoding have offline proofs, but this property-reading adapter has no Bedrock observation.

**Reused evidence:** PG27 ordinary pipe transfer, PG25 conservative Q4 HOLD, prior Hopper/Dropper/Dispenser and journal acceptance. No repeat cargo rigs.

**Owner action:** guarded LAB-only PG27→PG29 update, one read-only audit command and two status observations, then guarded PG29→PG27 rollback/cleanup. No construction.

**Pass:** the temporary operator-only audit either displays a structurally observed Q4 item/entry count and fingerprint, or refuses with a specific HOLD reason, without journal or inventory writes. An honest HOLD is a safety result, not permission for migration. No snapshot-atomicity claim.

**Temporary instrumentation:** ACTIVE `TEMP_TEST:PG29-Q5-AUDIT` registered under `project-blueprint.json`. After the LAB test and cleanup, remove its source hook/command, test-only registry entry and temporary test root before accepting/closing. Do not ship it.

## Existing LAB / READY physical setup

- **Server:** `C:\Servers\Thomas_MCBedrock - Copy (2)`, world `ThomasServer`. **Never** production `C:\Servers\Thomas_MCBedrock`.
- Existing room X -969..-938, Z -818..-777, floor Y=68. **No new blocks, inventories, Sorters, Collectors, Receivers, pipes, lever, redstone, items or placement coordinates.** All counts zero. Do not alter the working PG27 test setup.
- Do not drain existing Q4 queues, rebuild old test rigs, enable cheats/experiments, reset a world, force a crash, or remove backups.
- Exact installed **PG27 1.5.10** BP/RP files and registration hashes must match the source. A failed preflight is a STOP, not permission to overwrite.

## 1 — Source-pinned Plan, CheckLab and install

Stop **LAB only**, normally. Keep all prior backups. The developer supplies final reviewed 40-character `DELIVERY_SHA` after all CI green. Download the launcher from that **immutable commit**; it pins an isolated `dev/pg29-q5-audit-lab-only` branch and refuses any unexpected newer source. Existing Python 3.12 / Git for Windows apply.

```powershell
$pg29Pin = 'DELIVERY_SHA'
$pg29 = Join-Path $env:USERPROFILE 'Downloads\Start-HartLogistics-PG29Lab.ps1'
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/partom24/HartLogistics2/$pg29Pin/candidates/pg29/Start-HartLogistics-PG29Lab.ps1" -OutFile $pg29
Test-Path -LiteralPath $pg29 -PathType Leaf
& $pg29 -Mode Plan -ExpectedCommit $pg29Pin
& $pg29 -Mode CheckLab -ExpectedCommit $pg29Pin
& $pg29 -Mode Install -Apply -ExpectedCommit $pg29Pin
```

Expected: Plan PG29 SOURCE PASS **BP 22 / RP 59**, no LAB access; CheckLab exact PG27 read-only PASS; Install reports **new backup tag** `lab-<12 lowercase hex>`, no automatic BDS restart. Any refusal: stop; no manual pack install.

## 2 — One read-only command + two statuses

Start LAB normally; reconnect client. Use only:

```text
/hartlogistics:status
/hartlogistics:q5audit
/hartlogistics:status
```

Status version: `1.5.11-LAB-PG29-Q5-READONLY`. The temporary audit targets one Receiver with largest recorded queued count and reports either:

- `Q4 snapshot structurally observed <count> items in <entries> entries` and receiver XYZ/fingerprint followed by `NO Q5 WRITES OR AUTHORITY CHANGE`, or
- `HOLD: <reason>` for pending/unknown journal, unstable or incomplete Q4 pages, API refusal, etc.

Both statuses should report ordinary journal flags without any clearing caused by the audit. Background routing may change counts; identical counts are not required. Share screenshots or exact messages. **Do not repair/clear a journal, inject pending properties, or restart to force a PASS.**

## 3 — Mandatory cleanup by exact rollback

After evidence is captured and **journals are clear**, stop LAB normally. Use the *new* PG29 install backup tag, not an older PG27 or PG25 tag.

```powershell
& $pg29 -Mode Rollback -BackupTag 'lab-REPLACE_WITH_ACTUAL_PG29_BACKUP' -Apply -ExpectedCommit $pg29Pin
```

Rollback restores exact PG27 1.5.10 pack files and world registrations. Start LAB normally and check `/hartlogistics:status` reports `1.5.10-LAB-PG27`. The temporary `/hartlogistics:q5audit` should no longer exist.

If any unresolved journal/HOLD or rollback refusal occurs, **do not manually remove packs, clear journals or restore stale world items**. Preserve output and report the issue. After confirmed cleanup, development removes the temporary test hook and blueprint registry entry.

## Explicit limits

This is a read-only Q4 observation only. Even successful double-read evidence cannot prove an atomic Bedrock snapshot, global durable freeze, MR metadata-safe storage, authoritative Q5 cutover, physical exactly-once custody, Bulk, production readiness or release approval.
