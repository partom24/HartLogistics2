# Phase A — Source inspection of two owner-supplied Bedrock .mcaddon builds

**Review date:** November 17, 2026. **Scope:** external comparative research for native-first HartLogistics 1.4.1 P4e admission; NOT an engine change, benchmark, compatibility guarantee, custody test, or authorization to adopt another add-on's transaction logic. Both uploaded binary packs were read directly as ZIP archives, without loading their JavaScript in BDS. Third-party packaged source is **not copied** into this repository.

## Provenance and API version

| Owner upload | Bytes | SHA-256 | Behavior Pack script API |
| --- | ---: | --- | --- |
| `bedrock_energistics_core_v0.12.0.mcaddon` | 521,777 | `7bf32590748e29a279ba4e22f2b484d47349fb2aa92f0944db7fa95f1808f088` | `@minecraft/server 2.8.0`; UI 2.1.0 |
| `Create_Logistics_2.0.2 (1).mcaddon` | 2,804,963 | `fb50e429fc987de257f16a484c5ab11490f25a7291547357340359452af8e1e9` | Create Logistics main BP `@minecraft/server 2.8.0`; separate Create compatibility BP `@minecraft/server 2.6.0` |

Our 1.4.1 source pins `@minecraft/server 2.7.0`; never transplant behavior from 2.8 into 2.7 without checking the pinned declaration/runtime. All counts below are **static method call-sites, not CPU profiling**.

## A. Bedrock Energistics Core 0.12.0 — architecture, not a vanilla chest insertion replacement

The owner-provided BP contains the bundled script `bedrock_energistics_core_bp/scripts/__bundle.js` (minified, 59,351 original archive bytes). In this shipped entrypoint, literal method invocations are found for `getSlot` / `getItem` / `setItem` (primarily machine UI item slots), but **none** for `addItem`, `transferItem`, `moveItem`, `firstEmptySlot`, `emptySlotsCount`, or `isStackableWith`. Absence from this bundle is a negative *inspection* finding, not a proof about every external integration or unbundled dependent add-on.

The upstream open-source API `Fluffyalien1422/bedrock-energistics-core`, `public_api/src/machine_item_stack.ts`, documents that its `MachineItemStack` carries item type, amount, name, durability damage, lore and enchantments **but not arbitrary ItemStack internals**; e.g. shulker contents do not round trip through that representation. Upstream `public_api/src/item_machine.ts` provides inventory-backed item-machine handles/validity checks, but this is **not an authoritative record of live vanilla chest capacity**. The uploaded Core package is primarily a framework for machines, UI and energy/fluid-style storage; it does not present a drop-in exact vanilla chest admission primitive.

**Hart implication:** preserve original ItemStacks for ordinary native inventories; do not encode arbitrary chest cargo into a restricted machine-item abstraction, and do not infer that the Core solves journalled cross-inventory custody.

## B. Create Logistics 2.0.2 — native insertion plus snapshots

The owner upload actually contains **three packs**: `BE_Create_Logistics`, `RE_Create_Logistics`, and `Create_BE_Logistics_Compatibility`. There are **different insertion approaches** within it; do not conflate them.

**Main Create Logistics BP** — `BE_Create_Logistics/scripts/main.js`:

- `insertPackageIntoPackagerStorage` (approximately lines 1885–1918) snapshots **all slots of each destination inventory** with `getItem` and `clone`, then calls `container.addItem(remaining)` for each serialized package content item, carrying the returned remainder across inventory targets. If any remainder survives, it tries to restore full container snapshots by `setItem` across the saved slots.
- `insertHeldPackageIntoPackager` (approximately lines 1920–1935) attempts package contents insertion before consuming the package item. On failure to consume, it restores its target snapshot; package records also exist. This is an application-level **best-effort compensation/rollback pattern**, not one native atomic transaction or a proof of crash-safe, multi-writer custody.
- `insertWholePackageIntoInventories` (~2281–2289) similarly tries native `addItem` across targets, with container snapshot and rollback callback. `insertSerializedToStorage` (~1260–1272) chains native `addItem` and carries remainders.
- `unpacking_targets.js` (~18–59) uses a distinct **plan-before-mutation** algorithm for Create Depot/Basin entity inventories: clone planned stacks, check exact native `isStackableWith`, then commit or attempt restore. These are **Create-specific entity slot targets**, not arbitrary vanilla chests.
- `serializeStack` (~1004–1079) reconstructs an ItemStack from an explicitly selected set of properties; this is **not evidence of lossless arbitrary native component round trips**.
- Full-inventory snapshotting is O(total slots) *before* native `addItem`, so this approach **does not establish a cheap rejection path** for a full 54-slot chest. On rollback, blindly restoring whole snapshots can overwrite intervening changes from other writers; a process crash before restoration is not addressed by in-memory snapshots alone. The package has broader package-ID/registry reconciliation logic; this review does not assert that its whole shipping protocol lacks other recovery mechanisms.

