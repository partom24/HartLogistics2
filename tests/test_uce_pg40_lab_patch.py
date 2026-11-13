"""PG40 PG39 read-only host census: source and stopped-LAB synthetic safety.

No real server access. The archived PG37 installation is the only permissible
predecessor; no newer UCE custody/router or partial-merge code may be installed
by this fixture or the PG40 operator patch.
"""
from __future__ import annotations
from pathlib import Path
import importlib.util
import shutil
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"candidates/uce"))
spec=importlib.util.spec_from_file_location(
    "uce_pg40_readonly",ROOT/"candidates/uce/pg40_lab_patch.py")
pg40=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg40)


class PG40SourceAndSyntheticSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix="pg40-source-only-")
        cls.current,cls.previous,cls.wanted,cls.before=pg40.render_pack_pair(
            Path(cls.tmp.name))
    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def setUp(self):
        self.fixture=tempfile.TemporaryDirectory(prefix="PG40-FAKE-LAB-")
        self.addCleanup(self.fixture.cleanup)
        self.root=Path(self.fixture.name)/"SYNTHETIC-ONLY"
        self.root.mkdir()
        (self.root/"bedrock_server.exe").write_bytes(b"fake server")
        old=self.root/"worlds"/pg40.pg37.pg35.OLD_WORLD
        old.mkdir(parents=True)
        (old/"level.dat").write_bytes(b"historical q4")
        (old/"db").mkdir()
        (old/"db"/"CURRENT").write_bytes(b"historical db")
        (self.root/"server.properties").write_bytes(
            b"server-name=SYNTHETIC\r\nlevel-name=ThomasServer\r\n")
        self.registrations={}
        for i,name in enumerate(pg40.pg37.pg35.REGISTRY_FILES):
            kind,_,uuid,_=pg40.lab.PACKS[i]
            shutil.copytree(self.current/kind,
                self.root/pg40.pg37.pg35.PACK_FOLDERS[i])
            raw=('[{"pack_id":"20dbb8a2-cce7-48d7-8263-b65d160a785f",'
                 '"version":[1,7,3]},{"pack_id":"'+uuid+
                 '","version":[1,5,16]}]').encode("utf-8")
            (old/name).write_bytes(raw)
            self.registrations[name]=raw
        pg40.pg37.pg35.stage(
            self.root,self.current,pg40.pg37.pg36.PG35_PIN,apply=True)
        new=self.root/"worlds"/pg40.pg37.pg35.NEW_WORLD
        new.mkdir()
        (new/"level.dat").write_bytes(b"generated empty level")
        (new/"db").mkdir()
        (new/"db"/"CURRENT").write_bytes(b"new leveldb")
        pg40.pg37.pg35.bind(
            self.root,self.current,pg40.pg37.pg36.PG35_PIN,apply=True)
        for i,(kind,_,_,_) in enumerate(pg40.lab.PACKS):
            installed=self.root/pg40.pg37.pg35.PACK_FOLDERS[i]
            shutil.rmtree(installed)
            shutil.copytree(self.previous/kind,installed)

    def assert_preserved_worlds(self):
        old=self.root/"worlds"/pg40.pg37.pg35.OLD_WORLD
        new=self.root/"worlds"/pg40.pg37.pg35.NEW_WORLD
        self.assertEqual((old/"db"/"CURRENT").read_bytes(),b"historical db")
        self.assertEqual((new/"db"/"CURRENT").read_bytes(),b"new leveldb")
        for name,value in self.registrations.items():
            self.assertEqual((old/name).read_bytes(),value)
            self.assertEqual((new/name).read_bytes(),value)

    def test_only_native_evidence_and_status_are_different(self):
        differences={path for path in self.wanted["behavior_pack"]
            if self.wanted["behavior_pack"][path]!=self.before["behavior_pack"][path]}
        self.assertEqual(differences,pg40.CHANGED_BP)
        self.assertEqual(self.wanted["resource_pack"],self.before["resource_pack"])
        prev=self.previous/"behavior_pack/scripts"
        cur=self.current/"behavior_pack/scripts"
        self.assertEqual(
            (prev/"uce/unified_native_custody.js").read_bytes(),
            (cur/"uce/unified_native_custody.js").read_bytes())
        self.assertEqual(
            (prev/"uce/unified_ordinary_service.js").read_bytes(),
            (cur/"uce/unified_ordinary_service.js").read_bytes())
        self.assertEqual(
            (prev/"uce/unified_world_shard_writer.js").read_bytes(),
            (cur/"uce/unified_world_shard_writer.js").read_bytes())
        self.assertIn("inspectHostEvidence({",
                      (cur/"main.js").read_text(encoding="utf-8"))
        self.assertIn("HOST_EVIDENCE_READ_ONLY",
                      (cur/"uce/unified_carrier_registry.js").read_text(encoding="utf-8"))
        self.assertNotIn("moveCertifiedPartial(",
                      (cur/"uce/unified_native_custody.js").read_text(encoding="utf-8"))
        self.assertNotIn("uceWarningCounts",
                      (cur/"main.js").read_text(encoding="utf-8"),
                      "no other draft runtime changes in diagnostics patch")


    def test_runtime_forensic_hold_blocks_every_uce_write_entrypoint(self):
        from subprocess import run
        script=(self.current/"behavior_pack/scripts/main.js").read_text(
            encoding="utf-8")
        prior=(self.previous/"behavior_pack/scripts/main.js").read_text(
            encoding="utf-8")
        self.assertIn("// PG40 FORENSIC MAINTENANCE:",script)
        self.assertIn("const UCE_PG40_FORENSIC_FREEZE=true;",script)
        self.assertNotIn("UCE_PG40_FORENSIC_FREEZE",prior)
        functions={
          "uceAllowsSorterRegistryWrite":"return false;",
          "uceUnifiedServiceTick":"return;",
          "uceMrServiceTick":"return;",
          "uceOrdinaryServiceTick":"return;",
          "uceSorterDirectServiceTick":"return;",
          "uceProcessEjectedItemEntity":"return;",
          "uceRegisterNewReceiver":"return;",
          "uceSelectCollectorForLink":"return;",
          "uceMaybeRegisterBulk":"return false;",
          "uceActivateEmptyLabWorld":"return;"
        }
        for name,action in functions.items():
            prefix="function "+name+"("
            self.assertEqual(script.count(prefix),1,name)
            begin=script.index(prefix)
            open_brace=script.index("{",begin)
            self.assertLess(open_brace-begin,160,name)
            expected="if(UCE_PG40_FORENSIC_FREEZE)"+action
            self.assertIn(expected,script[open_brace+1:open_brace+105],name)
        link=script.index("function uceUseReceiverLinkOrStatus(")
        self.assertIn("if(UCE_PG40_FORENSIC_FREEZE)",
                      script[link:link+230])
        def legacy_fence(text):
            start=text.index("function uceLegacyWriterBlocked(){")
            stop=text.index("function uceAuthoritySnapshot(){",start)
            return text[start:stop]
        self.assertEqual(legacy_fence(script).replace(
            "    if(UCE_PG40_FORENSIC_FREEZE)return true;\n",""),
            legacy_fence(prior),
            "preserve original legacy predicate after fail-closed PG40 guard")
        self.assertIn("if(UCE_PG40_FORENSIC_FREEZE)return true;",
                      legacy_fence(script))
        self.assertNotIn("UCE_PG40_FORENSIC_FREEZE",legacy_fence(prior))
        self.assertIn("function uceSendDiagnostics(origin){",script)
        self.assertIn("inspectHostEvidence({",script)
        self.assertIn("PG40 FORENSIC HOLD: Hart script transfers",script)
        checked=run(["node","--check","--input-type=module"],
            input=script,text=True,capture_output=True)
        self.assertEqual(checked.returncode,0,checked.stderr)

    def test_exact_pg37_stopped_lab_apply_and_rollback_preserve_both_worlds(self):
        properties=(self.root/"server.properties").read_bytes()
        plan=pg40.pg37.make_plan(self.root,self.current,self.previous,
            self.wanted,self.before)
        self.assertEqual(len(plan),2)
        self.assert_preserved_worlds()
        backup=pg40.lab.apply_plan(self.root,plan)
        self.assertTrue(backup.is_dir())
        self.assert_preserved_worlds()
        self.assertEqual((self.root/"server.properties").read_bytes(),properties)
        for i,(kind,_,_,_) in enumerate(pg40.lab.PACKS):
            self.assertEqual(pg40.lab.hashes(
                self.root/pg40.pg37.pg35.PACK_FOLDERS[i]),
                self.wanted[kind])
        undo=pg40.pg37.make_plan(self.root,self.current,self.previous,
            self.wanted,self.before,rollback_tag=backup.name)
        pg40.lab.apply_plan(self.root,undo)
        self.assert_preserved_worlds()
        for i,(kind,_,_,_) in enumerate(pg40.lab.PACKS):
            self.assertEqual(pg40.lab.hashes(
                self.root/pg40.pg37.pg35.PACK_FOLDERS[i]),
                self.before[kind])

    def test_unknown_previous_pack_and_registration_refuse_without_db_mutation(self):
        installed=self.root/pg40.pg37.pg35.PACK_FOLDERS[0]/"scripts/main.js"
        installed.write_bytes(installed.read_bytes()+b"\nchanged")
        with self.assertRaises(pg40.lab.UnsafeLab):
            pg40.pg37.make_plan(self.root,self.current,self.previous,
                self.wanted,self.before)
        self.assert_preserved_worlds()
        installed.write_bytes(
            (self.previous/"behavior_pack/scripts/main.js").read_bytes())
        reg=self.root/"worlds"/pg40.pg37.pg35.NEW_WORLD/pg40.pg37.pg35.REGISTRY_FILES[0]
        reg.write_bytes(b"[]")
        with self.assertRaises(pg40.lab.UnsafeLab):
            pg40.pg37.make_plan(self.root,self.current,self.previous,
                self.wanted,self.before)

    def test_unsafe_cli_modes_hold_before_server_access(self):
        for args in (
            ["--commit","a"*40,"--mode","install"],
            ["--commit","a"*40,"--mode","rollback","--apply"],
            ["--commit","a"*40,"--mode","check","--apply"]
        ):
            self.assertEqual(pg40.main(args),2)


if __name__=="__main__":
    unittest.main()
