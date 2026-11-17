# Hart Logistics 2 — Minecraft Bedrock add-on

## CURRENT — 1.5 URCE planning (separate from 1.4.2)

**Branch:** `planning/urce-150-20261117`, anchored to the [CI-green 1.4.2 native-first compatibility baseline](implementation/BASELINE_142_CLOSEOUT_20261117.md). The owner has authorized **URCE architecture planning**, using the historical 1.5 skeleton selectively as a read-only source of design lessons. No 1.5 gameplay or world migration has been implemented.

Start with the [URCE staged architecture/delivery plan](planning/URCE_150_ARCHITECTURE_AND_DELIVERY_PLAN_20261117.md) and [historical source disposition](planning/URCE_HISTORICAL_15_REFERENCE_REVIEW_20261117.md). Do not copy the frozen #79/#82 branch or revive Q5. The exact 1.4.2 BP/RP files, native API, pack UUIDs and preservation constraints remain unchanged here. **1.4.2 is development/source-closed, not an owner-approved release or BDS performance certification.**


## CURRENT — 1.4.2 native-first compatibility baseline (2026-11-17)

The owner closed the current 1.4.1 native-first performance iteration as **Hart Logistics 1.4.2**, separate from the archived `implementation/native-first-engine-141-20261115` research branch. The authoritative closeout and outstanding BDS/compatibility gates are in [1.4.2 baseline closeout](implementation/BASELINE_142_CLOSEOUT_20261117.md). The current branch is `baseline/native-first-142-20261117`; P4g was **not** carried into the gameplay engine because native profiling showed no observed rejection-reuse hits.

**Status:** 1.4.2 development architecture/optimization **closed**, source candidate **not released or owner-BDS-accepted**. Preserve all 1.4.1 world data, IDs and Q4 journals; BP/RP metadata are versioned 1.4.2 with `@minecraft/server 2.7.0` unchanged. Historical documentation below describes the original recovery phase and is preserved for provenance.