**Separate Create kinetic compatibility BP** — `Create_BE_Logistics_Compatibility/scripts/storage/storage_inventory.js`:

- `availableSpaceForItem` (~63–82) scans every allowed slot, counting compatible partial capacity and empty slots.
- `addItemLimited` (~84–114) scans capacity, then makes a **second scan** over occupied compatible stacks and **third scan** for empties. It uses `isStackableWith` when present (otherwise type-only fallback). It is correct to describe this as manually scanning admission, **not a performance win over the current Hart path**.
- `storage_hopper.js` (~313–408) has bounded per-cycle work and a `failedHoppers` set within a cycle; `tryInput` first removes from Hopper then attempts storage insertion; on failure tries to add back to Hopper. `tryOutput` does the reverse. These are compensation attempts, not a demonstrated Q4 exact-slot durable journal. Its cadence/round-robin/failure deferral must **not** replace Hart's per-tick source observation or native Hopper pass-through semantics.

## Comparative answer to the design question

| Question | Core 0.12.0 | Create Logistics 2.0.2 | Hart 1.4.1 |
| --- | --- | --- | --- |
| Can the destination itself choose slots? | Not evidenced for vanilla chests in the shipped Core BP | **Yes:** `Container.addItem` in main BP | Current `findAcceptSlot` chooses exact slot |
| Are dense negative admissions proven cheap? | No | **No:** main BP snapshots inventories; compatibility BP scans 1–3 passes; no native runtime timing | Observed ~49 native slot probes per admission in active profile |
| Is the accepted amount/remainder exposed? | Not a chest offer | **Yes:** native remainder through `addItem` | Yes: explicit selected slot room and bounded journal |
| Is arbitrary metadata round trip proven? | No; restricted MachineItemStack docs expressly warn about omitted item features | No; package serialization rebuilds selected fields, though in-container `addItem` uses native ItemStack | Existing safety rule: reject transfers if exact custody round-trip cannot be proven |
| Is source-and-destination cross-container update demonstrably atomic/durable? | Not evidenced | Snapshot restoration + package registry/compensation, **not by itself a native atomic transfer** | Existing Q4 exact-slot prepared journal, replay/verification |

**Conclusion:** The uploaded Create Logistics code strongly supports studying native `addItem` as the correct *admission question* and relying on the native chest for placement. It simultaneously demonstrates that **recoverability is a separate problem**: upfront copying/restoring every slot trades away much of the hoped-for admission benefit and can be incompatible with concurrent inventory modifications. Bedrock Energistics Core is less directly relevant to arbitrary vanilla chest admission; its item abstraction has explicit metadata scope limitations.

## Next safe step (source-only, no gameplay redesign authorized)

Compare three exact contracts before touching the Hart source:

1. **Current:** live selected-slot admission + exact-slot Q4 journal + debit/credit + recovery.
2. **Naïve native offer:** clone only bounded incoming amount; `addItem` returns remainder; then source debit. Note that **the source and destination cannot be treated as one transaction**, and destination placement is unspecified in the returned result.
3. **Native offer + snapshot rollback:** capture all destination slots, `addItem`, compensate or restore, compare cost and crash/multi-writer ambiguity. Do **not** accept a best-effort in-memory snapshot as proof of restart-safe conservation.

Source-only tests can show that the second/third are **not equivalent to Q4** under failure injection. An owner-controlled native BDS probe would still be needed to measure native `addItem` costs and actual metadata/slot behavior under the pinned 2.7 API. Until such a proof exists, **do not replace the exact-slot writer, reduce Hopper observation frequency, or add a persistent chest capacity ledger**. No Bulk Storage / Transporter / 1.5 feature scope.
