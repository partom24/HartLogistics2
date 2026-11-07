"""Build isolated PG13 LAB shadow-journal candidate from protected 1.4.1 + PG08.

Source-only by default: no server reads/writes, no world/block/item changes.
PG13 appends four no-cheat operator commands to the already accepted menu code.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg13-lab"
OVERLAY = ROOT / "candidates/pg13/shadow_overlay.js"
VERSION = [1, 5, 2]


def load_pg08():
    path = ROOT / "candidates/pg08/prepare_candidate.py"
    spec = importlib.util.spec_from_file_location("pg13_source_pg08", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg08 = load_pg08()


def prepare(target: Path) -> None:
    target = target.resolve(strict=False)
    if target.exists():
        raise FileExistsError(f"PG13 REFUSED existing output {target}")
    pg08.check_baseline()
    # Never modify/reuse an already installed or prior generated PG08 tree.
    with tempfile.TemporaryDirectory(prefix="pg13-build-") as temp:
        original = Path(temp) / "pg08"
        pg08.prepare(original)
        baseline_js = (original / "behavior_pack/scripts/main.js").read_text(encoding="utf-8")
        old = 'const VERSION = "1.5.1-LAB-PG08";'
        if baseline_js.count(old) != 1:
            raise ValueError("PG13 REFUSED incompatible accepted PG08 main.js")
        overlay = OVERLAY.read_text(encoding="utf-8")
        for marker in ("const PG13_A =", "const PG13_B =",
                       'name: "hartlogistics:shadow" + action',
                       "system.beforeEvents.startup.subscribe"):
            if marker not in overlay:
                raise ValueError(f"PG13 REFUSED shadow overlay marker {marker}")
        if "minecraft:inventory" in overlay or "ItemStack" in overlay or \
           "world.getPlayers()" in overlay:
            raise ValueError("PG13 REFUSED inventory/access-others scope")
        compiled = baseline_js.replace(old, 'const VERSION = "1.5.2-LAB-PG13";')
        compiled += "\n\n" + overlay.rstrip() + "\n"
        try:
            target.mkdir(parents=True)
            for kind in ("behavior_pack", "resource_pack"):
                shutil.copytree(original / kind, target / kind)
            (target / "behavior_pack/scripts/main.js").write_text(
                compiled, encoding="utf-8"
            )
            for kind in ("behavior_pack", "resource_pack"):
                manifest_file = target / kind / "manifest.json"
                manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 1]:
                    raise ValueError("PG13 REFUSED unexpected PG08 manifest")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = (
                    "HartMods - Hart Logistics " +
                    ("BP" if kind == "behavior_pack" else "RP") +
                    " | PG13 LAB SHADOW ONLY"
                )
                manifest["header"]["description"] = (
                    "LAB-only journal dynamic-property persistence test. "
                    "No new blocks, transfer or Q5 migration."
                )
                for module in manifest.get("modules", []):
                    if module["version"] != [1, 5, 1]:
                        raise ValueError("PG13 REFUSED mixed module version")
                    module["version"] = VERSION
                for dep in manifest.get("dependencies", []):
                    if dep.get("uuid"):
                        if dep["version"] != [1, 5, 1]:
                            raise ValueError("PG13 REFUSED unexpected RP dependency")
                        dep["version"] = VERSION
                manifest_file.write_text(
                    json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
                )
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG13 LAB-only candidate; no installation implied.\n"
                "Only two namespaced shadow world dynamic properties are written "
                "by explicit operator commands in the isolated room.\n"
                "NO physical items, inventories, Q5 or production accessed.\n",
                encoding="utf-8"
            )
        except Exception:
            shutil.rmtree(target)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink():
        raise ValueError("PG13 REFUSED linked build directory")
    if OUT.resolve(strict=False) != (ROOT / "build/pg13-lab").absolute():
        raise ValueError("PG13 REFUSED redirected build output")
    prepare(OUT)
    print("PG13 OFFLINE BUILD:", OUT)
    print("No LAB/PROD/world files accessed; no install.")
