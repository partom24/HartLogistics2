"""PG41 schema-only LAB patch over the installed PG40 frozen forensic build.

The owner-provided BDS 1.26.63.1 log proved two independent asset errors:
  * minecraft:pushable removed for entity format 1.26.10
  * 1.20+ shaped recipes require explicit unlock data.

Change ONLY the carrier entity JSON and Bulk recipe JSON; not scripts,
manifests, world or inventory. PG40 FORENSIC HOLD remains active, including
the unresolved RESERVED carrier at (-78,131,-90). No respawn or recovery.
A stopped LAB, exact predecessor bytes, world verification, and two-pack
backup/rollback are required. The source-only Plan never touches the LAB.
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

import pg40_lab_patch as pg40

lab=pg40.lab
pg08=pg40.pg08
uce=pg40.uce
uce_deploy=pg40.uce_deploy
ROOT=pg40.ROOT
CHANGED_BP={"entities/uce_native_carrier.json","recipes/bulk_storage.json"}


def validate_assets(previous: Path, repaired: Path):
    old_bp=previous/"behavior_pack"
    new_bp=repaired/"behavior_pack"
    original=json.loads((old_bp/"entities/uce_native_carrier.json").read_text(
        encoding="utf-8"))
    corrected=json.loads((new_bp/"entities/uce_native_carrier.json").read_text(
        encoding="utf-8"))
    expected=json.loads(json.dumps(original))
    components=expected["minecraft:entity"]["components"]
    obsolete=components.pop("minecraft:pushable",None)
    if obsolete!={"is_pushable":False,"is_pushable_by_piston":False}:
        raise lab.UnsafeLab("PG41 unknown original carrier push contract")
    if corrected!=expected:
        raise lab.UnsafeLab("PG41 repaired carrier has unrelated differences")
    carrier=corrected["minecraft:entity"]
    if (corrected["format_version"]!="1.26.10" or
        carrier["description"]["identifier"]!="hartlogistics:uce_native_carrier" or
        carrier["description"]["is_experimental"] is not False or
        "minecraft:pushable" in carrier["components"] or
        carrier["components"]["minecraft:inventory"]["inventory_size"]!=9 or
        carrier["components"]["minecraft:inventory"]["can_be_siphoned_from"] is not False):
        raise lab.UnsafeLab("PG41 native-carrier fidelity contract changed")
    old_recipe=json.loads((old_bp/"recipes/bulk_storage.json").read_text(
        encoding="utf-8"))
    new_recipe=json.loads((new_bp/"recipes/bulk_storage.json").read_text(
        encoding="utf-8"))
    expected_recipe=json.loads(json.dumps(old_recipe))
    expected_recipe["minecraft:recipe_shaped"]["unlock"]=[
        {"item":"minecraft:chest"}]
    if (new_recipe!=expected_recipe or
        new_recipe["minecraft:recipe_shaped"]["result"]!=
        {"item":"hartlogistics:bulk_storage","count":1}):
        raise lab.UnsafeLab("PG41 recipe change not exactly bounded")
    if (old_bp/"scripts/main.js").read_bytes()!=(
        new_bp/"scripts/main.js").read_bytes():
        raise lab.UnsafeLab("PG41 unexpected runtime script drift")
    return True


def render_pack_pair(folder: Path):
    # A private source generator rebuilds the frozen *installed* PG40 as the
    # exact predecessor, not the ever-changing draft or a guessed pack hash.
    frozen=folder/"frozen"
    installed,pg37,installed_hashes,pg37_hashes=pg40.render_pack_pair(frozen)
    generated=folder/"draft_source_only"
    uce.prepare(generated)
    current=folder/"pg41"
    shutil.copytree(installed,current)
    for path in CHANGED_BP:
        src=generated/"behavior_pack"/path
        dst=current/"behavior_pack"/path
        shutil.copy2(src,dst)
    validate_assets(installed,current)
    old=frozen/"pg33"
    # Both versions keep original UUIDs, manifest version and exact inventory.
    wanted=uce_deploy.check_candidate(current,old,
        historical_modules=tuple(pg40.frozen_uce_builder().MODULES))
    before=uce_deploy.check_candidate(installed,old,
        historical_modules=tuple(pg40.frozen_uce_builder().MODULES))
    changes={k for k in wanted["behavior_pack"] if
             wanted["behavior_pack"][k]!=before["behavior_pack"][k]}
    if (changes!=CHANGED_BP or
        wanted["resource_pack"]!=before["resource_pack"] or
        set(wanted["behavior_pack"])!=set(before["behavior_pack"]) or
        set(wanted["resource_pack"])!=set(before["resource_pack"])):
        raise lab.UnsafeLab("PG41 unexpected pack delta")
    return current,installed,wanted,before


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
        if not re.fullmatch("[0-9a-f]{40}",args.commit):
            raise lab.UnsafeLab("PG41 exact Git commit required")
        if args.apply!=(args.mode in ("install","rollback")):
            raise lab.UnsafeLab("PG41 install/rollback require --apply only")
        if args.mode=="rollback" and not args.backup_tag:
            raise lab.UnsafeLab("PG41 rollback requires exact backup tag")
        if args.mode!="rollback" and args.backup_tag:
            raise lab.UnsafeLab("PG41 backup tag only for rollback")
        lab.assert_clean_git(ROOT,args.commit)
        with tempfile.TemporaryDirectory(prefix="pg41-source-") as td:
            current,previous,wanted,before=render_pack_pair(Path(td))
            if args.mode=="plan":
                print("PG41 SOURCE PASS: exactly two BDS parser JSON repairs")
                print("PG40 forensic script frozen; no transport or recovery enabled")
                print("No LAB, LevelDB, production or original Q4 accessed")
                return 0
            root=pg08.check_real_root()
            plan=pg40.pg37.make_plan(root,current,previous,wanted,before,
                                     args.backup_tag)
            for item in plan:
                print("PG41 GUARDED LAB ONLY:",item["target"],
                      "mode:","ROLLBACK" if args.backup_tag else "ASSET-SMOKE")
            if args.mode=="check":
                print("PG41 STOPPED LAB READ-ONLY PREFLIGHT PASS")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(plan)
            backup=lab.apply_plan(root,plan)
            print("PG41 LAB TWO-PACK REPLACEMENT COMPLETE; backup:",backup)
            print("PG40 forensic HOLD remains; NO transport, item recovery or reset")
            print("No world DB, journal, sealed account or original ZIP touched")
            return 0
    except (lab.UnsafeLab,OSError,UnicodeError,ValueError,KeyError,
            subprocess.CalledProcessError) as exc:
        print("PG41 REFUSED:",exc,file=sys.stderr)
        return 2


if __name__=="__main__":
    raise SystemExit(main())
