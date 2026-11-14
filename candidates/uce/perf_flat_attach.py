"""Guarded, already-generated FLAT LAB performance-world HL2 pack attach/rollback.

This is NOT the new-world generator and does not access or mutate any LevelDB.
Only the exact authorized LAB shared Hart packs and the two NEW-WORLD
registration JSON files may change, with verified transactional pack backup.
The original restored 1.4.1 world is not opened or selected.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import ntpath
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import lab_deploy as uce_deploy
import freeform_lab as common

lab=uce_deploy.lab
uce=uce_deploy.uce
pg08=uce_deploy.pg08
ROOT=uce_deploy.ROOT
WORLD="HartLogistics15PerfFlat"
STATE="_HartLogisticsPerfFlatState"
REGS=("world_behavior_packs.json","world_resource_packs.json")
VERSION=(1,5,16)

def read(root,rel):
    p=root/rel
    lab.assert_no_link(p)
    return p.read_bytes()

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def checked_lab_root_stopped():
    """Fail closed on unknown BDS paths; never stop an unrelated server.

    The existing PG08 guard reads Get-Process.Path, which may be denied
    for an unrelated production-owned BDS even when this LAB is stopped.
    This diagnostic uses the same CIM executable-path verification as the
    already exercised stopped-LAB flat-world setup script.
    """
    if os.name != "nt":
        raise lab.UnsafeLab("Windows LAB only")
    lab.assert_lab_name(lab.LAB)
    root=Path(lab.LAB)
    lab.assert_no_link(root)
    if ntpath.normcase(str(root.resolve(strict=True)))!=ntpath.normcase(lab.LAB):
        raise lab.UnsafeLab("LAB root points outside authorized path")
    script="""$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process -Filter "Name='bedrock_server.exe'" -ErrorAction Stop | ForEach-Object { if(-not $_.ExecutablePath) { throw ('Cannot resolve running BDS executable PID '+$_.ProcessId) }; Write-Output $_.ExecutablePath }"""
    try:
        result=subprocess.run(
            ["powershell.exe","-NoProfile","-NonInteractive","-Command",script],
            capture_output=True,text=True,check=False,timeout=30)
    except (OSError,subprocess.TimeoutExpired) as err:
        raise lab.UnsafeLab("BDS process inspection unavailable; no LAB writes") from err
    if result.returncode!=0:
        detail=(result.stderr or result.stdout or
                "CIM process query failed").strip()
        raise lab.UnsafeLab(
            "Cannot prove LAB BDS is stopped; no writes. "
            "Run elevated if needed. "+detail[:450])
    prefix=ntpath.normcase(lab.LAB).rstrip("\\")+"\\"
    for executable in result.stdout.splitlines():
        path=ntpath.normcase(ntpath.normpath(executable.strip()))
        if not ntpath.isabs(path):
            raise lab.UnsafeLab("Ambiguous running BDS path; no writes")
        if path.startswith(prefix):
            raise lab.UnsafeLab(
                "LAB BDS is still running: "+executable.strip()+
                " — stop the LAB BDS normally, then rerun Check")
    return root



def rebuild_v2_staged_properties(original: bytes) -> bytes:
    """Recreate the exact v2 PowerShell Prepare transformation, read-only.

    The SHA in the unchanged original receipt authenticates this output;
    it must equal the recorded stagedSha256 before any live drift is evaluated.
    """
    try:
        text=original.decode("utf-8")
    except UnicodeError as err:
        raise lab.UnsafeLab("Original settings are not exact UTF-8") from err
    newline="\r\n" if "\r\n" in text else "\n"
    after=text
    for key,value in (
        ("level-name",WORLD),("level-type","FLAT"),
        ("gamemode","creative"),("allow-cheats","true")
    ):
        pattern=r"^[ \t]*"+re.escape(key)+r"[ \t]*=[^\r\n]*"
        found=list(re.finditer(pattern,after,re.MULTILINE))
        if len(found)>1:
            raise lab.UnsafeLab("Ambiguous original property "+key)
        if not found:
            if key=="level-name":
                raise lab.UnsafeLab("Original settings missing level-name")
            if after and not after.endswith("\n"):
                after+=newline
            after+=key+"="+value+newline
        else:
            # Match the v2 PowerShell script's single-line Regex.Replace.
            after=re.sub(pattern,lambda _match:key+"="+value,after,
                         flags=re.MULTILINE)
    return after.encode("utf-8")


def active_property_lines(raw: bytes) -> list[str]:
    """Retain exact ordered active configuration lines, excluding ONLY
    comments and completely blank lines. Do not normalize values, discard
    duplicate keys, or accept an unreviewed changed active server setting.
    """
    try:
        lines=raw.decode("utf-8").splitlines()
    except UnicodeError as err:
        raise lab.UnsafeLab("Unreadable live server.properties") from err
    return [line for line in lines
            if line.strip() and not line.lstrip().startswith("#")]


def assert_authenticated_stage(props: bytes, receipt: dict, prior: bytes) -> None:
    if (receipt.get("schema")!="hl-diagnostic-flat-v1" or
        receipt.get("worldName")!=WORLD or
        receipt.get("originalSha256")!=digest(prior)):
        raise lab.UnsafeLab(
            "Flat-world stage identity/original backup SHA mismatch; no writes")
    expected=rebuild_v2_staged_properties(prior)
    if digest(expected)!=receipt.get("stagedSha256"):
        raise lab.UnsafeLab(
            "Staged snapshot cannot be reconstructed from original; "
            "receipt or backup differs from actual v2 Prepare; no writes")
    if digest(props)==receipt["stagedSha256"]:
        return
    # BDS may change comments, blank lines or line endings on startup.
    # Allow these representation-only changes ONLY if every active line,
    # including every unrelated setting and its exact value, is unchanged.
    saved=active_property_lines(expected)
    live=active_property_lines(props)
    if saved!=live:
        first=next((i for i in range(min(len(saved),len(live)))
                    if saved[i]!=live[i]),min(len(saved),len(live)))
        def label(lines):
            if first>=len(lines):return "<no line>"
            return lines[first].split("=",1)[0].strip()[:64]
        raise lab.UnsafeLab(
            "Live server.properties changed an active setting or its order "
            "since staging; refusing. First differing keys: staged="+
            label(saved)+" live="+label(live)+
            "; staged SHA="+digest(expected)+
            "; live SHA="+digest(props)+
            ". Do NOT edit the receipt or backup; inspect differences read-only.")
    print(
        "LAB STAGE NOTE: changed server.properties bytes are limited to "
        "comments, blank lines or line endings. All ordered active "
        "settings and values match the original SHA-authenticated v2 stage. "
        "No receipt or world files were changed.")


def check_stage(root):
    props=read(root,"server.properties")
    receipt=json.loads(read(root,STATE+"/staged.json"))
    prior=read(root,STATE+"/server.properties.original")
    assert_authenticated_stage(props,receipt,prior)
    lines=props.decode("utf-8-sig").splitlines()
    for key,value in (("level-name",WORLD),("level-type","FLAT"),
                      ("gamemode","creative"),("allow-cheats","true")):
        matches=[s.split("=",1)[1].strip() for s in lines
                 if s.strip().startswith(key+"=")]
        if matches!=[value]:
            raise lab.UnsafeLab("Expected exact diagnostic property "+key)
    world=root/"worlds"/WORLD
    lab.assert_no_link(world)
    if (not world.is_dir() or not read(world,"level.dat") or
        not (world/"db").is_dir() or not any((world/"db").iterdir())):
        raise lab.UnsafeLab("World has not been generated by BDS")
    lab.assert_no_link(world/"db")
    if (root/"worlds"/"ThomasServer")==world:
        raise lab.UnsafeLab("Refusing original world path")
    return world

def parse_registry(raw):
    try: data=json.loads(lab.remove_jsonc(raw.decode("utf-8-sig")))
    except (UnicodeError,ValueError) as err:
        raise lab.UnsafeLab("Unparseable new-world pack registration") from err
    if not isinstance(data,list):raise lab.UnsafeLab("Unexpected registry type")
    return data

def targets(root):
    return common.pack_targets(root) # Checks exact immutable 1.4.1 baseline or built UCE.

def build(temp):
    source=Path(temp)/"uce"
    predecessor=Path(temp)/"pg33"
    uce.prepare(source)
    uce_deploy.pg33.prepare(predecessor)
    hashes=uce_deploy.check_candidate(source,predecessor)
    return source,hashes

def install_plan(root,source,hashes):
    world=check_stage(root)
    installed=targets(root)
    plan=[]
    missing=[]
    for i,(kind,folder,identifier,_) in enumerate(lab.PACKS):
        p=installed[i]
        manifest=json.loads(read(p,"manifest.json"))
        if (lab.v3(manifest["header"]["version"])!=(1,4,1) or
            p.name!=common.PACK_DIRS[i].split("/")[-1]):
            raise lab.UnsafeLab("Expected exact original 1.4.1 LAB packs")
        reg=world/REGS[i]
        lab.assert_no_link(reg)
        if reg.exists():
            raw=reg.read_bytes()
            if parse_registry(raw)!=[]:
                raise lab.UnsafeLab("New world has nonempty pack registrations")
        else:
            raw=b"[]\n"
            missing.append(reg)
        expected=lab.hashes(ROOT/"addon"/kind)
        if lab.hashes(p)!=expected:
            raise lab.UnsafeLab("Installed 1.4.1 pack changed from frozen baseline")
        plan.append({
            "target":p,"registry":reg,"source":source/kind,
            "old_bytes":raw,"old_hashes":expected,
            "new_registry":json.dumps([
                {"pack_id":identifier,"version":list(VERSION)}],indent=2)+"\n",
            "files":hashes[kind]
        })
    return plan,missing

def rollback_plan(root,source,hashes,tag):
    if not isinstance(tag,str) or not re.fullmatch(r"lab-[0-9a-f]{12}",tag):
        raise lab.UnsafeLab("Exact rollback backup tag required")
    world=check_stage(root)
    installed=targets(root)
    backup=root/"_HartLogisticsDeployBackups"/tag
    lab.assert_no_link(backup)
    if not backup.is_dir():raise lab.UnsafeLab("LAB pack backup missing")
    plan=[]
    for i,(kind,folder,identifier,_) in enumerate(lab.PACKS):
        live=installed[i]
        if lab.hashes(live)!=hashes[kind]:
            raise lab.UnsafeLab("Current installed 1.5 pack does not match pinned source")
        reg=world/REGS[i]
        lab.assert_no_link(reg)
        raw=read(world,REGS[i])
        if parse_registry(raw)!=[{"pack_id":identifier,"version":list(VERSION)}]:
            raise lab.UnsafeLab("Diagnostic world registration changed")
        oldpack=backup/f"pack-{i}"
        oldreg=backup/f"registry-{i}.bin"
        lab.assert_no_link(oldpack)
        lab.assert_no_link(oldreg)
        previous=lab.hashes(ROOT/"addon"/kind)
        if (not oldpack.is_dir() or lab.hashes(oldpack)!=previous or
            read(backup,oldreg.name)!=b"[]\n"):
            raise lab.UnsafeLab("Previous exact 1.4.1 pack/registry backup mismatch")
        plan.append({
            "target":live,"registry":reg,"source":oldpack,
            "old_bytes":raw,"old_hashes":hashes[kind],
            "new_registry":"[]\n","files":previous
        })
    return plan

def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--mode",choices=("check","install","check-rollback","rollback"),required=True)
    ap.add_argument("--commit",required=True)
    ap.add_argument("--apply",action="store_true")
    ap.add_argument("--backup-tag")
    args=ap.parse_args(argv)
    try:
        if args.apply!=(args.mode in ("install","rollback")):
            raise lab.UnsafeLab("Apply switch and mode mismatch")
        if args.mode in ("check-rollback","rollback") and not args.backup_tag:
            raise lab.UnsafeLab("Rollback requires exact backup tag")
        if args.mode in ("check","install") and args.backup_tag:
            raise lab.UnsafeLab("Unexpected backup tag")
        lab.assert_lab_name(lab.LAB)
        lab.assert_clean_git(ROOT,args.commit)
        root=checked_lab_root_stopped() # exact Windows LAB, CIM-verified stopped
        with tempfile.TemporaryDirectory(prefix="hl2-perf-flat-") as temp:
            generated,hashes=build(temp)
            plan,missing=( (rollback_plan(root,generated,hashes,args.backup_tag),[])
                if args.backup_tag else install_plan(root,generated,hashes))
            for item in plan:
                print("LAB ONLY:",item["target"],"->",item["registry"])
            if not args.apply:
                print("READ-ONLY PASS:",args.mode,"world",WORLD,
                      "missing registration placeholders",len(missing))
                return 0
            created=[]
            try:
                for reg in missing:
                    common.atomic_new(reg,b"[]\n")
                    created.append(reg)
                pg08.plan_is_unchanged(plan)
                saved=lab.apply_plan(root,plan)
            except BaseException:
                for reg in created:
                    if reg.is_file() and reg.read_bytes()==b"[]\n":
                        reg.unlink()
                raise
            print("HL2 PERF FLAT",args.mode.upper(),"COMPLETE; backup:",saved)
            print("DO NOT select the restored world until 1.4.1 packs are restored.")
            print("No LAB BDS start, no LevelDB modifications, no production access.")
            return 0
    except (lab.UnsafeLab,OSError,ValueError,KeyError) as err:
        print("HL2 PERF FLAT REFUSED:",err,file=sys.stderr)
        return 2

if __name__=="__main__":raise SystemExit(main())
