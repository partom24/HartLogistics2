"""UCE 1.5.16 exact-source, stopped-LAB deployment and rollback.

This source tool NEVER touches production, unrelated add-ons, archived ZIPs
or original 1.4.1. Source-only is default. LAB access requires exact pinned
Git SHA, read-only CheckLab, explicit apply confirmation, and a stopped server.
Uses existing Hart safe deployment and backup/rollback primitives.
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

ROOT=Path(__file__).resolve().parents[2]
OLD_VERSION=(1,5,15)
NEW_VERSION=(1,5,16)
WORLD="ThomasServer"

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

pg33_deploy=load(ROOT/"candidates/pg33/lab_deploy.py","uce_pg33_safe_installer")
uce=load(ROOT/"candidates/uce/prepare_candidate.py","uce_builder")
pg33=pg33_deploy.pg33
pg08=pg33_deploy.pg08
lab=pg33_deploy.lab

BP_MODIFIED={"manifest.json","scripts/main.js"}
RP_MODIFIED={"manifest.json","blocks.json",
             "textures/terrain_texture.json","texts/en_US.lang"}
BP_NEW={"blocks/bulk_storage.json","recipes/bulk_storage.json",
        "entities/uce_native_carrier.json"}|{
            "scripts/uce/"+name+".js" for name in uce.MODULES}
RP_NEW={"models/blocks/bulk_storage.geo.json",
        "textures/blocks/hartlogistics_bulk_storage.png"}

def check_candidate(generated,old):
    bp=json.loads((generated/"behavior_pack/manifest.json").read_text())
    rp=json.loads((generated/"resource_pack/manifest.json").read_text())
    if bp["header"]["uuid"]!=lab.BP_UUID or rp["header"]["uuid"]!=lab.RP_UUID:
        raise lab.UnsafeLab("UCE pack identity changed")
    if (lab.v3(bp["header"]["version"])!=NEW_VERSION or
        lab.v3(rp["header"]["version"])!=NEW_VERSION):
        raise lab.UnsafeLab("UCE requires exact 1.5.16 manifests")
    for k in ("behavior_pack","resource_pack"):
        manifest=json.loads((generated/k/"manifest.json").read_text())
        if any(lab.v3(m["version"])!=NEW_VERSION
               for m in manifest["modules"]):
            raise lab.UnsafeLab("UCE module versions changed")
    if not any(d.get("uuid")==lab.RP_UUID and
               lab.v3(d.get("version",()))==NEW_VERSION
               for d in bp.get("dependencies",[])):
        raise lab.UnsafeLab("UCE resource dependency changed")
    for name,version in (("@minecraft/server","2.7.0"),
                         ("@minecraft/server-ui","2.2.0")):
        if not any(d.get("module_name")==name and
                   d.get("version")==version
                   for d in bp.get("dependencies",[])):
            raise lab.UnsafeLab("UCE Script API experiment/dependency drift")
    compiled=(generated/"behavior_pack/scripts/main.js").read_text()
    for marker in (
        'const VERSION = "1.5.16-DEV-UCE";',
        "function uceUnifiedServiceTick(){",
        "function uceUnifiedJournalHold(){",
        "function uceProcessEjectedItemEntity(",
        "function uceSorterDirectServiceTick(",
        "function uceActivateEmptyLabWorld(",
        "function uceUseReceiverLinkOrStatus(",
        "function uceOrdinaryAccountSource(",
        "function ucePipeRouteNetwork(",
        "function uceNativeReceiptId(",
        "if (uceLegacyWriterBlocked()) { uceUnifiedServiceTick(); return; }",
        "UCE_LEGACY_WORLD_WRITER_FENCED",
        "hartlogistics:activate_empty_lab",
        "hartlogistics:migration_preview"
    ):
        if marker not in compiled:
            raise lab.UnsafeLab("UCE missing integrated safety route: "+marker)
    if compiled.count("function logisticsTick() {")!=1:
        raise lab.UnsafeLab("UCE introduced another scheduler")
    result={}
    for kind,modified,added in (
        ("behavior_pack",BP_MODIFIED,BP_NEW),
        ("resource_pack",RP_MODIFIED,RP_NEW)
    ):
        old_files=lab.hashes(old/kind)
        generated_files=lab.hashes(generated/kind)
        if set(generated_files)!=(set(old_files)|added):
            raise lab.UnsafeLab("UCE unexpected pack file addition/removal "+kind)
        for path,digest in old_files.items():
            if path not in modified and generated_files.get(path)!=digest:
                raise lab.UnsafeLab("UCE original pack asset changed "+kind+"/"+path)
        if any(generated_files[p]==old_files[p]
               for p in modified):
            # Manifest/script/settings changes are deliberate, not omissions.
            raise lab.UnsafeLab("UCE required replacement unexpectedly unchanged")
        result[kind]=generated_files
    return result

def create_plan(root,generated,old):
    wanted=check_candidate(generated,old)
    expectedOld=pg33_deploy.check_candidate(old)
    entries=lab.discover_plan(ROOT,root)
    if len(entries)!=2:raise lab.UnsafeLab("UCE expected two LAB Hart packs")
    result=[]
    for i,item in enumerate(entries):
        kind,folder,pack_id,_=lab.PACKS[i]
        if (item["target"].name!=pg08.EXPECTED_DIRS[i] or
            item["target"].parent.name!=folder or
            item["registry"].parent.name!=WORLD):
            raise lab.UnsafeLab("UCE wrong LAB world or pack location")
        actual=json.loads((item["target"]/"manifest.json").read_text())
        if (lab.v3(actual["header"]["version"])!=OLD_VERSION or
            pg08.version_in_registry(item["old_bytes"],pack_id)!=OLD_VERSION or
            lab.hashes(item["target"])!=expectedOld[kind]):
            raise lab.UnsafeLab("UCE LAB installed PG33 source/hash mismatch")
        result.append({**item,"source":generated/kind,"files":wanted[kind],
            "old_hashes":expectedOld[kind],
            "new_registry":lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"),pack_id,NEW_VERSION)})
    return result

def rollback_plan(root,generated,old,tag):
    if not re.fullmatch(r"lab-[0-9a-f]{12}",tag):
        raise lab.UnsafeLab("UCE invalid backup tag")
    backup=root/"_HartLogisticsDeployBackups"/tag
    lab.assert_no_link(backup)
    if not backup.is_dir():raise lab.UnsafeLab("UCE LAB backup absent")
    current=lab.discover_plan(ROOT,root)
    wanted=check_candidate(generated,old)
    previous=pg33_deploy.check_candidate(old)
    if len(current)!=2:raise lab.UnsafeLab("UCE expected two LAB packs")
    entries=[]
    for i,item in enumerate(current):
        kind,folder,pack_id,_=lab.PACKS[i]
        if (item["target"].name!=pg08.EXPECTED_DIRS[i] or
            item["target"].parent.name!=folder or
            item["registry"].parent.name!=WORLD):
            raise lab.UnsafeLab("UCE rollback wrong LAB target")
        if (lab.hashes(item["target"])!=wanted[kind] or
            pg08.version_in_registry(item["old_bytes"],pack_id)!=NEW_VERSION):
            raise lab.UnsafeLab("UCE installed pack/registry changed")
        oldpack=backup/f"pack-{i}"
        oldreg=backup/f"registry-{i}.bin"
        lab.assert_no_link(oldpack)
        lab.assert_no_link(oldreg)
        if (not oldpack.is_dir() or not oldreg.is_file() or
            lab.hashes(oldpack)!=previous[kind] or
            pg08.version_in_registry(oldreg.read_bytes(),pack_id)!=OLD_VERSION):
            raise lab.UnsafeLab("UCE backup not exact prior PG33")
        entries.append({**item,"source":oldpack,"files":previous[kind],
            "old_hashes":wanted[kind],
            "new_registry":lab.patch_registration(
                item["old_bytes"].decode("utf-8-sig"),pack_id,OLD_VERSION)})
    return entries

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit",help="pinned exact 40-character Git SHA")
    parser.add_argument("--check-lab",action="store_true")
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--confirm-lab-only",action="store_true")
    parser.add_argument("--rollback-tag")
    args=parser.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if args.apply and not (args.check_lab and args.confirm_lab_only):
            raise lab.UnsafeLab("UCE apply requires explicit stopped-LAB confirmation")
        if args.check_lab and not args.commit:
            raise lab.UnsafeLab("UCE real LAB access requires exact Git pin")
        if args.rollback_tag and not args.check_lab:
            raise lab.UnsafeLab("UCE rollback requires LAB preflight")
        if args.commit:lab.assert_clean_git(ROOT,args.commit)
        pg33.pg27.pg26.pg25.pg24.pg23.pg20.pg08.check_baseline()
        with tempfile.TemporaryDirectory(prefix="uce-source-lab-") as temp:
            new,old=Path(temp)/"uce",Path(temp)/"pg33"
            uce.prepare(new)
            pg33.prepare(old)
            hashes=check_candidate(new,old)
            pg33_deploy.check_candidate(old)
            if not args.check_lab:
                print("UCE SOURCE ONLY: original Hart 1.4.1 and all archives untouched")
                print("BP/RP:",len(hashes["behavior_pack"]),
                      len(hashes["resource_pack"]))
                print("No LAB, production or world accessed")
                return 0
            root=pg08.check_real_root()
            planned=(rollback_plan(root,new,old,args.rollback_tag)
                     if args.rollback_tag else create_plan(root,new,old))
            for item in planned:
                print("AUTHORIZED LAB ONLY:",item["target"],
                      "mode:","ROLLBACK" if args.rollback_tag else "INSTALL")
            if not args.apply:
                print("UCE READ-ONLY LAB PREFLIGHT; no files changed")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(planned)
            backup=lab.apply_plan(root,planned)
            print("UCE guarded stopped-LAB operation complete; backup:",backup)
            print("No BDS restart, no world/ZIP data cleared, no production approval")
            return 0
    except (lab.UnsafeLab,OSError,ValueError,KeyError,
            subprocess.CalledProcessError) as err:
        print("UCE REFUSED:",err,file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
