"""Permanent synthetic updater checks: never access either Minecraft server."""
import importlib.util
import json
import subprocess
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

    def test_process_gate_allows_online_production_but_no_lab_process(self):
        # Only mock OS process metadata; never inspect or run a live server.
        production=r'C:\Servers\Thomas_MCBedrock\bedrock_server.exe'
        unrelated=r'C:\UnrelatedBedrock\bedrock_server.exe'
        entries=[{'ProcessId':11,'ExecutablePath':production},
                 {'ProcessId':12,'ExecutablePath':unrelated}]
        with patch.object(lab.os,'name','nt'), patch.object(
                lab.subprocess,'run',return_value=subprocess.CompletedProcess(
                    args=[],returncode=0,stdout=json.dumps(entries))) as probe:
            lab.assert_server_stopped()
            argv=probe.call_args.args[0]
            self.assertEqual(argv[:3],['powershell.exe','-NoProfile','-NonInteractive'])
            self.assertIn('Get-CimInstance',argv[4])
            self.assertNotIn('Stop-Process',argv[4])

    def test_process_gate_rejects_running_lab_with_production_online(self):
        entries=[
            {'ProcessId':11,'ExecutablePath':r'C:\Servers\Thomas_MCBedrock\bedrock_server.exe'},
            {'ProcessId':19,'ExecutablePath':lab.LAB+r'\bedrock_server.exe'}
        ]
        with patch.object(lab.os,'name','nt'), patch.object(
                lab.subprocess,'run',return_value=subprocess.CompletedProcess(
                    args=[],returncode=0,stdout=json.dumps(entries))):
            with self.assertRaisesRegex(lab.UnsafeLab,'LAB bedrock_server.exe must be stopped'):
                lab.assert_server_stopped()

    def test_process_gate_refuses_unknown_or_incomplete_process_metadata(self):
        cases=['not json','{}','null',
               json.dumps([{'ProcessId':42,'ExecutablePath':None}]),
               json.dumps([{'ProcessId':42,'ExecutablePath':''}]),
               json.dumps([{'ProcessId':42,'ExecutablePath':'bedrock_server.exe'}]),
               json.dumps([{'ExecutablePath':lab.LAB+r'\bedrock_server.exe'}])]
        for contents in cases:
            with self.subTest(contents=contents), patch.object(lab.os,'name','nt'),patch.object(
                    lab.subprocess,'run',return_value=subprocess.CompletedProcess(
                        args=[],returncode=0,stdout=contents)):
                with self.assertRaises(lab.UnsafeLab):lab.assert_server_stopped()

    def test_process_gate_refuses_failed_windows_process_query(self):
        failure=subprocess.CalledProcessError(1,['powershell.exe'])
        with patch.object(lab.os,'name','nt'),patch.object(lab.subprocess,'run',side_effect=failure):
            with self.assertRaisesRegex(lab.UnsafeLab,'Cannot verify whether LAB BDS is stopped'):
                lab.assert_server_stopped()

    def test_process_gate_blocks_non_windows_execution(self):
        with patch.object(lab.os,'name','posix'),patch.object(lab.subprocess,'run') as probe:
            with self.assertRaisesRegex(lab.UnsafeLab,'only permitted on Windows'):
                lab.assert_server_stopped()
            probe.assert_not_called()

    def test_git_checkout_preserves_original_pack_bytes_on_windows(self):
        result=subprocess.run(
            ['git','-C',str(ROOT),'check-attr','text','--','addon/behavior_pack/LICENSE',
             'addon/behavior_pack/scripts/main.js','addon/resource_pack/manifest.json'],
            check=True,capture_output=True,text=True)
        self.assertEqual(result.stdout.count('text: unset'),3)

    def test_original_assets_and_candidate_engine_are_pinned(self):
        self.assertEqual(lab.validate_source(ROOT),(1,4,2))
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

    def test_known_previous_phase_a_candidate_can_upgrade_without_unknown_pack_allowance(self):
        # The installed owner LAB still has the previous candidate's exact
        # main.js. Upgrade must accept that version, not require a world reset.
        # Use synthetic files only, never the actual owner server.
        old=subprocess.run(
            ['git','-C',str(ROOT),'show',
             'f7479702af97e0eade9e645ecae952d74501f0e3:addon/behavior_pack/scripts/main.js'],
            check=True,capture_output=True).stdout
        self.assertEqual(lab.hash_file(ROOT/lab.ENGINE_FILE),lab.PHASE_A_ENGINE_SHA256)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'bedrock_server.exe').write_bytes(b'')
            (root/'server.properties').write_text('level-name=Fixture\n')
            world=root/'worlds/Fixture'
            world.mkdir(parents=True)
            for name,install,uid,registry in lab.PACKS:
                target=root/install/('previous_'+name)
                target.parent.mkdir(parents=True)
                shutil.copytree(ROOT/'addon'/name,target)
                # Rebuild the LEGACY 1.4.1 manifest, not the proposed 1.4.2
                # source manifest, so old installed content has valid provenance.
                manifest=subprocess.run(
                    ['git','-C',str(ROOT),'show',
                     '0ea3000651c116b0fa1acc2836ab7e1bcfbc6269:addon/'+name+'/manifest.json'],
                    check=True,capture_output=True).stdout
                (target/'manifest.json').write_bytes(manifest)
                if name=='behavior_pack':
                    (target/'scripts/main.js').write_bytes(old)
                    self.assertEqual(lab.hash_file(target/'scripts/main.js'),lab.PREVIOUS_PHASE_A_ENGINE_SHA256)
                (world/registry).write_text(
                    '[{"pack_id":"'+uid+'","version":[1,4,1]}]\n')
            self.assertEqual(len(lab.discover_plan(ROOT,root)),2)
            # CI-green P1 source may also be present if it was installed
            # between the owner's two controlled diagnostic phases.
            p1=subprocess.run(
                ['git','-C',str(ROOT),'show',
                 '27f16aeb847471712afbd4bff4f65a20e5cea7b5:addon/behavior_pack/scripts/main.js'],
                check=True,capture_output=True).stdout
            installed=root/'behavior_packs/previous_behavior_pack/scripts/main.js'
            installed.write_bytes(p1)
            self.assertEqual(lab.hash_file(installed),lab.INTERMEDIATE_PHASE_A_ENGINE_SHA256)
            self.assertEqual(len(lab.discover_plan(ROOT,root)),2)
            p2=subprocess.run(
                ['git','-C',str(ROOT),'show',
                 '3857ee47e3b35f9c32e3261ff6c1effbca87d3ae:addon/behavior_pack/scripts/main.js'],
                check=True,capture_output=True).stdout
            installed.write_bytes(p2)
            self.assertEqual(lab.hash_file(installed),lab.INSTALLED_P2_ENGINE_SHA256)
            self.assertEqual(len(lab.discover_plan(ROOT,root)),2)
            p3=subprocess.run(
                ['git','-C',str(ROOT),'show',
                 'f564b8777d698445450ee7d314039a756f967a82:addon/behavior_pack/scripts/main.js'],
                check=True,capture_output=True).stdout
            installed.write_bytes(p3)
            self.assertEqual(lab.hash_file(installed),lab.INSTALLED_P3_ENGINE_SHA256)
            self.assertEqual(len(lab.discover_plan(ROOT,root)),2)
            p4=subprocess.run(
                ['git','-C',str(ROOT),'show',
                 'd3dc28aa4c9ffbbf5861aa35af6f001e131ec773:addon/behavior_pack/scripts/main.js'],
                check=True,capture_output=True).stdout
            installed.write_bytes(p4)
            self.assertEqual(lab.hash_file(installed),lab.INSTALLED_P4_ENGINE_SHA256)
            self.assertEqual(len(lab.discover_plan(ROOT,root)),2)
            p4b=subprocess.run(
                ['git','-C',str(ROOT),'show',
                 '9a4e44093fbc9093d9bc985acce5348c8803c842:addon/behavior_pack/scripts/main.js'],
                check=True,capture_output=True).stdout
            installed.write_bytes(p4b)
            self.assertEqual(lab.hash_file(installed),lab.INSTALLED_P4B_ENGINE_SHA256)
            self.assertEqual(len(lab.discover_plan(ROOT,root)),2)
            p4d=subprocess.run(
                ['git','-C',str(ROOT),'show',
                 '798ae788ad2aaac7bd7c23dce0cc6cb6659afaed:addon/behavior_pack/scripts/main.js'],
                check=True,capture_output=True).stdout
            installed.write_bytes(p4d)
            self.assertEqual(lab.hash_file(installed),lab.INSTALLED_P4D_ENGINE_SHA256)
            self.assertEqual(len(lab.discover_plan(ROOT,root)),2)
            p4e=subprocess.run(
                ['git','-C',str(ROOT),'show',
                 '5c974dd62696708dfa0d8ae35607cacfcdb17346:addon/behavior_pack/scripts/main.js'],
                check=True,capture_output=True).stdout
            installed.write_bytes(p4e)
            self.assertEqual(lab.hash_file(installed),lab.INSTALLED_P4E_ENGINE_SHA256)
            self.assertEqual(len(lab.discover_plan(ROOT,root)),2)
            p4g=subprocess.run(
                ['git','-C',str(ROOT),'show',
                 '6d36640d2c5acbac71f78106a38e4b0b3a72e3d1:addon/behavior_pack/scripts/main.js'],
                check=True,capture_output=True).stdout
            installed.write_bytes(p4g)
            self.assertEqual(lab.hash_file(installed),lab.INSTALLED_P4G_ENGINE_SHA256)
            self.assertEqual(len(lab.discover_plan(ROOT,root)),2)
            installed.write_bytes(b'unknown modified engine')
            with self.assertRaisesRegex(lab.UnsafeLab,'Unrecognized installed LAB pack contents'):
                lab.discover_plan(ROOT,root)

    def test_jsonc_preserves_unrelated(self):
        original='// owner comment\n[{"pack_id":"other","version":[9,8,7]},/* preserve */'+\
                 '{"pack_id":"'+lab.BP_UUID+'","version":[1,4,0]},]\n'
        after=lab.patch_registration(original,lab.BP_UUID,(1,4,2))
        self.assertIn('// owner comment',after)
        self.assertIn('/* preserve */',after)
        rows=json.loads(lab.remove_jsonc(after))
        self.assertEqual(rows[0],{"pack_id":"other","version":[9,8,7]})
        self.assertEqual(rows[1]['version'],[1,4,2])

    def test_matching_version_preserves_jsonc_spacing_and_comments(self):
        raw='// intact\n[{"pack_id":"'+lab.BP_UUID+'","version":[ 1, 4, 2 ]},]\n'
        self.assertEqual(lab.patch_registration(raw,lab.BP_UUID,(1,4,2)),raw)

    def test_jsonc_ambiguous_registry_fails(self):
        for raw in ['[]','[{"pack_id":"'+lab.BP_UUID+'","version":[1,4,0]},'+
                    '{"pack_id":"'+lab.BP_UUID+'","version":[1,4,0]}]']:
            with self.assertRaises(lab.UnsafeLab):lab.patch_registration(raw,lab.BP_UUID,(1,4,2))

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
            # LAB fixture represents an actual 1.4.1 installed pack.
            old_manifest=subprocess.run(
                ['git','-C',str(ROOT),'show',
                 '0ea3000651c116b0fa1acc2836ab7e1bcfbc6269:addon/'+name+'/manifest.json'],
                check=True,capture_output=True).stdout
            (dest/'manifest.json').write_bytes(old_manifest)
            if name=='behavior_pack':
                # Install the real immutable original 1.4.1 engine as the
                # pre-update fixture. This exercises an actual source delta.
                original=subprocess.run(
                    ['git','-C',str(ROOT),'show',
                     '0ea3000651c116b0fa1acc2836ab7e1bcfbc6269:addon/behavior_pack/scripts/main.js'],
                    check=True,capture_output=True).stdout
                (dest/'scripts/main.js').write_bytes(original)
                expected=json.loads((ROOT/'BASELINE_HASHES.json').read_text())['files']['addon/behavior_pack/scripts/main.js']
                self.assertEqual(lab.hash_file(dest/'scripts/main.js'),expected)
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

    def test_staging_or_backup_reparse_refuses_before_write(self):
        for path in [self.root/'_HartLogisticsDeployStage',
                     self.root/'_HartLogisticsDeployBackups']:
            original=lab.assert_no_link
            def refuse(candidate):
                if candidate==path:raise lab.UnsafeLab('Unapproved junction or link')
                return original(candidate)
            with self.subTest(path=path),patch.object(lab,'assert_no_link',side_effect=refuse):
                with self.assertRaisesRegex(lab.UnsafeLab,'Unapproved junction or link'):
                    lab.apply_plan(self.root,self.plan)
            self.restored()
            self.assertFalse((self.root/'_HartLogisticsDeployStage').exists())
            self.assertFalse((self.root/'_HartLogisticsDeployBackups').exists())

    def test_stage_apply_verifies_and_keeps_backup(self):
        backup=lab.apply_plan(self.root,self.plan)
        self.assertTrue(backup.exists())
        for p in self.plan:
            self.assertEqual(lab.hashes(p['target']),p['files'])
            content=p['registry'].read_text()
            self.assertIn('// other packs must survive',content)
            self.assertEqual(json.loads(lab.remove_jsonc(content))[-1]['version'],[1,4,2])
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
        # 1.4.1 -> 1.4.2 genuinely patches both registry files.
        plan=[dict(p) for p in self.plan]
        original=Path.replace;failed=[False]
        def replace_once(path,target):
            if str(target).endswith('world_behavior_packs.json') and not failed[0]:
                failed[0]=True;raise RuntimeError('simulated registry failure')
            return original(path,target)
        with patch.object(Path,'replace',replace_once):
            with self.assertRaisesRegex(RuntimeError,'simulated registry failure'):
                lab.apply_plan(self.root,plan)
        self.restored()

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
            with self.assertRaisesRegex(lab.UnsafeLab,'mismatches installed version'):
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

    def test_version_upgrade_updates_only_hart_registration_and_is_idempotent(self):
        before={x['registry']:x['registry'].read_bytes() for x in self.plan}
        lab.apply_plan(self.root,self.plan)
        for item in self.plan:
            reg=item['registry']
            raw=reg.read_bytes()
            self.assertNotEqual(raw,before[reg])
            parsed=json.loads(lab.remove_jsonc(raw.decode()))
            self.assertEqual(parsed[0],{'pack_id':'other','version':[3,2,1]})
            self.assertEqual(parsed[-1]['version'],[1,4,2])
        again=lab.discover_plan(ROOT,self.root)
        self.assertTrue(all(x['installed']==x['files'] for x in again))
        self.assertTrue(all(x['new_registry'].encode()==x['old_bytes'] for x in again))
        before_repeat={x['registry']:x['registry'].read_bytes() for x in again}
        lab.apply_plan(self.root,again)
        self.assertEqual(before_repeat,{
            x['registry']:x['registry'].read_bytes() for x in again})

    def test_forged_142_installation_is_refused_before_write(self):
        # Even if manifest and world registration both say 1.4.2, the pack
        # must equal our exact approved 1.4.2 contents.
        pack=self.plan[0]['target']
        manifest=pack/'manifest.json'
        original=manifest.read_bytes()
        target_manifest=(ROOT/'addon/behavior_pack/manifest.json').read_bytes()
        reg=self.plan[0]['registry']
        old_registration=reg.read_bytes()
        try:
            manifest.write_bytes(target_manifest)
            reg.write_bytes(old_registration.replace(b'[1,4,1]',b'[1,4,2]',1))
            with self.assertRaisesRegex(lab.UnsafeLab,'Unrecognized installed LAB pack contents'):
                lab.discover_plan(ROOT,self.root)
        finally:
            manifest.write_bytes(original)
            reg.write_bytes(old_registration)
        self.restored()

    def test_preflight_does_not_change_original_packs_or_world(self):
        first=lab.discover_plan(ROOT,self.root)
        self.assertEqual(len(first),2)
        self.assertNotEqual(first[0]['installed'],first[0]['files'])
        self.restored()

    def test_repeat_plan_recognizes_identical_candidate(self):
        lab.apply_plan(self.root,self.plan)
        again=lab.discover_plan(ROOT,self.root)
        self.assertTrue(all(p['installed']==p['files'] and
             p['old_bytes'].decode('utf-8-sig')==p['new_registry'] for p in again))

if __name__=='__main__':unittest.main()
