#!/usr/bin/env python3
"""Guarded 1.5.3 -> 1.5.4 idle-native safety/performance LAB update/rollback.

Predecessor is owner-installed immutable 1.5.3 commit aa108516b4fe5553b152bc6caf51a2cf8635037e.
Checks exact changed/additional source blobs, same BP/RP UUIDs and matching
module/dependency versions, and preserves world data and rollback backups.
No generic same-version replacement, world conversion or production access.
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
NEW_VERSION=(1,5,4)
OLD_VERSION=(1,5,3)
PREDECESSOR="aa108516b4fe5553b152bc6caf51a2cf8635037e"
ALLOWED_CHANGE={
    "behavior_pack/manifest.json",
    "resource_pack/manifest.json",
    "behavior_pack/scripts/main.js",
    "behavior_pack/scripts/urce_152_live_link_guard.js",
}
# Only versioned manifests and reviewed guarded Dimension/control-plane calls
# differ from installed 1.5.3. No added/removed pack files or Q4 writers.
ADDED_FILES=set()
REVIEWED_BLOBS={
    "behavior_pack/manifest.json": "670092b7b63e696384a0318599c9552faeb565fe",
    "resource_pack/manifest.json": "2133f424e8f9f3a01f8fbb39277979b573633043",
    "behavior_pack/scripts/main.js": "7f0baf64c52849482756814eecd404dfeeab48f5",
    "behavior_pack/scripts/urce_152_live_link_guard.js": "e23e10d6e833a252a8a4da351df5d008a05c9f66",
}

def git_blob_id(data: bytes) -> str:
    return hashlib.sha1(("blob "+str(len(data))+"\0").encode("ascii")+data).hexdigest()

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
        raise UnsafeLab("Immutable 1.5.3 source incomplete")
    return expected

def validate_candidate(repo=ROOT,original=None):
    if original is None:original=prior_hashes(repo)
    bp=json.loads((repo/"addon/behavior_pack/manifest.json").read_text())
    rp=json.loads((repo/"addon/resource_pack/manifest.json").read_text())
    if bp["header"]["uuid"]!=old.BP_UUID or rp["header"]["uuid"]!=old.RP_UUID:
        raise UnsafeLab("Unrecognized Hart pack identity")
    if (old.v3(bp["header"]["version"])!=NEW_VERSION or
        old.v3(rp["header"]["version"])!=NEW_VERSION or
        any(old.v3(m["version"])!=NEW_VERSION for m in bp["modules"]+rp["modules"])):
        raise UnsafeLab("Expected 1.5.4 BP/RP header and module versions")
    matching=[d for d in bp["dependencies"] if d.get("uuid")==old.RP_UUID
              and old.v3(d.get("version"))==NEW_VERSION]
    if len(matching)!=1:
        raise UnsafeLab("BP dependency must require matching 1.5.4 RP")
    if not any(d.get("module_name")=="@minecraft/server" and d.get("version")=="2.7.0"
               for d in bp["dependencies"]):
        raise UnsafeLab("Pinned stable native Bedrock API changed")

    now={local:old.hashes(repo/"addon"/local) for local,_,_,_ in PACKS}
    all_now={"%s/%s"%(local,p):digest for local,h in now.items()
             for p,digest in h.items()}
    if set(all_now)!=(set(original)|ADDED_FILES):
        raise UnsafeLab("Unexpected missing/new pack path in 1.5.4 source")
    changed={k for k,d in all_now.items() if k not in original or d!=original[k]}
    if changed!=ALLOWED_CHANGE:
        raise UnsafeLab("Gameplay/asset delta differs from reviewed 1.5.3 -> 1.5.4 change")
    for path,sha in REVIEWED_BLOBS.items():
        data=(repo/"addon"/path).read_bytes()
        if git_blob_id(data)!=sha:
            raise UnsafeLab("Reviewed candidate file changed: "+path)

    # All changed/new files are exact reviewed Git blobs; native physical/Q4
    # writer bodies are separately source-compared to the pinned predecessor.
    main=(repo/"addon/behavior_pack/scripts/main.js").read_text(encoding="utf-8")
    for marker in ('const VERSION = "1.5.4-dev";',
                   'import {createLiveLinkGuard} from "./urce_152_live_link_guard.js";',
                   "liveLinkCheck(col, receiver, true)",
                   'verdict.decision !== "SAFE_SNAPSHOT"',
                   'col.link = prior;',
                   'const dimensionHandleCache = new Map();',
                   'liveLinkCheck(route.collector, receiver)',
                   'liveLinkCheck(collector, receiver)'):
        if marker not in main:raise UnsafeLab("Missing link guard: "+marker)
    for name in ("urce_152_route_model.js","urce_152_native_hopper_witness.js",
                 "urce_152_transporter_bank_probe.js",
                 "urce_152_link_snapshot_gate.js","urce_152_live_link_guard.js"):
        src=(repo/"addon/behavior_pack/scripts"/name).read_text(encoding="utf-8")
        for forbidden in (".setItem(", ".addItem(", ".spawnItem(",
                          ".setDynamicProperty(", ".runInterval("):
            if forbidden in src:
                raise UnsafeLab("New topology control-plane contains cargo writer: "+name)
    guard=(repo/"addon/behavior_pack/scripts/urce_152_live_link_guard.js").read_text(encoding="utf-8")
    for marker in ("NEGATIVE_TTL_TICKS=20","negativeMemo=new Map()",
                   'result.decision==="HOLD"||result.decision==="REJECT"',
                   "if(forceFresh){reset();negativeMemo.clear();}"):
        if marker not in guard:raise UnsafeLab("Missing fail-closed negative-cache rule: "+marker)
    block=json.loads((repo/"addon/behavior_pack/blocks/transporter.json").read_text())["minecraft:block"]
    model=json.loads((repo/"addon/resource_pack/models/blocks/hartlogistics_transporter.geo.json").read_text())["minecraft:geometry"]
    if (block["description"]["identifier"]!="hartsorter:transporter" or
        len(model)!=2 or model[0]["description"]["identifier"]!="geometry.hartlogistics.transporter"):
        raise UnsafeLab("Owner-accepted connected-pipe model changed")
    bones={b["name"]:b["cubes"][0] for b in model[0]["bones"]}
    if (bones["core"]["size"]!=[4,4,4] or
        bones["east"]["origin"]!=[-8,6,-2] or
        bones["west"]["origin"]!=[2,6,-2]):
        raise UnsafeLab("Owner-accepted 4x4 seam geometry changed")
    runtime=(repo/"addon/behavior_pack/scripts/urce_150_readonly_runtime.js").read_text(encoding="utf-8")
    for marker in ("world.afterEvents.playerPlaceBlock",
                   "world.afterEvents.playerBreakBlock",
                   "block.setPermutation(permutation)", "scheduleVisualsNear"):
        if marker not in runtime:raise UnsafeLab("Visual preview behavior changed")
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
            raise UnsafeLab("Only exact 1.5.3 -> 1.5.4 upgrade allowed")
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
        raise UnsafeLab("Rollback requires exactly installed 1.5.4 candidate")
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
            print("1.5.4 SOURCE PASS: exact 1.5.3 predecessor and guarded idle optimizations")
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
            print("Already exactly installed 1.5.4; no write needed.")
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
