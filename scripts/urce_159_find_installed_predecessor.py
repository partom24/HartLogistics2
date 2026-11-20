#!/usr/bin/env python3
"""Read-only forensic lookup for an *observed*, noncanonical 1.5.8 LAB BP.

An owner's CheckLab report gives SHA256 for two installed script files and
reports 26 total BP files. Search immutable Git history for a source commit
that exactly matches both bytes and path shape. This tool does NOT approve
that source as an upgrade predecessor: the real stopped-LAB file-by-file
CheckLab must still match a reviewed entire-pack snapshot before any write.
Never reads or mutates any Minecraft server or world.
"""
import hashlib
import json
import subprocess

GIT = ["git"]
MAIN = "addon/behavior_pack/scripts/main.js"
GUARD = "addon/behavior_pack/scripts/urce_152_live_link_guard.js"
EXPECTED_MAIN = "efd3e80c18e9856d8ceecf279209df7226d8169547a98df1b7214f75f95d9d0e"
EXPECTED_GUARD = "a401e649abd57558dbbddd5123768acc9816e532ebab4c3eaf257a62752362f2"
ABSENT = {
    "addon/behavior_pack/scripts/urce_152_shadow_evidence_bridge.js",
    "addon/behavior_pack/scripts/urce_column_local_decisions.js",
    "addon/behavior_pack/scripts/urce_column_offer_bridge.js",
    "addon/behavior_pack/scripts/urce_source_claim_coverage.js",
    "addon/behavior_pack/scripts/urce_source_scoped_shadow.js",
}

def git(*args):
    return subprocess.run([*GIT,*args], check=True, capture_output=True).stdout

def show(commit,path):
    cmd=subprocess.run([*GIT,"show",commit+":"+path],capture_output=True)
    if cmd.returncode: return None
    return cmd.stdout

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def find():
    commits=git("log","--all","--format=%H","--",MAIN).decode().splitlines()
    inspected=0; main_matches=0; pair_matches=0; shape_matches=[]
    for commit in commits:
        data=show(commit,MAIN)
        if data is None: continue
        inspected+=1
        if sha256(data)!=EXPECTED_MAIN: continue
        main_matches+=1
        guard=show(commit,GUARD)
        if guard is None or sha256(guard)!=EXPECTED_GUARD: continue
        pair_matches+=1
        paths=set(git("ls-tree","-r","--name-only",commit,"--",
                      "addon/behavior_pack").decode().splitlines())
        manifest=show(commit,"addon/behavior_pack/manifest.json")
        if manifest is None: continue
        ver=json.loads(manifest)["header"]["version"]
        shape=(len(paths)==26 and not (ABSENT & paths) and ver==[1,5,8])
        result={
            "commit":commit,
            "bp_files":len(paths),
            "bp_version":ver,
            "all_five_helpers_absent":not bool(ABSENT & paths),
            "both_reported_script_sha256_exact":True,
            "shape_match":shape,
            "rp_files":len(git("ls-tree","-r","--name-only",commit,"--",
                               "addon/resource_pack").decode().splitlines()),
        }
        print("HISTORIC_SOURCE_CANDIDATE",json.dumps(result,sort_keys=True),flush=True)
        if shape:shape_matches.append(commit)
    print("HISTORIC_SOURCE_SCAN",json.dumps({
        "git_main_changes_inspected":inspected,
        "main_hash_matches":main_matches,
        "pair_hash_matches":pair_matches,
        "shape_match_commits":shape_matches,
        "note":"Source-only evidence. No installed LAB file tree, pack registrations or Q4 read."},
        sort_keys=True),flush=True)
    return shape_matches

if __name__=="__main__":
    find()
