"""PG41 Bedrock 1.26.63.1 asset-parse repair: exact installed PG40 fixture.

All paths are disposable fake LAB worlds. No live BDS files are accessed by
these tests and no carrier reservation or Q4 record is edited.
"""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"candidates/uce"))
spec=importlib.util.spec_from_file_location(
    "uce_pg41_asset_smoke",ROOT/"candidates/uce/pg41_lab_patch.py")
pg41=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg41)


class PG41AssetsOnlyLabSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix="pg41-source-only-")
        cls.current,cls.previous,cls.wanted,cls.before=pg41.render_pack_pair(
            Path(cls.tmp.name)/"candidate")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def setUp(self):
        self.fake=tempfile.TemporaryDirectory(prefix="PG41-SYNTHETIC-")
        self.addCleanup(self.fake.cleanup)
        self.root=Path(self.fake.name)/"FAKE-LAB-ONLY"
        self.root.mkdir()
        (self.root/"bedrock_server.exe").write_bytes(b"fake bds")
        old=self.root/"worlds"/pg41.pg40.pg37.pg35.OLD_WORLD
        old.mkdir(parents=True)
        (old/"level.dat").write_bytes(b"preserved former world")
        (old/"db").mkdir()
        (old/"db"/"CURRENT").write_bytes(b"unaltered historical database")
        (self.root/"server.properties").write_bytes(
            b"server-name=FAKE\r\nlevel-name=ThomasServer\r\n")
        self.registrations={}
        for i,name in enumerate(pg41.pg40.pg37.pg35.REGISTRY_FILES):
            kind,_,uuid,_=pg41.lab.PACKS[i]
            shutil.copytree(self.previous/kind,
                self.root/pg41.pg40.pg37.pg35.PACK_FOLDERS[i])
            raw=('[{"pack_id":"20dbb8a2-cce7-48d7-8263-b65d160a785f",'
                 '"version":[1,7,3]},{"pack_id":"'+uuid+
                 '","version":[1,5,16]}]').encode("utf-8")
            (old/name).write_bytes(raw)
            self.registrations[name]=raw
        pin=pg41.pg40.pg37.pg36.PG35_PIN
        pg41.pg40.pg37.pg35.stage(
            self.root,self.previous,pin,apply=True)
        new=self.root/"worlds"/pg41.pg40.pg37.pg35.NEW_WORLD
        new.mkdir()
        (new/"level.dat").write_bytes(b"preserved PG35 level")
        (new/"db").mkdir()
        (new/"db"/"CURRENT").write_bytes(b"unaltered PG35 database")
        pg41.pg40.pg37.pg35.bind(
            self.root,self.previous,pin,apply=True)

    def assert_worlds_unchanged(self):
        old=self.root/"worlds"/pg41.pg40.pg37.pg35.OLD_WORLD
        new=self.root/"worlds"/pg41.pg40.pg37.pg35.NEW_WORLD
        self.assertEqual((old/"db"/"CURRENT").read_bytes(),
                         b"unaltered historical database")
        self.assertEqual((new/"db"/"CURRENT").read_bytes(),
                         b"unaltered PG35 database")
        self.assertEqual((old/"level.dat").read_bytes(),
                         b"preserved former world")
        self.assertEqual((new/"level.dat").read_bytes(),
                         b"preserved PG35 level")
        for name,value in self.registrations.items():
            self.assertEqual((old/name).read_bytes(),value)
            self.assertEqual((new/name).read_bytes(),value)

    def test_pg41_delta_is_exactly_two_json_assets(self):
        self.assertEqual(pg41.CHANGED_BP,{
            "entities/uce_native_carrier.json","recipes/bulk_storage.json"})
        changed={p for p in self.wanted["behavior_pack"]
                 if self.wanted["behavior_pack"][p]!=
                    self.before["behavior_pack"][p]}
        self.assertEqual(changed,pg41.CHANGED_BP)
        self.assertEqual(self.wanted["resource_pack"],self.before["resource_pack"])
        for path in ("scripts/main.js",
                     "scripts/uce/unified_carrier_registry.js",
                     "scripts/uce/unified_native_custody.js",
                     "manifest.json"):
            self.assertEqual(
                (self.previous/"behavior_pack"/path).read_bytes(),
                (self.current/"behavior_pack"/path).read_bytes())
        main=(self.current/"behavior_pack/scripts/main.js").read_text(
            encoding="utf-8")
        self.assertIn("PG40 FORENSIC HOLD: Hart script transfers",main)
        self.assertIn("if(UCE_PG40_FORENSIC_FREEZE)return true;",main)
        self.assertIn("if(UCE_PG40_FORENSIC_FREEZE)return;",main)
        self.assertNotIn("uceCarrierRegistrationReason",main,
            "PG41 may not silently install newer draft gameplay")
        self.assert_worlds_unchanged()

    def test_parser_fixes_preserve_item_inventory_and_original_recipe(self):
        pg41.validate_assets(self.previous,self.current)
        bp=self.current/"behavior_pack"
        entity=json.loads((bp/"entities/uce_native_carrier.json").read_text())
        self.assertEqual(entity["minecraft:entity"]["description"]["identifier"],
                         "hartlogistics:uce_native_carrier")
        comps=entity["minecraft:entity"]["components"]
        self.assertNotIn("minecraft:pushable",comps)
        self.assertNotIn("minecraft:pushable_by_block",comps)
        self.assertNotIn("minecraft:pushable_by_entity",comps)
        self.assertEqual(comps["minecraft:inventory"]["inventory_size"],9)
        self.assertFalse(comps["minecraft:inventory"]["can_be_siphoned_from"])
        self.assertIn("minecraft:persistent",comps)
        recipe=json.loads((bp/"recipes/bulk_storage.json").read_text())
        self.assertEqual(recipe["minecraft:recipe_shaped"]["unlock"],
                         [{"item":"minecraft:chest"}])
        self.assertEqual(recipe["minecraft:recipe_shaped"]["pattern"],
                         ["III","ICI","IRI"])
        self.assert_worlds_unchanged()

    def test_exact_stopped_pg40_pack_install_and_rollback_preserve_every_world(self):
        server_props=(self.root/"server.properties").read_bytes()
        plan=pg41.pg40.pg37.make_plan(
            self.root,self.current,self.previous,self.wanted,self.before)
        self.assertEqual(len(plan),2)
        self.assert_worlds_unchanged()
        backup=pg41.lab.apply_plan(self.root,plan)
        self.assertTrue(backup.is_dir())
        self.assertEqual(server_props,(self.root/"server.properties").read_bytes())
        self.assert_worlds_unchanged()
        for i,(kind,_,_,_) in enumerate(pg41.lab.PACKS):
            live=self.root/pg41.pg40.pg37.pg35.PACK_FOLDERS[i]
            self.assertEqual(pg41.lab.hashes(live),self.wanted[kind])
        undo=pg41.pg40.pg37.make_plan(
            self.root,self.current,self.previous,self.wanted,self.before,
            rollback_tag=backup.name)
        pg41.lab.apply_plan(self.root,undo)
        self.assert_worlds_unchanged()
        for i,(kind,_,_,_) in enumerate(pg41.lab.PACKS):
            live=self.root/pg41.pg40.pg37.pg35.PACK_FOLDERS[i]
            self.assertEqual(pg41.lab.hashes(live),self.before[kind])

    def test_unknown_installed_bytes_or_world_registration_refuse(self):
        main=(self.root/"behavior_packs/HartMods_HartLogistics_BP/"
              "scripts/main.js")
        main.write_bytes(main.read_bytes()+b"\nchanged")
        with self.assertRaises(pg41.lab.UnsafeLab):
            pg41.pg40.pg37.make_plan(
                self.root,self.current,self.previous,self.wanted,self.before)
        self.assert_worlds_unchanged()
        main.write_bytes(
            (self.previous/"behavior_pack/scripts/main.js").read_bytes())
        reg=(self.root/"worlds"/pg41.pg40.pg37.pg35.NEW_WORLD/
             pg41.pg40.pg37.pg35.REGISTRY_FILES[0])
        reg.write_bytes(b"[]")
        with self.assertRaises(pg41.lab.UnsafeLab):
            pg41.pg40.pg37.make_plan(
                self.root,self.current,self.previous,self.wanted,self.before)
        self.assertEqual(
            (self.root/"worlds"/pg41.pg40.pg37.pg35.NEW_WORLD/"db"/"CURRENT").read_bytes(),
            b"unaltered PG35 database")

    def test_mutating_modes_and_invalid_pins_refuse_before_lab_access(self):
        for args in (
            ["--commit","not-a-sha","--mode","plan"],
            ["--commit","a"*40,"--mode","install"],
            ["--commit","a"*40,"--mode","rollback","--apply"],
            ["--commit","a"*40,"--mode","check","--apply"]
        ):
            self.assertEqual(pg41.main(args),2)


if __name__=="__main__":
    unittest.main()
