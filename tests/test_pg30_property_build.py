"""Offline PG30 temporary persistence test-pack invariants (NO LAB access)."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
  "pg30_build",ROOT/"candidates/pg30/prepare_candidate.py")
pg=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)

def packed_bytes(root):
    return {
        str(path.relative_to(root)):path.read_bytes()
        for path in root.rglob("*")
        if path.is_file() and path.name!="NOT_APPROVED_FOR_INSTALL.txt"
    }

class PG30OfflineBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix="pg30-exact-offline-")
        cls.old=Path(cls.tmp.name)/"pg27"
        cls.new=Path(cls.tmp.name)/"pg30"
        pg.pg27.prepare(cls.old)
        pg.prepare(cls.new)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_exact_pack_delta_is_only_both_manifests_and_main(self):
        old,new=packed_bytes(self.old),packed_bytes(self.new)
        self.assertEqual(old.keys(),new.keys())
        self.assertEqual({k for k in old if old[k]!=new[k]},{
            "behavior_pack/manifest.json",
            "resource_pack/manifest.json",
            "behavior_pack/scripts/main.js"
        })
        self.assertTrue((self.new/"NOT_APPROVED_FOR_INSTALL.txt").is_file())

    def test_pack_version_and_uuids_preserve_exact_pg27_identity(self):
        for kind in ("behavior_pack","resource_pack"):
            a=json.loads((self.old/kind/"manifest.json").read_text())
            b=json.loads((self.new/kind/"manifest.json").read_text())
            self.assertEqual(a["header"]["version"],[1,5,10])
            self.assertEqual(b["header"]["version"],[1,5,12])
            self.assertEqual(a["header"]["uuid"],b["header"]["uuid"])
            self.assertEqual([m["uuid"] for m in a["modules"]],
                             [m["uuid"] for m in b["modules"]])
            for m in b["modules"]:
                self.assertEqual(m["version"],[1,5,12])

    def test_overlay_is_identical_append_and_pg27_source_unmodified(self):
        old=(self.old/"behavior_pack/scripts/main.js").read_text()
        new=(self.new/"behavior_pack/scripts/main.js").read_text()
        overlay=(ROOT/"candidates/pg30/q5_property_probe_overlay.js").read_text()
        expected=old.replace(
            'const VERSION = "1.5.10-LAB-PG27";',
            'const VERSION = "1.5.12-LAB-PG30-Q5-PROPERTY-PROBE";'
        ).rstrip()+"\n\n"+overlay.rstrip()+"\n"
        self.assertEqual(new,expected)
        self.assertIn("const VERSION = \"1.5.10-LAB-PG27\";",old)

    def test_command_permissions_and_exact_test_property_scope(self):
        overlay=(ROOT/"candidates/pg30/q5_property_probe_overlay.js").read_text()
        self.assertTrue(pg.audit_overlay(overlay))
        self.assertEqual(overlay.count("world.setDynamicProperty("),4)
        self.assertEqual(overlay.count("system.beforeEvents.startup.subscribe("),1)
        for key in ["pg30_test_history_tmp_v1","pg30_test_marker_tmp_v1"]:
            self.assertIn(key,overlay)
        for command in pg.COMMANDS:
            self.assertEqual(overlay.count('"hartlogistics:'+command+'"'),1)
        self.assertIn("CommandPermissionLevel.GameDirectors",overlay)
        self.assertIn("cheatsRequired: false",overlay)

    def test_unrecognized_gameplay_api_writer_never_passes_source_audit(self):
        overlay=(ROOT/"candidates/pg30/q5_property_probe_overlay.js").read_text()
        for bad in ("setItem(", "saveQueueJournal(", "setWorldDynamic(",
                    "runCommand(", "clearDynamicProperties("):
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                pg.audit_overlay(overlay+"\n"+bad)

    def test_extra_property_writer_or_removed_cleanup_is_refused(self):
        overlay=(ROOT/"candidates/pg30/q5_property_probe_overlay.js").read_text()
        with self.assertRaises(ValueError):
            pg.audit_overlay(overlay+"\nworld.setDynamicProperty('foreign','x');")
        with self.assertRaises(ValueError):
            pg.audit_overlay(overlay.replace("before.marker === PG30_MARKER_RAW",
                                             "before.marker == PG30_MARKER_RAW"))
        with self.assertRaises(ValueError):
            pg.audit_overlay(overlay.replace('"hartlogistics:q5pclear"',
                                             '"hartlogistics:renamed"'))

    def test_no_overwrite_existing_build_or_baseline_tree(self):
        with self.assertRaises(FileExistsError):
            pg.prepare(self.new)
        self.assertFalse((self.new/"addon").exists())
        self.assertFalse((self.new/"worlds").exists())

if __name__=="__main__":
    unittest.main()
