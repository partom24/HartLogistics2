"""Build PG15 1.5.4-LAB deliberate interrupted-custody candidate from PG14.

OFFLINE BY DEFAULT. Original 72 files, PG08 menus, PG13 shadow, PG14
settled custody routines copied intact, only derived script/manifests changed.
No user server or world access.
"""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg15-lab"
VERSION = [1, 5, 4]
OVERLAY = ROOT / "candidates/pg15/interrupted_overlay.js"


def load_pg14():
    path = ROOT / "candidates/pg14/prepare_candidate.py"
    spec = importlib.util.spec_from_file_location("pg15_pg14_builder", path)
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


pg14 = load_pg14()


def prepare(target: Path) -> None:
    target = target.resolve(strict=False)
    if target.exists():
        raise FileExistsError(f"PG15 REFUSED existing output: {target}")
    pg14.pg13.pg08.check_baseline()
    with tempfile.TemporaryDirectory(prefix="pg15-build-") as temp:
        previous = Path(temp) / "pg14"
        pg14.prepare(previous)
        main = (previous / "behavior_pack/scripts/main.js").read_text(encoding="utf-8")
        original_version = 'const VERSION = "1.5.3-LAB-PG14";'
        if main.count(original_version) != 1:
            raise ValueError("PG15 REFUSED unrecognized PG14 script")
        overlay = OVERLAY.read_text(encoding="utf-8")
        for marker in ('const PG15_KEY = "hartlogistics:pg15_intent_cut_v1"',
                       'rig.source.moveItem(0, 0, rig.dest)',
                       'name: "hartlogistics:cut" + action',
                       'if (pg14Read().state !== "EMPTY")',
                       'pg15Audited = null'):
            if marker not in overlay:
                raise ValueError("PG15 REFUSED missing source safety contract " + marker)
        # Nothing may manufacture/alter items except the one exact already
        # accepted native Container.moveItem A slot0 -> B slot0 call.
        for forbidden in ("new ItemStack(", "setItem(", "addItem(", "clearAll(",
                          "swapItems(", "transferItem(", "world.getPlayers(",
                          "world.getAllPlayers(", "world.clearDynamicProperties(",
                          "logisticsDirty =", "minecraft:block_entity"):
            if forbidden in overlay:
                raise ValueError("PG15 REFUSED unsafe source pattern " + forbidden)
        new_main = main.replace(original_version, 'const VERSION = "1.5.4-LAB-PG15";')
        new_main += "\n\n" + overlay.rstrip() + "\n"
        try:
            target.mkdir(parents=True)
            for kind in ("behavior_pack", "resource_pack"):
                shutil.copytree(previous / kind, target / kind)
            (target / "behavior_pack/scripts/main.js").write_text(
                new_main, encoding="utf-8"
            )
            for kind in ("behavior_pack", "resource_pack"):
                path = target / kind / "manifest.json"
                manifest = json.loads(path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 3]:
                    raise ValueError("PG15 REFUSED unexpected PG14 predecessor version")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = (
                    "HartMods - Hart Logistics " +
                    ("BP" if kind == "behavior_pack" else "RP") +
                    " | PG15 CUT LAB ONLY"
                )
                manifest["header"]["description"] = (
                    "LAB-only deterministic interrupted handoff and HOLD proof, "
                    "not a production release."
                )
                for mod in manifest.get("modules", []):
                    if mod["version"] != [1, 5, 3]:
                        raise ValueError("PG15 REFUSED mixed module versions")
                    mod["version"] = VERSION
                for dep in manifest.get("dependencies", []):
                    if "uuid" in dep:
                        if dep["version"] != [1, 5, 3]:
                            raise ValueError("PG15 REFUSED mixed pack dependencies")
                        dep["version"] = VERSION
                path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG15 isolated interrupted-handoff LAB proof only.\n"
                "No owner LAB install permission implicit in candidate build.\n"
                "Preserve 1.4.1, unrelated packs, PG14 source and all backups.\n",
                encoding="utf-8"
            )
        except Exception:
            shutil.rmtree(target)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink():
        raise ValueError("PG15 REFUSED linked build folder")
    if OUT.resolve(strict=False) != (ROOT / "build/pg15-lab").absolute():
        raise ValueError("PG15 REFUSED redirected build output")
    prepare(OUT)
    print("PG15 SOURCE PASS:", OUT)
    print("No LAB/PROD/world files accessed; no install.")
