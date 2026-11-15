"""Exact installed 1.4.1 performance predecessor allowlist.

Only the owner's observed two-change scripts/main.js SHA is accepted.
All other 71 files, both manifest IDs, the baseline source and the
rollback backup remain byte-for-byte enforced. No BDS or world access.
"""
from __future__ import annotations
import ast
import contextlib
import io
import json
import tempfile
import types
import unittest
from pathlib import Path

SOURCE=Path(__file__).resolve().parents[1]/"candidates/uce/perf_flat_attach.py"
BASE="6be6be0c22fd3d6694feb7cb25e642eaa62bed667c17045be57ce4268293c461"
PATCH="f0340e332025790c12f986eb1e126836333f7907883b7983b415381ac86e944d"

class Refused(Exception):
    pass

class PredecessorTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory(prefix="hl2-perf-allowlist-test-")
        self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)/"lab"
        self.repo=Path(temp.name)/"repo"
        self.names=("behavior_pack","resource_pack")
        self.paths=(
            self.root/"behavior_packs/HartMods_HartLogistics_BP",
            self.root/"resource_packs/HartMods_HartLogistics_RP")
        self.regs=(
            self.root/"worlds/HartLogistics15PerfFlat/world_behavior_packs.json",
            self.root/"worlds/HartLogistics15PerfFlat/world_resource_packs.json")
        self.uuid=("bp-uuid","rp-uuid")
        self.packs=(
            ("behavior_pack","behavior_packs","bp-uuid","world_behavior_packs.json"),
            ("resource_pack","resource_packs","rp-uuid","world_resource_packs.json"))
        self.baseline={
            "behavior_pack":{"manifest.json":"m0","scripts/main.js":BASE,
                             "blocks/sorter.json":"sorter","blocks/receiver.json":"receiver"},
            "resource_pack":{"manifest.json":"r0","textures/terrain_texture.json":"terrain"}}
        self.observed={
            "behavior_pack":{**self.baseline["behavior_pack"],"scripts/main.js":PATCH},
            "resource_pack":dict(self.baseline["resource_pack"])}
        for p,u in zip(self.paths,self.uuid):
            p.mkdir(parents=True)
            (p/"manifest.json").write_text(
                json.dumps({"header":{"uuid":u,"version":[1,4,1]}}),encoding="utf-8")
        self.hash_map={}
        self._reset_hash_map()
        self.denied="Installed legacy pack differs from immutable baseline: behavior_pack"
        self.common=types.SimpleNamespace(
            PACK_DIRS=("behavior_packs/HartMods_HartLogistics_BP",
                       "resource_packs/HartMods_HartLogistics_RP"),
            pack_targets=lambda root:self._block_common())
        self.lab=types.SimpleNamespace(
            UnsafeLab=Refused,
            validate_source=lambda root:(1,4,1),
            hashes=lambda path:dict(self.hash_map[str(path)]),
            assert_no_link=lambda path:None,
            v3=lambda xs:tuple(xs),
            PACKS=self.packs)
        tree=ast.parse(SOURCE.read_text(encoding="utf-8"))
        names={"exact_perf_141_pack_hashes","targets","install_plan","rollback_plan"}
        chosen=[n for n in tree.body if (
            isinstance(n,ast.FunctionDef) and n.name in names) or (
            isinstance(n,ast.Assign) and len(n.targets)==1 and
            isinstance(n.targets[0],ast.Name) and
            n.targets[0].id in (
                "PERF_141_BASE_MAIN_SHA256",
                "PERF_141_PATCHED_MAIN_SHA256"))]
        self.assertEqual(len(chosen),len(names)+2)
        self.env={
            "ROOT":self.repo,"lab":self.lab,"common":self.common,
            "read":lambda base,relative:(base/relative).read_bytes(),
            "report_legacy_pack_diff":lambda root:None,
            "check_stage":lambda root:self.regs[0].parent,
            "parse_registry":lambda raw:json.loads(raw),
            "VERSION":(1,5,16),"REGS":(self.regs[0].name,self.regs[1].name),
            "re":__import__("re"),"json":json,
        }
        exec(compile(ast.Module(body=chosen,type_ignores=[]),str(SOURCE),"exec"),self.env)

    def _reset_hash_map(self):
        self.hash_map={
            str(self.repo/"addon"/k):dict(self.baseline[k])
            for k in self.names
        }
        self.hash_map.update({
            str(self.paths[i]):dict(self.observed[k])
            for i,k in enumerate(self.names)
        })

    def _block_common(self):
        raise Refused(self.denied)

    def test_live_installer_sha_constants_match_observed_64_digit_hashes(self):
        # This reads the real source constants, never substitutes test values.
        # The earlier test injected a 64-character value and hid a bad
        # 59-character constant in the actual production installer.
        self.assertEqual(self.env["PERF_141_BASE_MAIN_SHA256"],BASE)
        self.assertEqual(self.env["PERF_141_PATCHED_MAIN_SHA256"],PATCH)
        self.assertEqual(len(PATCH),64)
        self.assertEqual(len(self.env["PERF_141_PATCHED_MAIN_SHA256"]),64)

    def test_patched_predecessor_accepted_only_at_exact_sha(self):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            paths=self.env["targets"](self.root)
        self.assertEqual(paths,list(self.paths))
        self.assertIn("72-file",out.getvalue())
        plans,missing=self.env["install_plan"](self.root,self.repo/"generated",
                                                {k:{"manifest.json":"new"} for k in self.names})
        self.assertEqual(missing,list(self.regs))
        self.assertEqual(plans[0]["old_hashes"]["scripts/main.js"],PATCH)
        self.assertEqual(plans[1]["old_hashes"],self.baseline["resource_pack"])
        self.assertEqual(json.loads(plans[0]["new_registry"])[0]["version"],[1,5,16])

    def test_wrong_main_and_other_file_refuse(self):
        for key,value in (("scripts/main.js","0"*64),("blocks/sorter.json","other")):
            with self.subTest(file=key):
                self.hash_map[str(self.paths[0])][key]=value
                with self.assertRaisesRegex(Refused,"not the exact single-file"):
                    self.env["targets"](self.root)
                self.hash_map[str(self.paths[0])]=dict(self.observed["behavior_pack"])

    def test_resource_pack_or_baseline_source_changes_refuse(self):
        self.hash_map[str(self.paths[1])]["textures/terrain_texture.json"]="other"
        with self.assertRaisesRegex(Refused,"not the exact single-file"):
            self.env["targets"](self.root)
        self.hash_map[str(self.paths[1])]=dict(self.observed["resource_pack"])
        self.hash_map[str(self.repo/"addon"/"behavior_pack")]["scripts/main.js"]="other"
        with self.assertRaisesRegex(Refused,"Frozen original"):
            self.env["targets"](self.root)

    def test_mixed_versions_and_unrelated_guard_failure_refuse(self):
        (self.paths[1]/"manifest.json").write_text(
            json.dumps({"header":{"uuid":self.uuid[1],"version":[1,5,16]}}))
        with self.assertRaisesRegex(Refused,"UUID/version"):
            self.env["targets"](self.root)
        (self.paths[1]/"manifest.json").write_text(
            json.dumps({"header":{"uuid":self.uuid[1],"version":[1,4,1]}}))
        self.common.pack_targets=lambda root:(_ for _ in ()).throw(Refused("Unexpected registry"))
        with self.assertRaisesRegex(Refused,"Unexpected registry"):
            self.env["targets"](self.root)

    def test_rollback_requires_original_patched_141_hash_not_frozen_baseline(self):
        # After successful install the UCE product is current and its exact
        # staged predecessor lives in the isolated backup/pack-0,pack-1.
        self.common.pack_targets=lambda root:list(self.paths)
        product={k:{"manifest.json":"product-"+k} for k in self.names}
        for i,k in enumerate(self.names):
            self.hash_map[str(self.paths[i])]=dict(product[k])
        for p,u in zip(self.paths,self.uuid):
            (p/"manifest.json").write_text(
                json.dumps({"header":{"uuid":u,"version":[1,5,16]}}))
        for i,reg in enumerate(self.regs):
            reg.parent.mkdir(parents=True,exist_ok=True)
            reg.write_text(json.dumps([{"pack_id":self.uuid[i],"version":[1,5,16]}]))
        tag="lab-123456abcdef"
        backup=self.root/"_HartLogisticsDeployBackups"/tag
        for i,k in enumerate(self.names):
            (backup/f"pack-{i}").mkdir(parents=True)
            (backup/f"registry-{i}.bin").write_bytes(b"[]\n")
            self.hash_map[str(backup/f"pack-{i}")]=dict(self.observed[k])
        plan=self.env["rollback_plan"](self.root,self.repo/"generated",product,tag)
        self.assertEqual(plan[0]["files"]["scripts/main.js"],PATCH)
        self.hash_map[str(backup/"pack-0")]["scripts/main.js"]=BASE
        with self.assertRaisesRegex(Refused,"performance-patched"):
            self.env["rollback_plan"](self.root,self.repo/"generated",product,tag)

if __name__=="__main__":unittest.main()
