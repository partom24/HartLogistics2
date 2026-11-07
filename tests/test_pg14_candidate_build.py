"""PG14 candidate: no Minecraft BDS or real world access in tests."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "pg14_builder", ROOT / "candidates/pg14/prepare_candidate.py"
)
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)


class PG14Candidate(unittest.TestCase):
    def test_original_72_files_remain_verified(self):
        self.assertEqual(pg.pg13.pg08.check_baseline(), 72)

    def test_pack_153_and_stable_apis(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "candidate"
            pg.prepare(path)
            bp = json.loads((path / "behavior_pack/manifest.json").read_text())
            rp = json.loads((path / "resource_pack/manifest.json").read_text())
            self.assertEqual(bp["header"]["version"], [1, 5, 3])
            self.assertEqual(rp["header"]["version"], [1, 5, 3])
            for manifest in (bp, rp):
                self.assertIn("PG14 ONE-COBBLE LAB ONLY", manifest["header"]["name"])
                for mod in manifest["modules"]:
                    self.assertEqual(mod["version"], [1, 5, 3])
            self.assertEqual(bp["header"]["uuid"], "4854d263-05dd-4f79-a21c-7ba969295c2d")
            self.assertEqual(rp["header"]["uuid"], "91316442-0f26-4fbb-88f3-2e39ea843a1a")
            deps = {d["module_name"]: d["version"]
                    for d in bp["dependencies"] if "module_name" in d}
            self.assertEqual(deps["@minecraft/server"], "2.7.0")
            self.assertEqual(deps["@minecraft/server-ui"], "2.2.0")
            self.assertTrue((path / "NOT_APPROVED_FOR_INSTALL.txt").is_file())

    def test_transitively_preserves_pg08_pg13_and_original_script(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "candidate"
            pg.prepare(path)
            s = (path / "behavior_pack/scripts/main.js").read_text()
            original = (ROOT / "addon/behavior_pack/scripts/main.js").read_text()
            old = pg.pg13.pg08.compile_main(
                original, (ROOT / "candidates/pg08/menu_overlay.js").read_text()
            )
            old = old.replace(
                'const VERSION = "1.5.1-LAB-PG08";',
                'const VERSION = "1.5.3-LAB-PG14";'
            )
            overlay13 = (ROOT / "candidates/pg13/shadow_overlay.js").read_text()
            overlay14 = (ROOT / "candidates/pg14/custody_overlay.js").read_text()
            expect = old + "\n\n" + overlay13.rstrip() + "\n"
            expect += "\n\n" + overlay14.rstrip() + "\n"
            self.assertEqual(s, expect)
            self.assertEqual(s.count("world.beforeEvents.playerInteractWithBlock.subscribe"),
                             original.count("world.beforeEvents.playerInteractWithBlock.subscribe"))
            self.assertIn("pg08CommitLink(", s)
            self.assertIn("pg13Command(", s)
            self.assertIn("rig.source.moveItem(0, 0, rig.dest)", s)
            self.assertIn("function recoverQueueJournal()", s)

    def test_reuses_every_original_pack_file_without_new_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "candidate"
            pg.prepare(path)
            for kind in ("behavior_pack", "resource_pack"):
                orig = ROOT / "addon" / kind
                left = {p.relative_to(orig).as_posix(): p.read_bytes()
                        for p in orig.rglob("*") if p.is_file()}
                right = {p.relative_to(path / kind).as_posix(): p.read_bytes()
                         for p in (path / kind).rglob("*") if p.is_file()}
                self.assertEqual(set(left), set(right))
                changed = {"manifest.json"}
                if kind == "behavior_pack":
                    changed.add("scripts/main.js")
                for name in left:
                    if name not in changed:
                        self.assertEqual(left[name], right[name], name)

    def test_cannot_overwrite_existing_candidate_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "existing"
            path.mkdir()
            (path / "owner.txt").write_text("never touch")
            with self.assertRaises(FileExistsError):
                pg.prepare(path)
            self.assertEqual((path / "owner.txt").read_text(), "never touch")

    def test_overlay_scope_is_two_chests_two_journal_keys_and_one_move(self):
        s = (ROOT / "candidates/pg14/custody_overlay.js").read_text()
        self.assertIn("x: -955, y: 69, z: -804", s)
        self.assertIn("x: -951, y: 69, z: -804", s)
        self.assertEqual(s.count("rig.source.moveItem(0, 0, rig.dest)"), 1)
        self.assertIn("minecraft:chest", s)
        self.assertIn("minecraft:cobblestone", s)
        for forbidden in ("new ItemStack(", "setItem(", "clearAll(", "world.getAllPlayers(",
                          "world.clearDynamicProperties(", "logisticsDirty ="):
            self.assertNotIn(forbidden, s)

if __name__ == "__main__":
    unittest.main()
