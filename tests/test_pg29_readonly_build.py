"""Offline-only PG29 read-only command packaging invariants; never touches LAB."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

pg29 = load(ROOT / "candidates/pg29/prepare_candidate.py", "pg29_build_test")
pg27 = pg29.pg27


def paths(pack):
    return {
        str(path.relative_to(pack)): path.read_bytes()
        for path in pack.rglob("*") if path.is_file() and path.name != "NOT_APPROVED_FOR_INSTALL.txt"
    }


class Pg29ReadonlyCandidate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="pg29-offline-test-")
        root = Path(self.tmp.name)
        self.old = root / "old"
        self.new = root / "new"
        pg27.prepare(self.old)
        pg29.prepare(self.new)

    def tearDown(self):
        self.tmp.cleanup()

    def test_strict_generated_delta_preserves_original_pg27_assets(self):
        old, new = paths(self.old), paths(self.new)
        self.assertEqual(set(new) - set(old), {
            "behavior_pack/scripts/" + n + ".js" for n in pg29.MODULES
        })
        self.assertEqual({name for name in old if old[name] != new[name]}, {
            "behavior_pack/manifest.json",
            "resource_pack/manifest.json",
            "behavior_pack/scripts/main.js"
        })
        self.assertTrue((self.new / "NOT_APPROVED_FOR_INSTALL.txt").is_file())

    def test_versions_and_pack_uuids_only_bump_1510_to_1511(self):
        for pack in ("behavior_pack", "resource_pack"):
            a = json.loads((self.old / pack / "manifest.json").read_text())
            b = json.loads((self.new / pack / "manifest.json").read_text())
            self.assertEqual(b["header"]["version"], [1, 5, 11])
            self.assertEqual(a["header"]["uuid"], b["header"]["uuid"])
            self.assertEqual(a["modules"][0]["uuid"], b["modules"][0]["uuid"])
            for module in b["modules"]:
                self.assertEqual(module["version"], [1, 5, 11])

    def test_runtime_audit_is_operator_only_no_cheat_and_no_item_writer(self):
        text = (self.new / "behavior_pack/scripts/main.js").read_text()
        self.assertEqual(text.count('name: "hartlogistics:q5audit"'), 1)
        self.assertIn("CommandPermissionLevel.GameDirectors", text)
        self.assertIn("cheatsRequired: false", text)
        self.assertIn("TEMP_TEST:PG29-Q5-AUDIT", text)
        self.assertIn("1.5.11-LAB-PG29-Q5-READONLY", text)
        self.assertEqual(text.count(
            'import { sampleQ4WorldReadOnly } from "./q5_q4_read_adapter.js";'), 1)
        overlay = (ROOT / "candidates/pg29/q5_audit_overlay.js").read_text()
        for denied in ("setWorldDynamic(", "saveJournal(", "saveQueueJournal(",
                       "setDynamicProperty(", "moveItem(", "setItem(", "new ItemStack("):
            self.assertNotIn(denied, overlay)

    def test_scripts_copy_existing_candidate_core_unmodified_semantically(self):
        for name in pg29.MODULES:
            original = (ROOT / "candidates/transport" / (name + ".mjs")).read_text()
            expected = original.replace(".mjs'", ".js'").replace('.mjs"', '.js"')
            packed = (self.new / "behavior_pack/scripts" / (name + ".js")).read_text()
            self.assertEqual(expected, packed)

    def test_baseline_is_external_input_not_a_mutated_output(self):
        self.assertFalse((self.new / "addon").exists())
        self.assertFalse((self.new / "behavior_pack/scripts/q5_readonly_preview.js").exists())
        self.assertNotIn("pg29", (self.old / "behavior_pack/scripts/main.js").read_text().lower())

    def test_never_overwrite_existing_target(self):
        with self.assertRaises(FileExistsError):
            pg29.prepare(self.new)


if __name__ == "__main__":
    unittest.main()
