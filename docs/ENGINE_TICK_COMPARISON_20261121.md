# Hart Logistics engine tick comparison

**Decision, November 21, 2026.** Keep Fresh as the routing engine. Salvage the legacy Q4 journal, exact-slot handling and recovery semantics for the planned drain. Fresh-like idle and ordinary routing cost is plausible. Sustained drain cost and recovery at the new terminal-Receiver boundary require matched Bedrock runs.

## Dedicated-server evidence

| Capture | Script tick observations | Interpretation |
| --- | --- | --- |
| Fresh, Nov 21 at 16:50:14 local, before the 0.5.11 inline-book fix | 5,420 values across 2,710 timing records. Median 0.548 ms, P95 2.017 ms, P99 3.038 ms, peak 202.892 ms. One value exceeded 50 ms. | Both segments and both values per record are included. The earlier first-value-only summary missed the peak. The later 0.5.11 mixed-input LAB run confirmed book and plank arrival separately from this timing capture. |
| 1.4.1-derived P4g, active, Nov 17 | 252 samples. Median 31.754 ms, P95 65.592 ms. Destination admission averaged 52.584 slot reads per attempt. | The capture showed zero demonstrated reuse of the proposed full-chest rejection cache. This is a derivative build. Original 1.4.1 is measured separately below. |
| URCE 1.5.11, Nov 20, same protected Receiver | Mean 27.86 ms paused, 131.04 ms enabled, 27.03 ms paused again. Enabled peak 191.82 ms. Q4 held 16,388 items and delivered count stayed at 36,563. | Repeated link validation dominated the stalled drain. Of 10.19 seconds sampled inclusively in Receiver drain, 9.40 seconds were inside receiverLinkSafety. Parent and child times overlap. |

Fresh source files for the timing reconstruction were `diagnostics_2026-11-21_16-50-14.0.mcstats` and `diagnostics_2026-11-21_16-50-14.mcstats`. Decode the gzip/base64 records, group by tick, use all server_tick_timings/script_tick values, convert microseconds to milliseconds and use nearest-rank percentiles. These builds ran different workloads. The within-Receiver toggle isolates the URCE spike more closely than a ratio across builds.

[P4g measurements](https://github.com/partom24/HartLogistics2/blob/e49372ee306a5e4bc6b7c90ddae0198a8ca928c5/implementation/PHASE_A_P4G_ACTIVE_ROUTING_ASSESSMENT_20261117.md) · [URCE BDS incident](https://github.com/partom24/HartLogistics2/blob/64405b02fd99b6aee42108423ddf575bc3484c46/docs/URCE_1512_16388_Q4_PERFORMANCE_INCIDENT_20261120.md)

## Idle source comparison

Instrumented native stubs counted Dimension.getBlock calls over 128 empty ticks after 128 settling ticks. Each engine had 520 Filter Sorters, 130 four-high columns, 13 Collectors and 13 Receivers. Endpoint arrangements and native stubs differed. These counts describe work at the script/native boundary and cannot establish server latency or throughput.

| Source | Average block lookups per idle tick |
| --- | ---: |
| [Original 1.4.1, baseline hash verified](https://github.com/partom24/HartLogistics2/blob/1f760321afbc05977b0355bded404fafc25cc551/addon/behavior_pack/scripts/main.js#L3648) | 829.56 |
| [URCE 1.5.13](https://github.com/partom24/HartLogistics2/tree/64405b02fd99b6aee42108423ddf575bc3484c46) | 234.00 |
| [Fresh 0.5.11](https://github.com/partom24/HartLogistics2/blob/304d9b62753508b851147e5a2935c0781a1e3fd7/behavior_pack/scripts/main.js#L1836) | 56.88 |

Original 1.4.1 decrements its budget on movement, so an idle sweep can inspect every column. URCE reduced each check's cost. Fresh staggers registered Filter taps across four ticks (32.5 tap probes per tick here), checks Collector inputs every eight ticks and watches the addressed destination during an active Hopper shipment. Chest-fed inline items still depend on loaded native Hoppers and passive tap observation.

## Salvage boundary

Use Fresh discovery and indexed route selection. Revalidate the actual route, source ownership, power and destination capacity at transfer time. Bound unsuccessful retries so a stalled queue head does not trigger a full graph walk every tick. Preserve URCE's refusal and conservation tests. Its 1.5.13 native-stub suite demonstrated four items reaching a second-bank Filter chest through the original journal. That supports the old physical-delivery case. Consolidating into a terminal Receiver's virtual account requires separate proof of crash-safe debit and credit.

The Fresh routing suite and all 14 URCE full-runtime budget tests passed in this review. Native BDS parity remains open for the adapter. The [near-term drain milestone](MIGRATION_141_TO_FRESH_057_20261121.md#near-term-q4-drain-milestone) defines the intended destination, migration lock and performance comparison.
