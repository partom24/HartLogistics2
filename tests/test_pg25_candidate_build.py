"""PG25 exact predecessor, immutable baseline and bounded compiled diff."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("pg25_build_test", ROOT / "candidates/pg25/prepare_candidate.py")
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)


def function(source, name):
    start = source.index("function " + name + "(")
    end = source.index("\n}", start) + 2
    return source[start:end]


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.old = Path(cls.temp.name) / "pg24"
        cls.new = Path(cls.temp.name) / "pg25"
        pg.pg24.prepare(cls.old)
        pg.prepare(cls.new)
        cls.before = (cls.old / "behavior_pack/scripts/main.js").read_text()
        cls.after = (cls.new / "behavior_pack/scripts/main.js").read_text()

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_original_72_hashes_unchanged(self):
        self.assertEqual(pg.pg24.pg23.pg20.pg08.check_baseline(), 72)

    def test_versions_uuids_stable_api_and_dependency(self):
        for kind in ("behavior_pack", "resource_pack"):
            a = json.loads((self.old / kind / "manifest.json").read_text())
            b = json.loads((self.new / kind / "manifest.json").read_text())
            self.assertEqual(a["header"]["uuid"], b["header"]["uuid"])
            self.assertEqual(b["header"]["version"], [1, 5, 8])
            self.assertTrue(all(m["version"] == [1, 5, 8] for m in b["modules"]))
            self.assertEqual([d for d in a.get("dependencies", []) if d.get("module_name")],
                             [d for d in b.get("dependencies", []) if d.get("module_name")])
            self.assertTrue(all(d["version"] == [1, 5, 8]
                                for d in b.get("dependencies", []) if d.get("uuid")))

    def test_only_manifests_and_main_differ_in_packs(self):
        changed = set()
        for kind in ("behavior_pack", "resource_pack"):
            files = {p.relative_to(self.old / kind) for p in (self.old / kind).rglob("*") if p.is_file()}
            self.assertEqual(files, {p.relative_to(self.new / kind) for p in (self.new / kind).rglob("*") if p.is_file()})
            for rel in files:
                if (self.old / kind / rel).read_bytes() != (self.new / kind / rel).read_bytes():
                    changed.add(f"{kind}/{rel.as_posix()}")
        self.assertEqual(changed, {"behavior_pack/manifest.json", "resource_pack/manifest.json", "behavior_pack/scripts/main.js"})

    def test_happy_path_functions_unchanged(self):
        for name in ("enqueueFromSource", "dequeueToReceiver", "enqueueFromEjectedEntity",
                     "pg24VerifyEjectedCommit", "pg24ClearVerifiedEntityIntent",
                     "pg20MoveOpaqueNative", "pg23CompactSourceHopper", "pg08CommitLink"):
            self.assertEqual(function(self.before, name), function(self.after, name), name)

    def test_no_new_keys_commands_or_legacy_recovery_mutator(self):
        import re
        keys = lambda s: re.findall(r'const \w*(?:KEY|JOURNAL)\w*\s*=\s*[^;]+;', s)
        self.assertEqual(keys(self.before), keys(self.after))
        self.assertEqual(self.before.count("registerCommand("), self.after.count("registerCommand("))
        self.assertNotIn("function journalQueueState(", self.after)
        self.assertNotIn("function pg24PreservePendingEntityJournal(", self.after)
        self.assertEqual(function(self.after, "recoverQueueJournal").strip(),
                         "function recoverQueueJournal() {\n    pg25PreservePendingQueueJournal();\n}")

    def test_anchor_drift_or_mutating_overlay_refused(self):
        overlay = pg.OVERLAY.read_text()
        for before in (self.before.replace("1.5.7-LAB-PG24", "unknown-version"),
                       self.before.replace("function schedulerTick() {", "function otherTick() {")):
            with self.assertRaises(ValueError):
                pg.compile_patch(before, overlay)
        with self.assertRaises(ValueError):
            pg.compile_patch(self.before, overlay + "\nworld.setDynamicProperty('unsafe', 1);")
        with self.assertRaises(ValueError):
            pg.compile_patch(self.before, overlay.replace("pg25QueueHold = true;", "// missing HOLD"))

    def test_rebuild_is_deterministic_without_overwrite(self):
        other = Path(self.temp.name) / "repeat"
        if other.exists():
            self.fail("repeat fixture already exists")
        pg.prepare(other)
        self.assertEqual((other / "behavior_pack/scripts/main.js").read_bytes(),
                         (self.new / "behavior_pack/scripts/main.js").read_bytes())
        with self.assertRaises(FileExistsError):
            pg.prepare(self.new)


if __name__ == "__main__":
    unittest.main()
