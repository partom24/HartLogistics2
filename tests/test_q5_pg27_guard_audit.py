"""Source-only regression tests for Q5 PG27 global maintenance seam census."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "q5_pg27_guard_audit_test",
    ROOT / "candidates/transport/q5_pg27_guard_audit.py"
)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class PG27SourceSeams(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = audit.read_exact_pg27_source()

    def test_actual_1510_pg27_source_census_is_catalogued(self):
        report = audit.source_guard_census(self.source)
        self.assertEqual(report["status"], "SOURCE_CENSUS_ONLY")
        self.assertGreaterEqual(len(report["catalogued_direct_effect_functions"]), 20)
        self.assertFalse(report["canFreezeWorld"])
        self.assertFalse(report["canRoute"])
        self.assertFalse(report["canMigrate"])
        self.assertFalse(report["canActivateQ5"])
        self.assertFalse(report["canWriteWorld"])

    def test_shadow_handler_contract_matches_exactly(self):
        self.assertTrue(audit.inspect_handler_contract_matches_shadow_model())
        self.assertEqual(len(audit.HANDLER_SEAMS), 12)
        self.assertEqual(audit.HANDLER_SEAMS["q5_scheduler"], ())
        self.assertEqual(audit.HANDLER_SEAMS["bulk_scheduler"], ())

    def test_each_existing_writer_handler_has_real_source_anchor(self):
        found = audit.named_functions(self.source)
        for category, names in audit.HANDLER_SEAMS.items():
            if category in ("q5_scheduler", "bulk_scheduler"):
                continue
            self.assertGreater(len(names), 0, category)
            for name in names:
                self.assertIn(name, found, (category, name))

    def test_real_q4_and_physical_low_level_writers_are_accounted_for(self):
        report = audit.source_guard_census(self.source)
        effects = report["catalogued_direct_effect_functions"]
        for name in (
            "safeMovePartial", "enqueueFromSource", "enqueueFromEjectedEntity",
            "dequeueToReceiver", "recoverJournal",
            "saveJournal", "saveQueueJournal", "persistQueueMeta",
            "persistQueuePage"
        ):
            self.assertIn(name, effects)
            self.assertGreater(effects[name], 0)

    def test_pg25_recovery_is_a_hold_seam_not_a_direct_journal_writer(self):
        census = audit.source_guard_census(self.source)
        self.assertIn("recoverQueueJournal", audit.named_functions(self.source))
        self.assertNotIn("recoverQueueJournal",
                         census["catalogued_direct_effect_functions"])
        self.assertIn("pg25PreservePendingQueueJournal",
                      audit.named_functions(self.source))

    def test_source_contains_all_known_delayed_and_event_callback_registrations(self):
        report = audit.source_guard_census(self.source)
        self.assertEqual(report["registrations"]["system.runInterval("], 7)
        self.assertEqual(report["registrations"]["world.afterEvents."], 6)
        self.assertEqual(report["registrations"]["world.beforeEvents."], 4)
        self.assertEqual(
            report["registrations"]["system.beforeEvents.startup.subscribe("], 2
        )
        self.assertIsInstance(report["top_level_callback_effect_calls"], list)

    def test_uncatalogued_new_direct_item_writer_refuses(self):
        changed = self.source + (
            "\nfunction newUnreviewedWriter(container, stack) {\n"
            "  container.setItem(0, stack);\n}\n"
        )
        with self.assertRaisesRegex(audit.Q5CoverageRefused,
                                    "uncatalogued_direct_effects:newUnreviewedWriter"):
            audit.source_guard_census(changed)

    def test_unreviewed_new_world_property_writer_refuses(self):
        changed = self.source + (
            "\nfunction surpriseQ5WorldWrite(key, value) {\n"
            "  world.setDynamicProperty(key, value);\n}\n"
        )
        with self.assertRaisesRegex(audit.Q5CoverageRefused,
                                    "uncatalogued_direct_effects:surpriseQ5WorldWrite"):
            audit.source_guard_census(changed)

    def test_missing_queue_ingress_seam_refuses(self):
        mutated = self.source.replace(
            "function enqueueFromSource(", "function removedEnqueueFromSource(", 1
        )
        self.assertNotEqual(mutated, self.source)
        with self.assertRaisesRegex(audit.Q5CoverageRefused,
                                    "missing_handler_seams:.*enqueueFromSource"):
            audit.source_guard_census(mutated)

    def test_missing_physical_recovery_handler_refuses(self):
        mutated = self.source.replace(
            "function recoverJournal(", "function recoveredSomeOtherWay(", 1
        )
        self.assertNotEqual(mutated, self.source)
        with self.assertRaisesRegex(audit.Q5CoverageRefused,
                                    "missing_handler_seams:.*recoverJournal"):
            audit.source_guard_census(mutated)

    def test_new_scheduler_callback_is_a_contract_change(self):
        mutated = self.source + "\nsystem.runInterval(newUnreviewedScheduler, 1);\n"
        with self.assertRaisesRegex(audit.Q5CoverageRefused,
                                    "callback_surface_changed"):
            audit.source_guard_census(mutated)

    def test_new_entity_listener_is_a_contract_change(self):
        mutated = self.source + "\nworld.afterEvents.entitySpawn.subscribe(() => {});\n"
        with self.assertRaisesRegex(audit.Q5CoverageRefused,
                                    "callback_surface_changed"):
            audit.source_guard_census(mutated)

    def test_removed_delayed_retry_callback_is_detected(self):
        old = "system.runTimeout(() => processEjectedItemEntity("
        self.assertIn(old, self.source)
        mutated = self.source.replace(old, "system.runTimeout(() => processLostEntity(", 1)
        with self.assertRaisesRegex(audit.Q5CoverageRefused,
                                    "callback_registration_changed"):
            audit.source_guard_census(mutated)

    def test_comments_and_quoted_text_do_not_forge_effect_calls(self):
        base = audit.source_guard_census(self.source)
        changed = self.source + (
            "\n// function ghost() { container.setItem(0, item); }\n"
            "const ignoredWarning = 'world.setDynamicProperty(unreviewed, true)';\n"
            "/* world.afterEvents.entitySpawn.subscribe(() => scary()); */\n"
        )
        second = audit.source_guard_census(changed)
        self.assertEqual(second["catalogued_direct_effect_functions"],
                         base["catalogued_direct_effect_functions"])

    def test_lexical_audit_not_mistaken_for_live_runtime_gate(self):
        report = audit.source_guard_census(self.source)
        for field in ("canFreezeWorld", "canRoute", "canMigrate",
                      "canActivateQ5", "canWriteWorld"):
            self.assertIs(report[field], False)
        # Actual world property/vanilla ingress and unloaded-block custody
        # are outside this lexical census. They require separate LAB proof.


if __name__ == "__main__":
    unittest.main()
