"""PG23 strictly guarded LAB upgrade 1.5.5 PG20 -> 1.5.6 PG23.

Source-only by default. Exact stopped-LAB source pack hashes, 72 original
files, UUIDs and other-mod registry bytes are protected. No world file rewrite
except exact Hart BP/RP registration entries by the existing LAB transaction.
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
NEW_VERSION = (1, 5, 6)
OLD_VERSION = (1, 5, 5)
WORLD = "ThomasServer"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg20_deploy = load(ROOT / "candidates/pg20/lab_deploy.py",
                   "pg23_old_verified_installer")
pg23 = load(ROOT / "candidates/pg23/prepare_candidate.py",
            "pg23_compaction_builder")
pg20 = pg23.pg20
pg08 = pg20_deploy.pg08
lab = pg20_deploy.lab


def check_candidate(generated):
    bp = json.loads((generated / "behavior_pack/manifest.json").read_text())
    rp = json.loads((generated / "resource_pack/manifest.json").read_text())
    if bp["header"]["uuid"] != lab.BP_UUID or rp["header"]["uuid"] != lab.RP_UUID:
        raise lab.UnsafeLab("PG23 BP/RP UUID mismatch")
    if (lab.v3(bp["header"]["version"]) != NEW_VERSION or
            lab.v3(rp["header"]["version"]) != NEW_VERSION):
        raise lab.UnsafeLab("PG23 requires exact 1.5.6 BP/RP")
    if any(lab.v3(m["version"]) != NEW_VERSION
           for m in bp["modules"] + rp["modules"]):
        raise lab.UnsafeLab("PG23 module versions mismatch")
    if len([d for d in bp["dependencies"] if d.get("uuid") == lab.RP_UUID
            and lab.v3(d.get("version", ())) == NEW_VERSION]) != 1:
        raise lab.UnsafeLab("PG23 BP/RP dependencies mismatch")
    for name, version in (("@minecraft/server", "2.7.0"),
                          ("@minecraft/server-ui", "2.2.0")):
        if not any(d.get("module_name") == name and d.get("version") == version
                   for d in bp["dependencies"]):
            raise lab.UnsafeLab("PG23 stable Script API dependencies changed")
    source = (generated / "behavior_pack/scripts/main.js").read_text()
    for marker in ('const VERSION = "1.5.6-LAB-PG23";',
                   'const PG20_OPAQUE_JOURNAL = "pg20-native-opaque-v1"',
                   'const PG23_COMPACTION_JOURNAL = "pg23-native-hopper-compaction-v1"',
                   "pg23TransportMayRun()", "pg23CompactSourceHopper(src, sourceBlock)",
                   "container.moveItem(read, write, container);",
                   "pg20MoveOpaqueNative("):
        if marker not in source:
            raise lab.UnsafeLab("PG23 compiled safety anchor missing")
    if "function compactSourceHopper(" in source or             "container.setItem(write, item)" in source or             "container.setItem(read, undefined)" in source:
        raise lab.UnsafeLab("PG23 original two-setItem path was not removed")
    results = {kind: lab.hashes(generated / kind)
               for kind in ("behavior_pack", "resource_pack")}
    if len(results["behavior_pack"]) != 16 or len(results["resource_pack"]) != 56:
        raise lab.UnsafeLab("PG23 pack footprint changed")
    return results


def create_plan(root, generated, previous):
    expected = check_candidate(generated)
    old_hashes = pg20_deploy.check_candidate(previous)
    plan = lab.discover_plan(ROOT, root)
    if len(plan) != 2:
        raise lab.UnsafeLab("PG23 expected exactly two Hart LAB packs")
    output = []
    for i, item in enumerate(plan):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if (item["target"].name != pg08.EXPECTED_DIRS[i] or
                item["target"].parent.name != folder or
                item["registry"].parent.name != WORLD):
            raise lab.UnsafeLab("PG23 wrong LAB pack/world folder")
        manifest = json.loads((item["target"] / "manifest.json").read_text())
        old_version = lab.v3(manifest["header"]["version"])
        registered = pg08.version_in_registry(item["old_bytes"], pack_id)
        if old_version != OLD_VERSION or registered != OLD_VERSION:
            raise lab.UnsafeLab("Installed PG20 1.5.5 version mismatch")
        if lab.hashes(item["target"]) != old_hashes[kind]:
            raise lab.UnsafeLab("Installed PG20 1.5.5 hash differs from exact source")
        output.append({
            **item, "source": generated / kind, "files": expected[kind],
            "old_hashes": old_hashes[kind],
            "new_registry": lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"), pack_id, NEW_VERSION)
        })
    return output


def create_rollback_plan(root, generated, previous, tag):
    if not re.fullmatch(r"lab-[0-9a-f]{12}", tag):
        raise lab.UnsafeLab("PG23 invalid backup tag")
    backup = root / "_HartLogisticsDeployBackups" / tag
    lab.assert_no_link(backup)
    if not backup.is_dir():
        raise lab.UnsafeLab("PG23 previous installer backup not found")
    next_hashes = check_candidate(generated)
    previous_hashes = pg20_deploy.check_candidate(previous)
    current = lab.discover_plan(ROOT, root)
    if len(current) != 2:
        raise lab.UnsafeLab("PG23 rollback expected two Hart packs")
    out = []
    for i, item in enumerate(current):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if (item["target"].name != pg08.EXPECTED_DIRS[i] or
                item["target"].parent.name != folder or
                item["registry"].parent.name != WORLD):
            raise lab.UnsafeLab("PG23 rollback world/folder mismatch")
        if (pg08.version_in_registry(item["old_bytes"], pack_id) != NEW_VERSION or
                lab.hashes(item["target"]) != next_hashes[kind]):
            raise lab.UnsafeLab("PG23 installed source changed; rollback refused")
        old_pack = backup / f"pack-{i}"
        old_reg = backup / f"registry-{i}.bin"
        lab.assert_no_link(old_pack)
        lab.assert_no_link(old_reg)
        if (not old_pack.is_dir() or not old_reg.is_file() or
                lab.hashes(old_pack) != previous_hashes[kind] or
                pg08.version_in_registry(old_reg.read_bytes(), pack_id) != OLD_VERSION):
            raise lab.UnsafeLab("PG23 prior pack/registry backup not exact PG20")
        out.append({
            **item, "source": old_pack, "files": previous_hashes[kind],
            "old_hashes": next_hashes[kind],
            "new_registry": lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"), pack_id, OLD_VERSION)
        })
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--commit", help="exact pinned 40-char Git SHA")
    ap.add_argument("--check-lab", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback-tag")
    ap.add_argument("--confirm-lab-only", action="store_true")
    args = ap.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if args.apply and not (args.check_lab and args.confirm_lab_only):
            raise lab.UnsafeLab("PG23 apply requires --check-lab and --confirm-lab-only")
        if args.check_lab and not args.commit:
            raise lab.UnsafeLab("PG23 LAB access requires exact pinned commit")
        if args.commit:
            lab.assert_clean_git(ROOT, args.commit)
        pg20.pg08.check_baseline()
        with tempfile.TemporaryDirectory(prefix="pg23-pack-offline-") as temp:
            new, old = Path(temp) / "pg23", Path(temp) / "pg20"
            pg23.prepare(new)
            pg20.prepare(old)
            next_hashes = check_candidate(new)
            pg20_deploy.check_candidate(old)
            if not args.check_lab:
                print("PG23 SOURCE PASS: original 72 files remain immutable")
                print("BP:", len(next_hashes["behavior_pack"]),
                      "RP:", len(next_hashes["resource_pack"]))
                print("No LAB/PROD/world files accessed.")
                return 0
            root = pg08.check_real_root()
            plan = (create_rollback_plan(root, new, old, args.rollback_tag)
                    if args.rollback_tag else create_plan(root, new, old))
            for item in plan:
                print("PG23 LAB ONLY:", item["target"],
                      "operation:", "ROLLBACK" if args.rollback_tag else "INSTALL")
            if not args.apply:
                print("PG23 READ-ONLY PREFLIGHT PASS; nothing changed.")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(plan)
            backup = lab.apply_plan(root, plan)
            print("PG23 LAB", "ROLLBACK" if args.rollback_tag else "INSTALL",
                  "COMPLETE; saved old packs/registrations at:", backup)
            print("Preserve existing PG20/world backups; no server auto-restart.")
            return 0
    except (lab.UnsafeLab, OSError, ValueError, KeyError, subprocess.CalledProcessError) as err:
        print("PG23 REFUSED:", err, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
