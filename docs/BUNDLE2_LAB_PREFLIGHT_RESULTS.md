# Bundle 2 LAB pack preflight — corrected owner evidence (2026-11-07)

**The earlier automated "not registered" result was incorrect.** The standalone PowerShell diagnostic mishandled JSON array envelopes in the commented, multi-pack world registrations. The owner provided the literal contents and clarified that the installed Hart Logistics **1.5.0 was a failed attempted update, is disposable, and an existing backup is already available.** No additional 1.5.0 archive/preservation request is needed.

## Confirmed from owner-supplied read-only output

- Authorized LAB `C:\Servers\Thomas_MCBedrock - Copy (2)`; selected world `ThomasServer`, the owner's existing production-derived clone. LAB executable file version **1.26.63.1** (file metadata; not a live process attestation).
- Behavior-pack registration contains original Hart Logistics BP UUID `4854d263-05dd-4f79-a21c-7ba969295c2d` with **[1,5,0]**. It coexists with registrations for HartBots, XpVault and HartWaypoints. The LAB shared BP directory `HartMods_HartLogistics_BP` also declares **1.5.0**.
- Resource-pack registration contains original Hart Logistics RP UUID `91316442-0f26-4fbb-88f3-2e39ea843a1a` with **[1,5,0]** among other packs, including HartBots, XpVault and HartWaypoints. The LAB shared RP folder `HartMods_HartLogistics_RP` declares **1.5.0**.
- Neither `worlds\ThomasServer\behavior_packs` nor `worlds\ThomasServer\resource_packs` exists. The top-level pack folders are the observed matching installs.
- Retired PG-03 probe registration, test BP directory and deployment lease were absent in the read-only preflight.
- The literal JSONC comments (including `//HartLogistics`) are **not** evidence of corruption and must be preserved when editing these multi-pack registries.

## Owner's scope clarification

**The failed 1.5.0 Hart Logistics BP/RP does not need to be preserved.** Owner states a backup already exists. This overrides the prior request to archive 1.5.0 provenance. It is not permission to remove the LAB cloned world, its legacy links and queued items, HartBots/XpVault/HartWaypoints pack entries, or anything in protected production. Do not run the unrelated HartBots updater.

**Recommended controlled replacement:** First verify actual source-to-world compatibility and 1.4.1 saved-world state; then in one owner-approved LAB-only, server-stopped operation replace **only Hart Logistics** 1.5.0 BP/RP with a verified candidate, update only Hart Logistics version entries and preserve every unrelated registration/comment. The original Hart UUIDs should remain continuous across the replacement. Avoid an interval with the block definitions unregistered, where saved-world behavior could be damaged. A failed 1.5.0 need not be archived, but **its possible effects on already persisted world data still require evidence before any Q5 cutover**.

## Diagnostic correction

Patched `scripts/diagnostics/Read-HartLogistics-Bundle2Lab.ps1` to recursively unwrap array envelopes before matching pack IDs, and strengthened the GitHub-hosted Windows fixture to include multiple commented pack registrations and 1.5.0. **This patch is not yet a newly observed owner Windows run, and it does not install or remove any pack.** The original (false) diagnostic conclusion is superseded; do not repeat it as current status.

## Bundle 2 gates

PG-06, PG-07 and PG-08 **BDS NOT RUN**. PG-03 native custom MR inventory remains NO-GO on non-experimental 1.26.63.1, so full Q5 migration is blocked. A menu-only PG-08 candidate may be developed independently, but must not be installed on the cloned LAB without a safe bounded operation. No automatic 1.5.0 removal or world changes were executed.
