"""Offline regression: project evidence and operator tool links must survive branch creation."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("continuity", ROOT/"scripts/check_project_continuity.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
COPY = [
 "PROJECT_CONTINUITY.md", "docs/CANONICAL_EVIDENCE_AND_TOOLING.md",
 "docs/PROJECT_STATIC_RESOURCES.json", "AGENTS.md", "README.md",
 "docs/ENGINEERING_EVIDENCE_REGISTER.md", "docs/UPDATER_DEPLOYMENT_DESIGN.md",
 "docs/RELEASE_POLICY.md"
]

class ContinuityTests(unittest.TestCase):
    def test_canonical_checkout_passes(self):
        self.assertEqual(mod.check_repository(ROOT), 0)

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        for p in COPY:
            f = self.root/p
            f.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT/p, f)

    def registry(self):
        return self.root/"docs/PROJECT_STATIC_RESOURCES.json"

    def edit_index(self, callback):
        data = json.loads(self.registry().read_text())
        callback(data)
        self.registry().write_text(json.dumps(data), encoding="utf-8")

    def test_branch_copy_cannot_silently_modify_canonical_catalog(self):
        p = self.root/"docs/CANONICAL_EVIDENCE_AND_TOOLING.md"
        p.write_text(p.read_text().replace("MR movement",
                 "MR movement proved all hard crashes", 1), encoding="utf-8")
        with self.assertRaisesRegex(mod.ContinuityError,
                                    "changed from main"):
            mod.check_repository(self.root)

    def test_missing_original_evidence_ref_refuses(self):
        self.edit_index(lambda d: d.__setitem__("resources",
            [x for x in d["resources"] if x["id"] != "EVIDENCE-HL-E-MAIN"]))
        with self.assertRaises(mod.ContinuityError):
            mod.check_repository(self.root)

    def test_missing_historical_powershell_ref_refuses(self):
        self.edit_index(lambda d: d.__setitem__("resources",
            [x for x in d["resources"] if x["id"] != "PG27-POWERSHELL"]))
        with self.assertRaises(mod.ContinuityError):
            mod.check_repository(self.root)

    def test_mutated_pinned_pg42_provenance_refuses(self):
        self.edit_index(lambda d: next(
            x.__setitem__("commit", "a"*40) for x in d["resources"]
            if x["id"] == "PG42-SESSION"))
        with self.assertRaises(mod.ContinuityError):
            mod.check_repository(self.root)

    def test_branch_name_is_not_immutable_source(self):
        self.edit_index(lambda d: next(
            x.__setitem__("commit", "main") for x in d["resources"]
            if x["id"] == "UCE-POWERSHELL"))
        with self.assertRaises(mod.ContinuityError):
            mod.check_repository(self.root)

    def test_missing_agent_bootstrap_refuses(self):
        p = self.root/"AGENTS.md"
        p.write_text(p.read_text().replace("PROJECT_CONTINUITY.md",
            "missing-static-doc.md"), encoding="utf-8")
        with self.assertRaises(mod.ContinuityError):
            mod.check_repository(self.root)

    def test_missing_main_evidence_pointer_refuses(self):
        p = self.root/"docs/ENGINEERING_EVIDENCE_REGISTER.md"
        p.write_text(p.read_text().replace("CANONICAL_EVIDENCE_AND_TOOLING.md",
            "UNKNOWN_EVIDENCE.md"), encoding="utf-8")
        with self.assertRaises(mod.ContinuityError):
            mod.check_repository(self.root)

if __name__ == "__main__":
    unittest.main()
