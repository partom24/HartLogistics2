"""PG24 safe Q4 ejected-entity candidate build and protected baseline checks."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "pg24_candidate_build_test", ROOT / "candidates/pg24/prepare_candidate.py"
)
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)


class PG24BuildInvariants(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = tempfile.TemporaryDirectory(prefix="pg24-build-")
        cls.previous = Path(cls.t.name) / "pg23"
        cls.current = Path(cls.t.name) / "pg24"
        pg.pg23.prepare(cls.previous)
        pg.prepare(cls.current)

    @classmethod
    def tearDownClass(cls):
        cls.t.cleanup()

    def test_original_72_file_hash_inventory_stays_immutable(self):
        self.assertEqual(pg.pg23.pg20.pg08.check_baseline(), 72)
        self.assertEqual(len([p for p in (ROOT / "addon/behavior_pack").rglob("*") if p.is_file()]), 16)
        self.assertEqual(len([p for p in (ROOT / "addon/resource_pack").rglob("*") if p.is_file()]), 56)

    def test_uuid_dependencies_stable_and_version_is_157(self):
        for kind in ("behavior_pack", "resource_pack"):
            old = json.loads((self.previous / kind / "manifest.json").read_text())
            new = json.loads((self.current / kind / "manifest.json").read_text())
            self.assertEqual(new["header"]["uuid"], old["header"]["uuid"])
            self.assertEqual(new["header"]["version"], [1, 5, 7])
            self.assertEqual({tuple(m["version"]) for m in new["modules"]}, {(1, 5, 7)})
            self.assertEqual([(d.get("module_name"), d.get("version"))
                              for d in old.get("dependencies", []) if d.get("module_name")],
                             [(d.get("module_name"), d.get("version"))
                              for d in new.get("dependencies", []) if d.get("module_name")])
            self.assertEqual(len([p for p in (self.current / kind).rglob("*") if p.is_file()]),
                             16 if kind == "behavior_pack" else 56)

    def test_all_resources_and_unrelated_source_artifacts_unchanged(self):
        for kind in ("behavior_pack", "resource_pack"):
            for p in (self.previous / kind).rglob("*"):
                if not p.is_file() or p.name == "manifest.json" or (
                    kind == "behavior_pack" and p.relative_to(self.previous / kind).as_posix() ==
                    "scripts/main.js"
                ):
                    continue
                next_path = self.current / kind / p.relative_to(self.previous / kind)
                self.assertEqual(p.read_bytes(), next_path.read_bytes(), str(p))

    def test_q4_entity_recovery_is_hold_before_any_legacy_mutator(self):
        source = (self.current / "behavior_pack/scripts/main.js").read_text()
        self.assertIn('const VERSION = "1.5.7-LAB-PG24";', source)
        self.assertIn("if (pg24PreservePendingEntityJournal()) return;", source)
        self.assertIn("function pg24VerifyEjectedCommit(", source)
        self.assertIn("pg24ClearVerifiedEntityIntent();", source)
        self.assertIn("function pg23CompactSourceHopper(", source)
        self.assertIn("function pg20MoveOpaqueNative(", source)
        begin = source.index("function enqueueFromEjectedEntity(")
        end = source.index("\nfunction itemEntityStack(", begin)
        entity_body = source[begin:end]
        self.assertNotIn("    entity.remove();", entity_body)
        self.assertIn("    pg24VerifyEjectedCommit(receiver, q, tx, entity);", entity_body)
        self.assertNotIn("new ItemStack(", pg.OVERLAY.read_text())

    def test_exact_156_predecessor_anchor_and_unrecognized_overlay_refused(self):
        source = (self.previous / "behavior_pack/scripts/main.js").read_text()
        overlay = pg.OVERLAY.read_text()
        with self.assertRaisesRegex(ValueError, "source anchor"):
            pg.compile_patch(source.replace('1.5.6-LAB-PG23','wrong-version'),overlay)
        with self.assertRaisesRegex(ValueError, "source anchor"):
            pg.compile_patch(source.replace('    entity.remove();',
                                            '    entity.kill();',1),overlay)
        with self.assertRaisesRegex(ValueError, "missing overlay proof"):
            pg.compile_patch(source,overlay.replace("entity.remove();",
                                                    "// disabled source removal"))

    def test_no_rewrite_of_existing_candidate_or_original_world(self):
        with self.assertRaises(FileExistsError):
            pg.prepare(self.current)
        marker=(self.current / "NOT_APPROVED_FOR_INSTALL.txt").read_text()
        self.assertIn("no implicit deployment",marker)
        self.assertFalse((self.current / "bedrock_server.exe").exists())


if __name__ == "__main__":
    unittest.main()
