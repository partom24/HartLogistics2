"""UCE integrated pack compilation and preservation tests (no server needed)."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location(
    "uce_builder",ROOT/"candidates/uce/prepare_candidate.py")
mod=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

class UceBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix="uce-source-test-")
        cls.path=Path(cls.tmp.name)/"build"
        mod.prepare(cls.path)
        cls.bp=cls.path/"behavior_pack"
        cls.rp=cls.path/"resource_pack"
        cls.main=(cls.bp/"scripts/main.js").read_text(encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_original_baseline_unmodified(self):
        protected=ROOT/"addon/behavior_pack/scripts/main.js"
        self.assertIn('const VERSION = "1.4.1";',
                      protected.read_text(encoding="utf-8"))
        self.assertIn('const VERSION = "1.5.16-DEV-UCE";',self.main)

    def test_manifest_ids_and_no_experiment_changes(self):
        old=json.loads((ROOT/"addon/behavior_pack/manifest.json").read_text())
        bp=json.loads((self.bp/"manifest.json").read_text())
        rp=json.loads((self.rp/"manifest.json").read_text())
        self.assertEqual(bp["header"]["uuid"],old["header"]["uuid"])
        self.assertEqual(bp["header"]["version"],[1,5,16])
        self.assertEqual(rp["header"]["version"],[1,5,16])
        self.assertEqual(bp["dependencies"][0]["version"],
                         old["dependencies"][0]["version"])
        entity=json.loads((self.bp/"entities/uce_native_carrier.json").read_text())
        self.assertFalse(entity["minecraft:entity"]["description"]["is_experimental"])
        self.assertTrue((self.path/"NOT_APPROVED_FOR_INSTALL.txt").exists())

    def test_js_import_graph_pinned_to_copied_modules(self):
        import re
        root=self.bp/"scripts"
        entry=root/"main.js"
        seen=set()
        pending=[entry]
        while pending:
            p=pending.pop()
            if p in seen:continue
            seen.add(p)
            body=p.read_text(encoding="utf-8")
            for match in re.findall(r'from ["\'](\.[^"\']+)["\']',body):
                child=(p.parent/match).resolve()
                self.assertTrue(child.is_relative_to(root.resolve()))
                self.assertTrue(child.is_file(),(p,match))
                pending.append(child)
        self.assertEqual(
            {x.name for x in (root/"uce").iterdir()},
            {name+".js" for name in mod.MODULES}
        )
        self.assertGreaterEqual(len(seen),4)

    def test_legacy_core_writers_and_original_scheduler_fenced(self):
        s=self.main
        for name in (
          "safeMovePartial","enqueueFromSource","enqueueFromEjectedEntity",
          "dequeueToReceiver","pg20MoveOpaqueNative","pg23CompactSourceHopper",
          "pg24VerifyEjectedCommit",
          "setFilter","giveOrDrop","syncDisplay","reconcileDisplays",
          "plantEmptyNativeFrame","eraseOwnedFrame",
          "loadReceiverQueue","recoverJournal","recoverQueueJournal",
          "flushLogistics"):
            start=s.index("function "+name+"(")
            brace=s.find("{",start)
            self.assertLess(brace-start,400,name)
            self.assertIn("if (uceLegacyWriterBlocked())",
                          s[brace:brace+165],name)
        self.assertIn(
          "if (uceLegacyWriterBlocked()) { uceMrServiceTick(); return; }",s)
        self.assertIn("if (uceLegacyWriterBlocked()) return;",s)
        self.assertIn("UCE_LEGACY_WORLD_WRITER_FENCED",s)

    def test_no_automatic_authority_install_or_second_bridge_writer(self):
        bridge=(ROOT/"candidates/uce/runtime_bridge.js").read_text()
        for forbidden in ("world.setDynamicProperty(","setItem(","moveItem(",
                          "saveQueueJournal("):
            self.assertNotIn(forbidden,bridge)
        self.assertNotIn("setDynamicProperty(UCE_MAIN_AUTHORITY",self.main)
        self.assertIn("Q4 cutover",(
          self.path/"NOT_APPROVED_FOR_INSTALL.txt").read_text())

    def test_node_full_pack_script_syntax(self):
        result=subprocess.run(["node","--check","--input-type=module"],
            input=self.main,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_rebuild_pins_exact_pg33_source(self):
        self.assertIn("function pg33ProcessReceiverColumn(",self.main)
        self.assertIn("const PG33_LAB_SCOPE = Object.freeze",self.main)
        self.assertIn("function pg26ReadTransportInput(",self.main)
        self.assertIn("function pg23TransportMayRun(",self.main)

if __name__=="__main__":
    unittest.main()
