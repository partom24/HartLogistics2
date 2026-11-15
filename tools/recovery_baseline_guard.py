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
    "OWNER_PRODUCT_OBJECTIVE.md",
    "NATIVE_FIRST_MECHANICS_AUDIT.md",
    "BASELINE_141_RECURSIVE_CENSUS.md",
    "BASELINE_141_FUNCTION_EFFECTS.md",
    "LEVEL1_NATIVE_API_RESEARCH_141.md",
    "LEVEL1_MECHANISM_DECISIONS_141.md",
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

    # Owner's two product-goal pictures are higher-level acceptance anchors.
    # These owner-supplied main-branch images are referenced by immutable Git
    # object identity, NEVER imported as recovery implementation source.
    objective = ROOT / "OWNER_PRODUCT_OBJECTIVE.md"
    mandate = ROOT / "RECOVERY_MANDATE.md"
    image_targets = {
        "sorter-array.png": "b80669b845803aca1060578f6997ebe035ae68db",
        "storage-room-array.png": "4c2cfb68c85576b9c898351741bb8b4ab5b6c383",
    }
    snapshot = "c40745834824806d6adefa487fb5bc5084fe057d"
    if objective.is_file() and mandate.is_file():
        product_text = objective.read_text(encoding="utf-8")
        mandate_text = mandate.read_text(encoding="utf-8")
        for image_name, image_blob_sha in image_targets.items():
            immutable_url = (
                "https://github.com/partom24/HartLogistics2/blob/"
                + snapshot + "/docs/reference-images/" + image_name
            )
            if immutable_url not in product_text:
                failures.append(f"owner product objective missing immutable image link: {image_name}")
            if image_blob_sha not in product_text:
                failures.append(f"owner product objective missing pinned blob identity: {image_name}")
            if immutable_url not in mandate_text:
                failures.append(f"recovery mandate missing owner's image objective: {image_name}")
        if "OWNER_PRODUCT_OBJECTIVE.md" not in mandate_text:
            failures.append("recovery mandate not linked to binding owner product objective")
        for required in (
            "both", "Sorter array", "storage-room array",
            "native-first", "owner", "acceptance"
        ):
            if required.lower() not in product_text.lower():
                failures.append(f"binding product objective missing acceptance requirement: {required}")
    # The owner's current 1.4.1-only scope is as binding as both images.
    # Future 1.5 systems must never become prerequisites for base conversion.
    if objective.is_file() and mandate.is_file():
        product_scope = objective.read_text(encoding="utf-8")
        mandate_scope = mandate.read_text(encoding="utf-8")
        for name, text_value in (
            ("OWNER_PRODUCT_OBJECTIVE.md", product_scope),
            ("RECOVERY_MANDATE.md", mandate_scope),
        ):
            required_scope = (
                "1.4.1", "Bulk Storage", "Transporter",
                "Q5", "custody engine", "deferred",
            )
            for term in required_scope:
                if term.lower() not in text_value.lower():
                    failures.append(f"{name} missing owner phase-scope condition: {term}")
        if "ACTIVE PHASE SCOPE" not in mandate_scope:
            failures.append("Recovery mandate missing explicit base-1.4.1-only phase scope")

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

    # Level 1 records are source/documentary classifications, not runtime passes.
    reference = ROOT / "LEVEL1_NATIVE_API_RESEARCH_141.md"
    if reference.is_file():
        reference_text = reference.read_text(encoding="utf-8")
        native_ids = set(re.findall(r"^### N(\d{2}) [—-]", reference_text, re.M))
        required_native_ids = {f"{n:02d}" for n in range(1, 40)}
        if native_ids != required_native_ids:
            failures.append("Level 1 native capability record incomplete: "
                            + repr(sorted(native_ids ^ required_native_ids)))
        if reference_text.count("https://learn.microsoft.com/") < 25:
            failures.append("Level 1 must cite official Microsoft references in depth")
        for required in ("2.7.0", "Hopper", "restricted-execution",
                         "not", "crash", "LEVEL1_MECHANISM_DECISIONS_141.md"):
            if required not in reference_text:
                failures.append(f"Level 1 missing essential qualification: {required}")
    decisions = ROOT / "LEVEL1_MECHANISM_DECISIONS_141.md"
    if decisions.is_file():
        decision_text = decisions.read_text(encoding="utf-8")
        mechanism_ids = set(re.findall(r"^\| \*\*M(\d{2})", decision_text, re.M))
        required_mechanisms = {f"{n:02d}" for n in range(1, 41)}
        if mechanism_ids != required_mechanisms:
            failures.append("Level 1 mechanism mapping missing/duplicated IDs: "
                            + repr(sorted(mechanism_ids ^ required_mechanisms)))
        for code in ("N01", "N09", "N13", "N29", "N35", "N39"):
            if code not in decision_text:
                failures.append(f"Level 1 mapping missing API family: {code}")

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
          "complete census, 39 API families, 40 Level 1 mechanisms, and both pinned owner reference images")
    print("This is structural provenance only; NOT BDS functionality/performance proof.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