**Next:** [1.5 Unified Routing and Custody Engine (URCE) design](https://github.com/partom24/HartLogistics2/blob/main/docs/UNIFIED_ROUTING_CUSTODY_ENGINE.md) and separate planning branch. The older Q5-centric direction is superseded; do not adopt frozen #79 implementation code.


## CURRENT ACTIVE RECOVERY — START HERE (2026-11-16)

**[Read the complete new-chat takeover: TAKEOVER_NATIVE_FIRST_141.md](TAKEOVER_NATIVE_FIRST_141.md).** This is the current working-source/documentation entry point on branch `implementation/native-first-engine-141-20261115`.

**Current authorized work is native-first conversion of the original Hart Logistics 1.4.1**, including existing Sorter / Collector / Receiver mechanics and saved-world compatibility, with the owner's two [reference arrays](OWNER_PRODUCT_OBJECTIVE.md) as product/layout targets. The immutable 1.4.1 import is `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`; its original 72 gameplay files remain preserved. The active candidate is source-tested and packaged but **not BDS-verified, not native-first architecture complete, and not production-approved**. **Using `firstItem()` every tick is still polling.**

**Explicitly deferred:** Bulk Storage, Transporter, Q5 and a future 1.5 custody engine. **FIFO is not a requirement or acceptance gate** (owner decision 2026-11-16; see [binding objective](OWNER_PRODUCT_OBJECTIVE.md)). **Do not use the frozen 1.5 branch as source.** The owner's telemetry tools are VS Code Bedrock Debugger, BDS diagnostics and built-in Script Profiler, not a new telemetry subsystem.

See [implementation/ENGINE_STATUS.md](implementation/ENGINE_STATUS.md) for current code changes, [RECOVERY_MANDATE.md](RECOVERY_MANDATE.md) for binding restrictions and [the active candidate CI](https://github.com/partom24/HartLogistics2/actions/workflows/native-first-engine.yml) for exact build/test status.

---

## HISTORICAL MAINLINE PLANNING README (NOT CURRENT IMPLEMENTATION AUTHORITY)

The remaining pre-recovery text below is kept as historical repository context. Statements about gameplay source not yet being committed or prospective 1.5 features **do not describe this active branch** and must not override the takeover, mandate or owner scope decision.

**Status: planning; no Hart Logistics gameplay source has been committed to this repository yet.**

Hart Logistics 2 is the planned evolution of the owner-supplied **Hart Logistics 1.4.1** Bedrock add-on. The requirements are **zero loss of existing 1.4.1 capabilities**, safe upgrades of existing worlds and inventories, and explicit owner approval before implementation or release.

## Start here

- [Current state](docs/CURRENT_DEVELOPMENT_STATE.md): what is actually in this repository today.
- [Updater and deployment boundaries](docs/UPDATER_DEPLOYMENT_DESIGN.md): lab-only testing, imported production-updater permission, and production execution hold.
- [1.4.1 ingress/egress matrix](docs/BASELINE_INGRESS_EGRESS_MATRIX.md): source-traced supported routes and prohibited regressions.
- [Test rig cards and evidence reuse](docs/TEST_RIG_CONTRACT.md): plain-language purpose first, complete physical instructions, and skip previously proven unaffected tests.
- [Preliminary go/no-go tests](docs/PRELIMINARY_GO_NO_GO.md): two-to-three-check bundles, clear stop/go criteria and minimal reusable LAB setups.
- [New block asset contract](docs/RESOURCE_ASSET_POLICY.md): new original visuals for Bulk Storage/Transporter; preserve 1.4.1 resource assets.
- [Roadmap](docs/ROADMAP.md): authorized planning milestone and future candidates.
- [Logistics design](docs/LOGISTICS_DESIGN.md): agreed requirements for Bulk Storage, Transporters, controllers and dual-lane handling.
- [Q4 to Q5 design](docs/Q5_MIGRATION_DESIGN.md): preservation and migration safeguards.
- [Open questions](docs/IDEA_INBOX.md): decisions needed before implementation.
- [Architecture decisions](docs/ARCHITECTURE_DECISIONS.md), [baseline registry](docs/BASELINE_REGISTRY.md) and [evidence register](docs/ENGINEERING_EVIDENCE_REGISTER.md).
- [Contributor rules](AGENTS.md), [engineering standard](docs/ENGINEERING_STANDARD.md) and [project contract](project-blueprint.json).

## Protected input baseline

The user supplied a 1.4.1 mcaddon containing a behavior pack and resource pack. That supplied archive is the compatibility reference; **its source is not in GitHub yet**. An import-ready source bundle was prepared outside this repository. Do not confuse that bundle with a Git commit, a validated Bedrock runtime, or an approved release.

Known baseline: three blocks (Sorter, Collector, Receiver), persistent Q4 Receiver queue with q2/q3 legacy migration, persistent recovery journal, item-frame filtering, hopper compatibility and redstone pause controls. See the detailed baseline registry.

## Planned expansion (not implemented)

1. **Hart Bulk Storage:** 200,000 ordinary bucketized items per block; overflow, expandable network capacity, controller-based distributed destination selection, wildcard as last resort.
2. **Hart Transporter:** six-direction, narrow 4×4-in-16 plumbing-style pipe; high-throughput routing from Receiver/Bulk Storage to Sorter; normal containers are *input only*.
3. **Receiver Q5 / native metadata-rich lane:** safe migration from q4, destination-aware buckets for ordinary items and native ItemStack-preserving MR transfers subject to supported API capabilities.

HartBots 1.8.2 Depot source was provided in chat for **reference only**. No HartBots repository access or change is authorized; native Depot integration is deferred.

## Scope and release

This repository was created from an engineering blueprint template. Shared policies and the validator remain, but inherited blueprint achievements do **not** describe this add-on. The intended active root is [addon/](addon/), which currently holds only an import placeholder. There is no approved new release, no world upgrade, and no in-game validation for Hart Logistics 2.

When implementation is explicitly authorized, preserve the exact original pack UUIDs, original block identifiers and persisted state; record source import and test proof before claiming compatibility.

**Linking UI:** [Menu-based Collector/Receiver linking design](docs/UI_LINKING_DESIGN.md) documents the explicit link/relink button and compatibility requirements.
