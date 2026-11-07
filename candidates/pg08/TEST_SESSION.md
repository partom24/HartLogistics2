**OWNER SCREENSHOT UPDATE (2026-11-07):** After being asked to restart only LAB BDS, owner sent Collector Details showing linked Receiver **B `(-947,69,-797)`**, inputs/waiting/queued all zero, plus Receiver linked Collector counts **0/1**. Positive B-link readback now **PASS**; actual stop/start is **not independently visible** and remains conditional on owner confirmation. Remaining focused checks: while B linked, cancel Relink-to-A and inspect C to ensure B persists; cancel Unlink and inspect C to ensure B persists. Confirmed unlink positive path was observed earlier; do not repeat it merely for extra proof. Keep backup `lab-5af88e18cff3`; clean rig surgically after acceptance.

**OWNER BDS UI UPDATE (2026-11-07):** Real screenshots establish green confirmation linking C to Receiver B at `(-947,69,-797)`, an `Unlink Receiver` confirmation targeting B and green `Receiver unlinked`. Later Receiver UI screenshots show linked Collector counts **0** and **1**; Collector Details now reports link to Receiver A `(-950,69,-797)`, `Inputs: 0`, `waiting: 0`, `queued 0/250000`. This is positive BDS readback and demonstrates another live A state. **Still pending:** whether cancelling B or unlink leaves the prior link unchanged, and **actual LAB BDS restart persistence**. Screenshots alone do not prove a restart or that dummy D was placed while sneaking. Do not repeat already demonstrated A/B link confirmations. Keep backup `lab-5af88e18cff3` and rig until completion.

**OWNER BDS UI PARTIAL RESULT (2026-11-07):** Initial Collector C `(-953,69,-797)` → Receiver A `(-950,69,-797)` **confirmed in-game**. Owner screenshots show real `Confirm Receiver` form with Cancel/Link and green `Link confirmed` message. A later `Selection armed` prompt is **not** cancellation/relink evidence. To finish check 2: touch B `(-947,69,-797)` and choose **Cancel**, re-open C and verify A; re-arm from C, touch B and choose **Link**, verify C now points to B. Then perform check 3 restart/unlink. Remaining PASS criteria are still pending; physical rig stays in LAB, backup `lab-5af88e18cff3` retained. No additional blocks needed.

# PG-08 LAB menu smoke session — READY physical rig card (2026-11-07)

**What is being tested:** Only the new in-game Collector/Receiver menu: deliberate Link/Relink selection, Receiver confirmation/cancellation, saved-link persistence after restart, explicit unlink, and ordinary sneak-place against a Collector.

**Why now:** The 1.5.1 PG-08 UI replaces the implicit 1.4.1 Collector-selection gesture while preserving its routing/queue model. It is the one newly changed behavior not yet observed on the actual Bedrock target.

**Prior evidence:** Owner successfully ran LAB-only installer against the existing cloned world at pinned source `846889dfa2516c303bea79d663746f02deb7f26e` and retained rollback backup **`lab-5af88e18cff3`**. BDS 1.26.63.1 loaded `Hart Logistics 1.5.1-LAB-PG08` successfully with **664 Sorters / 54 Collectors / 31 Receivers / v2 5-shard registry**. GitHub Linux/Windows automated menu, build, install and rollback tests passed. The two logged `minecraft:enchanted_book` and `minecraft:saddle` source-hold notices are from the unchanged 1.4.1 conservative fallback; no MR/Q5 test is required here.

**Action required:** **READY for one manual LAB rig and three tests.** The owner provided Overworld screenshots showing an empty enclosed stonebrick room and opposite inside corners (approx.) **(-937.30, 69.00, -776.30)** and **(-968.64, 69.00, -817.56)**. Only verify the actual target floor blocks and immediate clear spaces before placing; do not alter the room's structure or assume contents under its floor. No new installation, experiments, cheats, world reset or separate probe.

**Pass condition:** Only explicitly confirmed UI actions change the link, canceled operations do not, one saved link survives a normal LAB restart, and sneak-place continues to work. This is not Q5/MR/native-storage/throughput acceptance.

## Identification and absolute positioning

- **Test ID:** PG-08 / LAB menu smoke, room coordinates card v1. Source installed from main commit `846889dfa2516c303bea79d663746f02deb7f26e`, candidate BP/RP version **1.5.1**, original pack UUIDs preserved.
- **LAB:** `C:\Servers\Thomas_MCBedrock - Copy (2)`, cloned world `ThomasServer`, **Overworld**, BDS **1.26.63.1**, client **26.63**, existing no-experiments/no-cheats policy. Never production `C:\Servers\Thomas_MCBedrock`.
- **Room:** Owner supplied empty enclosed room and interior corner player positions. X range roughly **-968.64 to -937.30**; Z range **-817.56 to -776.30**; standing player's Y **69**, visually stonebrick floor beneath (expected solid floor Y=68, air Y=69). Stay inside room; no terrain excavation.
- **Anchor:** Hart Collector **C = (-953, 69, -797)**. All candidate block spaces are separated from the walls and are on the same straight X-axis; linked Receiver direction does not matter for the menu test.

