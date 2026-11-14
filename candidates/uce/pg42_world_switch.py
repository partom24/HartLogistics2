"""PG42 fresh-world carrier test staging; never alter the held PG35 world.

Exact installed PG41 frozen pack is required. Stage changes ONLY the one
server.properties level-name value (PG35 -> fresh PG42), letting BDS generate
a NEW world. Bind copies exact existing PG35 BP/RP registration bytes into
the generated world after BDS is stopped again. Source LevelDB, accounts,
RESERVED host and world registries are always read-only. Restore switches
back ONLY after the runtime test probe has been removed from both packs.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
import tempfile

import pg41_lab_patch as pg41

lab=pg41.lab
pg08=pg41.pg08
pg35=pg41.pg40.pg37.pg35
ROOT=pg41.ROOT
OLD_WORLD=pg35.NEW_WORLD
NEW_WORLD="HartUCECarrierLabPG42"
BACKUP=pg35.BACKUP_FOLDER+"/pg42-isolated-carrier"
REGISTRIES=pg35.REGISTRY_FILES
PACK_FOLDERS=pg35.PACK_FOLDERS
SCHEMA="hart-pg42-isolated-world-v1"


def source_world(root: Path,generated: Path):
    """Prove installed PG41 and PG35 saved world before any config change."""
    root=pg35.guarded(root)
    old=pg35.guarded(root/"worlds"/OLD_WORLD)
    if not pg35.read_bytes(old/"level.dat"):
        raise lab.UnsafeLab("PG42 original PG35 world missing")
    db=pg35.guarded(old/"db")
    if not db.is_dir() or not any(db.iterdir()):
        raise lab.UnsafeLab("PG42 original PG35 LevelDB missing")
    pg35_manifest=pg35.state(root)
    backups=pg35.backup_folder(root)
    if pg35_manifest["new_world"]!=OLD_WORLD:
        raise lab.UnsafeLab("PG42 PG35 provenance invalid")
    expected={}
    for i,reg in enumerate(REGISTRIES):
        kind,_,pack_id,_=lab.PACKS[i]
        installed=pg35.guarded(root/PACK_FOLDERS[i])
        if lab.hashes(installed)!=lab.hashes(generated/kind):
            raise lab.UnsafeLab("PG42 installed pack != exact PG41 "+kind)
        data=pg35.read_bytes(old/reg)
        original=pg35.read_bytes(backups/reg)
        if (data!=original or
            pg35.digest(data)!=pg35_manifest["registries"][reg] or
            pg08.version_in_registry(data,pack_id)!=pg41.uce_deploy.NEW_VERSION):
            raise lab.UnsafeLab("PG42 PG35 registration drift: "+reg)
        expected[reg]=data
    return expected


def storage(root: Path):
    return pg35.guarded(root/BACKUP)


def stage(root: Path,generated: Path,commit: str,apply=False):
    registrations=source_world(root,generated)
    properties=pg35.read_bytes(root/"server.properties")
    planned=pg35.change_level(properties,OLD_WORLD,NEW_WORLD)
    new=pg35.guarded(root/"worlds"/NEW_WORLD)
    if new.exists():
        raise lab.UnsafeLab("PG42 destination world already exists; refuse overwrite")
    folder=storage(root)
    if folder.exists():
        raise lab.UnsafeLab("PG42 backup already exists; refuse re-stage")
    record={
        "schema":SCHEMA,"commit":commit,
        "old_world":OLD_WORLD,"new_world":NEW_WORLD,
        "original_props_sha":pg35.digest(properties),
        "staged_props_sha":pg35.digest(planned),
        "registries":{k:pg35.digest(v) for k,v in registrations.items()}
    }
    if not apply:
        return {"phase":"READY_TO_STAGE","source_world":OLD_WORLD,
                "new_world":NEW_WORLD}
    folder.mkdir(parents=True,exist_ok=False)
    for name,data in [("server.properties",properties),*registrations.items()]:
        dst=pg35.guarded(folder/name)
        with dst.open("xb") as file:file.write(data)
        if pg35.read_bytes(dst)!=data:
            raise lab.UnsafeLab("PG42 backup write mismatch")
    (folder/"manifest.json").write_text(
        json.dumps(record,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    if pg35.read_bytes(root/"server.properties")!=properties:
        raise lab.UnsafeLab("PG42 properties changed before stage")
    pg35.atomic_replace(root/"server.properties",planned)
    if pg35.read_bytes(root/"server.properties")!=planned:
        raise lab.UnsafeLab("PG42 staged properties readback failed")
    return {"phase":"STAGED","new_world":NEW_WORLD,
            "backup":str(folder)}


def verify_stage(root: Path,commit: str):
    folder=storage(root)
    try:
        manifest=json.loads(pg35.read_bytes(folder/"manifest.json"))
    except (ValueError,TypeError) as exc:
        raise lab.UnsafeLab("PG42 switch record invalid") from exc
    if (manifest.get("schema")!=SCHEMA or
        manifest.get("commit")!=commit or
        manifest.get("old_world")!=OLD_WORLD or
        manifest.get("new_world")!=NEW_WORLD):
        raise lab.UnsafeLab("PG42 source/world provenance mismatch")
    original=pg35.read_bytes(folder/"server.properties")
    staged=pg35.change_level(original,OLD_WORLD,NEW_WORLD)
    if (pg35.digest(original)!=manifest["original_props_sha"] or
        pg35.digest(staged)!=manifest["staged_props_sha"] or
        pg35.read_bytes(root/"server.properties")!=staged):
        raise lab.UnsafeLab("PG42 server properties changed unexpectedly")
    registries={}
    for reg in REGISTRIES:
        backed=pg35.read_bytes(folder/reg)
        if (pg35.digest(backed)!=manifest["registries"].get(reg) or
            pg35.read_bytes(root/"worlds"/OLD_WORLD/reg)!=backed):
            raise lab.UnsafeLab("PG42 previous world registration drift")
        registries[reg]=backed
    return original,registries


def bind(root: Path,generated: Path,commit: str,apply=False):
    _,saved=verify_stage(root,commit)
    if source_world(root,generated)!=saved:
        raise lab.UnsafeLab("PG42 installed PG41 source changed")
    new=pg35.guarded(root/"worlds"/NEW_WORLD)
    if not pg35.read_bytes(new/"level.dat"):
        raise lab.UnsafeLab("PG42 BDS has not generated fresh world")
    db=pg35.guarded(new/"db")
    if not db.is_dir() or not any(db.iterdir()):
        raise lab.UnsafeLab("PG42 generated world has no LevelDB")
    for reg in REGISTRIES:
        if pg35.guarded(new/reg).exists():
            raise lab.UnsafeLab("PG42 world pack registration already present")
    if not apply:
        return {"phase":"READY_TO_BIND","world":NEW_WORLD}
    created=[]
    try:
        for reg in REGISTRIES:
            dest=pg35.guarded(new/reg)
            with dest.open("xb") as handle:
                handle.write(saved[reg])
                handle.flush()
                import os
                os.fsync(handle.fileno())
            created.append(dest)
            if pg35.read_bytes(dest)!=saved[reg]:
                raise lab.UnsafeLab("PG42 copied registration mismatch")
    except Exception:
        for dst in reversed(created):
            if dst.exists() and pg35.read_bytes(dst)==saved[dst.name]:
                dst.unlink()
        raise
    return {"phase":"BOUND","new_world":NEW_WORLD,
            "world_generated_by_BDS":True}


def verify_bound(root: Path,commit: str):
    _,registries=verify_stage(root,commit)
    new=pg35.guarded(root/"worlds"/NEW_WORLD)
    if not pg35.read_bytes(new/"level.dat"):
        raise lab.UnsafeLab("PG42 world level.dat missing")
    db=pg35.guarded(new/"db")
    if not db.is_dir() or not any(db.iterdir()):
        raise lab.UnsafeLab("PG42 world LevelDB missing")
    for reg in REGISTRIES:
        if pg35.read_bytes(new/reg)!=registries[reg]:
            raise lab.UnsafeLab("PG42 world pack registration drift")
    return True


def restore(root: Path,generated: Path,commit: str,apply=False):
    original,registries=verify_stage(root,commit)
    verify_bound(root,commit)
    if source_world(root,generated)!=registries:
        raise lab.UnsafeLab("PG42 test probe still installed or PG35 changed")
    if not apply:
        return {"phase":"READY_TO_RESTORE","world":OLD_WORLD}
    pg35.atomic_replace(root/"server.properties",original)
    if pg35.read_bytes(root/"server.properties")!=original:
        raise lab.UnsafeLab("PG42 restore readback mismatch")
    return {"phase":"RESTORED","world":OLD_WORLD,
            "PG35_world_preserved":True,"PG42_world_preserved":True}


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode",choices=("plan","check","stage","bind",
                                          "check-bind","restore"),
                        default="plan")
    parser.add_argument("--commit",required=True)
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if not re.fullmatch(r"[0-9a-f]{40}",args.commit):
            raise lab.UnsafeLab("PG42 exact source commit required")
        if args.apply!=(args.mode in ("stage","bind","restore")):
            raise lab.UnsafeLab("PG42 mutation modes require --apply only")
        lab.assert_clean_git(ROOT,args.commit)
        with tempfile.TemporaryDirectory(prefix="pg42-world-source-") as td:
            candidate,_,_,_=pg41.render_pack_pair(Path(td))
            if args.mode=="plan":
                print("PG42 SOURCE PASS: fresh world is isolated from PG35")
                print("No server/world/production access during source plan")
                return 0
            root=pg08.check_real_root()
            if args.mode=="check":
                result=stage(root,candidate,args.commit)
            elif args.mode=="stage":
                result=stage(root,candidate,args.commit,apply=True)
            elif args.mode in ("bind","check-bind"):
                result=bind(root,candidate,args.commit,
                            apply=args.mode=="bind")
            else:
                result=restore(root,candidate,args.commit,apply=True)
            print("PG42 GUARDED LAB WORLD SWITCH:",json.dumps(result))
            print("Historic PG35/ThomasServer LevelDB preserved")
            return 0
    except (lab.UnsafeLab,OSError,UnicodeError,ValueError,KeyError,
            TypeError) as exc:
        print("PG42 REFUSED:",exc,file=sys.stderr)
        return 2


if __name__=="__main__":
    raise SystemExit(main())
