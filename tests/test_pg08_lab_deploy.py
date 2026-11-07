"""Synthetic PG08 LAB pack-replacement safety tests; never access a real BDS."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def imported(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg = imported("candidates/pg08/lab_deploy.py", "hl_pg08_deploy_test")
lab = pg.lab


class SyntheticPG08Lab(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="hl-pg08-lab-")
        self.work = Path(self.tmp.name)
        self.root = self.work / "synthetic-lab"
        self.root.mkdir()
        self.generated = self.work / "candidate"
        pg.candidate.prepare(self.generated)
        (self.root / "bedrock_server.exe").write_bytes(b"NEVER RUN")
        (self.root / "server.properties").write_text("level-name=ThomasServer\n")
        world = self.root / "worlds/ThomasServer"
        world.mkdir(parents=True)
        (world / "level.dat").write_bytes(b"OWNER CLONED WORLD SHOULD NOT CHANGE")
        self.before = {}
        for i, (kind, installed, pack_id, regname) in enumerate(lab.PACKS):
            destination = self.root / installed / pg.EXPECTED_DIRS[i]
            destination.parent.mkdir()
            shutil.copytree(ROOT / "addon" / kind, destination)
            manifest_file = destination / "manifest.json"
            manifest = json.loads(manifest_file.read_text())
            manifest["header"]["version"] = [1, 5, 0]
            for module in manifest["modules"]:
                module["version"] = [1, 5, 0]
            for dep in manifest.get("dependencies", []):
                if dep.get("uuid"):
                    dep["version"] = [1, 5, 0]
            manifest_file.write_text(json.dumps(manifest))
            (destination / "owner-old-pack-note.txt").write_text("failed 1.5.0, not a real world")
            self.before[destination] = lab.hashes(destination)
            registry = world / regname
            raw = ("// owner comment; do not remove\n["
                   '{"pack_id":"00000000-1111-2222-3333-444444444444","version":[1,7,3]},'
                   '{"pack_id":"' + pack_id + '","version":[1,5,0]}, //HartLogistics\n'
                   '{"pack_id":"99999999-1111-2222-3333-444444444444","version":[2,2,0]},'
                   "]\n")
            registry.write_text(raw)
            self.before[registry] = registry.read_bytes()
        self.before[world / "level.dat"] = (world / "level.dat").read_bytes()

    def tearDown(self):
        self.tmp.cleanup()

    def preserved(self):
        for file, original in self.before.items():
            if isinstance(original, dict):
                self.assertEqual(lab.hashes(file), original)
            else:
                self.assertEqual(file.read_bytes(), original)

    def test_dry_plan_is_read_only_for_multimod_150_world(self):
        plan = pg.create_plan(self.root, self.generated)
        self.assertEqual(len(plan), 2)
        for item in plan:
            self.assertTrue(item["source"].is_relative_to(self.generated))
            self.assertIn("// owner comment", item["new_registry"])
            self.assertIn("//HartLogistics", item["new_registry"])
            self.assertIn('"version":[1,5,1]', item["new_registry"])
            self.assertEqual(lab.hashes(item["target"]), item["old_hashes"])
        self.preserved()

    def test_synthetic_apply_replaces_only_hart_packs_and_keeps_world(self):
        plan = pg.create_plan(self.root, self.generated)
        backup = lab.apply_plan(self.root, plan)
        self.assertTrue(backup.is_dir())
        for i, item in enumerate(plan):
            self.assertEqual(lab.hashes(item["target"]), item["files"])
            updated = json.loads(lab.remove_jsonc(item["registry"].read_text()))
            self.assertEqual(len(updated), 3)
            self.assertEqual(updated[0]["version"], [1, 7, 3])
            self.assertEqual(updated[-1]["version"], [2, 2, 0])
            self.assertEqual(updated[1]["version"], [1, 5, 1])
            self.assertEqual(lab.hashes(backup / f"pack-{i}"), self.before[item["target"]])
            self.assertEqual((backup / f"registry-{i}.bin").read_bytes(),
                             self.before[item["registry"]])
        self.assertEqual((self.root / "worlds/ThomasServer/level.dat").read_bytes(),
                         self.before[self.root / "worlds/ThomasServer/level.dat"])

    def test_unexpected_world_name_rejected_without_change(self):
        (self.root / "server.properties").write_text("level-name=OtherWorld\n")
        with self.assertRaises(lab.UnsafeLab):
            pg.create_plan(self.root, self.generated)
        self.preserved()

    def test_installed_registration_mismatch_rejected(self):
        file = self.root / "worlds/ThomasServer/world_behavior_packs.json"
        file.write_text(file.read_text().replace("[1,5,0]", "[1,4,1]"))
        with self.assertRaises(lab.UnsafeLab):
            pg.create_plan(self.root, self.generated)
        self.assertEqual(lab.hashes(self.root / "behavior_packs" / pg.EXPECTED_DIRS[0]),
                         self.before[self.root / "behavior_packs" / pg.EXPECTED_DIRS[0]])

    def test_duplicate_hart_registration_rejected(self):
        file = self.root / "worlds/ThomasServer/world_behavior_packs.json"
        text = file.read_text()
        text = text.replace(
            '{"pack_id":"' + lab.BP_UUID + '","version":[1,5,0]},',
            '{"pack_id":"' + lab.BP_UUID + '","version":[1,5,0]},'
            '{"pack_id":"' + lab.BP_UUID + '","version":[1,5,0]},'
        )
        file.write_text(text)
        with self.assertRaises(lab.UnsafeLab):
            pg.create_plan(self.root, self.generated)

    def test_unknown_installed_pack_version_rejected(self):
        manifest = self.root / "behavior_packs" / pg.EXPECTED_DIRS[0] / "manifest.json"
        j = json.loads(manifest.read_text())
        j["header"]["version"] = [1, 6, 0]
        manifest.write_text(json.dumps(j))
        with self.assertRaises(lab.UnsafeLab):
            pg.create_plan(self.root, self.generated)

    def test_plan_changed_after_check_is_rejected(self):
        plan = pg.create_plan(self.root, self.generated)
        (plan[0]["target"] / "owner-old-pack-note.txt").write_text("changed after discovery")
        with self.assertRaises(lab.UnsafeLab):
            pg.plan_is_unchanged(plan)

    def test_registry_failure_rolls_back_both_packs_and_comments(self):
        plan = pg.create_plan(self.root, self.generated)
        original = Path.replace
        tripped = [False]
        def fail_once(path, dest):
            if str(dest).endswith("world_behavior_packs.json") and not tripped[0]:
                tripped[0] = True
                raise RuntimeError("synthetic registry failure")
            return original(path, dest)
        with patch.object(Path, "replace", fail_once):
            with self.assertRaisesRegex(RuntimeError, "synthetic registry failure"):
                lab.apply_plan(self.root, plan)
        self.preserved()

    def test_source_stays_at_exact_original_141_hashes(self):
        self.assertEqual(pg.candidate.check_baseline(), 72)
        hashes = pg.check_candidate(self.generated)
        self.assertEqual(len(hashes["behavior_pack"]), 16)
        self.assertEqual(len(hashes["resource_pack"]), 56)
        self.preserved()


if __name__ == "__main__":
    unittest.main()
