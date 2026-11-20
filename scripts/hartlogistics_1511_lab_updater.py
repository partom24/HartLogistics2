#!/usr/bin/env python3
"""Guarded exact installed 1.5.10 -> 1.5.11 terminal Hopper chest LAB upgrade.

The owner's copied LAB 1.5.10 pack was installed from exact Git source
53205e650f6da8e6cd34c6d69f3934ffb73281bc through its stopped preflight.
This upgrade allows ONLY that one
byte-for-byte BP+RP source predecessor, and preserves the original Q4 writer,
world, registry identities and the unrelated production server. No clone,
world reset, auto-restart or destructive recovery is performed.
"""
from __future__ import annotations
import argparse
from functools import lru_cache
import hashlib
import importlib.util
import json
import ntpath
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hart_1511_installer_engine",
                                              ROOT/"scripts/hartlogistics_150_lab_updater.py")
old=importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
UnsafeLab=old.UnsafeLab
LAB=old.LAB
PACKS=old.PACKS
NEW_VERSION=(1,5,11)
OLD_VERSION=(1,5,10)
PINNED_1510="53205e650f6da8e6cd34c6d69f3934ffb73281bc"
ALLOWED_CHANGED={
    "behavior_pack/manifest.json",
    "resource_pack/manifest.json",
    "behavior_pack/scripts/main.js",
    "behavior_pack/scripts/urce_159_direct_sorter_home.js"
}
REVIEWED_BLOBS={
    "behavior_pack/manifest.json":"c813576987fbee8899cd1310b7342ba02af5ad52",
    "resource_pack/manifest.json":"6cc2bb06cf32d361dddf47aaac0fc83d0769893d",
    "behavior_pack/scripts/main.js":"3d3a57b8b09680d9efee7469b7b35f24bbbe4265",
    "behavior_pack/scripts/urce_159_direct_sorter_home.js":"5f62a1da38393efe3ed9d882aeddefb94b819678"
}

def git_blob(data:bytes)->str:
    return hashlib.sha1(("blob "+str(len(data))+"\0").encode("ascii")+data).hexdigest()

@lru_cache(maxsize=4)
def original_hashes(repo=ROOT,commit=PINNED_1510):
    """Only immutable reviewed 1.5.10 Git objects are cached, never LAB state."""
    if commit!=PINNED_1510:raise UnsafeLab("Unapproved 1.5.10 predecessor")
    cmd=["git","-C",str(repo)]
    entries=subprocess.run(
        [*cmd,"ls-tree","-r","--name-only",commit,
         "addon/behavior_pack","addon/resource_pack"],
        capture_output=True,text=True,check=True
    ).stdout.splitlines()
    original={}
    for entry in entries:
        if not entry.startswith(("addon/behavior_pack/","addon/resource_pack/")):
            raise UnsafeLab("Invalid historic pack path")
        data=subprocess.run([*cmd,"show",commit+":"+entry],
                            capture_output=True,check=True).stdout
        original[entry[len("addon/"):]]=hashlib.sha256(data).hexdigest()
    if len(original)!=92:
        raise UnsafeLab("Incomplete exact installed 1.5.10 predecessor source")
    return original

def pack_version(doc):
    return old.v3(doc["header"]["version"])

def source_packs(repo=ROOT):
    return {local:old.hashes(repo/"addon"/local) for local,_,_,_ in PACKS}

def flattened(packs):
    return {local+"/"+name:digest
            for local,tree in packs.items() for name,digest in tree.items()}

def from_flat(flat):
    return {local:{full[len(local)+1:]:digest
                   for full,digest in flat.items()
                   if full.startswith(local+"/")}
            for local,_,_,_ in PACKS}

