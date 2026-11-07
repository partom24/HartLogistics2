"""Offline PG08 source/build tests, no Bedrock, LAB, registry or world access."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "pg08_prepare", ROOT / "candidates/pg08/prepare_candidate.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PG08CandidateBuildTests(unittest.TestCase):
    def test_baseline_is_still_unmodified(self):
        self.assertEqual(MODULE.check_baseline(), 72)

    def test_stable_ui_dependency_and_versioned_candidate_only(self):
        with tempfile.TemporaryDirectory(prefix="pg08-offline-") as temp:
            dest = Path(temp) / "candidate"
            MODULE.prepare(dest)
            bp = json.loads((dest / "behavior_pack/manifest.json").read_text())
            rp = json.loads((dest / "resource_pack/manifest.json").read_text())
            self.assertEqual(bp["header"]["version"], [1, 5, 1])
            self.assertEqual(rp["header"]["version"], [1, 5, 1])
            deps = bp["dependencies"]
            self.assertEqual([x["version"] for x in deps
                              if x.get("module_name") == "@minecraft/server-ui"], ["2.2.0"])
            self.assertEqual([x["version"] for x in deps if x.get("uuid")], [[1, 5, 1]])
            self.assertIn("LAB ONLY", bp["header"]["name"])
            self.assertTrue((dest / "NOT_APPROVED_FOR_INSTALL.txt").is_file())

    def test_compiled_source_replaces_only_link_gesture(self):
        source = (ROOT / "addon/behavior_pack/scripts/main.js").read_text()
        overlay = (ROOT / "candidates/pg08/menu_overlay.js").read_text()
        compiled = MODULE.compile_main(source, overlay)
        self.assertIn('from "@minecraft/server-ui"', compiled)
        self.assertIn("PG08_SESSION_TICKS", compiled)
        self.assertIn("pg08CommitLink", compiled)
        self.assertIn("ev.player.isSneaking", compiled)
        self.assertIn("saveQueueJournal(tx)", compiled)
        self.assertIn("function recoverQueueJournal()", compiled)
        self.assertNotIn("Placed and selected", compiled)
        self.assertNotIn("col.link = receiver.id;", compiled)
        self.assertNotIn("minecraft:block_entity", overlay)
        # Existing afterEvents remain present exactly once.
        for marker in ("world.afterEvents.playerPlaceBlock.subscribe",
                       "world.afterEvents.playerBreakBlock.subscribe",
                       "world.beforeEvents.playerInteractWithBlock.subscribe"):
            self.assertEqual(compiled.count(marker), source.count(marker))

    def test_anchor_mismatch_refuses_without_guessing(self):
        source = (ROOT / "addon/behavior_pack/scripts/main.js").read_text()
        overlay = (ROOT / "candidates/pg08/menu_overlay.js").read_text()
        with self.assertRaisesRegex(ValueError, "REFUSED"):
            MODULE.compile_main(source.replace("Placed and selected", "No longer selected"), overlay)

    def test_does_not_overwrite_existing_candidate_output(self):
        with tempfile.TemporaryDirectory(prefix="pg08-offline-") as temp:
            dest = Path(temp) / "candidate"
            dest.mkdir()
            sentinel = dest / "preserve.txt"
            sentinel.write_text("do not overwrite")
            with self.assertRaises(FileExistsError):
                MODULE.prepare(dest)
            self.assertEqual(sentinel.read_text(), "do not overwrite")

    def test_build_copies_all_original_pack_content(self):
        with tempfile.TemporaryDirectory(prefix="pg08-offline-") as temp:
            dest = Path(temp) / "candidate"
            MODULE.prepare(dest)
            base = ROOT / "addon"
            modified = {"behavior_pack/scripts/main.js",
                        "behavior_pack/manifest.json",
                        "resource_pack/manifest.json"}
            for path in base.rglob("*"):
                if not path.is_file():
                    continue
                relative = path.relative_to(base)
                # Only pack trees are installed; addon/README.md is repository documentation.
                if relative.parts[0] not in ("behavior_pack", "resource_pack"):
                    continue
                self.assertTrue((dest / relative).is_file())
                if str(relative).replace("\\", "/") not in modified:
                    self.assertEqual(path.read_bytes(), (dest / relative).read_bytes())


if __name__ == "__main__":
    unittest.main()
