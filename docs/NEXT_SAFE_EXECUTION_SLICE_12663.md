# Next safe execution slice after PG-03 — BDS 1.26.63.1

**2026-11-07 — offline architecture and tests only. No gameplay code has been altered or deployed.** Bundle 1 is closed and its temporary instrumentation removed; [PG-03 evidence](BUNDLE1_PREPARATION_RESULTS.md) remains authoritative. User requested that work move forward rather than keep trying experimental MR endpoints.

## Recommended execution order

1. **Preserve the existing 1.4.1 native MR direct-only path.** Never convert unsupported metadata into Q4 JSON, never accept it without a live safe output or physical custodian. Added a [source-derived permanent offline contract test](../tests/test_legacy_mr_offline_invariants.py) to check original identifiers, 250,000 Receiver ordinary capacity, zero queue backlog, live Hopper, redstone and non-serialization conditions.
2. **Advance ordinary-item network logic without Q5 MR dependence.** First build/verify a deterministic **six-neighbor Transporter topology core and routing decision model** *outside* the original gameplay module. [Offline connectivity tests](../tests/test_transport_topology_model.py) cover face adjacency, loops, branches, splits/merges, unloaded gaps and independent input-order determinism. These tests **do not** decide controller ownership or prove item movement.
3. **Specify a single routing decision shared by Hopper and Transporter at Sorter input.** Preserve original filter → auto → wildcard semantics and per-column bottom-to-top order. For the new managed network, use filtered destinations before Bulk overflow; unverified/offline/stale Bulk is **unknown**, not full. The 125-state offline model **holds** rather than invoking wildcard under unknown capacity. The exact network/legacy boundary remains subject to owner approval.
4. **Only after separate gameplay code authorization:** a small LAB-only Transporter prototype with **original distinct art**, no custom native inventory, one existing Sorter/Hopper column, and one controlled test source. Verify no loss/dupes, redstone gating, and Hopper/Transporter equivalence. Don't automatically retest legacy Hopper-only paths where evidence remains valid. Do not modify production or enable experiments.
5. **Then ordinary-only Bulk Storage (200,000 count per block)** with durable capacity reservations, journal/recovery, stable graph ownership and closed-loop/split-merge tests. Unknown and unloaded capacity must not trigger wildcard; breaking populated storage and chunk-unload custody need independent proof before any world update.
6. **Keep PG-06/07 Q4→Q5 native MR migration held** until a new native custodian or a future **stable** no-experiments custom-block container is approved and proven on both new and existing placed Collector/Receiver blocks. A blocked MR path is not a reason to implement a lossy or hidden entity workaround. Collector/Receiver menus may be designed independently, but existing link/hopper behavior must not change without a compatibility gate.

## What is established, and what is not

| Area | Current evidence | Next gate |
| --- | --- | --- |
| 1.4.1 native MR fallback | Original `main.js` source traced; permanent static regression guards; abstract 256-gate conservation matrix | Preserved byte-for-byte unless a separately approved change |
| Future managed-network Bulk fallback | 125 offline combinations of 3 banks (verified free/full, unknown/offline/stale) | Approve capacity reconciliation and no wildcard on uncertainty |
| Transporter topology | 6-face BFS connectivity model, deterministic loop/split/merge tests | Controller election and ownership under incomplete/unloaded graph |
| Native custom block inventory in current BDS | **PG-03 NO-GO**, 26.70.23 improvement was Preview-only | Future stable runtime and old-world migration validation |
| Alternate MR entity/vanilla inventory custody | [Options memo](MR_CUSTODY_ALTERNATIVES_12663.md), no runtime evidence | Owner selects safe candidate before any new probe/installer |
| BDS/PROD status | LAB temporary probe cleaned by owner; original 1.4.1 source unchanged; no production changes | Explicit bounded authorization for future LAB gameplay spike |

**No test count throttle:** as many autonomous offline/CI tests as meaningful; only 2–3 checks are grouped per **owner-run BDS rig**. No temporary test probes are in Git. Any future manual rig must include exact XYZ, orientation, separation, reset/cleanup and expected outcomes before owner work.

### Design questions still requiring approval

- Is an ordinary-only Transporter/Bulk-first development milestone acceptable while the native MR storage requirement remains blocked, **without replacing or changing the 1.4.1 MR direct path**?
- When a managed filtered destination is registered but temporarily unavailable, should all ingress hold (conservative model) or may another explicitly approved matching destination accept it?
- How are multiple Bulk controllers elected and safely reconciled on topology splits/merges/unloaded members?

These are decisions for a subsequent gameplay authorization, **not** blockers to offline testing and topology-model refinement. No changes to server settings, cheats, experiment flags, pack identities, client version or cloned LAB world are implied.

## After PG-08 menu BDS acceptance — next ordinary Transporter safety hypothesis (2026-11-07)

The menu-only PG-08 LAB checks have GO by owner confirmation, with physical test rig cleanup pending. This does **not** remove the PG-03 native MR container dependency for Q5 nor authorize more gameplay code.

Added `tests/test_transport_authority_model.py` (**13 offline unit scenarios; no BDS access**) as a **candidate fail-closed permission gate**, not a committed product decision. It requires already-authoritatively-assigned region identities, a complete/loaded known topology without unknown boundaries, one current live controller claim for a local region, and a verified six-face path contained within that region. It refuses automatic first-placement election, duplicates, offline controller, old topology epoch, split/disconnected paths, and cross-region movement without a separately proved handoff protocol. A positive permit is only a modeled hypothetical permission, **not a transfer, durable journal commit, reservation, full network test or an implementation license**.

**Next design choice, still open:** deterministic durable election/ownership across unloaded chunks, route/lease epochs, safe cross-controller coordination, and capacity reservations must be specified and approved before an ordinary-item LAB Transporter prototype. Maintain existing 1.4.1 Hopper and native MR fallback unchanged, and do not initiate another owner manual test while offline modeling is sufficient.