def validate_source(repo=ROOT,original=None):
    if original is None:original=original_hashes(repo)
    bp=json.loads((repo/"addon/behavior_pack/manifest.json").read_text())
    rp=json.loads((repo/"addon/resource_pack/manifest.json").read_text())
    if bp["header"]["uuid"]!=old.BP_UUID or rp["header"]["uuid"]!=old.RP_UUID:
        raise UnsafeLab("Pack UUID changed")
    if (pack_version(bp)!=NEW_VERSION or pack_version(rp)!=NEW_VERSION or
        any(old.v3(mod["version"])!=NEW_VERSION
            for mod in bp["modules"]+rp["modules"])):
        raise UnsafeLab("Expected 1.5.11 BP/RP header/module versions")
    if not any(dep.get("uuid")==old.RP_UUID and
               old.v3(dep["version"])==NEW_VERSION
               for dep in bp["dependencies"]):
        raise UnsafeLab("BP dependency on exact matching 1.5.11 RP missing")
    if not any(dep.get("module_name")=="@minecraft/server" and
               dep.get("version")=="2.7.0"
               for dep in bp["dependencies"]):
        raise UnsafeLab("Native Bedrock Script API dependency changed")
    now=source_packs(repo)
    flat=flattened(now)
    if set(flat)!=set(original):
        raise UnsafeLab("Unexpected 1.5.11 pack file set")
    changed={name for name in flat if flat[name]!=original[name]}
    if changed!=ALLOWED_CHANGED:
        raise UnsafeLab("Unreviewed 1.5.11 pack delta: "+repr(sorted(changed^ALLOWED_CHANGED)))
    for name,blob in REVIEWED_BLOBS.items():
        if git_blob((repo/"addon"/name).read_bytes())!=blob:
            raise UnsafeLab("Reviewed 1.5.11 pack byte drift: "+name)
    main=(repo/"addon/behavior_pack/scripts/main.js").read_text()
    direct=(repo/"addon/behavior_pack/scripts/urce_159_direct_sorter_home.js").read_text()
    for token in ('const VERSION = "1.5.11-dev";',
                  'routeKind:"DIRECT_NATIVE_SORTER"',
                  'if(directClosed)continue;',
                  'saveQueueJournal(tx);',
                  'outputTarget.container.setItem(tx.dstSlot, moved);',
                  'persistQueueMeta(receiver, q, metaAfter);',
                  'outputTarget=home.output;',
                  'exactDirectBoundary(observed,outlet)'):
        if token not in main:raise UnsafeLab("Q4 custody integration changed: "+token)
    for token in ("native_terminal_extractor_present",
                  "native_terminal_inventory_unavailable",
                  "directToClaimedHome:!!nativeTerminal",
                  "storage_hopper_extractor_present",
                  'near.typeId.startsWith("minecraft:")'):
        if token not in direct:raise UnsafeLab("Directional side proof missing: "+token)
    for forbidden in (".setItem(", ".addItem(", ".spawnItem(",
                      ".setDynamicProperty(", ".runInterval("):
        if forbidden in direct:
            raise UnsafeLab("Directional observer contains custody writer: "+forbidden)
    return now

def describe_drift(local,version,actual,expected):
    missing=sorted(set(expected)-set(actual))
    extra=sorted(set(actual)-set(expected))
    modified=sorted(p for p in expected.keys()&actual.keys()
                    if expected[p]!=actual[p])
    rows=["Installed "+local+" does not match immutable "+str(version),
          "READ-ONLY PACK DIFFERENCES: missing="+str(len(missing))+
          " unexpected="+str(len(extra))+" modified="+str(len(modified))]
    for label,paths in (("MISSING",missing),("UNEXPECTED",extra),("MODIFIED",modified)):
        for p in paths[:20]:
            rows.append("  "+label+" "+p+
                        (" expected_sha256="+expected[p] if p in expected else "")+
                        (" installed_sha256="+actual[p] if p in actual else ""))
        if len(paths)>20:rows.append("  "+label+" ... more mismatches")
    rows.append("NO LAB FILES CHANGED. Do not bypass this refusal.")
    return "\n".join(rows)

