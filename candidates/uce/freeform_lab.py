"""Two-command HartLogistics2 FREEFORM LAB handoff, without any old LAB world.

Prepare: stopped LAB -> select a NEW unoccupied world name. BDS generates it.
Finish: stopped LAB -> attach only HL2 BP/RP to that generated world and
        install the pinned integrated product if the shared packs differ.

No historical PG35/PG42 worlds, deleted LAB backups, Q4 archives, production
paths, experiment toggles or pre-existing world data are opened or required.
No WORLD backups are created. A changed shared pack is protected by the
existing short-lived transactional pack rollback mechanism.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile

import lab_deploy as uce_deploy

lab = uce_deploy.lab
pg08 = uce_deploy.pg08
uce = uce_deploy.uce
ROOT = uce_deploy.ROOT
WORLD = "HartUCEFreeformLab"
VERSION = (1, 5, 16)
PACK_DIRS = (
    "behavior_packs/HartMods_HartLogistics_BP",
    "resource_packs/HartMods_HartLogistics_RP",
)
REGISTRY_NAMES = ("world_behavior_packs.json", "world_resource_packs.json")
SCHEMA = "hart-hl2-freeform-lab-v1"
RECEIPT = "_HartLogisticsLabState/hl2-freeform-stage-v1.json"


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def read(root: Path, relative: str) -> bytes:
    path = root / relative
    lab.assert_no_link(path)
    return path.read_bytes()


def level_name(properties: bytes) -> str:
    try:
        text = properties.decode("utf-8-sig")
    except UnicodeDecodeError as err:
        raise lab.UnsafeLab("Unreadable server.properties") from err
    matched = re.findall(r"(?m)^level-name=([^\r\n]+)\r?$", text)
    if len(matched) != 1:
        raise lab.UnsafeLab("Exactly one level-name is required")
    name = matched[0]
    if not name or name.strip() != name or name in (".", "..") or (
        "/" in name or "\\" in name
    ):
        raise lab.UnsafeLab("Unsafe existing world name")
    return name


def set_level(properties: bytes, world_name: str) -> bytes:
    original = level_name(properties)
    if original == world_name:
        raise lab.UnsafeLab("Fresh LAB world already selected")
    text = properties.decode("utf-8-sig")
    lines = text.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if line.startswith("level-name=")]
    if len(matches) != 1:
        raise lab.UnsafeLab("Cannot locate unambiguous level-name")
    line = lines[matches[0]]
    suffix = "\r\n" if line.endswith("\r\n") else ("\n" if line.endswith("\n") else "")
    lines[matches[0]] = "level-name=" + world_name + suffix
    bom = b"\xef\xbb\xbf" if properties.startswith(b"\xef\xbb\xbf") else b""
    result = bom + "".join(lines).encode("utf-8")
    if level_name(result) != world_name:
        raise lab.UnsafeLab("New world selection failed validation")
    return result


def atomic_new(path: Path, raw: bytes):
    lab.assert_no_link(path)
    with path.open("xb") as writer:
        writer.write(raw)
        writer.flush()
        os.fsync(writer.fileno())
    if path.read_bytes() != raw:
        raise lab.UnsafeLab("Write readback did not match")


def replace_file(path: Path, raw: bytes):
    lab.assert_no_link(path)
    tmp = path.with_name(path.name + ".hl2-freeform-tmp")
    if tmp.exists():
        raise lab.UnsafeLab("Existing pending LAB configuration edit")
    try:
        atomic_new(tmp, raw)
        tmp.replace(path)
        if path.read_bytes() != raw:
            raise lab.UnsafeLab("LAB config readback mismatch")
    finally:
        if tmp.exists():
            tmp.unlink()


def pack_targets(root: Path) -> list[Path]:
    targets = []
    for i, (kind, folder, identifier, _) in enumerate(lab.PACKS):
        target = root / PACK_DIRS[i]
        lab.assert_no_link(target)
        if not target.is_dir() or not target.parent.name == folder:
            raise lab.UnsafeLab("Installed Hart Logistics pack missing: " + kind)
        manifest = json.loads(read(target, "manifest.json"))
        if (manifest.get("header", {}).get("uuid") != identifier or
                lab.v3(manifest.get("header", {}).get("version")) != VERSION):
            raise lab.UnsafeLab("Existing LAB pack identity/version differs: " + kind)
        targets.append(target)
    main = read(targets[0], "scripts/main.js").decode("utf-8")
    if ('const VERSION = "1.5.16-DEV-UCE"' not in main or
            "hartlogistics:activate_empty_lab" not in main or
            "TEMP_TEST:PG42-CARRIER" in main):
        raise lab.UnsafeLab("Expected installed integrated HL2, not PG42 probe")
    return targets


def prepare(root: Path, commit: str, *, apply=False) -> dict:
    root = Path(root)
    lab.assert_no_link(root)
    if not (root / "bedrock_server.exe").is_file():
        raise lab.UnsafeLab("Not the LAB Bedrock Dedicated Server")
    pack_targets(root)
    props = read(root, "server.properties")
    old_world = level_name(props)
    destination = root / "worlds" / WORLD
    lab.assert_no_link(destination)
    if destination.exists():
        raise lab.UnsafeLab("New test world already exists; nothing will be overwritten")
    receipt_file = root / RECEIPT
    lab.assert_no_link(receipt_file)
    if receipt_file.exists():
        raise lab.UnsafeLab("Freeform test already prepared; no second staging")
    target = set_level(props, WORLD)
    if not apply:
        return {"phase": "READY_TO_PREPARE", "world": WORLD,
                "no_previous_world_required": True}
    record = {
        "schema": SCHEMA,
        "commit": commit,
        "world": WORLD,
        "previous_world_name": old_world,
        "original_properties_sha256": digest(props),
        "staged_properties_sha256": digest(target),
    }
    receipt_file.parent.mkdir(parents=True, exist_ok=True)
    atomic_new(receipt_file, (json.dumps(record, sort_keys=True) + "\n").encode())
    if read(root, "server.properties") != props:
        raise lab.UnsafeLab("LAB configuration changed before prepare")
    replace_file(root / "server.properties", target)
    return {"phase": "READY_FOR_WORLD_GENERATION", "world": WORLD,
            "no_world_backup_created": True}


def finish_plan(root: Path, commit: str, product: Path,
                source_hashes: dict) -> tuple[list[dict], list[Path], bool]:
    root = Path(root)
    lab.assert_no_link(root)
    if level_name(read(root, "server.properties")) != WORLD:
        raise lab.UnsafeLab("LAB is not pointing at the fresh freeform world")
    receipt_file = root / RECEIPT
    record = json.loads(read(root, RECEIPT))
    if (record.get("schema") != SCHEMA or record.get("commit") != commit or
            record.get("world") != WORLD or
            record.get("staged_properties_sha256") !=
            digest(read(root, "server.properties"))):
        raise lab.UnsafeLab("Freeform staging source or configuration changed")
    new = root / "worlds" / WORLD
    lab.assert_no_link(new)
    if not read(new, "level.dat"):
        raise lab.UnsafeLab("Start then stop LAB BDS once to generate the new world")
    db = new / "db"
    lab.assert_no_link(db)
    if not db.is_dir() or not any(db.iterdir()):
        raise lab.UnsafeLab("BDS did not generate the new LevelDB")
    installed = pack_targets(root)
    previous = [lab.hashes(path) for path in installed]
    target_hashes = [source_hashes[pack[0]] for pack in lab.PACKS]
    change = previous != target_hashes
    plan = []
    absent = []
    for i, (kind, _, identifier, reg_name) in enumerate(lab.PACKS):
        registry = new / reg_name
        lab.assert_no_link(registry)
        if registry.exists():
            raw = registry.read_bytes()
            try:
                content = json.loads(lab.remove_jsonc(raw.decode("utf-8-sig")))
            except (UnicodeDecodeError, ValueError) as err:
                raise lab.UnsafeLab("Unexpected fresh-world registry content") from err
            if content != []:
                raise lab.UnsafeLab("Fresh test world has existing pack registrations")
        else:
            absent.append(registry)
            raw = b"[]\n"
        registration = json.dumps([{"pack_id": identifier,
                                     "version": list(VERSION)}], indent=2) + "\n"
        plan.append({
            "source": product / kind,
            "target": installed[i],
            "registry": registry,
            "old_bytes": raw,
            "new_registry": registration,
            "old_hashes": previous[i],
            "files": target_hashes[i],
        })
    return plan, absent, change


def finish(root: Path, commit: str, product: Path,
           source_hashes: dict, *, apply=False) -> dict:
    plan, absent, change = finish_plan(root, commit, product, source_hashes)
    if not apply:
        return {"phase": "READY_TO_FINISH", "world": WORLD,
                "shared_pack_update": change}
    # No old world backup is needed. Only create two fresh registration files.
    created = []
    backup = None
    try:
        for registry in absent:
            atomic_new(registry, b"[]\n")
            created.append(registry)
        # Same pre-write readback for every shared pack and fresh registry.
        for item in plan:
            if item["registry"].read_bytes() != item["old_bytes"]:
                raise lab.UnsafeLab("New-world registrations changed before installation")
            if lab.hashes(item["target"]) != item["old_hashes"]:
                raise lab.UnsafeLab("HL2 shared pack changed before installation")
        if change:
            backup = lab.apply_plan(root, plan)
        else:
            for item in plan:
                replace_file(item["registry"],
                             item["new_registry"].encode("utf-8"))
        for item in plan:
            if (item["registry"].read_text(encoding="utf-8-sig") !=
                    item["new_registry"] or
                    lab.hashes(item["target"]) != item["files"]):
                raise lab.UnsafeLab("Installed product or registration readback mismatch")
    except BaseException:
        # The existing pack transaction reverts pack+registrations on error.
        # Do not silently delete a partially installed world or any nonempty
        # registration. Only our own untouched EMPTY placeholders may go.
        for registry in created:
            if registry.is_file() and registry.read_bytes() == b"[]\n":
                registry.unlink()
        raise
    return {
        "phase": "READY_FOR_FREEFORM_GAMEPLAY",
        "world": WORLD,
        "updated_shared_packs": change,
        "pack_rollback": str(backup) if backup else None,
        "worlds_backed_up": 0,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("plan", "prepare", "finish"),
                        default="plan")
    parser.add_argument("--commit", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if not re.fullmatch(r"[a-f0-9]{40}", args.commit):
            raise lab.UnsafeLab("Exact source commit required")
        if args.apply != (args.mode in ("prepare", "finish")):
            raise lab.UnsafeLab("Only Prepare/Finish perform authorized LAB changes")
        lab.assert_clean_git(ROOT, args.commit)
        with tempfile.TemporaryDirectory(prefix="hl2-freeform-source-") as td:
            tmp = Path(td)
            base = tmp / "pg33"
            uce_deploy.pg33.prepare(base)
            product = tmp / "product"
            uce.prepare(product)
            hashes = uce_deploy.check_candidate(product, base)
            if args.mode == "plan":
                print("HL2 freeform product source verified; no LAB accessed")
                return 0
            root = pg08.check_real_root()  # exact authorized LAB; stopped BDS
            result = (prepare(root, args.commit, apply=True)
                      if args.mode == "prepare"
                      else finish(root, args.commit, product, hashes, apply=True))
            print("HL2 FREEFORM LAB:", json.dumps(result, sort_keys=True))
            print("No production server or historic/test-world LevelDB opened")
            return 0
    except (lab.UnsafeLab, OSError, ValueError, KeyError,
            json.JSONDecodeError) as err:
        print("HL2 FREEFORM LAB REFUSED:", err, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
