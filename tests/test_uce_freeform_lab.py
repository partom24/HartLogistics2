"""Fresh freeform LAB operator flow, with NO prerequisite old world or backup.

All tests use synthetic temporary roots, never the owner's Windows BDS.
"""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "candidates" / "uce"))
spec = importlib.util.spec_from_file_location(
    "hl2_freeform", ROOT / "candidates" / "uce" / "freeform_lab.py")
freeform = importlib.util.module_from_spec(spec)
spec.loader.exec_module(freeform)
lab = freeform.lab


class FreeformSyntheticWorld(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="hl2-freeform-synthetic-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "lab"
        self.root.mkdir()
        (self.root / "bedrock_server.exe").write_bytes(b"synthetic LAB exe")
        (self.root / "server.properties").write_bytes(
            b"server-name=HartTest\r\nlevel-name=AlreadyDeletedOldLab\r\ndifficulty=normal\r\n")
        (self.root / "worlds").mkdir()
        self.current = []
        self.product = Path(self.temp.name) / "product"
        for i, (kind, folder, pack_id, reg_name) in enumerate(lab.PACKS):
            target = self.root / freeform.PACK_DIRS[i]
            target.mkdir(parents=True)
            manifest = {"header": {"uuid": pack_id,
                                   "version": list(freeform.VERSION)}}
            (target / "manifest.json").write_text(json.dumps(manifest))
            if i == 0:
                (target / "scripts").mkdir()
                (target / "scripts" / "main.js").write_text(
                    'const VERSION = "1.5.16-DEV-UCE";\n'
                    'const command="hartlogistics:activate_empty_lab";\n')
            self.current.append(target)
            generated = self.product / kind
            generated.mkdir(parents=True)
            for source in target.rglob("*"):
                if source.is_file():
                    destination = generated / source.relative_to(target)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(source.read_bytes())
        self.pin = "d" * 40

    def prepare(self):
        return freeform.prepare(self.root, self.pin, apply=True)

    def generate_world(self):
        fresh = self.root / "worlds" / freeform.WORLD
        fresh.mkdir()
        (fresh / "level.dat").write_bytes(b"new BDS generated world")
        (fresh / "db").mkdir()
        (fresh / "db" / "CURRENT").write_bytes(b"LevelDB")
        return fresh

    def source_hashes(self):
        return {kind: lab.hashes(self.product / kind)
                for kind, _, _, _ in lab.PACKS}

    def finish(self, apply=True):
        return freeform.finish(self.root, self.pin, self.product,
                               self.source_hashes(), apply=apply)

    def test_stage_requires_no_old_world_or_backups(self):
        before = (self.root / "server.properties").read_bytes()
        self.assertFalse((self.root / "worlds" / "AlreadyDeletedOldLab").exists())
        self.assertFalse((self.root / "_HartLogisticsDeployBackups").exists())
        preview = freeform.prepare(self.root, self.pin)
        self.assertEqual(preview["phase"], "READY_TO_PREPARE")
        self.assertEqual((self.root / "server.properties").read_bytes(), before)
        self.assertFalse((self.root / freeform.RECEIPT).exists())
        result = self.prepare()
        self.assertEqual(result["phase"], "READY_FOR_WORLD_GENERATION")
        self.assertEqual(freeform.level_name(
            (self.root / "server.properties").read_bytes()), freeform.WORLD)
        self.assertFalse((self.root / "_HartLogisticsDeployBackups").exists())
        self.assertFalse((self.root / "worlds" / freeform.WORLD).exists())
        self.assertFalse((self.root / "worlds" / "AlreadyDeletedOldLab").exists())

    def test_finish_on_generated_world_registers_only_hl2_no_redundant_backup(self):
        self.prepare()
        fresh = self.generate_world()
        planned = self.finish(apply=False)
        self.assertEqual(planned["phase"], "READY_TO_FINISH")
        self.assertFalse(planned["shared_pack_update"])
        result = self.finish()
        self.assertEqual(result["phase"], "READY_FOR_FREEFORM_GAMEPLAY")
        self.assertEqual(result["worlds_backed_up"], 0)
        self.assertIsNone(result["pack_rollback"])
        self.assertFalse((self.root / "_HartLogisticsDeployBackups").exists())
        for i, (_, _, pack_id, reg) in enumerate(lab.PACKS):
            record = json.loads((fresh / reg).read_text())
            self.assertEqual(record, [{"pack_id": pack_id,
                                       "version": [1, 5, 16]}])
        self.assertEqual((fresh / "db" / "CURRENT").read_bytes(), b"LevelDB")

    def test_finish_updates_only_two_shared_packs_with_pack_only_rollback(self):
        self.prepare()
        fresh = self.generate_world()
        old_script = (self.current[0] / "scripts" / "main.js").read_bytes()
        target_script = self.product / "behavior_pack" / "scripts" / "main.js"
        target_script.write_bytes(old_script + b"// updated gameplay fix\n")
        collateral = self.root / "behavior_packs" / "HartBots_BP" / "unchanged.txt"
        collateral.parent.mkdir()
        collateral.write_bytes(b"HartBots must remain unchanged")
        result = self.finish()
        self.assertEqual(result["phase"], "READY_FOR_FREEFORM_GAMEPLAY")
        self.assertTrue(result["updated_shared_packs"])
        self.assertEqual(result["worlds_backed_up"], 0)
        self.assertEqual(collateral.read_bytes(), b"HartBots must remain unchanged")
        self.assertEqual((self.current[0] / "scripts" / "main.js").read_bytes(),
                         target_script.read_bytes())
        self.assertEqual((fresh / "db" / "CURRENT").read_bytes(), b"LevelDB")
        backup = Path(result["pack_rollback"])
        self.assertTrue((backup / "pack-0" / "scripts" / "main.js").is_file())
        self.assertEqual((backup / "pack-0" / "scripts" / "main.js").read_bytes(),
                         old_script)
        self.assertFalse((backup / "worlds").exists())

    def test_never_overwrites_preexisting_world_even_without_backups(self):
        preexisting = self.root / "worlds" / freeform.WORLD
        preexisting.mkdir()
        (preexisting / "level.dat").write_bytes(b"someone else's world")
        old = (self.root / "server.properties").read_bytes()
        with self.assertRaisesRegex(lab.UnsafeLab, "already exists"):
            self.prepare()
        self.assertEqual((self.root / "server.properties").read_bytes(), old)
        self.assertEqual((preexisting / "level.dat").read_bytes(),
                         b"someone else's world")

    def test_no_world_generation_means_finish_cannot_change_packs(self):
        self.prepare()
        old = self.current[0].joinpath("scripts/main.js").read_bytes()
        with self.assertRaises((lab.UnsafeLab, FileNotFoundError)):
            self.finish()
        self.assertEqual(self.current[0].joinpath("scripts/main.js").read_bytes(), old)

    def test_existing_unrelated_or_nonempty_registry_refuses_without_writes(self):
        self.prepare()
        fresh = self.generate_world()
        reg = fresh / "world_behavior_packs.json"
        reg.write_text(json.dumps([{"pack_id": "unrelated",
                                    "version": [1, 0, 0]}]))
        before = reg.read_bytes()
        with self.assertRaisesRegex(lab.UnsafeLab, "existing pack registrations"):
            self.finish()
        self.assertEqual(reg.read_bytes(), before)
        self.assertFalse((fresh / "world_resource_packs.json").exists())

    def test_change_in_staged_properties_or_source_refuses(self):
        self.prepare()
        self.generate_world()
        props = self.root / "server.properties"
        props.write_bytes(props.read_bytes() + b"unexpected=1\n")
        with self.assertRaisesRegex(lab.UnsafeLab, "changed"):
            self.finish()
        props.write_bytes(props.read_bytes().replace(b"unexpected=1\n", b""))
        with self.assertRaisesRegex(lab.UnsafeLab, "changed"):
            freeform.finish(self.root, "a" * 40, self.product,
                            self.source_hashes())

    def test_older_integrated_labs_not_necessary_for_registration(self):
        self.prepare()
        fresh = self.generate_world()
        self.assertFalse((self.root / "worlds" / "HartUCECarrierLabPG42").exists())
        self.assertFalse((self.root / "worlds" / "HartUCEIntegratedLab").exists())
        result = self.finish()
        self.assertEqual(result["phase"], "READY_FOR_FREEFORM_GAMEPLAY")
        self.assertTrue((fresh / "world_behavior_packs.json").is_file())

    def test_no_second_prepare_after_stage(self):
        self.prepare()
        with self.assertRaisesRegex(lab.UnsafeLab, "already selected|already prepared"):
            self.prepare()


if __name__ == "__main__":
    unittest.main()
