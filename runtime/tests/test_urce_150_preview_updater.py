"""Synthetic safety checks for the 1.5 infrastructure-only LAB installer.
No user server or world is opened. Tests use disposable temporary directories.
"""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import subprocess
import tarfile
import io
from unittest.mock import patch

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

    def _synthetic_142_lab(self):
        """Reconstruct exact accepted 1.4.2 source in a disposable world."""
        tmp,root=self._synthetic_lab()
        base="8c8d9eae4a4396fc8413591b407d0178da6f7a21"
        cmd=["git","-C",str(ROOT),"archive","--format=tar",base,
             "addon/behavior_pack","addon/resource_pack"]
        archive=subprocess.run(cmd,capture_output=True,check=True).stdout
        with tarfile.open(fileobj=io.BytesIO(archive)) as members:
            for member in members:
                if not member.isfile():continue
                name=Path(member.name)
                if name.parts[:2] not in (
                    ("addon","behavior_pack"),("addon","resource_pack")):
                    raise AssertionError("unexpected archived path")
                local=name.parts[1]
                target=root/("behavior_packs" if local=="behavior_pack" else "resource_packs")/(
                    "HartMods_HartLogistics_BP" if local=="behavior_pack" else
                    "HartMods_HartLogistics_RP")
                dest=target.joinpath(*name.parts[2:])
                dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_bytes(members.extractfile(member).read())
        # Remove preview-only files that don't exist in the 1.4.2 pack.
        with tarfile.open(fileobj=io.BytesIO(archive)) as members:
            expected={
                (Path(m.name).parts[1],Path(*Path(m.name).parts[2:]).as_posix())
                for m in members if m.isfile()
            }
        for local,installed,pack_id,reg in lab.PACKS:
            target=root/installed/("HartMods_HartLogistics_"+(
                "BP" if local=="behavior_pack" else "RP"))
            for path in target.rglob("*"):
                if path.is_file() and (local,path.relative_to(target).as_posix()) not in expected:
                    path.unlink()
            regfile=root/"worlds/PlayerWorld"/reg
            regfile.write_text(json.dumps([
                {"pack_id":"11111111-1111-1111-1111-111111111111","version":[3,2,1]},
                {"pack_id":pack_id,"version":[1,4,2]}
            ]))
        return tmp,root

    def test_real_142_pack_upgrades_without_touching_unrelated_registry_entries(self):
        tmp,root=self._synthetic_142_lab()
        try:
            before={}
            for local,installed,pack_id,reg in lab.PACKS:
                target=root/installed/("HartMods_HartLogistics_"+(
                    "BP" if local=="behavior_pack" else "RP"))
                before[local]=lab.hashes(target)
                self.assertEqual(
                    before[local]["manifest.json"],
                    lab.BASELINE_142_MANIFESTS["addon/"+local+"/manifest.json"])
            plan=lab.discover_plan(ROOT,root)
            self.assertEqual(len(plan),2)
            self.assertEqual([list(json.loads(lab.remove_jsonc(item["new_registry"]))[-1]["version"])
                for item in plan],[[1,5,0],[1,5,0]])
            for item in plan:
                self.assertEqual(
                    json.loads(lab.remove_jsonc(item["new_registry"]))[0],
                    {"pack_id":"11111111-1111-1111-1111-111111111111","version":[3,2,1]})
            backup=lab.apply_plan(root,plan)
            self.assertTrue(backup.exists())
            for local,installed,pack_id,reg in lab.PACKS:
                target=root/installed/("HartMods_HartLogistics_"+(
                    "BP" if local=="behavior_pack" else "RP"))
                self.assertEqual(lab.hashes(target),lab.hashes(ROOT/"addon"/local))
                entries=json.loads((root/"worlds/PlayerWorld"/reg).read_text())
                self.assertEqual(entries[0]["version"],[3,2,1])
                self.assertEqual(entries[1]["version"],[1,5,0])
        finally:tmp.cleanup()

    def test_142_to_150_rollback_restores_both_packs_and_world_registries(self):
        tmp,root=self._synthetic_142_lab()
        try:
            plan=lab.discover_plan(ROOT,root)
            old_files={item["target"]:lab.hashes(item["target"]) for item in plan}
            old_reg={item["registry"]:item["old_bytes"] for item in plan}
            original_rename=Path.rename
            def fail_before_second_pack_replace(path,target):
                if "_HartLogisticsDeployStage" in str(path) and path.name=="1":
                    raise OSError("synthetic second-pack failure")
                return original_rename(path,target)
            with patch.object(Path,"rename",fail_before_second_pack_replace):
                with self.assertRaises(OSError):lab.apply_plan(root,plan)
            for target,files in old_files.items():
                self.assertEqual(lab.hashes(target),files)
            for registry,content in old_reg.items():
                self.assertEqual(registry.read_bytes(),content)
        finally:tmp.cleanup()

    def test_unknown_changed_same_version_preview_refuses_implicit_update(self):
        tmp,root=self._synthetic_lab()
        try:
            target=root/"resource_packs/HartMods_HartLogistics_RP"/(
                "textures/blocks/hartlogistics_transporter.png")
            target.write_bytes(target.read_bytes()+b"unreviewed")
            before={
                p:p.read_bytes() for p in (root/"worlds/PlayerWorld").iterdir()
            }
            with self.assertRaises(lab.UnsafeLab):
                lab.discover_plan(ROOT,root)
            self.assertEqual(before,{
                p:p.read_bytes() for p in (root/"worlds/PlayerWorld").iterdir()
            })
        finally:tmp.cleanup()

    def test_142_to_150_explicit_rollback_roundtrip_restores_original_bytes(self):
        tmp,root=self._synthetic_142_lab()
        try:
            plan=lab.discover_plan(ROOT,root)
            before_files={item['target']:lab.hashes(item['target']) for item in plan}
            before_regs={item['registry']:item['old_bytes'] for item in plan}
            backup=lab.apply_plan(root,plan)
            tag=backup.name
            self.assertRegex(tag,r'^lab-[0-9a-f]{12}$')
            recovered=lab.create_rollback_plan(ROOT,root,tag)
            self.assertEqual(len(recovered),2)
            another_backup=lab.apply_plan(root,recovered)
            self.assertNotEqual(backup,another_backup)
            for folder,expected in before_files.items():
                self.assertEqual(lab.hashes(folder),expected)
            for registry,old in before_regs.items():
                self.assertEqual(registry.read_bytes(),old)
            self.assertTrue(backup.is_dir())
            self.assertTrue(another_backup.is_dir())
        finally:tmp.cleanup()

    def test_rollback_missing_tag_or_modified_backup_refuses_without_writes(self):
        tmp,root=self._synthetic_142_lab()
        try:
            backup=lab.apply_plan(root,lab.discover_plan(ROOT,root))
            current={item['target']:lab.hashes(item['target'])
                     for item in lab.discover_plan(ROOT,root)}
            for bad in ['','lab-1234','lab-aaaaaaaaaaaa',
                        '../_HartLogisticsDeployBackups']:
                with self.subTest(bad=bad),self.assertRaises(lab.UnsafeLab):
                    lab.create_rollback_plan(ROOT,root,bad)
            original=backup/'pack-0/scripts/main.js'
            original.write_text(original.read_text()+'\n# tampered backup\n')
            with self.assertRaises(lab.UnsafeLab):
                lab.create_rollback_plan(ROOT,root,backup.name)
            for folder,expected in current.items():
                self.assertEqual(lab.hashes(folder),expected)
        finally:tmp.cleanup()

    def test_rollback_refuses_unrelated_registry_drift(self):
        tmp,root=self._synthetic_142_lab()
        try:
            backup=lab.apply_plan(root,lab.discover_plan(ROOT,root))
            reg=root/'worlds/PlayerWorld/world_behavior_packs.json'
            before=reg.read_bytes()
            reg.write_bytes(before.replace(b'3, 2, 1',b'3, 2, 2'))
            with self.assertRaises(lab.UnsafeLab):
                lab.create_rollback_plan(ROOT,root,backup.name)
        finally:tmp.cleanup()

    def test_rollback_refuses_modified_current_preview(self):
        tmp,root=self._synthetic_142_lab()
        try:
            backup=lab.apply_plan(root,lab.discover_plan(ROOT,root))
            source=root/'behavior_packs/HartMods_HartLogistics_BP/scripts/main.js'
            source.write_text(source.read_text()+'\n// unauthorized modification\n')
            with self.assertRaises(lab.UnsafeLab):
                lab.create_rollback_plan(ROOT,root,backup.name)
        finally:tmp.cleanup()

    def test_interrupted_explicit_rollback_restores_preview_and_regs(self):
        tmp,root=self._synthetic_142_lab()
        try:
            backup=lab.apply_plan(root,lab.discover_plan(ROOT,root))
            plan=lab.create_rollback_plan(ROOT,root,backup.name)
            before_files={item['target']:lab.hashes(item['target']) for item in plan}
            before_regs={item['registry']:item['old_bytes'] for item in plan}
            rename=Path.rename
            def fail_second_staged_replace(path,target):
                if '_HartLogisticsDeployStage' in str(path) and path.name=='1':
                    raise OSError('Synthetic interrupted post-install rollback')
                return rename(path,target)
            with patch.object(Path,'rename',fail_second_staged_replace):
                with self.assertRaises(OSError):lab.apply_plan(root,plan)
            for folder,hashes in before_files.items():
                self.assertEqual(lab.hashes(folder),hashes)
            for registry,original in before_regs.items():
                self.assertEqual(registry.read_bytes(),original)
        finally:tmp.cleanup()

    def test_python_mode_never_touches_lab_without_explicit_check(self):
        with patch.object(lab,'assert_clean_git') as verify, \
             patch.object(lab,'assert_server_stopped') as stop, \
             patch.object(lab,'discover_plan') as discover:
            self.assertEqual(lab.main(['--commit','a'*40]),0)
            verify.assert_called_once()
            stop.assert_not_called()
            discover.assert_not_called()
            self.assertEqual(lab.main(['--apply','--commit','a'*40]),2)
            stop.assert_not_called()
            discover.assert_not_called()

    def test_powershell_operator_entrypoint_is_one_file_and_pinned(self):
        p=ROOT/'distribution/Start-HartLogistics-150Lab.ps1'
        source=p.read_text(encoding='utf-8')
        for marker in ('Plan','CheckLab','Install','Rollback',
                       "dev/urce-150-runtime-20261118",
                       'scripts\\hartlogistics_150_lab_updater.py',
                       '--check-lab','--confirm-lab-only','--rollback-tag',
                       '-ExpectedCommit','--commit','--apply',
                       'HartLogistics2-URCE150-LAB','merge','--ff-only',
                       'git.exe','Python 3.11'):
            self.assertIn(marker,source)
        self.assertNotIn("branch = 'main'",source)
        self.assertNotIn('HartLogistics2-PG27-LAB',source)
        self.assertIn('Thomas_MCBedrock - Copy (2)',source)

if __name__=="__main__":
    unittest.main()
