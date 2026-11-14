"""PG36 exact-base stopped-LAB same-version UCE patch (never production).

The owner has activated a fresh PG35 world and placed sealed UCE Receivers.
The normal UCE installer intentionally only upgrades PG33 on ThomasServer;
it must NOT be reused with a bypass or manual file replacement.

This patch requires exact bytes of the *previous* generated UCE pack and
the PG35 two-boot world-selection record; only the two changed BP JavaScript
files are permitted to differ in the new source. No world DB, old Q4 state,
other add-on, experiments, or world registrations are rewritten knowingly.
The existing atomic two-pack staging/backup/rollback engine is reused.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

import lab_deploy as uce_deploy
import lab_world_switch as pg35

lab=uce_deploy.lab
pg08=uce_deploy.pg08
pg33=uce_deploy.pg33
uce=uce_deploy.uce
ROOT=uce_deploy.ROOT
PG35_PIN="6e02f29b168caecff5d379795fcd9b5b714ab0be"
BYPASS_DENY="PG36 original 1.4.1 and historical Q4 data untouched"
CHANGED_BP={"scripts/main.js","scripts/uce/unified_link_registry.js"}

def historical(path: str) -> str:
    if path not in {
        "candidates/uce/runtime_bridge.js",
        "candidates/transport/unified_link_registry.mjs",
        "candidates/uce/prepare_candidate.py",
        "candidates/uce/runtime_pipe_route.js"
    }:
        raise lab.UnsafeLab("PG36 unexpected historic source path")
    result=subprocess.run(
        ["git","-C",str(ROOT),"show",PG35_PIN+":"+path],
        check=True,text=True,encoding="utf-8",errors="strict",
        capture_output=True)
    return result.stdout

def blob_identity(revision: str, path: str) -> str:
    if revision not in ("HEAD", PG35_PIN):
        raise lab.UnsafeLab("PG36 unexpected Git revision")
    result=subprocess.run(
        ["git","-C",str(ROOT),"rev-parse",revision+":"+path],
        check=True,text=True,capture_output=True)
    value=result.stdout.strip()
    if not re.fullmatch(r"[0-9a-f]{40}",value):
        raise lab.UnsafeLab("PG36 source blob identity unreadable")
    return value

def render_pack_pair(folder: Path):
    """Recreate prior and fixed exact candidates, without touching LAB."""
    old=folder/"pg33";current=folder/"fixed";prior=folder/"pg35"
    pg33.prepare(old)
    uce.prepare(current)
    wanted=uce_deploy.check_candidate(current,old)
    # Every other source derivative must be identical to the PG35 pin:
    # an independent intervening change is a new delivery and needs review.
    for path in ("candidates/uce/prepare_candidate.py",
                 "candidates/uce/runtime_pipe_route.js"):
        if blob_identity("HEAD",path)!=blob_identity(PG35_PIN,path):
            raise lab.UnsafeLab("PG36 base builder/route changed since PG35")
    shutil.copytree(current,prior)
    baseline=(old/"behavior_pack/scripts/main.js").read_text(encoding="utf-8")
    bridge=historical("candidates/uce/runtime_bridge.js")
    previous_script=uce.compile_patch(
        baseline,bridge+"\n"+uce.PIPE_ROUTE.read_text(encoding="utf-8"))
    (prior/"behavior_pack/scripts/main.js").write_text(
        previous_script,encoding="utf-8")
    link=historical("candidates/transport/unified_link_registry.mjs")
    link=link.replace(".mjs'",".js'").replace('.mjs"','.js"')
    (prior/"behavior_pack/scripts/uce/unified_link_registry.js").write_text(
        link,encoding="utf-8")
    earlier={kind:lab.hashes(prior/kind) for kind in
             ("behavior_pack","resource_pack")}
    if (set(earlier["behavior_pack"])!=set(wanted["behavior_pack"]) or
        set(earlier["resource_pack"])!=set(wanted["resource_pack"])):
        raise lab.UnsafeLab("PG36 unexpected prior pack file set")
    changed={k for k in earlier["behavior_pack"] if
             earlier["behavior_pack"][k]!=wanted["behavior_pack"][k]}
    if changed!=CHANGED_BP or earlier["resource_pack"]!=wanted["resource_pack"]:
        raise lab.UnsafeLab("PG36 unexpected generated file changes")
    return current,prior,wanted,earlier

def verify_active_pg35(root: Path):
    lab.assert_no_link(root)
    _, original,_=pg35.verify_switch(root,PG35_PIN)
    new= root/"worlds"/pg35.NEW_WORLD
    lab.assert_no_link(new)
    if not (new/"level.dat").is_file():
        raise lab.UnsafeLab("PG36 new world missing")
    db=new/"db"
    lab.assert_no_link(db)
    if not db.is_dir() or not any(db.iterdir()):
        raise lab.UnsafeLab("PG36 new world has no LevelDB")
    for name,raw in original.items():
        actual=new/name
        lab.assert_no_link(actual)
        if not actual.is_file() or actual.read_bytes()!=raw:
            raise lab.UnsafeLab("PG36 new world registration drift: "+name)
    return original

def make_plan(root: Path, generated: Path, prior: Path, desired, earlier,
              rollback_tag=None):
    originals=verify_active_pg35(root)
    if rollback_tag is not None and not re.fullmatch(r"lab-[a-f0-9]{12}",rollback_tag):
        raise lab.UnsafeLab("PG36 rollback requires exact backup tag")
    records=lab.discover_plan(ROOT,root)
    if len(records)!=2:
        raise lab.UnsafeLab("PG36 missing exactly two Hart pack registrations")
    backup=root/"_HartLogisticsDeployBackups"/(rollback_tag or "")
    if rollback_tag:
        lab.assert_no_link(backup)
        if not backup.is_dir():
            raise lab.UnsafeLab("PG36 rollback backup missing")
    plan=[]
    for i,record in enumerate(records):
        kind,folder,pack_uuid,regname=lab.PACKS[i]
        if (record["target"].name!=pg08.EXPECTED_DIRS[i] or
            record["target"].parent.name!=folder or
            record["registry"].parent.name!=pg35.NEW_WORLD or
            record["old_bytes"]!=originals[regname] or
            pg08.version_in_registry(record["old_bytes"],pack_uuid)!=uce_deploy.NEW_VERSION):
            raise lab.UnsafeLab("PG36 wrong LAB pack/world/registration")
        expected=desired[kind] if rollback_tag else earlier[kind]
        actual=lab.hashes(record["target"])
        if actual!=expected:
            # Read-only, privacy-safe diagnostics: relative filenames only,
            # not item contents or world data. Never weaken the hash refusal.
            differing=sorted(k for k in (actual.keys()|expected.keys())
                             if actual.get(k)!=expected.get(k))
            raise lab.UnsafeLab("PG36 installed UCE hash mismatch: "+kind+
                "; differing relative files: "+repr(differing[:12])+
                (" (+more)" if len(differing)>12 else ""))
        dest=prior/kind if rollback_tag else generated/kind
        if rollback_tag:
            backed=backup/f"pack-{i}"
            oldreg=backup/f"registry-{i}.bin"
            lab.assert_no_link(backed);lab.assert_no_link(oldreg)
            if (not backed.is_dir() or not oldreg.is_file() or
                lab.hashes(backed)!=earlier[kind] or
                oldreg.read_bytes()!=originals[regname]):
                raise lab.UnsafeLab("PG36 rollback backup not original UCE")
            dest=backed
        plan.append({**record,"source":dest,
                     "files":earlier[kind] if rollback_tag else desired[kind],
                     "old_hashes":expected,
                     # Preserve exact new-world registration bytes; same version.
                     "new_registry":record["old_bytes"].decode("utf-8-sig")})
    return plan

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--mode",choices=("plan","check","install","rollback"),
                   default="plan")
    p.add_argument("--commit",required=True)
    p.add_argument("--apply",action="store_true")
    p.add_argument("--backup-tag")
    args=p.parse_args(argv)
    try:
        lab.assert_lab_name(lab.LAB)
        if not re.fullmatch(r"[0-9a-f]{40}",args.commit):
            raise lab.UnsafeLab("PG36 exact current commit required")
        if args.apply!=(args.mode in ("install","rollback")):
            raise lab.UnsafeLab("PG36 only install/rollback may use --apply")
        if args.mode=="rollback" and not args.backup_tag:
            raise lab.UnsafeLab("PG36 rollback needs exact backup tag")
        if args.mode!="rollback" and args.backup_tag:
            raise lab.UnsafeLab("PG36 backup tag only for rollback")
        lab.assert_clean_git(ROOT,args.commit)
        with tempfile.TemporaryDirectory(prefix="pg36-source-") as tmp:
            generated,prior,desired,earlier=render_pack_pair(Path(tmp))
            if args.mode=="plan":
                print("PG36 SOURCE PASS: generated old and new UCE packs")
                print("Only changed behavior files:",sorted(CHANGED_BP))
                print("No LAB, BDS world or production data accessed")
                return 0
            root=pg08.check_real_root()
            records=make_plan(root,generated,prior,desired,earlier,
                              args.backup_tag)
            for record in records:
                print("PG36 STOPPED LAB ONLY:",record["target"],
                      "mode:","ROLLBACK" if args.backup_tag else "PATCH")
            if args.mode=="check":
                print("PG36 LAB PREFLIGHT PASS: read-only; no files changed")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(records)
            backup=lab.apply_plan(root,records)
            print("PG36 GUARDED LAB OPERATION COMPLETE; backup:",backup)
            print(BYPASS_DENY)
            print("No BDS restart, release approval or production access")
            return 0
    except (lab.UnsafeLab,OSError,UnicodeError,ValueError,KeyError,
            subprocess.CalledProcessError) as err:
        print("PG36 REFUSED:",str(err),file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
