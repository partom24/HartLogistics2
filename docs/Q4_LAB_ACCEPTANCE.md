# 0.5.13 Q4 acceptance on a copied LAB

Use the normal Git updater and pinned LAB installer. After startup confirms 0.5.13, face the same linked Receiver for each command. The operator chooses the terminal for this stage. No chest preparation is required. The balance is a synthetic Receiver account and the source is a two-page Q4 fixture. Normal Fresh routing continues independently.

| Script event (prefix each with /scriptevent hartlab:) | Phase | Source | Receiver | Capacity |
| --- | --- | ---: | ---: | ---: |
| q4_seed | seeded | 32 | 249984 | 250000 |
| q4_prepare | prepared | 32 | 249984 | 250016 |
| q4_commit | committed | 0 | 250016 | 250016 |

Restart BDS after prepare. Run q4_status and verify the prepared row. Run q4_commit, restart again, then run q4_status and repeat q4_commit. Both must report the committed row. Total ownership is 250016 at every step. For a hard-kill test, the last acknowledged write can roll back to the last saved world state. Inspect status, resume from the durable phase and check conservation. A missing account directly after a kill before seed persisted requires q4_seed. The immutable fixture pages are evidence and do not represent a second spendable balance. The fixture is one-shot per linked Receiver.

## Read-only census

The q4_census event lists visible legacy property counts and up to five queue keys. Append a queue key to check committed rows and item definitions for a queue up to 256 segments. A missing namespace or a queue above this limit leaves custody unverified. A present journal requires separate reconciliation before a real drain.

For optional original-identity testing use a separate disposable copy of a stopped 1.4.1 LAB. In the copy of the original behavior pack, replace scripts/main.js with the repository's scripts/legacy-census/main.js and place behavior_pack/scripts/q4Lab.js beside it. Keep the original manifest/UUID. The replacement entry point exposes only the read-only census. Start only the disposable copy and run the census there. This probe is separate from the normal Fresh LAB installer.

The supplied production snapshot reconciled offline to 310563 items across 11 nonempty queues out of 36. The two longest committed ranges contain 10872 and 15309 rows. A live full census needs incremental paging, and a production transfer needs legacy journal reconciliation, terminal selection and a durable cross-pack handoff. None of those steps is enabled by this build.

### Full census on a legacy LAB copy

With the copied server stopped, update both census scripts from the same Git revision using the layout above. Start the copy and issue `scriptevent hartlab:q4_census_all` in the console. The probe checks up to eight rows per scheduled slice. It reports each queue and a COMPLETE line with queue, nonempty and item totals. HOLD identifies an incomplete scan. Journal and Q2/Q3 property counts are reported separately from Q4 cargo. An interrupted scan can be started again from the beginning.

### Locate the nonempty queues on the copied world

The full census on the 24-queue copy reconciled to 125539 items: q2 69884, q14 53939, q6 1016 and q22 700. Run `scriptevent hartlab:q4_sources` in the legacy probe to join each nonempty queue to its saved Receiver, count its registered present inbound Collectors, and inspect the Receiver and output Hopper when readable. Absent, ambiguous and unreadable sources retain their quantities in the report. The command performs no cargo writes or chunk loads. It establishes the source end of the route. A downstream network trace is still required to choose a terminal.

### Trace the hopper bus to a terminal candidate

On the stopped ThomasServer LAB copy, install both files from `scripts/legacy-census/` and `behavior_pack/scripts/q4Lab.js` together in the original behavior pack's scripts directory. Start the copy and run `scriptevent hartlab:q4_trace` in the BDS console. Append a queue key to repeat a single route. Each result includes the original quantity, the physical hopper lane ends, and the registered Collector links traversed. A candidate is the Receiver feeding the final observed Sorter lane with a single chest or barrel at its end. This describes the fixed block layout. Mobile inventories and redstone item-ejection systems require operator inspection. Double chests, competing pulls, cycles, unresolved outputs and absent Receivers yield HOLD.

The probe requests temporary ticking areas only for unreadable chunks and releases its requests after each queue. Loading a chunk can resume vanilla simulation. The probe performs no queue transfers or inventory writes. On the 24-queue LAB copy the expected accounting total is 125539, including 1016 held at q6, whose Receiver is physically absent. Inspect each candidate before using it for a future migration.
