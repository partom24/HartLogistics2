"""Pure, read-only regression tests for the actual flat-LAB v2 stage audit.

Exercise functions extracted from production source so that the tests never
touch a server, create a world, install packs or import a real deployment.
"""
from __future__ import annotations
import ast
import contextlib
import hashlib
import io
import re
import types
import unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parents[1]/"candidates/uce/perf_flat_attach.py"

class Refused(Exception):
    pass

def production():
    tree=ast.parse(SCRIPT.read_text(encoding="utf-8"))
    needed={"digest","rebuild_v2_staged_properties",
            "active_property_lines","assert_authenticated_stage"}
    selected=[node for node in tree.body if isinstance(node,ast.FunctionDef)
              and node.name in needed]
    assert len(selected)==len(needed)
    env={"hashlib":hashlib,"re":re,"WORLD":"HartLogistics15PerfFlat",
         "lab":types.SimpleNamespace(UnsafeLab=Refused)}
    module=ast.Module(body=selected,type_ignores=[])
    exec(compile(module,str(SCRIPT),"exec"),env)
    return env

class FlatStageReceiptTests(unittest.TestCase):
    def setUp(self):
        self.api=production()
        self.original=(b"# original BDS setting\r\n"
                       b"level-name=ThomasServer\r\n"
                       b"server-port=19132\r\n"
                       b"gamemode=survival\r\n"
                       b"allow-cheats=false\r\n"
                       b"# trailing comment\r\n")
        self.staged=self.api["rebuild_v2_staged_properties"](self.original)
        self.receipt={
            "schema":"hl-diagnostic-flat-v1",
            "worldName":"HartLogistics15PerfFlat",
            "originalSha256":self.api["digest"](self.original),
            "stagedSha256":self.api["digest"](self.staged),
        }
        self.check=self.api["assert_authenticated_stage"]

    def test_rebuild_uses_original_receipt_and_appends_missing_level_type(self):
        self.assertIn(b"level-name=HartLogistics15PerfFlat",self.staged)
        self.assertIn(b"level-type=FLAT\r\n",self.staged)
        self.assertIn(b"server-port=19132",self.staged)
        self.check(self.staged,self.receipt,self.original)

    def test_comment_and_blank_line_drift_only_is_allowed(self):
        live=self.staged.replace(b"# original BDS setting\r\n",
                                 b"# BDS reworded the comment\n\n")
        live=live.replace(b"# trailing comment\r\n",b"\n")
        live=live.replace(b"\r\n",b"\n")
        self.assertNotEqual(self.api["digest"](live),self.receipt["stagedSha256"])
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.check(live,self.receipt,self.original)
        self.assertIn("All ordered active",output.getvalue())

    def test_modified_unrelated_active_setting_is_refused(self):
        changed=self.staged.replace(b"server-port=19132",b"server-port=19133")
        with self.assertRaisesRegex(Refused,"staged=server-port"):
            self.check(changed,self.receipt,self.original)

    def test_modified_world_selection_is_refused(self):
        changed=self.staged.replace(b"level-name=HartLogistics15PerfFlat",
                                    b"level-name=ThomasServer")
        with self.assertRaisesRegex(Refused,"staged=level-name"):
            self.check(changed,self.receipt,self.original)

    def test_changed_active_line_order_is_refused(self):
        changed=self.staged.replace(
            b"server-port=19132\r\ngamemode=creative\r\n",
            b"gamemode=creative\r\nserver-port=19132\r\n")
        with self.assertRaisesRegex(Refused,"active setting or its order"):
            self.check(changed,self.receipt,self.original)

    def test_invalid_backup_or_receipt_is_never_accepted(self):
        with self.assertRaisesRegex(Refused,"original backup SHA mismatch"):
            self.check(self.staged,self.receipt,self.original+b"x")
        mutated={**self.receipt,"stagedSha256":"0"*64}
        with self.assertRaisesRegex(Refused,"cannot be reconstructed"):
            self.check(self.staged,mutated,self.original)
        mutated={**self.receipt,"worldName":"ThomasServer"}
        with self.assertRaisesRegex(Refused,"identity"):
            self.check(self.staged,mutated,self.original)

    def test_duplicate_target_setting_in_original_is_refused(self):
        original=self.original+b"gamemode=adventure\r\n"
        with self.assertRaisesRegex(Refused,"Ambiguous original property gamemode"):
            self.api["rebuild_v2_staged_properties"](original)

if __name__=="__main__":
    unittest.main()
