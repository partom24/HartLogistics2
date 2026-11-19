#!/usr/bin/env python3
"""Fail-closed, offline continuity gate for HartLogistics evidence and tools.

The pinned original sources live on historic commits, not necessarily in the
current checkout. This validates discoverability and immutable GitHub provenance
metadata, NOT the truth or a re-execution of past owner Bedrock tests.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = "docs/PROJECT_STATIC_RESOURCES.json"
DOC = "docs/CANONICAL_EVIDENCE_AND_TOOLING.md"
ENTRY = "PROJECT_CONTINUITY.md"
REPO = "partom24/HartLogistics2"
SHA = re.compile(r"^[0-9a-f]{40}$")
CATEGORIES = {"evidence", "owner-contract", "tool-reference", "release-policy"}
REQUIRED_IDS = {
    "EVIDENCE-HL-E-MAIN", "NMR-CURATED", "NMR-CROSS-BRANCH-AUDIT",
    "PG42-SESSION", "OWNER-PRODUCT-CONTRACT", "OWNER-PLAYER-TESTING",
    "OWNER-REFERENCE-IMAGES", "PG27-POWERSHELL", "PG27-DEPLOY-BACKEND",
    "PG27-TESTS", "UCE-POWERSHELL", "UCE-DEPLOY-BACKEND",
    "FREEFORM-POWERSHELL", "FREEFORM-BACKEND",
    "FULLPRODUCT-POWERSHELL", "FULLPRODUCT-BACKEND",
    "POWERSHELL-RECOVERY-AUDIT", "RELEASE-POLICY"
}
PROTECTED_SOURCE = {
    "EVIDENCE-HL-E-MAIN": "docs/ENGINEERING_EVIDENCE_REGISTER.md",
    "OWNER-REFERENCE-IMAGES": "docs/reference-images",
    "PG27-POWERSHELL": "candidates/pg27/Start-HartLogistics-PG27Lab.ps1",
    "UCE-POWERSHELL": "candidates/uce/Start-HartLogistics-UCELab.ps1",
    "FREEFORM-POWERSHELL": "candidates/uce/Start-HartLogistics-FreeformLab.ps1",
    "FULLPRODUCT-POWERSHELL": "candidates/uce/Start-HartLogistics-FullProductLab.ps1",
    "PG42-SESSION": "candidates/uce/PG42_TEST_SESSION.md"
}
# The original 2026-11-18 source snapshot pins are preserved. A later source
# can ADD a successor resource, but must never silently rewrite these original
# provenance anchors. Bump the contract deliberately after owner review.
SOURCE_COMMITS = {
    "EVIDENCE-HL-E-MAIN": "56a7b47212630c771ecee2b9dc2af20808e30e8a",
    "PG27-POWERSHELL": "56a7b47212630c771ecee2b9dc2af20808e30e8a",
    "UCE-POWERSHELL": "c0de08258faacd97799c6a41c62ff1aef2bfbf40",
    "FREEFORM-POWERSHELL": "c0de08258faacd97799c6a41c62ff1aef2bfbf40",
    "FULLPRODUCT-POWERSHELL": "c0de08258faacd97799c6a41c62ff1aef2bfbf40",
    "PG42-SESSION": "c0de08258faacd97799c6a41c62ff1aef2bfbf40",
    "OWNER-PLAYER-TESTING": "6b2a957c6ce84b970d0d3f16206bd6ab0675bfa2",
}

class ContinuityError(ValueError):
    """Missing or downgraded project continuity evidence."""

def require(condition: bool, message: str) -> None:
    if not condition:
        raise ContinuityError(message)

def contents(root: pathlib.Path, path: str) -> str:
    file = root / path
    require(file.is_file(), f"Missing required project continuity file: {path}")
    return file.read_text(encoding="utf-8")

def check_repository(root: pathlib.Path = ROOT) -> int:
    root = pathlib.Path(root)
    entry = contents(root, ENTRY)
    catalog = contents(root, DOC)
    data = json.loads(contents(root, INDEX))
    require(data.get("schema_version") == 1, "Continuity schema changed")
    require(data.get("repository") == REPO, "Canonical repository changed")
    require(data.get("canonical_branch") == "main", "main must remain historical home")
    require(data.get("entrypoint") == ENTRY and
            data.get("canonical_index") == DOC, "Canonical path mismatch")
    resources = data.get("resources")
    require(isinstance(resources, list), "Resource index must be a list")
    seen: set[str] = set()
    for item in resources:
        require(isinstance(item, dict), "Invalid resource record")
        rid = item.get("id")
        require(isinstance(rid, str) and rid not in seen, f"Invalid/duplicate resource: {rid}")
        seen.add(rid)
        commit, path, category = item.get("commit"), item.get("path"), item.get("category")
        require(isinstance(commit, str) and SHA.fullmatch(commit) is not None,
                f"{rid} must point to a full immutable commit")
        require(isinstance(path, str) and path and not path.startswith("/") and
                ".." not in pathlib.PurePosixPath(path).parts and "\\" not in path,
                f"{rid} invalid canonical source path")
        require(category in CATEGORIES, f"{rid} invalid category")
        require(isinstance(item.get("scope_limit"), str) and len(item["scope_limit"]) >= 15,
                f"{rid} needs explicit original-scope limit")
        kind = "tree" if rid == "OWNER-REFERENCE-IMAGES" else "blob"
        wanted = f"https://github.com/{REPO}/{kind}/{commit}/{path}"
        require(item.get("url") == wanted, f"{rid} must link exact immutable source")
        if rid in PROTECTED_SOURCE:
            require(path == PROTECTED_SOURCE[rid],
                    f"{rid} original source path silently changed")
        if rid in SOURCE_COMMITS:
            require(commit == SOURCE_COMMITS[rid],
                    f"{rid} original evidence/tool revision silently changed")
    missing = REQUIRED_IDS - seen
    require(not missing, f"Canonical evidence/tool IDs missing: {sorted(missing)}")
    require("main" in entry and DOC in entry and INDEX in entry and
            "PowerShell" in entry and "HL-E" in catalog and
            "PG42" in catalog and "Plan" in catalog and "CheckLab" in catalog,
            "Canonical index or original evidence/tool explanation missing")
    for name in ("AGENTS.md", "README.md"):
        opening = contents(root, name)[:2700]
        require(ENTRY in opening and DOC in opening,
                f"{name} must introduce canonical source discovery near the top")
    for name in ("docs/ENGINEERING_EVIDENCE_REGISTER.md",
                 "docs/UPDATER_DEPLOYMENT_DESIGN.md",
                 "docs/RELEASE_POLICY.md"):
        intro = contents(root, name)[:2400]
        require("CANONICAL_EVIDENCE_AND_TOOLING.md" in intro,
                f"{name} must point to the permanent catalog")
    print(f"CONTINUITY PASS: {len(seen)} immutable resources, original evidence & PowerShell discoverable")
    return 0

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=pathlib.Path, default=ROOT,
                        help="checkout root, defaults to repository containing script")
    args = parser.parse_args(argv)
    try:
        return check_repository(args.root)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"CONTINUITY REFUSED: {exc}", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
