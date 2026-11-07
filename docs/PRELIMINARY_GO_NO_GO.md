**LATEST AS OF 2026-11-07:** Owner confirmed successful LAB probe Cleanup. Disposable probe, PowerShell tools, mocks, CI and temporary instrumentation were removed from Git. **PG-03 NO-GO; PG-04/05 BLOCKED; PG-06–11 NOT RUN.** Earlier Bundle 1 setup narratives below are historic and are **not** instructions to reinstall a deleted harness. See [final evidence](BUNDLE1_PREPARATION_RESULTS.md) and [MR custody alternatives](MR_CUSTODY_ALTERNATIVES_12663.md).

# Preliminary Go / No-Go Tests — Hart Logistics 2

**Owner-approved preliminary test plan, 2026-11-06, CONDITIONAL ON THE TEMPLATE'S IMMEDIATE TEMPORARY-INSTRUMENTATION CLEANUP POLICY.** **PG-01 = GO (exact source import)** and **PG-02 = GO (offline/synthetic installer safeguards)**; **PG-03 = NO-GO** under target no-experiments 1.26.63.1; **PG-04/05 = BLOCKED** and PG-06–11 NOT RUN; no manual LAB rig built. See [Bundle 0 results](BUNDLE0_RESULTS.md). Plan approval does not itself authorize gameplay code changes, source import, experiment toggles, LAB deployment or production operations. These are early feasibility gates, **not** complete 1.4.1 regression or release acceptance.

**What is being tested?** Whether we can preserve 1.4.1, use native MR inventory on server **1.26.63.1 / client v26.63**, migrate Q4 to Q5 without loss, offer menu linking, and extend routing with Bulk Storage/Transporters safely.

**Owner clarification, 2026-11-07:** The **2–3 checks per group is only a limit on the owner's hands-on BDS test work**, not a cap on developer-executed checks, offline/synthetic tests, CI, or fully automated BDS verification when separately authorized. Run as many independent automated checks as are useful (even **100+**) without stopping for arbitrary 2–3-test milestones or asking the owner to intervene. Group **only the manual, owner-performed BDS steps** in 2–3 coherent checks per fully specified reusable rig/session. The existing PG-01–PG-11 headings are *organizing go/no-go milestones*, not an automation throttle. If a gate fails, stop only its dependent subsystem and record the failure; don't run meaningless downstream checks. Do not rerun unaffected prior successful tests. All in-world tests are LAB-only, at `C:\Servers\Thomas_MCBedrock - Copy (2)`. Production `C:\Servers\Thomas_MCBedrock` is never a test environment. The imported production updater **must not be run before a nominated release candidate**, including dry-run; production edits need separate approval.

## Mandatory cleanup gate for every PG test and bundle

**Owner condition:** follow the existing [Temporary Testing and Debugging Instrumentation Policy](TEMPORARY_INSTRUMENTATION_POLICY.md), not only the final release gate. As soon as a temporary testing parameter, toggle, diagnostic, mock, command, probe block, script hook or other test-only runtime component is **no longer needed for the currently active test**, remove it and its startup/event wiring. **Before a PG task is marked accepted/completed**, all its disposable helpers and associated `temporary_instrumentation` entries must be removed. Do not merely disable or hide them.

- **At introduction:** tag runtime-connected temporary code `TEMP_TEST:<ID>` or `TEMP_DEBUG:<ID>` and register it under `project-blueprint.json.temporary_instrumentation` with the exact owner task/path. Standalone non-runtime temporary `TEMP_TEST` probes in declared `source.test_roots` must be tagged, but do not require registry entries while active. Test parameters and temporary configuration must be tracked with their cleanup owner, even if no taggable source code is involved.
- **At the earliest end of use:** remove test-only arguments/settings, special debug routes, temporary commands, injection hooks, probe-only block/asset definitions, initialization wires, event subscriptions and any stale registrations. Restore clean defaults and confirm normal behavior without the probes. LAB-only experimental world settings must not leak into normal-world or production configuration; restore/reset the disposable LAB as appropriate.
- **At each PG verdict:** explicitly record `Temporary instrumentation: NONE / ACTIVE for named next test / CLEANUP REQUIRED`. A result may report the observed technical finding, but its task is **not accepted/closed** until cleanup is complete. If any automated or manual test sequence still needs a common probe, document its remaining purpose and remove it immediately after the last dependent check—not months later or only before RC.
- **Permanent non-runtime regression suites:** retain useful deliberately permanent tests under the test-only tree without `TEMP_TEST` markers. Preserve test evidence/log summaries; delete disposable test harnesses. Never convert temporary runtime behavior into a production dependency just to avoid cleanup.
- **Before release candidate:** run `python scripts/validate_blueprint.py --release-gate` on the exact RC source and review for untagged leftover helpers; `temporary_instrumentation` must be empty and no tagged temporary probes remain. A green structural test is not a replacement for manual cleanup review.

