"""PG27 visual correction derived from the exact, immutable PG26 predecessor."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg27-lab"
VERSION = [1, 5, 10]

spec = importlib.util.spec_from_file_location("pg27_pg26_predecessor", ROOT / "candidates/pg26/prepare_candidate.py")
pg26 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg26)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def correct_visuals(target):
    path = target / "resource_pack/models/blocks/transporter.geo.json"
    models = json.loads(path.read_text(encoding="utf-8"))
    world, _ = models["minecraft:geometry"]
    if world["description"]["identifier"] != "geometry.hartlogistics.transporter":
        raise ValueError("PG27 REFUSED uncertain world geometry")
    bones = {bone["name"]: bone for bone in world["bones"]}
    for name, origin in (("east", [2, 6, -2]), ("west", [-8, 6, -2])):
        if bones[name]["cubes"] != [{"origin": origin, "size": [6, 4, 4], "uv": [0, 0]}]:
            raise ValueError("PG27 REFUSED uncertain PG26 arm: " + name)
    # Bedrock block geometry reflects model X into world X. World east (+X)
    # therefore needs the negative-model-X arm. Z and Y already agree.
    # Keep the dedicated inventory model exactly as installed in PG26.
    bones["east"]["cubes"][0]["origin"] = [-8, 6, -2]
    bones["west"]["cubes"][0]["origin"] = [2, 6, -2]
    write_json(path, models)
    path = target / "behavior_pack/blocks/transporter.json"
    block = json.loads(path.read_text(encoding="utf-8"))
    components = block["minecraft:block"]["components"]
    if components["minecraft:display_name"] != "tile.hartlogistics:transporter.name":
        raise ValueError("PG27 REFUSED uncertain Transporter display name")
    # The server's /give feedback showed the raw RP translation key. The
    # existing single English label is explicit so server and client agree.
    components["minecraft:display_name"] = "Hart Transporter"
    write_json(path, block)


def prepare(target):
    target = Path(target).resolve(strict=False)
    if target.exists():
        raise FileExistsError("PG27 REFUSED existing output: " + str(target))
    with tempfile.TemporaryDirectory(prefix="pg27-derive-") as temp:
        previous = Path(temp) / "pg26"
        pg26.prepare(previous)
        try:
            target.mkdir(parents=True)
            for kind in ("behavior_pack", "resource_pack"):
                shutil.copytree(previous / kind, target / kind)
                path = target / kind / "manifest.json"
                manifest = json.loads(path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 9]:
                    raise ValueError("PG27 REFUSED predecessor version")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = "HartMods - Hart Logistics " + ("BP" if kind == "behavior_pack" else "RP") + " | PG27 TRANSPORTER VISUAL FIX LAB ONLY"
                manifest["header"]["description"] = "Transporter east/west arm and English name correction; PG26 routing unchanged. LAB ONLY."
                for module in manifest["modules"]:
                    if module["version"] != [1, 5, 9]:
                        raise ValueError("PG27 REFUSED module predecessor")
                    module["version"] = VERSION
                for dependency in manifest.get("dependencies", []):
                    if dependency.get("uuid"):
                        if dependency["version"] != [1, 5, 9]:
                            raise ValueError("PG27 REFUSED dependency predecessor")
                        dependency["version"] = VERSION
                write_json(path, manifest)
            path = target / "behavior_pack/scripts/main.js"
            source = path.read_text(encoding="utf-8")
            source = pg26.once(source, 'const VERSION = "1.5.9-LAB-PG26";', 'const VERSION = "1.5.10-LAB-PG27";')
            path.write_text(source, encoding="utf-8")
            correct_visuals(target)
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG27 1.5.10 LAB visual correction; no implicit deployment.\n"
                "PG26 routing, custody gates, item icon and dedicated texture unchanged.\n", encoding="utf-8")
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink() or OUT.resolve(strict=False) != OUT.absolute():
        raise ValueError("PG27 REFUSED redirected build tree")
    prepare(OUT)
    print("PG27 SOURCE PASS:", OUT)
    print("No LAB/PROD/world files accessed.")
