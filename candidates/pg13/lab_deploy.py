"""PG13 1.5.1 -> 1.5.2 LAB-only guarded pack update / rollback.

This script never touches production, world save data or unrelated addon pack
registrations. No --apply without exact commit, stopped LAB BDS and approval.
Only the old PG08 1.5.1 pack's exact generated file hashes are accepted.
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
WORLD = "ThomasServer"
NEW_VERSION = (1, 5, 2)
OLD_VERSION = (1, 5, 1)


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg08 = load(ROOT / "candidates/pg08/lab_deploy.py", "pg13_previous_deployment")
pg13 = load(ROOT / "candidates/pg13/prepare_candidate.py", "pg13_build")
lab = pg08.lab


def check_new_candidate(generated):
    bp = json.loads((generated / "behavior_pack/manifest.json").read_text())
    rp = json.loads((generated / "resource_pack/manifest.json").read_text())
    if bp["header"]["uuid"] != lab.BP_UUID or rp["header"]["uuid"] != lab.RP_UUID:
        raise lab.UnsafeLab("PG13 candidate pack UUID mismatch")
    if lab.v3(bp["header"]["version"]) != NEW_VERSION or lab.v3(rp["header"]["version"]) != NEW_VERSION:
        raise lab.UnsafeLab("PG13 candidate version mismatch")
    if any(lab.v3(m["version"]) != NEW_VERSION
           for m in bp["modules"] + rp["modules"]):
        raise lab.UnsafeLab("PG13 candidate module versions mismatch")
    if [d for d in bp["dependencies"]
        if d.get("uuid") == lab.RP_UUID and lab.v3(d["version"]) == NEW_VERSION] == []:
        raise lab.UnsafeLab("PG13 candidate cross-pack dependency mismatch")
    if not any(d.get("module_name") == "@minecraft/server" and
               d.get("version") == "2.7.0" for d in bp["dependencies"]):
        raise lab.UnsafeLab("PG13 @minecraft/server stable API version changed")
    if not any(d.get("module_name") == "@minecraft/server-ui" and
               d.get("version") == "2.2.0" for d in bp["dependencies"]):
        raise lab.UnsafeLab("PG13 stable UI version changed")
    script = (generated / "behavior_pack/scripts/main.js").read_text()
    for marker in ('const VERSION = "1.5.2-LAB-PG13";',
                   'const PG13_A = "hartlogistics:pg13_shadow_reserve_v1"',
                   'const PG13_B = "hartlogistics:pg13_shadow_intent_v1"',
                   'name: "hartlogistics:shadow" + action',
                   "pg08CommitLink(",
                   "world.beforeEvents.playerInteractWithBlock.subscribe"):
        if marker not in script:
            raise lab.UnsafeLab("PG13 candidate script missing " + marker)
    result = {kind: lab.hashes(generated / kind)
              for kind in ("behavior_pack", "resource_pack")}
    if len(result["behavior_pack"]) != 16 or len(result["resource_pack"]) != 56:
        raise lab.UnsafeLab("PG13 unexpected compiled pack inventory")
    return result


def create_plan(root, generated, previous):
    """Synthetic/real LAB read-only plan; requires exact existing PG08 1.5.1 hashes."""
    next_hashes = check_new_candidate(generated)
    old_hashes = pg08.check_candidate(previous)
    originals = lab.discover_plan(ROOT, root)
    if len(originals) != 2:
        raise lab.UnsafeLab("Expected precisely two Hart Logistics LAB packs")
    out = []
    for i, original in enumerate(originals):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if (original["target"].name != pg08.EXPECTED_DIRS[i] or
                original["target"].parent.name != folder or
                original["registry"].parent.name != WORLD):
            raise lab.UnsafeLab("LAB Hart Logistics folder or world changed")
        version = lab.v3(json.loads((original["target"] / "manifest.json").read_text())["header"]["version"])
        registered = pg08.version_in_registry(original["old_bytes"], pack_id)
        if version != OLD_VERSION or registered != OLD_VERSION:
            raise lab.UnsafeLab("PG13 requires installed PG08 1.5.1, not other/mixed versions")
        actual = lab.hashes(original["target"])
        if actual != old_hashes[kind]:
            raise lab.UnsafeLab("Installed PG08 has changed; refuses unknown pack content")
        out.append({
            **original,
            "source": generated / kind,
            "files": next_hashes[kind],
            "old_hashes": actual,
            "new_registry": lab.patch_registration(
                original["old_bytes"].decode("utf-8-sig"), pack_id, NEW_VERSION
            ),
        })
    return out


def create_rollback_plan(root, generated, previous, tag):
    if not re.fullmatch(r"lab-[0-9a-f]{12}", tag):
        raise lab.UnsafeLab("Invalid PG13 rollback tag")
    backup = root / "_HartLogisticsDeployBackups" / tag
    if not backup.is_dir():
        raise lab.UnsafeLab("Missing PG13 installation backup")
    lab.assert_no_link(backup)
    expected_new = check_new_candidate(generated)
    expected_old = pg08.check_candidate(previous)
    originals = lab.discover_plan(ROOT, root)
    if len(originals) != 2:
        raise lab.UnsafeLab("Wrong LAB pack inventory")
    out = []
    for i, item in enumerate(originals):
        kind, folder, pack_id, _ = lab.PACKS[i]
        if (item["target"].name != pg08.EXPECTED_DIRS[i] or
                item["target"].parent.name != folder or
                item["registry"].parent.name != WORLD):
            raise lab.UnsafeLab("Wrong LAB pack placement")
        if (lab.hashes(item["target"]) != expected_new[kind] or
                pg08.version_in_registry(item["old_bytes"], pack_id) != NEW_VERSION):
            raise lab.UnsafeLab("PG13 changed since install, cannot rollback blindly")
        previous_pack = backup / f"pack-{i}"
        previous_registry = backup / f"registry-{i}.bin"
        lab.assert_no_link(previous_pack)
        lab.assert_no_link(previous_registry)
        if (not previous_pack.is_dir() or not previous_registry.is_file() or
                lab.hashes(previous_pack) != expected_old[kind]):
            raise lab.UnsafeLab("Backup does not contain exact accepted prior PG08 pack")
        if pg08.version_in_registry(previous_registry.read_bytes(), pack_id) != OLD_VERSION:
            raise lab.UnsafeLab("Backup registration is not the accepted PG08 version")
        out.append({
            **item,
            "source": previous_pack,
            "files": expected_old[kind],
            "old_hashes": expected_new[kind],
            # Patch currently installed JSONC, never discard unrelated mods.
            "new_registry": lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"), pack_id, OLD_VERSION
            )
        })
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--commit", help="exact full Git commit SHA")
    ap.add_argument("--check-lab", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback-tag", help="PG13 installation backup lab-<12hex>")
    ap.add_argument("--confirm-lab-only", action="store_true")
    args = ap.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if args.apply and not (args.check_lab and args.confirm_lab_only):
            raise lab.UnsafeLab("PG13 apply requires --check-lab and --confirm-lab-only")
        if args.check_lab and not args.commit:
            raise lab.UnsafeLab("LAB preflight requires pinned exact Git SHA")
        if args.commit:
            lab.assert_clean_git(ROOT, args.commit)
        pg13.pg08.check_baseline()
        with tempfile.TemporaryDirectory(prefix="pg13-offline-") as tmp:
            generated = Path(tmp) / "pg13"
            previous = Path(tmp) / "pg08"
            pg13.prepare(generated)
            pg13.pg08.prepare(previous)
            new_hashes = check_new_candidate(generated)
            pg08.check_candidate(previous)
            if not args.check_lab:
                print("PG13 SOURCE PASS: immutable 72-file baseline; candidate 1.5.2")
                print("BP files:", len(new_hashes["behavior_pack"]),
                      "RP files:", len(new_hashes["resource_pack"]))
                print("No LAB/PROD/world files accessed.")
                return 0
            root = pg08.check_real_root()
            plan = (create_rollback_plan(root, generated, previous, args.rollback_tag)
                    if args.rollback_tag else create_plan(root, generated, previous))
            for item in plan:
                print("Hart Logistics LAB ONLY:", item["target"],
                      "mode:", "ROLLBACK" if args.rollback_tag else "PG13 INSTALL")
            if not args.apply:
                print("PG13 LAB PREFLIGHT PASS: READ-ONLY; NOTHING INSTALLED.")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(plan)
            saved = lab.apply_plan(root, plan)
            print("PG13 LAB", "ROLLBACK" if args.rollback_tag else "INSTALL",
                  "COMPLETE. Previous packs/registries backed up:", saved)
            print("No Minecraft runtime success implied. Keep this backup and prior PG08 backup.")
            return 0
    except (lab.UnsafeLab, OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print("PG13 REFUSED:", str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
