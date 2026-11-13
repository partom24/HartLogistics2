"""PG42 fresh-only carrier BDS test synthetic world, installer and cleanup.

Permanent test suite for the exact-source LAB safeguards. No real LAB or
production paths are accessed. All BDS worlds are fake on disposable disks.
"""
from __future__ import annotations

from pathlib import Path
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"candidates/uce"))
spec=importlib.util.spec_from_file_location(
    "pg42_carrier_lab_safety",ROOT/"candidates/uce/pg42_lab_patch.py")
pg42=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg42)
switch=pg42.switch
pg35=switch.pg35


class PG42SyntheticSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.built=tempfile.TemporaryDirectory(prefix="pg42-built-source-")
        cls.current,cls.previous,cls.wanted,cls.before=pg42.render_pack_pair(
            Path(cls.built.name)/"packs")
        cls.pin="a"*40

    @classmethod
    def tearDownClass(cls):
        cls.built.cleanup()

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="pg42-FAKE-LAB-")
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/"FAKE-LAB-ONLY"
        self.root.mkdir()
        (self.root/"bedrock_server.exe").write_bytes(b"fake executable")
        self.historical=self.root/"worlds"/pg35.OLD_WORLD
        self.historical.mkdir(parents=True)
        (self.historical/"level.dat").write_bytes(b"immutable prior world level")
        (self.historical/"db").mkdir()
        (self.historical/"db"/"CURRENT").write_bytes(b"immutable old LevelDB")
        self.props=(b"server-name=FAKE\n"
                    b"level-name=ThomasServer\n"
                    b"allow-cheats=false\n")
        (self.root/"server.properties").write_bytes(self.props)
        self.registrations={}
        for i,reg in enumerate(pg35.REGISTRY_FILES):
            kind,_,uuid,_=pg42.lab.PACKS[i]
            installed=self.root/pg35.PACK_FOLDERS[i]
            shutil.copytree(self.previous/kind,installed)
            raw=('[{"pack_id":"20dbb8a2-cce7-48d7-8263-b65d160a785f",'
                 '"version":[1,7,3]},{"pack_id":"'+uuid+
                 '","version":[1,5,16]}]').encode("utf-8")
            (self.historical/reg).write_bytes(raw)
            self.registrations[reg]=raw
        pg35.stage(self.root,self.previous,
                   pg42.pg41.pg40.pg37.pg36.PG35_PIN,apply=True)
        self.pg35world=self.root/"worlds"/pg35.NEW_WORLD
        self.pg35world.mkdir()
        (self.pg35world/"level.dat").write_bytes(b"PG35 original level")
        (self.pg35world/"db").mkdir()
        (self.pg35world/"db"/"CURRENT").write_bytes(b"PG35 untouched custody")
        pg35.bind(self.root,self.previous,
                  pg42.pg41.pg40.pg37.pg36.PG35_PIN,apply=True)
        self.pg35_props=(self.root/"server.properties").read_bytes()
        self.readonly_before={
            str(path.relative_to(self.root)):path.read_bytes()
            for base in (self.historical,self.pg35world)
            for path in base.rglob("*") if path.is_file()
        }

    def assert_preserved(self):
        for name,contents in self.readonly_before.items():
            self.assertEqual((self.root/name).read_bytes(),contents,name)

    def stage_new_world(self):
        result=switch.stage(self.root,self.previous,self.pin,apply=True)
        self.assertEqual(result["phase"],"STAGED")
        new=self.root/"worlds"/switch.NEW_WORLD
        new.mkdir()
        (new/"level.dat").write_bytes(b"new BDS generated level")
        (new/"db").mkdir()
        (new/"db"/"CURRENT").write_bytes(b"new BDS generated LevelDB")
        self.assert_preserved()
        return new

    def bind_new_world(self):
        new=self.stage_new_world()
        result=switch.bind(self.root,self.previous,self.pin,apply=True)
        self.assertEqual(result["phase"],"BOUND")
        self.assertTrue(switch.verify_bound(self.root,self.pin))
        self.assert_preserved()
        return new

    def test_pg42_probe_only_main_script_changed_from_installed_pg41(self):
        changes={name for name in self.wanted["behavior_pack"] if
                 self.before["behavior_pack"][name]!=
                 self.wanted["behavior_pack"][name]}
        self.assertEqual(changes,{"scripts/main.js"})
        self.assertEqual(self.wanted["resource_pack"],self.before["resource_pack"])
        for name in ("entities/uce_native_carrier.json",
                     "recipes/bulk_storage.json",
                     "scripts/uce/unified_carrier_registry.js",
                     "scripts/uce/unified_native_custody.js"):
            self.assertEqual(
                (self.previous/"behavior_pack"/name).read_bytes(),
                (self.current/"behavior_pack"/name).read_bytes())
        main=(self.current/"behavior_pack/scripts/main.js").read_text(
            encoding="utf-8")
        self.assertIn("TEMP_TEST:PG42-CARRIER",main)
        self.assertIn("PG40 FORENSIC HOLD",main)
        self.assertIn("if(UCE_PG40_FORENSIC_FREEZE)return true;",main)
        self.assertIn("hartlogistics:pg42_spawn",main)
        self.assertIn("hartlogistics:pg42_audit",main)
        checked=subprocess.run(["node","--check","--input-type=module"],
            text=True,input=main,capture_output=True)
        self.assertEqual(checked.returncode,0,checked.stderr)

    def test_source_only_staging_check_preserves_exact_pg35(self):
        out=switch.stage(self.root,self.previous,self.pin,apply=False)
        self.assertEqual(out["phase"],"READY_TO_STAGE")
        self.assertEqual((self.root/"server.properties").read_bytes(),
                         self.pg35_props)
        self.assertFalse((self.root/"worlds"/switch.NEW_WORLD).exists())
        self.assert_preserved()

    def test_stage_bind_install_rollback_and_restore_preserve_old_worlds(self):
        new=self.bind_new_world()
        plan=pg42.make_plan(self.root,self.current,self.previous,
                            self.wanted,self.before,self.pin)
        self.assertEqual(len(plan),2)
        backup=pg42.lab.apply_plan(self.root,plan)
        self.assertTrue(backup.is_dir())
        self.assert_preserved()
        self.assertEqual(
            (new/"db"/"CURRENT").read_bytes(),b"new BDS generated LevelDB")
        # Restoration must FAIL while the temporary probe is still present.
        with self.assertRaises(pg42.lab.UnsafeLab):
            switch.restore(self.root,self.previous,self.pin,apply=True)
        self.assert_preserved()
        undo=pg42.make_plan(self.root,self.current,self.previous,
                            self.wanted,self.before,self.pin,
                            backup_tag=backup.name)
        pg42.lab.apply_plan(self.root,undo)
        for i,(kind,_,_,_) in enumerate(pg42.lab.PACKS):
            installed=self.root/pg35.PACK_FOLDERS[i]
            self.assertEqual(pg42.lab.hashes(installed),self.before[kind])
        restored=switch.restore(self.root,self.previous,self.pin,apply=True)
        self.assertEqual(restored["phase"],"RESTORED")
        self.assertEqual((self.root/"server.properties").read_bytes(),
                         self.pg35_props)
        self.assert_preserved()
        self.assertEqual((new/"db"/"CURRENT").read_bytes(),
                         b"new BDS generated LevelDB")

    def test_tampered_old_world_or_generated_world_is_refused(self):
        self.pg35world.joinpath(pg35.REGISTRY_FILES[0]).write_bytes(b"[]")
        with self.assertRaises(pg42.lab.UnsafeLab):
            switch.stage(self.root,self.previous,self.pin,apply=True)
        self.assertFalse((self.root/"worlds"/switch.NEW_WORLD).exists())
        self.assert_preserved_except_old_registry()

    def assert_preserved_except_old_registry(self):
        for name,contents in self.readonly_before.items():
            if name.endswith(pg35.NEW_WORLD+"/"+pg35.REGISTRY_FILES[0]):
                continue
            self.assertEqual((self.root/name).read_bytes(),contents)

    def test_probe_cannot_install_in_pg35_or_without_world_binding(self):
        with self.assertRaises(pg42.lab.UnsafeLab):
            pg42.make_plan(self.root,self.current,self.previous,
                           self.wanted,self.before,self.pin)
        new=self.stage_new_world()
        with self.assertRaises(pg42.lab.UnsafeLab):
            pg42.make_plan(self.root,self.current,self.previous,
                           self.wanted,self.before,self.pin)
        self.assertFalse((new/pg35.REGISTRY_FILES[0]).exists())
        self.assert_preserved()

    def test_unknown_pack_hash_never_overwritten(self):
        self.bind_new_world()
        pack=self.root/pg35.PACK_FOLDERS[0]/"scripts/main.js"
        pack.write_bytes(pack.read_bytes()+b"\ntampered")
        with self.assertRaises(pg42.lab.UnsafeLab):
            pg42.make_plan(self.root,self.current,self.previous,
                           self.wanted,self.before,self.pin)
        self.assert_preserved()

    def test_switch_duplicate_target_and_tampered_property_refuse(self):
        new=self.root/"worlds"/switch.NEW_WORLD
        new.mkdir()
        with self.assertRaises(pg42.lab.UnsafeLab):
            switch.stage(self.root,self.previous,self.pin,apply=True)
        new.rmdir()
        self.stage_new_world()
        properties=self.root/"server.properties"
        properties.write_bytes(properties.read_bytes()+b"# unsafe\n")
        with self.assertRaises(pg42.lab.UnsafeLab):
            switch.bind(self.root,self.previous,self.pin,apply=True)
        self.assert_preserved()

    def test_actual_lab_cli_mutations_require_correct_mode_and_commit(self):
        for opts in (
            ["--commit","not-a-sha","--mode","plan"],
            ["--commit",self.pin,"--mode","install"],
            ["--commit",self.pin,"--mode","check","--apply"],
            ["--commit",self.pin,"--mode","rollback","--apply"],
        ):
            self.assertEqual(pg42.main(opts),2)
        for opts in (
            ["--commit",self.pin,"--mode","stage"],
            ["--commit",self.pin,"--mode","bind"],
            ["--commit",self.pin,"--mode","check","--apply"],
        ):
            self.assertEqual(switch.main(opts),2)


if __name__=="__main__":
    unittest.main()
