"""Guarded PG20 LAB-only 1.5.4 -> 1.5.5 pack upgrade and rollback.

NO server/world access in default source-only mode; explicit owner approval
required before any real LAB apply. Existing PG15 must match exact compiled
1.5.4 pack hashes. Other mods, world files, and production are untouched.
"""
from __future__ import annotations
import argparse
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NEW_VERSION = (1, 5, 5)
OLD_VERSION = (1, 5, 4)
WORLD = "ThomasServer"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg15_deploy = load(ROOT / "candidates/pg15/lab_deploy.py", "pg20_pg15_deployment")
pg20 = load(ROOT / "candidates/pg20/prepare_candidate.py", "pg20_native_builder")
pg15 = load(ROOT / "candidates/pg15/prepare_candidate.py", "pg20_previous_pg15_builder")
pg08 = pg15_deploy.pg08
lab = pg15_deploy.lab


def check_candidate(generated):
    bp = json.loads((generated / "behavior_pack/manifest.json").read_text())
    rp = json.loads((generated / "resource_pack/manifest.json").read_text())
    if bp["header"]["uuid"] != lab.BP_UUID or rp["header"]["uuid"] != lab.RP_UUID:
        raise lab.UnsafeLab("PG20 candidate pack UUID mismatch")
    if (lab.v3(bp["header"]["version"]) != NEW_VERSION or
            lab.v3(rp["header"]["version"]) != NEW_VERSION):
        raise lab.UnsafeLab("PG20 requires exact 1.5.5 BP/RP")
    if any(lab.v3(m["version"]) != NEW_VERSION
           for m in bp["modules"] + rp["modules"]):
        raise lab.UnsafeLab("PG20 candidate module version mismatch")
    rp_deps = [d for d in bp["dependencies"]
               if d.get("uuid") == lab.RP_UUID and
               lab.v3(d.get("version", ())) == NEW_VERSION]
    if len(rp_deps) != 1:
        raise lab.UnsafeLab("PG20 BP/RP dependencies mismatch")
    for name, version in (("@minecraft/server", "2.7.0"),
                          ("@minecraft/server-ui", "2.2.0")):
        if not any(d.get("module_name") == name and d.get("version") == version
                   for d in bp["dependencies"]):
            raise lab.UnsafeLab("PG20 stable API dependency mismatch")
    s = (generated / "behavior_pack/scripts/main.js").read_text()
    for marker in ('const VERSION = "1.5.5-LAB-PG20";',
                   "pg08CommitLink(",
                   'const PG20_OPAQUE_JOURNAL = "pg20-native-opaque-v1"',
                   "pg20MoveOpaqueNative(",
                   "src.moveItem(srcSlot, dstSlotInfo.slot, dst)",
                   "if (world.getDynamicProperty(JOURNAL_KEY) !== undefined)"):
        if marker not in s:
            raise lab.UnsafeLab("PG20 expected script anchor missing")
    result = {kind: lab.hashes(generated / kind)
              for kind in ("behavior_pack", "resource_pack")}
    if len(result["behavior_pack"]) != 16 or len(result["resource_pack"]) != 56:
        raise lab.UnsafeLab("PG20 compiled files differ from original pack footprint")
    return result


def create_plan(root, generated, previous):
    """Requires installed source to match accepted PG15 1.5.4 byte hashes."""
    expected = check_candidate(generated)
    old_hashes = pg15_deploy.check_candidate(previous)
    plan = lab.discover_plan(ROOT, root)
    if len(plan) != 2:
        raise lab.UnsafeLab("Expected exactly two LAB Hart Logistics packs")
    out = []
    for i, item in enumerate(plan):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if (item["target"].name != pg08.EXPECTED_DIRS[i] or
                item["target"].parent.name != folder or
                item["registry"].parent.name != WORLD):
            raise lab.UnsafeLab("LAB world / Hart pack folder changed")
        manifest = json.loads((item["target"] / "manifest.json").read_text())
        actual_version = lab.v3(manifest["header"]["version"])
        registered = pg08.version_in_registry(item["old_bytes"], pack_id)
        if actual_version != OLD_VERSION or registered != OLD_VERSION:
            raise lab.UnsafeLab("Installed PG15 1.5.4 missing or mismatched")
        if lab.hashes(item["target"]) != old_hashes[kind]:
            raise lab.UnsafeLab("Installed PG15 pack hash differs from exact known 1.5.4 build")
        out.append({
            **item,
            "source": generated / kind,
            "files": expected[kind],
            "old_hashes": old_hashes[kind],
            "new_registry": lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"), pack_id, NEW_VERSION
            )
        })
    return out


