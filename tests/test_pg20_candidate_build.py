"""PG20 derived native-MR recovery candidate offline contract tests."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    "pg20_builder_under_test",ROOT/"candidates/pg20/prepare_candidate.py"
)
pg=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)


class PG20CandidateBuild(unittest.TestCase):
    def test_immutable_original_72_source_files(self):
        self.assertEqual(pg.pg08.check_baseline(),72)

    def test_stable_155_manifests_pack_uuids_and_dependencies(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/"pg20"
            pg.prepare(out)
            bp=json.loads((out/"behavior_pack/manifest.json").read_text())
            rp=json.loads((out/"resource_pack/manifest.json").read_text())
            for manifest in [bp,rp]:
                self.assertEqual(manifest["header"]["version"],[1,5,5])
                self.assertIn("PG20 MR RECOVERY LAB ONLY",manifest["header"]["name"])
                self.assertTrue(all(m["version"]==[1,5,5] for m in manifest["modules"]))
            self.assertEqual(bp["header"]["uuid"],"4854d263-05dd-4f79-a21c-7ba969295c2d")
            self.assertEqual(rp["header"]["uuid"],"91316442-0f26-4fbb-88f3-2e39ea843a1a")
            self.assertEqual([x["version"] for x in bp["dependencies"] if x.get("uuid")],
                             [[1,5,5]])
            modules={x["module_name"]:x["version"] for x in bp["dependencies"]
                     if x.get("module_name")}
            self.assertEqual(modules["@minecraft/server"],"2.7.0")
            self.assertEqual(modules["@minecraft/server-ui"],"2.2.0")
            self.assertTrue((out/"NOT_APPROVED_FOR_INSTALL.txt").is_file())

    def test_pg08_prefix_retained_except_version_safety_patch_and_no_old_probes(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous=Path(tmp)/"pg08"
            current=Path(tmp)/"pg20"
            pg.pg08.prepare(previous)
            pg.prepare(current)
            old=(previous/"behavior_pack/scripts/main.js").read_text()
            new=(current/"behavior_pack/scripts/main.js").read_text()
            self.assertEqual(new,pg.compile_patch(old,pg.OVERLAY.read_text()))
            for marker in ("pg08CommitLink(", "function recoverQueueJournal()",
                           "function recoverJournal()", "function safeMovePartial(",
                           "pg20MoveOpaqueNative(", "pg20ReportHold(",
                           "src.moveItem(srcSlot, dstSlotInfo.slot, dst)"):
                self.assertIn(marker,new)
            for forbidden in ("const PG13_A =", "const PG14_RESERVE =",
                              "const PG15_KEY =", "hartlogistics:cutpre",
                              "hartlogistics:shadowbegin",
                              "hartlogistics:custodytransfer"):
                self.assertNotIn(forbidden,new)

    def test_original_file_footprint_and_untouched_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            current=Path(tmp)/"pg20"
            pg.prepare(current)
            for kind in ("behavior_pack","resource_pack"):
                before=ROOT/"addon"/kind
                after=current/kind
                originals={x.relative_to(before).as_posix():x.read_bytes()
                          for x in before.rglob("*") if x.is_file()}
                compiled={x.relative_to(after).as_posix():x.read_bytes()
                          for x in after.rglob("*") if x.is_file()}
                self.assertEqual(set(originals),set(compiled))
                edited={"manifest.json"}
                if kind=="behavior_pack":edited.add("scripts/main.js")
                for path in originals:
                    if path not in edited:
                        self.assertEqual(originals[path],compiled[path],path)

    def test_native_overlay_has_no_new_item_or_manual_world_mutator(self):
        source=pg.OVERLAY.read_text()
        for forbidden in ("new ItemStack(", "setItem(", "addItem(", "transferItem(",
                          "world.getAllPlayers(", "clearAll(", "block_entity"):
            self.assertNotIn(forbidden,source)
        self.assertEqual(source.count("src.moveItem(srcSlot, dstSlotInfo.slot, dst)"),1)
        self.assertIn("saveJournal(undefined)",source)

    def test_fails_closed_on_preexisting_output_and_broken_source_anchors(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/"existing";out.mkdir()
            (out/"owner").write_text("keep")
            with self.assertRaises(FileExistsError):pg.prepare(out)
            self.assertEqual((out/"owner").read_text(),"keep")
        original="function recoverJournal() { /* unknown */ }"
        with self.assertRaises(ValueError):
            pg.compile_patch(original,pg.OVERLAY.read_text())


if __name__=="__main__":
    unittest.main()
