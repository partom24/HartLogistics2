"""1.5.4 -> 1.5.5 guarded Collector/Receiver link PowerShell backend safety regressions.

Every pack/world below is a disposable fixture. No actual LAB or production
server paths are accessed. Original predecessor reconstructed from pinned Git.
"""
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("urce_155_installer",
                                          ROOT/"scripts/hartlogistics_155_lab_updater.py")
lab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

class Journal155LabTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original=lab.prior_hashes(ROOT)
        cls.before=lab.expected_previous(cls.original)

    def test_exact_new_control_plane_and_pinned_native_writer_delta(self):
        versions=lab.validate_candidate(ROOT,self.original)
        self.assertEqual(len(versions),2)
        self.assertIn("scripts/urce_152_live_link_guard.js",versions["behavior_pack"])
        self.assertIn("models/blocks/hartlogistics_transporter.geo.json",versions["resource_pack"])
        self.assertEqual(lab.PREDECESSOR,"4154b456589528a93fc341826cd42490efef3d0a")
        self.assertEqual(lab.NEW_VERSION,(1,5,5))

    def source_copy(self):
        tmp=tempfile.TemporaryDirectory()
        root=Path(tmp.name)
        shutil.copytree(ROOT/"addon",root/"addon")
        return tmp,root

    def test_hidden_gameplay_writer_or_original_source_mutation_refused(self):
        tmp,root=self.source_copy()
        try:
            addition=root/"addon/behavior_pack/scripts/unreviewed_writer.js"
            addition.write_text("export function cargo(){return true;}")
            with self.assertRaises(lab.UnsafeLab):
                lab.validate_candidate(root,self.original)
            addition.unlink()
            gameplay=root/"addon/behavior_pack/scripts/main.js"
            gameplay.write_text(gameplay.read_text()+"\n// unreviewed\n")
            with self.assertRaises(lab.UnsafeLab):
                lab.validate_candidate(root,self.original)
        finally:tmp.cleanup()

    def test_legacy_version_reuse_or_manifest_identity_change_refused(self):
        tmp,root=self.source_copy()
        try:
            manifest=root/"addon/resource_pack/manifest.json"
            m=json.loads(manifest.read_text())
            m["header"]["version"]=[1,5,0]
            manifest.write_text(json.dumps(m))
            with self.assertRaises(lab.UnsafeLab):
                lab.validate_candidate(root,self.original)
            m["header"]["version"]=[1,5,5]
            m["header"]["uuid"]="00000000-0000-0000-0000-000000000001"
            manifest.write_text(json.dumps(m))
            with self.assertRaises(lab.UnsafeLab):
                lab.validate_candidate(root,self.original)
        finally:tmp.cleanup()

    def test_rejects_production_and_unauthorized_lab(self):
        lab.old.assert_lab_name(lab.LAB)
        for name in [r"C:\Servers\Thomas_MCBedrock",lab.LAB+"-copy",
                     lab.LAB+r"\..",lab.LAB.replace("\\","/")]:
            with self.subTest(name=name),self.assertRaises(lab.UnsafeLab):
                lab.old.assert_lab_name(name)

    def synthetic_lab(self):
        tmp=tempfile.TemporaryDirectory()
        root=Path(tmp.name)
        (root/"bedrock_server.exe").write_bytes(b"synthetic LAB fixture")
        (root/"server.properties").write_text("level-name=PlayerWorld\n")
        world=root/"worlds/PlayerWorld"
        world.mkdir(parents=True)
        for local,folder,_,_ in lab.PACKS:
            (root/folder).mkdir()
        command=["git","-C",str(ROOT),"archive","--format=tar",lab.PREDECESSOR,
                 "addon/behavior_pack","addon/resource_pack"]
        archive=subprocess.run(command,capture_output=True,check=True).stdout
        with tarfile.open(fileobj=io.BytesIO(archive)) as t:
            for member in t:
                if not member.isfile():continue
                parts=Path(member.name).parts
                if len(parts)<3 or parts[0]!="addon" or parts[1] not in ("behavior_pack","resource_pack"):
                    raise AssertionError("Unexpected source path in pinned archive")
                local=parts[1]
                target=root/("behavior_packs" if local=="behavior_pack" else "resource_packs")/(
                    "HartMods_HartLogistics_BP" if local=="behavior_pack" else "HartMods_HartLogistics_RP")
                output=target.joinpath(*parts[2:])
                output.parent.mkdir(parents=True,exist_ok=True)
                output.write_bytes(t.extractfile(member).read())
        for local,folder,pack_id,regname in lab.PACKS:
            data=(root/"worlds/PlayerWorld"/regname)
            data.write_text('''[
  { // Third-party addon whose registration must be unchanged.
    "pack_id": "11111111-1111-1111-1111-111111111111", "version": [3,2,1]
  },
  { //HartLogistics registered pack, comments are valid historical data
    "pack_id":"'''+pack_id+'''", "version":[1,5,4],
  }
]''')
        return tmp,root

    def test_actual_historical_pack_is_eligible_but_unknown_bytes_refused(self):
        tmp,root=self.synthetic_lab()
        try:
            plan=lab.read_live_plan(ROOT,root,self.original)
            self.assertEqual(len(plan),2)
            self.assertTrue(all(x["version"]==(1,5,4) for x in plan))
            for x in plan:
                self.assertEqual(x["installed"],self.before[x["local"]])
                self.assertIn("//HartLogistics",x["new_registry"])
                self.assertIn('"version":[1,5,5]',x["new_registry"])
                self.assertIn('"version": [3,2,1]',x["new_registry"])
            tampered=root/"resource_packs/HartMods_HartLogistics_RP/textures/blocks/hartlogistics_transporter.png"
            tampered.write_bytes(tampered.read_bytes()+b"unexpected client-repair attempt")
            with self.assertRaises(lab.UnsafeLab):
                lab.read_live_plan(ROOT,root,self.original)
        finally:tmp.cleanup()

    def test_155_upgrade_and_exact_backup_rollback_roundtrip(self):
        tmp,root=self.synthetic_lab()
        try:
            plan=lab.read_live_plan(ROOT,root,self.original)
            original_files={x["target"]:lab.old.hashes(x["target"]) for x in plan}
            original_regs={x["registry"]:x["old_bytes"] for x in plan}
            backup=lab.old.apply_plan(root,plan)
            self.assertRegex(backup.name,r"^lab-[a-f0-9]{12}$")
            installed=lab.read_live_plan(ROOT,root,self.original)
            self.assertTrue(all(x["version"]==lab.NEW_VERSION for x in installed))
            self.assertTrue(all(x["files"]==x["installed"] for x in installed))
            rollback=lab.rollback_plan(ROOT,root,backup.name,self.original)
            preserved=lab.old.apply_plan(root,rollback)
            self.assertNotEqual(backup,preserved)
            for path,hashes in original_files.items():
                self.assertEqual(lab.old.hashes(path),hashes)
            for path,raw in original_regs.items():
                self.assertEqual(path.read_bytes(),raw)
            self.assertTrue(backup.is_dir())
            self.assertTrue(preserved.is_dir())
        finally:tmp.cleanup()

    def test_refuse_unknown_backup_and_existing_world_registry_drift(self):
        tmp,root=self.synthetic_lab()
        try:
            backup=lab.old.apply_plan(root,lab.read_live_plan(ROOT,root,self.original))
            for bad in ("","lab-abc","lab-eeeeeeeeeeee","../../production"):
                with self.subTest(bad=bad),self.assertRaises(lab.UnsafeLab):
                    lab.rollback_plan(ROOT,root,bad,self.original)
            reg=root/"worlds/PlayerWorld/world_behavior_packs.json"
            reg.write_text(reg.read_text().replace("[3,2,1]","[3,2,2]"))
            with self.assertRaises(lab.UnsafeLab):
                lab.rollback_plan(ROOT,root,backup.name,self.original)
        finally:tmp.cleanup()

    def test_refuse_tampered_previous_backup_even_if_current_valid(self):
        tmp,root=self.synthetic_lab()
        try:
            backup=lab.old.apply_plan(root,lab.read_live_plan(ROOT,root,self.original))
            source=backup/"pack-0/scripts/main.js"
            source.write_text(source.read_text()+"\n// tampered\n")
            with self.assertRaises(lab.UnsafeLab):
                lab.rollback_plan(ROOT,root,backup.name,self.original)
        finally:tmp.cleanup()

    def test_refuse_modified_current_new_pack_on_rollback(self):
        tmp,root=self.synthetic_lab()
        try:
            backup=lab.old.apply_plan(root,lab.read_live_plan(ROOT,root,self.original))
            current=root/"behavior_packs/HartMods_HartLogistics_BP/scripts/urce_150_readonly_runtime.js"
            current.write_text(current.read_text()+"\n// changed after install\n")
            with self.assertRaises(lab.UnsafeLab):
                lab.rollback_plan(ROOT,root,backup.name,self.original)
        finally:tmp.cleanup()

    def test_interrupted_second_pack_upgrade_restores_all_old_bytes(self):
        tmp,root=self.synthetic_lab()
        try:
            plan=lab.read_live_plan(ROOT,root,self.original)
            first={x["target"]:lab.old.hashes(x["target"]) for x in plan}
            regs={x["registry"]:x["old_bytes"] for x in plan}
            native=Path.rename
            def interrupt(path,target):
                if "_HartLogisticsDeployStage" in str(path) and path.name=="1":
                    raise OSError("Synthetic second-pack failure")
                return native(path,target)
            with patch.object(Path,"rename",interrupt):
                with self.assertRaises(OSError):
                    lab.old.apply_plan(root,plan)
            for target,previous in first.items():self.assertEqual(lab.old.hashes(target),previous)
            for reg,raw in regs.items():self.assertEqual(reg.read_bytes(),raw)
        finally:tmp.cleanup()

    def test_interrupted_rollback_restores_exact_current_155(self):
        tmp,root=self.synthetic_lab()
        try:
            backup=lab.old.apply_plan(root,lab.read_live_plan(ROOT,root,self.original))
            plan=lab.rollback_plan(ROOT,root,backup.name,self.original)
            first={x["target"]:lab.old.hashes(x["target"]) for x in plan}
            regs={x["registry"]:x["old_bytes"] for x in plan}
            native=Path.rename
            def interrupt(path,target):
                if "_HartLogisticsDeployStage" in str(path) and path.name=="1":
                    raise OSError("Interrupted rollback before second pack")
                return native(path,target)
            with patch.object(Path,"rename",interrupt):
                with self.assertRaises(OSError):
                    lab.old.apply_plan(root,plan)
            for target,previous in first.items():self.assertEqual(lab.old.hashes(target),previous)
            for reg,raw in regs.items():self.assertEqual(reg.read_bytes(),raw)
        finally:tmp.cleanup()

    def test_source_only_plan_is_not_lab_preflight_or_apply(self):
        with patch.object(lab.old,"assert_clean_git"),patch.object(lab.old,"assert_server_stopped") as stop, \
             patch.object(lab,"prior_hashes",return_value=self.original), \
             patch.object(lab,"read_live_plan") as access:
            self.assertEqual(lab.main(["--commit","a"*40]),0)
            access.assert_not_called();stop.assert_not_called()
            self.assertEqual(lab.main(["--apply","--commit","a"*40]),2)
            access.assert_not_called();stop.assert_not_called()

    def test_version_specific_powershell_operator_contract(self):
        source=(ROOT/"distribution/Start-HartLogistics-155Lab.ps1").read_text()
        for marker in ("Plan","CheckLab","Install","Rollback",
                       "dev/urce-150-runtime-20261118",
                       "scripts\\hartlogistics_155_lab_updater.py",
                       "HartLogistics2-URCE155-LAB",
                       "--rollback-tag","--check-lab","--confirm-lab-only",
                       "--commit","--apply","git.exe","--ff-only"):
            self.assertIn(marker,source)
        self.assertNotIn("hartlogistics_150_lab_updater.py",source)

if __name__=="__main__":
    unittest.main()
