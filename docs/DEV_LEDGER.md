# Hart Logistics 2 — Development Ledger

Dated engineering record for **HartLogistics2 only**. The inherited blueprint template's development ledger was example history for a different product, and is not Hart Logistics achievement or acceptance evidence.

## 2026-11-06 — Planning adoption (documentation only)

- Owner supplied Hart Logistics 1.4.1 source archive and HartBots 1.8.2 reference package in the project conversation.
- Owner established a non-negotiable compatibility requirement: **no loss of any current 1.4.1 capability**.
- Requirements captured for Bulk Storage (200,000 each; overflow; controllers across connected banks), Transporter (six-way 4×4 pipe; container ingress only), and Receiver Q4→Q5 with native metadata-rich lane and safe migration.
- Owner reports **Bedrock server 1.26.63.1 and client v26.63**; treated as the reported future test target, not a runtime PASS.
- Official 1.26.50 creator notes place custom block-entity containers in the experimental section; confirm behavior on reported 1.26.63.1 target and owner experiment policy before implementation.
- Owner authorized updating planning and project records in HartLogistics2; explicitly **not** gameplay implementation or modifying HartBots.
- Reset template-only project facts; retained reusable engineering policy and validator.
- **Not performed:** import of gameplay source into Git; Q5 conversion; block creation; Bedrock runtime testing; release approval.
- Review [roadmap](ROADMAP.md), [design](LOGISTICS_DESIGN.md), [migration](Q5_MIGRATION_DESIGN.md), [compatibility tests](COMPATIBILITY_TEST_PLAN.md), and [inbox](IDEA_INBOX.md) before starting any implementation milestone.


## 2026-11-06 — MR transport mechanism decision

- Owner explicitly chose to **replace the Q4 direct-only metadata-rich Hopper fallback** with native custom-container storage on both Collectors and Receivers; preserving a temporary compatibility route is permitted until the native path is validated, but retaining the bypass indefinitely is **not** required.
- Documented future MR intake/custody/output mapping, unload and restart protection, existing placed-block compatibility, and server 1.26.63.1/client v26.63 feature gate. **Planning only; no gameplay source changed.**

## 2026-11-06 — Updater boundaries and import permission

- Reviewed uploaded HartBots `scripts.zip` **statically only**. Reusable patterns include manual lab `-Apply`, pinned Git source, registration preservation, backup/staging, hash verification and rollback; original scripts are hardcoded to HartBots.
- Owner states sole server release-testing target is disposable lab `C:\\Servers\\Thomas_MCBedrock - Copy (2)`, which may be reset from latest production-derived ZIP; production `C:\\Servers\\Thomas_MCBedrock` is off-limits before release candidate nomination.
- Owner **explicitly permits importing the production updater script into HartLogistics2** but **forbids its execution until a candidate is nominated**. Nomination is not an automatic deployment approval. No script was run, and no server was modified.
- Added [deployment design](UPDATER_DEPLOYMENT_DESIGN.md). Further source import and updater implementation are not authorized by this planning record alone.
