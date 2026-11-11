"""PG33 source-only invariants. No Minecraft server or install launcher used."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "pg33_candidate", ROOT / "candidates/pg33/prepare_candidate.py"
)
pg33 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pg33)


class TestPG33ReceiverCandidate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.TemporaryDirectory(prefix="pg33-builder-test-")
        cls.base = Path(cls.work.name)
        cls.predecessor = cls.base / "old"
        cls.output = cls.base / "new"
        pg33.pg27.prepare(cls.predecessor)
        pg33.prepare(cls.output)

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
        self.assertEqual(baseline["baseline_version"], "1.4.1")
        self.assertEqual(len(baseline["files"]), 72)
        for name, digest in baseline["files"].items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(),
                             digest, name)
        self.assertFalse(json.loads(
            (ROOT / "project-blueprint.json").read_text())["release"]["approved"])

    def test_versions_and_uuid_integrity(self):
        for kind in ("behavior_pack", "resource_pack"):
            old = json.loads((self.predecessor / kind / "manifest.json").read_text())
            new = json.loads((self.output / kind / "manifest.json").read_text())
            self.assertEqual(old["header"]["uuid"], new["header"]["uuid"])
            self.assertEqual(new["header"]["version"], [1, 5, 15])
            self.assertEqual([m["uuid"] for m in old["modules"]],
                             [m["uuid"] for m in new["modules"]])
            self.assertTrue(all(m["version"] == [1, 5, 15]
                                for m in new["modules"]))
            self.assertEqual([x.get("uuid") for x in old.get("dependencies", [])],
                             [x.get("uuid") for x in new.get("dependencies", [])])

    def test_real_q4_dequeue_is_extended_not_copied(self):
        js = (self.output / "behavior_pack/scripts/main.js").read_text()
        self.assertEqual(js.count("function dequeueToReceiver("), 1)
        self.assertEqual(js.count("function pg33ProcessReceiverColumn("), 1)
        self.assertIn("options?.emptyOnly", js)
        self.assertIn("options?.revalidate", js)
        self.assertIn("options?.expectedHead", js)
        self.assertIn("if (!pg26Input) return pg33ProcessReceiverColumn", js)
        self.assertIn("1.5.15-LAB-PG33", js)
        self.assertIn("pg26TransportStillMatches", js)

    def test_overlay_has_no_second_writer_or_persistence(self):
        source = (ROOT / "candidates/pg33/receiver_q4_input.js").read_text()
        for forbidden in ("setItem(", "moveItem(", "transferItem(",
                          "saveQueueJournal(", "saveJournal(",
                          "setDynamicProperty(", "new ItemStack("):
            self.assertNotIn(forbidden, source)
        self.assertIn("dequeueToReceiver(", source)
        self.assertIn('below.typeId === "minecraft:hopper"', source)
        self.assertIn("pg33LabScopeAllows(", source)
        self.assertIn("column:{x:-952,y:70,z:-791}", source)
        self.assertIn("receiver:{x:-950,y:70,z:-791}", source)
        self.assertIn("pg33CommittedQ4Meta(", source)
        self.assertIn("pg33NativeOutputAllowed(", source)
        self.assertIn('target.container.size !== 27', source)
        self.assertIn("pg33CommittedQ4Meta(route.receiver) !== committedQ4", source)
        self.assertIn("queueDataSignature(rebuiltData)", source)
        self.assertIn('id === RECEIVER_ID', source)

    def test_existing_legacy_hopper_writer_retains_default_behavior(self):
        old = (self.predecessor / "behavior_pack/scripts/main.js").read_text()
        new = (self.output / "behavior_pack/scripts/main.js").read_text()
        self.assertEqual(old.count("function dequeueToReceiver("), 1)
        self.assertEqual(new.count("function dequeueToReceiver("), 1)
        self.assertEqual(new.count("function pg33ProcessReceiverColumn("), 1)
        self.assertIn("options?.expectedHead", new)
        self.assertIn("if (options?.revalidate && !options.revalidate()) return 0;", new)
        self.assertNotIn("setDynamicProperty(", (ROOT / "candidates/pg33/receiver_q4_input.js").read_text())

    def test_builder_rejects_existing_output_and_is_deterministic(self):
        with self.assertRaises(FileExistsError):
            pg33.prepare(self.output)
        other = self.base / "second"
        pg33.prepare(other)
        self.assertEqual(self.files(self.output), self.files(other))


if __name__ == "__main__":
    unittest.main()