def read_live_plan(repo,root,original=None):
    if original is None:original=original_hashes(repo)
    current=validate_source(repo,original)
    older=from_flat(original)
    props=root/"server.properties"
    if not (root/"bedrock_server.exe").is_file() or not props.is_file():
        raise UnsafeLab("Not an authorized Bedrock LAB")
    levels=[line.partition("=")[2].strip() for line in
            props.read_text(encoding="utf-8-sig").splitlines()
            if line.strip().startswith("level-name=")]
    if len(levels)!=1 or not levels[0] or any(c in levels[0] for c in "/\\") or levels[0] in (".",".."):
        raise UnsafeLab("LAB world path invalid")
    world=root/"worlds"/levels[0]
    if not world.is_dir():raise UnsafeLab("LAB world not found")
    result=[]
    for local,folder,pack_id,reg_name in PACKS:
        installed_root=root/folder
        if not installed_root.is_dir():raise UnsafeLab("Installed pack folder missing")
        matches=[]
        for path in installed_root.iterdir():
            if path.is_symlink():raise UnsafeLab("Junction inside installed pack root")
            if not path.is_dir() or not (path/"manifest.json").is_file():continue
            try:doc=json.loads((path/"manifest.json").read_text(encoding="utf-8-sig"))
            except ValueError:continue
            if doc.get("header",{}).get("uuid")==pack_id:matches.append(path)
        if len(matches)!=1:raise UnsafeLab("Expected exactly one installed Hart pack")
        target=matches[0]
        old.assert_no_link(target)
        doc=json.loads((target/"manifest.json").read_text(encoding="utf-8-sig"))
        version=pack_version(doc)
        if version not in (OLD_VERSION,NEW_VERSION):
            raise UnsafeLab("Only exact installed 1.5.10 or already installed 1.5.11 permitted")
        actual=old.hashes(target)
        expected=current[local] if version==NEW_VERSION else older[local]
        if actual!=expected:
            raise UnsafeLab(describe_drift(local,version,actual,expected))
        registry=world/reg_name
        old.assert_no_link(registry)
        if not registry.is_file():raise UnsafeLab("Missing active LAB world pack registry")
        raw=registry.read_bytes()
        entries=json.loads(old.remove_jsonc(raw.decode("utf-8-sig")))
        found=[entry for entry in entries if isinstance(entry,dict) and
               str(entry.get("pack_id","")).casefold()==pack_id.casefold()]
        if len(found)!=1 or old.v3(found[0].get("version"))!=version:
            raise UnsafeLab("LAB registry doesn't match installed "+local)
        result.append({"source":repo/"addon"/local,"target":target,
                       "registry":registry,
                       "new_registry":old.patch_registration(
                           raw.decode("utf-8-sig"),pack_id,NEW_VERSION),
                       "old_bytes":raw,"installed":actual,
                       "files":current[local],"version":version,"local":local})
    if len({entry["version"] for entry in result})!=1:
        raise UnsafeLab("Mixed installed 1.5.10/1.5.11 BP/RP")
    return result

