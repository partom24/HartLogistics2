# Preliminary Go / No-Go Tests — Hart Logistics 2

**Owner-requested small batches, 2026-11-06. Proposal only — no test has run and no manual test rig is READY.** These are early feasibility gates, **not** complete 1.4.1 regression or release acceptance.

**What is being tested?** Whether we can preserve 1.4.1, use native MR inventory on server **1.26.63.1 / client v26.63**, migrate Q4 to Q5 without loss, offer menu linking, and extend routing with Bulk Storage/Transporters safely.

**Rule:** Execute **2–3 closely related checks together** with a common code spike or rig. If a gate fails, **stop only its dependent subsystem**. Do not rerun unaffected prior successful tests. All in-world tests are LAB-only, at `C:\Servers\Thomas_MCBedrock - Copy (2)`. Production `C:\Servers\Thomas_MCBedrock` is never a test environment. The imported production updater **must not be run before a nominated release candidate**, including dry-run; production edits need separate approval.

## Bundle 0 — Source and installer safety (2 checks; offline, no Minecraft rig)

**What is being tested:** Can we preserve the untouched 1.4.1 baseline and safely prepare a LAB-only update process?

| ID | Preliminary check | GO | NO-GO (stop) |
| --- | --- | --- | --- |
| **PG-01** | Once import is explicitly authorized, compare original behavior/resource source, pack UUIDs, block IDs, saved-state references and file hashes to the uploaded 1.4.1 archive; confirm build/package structure. | Source matches and identity preservation is documented. | Missing/mismatched content; **stop feature work** until resolved. |
| **PG-02** | Offline/synthetic checks of the future **HartLogistics LAB** updater: default dry-run, only exact lab path allowed, no HartBots hardcoded identities, source/pack checks, staging, rollback. | Incorrect and production-looking paths are refused **without being accessed**; no automatic deployment hook. | Any unguarded write path; **stop LAB deployment**. |

**Prior evidence reused:** Original source inspection and uploaded HartBots updater reference. **Never execute the original HartBots production updater for this gate.**

## Bundle 1 — Custom native MR container feasibility (3 checks; one tiny LAB probe)

**What is being tested:** Can a custom block actually participate in normal native ItemStack/Container transfers on **26.63** and survive reloads without interfering with linking menus?

| ID | Preliminary check | GO | NO-GO (stop) |
| --- | --- | --- | --- |
| **PG-03** | Custom block with `minecraft:block_entity.container`: read actual world experiment flags and obtain valid native Container slots on dedicated server 1.26.63.1. | Feature available under owner-approved world settings. | Missing or requires **unapproved** experiments; **pause native Q5 design** and resolve version/settings policy. |
| **PG-04** | Native ordinary-container → custom-container → ordinary-container and custom→custom `moveItem`/`transferItem`, using **one representative MR metadata mechanism** and a full/blocked target. | Exact item identity, count, metadata retained; blocked move leaves source intact; no JSON reserialization. | Unsupported method, loss, or duplication; **stop MR endpoint integration**. |
| **PG-05** | Persist MR items in custom slots through unload/restart and open a prototype configuration menu without accidentally opening/exposing a competing inventory GUI. | Persistent contents intact and intended menu behavior works. | Persistence failure or UI conflict; **redesign before modifying existing blocks**. |

**Prior evidence reused:** Owner-reported safe ordinary Container→Container MR moves. **We test only the new custom-block endpoints, not every enchanted item/potion/music disc.** If PG-03 fails, skip PG-04/05; no extra rigs. The tiny shared rig needs a complete **READY rig card** with exact blocks, positions, facing and separation **before** any owner setup.

## Bundle 2 — Existing-world conversion and link safety (3 checks; one disposable 1.4.1 LAB world copy)

**What is being tested:** Can old placed Collector/Receiver blocks retain their identities, links and queued items while acquiring safe MR storage and menu linking?

