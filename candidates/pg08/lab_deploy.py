"""Guarded PG-08 *LAB ONLY* plan/apply; never touches production.

Uses the existing source-verified Bundle 0 transaction engine. Builds the
candidate transiently, verifies the exact known LAB and its current 1.4.1 or
failed 1.5.0 Hart Logistics registration, and replaces ONLY Hart Logistics
BP/RP with backups. No world resets, experiment toggles or auto-restarts.

No --apply is permitted without exact Git commit pin and explicit flags.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import ntpath
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
WORLD_NAME = "ThomasServer"
EXPECTED_DIRS = ("HartMods_HartLogistics_BP", "HartMods_HartLogistics_RP")
KNOWN_INSTALLED_VERSIONS = {(1, 4, 1), (1, 5, 0)}
CANDIDATE_VERSION = (1, 5, 1)


def load_module(path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load existing source module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lab = load_module(ROOT / "scripts/hartlogistics_lab_updater.py", "hl_lab_base")
candidate = load_module(ROOT / "candidates/pg08/prepare_candidate.py", "hl_pg08_build")


def check_candidate(source: Path):
    bp = json.loads((source / "behavior_pack/manifest.json").read_text(encoding="utf-8"))
    rp = json.loads((source / "resource_pack/manifest.json").read_text(encoding="utf-8"))
    if (bp["header"]["uuid"], rp["header"]["uuid"]) != (lab.BP_UUID, lab.RP_UUID):
        raise lab.UnsafeLab("PG08 candidate UUID mismatch")
    if tuple(bp["header"]["version"]) != CANDIDATE_VERSION or tuple(rp["header"]["version"]) != CANDIDATE_VERSION:
        raise lab.UnsafeLab("PG08 candidate version mismatch")
    if not any(d.get("uuid") == lab.RP_UUID and
               tuple(d.get("version", ())) == CANDIDATE_VERSION
               for d in bp.get("dependencies", [])):
        raise lab.UnsafeLab("PG08 BP/RP dependency mismatch")
    ui = [d for d in bp.get("dependencies", []) if d.get("module_name") == "@minecraft/server-ui"]
    if len(ui) != 1 or ui[0].get("version") != "2.2.0":
        raise lab.UnsafeLab("PG08 stable UI dependency unavailable")
    script = (source / "behavior_pack/scripts/main.js").read_text(encoding="utf-8")
    if (script.count('const VERSION = "1.5.1-LAB-PG08"') != 1 or
        "function pg08CommitLink(" not in script or
        "world.beforeEvents.playerInteractWithBlock.subscribe" not in script or
        'from "@minecraft/server-ui"' not in script):
        raise lab.UnsafeLab("PG08 candidate script was not compiled as expected")
    return {kind: lab.hashes(source / kind) for kind in ("behavior_pack", "resource_pack")}


def version_in_registry(raw: bytes, pack_id: str):
    data = json.loads(lab.remove_jsonc(raw.decode("utf-8-sig")))
    if not isinstance(data, list) or any(not isinstance(x, dict) for x in data):
        raise lab.UnsafeLab("Invalid LAB registry structure")
    matches = [x for x in data if str(x.get("pack_id", "")).casefold() == pack_id.casefold()]
    if len(matches) != 1:
        raise lab.UnsafeLab("Expected one existing Hart Logistics registration")
    return lab.v3(matches[0].get("version"))


def create_plan(root: Path, generated: Path):
    """Read-only synthetic or real LAB plan. Never writes root."""
    candidate_hashes = check_candidate(generated)
    original = lab.discover_plan(ROOT, root)
    if len(original) != 2:
        raise lab.UnsafeLab("Expected exactly two existing Hart Logistics pack roots")
    if any(item["registry"].parent.name != WORLD_NAME for item in original):
        raise lab.UnsafeLab("Expected existing LAB world ThomasServer")
    versions = []
    updated = []
    for i, item in enumerate(original):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if item["target"].name != EXPECTED_DIRS[i] or item["target"].parent.name != folder:
            raise lab.UnsafeLab("Unexpected Hart Logistics shared pack location")
        manifest = json.loads((item["target"] / "manifest.json").read_text(encoding="utf-8"))
        installed = lab.v3(manifest["header"]["version"])
        registered = version_in_registry(item["old_bytes"], pack_id)
        if installed != registered:
            raise lab.UnsafeLab("Installed pack manifest/registration disagree")
        versions.append(installed)
        updated.append({
            **item,
            "source": generated / kind,
            "files": candidate_hashes[kind],
            "new_registry": lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"), pack_id, CANDIDATE_VERSION
            ),
            "old_hashes": lab.hashes(item["target"]),
        })
    if len(set(versions)) != 1 or versions[0] not in KNOWN_INSTALLED_VERSIONS:
        raise lab.UnsafeLab("Unknown or mixed previous Hart Logistics versions")
    return updated


def assert_lab_process_stopped():
    """Do not force the separately running production BDS process to stop."""
    if os.name != "nt":
        raise lab.UnsafeLab("Actual LAB operations require Windows")
    script = (
        "$ErrorActionPreference='Stop'; "
        "Get-Process -Name bedrock_server -ErrorAction SilentlyContinue | "
        "ForEach-Object {if (-not $_.Path){throw 'Cannot resolve BDS executable path'}; $_.Path}"
    )
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                            capture_output=True, text=True, check=True)
    lab_exe = ntpath.normcase(ntpath.normpath(lab.LAB + r"\bedrock_server.exe"))
    for line in result.stdout.splitlines():
        if ntpath.normcase(ntpath.normpath(line.strip())) == lab_exe:
            raise lab.UnsafeLab("The LAB Bedrock server must be stopped")
    return True


def check_real_root():
    lab.assert_lab_name(lab.LAB)
    root = Path(lab.LAB)
    lab.assert_no_link(root)
    if ntpath.normcase(str(root.resolve(strict=True))) != ntpath.normcase(lab.LAB):
        raise lab.UnsafeLab("LAB path is redirected")
    assert_lab_process_stopped()
    return root


def plan_is_unchanged(plan):
    for item in plan:
        if item["registry"].read_bytes() != item["old_bytes"]:
            raise lab.UnsafeLab("LAB registry changed during preflight")
        if lab.hashes(item["target"]) != item["old_hashes"]:
            raise lab.UnsafeLab("LAB installed pack changed during preflight")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", help="exact full Git HEAD to pin an authorized checkout")
    parser.add_argument("--check-lab", action="store_true", help="read-only installed LAB preflight")
    parser.add_argument("--apply", action="store_true", help="explicit LAB pack/registration replacement")
    parser.add_argument("--confirm-lab-only", action="store_true",
                        help="confirm only the existing LAB world and packs may be updated")
    args = parser.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if args.apply and (not args.check_lab or not args.confirm_lab_only):
            raise lab.UnsafeLab("Apply requires --check-lab and --confirm-lab-only")
        if args.check_lab and not args.commit:
            raise lab.UnsafeLab("LAB preflight requires an exact --commit pin")
        if args.commit:
            lab.assert_clean_git(ROOT, args.commit)
        # No server reads/writes in default source-only mode, even on Windows.
        candidate.check_baseline()
        with tempfile.TemporaryDirectory(prefix="pg08-offline-") as scratch:
            generated = Path(scratch) / "pg08"
            candidate.prepare(generated)
            hashes = check_candidate(generated)
            if not args.check_lab:
                print("PG08 SOURCE PASS: unchanged 72-file baseline; candidate", CANDIDATE_VERSION)
                print("BP files:", len(hashes["behavior_pack"]), "RP files:", len(hashes["resource_pack"]))
                print("No LAB/PROD files accessed.")
                return 0
            root = check_real_root()
            plan = create_plan(root, generated)
            for item in plan:
                print("Hart Logistics LAB only:", item["target"], "->", CANDIDATE_VERSION)
            if not args.apply:
                print("LAB PREFLIGHT PASS: READ-ONLY. Nothing installed.")
                return 0
            # Defend against a changed registration or pack since planning.
            assert_lab_process_stopped()
            plan_is_unchanged(plan)
            backup = lab.apply_plan(root, plan)
            print("PG08 LAB INSTALL COMPLETE. Original Hart Logistics packs/registries backed up:", backup)
            print("NO BDS RUNTIME PASS IMPLIED; do not delete backup or reset cloned world.")
            return 0
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError,
            lab.UnsafeLab) as exc:
        print("PG08 REFUSED:", str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
