"""Offline self-tests for blueprint contract validator; no GitHub or runtime access."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from validate_blueprint import REQUIRED_DOCS, validate  # noqa: E402


class BlueprintValidatorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        # Keep temporary project fixtures independent of the CI repository identity.
        self.github_env = patch.dict("os.environ", {"GITHUB_REPOSITORY": ""})
        self.github_env.start()
        self.addCleanup(self.github_env.stop)
        for rel in (*REQUIRED_DOCS, 'docs/ROADMAP.md', 'docs/IDEA_INBOX.md',
                    'docs/CURRENT_DEVELOPMENT_STATE.md', 'docs/ENGINEERING_EVIDENCE_REGISTER.md'):
            p = self.root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("# Test\n", encoding="utf-8")
        (self.root / "src").mkdir()
        (self.root / "docs/ROADMAP.md").write_text("# Test roadmap\n\n## Outcome\nPurpose\n\n## Completed\nNone\n\n## Now\nNo active milestone.\n\n## Next\nIdeas only\n\n## Later\nFuture\n\n## Decisions and blockers\nNone\n", encoding="utf-8")
        self.data = {
            "schema_version": 1,
            "standard_version": "1.0.0",
            "project": {"name": "test", "kind": "utility", "platform_profiles": ["generic"]},
            "source": {"active": "src", "frozen_references": [], "archives": []},
            "state": {"lifecycle": "development", "current_state": "docs/CURRENT_DEVELOPMENT_STATE.md",
                      "evidence": "docs/ENGINEERING_EVIDENCE_REGISTER.md"},
            "release": {"approved": False},
            "temporary_instrumentation": [],
            "planning": {"roadmap": "docs/ROADMAP.md", "inbox": "docs/IDEA_INBOX.md", "current_milestone": None},
        }
        self.save()

    def tearDown(self):
        self.tmp.cleanup()

    def save(self):
        (self.root / "project-blueprint.json").write_text(
            json.dumps(self.data), encoding="utf-8"
        )

    def test_valid_minimal_project(self):
        # Temporary project fixtures are independent of the host GitHub repository.
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": ""}):
            self.assertEqual(validate(self.root), [])

    def test_detect_template_not_customized_in_ci(self):
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": "example/other"}):
            self.assertTrue(any("project.name must match" in x for x in validate(self.root)))

    def test_compact_project_does_not_need_all_policy_files(self):
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": ""}):
            self.assertEqual(validate(self.root), [])

    def test_reject_missing_document(self):
        (self.root / "AGENTS.md").unlink()
        self.assertTrue(any("AGENTS.md" in x for x in validate(self.root)))

    def test_reject_source_path_escape(self):
        self.data["source"]["active"] = "../elsewhere"
        self.save()
        self.assertTrue(any("unsafe path" in x for x in validate(self.root)))

    def test_reject_archive_overlapping_active_source(self):
        self.data["source"]["archives"] = ["src"]
        self.save()
        self.assertTrue(any("overlaps" in x for x in validate(self.root)))

    def test_reject_unrecorded_approved_release(self):
        self.data["release"]["approved"] = True
        self.save()
        self.assertTrue(any("approved release" in x for x in validate(self.root)))

    def test_reject_unsupported_profile(self):
        self.data["project"]["platform_profiles"] = ["imaginary"]
        self.save()
        self.assertTrue(any("platform_profiles" in x for x in validate(self.root)))


    def test_registered_temporary_debug_is_allowed_while_active(self):
        (self.root / "src/debug.py").write_text("# TEMP_DEBUG:QUEUE-42\n", encoding="utf-8")
        self.data["temporary_instrumentation"] = [{
            "id": "QUEUE-42", "kind": "debug", "task": "Verify queue behavior",
            "path": "src/debug.py", "status": "active"
        }]
        self.save()
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": ""}):
            self.assertEqual(validate(self.root), [])

    def test_unregistered_temporary_debug_tag_rejected(self):
        (self.root / "src/debug.py").write_text("# TEMP_DEBUG:QUEUE-42\n", encoding="utf-8")
        self.assertTrue(any("unregistered temporary" in e for e in validate(self.root)))

    def test_missing_declared_tag_rejected(self):
        (self.root / "src/debug.py").write_text("# no tag\n", encoding="utf-8")
        self.data["temporary_instrumentation"] = [{
            "id": "QUEUE-42", "kind": "debug", "task": "Verify queue behavior",
            "path": "src/debug.py", "status": "active"
        }]
        self.save()
        self.assertTrue(any("missing tag" in e for e in validate(self.root)))

    def test_completed_task_cannot_keep_debug_code(self):
        (self.root / "src/debug.py").write_text("# TEMP_DEBUG:QUEUE-42\n", encoding="utf-8")
        self.data["temporary_instrumentation"] = [{
            "id": "QUEUE-42", "kind": "debug", "task": "Verify queue behavior",
            "path": "src/debug.py", "status": "completed"
        }]
        self.save()
        self.assertTrue(any("must be removed" in e for e in validate(self.root)))

    def test_historical_release_allows_new_development_debug(self):
        (self.root / "src/debug.py").write_text("# TEMP_DEBUG:QUEUE-42\n", encoding="utf-8")
        self.data["temporary_instrumentation"] = [{
            "id": "QUEUE-42", "kind": "debug", "task": "New development",
            "path": "src/debug.py", "status": "active"
        }]
        self.data["release"] = {
            "approved": True, "commit": "a" * 40, "artifact_sha256": "b" * 64,
            "approval_reference": "release 1.0 decision", "evidence_reference": "release acceptance"
        }
        self.save()
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": ""}):
            self.assertEqual(validate(self.root), [])

    def test_explicit_release_gate_rejects_debug_from_development(self):
        (self.root / "src/debug.py").write_text("# TEMP_DEBUG:QUEUE-42\n", encoding="utf-8")
        self.data["temporary_instrumentation"] = [{
            "id": "QUEUE-42", "kind": "debug", "task": "Current task",
            "path": "src/debug.py", "status": "active"
        }]
        self.save()
        self.assertTrue(any("release candidate cannot retain" in e
                            for e in validate(self.root, release_gate=True)))

    def test_explicit_release_gate_accepts_clean_candidate(self):
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": ""}):
            self.assertEqual(validate(self.root, release_gate=True), [])

    def test_compact_inbox_and_evidence_can_share_declared_files(self):
        self.data["planning"]["inbox"] = "docs/ROADMAP.md"
        self.data["state"]["evidence"] = "docs/CURRENT_DEVELOPMENT_STATE.md"
        (self.root / "docs/IDEA_INBOX.md").unlink()
        (self.root / "docs/ENGINEERING_EVIDENCE_REGISTER.md").unlink()
        self.save()
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": ""}):
            self.assertEqual(validate(self.root), [])

    def test_minimal_adoption_example_validates_as_written(self):
        """The published JSON example is complete and works without extra policy files."""
        project_root = Path(__file__).resolve().parents[1]
        guide = (project_root / "docs/ADOPTION_GUIDE.md").read_text(encoding="utf-8")
        section = guide.split("## Minimal project example\n", 1)[1]
        example = section.split("```json\n", 1)[1].split("\n```", 1)[0]
        self.data = json.loads(example)
        canonical = json.loads((project_root / "project-blueprint.json").read_text(encoding="utf-8"))
        self.assertEqual(self.data["schema_version"], canonical["schema_version"])
        self.assertEqual(self.data["standard_version"], canonical["standard_version"])
        self.assertEqual(set(self.data), set(canonical))
        self.assertEqual(self.data["planning"]["roadmap"], self.data["planning"]["inbox"])
        self.assertEqual(self.data["state"]["current_state"], self.data["state"]["evidence"])

        # Prove a compact project needs only the declared files, not separate registers.
        (self.root / "docs/IDEA_INBOX.md").unlink()
        (self.root / "docs/ENGINEERING_EVIDENCE_REGISTER.md").unlink()
        self.save()
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": "example/MyDiscordBot"}):
            self.assertEqual(validate(self.root), [])
            self.assertEqual(validate(self.root, release_gate=True), [])

    def test_registry_is_required(self):
        del self.data["temporary_instrumentation"]
        self.save()
        self.assertTrue(any("temporary_instrumentation must be an array" in e for e in validate(self.root)))


    def test_declared_roadmap_is_still_required(self):
        (self.root / "docs/ROADMAP.md").unlink()
        self.assertTrue(any("planning.roadmap: target file not found" in e
                            for e in validate(self.root)))

    def test_missing_planning_contract_is_rejected(self):
        del self.data["planning"]
        self.save()
        self.assertTrue(any("planning must be an object" in x for x in validate(self.root)))

    def test_current_milestone_must_be_declared_in_now(self):
        self.data["planning"]["current_milestone"] = "M-001"
        self.save()
        self.assertTrue(any("not in Now section" in x for x in validate(self.root)))

    def test_matching_current_milestone_passes(self):
        self.data["planning"]["current_milestone"] = "M-001"
        roadmap = self.root / "docs/ROADMAP.md"
        roadmap.write_text(roadmap.read_text().replace("No active milestone.", "M-001 — Deliver first working example."), encoding="utf-8")
        self.save()
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": ""}):
            self.assertEqual(validate(self.root), [])

    def test_null_current_requires_explicit_no_active_milestone(self):
        roadmap = self.root / "docs/ROADMAP.md"
        roadmap.write_text(roadmap.read_text().replace("No active milestone.", "Working on ideas."), encoding="utf-8")
        self.assertTrue(any("Now must say" in x for x in validate(self.root)))

    def test_roadmap_sections_are_required(self):
        roadmap = self.root / "docs/ROADMAP.md"
        roadmap.write_text(roadmap.read_text().replace("## Later", "## Eventually"), encoding="utf-8")
        self.assertTrue(any("missing section Later" in x for x in validate(self.root)))

    def test_planning_paths_cannot_escape_repo(self):
        self.data["planning"]["inbox"] = "../external.md"
        self.save()
        self.assertTrue(any("planning.inbox: unsafe path" in x for x in validate(self.root)))




    def test_unregistered_isolated_test_probe_is_allowed_during_development(self):
        (self.root / "tests").mkdir()
        (self.root / "tests/probe.py").write_text("# TEMP_TEST:PROBE-42\n", encoding="utf-8")
        self.data["source"]["test_roots"] = ["tests"]
        self.save()
        self.assertEqual(validate(self.root), [])

    def test_isolated_test_probe_is_rejected_by_release_gate(self):
        (self.root / "tests").mkdir()
        (self.root / "tests/probe.py").write_text("# TEMP_TEST:PROBE-42\n", encoding="utf-8")
        self.data["source"]["test_roots"] = ["tests"]
        self.save()
        self.assertTrue(any("release candidate retains disposable test probe" in e
                            for e in validate(self.root, release_gate=True)))

    def test_unregistered_runtime_test_probe_still_requires_registration(self):
        (self.root / "src/probe.py").write_text("# TEMP_TEST:PROBE-42\n", encoding="utf-8")
        self.assertTrue(any("unregistered temporary tag" in e for e in validate(self.root)))

    def test_test_root_nested_within_active_source_gets_test_only_exception(self):
        (self.root / "src/test_only").mkdir()
        (self.root / "src/test_only/probe.py").write_text(
            "# TEMP_TEST:PROBE-42\n", encoding="utf-8"
        )
        self.data["source"]["test_roots"] = ["src/test_only"]
        self.save()
        self.assertEqual(validate(self.root), [])
        self.assertTrue(any("release candidate retains disposable test probe" in e
                            for e in validate(self.root, release_gate=True)))

    def test_declared_external_test_root_allows_temp_helper(self):
        (self.root / "tests").mkdir()
        (self.root / "tests/temp_probe.py").write_text("# TEMP_TEST:PROBE-42\n", encoding="utf-8")
        self.data["source"]["test_roots"] = ["tests"]
        self.data["temporary_instrumentation"] = [{
            "id": "PROBE-42", "kind": "test", "task": "Probe 42",
            "path": "tests/temp_probe.py", "status": "active"
        }]
        self.save()
        self.assertEqual(validate(self.root), [])

    def test_declared_test_root_finds_unregistered_tags(self):
        (self.root / "tests").mkdir()
        (self.root / "tests/temp_probe.py").write_text("# TEMP_DEBUG:PROBE-42\n", encoding="utf-8")
        self.data["source"]["test_roots"] = ["tests"]
        self.save()
        self.assertTrue(any("unregistered temporary tag" in x for x in validate(self.root)))

    def test_tests_outside_declared_roots_cannot_be_registered(self):
        (self.root / "tests").mkdir()
        (self.root / "tests/temp_probe.py").write_text("# TEMP_DEBUG:PROBE-42\n", encoding="utf-8")
        self.data["temporary_instrumentation"] = [{
            "id": "PROBE-42", "kind": "debug", "task": "Probe 42",
            "path": "tests/temp_probe.py", "status": "active"
        }]
        self.save()
        self.assertTrue(any("outside active source" in x for x in validate(self.root)))

    def test_test_root_cannot_be_historical_source(self):
        (self.root / "tests").mkdir()
        self.data["source"]["archives"] = ["tests"]
        self.data["source"]["test_roots"] = ["tests"]
        self.save()
        self.assertTrue(any("test root overlaps" in x for x in validate(self.root)))

    def test_root_level_active_source_is_allowed(self):
        (self.root / "main.py").write_text("print('ok')\n", encoding="utf-8")
        (self.root / "docs/example.md").write_text("# TEMP_DEBUG:DEMO-42\n", encoding="utf-8")
        self.data["source"]["active"] = "."
        self.save()
        self.assertEqual(validate(self.root), [])

    def test_root_source_excludes_historical_archive_from_scan(self):
        archive = self.root / "history"
        archive.mkdir()
        (archive / "old.py").write_text("# TEMP_DEBUG:OLD-42\n", encoding="utf-8")
        self.data["source"]["active"] = "."
        self.data["source"]["archives"] = ["history"]
        self.save()
        self.assertEqual(validate(self.root), [])

    def test_comment_marker_in_string_is_not_instrumentation(self):
        (self.root / "src/example.py").write_text(
            'fixture = "# TEMP_DEBUG:MOCK-42"\n', encoding="utf-8"
        )
        self.assertEqual(validate(self.root), [])

    def test_root_source_rejects_external_absolute_path(self):
        self.data["source"]["active"] = "/"
        self.save()
        self.assertTrue(any("unsafe path" in x for x in validate(self.root)))

if __name__ == "__main__":
    unittest.main()
