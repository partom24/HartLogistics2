"""PG32 exact-source temporary diagnostic must not alter PG27 gameplay/custody."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "pg32_exact_candidate", ROOT / "candidates/pg32/prepare_candidate.py")
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)

class PG32BuildContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="pg32-build-")
        cls.old = Path(cls.tmp.name) / "pg27"
        cls.new = Path(cls.tmp.name) / "pg32"
        pg.pg27.prepare(cls.old)
        pg.prepare(cls.new)
        cls.base = (cls.old / "behavior_pack/scripts/main.js").read_text()
        cls.main = (cls.new / "behavior_pack/scripts/main.js").read_text()
        cls.overlay = (ROOT / "candidates/pg32/event_cancel_overlay.js").read_text()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_exact_source_delta_is_only_version_and_first_statement_and_overlay(self):
        base = self.base.replace('const VERSION = "1.5.10-LAB-PG27";',
                                 'const VERSION = "1.5.14-LAB-PG32-NOTHROW-BEFORE-EVENT";')
        self.assertEqual(self.main, pg.weave(base, self.overlay))
        self.assertEqual(self.main.count(pg.GUARD.strip()), 1)
        self.assertEqual(self.main.count(pg.ANCHOR), 1)
        self.assertIn(pg.ANCHOR + pg.GUARD, self.main)

    def test_exact_baseline_pack_footprint_and_unmodified_resources(self):
        for kind, count in (("behavior_pack",18),("resource_pack",59)):
            old = {p.relative_to(self.old / kind)
                   for p in (self.old / kind).rglob("*") if p.is_file()}
            new = {p.relative_to(self.new / kind)
                   for p in (self.new / kind).rglob("*") if p.is_file()}
            self.assertEqual(old,new)
            self.assertEqual(len(new),count)
            for path in old:
                if path not in (Path("manifest.json"),
                                Path("scripts/main.js")):
                    self.assertEqual((self.old/kind/path).read_bytes(),
                                     (self.new/kind/path).read_bytes())

    def test_pinned_versions_and_original_uuids_and_dependencies(self):
        for kind in ("behavior_pack","resource_pack"):
            old = json.loads((self.old/kind/"manifest.json").read_text())
            new = json.loads((self.new/kind/"manifest.json").read_text())
            self.assertEqual(new["header"]["version"],[1,5,14])
            self.assertEqual(new["header"]["uuid"],old["header"]["uuid"])
            self.assertEqual(new["header"]["min_engine_version"],
                             old["header"]["min_engine_version"])
            for original,changed in zip(old["modules"],new["modules"],strict=True):
                self.assertEqual(changed["version"],[1,5,14])
                changed["version"]=original["version"]
                self.assertEqual(changed,original)
            for original,changed in zip(old.get("dependencies",[]),
                                        new.get("dependencies",[]),strict=True):
                if changed.get("uuid"):
                    self.assertEqual(changed["version"],[1,5,14])
                    changed["version"]=original["version"]
                self.assertEqual(changed,original)

    def test_drift_missing_or_duplicated_subscription_refused(self):
        normalized = self.base.replace('const VERSION = "1.5.10-LAB-PG27";',
          'const VERSION = "1.5.14-LAB-PG32-NOTHROW-BEFORE-EVENT";')
        for altered in (
            normalized.replace(pg.ANCHOR, "unknownEvent.subscribe(ev => {",1),
            normalized + "\n" + pg.ANCHOR + "\n"
        ):
            with self.assertRaisesRegex(ValueError,"PG32 REFUSED"):
                pg.weave(altered,self.overlay)

    def test_overlay_permission_identity_and_native_write_refusal(self):
        for injection in (
            "world.setDynamicProperty('bad', 1);",
            "source.moveItem(0, 0, target);",
            "saveQueueJournal();",
            "new ItemStack('minecraft:dirt',1);"
        ):
            with self.assertRaisesRegex(ValueError,"unexpected world or custody effect"):
                pg.weave(self.base, self.overlay + "\n" + injection)
        with self.assertRaisesRegex(ValueError, "event target or cancellation"):
            pg.weave(self.base,self.overlay.replace("ev.cancel = true;",
                                                     "ev.cancel = false;"))
        with self.assertRaisesRegex(ValueError,"permission/cheat"):
            pg.weave(self.base,self.overlay.replace("cheatsRequired: false",
                                                     "cheatsRequired: true"))

    def test_determinism_refuse_existing_output_and_no_baseline_mutation(self):
        with tempfile.TemporaryDirectory() as td:
            target=Path(td)/"copy"
            pg.prepare(target)
            for f in self.new.rglob("*"):
                if f.is_file():
                    self.assertEqual(f.read_bytes(),
                                     (target/f.relative_to(self.new)).read_bytes())
            with self.assertRaises(FileExistsError):
                pg.prepare(target)
        self.assertIn('const VERSION = "1.5.10-LAB-PG27";',
                      (self.old/"behavior_pack/scripts/main.js").read_text())

if __name__=="__main__":
    unittest.main()
