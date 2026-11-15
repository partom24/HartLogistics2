#!/usr/bin/env python3
"""Guard a 1.4.1-only HartLogistics2 recovery branch.

All canonical gameplay files must stay byte-for-byte identical to the owner's
1.4.1 import. This is an ancestry/content gate, not Bedrock runtime evidence.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE_COMMIT = "0ea3000651c116b0fa1acc2836ab7e1bcfbc6269"
FOUNDATION = (
    "RECOVERY_MANDATE.md",
    "NATIVE_FIRST_MECHANICS_AUDIT.md",
    "BASELINE_141_RECURSIVE_CENSUS.md",
    "BASELINE_141_FUNCTION_EFFECTS.md",
)
FORBIDDEN_IMPORT_ROOTS = ("candidates/", "build/uce-", "tests/test_uce_", "tests/test_unified_")
ALLOW_CHANGED_PREFIXES = (
    "recovery/",
    "tools/recovery_",
    ".github/workflows/recovery-",
    "docs/recovery_",
)
ALLOW_CHANGED_EXACT = set(FOUNDATION)


def git(*args: str) -> str:
    p = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
    )
    return p.stdout.strip()


def main() -> int:
    failures: list[str] = []
    inventory = json.loads((ROOT / "BASELINE_HASHES.json").read_text(encoding="utf-8"))
    recorded = inventory.get("files", {})
    if inventory.get("baseline_version") != "1.4.1" or len(recorded) != 72:
        failures.append("canonical 72-file 1.4.1 hash registry is missing/changed")

    existing = {str(p.relative_to(ROOT)).replace("\\", "/")
                for p in (ROOT / "addon").rglob("*") if p.is_file()}
    expected = set(recorded) | {"addon/README.md"}
    if existing != expected:
        failures.append("addon tree differs from original 72 files plus baseline README: "
                        + repr(sorted(existing ^ expected)))
    for rel, expected_sha in sorted(recorded.items()):
        file = ROOT / rel
        if not file.is_file():
            failures.append(f"missing canonical original: {rel}")
            continue
        actual_sha = hashlib.sha256(file.read_bytes()).hexdigest()
        if actual_sha != expected_sha:
            failures.append(f"modified canonical original: {rel}")

    for name in FOUNDATION:
        if not (ROOT / name).is_file():
            failures.append(f"mandatory recovery foundation missing: {name}")
    audit = (ROOT / "NATIVE_FIRST_MECHANICS_AUDIT.md")
    if audit.exists():
        text = audit.read_text(encoding="utf-8")
        for number in range(1, 41):
            if f"**M{number:02d}**" not in text:
                failures.append(f"missing audit mechanism M{number:02d}")
    census = ROOT / "BASELINE_141_RECURSIVE_CENSUS.md"
    if census.exists():
        text = census.read_text(encoding="utf-8")
        for path in recorded:
            if path not in text:
                failures.append(f"missing original source path from census: {path}")
        function_lines = [line for line in text.splitlines()
                          if line.startswith('| [')
                          and '/addon/behavior_pack/scripts/main.js#L' in line]
        if len(function_lines) != 180:
            failures.append("function census must enumerate exactly 180 original declarations")

    effects = ROOT / "BASELINE_141_FUNCTION_EFFECTS.md"
    if effects.exists():
        count = sum(1 for line in effects.read_text(encoding="utf-8").splitlines()
                    if line.startswith("| [") and "/addon/behavior_pack/scripts/main.js#L" in line)
        if count != 180:
            failures.append("every baseline JavaScript function requires an effects row")

    if (ROOT / ".git").exists():
        try:
            base = git("rev-parse", BASELINE_COMMIT)
            common = git("merge-base", "HEAD", base)
            if common != base:
                failures.append("recovery HEAD must descend from exact 1.4.1 import")
            changes = git("diff", "--name-only", base, "HEAD").splitlines()
            for path in changes:
                if path.startswith(FORBIDDEN_IMPORT_ROOTS):
                    failures.append(f"forbidden old-candidate-style path: {path}")
                if path.startswith("addon/"):
                    failures.append(f"immutable addon changed since baseline: {path}")
                if path not in ALLOW_CHANGED_EXACT and not any(
                    path.startswith(prefix) for prefix in ALLOW_CHANGED_PREFIXES
                ):
                    failures.append(f"unreviewed change outside recovery area: {path}")
            original_paths = git("ls-tree", "-r", "--name-only", base).splitlines()
            if census.exists():
                content = census.read_text(encoding="utf-8")
                for path in original_paths:
                    if path not in content:
                        failures.append(f"missing baseline path in census: {path}")
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            failures.append(f"could not verify Git ancestry/provenance: {exc}")
    else:
        failures.append("Git metadata missing: ancestry proof unavailable")

    if failures:
        print("RECOVERY BASELINE GATE: FAIL")
        for problem in failures:
            print(" -", problem)
        return 1
    print("RECOVERY BASELINE GATE: PASS — 1.4.1 ancestry, original hashes, "
          "complete census and 40 native-first audit entries")
    print("This is structural provenance only; NOT BDS functionality/performance proof.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
