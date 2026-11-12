"""PG35 synthetic-only LAB world-switch safety contract: never access real BDS."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "candidates/uce"))
spec = importlib.util.spec_from_file_location(
    "uce_pg35_world_switch", ROOT / "candidates/uce/lab_world_switch.py")
switch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(switch)
PIN = "1" * 40


class PG35WorldSwitchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_temp = tempfile.TemporaryDirectory(prefix="pg35-sources-")
        path = Path(cls.source_temp.name)
        cls.old, cls.built = path / "pg33", path / "uce"
        switch.uce_deploy.pg33.prepare(cls.old)
        switch.uce_deploy.uce.prepare(cls.built)
        switch.uce_deploy.check_candidate(cls.built, cls.old)

    @classmethod
    def tearDownClass(cls):
        cls.source_temp.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pg35-synthetic-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "LAB-FIXTURE-ONLY"
        self.root.mkdir()
        historic = self.root / "worlds" / switch.OLD_WORLD
        historic.mkdir(parents=True)
        (historic / "level.dat").write_bytes(b"historical-world-NOT-TOUCH")
        (historic / "db").mkdir()
        (historic / "db" / "CURRENT").write_bytes(b"old-db")
        self.old_level = (historic / "level.dat").read_bytes()
        self.props = (b"\xef\xbb\xbfserver-name=Lab Fixture\r\n"
                      b"gamemode=survival\r\n"
                      b"level-name=ThomasServer\r\n"
                      b"allow-cheats=false\r\n")
        (self.root / "server.properties").write_bytes(self.props)
        self.registries = {}
        for i, reg in enumerate(switch.REGISTRY_FILES):
            kind, packdir, uuid, _ = switch.lab.PACKS[i]
            dest = self.root / switch.PACK_FOLDERS[i]
            shutil.copytree(self.built / kind, dest)
            # Make sure HartBots and another mod are preserved byte-for-byte
            raw = (('[\n  {"pack_id":"20dbb8a2-cce7-48d7-8263-b65d160a785f",'
                    '"version":[1,7,3]},\n  {"pack_id":"' + uuid
                   + '","version":[1,5,16]}\n]\n').encode("utf-8"))
            (historic / reg).write_bytes(raw)
            self.registries[reg] = raw

    def gen_world(self):
        new = self.root / "worlds" / switch.NEW_WORLD
        new.mkdir()
        (new / "level.dat").write_bytes(b"NEW BDS level.dat")
        (new / "db").mkdir()
        (new / "db" / "CURRENT").write_bytes(b"CURRENT")
        return new

    def test_readonly_check_changes_no_world_or_server_files(self):
        outcome = switch.stage(self.root, self.built, PIN, apply=False)
        self.assertEqual(outcome["phase"], "READY_TO_STAGE")
        self.assertEqual((self.root / "server.properties").read_bytes(), self.props)
        self.assertFalse((self.root / switch.BACKUP_FOLDER).exists())
        self.assertFalse((self.root / "worlds" / switch.NEW_WORLD).exists())

    def test_stage_copies_only_recovery_evidence_and_changes_one_property(self):
        outcome = switch.stage(self.root, self.built, PIN, apply=True)
        self.assertEqual(outcome["phase"], "STAGED")
        current = (self.root / "server.properties").read_bytes()
        self.assertEqual(current, self.props.replace(
            b"level-name=ThomasServer", b"level-name=HartUCEEmptyLabPG35"))
        self.assertEqual((self.root / "worlds" /
                          switch.OLD_WORLD / "level.dat").read_bytes(), self.old_level)
        for reg, raw in self.registries.items():
            self.assertEqual((self.root / "worlds" /
                              switch.OLD_WORLD / reg).read_bytes(), raw)
            self.assertEqual((switch.backup_folder(self.root) / reg).read_bytes(), raw)
        self.assertEqual((switch.backup_folder(self.root) /
                          "server.properties").read_bytes(), self.props)

    def test_bind_requires_new_bds_world_and_preserves_all_original_registrations(self):
        switch.stage(self.root, self.built, PIN, apply=True)
        with self.assertRaises(switch.lab.UnsafeLab):
            switch.bind(self.root, self.built, PIN, apply=True)
        new = self.gen_world()
        result = switch.bind(self.root, self.built, PIN, apply=False)
        self.assertEqual(result["phase"], "READY_TO_BIND")
        self.assertFalse((new / "world_behavior_packs.json").exists())
        result = switch.bind(self.root, self.built, PIN, apply=True)
        self.assertEqual(result["phase"], "BOUND")
        for reg, raw in self.registries.items():
            self.assertEqual((new / reg).read_bytes(), raw)
        self.assertFalse((new / "hartsorter:q4m_q1").exists())
        self.assertEqual((new / "db" / "CURRENT").read_bytes(), b"CURRENT")

    def test_restore_selects_historical_world_without_deleting_new_world(self):
        switch.stage(self.root, self.built, PIN, apply=True)
        new = self.gen_world()
        switch.bind(self.root, self.built, PIN, apply=True)
        result = switch.restore(self.root, PIN, apply=True)
        self.assertEqual(result["phase"], "RESTORED")
        self.assertEqual((self.root / "server.properties").read_bytes(), self.props)
        self.assertTrue((new / "level.dat").exists())
        self.assertTrue((switch.backup_folder(self.root) / "manifest.json").exists())

    def test_refuse_occupied_world_and_backup_path(self):
        new = self.gen_world()
        with self.assertRaises(switch.lab.UnsafeLab):
            switch.stage(self.root, self.built, PIN, apply=True)
        self.assertTrue((new / "level.dat").exists())
        self.assertEqual((self.root / "server.properties").read_bytes(), self.props)
        # A second stage cannot silently replace its own backup.
        shutil.rmtree(new)
        switch.stage(self.root, self.built, PIN, apply=True)
        with self.assertRaises(switch.lab.UnsafeLab):
            switch.stage(self.root, self.built, PIN, apply=True)

    def test_ambiguous_or_missing_active_world_refused_without_edits(self):
        raw = self.props.replace(b"level-name=ThomasServer",
                                 b"level-name=SomeOtherWorld")
        (self.root / "server.properties").write_bytes(raw)
        with self.assertRaises(switch.lab.UnsafeLab):
            switch.stage(self.root, self.built, PIN, apply=True)
        self.assertEqual((self.root / "server.properties").read_bytes(), raw)

    def test_prevent_overwriting_server_generated_registrations(self):
        switch.stage(self.root, self.built, PIN, apply=True)
        new = self.gen_world()
        (new / switch.REGISTRY_FILES[0]).write_bytes(b'[]')
        with self.assertRaises(switch.lab.UnsafeLab):
            switch.bind(self.root, self.built, PIN, apply=True)
        self.assertFalse((new / switch.REGISTRY_FILES[1]).exists())

    def test_source_pack_or_historical_registration_drift_refused(self):
        switch.stage(self.root, self.built, PIN, apply=True)
        new = self.gen_world()
        (self.root / switch.PACK_FOLDERS[0] / "scripts" / "main.js").write_text(
            "tampered", encoding="utf-8")
        with self.assertRaises(switch.lab.UnsafeLab):
            switch.bind(self.root, self.built, PIN, apply=True)
        self.assertFalse((new / switch.REGISTRY_FILES[0]).exists())

    def test_historical_registry_drift_and_wrong_commit_refused(self):
        switch.stage(self.root, self.built, PIN, apply=True)
        self.gen_world()
        with self.assertRaises(switch.lab.UnsafeLab):
            switch.bind(self.root, self.built, "2" * 40, apply=True)
        original = self.root / "worlds" / switch.OLD_WORLD / switch.REGISTRY_FILES[0]
        original.write_bytes(original.read_bytes() + b"\n")
        with self.assertRaises(switch.lab.UnsafeLab):
            switch.bind(self.root, self.built, PIN, apply=True)

    def test_restore_refuses_manual_property_changes(self):
        switch.stage(self.root, self.built, PIN, apply=True)
        props = self.root / "server.properties"
        props.write_bytes(props.read_bytes() + b"# unexpected change\n")
        with self.assertRaises(switch.lab.UnsafeLab):
            switch.restore(self.root, PIN, apply=True)


if __name__ == "__main__":
    unittest.main()
