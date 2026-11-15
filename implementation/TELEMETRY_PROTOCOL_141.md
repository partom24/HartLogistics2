# Base 1.4.1 conversion — native Bedrock LAB debugging and telemetry protocol

**Owner decision (2026-11-15):** Use the existing **Visual Studio Code Minecraft Bedrock Debugger**, **Bedrock Dedicated Server live diagnostics**, and **Bedrock's built-in Script Profiler / diagnostics captures** as the standard measurement stack. **No custom telemetry engine, new gameplay telemetry framework or telemetry-specific pack rewrite is authorized or needed** for the current 1.4.1 conversion.

This is a **testing protocol**, not BDS-observed performance evidence. The reference assets and [owner's phase scope](../OWNER_PRODUCT_OBJECTIVE.md) remain binding. Do not test on production or change existing worlds; use only the separately authorized preserved LAB copy.

## Instrumentation decision

| Need | Primary existing tool | What to capture | Limitation |
| --- | --- | --- | --- |
| Debug sorting, Hopper redstone, load/unload, filter and frame paths | Official **Minecraft Bedrock Debugger** extension in VS Code | Breakpoints, call stacks, watches, error traces, event delivery, script values | Pausing/breakpoints distort elapsed-time performance; not a TPS benchmark |
| Real tick health, loaded chunks, entity counts, process/script memory | **VS Code Minecraft Diagnostics live statistics** and Bedrock server diagnostics | Server tick duration/health, entity/chunk counts, script memory, other packs' load | High-level measures: cannot independently prove Hart item ownership or actual transfer counts |
| Script hotspots, native API boundary time, repeated functions | **Built-in Script Profiler** and `.cpuprofile` analyzed in VS Code | Per-function self/total CPU, call counts, native API hotspots | A profile is a sampling/measurement artifact, not an exact transaction journal |
| Detailed server diagnostic captures | `/script diagnostics startcapture` → `/script diagnostics stopcapture` in authorized LAB where commands are enabled | Matching capture data and server logs for each tested run | Server/version and command permission apply; do not enable cheats in production to acquire it |
| Script health and thresholds | BDS watchdog warnings and `server.properties` diagnostics settings | Slow-script, spike, memory and hang warnings | Leave safeguards enabled; do not raise/disable watchdog thresholds to hide performance |
| Functional conservation/throughput | Existing 1.4.1 `sendDiagnostics` snapshot plus **independent before/after inventory, output and queue reconciliation** | Real moved items, elapsed active time, items/s, lost/duplicated/metadata-changed cargo | Native profiler cannot infer exact item conservation; a small manual/test observation ledger can be recorded **outside the runtime**, not implemented as an add-on custody/telemetry engine |

**Do not add:** new always-on per-tick timing `Date.now()` calls, pervasive `console.log`, synthetic tick watchers, custom profilers, persistent telemetry dynamic properties, runtime item reserialization, or a duplicate server analytics engine. Existing in-game diagnostics should be used as-is unless one specific, proven gap requires an explicitly authorized minimal optional probe.

## How to run a comparable baseline-vs-conversion capture

1. **Same authorized LAB clone and arrangements:** Use owner-approved builds corresponding to both [Sorter array](https://github.com/partom24/HartLogistics2/blob/c40745834824806d6adefa487fb5bc5084fe057d/docs/reference-images/sorter-array.png) and [storage-room array](https://github.com/partom24/HartLogistics2/blob/c40745834824806d6adefa487fb5bc5084fe057d/docs/reference-images/storage-room-array.png). Test original 1.4.1 and the exact native-first candidate using equivalent world snapshots; never run two writers against the same saved world.
2. **Separate correctness and performance sessions:** Attach VS Code debugger to inspect event/slot state, resolve exceptions and validate behavior. For throughput/TPS profiling, **no stopped breakpoints or step-debugger pauses** in the measurement interval. Prefer a profiler capture while naturally running the workload.
3. **Record environment:** Save BDS version, `@minecraft/server` version, exact add-on source commit and `.mcaddon` artifact, other enabled packs, loaded chunks, hardware, session scenario and capture window. Do not compare unmatched windows as performance proof.
4. **Use built-in capture tools:** `/script profiler start` then `/script profiler stop` (produces a `.cpuprofile`); `/script diagnostics startcapture` then `/script diagnostics stopcapture` for authorized detailed diagnostic captures. VS Code's debugger extension also offers Start/Stop Profiler and live Diagnostics. Store original captures and server logs for independent comparison; exact storage paths depend on the BDS host and configuration.
5. **Exercise meaningful conditions:** Idle/empty Sorter arrays, active filters and Auto, Wildcard/BYPASS, locked/unlocked Hoppers, Collector/Receiver ingress and drain, sustained flow, full/blocked output and existing Q4 backlog. Use comparable windows and report p50/p95/p99 server tick health (if exposed by the capture), script hotspots, native API calls, memory, entities/chunks and item throughput.
6. **Verify correctness separately:** Reconcile items/metadata and existing 1.4.1 queues before/after on preserved LAB snapshots. Check redstone, transfer ordering, frame display, startup, unload/reload and restart behavior. **Green source tests, a profile, or quiet logs do not certify world safety.**
7. **Do not erase original profile evidence:** Store a run record referencing both sets of untouched captures (baseline and conversion). Measure several windows per scenario; classify `SOURCE-ONLY`, `BDS OBSERVED`, and `OWNER ACCEPTED` separately. No automatic production deploy.

## Evaluation rule

The immediate question is whether the conversion **actually reduces server tick cost without reducing useful throughput, breaking routing, or changing an owner's 1.4.1 world**. A source-level reduction from 20,805 `getItem` mock calls to 1,387 native `firstItem` queries may or may not improve actual TPS. Use native profiles to find out, not a custom telemetry layer.

No Bulk Storage, Transporter, Q5 or new 1.5 custody-engine work is within this testing protocol.

## Official reference

- [Microsoft: Minecraft VS Code Debugger](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/vscode-debugger?view=minecraft-bedrock-stable)
- [Mojang: Minecraft Bedrock Debugger extension](https://marketplace.visualstudio.com/items?itemName=mojang-studios.minecraft-debugger)
- [Microsoft: Performance in Scripting](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/script-performance?view=minecraft-bedrock-stable) — Script Profiler, native API profiling, `.cpuprofile`.
- [Microsoft: Debugging Scripts](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/debugging-scripts?view=minecraft-bedrock-stable) — profiler and diagnostics commands.
- [Microsoft: Bedrock Dedicated Server Properties](https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties?view=minecraft-bedrock-stable) — watchdog and diagnostics capture configuration.

**Decision:** built-in debugger + native server profiling + existing 1.4.1 status counters. **No replacement telemetry subsystem**.
