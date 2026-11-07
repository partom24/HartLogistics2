"""PG14 one-cobblestone LAB-only custody proof derived from accepted PG13.

Offline build only. No interaction with BDS, worlds, prod or user files.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg14-lab"
VERSION = [1, 5, 3]
OVERLAY = ROOT / "candidates/pg14/custody_overlay.js"


def load_pg13():
    path = ROOT / "candidates/pg13/prepare_candidate.py"
    spec = importlib.util.spec_from_file_location("pg14_pg13_builder", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg13 = load_pg13()


def prepare(target: Path) -> None:
    target = target.resolve(strict=False)
    if target.exists():
        raise FileExistsError(f"PG14 REFUSED existing output: {target}")
    pg13.pg08.check_baseline()
    with tempfile.TemporaryDirectory(prefix="pg14-build-") as scratch:
        previous = Path(scratch) / "pg13"
        pg13.prepare(previous)
        main = (previous / "behavior_pack/scripts/main.js").read_text(encoding="utf-8")
        old_version = 'const VERSION = "1.5.2-LAB-PG13";'
        if main.count(old_version) != 1:
            raise ValueError("PG14 REFUSED unexpected PG13 predecessor script")
        new = main.replace(old_version, 'const VERSION = "1.5.3-LAB-PG14";')
        overlay = OVERLAY.read_text(encoding="utf-8")
        for marker in ('const PG14_RESERVE =', 'const PG14_PROGRESS =',
                       'const PG14_SRC =', 'const PG14_DST =',
                       'rig.source.moveItem(0, 0, rig.dest)',
                       'name: "hartlogistics:custody" + action'):
            if marker not in overlay:
                raise ValueError("PG14 REFUSED missing exact-gate marker " + marker)
        # No item creation, no generic world search, no invasive components,
        # no global source/target inventory access, no q4/q5 mutation.
        for forbidden in ("new ItemStack(", "world.getPlayers(", "world.getAllPlayers(",
                          "player.getComponent(", "setItem(", "addItem(", "clearAll(",
                          "swapItems(", "transferItem(", "minecraft:block_entity",
                          "world.clearDynamicProperties(", "logisticsDirty ="):
            if forbidden in overlay:
                raise ValueError("PG14 REFUSED unsafe overlay pattern " + forbidden)
        new += "\n\n" + overlay.rstrip() + "\n"
        try:
            target.mkdir(parents=True)
            for kind in ("behavior_pack", "resource_pack"):
                shutil.copytree(previous / kind, target / kind)
            (target / "behavior_pack/scripts/main.js").write_text(
                new, encoding="utf-8"
            )
            for kind in ("behavior_pack", "resource_pack"):
                path = target / kind / "manifest.json"
                manifest = json.loads(path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 2]:
                    raise ValueError("PG14 REFUSED predecessor manifest version mismatch")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = (
                    "HartMods - Hart Logistics " +
                    ("BP" if kind == "behavior_pack" else "RP") +
                    " | PG14 ONE-COBBLE LAB ONLY"
                )
                manifest["header"]["description"] = (
                    "LAB-only one-item vanilla chest custody proof; not a game release."
                )
                for module in manifest.get("modules", []):
                    if module["version"] != [1, 5, 2]:
                        raise ValueError("PG14 REFUSED unexpected module version")
                    module["version"] = VERSION
                for dep in manifest.get("dependencies", []):
                    if dep.get("uuid"):
                        if dep["version"] != [1, 5, 2]:
                            raise ValueError("PG14 REFUSED BP/RP dependency version")
                        dep["version"] = VERSION
                path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG14 single-cobblestone custody candidate only.\n"
                "NOT approved for any server installation without owner LAB permission.\n"
                "No native MR, Q5, Bulk block, controller election or production transfer.\n",
                encoding="utf-8"
            )
        except Exception:
            shutil.rmtree(target)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink():
        raise ValueError("PG14 REFUSED linked build folder")
    if OUT.resolve(strict=False) != (ROOT / "build/pg14-lab").absolute():
        raise ValueError("PG14 REFUSED redirected output")
    prepare(OUT)
    print("PG14 OFFLINE BUILD:", OUT)
    print("No LAB/PROD/world files accessed; no install.")
