"""PG23 immutable-source and bounded Hopper-compaction candidate invariants."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "pg23_candidate_build_for_tests", ROOT / "candidates/pg23/prepare_candidate.py"
)
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)


class PG23BuildInvariants(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = tempfile.TemporaryDirectory(prefix="pg23-invariants-")
        base = Path(cls.t.name)
        cls.previous = base / "pg20"
        cls.candidate = base / "pg23"
        pg.pg20.prepare(cls.previous)
        pg.prepare(cls.candidate)

    @classmethod
    def tearDownClass(cls):
        cls.t.cleanup()

    def test_original_72_file_source_immutable(self):
        self.assertEqual(pg.pg20.pg08.check_baseline(), 72)
        self.assertEqual(
            len(list((ROOT / "addon/behavior_pack").rglob("*.*"))), 16
        )
        self.assertEqual(
            len(list((ROOT / "addon/resource_pack").rglob("*.*"))), 56
        )

    def test_exact_version_uuid_dependencies_and_footprint(self):
        for kind in ("behavior_pack", "resource_pack"):
            a = json.loads((self.previous / kind / "manifest.json").read_text())
            b = json.loads((self.candidate / kind / "manifest.json").read_text())
            self.assertEqual(b["header"]["uuid"], a["header"]["uuid"])
            self.assertEqual(b["header"]["version"], [1, 5, 6])
            self.assertEqual({m["version"][0] for m in b["modules"]}, {1})
            self.assertEqual({tuple(m["version"]) for m in b["modules"]}, {(1, 5, 6)})
            self.assertEqual(len([x for x in (self.candidate / kind).rglob("*") if x.is_file()]),
                             16 if kind == "behavior_pack" else 56)
            self.assertEqual([(d.get("module_name"), d.get("version"))
                              for d in a.get("dependencies",[]) if d.get("module_name")],
                             [(d.get("module_name"), d.get("version"))
                              for d in b.get("dependencies",[]) if d.get("module_name")])

    def test_all_non_script_resources_retained_unchanged(self):
        for kind in ("behavior_pack", "resource_pack"):
            for p in (self.previous / kind).rglob("*"):
                if not p.is_file() or p.name == "manifest.json" or (
                    kind == "behavior_pack" and p.relative_to(self.previous / kind).as_posix() ==
                    "scripts/main.js"
                ):
                    continue
                q = self.candidate / kind / p.relative_to(self.previous / kind)
                self.assertEqual(p.read_bytes(), q.read_bytes(), str(p))

    def test_old_two_write_compaction_removed_but_all_existing_direct_paths_present(self):
        js = (self.candidate / "behavior_pack/scripts/main.js").read_text()
        self.assertNotIn("function compactSourceHopper(", js)
        self.assertNotIn("container.setItem(write, item)", js)
        self.assertNotIn("container.setItem(read, undefined)", js)
        self.assertIn("container.moveItem(read, write, container)", js)
        self.assertIn("pg23CompactSourceHopper(src, sourceBlock)", js)
        for marker in ("function pg20MoveOpaqueNative(", "function recoverQueueJournal(",
                       "function safeMovePartial(", "function processCollectorIngress(",
                       "function pg08CommitLink(", "function enqueueFromEjectedEntity("):
            self.assertIn(marker, js)
        for old in ("PG13_A", "PG14_RESERVE", "PG15_KEY",
                    "hartlogistics:cutpost", "hartlogistics:shadowbegin",
                    "minecraft:block_entity.container"):
            self.assertNotIn(old, js)

    def test_corrupted_anchor_and_unknown_opaque_marker_refused(self):
        s = (self.previous / "behavior_pack/scripts/main.js").read_text()
        overlay = pg.OVERLAY.read_text()
        with self.assertRaisesRegex(ValueError, "source anchor"):
            pg.compile_patch(s.replace('1.5.5-LAB-PG20','bad-version'),overlay)
        with self.assertRaisesRegex(ValueError, "compaction"):
            pg.compile_patch(s.replace("container.setItem(write, item)",
                                       "unrecognizedMove(write,item)"),overlay)
        with self.assertRaisesRegex(ValueError, "missing overlay marker"):
            pg.compile_patch(s,overlay.replace("container.moveItem(read, write, container);",
                                               "// removed compaction"))

    def test_no_overwrite_or_real_lab_side_effect(self):
        with self.assertRaises(FileExistsError):
            pg.prepare(self.candidate)
        self.assertFalse((self.candidate / "bedrock_server.exe").exists())
        self.assertIn("not a cross-save atomic custody claim", (
            self.candidate / "resource_pack/manifest.json").read_text())
        self.assertTrue((self.candidate / "NOT_APPROVED_FOR_INSTALL.txt").is_file())


if __name__ == "__main__":
    unittest.main()
