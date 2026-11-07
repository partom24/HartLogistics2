# Hart Logistics 2 — Minecraft Bedrock add-on

**Status: Bundle 0 foundation complete (original 1.4.1 source imported byte-for-byte; LAB updater passed offline safety tests). No Hart Logistics 2 gameplay features implemented, no Minecraft server accessed and no new release approved.**

Hart Logistics 2 is the planned evolution of the owner-supplied **Hart Logistics 1.4.1** Bedrock add-on. The requirements are **zero loss of existing 1.4.1 capabilities**, safe upgrades of existing worlds and inventories, and explicit owner approval before implementation or release.

## Start here

- [Current state](docs/CURRENT_DEVELOPMENT_STATE.md): what is actually in this repository today.
- [Bundle 0 results](docs/BUNDLE0_RESULTS.md): exact original-source import and nine offline LAB updater safety tests.
- [Guarded LAB updater](scripts/hartlogistics_lab_updater.py): preview-by-default, exact approved LAB target only; real apply not yet authorized.
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

Known baseline: three blocks (Sorter, Collector, Receiver), FIFO q4 Receiver queue with q2/q3 legacy migration, persistent recovery journal, item-frame filtering, hopper compatibility and redstone pause controls. See the detailed baseline registry.

## Planned expansion (not implemented)

1. **Hart Bulk Storage:** 200,000 ordinary bucketized items per block; overflow, expandable network capacity, controller-based distributed destination selection, wildcard as last resort.
2. **Hart Transporter:** six-direction, narrow 4×4-in-16 plumbing-style pipe; high-throughput routing from Receiver/Bulk Storage to Sorter; normal containers are *input only*.
3. **Receiver Q5 / native metadata-rich lane:** safe migration from q4, destination-aware buckets for ordinary items and native ItemStack-preserving MR transfers subject to supported API capabilities.

HartBots 1.8.2 Depot source was provided in chat for **reference only**. No HartBots repository access or change is authorized; native Depot integration is deferred.

## Scope and release

This repository was created from an engineering blueprint template. Shared policies and the validator remain, but inherited blueprint achievements do **not** describe this add-on. The active root [addon/](addon/) now contains **both original 1.4.1 BP/RP source trees unchanged**, pinned by an import commit and [baseline hash inventory](BASELINE_HASHES.json). There is no approved new release, no world upgrade, and no in-game validation for Hart Logistics 2.

The original source import is complete. Future gameplay implementation still requires separate owner authorization and must preserve original pack UUIDs, identifiers, persistent state and 1.4.1 capabilities. CI/source-hash checks alone do not prove runtime compatibility.

**Linking UI:** [Menu-based Collector/Receiver linking design](docs/UI_LINKING_DESIGN.md) documents the explicit link/relink button and compatibility requirements.
