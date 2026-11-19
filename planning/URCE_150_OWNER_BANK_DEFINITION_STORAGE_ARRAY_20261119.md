# URCE 1.5 — owner workbook defines a bank (2026-11-19)

> **2026-11-19 owner correction — physical LAB readiness:** The entire **storage structure for 13 banks** is already built, **but Transporters, Receivers and Collectors have NOT yet been placed there**. The workbook is the intended supply-array design, not a live verified HartLogistics network. Earlier owner two-bank Collector/Receiver link screenshots and loop report are a separate prior test/evidence scope and **do not establish that the current 13-bank LAB has those blocks or links installed**. This supersedes loose statements below implying a live HL-equipped 13-bank network. Do not ask owner to rebuild storage; when a safely guarded candidate is ready, the new blocks/connections will be placed and proven in LAB at a separately authorized test step.

**Source:** owner-uploaded `Storage Array.xlsx` (Sheet1, A1:V46) and updated storage-room image, received November 19, 2026. **Explicit correction:** `R19` was accidentally left white in the uploaded worksheet; the owner confirmed that **R19 is Collector→Receiver linkage**, continuous with `R17:R18`. The local corrected review copy is `Storage Array - R19 Corrected.xlsx` (not a tracked gameplay/world file). Do **not** read R19 as an intentional physical gap.

## Binding vocabulary

- A **bank** is **one individual gray Transport Bank run** serving its local storage/Sorter destinations; it is a physical supply leg, not the entire room, the whole multi-bank network, an ownership domain, a mandatory controller, or one Collector–Receiver link.
- A **Collector→Receiver linkage** (light-green in the drawing) **joins the output/end of one bank to the entry/start of another**. The Collector and Receiver are distinct blocks/roles, not synonyms for banks. The green segment may cover multiple worksheet cells; it is diagrammatic, not a literal number of Minecraft Hoppers/Transporters or a custody transaction count.
- A **network** is the **connected routing system** formed by one or more banks and proven directed connectors. One network may contain multiple physical banks, and banks do not each require a Bulk Storage/controller.
- **Bulk Storage** is orange and separately attached to different supply legs. It does not define a bank or imply a compulsory Bulk block per bank.
- **Start** (green) and **End** (red) are the start/end of *this example*. Their presence does not turn a final bank, terminal Collector or a particular Wildcard layout into a mandatory requirement for every valid player-built network.
- Transporter visuals show connectivity, but **the Bedrock routing graph must verify actual supported directed cargo paths**. Worksheet coordinates are not world XYZ, and a green drawn linkage is not proof of an actual native Q4 receipt or Hopper path.

## Explicit workbook route: 13 bank runs, 12 directed links

Read the owner's schematic **from the bottom Start to the left End**. Individual bank runs, in the order an item would encounter them in this illustrated chain:

| Bank in route order | Gray physical run (Sheet1) | Incoming | Outgoing | Connection to next bank |
| ---: | --- | --- | --- | --- |
| 1 | horizontal `D36:T36` | Start `D36` | Collector `T36` | `T36 → V34` via `U36:V36`, `V35` |
| 2 | lower `V20:V34` | Receiver `V34` | Collector `V20` | `V20 → V16` via `V17:V19` |
| 3 | upper `V2:V16` | Receiver `V16` | Collector `V2` | `V2 → R2` via `S2:U2` |
| 4 | upper `R2:R16` | Receiver `R2` | Collector `R16` | **`R16 → R20` via `R17:R19`** — `R19` is a linkage cell |
| 5 | lower `R20:R34` | Receiver `R20` | Collector `R34` | `R34 → O34` via `P34:Q34` |
| 6 | lower `O20:O34` | Receiver `O34` | Collector `O20` | `O20 → O16` via `O17:O19` |
| 7 | upper `O2:O16` | Receiver `O16` | Collector `O2` | `O2 → I2` via `J2:N2` |
| 8 | upper `I2:I16` | Receiver `I2` | Collector `I16` | `I16 → I20` via `I17:I19` |
| 9 | lower `I20:I34` | Receiver `I20` | Collector `I34` | `I34 → F34` via `G34:H34` |
| 10 | lower `F20:F34` | Receiver `F34` | Collector `F20` | `F20 → F16` via `F17:F19` |
| 11 | upper `F2:F16` | Receiver `F16` | Collector `F2` | `F2 → B2` via `C2:E2` |
| 12 | upper `B2:B16` | Receiver `B2` | Collector `B16` | `B16 → B20` via `B17:B19` |
| 13 | lower `B20:B34` | Receiver `B20` | End `B34` | None — terminates this example |

