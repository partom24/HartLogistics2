"""PG37 owner/anchor census source-only patch synthetic deployment tests.

Never read or mutate an actual LAB, Bedrock world, or production pack.
"""
from __future__ import annotations
import importlib.util
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"candidates/uce"))
spec=importlib.util.spec_from_file_location(
    "uce_pg37_census",ROOT/"candidates/uce/pg37_lab_patch.py")
pg37=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg37)


class PG37PatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=tempfile.TemporaryDirectory(prefix="pg37-source-synthetic-")
        cls.current,cls.previous,cls.wanted,cls.predecessor=pg37.render_pack_pair(
            Path(cls.source.name))
    @classmethod
    def tearDownClass(cls):
        cls.source.cleanup()

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="pg37-LAB-FIXTURE-NOT-REAL-")
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/"LAB-SYNTHETIC"
        self.root.mkdir()
        (self.root/"bedrock_server.exe").write_bytes(b"LAB FIXTURE")
        old=self.root/"worlds"/pg37.pg35.OLD_WORLD
        old.mkdir(parents=True)
        (old/"level.dat").write_bytes(b"historical Q4 world")
        (old/"db").mkdir()
        (old/"db"/"CURRENT").write_bytes(b"Q4_db")
        (self.root/"server.properties").write_bytes(
            b"server-name=TEST\r\nlevel-name=ThomasServer\r\n")
        self.registries={}
        for i,name in enumerate(pg37.pg35.REGISTRY_FILES):
            kind,_,uuid,_=pg37.lab.PACKS[i]
            dest=self.root/pg37.pg35.PACK_FOLDERS[i]
            shutil.copytree(self.current/kind,dest)
            raw=('[{"pack_id":"20dbb8a2-cce7-48d7-8263-b65d160a785f",'
                 '"version":[1,7,3]},{"pack_id":"'+uuid+
                 '","version":[1,5,16]}]').encode("utf-8")
            (old/name).write_bytes(raw)
            self.registries[name]=raw
        pg37.pg35.stage(self.root,self.current,pg37.pg36.PG35_PIN,apply=True)
        new=self.root/"worlds"/pg37.pg35.NEW_WORLD
        new.mkdir()
        (new/"level.dat").write_bytes(b"BDS generated new world")
        (new/"db").mkdir()
        (new/"db"/"CURRENT").write_bytes(b"new_db")
        pg37.pg35.bind(self.root,self.current,pg37.pg36.PG35_PIN,apply=True)
        for i,(kind,_,_,_) in enumerate(pg37.lab.PACKS):
            dest=self.root/pg37.pg35.PACK_FOLDERS[i]
            shutil.rmtree(dest)
            shutil.copytree(self.previous/kind,dest)

    def assert_world_unchanged(self):
        historical=self.root/"worlds"/pg37.pg35.OLD_WORLD
        new=self.root/"worlds"/pg37.pg35.NEW_WORLD
        self.assertEqual((historical/"db"/"CURRENT").read_bytes(),b"Q4_db")
        self.assertEqual((new/"db"/"CURRENT").read_bytes(),b"new_db")
        for name,raw in self.registries.items():
            self.assertEqual((historical/name).read_bytes(),raw)
            self.assertEqual((new/name).read_bytes(),raw)

    def test_only_diagnostics_main_script_differs(self):
        differing={p for p in self.predecessor["behavior_pack"] if
                   self.predecessor["behavior_pack"][p]!=
                   self.wanted["behavior_pack"][p]}
        self.assertEqual(differing,{"scripts/main.js"})
        self.assertEqual(self.predecessor["resource_pack"],
                         self.wanted["resource_pack"])

    def test_guarded_preflight_apply_and_exact_rollback_preserve_two_worlds(self):
        before=(self.root/"server.properties").read_bytes()
        plan=pg37.make_plan(self.root,self.current,self.previous,
            self.wanted,self.predecessor)
        self.assertEqual(len(plan),2)
        self.assert_world_unchanged()
        self.assertEqual((self.root/"server.properties").read_bytes(),before)
        tag=pg37.lab.apply_plan(self.root,plan)
        self.assertTrue(tag.is_dir())
        self.assert_world_unchanged()
        self.assertEqual((self.root/"server.properties").read_bytes(),before)
        for i,(kind,_,_,_) in enumerate(pg37.lab.PACKS):
            self.assertEqual(pg37.lab.hashes(
                self.root/pg37.pg35.PACK_FOLDERS[i]),self.wanted[kind])
        rollback=pg37.make_plan(self.root,self.current,self.previous,
            self.wanted,self.predecessor,rollback_tag=tag.name)
        pg37.lab.apply_plan(self.root,rollback)
        self.assert_world_unchanged()
        for i,(kind,_,_,_) in enumerate(pg37.lab.PACKS):
            self.assertEqual(pg37.lab.hashes(
                self.root/pg37.pg35.PACK_FOLDERS[i]),self.predecessor[kind])

    def test_unknown_installed_script_refuses_without_world_edits(self):
        path=self.root/pg37.pg35.PACK_FOLDERS[0]/"scripts/main.js"
        path.write_bytes(path.read_bytes()+b"\ncorruption")
        with self.assertRaises(pg37.lab.UnsafeLab):
            pg37.make_plan(self.root,self.current,self.previous,
                self.wanted,self.predecessor)
        self.assert_world_unchanged()

    def test_wrong_active_world_and_tampered_registration_refused(self):
        properties=self.root/"server.properties"
        original=properties.read_bytes()
        properties.write_bytes(original.replace(b"HartUCEEmptyLabPG35",
                                             b"ThomasServer"))
        with self.assertRaises(pg37.lab.UnsafeLab):
            pg37.make_plan(self.root,self.current,self.previous,
                self.wanted,self.predecessor)
        properties.write_bytes(original)
        path=self.root/"worlds"/pg37.pg35.NEW_WORLD/pg37.pg35.REGISTRY_FILES[0]
        path.write_bytes(b"[]")
        with self.assertRaises(pg37.lab.UnsafeLab):
            pg37.make_plan(self.root,self.current,self.previous,
                self.wanted,self.predecessor)

    def test_unsafe_cli_refuses_before_server_access(self):
        self.assertEqual(pg37.main(["--commit","a"*40,"--mode","install"]),2)
        self.assertEqual(pg37.main(["--commit","a"*40,"--mode","rollback",
                                    "--apply"]),2)
        self.assertEqual(pg37.main(["--commit","a"*40,"--mode","check",
                                    "--apply"]),2)


if __name__=="__main__":
    unittest.main()
