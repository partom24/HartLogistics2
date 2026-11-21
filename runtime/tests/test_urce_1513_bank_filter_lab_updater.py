"""1.5.13 exact 1.5.11 predecessor, Q4 continuity and reversible LAB tests.

These tests construct disposable artificial Bedrock directories. They never
read, start, stop, install or change either of the owner's real servers.
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
spec=importlib.util.spec_from_file_location(
    "hl_1513_governed_bank_guard",ROOT/"scripts/hartlogistics_1513_lab_updater.py")
lab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

class GovernedBank1513UpgradeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original=lab.original_hashes(ROOT)

    def synthetic_lab(self):
        temp=tempfile.TemporaryDirectory()
        root=Path(temp.name)
        (root/"bedrock_server.exe").write_bytes(b"synthetic")
        (root/"server.properties").write_text("level-name=TestWorld\n")
        world=root/"worlds/TestWorld"
        world.mkdir(parents=True)
        (world/"level.dat").write_bytes(b"q4-world-unchanged\x00\xff")
        archive=subprocess.run(
            ["git","-C",str(ROOT),"archive","--format=tar",
             lab.PINNED_1511,"addon/behavior_pack","addon/resource_pack"],
            capture_output=True,check=True).stdout
        with tarfile.open(fileobj=io.BytesIO(archive)) as tf:
            for member in tf:
                if not member.isfile():continue
                pieces=Path(member.name).parts
                self.assertEqual(pieces[0],"addon")
                self.assertIn(pieces[1],("behavior_pack","resource_pack"))
                folder=("behavior_packs" if pieces[1]=="behavior_pack"
                        else "resource_packs")
                pack=("HartMods_HartLogistics_BP" if pieces[1]=="behavior_pack"
                      else "HartMods_HartLogistics_RP")
                dest=(root/folder/pack).joinpath(*pieces[2:])
                dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_bytes(tf.extractfile(member).read())
        for local,_,pack_id,regname in lab.PACKS:
            (world/regname).write_text(
                '[{"pack_id":"11111111-1111-1111-1111-111111111111",'
                '"version":[5,0,0]},{"pack_id":"'+pack_id+'",'
                '"version":[1,5,11]}]\n')
        return temp,root

    def test_exact_source_review_and_custody_markers(self):
        now=lab.validate_source(ROOT,self.original)
        self.assertEqual(len(now["behavior_pack"]),33)
        self.assertEqual(len(now["resource_pack"]),60)
        self.assertEqual(len(lab.ALLOWED_CHANGED),5)
        self.assertEqual(lab.OLD_VERSION,(1,5,11))
        self.assertEqual(lab.NEW_VERSION,(1,5,13))
        self.assertEqual(lab.PINNED_1511,"d7f4f6269eb690b64a4409a7d489ce1955cfdcf1")
        s=(ROOT/"addon/behavior_pack/scripts/main.js").read_text()
        for expected in ("function saveQueueJournal(tx)",
                         "function recoverQueueJournal()",
                         "function safeMovePartial(",
                         "function enqueueFromSource(",
                         "function dequeueToReceiver(",
                         'const VERSION = "1.5.13-dev";'):
            self.assertIn(expected,s)

    def test_exact_installed_1511_to_1513_and_backup_rollback(self):
        temp,root=self.synthetic_lab()
        try:
            plan=lab.read_live_plan(ROOT,root,self.original)
            self.assertEqual({entry["version"] for entry in plan},{lab.OLD_VERSION})
            before={e["local"]:lab.old.hashes(e["target"]) for e in plan}
            registrations={e["local"]:e["registry"].read_bytes() for e in plan}
            world=root/"worlds/TestWorld/level.dat"
            world_bytes=world.read_bytes()
            backup=lab.old.apply_plan(root,plan)
            self.assertRegex(backup.name,r"^lab-[a-f0-9]{12}$")
            current=lab.read_live_plan(ROOT,root,self.original)
            self.assertTrue(all(e["version"]==lab.NEW_VERSION and
                                e["installed"]==e["files"] for e in current))
            roll=lab.rollback_plan(ROOT,root,backup.name,self.original)
            self.assertEqual(len(roll),2)
            lab.old.apply_plan(root,roll)
            restored=lab.read_live_plan(ROOT,root,self.original)
            for e in restored:
                self.assertEqual(lab.old.hashes(e["target"]),before[e["local"]])
                self.assertEqual(e["registry"].read_bytes(),registrations[e["local"]])
            self.assertEqual(world.read_bytes(),world_bytes)
        finally:temp.cleanup()

    def test_unknown_1511_file_changes_fail_without_backup(self):
        for kind in ("alter-main","extra-helper","alter-rp"):
            with self.subTest(kind=kind):
                temp,root=self.synthetic_lab()
                try:
                    bp=root/"behavior_packs/HartMods_HartLogistics_BP"
                    rp=root/"resource_packs/HartMods_HartLogistics_RP"
                    if kind=="alter-main":
                        p=bp/"scripts/main.js"
                        p.write_bytes(p.read_bytes()+b"\n// local drift")
                    elif kind=="extra-helper":
                        (bp/"scripts/unreviewed.js").write_text("module illegal")
                    else:
                        p=rp/"manifest.json"
                        p.write_bytes(p.read_bytes()+b"\n")
                    with self.assertRaises(lab.UnsafeLab):
                        lab.read_live_plan(ROOT,root,self.original)
                    self.assertFalse((root/"_HartLogisticsDeployBackups").exists())
                finally:temp.cleanup()

    def test_unknown_1513_source_writer_refused(self):
        tmp=tempfile.TemporaryDirectory()
        repo=Path(tmp.name)
        try:
            shutil.copytree(ROOT/"addon",repo/"addon")
            (repo/"addon/behavior_pack/scripts/secret_other_writer.js").write_text(
                "export function steal(){return true;}")
            with self.assertRaises(lab.UnsafeLab):
                lab.validate_source(repo,self.original)
        finally:tmp.cleanup()

    def test_refuse_modified_backup_and_unrelated_registry_changes(self):
        temp,root=self.synthetic_lab()
        try:
            backup=lab.old.apply_plan(root,lab.read_live_plan(ROOT,root,self.original))
            tamper=backup/"pack-0/scripts/main.js"
            tamper.write_bytes(tamper.read_bytes()+b"\n// changed")
            with self.assertRaises(lab.UnsafeLab):
                lab.rollback_plan(ROOT,root,backup.name,self.original)
        finally:temp.cleanup()
        temp,root=self.synthetic_lab()
        try:
            backup=lab.old.apply_plan(root,lab.read_live_plan(ROOT,root,self.original))
            registry=root/"worlds/TestWorld/world_behavior_packs.json"
            registry.write_text(registry.read_text().replace("[5,0,0]","[5,0,1]"))
            with self.assertRaises(lab.UnsafeLab):
                lab.rollback_plan(ROOT,root,backup.name,self.original)
        finally:temp.cleanup()

    def test_source_plan_is_pure_and_apply_requires_all_gates(self):
        with patch.object(lab.old,"assert_clean_git"), \
             patch.object(lab.old,"assert_server_stopped") as stopped, \
             patch.object(lab,"read_live_plan") as read:
            self.assertEqual(lab.main(["--commit","a"*40]),0)
            self.assertEqual(lab.main(["--apply","--commit","a"*40]),2)
            stopped.assert_not_called()
            read.assert_not_called()

    def test_powershell_single_authority_and_production_fence(self):
        stable=(ROOT/"distribution/Start-HartLogistics-Lab.ps1").read_text()
        versioned=(ROOT/"distribution/Start-HartLogistics-1513Lab.ps1").read_text()
        self.assertIn("'1.5.13' = 'Start-HartLogistics-1513Lab.ps1'",stable)
        self.assertIn("dev/urce-1513-governed-bank-filter-20261121",stable)
        for needle in ("--confirm-lab-only","--check-lab","--apply",
                       "hartlogistics_1513_lab_updater.py","-ExpectedCommit",
                       "Invoke-HartLogisticsNativeGit"):
            self.assertIn(needle,versioned)
        lab.old.assert_lab_name(lab.LAB)
        for other in (r"C:\Servers\Thomas_MCBedrock",lab.LAB+"-fake"):
            with self.assertRaises(lab.UnsafeLab):
                lab.old.assert_lab_name(other)

if __name__=="__main__":
    unittest.main()
