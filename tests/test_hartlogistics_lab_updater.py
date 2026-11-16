"""Permanent synthetic updater checks: never access either Minecraft server."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('lab',ROOT/'scripts/hartlogistics_lab_updater.py')
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)

class GuardTests(unittest.TestCase):
    def test_exact_lab_only(self):
        lab.assert_lab_name(lab.LAB)
        for candidate in [r'C:\Servers\Thomas_MCBedrock',lab.LAB+'x',lab.LAB+'\\',
                          lab.LAB+'\\..',lab.LAB+' ',lab.LAB.replace('\\','/'),
                          r'C:\Servers\..\Servers\Thomas_MCBedrock - Copy (2)']:
            with self.subTest(candidate=candidate),self.assertRaises(lab.UnsafeLab):
                lab.assert_lab_name(candidate)

    def test_original_assets_and_candidate_engine_are_pinned(self):
        self.assertEqual(lab.validate_source(ROOT),(1,4,1))
        self.assertEqual(lab.hash_file(ROOT/lab.ENGINE_FILE),lab.PHASE_A_ENGINE_SHA256)
        registry=json.loads((ROOT/'BASELINE_HASHES.json').read_text())
        self.assertEqual(len(registry['files']),72)
        self.assertNotEqual(registry['files'][lab.ENGINE_FILE],lab.PHASE_A_ENGINE_SHA256)
        self.assertEqual(len(lab.hashes(ROOT/'addon/behavior_pack')),16)
        self.assertEqual(len(lab.hashes(ROOT/'addon/resource_pack')),56)

    def test_wrong_engine_and_asset_hashes_are_refused(self):
        original_hash=lab.hash_file
        baseline=json.loads((ROOT/'BASELINE_HASHES.json').read_text())['files']
        for badpath,badhash in [
            (ROOT/lab.ENGINE_FILE,baseline[lab.ENGINE_FILE]),
            (ROOT/'addon/behavior_pack/blocks/sorter.json','0'*64)]:
            def mock_hash(path):
                return badhash if path==badpath else original_hash(path)
            with self.subTest(path=badpath),patch.object(lab,'hash_file',side_effect=mock_hash):
                with self.assertRaisesRegex(lab.UnsafeLab,'Phase A source hash mismatch'):
                    lab.validate_source(ROOT)

    def test_jsonc_preserves_unrelated(self):
        original='// owner comment\n[{"pack_id":"other","version":[9,8,7]},/* preserve */'+\
                 '{"pack_id":"'+lab.BP_UUID+'","version":[1,4,0]},]\n'
        after=lab.patch_registration(original,lab.BP_UUID,(1,4,1))
        self.assertIn('// owner comment',after)
        self.assertIn('/* preserve */',after)
        rows=json.loads(lab.remove_jsonc(after))
        self.assertEqual(rows[0],{"pack_id":"other","version":[9,8,7]})
        self.assertEqual(rows[1]['version'],[1,4,1])

    def test_jsonc_ambiguous_registry_fails(self):
        for raw in ['[]','[{"pack_id":"'+lab.BP_UUID+'","version":[1,4,0]},'+
                    '{"pack_id":"'+lab.BP_UUID+'","version":[1,4,0]}]']:
            with self.assertRaises(lab.UnsafeLab):lab.patch_registration(raw,lab.BP_UUID,(1,4,1))

    def test_pin_validates_exact_sha_and_git_origin(self):
        with self.assertRaises(lab.UnsafeLab):lab.assert_clean_git(ROOT,'bad')
        self.assertFalse(lab.ORIGIN.fullmatch('https://github.com/partom24/HartBots'))
        self.assertFalse(lab.ORIGIN.fullmatch('partom24/HartLogistics2'))
        self.assertTrue(lab.ORIGIN.fullmatch('https://github.com/partom24/HartLogistics2.git'))

class SyntheticTransactions(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        (self.root/'bedrock_server.exe').write_bytes(b'')
        (self.root/'server.properties').write_text('level-name=Fixture\n')
        world=self.root/'worlds/Fixture';world.mkdir(parents=True)
        self.before={}
        for name,install,uid,registry in lab.PACKS:
            dest=self.root/install/('existing_'+name);dest.parent.mkdir()
            shutil.copytree(ROOT/'addon'/name,dest)
            self.before[dest]=lab.hashes(dest)
            reg=world/registry
            reg.write_text('// other packs must survive\n[{"pack_id":"other","version":[3,2,1]},'+
                           '{"pack_id":"'+uid+'","version":[1,4,1]}]\n')
            self.before[reg]=reg.read_bytes()
        self.plan=lab.discover_plan(ROOT,self.root)

    def tearDown(self):self.tmp.cleanup()

    def restored(self):
        for p,v in self.before.items():
            if isinstance(v,dict):self.assertEqual(lab.hashes(p),v)
            else:self.assertEqual(p.read_bytes(),v)

    def test_plan_is_read_only(self):
        self.assertEqual(len(self.plan),2)
        self.restored()
        self.assertFalse((self.root/'_HartLogisticsDeployStage').exists())

    def test_stage_apply_verifies_and_keeps_backup(self):
        backup=lab.apply_plan(self.root,self.plan)
        self.assertTrue(backup.exists())
        for p in self.plan:
            self.assertEqual(lab.hashes(p['target']),p['files'])
            content=p['registry'].read_text()
            self.assertIn('// other packs must survive',content)
            self.assertEqual(json.loads(lab.remove_jsonc(content))[-1]['version'],[1,4,1])
        self.assertFalse(any((self.root/'_HartLogisticsDeployStage').iterdir()))

    def test_rollback_if_pack_move_interrupted(self):
        original=Path.rename;failed=[False]
        def rename_once(path,target):
            if str(target).endswith('existing_behavior_pack') and not failed[0]:
                failed[0]=True;raise RuntimeError('simulated first install failure')
            return original(path,target)
        with patch.object(Path,'rename',rename_once):
            with self.assertRaisesRegex(RuntimeError,'simulated first install failure'):
                lab.apply_plan(self.root,self.plan)
        self.restored()

    def test_rollback_if_registry_update_interrupted(self):
        original=Path.replace;failed=[False]
        def replace_once(path,target):
            if str(target).endswith('world_behavior_packs.json') and not failed[0]:
                failed[0]=True;raise RuntimeError('simulated registry failure')
            return original(path,target)
        with patch.object(Path,'replace',replace_once):
            with self.assertRaisesRegex(RuntimeError,'simulated registry failure'):
                lab.apply_plan(self.root,self.plan)
        self.restored()

if __name__=='__main__':unittest.main()

    def test_newer_installed_pack_is_refused_without_writing(self):
        pack=self.plan[0]['target']
        manifest=pack/'manifest.json'
        before=manifest.read_bytes()
        obj=json.loads(before);obj['header']['version']=[1,5,10]
        manifest.write_text(json.dumps(obj))
        try:
            with self.assertRaisesRegex(lab.UnsafeLab,'refuse downgrade'):
                lab.discover_plan(ROOT,self.root)
        finally:
            manifest.write_bytes(before)
        self.restored()

    def test_wrong_world_registration_is_refused_without_writing(self):
        reg=self.plan[0]['registry']
        before=reg.read_bytes()
        reg.write_bytes(before.replace(b'[1,4,1]',b'[1,5,10]',1))
        try:
            with self.assertRaisesRegex(lab.UnsafeLab,'not original 1.4.1'):
                lab.discover_plan(ROOT,self.root)
        finally:
            reg.write_bytes(before)
        self.restored()

    def test_modified_installed_pack_is_refused_without_writing(self):
        pack=self.plan[0]['target']
        intruder=pack/'extra.txt'
        intruder.write_text('unknown pack')
        try:
            with self.assertRaisesRegex(lab.UnsafeLab,'Unrecognized installed LAB pack contents'):
                lab.discover_plan(ROOT,self.root)
        finally:
            intruder.unlink()
        self.restored()

    def test_same_version_apply_preserves_world_registry_bytes(self):
        before={x['registry']:x['registry'].read_bytes() for x in self.plan}
        plan=lab.discover_plan(ROOT,self.root)
        lab.apply_plan(self.root,plan)
        for reg,raw in before.items():
            self.assertEqual(reg.read_bytes(),raw)
        for item in plan:
            self.assertEqual(lab.hashes(item['target']),item['files'])

    def test_preflight_does_not_change_original_packs_or_world(self):
        first=lab.discover_plan(ROOT,self.root)
        self.assertEqual(len(first),2)
        self.assertNotEqual(first[0]['installed'],first[0]['files'])
        self.restored()
