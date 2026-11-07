"""PG15 1.5.4 derived candidate offline invariants."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    "pg15_candidate",ROOT/"candidates/pg15/prepare_candidate.py"
)
pg=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)


class PG15Build(unittest.TestCase):
    def test_immutable_original_72_hashes(self):
        self.assertEqual(pg.pg14.pg13.pg08.check_baseline(),72)

    def test_154_lab_manifests_uuids_and_stable_apis(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/"candidate"
            pg.prepare(dest)
            bp=json.loads((dest/"behavior_pack/manifest.json").read_text())
            rp=json.loads((dest/"resource_pack/manifest.json").read_text())
            for m in [bp,rp]:
                self.assertEqual(m["header"]["version"],[1,5,4])
                self.assertIn("PG15 CUT LAB ONLY",m["header"]["name"])
                self.assertTrue(all(x["version"]==[1,5,4] for x in m["modules"]))
            self.assertEqual(bp["header"]["uuid"],"4854d263-05dd-4f79-a21c-7ba969295c2d")
            self.assertEqual(rp["header"]["uuid"],"91316442-0f26-4fbb-88f3-2e39ea843a1a")
            deps={x["module_name"]:x["version"] for x in bp["dependencies"]
                  if x.get("module_name")}
            self.assertEqual(deps["@minecraft/server"],"2.7.0")
            self.assertEqual(deps["@minecraft/server-ui"],"2.2.0")
            self.assertEqual([x["version"] for x in bp["dependencies"]
                              if x.get("uuid")],[[1,5,4]])
            self.assertTrue((dest/"NOT_APPROVED_FOR_INSTALL.txt").is_file())

    def test_pg14_prefix_is_identical_except_version_and_added_pg15_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            old=Path(tmp)/"pg14"
            pg.pg14.prepare(old)
            new=Path(tmp)/"pg15"
            pg.prepare(new)
            s_old=(old/"behavior_pack/scripts/main.js").read_text()
            s_new=(new/"behavior_pack/scripts/main.js").read_text()
            overlay=pg.OVERLAY.read_text()
            self.assertEqual(s_new,s_old.replace(
                'const VERSION = "1.5.3-LAB-PG14";',
                'const VERSION = "1.5.4-LAB-PG15";'
            )+"\n\n"+overlay.rstrip()+"\n")
            self.assertIn("pg08CommitLink(",s_new)
            self.assertIn("pg13Command(",s_new)
            self.assertIn("pg14Execute(",s_new)
            self.assertIn("pg15Run(",s_new)
            self.assertIn("function recoverQueueJournal()",s_new)

    def test_exact_original_file_footprint_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            new=Path(tmp)/"candidate"
            pg.prepare(new)
            for kind in ("behavior_pack","resource_pack"):
                before=ROOT/"addon"/kind
                now=new/kind
                names1={x.relative_to(before).as_posix():x.read_bytes()
                        for x in before.rglob("*") if x.is_file()}
                names2={x.relative_to(now).as_posix():x.read_bytes()
                        for x in now.rglob("*") if x.is_file()}
                self.assertEqual(set(names1),set(names2))
                changed={"manifest.json"}
                if kind=="behavior_pack":changed.add("scripts/main.js")
                for key in names1:
                    if key not in changed:
                        self.assertEqual(names1[key],names2[key],key)

    def test_output_never_overwrites_existing_owner_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/"already"
            out.mkdir()
            (out/"owner.txt").write_text("keep")
            with self.assertRaises(FileExistsError):pg.prepare(out)
            self.assertEqual((out/"owner.txt").read_text(),"keep")

    def test_one_pg15_move_and_single_key_recovery_gate(self):
        overlay=pg.OVERLAY.read_text()
        self.assertEqual(overlay.count("rig.source.moveItem(0, 0, rig.dest)"),1)
        self.assertIn('const PG15_KEY = "hartlogistics:pg15_intent_cut_v1"',overlay)
        self.assertIn("pg15Audited !== entry.record.checksum",overlay)
        self.assertIn("entry.record.runId === PG15_INSTANCE",overlay)
        for bad in ["new ItemStack(", "setItem(", "addItem(", "clearAll(",
                    "world.getAllPlayers(", "world.clearDynamicProperties("]:
            self.assertNotIn(bad,overlay)


if __name__=="__main__":
    unittest.main()
