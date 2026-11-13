"""PG40 read-only PG39 native-carrier forensic census on exact installed PG37.

Recreate original PG37 from its pinned Git source, install a permanent
read-only /hartlogistics:status native owner census, and suspend all UCE
mutation entrypoints with a tracked, temporary PG40 maintenance freeze.
Preserve the legacy-writer fence: no Q4 writer reactivation. Never bring later
draft custody, routing or partial-merge logic into the held LAB world.
No server/world access during source Plan.
Stopped LAB, exact predecessor hashes, a two-pack backup and rollback remain
mandatory for any approved install. This is not transport acceptance.
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
import pg37_lab_patch as pg37

lab=uce_deploy.lab
pg08=uce_deploy.pg08
pg33=uce_deploy.pg33
uce=uce_deploy.uce
ROOT=uce_deploy.ROOT
BASE_SHA="22637cae8b988b19e6ecadb1280c34f7dbf1c617"
CHANGED_BP={"scripts/main.js","scripts/uce/unified_carrier_registry.js"}
PINNED_BUILDER_INPUTS=(
    "candidates/uce/prepare_candidate.py",
    "candidates/uce/bulk_assets.py",
    "candidates/uce/assets/entities/uce_native_carrier.json",
    "candidates/pg33/prepare_candidate.py",
)

def historical(path: str) -> str:
    allowed={"candidates/uce/runtime_bridge.js",
             "candidates/uce/runtime_pipe_route.js"}|{
        "candidates/transport/"+name+".mjs" for name in uce.MODULES}
    if path not in allowed:
        raise lab.UnsafeLab("PG40 historical source not on allowlist: "+path)
    result=subprocess.run(
        ["git","-C",str(ROOT),"show",BASE_SHA+":"+path],
        check=True,text=True,encoding="utf-8",errors="strict",
        capture_output=True)
    return result.stdout

def blob_identity(ref: str,path: str) -> str:
    if ref not in ("HEAD",BASE_SHA) or path not in PINNED_BUILDER_INPUTS:
        raise lab.UnsafeLab("PG40 unexpected source identity request")
    result=subprocess.run(
        ["git","-C",str(ROOT),"rev-parse",ref+":"+path],
        check=True,text=True,encoding="utf-8",capture_output=True)
    sha=result.stdout.strip()
    if not re.fullmatch("[a-f0-9]{40}",sha):
        raise lab.UnsafeLab("PG40 unreadable source object")
    return sha

def replace_exact(body: str, old: str, new: str) -> str:
    if body.count(old)!=1 or not old or old==new:
        raise lab.UnsafeLab("PG40 exact source replacement ambiguous")
    return body.replace(old,new,1)

def diagnostic_method(source: str) -> str:
    begin=source.find("function uceSendDiagnostics(origin){")
    end=source.find("\n\n// Read-only LAB migration census",begin)
    if begin<0 or end<begin or source.count("function uceSendDiagnostics(origin){")!=1:
        raise lab.UnsafeLab("PG40 diagnostic boundary changed")
    return source[begin:end]

def frozen_maintenance_bridge(base: str) -> str:
    """Stop every UCE-originating mutation path during PG39 observation.

    This is a deliberately supported, exact-PG37-only LAB maintenance
    mode, not a disposable runtime debug hook or a gameplay implementation.
    Both legacy and UCE custody writers must be held, including when the
    world authority is corrupt or unreadable. The existing legacy fence is
    strengthened to an unconditional true in this isolated forensic build;
    normal active gameplay sources and world state remain untouched.
    It must never be part of normal product/release candidate compilation.
    """
    marker="UCE_PG40_FORENSIC_FREEZE"
    if marker in base:
        raise lab.UnsafeLab("PG40 duplicate forensic mutation fence")
    base=replace_exact(base,"function uceAllowsSorterRegistryWrite(key){",
        "// PG40 FORENSIC MAINTENANCE: UCE writes suspended; legacy fence preserved.\n"
        "const UCE_PG40_FORENSIC_FREEZE=true;\n"
        "function uceAllowsSorterRegistryWrite(key){\n"
        "    if(UCE_PG40_FORENSIC_FREEZE)return false;")
    # The original UCE marker check alone could fall back to legacy
    # writers if a damaged world suddenly lost its authority property.
    # PG40 instead holds ALL Hart writers regardless of marker readability.
    base=replace_exact(base,"function uceLegacyWriterBlocked(){",
        "function uceLegacyWriterBlocked(){\n"
        "    if(UCE_PG40_FORENSIC_FREEZE)return true;")
    entrypoints={
        "uceUnifiedServiceTick":"return;",
        "uceMrServiceTick":"return;",
        "uceOrdinaryServiceTick":"return;",
        "uceSorterDirectServiceTick":"return;",
        "uceProcessEjectedItemEntity":"return;",
        "uceRegisterNewReceiver":"return;",
        "uceSelectCollectorForLink":"return;",
        "uceMaybeRegisterBulk":"return false;",
        "uceActivateEmptyLabWorld":"return;"
    }
    for name,action in entrypoints.items():
        start=base.find("function "+name+"(")
        if start<0:
            raise lab.UnsafeLab("PG40 missing mutation handler "+name)
        end=base.find("{",start)
        if end<0 or end-start>160:
            raise lab.UnsafeLab("PG40 handler boundary invalid: "+name)
        header=base[start:end+1]
        base=replace_exact(base,header,
            header+"\n    if(UCE_PG40_FORENSIC_FREEZE)"+action)
    original="function uceUseReceiverLinkOrStatus(player,block){"
    base=replace_exact(base,original,original+
        "\n    if(UCE_PG40_FORENSIC_FREEZE){"+
        "if(player&&block?.typeId===RECEIVER_ID)"+
        "uceShowReceiverLinkedStatus(player,block);return;}")
    base=replace_exact(base,
        "    lines.push('§7Build: §fSOURCE ONLY; no BDS acceptance or hard-crash disk proof');",
        "    lines.push('§cPG40 FORENSIC HOLD: Hart script transfers and registrations suspended; vanilla world still ticks.');\n"
        "    lines.push('§7Build: §fSOURCE ONLY; no BDS acceptance or hard-crash disk proof');")
    return base


def diagnostic_only_bridge() -> tuple[str,str]:
    prior=historical("candidates/uce/runtime_bridge.js")
    new=uce.BRIDGE.read_text(encoding="utf-8")
    original_method=diagnostic_method(prior)
    wanted_method=diagnostic_method(new)
    if "inspectHostEvidence({" not in wanted_method or "Native hosts (read-only" not in wanted_method:
        raise lab.UnsafeLab("PG40 native-carrier census missing")
    if any(token in wanted_method for token in (
        "setDynamicProperty(", "setItem(", "spawnEntity(",
        "moveWhole(", "registerEmptyHost(", "clearDynamicProperties(")):
        raise lab.UnsafeLab("PG40 census may not mutate custody")
    new=replace_exact(prior,original_method,wanted_method)
    return prior,frozen_maintenance_bridge(new)

def read_only_registry() -> tuple[str,str]:
    prior=historical("candidates/transport/unified_carrier_registry.mjs")
    draft=(ROOT/"candidates/transport/unified_carrier_registry.mjs").read_text(
        encoding="utf-8")
    marker="\n  /**\n   * Permanent read-only native carrier health"
    start=draft.find(marker)
    end=draft.find("  function currentJournal(){",start)
    if (start<0 or end<start or draft.count(marker)!=1 or
        "  function inspectHostEvidence({ownerId,anchor}={}){" not in draft[start:end]):
        raise lab.UnsafeLab("PG40 native host observer boundary changed")
    observer=draft[start:end]
    # A forensic observer is only allowed to read. No item writes/spawning.
    if any(token in observer for token in (
        "setDynamicProperty(", "spawnEntity(", "setItem(",
        ".remove(", "registerEmptyHost(", "moveWhole(")):
        raise lab.UnsafeLab("PG40 native observer has a physical side effect")
    modified=replace_exact(prior,"  function currentJournal(){",
                           observer+"  function currentJournal(){")
    modified=replace_exact(modified,
        "return {ok:true,inspectHost,registerEmptyHost,inspectCustody,\n"
        "    stageMovedTicket,durableOwnershipWitness,",
        "return {ok:true,inspectHost,inspectHostEvidence,registerEmptyHost,\n"
        "    inspectCustody,stageMovedTicket,durableOwnershipWitness,")
    # The current registry must differ from the actual installed PG37 version
    # in exactly this read-only observer and exported method; refuse drift.
    if modified!=draft:
        raise lab.UnsafeLab("PG40 carrier registry contains unrelated source drift")
    return prior,modified

def render_pack_pair(folder: Path):
    for path in PINNED_BUILDER_INPUTS:
        if blob_identity("HEAD",path)!=blob_identity(BASE_SHA,path):
            raise lab.UnsafeLab("PG40 builder/asset drift: "+path)
    old=folder/"pg33"
    prior=folder/"prior"
    current=folder/"current"
    pg33.prepare(old)
    uce.prepare(current)
    bp=current/"behavior_pack"
    base_main=(old/"behavior_pack/scripts/main.js").read_text(encoding="utf-8")
    bridge_before,bridge_after=diagnostic_only_bridge()
    pipe=historical("candidates/uce/runtime_pipe_route.js")
    carrier_before,carrier_after=read_only_registry()
    (bp/"scripts/main.js").write_text(
        uce.compile_patch(base_main,bridge_before+"\n"+pipe),encoding="utf-8")
    for name in uce.MODULES:
        raw=historical("candidates/transport/"+name+".mjs")
        raw=raw.replace(".mjs'",".js'").replace('.mjs"','.js"')
        (bp/("scripts/uce/"+name+".js")).write_text(raw,encoding="utf-8")
    previous=uce_deploy.check_candidate(current,old)
    shutil.copytree(current,prior)
    (bp/"scripts/main.js").write_text(
        uce.compile_patch(base_main,bridge_after+"\n"+pipe),encoding="utf-8")
    carrier_js=carrier_after.replace(".mjs'",".js'").replace('.mjs"','.js"')
    (bp/"scripts/uce/unified_carrier_registry.js").write_text(
        carrier_js,encoding="utf-8")
    wanted=uce_deploy.check_candidate(current,old)
    diff={path for path in wanted["behavior_pack"]
          if wanted["behavior_pack"][path]!=previous["behavior_pack"][path]}
    if (diff!=CHANGED_BP or
        wanted["resource_pack"]!=previous["resource_pack"] or
        set(wanted["behavior_pack"])!=set(previous["behavior_pack"])):
        raise lab.UnsafeLab("PG40 non-diagnostic source was modified")
    return current,prior,wanted,previous

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
            raise lab.UnsafeLab("PG40 exact Git SHA pin required")
        if args.apply!=(args.mode in ("install","rollback")):
            raise lab.UnsafeLab("PG40 only install/rollback may --apply")
        if args.mode=="rollback" and not args.backup_tag:
            raise lab.UnsafeLab("PG40 rollback needs exact backup tag")
        if args.mode!="rollback" and args.backup_tag:
            raise lab.UnsafeLab("PG40 backup tag only for rollback")
        lab.assert_clean_git(ROOT,args.commit)
        with tempfile.TemporaryDirectory(prefix="pg40-source-") as scratch:
            current,prior,wanted,previous=render_pack_pair(Path(scratch))
            if args.mode=="plan":
                print("PG40 SOURCE PASS: two BP files, UCE writers suspended")
                print("Original PG37 native writers and legacy fence preserved")
                print("No LAB, BDS world, original Q4 or production accessed")
                return 0
            root=pg08.check_real_root()
            plan=pg37.make_plan(root,current,prior,wanted,previous,
                                args.backup_tag)
            for record in plan:
                print("PG40 STOPPED LAB ONLY:",record["target"],
                      "mode:","ROLLBACK" if args.backup_tag else "READONLY-CENSUS")
            if args.mode=="check":
                print("PG40 READ-ONLY LAB PREFLIGHT PASS")
                return 0
            pg08.assert_lab_process_stopped()
            pg08.plan_is_unchanged(plan)
            backup=lab.apply_plan(root,plan)
            print("PG40 GUARDED STOPPED LAB COMPLETE; backup:",backup)
            print("No LevelDB, authority, custody journal or original ZIP touched")
            print("No BDS transfer or release accepted")
            return 0
    except (lab.UnsafeLab,OSError,UnicodeError,ValueError,KeyError,
            subprocess.CalledProcessError) as exc:
        print("PG40 REFUSED:",exc,file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
