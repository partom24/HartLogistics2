# URCE 1.5 — Update distribution and player-LAB testing review

**Review date:** 2026-11-18. **Reviewed branch:** `dev/urce-150-runtime-20261118`, originally at `413e370d97430f2dd202e4e2a63f80cd61ea3356`. **Target:** owner copied LAB BDS 1.26.63.1, not production. **Authority:** owner asked to review distribution for updates/testing; existing continued-development authorization does **not** authorize changing LAB or production. **Review classification:** source and GitHub CI observation; **not** an owner BDS installation test.

## 1. Actual current distribution chain

1. **Source change** on a reviewable development branch. Original 1.4.2 source and 1.4.1 baseline remain separate. In the current infrastructure-only 1.5 candidate, `main.js` adds one read-only script import and development version; the underlying accepted 1.4.2 movement engine is SHA-pinned.
2. **CI**: `.github/workflows/urce-150-development.yml` validates repository structure, JavaScript syntax, U1/U2 source models, native-shaped player topology tests, and the separate 1.5 LAB updater on disposable synthetic worlds. It packs source BP/RP using `tools/build_mcaddon.py`, checks manifest/asset presence, verifies deterministic same-source packaging and emits a **build manifest with exact commit and SHA-256** for the generated `.mcaddon` and each `.mcpack`.
3. **Distribution artifact**: GitHub Actions run artifact `HL-URCE-150-READONLY-INFRASTRUCTURE-DEV-NOT-RELEASED`, containing the `.mcaddon` **and its build-manifest JSON**, retained for **14 days**. This is a development/test artifact, **not a release or guaranteed forever download**. Download it from the exact successful source-commit run (not a vaguely named latest branch run).
4. **Installation path is separate**: `scripts/hartlogistics_150_lab_updater.py` reads the *clean Git checkout's canonical `addon/` source*, **not** the downloaded Actions `.mcaddon`. It requires exact Git origin/HEAD/commit, exact canonical Windows LAB path, stopped LAB server, known installed pack identity/content, and matching world registrations. It dry-runs without `--apply`; only an explicit owner-authorized `--apply` stages packs, backs up old packs/registry bytes, swaps and postverifies with rollback upon ordinary exceptions. The old `scripts/hartlogistics_lab_updater.py` is strictly 1.4.2 and must not be used for 1.5.
5. **Player tests**: after an authorized copied-LAB installation, the owner constructs **any valid layout** and uses **any legitimate items** rather than a fixed XYZ/ID fixture. For this *infrastructure-only* preview, test visuals, Transporter-adjacency readout, unload/invalidation/loop messaging, placement/break behavior and unrelated legacy 1.4.2 routing; the new Bulk block is **not yet functional storage**, and Transporter is **not yet a cargo mover**. Obtain Bedrock logs, player-visible failures, script diagnostics/profiler as relevant and exact commit+pack version. Do not infer full URCE acceptance from preview.
6. **Promotion**: the existing [release policy](RELEASE_POLICY.md) requires immutable candidate bytes/checksum, actual runtime acceptance, explicit owner sign-off, risk and rollback review. Source merge, a successful workflow or 1.5.0 BP/RP manifests **never automatically approve production**, and the LAB updater has no production target.

## 2. Findings and dispositions

