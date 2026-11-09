"""Exact-PG27 native-call cutpoint refusal tests; source-only and uninstalled."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "q5_native_precommit_preview",
    ROOT / "candidates/transport/q5_native_precommit_preview.py"
)
preview = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preview)


class NativePrecommitPreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = preview.native.audit.read_exact_pg27_source()
        cls.result = preview.weave_native_precommit_refusals(cls.source)

    def test_all_exact_pg27_native_effects_have_first_argument_refusal(self):
        r = self.result
        self.assertEqual(r["status"], "NONDEPLOYABLE_NATIVE_PRECOMMIT_REFUSAL_PREVIEW")
        self.assertEqual(r["nativeEffectCount"], 33)
        self.assertEqual(len(r["sites"]), 33)
        self.assertEqual(len({s["index"] for s in r["sites"]}), 33)
        for site in r["sites"]:
            self.assertIn(site["owner"], (
                set(preview.native.audit.named_functions(self.source)) |
                {"<top-level-callback>"}
            ))
            self.assertTrue(site["inserted"].startswith(
                preview.HOLD_FUNCTION + "('native:"
            ))
            self.assertEqual(
                self.result["source"].count(site["inserted"]), 1, site
            )

    def test_preview_strips_back_to_exact_unchanged_original(self):
        rendered = self.result["source"]
        self.assertTrue(rendered.startswith(preview.SENTINEL))
        rendered = rendered[len(preview.SENTINEL):]
        for site in self.result["sites"]:
            self.assertEqual(rendered.count(site["inserted"]), 1, site)
            rendered = rendered.replace(site["inserted"], "", 1)
        self.assertEqual(rendered, self.source)

    def test_guards_are_adjacent_to_exact_native_open_parens(self):
        masked = preview.native.audit.mask_js(self.source)
        matches = list(preview.native.NATIVE_MUTATOR_RE.finditer(masked))
        self.assertEqual(len(matches), len(self.result["sites"]))
        for match, site in zip(matches, self.result["sites"]):
            self.assertEqual(match.end(), site["position"])
            self.assertEqual(match.group("method"), site["method"])
            self.assertEqual(
                self.source[match.end():].lstrip().startswith(")"),
                not site["originalHasArgs"]
            )

    def test_zero_arg_entity_remove_has_no_injected_trailing_comma(self):
        empties = [s for s in self.result["sites"] if not s["originalHasArgs"]]
        self.assertTrue(any(s["method"] == "remove" for s in empties))
        for site in empties:
            self.assertFalse(site["inserted"].endswith(", "))

    def test_native_string_first_argument_is_not_an_empty_call(self):
        # Regression for setType("minecraft:air"): the masked source
        # replaces string bytes with whitespace, but this is NOT remove().
        quoted = [s for s in self.result["sites"]
                  if self.source[s["position"]:].lstrip().startswith(
                      ('"', "'"))]
        self.assertTrue(any(s["method"] == "setType" for s in quoted))
        for site in quoted:
            self.assertTrue(site["originalHasArgs"], site)
            self.assertTrue(site["inserted"].endswith(", "), site)

    def test_every_authority_bit_remains_closed(self):
        for key in ("canInstall", "canFreezeWorld", "canRoute", "canMigrate",
                    "canWriteWorld", "canActivateQ5", "hasRealMaintenanceMarker",
                    "hasPrecommitEpochProof", "hasVanillaIsolationProof",
                    "hasCrashAtomicityProof"):
            self.assertIs(self.result[key], False, key)

    def test_generated_pg27_source_parses_as_js_module(self):
        if shutil.which("node") is None:
            self.skipTest("Node unavailable; GitHub CI provides Node")
        result = subprocess.run(
            ["node", "--check", "--input-type=module"],
            input=self.result["source"], text=True, capture_output=True,
            timeout=30
        )
        self.assertEqual(result.returncode, 0, result.stderr[:2500])

    def test_native_mutation_added_or_removed_fails_closed(self):
        added = self.source + "\nworld.setDynamicProperty('unsafe','value');\n"
        removed = self.source.replace(".moveItem(", ".notMoveItem(", 1)
        self.assertNotEqual(removed, self.source)
        for bad in (added, removed):
            with self.subTest(kind=("added" if bad is added else "removed")):
                with self.assertRaises(
                    (preview.native.NativeEffectCoverageRefused,
                     preview.native.audit.Q5CoverageRefused,
                     preview.NativePrecommitPreviewRefused)
                ):
                    preview.weave_native_precommit_refusals(bad)

    def test_js_comments_do_not_create_false_native_mutations(self):
        with_comment = self.source + "\n// fake.moveItem(1,2)\n"
        result = preview.weave_native_precommit_refusals(with_comment)
        self.assertEqual(result["nativeEffectCount"], 33)
        self.assertTrue(result["source"].endswith("// fake.moveItem(1,2)\n"))

    def test_preview_marker_collision_is_rejected(self):
        with self.assertRaises(preview.NativePrecommitPreviewRefused):
            preview.weave_native_precommit_refusals(
                self.source + "\n// " + preview.HOLD_FUNCTION
            )

    def test_synthetic_js_first_argument_refusal_prevents_native_invocation(self):
        # Evaluation-order witness only; NOT an actual Bedrock runtime test.
        if shutil.which("node") is None:
            self.skipTest("Node unavailable")
        program = r"""
            let nativeCalls = 0, laterArgumentEffects = 0, refused = 0;
            const container = {
                setItem(...args) { nativeCalls++; },
                remove(...args) { nativeCalls++; }
            };
            function q5OfflineNativeEffectHold() { throw Error('HOLD'); }
            try {
                container.setItem(q5OfflineNativeEffectHold('site'),
                                  ++laterArgumentEffects);
            } catch(e) { if (e.message === 'HOLD') refused++; }
            try {
                container.remove(q5OfflineNativeEffectHold('site'));
            } catch(e) { if (e.message === 'HOLD') refused++; }
            if (refused !== 2 || nativeCalls !== 0 ||
                laterArgumentEffects !== 0) process.exit(1);
        """
        result = subprocess.run(
            ["node", "-e", program], text=True, capture_output=True, timeout=15
        )
        self.assertEqual(result.returncode, 0, result.stderr[:1500])

    def test_preview_source_is_not_a_pack_or_deployment_tool(self):
        program = (ROOT / "candidates/transport/q5_native_precommit_preview.py").read_text(
            encoding="utf-8"
        )
        for forbidden in ("setDynamicProperty(", "setItem(", "moveItem(",
                          "manifest.json", "shutil.copytree", "server.properties"):
            self.assertNotIn(forbidden, program)
        self.assertNotIn("TEMP_TEST:", program)


if __name__ == "__main__":
    unittest.main()