| ID | Preliminary check | GO | NO-GO (stop) |
| --- | --- | --- | --- |
| **PG-06** | Upgrade an existing placed/linked Collector and Receiver in a disposable original 1.4.1 LAB world. Verify preserved block IDs, links, Hopper path and new persistent native slots. | Existing-world blocks function without manual replacement or lost state. | Identity/link/custody lost; **no world upgrade**. |
| **PG-07** | Staged Q4→Q5 migration with **offline fault injection first**, then one narrow copied-world cutover, including restart and journal phase reconciliation. | Exact item totals; no double replay; Q4 recovery retained until verified; Q5 is authoritative after cutover. | Any ambiguous crash window/duplication/loss; **no Q5 rollout**. |
| **PG-08** | Same copied-world setup: Collector **Link / Relink Receiver** menu, confirmation, cancel, existing links, sneaking to place Hopper/blocks. | Only confirmed actions alter links; old linked routes stay valid; native inventory does not swallow menu. | Silent relink, old link lost or interaction conflict; **no UI rollout**. |

**Reuse:** 1.4.1 ingress/egress source matrix, previously established routing primitives and native ItemStack behavior. A **minimal authorized probe implementation** is needed; documents cannot pass a runtime test. Only verify changed handoffs, not arbitrary ordinary item IDs.

## Bundle 3 — Minimal network architecture feasibility (3 checks; one planned, expandable LAB layout)

**What is being tested:** Can new high-speed plumbing use existing Sorter filtering and shared Bulk Storage without item loss, unauthorized chest access or controller loops?

| ID | Preliminary check | GO | NO-GO (stop) |
| --- | --- | --- | --- |
| **PG-09** | One minimal Transporter → Sorter ingress plus adjacent input/output storage, checking Sorter FILTER/AUTO/WILDCARD priority, redstone, and **no direct pipe→chest writes or unauthorized chest extraction**. | Old Sorter rules remain sole chest writer; protected output not drained. | Bypassed filter, chest siphoned or old path broken; **stop Transporter routing**. |
| **PG-10** | Thin Bulk capacity model (200,000 ordinary items/block), identity separation when relevant, Filter → Bulk overflow → Wildcard policy. Use **offline injected boundary counts**, not manually supplying 200,000 items. | Correct limits and destinations; wildcard only when usable network Bulk is actually full. | Early wildcard, lost capacity or MR flattening; **stop Bulk routing**. |
| **PG-11** | Extend the **same planned rig** to one-controller closed loop and multi-controller/unloaded region; force retry and recovery with bounded transactions. | No cycles/duplicates, deterministic ownership, no false 'full' classification for unknown capacity. | Conflicting item owner, loop or loss; **stop distributed-network integration**. |

**Optimization:** PG-09→PG-11 add to one **explicitly documented** rig only where geometry permits. Any extra Sorter or spacing change must be specified **before** assembly. Full six-way visual validation, 200k stress and endurance tests belong to later acceptance, not these initial gates.

## Verdict and execution discipline

| Verdict | Meaning | Action |
| --- | --- | --- |
| **GO** | All required checks pass (or have already accepted evidence that **actually covers** the invariant). | Proceed to next **authorized** dependent work. |
| **NO-GO** | A safety/compatibility requirement fails. | Stop affected feature and review alternatives; do not patch around metadata loss. |
| **BLOCKED / NOT RUN** | Missing permission, rig, artifact, runtime or evidence. | No implied pass; resolve prerequisite. |

For every bundle, first show **What is being tested / Why now / Prior evidence reused / User action / Pass condition**, then the complete results. Every physical rig must satisfy [Test Rig Cards and Evidence Reuse](TEST_RIG_CONTRACT.md): exact **one- versus two-Sorter** counts, XYZ, facing, Hopper output, all required rig spacing (or explicitly none), redstone, contents, steps, expected results and reset. **No physical rigs are READY yet.**

**All PG-01–PG-11 are NOT RUN.** This plan does not authorize source import, test addon deployment, experiments, or gameplay implementation. Production remains untouched until candidate nomination and subsequent separate approval.