| ID | Finding | Status / next action |
| --- | --- | --- |
| DIST-01 | **No repeatable 1.5→newer 1.5 update contract yet.** The 1.5 updater accepts an installed 1.5.0 pack only when its file hashes are *identical* to the current candidate. A newer development commit with changed pack bytes and the same 1.5.0 version will correctly **REFUSE** rather than overwrite it. | **OPEN — resolve before the second player-LAB candidate.** Bump both BP/RP version tuples per test release and explicitly validate the *known installed predecessor* at exact pack-file hashes / source commit, or implement an equally strict recorded predecessor-receipt chain. Do not disable hash refusal or treat a version string alone as authenticity. |
| DIST-02 | Initial 1.4.2→1.5 installer transition had not been exercised by the first eight disposable tests; prior tests mostly exercised already-identical 1.5.0 installations. | **Test coverage added:** reconstruct the exact accepted 1.4.2 pack from pinned Git ancestry in temporary directories, exercise accepted first transition, unrelated-registry preservation, interrupted two-pack rollback and refusal of unknown same-version source. **Offline CI PASS is still required after test changes**; actual owner installed files must be compared in a LAB preflight. |
| DIST-03 | The Actions artifact and guarded installer are **two different input paths** (built archive vs clean Git source). CI package presence did not establish a transportable SHA manifest or independent cross-path equality. | **Process improved:** deterministic double build and SHA-256 build manifest linked to Git commit and package contents. At owner handoff, local source build/installer must match the successful-run `.mcaddon` checksum, or the difference must be investigated. Do not install arbitrary downloaded ZIPs and claim the Git updater approved them. |
| DIST-04 | Source tests / synthetic updater mocks cannot prove native BDS 1.26.63.1 loaded geometry, that the custom blocks appear correctly, uninterrupted real-world state, or actual performance and player interaction. | **OPEN owner LAB acceptance**, not a CI defect. Use player-selected valid topology, errors/logs, BDS diagnostics and prior PG20/PG42 evidence reuse. No exact XYZ or item allowlist. |
| DIST-05 | The 14-day workflow artifact is not an immutable long-term release repository; repeated 1.5.0 dev versions and fixed artifact names can be confusing. | **OPEN for release/promotion:** candidate manifest must include commit, version, pack UUIDs, SHA-256 and acceptance scope; formally approved release artifact must be retained immutably, with explicit promotion/rollback. Future test candidates need unique build identities. |
| DIST-06 | Some README/update-planning descriptions still describe source-only planning, exact test layouts, or the older HartBots reference as the current deployment procedure. | **Docs clarified:** current process points to this review, latest owner layout/item policy and the dedicated 1.5 updater. Historical instructions remain historical; never re-enable automatic deployment or production updater preflight. |
| DIST-07 | There is no evidence that the player's current LAB installed pack hashes/world registry have been matched by a Windows dry-run of this new 1.5 updater. | **OPEN target-specific preflight**. The updater should refuse unknown states rather than improvise an installation. Do not assert initial upgrade or rollback is safe on the owner's actual LAB merely because synthetic tests pass. |
| DIST-08 | No actual **new URCE end-to-end item-routing runtime** is enabled: U1/U2 are offline models and the new visible blocks are a diagnostics-only shell. | **Separate product gate OPEN**. The current artifact is valid for an **infrastructure preview test**, not for concluding 1.5 cargo throughput, Bulk behavior, or MR custody integration. |

## 3. Canonical source-to-LAB handoff (not an instruction to execute now)

**Developer/CI:** freeze a commit, wait for all required CI jobs on that **exact SHA**, collect the successful-run `.mcaddon` and accompanying `.build-manifest.json`; independently record build identity and hash. Do not call it LAB-ready until accepted-predecessor checks and a player test card are scoped.

**Owner on Windows, after a specific LAB trial is authorized and LAB BDS is stopped** (example commands; substitute the exact *candidate* full SHA, not a moving branch head):

```powershell
git fetch origin
git checkout --detach <FULL_40_CHARACTER_APPROVED_CANDIDATE_SHA>
git status --short
python scripts/hartlogistics_150_lab_updater.py --commit <FULL_40_CHARACTER_APPROVED_CANDIDATE_SHA>
# Only after reviewing dry-run source/installed-version/registry checks:
python scripts/hartlogistics_150_lab_updater.py --commit <FULL_40_CHARACTER_APPROVED_CANDIDATE_SHA> --apply
```

These commands execute **only from the expected Git checkout** and only on the exact copied LAB path. A refused preflight is a signal to inspect evidence, not to manually copy files around the updater. Do **not** run either updater on production or treat `--apply` as approved by the existence of this procedure. Preserve its reported backup path and do not remove it before acceptance.

**Post-install:** verify Bedrock server start and actual pack version/UUIDs, no loader/script errors, block registration, visible Transporter graph under arbitrary valid placement, absence of accidental 1.5 custody writes, and unaffected previously accepted legacy routing when affected by the wrapper. Retain rollback and source/run ID and observed data. If prior proof remains unaffected, cite evidence instead of rebuilding old manual rigs.

## 4. Decision for current distribution

**Current 1.5.0 preview:** after exact-head green CI, may be **nominated for a narrowly scoped owner-controlled infrastructure LAB test**; not accepted for cargo-routing or public release. Its exact installed-predecessor match remains an owner preflight matter.

**Second 1.5.0 or newer runtime candidate:** **DO NOT** assume the existing installer will apply it; resolve DIST-01 version/provenance upgrade chain and rerun the correct synthetic and actual LAB preflight first. Avoid same-version overwrites that hide changed gameplay bytes.

**Production:** hard deny until a separately nominated complete release candidate, source/artifact checksum, owner evidence and explicit promotion approval.