def rollback_plan(repo,root,tag,original=None):
    if not re.fullmatch(r"lab-[0-9a-f]{12}",tag):
        raise UnsafeLab("Rollback requires the exact install backup tag")
    if original is None:original=original_hashes(repo)
    current=read_live_plan(repo,root,original)
    if current[0]["version"]!=NEW_VERSION:
        raise UnsafeLab("Rollback requires exactly installed 1.5.11")
    backups=root/"_HartLogisticsDeployBackups"/tag
    old.assert_no_link(backups)
    if not backups.is_dir():raise UnsafeLab("Prior LAB backup tag not found")
    older=from_flat(original)
    planned=[]
    for i,entry in enumerate(current):
        saved=backups/("pack-"+str(i))
        rawfile=backups/("registry-"+str(i)+".bin")
        old.assert_no_link(saved);old.assert_no_link(rawfile)
        if not saved.is_dir() or not rawfile.is_file():
            raise UnsafeLab("Incomplete backup")
        doc=json.loads((saved/"manifest.json").read_text(encoding="utf-8-sig"))
        if pack_version(doc)!=OLD_VERSION or old.hashes(saved)!=older[entry["local"]]:
            raise UnsafeLab("Unknown or altered 1.5.10 backup")
        raw=rawfile.read_bytes()
        reg=json.loads(old.remove_jsonc(raw.decode("utf-8-sig")))
        matching=[v for v in reg if isinstance(v,dict) and
                  str(v.get("pack_id","")).casefold()==PACKS[i][2].casefold()]
        if len(matching)!=1 or old.v3(matching[0].get("version"))!=OLD_VERSION:
            raise UnsafeLab("Previous backup registry mismatch")
        after=old.patch_registration(raw.decode("utf-8-sig"),
                                     PACKS[i][2],NEW_VERSION)
        bom=b"\xef\xbb\xbf" if raw.startswith(b"\xef\xbb\xbf") else b""
        if bom+after.encode("utf-8")!=entry["old_bytes"]:
            raise UnsafeLab("Unrelated world pack registration drift")
        planned.append({**entry,"source":saved,
                        "files":older[entry["local"]],
                        "new_registry":raw.decode("utf-8-sig")})
    return planned

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server-root",default=LAB)
    parser.add_argument("--commit",help="Exact reviewed Git HEAD SHA")
    parser.add_argument("--check-lab",action="store_true")
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--confirm-lab-only",action="store_true")
    parser.add_argument("--rollback-tag")
    a=parser.parse_args(argv)
    try:
        old.assert_lab_name(a.server_root)
        if a.commit:old.assert_clean_git(ROOT,a.commit)
        if a.apply and not(a.commit and a.check_lab and a.confirm_lab_only):
            raise UnsafeLab("Apply requires --commit --check-lab --confirm-lab-only")
        if a.rollback_tag and not(a.apply and a.check_lab and a.commit):
            raise UnsafeLab("Rollback needs verified commit, exact tag and explicit apply")
        if a.check_lab and not a.commit:
            raise UnsafeLab("Read-only LAB CheckLab needs pinned full source commit")
        original=original_hashes(ROOT)
        source=validate_source(ROOT,original)
        if not a.check_lab:
            print("1.5.11 SOURCE PASS: one immutable 1.5.10 installed predecessor; native directional neighbor repair")
            print("New BP files:",len(source["behavior_pack"]),"RP files:",len(source["resource_pack"]))
            print("NO MINECRAFT SERVER FILES ACCESSED.")
            return 0
        if os.name!="nt":raise UnsafeLab("Actual LAB access requires Windows")
        root=Path(a.server_root)
        old.assert_no_link(root)
        if ntpath.normcase(str(root.resolve(strict=True)))!=ntpath.normcase(LAB):
            raise UnsafeLab("Unauthorized LAB path")
        old.assert_server_stopped()
        plan=rollback_plan(ROOT,root,a.rollback_tag,original) if a.rollback_tag else read_live_plan(ROOT,root,original)
        for entry in plan:
            print("LAB","ROLLBACK" if a.rollback_tag else "UPGRADE",
                  entry["target"],"registry:",entry["registry"])
        if not a.rollback_tag and all(
            entry["version"]==NEW_VERSION and
            entry["installed"]==entry["files"] and
            entry["old_bytes"].decode("utf-8-sig")==entry["new_registry"]
            for entry in plan):
            print("Already exactly installed 1.5.11; no writes.")
            return 0
        if not a.apply:
            print("LAB READ-ONLY PREFLIGHT PASS; no files changed.")
            return 0
        old.assert_server_stopped()
        second=rollback_plan(ROOT,root,a.rollback_tag,original) if a.rollback_tag else read_live_plan(ROOT,root,original)
        for before,after in zip(plan,second):
            if (before["installed"]!=after["installed"] or
                before["old_bytes"]!=after["old_bytes"] or
                before["files"]!=after["files"]):
                raise UnsafeLab("LAB changed during preflight")
        backup=old.apply_plan(root,second)
        print("LAB","ROLLBACK" if a.rollback_tag else "UPGRADE",
              "COMPLETE; backup:",backup)
        print("No world reset, BDS restart or production mutation. Keep all backup tags.")
        return 0
    except (UnsafeLab,OSError,ValueError,KeyError,subprocess.CalledProcessError) as exc:
        print("REFUSED:",exc,file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