The six upper runs are **B/F/I/O/R/V rows 2–16** and the six lower runs are **B/F/I/O/R/V rows 20–34**; the thirteenth is the bottom horizontal row-36 run. The displayed "Bank" text is a label, not an extra boundary or disconnected segment. This is a directed **serpentine chain**, not six rooms or thirteen independent networks. The start/end labeling defines the illustrated chain's order, not a runtime coordinate schedule.

## Engineering consequences

1. **Represent two different relationships:** (a) a bank's local native/Transporter-directed supply path and served destinations; (b) its verified outgoing Collector→Receiver link to another bank's entry. An inter-bank link must not be confused with the bank itself.
2. A read-only system can aggregate by bank to skip irrelevant local Sorter admission work, **but item rights remain with the actual native/queue custodian**. No per-bank global inventory, compulsory controller or per-segment item custody.
3. Preserve the owner's **no supply loop** requirement. Adding a link from an already downstream bank back to an upstream one must be **rejected before persistence**, even if both individual Collectors/Receivers accept clicking. The previously owner-reported live *two-bank closed loop* is a **different, invalid fixture** (GitHub issue #86), not a model for this workbook's open start-to-end chain.
4. Different player-built topologies may branch/merge, vary length, rotate/translate and omit any final Collector; all valid acyclic directed cases must work. Never hardcode the 13-bank count, these cell names, a particular start/end or an exact number of storage blocks into Bedrock gameplay.
5. The worksheet shows intended **logical** connections. Before actual forwarding, observe live native Hopper direction, active links and route version; reject cycles and HOLD unknown/unloaded return paths. Existing 1.4.2 queues, link registries and journals remain protected.
6. The initial two-bank player LAB is the **first regression layout**, both for multi-bank identification and for **preventing** its earlier illegal return connection. Progress through the 13-bank workbook chain is a separate source-only scale/topology fixture; it is **not** an installation requirement.

**Acceptance boundary:** schematic read + owner's R19 correction; offline graph tests may prove consistency of the model. This is **not** 1.5.1 BDS routing, link-enforcement, custody, Bulk storage or quantitative performance acceptance. No world changes authorized by the workbook.

## 2026-11-19 — owner confirms the full 13-bank system is physically built in LAB

**Owner report:** "i do have this entire 13 bank system built in the lab, i just hadnt gotten to this point so in the project to be able to do anything with it." This upgrades the worksheet from a purely hypothetical/rebuild target to **a representation of an already constructed, owner-available physical LAB installation**. The owner need not rebuild 13 banks for an engineered demonstration. Use the existing copied LAB as the intended *later* end-to-end integration and performance acceptance setting.

**Critical scope separation:** Physical construction is **owner-confirmed**; a live engine-discovered and validated directed graph of all 13 banks, all 12 inter-bank connections, actual native Hopper orientations, loaded-state boundaries, Collector→Receiver link registration, Bulk Storage activation, item delivery, Q4/native MR durability, zero-loop status, source-version inventory and 1,400-Sorter performance remain **unverified in this statement**. The workbook describes the intended 13-bank path (including corrected R19) and cannot itself certify the actual BDS topology. Existing two-bank loop is a separate known invalid regression layout and must not be generalized to the full 13-bank system.

**Development/testing implication:** Correct the runtime link-cycle enforcement and live bank topology observation using smaller/controlled source proofs first; then verify the owner's already-built 13-bank LAB *in place*, without a mandatory new build, exact coordinate hardcoding or speculative transfers. Preserve player structures, saved links, Q2/Q3/Q4 state, queues and journals; no LAB/production mutation is authorized by this contextual observation.
