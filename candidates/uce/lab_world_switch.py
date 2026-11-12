"""PG35 guarded empty-world switch for installed UCE 1.5.16 in the LAB ONLY.

Two phase switch: Stage changes ONLY level-name, allowing BDS to generate an
actually new world; Bind, after BDS is stopped again, copies the original
world's BP/RP registration bytes into that new world. Never copies LevelDB,
Q4 custody, inventories, or world metadata. Restore re-selects ThomasServer.

Only main() can access the real LAB, with pinned clean Git and stopped BDS.
Pure fixture functions are exposed solely for synthetic safety tests.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

import lab_deploy as uce_deploy

lab = uce_deploy.lab
pg08 = uce_deploy.pg08
ROOT = uce_deploy.ROOT
OLD_WORLD = "ThomasServer"
NEW_WORLD = "HartUCEEmptyLabPG35"
BACKUP_NAME = "pg35-uce-empty-world"
BACKUP_FOLDER = "_HartLogisticsWorldSwitchBackups"
REGISTRY_FILES = ("world_behavior_packs.json", "world_resource_packs.json")
PACK_FOLDERS = ("behavior_packs/HartMods_HartLogistics_BP",
                "resource_packs/HartMods_HartLogistics_RP")


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def guarded(path: Path) -> Path:
    lab.assert_no_link(path)
    return path


def read_bytes(path: Path) -> bytes:
    guarded(path)
    if not path.is_file():
        raise lab.UnsafeLab("PG35 missing expected file: " + path.name)
    return path.read_bytes()


def change_level(raw: bytes, previous: str, wanted: str) -> bytes:
    """Preserve every original property byte besides the ONE level-name value."""
    bom = b"\xef\xbb\xbf"
    prefix = bom if raw.startswith(bom) else b""
    text = raw[len(prefix):].decode("utf-8", errors="strict")
    lines = text.splitlines(keepends=True)
    indexes = [i for i, line in enumerate(lines)
               if re.match(r"^level-name\s*=", line)]
    if len(indexes) != 1:
        raise lab.UnsafeLab("PG35 requires one exact level-name property")
    i = indexes[0]
    match = re.fullmatch(r"(level-name\s*=\s*)([^\r\n]*)(\r?\n)?", lines[i])
    if not match or match.group(2).strip() != previous:
        raise lab.UnsafeLab("PG35 unexpected active world or property format")
    lines[i] = match.group(1) + wanted + (match.group(3) or "")
    updated = prefix + "".join(lines).encode("utf-8")
    if updated == raw:
        raise lab.UnsafeLab("PG35 did not change active world")
    return updated


def exact_pack_registrations(root: Path, generated: Path) -> dict[str, bytes]:
    """Check installed exact UCE source and both historical registrations."""
    old = guarded(root / "worlds" / OLD_WORLD)
    if not read_bytes(old / "level.dat"):
        raise lab.UnsafeLab("PG35 historical world level.dat empty")
    recorded = {}
    expected = uce_deploy.lab.hashes
    for i, registry in enumerate(REGISTRY_FILES):
        bp_or_rp, _, pack_uuid, _ = lab.PACKS[i]
        installed = guarded(root / PACK_FOLDERS[i])
        if expected(installed) != expected(generated / bp_or_rp):
            raise lab.UnsafeLab("PG35 installed UCE pack hash mismatch: " + bp_or_rp)
        raw = read_bytes(old / registry)
        if pg08.version_in_registry(raw, pack_uuid) != uce_deploy.NEW_VERSION:
            raise lab.UnsafeLab("PG35 old-world UCE registration mismatch")
        recorded[registry] = raw
    return recorded


def backup_folder(root: Path) -> Path:
    return guarded(root / BACKUP_FOLDER / BACKUP_NAME)


def state(root: Path) -> dict:
    folder = backup_folder(root)
    raw = read_bytes(folder / "manifest.json")
    try:
        item = json.loads(raw)
    except ValueError as exc:
        raise lab.UnsafeLab("PG35 malformed switch record") from exc
    if (item.get("schema") != "hart-uce-empty-lab-pg35-v1"
        or item.get("old_world") != OLD_WORLD
        or item.get("new_world") != NEW_WORLD
        or not re.fullmatch(r"[a-f0-9]{40}", item.get("commit", ""))):
        raise lab.UnsafeLab("PG35 invalid switch record")
    for key in ("original_props_sha", "staged_props_sha"):
        if not re.fullmatch("[a-f0-9]{64}", item.get(key, "")):
            raise lab.UnsafeLab("PG35 invalid switch digest")
    return item


def stage(root: Path, generated: Path, commit: str, apply: bool = False):
    guarded(root)
    current = read_bytes(root / "server.properties")
    modified = change_level(current, OLD_WORLD, NEW_WORLD)
    registered = exact_pack_registrations(root, generated)
    fresh = guarded(root / "worlds" / NEW_WORLD)
    if fresh.exists():
        raise lab.UnsafeLab("PG35 new world path is occupied; refuse overwrite")
    folder = backup_folder(root)
    if folder.exists():
        raise lab.UnsafeLab("PG35 switch backup already exists; refuse overwrite")
    result = {
        "schema": "hart-uce-empty-lab-pg35-v1",
        "commit": commit, "old_world": OLD_WORLD, "new_world": NEW_WORLD,
        "original_props_sha": digest(current), "staged_props_sha": digest(modified),
        "registries": {name: digest(data) for name, data in registered.items()}
    }
    if not apply:
        return {"phase": "READY_TO_STAGE", "target": NEW_WORLD}
    folder.mkdir(parents=True, exist_ok=False)
    for name, raw in [("server.properties", current), *registered.items()]:
        (folder / name).write_bytes(raw)
        if read_bytes(folder / name) != raw:
            raise lab.UnsafeLab("PG35 backup write mismatch")
    (folder / "manifest.json").write_text(
        json.dumps(result, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    if read_bytes(root / "server.properties") != current:
        raise lab.UnsafeLab("PG35 properties changed during backup")
    atomic_replace(root / "server.properties", modified)
    if read_bytes(root / "server.properties") != modified:
        raise lab.UnsafeLab("PG35 changed property readback mismatch")
    return {"phase": "STAGED", "target": NEW_WORLD, "backup": str(folder)}


def atomic_replace(path: Path, raw: bytes):
    """Never alter the old file until the replacement is durable on its volume."""
    guarded(path)
    temporary = path.with_name(path.name + ".pg35-pending")
    guarded(temporary)
    if temporary.exists():
        raise lab.UnsafeLab("PG35 pending properties file already exists")
    try:
        with temporary.open("xb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        # Only clean up files created by this operation on a normal failure.
        if temporary.exists() and temporary.is_file():
            temporary.unlink()


def verify_switch(root: Path, commit: str):
    manifest = state(root)
    # The Stage may have been pinned to this or a source-equivalent commit.
    # Never accept a different source in an automatic cross-version operation.
    if manifest["commit"] != commit:
        raise lab.UnsafeLab("PG35 switch commit differs from pinned source")
    folder = backup_folder(root)
    old_props = read_bytes(folder / "server.properties")
    current = read_bytes(root / "server.properties")
    if digest(old_props) != manifest["original_props_sha"]:
        raise lab.UnsafeLab("PG35 original properties backup changed")
    planned = change_level(old_props, OLD_WORLD, NEW_WORLD)
    if digest(planned) != manifest["staged_props_sha"] or current != planned:
        raise lab.UnsafeLab("PG35 switched properties diverged")
    originals = {}
    for reg in REGISTRY_FILES:
        raw = read_bytes(folder / reg)
        if digest(raw) != manifest["registries"].get(reg):
            raise lab.UnsafeLab("PG35 registry backup changed")
        live = read_bytes(root / "worlds" / OLD_WORLD / reg)
        if live != raw:
            raise lab.UnsafeLab("PG35 historical world registration changed")
        originals[reg] = raw
    return manifest, originals, old_props


def bind(root: Path, generated: Path, commit: str, apply: bool = False):
    manifest, original, _ = verify_switch(root, commit)
    checked = exact_pack_registrations(root, generated)
    if checked != original:
        raise lab.UnsafeLab("PG35 installed UCE pack or registration drift")
    new = guarded(root / "worlds" / NEW_WORLD)
    if not read_bytes(new / "level.dat"):
        raise lab.UnsafeLab("PG35 BDS has not generated the empty world")
    db = guarded(new / "db")
    if not db.is_dir() or not any(db.iterdir()):
        raise lab.UnsafeLab("PG35 generated world has no LevelDB directory")
    for name in REGISTRY_FILES:
        path = guarded(new / name)
        if path.exists():
            raise lab.UnsafeLab("PG35 new world registration already present")
    if not apply:
        return {"phase": "READY_TO_BIND", "target": NEW_WORLD}
    created = []
    try:
        for name in REGISTRY_FILES:
            path = new / name
            with path.open("xb") as handle:
                handle.write(original[name])
                handle.flush()
                os.fsync(handle.fileno())
            created.append(path)
            if read_bytes(path) != original[name]:
                raise lab.UnsafeLab("PG35 copied registration mismatch")
    except Exception:
        for path in reversed(created):
            if path.exists() and read_bytes(path) == original[path.name]:
                path.unlink()
        raise
    return {"phase": "BOUND", "target": NEW_WORLD,
            "registrations": list(original), "world_generated_by_bds": True}


def restore(root: Path, commit: str, apply: bool = False):
    _, _, original = verify_switch(root, commit)
    if not apply:
        return {"phase": "READY_TO_RESTORE", "target": OLD_WORLD}
    atomic_replace(root / "server.properties", original)
    if read_bytes(root / "server.properties") != original:
        raise lab.UnsafeLab("PG35 restore readback mismatch")
    return {"phase": "RESTORED", "target": OLD_WORLD,
            "new_world_preserved": NEW_WORLD}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("plan", "check", "stage", "bind", "restore"),
                        default="plan")
    parser.add_argument("--commit", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
            raise lab.UnsafeLab("PG35 exact source SHA required")
        if args.apply != (args.mode in ("stage", "bind", "restore")):
            raise lab.UnsafeLab("PG35 mutation mode requires --apply; read mode forbids it")
        lab.assert_clean_git(ROOT, args.commit)
        with tempfile.TemporaryDirectory(prefix="uce-pg35-source-") as temp:
            old, new = Path(temp) / "pg33", Path(temp) / "uce"
            uce_deploy.pg33.prepare(old)
            uce_deploy.uce.prepare(new)
            uce_deploy.check_candidate(new, old)
            if args.mode == "plan":
                print("PG35 SOURCE PASS: no server or world accessed")
                return 0
            root = pg08.check_real_root()  # stopped BDS and exact LAB ONLY
            if args.mode == "check":
                outcome = stage(root, new, args.commit)
            elif args.mode == "stage":
                outcome = stage(root, new, args.commit, apply=True)
            elif args.mode == "bind":
                outcome = bind(root, new, args.commit, apply=True)
            else:
                outcome = restore(root, args.commit, apply=True)
            print("PG35 AUTHORIZED LAB ONLY:", root)
            print(json.dumps(outcome, sort_keys=True))
            print("No production, historical Q4 world data, or original ZIP modified.")
            print("No BDS restart performed.")
            return 0
    except (OSError, UnicodeError, ValueError, KeyError,
            lab.UnsafeLab) as err:
        print("PG35 REFUSED:", err)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
