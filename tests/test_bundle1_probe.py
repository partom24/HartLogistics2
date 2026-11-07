# TEMP_TEST:PG03-05
"""Temporary offline checks for the temporary PG-03..PG-05 pack.
This cannot prove actual BDS availability, persistence, or native ItemStack behavior.
"""
import json
import pathlib
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
P=ROOT/"tests"/"bundle1_probe"/"behavior_pack"
class ProbeContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m=json.loads((P/"manifest.json").read_text())
        cls.b=json.loads((P/"blocks"/"mr_container.json").read_text())
        cls.r=json.loads((P/"recipes"/"probe_recipe.json").read_text())
        cls.s=(P/"scripts"/"main.js").read_text()
    def test_unique_names(self):
        self.assertEqual(self.b["minecraft:block"]["description"]["identifier"],"hlprobe:mr_container")
        self.assertNotIn("hartsorter:",self.s)
    def test_nine_slots(self):
        self.assertEqual(self.b["minecraft:block"]["components"]["minecraft:block_entity"]["container"]["slot_count"],9)
    def test_stable_modules(self):
        d={x["module_name"]:x["version"] for x in self.m["dependencies"]}
        self.assertEqual(d,{"@minecraft/server":"2.7.0","@minecraft/server-ui":"2.0.0"})
    def test_pack_id_is_not_legacy(self):
        legacy=json.loads((ROOT/"addon"/"behavior_pack"/"manifest.json").read_text())
        self.assertNotEqual(self.m["header"]["uuid"],legacy["header"]["uuid"])
    def test_no_cheat_commands(self):
        for marker in ("runCommand(","allowCheats","world.setBlock","setType(","fillBlocks("):
            self.assertNotIn(marker,self.s)
    def test_native_methods(self):
        for method in (".moveItem(", ".transferItem(", "minecraft:inventory"):
            self.assertIn(method,self.s)
    def test_fidelity(self):
        for marker in ("nameTag","getLore()","setLore(","typeId","amount"):
            self.assertIn(marker,self.s)
    def test_source_custody_on_block(self):
        self.assertIn("A.setItem(0,remainder)",self.s)
        self.assertIn("fp(A.getItem(0))===expected",self.s)
    def test_restart_gate(self):
        self.assertIn("boot>state.boot",self.s)
        self.assertIn("world.setDynamicProperty(ARM,undefined)",self.s)
    def test_before_event_defers_menu(self):
        self.assertIn("e.cancel=true",self.s)
        self.assertIn("system.run(()=>menu(p,a))",self.s)
    def test_recipe(self):
        x=self.r["minecraft:recipe_shapeless"]
        self.assertEqual(x["ingredients"],[{"item":"minecraft:dirt"}])
        self.assertEqual(x["result"],{"item":"hlprobe:mr_container","count":2})
    def test_temp_tracking(self):
        self.assertIn("// TEMP_TEST:PG03-05",self.s)
        meta=json.loads((ROOT/"project-blueprint.json").read_text())
        hits=[v for v in meta["temporary_instrumentation"] if v["id"]=="PG03-05"]
        self.assertEqual(len(hits),1)
        self.assertEqual(hits[0]["path"],"tests/bundle1_probe/behavior_pack/scripts/main.js")
        self.assertEqual(hits[0]["status"],"active")
if __name__=="__main__":unittest.main()
