# HARTLOGISTICS2 — BINDING OWNER PRODUCT OBJECTIVE

**Owner-directed product objective, not an optional design example.** Added to the recovery foundation on 2026-11-14. This document governs what the native-first recovery must ultimately **deliver**, not merely which APIs it investigates. **The reference pictures are the target.** Native-first architecture, source-test counts, migration plans and performance instrumentation are means to achieve this target, never substitutes for it.

## Current engineering phase: base 1.4.1 native-first conversion

**Owner decision (2026-11-16): FIFO is NOT a requirement, supported feature promise, or Phase A acceptance/release gate.** Do not reinstate FIFO by treating the current Q4 head/sequence implementation, old baseline descriptions, source tests, or earlier handoff language as a binding ordering policy. Preserve existing saved Q2/Q3/Q4 queue contents, item identities, counts, links, journals, recovery safety, backpressure, redstone behavior, and no-loss/no-duplication guarantees. Any future queue-selection or native simplification must be tested against those safety and compatibility obligations; no FIFO-specific blocking test or redesign is authorized. This supersedes contradictory FIFO statements anywhere else in HL2, including historical documents and issue comments.

**Owner scope decision (2026-11-15):** Both owner reference images remain the overall product objectives and the **layout/scale context for accepting this phase**, but the active deliverable is **conversion of existing Hart Logistics 1.4.1 only**. The phase must preserve and improve the existing Sorter, Collector, Receiver, native Hopper interaction, item frames, routing/filter modes, redstone, and original Q2/Q3/Q4 world-data compatibility. Neither reference image authorizes expansion into new block families.

**Deferred, not required for base 1.4.1 completion:** Bulk Storage, Transporters, Q5, and any new generalized custody engine designed for 1.5. The owner will separately authorize development of the 1.5 custody engine at the appropriate time. Existing 1.4.1 queue/journal/custody protections **must still work unchanged or safely equivalently**; deferring 1.5 does not permit weakening base item safety.

This scope restriction governs the images **without weakening their authority**: evaluate the actual arrays as real-world tests of the *1.4.1-capable* functions, rather than interpreting future pictured logistics expansion as an obligation to implement it now.

**Owner topology clarification (2026-11-16):** The owner's storage room still contains the physical multi-bank layout and area intended for the eventual 1.5 architecture with many banks and Bulk Storage controllers. The owner has **temporarily removed Sorters from the other side of the storage room for the current 1.4.1 LAB performance experiment** so the active-Sorter measurements focus on those actually in use. That removal is **not** an abandonment, downscaling, or change of the 1.5 multi-bank/Bulk Controller objective. Label each profiler capture with the *current installed/active Sorter population and route*, not the future full-build population. Passing the temporarily reduced Phase A workload is **not** proof of capacity at restored full scale or of any future 1.5 feature. For current Phase A, preserve native Hopper and original 1.4.1 compatibility; Transporters, Bulk Storage/controller behavior and Q5/1.5 custody implementation stay deferred until separately authorized.

## 1. Authoritative owner-supplied product references