| Type | Count | Absolute (X,Y,Z) | Facing / special conditions |
| --- | ---: | --- | --- |
| **Hart Collector C** | 1 | **(-953, 69, -797)** | Stand on room floor; ordinary player-facing placement; no Sorter/input source |
| **Hart Receiver A** | 1 | **(-950, 69, -797)** | Three blocks east (+X) of C; **no Hopper below** |
| **Hart Receiver B** | 1 | **(-947, 69, -797)** | Six blocks east (+X) of C; **no Hopper below** |
| **Harmless ordinary block** | 1 temporarily | **(-953, 69, -796)** | Sneak-place against C's south (+Z) face, then remove only this block |
| Sorter | **0** | n/a | No Sorter or vertical Sorter column; no frame/filter |
| Hopper, chest/container, Transporter, Bulk Storage, redstone, item stacks | **0** | n/a | No physical transfers or Q4/Q5 queue mutations required |

**Top view (positive X to right, positive Z downward):**

```text
             -953             -950             -947        X →
Z = -797      [ C ] -- 3 --    [ A ] -- 3 --     [ B ]
Z = -796      [ D ]  (temporary sneak-placement only)
```

**Isolation/clearance:** The screenshots show no other Hart blocks, Hoppers or active rigs *inside the room*, and the measured interior provides at least about 9 blocks between B and the nearest X wall; Z clearances are about 20 blocks. The rig's three test blocks are deliberately within 8 blocks of each other; the **8-block separation applies to unrelated existing networks only**. It is not evidence of concealed under-floor equipment: before placing, visually confirm all three placements are air above solid non-container floor and no existing logistics/container equipment is exposed immediately adjacent or underneath. If any spot is obstructed, **stop without building and report it**. Do not guess a new position. Keep the room/chunk loaded while testing.

**Initial state:** Each newly placed C/A/B has an empty/no-input network, no in-flight item, no redstone power or queue to migrate. C starts **unlinked**. Do not connect them to any existing 54 Collector / 31 Receiver records or Hopper. Unaffected 1.4.1 routes are not being retested.

## Three checks — reuse the same three-block rig

1. **Menu and gesture.** Place C, A, B at the coordinates above. Confirm C placement does **not automatically arm selection**; interact standing with C: expect **Hart Collector** menu including Link/Relink, Unlink, Details and Close. Close without link change. While sneaking, place dummy D against C at the coordinate shown; it should place normally without opening a menu; remove D only. If the UI does not appear, stop and preserve log.
2. **Link, cancel, relink.** C menu: **Link / Relink Receiver** → interact with Receiver A → confirm; re-open C and verify link is A. Again **Link / Relink** → Receiver B → **Cancel**; verify C still links A. Repeat → B → **Confirm**; verify C now links B. No item insertion, Hoppers or throughput test.
3. **Restart, unlink, cancel.** Stop and normally restart **LAB BDS only** (production unaffected); re-open C and verify it still links to B. Select **Unlink**, choose **Cancel**, re-open and verify B remains. Select **Unlink** and **Confirm**; re-open and verify C says unlinked.

**PASS:** All three checks produce the stated UI and saved-link results, no unexpected Script errors, no pre-existing network interactions. **FAIL / stop:** Menu unavailable, canceled write changed link, link disappears after restart, test-owned blocks appear connected to unrelated equipment, or script reports PG-08 link write/readback hold. Do not repeatedly attempt writes on failure. Preserve server log and screenshots.

**Evidence:** Screenshot of C's menu; C details after A, after cancel-to-B, and after confirmed B; one after restart showing B; final unlinked state; any relevant BDS error lines. Record precise observed deviations rather than repeating every previous transfer test.

**Cleanup:** After finishing and confirming no items are present, remove only C, A, B and D (if still there), preserve the room and existing world data. No temporary probe, test flag or third-party pack to delete. Retain rollback tag **`lab-5af88e18cff3`** until menu acceptance/return plan is decided. If reverting the LAB pack later, stop LAB BDS, use guarded `Rollback -BackupTag lab-5af88e18cff3 -Apply` only under explicit scope; it restores packs/registrations but **does not revert saved-world gameplay edits**. Never reset production.
