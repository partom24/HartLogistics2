"""Exact dual-predecessor 1.5.9 copied-LAB source/rollback regressions.

All installations below are disposable synthetic directory trees. No actual
LAB or production world is accessed or mutated by these tests.
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
spec=importlib.util.spec_from_file_location("urce_159_guarded_operator",
                                          ROOT/"scripts/hartlogistics_159_lab_updater.py")
lab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

class Governed159LabTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.originals=lab.prior_hashes_by_version(ROOT)

    def source_copy(self):
        tmp=tempfile.TemporaryDirectory()
        root=Path(tmp.name)
        shutil.copytree(ROOT/"addon",root/"addon")
        return tmp,root

    def test_current_source_exact_reviewed_delta_from_both_predecessors(self):
        result=lab.validate_candidate(ROOT,self.originals)
        self.assertEqual(set(result),{"behavior_pack","resource_pack"})
        self.assertEqual(lab.NEW_VERSION,(1,5,9))
        self.assertEqual(set(lab.PREDECESSORS),{(1,5,7),(1,5,8)})
        self.assertEqual(len(lab.REVIEWED_BLOBS),11)
        self.assertIn("behavior_pack/scripts/urce_159_direct_sorter_home.js",
                      lab.ADDED_158)
        self.assertIn("behavior_pack/scripts/urce_152_link_snapshot_gate.js", lab.CHANGE_158)
        self.assertIn("behavior_pack/scripts/urce_159_direct_sorter_home.js",
                      lab.ADDED_157)
        # No new field, legacy Q4 format, identity, or extra cargo writer.
        original=(ROOT/"addon/behavior_pack/scripts/main.js").read_text()
        for preserved in (
            'const QUEUE_JOURNAL_KEY = "hartsorter:queue_journal_v1";',
            "function saveQueueJournal(tx)",
            "function recoverQueueJournal()",
            "function safeMovePartial(",
            "function enqueueFromSource(",
            "function dequeueToReceiver(",
            "saveQueueJournal(tx);",
            "output.container.setItem(tx.dstSlot, moved);"
        ): self.assertIn(preserved,original)

    def synthetic_lab(self,predecessor):
        tmp=tempfile.TemporaryDirectory()
        root=Path(tmp.name)
        (root/"bedrock_server.exe").write_bytes(b"synthetic executable")
        (root/"server.properties").write_text("level-name=PlayerWorld\n")
        world=root/"worlds/PlayerWorld"
        world.mkdir(parents=True)
        # A Q4-like world payload is opaque and must survive every pack swap.
        (world/"level.dat").write_bytes(b"worldQ4-do-not-touch\x00\xff\x01")
        for _,folder,_,_ in lab.PACKS:(root/folder).mkdir()
        sha=lab.PREDECESSORS[predecessor]
        archive=subprocess.run(
            ["git","-C",str(ROOT),"archive","--format=tar",sha,
             "addon/behavior_pack","addon/resource_pack"],
            capture_output=True,check=True).stdout
        with tarfile.open(fileobj=io.BytesIO(archive)) as t:
            for member in t:
                if not member.isfile():continue
                parts=Path(member.name).parts
                if len(parts)<3 or parts[0]!="addon" or parts[1] not in ("behavior_pack","resource_pack"):
                    raise AssertionError("Unknown original source path")
                local=parts[1]
                folder="behavior_packs" if local=="behavior_pack" else "resource_packs"
                name="HartMods_HartLogistics_BP" if local=="behavior_pack" else "HartMods_HartLogistics_RP"
                dest=(root/folder/name).joinpath(*parts[2:])
                dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_bytes(t.extractfile(member).read())
        for local,folder,pack_id,reg_name in lab.PACKS:
            (world/reg_name).write_text('''[
  { // Original unrelated world pack.
    "pack_id":"11111111-1111-1111-1111-111111111111","version":[3,2,1]
  },
  { // Existing Hart pack identity.
    "pack_id":"'''+pack_id+'''","version":'''+json.dumps(list(predecessor))+'''
  }
]''')
        return tmp,root

    def test_both_exact_predecessors_upgrade_then_restore_all_bytes(self):
        for version in sorted(lab.PREDECESSORS):
            with self.subTest(predecessor=version):
                tmp,root=self.synthetic_lab(version)
                try:
                    plan=lab.read_live_plan(ROOT,root,self.originals)
                    self.assertEqual({x["version"] for x in plan},{version})
                    exact=lab.expected_previous(self.originals,version)
                    for p in plan:self.assertEqual(p["installed"],exact[p["local"]])
                    original_files={p["target"]:lab.old.hashes(p["target"]) for p in plan}
                    original_regs={p["registry"]:p["old_bytes"] for p in plan}
                    before=(root/"worlds/PlayerWorld/level.dat").read_bytes()
                    backup=lab.old.apply_plan(root,plan)
                    self.assertRegex(backup.name,r"^lab-[a-f0-9]{12}$")
                    now=lab.read_live_plan(ROOT,root,self.originals)
                    self.assertTrue(all(x["version"]==lab.NEW_VERSION for x in now))
                    self.assertTrue(all(x["installed"]==x["files"] for x in now))
                    returned=lab.rollback_plan(ROOT,root,backup.name,self.originals)
                    self.assertEqual(len(returned),2)
                    other=lab.old.apply_plan(root,returned)
                    self.assertNotEqual(backup,other)
                    for target,before_hashes in original_files.items():
                        self.assertEqual(lab.old.hashes(target),before_hashes)
                    for reg,raw in original_regs.items():
                        self.assertEqual(reg.read_bytes(),raw)
                    self.assertEqual((root/"worlds/PlayerWorld/level.dat").read_bytes(),before)
                    self.assertTrue(backup.is_dir())
                finally:tmp.cleanup()

    def test_tampered_source_identity_and_unknown_new_file_refused(self):
        tmp,root=self.source_copy()
        try:
            new=root/"addon/behavior_pack/scripts/unreviewed_cargo_writer.js"
            new.write_text("export function credit(){return true}")
            with self.assertRaises(lab.UnsafeLab):
                lab.validate_candidate(root,self.originals)
            new.unlink()
            watched=root/"addon/behavior_pack/scripts/urce_159_direct_sorter_home.js"
            value=watched.read_text()
            watched.write_text(value+"\n// hostile drift")
            with self.assertRaises(lab.UnsafeLab):
                lab.validate_candidate(root,self.originals)
            watched.write_text(value)
            main=root/"addon/behavior_pack/scripts/main.js"
            main.write_text(main.read_text()+"\n// unknown path")
            with self.assertRaises(lab.UnsafeLab):
                lab.validate_candidate(root,self.originals)
        finally:tmp.cleanup()

    def test_mixed_pack_versions_and_unknown_legacy_refused(self):
        for version in ((1,5,7),(1,5,8)):
            tmp,root=self.synthetic_lab(version)
            try:
                rp=root/"resource_packs/HartMods_HartLogistics_RP/manifest.json"
                doc=json.loads(rp.read_text())
                doc["header"]["version"]=[1,5,6]
                rp.write_text(json.dumps(doc))
                with self.assertRaises(lab.UnsafeLab):
                    lab.read_live_plan(ROOT,root,self.originals)
            finally:tmp.cleanup()

    def test_unknown_pack_bytes_and_foreign_registry_drift_refused(self):
        tmp,root=self.synthetic_lab((1,5,7))
        try:
            bp=root/"behavior_packs/HartMods_HartLogistics_BP/scripts/main.js"
            bp.write_text(bp.read_text()+"\n// unexpected")
            with self.assertRaises(lab.UnsafeLab):
                lab.read_live_plan(ROOT,root,self.originals)
        finally:tmp.cleanup()
        tmp,root=self.synthetic_lab((1,5,8))
        try:
            plan=lab.read_live_plan(ROOT,root,self.originals)
            tag=lab.old.apply_plan(root,plan)
            reg=root/"worlds/PlayerWorld/world_behavior_packs.json"
            reg.write_text(reg.read_text().replace("[3,2,1]","[3,2,2]"))
            with self.assertRaises(lab.UnsafeLab):
                lab.rollback_plan(ROOT,root,tag.name,self.originals)
        finally:tmp.cleanup()

    def test_read_only_byte_drift_diagnosis_remains_refused(self):
        tmp,root=self.synthetic_lab((1,5,8))
        try:
            target=root/"behavior_packs/HartMods_HartLogistics_BP"
            main=target/"scripts/main.js"
            main.write_bytes(main.read_bytes()+b"\n// unexpected local edit")
            (target/"runtime-generated.log").write_bytes(b"diagnostic artifact")
            (target/"scripts/urce_152_link_snapshot_gate.js").unlink()
            expected=lab.expected_previous(self.originals,(1,5,8))["behavior_pack"]
            actual=lab.old.hashes(target)
            report=lab.describe_installed_pack_drift("behavior_pack",(1,5,8),actual,expected)
            self.assertIn("READ-ONLY PACK DIFFERENCES",report)
            self.assertIn("missing=1",report)
            self.assertIn("unexpected=1",report)
            self.assertIn("modified=1",report)
            self.assertIn("MISSING scripts/urce_152_link_snapshot_gate.js",report)
            self.assertIn("UNEXPECTED runtime-generated.log",report)
            self.assertIn("MODIFIED scripts/main.js",report)
            self.assertIn("expected_sha256=",report)
            self.assertIn("installed_sha256=",report)
            self.assertIn("\n  MODIFIED",report)
            self.assertNotIn("worldQ4-do-not-touch",report)
            with self.assertRaises(lab.UnsafeLab) as ctx:
                lab.read_live_plan(ROOT,root,self.originals)
            self.assertIn("READ-ONLY PACK DIFFERENCES",str(ctx.exception))
            self.assertIn("NO FILES CHANGED",str(ctx.exception))
            self.assertEqual(lab.old.hashes(target),actual)  # CheckLab must not alter any pack byte.
            self.assertEqual((root/"worlds/PlayerWorld/level.dat").read_bytes(),
                             b"worldQ4-do-not-touch\x00\xff\x01")
        finally:tmp.cleanup()

    def test_tampered_backup_refused_and_not_replayed(self):
        tmp,root=self.synthetic_lab((1,5,8))
        try:
            tag=lab.old.apply_plan(root,lab.read_live_plan(ROOT,root,self.originals))
            f=tag/"pack-0/scripts/main.js"
            f.write_text(f.read_text()+"\n// changed")
            with self.assertRaises(lab.UnsafeLab):
                lab.rollback_plan(ROOT,root,tag.name,self.originals)
        finally:tmp.cleanup()

    def test_rollback_refuses_unknown_tag(self):
        tmp,root=self.synthetic_lab((1,5,7))
        try:
            tag=lab.old.apply_plan(root,lab.read_live_plan(ROOT,root,self.originals))
            for bad in ("","lab-no","lab-eeeeeeeeeeee","../../production"):
                with self.subTest(tag=bad),self.assertRaises(lab.UnsafeLab):
                    lab.rollback_plan(ROOT,root,bad,self.originals)
            self.assertTrue(tag.is_dir())
        finally:tmp.cleanup()

    def test_plan_never_opens_lab_or_server_even_with_commit(self):
        with patch.object(lab.old,"assert_clean_git"), \
             patch.object(lab.old,"assert_server_stopped") as stopped, \
             patch.object(lab,"prior_hashes_by_version",return_value=self.originals), \
             patch.object(lab,"read_live_plan") as read:
            self.assertEqual(lab.main(["--commit","a"*40]),0)
            read.assert_not_called();stopped.assert_not_called()
            self.assertEqual(lab.main(["--apply","--commit","a"*40]),2)
            read.assert_not_called();stopped.assert_not_called()

    def test_production_location_refused(self):
        lab.old.assert_lab_name(lab.LAB)
        for path in (r"C:\Servers\Thomas_MCBedrock",lab.LAB+"-copy"):
            with self.subTest(path=path),self.assertRaises(lab.UnsafeLab):
                lab.old.assert_lab_name(path)

    def test_versioned_git_powershell_contract(self):
        shell=(ROOT/"distribution/Start-HartLogistics-159Lab.ps1").read_text()
        stable=(ROOT/"distribution/Start-HartLogistics-Lab.ps1").read_text()
        for marker in ("1.5.9","--rollback-tag","--check-lab",
                       "--confirm-lab-only","--commit","--apply",
                       "dev/urce-159-governed-home-20261120",
                       "hartlogistics_159_lab_updater.py"):
            self.assertIn(marker,shell)
        self.assertIn("Start-HartLogistics-159Lab.ps1",stable)
        self.assertIn("1.5.9",stable)
        self.assertIn("dev/urce-159-governed-home-20261120",stable)

if __name__=="__main__":unittest.main()
