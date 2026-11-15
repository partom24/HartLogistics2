#!/usr/bin/env python3
"""Independent 1.4.1-only implementation candidate provenance and scope gate.

Unlike tools/recovery_baseline_guard.py (which intentionally forbids ALL
gameplay changes), this guard permits one explicitly scoped implementation
file in the separate branch, while preserving all original BP/RP assets,
manifests, IDs, and the original 1.4.1 lineage as read-only evidence.

This is static source isolation, not BDS or owner-world acceptance.
"""
from __future__ import annotations
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE_COMMIT = "0ea3000651c116b0fa1acc2836ab7e1bcfbc6269"
ENGINE_FILE = "addon/behavior_pack/scripts/main.js"


def git(*args: str) -> bytes:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True).stdout


def main() -> int:
    errors = []
    baseline_hashes = json.loads((ROOT / "BASELINE_HASHES.json").read_text("utf-8"))
    files = baseline_hashes.get("files", {})
    if baseline_hashes.get("baseline_version") != "1.4.1" or len(files) != 72:
        errors.append("Invalid original 1.4.1 72-file checksum inventory")

    try:
        common = git("merge-base", "HEAD", BASELINE_COMMIT).decode().strip()
        if common != BASELINE_COMMIT:
            errors.append("Implementation is not descended from canonical 1.4.1 import")
        changed = git("diff", "--name-only", BASELINE_COMMIT, "HEAD").decode().splitlines()
        changed_addon = sorted(p for p in changed if p.startswith("addon/"))
        if changed_addon != [ENGINE_FILE]:
            errors.append(f"Unexpected gameplay file changes: {changed_addon}")
        for p, recorded_hash in files.items():
            original = git("show", f"{BASELINE_COMMIT}:{p}")
            if hashlib.sha256(original).hexdigest() != recorded_hash:
                errors.append(f"Original baseline Git content mismatch: {p}")
            if p != ENGINE_FILE:
                actual = (ROOT / p).read_bytes()
                if hashlib.sha256(actual).hexdigest() != recorded_hash:
                    errors.append(f"Unapproved changed 1.4.1 gameplay asset: {p}")
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        errors.append(f"Cannot independently verify 1.4.1 Git provenance: {exc}")

    objectives = ROOT / "OWNER_PRODUCT_OBJECTIVE.md"
    if not objectives.is_file():
        errors.append("Binding owner image objectives missing")
    else:
        value = objectives.read_text("utf-8")
        for name in ("sorter-array.png", "storage-room-array.png"):
            if name not in value:
                errors.append(f"Owner visual objective missing: {name}")

    source = (ROOT / ENGINE_FILE).read_text("utf-8")
    if source.count("function schedulerTick()") != 1:
        errors.append("Engine scheduler entrypoint changed unexpectedly")
    if source.count("function processColumn(") != 1:
        errors.append("Sorter engine entrypoint changed unexpectedly")
    if source.count("function processCollectorIngress(") != 1:
        errors.append("Collector engine entrypoint changed unexpectedly")
    if "firstItem()" not in source:
        errors.append("Native 2.7 firstItem optimization missing")

    for err in errors:
        print("ENGINE CANDIDATE GUARD:", err)
    if errors:
        return 1
    print("ENGINE CANDIDATE GUARD: PASS — 1.4.1-only ancestry; original assets,")
    print("manifests and IDs untouched; only approved candidate engine script changed.")
    print("SOURCE PROVENANCE ONLY — NOT BDS/TPS, data safety or world acceptance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