The owner explicitly designated the GitHub folder **[docs/reference-images on main](https://github.com/partom24/HartLogistics2/tree/main/docs/reference-images)** as the **overall objective of HL2**. Both files listed in that folder at the inspected main commit are mandatory design/acceptance references:

| Owner-supplied visual target | Stable snapshot and original image identity | Product obligation |
| --- | --- | --- |
| **Sorter array** — `sorter-array.png` | [Immutable commit-pinned sorter-array.png](https://github.com/partom24/HartLogistics2/blob/c40745834824806d6adefa487fb5bc5084fe057d/docs/reference-images/sorter-array.png) · Git blob SHA `b80669b845803aca1060578f6997ebe035ae68db` · 37,067 bytes | The Sorter system must serve the owner's intended array arrangement and routing interactions in real builds; it may not obtain apparent performance by artificially reducing the array, requiring an unrelated vanilla sorter structure, or disabling important modes. |
| **Storage-room array** — `storage-room-array.png` | [Immutable commit-pinned storage-room-array.png](https://github.com/partom24/HartLogistics2/blob/c40745834824806d6adefa487fb5bc5084fe057d/docs/reference-images/storage-room-array.png) · Git blob SHA `4c2cfb68c85576b9c898351741bb8b4ab5b6c383` · 4,501,762 bytes | The complete product must support the owner's intended storage-room-scale assembly and the normal input → sorting → storage → retrieval/transport behavior, without forcing the owner to abandon that target to make code pass. |

**Current browsable collection:** [github.com/partom24/HartLogistics2/tree/main/docs/reference-images](https://github.com/partom24/HartLogistics2/tree/main/docs/reference-images). The commit-pinned links and Git blob identities above prevent a future change to `main` from silently changing which two pictures the owner identified **today**. The current main folder can gain revisions or additional images through **explicit owner direction**; such changes must be reconciled as versioned objective changes, never silently ignored.

> **Interpretation boundary:** These are owner-supplied images accepted as the **product objective**, not imported 1.5 implementation material. The recovery branch is still founded only on the immutable 1.4.1 source commit `0ea3000651c116b0fa1acc2836ab7e1bcfbc6269`. The image files were not present in that 1.4.1 import and have **not** been copied into this branch, and no 1.5 code, tests, architecture documents or artifacts may be imported. The owner's explicit reference to these pictures is the limited exception allowing external **product-goal links**, not an exception to source isolation.

## 2. What counts as achieving the objective

1. **Preserve the intended owner physical layouts and interactions.** Interpret the pictures as product/acceptance references for the **Sorter array** and **storage-room array**. Do not turn them into a generic isolated test rig, force a redesign of the user's actual storage build, or assert an exact block-by-block mapping from filenames alone. Any dimension, geometry, block count, interaction, or connection detail not independently verified in the pictures and owner's actual world must be left **unspecified**, not invented.
2. **Deliver the whole functioning system, not just a visual imitation.** Preserve native Hopper behaviors and original 1.4.1 filter/mode/redstone/Collector/Receiver compatibility, with reliable routing, item identity, and existing native-Hopper storage-room connections. Future Bulk Storage, Transporters and the separately authorized 1.5 custody architecture are not part of the current conversion. A beautifully rendered but nonfunctional array fails.
3. **Scale to the actual intended use.** The pictured designs are the architectural context for scale acceptance, not a reason to shrink the benchmark. Benchmark normal idle, active, blocked and full/backlogged behavior at the owner's real configuration and topology; measure *actual BDS tick health*, end-to-end useful throughput, latency, conservation and resource work. Source-only mock counts or miniature flat-world examples cannot substitute for this validation.
4. **Prefer native Bedrock mechanics wherever they meet the required behavior.** Native-first is the implementation rule, **not permission to alter the owner's objective**. Any replacement must fit the two referenced layouts without unwanted extra wiring, array rebuilds, lost features, loss of metadata, or violations of compatibility.
5. **Preserve owner worlds and historical data.** No production changes or migrations, no destructive replacement or emptied queues, and no unauthorized modification to the original restored production-derived LAB environment. The owner selects the actual builds used for integrated acceptance; never declare the product complete using an assistant-created test structure alone.
6. **Demonstrate both references at acceptance.** The future full-system evidence must link to the pinned images, identify which owner-selected actual builds correspond to each, and record functional/visual/scale pass-or-fail results. **If either objective is unverified, the product is not accepted.**

## 3. Review gate against objective drift

**Every major architecture proposal, implementation slice, and readiness claim must answer:**

| Gate | Required answer before accepting a change |
| --- | --- |
| **O1 Visual/layout fit** | Does this retain the intended Sorter and storage-room arrays represented by both owner references? If not proven, mark **UNVERIFIED**, not PASS. |
| **O2 End-to-end functionality** | Does this preserve all existing 1.4.1 routing, Filter/Auto/Wildcard/BYPASS modes, vanilla Hopper transport and Collector/Receiver behaviors on the owner layouts, including original-world compatibility? Do not demand new Bulk/Transporter features. |
| **O3 Native-first** | Can the engine handle the proposed operations? What minimal custom Hart-specific behavior remains? |
| **O4 Real-world scale** | What measurements on owner-sized actual arrangements support TPS, throughput, backpressure and no excessive idle work? |
| **O5 Preservation and control** | Does the change preserve item identity, world state, data and owner approval boundaries? |
| **O6 Dual-reference acceptance** | Have **both** image objectives been exercised and verified in the owner-authorized BDS/LAB integrated acceptance? |

Do **not** mark any gate green on the strength of CI, an API signature, a mocked native method, source-executed tests, a visual approximation, or an isolated synthetic demo. **The product objective remains binding even if the engineering route changes.**

## 4. Governance

- This is a **foundational root document** and a companion to [RECOVERY_MANDATE.md](RECOVERY_MANDATE.md). Both documents must be read together in all future HL2 recovery work.
- The owner-supplied image references and the obligation to satisfy **both** are mandatory. Only explicit owner direction may change, remove, demote, or supersede them. Changes must be versioned in GitHub.
- The recovery provenance guard enforces the **existence and exact image-reference identities** of this document and its mention in the recovery mandate. It **cannot** verify that a rendered game build actually resembles the images; that requires future owner-approved gameplay acceptance.
- Nothing here claims the two PNGs were visually decoded by the source-only tooling. Their paths, sizes, Git blob identities and exact commit snapshot were verified using GitHub repository metadata. Concrete image-specific geometry and detailed build expectations must be verified before acceptance rather than guessed.

**End-state:** A complete, performant, Bedrock-native-first HartLogistics that functions within the owner's **Sorter array** and **storage-room array** objectives pictured above—without sacrificing functionality, compatibility, worlds or item integrity to obtain an easy test result.
