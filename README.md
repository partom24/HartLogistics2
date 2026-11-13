# HartLogistics2 — Minecraft Bedrock add-on

**Status (2026-11-13): integrated development source, NOT release-ready.** The active work is [draft PR #79](https://github.com/partom24/HartLogistics2/pull/79). Its generated UCE candidate includes ordinary and native-item custody, multi-Receiver Transporter routing, per-network Bulk accounts, scoped recovery, and original Sorter filtering. These are source/CI capabilities, **not proof of full Bedrock acceptance**. The finished deliverable is a compatible, working replacement for Hart Logistics 1.4.1, including archived-world migration.

## Source of truth

- **Protected compatibility baseline:** `addon/behavior_pack/` and `addon/resource_pack/` are the original 72-file 1.4.1 tree; [hashes](BASELINE_HASHES.json). Never rewrite these files or use the baseline archive as an HL2 release.
- **Active product generator:** [`candidates/uce/prepare_candidate.py`](candidates/uce/prepare_candidate.py) derives an integrated unapproved Bedrock BP/RP under ignored `build/uce-integrated/`. The runtime integration is in `candidates/uce/runtime_bridge.js`, `runtime_pipe_route.js`, and `candidates/transport/` unified modules.
- **Historical predecessors and LAB tools:** `candidates/pgNN/` and the PG35–PG42 patch chain preserve exact-source rollback and forensic reconstruction contracts. They are not alternative HL2 product runtimes. PG42's temporary carrier probe is registered for its isolated diagnostic LAB world and **is not part of the UCE product generator**.
- **Engineering and evidence:** [current state](docs/CURRENT_DEVELOPMENT_STATE.md), [AGENTS.md](AGENTS.md), [ledger](docs/DEV_LEDGER.md), [evidence register](docs/ENGINEERING_EVIDENCE_REGISTER.md), [code hygiene policy](docs/CODE_HYGIENE_POLICY.md), and [release gates](docs/RELEASE_POLICY.md).

## Source-only build and packaging

```bash
python candidates/uce/prepare_candidate.py
python -m unittest discover -s tests -p 'test_uce_candidate_build.py' -v
python scripts/validate_blueprint.py
```

The general archive packager now **requires an explicit source** to prevent accidentally labeling the protected baseline as HL2:

```bash
python tools/build_mcaddon.py --source baseline
python tools/build_mcaddon.py --source hl2-uce --acknowledge-unapproved-source
```

The second command makes an explicitly marked, **UNAPPROVED SOURCE ONLY** archive for inspection. It is **not permission to manually install**, switch a world, activate the new authority, publish or use production. Any permitted LAB deployment uses exact-commit guarded tooling with stopped BDS, world backups and pack rollback, after a prepared integrated product acceptance milestone. Passing CI never authorizes deployment.

## Current integration boundaries

The UCE design uses one coordinated ordinary and native-item custody model, an authoritative Reader/Transporter/Sorter route graph, and a guarded persistent transfer/recovery layer. Ordinary Receiver capacity is 250,000 items; Bulk member capacity is 200,000. Per-bank and cross-shard transfers, native nine-slot persistent carriers, multi-Receiver routing, redstone and physical boundaries have source regression coverage; their complete in-game behavior is not accepted.

The critical unfinished work remains: a guarded **full-product LAB delivery** from the owner's current PG42 environment without overwriting preserved PG35/PG42 worlds; a **repeatable, non-destructive cold Q4 migration** from the restorable 1.4.1 archive, including metadata-rich records that cannot be reconstructed losslessly; and integrated Bedrock gameplay, restart, fault and release acceptance. Opaque Q4 records intentionally HOLD rather than silently lose metadata. Do not delete Q4 state, clear unresolved journals, re-spawn an uncertain native carrier, or treat a held migration as success.

**Protected environment:** production `C:\Servers\Thomas_MCBedrock` is off limits. Only a separately authorized, guarded operation may touch the LAB `C:\Servers\Thomas_MCBedrock - Copy (2)`. The current PG42 LAB is not the PG33 predecessor assumed by the older UCE install handoff. Keep original archives, LevelDB, backups and unrelated add-ons intact. Follow [the updated LAB handoff](candidates/uce/TEST_SESSION.md) before considering any BDS activity.

The project is **complete only** when a restored 1.4.1 world migrates, ordinary and metadata-rich items survive realistic network/restart conditions, throughput and 1.4.1 gameplay compatibility pass, and a specific release artifact is verified and owner-approved.