def create_rollback_plan(root, generated, previous, backup_tag):
    if not re.fullmatch(r"lab-[0-9a-f]{12}", backup_tag):
        raise lab.UnsafeLab("PG20 invalid backup identifier")
    backup = root / "_HartLogisticsDeployBackups" / backup_tag
    if not backup.is_dir():
        raise lab.UnsafeLab("PG20 installation backup missing")
    lab.assert_no_link(backup)
    next_hashes = check_candidate(generated)
    previous_hashes = pg15_deploy.check_candidate(previous)
    installed = lab.discover_plan(ROOT, root)
    if len(installed) != 2:
        raise lab.UnsafeLab("PG20 rollback expected exactly two packs")
    out = []
    for i, item in enumerate(installed):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if (item["target"].name != pg08.EXPECTED_DIRS[i] or
                item["target"].parent.name != folder or
                item["registry"].parent.name != WORLD):
            raise lab.UnsafeLab("PG20 rollback unsafe folder placement")
        if (pg08.version_in_registry(item["old_bytes"], pack_id) != NEW_VERSION or
                lab.hashes(item["target"]) != next_hashes[kind]):
            raise lab.UnsafeLab("Current PG20 pack modified; refuse unreviewed rollback")
        previous_pack = backup / f"pack-{i}"
        old_registration = backup / f"registry-{i}.bin"
        lab.assert_no_link(previous_pack)
        lab.assert_no_link(old_registration)
        if (not previous_pack.is_dir() or not old_registration.is_file() or
                lab.hashes(previous_pack) != previous_hashes[kind] or
                pg08.version_in_registry(old_registration.read_bytes(), pack_id) != OLD_VERSION):
            raise lab.UnsafeLab("PG20 rollback backup is not exact prior PG15")
        out.append({
            **item,
            "source": previous_pack,
            "files": previous_hashes[kind],
            "old_hashes": next_hashes[kind],
            "new_registry": lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"), pack_id, OLD_VERSION
            )
        })
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--commit", help="exact pinned full Git SHA")
    ap.add_argument("--check-lab", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback-tag")
    ap.add_argument("--confirm-lab-only", action="store_true")
    args = ap.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if args.apply and not (args.check_lab and args.confirm_lab_only):
            raise lab.UnsafeLab("PG20 apply requires --check-lab and --confirm-lab-only")
        if args.check_lab and not args.commit:
            raise lab.UnsafeLab("PG20 LAB preflight requires exact Git commit pin")
        if args.commit:
            lab.assert_clean_git(ROOT, args.commit)
        pg20.pg08.check_baseline()
        with tempfile.TemporaryDirectory(prefix="pg20-offline-") as temp:
            new = Path(temp) / "pg20"
            old = Path(temp) / "pg15"
            pg20.prepare(new)
            pg15.prepare(old)
            next_hashes = check_candidate(new)
            pg15_deploy.check_candidate(old)
            if not args.check_lab:
                print("PG20 SOURCE PASS: exact unchanged 72-file 1.4.1 baseline")
                print("BP:", len(next_hashes["behavior_pack"]), "RP:", len(next_hashes["resource_pack"]))
                print("No LAB/PROD/world files accessed.")
                return 0
            root = pg08.check_real_root()  # exact path + stopped LAB BDS, not production
            plan = (create_rollback_plan(root, new, old, args.rollback_tag)
                    if args.rollback_tag else create_plan(root, new, old))
            for item in plan:
                print("PG20 LAB ONLY:", item["target"],
                      "operation:", "ROLLBACK" if args.rollback_tag else "INSTALL")
            if not args.apply:
                print("PG20 READ-ONLY PREFLIGHT PASS; nothing changed.")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(plan)
            backup = lab.apply_plan(root, plan)
            print("PG20 LAB", "ROLLBACK" if args.rollback_tag else "INSTALL",
                  "COMPLETE; saved old packs/registrations at:", backup)
            print("No runtime item move implied. Preserve earlier PG08/PG13/PG14/PG15 backups.")
            return 0
    except (lab.UnsafeLab, OSError, ValueError, KeyError, subprocess.CalledProcessError) as err:
        print("PG20 REFUSED:", err, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
