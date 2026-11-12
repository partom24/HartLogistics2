import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    'uce_guarded_lab_deploy',ROOT/'candidates/uce/lab_deploy.py')
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

class UceLabGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='uce-lab-offline-test-')
        cls.root=Path(cls.tmp.name)
        cls.old=cls.root/'pg33'
        cls.new=cls.root/'uce'
        deploy.pg33.prepare(cls.old)
        deploy.uce.prepare(cls.new)
    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_source_candidate_uses_exact_pg33_original_and_uce_only(self):
        verified=deploy.check_candidate(self.new,self.old)
        self.assertEqual(set(verified),
                         {'behavior_pack','resource_pack'})
        self.assertEqual(set(verified['behavior_pack'])-
                         set(deploy.lab.hashes(self.old/'behavior_pack')),
                         deploy.BP_NEW)
        self.assertEqual(set(verified['resource_pack'])-
                         set(deploy.lab.hashes(self.old/'resource_pack')),
                         deploy.RP_NEW)

    def test_preserved_original_pack_asset_mutation_refused(self):
        # Mutate only a disposable GENERATED copy, never original source.
        kind='behavior_pack'
        unchanged=next(p for p in deploy.lab.hashes(self.old/kind)
                       if p not in deploy.BP_MODIFIED)
        candidate=self.new/kind/unchanged
        before=candidate.read_bytes()
        try:
            candidate.write_bytes(before+b'\nTampered')
            with self.assertRaises(deploy.lab.UnsafeLab):
                deploy.check_candidate(self.new,self.old)
        finally:
            candidate.write_bytes(before)

    def test_invalid_manifest_or_unexpected_added_source_refused(self):
        manifest=self.new/'behavior_pack/manifest.json'
        previous=manifest.read_bytes()
        try:
            data=json.loads(previous)
            data['header']['version']=[9,9,9]
            manifest.write_text(json.dumps(data))
            with self.assertRaises(deploy.lab.UnsafeLab):
                deploy.check_candidate(self.new,self.old)
        finally:
            manifest.write_bytes(previous)
        intrusion=self.new/'behavior_pack/scripts/extra_writer.js'
        try:
            intrusion.write_text('world.setDynamicProperty("unknown",1);')
            with self.assertRaises(deploy.lab.UnsafeLab):
                deploy.check_candidate(self.new,self.old)
        finally:
            intrusion.unlink()

    def test_custom_commands_do_not_return_system_run_id(self):
        # PG34 Bedrock runtime: returning the system.run task number from a
        # custom-command callback violates CustomCommandResult | undefined.
        # Check the actual generated Bedrock module, not a test-only handler.
        compiled=(self.new/'behavior_pack/scripts/main.js').read_text(
            encoding='utf-8')
        expected={
            'migration_preview':
                '(origin) => { system.run(() => uceSendMigrationPreview(origin)); }',
            'activate_empty_lab':
                'origin => { system.run(() => uceActivateEmptyLabWorld(origin)); }',
        }
        for command,callback in expected.items():
            with self.subTest(command=command):
                marker="name: 'hartlogistics:"+command+"'"
                self.assertEqual(compiled.count(marker),1)
                start=compiled.index(marker)
                end=compiled.index('    );',start)
                handler=compiled[start:end]
                self.assertIn(callback,handler)
                self.assertNotRegex(handler,r'=>\s*system\.run\(')

    def test_unapproved_apply_and_rollback_never_touch_actual_lab(self):
        self.assertEqual(deploy.main(['--apply']),2)
        self.assertEqual(deploy.main(['--rollback-tag','lab-abcdefabcdef']),2)
        # No files under production/LAB are opened by these modes.

if __name__=='__main__':
    unittest.main()
