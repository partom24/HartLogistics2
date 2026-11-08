"""PG20 guarded test-owned one-cobble deployment only against synthetic LAB fixtures."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "hl_pg20_deploy_test", ROOT / "candidates/pg20/lab_deploy.py"
)
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)
lab = pg.lab


class SyntheticPG20LAB(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="pg20-synthetic-")
        self.work = Path(self.tmp.name)
        self.lab = self.work / "synthetic-LAB"
        self.lab.mkdir()
        self.previous = self.work / "pg14"
        self.current = self.work / "pg20"
        pg.pg15.prepare(self.previous)
        pg.pg20.prepare(self.current)
        (self.lab / "server.properties").write_text("level-name=ThomasServer\n")
        (self.lab / "bedrock_server.exe").write_bytes(b"NOT RUN")
        world = self.lab / "worlds/ThomasServer"
        world.mkdir(parents=True)
        (world / "level.dat").write_bytes(b"CLONED WORLD SENTINEL")
        self.before = {}
        for i, (kind, folder, pack_id, registry_name) in enumerate(lab.PACKS):
            installed = self.lab / folder / pg.pg08.EXPECTED_DIRS[i]
            installed.parent.mkdir()
            shutil.copytree(self.previous / kind, installed)
            self.before[installed] = lab.hashes(installed)
            reg = world / registry_name
            reg.write_text(
                "// keep owner multippack comments\r\n"
                '[{"pack_id":"20dbb8a2-cce7-48d7-8263-b65d160a785f","version":[1,7,3]},\r\n'
                '{"pack_id":"' + pack_id + '","version":[1,5,4]}, //Hart Logistics old\r\n'
                '{"pack_id":"13030319-17e1-4526-8273-d4ce30cb3482","version":[2,2,0]}]\r\n'
            )
            self.before[reg] = reg.read_bytes()
        self.before[world / "level.dat"] = (world / "level.dat").read_bytes()

    def tearDown(self):
        self.tmp.cleanup()

    def unchanged(self):
        for path, old in self.before.items():
            if isinstance(old, dict):
                self.assertEqual(lab.hashes(path), old)
            else:
                self.assertEqual(path.read_bytes(), old)

    def test_dry_plan_requires_exact_153_and_never_writes(self):
        p = pg.create_plan(self.lab, self.current, self.previous)
        self.assertEqual(len(p), 2)
        for item in p:
            self.assertIn("Hart Logistics old", item["new_registry"])
            self.assertIn("keep owner multippack comments", item["new_registry"])
            self.assertIn('"version":[1,5,5]', item["new_registry"])
        self.unchanged()

    def test_apply_exact_only_two_hart_packs_retains_unrelated_registries(self):
        p = pg.create_plan(self.lab, self.current, self.previous)
        backup = lab.apply_plan(self.lab, p)
        for i, item in enumerate(p):
            self.assertEqual(lab.hashes(item["target"]), item["files"])
            reg = item["registry"].read_text()
            self.assertIn("//Hart Logistics old", reg)
            self.assertIn('"version":[1,7,3]', reg)
            self.assertIn('"version":[2,2,0]', reg)
            self.assertEqual(pg.pg08.version_in_registry(
                item["registry"].read_bytes(), lab.PACKS[i][2]), pg.NEW_VERSION)
            self.assertEqual(lab.hashes(backup / f"pack-{i}"),
                             self.before[item["target"]])
        self.assertEqual((self.lab / "worlds/ThomasServer/level.dat").read_bytes(),
                         b"CLONED WORLD SENTINEL")

    def test_roundtrip_restores_exact_153_packs_and_comments(self):
        original = pg.create_plan(self.lab, self.current, self.previous)
        backup = lab.apply_plan(self.lab, original)
        reverse = pg.create_rollback_plan(self.lab, self.current,
                                          self.previous, backup.name)
        lab.apply_plan(self.lab, reverse)
        self.unchanged()

    def test_rollback_preserves_third_party_registry_edit_since_install(self):
        backup = lab.apply_plan(self.lab,
                                pg.create_plan(self.lab, self.current, self.previous))
        reg = self.lab / "worlds/ThomasServer/world_behavior_packs.json"
        reg.write_text(reg.read_text().replace("[1,7,3]", "[1,7,4]"))
        back = pg.create_rollback_plan(self.lab, self.current, self.previous, backup.name)
        self.assertIn('"version":[1,7,4]', back[0]["new_registry"])
        self.assertIn("//Hart Logistics old", back[0]["new_registry"])

    def test_wrong_existing_pack_hash_refused_even_when_version_matches(self):
        file = self.lab / "behavior_packs" / pg.pg08.EXPECTED_DIRS[0] / "scripts/main.js"
        file.write_text(file.read_text() + "\n// unexpectedly changed\n")
        with self.assertRaises(lab.UnsafeLab):
            pg.create_plan(self.lab, self.current, self.previous)

    def test_old_150_or_unknown_version_refused(self):
        reg = self.lab / "worlds/ThomasServer/world_resource_packs.json"
        reg.write_text(reg.read_text().replace("[1,5,4]", "[1,5,0]"))
        with self.assertRaises(lab.UnsafeLab):
            pg.create_plan(self.lab, self.current, self.previous)

    def test_registration_duplication_rejected(self):
        reg = self.lab / "worlds/ThomasServer/world_behavior_packs.json"
        text = reg.read_text()
        insert = '{"pack_id":"' + lab.BP_UUID + '","version":[1,5,4]},'
        reg.write_text(text.replace('{"pack_id":"' + lab.BP_UUID, insert + '{"pack_id":"' + lab.BP_UUID))
        with self.assertRaises(lab.UnsafeLab):
            pg.create_plan(self.lab, self.current, self.previous)

    def test_wrong_world_refused(self):
        (self.lab / "server.properties").write_text("level-name=NotThomasServer\n")
        with self.assertRaises(lab.UnsafeLab):
            pg.create_plan(self.lab, self.current, self.previous)

    def test_no_rollback_from_other_tag_or_altered_candidate(self):
        backup = lab.apply_plan(self.lab, pg.create_plan(self.lab, self.current, self.previous))
        for tag in ["../../target", "lab-gggggggggggg", "lab-0", "lab-5af88e18cff3"]:
            with self.subTest(tag=tag), self.assertRaises(lab.UnsafeLab):
                pg.create_rollback_plan(self.lab, self.current, self.previous, tag)
        file = self.lab / "resource_packs" / pg.pg08.EXPECTED_DIRS[1] / "manifest.json"
        file.write_text(file.read_text() + " ")
        with self.assertRaises(lab.UnsafeLab):
            pg.create_rollback_plan(self.lab, self.current, self.previous, backup.name)

    def test_plan_drift_refuses_replacement(self):
        plan = pg.create_plan(self.lab, self.current, self.previous)
        (plan[0]["target"] / "manifest.json").write_text("{}")
        with self.assertRaises(lab.UnsafeLab):
            pg.pg08.plan_is_unchanged(plan)

    def test_transaction_write_failure_restores_packs_and_jsonc(self):
        plan = pg.create_plan(self.lab, self.current, self.previous)
        original_replace = Path.replace
        tripped = [False]

        def fail_once(path, target):
            if str(target).endswith("world_resource_packs.json") and not tripped[0]:
                tripped[0] = True
                raise OSError("synthetic registry replace failure")
            return original_replace(path, target)

        with patch.object(Path, "replace", fail_once):
            with self.assertRaisesRegex(OSError, "synthetic registry"):
                lab.apply_plan(self.lab, plan)
        self.unchanged()

    def test_unknown_older_version_cannot_sneak_into_rollback_backup(self):
        backup = lab.apply_plan(self.lab, pg.create_plan(self.lab, self.current, self.previous))
        old = backup / "pack-0/manifest.json"
        manifest = json.loads(old.read_text())
        manifest["header"]["version"] = [1, 5, 0]
        old.write_text(json.dumps(manifest))
        with self.assertRaises(lab.UnsafeLab):
            pg.create_rollback_plan(self.lab, self.current, self.previous, backup.name)

    def test_unsafe_apply_refused_before_real_lab_access(self):
        # Substituting a sentinel proves no actual Windows LAB inquiry.
        with patch.object(pg.pg08, "check_real_root",
                          side_effect=AssertionError("must not contact real LAB")):
            self.assertEqual(pg.main(["--apply"]), 2)

if __name__ == "__main__":
    unittest.main()
