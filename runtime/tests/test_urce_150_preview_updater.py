"""Synthetic safety checks for the 1.5 infrastructure-only LAB installer.
No user server or world is opened. Tests use disposable temporary directories.
"""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location(
    "urce_150_preview_installer",ROOT/"scripts/hartlogistics_150_lab_updater.py")
lab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

class PreviewLabGuard(unittest.TestCase):
    def test_source_pinned_to_150_and_original_142_engine_unmodified(self):
        self.assertEqual(lab.validate_source(ROOT),(1,5,0))
        self.assertEqual(lab.PHASE_A_VERSION,(1,4,2))
        self.assertEqual(lab.PREVIEW_VERSION,(1,5,0))

    def _source_copy(self):
        tmp=tempfile.TemporaryDirectory()
        root=Path(tmp.name)
        shutil.copytree(ROOT/"addon",root/"addon")
        shutil.copy2(ROOT/"BASELINE_HASHES.json",root/"BASELINE_HASHES.json")
        return tmp,root

    def test_changed_original_engine_refused_before_install(self):
        tmp,root=self._source_copy()
        try:
            f=root/"addon/behavior_pack/scripts/main.js"
            f.write_text(f.read_text()+"\n// unauthorized writer change\n")
            with self.assertRaises(lab.UnsafeLab):
                lab.validate_source(root)
        finally:tmp.cleanup()

    def test_unrecognized_new_runtime_file_refused(self):
        tmp,root=self._source_copy()
        try:
            (root/"addon/behavior_pack/scripts/hidden_writer.js").write_text(
                "// Not part of the reviewed manifest\n")
            with self.assertRaises(lab.UnsafeLab):
                lab.validate_source(root)
        finally:tmp.cleanup()

    def test_version_and_uuid_mismatches_refused(self):
        tmp,root=self._source_copy()
        try:
            f=root/"addon/behavior_pack/manifest.json"
            m=json.loads(f.read_text())
            m["header"]["version"]=[1,5,1]
            f.write_text(json.dumps(m))
            with self.assertRaises(lab.UnsafeLab):lab.validate_source(root)
        finally:tmp.cleanup()

    def test_production_and_noncanonical_lab_paths_refused(self):
        lab.assert_lab_name(lab.LAB)
        for candidate in [
            r"C:\Servers\Thomas_MCBedrock",
            lab.LAB+"-other",
            lab.LAB+r"\..",
            lab.LAB.replace("\\","/")
        ]:
            with self.subTest(candidate=candidate),self.assertRaises(lab.UnsafeLab):
                lab.assert_lab_name(candidate)

    def _synthetic_lab(self):
        tmp=tempfile.TemporaryDirectory()
        root=Path(tmp.name)
        (root/"bedrock_server.exe").write_bytes(b"fake test only")
        (root/"server.properties").write_text("level-name=PlayerWorld\n")
        world=root/"worlds/PlayerWorld"
        world.mkdir(parents=True)
        for src,installed,pack_id,reg in lab.PACKS:
            target=root/installed/("HartMods_HartLogistics_"+("BP" if src=="behavior_pack" else "RP"))
            shutil.copytree(ROOT/"addon"/src,target)
            (world/reg).write_text(json.dumps([
                {"pack_id":pack_id,"version":[1,5,0]}]))
        return tmp,root

    def test_identical_150_preview_is_safe_and_registry_noop(self):
        tmp,root=self._synthetic_lab()
        try:
            before={p:p.read_bytes() for p in (root/"worlds/PlayerWorld").iterdir()}
            plan=lab.discover_plan(ROOT,root)
            self.assertEqual(len(plan),2)
            self.assertEqual([x["new_registry"] for x in plan],
                [x["old_bytes"].decode() for x in plan])
            after={p:p.read_bytes() for p in (root/"worlds/PlayerWorld").iterdir()}
            self.assertEqual(before,after)
        finally:tmp.cleanup()

    def test_unexpected_installed_pack_rejected_without_registry_write(self):
        tmp,root=self._synthetic_lab()
        try:
            target=root/"behavior_packs/HartMods_HartLogistics_BP/manifest.json"
            m=json.loads(target.read_text());m["header"]["version"]=[9,9,9]
            target.write_text(json.dumps(m))
            world=root/"worlds/PlayerWorld"
            before={p:p.read_bytes() for p in world.iterdir()}
            with self.assertRaises(lab.UnsafeLab):lab.discover_plan(ROOT,root)
            self.assertEqual(before,{p:p.read_bytes() for p in world.iterdir()})
        finally:tmp.cleanup()

    def test_staged_install_keeps_backups_in_disposable_root_only(self):
        tmp,root=self._synthetic_lab()
        try:
            plan=lab.discover_plan(ROOT,root)
            backup=lab.apply_plan(root,plan)
            self.assertTrue(backup.is_dir())
            self.assertTrue(str(backup).startswith(str(root)))
            for src,installed,pid,reg in lab.PACKS:
                installed_dir=root/installed/("HartMods_HartLogistics_"+(
                    "BP" if src=="behavior_pack" else "RP"))
                self.assertEqual(lab.hashes(ROOT/"addon"/src),lab.hashes(installed_dir))
                self.assertEqual(json.loads((root/"worlds/PlayerWorld"/reg).read_text())[-1]["version"],[1,5,0])
        finally:tmp.cleanup()

if __name__=="__main__":
    unittest.main()
