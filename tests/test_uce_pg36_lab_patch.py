"""PG36 exact-source same-version UCE patch, entirely synthetic.
Requires git availability of the pinned PG35 commit for old-source derivation.
No actual LAB or world files are ever accessed by these tests.
"""
import importlib.util
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"candidates/uce"))
spec=importlib.util.spec_from_file_location(
    "uce_pg36_patch",ROOT/"candidates/uce/pg36_lab_patch.py")
pg36=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg36)


class PG36PatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_temp=tempfile.TemporaryDirectory(prefix="pg36-synthetic-source-")
        cls.generated,cls.prior,cls.desired,cls.earlier=pg36.render_pack_pair(
            Path(cls.source_temp.name))

    @classmethod
    def tearDownClass(cls):
        cls.source_temp.cleanup()

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="pg36-synthetic-lab-")
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/"NOT_THE_REAL_LAB"
        self.root.mkdir()
        (self.root/"bedrock_server.exe").write_bytes(b"synthetic")
        old=self.root/"worlds"/pg36.pg35.OLD_WORLD
        old.mkdir(parents=True)
        (old/"level.dat").write_bytes(b"preexisting Q4 WORLD")
        (old/"db").mkdir()
        (old/"db"/"CURRENT").write_bytes(b"Q4 WORLD DATABASE")
        self.q4db=(old/"db"/"CURRENT").read_bytes()
        (self.root/"server.properties").write_bytes(
            b"server-name=PG36-FIXTURE\r\nlevel-name=ThomasServer\r\n"
            b"allow-cheats=false\r\n")
        self.regs={}
        for i,name in enumerate(pg36.pg35.REGISTRY_FILES):
            kind,_,uuid,_=pg36.lab.PACKS[i]
            dest=self.root/pg36.pg35.PACK_FOLDERS[i]
            shutil.copytree(self.generated/kind,dest)
            raw=('[\n  {"pack_id":"20dbb8a2-cce7-48d7-8263-b65d160a785f",'
                 '"version":[1,7,3]},\n  {"pack_id":"'+uuid+
                 '","version":[1,5,16]}\n]\n').encode("utf-8")
            (old/name).write_bytes(raw)
            self.regs[name]=raw
        pg36.pg35.stage(self.root,self.generated,pg36.PG35_PIN,apply=True)
        new=self.root/"worlds"/pg36.pg35.NEW_WORLD
        new.mkdir()
        (new/"level.dat").write_bytes(b"BDS GENERATED NEW WORLD")
        (new/"db").mkdir()
        (new/"db"/"CURRENT").write_bytes(b"NEW WORLD DATABASE")
        pg36.pg35.bind(self.root,self.generated,pg36.PG35_PIN,apply=True)
        for i,(kind,_,_,_) in enumerate(pg36.lab.PACKS):
            dest=self.root/pg36.pg35.PACK_FOLDERS[i]
            shutil.rmtree(dest)
            shutil.copytree(self.prior/kind,dest)

    def assert_originals(self):
        old=self.root/"worlds"/pg36.pg35.OLD_WORLD
        new=self.root/"worlds"/pg36.pg35.NEW_WORLD
        self.assertEqual((old/"level.dat").read_bytes(),b"preexisting Q4 WORLD")
        self.assertEqual((old/"db"/"CURRENT").read_bytes(),self.q4db)
        for name,raw in self.regs.items():
            self.assertEqual((old/name).read_bytes(),raw)
            self.assertEqual((new/name).read_bytes(),raw)
        self.assertEqual((new/"db"/"CURRENT").read_bytes(),b"NEW WORLD DATABASE")

    def test_historical_git_text_decoded_as_utf8_on_windows(self):
        # Python subprocess default text encoding on Windows is not guaranteed
        # UTF-8. It previously mojibaked the two runtime scripts when
        # recreating the exact installed PG35 predecessor.
        original=pg36.historical("candidates/uce/runtime_bridge.js")
        self.assertIn("§c[Collector]",original)
        self.assertNotIn("Â§",original)
        rebuilt=(self.prior/"behavior_pack/scripts/main.js").read_text(
            encoding="utf-8")
        self.assertIn("§c[Collector]",rebuilt)
        self.assertNotIn("Â§",rebuilt)

    def test_only_two_bedrock_script_paths_change_and_no_resource_or_manifest(self):
        changed={p for p in self.earlier["behavior_pack"]
            if self.earlier["behavior_pack"][p]!=self.desired["behavior_pack"][p]}
        self.assertEqual(changed,pg36.CHANGED_BP)
        self.assertEqual(self.desired["resource_pack"],
                         self.earlier["resource_pack"])

    def test_exact_current_pack_readonly_preflight_and_guarded_apply_rollback(self):
        original_props=(self.root/"server.properties").read_bytes()
        plan=pg36.make_plan(self.root,self.generated,self.prior,
                             self.desired,self.earlier)
        self.assertEqual(len(plan),2)
        self.assert_originals()
        for i,item in enumerate(plan):
            self.assertEqual(pg36.lab.hashes(item["target"]),
                             self.earlier[pg36.lab.PACKS[i][0]])
        backup=pg36.lab.apply_plan(self.root,plan)
        self.assertTrue(backup.is_dir())
        self.assert_originals()
        self.assertEqual((self.root/"server.properties").read_bytes(),original_props)
        for i,item in enumerate(plan):
            self.assertEqual(pg36.lab.hashes(item["target"]),
                             self.desired[pg36.lab.PACKS[i][0]])
        undo=pg36.make_plan(self.root,self.generated,self.prior,
            self.desired,self.earlier,rollback_tag=backup.name)
        pg36.lab.apply_plan(self.root,undo)
        self.assert_originals()
        for i,item in enumerate(plan):
            self.assertEqual(pg36.lab.hashes(item["target"]),
                             self.earlier[pg36.lab.PACKS[i][0]])

    def test_changed_active_world_selection_or_old_q4_registration_refused(self):
        props=self.root/"server.properties"
        previous=props.read_bytes()
        props.write_bytes(previous.replace(b"HartUCEEmptyLabPG35",
                                            b"ThomasServer"))
        with self.assertRaises(pg36.lab.UnsafeLab):
            pg36.make_plan(self.root,self.generated,self.prior,
                           self.desired,self.earlier)
        props.write_bytes(previous)
        old=self.root/"worlds"/pg36.pg35.OLD_WORLD
        name=pg36.pg35.REGISTRY_FILES[0]
        (old/name).write_bytes(self.regs[name]+b"\n")
        with self.assertRaises(pg36.lab.UnsafeLab):
            pg36.make_plan(self.root,self.generated,self.prior,
                           self.desired,self.earlier)

    def test_modified_predecessor_pack_refused_without_writes(self):
        target=self.root/pg36.pg35.PACK_FOLDERS[0]/"scripts/main.js"
        target.write_bytes(target.read_bytes()+b"\nTAMPER")
        with self.assertRaises(pg36.lab.UnsafeLab):
            pg36.make_plan(self.root,self.generated,self.prior,
                           self.desired,self.earlier)
        self.assert_originals()

    def test_new_world_registration_mismatch_refused(self):
        world=self.root/"worlds"/pg36.pg35.NEW_WORLD
        name=pg36.pg35.REGISTRY_FILES[0]
        (world/name).write_bytes(b'[]')
        with self.assertRaises(pg36.lab.UnsafeLab):
            pg36.make_plan(self.root,self.generated,self.prior,
                           self.desired,self.earlier)

    def test_unsafe_cli_modes_refuse_before_live_server_access(self):
        self.assertEqual(pg36.main(["--commit","a"*40,"--mode","install"]),2)
        self.assertEqual(pg36.main(["--commit","a"*40,"--mode","rollback",
                                    "--apply"]),2)
        self.assertEqual(pg36.main(["--commit","a"*40,"--mode","check",
                                    "--apply"]),2)


if __name__=="__main__":
    unittest.main()
