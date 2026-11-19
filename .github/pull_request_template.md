## Mandatory HartLogistics project continuity check

- [ ] I read [PROJECT_CONTINUITY.md](../PROJECT_CONTINUITY.md), the original [canonical evidence and PowerShell tools catalog](../docs/CANONICAL_EVIDENCE_AND_TOOLING.md), and the [immutable reference index](../docs/PROJECT_STATIC_RESOURCES.json).
- [ ] I searched original main HL-E evidence, curated NMR/PG42 sources and historical candidate launchers **before** declaring an API/test/tool missing or requesting an owner retest.
- [ ] I distinguished historical evidence scope, current-branch implementation, source-only CI, owner BDS testing and production release.
- [ ] I preserved or intentionally updated all static anchors; `python scripts/check_project_continuity.py` and `python -m unittest discover -s tests -p test_project_continuity.py -v` passed.
- [ ] If shipping a LAB test candidate, I reviewed the one-file PowerShell Plan/CheckLab/Install/Rollback precedent, source SHA, exact predecessor hashes and explicit rollback. I did not substitute manual Python or a CI .mcaddon download as automatically approved installation.
- [ ] I preserved owner gameplay goals: Transporter as readable network infrastructure; Bulk as controller; any valid player layout/items with MR/ordinary differences; protect existing Q4 and worlds.

**When a pinned original resource is intentionally superseded:** identify original URL, replacement SHA, reason, evidence scope, and original nonclaims. Do not delete old evidence or frozen tool references.

**This PR must not silently rewrite archived candidate history or imply that a reference-only launcher is current deployable tooling.**
