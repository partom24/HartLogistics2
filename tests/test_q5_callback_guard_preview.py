"""Conservative non-deployable event/deferred callback guard insertion tests."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("q5_callback_weaver",
    ROOT/"candidates/transport/q5_guard_weave_preview.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Q5CallbackGuardPreview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=mod.audit.read_exact_pg27_source()
        cls.base=mod.weave_offline_preview(cls.source)
        cls.preview=mod.weave_offline_callback_preview(cls.source)

    def test_all_observed_anonymous_event_and_deferred_closures_refuse_first(self):
        result=self.preview
        self.assertEqual(result["status"],"NONDEPLOYABLE_NAMED_AND_CALLBACK_PREVIEW")
        self.assertEqual(result["guarded_callback_count"],13)
        self.assertEqual(len(result["guarded_callback_names"]),13)
        self.assertEqual(len(set(result["guarded_callback_names"])),13)
        for name,(anchor,expected) in mod.CALLBACK_ANCHORS.items():
            self.assertEqual(result["source"].count(anchor),expected)
            for index in range(1,expected+1):
                marker=(
                    "\n    q5SourcePreviewHold('callback:"+name+":"+str(index)+
                    "'); // CALLBACK OFFLINE TEST ONLY\n"
                )
                self.assertEqual(result["source"].count(marker),1,(name,index))

    def test_original_named_only_preview_reconstructed_exactly(self):
        text=self.preview["source"]
        for name in self.preview["guarded_callback_names"]:
            marker="\n    q5SourcePreviewHold('"+name+"'); // CALLBACK OFFLINE TEST ONLY\n"
            self.assertEqual(text.count(marker),1,name)
            text=text.replace(marker,"",1)
        self.assertEqual(text,self.base["source"])

    def test_all_permissions_remain_false_and_callback_uncertainty_is_explicit(self):
        r=self.preview
        for key in ["canInstall","canFreezeWorld","canRoute","canMigrate",
                    "canActivateQ5","canWriteWorld"]:
            self.assertIs(r[key],False)
        self.assertIn("physical_commit_epoch_revalidation",r["unresolved_callbacks"])
        self.assertIn("vanilla_and_foreign_inventory_ingress",r["unresolved_callbacks"])

    def test_full_source_with_33_named_and_13_anonymous_guards_parses(self):
        if not shutil.which("node"):
            self.skipTest("Node unavailable; GH CI Node expected")
        result=subprocess.run(["node","--check","--input-type=module"],
            input=self.preview["source"],text=True,capture_output=True,timeout=30)
        self.assertEqual(result.returncode,0,result.stderr[:1500])

    def test_unexpected_new_event_refuses_instead_of_becoming_unprotected(self):
        mutated=self.source+"\nworld.afterEvents.entitySpawn.subscribe(ev => {});"
        with self.assertRaises(mod.audit.Q5CoverageRefused):
            mod.weave_offline_callback_preview(mutated)

    def test_deleted_or_changed_callback_refuses(self):
        for key,(anchor,_) in mod.CALLBACK_ANCHORS.items():
            altered=self.source.replace(anchor,"/* deliberately removed "+key+" */",1)
            with self.subTest(key=key),self.assertRaises(mod.audit.Q5CoverageRefused):
                mod.weave_offline_callback_preview(altered)

    def test_no_world_write_or_pack_build_api_added(self):
        compiler=(ROOT/"candidates/transport/q5_guard_weave_preview.py").read_text()
        for forbidden in ["setDynamicProperty(", "setItem(", "moveItem(",
            "runCommand(", "manifest.json", "shutil.copytree"]:
            self.assertNotIn(forbidden,compiler)

if __name__=="__main__":
    unittest.main()
