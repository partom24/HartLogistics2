"""PG42 fresh-world-only native carrier probe pack, exact PG41 predecessor.

Only scripts/main.js gains the tagged PG42 runtime probe. The existing PG40
FORENSIC HOLD is byte-identical. A fresh BDS-generated, registered PG42 world
must be selected before installing; the PG35 world and its unresolved
RESERVED carrier are not a supported target. The test probe is removed by
a guarded same-version rollback BEFORE restoring PG35 as the active world.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

import pg42_world_switch as switch

pg41=switch.pg41
lab=switch.lab
pg08=switch.pg08
ROOT=switch.ROOT
CHANGED_BP={"scripts/main.js"}
PROBE=ROOT/"candidates/uce/pg42_probe.js"


def render_pack_pair(folder: Path):
    previous,_,_,_=pg41.render_pack_pair(folder/"pg41-historical")
    current=folder/"pg42-probe"
    shutil.copytree(previous,current)
    base=current/"behavior_pack/scripts/main.js"
    prior=base.read_text(encoding="utf-8")
    source=PROBE.read_text(encoding="utf-8")
    if (source.count("// TEMP_TEST:PG42-CARRIER")!=1 or
        source.count("hartlogistics:pg42_spawn")!=1 or
        source.count("hartlogistics:pg42_audit")!=1):
        raise lab.UnsafeLab("PG42 probe tag or commands invalid")
    if "PG40 FORENSIC HOLD" not in prior or "UCE_PG40_FORENSIC_FREEZE" not in prior:
        raise lab.UnsafeLab("PG42 immutable forensic HOLD missing")
    if ("PG42" in prior or "pg42_" in prior or "TEMP_TEST:PG42" in prior):
        raise lab.UnsafeLab("PG42 test probe already in predecessor")
    base.write_text(prior.rstrip()+"\n\n"+source,encoding="utf-8")
    old=folder/"pg41-historical/frozen/pg33"
    wanted=pg41.uce_deploy.check_candidate(current,old)
    before=pg41.uce_deploy.check_candidate(previous,old)
    changed={path for path in wanted["behavior_pack"]
             if wanted["behavior_pack"][path]!=before["behavior_pack"][path]}
    if (changed!=CHANGED_BP or
        wanted["resource_pack"]!=before["resource_pack"] or
        set(wanted["behavior_pack"])!=set(before["behavior_pack"])):
        raise lab.UnsafeLab("PG42 non-probe source or asset drift")
    return current,previous,wanted,before


def make_plan(root: Path,current: Path,previous: Path,wanted,before,
              commit: str,backup_tag=None):
    switch.verify_bound(root,commit)
    if backup_tag is not None and not re.fullmatch(r"lab-[a-f0-9]{12}",backup_tag):
        raise lab.UnsafeLab("PG42 rollback tag malformed")
    records=lab.discover_plan(ROOT,root)
    if len(records)!=2:
        raise lab.UnsafeLab("PG42 expected two Hart pack records")
    backup=root/"_HartLogisticsDeployBackups"/(backup_tag or "")
    if backup_tag:
        lab.assert_no_link(backup)
        if not backup.is_dir():
            raise lab.UnsafeLab("PG42 rollback backup missing")
    plan=[]
    for i,item in enumerate(records):
        kind,folder,pack_id,_=lab.PACKS[i]
        if (item["target"].name!=pg08.EXPECTED_DIRS[i] or
            item["registry"].parent.name!=switch.NEW_WORLD or
            pg08.version_in_registry(item["old_bytes"],pack_id)!=
              pg41.uce_deploy.NEW_VERSION):
            raise lab.UnsafeLab("PG42 world/pack version mismatch")
        installed=lab.hashes(item["target"])
        expected=wanted[kind] if backup_tag else before[kind]
        if installed!=expected:
            drift=sorted(k for k in (installed.keys()|expected.keys())
                         if installed.get(k)!=expected.get(k))
            raise lab.UnsafeLab("PG42 exact predecessor mismatch: "+
                                kind+" "+repr(drift[:8]))
        dest=(previous if backup_tag else current)/kind
        if backup_tag:
            saved=backup/f"pack-{i}"
            lab.assert_no_link(saved)
            origreg=backup/f"registry-{i}.bin"
            lab.assert_no_link(origreg)
            if (not saved.is_dir() or not origreg.is_file() or
                lab.hashes(saved)!=before[kind] or
                origreg.read_bytes()!=item["old_bytes"]):
                raise lab.UnsafeLab("PG42 rollback evidence mismatch")
            dest=saved
        plan.append({**item,"source":dest,
            "files":before[kind] if backup_tag else wanted[kind],
            "old_hashes":expected,
            "new_registry":item["old_bytes"].decode("utf-8-sig")})
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
        if not re.fullmatch("[a-f0-9]{40}",args.commit):
            raise lab.UnsafeLab("PG42 exact Git SHA required")
        if args.apply!=(args.mode in ("install","rollback")):
            raise lab.UnsafeLab("PG42 install/rollback require --apply")
        if args.mode=="rollback" and not args.backup_tag:
            raise lab.UnsafeLab("PG42 rollback needs exact backup tag")
        if args.mode!="rollback" and args.backup_tag:
            raise lab.UnsafeLab("PG42 backup tag only for rollback")
        lab.assert_clean_git(ROOT,args.commit)
        with tempfile.TemporaryDirectory(prefix="pg42-source-") as td:
            current,previous,wanted,before=render_pack_pair(Path(td))
            if args.mode=="plan":
                print("PG42 SOURCE PASS: single tagged native probe; PG40 HOLD unchanged")
                print("No LAB, preserved world, or production accessed")
                return 0
            root=pg08.check_real_root()
            plan=make_plan(root,current,previous,wanted,before,args.commit,
                           args.backup_tag)
            for item in plan:
                print("PG42 STOPPED FRESH-WORLD LAB ONLY:",item["target"],
                      "mode:","ROLLBACK" if args.backup_tag else "PROBE-INSTALL")
            if args.mode=="check":
                print("PG42 READ-ONLY LAB PREFLIGHT PASS")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(plan)
            backup=lab.apply_plan(root,plan)
            print("PG42 GUARDED PROBE",args.mode.upper(),"COMPLETE; backup:",backup)
            print("PG35 original world never changed; PG40 HOLD retained")
            return 0
    except (lab.UnsafeLab,OSError,UnicodeError,ValueError,KeyError,
            TypeError,subprocess.CalledProcessError) as exc:
        print("PG42 REFUSED:",exc,file=sys.stderr)
        return 2


if __name__=="__main__":
    raise SystemExit(main())
