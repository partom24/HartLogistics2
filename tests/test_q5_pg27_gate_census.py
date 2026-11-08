"""Mutation-based source census tests: no BDS, launcher or world access."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "q5_pg27_census", ROOT/"candidates/transport/q5_pg27_gate_census.py")
census = importlib.util.module_from_spec(spec)
spec.loader.exec_module(census)
builder_spec = importlib.util.spec_from_file_location(
    "q5_pg27_builder", ROOT/"candidates/pg27/prepare_candidate.py")
builder = importlib.util.module_from_spec(builder_spec)
builder_spec.loader.exec_module(builder)

class Q5SourceGuardCensus(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scratch=tempfile.TemporaryDirectory(prefix="q5-census-test-")
        out=Path(cls.scratch.name)/"pg27"
        builder.prepare(out)
        cls.source=(out/"behavior_pack/scripts/main.js").read_text(encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.scratch.cleanup()

    def test_exact_pg27_source_census_is_consistent_but_not_gated(self):
        result=census.census_source(self.source)
        self.assertEqual(result["status"],"SOURCE_CENSUS_ONLY")
        self.assertGreaterEqual(result["function_entry_points"],30)
        self.assertFalse(result["guarded"])
        self.assertFalse(result["runtime_freeze_verified"])
        self.assertFalse(result["migration_allowed"])
        self.assertFalse(result["q5_authority_allowed"])

    def test_source_builder_reuse_is_stable(self):
        result=census.census_generated_pg27(ROOT)
        self.assertEqual(result,census.census_source(self.source))

    def test_all_named_function_entry_points_are_not_silently_skipped(self):
        for func in (*census.FUNCTION_SITES,*census.PIPE_SITES):
            mutated=self.source.replace("function "+func+"(", "function renamed_"+func+"(",1)
            with self.subTest(func=func),self.assertRaises(census.UnsafeCoverage):
                census.census_source(mutated)

    def test_new_physical_or_queue_writer_call_cannot_escape_census(self):
        for literal in census.WRITER_COUNTS:
            with self.subTest(literal=literal),self.assertRaises(census.UnsafeCoverage):
                census.census_source(self.source+"\n/* new */ "+literal+"\n")

    def test_new_queued_deferred_callback_requires_manual_review(self):
        for literal in census.EVENT_COUNTS:
            with self.subTest(literal=literal),self.assertRaises(census.UnsafeCoverage):
                census.census_source(self.source+"\n/* extra */ "+literal+"\n")

    def test_missing_or_changed_critical_anchors_fail(self):
        for marker in census.CONTRACT_ANCHORS:
            with self.subTest(marker=marker),self.assertRaises(census.UnsafeCoverage):
                census.census_source(self.source.replace(marker,"// REMOVED ANCHOR",1))

    def test_missing_deferred_source_edge_is_detected(self):
        for marker in census.DEFERRED_ANCHORS:
            with self.subTest(marker=marker),self.assertRaises(census.UnsafeCoverage):
                census.census_source(self.source.replace(marker,"// REMOVED EVENT EDGE",1))

    def test_empty_or_non_source_text_holds(self):
        for raw in [None,"",123,False]:
            with self.subTest(raw=raw),self.assertRaises(census.UnsafeCoverage):
                census.census_source(raw)

if __name__=="__main__":
    unittest.main()