**Do not bundle extra tests merely to justify keeping temporary instrumentation alive.** This condition applies to PG-01 through PG-11 and subsequent focused follow-up tests.

## Bundle 0 — Source and installer safety (2 feasibility gates; any number of offline subtests)

**What is being tested:** Can we preserve the untouched 1.4.1 baseline and safely prepare a LAB-only update process?

| ID | Preliminary check | GO | NO-GO (stop) |
| --- | --- | --- | --- |
| **PG-01** | Once import is explicitly authorized, compare original behavior/resource source, pack UUIDs, block IDs, saved-state references and file hashes to the uploaded 1.4.1 archive; confirm build/package structure. | Source matches and identity preservation is documented. | Missing/mismatched content; **stop feature work** until resolved. |
| **PG-02** | Offline/synthetic checks of the future **HartLogistics LAB** updater: default dry-run, only exact lab path allowed, no HartBots hardcoded identities, source/pack checks, staging, rollback. | Incorrect and production-looking paths are refused **without being accessed**; no automatic deployment hook. | Any unguarded write path; **stop LAB deployment**. |

**Prior evidence reused:** Original source inspection and uploaded HartBots updater reference. **Never execute the original HartBots production updater for this gate.**

**Bundle 1 preparation:** disposable PG-03–PG-05 test-only BP (now removed), static checks, offline transfer mocks, and `.mcpack` packaging are prepared. [CI run 42344178135](https://github.com/partom24/HartLogistics2/actions/runs/42344178135) reports **12 static checks + 11 mock scenarios PASS** (alongside existing tests), but **PG-03–PG-05 actual BDS runtime tests remain NOT RUN**. Probe and CI wiring are temporary under the instrumentation policy; a manual rig remains NOT READY until the actual disposable LAB world/anchor are validated.

## Bundle 1 — Custom native MR container feasibility (3 feasibility gates; one tiny LAB probe)

**What is being tested:** Can a custom block actually participate in normal native ItemStack/Container transfers on **26.63** and survive reloads without interfering with linking menus?

| ID | Preliminary check | GO | NO-GO (stop) |
| --- | --- | --- | --- |
| **PG-03** | Custom block with `minecraft:block_entity.container`: read actual world experiment flags and obtain valid native Container slots on dedicated server 1.26.63.1. | Feature available under owner-approved world settings. | Missing or requires **unapproved** experiments; **pause native Q5 design** and resolve version/settings policy. |
| **PG-04** | Native ordinary-container → custom-container → ordinary-container and custom→custom `moveItem`/`transferItem`, using **one representative MR metadata mechanism** and a full/blocked target. | Exact item identity, count, metadata retained; blocked move leaves source intact; no JSON reserialization. | Unsupported method, loss, or duplication; **stop MR endpoint integration**. |
| **PG-05** | Persist MR items in custom slots through unload/restart and open a prototype configuration menu without accidentally opening/exposing a competing inventory GUI. | Persistent contents intact and intended menu behavior works. | Persistence failure or UI conflict; **redesign before modifying existing blocks**. |

**Prior evidence reused:** Owner-reported safe ordinary Container→Container MR moves. **We test only the new custom-block endpoints, not every enchanted item/potion/music disc.** If PG-03 fails, skip PG-04/05; no extra rigs. The tiny shared rig needs a complete **READY rig card** with exact blocks, positions, facing and separation **before** any owner setup.

## Bundle 2 — Existing-world conversion and link safety (3 feasibility gates; one disposable 1.4.1 LAB world copy)

**What is being tested:** Can old placed Collector/Receiver blocks retain their identities, links and queued items while acquiring safe MR storage and menu linking?

| ID | Preliminary check | GO | NO-GO (stop) |
| --- | --- | --- | --- |
| **PG-06** | Upgrade an existing placed/linked Collector and Receiver in a disposable original 1.4.1 LAB world. Verify preserved block IDs, links, Hopper path and new persistent native slots. | Existing-world blocks function without manual replacement or lost state. | Identity/link/custody lost; **no world upgrade**. |
| **PG-07** | **Global Hart Logistics routing freeze**, staged Q4→Q5 offline fault injection and narrow copied-world restart/cutover. Registered unloaded Sorters/Collectors/Receivers remain PENDING until accessible, then auto-migrate on load. **Optional candidate within this same gate:** via the stable `world.tickingAreaManager` API, create a pack-specific named temporary area **without changing cheats or experiments**, await chunk loading, migrate, then promptly remove; test Hopper safety and restart cleanup. Do not use the cheat-restricted `/tickingarea` command. | No script-controlled transfers during maintenance, no duplication/loss, safe version-gated resume; if accelerator tested, chunk load works under approved flags and **zero Hart-owned temporary ticking areas remain** after task. | Unsafe ticking-area Hopper behavior, stuck lease, double replay, false migrated state, or unsafe resume: **no Q5 rollout**. If command merely unavailable, keep on-load migration and mark accelerator unsupported rather than forcing a new test batch. |
| **PG-08** | Same copied-world setup: Collector **Link / Relink Receiver** menu, confirmation, cancel, saved links, sneak-placement **and read-only migration pending/in-progress/complete/blocked status** on loaded relevant blocks. | Only confirmed links change; saved links persist; native inventory doesn't swallow menu; menu doesn't falsely claim unloaded blocks migrated. | Silent relink, old link lost, UI conflict or misleading migration status: **no UI rollout**. |

**Reuse:** 1.4.1 ingress/egress source matrix, previously established routing primitives and native ItemStack behavior. A **minimal authorized probe implementation** is needed; documents cannot pass a runtime test. Only verify changed handoffs, not arbitrary ordinary item IDs.

## Bundle 3 — Minimal network architecture feasibility (3 feasibility gates; one planned, expandable LAB layout)

**What is being tested:** Can new high-speed plumbing use existing Sorter filtering and shared Bulk Storage without item loss, unauthorized chest access or controller loops?

| ID | Preliminary check | GO | NO-GO (stop) |
| --- | --- | --- | --- |
| **PG-09** | One minimal column where **Hopper and Transporter alternately feed the same Sorter intake**, preserving FILTER/AUTO/WILDCARD and redstone. Transporter above sorter; adjacent ordinary container is deliberately a **source**; final storage chest only on Sorter-facing output below transporter level. | Same Sorter behavior whichever input is fitted; no direct pipe→storage chest writes, no old Hopper regression. | Different filtering/routing between inputs, direct chest write, unintended source access: **stop Transporter routing**. |
| **PG-10** | Thin Bulk 200,000-ordinary-item capacity model, filtered→Bulk→wildcard, **stale/unloaded/unknown member capacity held instead of falsely marked full**, plus independent finite native MR-slot backpressure. Use offline injected boundary counts. | Wildcard only on verified exhaustion, safe hold on unknown, MR slots separately bounded without changing ordinary 250k Receiver count. | Early wildcard, MR flattening, conflated MR/ordinary capacities or unsafe overflow: **stop Bulk/MR routing**. |
| **PG-11** | Extend the same planned topology to **persistent network IDs, controlled discovery, deterministic one-controller closed loop and multi-controller unloaded/split region**, with retry/reconciliation. | One durable item/capacity owner, no duplicate cycles, safe frozen/held transfers when controller state is unavailable. | Conflicting authority, ambiguous ownership, loop or loss: **stop distributed-network integration**. |

**Optimization:** PG-09→PG-11 add to one **explicitly documented** rig only where geometry permits. Any extra Sorter or spacing change must be specified **before** assembly. Full six-way visual validation, 200k stress and endurance tests belong to later acceptance, not these initial gates.

## Verdict and execution discipline

| Verdict | Meaning | Action |
| --- | --- | --- |
| **GO** | All required checks pass (or have already accepted evidence that **actually covers** the invariant). | Proceed to next **authorized** dependent work. |
| **NO-GO** | A safety/compatibility requirement fails. | Stop affected feature and review alternatives; do not patch around metadata loss. |
| **BLOCKED / NOT RUN** | Missing permission, rig, artifact, runtime or evidence. | No implied pass; resolve prerequisite. |

For every **owner-facing manual BDS session**, first show **What is being tested / Why now / Prior evidence reused / User action / Pass condition**, then the complete results. Automated development work should report useful gate outcomes and not demand user attention after each test. Every physical rig must satisfy [Test Rig Cards and Evidence Reuse](TEST_RIG_CONTRACT.md): exact **one- versus two-Sorter** counts, XYZ, facing, Hopper output, all required rig spacing (or explicitly none), redstone, contents, steps, expected results and reset. **No physical rigs are READY yet.**

**PG-01 and PG-02 are GO at their stated source/offline scope** (see [Bundle 0 results](BUNDLE0_RESULTS.md)). **PG-03 = NO-GO under owner LAB settings; PG-04/05 BLOCKED; PG-06–11 NOT RUN.** No physical rig was built. All disposable synthetic fixtures were cleaned. Further source code and LAB execution require their own authorization. This plan does not authorize source import, test addon deployment, experiments, or gameplay implementation. Production remains untouched until candidate nomination and subsequent separate approval.

## Owner source-delivery correction (2026-11-07)

PG-03 through PG-05 test code is Git-tracked source, not an .mcpack distribution. A guarded PowerShell Git-to-LAB installer must be implemented and validated before Windows LAB deployment. The earlier .mcpack artifact/CI upload path is retired; no new test bundle has been added and BDS gates are NOT RUN.

## PowerShell LAB source deployment now prepared

The former Git source-to-LAB PowerShell updater (now removed) has passed Windows 5.1 and PowerShell 7 **synthetic** install/cleanup checks; see retired operator guide (removed). The earlier note saying this PowerShell path was unimplemented is superseded. **No live Windows LAB install or PG-03–PG-05 Bedrock runtime result yet.** The probe and updater remain temporary and must be removed promptly after their purpose ends.

## Actual owner-observed Windows LAB updater smoke cycle (2026-11-07)

At Git SHA `cc7ffed1621c927ac52cd5de1bc28f88298ebcc4`, owner console reports Plan/CheckLab/Install/Cleanup all succeeded on **exact LAB copy** targeting `worlds\ThomasServer`. This **confirms the normal PowerShell source-deploy/cleanup path**, distinct from synthetic CI. Because Cleanup was run, no temporary probe currently remains installed. **PG-03–PG-05 remain NOT RUN**: no in-game native inventory, metadata transfer or persistence/menu evidence yet. Verify that the LAB world is disposable and establish exact safe XYZ before owner BDS rig setup. [Observed result](BUNDLE1_PREPARATION_RESULTS.md#2026-11-07--owner-observed-actual-windows-lab-updater-cycle).

## PG-03–PG-05 existing LAB-world rig clarification

The owner's LAB world is already established as a **previous-production-world clone** at \`C:\Servers\Thomas_MCBedrock - Copy (2)\worlds\ThomasServer\`. Do not ask whether it is disposable or assume an empty freshly created world. Use a carefully checked unoccupied Overworld XYZ for the two-probe/two-chest test; verify inventory custody before removing any test block, and **preserve the LAB clone** rather than resetting it as default. Exact rig XYZ/clearance remains NOT READY. The prior successful PowerShell Install/Cleanup smoke test did **not** run BDS.


## PG-03 target-runtime NO-GO, 2026-11-07

The owner installed the standalone test behavior pack into the approved cloned LAB world and supplied screenshots: Creative search did not show the probe; Minecraft rejected the exact /give @s hlprobe:mr_container 2 command with an unexpected-identifier syntax error. Therefore the block was not registered/available to the player. No probe block was placed; PG-04 transfer and PG-05 restart tests could not be conducted. The screenshots alone cannot prove the exact parser error or exclude other pack-loading issues.

**Official platform version gate:** Minecraft Bedrock 1.26.50 creator notes place the *container field* of minecraft:block_entity in Experimental Technical Updates, even though the base minecraft:block_entity component itself is stable. The Minecraft Beta/Preview 26.70.23 release notes dated November 3, 2026 only then announce that the container field was released from experimental and custom BlockInventoryComponent became non-experimental. The 26.70.23 change is in Preview, **not evidence of stable availability in the owner's current BDS 1.26.63.1.**

Sources:
- https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.50?view=minecraft-bedrock-stable
- https://feedback.minecraft.net/hc/en-us/articles/50103892132365-Minecraft-Beta-Preview-26-70-23

**Decision:** PG-03 = NO-GO for the current 1.26.63.1/26.63 **no-experiments** configuration. PG-04 and PG-05 = BLOCKED / NOT EXECUTED, not failed MR transfers. Do not require the owner to keep trying identifiers, enable cheats or Upcoming Creator Features, build the four-block rig, upgrade server/client version without separate approval, or implement custom native MR slots on this target. Preserve original Hart Logistics 1.4.1 native ItemStack/direct MR fallback and Q4 custody. Investigate a separately approved supported lossless approach or an owner-approved future stable runtime version; experimental behavior cannot be silently introduced.

**Cleanup dependency:** The owner's last transcript reported a fresh -Mode Install -Apply, and there was no subsequent successful Cleanup. Assume the disposable test BP and deployment lease are STILL installed. Because no probe block was obtained in the observed session, it can be unregistered after stopping LAB and confirming no probe item/block was created elsewhere. Use the existing verified one-file PowerShell launcher: -Mode Cleanup -Apply -ConfirmProbeCleared. Preserve source and temporary instrumentation in Git **until the owner confirms LAB cleanup**, since removing the Git installer prematurely would prevent safe source-backed cleanup. Upon confirmation, promptly delete the temporary probe source, launchers, mocks, tests, CI steps, and blueprint temporary_instrumentation registrations, retaining this failure evidence. Never touch the protected production server or discard the cloned LAB world.
