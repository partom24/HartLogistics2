#!/usr/bin/env python3
"""Guarded dual-source 1.5.7/1.5.8 -> 1.5.9 owned URCE LAB upgrade.

The last owner BDS evidence shows 1.5.7-specific diagnostics, but not an
installer hash/backup fingerprint. This source-only tool DOES NOT infer actual
installation from a screenshot. It recognizes exactly two fully pinned pack
predecessors. CheckLab is read-only; no apply without stopped copied LAB,
exact BP/RP/registrations and explicit user-selected -Apply. Unknown is REFUSE.

A physically closed Receiver -> Hopper -> Sorter -> native chest route now
reuses original Q4 dequeue + physical Sorter journals. There is no Q5 migration,
no generic terminal permission, no opaque native MR custody writer.
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
NEW_VERSION=(1,5,9)
PREDECESSORS={
    (1,5,7): "8bb696129a668699e0867aa1e6786a8716d1ef3a",
    (1,5,8): "b81e32ed23ce18283e6edcd3a8809d6fcf6bf71a"
}
# Owner CheckLab: a second fully pinned 1.5.8 source with 26 BP / 60 RP
# files; two installed script SHA256s match this Git history commit exactly.
# Every installed pack byte is STILL checked before upgrades or rollback.
EARLY_158_LAB_ORIGIN="65d2cc5fdc6922997c084b8f6e58d99052cb7893"
OBSERVED_158_MAIN_SHA256="efd3e80c18e9856d8ceecf279209df7226d8169547a98df1b7214f75f95d9d0e"
OBSERVED_158_LINK_SHA256="a401e649abd57558dbbddd5123768acc9816e532ebab4c3eaf257a62752362f2"
EARLY_158_MISSING_HELPERS={
    "scripts/urce_152_shadow_evidence_bridge.js",
    "scripts/urce_column_local_decisions.js",
    "scripts/urce_column_offer_bridge.js",
    "scripts/urce_source_claim_coverage.js",
    "scripts/urce_source_scoped_shadow.js"
}
CHANGE_158={
    "behavior_pack/manifest.json",
    "resource_pack/manifest.json",
    "behavior_pack/scripts/main.js",
    "behavior_pack/scripts/urce_159_direct_sorter_home.js",
    "behavior_pack/scripts/urce_152_link_snapshot_gate.js"
}
EXTRA_157={
    "behavior_pack/scripts/urce_152_live_link_guard.js",
    "behavior_pack/scripts/urce_152_shadow_evidence_bridge.js",
    "behavior_pack/scripts/urce_column_local_decisions.js",
    "behavior_pack/scripts/urce_column_offer_bridge.js",
    "behavior_pack/scripts/urce_source_claim_coverage.js",
    "behavior_pack/scripts/urce_source_scoped_shadow.js"
}
ADDED_158={"behavior_pack/scripts/urce_159_direct_sorter_home.js"}
ADDED_157=ADDED_158 | (EXTRA_157-{
    "behavior_pack/scripts/urce_152_live_link_guard.js"
})
REVIEWED_BLOBS={
    "behavior_pack/manifest.json":"8ea518d9ad202092bbc4f6f60de9ad62e270d81e",
    "resource_pack/manifest.json":"5a0fbaa977143f9cc9eaad9ac345a2985ec457b2",
    "behavior_pack/scripts/main.js":"17a3b4492981a97121647b8ca9d059384eeeb50d",
    "behavior_pack/scripts/urce_159_direct_sorter_home.js":"2054387343d34ecc6e6947bf14943c2229913288",
    "behavior_pack/scripts/urce_152_live_link_guard.js":"76dd50d472313b3798554bedc3dbd5313842ecc3",
    "behavior_pack/scripts/urce_152_link_snapshot_gate.js":"36ad8de96b92375a1b5d7928d0528e94c74ff217",
    "behavior_pack/scripts/urce_152_shadow_evidence_bridge.js":"ee2c71c9fb84340f7110ccb3a2d52fc0fc5a688f",
    "behavior_pack/scripts/urce_column_local_decisions.js":"1892b4168a972ad634c6ae20306e1af7d71d5dd9",
    "behavior_pack/scripts/urce_column_offer_bridge.js":"9154d763f39f5827dc8a974351b3526c6e67abb5",
    "behavior_pack/scripts/urce_source_claim_coverage.js":"be169f0de7acacc045ca81d8828c487ec7fe72bc",
    "behavior_pack/scripts/urce_source_scoped_shadow.js":"4c1c5d228d00299c73b14cefe853f0cca930da37"
}

def git_blob_id(data: bytes) -> str:
    return hashlib.sha1(("blob "+str(len(data))+"\0").encode("ascii")+data).hexdigest()

def prior_hashes(repo=ROOT,commit=None):
    """One immutable pack file set only; no files from current HEAD."""
    if commit not in (*PREDECESSORS.values(),EARLY_158_LAB_ORIGIN):
        raise UnsafeLab("Unknown historic source commit")
    cmd=["git","-C",str(repo)]
    entries=subprocess.run(
        [*cmd,"ls-tree","-r","--name-only",commit,
         "addon/behavior_pack","addon/resource_pack"],
        capture_output=True,text=True,check=True).stdout.splitlines()
    expected={}
    for entry in entries:
        if not entry.startswith(("addon/behavior_pack/","addon/resource_pack/")):
            raise UnsafeLab("Invalid predecessor pack path")
        data=subprocess.run([*cmd,"show",commit+":"+entry],
                            capture_output=True,check=True).stdout
        expected[entry[len("addon/"):]]=hashlib.sha256(data).hexdigest()
    if len(expected)<60:
        raise UnsafeLab("Incomplete pinned historic source "+commit)
    return expected

def prior_hashes_by_version(repo=ROOT):
    return {version:prior_hashes(repo,commit)
            for version,commit in PREDECESSORS.items()}

def validate_candidate(repo=ROOT,originals=None):
    if originals is None: originals=prior_hashes_by_version(repo)
    if set(originals)!=set(PREDECESSORS):
        raise UnsafeLab("Missing historical predecessor pack evidence")
    bp=json.loads((repo/"addon/behavior_pack/manifest.json").read_text())
    rp=json.loads((repo/"addon/resource_pack/manifest.json").read_text())
    if bp["header"]["uuid"]!=old.BP_UUID or rp["header"]["uuid"]!=old.RP_UUID:
        raise UnsafeLab("Hart pack identity changed")
    if (old.v3(bp["header"]["version"])!=NEW_VERSION or
        old.v3(rp["header"]["version"])!=NEW_VERSION or
        any(old.v3(m["version"])!=NEW_VERSION for m in bp["modules"]+rp["modules"])):
        raise UnsafeLab("Expected matching 1.5.9 BP/RP module versions")
    if not any(d.get("uuid")==old.RP_UUID and
               old.v3(d.get("version"))==NEW_VERSION
               for d in bp["dependencies"]):
        raise UnsafeLab("Expected exact matching RP dependency")
    if not any(d.get("module_name")=="@minecraft/server" and
               d.get("version")=="2.7.0" for d in bp["dependencies"]):
        raise UnsafeLab("Native Bedrock API version changed")
    now={local:old.hashes(repo/"addon"/local) for local,_,_,_ in PACKS}
    flat={"%s/%s"%(local,p):v for local,h in now.items() for p,v in h.items()}
    for version,before in originals.items():
        extra=ADDED_157 if version==(1,5,7) else ADDED_158
        allowed=CHANGE_158 | (EXTRA_157 if version==(1,5,7) else set())
        if set(flat)!=(set(before)|extra):
            raise UnsafeLab("Unexpected pack path delta from "+str(version))
        actual={k for k,v in flat.items() if k not in before or v!=before[k]}
        if actual!=allowed:
            raise UnsafeLab("Unreviewed gameplay/asset delta from "+str(version))
    for item,sha in REVIEWED_BLOBS.items():
        data=(repo/"addon"/item).read_bytes()
        if git_blob_id(data)!=sha:
            raise UnsafeLab("Reviewed source blob changed: "+item)
    # No new Q4 writes or metadata shortcuts; old custody functions remain
    # journaled and active. The direct route model does not import Bedrock.
    main=(repo/"addon/behavior_pack/scripts/main.js").read_text(encoding="utf-8")
    required=(
        'const VERSION = "1.5.9-dev";',
        'import {inspectDirectSorterOutlet, inspectDirectItemHome} from "./urce_159_direct_sorter_home.js";',
        'const outlet=directSorterOutlet(receiver);',
        'routeKind:"DIRECT_NATIVE_SORTER"',
        'governedLane!=="DIRECT_NATIVE_SORTER"',
        'governedLane!=="LEGACY_UNGOVERNED"',
        'directNativeHome(receiver,item,output)',
        'dequeueToReceiver(receiver, output, budget, governedLane)',
        'saveQueueJournal(tx);',
        'persistQueueMeta(receiver, q, metaAfter);',
        'output.container.setItem(tx.dstSlot, moved);',
        'if(directClosed)continue;',
        'if (world.getDynamicProperty(JOURNAL_KEY))',
        'liveLinkCheck(col, receiver, true)',
        'verdict.decision !== "SAFE_SNAPSHOT"',
        'col.link = prior;',
        'observationReason:result.observationReason'
    )
    for marker in required:
        if marker not in main:raise UnsafeLab("Missing preserved native gate: "+marker)
    # Each reviewed control/plan helper remains strictly free of any native
    # inventory or durable world writer (including this new direct outlet).
    for name in (
        "urce_152_route_model.js","urce_152_native_hopper_witness.js",
        "urce_152_transporter_bank_probe.js",
        "urce_152_link_snapshot_gate.js","urce_152_live_link_guard.js",
        "urce_152_shadow_evidence_bridge.js","urce_column_local_decisions.js",
        "urce_column_offer_bridge.js","urce_source_claim_coverage.js",
        "urce_source_scoped_shadow.js","urce_159_direct_sorter_home.js"
    ):
        data=(repo/"addon/behavior_pack/scripts"/name).read_text(encoding="utf-8")
        for forbidden in (".setItem(", ".addItem(", ".spawnItem(",
                          ".setDynamicProperty(", ".runInterval("):
            if forbidden in data:
                raise UnsafeLab("Unreviewed helper contains custody writer: "+name)
    # Pin the native diagnostic and owner-selected 4x4 connected-pipe shapes.
    native=(repo/"addon/behavior_pack/scripts/urce_152_native_hopper_witness.js").read_text()
    if 'blockType:block.typeId,receiverId:receiver.id' not in native:
        raise UnsafeLab("Missing native boundary witness")
    model=json.loads((repo/"addon/resource_pack/models/blocks/hartlogistics_transporter.geo.json").read_text())
    bones={x["name"]:x["cubes"][0] for x in model["minecraft:geometry"][0]["bones"]}
    if (bones["core"]["size"]!=[4,4,4] or
        bones["east"]["origin"]!=[-8,6,-2] or
        bones["west"]["origin"]!=[2,6,-2]):
        raise UnsafeLab("Accepted 4x4 Transporter geometry changed")
    return now

def expected_previous(originals,version):
    if version not in originals:
        raise UnsafeLab("Unknown installed historic predecessor")
    return {local:{path.split("/",1)[1]:digest
                   for path,digest in originals[version].items()
                   if path.startswith(local+"/")}
            for local,_,_,_ in PACKS}

def approved_predecessor_pairs(repo=ROOT,originals=None):
    """Exact paired BP+RP file trees; never version-only or per-file trust."""
    if originals is None:originals=prior_hashes_by_version(repo)
    legacy={v:expected_previous(originals,v) for v in PREDECESSORS}
    early_flat=prior_hashes(repo,EARLY_158_LAB_ORIGIN)
    early={
        local:{name.split("/",1)[1]:digest for name,digest in early_flat.items()
               if name.startswith(local+"/")}
        for local,_,_,_ in PACKS
    }
    bp=early["behavior_pack"]
    rp=early["resource_pack"]
    if (len(bp)!=26 or len(rp)!=60 or
        bp.get("scripts/main.js")!=OBSERVED_158_MAIN_SHA256 or
        bp.get("scripts/urce_152_live_link_guard.js")!=OBSERVED_158_LINK_SHA256 or
        any(name in bp for name in EARLY_158_MISSING_HELPERS) or
        early["resource_pack"]!=legacy[(1,5,8)]["resource_pack"]):
        raise UnsafeLab("Early 1.5.8 historical source provenance changed; refuse")
    return {
        (1,5,7):(legacy[(1,5,7)],),
        (1,5,8):(legacy[(1,5,8)],early)
    }


def describe_installed_pack_drift(local,version,actual,expected):
    """Pure, read-only, bounded file-by-file byte-hash mismatch report.

    Report only *relative pack file names* and SHA256 digests, never
    inventory, world bytes, file contents, or arbitrary filesystem paths.
    An altered file list must NEVER become upgrade authorization.
    """
    missing=sorted(set(expected)-set(actual))
    unexpected=sorted(set(actual)-set(expected))
    changed=sorted(key for key in set(actual)&set(expected)
                   if actual[key]!=expected[key])
    lines=[
        "Installed "+local+" bytes do not match immutable "+str(version),
        "READ-ONLY PACK DIFFERENCES: expected_files="+str(len(expected))+
        " installed_files="+str(len(actual))+
        " missing="+str(len(missing))+
        " unexpected="+str(len(unexpected))+
        " modified="+str(len(changed))
    ]
    for label,paths in (("MISSING",missing),("UNEXPECTED",unexpected),("MODIFIED",changed)):
        for path in paths[:20]:
            line="  "+label+" "+path
            if path in expected:line+=" expected_sha256="+expected[path]
            if path in actual:line+=" installed_sha256="+actual[path]
            lines.append(line)
        if len(paths)>20:
            lines.append("  "+label+" ... "+str(len(paths)-20)+" additional paths")
    lines.append("NO FILES CHANGED. Do not install. Share this read-only report for review.")
    return "\n".join(lines)


def read_live_plan(repo,root,originals=None):
    if originals is None:originals=prior_hashes_by_version(repo)
    candidate=validate_candidate(repo,originals)
    provenance=approved_predecessor_pairs(repo,originals)
    props=root/"server.properties"
    if not (root/"bedrock_server.exe").is_file() or not props.is_file():
        raise UnsafeLab("Not an authorized BDS LAB server")
    levels=[line.partition("=")[2].strip() for line in
            props.read_text(encoding="utf-8-sig").splitlines()
            if line.strip().startswith("level-name=")]
    if len(levels)!=1 or not levels[0] or any(x in levels[0] for x in ("/","\\")) or levels[0] in (".",".."):
        raise UnsafeLab("Missing/unsafe LAB world")
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
        if len(hits)!=1:raise UnsafeLab("Expected exactly one installed Hart pack")
        target=hits[0]
        old.assert_no_link(target)
        manifest=json.loads((target/"manifest.json").read_text(encoding="utf-8-sig"))
        version=old.v3(manifest["header"]["version"])
        if version not in (*PREDECESSORS,NEW_VERSION):
            raise UnsafeLab("Installed version not one of exact 1.5.7/1.5.8/1.5.9")
        actual=old.hashes(target)
        allowed=(candidate[local],) if version==NEW_VERSION else tuple(
            source[local] for source in provenance[version])
        if actual not in allowed:
            # Choose the nearest fully approved snapshot for diagnosis only.
            # A diagnostic does not authorize installation.
            def distance(expected):
                return len(set(expected)^set(actual))+sum(
                    actual[path]!=expected[path]
                    for path in set(actual)&set(expected))
            nearest=min(allowed,key=distance)
            raise UnsafeLab(describe_installed_pack_drift(local,version,actual,nearest))
        registry=world/registry_name
        old.assert_no_link(registry)
        if not registry.is_file():raise UnsafeLab("Missing world pack registration")
        raw=registry.read_bytes()
        values=json.loads(old.remove_jsonc(raw.decode("utf-8-sig")))
        matched=[e for e in values if isinstance(e,dict) and
                 str(e.get("pack_id","")).casefold()==pack_id.casefold()]
        if len(matched)!=1 or old.v3(matched[0]["version"])!=version:
            raise UnsafeLab("World pack registration mismatch")
        plan.append({
            "source":repo/"addon"/local, "target":target,
            "registry":registry,
            "new_registry":old.patch_registration(raw.decode("utf-8-sig"),
                                                   pack_id,NEW_VERSION),
            "old_bytes":raw,"installed":actual,
            "files":candidate[local],"version":version,"local":local
        })
    if len({item["version"] for item in plan})!=1:
        raise UnsafeLab("Mixed installed BP/RP versions")
    version=plan[0]["version"]
    if version!=NEW_VERSION and not any(
        all(item["installed"]==source[item["local"]] for item in plan)
        for source in provenance[version]
    ):
        raise UnsafeLab("Mixed historical BP/RP snapshots; no coherent predecessor")
    return plan

def rollback_plan(repo,root,tag,originals=None):
    if not re.fullmatch(r"lab-[0-9a-f]{12}",tag):
        raise UnsafeLab("Rollback requires exact installer-created backup tag")
    if originals is None:originals=prior_hashes_by_version(repo)
    provenance=approved_predecessor_pairs(repo,originals)
    current=read_live_plan(repo,root,originals)
    if current[0]["version"]!=NEW_VERSION:
        raise UnsafeLab("Rollback requires exactly installed 1.5.9")
    backup=root/"_HartLogisticsDeployBackups"/tag
    old.assert_no_link(backup)
    if not backup.is_dir():raise UnsafeLab("Rollback backup not found")
    result=[]
    previous_version=None
    for i,item in enumerate(current):
        saved=backup/("pack-"+str(i))
        reg=backup/("registry-"+str(i)+".bin")
        old.assert_no_link(saved);old.assert_no_link(reg)
        if not saved.is_dir() or not reg.is_file():
            raise UnsafeLab("Incomplete rollback backup")
        manifest=json.loads((saved/"manifest.json").read_text(encoding="utf-8-sig"))
        version=old.v3(manifest["header"]["version"])
        if version not in PREDECESSORS:
            raise UnsafeLab("Unrecognized backup predecessor")
        if previous_version is not None and version!=previous_version:
            raise UnsafeLab("Mixed backup versions")
        previous_version=version
        saved_hashes=old.hashes(saved)
        if not any(saved_hashes==source[item["local"]] for source in provenance[version]):
            raise UnsafeLab("Tampered/unknown predecessor backup")
        raw=reg.read_bytes()
        parsed=json.loads(old.remove_jsonc(raw.decode("utf-8-sig")))
        matches=[x for x in parsed if isinstance(x,dict) and
                 str(x.get("pack_id","")).casefold()==PACKS[i][2].casefold()]
        if len(matches)!=1 or old.v3(matches[0]["version"])!=version:
            raise UnsafeLab("Backup registry version mismatch")
        updated=old.patch_registration(raw.decode("utf-8-sig"),
                                       PACKS[i][2],NEW_VERSION)
        bom=b"\xef\xbb\xbf" if raw.startswith(b"\xef\xbb\xbf") else b""
        if bom+updated.encode("utf-8")!=item["old_bytes"]:
            raise UnsafeLab("Unrelated registry drift since this exact backup")
        result.append({**item,"source":saved,
                       "files":saved_hashes,
                       "new_registry":raw.decode("utf-8-sig")})
    if not any(
        all(item["files"]==source[item["local"]] for item in result)
        for source in provenance[previous_version]
    ):
        raise UnsafeLab("Mixed BP/RP backup origins; refuse cross-snapshot rollback")
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
        originals=prior_hashes_by_version(ROOT)
        source=validate_candidate(ROOT,originals)
        if not a.check_lab:
            print("1.5.9 SOURCE PASS: exact 1.5.7 and dual immutable 1.5.8 BP/RP predecessors; Q4 single-writer native home lane")
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
            print("Already exactly installed 1.5.9; no write needed.")
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
