"""Guarded PG42 -> complete UCE product delivery in a NEW LAB world only.

Do not mutate the live PG42 carrier world, PG35 world, their LevelDB, or
historical registrations. Stage only changes server.properties.level-name.
A normal BDS start must generate a genuinely new world before Bind. Install
swaps only the two shared Hart packs under the existing guarded backup
transaction. Restore first puts the original PG42 probe packs back, THEN
returns server.properties to PG42; never enter PG42 with the UCE product pack.

No operation runs BDS, activates custody or performs Q4 migration.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
import tempfile

import pg42_lab_patch as pg42
import pg42_world_switch as switch

lab = pg42.lab
pg08 = pg42.pg08
pg35 = switch.pg35
uce_deploy = pg42.pg41.uce_deploy
uce = uce_deploy.uce
ROOT = pg42.ROOT
OLD_WORLD = switch.NEW_WORLD
NEW_WORLD = "HartUCEIntegratedLab"
BACKUP = pg35.BACKUP_FOLDER + "/hl2-integrated-product"
SCHEMA = "hart-hl2-integrated-world-v1"
REGS = pg35.REGISTRY_FILES
PACK_DIRS = pg35.PACK_FOLDERS


def storage(root: Path) -> Path:
    return pg35.guarded(root / BACKUP)


def historic_pg42_pin(root: Path) -> str:
    record = json.loads(pg35.read_bytes(switch.storage(root) / "manifest.json"))
    pin = record.get("commit")
    if not isinstance(pin, str) or not re.fullmatch(r"[a-f0-9]{40}", pin):
        raise lab.UnsafeLab("Integrated LAB historic PG42 pin unavailable")
    return pin


def check_pg42_source(root: Path, probe_hashes) -> dict[str, bytes]:
    """Verify untouched PG42 world and exact installed diagnostic pack."""
    root = pg35.guarded(root)
    switch.verify_bound(root, historic_pg42_pin(root))
    old = pg35.guarded(root / "worlds" / OLD_WORLD)
    if not pg35.read_bytes(old / "level.dat"):
        raise lab.UnsafeLab("PG42 preserved world level missing")
    db = pg35.guarded(old / "db")
    if not db.is_dir() or not any(db.iterdir()):
        raise lab.UnsafeLab("PG42 preserved LevelDB missing")
    regs = {}
    for i, reg in enumerate(REGS):
        kind, _, pack_id, _ = lab.PACKS[i]
        path = pg35.guarded(root / PACK_DIRS[i])
        if lab.hashes(path) != probe_hashes[kind]:
            raise lab.UnsafeLab("PG42 currently installed probe pack differs: " + kind)
        raw = pg35.read_bytes(old / reg)
        if pg08.version_in_registry(raw, pack_id) != uce_deploy.NEW_VERSION:
            raise lab.UnsafeLab("PG42 registered version changed: " + reg)
        regs[reg] = raw
    return regs


def stage(root: Path, probe_hashes, commit: str, apply=False):
    saved = check_pg42_source(root, probe_hashes)
    original = pg35.read_bytes(root / "server.properties")
    staged = pg35.change_level(original, OLD_WORLD, NEW_WORLD)
    new = pg35.guarded(root / "worlds" / NEW_WORLD)
    if new.exists():
        raise lab.UnsafeLab("Integrated target world already exists")
    folder = storage(root)
    if folder.exists():
        raise lab.UnsafeLab("Integrated switch record already exists")
    record = {
        "schema": SCHEMA, "commit": commit,
        "old_world": OLD_WORLD, "new_world": NEW_WORLD,
        "pg42_pin": historic_pg42_pin(root),
        "pg42_record_sha": pg35.digest(pg35.read_bytes(switch.storage(root)/"manifest.json")),
        "original_props_sha": pg35.digest(original),
        "staged_props_sha": pg35.digest(staged),
        "registries": {name: pg35.digest(raw) for name, raw in saved.items()},
    }
    if not apply:
        return {"phase":"READY_TO_STAGE", "world":NEW_WORLD}
    folder.mkdir(parents=True, exist_ok=False)
    for name, raw in [("server.properties", original), *saved.items()]:
        dest = pg35.guarded(folder / name)
        with dest.open("xb") as out:
            out.write(raw)
        if pg35.read_bytes(dest) != raw:
            raise lab.UnsafeLab("Integrated switch backup readback failed")
    (folder / "manifest.json").write_text(
        json.dumps(record, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    if pg35.read_bytes(root / "server.properties") != original:
        raise lab.UnsafeLab("Integrated stage properties drift")
    pg35.atomic_replace(root / "server.properties", staged)
    if pg35.read_bytes(root / "server.properties") != staged:
        raise lab.UnsafeLab("Integrated stage readback mismatch")
    return {"phase":"STAGED", "world":NEW_WORLD}


def stage_proof(root: Path, commit: str):
    folder = storage(root)
    record = json.loads(pg35.read_bytes(folder / "manifest.json"))
    if (record.get("schema") != SCHEMA or record.get("commit") != commit or
        record.get("old_world") != OLD_WORLD or
        record.get("new_world") != NEW_WORLD or
        record.get("pg42_pin") != historic_pg42_pin(root) or
        record.get("pg42_record_sha") !=
            pg35.digest(pg35.read_bytes(switch.storage(root)/"manifest.json"))):
        raise lab.UnsafeLab("Integrated stage source/history changed")
    orig = pg35.read_bytes(folder / "server.properties")
    staged = pg35.change_level(orig, OLD_WORLD, NEW_WORLD)
    if (pg35.digest(orig) != record.get("original_props_sha") or
        pg35.digest(staged) != record.get("staged_props_sha") or
        pg35.read_bytes(root / "server.properties") != staged):
        raise lab.UnsafeLab("Integrated stage server.properties changed")
    regs = {}
    for reg in REGS:
        raw = pg35.read_bytes(folder / reg)
        if (pg35.digest(raw) != record.get("registries",{}).get(reg) or
            pg35.read_bytes(root / "worlds" / OLD_WORLD / reg) != raw):
            raise lab.UnsafeLab("PG42 preserved world registration drift")
        regs[reg] = raw
    old_db = pg35.guarded(root / "worlds" / OLD_WORLD / "db")
    if not old_db.is_dir() or not any(old_db.iterdir()):
        raise lab.UnsafeLab("PG42 preserved LevelDB missing")
    return orig, regs


def fresh_world(root: Path, regs: dict[str, bytes], *, bound: bool):
    new = pg35.guarded(root / "worlds" / NEW_WORLD)
    if not pg35.read_bytes(new / "level.dat"):
        raise lab.UnsafeLab("Fresh integrated world not BDS-generated")
    db = pg35.guarded(new / "db")
    if not db.is_dir() or not any(db.iterdir()):
        raise lab.UnsafeLab("Fresh integrated world LevelDB absent")
    for reg, raw in regs.items():
        path = pg35.guarded(new / reg)
        if bound:
            if pg35.read_bytes(path) != raw:
                raise lab.UnsafeLab("Integrated world registration changed")
        elif path.exists():
            raise lab.UnsafeLab("Integrated world already has registrations")
    return new


def bind(root: Path, commit: str, probe_hashes, apply=False):
    _, regs = stage_proof(root, commit)
    for i, (kind, _, _, _) in enumerate(lab.PACKS):
        if lab.hashes(pg35.guarded(root / PACK_DIRS[i])) != probe_hashes[kind]:
            raise lab.UnsafeLab("Integrated bind requires unchanged PG42 probe pack")
    new = fresh_world(root, regs, bound=False)
    if not apply:
        return {"phase":"READY_TO_BIND", "world":NEW_WORLD}
    created = []
    try:
        for name, raw in regs.items():
            path = pg35.guarded(new / name)
            with path.open("xb") as out:
                out.write(raw)
                out.flush()
                import os
                os.fsync(out.fileno())
            created.append(path)
            if pg35.read_bytes(path) != raw:
                raise lab.UnsafeLab("Integrated registration readback failed")
    except Exception:
        for path in reversed(created):
            if path.is_file() and pg35.read_bytes(path) == regs[path.name]:
                path.unlink()
        raise
    return {"phase":"BOUND", "world":NEW_WORLD}


def bound_plan(root: Path, commit: str, probe_hashes, product_hashes,
               product: Path, *, rollback_tag=None):
    _, regs = stage_proof(root, commit)
    fresh_world(root, regs, bound=True)
    items = lab.discover_plan(ROOT, root)
    if len(items) != 2:
        raise lab.UnsafeLab("Integrated LAB requires exactly two Hart pack records")
    rollback = rollback_tag is not None
    if rollback and not re.fullmatch(r"lab-[0-9a-f]{12}", rollback_tag):
        raise lab.UnsafeLab("Integrated rollback tag invalid")
    backup = pg35.guarded(root / "_HartLogisticsDeployBackups" /
                          (rollback_tag if rollback else "_no_tag"))
    if rollback and not backup.is_dir():
        raise lab.UnsafeLab("Integrated rollback backup absent")
    plan = []
    for i, item in enumerate(items):
        kind, folder, pack_id, _ = lab.PACKS[i]
        expected = product_hashes[kind] if rollback else probe_hashes[kind]
        wanted = probe_hashes[kind] if rollback else product_hashes[kind]
        if (item["target"].name != pg08.EXPECTED_DIRS[i] or
            item["target"].parent.name != folder or
            item["registry"].parent.name != NEW_WORLD or
            item["old_bytes"] != regs[REGS[i]] or
            pg08.version_in_registry(item["old_bytes"], pack_id) !=
                uce_deploy.NEW_VERSION or
            lab.hashes(item["target"]) != expected):
            raise lab.UnsafeLab("Integrated install/rollback predecessor drift: " + kind)
        source = product / kind
        if rollback:
            source = pg35.guarded(backup / f"pack-{i}")
            prior = pg35.guarded(backup / f"registry-{i}.bin")
            if (not source.is_dir() or
                pg35.read_bytes(prior) != item["old_bytes"] or
                lab.hashes(source) != wanted):
                raise lab.UnsafeLab("Integrated rollback contents wrong: " + kind)
        plan.append({**item, "source":source, "files":wanted,
                     "old_hashes":expected,
                     # PG42 and UCE share 1.5.16 registration identifiers.
                     # Preserve the original registration bytes, not a
                     # speculative version migration.
                     "new_registry":item["old_bytes"].decode("utf-8-sig")})
    return plan


def restore(root: Path, commit: str, probe_hashes, apply=False):
    original, regs = stage_proof(root, commit)
    # The restored world may have never been bound; never delete it.
    new = pg35.guarded(root / "worlds" / NEW_WORLD)
    if new.exists():
        for name, raw in regs.items():
            path = pg35.guarded(new / name)
            if path.exists() and pg35.read_bytes(path) != raw:
                raise lab.UnsafeLab("Integrated world registry drift before restore")
    for i, (kind, _, _, _) in enumerate(lab.PACKS):
        if lab.hashes(pg35.guarded(root / PACK_DIRS[i])) != probe_hashes[kind]:
            raise lab.UnsafeLab("Cannot re-enter PG42 while product pack installed")
    if not apply:
        return {"phase":"READY_TO_RESTORE", "world":OLD_WORLD}
    pg35.atomic_replace(root / "server.properties", original)
    if pg35.read_bytes(root / "server.properties") != original:
        raise lab.UnsafeLab("Integrated world restoration readback failed")
    return {"phase":"RESTORED", "world":OLD_WORLD,
            "pg42_world_preserved":True, "integrated_world_preserved":True}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=(
        "plan", "check-stage", "stage", "check-bind", "bind",
        "check-install", "install", "check-rollback", "rollback",
        "check-restore", "restore"), default="plan")
    parser.add_argument("--commit", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-tag")
    args = parser.parse_args(argv)
    mutation = args.mode in ("stage", "bind", "install", "rollback", "restore")
    try:
        lab.assert_lab_name(lab.LAB)
        if not re.fullmatch(r"[a-f0-9]{40}", args.commit):
            raise lab.UnsafeLab("Integrated LAB exact Git SHA required")
        if args.apply != mutation:
            raise lab.UnsafeLab("Mutation modes require --apply, read-only modes refuse it")
        if (args.backup_tag is None) != (args.mode not in ("check-rollback", "rollback")):
            raise lab.UnsafeLab("Rollback modes require --backup-tag only")
        lab.assert_clean_git(ROOT, args.commit)
        with tempfile.TemporaryDirectory(prefix="hl2-product-lab-source-") as td:
            scratch = Path(td)
            probe, _, probe_hashes, _ = pg42.render_pack_pair(scratch/"pg42")
            base = scratch/"pg33"
            uce_deploy.pg33.prepare(base)
            product = scratch/"full-product"
            uce.prepare(product)
            product_hashes = uce_deploy.check_candidate(product, base)
            if args.mode == "plan":
                print("HL2 FULL PRODUCT SOURCE: UCE, not PG42 test probe")
                print("No LAB, world, original archive or production accessed")
                return 0
            root = pg08.check_real_root()
            if mutation:
                pg08.assert_lab_process_stopped()
            if args.mode in ("check-stage","stage"):
                result = stage(root, probe_hashes, args.commit, apply=mutation)
            elif args.mode in ("check-bind","bind"):
                result = bind(root, args.commit, probe_hashes, apply=mutation)
            elif args.mode in ("check-install","install","check-rollback","rollback"):
                plan = bound_plan(root,args.commit,probe_hashes,product_hashes,
                                  product,rollback_tag=args.backup_tag)
                if mutation:
                    pg08.plan_is_unchanged(plan)
                    backup = lab.apply_plan(root, plan)
                    result = {"phase":"ROLLED_BACK" if args.backup_tag else "INSTALLED",
                              "backup":str(backup),"world":NEW_WORLD}
                else:
                    result = {"phase":"READY_TO_ROLLBACK" if args.backup_tag
                              else "READY_TO_INSTALL", "world":NEW_WORLD}
            else:
                result = restore(root,args.commit,probe_hashes,apply=mutation)
            print("HL2 GUARDED LAB:",json.dumps(result,sort_keys=True))
            print("Historic PG35/PG42 LevelDB and original ZIP preserved")
            return 0
    except (lab.UnsafeLab,OSError,ValueError,KeyError,
            json.JSONDecodeError) as exc:
        print("HL2 INTEGRATED LAB REFUSED:",exc,file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
