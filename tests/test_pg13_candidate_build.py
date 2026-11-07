"""PG13 shadow candidate build safety: source-only, never inspect a real LAB."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "pg13_prepare", ROOT / "candidates/pg13/prepare_candidate.py"
)
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)


class PG13Build(unittest.TestCase):
    def test_exact_original_72_files_preserved(self):
        self.assertEqual(pg.pg08.check_baseline(), 72)

    def test_152_lab_versions_uuid_and_stable_api_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "candidate"
            pg.prepare(dest)
            bp = json.loads((dest / "behavior_pack/manifest.json").read_text())
            rp = json.loads((dest / "resource_pack/manifest.json").read_text())
            for manifest in (bp, rp):
                self.assertEqual(manifest["header"]["version"], [1, 5, 2])
                self.assertIn("PG13 LAB SHADOW ONLY", manifest["header"]["name"])
                self.assertEqual([x["version"] for x in manifest["modules"]],
                                 [[1, 5, 2]] * len(manifest["modules"]))
            self.assertEqual(bp["header"]["uuid"], "4854d263-05dd-4f79-a21c-7ba969295c2d")
            self.assertEqual(rp["header"]["uuid"], "91316442-0f26-4fbb-88f3-2e39ea843a1a")
            self.assertEqual([x["version"] for x in bp["dependencies"]
                              if x.get("uuid")], [[1, 5, 2]])
            deps = {x["module_name"]: x["version"] for x in bp["dependencies"]
                    if x.get("module_name")}
            self.assertEqual(deps["@minecraft/server"], "2.7.0")
            self.assertEqual(deps["@minecraft/server-ui"], "2.2.0")

    def test_only_three_copied_files_edited(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "candidate"
            pg.prepare(dest)
            for kind in ("behavior_pack", "resource_pack"):
                baseline = ROOT / "addon" / kind
                modified = {"manifest.json"}
                if kind == "behavior_pack":
                    modified.add("scripts/main.js")
                for file in baseline.rglob("*"):
                    if not file.is_file():
                        continue
                    relative = file.relative_to(baseline)
                    other = dest / kind / relative
                    self.assertTrue(other.is_file(), str(relative))
                    if relative.as_posix() not in modified:
                        self.assertEqual(file.read_bytes(), other.read_bytes())
            self.assertEqual(len(list((dest / "behavior_pack").rglob("*.*"))),
                             len(list((ROOT / "addon/behavior_pack").rglob("*.*"))))

    def test_accepted_pg08_menu_and_queue_unchanged_except_extra_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "candidate"
            pg.prepare(dest)
            compiled = (dest / "behavior_pack/scripts/main.js").read_text()
            original = (ROOT / "addon/behavior_pack/scripts/main.js").read_text()
            overlay = (ROOT / "candidates/pg13/shadow_overlay.js").read_text()
            expected = pg.pg08.compile_main(
                original, (ROOT / "candidates/pg08/menu_overlay.js").read_text()
            ).replace('const VERSION = "1.5.1-LAB-PG08";',
                      'const VERSION = "1.5.2-LAB-PG13";')
            self.assertEqual(compiled, expected + "\n\n" + overlay.rstrip() + "\n")
            self.assertEqual(compiled.count("world.beforeEvents.playerInteractWithBlock.subscribe"),
                             original.count("world.beforeEvents.playerInteractWithBlock.subscribe"))
            self.assertIn("pg08CommitLink", compiled)
            self.assertIn("function recoverQueueJournal()", compiled)
            self.assertIn("const PG13_A =", compiled)

    def test_no_overwrite_existing_build_or_unrelated_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "already"
            dest.mkdir()
            saved = dest / "test.txt"
            saved.write_text("untouched")
            with self.assertRaises(FileExistsError):
                pg.prepare(dest)
            self.assertEqual(saved.read_text(), "untouched")

    def test_no_extra_custom_blocks_or_resources(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "candidate"
            pg.prepare(dest)
            for kind in ("behavior_pack", "resource_pack"):
                files = {p.relative_to(dest / kind).as_posix()
                         for p in (dest / kind).rglob("*") if p.is_file()}
                original = {p.relative_to(ROOT / "addon" / kind).as_posix()
                            for p in (ROOT / "addon" / kind).rglob("*") if p.is_file()}
                self.assertEqual(files, original)
            self.assertNotIn("minecraft:block_entity",
                             (ROOT / "candidates/pg13/shadow_overlay.js").read_text())

if __name__ == "__main__":
    unittest.main()
