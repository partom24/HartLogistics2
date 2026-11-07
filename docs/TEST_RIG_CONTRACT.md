# Hart Logistics 2 — Test Rig Cards and Evidence Reuse

**Owner-required testing standard — clarified 2026-11-07.** No physical rig in this document has been approved, built or tested.

## Hands-on BDS limit vs autonomous test runs

The owner clarified that **bundling two or three tests** means **two or three user-performed BDS checks per prepared setup/session**. There is **no 2–3-test cap** on automated/offline/CI checks, nor on **fully automated BDS tests once that LAB execution is separately authorized**. If 100 automated tests can run successfully without owner participation, run them without artificial stopping points. Still stop on an actual failure, changed risk, unsafe state, or an authorization boundary; no automatic access to production, unapproved LAB deployment, experiment toggles or gameplay changes.

For manual BDS work, show only the 2–3 relevant interactive checks with one complete READY rig card and all separation/orientation/column requirements up front. Automation may collect more evidence behind the scenes before or after that session. Do not make the user manually execute checks that can be safely automated. Preserve previously proven unaffected behavior without retest.

## What the owner sees first

Every proposed manual or automated integration test starts with a short, plain-language card **before** any technical instructions or block-placement requests:

> **What is being tested:** One or two sentences describing the specific behavior and why this test is necessary.  
> **Why now:** The exact changed code path, unresolved risk, or prior evidence gap that justifies testing.  
> **Prior evidence:** What has already been proven, by whom, in what scope, and whether that proof still covers the unchanged behavior.  
> **Action required:** **No test / source review only / automated test / manual LAB rig**, plus **READY** or **NOT READY**.  
> **Pass condition:** The one-sentence observable outcome that would prove success.

**Example (illustrative, NOT a request to build):**

> **What is being tested:** Whether a two-Sorter column selects the correct filtered destination without disturbing the existing Collector/Receiver route.  
> **Why now:** Only if a change touches multi-Sorter column selection or adjacent topology.  
> **Prior evidence:** The 1.4.1 source implements priority/column routing; no new LAB observation is claimed here.  
> **Action required:** Source review or an automated check first; a manual LAB setup only if an affected contract remains unproven (**NOT READY** until exact coordinates, counts and isolation have been verified).  
> **Pass condition:** The matching item reaches the right destination, with no missing or duplicated items.

Do not bury the summary under long test steps. If the owner already has accepted evidence and the new work cannot affect that path, say **“No repeat test required; previous evidence reused”** and explain the reason.

## Reuse previous tests — don't start over

Existing evidence can be reused when the underlying behavior, inputs, API contracts and relevant environment have **not materially changed**. Use [evidence register](ENGINEERING_EVIDENCE_REGISTER.md) and [baseline ingress/egress matrix](BASELINE_INGRESS_EGRESS_MATRIX.md), plus any owner-provided test reports from previous development attempts.

| Evidence classification | Next action |
| --- | --- |
| **Previously accepted, unaffected** | **Skip rerun**. Reference the evidence ID/source and explain why the new change is outside the accepted behavior and dependency boundary. |
| **Previously accepted, affected** | Design a **narrow differential regression** for the changed dependency or handoff; do not reflexively rebuild or retest the whole original rig. |
| **Owner-reported prior success, not yet documented** | **Do not dismiss or automatically rerun**. Record a succinct owner-evidence entry (what worked, item class, route, runtime, observed result) when supplied; review source/contract and reuse as appropriate. Label evidence as reported, not a newly witnessed PASS. |
| **Untested new behavior / changed risk** | Prefer source review and deterministic automated checks. If in-game confirmation is truly needed, produce a full READY LAB rig card first. |
| **Known prior failure** | Preserve minimal reproduction and test only the defect and affected adjacent behavior after the fix. |

**No blanket test duplication:** Similar ordinary item IDs (cobblestone, glass, sand), unchanged physical routes and previously established native metadata transfer primitives should not be retested merely because a new milestone begins. Affected queue migration, cross-chunk transaction ownership, new custom-block inventory slots or changed block topology may require new evidence because they introduce genuinely different failure modes. A reusable proof can establish a primitive, without claiming it proves an untested end-to-end integration.

Do not claim that every legacy behavior has runtime acceptance solely from reading 1.4.1 source; do not throw away valid owner knowledge merely because its report isn't yet attached. Ask for prior test artifacts **only when they materially affect a specific acceptance decision**. Maintain no-regression standard for all 1.4.1 capabilities.

## Temporary-test parameter removal — mandatory at each test boundary

