"""PG37 read-only Receiver owner-census same-version LAB patch.

Only Bedrock's bounded diagnostics are updated. This is NOT permission
for item movement, migration, authority reactivation or production use.
Preserves existing PG35 new world and all sealed ledger accounts. Requires
exact previous PG36 installed source and stopped LAB; fail closed otherwise.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import re
import subprocess
import sys
import tempfile

import lab_deploy as uce_deploy
import lab_world_switch as pg35
import pg36_lab_patch as pg36

ROOT=uce_deploy.ROOT
lab=uce_deploy.lab
pg08=uce_deploy.pg08
pg33=uce_deploy.pg33
uce=uce_deploy.uce
BASE_SHA="bc8d2bce5bce62cac8e3a03ec3eb99bf113a31eb"
CHANGED_BP={"scripts/main.js"}
DIAGNOSTIC_FILES=(
    "candidates/uce/prepare_candidate.py",
    "candidates/uce/runtime_pipe_route.js",
    "candidates/uce/bulk_assets.py",
    "candidates/uce/assets/entities/uce_native_carrier.json",
    *("candidates/transport/"+name+".mjs" for name in uce.MODULES)
)

def git_object(ref: str,path: str) -> str:
    if ref not in (BASE_SHA,"HEAD"):
        raise lab.UnsafeLab("PG37 unexpected Git ref")
    result=subprocess.run(["git","-C",str(ROOT),"rev-parse",ref+":"+path],
        check=True,text=True,encoding="utf-8",capture_output=True)
    sha=result.stdout.strip()
    if not re.fullmatch(r"[a-f0-9]{40}",sha):
        raise lab.UnsafeLab("PG37 source blob identity unreadable")
    return sha

def prior_bridge() -> str:
    result=subprocess.run(["git","-C",str(ROOT),"show",
        BASE_SHA+":candidates/uce/runtime_bridge.js"],check=True,
        text=True,encoding="utf-8",errors="strict",capture_output=True)
    return result.stdout

def render_pack_pair(folder: Path):
    old=folder/"pg33";current=folder/"current";prior=folder/"prior"
    pg33.prepare(old)
    uce.prepare(current)
    wanted=uce_deploy.check_candidate(current,old)
    for path in DIAGNOSTIC_FILES:
        if git_object("HEAD",path)!=git_object(BASE_SHA,path):
            raise lab.UnsafeLab("PG37 non-diagnostic candidate drift: "+path)
    # The current compiler and source derivatives are the same as PG36.
    # Reconstruct exactly the pinned installed source, not a guessed version.
    import shutil
    shutil.copytree(current,prior)
    base_main=(old/"behavior_pack/scripts/main.js").read_text(encoding="utf-8")
    previous_main=uce.compile_patch(base_main,prior_bridge()+"\n"+
        uce.PIPE_ROUTE.read_text(encoding="utf-8"))
    (prior/"behavior_pack/scripts/main.js").write_text(
        previous_main,encoding="utf-8")
    predecessor={kind:lab.hashes(prior/kind) for kind in
        ("behavior_pack","resource_pack")}
    if (set(predecessor["behavior_pack"])!=set(wanted["behavior_pack"]) or
        set(predecessor["resource_pack"])!=set(wanted["resource_pack"])):
        raise lab.UnsafeLab("PG37 generated pack inventory changed")
    changed={path for path in predecessor["behavior_pack"]
             if predecessor["behavior_pack"][path]!=wanted["behavior_pack"][path]}
    if changed!=CHANGED_BP or predecessor["resource_pack"]!=wanted["resource_pack"]:
        raise lab.UnsafeLab("PG37 non-read-only source change detected")
    return current,prior,wanted,predecessor

def make_plan(root: Path,current: Path,prior: Path,wanted,previous,
              rollback_tag=None):
    originals=pg36.verify_active_pg35(root)
    if rollback_tag is not None and not re.fullmatch(r"lab-[a-f0-9]{12}",rollback_tag):
        raise lab.UnsafeLab("PG37 malformed rollback tag")
    records=lab.discover_plan(ROOT,root)
    if len(records)!=2:raise lab.UnsafeLab("PG37 two-pack LAB layout required")
    backup=root/"_HartLogisticsDeployBackups"/(rollback_tag or "")
    if rollback_tag:
        lab.assert_no_link(backup)
        if not backup.is_dir():
            raise lab.UnsafeLab("PG37 rollback backup missing")
    plan=[]
    for i,record in enumerate(records):
        kind,folder,uuid,registryName=lab.PACKS[i]
        if (record["target"].name!=pg08.EXPECTED_DIRS[i] or
            record["target"].parent.name!=folder or
            record["registry"].parent.name!=pg35.NEW_WORLD or
            record["old_bytes"]!=originals[registryName] or
            pg08.version_in_registry(record["old_bytes"],uuid)!=uce_deploy.NEW_VERSION):
            raise lab.UnsafeLab("PG37 pack or world registration mismatch")
        installed=lab.hashes(record["target"])
        expected=wanted[kind] if rollback_tag else previous[kind]
        if installed!=expected:
            differing=sorted(key for key in (installed.keys()|expected.keys())
                             if installed.get(key)!=expected.get(key))
            raise lab.UnsafeLab("PG37 installed exact predecessor mismatch: "+kind+
                " relative files "+repr(differing[:10]))
        dest=(prior if rollback_tag else current)/kind
        if rollback_tag:
            oldpack=backup/f"pack-{i}"
            oldreg=backup/f"registry-{i}.bin"
            lab.assert_no_link(oldpack);lab.assert_no_link(oldreg)
            if (not oldpack.is_dir() or not oldreg.is_file() or
                lab.hashes(oldpack)!=previous[kind] or
                oldreg.read_bytes()!=originals[registryName]):
                raise lab.UnsafeLab("PG37 backup not exact previous version")
            dest=oldpack
        plan.append({**record,"source":dest,
                     "files":previous[kind] if rollback_tag else wanted[kind],
                     "old_hashes":expected,
                     "new_registry":record["old_bytes"].decode("utf-8-sig")})
    return plan

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode",choices=("plan","check","install","rollback"),
                        default="plan")
    parser.add_argument("--commit",required=True)
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--backup-tag")
    args=parser.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if not re.fullmatch(r"[a-f0-9]{40}",args.commit):
            raise lab.UnsafeLab("PG37 exact current Git pin required")
        if args.apply!=(args.mode in ("install","rollback")):
            raise lab.UnsafeLab("PG37 install/rollback require --apply")
        if args.mode=="rollback" and not args.backup_tag:
            raise lab.UnsafeLab("PG37 rollback needs backup tag")
        if args.mode!="rollback" and args.backup_tag:
            raise lab.UnsafeLab("PG37 backup tag only for rollback")
        lab.assert_clean_git(ROOT,args.commit)
        with tempfile.TemporaryDirectory(prefix="pg37-source-") as tmp:
            current,prior,wanted,previous=render_pack_pair(Path(tmp))
            if args.mode=="plan":
                print("PG37 SOURCE ONLY PASS: exactly one BP diagnostics file changes")
                print("No LAB, production, world or backup accessed")
                return 0
            root=pg08.check_real_root()
            plan=make_plan(root,current,prior,wanted,previous,args.backup_tag)
            for item in plan:
                print("PG37 STOPPED LAB ONLY:",item["target"],
                      "mode:","ROLLBACK" if args.backup_tag else "READONLY-DIAGNOSTIC-PATCH")
            if args.mode=="check":
                print("PG37 READ-ONLY LAB PREFLIGHT PASS; no files changed")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(plan)
            backup=lab.apply_plan(root,plan)
            print("PG37 GUARDED STOPPED LAB COMPLETE; backup:",backup)
            print("No world DB/authority/ledger or original ZIP modifications")
            print("No BDS restart or production approval")
            return 0
    except (lab.UnsafeLab,OSError,UnicodeError,ValueError,KeyError,
            subprocess.CalledProcessError) as err:
        print("PG37 REFUSED:",err,file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
