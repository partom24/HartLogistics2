"""PG31 exact stopped-LAB pack upgrade 1.5.10 PG27 -> 1.5.13 PG31.

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
NEW_VERSION = (1, 5, 13)
OLD_VERSION = (1, 5, 10)
WORLD = "ThomasServer"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg27_deploy = load(ROOT / "candidates/pg27/lab_deploy.py",
                   "pg31_old_verified_installer")
pg31 = load(ROOT / "candidates/pg31/prepare_candidate.py",
            "pg31_world_q4_census_builder")
pg27 = pg31.pg27
pg08 = pg27_deploy.pg08
lab = pg27_deploy.lab


def check_candidate(generated):
    bp = json.loads((generated / "behavior_pack/manifest.json").read_text())
    rp = json.loads((generated / "resource_pack/manifest.json").read_text())
    if bp["header"]["uuid"] != lab.BP_UUID or rp["header"]["uuid"] != lab.RP_UUID:
        raise lab.UnsafeLab("PG31 BP/RP UUID mismatch")
    if (lab.v3(bp["header"]["version"]) != NEW_VERSION or
            lab.v3(rp["header"]["version"]) != NEW_VERSION):
        raise lab.UnsafeLab("PG31 requires exact 1.5.13 BP/RP")
    if any(lab.v3(m["version"]) != NEW_VERSION
           for m in bp["modules"] + rp["modules"]):
        raise lab.UnsafeLab("PG31 module versions mismatch")
    if len([d for d in bp["dependencies"] if d.get("uuid") == lab.RP_UUID
            and lab.v3(d.get("version", ())) == NEW_VERSION]) != 1:
        raise lab.UnsafeLab("PG31 BP/RP dependency mismatch")
    for name, version in (("@minecraft/server", "2.7.0"),
                          ("@minecraft/server-ui", "2.2.0")):
        if not any(d.get("module_name") == name and d.get("version") == version
                   for d in bp["dependencies"]):
            raise lab.UnsafeLab("PG31 stable Script API dependency changed")
    source = (generated / "behavior_pack/scripts/main.js").read_text()
    for marker in ('const VERSION = "1.5.13-LAB-PG31-Q4-WORLD-CENSUS";',
                   'const PG20_OPAQUE_JOURNAL = "pg20-native-opaque-v1"',
                   'const PG23_COMPACTION_JOURNAL = "pg23-native-hopper-compaction-v1"',
                   "pg23TransportMayRun()", "pg23CompactSourceHopper(src, sourceBlock)",
                   "container.moveItem(read, write, container);",
                   "pg20MoveOpaqueNative(",
                   "function pg25PreservePendingQueueJournal()",
                   "pg25QueueHold", "HOLD (audit required)",
                   "function pg26ReadTransportInput(", "PG26_MAX_PIPES = 16",
                   "function pg26TransportStillMatches(", "slotInfo, want, pg26Transport",
                   "function pg24VerifyEjectedCommit(",
                   "pg24ClearVerifiedEntityIntent();"):
        if marker not in source:
            raise lab.UnsafeLab("PG31 compiled safety anchor missing")
    if ("function compactSourceHopper(" in source or
            "container.setItem(write, item)" in source or
            "container.setItem(read, undefined)" in source):
        raise lab.UnsafeLab("PG31 original unsafe compaction resurrected")
    if "function journalQueueState(" in source or "Recovered untouched queue" in source:
        raise lab.UnsafeLab("PG31 legacy Q4 recovery mutator survived")
    if ('import { previewQ5WorldQ4Census } from "./q5_world_receiver_census.js";' not in source
            or 'name:"hartlogistics:q5census"' not in source
            or "TEMP_TEST:PG31-Q4-WORLD-CENSUS" not in source
            or 'NO Q5 WRITES, NO AUTHORITY CHANGE' not in source):
        raise lab.UnsafeLab("PG31 read-only full-world census wiring missing")
    for audit_marker in ("setWorldDynamic(", "saveJournal(", "saveQueueJournal(",
                         "setDynamicProperty(", "moveItem(", "setItem(", "new ItemStack("):
        if audit_marker in (ROOT / "candidates/pg31/q4_world_census_overlay.js").read_text(encoding="utf-8"):
            raise lab.UnsafeLab("PG31 unexpected physical writer in audit")
    expected_scripts = {"main.js", "ordinary_network_core.js", "q5_bucket_core.js",
                        "q5_q4_readonly_snapshot.js", "q5_q4_read_adapter.js",
                        "q5_world_receiver_census.js"}
    actual_scripts = {p.name for p in (generated / "behavior_pack/scripts").glob("*.js")}
    if not expected_scripts.issubset(actual_scripts):
        raise lab.UnsafeLab("PG31 generated read-only source missing")
    block = json.loads((generated / "behavior_pack/blocks/transporter.json").read_text())
    if block["minecraft:block"]["components"]["minecraft:display_name"] != "Hart Transporter":
        raise lab.UnsafeLab("PG31 Transporter name correction missing")
    model = json.loads((generated / "resource_pack/models/blocks/transporter.geo.json").read_text())
    bones = {b["name"]: b for b in model["minecraft:geometry"][0]["bones"]}
    if (bones["east"]["cubes"][0]["origin"] != [-8, 6, -2] or
            bones["west"]["cubes"][0]["origin"] != [2, 6, -2]):
        raise lab.UnsafeLab("PG31 Transporter X correction missing")
    sizes = {kind: lab.hashes(generated / kind)
             for kind in ("behavior_pack", "resource_pack")}
    if len(sizes["behavior_pack"]) != 23 or len(sizes["resource_pack"]) != 59:
        raise lab.UnsafeLab("PG31 pack footprint changed")
    return sizes


def create_plan(root, generated, previous):
    expected = check_candidate(generated)
    old_hashes = pg27_deploy.check_candidate(previous)
    plan = lab.discover_plan(ROOT, root)
    if len(plan) != 2:
        raise lab.UnsafeLab("PG31 expected exactly two Hart LAB packs")
    result = []
    for i, item in enumerate(plan):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if (item["target"].name != pg08.EXPECTED_DIRS[i] or
                item["target"].parent.name != folder or
                item["registry"].parent.name != WORLD):
            raise lab.UnsafeLab("PG31 incorrect LAB pack/world folder")
        manifest = json.loads((item["target"] / "manifest.json").read_text())
        installed = lab.v3(manifest["header"]["version"])
        registered = pg08.version_in_registry(item["old_bytes"], pack_id)
        if installed != OLD_VERSION or registered != OLD_VERSION:
            raise lab.UnsafeLab("Installed PG27 1.5.10 version mismatch")
        if lab.hashes(item["target"]) != old_hashes[kind]:
            raise lab.UnsafeLab("Installed PG27 1.5.10 hash differs from exact source")
        result.append({
            **item, "source": generated / kind, "files": expected[kind],
            "old_hashes": old_hashes[kind],
            "new_registry": lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"), pack_id, NEW_VERSION)
        })
    return result


def create_rollback_plan(root, generated, previous, tag):
    if not re.fullmatch(r"lab-[0-9a-f]{12}", tag):
        raise lab.UnsafeLab("PG31 invalid backup tag")
    backup = root / "_HartLogisticsDeployBackups" / tag
    lab.assert_no_link(backup)
    if not backup.is_dir():
        raise lab.UnsafeLab("PG31 installer backup not found")
    next_hashes = check_candidate(generated)
    previous_hashes = pg27_deploy.check_candidate(previous)
    current = lab.discover_plan(ROOT, root)
    if len(current) != 2:
        raise lab.UnsafeLab("PG31 rollback expected two Hart LAB packs")
    result = []
    for i, item in enumerate(current):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if (item["target"].name != pg08.EXPECTED_DIRS[i] or
                item["target"].parent.name != folder or
                item["registry"].parent.name != WORLD):
            raise lab.UnsafeLab("PG31 rollback world/folder mismatch")
        if (pg08.version_in_registry(item["old_bytes"], pack_id) != NEW_VERSION or
                lab.hashes(item["target"]) != next_hashes[kind]):
            raise lab.UnsafeLab("PG31 installed pack changed; rollback refused")
        old_pack = backup / f"pack-{i}"
        old_reg = backup / f"registry-{i}.bin"
        lab.assert_no_link(old_pack)
        lab.assert_no_link(old_reg)
        if (not old_pack.is_dir() or not old_reg.is_file() or
                lab.hashes(old_pack) != previous_hashes[kind] or
                pg08.version_in_registry(old_reg.read_bytes(), pack_id) != OLD_VERSION):
            raise lab.UnsafeLab("PG31 backup is not exact prior PG27")
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
            raise lab.UnsafeLab("PG31 apply requires --check-lab and --confirm-lab-only")
        if args.check_lab and not args.commit:
            raise lab.UnsafeLab("PG31 LAB access requires exact pinned commit")
        if args.commit:
            lab.assert_clean_git(ROOT, args.commit)
        pg27.pg26.pg25.pg24.pg23.pg20.pg08.check_baseline()
        with tempfile.TemporaryDirectory(prefix="pg31-pack-offline-") as td:
            new, old = Path(td) / "pg31", Path(td) / "pg27"
            pg31.prepare(new)
            pg27.prepare(old)
            hashes = check_candidate(new)
            pg27_deploy.check_candidate(old)
            if not args.check_lab:
                print("PG31 SOURCE PASS: original 72 files remain immutable")
                print("BP:", len(hashes["behavior_pack"]), "RP:", len(hashes["resource_pack"]))
                print("No LAB/PROD/world files accessed.")
                return 0
            root = pg08.check_real_root()
            plan = (create_rollback_plan(root, new, old, args.rollback_tag)
                    if args.rollback_tag else create_plan(root, new, old))
            for item in plan:
                print("PG31 LAB ONLY:", item["target"],
                      "operation:", "ROLLBACK" if args.rollback_tag else "INSTALL")
            if not args.apply:
                print("PG31 READ-ONLY PREFLIGHT PASS; nothing changed.")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(plan)
            backup = lab.apply_plan(root, plan)
            print("PG31 LAB", "ROLLBACK" if args.rollback_tag else "INSTALL",
                  "COMPLETE; saved old packs/registrations at:", backup)
            print("Keep PG27 and all prior world/pack backups; no server auto-restart.")
            return 0
    except (lab.UnsafeLab, OSError, ValueError, KeyError, subprocess.CalledProcessError) as e:
        print("PG31 REFUSED:", e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
