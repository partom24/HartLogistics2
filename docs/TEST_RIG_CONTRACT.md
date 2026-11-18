# Hart Logistics 2 — Test Rig Cards and Evidence Reuse

> **Current owner testing rule — 2026-11-18:** [URCE-ADR-004 — Player-first, layout-agnostic, item-open testing](../planning/URCE_150_OWNER_PLAYER_FIRST_TESTING_DECISION_20261118.md) **supersedes the fixed rig / exact XYZ / exact item prerequisites below**. The owner may build **any valid arrangement** and use **any legitimate item**, not only pre-selected block coordinates, Sorter-column counts or item IDs. Test MR versus ordinary cargo separately where their routing structure differs. Known fixture coordinates and chosen test items remain useful **optional reproduction data or automated fixtures**, **not owner acceptance gates**. Test safety, evidence reuse, LAB isolation and rollback requirements still apply. Sections below are historical guidance only to the extent compatible with this decision.

**Historical November 6 test-rig standard, refined by owner November 18 player-first policy. Planning only.** No physical rig in this document has been approved, built or tested.

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
> **Action required:** Source review or an automated check first; a manual LAB setup only if an affected contract remains unproven (**NOT READY** only if the actual feature's safety/validity conditions or LAB isolation are unverified; arbitrary exact coordinates are not required).  
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

**Player-open item testing:** Do not hard-code an acceptance item allowlist into product code, acceptance scripts, or owner instructions. Examples are illustrative, not the only legitimate choices. Distinguish MR and ordinary items by real semantics; user-chosen unusual identities are encouraged to expose bugs. Automated fixtures may use exact IDs to reproduce known defects, but production behavior must remain general.

**No blanket test duplication:** Similar ordinary item IDs (cobblestone, glass, sand), unchanged physical routes and previously established native metadata transfer primitives should not be retested merely because a new milestone begins. Affected queue migration, cross-chunk transaction ownership, new custom-block inventory slots or changed block topology may require new evidence because they introduce genuinely different failure modes. A reusable proof can establish a primitive, without claiming it proves an untested end-to-end integration.

Do not claim that every legacy behavior has runtime acceptance solely from reading 1.4.1 source; do not throw away valid owner knowledge merely because its report isn't yet attached. Ask for prior test artifacts **only when they materially affect a specific acceptance decision**. Maintain no-regression standard for all 1.4.1 capabilities.

## Temporary-test parameter removal — mandatory at each test boundary

The owner has accepted the preliminary 2–3-test bundles **only with immediate cleanup of disposable testing settings**. Apply the [Temporary Testing and Debugging Instrumentation Policy](TEMPORARY_INSTRUMENTATION_POLICY.md) to every rig, including offline, script-only and in-world probes. Document all temporary test switches, commands, event hooks, added probe blocks/assets and diagnostic parameters at creation. Remove them **as soon as they are no longer needed**, not merely at release; remove their wiring and `temporary_instrumentation` entries before task acceptance. Temporary experiments stay confined to disposable LAB worlds and must not be copied to production. Keep genuinely permanent non-runtime regression tests, as distinguished by the template policy.

Every test result must state whether the temporary setup has been removed; a shared rig/probe used by two or three gates may remain only through those documented dependent checks. Cleanup is a prerequisite to closing the test task.

## Rig card: mandatory before owner builds anything

When physical testing is justified, deliver a concise **versioned card describing valid construction conditions and observable outcomes**. An unsafe or incomprehensible card is **NOT READY**; a card without absolute XYZ or prescriptive block-by-block placement is **not** incomplete.

| Field | Exact requirement |
| --- | --- |
| Up-front summary | **What is being tested / Why now / Prior evidence / Action required / Pass condition** (in plain language, first) |
| Identification | Test ID and goal, relevant ingress/egress IDs, source commit and pack version; target LAB runtime, client, experiment settings |
| World context | LAB only `C:\Servers\Thomas_MCBedrock - Copy (2)`; actual world ID, dimension, anchor XYZ, new vs 1.4.1-upgrade vs migrated world, chunk-load requirements |
| Component count | Explain **actual validity constraints** (e.g., connected source and destination, permitted Sorter modes). Any valid number of blocks, banks or column heights may be used unless the tested behavior specifically requires a structural category |
| Placement map | **Player-chosen valid layout**; explain direction, connectivity and necessary block behavior in plain language. Relative examples/diagrams are optional illustrations, not acceptance requirements. Record actual XYZ only for debugging/reproduction |
| Separation / interference | Require isolation only when an actual gameplay/safety rule or test attribution demands it; describe the rule. No invented minimum spacing, no arbitrary exact rig locations. Prefer natural gameplay arrangements when safe |
| Initial state | Relevant expected state and testable variations (including full/partial, power and player-selected filters). **No hardcoded accepted item identifiers**; separate MR and ordinary conditions if structurally relevant |
| Player actions | Natural placement, linking, item insertion, operation and observation. State a truly required trigger/timing only when necessary; avoid obligatory scripted XYZ-by-XYZ construction |
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
LAB server / client / experiments / world type:
Actual validity constraints and chunk-load conditions (if any):
Player-chosen valid layout / logical connections and direction:
Optional geometry, XYZ or diagram for reproducing a found defect:
Player-chosen items; ordinary versus MR behavior classes where relevant:
Initial inventory, filter, power and queue conditions needed for the behavior:
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

**Readiness is about safety, prerequisites, and a clear observable behavior**, not developer-chosen geometry. An owner-selected valid layout and arbitrary legitimate item choices may be READY without absolute coordinates or exact preselected item counts; no blanket in-game test or deployment approval follows from this policy.
