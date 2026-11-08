"""PG24 exact stopped-LAB pack upgrade 1.5.6 PG23 -> 1.5.7 PG24.

Offline source Plan by default; LAB CheckLab is read-only, Install/Rollback
explicit and exact-sha/pack-hash guarded. No production or world reset.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
NEW_VERSION = (1, 5, 7)
OLD_VERSION = (1, 5, 6)
WORLD = "ThomasServer"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg23_deploy = load(ROOT / "candidates/pg23/lab_deploy.py",
                   "pg24_old_verified_installer")
pg24 = load(ROOT / "candidates/pg24/prepare_candidate.py",
            "pg24_q4_entity_receipt_builder")
pg23 = pg24.pg23
pg08 = pg23_deploy.pg08
lab = pg23_deploy.lab


def check_candidate(generated):
    bp = json.loads((generated / "behavior_pack/manifest.json").read_text())
    rp = json.loads((generated / "resource_pack/manifest.json").read_text())
    if bp["header"]["uuid"] != lab.BP_UUID or rp["header"]["uuid"] != lab.RP_UUID:
        raise lab.UnsafeLab("PG24 BP/RP UUID mismatch")
    if (lab.v3(bp["header"]["version"]) != NEW_VERSION or
            lab.v3(rp["header"]["version"]) != NEW_VERSION):
        raise lab.UnsafeLab("PG24 requires exact 1.5.7 BP/RP")
    if any(lab.v3(m["version"]) != NEW_VERSION
           for m in bp["modules"] + rp["modules"]):
        raise lab.UnsafeLab("PG24 module versions mismatch")
    if len([d for d in bp["dependencies"] if d.get("uuid") == lab.RP_UUID
            and lab.v3(d.get("version", ())) == NEW_VERSION]) != 1:
        raise lab.UnsafeLab("PG24 BP/RP dependency mismatch")
    for name, version in (("@minecraft/server", "2.7.0"),
                          ("@minecraft/server-ui", "2.2.0")):
        if not any(d.get("module_name") == name and d.get("version") == version
                   for d in bp["dependencies"]):
            raise lab.UnsafeLab("PG24 stable Script API dependency changed")
    source = (generated / "behavior_pack/scripts/main.js").read_text()
    for marker in ('const VERSION = "1.5.7-LAB-PG24";',
                   'const PG20_OPAQUE_JOURNAL = "pg20-native-opaque-v1"',
                   'const PG23_COMPACTION_JOURNAL = "pg23-native-hopper-compaction-v1"',
                   "pg23TransportMayRun()", "pg23CompactSourceHopper(src, sourceBlock)",
                   "container.moveItem(read, write, container);",
                   "pg20MoveOpaqueNative(",
                   "function pg24PreservePendingEntityJournal()",
                   "function pg24VerifyEjectedCommit(",
                   "pg24ClearVerifiedEntityIntent();"):
        if marker not in source:
            raise lab.UnsafeLab("PG24 compiled safety anchor missing")
    if ("function compactSourceHopper(" in source or
            "container.setItem(write, item)" in source or
            "container.setItem(read, undefined)" in source):
        raise lab.UnsafeLab("PG24 original unsafe compaction resurrected")
    sizes = {kind: lab.hashes(generated / kind)
             for kind in ("behavior_pack", "resource_pack")}
    if len(sizes["behavior_pack"]) != 16 or len(sizes["resource_pack"]) != 56:
        raise lab.UnsafeLab("PG24 pack footprint changed")
    return sizes


def create_plan(root, generated, previous):
    expected = check_candidate(generated)
    old_hashes = pg23_deploy.check_candidate(previous)
    plan = lab.discover_plan(ROOT, root)
    if len(plan) != 2:
        raise lab.UnsafeLab("PG24 expected exactly two Hart LAB packs")
    result = []
    for i, item in enumerate(plan):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if (item["target"].name != pg08.EXPECTED_DIRS[i] or
                item["target"].parent.name != folder or
                item["registry"].parent.name != WORLD):
            raise lab.UnsafeLab("PG24 incorrect LAB pack/world folder")
        manifest = json.loads((item["target"] / "manifest.json").read_text())
        installed = lab.v3(manifest["header"]["version"])
        registered = pg08.version_in_registry(item["old_bytes"], pack_id)
        if installed != OLD_VERSION or registered != OLD_VERSION:
            raise lab.UnsafeLab("Installed PG23 1.5.6 version mismatch")
        if lab.hashes(item["target"]) != old_hashes[kind]:
            raise lab.UnsafeLab("Installed PG23 1.5.6 hash differs from exact source")
        result.append({
            **item, "source": generated / kind, "files": expected[kind],
            "old_hashes": old_hashes[kind],
            "new_registry": lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"), pack_id, NEW_VERSION)
        })
    return result


def create_rollback_plan(root, generated, previous, tag):
    if not re.fullmatch(r"lab-[0-9a-f]{12}", tag):
        raise lab.UnsafeLab("PG24 invalid backup tag")
    backup = root / "_HartLogisticsDeployBackups" / tag
    lab.assert_no_link(backup)
    if not backup.is_dir():
        raise lab.UnsafeLab("PG24 installer backup not found")
    next_hashes = check_candidate(generated)
    previous_hashes = pg23_deploy.check_candidate(previous)
    current = lab.discover_plan(ROOT, root)
    if len(current) != 2:
        raise lab.UnsafeLab("PG24 rollback expected two Hart LAB packs")
    result = []
    for i, item in enumerate(current):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if (item["target"].name != pg08.EXPECTED_DIRS[i] or
                item["target"].parent.name != folder or
                item["registry"].parent.name != WORLD):
            raise lab.UnsafeLab("PG24 rollback world/folder mismatch")
        if (pg08.version_in_registry(item["old_bytes"], pack_id) != NEW_VERSION or
                lab.hashes(item["target"]) != next_hashes[kind]):
            raise lab.UnsafeLab("PG24 installed pack changed; rollback refused")
        old_pack = backup / f"pack-{i}"
        old_reg = backup / f"registry-{i}.bin"
        lab.assert_no_link(old_pack)
        lab.assert_no_link(old_reg)
        if (not old_pack.is_dir() or not old_reg.is_file() or
                lab.hashes(old_pack) != previous_hashes[kind] or
                pg08.version_in_registry(old_reg.read_bytes(), pack_id) != OLD_VERSION):
            raise lab.UnsafeLab("PG24 backup is not exact prior PG23")
        result.append({
            **item, "source": old_pack, "files": previous_hashes[kind],
            "old_hashes": next_hashes[kind],
            "new_registry": lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"), pack_id, OLD_VERSION)
        })
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", help="exact pinned 40-character Git SHA")
    parser.add_argument("--check-lab", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback-tag")
    parser.add_argument("--confirm-lab-only", action="store_true")
    args = parser.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if args.apply and not (args.check_lab and args.confirm_lab_only):
            raise lab.UnsafeLab("PG24 apply requires --check-lab and --confirm-lab-only")
        if args.check_lab and not args.commit:
            raise lab.UnsafeLab("PG24 LAB access requires exact pinned commit")
        if args.commit:
            lab.assert_clean_git(ROOT, args.commit)
        pg23.pg20.pg08.check_baseline()
        with tempfile.TemporaryDirectory(prefix="pg24-pack-offline-") as td:
            new, old = Path(td) / "pg24", Path(td) / "pg23"
            pg24.prepare(new)
            pg23.prepare(old)
            hashes = check_candidate(new)
            pg23_deploy.check_candidate(old)
            if not args.check_lab:
                print("PG24 SOURCE PASS: original 72 files remain immutable")
                print("BP:", len(hashes["behavior_pack"]), "RP:", len(hashes["resource_pack"]))
                print("No LAB/PROD/world files accessed.")
                return 0
            root = pg08.check_real_root()
            plan = (create_rollback_plan(root, new, old, args.rollback_tag)
                    if args.rollback_tag else create_plan(root, new, old))
            for item in plan:
                print("PG24 LAB ONLY:", item["target"],
                      "operation:", "ROLLBACK" if args.rollback_tag else "INSTALL")
            if not args.apply:
                print("PG24 READ-ONLY PREFLIGHT PASS; nothing changed.")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(plan)
            backup = lab.apply_plan(root, plan)
            print("PG24 LAB", "ROLLBACK" if args.rollback_tag else "INSTALL",
                  "COMPLETE; saved old packs/registrations at:", backup)
            print("Keep all existing PG20/PG23/world backups; no server auto-restart.")
            return 0
    except (lab.UnsafeLab, OSError, ValueError, KeyError, subprocess.CalledProcessError) as e:
        print("PG24 REFUSED:", e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
