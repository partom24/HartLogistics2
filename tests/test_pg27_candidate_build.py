"""PG27 changes only Transporter visuals/name and version identification."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("pg27_build_tests", ROOT / "candidates/pg27/prepare_candidate.py")
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.old, cls.new = (Path(cls.temp.name) / x for x in ("pg26", "pg27"))
        pg.pg26.prepare(cls.old)
        pg.prepare(cls.new)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def read(self, root, name):
        return json.loads((root / name).read_text(encoding="utf-8"))

    def test_exact_five_file_delta_no_old_assets_or_texture_or_icon_change(self):
        changed = set()
        for kind, count in (("behavior_pack", 18), ("resource_pack", 59)):
            old = {p.relative_to(self.old / kind) for p in (self.old / kind).rglob("*") if p.is_file()}
            new = {p.relative_to(self.new / kind) for p in (self.new / kind).rglob("*") if p.is_file()}
            self.assertEqual(old, new)
            self.assertEqual(len(new), count)
            changed.update(f"{kind}/{p.as_posix()}" for p in old
                           if (self.old / kind / p).read_bytes() != (self.new / kind / p).read_bytes())
        self.assertEqual(changed, {"behavior_pack/manifest.json", "resource_pack/manifest.json",
            "behavior_pack/scripts/main.js", "behavior_pack/blocks/transporter.json",
            "resource_pack/models/blocks/transporter.geo.json"})

    def test_gameplay_byte_identical_except_single_version_literal(self):
        old = (self.old / "behavior_pack/scripts/main.js").read_bytes()
        new = (self.new / "behavior_pack/scripts/main.js").read_bytes()
        self.assertEqual(old.count(b"1.5.9-LAB-PG26"), 1)
        self.assertEqual(new, old.replace(b"1.5.9-LAB-PG26", b"1.5.10-LAB-PG27"))

    def test_only_world_east_west_cube_positions_change(self):
        path = "resource_pack/models/blocks/transporter.geo.json"
        old, new = self.read(self.old, path), self.read(self.new, path)
        # Restore just the two world origins, then require exact model equality,
        # including the untouched inventory model and all other arm properties.
        bones = {b["name"]: b for b in new["minecraft:geometry"][0]["bones"]}
        self.assertEqual(bones["east"]["cubes"][0]["origin"], [-8, 6, -2])
        self.assertEqual(bones["west"]["cubes"][0]["origin"], [2, 6, -2])
        bones["east"]["cubes"][0]["origin"] = [2, 6, -2]
        bones["west"]["cubes"][0]["origin"] = [-8, 6, -2]
        self.assertEqual(old, new)

    def test_server_readable_name_is_only_block_component_delta(self):
        path = "behavior_pack/blocks/transporter.json"
        old, new = self.read(self.old, path), self.read(self.new, path)
        component = new["minecraft:block"]["components"]
        self.assertEqual(component["minecraft:display_name"], "Hart Transporter")
        component["minecraft:display_name"] = "tile.hartlogistics:transporter.name"
        self.assertEqual(old, new)

    def test_versions_uuid_engine_and_api_preserved(self):
        for kind in ("behavior_pack", "resource_pack"):
            old, new = (self.read(root, kind + "/manifest.json") for root in (self.old, self.new))
            self.assertEqual(new["header"]["version"], [1, 5, 10])
            self.assertEqual(new["header"]["uuid"], old["header"]["uuid"])
            self.assertEqual(new["header"]["min_engine_version"], old["header"]["min_engine_version"])
            for a, b in zip(old["modules"], new["modules"], strict=True):
                self.assertEqual(b["version"], [1, 5, 10])
                b["version"] = a["version"]
                self.assertEqual(a, b)
            for a, b in zip(old.get("dependencies", []), new.get("dependencies", []), strict=True):
                if b.get("uuid"):
                    self.assertEqual(b["version"], [1, 5, 10])
                    b["version"] = a["version"]
                self.assertEqual(a, b)

    def test_deterministic_build_and_no_output_overwrite(self):
        with tempfile.TemporaryDirectory() as td:
            other = Path(td) / "new"
            pg.prepare(other)
            for p in self.new.rglob("*"):
                if p.is_file():
                    self.assertEqual(p.read_bytes(), (other / p.relative_to(self.new)).read_bytes())
        with self.assertRaises(FileExistsError):
            pg.prepare(self.new)

    def test_visual_patch_refuses_drift_and_second_application(self):
        with tempfile.TemporaryDirectory() as td:
            import shutil
            path = Path(td) / "old"
            shutil.copytree(self.old, path)
            p = path / "resource_pack/models/blocks/transporter.geo.json"
            data = self.read(path, p.relative_to(path))
            data["minecraft:geometry"][0]["bones"][3]["cubes"][0]["origin"] = [0, 0, 0]
            pg.write_json(p, data)
            with self.assertRaises(ValueError):
                pg.correct_visuals(path)
            with self.assertRaises(ValueError):
                pg.correct_visuals(self.new)


if __name__ == "__main__":
    unittest.main()
