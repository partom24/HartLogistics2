#!/usr/bin/env python3
"""Independent versioned 1.4.2 baseline provenance and scope gate.

Unlike tools/recovery_baseline_guard.py (which intentionally forbids ALL
gameplay changes), this guard permits one explicitly scoped implementation
engine file plus BP/RP manifest patch versions in the 1.4.2 baseline branch.
All other original 1.4.1 asset bytes and pack IDs remain untouched.

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
VERSION_FILES = {
    "addon/behavior_pack/manifest.json": "2700f13cc3324235e280af597fdad9931569ae32f300a4ff55aa558b33db6817",
    "addon/resource_pack/manifest.json": "a761e781ae5b36519139b99d45d90679b7e1b7ce920dcfb3e11d9c338441aaf6",
}
ENGINE_142_SHA256 = "2183cc3de4d60c9895305e41612644a75360b2baba44403c2387e3679cdc4411"
EXPECTED_VERSION = [1, 4, 2]


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
        if changed_addon != sorted([ENGINE_FILE, *VERSION_FILES]):
            errors.append(f"Unexpected gameplay file changes: {changed_addon}")
        for p, recorded_hash in files.items():
            original = git("show", f"{BASELINE_COMMIT}:{p}")
            if hashlib.sha256(original).hexdigest() != recorded_hash:
                errors.append(f"Original baseline Git content mismatch: {p}")
            if p != ENGINE_FILE and p not in VERSION_FILES:
                actual = (ROOT / p).read_bytes()
                if hashlib.sha256(actual).hexdigest() != recorded_hash:
                    errors.append(f"Unapproved changed original asset: {p}")
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        errors.append(f"Cannot independently verify 1.4.1 Git provenance: {exc}")

    for file, expected in [(ENGINE_FILE, ENGINE_142_SHA256), *VERSION_FILES.items()]:
        if hashlib.sha256((ROOT / file).read_bytes()).hexdigest() != expected:
            errors.append(f"Unexpected 1.4.2 versioned source digest: {file}")
    try:
        bp = json.loads((ROOT / "addon/behavior_pack/manifest.json").read_text())
        rp = json.loads((ROOT / "addon/resource_pack/manifest.json").read_text())
        if bp["header"]["version"] != EXPECTED_VERSION or rp["header"]["version"] != EXPECTED_VERSION:
            errors.append("Both pack header versions must be exactly 1.4.2")
        if any(m["version"] != EXPECTED_VERSION for m in bp["modules"] + rp["modules"]):
            errors.append("All module versions must be exactly 1.4.2")
        if not any(d.get("uuid") == rp["header"]["uuid"] and d.get("version") == EXPECTED_VERSION
                   for d in bp["dependencies"]):
            errors.append("Behavior/resource pack dependency version mismatch")
        if bp["dependencies"][0].get("module_name") != "@minecraft/server" or bp["dependencies"][0].get("version") != "2.7.0":
            errors.append("Pinned native Script API 2.7.0 changed")
        if bp["header"]["uuid"] != "4854d263-05dd-4f79-a21c-7ba969295c2d" or rp["header"]["uuid"] != "91316442-0f26-4fbb-88f3-2e39ea843a1a":
            errors.append("Original pack UUID changed")
    except (KeyError, OSError, ValueError, IndexError) as exc:
        errors.append(f"Invalid versioned manifests: {exc}")

    objectives = ROOT / "OWNER_PRODUCT_OBJECTIVE.md"
    if not objectives.is_file():
        errors.append("Binding owner image objectives missing")
    else:
        value = objectives.read_text("utf-8")
        for name in ("sorter-array.png", "storage-room-array.png"):
            if name not in value:
                errors.append(f"Owner visual objective missing: {name}")

    # Owner's explicit scope correction: this branch converts original 1.4.1
    # only. Bulk, Transporter, Q5 and future 1.5 custody cannot creep into the
    # release checklist through an outdated architectural description.
    mandate = ROOT / "RECOVERY_MANDATE.md"
    status = ROOT / "implementation" / "ENGINE_STATUS.md"
    for label, scope_file in (
        ("RECOVERY_MANDATE.md", mandate),
        ("OWNER_PRODUCT_OBJECTIVE.md", objectives),
        ("implementation/ENGINE_STATUS.md", status),
    ):
        if not scope_file.is_file():
            errors.append(f"Binding 1.4.1 scope document missing: {label}")
            continue
        phase = scope_file.read_text("utf-8").lower()
        for expected in ("1.4.1", "bulk", "transporter", "q5", "custody engine"):
            if expected not in phase:
                errors.append(f"{label} missing phase-scope anchor: {expected}")
    if mandate.is_file() and "ACTIVE PHASE SCOPE" not in mandate.read_text("utf-8"):
        errors.append("Owner current-phase scope not in recovery mandate")
    if status.is_file() and "base 1.4.2 development baseline closed" not in status.read_text("utf-8"):
        errors.append("Base 1.4.1 completion boundary not recorded")

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
    print("ENGINE CANDIDATE GUARD: PASS — canonical 1.4.1 ancestry; exact 1.4.2 script")
    print("and BP/RP version manifests; all other gameplay assets and UUIDs preserved.")
    print("SOURCE PROVENANCE ONLY — NOT BDS/TPS, data safety or world acceptance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
