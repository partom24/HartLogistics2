"""Exact PG27 native-method mutation census and negative mutation matrix."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    "q5_native_effect_census",
    ROOT/"candidates/transport/q5_pg27_native_effect_census.py"
)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class PG27NativeEffects(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=mod.audit.read_exact_pg27_source()

    def test_exact_pg27_native_effect_owner_census_is_locked(self):
        record=mod.audit_native_mutators(self.source)
        self.assertEqual(record["status"],"EXACT_PG27_NATIVE_EFFECT_CENSUS_ONLY")
        self.assertEqual(record["nativeEffectCount"],33)
        self.assertEqual(record["methodCounts"],mod.APPROVED_NATIVE_CALLS)
        self.assertEqual(len(record["sites"]),record["nativeEffectCount"])

    def test_never_exposes_install_world_routing_or_migration_permit(self):
        result=mod.audit_native_mutators(self.source)
        for key in ["canInstall","canFreezeWorld","canMigrate",
                    "canWriteWorld","canRoute"]:
            self.assertIs(result[key],False,key)

    def test_explicit_method_set_includes_native_entity_and_item_mutators(self):
        required={
            "setItem","moveItem","transferItem","remove","setEquipment",
            "setType","setPermutation","spawnItem","spawnEntity",
            "runCommand","setDynamicProperty"
        }
        self.assertEqual(set(mod.NATIVE_METHODS),required)
        self.assertEqual(set(mod.APPROVED_NATIVE_CALLS),required)

    def test_source_ejected_entity_remove_is_owned_not_inferred_from_queue(self):
        result=mod.audit_native_mutators(self.source)
        calls=result["methodCounts"]["remove"]
        self.assertEqual(calls.get("pg24VerifyEjectedCommit"),1)
        self.assertNotIn("enqueueFromEjectedEntity",calls)
        self.assertNotIn("recoverQueueJournal",calls)

    def test_source_native_frame_and_display_mutators_are_in_scope(self):
        r=mod.audit_native_mutators(self.source)
        for method in ["setType","setPermutation","spawnEntity",
                       "setEquipment","spawnItem","runCommand"]:
            self.assertTrue(r["methodCounts"][method],method)

    def test_added_native_remove_in_an_existing_approved_writer_refuses(self):
        altered=self.source.replace(
            "function recoverQueueJournal(",
            "function recoverQueueJournal("
        )
        found="entity.remove();"
        self.assertIn(found,altered)
        altered=altered.replace(found,found+" entity.remove();",1)
        with self.assertRaises((mod.NativeEffectCoverageRefused,
                                mod.audit.Q5CoverageRefused)):
            mod.audit_native_mutators(altered)

    def test_additional_unjournaled_physical_setItem_is_not_silently_covered(self):
        altered=self.source.replace(
            "function safeMovePartial(",
            "function safeMovePartial("
        )
        original="dst.setItem("
        self.assertIn(original,altered)
        altered=altered.replace(original,"dst.setItem(0, undefined); "+original,1)
        with self.assertRaises((mod.NativeEffectCoverageRefused,
                                mod.audit.Q5CoverageRefused)):
            mod.audit_native_mutators(altered)

    def test_removed_or_renamed_method_cannot_silently_reduce_scope(self):
        for sourceMethod,replacement in [
            (".remove()",".delete()"),
            (".setItem(", ".assignItem("),
            (".spawnItem(", ".emitItem("),
            (".setEquipment(", ".equip(")
        ]:
            self.assertIn(sourceMethod,self.source)
            changed=self.source.replace(sourceMethod,replacement,1)
            with self.subTest(method=sourceMethod),self.assertRaises(
                (mod.NativeEffectCoverageRefused,mod.audit.Q5CoverageRefused)
            ):
                mod.audit_native_mutators(changed)

    def test_moved_native_writer_to_unknown_named_function_refuses(self):
        mutated=self.source.replace(
            "system.runInterval(schedulerTick, 1);",
            "function secretUnreviewedNativeWriter() { foo.setItem(0, undefined); }\n"
            "system.runInterval(schedulerTick, 1);"
        )
        with self.assertRaises((mod.NativeEffectCoverageRefused,
                                mod.audit.Q5CoverageRefused)):
            mod.audit_native_mutators(mutated)

    def test_top_level_added_world_mutator_refuses(self):
        mutated=self.source.replace(
            "system.runInterval(schedulerTick, 1);",
            "world.setDynamicProperty('test:unregistered','value');\n"
            "system.runInterval(schedulerTick, 1);"
        )
        with self.assertRaises((mod.NativeEffectCoverageRefused,
                                mod.audit.Q5CoverageRefused)):
            mod.audit_native_mutators(mutated)

    def test_js_comments_and_quoted_strings_do_not_create_mutation_sites(self):
        changed=(self.source+"\n// phantom.setItem(0, item);\n"+
                 "/* ghost.remove(); */\n"+
                 'const q5NativeAuditString = "phantom.spawnItem()";\n')
        clean=mod.audit_native_mutators(self.source)
        extra=mod.audit_native_mutators(changed)
        self.assertEqual(clean["methodCounts"],extra["methodCounts"])

    def test_any_changed_callback_registration_is_still_refused_by_base_audit(self):
        changed=self.source+"\nworld.afterEvents.entitySpawn.subscribe(ev => {});\n"
        with self.assertRaises(mod.audit.Q5CoverageRefused):
            mod.audit_native_mutators(changed)

    def test_input_remains_unmodified_and_no_output_source_pack_is_generated(self):
        before=self.source
        record=mod.audit_native_mutators(self.source)
        self.assertEqual(self.source,before)
        self.assertTrue(all(isinstance(s["sourceLine"],int)
                            for s in record["sites"]))
        self.assertFalse((ROOT/"build/q5-native-effect-preview").exists())

    def test_no_world_mutation_runtime_or_deploy_api_in_census_module(self):
        src=(ROOT/"candidates/transport/q5_pg27_native_effect_census.py").read_text()
        for forbidden in ["world.setDynamicProperty(", ".setItem(",
                          "create_pack(", "shutil.copytree(", "Install -Apply",
                          "Q5_ONLY", "canRoute: true"]:
            self.assertNotIn(forbidden,src)

if __name__ == "__main__":
    unittest.main()
