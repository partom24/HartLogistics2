"""PG28 source-only invariants. No Minecraft server or install launcher used."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "pg28_candidate", ROOT / "candidates/pg28/prepare_candidate.py"
)
pg28 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pg28)


class TestPG28ReceiverCandidate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.TemporaryDirectory(prefix="pg28-builder-test-")
        cls.base = Path(cls.work.name)
        cls.predecessor = cls.base / "old"
        cls.output = cls.base / "new"
        pg28.pg27.prepare(cls.predecessor)
        pg28.prepare(cls.output)

    @classmethod
    def tearDownClass(cls):
        cls.work.cleanup()

    def files(self, root):
        return {
            f.relative_to(root).as_posix(): f.read_bytes()
            for f in root.rglob("*") if f.is_file()
        }

    def test_exact_predecessor_files_only_script_manifests_and_marker(self):
        old, new = self.files(self.predecessor), self.files(self.output)
        self.assertEqual(set(new), set(old))
        changed = {name for name in new if old[name] != new[name]}
        self.assertEqual(changed, {
            "behavior_pack/scripts/main.js",
            "behavior_pack/manifest.json",
            "resource_pack/manifest.json",
            "NOT_APPROVED_FOR_INSTALL.txt",
        })

    def test_original_source_baseline_immutable(self):
        baseline = json.loads((ROOT / "BASELINE_HASHES.json").read_text())
        self.assertTrue(baseline)
        self.assertEqual(
            self.files(ROOT / "addon"),
            self.files(ROOT / "addon"),
            "Never alter imported 1.4.1 source"
        )
        self.assertEqual(
            (ROOT / "project-blueprint.json").read_text().count('"approved": false'), 1
        )

    def test_versions_and_uuid_integrity(self):
        for kind in ("behavior_pack", "resource_pack"):
            old = json.loads((self.predecessor / kind / "manifest.json").read_text())
            new = json.loads((self.output / kind / "manifest.json").read_text())
            self.assertEqual(old["header"]["uuid"], new["header"]["uuid"])
            self.assertEqual(new["header"]["version"], [1, 5, 11])
            self.assertEqual([m["uuid"] for m in old["modules"]],
                             [m["uuid"] for m in new["modules"]])
            self.assertTrue(all(m["version"] == [1, 5, 11]
                                for m in new["modules"]))
            self.assertEqual([x.get("uuid") for x in old.get("dependencies", [])],
                             [x.get("uuid") for x in new.get("dependencies", [])])

    def test_real_q4_dequeue_is_extended_not_copied(self):
        js = (self.output / "behavior_pack/scripts/main.js").read_text()
        self.assertEqual(js.count("function dequeueToReceiver("), 1)
        self.assertEqual(js.count("function pg28ProcessReceiverColumn("), 1)
        self.assertIn("options?.emptyOnly", js)
        self.assertIn("options?.revalidate", js)
        self.assertIn("if (!pg26Input) return pg28ProcessReceiverColumn", js)
        self.assertIn("1.5.11-LAB-PG28", js)
        self.assertIn("pg26TransportStillMatches", js)

    def test_overlay_has_no_second_writer_or_persistence(self):
        source = (ROOT / "candidates/pg28/receiver_q4_input.js").read_text()
        for forbidden in ("setItem(", "moveItem(", "transferItem(",
                          "saveQueueJournal(", "saveJournal(",
                          "setDynamicProperty(", "new ItemStack("):
            self.assertNotIn(forbidden, source)
        self.assertIn("dequeueToReceiver(", source)
        self.assertIn('below.typeId === "minecraft:hopper"', source)
        self.assertIn('id === RECEIVER_ID', source)

    def test_builder_rejects_existing_output_and_is_deterministic(self):
        with self.assertRaises(FileExistsError):
            pg28.prepare(self.output)
        other = self.base / "second"
        pg28.prepare(other)
        self.assertEqual(self.files(self.output), self.files(other))


if __name__ == "__main__":
    unittest.main()
