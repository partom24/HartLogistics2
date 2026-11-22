# Original-identity terminal configuration preview

Run on the isolated dispatch copy after the November 21 barrel checkpoint. The next question is whether Fresh can resolve the committed terminal's actual Hopper lane, registered Sorters, and incoming Collector links under the original identity. The November 22 fixture now starts from sharded legacy configuration, derives the settings, then exercises a normal Fresh delivery and restart offline.

Install the pinned preview with scripts/Install-Q4ConfigPreview.ps1 on the copied Windows BDS. The installer accepts the existing isolated dispatch entry, retains its modules, and replaces main.js last. The original dispatch-only entry remains available as dispatch-main.js. A changed main.js has a local backup. The preview launcher has source review only until exercised on Windows.

With the q2 terminal loaded, run the following in the copied server console.

```
scriptevent hartlab:q4_config q2
```

Capture the CONFIG PREVIEW or CONFIG HOLD line. A successful preview reports the same committed target as the previous handoff, the number of discovered Hoppers, Sorters, registered incoming Collector links and a breakdown by Sorter mode. The command resolves coordinates from the commit and follows the physical outlet below the Receiver. It reads loaded blocks only. It reads the committed legacy Sorter shard generation, verifies count and length, preserves stored filter records and honors the old implicit Filter mode. It refuses a stale v1 fallback if an active v2 generation is damaged. Registered incoming links are administrative records; proving those Collectors physically present is a later gate.

The result is an in-memory projection for this terminal. No queue debit, settings write, ticking-area creation, or second delivery is performed. A successful read is the evidence needed to proceed to a controlled routing rehearsal. The original barrel and q6 hold are still part of that rehearsal.

## Persist and verify the q2 settings

The isolated installer now keeps the preview and dispatch commands available and adds `hartlab:q4_settings`. With the copied terminal loaded, run `scriptevent hartlab:q4_settings apply q2`. Expect 170 verified settings (168 Sorters, one Receiver and one Collector link). A separate roster records the expected keys. Matching settings are reused and a conflict yields HOLD. Restart copied BDS, return near q2, and run `scriptevent hartlab:q4_settings verify q2`. Expect 170 settings and zero settings written. These commands preserve cargo and do not start the routing scheduler.