The owner accepted the preliminary go/no-go plan **with immediate cleanup of disposable testing settings**, regardless of how many autonomous tests are run. The 2–3 grouping limits the owner's manual BDS effort only. Apply the [Temporary Testing and Debugging Instrumentation Policy](TEMPORARY_INSTRUMENTATION_POLICY.md) to every rig, including offline, script-only and in-world probes. Document all temporary test switches, commands, event hooks, added probe blocks/assets and diagnostic parameters at creation. Remove them **as soon as they are no longer needed**, not merely at release; remove their wiring and `temporary_instrumentation` entries before task acceptance. Temporary experiments stay confined to disposable LAB worlds and must not be copied to production. Keep genuinely permanent non-runtime regression tests, as distinguished by the template policy.

Every test result must state whether the temporary setup has been removed; a shared rig/probe used by automated or manual gates may remain only through those documented dependent checks. Cleanup is a prerequisite to closing the test task.

## Rig card: mandatory before owner builds anything

When physical testing is justified, deliver a complete **versioned and prevalidated** card. An incomplete card is **NOT READY** and must not instruct the owner to assemble a rig.

| Field | Exact requirement |
| --- | --- |
| Up-front summary | **What is being tested / Why now / Prior evidence / Action required / Pass condition** (in plain language, first) |
| Identification | Test ID and goal, relevant ingress/egress IDs, source commit and pack version; target LAB runtime, client, experiment settings |
| World context | LAB only `C:\Servers\Thomas_MCBedrock - Copy (2)`; actual world ID, dimension, anchor XYZ, new vs 1.4.1-upgrade vs migrated world, chunk-load requirements |
| Component count | **Exact block types and counts**. State *one Sorter* vs *two Sorters in a single vertical column* vs N explicitly; counts of Collector, Receiver, Hopper, ordinary containers, Bulk Storage, Transporter, item frames and redstone parts |
| Placement map | Each block's relative/absolute (x,y,z), facing, vertical column order, Hopper output direction, input/output faces and Collector→Receiver links, with a top/side diagram where helpful |
| Separation / interference | **Required minimum/maximum distance** between this and any other rigs, logistics blocks or item entities, and required clearances, *if relevant and verified*. Otherwise state **“No special inter-rig separation required.”** If detection/isolation range is unknown, mark NOT READY. No invented universal spacing. |
| Initial state | Modes, item-frame filters, redstone, queue/controller state, item counts, full/partial destination inventory, powered/unpowered Hoppers, other rig activation |
| Exact steps | Setup, linking, triggers, delays/observation window where needed, what the owner versus automation does and when to record results |
| Expected outcome | Destination, item conservation/identity, metadata fidelity where relevant, statuses, logs and explicit PASS/FAIL conditions |
| Reset / evidence | Safe cleanup and reset from known state in LAB, screenshots/logs/measurements to record, whether same rig can be reused; no access to production |

A **valid execution of the written rig** cannot later be rejected because of a hidden spacing rule or hidden Sorter-column requirement. If discovered, that is a **defect in our instructions**; correct the card and minimize the rework instead of blaming the owner.

### Copy-ready card

```text
WHAT IS BEING TESTED:
WHY NOW / CHANGED RISK:
PRIOR EVIDENCE / ID / REUSE DECISION:
ACTION REQUIRED: no retest | source review | automated | manual LAB
READINESS: NOT READY | READY (verification basis)
PASS CONDITION (plain language):

Test ID / source commit / pack version:
1.4.1 path ID(s) or new feature:
LAB server / client / experiments / world / dimension:
World state and chunk loading:
Exact required block counts (including Sorter column height):
Anchor XYZ / per-block XYZ / facing / top-side layout:
Collector/Receiver links / Hopper output direction / pipe faces:
Rig separation from other devices: numeric verified ___ OR no special separation required:
Initial items, identities, metadata and inventory/queue contents:
Filters / modes / redstone / pause settings:
Numbered setup steps:
Numbered test actions / observation conditions:
Expected destination, timing, count and state:
PASS / FAIL:
Reset / cleanup:
Evidence to capture:
Temporary test parameters/hooks/assets and cleanup owner:
Cleanup completed (or remaining dependent test and due trigger):
```

**No current test rig is declared READY.** Readiness is test-specific, and any required distance or component count must be determined before the first setup request.

## Known world provenance — owner-confirmed, not an open question

The LAB path \`C:\Servers\Thomas_MCBedrock - Copy (2)\` contains \`worlds\ThomasServer\`, a **clone of the owner's prior production world**. It is not a fresh empty test world. A rig card must reuse this known fact and specify a safely isolated exact anchor, validate no interactions with preserved storage mechanisms, and plan **surgical test-block cleanup** rather than an automatic whole-world reset. Do not ask the owner to reconfirm this provenance. World replacement/rebuild requires separate owner intent.
