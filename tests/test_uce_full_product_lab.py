"""Integrated full-product LAB handoff synthetic protection and rollback.

All fixtures live in temporary directories. The test suite never accesses
the owner's BDS root, world ZIP, network shares or production files.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"candidates/uce"))

fixture_spec = importlib.util.spec_from_file_location(
    "hl2_historical_pg42_fixture",ROOT/"tests/test_uce_pg42_carrier_lab.py")
fixture_module = importlib.util.module_from_spec(fixture_spec)
fixture_spec.loader.exec_module(fixture_module)
Historical = fixture_module.PG42SyntheticSafety

spec = importlib.util.spec_from_file_location(
    "hl2_full_product_lab",ROOT/"candidates/uce/full_product_lab.py")
full = importlib.util.module_from_spec(spec)
spec.loader.exec_module(full)
pg42 = full.pg42
lab = full.lab


class FullProductLabSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Historical.setUpClass()
        cls.build = tempfile.TemporaryDirectory(prefix="hl2-full-product-build-")
        root = Path(cls.build.name)
        cls.pg33 = root/"pg33"
        full.uce_deploy.pg33.prepare(cls.pg33)
        cls.product = root/"product"
        full.uce.prepare(cls.product)
        cls.product_hashes = full.uce_deploy.check_candidate(cls.product,cls.pg33)
        cls.pin = "b"*40

    @classmethod
    def tearDownClass(cls):
        cls.build.cleanup()
        Historical.tearDownClass()

    def setUp(self):
        self.fixture = Historical(methodName=
            "test_pg42_probe_only_main_script_changed_from_installed_pg41")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.fixture.bind_new_world()
        plan = pg42.make_plan(self.root,self.fixture.current,
            self.fixture.previous,self.fixture.wanted,self.fixture.before,
            self.fixture.pin)
        pg42.lab.apply_plan(self.root,plan)
        self.original_props = (self.root/"server.properties").read_bytes()
        self.preserved = {
            str(p.relative_to(self.root)):p.read_bytes()
            for world in (full.pg35.OLD_WORLD,full.pg35.NEW_WORLD,full.OLD_WORLD)
            for p in (self.root/"worlds"/world).rglob("*") if p.is_file()
        }
        self.assertEqual(
            full.check_pg42_source(self.root,self.fixture.wanted),
            self.fixture.registrations)

    def assert_historical_preserved(self):
        for path, raw in self.preserved.items():
            self.assertEqual((self.root/path).read_bytes(),raw,path)

    def staged(self):
        self.assertEqual(full.stage(self.root,self.fixture.wanted,self.pin),
                         {"phase":"READY_TO_STAGE","world":full.NEW_WORLD})
        self.assertEqual(full.stage(
            self.root,self.fixture.wanted,self.pin,apply=True)["phase"],"STAGED")
        self.assert_historical_preserved()

    def bound(self):
        self.staged()
        new = self.root/"worlds"/full.NEW_WORLD
        with self.assertRaises(lab.UnsafeLab):
            full.bind(self.root,self.pin,self.fixture.wanted,apply=True)
        new.mkdir()
        (new/"level.dat").write_bytes(b"new BDS generated integrated world")
        (new/"db").mkdir()
        (new/"db"/"CURRENT").write_bytes(b"distinct integrated LevelDB")
        self.assertEqual(full.bind(
            self.root,self.pin,self.fixture.wanted)["phase"],"READY_TO_BIND")
        self.assertEqual(full.bind(
            self.root,self.pin,self.fixture.wanted,apply=True)["phase"],"BOUND")
        self.assert_historical_preserved()
        return new

    def installed(self):
        new = self.bound()
        plan = full.bound_plan(self.root,self.pin,self.fixture.wanted,
                               self.product_hashes,self.product)
        self.assertEqual(len(plan),2)
        backup = lab.apply_plan(self.root,plan)
        for i,(kind,_,_,_) in enumerate(lab.PACKS):
            self.assertEqual(lab.hashes(self.root/full.PACK_DIRS[i]),
                             self.product_hashes[kind])
        self.assert_historical_preserved()
        self.assertEqual((new/"db"/"CURRENT").read_bytes(),
                         b"distinct integrated LevelDB")
        return new, backup

    def test_product_source_excludes_historical_pg42_probe(self):
        self.assertNotEqual(self.fixture.wanted,self.product_hashes)
        newmain=(self.product/"behavior_pack/scripts/main.js").read_text()
        oldmain=(self.fixture.current/"behavior_pack/scripts/main.js").read_text()
        self.assertIn("TEMP_TEST:PG42-CARRIER",oldmain)
        self.assertNotIn("TEMP_TEST:PG42-CARRIER",newmain)
        self.assertNotIn("UCE_PG40_FORENSIC_FREEZE",newmain)
        self.assertIn("function uceUnifiedServiceTick(){",newmain)

    def test_stage_refuses_collision_and_tampered_installed_probe(self):
        new=self.root/"worlds"/full.NEW_WORLD
        new.mkdir()
        with self.assertRaises(lab.UnsafeLab):
            full.stage(self.root,self.fixture.wanted,self.pin,apply=True)
        new.rmdir()
        main=self.root/full.PACK_DIRS[0]/"scripts/main.js"
        main.write_bytes(main.read_bytes()+b"\ntampered")
        with self.assertRaises(lab.UnsafeLab):
            full.stage(self.root,self.fixture.wanted,self.pin,apply=True)
        self.assertEqual((self.root/"server.properties").read_bytes(),
                         self.original_props)

    def test_staged_world_requires_bds_generation_and_exact_source(self):
        self.staged()
        with self.assertRaises(lab.UnsafeLab):
            full.bound_plan(self.root,self.pin,self.fixture.wanted,
                            self.product_hashes,self.product)
        with self.assertRaises(lab.UnsafeLab):
            full.stage_proof(self.root,"c"*40)
        properties=self.root/"server.properties"
        properties.write_bytes(properties.read_bytes()+b"unexpected=1\n")
        with self.assertRaises(lab.UnsafeLab):
            full.bind(self.root,self.pin,self.fixture.wanted,apply=True)
        self.assert_historical_preserved()

    def test_bind_refuses_probe_pack_drift_and_duplicate_registration(self):
        self.staged()
        new=self.root/"worlds"/full.NEW_WORLD
        new.mkdir()
        (new/"level.dat").write_bytes(b"BDS")
        (new/"db").mkdir()
        (new/"db"/"CURRENT").write_bytes(b"leveldb")
        (new/full.REGS[0]).write_bytes(b"[]")
        with self.assertRaises(lab.UnsafeLab):
            full.bind(self.root,self.pin,self.fixture.wanted,apply=True)
        (new/full.REGS[0]).unlink()
        main=self.root/full.PACK_DIRS[0]/"scripts/main.js"
        main.write_bytes(main.read_bytes()+b"changed")
        with self.assertRaises(lab.UnsafeLab):
            full.bind(self.root,self.pin,self.fixture.wanted,apply=True)
        self.assert_historical_preserved()

    def test_full_install_then_exact_rollback_then_restore(self):
        new, backup = self.installed()
        with self.assertRaises(lab.UnsafeLab):
            full.restore(self.root,self.pin,self.fixture.wanted,apply=True)
        undo = full.bound_plan(
            self.root,self.pin,self.fixture.wanted,self.product_hashes,
            self.product,rollback_tag=backup.name)
        self.assertEqual(len(undo),2)
        lab.apply_plan(self.root,undo)
        restored=full.restore(
            self.root,self.pin,self.fixture.wanted,apply=True)
        self.assertEqual(restored["phase"],"RESTORED")
        self.assertEqual((self.root/"server.properties").read_bytes(),
                         self.original_props)
        self.assert_historical_preserved()
        self.assertEqual((new/"db"/"CURRENT").read_bytes(),
                         b"distinct integrated LevelDB")
        for i,(kind,_,_,_) in enumerate(lab.PACKS):
            self.assertEqual(lab.hashes(self.root/full.PACK_DIRS[i]),
                             self.fixture.wanted[kind])

    def test_rollback_refuses_bad_backup_and_changed_live_pack(self):
        _, backup = self.installed()
        with self.assertRaises(lab.UnsafeLab):
            full.bound_plan(self.root,self.pin,self.fixture.wanted,
                            self.product_hashes,self.product,
                            rollback_tag="lab-doesnotexist")
        # A damaged backup can never be replayed over a current pack.
        saved=backup/"pack-0"/"scripts/main.js"
        saved.write_bytes(saved.read_bytes()+b"BAD")
        with self.assertRaises(lab.UnsafeLab):
            full.bound_plan(self.root,self.pin,self.fixture.wanted,
                            self.product_hashes,self.product,
                            rollback_tag=backup.name)
        self.assert_historical_preserved()

    def test_actual_cli_refuses_bad_modes_before_world_access(self):
        for argv in (
            ["--mode","stage","--commit","invalid","--apply"],
            ["--mode","stage","--commit",self.pin],
            ["--mode","check-stage","--commit",self.pin,"--apply"],
            ["--mode","rollback","--commit",self.pin,"--apply"],
            ["--mode","check-rollback","--commit",self.pin],
            ["--mode","plan","--commit",self.pin,"--backup-tag","lab-1234567890ab"],
        ):
            self.assertEqual(full.main(argv),2)


if __name__ == "__main__":
    unittest.main()
