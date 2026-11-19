#!/usr/bin/env python3
"""Guarded 1.5.0 -> 1.5.1 connected-pipe visual-only LAB update/rollback.

Historical 1.5.0 predecessor is EXACT Git commit 7fa7951..., including its
source and original geometry. No generic same-version replacement. This script
changes neither cargo/Q4 ownership nor world item data, only verified BP/RP
files and Hart registered versions via the existing two-pack transaction.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import ntpath
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hart_150_installer_engine",
                                              ROOT/"scripts/hartlogistics_150_lab_updater.py")
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)

UnsafeLab=old.UnsafeLab
LAB=old.LAB
PACKS=old.PACKS
NEW_VERSION=(1,5,1)
OLD_VERSION=(1,5,0)
PREDECESSOR="7fa7951f4a45f6e2a344856f3a715134d50f0fd8"
ALLOWED_CHANGE={
    "behavior_pack/manifest.json",
    "resource_pack/manifest.json",
    "behavior_pack/scripts/main.js",
    "behavior_pack/scripts/urce_150_readonly_runtime.js",
    "behavior_pack/blocks/transporter.json",
    "resource_pack/models/blocks/hartlogistics_transporter.geo.json"
}

def prior_hashes(repo=ROOT):
    """Read original pack bytes from immutable original commit, not latest HEAD."""
    command=["git","-C",str(repo)]
    rows=subprocess.run([*command,"ls-tree","-r","--name-only",PREDECESSOR,
                         "addon/behavior_pack","addon/resource_pack"],
                         capture_output=True,text=True,check=True).stdout.splitlines()
    expected={}
    for entry in rows:
        if not entry.startswith(("addon/behavior_pack/","addon/resource_pack/")):
            raise UnsafeLab("Invalid predecessor pack path")
        data=subprocess.run([*command,"show",PREDECESSOR+":"+entry],
                            capture_output=True,check=True).stdout
        kind=entry[len("addon/"):]
        expected[kind]=hashlib.sha256(data).hexdigest()
    if len(expected)<60:
        raise UnsafeLab("Immutable 1.5.0 source incomplete")
    return expected

def validate_candidate(repo=ROOT,original=None):
    if original is None:
        original=prior_hashes(repo)
    bp=json.loads((repo/"addon/behavior_pack/manifest.json").read_text())
    rp=json.loads((repo/"addon/resource_pack/manifest.json").read_text())
    if bp["header"]["uuid"]!=old.BP_UUID or rp["header"]["uuid"]!=old.RP_UUID:
        raise UnsafeLab("Unrecognized Hart pack identities")
    if (old.v3(bp["header"]["version"])!=NEW_VERSION or
        old.v3(rp["header"]["version"])!=NEW_VERSION or
        any(old.v3(m["version"])!=NEW_VERSION for m in bp["modules"]+rp["modules"])):
        raise UnsafeLab("Expected 1.5.1 BP/RP header and module versions")
    matches=[d for d in bp["dependencies"] if d.get("uuid")==old.RP_UUID
             and old.v3(d.get("version"))==NEW_VERSION]
    if len(matches)!=1:
        raise UnsafeLab("BP dependency must require matching 1.5.1 RP")
    if not any(x.get("module_name")=="@minecraft/server" and x.get("version")=="2.7.0"
               for x in bp["dependencies"]):
        raise UnsafeLab("Pinned stable Bedrock API changed")
    now={}
    for local,_,_,_ in PACKS:
        h=old.hashes(repo/"addon"/local)
        now[local]=h
    all_now={"%s/%s"%(local,p):hash for local,h in now.items() for p,hash in h.items()}
    if set(all_now)!=set(original):
        raise UnsafeLab("New/deleted gameplay or RP file outside reviewed six-file delta")
    changed={k for k in all_now if all_now[k]!=original[k]}
    if changed!=ALLOWED_CHANGE:
        raise UnsafeLab("Source changed outside exact 1.5.0 -> 1.5.1 visual-only delta")
    main=(repo/"addon/behavior_pack/scripts/main.js").read_text()
    unwrapped=main.replace('import "./urce_150_readonly_runtime.js";\n\n','',1)
    unwrapped=unwrapped.replace('const VERSION = "1.5.1-dev";',
                                'const VERSION = "1.4.2";',1)
    if hashlib.sha256(unwrapped.encode()).hexdigest()!=old.PHASE_A_ENGINE_SHA256:
        raise UnsafeLab("Original 1.4.2 cargo engine changed")
    block=json.loads((repo/"addon/behavior_pack/blocks/transporter.json").read_text())["minecraft:block"]
    model=json.loads((repo/"addon/resource_pack/models/blocks/hartlogistics_transporter.geo.json").read_text())["minecraft:geometry"]
    if (block["description"]["identifier"]!="hartsorter:transporter" or
        len(model)!=2 or
        model[0]["description"]["identifier"]!="geometry.hartlogistics.transporter"):
        raise UnsafeLab("Unsupported connected-pipe model layout")
    faces=("north","south","east","west","up","down")
    bones={b["name"]:b["cubes"][0] for b in model[0]["bones"]}
    if (bones["core"]["size"]!=[4,4,4] or
        bones["east"]["origin"]!=[-8,6,-2] or
        bones["west"]["origin"]!=[2,6,-2]):
        raise UnsafeLab("PG27 confirmed axis/core geometry not preserved")
    if len(block["description"]["states"])!=6:
        raise UnsafeLab("Six connection state flags are required")
    for face in faces:
        state="hartlogistics:connect_"+face
        if block["description"]["states"].get(state)!=[False,True]:
            raise UnsafeLab("Missing directional connection state")
        if block["components"]["minecraft:geometry"]["bone_visibility"].get(face)!=(
            "q.block_state('"+state+"')"):
            raise UnsafeLab("Directional arm not bound to its visual state")
    runtime=(repo/"addon/behavior_pack/scripts/urce_150_readonly_runtime.js").read_text()
    for marker in ("world.afterEvents.playerPlaceBlock", "world.afterEvents.playerBreakBlock",
                   "block.setPermutation(permutation)", "scheduleVisualsNear",
                   "VISUAL_POSITIONS_PER_TICK = 8"):
        if marker not in runtime:
            raise UnsafeLab("Visual state update/limit missing: "+marker)
    for forbidden in (".setItem(", ".spawnItem(", ".setDynamicProperty(", "runInterval("):
        if forbidden in runtime:
            raise UnsafeLab("Visual-only implementation contains prohibited cargo writer/scheduler")
    return now

def expected_previous(original):
    return {local:{path.split("/",1)[1]:digest for path,digest in original.items()
                   if path.startswith(local+"/")}
            for local,_,_,_ in PACKS}

def read_live_plan(repo,root,original=None):
    if original is None:original=prior_hashes(repo)
    candidate=validate_candidate(repo,original)
    before=expected_previous(original)
    props=root/"server.properties"
    if not (root/"bedrock_server.exe").is_file() or not props.is_file():
        raise UnsafeLab("Not an authorized BDS LAB server")
    levels=[line.partition("=")[2].strip() for line in props.read_text(encoding="utf-8-sig").splitlines()
            if line.strip().startswith("level-name=")]
    if len(levels)!=1 or not levels[0] or "/" in levels[0] or "\\" in levels[0] or levels[0] in (".",".."):
        raise UnsafeLab("Missing/unsafe active LAB world")
    world=root/"worlds"/levels[0]
    if not world.is_dir():raise UnsafeLab("Selected LAB world not found")
    plan=[]
    for local,folder,pack_id,registry_name in PACKS:
        pack_root=root/folder
        if not pack_root.is_dir():raise UnsafeLab("Installed pack root missing")
        hits=[]
        for path in pack_root.iterdir():
            if path.is_symlink():raise UnsafeLab("Junction in installed pack root")
            if not path.is_dir() or not (path/"manifest.json").is_file():continue
            try:m=json.loads((path/"manifest.json").read_text(encoding="utf-8-sig"))
            except ValueError:continue
            if m.get("header",{}).get("uuid")==pack_id:hits.append(path)
        if len(hits)!=1:raise UnsafeLab("Expected exactly one installed Hart pack "+pack_id)
        target=hits[0]
        old.assert_no_link(target)
        manifest=json.loads((target/"manifest.json").read_text(encoding="utf-8-sig"))
        current_version=old.v3(manifest["header"]["version"])
        if current_version not in (OLD_VERSION,NEW_VERSION):
            raise UnsafeLab("Only exact 1.5.0 -> 1.5.1 upgrade allowed")
        actual=old.hashes(target)
        allowed=before[local] if current_version==OLD_VERSION else candidate[local]
        if actual!=allowed:
            raise UnsafeLab("Installed "+local+" source differs from known "+str(current_version))
        registry=world/registry_name
        old.assert_no_link(registry)
        if not registry.is_file():raise UnsafeLab("World pack registration is missing")
        raw=registry.read_bytes()
        entries=json.loads(old.remove_jsonc(raw.decode("utf-8-sig")))
        matches=[e for e in entries if isinstance(e,dict) and
                 str(e.get("pack_id","")).casefold()==pack_id.casefold()]
        if len(matches)!=1 or old.v3(matches[0]["version"])!=current_version:
            raise UnsafeLab("World registered pack differs from installed pack")
        plan.append({
            "source":repo/"addon"/local,
            "target":target,
            "registry":registry,
            "new_registry":old.patch_registration(raw.decode("utf-8-sig"),pack_id,NEW_VERSION),
            "old_bytes":raw,
            "installed":actual,
            "files":candidate[local],
            "version":current_version,
            "local":local
        })
    if len({item["version"] for item in plan})!=1:
        raise UnsafeLab("Mixed installed BP/RP versions")
    return plan

def rollback_plan(repo,root,tag,original=None):
    if not re.fullmatch(r"lab-[0-9a-f]{12}",tag):
        raise UnsafeLab("Rollback requires exact installer-created backup tag")
    original=original if original is not None else prior_hashes(repo)
    current=read_live_plan(repo,root,original)
    if current[0]["version"]!=NEW_VERSION:
        raise UnsafeLab("Rollback requires exactly installed 1.5.1 candidate")
    backup=root/"_HartLogisticsDeployBackups"/tag
    old.assert_no_link(backup)
    if not backup.is_dir():raise UnsafeLab("Rollback backup not found")
    previous=expected_previous(original)
    result=[]
    for i,item in enumerate(current):
        saved=backup/("pack-"+str(i))
        reg=backup/("registry-"+str(i)+".bin")
        old.assert_no_link(saved);old.assert_no_link(reg)
        if not saved.is_dir() or not reg.is_file():
            raise UnsafeLab("Incomplete rollback backup")
        if old.hashes(saved)!=previous[item["local"]]:
            raise UnsafeLab("Previous pack backup does not match pinned original 1.5.0")
        raw=reg.read_bytes()
        parsed=json.loads(old.remove_jsonc(raw.decode("utf-8-sig")))
        matches=[x for x in parsed if isinstance(x,dict) and
                 str(x.get("pack_id","")).casefold()==PACKS[i][2].casefold()]
        if len(matches)!=1 or old.v3(matches[0]["version"])!=OLD_VERSION:
            raise UnsafeLab("Backup registration version is not 1.5.0")
        updated=old.patch_registration(raw.decode("utf-8-sig"),PACKS[i][2],NEW_VERSION)
        bom=b"\xef\xbb\xbf" if raw.startswith(b"\xef\xbb\xbf") else b""
        if bom+updated.encode("utf-8")!=item["old_bytes"]:
            raise UnsafeLab("Unrelated registry entries/drift since this exact backup")
        result.append({**item,"source":saved,
                       "files":previous[item["local"]],
                       "new_registry":raw.decode("utf-8-sig")})
    return result

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server-root",default=LAB)
    parser.add_argument("--commit",help="Exact currently reviewed Git SHA")
    parser.add_argument("--check-lab",action="store_true")
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--confirm-lab-only",action="store_true")
    parser.add_argument("--rollback-tag")
    a=parser.parse_args(argv)
    try:
        old.assert_lab_name(a.server_root)
        if a.commit:old.assert_clean_git(ROOT,a.commit)
        if a.apply and not(a.commit and a.check_lab and a.confirm_lab_only):
            raise UnsafeLab("Apply needs --commit --check-lab --confirm-lab-only")
        if a.rollback_tag and not (a.apply and a.check_lab and a.commit):
            raise UnsafeLab("Rollback needs exact commit, backup tag, check and apply")
        if a.check_lab and not a.commit:
            raise UnsafeLab("LAB CheckLab needs pinned full commit")
        originals=prior_hashes(ROOT)
        source=validate_candidate(ROOT,originals)
        if not a.check_lab:
            print("1.5.1 SOURCE PASS: exact 1.5.0 predecessor and six-file visual-only delta")
            print("New BP files:",len(source["behavior_pack"]),"RP files:",len(source["resource_pack"]))
            print("NO LAB OR PRODUCTION SERVER FILES ACCESSED.")
            return 0
        if os.name!="nt":
            raise UnsafeLab("Real LAB access requires Windows")
        root=Path(a.server_root)
        old.assert_no_link(root)
        if ntpath.normcase(str(root.resolve(strict=True)))!=ntpath.normcase(LAB):
            raise UnsafeLab("Unauthorized LAB root redirection")
        old.assert_server_stopped()
        plan=rollback_plan(ROOT,root,a.rollback_tag,originals) if a.rollback_tag else read_live_plan(ROOT,root,originals)
        for item in plan:
            print("LAB", "ROLLBACK" if a.rollback_tag else "UPGRADE",
                  item["target"],"registry:",item["registry"])
        if not a.rollback_tag and all(
                x["version"]==NEW_VERSION and
                x["installed"]==x["files"] and
                x["old_bytes"].decode("utf-8-sig")==x["new_registry"] for x in plan):
            print("Already exactly installed 1.5.1; no write needed.")
            return 0
        if not a.apply:
            print("LAB READ-ONLY PREFLIGHT PASS; no files changed.")
            return 0
        old.assert_server_stopped()
        recheck=rollback_plan(ROOT,root,a.rollback_tag,originals) if a.rollback_tag else read_live_plan(ROOT,root,originals)
        for first,again in zip(plan,recheck):
            if (first["installed"]!=again["installed"] or
                first["old_bytes"]!=again["old_bytes"] or
                first["files"]!=again["files"]):
                raise UnsafeLab("LAB state changed during preflight")
        backup=old.apply_plan(root,recheck)
        print("LAB", "ROLLBACK" if a.rollback_tag else "UPGRADE",
              "COMPLETE; backup:",backup)
        print("No world reset, BDS restart or production file mutation. Keep all backups.")
        return 0
    except (UnsafeLab,OSError,ValueError,KeyError,subprocess.CalledProcessError) as e:
        print("REFUSED:",e,file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
