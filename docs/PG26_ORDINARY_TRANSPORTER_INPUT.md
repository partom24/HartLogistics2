# PG26 — first bounded ordinary Transporter input

**1.5.9-LAB-PG26: source/offline candidate, BDS not yet run.**

Following accepted PG25 (HL-E-070), the owner again directed continuous
development between BDS tests. This implements the independent ordinary-input
slice from the safe execution plan and PG09, rather than generating another
abstract custody model or repeating accepted tests.

## Runtime behavior

New block **`hartlogistics:transporter`** is a narrow, six-direction pipe with
original silver/blue procedural artwork, its own world/inventory geometry and
connection states. No legacy art is copied, recolored or aliased. The original
72-file `addon/` baseline remains unchanged; the candidate derives from PG25.

An existing Sorter column may use either its original Hopper source or a pipe
atop its highest Sorter. The pipe adapter reads a bounded live six-face graph:

- Maximum 16 loaded pipes, one single chest/barrel input at/above intake height,
  one Sorter-column endpoint. Refuse multiple sources/columns, double chests,
  unloaded/unknown frontier, lower pipe runs and foreign/virtual endpoints.
- All original Sorter mode/filter/priority/redstone decisions remain in the
  same `processColumn`. Revalidate the graph/source immediately before the
  existing writer is called. Ordinary items only on the new pipe path.
- One whole native stack into an empty destination slot through the existing
  PG20 native writer and physical journal, with pre/post readback and opaque
  unresolved-receipt HOLD. No pipe inventory, new physical writer, ledger,
  pending-operation property or automatically replayed receipt.
- Native output is selected by the Sorter, at its lower height; no autonomous
  pipe→storage-chest writer exists. New pipe input does not feed Collector/Q4.
- Native whole stacks up to 64 fit a pipe-column batch under the existing
  global 256 budget. Original Hopper columns retain their 16-item batch,
  compaction, partial behavior, MR path and priority rules.

Connection rendering refreshes at ten-tick intervals. It changes only the new
pipe's six visual states. Routing always re-reads world blocks independently;
a stale visible arm is never a transfer permit. The thin pipe has no collision
and a full-block selection box for placement. These are prototype choices,
not accepted final art/physics evidence.

## Deliberate bounds and custody contract

This is an inventory feeder, not a new high-capacity custodian. It adds no
virtual quantities and grants no distributed controller or migration authority.
PG16/21/22 disk-atomicity and external-writer limitations remain: neither a
graph fingerprint nor a script-side reservation authenticates all native
writers or creates an atomic inventory/world-property save. The existing
native operation is reused with its existing opaque HOLD recovery, not promoted
to a stronger guarantee. Unresolved receipts still require independent audit.

Full/partial occupied destinations may leave usable room that this prototype
does not fill: it holds until an empty slot can accept the whole stack.
MR/unknown metadata stays at source. Double chests, multiple source inventories,
Collector/Receiver virtual ports, Bulk, Q5, controller election and cross-chunk
service are not implemented by this increment. The general goal of all Sorter
acceptance semantics is preserved; this bounded prototype is not full PG09–11
or a production-qualified Transporter release.

The owner-uploaded custody module remains conceptual reference only. Shared
write admission and pending-receipt preservation use the existing Hart gates;
no second reservation framework, process-local replay cache or fake durable
token is introduced. This change creates no temporary runtime probe/command.

## Verification and delivery

HL-E-071: 38 actual-source Node cases cover native whole movement, old Hopper
budget/branch, eight mode/identity comparisons, filter priority, six-face loops
and refusals, redstone, metadata refusal, empty-slot backpressure, pre-mutation
topology drift, native before/after faults with preserved receipts, pending
physical/Q4 gates and real component subscription/visual state callbacks.
Mocks are not Bedrock execution. Nine builder/resource tests preserve UUIDs,
stable APIs, unchanged original assets/atlas entries, 64 geometry masks,
dedicated texture identity and exact inherited code outside input dispatch.
Thirteen synthetic installer/rollback tests reuse the existing guarded path.

Complete local suites: **279 Python and 462 Node tests PASS**. Generated
JavaScript syntax passes. [11/11 GitHub CI jobs passed](https://github.com/partom24/HartLogistics2/actions/runs/42495908522) at implementation `9b6d600f`, including Windows launcher/installer checks. Final delivery pin is tracked in PR #45. Owner BDS observations remain NOT RUN.

Delivery is the established one-file Git-backed PowerShell launcher, exact
PG25→PG26 source hashes, read-only CheckLab, explicit SHA-pinned Install and
verified pack/registration backups. No manual pack copies, new server or
experiments. [Complete two-check LAB card](../candidates/pg26/TEST_SESSION.md)
specifies one new Sorter, three active pipes, one input barrel, one output chest,
a detached seven-pipe visual rack, lever and supports, all coordinates and
separation. No owner operation has occurred during development.
