"""PG27 guard-weaving preview tests; source only; never assemble/install pack."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
  "q5_source_preview",ROOT/"candidates/transport/q5_guard_weave_preview.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Q5SourcePrecommitPreview(unittest.TestCase):
  @classmethod
  def setUpClass(cls):
    cls.preview=mod.derive_and_weave_pg27()
    cls.source=mod.audit.read_exact_pg27_source()

  def test_guarded_entry_points_inserted_before_original_body(self):
    r=self.preview
    self.assertEqual(r["status"],"NONDEPLOYABLE_SOURCE_PREVIEW")
    self.assertEqual(r["guarded_function_count"],len(mod.BOUNDARY_FUNCTIONS))
    self.assertGreater(len(mod.BOUNDARY_FUNCTIONS),30)
    spans=mod.audit.named_functions(r["source"])
    for name in mod.BOUNDARY_FUNCTIONS:
      with self.subTest(name=name):
        body=r["source"][spans[name][0]:spans[name][1]]
        self.assertTrue(body.lstrip().startswith(
          "q5SourcePreviewHold('"+name+"');"),name)
    self.assertNotEqual(r["source"],self.source)

  def test_no_permission_or_installable_artifact(self):
    for key in ["canInstall","canFreezeWorld","canRoute","canWriteWorld",
                "canMigrate","canActivateQ5"]:
      self.assertIs(self.preview[key],False)
    self.assertGreaterEqual(len(self.preview["unresolved_callbacks"]),8)
    self.assertTrue(any("physical_commit" in x
        for x in self.preview["unresolved_callbacks"]))
    self.assertTrue(any("vanilla" in x
        for x in self.preview["unresolved_callbacks"]))

  def test_original_pg27_byte_sequence_is_unchanged_as_an_input(self):
    # Remove the added sentinel and exact entry guards; must reconstruct the
    # entire original main.js byte-for-byte, never alter a line in the source.
    text=self.preview["source"]
    prefix=(
        "\n// Q5 OFFLINE TEST ONLY: unconditional denial, NOT a Bedrock gate.\n"
        "function q5SourcePreviewHold(site) {\n"
        '    throw new Error("Q5_UNINSTALLABLE_GUARD_PREVIEW:" + site);\n'
        "}\n"
    )
    self.assertTrue(text.startswith(prefix))
    text=text[len(prefix):]
    for name in mod.BOUNDARY_FUNCTIONS:
      marker="\n    q5SourcePreviewHold('"+name+"'); // OFFLINE TEST ONLY\n"
      self.assertEqual(text.count(marker),1,name)
      text=text.replace(marker,"",1)
    self.assertEqual(text,self.source)

  def test_generated_preview_is_valid_javascript_module_syntax(self):
    if shutil.which("node") is None:
      self.skipTest("Node missing in local environment; CI Node required")
    result=subprocess.run(["node","--check","--input-type=module"],
      input=self.preview["source"],text=True,capture_output=True,timeout=30)
    self.assertEqual(result.returncode,0,result.stderr[:1800])

  def test_all_current_guarded_callbacks_unconditionally_refuse(self):
    self.assertEqual(self.preview["source"].count(
      "q5SourcePreviewHold('"),len(mod.BOUNDARY_FUNCTIONS))
    self.assertIn("throw new Error",self.preview["source"])

  def test_existing_source_census_refuses_new_mutator(self):
    with self.assertRaises(mod.audit.Q5CoverageRefused):
      mod.weave_offline_preview(self.source+"\nworld.setDynamicProperty('x','y');")

  def test_missing_entrypoint_fails_instead_of_omitting_guard(self):
    for name in ("safeMovePartial","processEjectedItemEntity",
                 "recoverQueueJournal","pg26TransportStillMatches"):
      changed=self.source.replace("function "+name+"(",
                                  "function removed_"+name+"(",1)
      with self.subTest(name=name),self.assertRaises(
        (mod.UninstallablePreviewError,mod.audit.Q5CoverageRefused)):
        mod.weave_offline_preview(changed)

  def test_new_deferred_event_callback_requires_an_updated_census(self):
    with self.assertRaises(mod.audit.Q5CoverageRefused):
      mod.weave_offline_preview(
        self.source+"\nsystem.runTimeout(() => unsafeMove(), 1);")

  def test_no_writer_or_world_authority_in_preview_compiler(self):
    compiler=(ROOT/"candidates/transport/q5_guard_weave_preview.py").read_text()
    for blocked in ("setDynamicProperty(", "setItem(", "moveItem(",
                    "saveQueueJournal(", "runCommand(",
                    "shutil.copytree", "manifest.json"):
      self.assertNotIn(blocked,compiler)

if __name__=="__main__":
  unittest.main()
