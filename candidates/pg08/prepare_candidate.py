"""Prepare an OFFLINE PG-08 LAB candidate. Never installs, registers or runs BDS.

CLI output is fixed to build/pg08-lab, refuses overwrite, and verifies all
original imported 1.4.1 BP/RP SHA-256 hashes before copying.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "addon"
OVERLAY = ROOT / "candidates/pg08/menu_overlay.js"
OUT = ROOT / "build/pg08-lab"
VERSION = [1, 5, 1]


def require_once(source: str, needle: str, label: str) -> None:
    if source.count(needle) != 1:
        raise ValueError(f"PG08 REFUSED unexpected {label} source anchor")


def check_baseline() -> int:
    hashes = json.loads((ROOT / "BASELINE_HASHES.json").read_text(encoding="utf-8"))["files"]
    originals = {key: expected for key, expected in hashes.items()
                 if key.startswith("addon/behavior_pack/") or
                    key.startswith("addon/resource_pack/")}
    if len(originals) != 72:
        raise ValueError("PG08 REFUSED baseline inventory is not 72 files")
    for relative, expected in originals.items():
        source = ROOT / relative
        if source.is_symlink() or not source.is_file():
            raise ValueError(f"PG08 REFUSED missing/linked baseline {relative}")
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if digest != expected:
            raise ValueError(f"PG08 REFUSED modified baseline {relative}")
    return len(originals)


def compile_main(original: str, overlay: str) -> str:
    first = "function selectCollector(player, block) {"
    last = "function migrateLegacyCollectorsIfNeeded() {"
    place_old = '''            pendingCollectorByPlayer.set(ev.player.id, e.id);
            ev.player.sendMessage("§b[Collector] Placed and selected. Interact with a Hart Receiver to complete the link.");'''
    place_new = '''            ev.player.sendMessage("§b[Collector] Placed. Interact with this Collector to open its link menu.");'''
    receiver_old = '''        ev.player?.sendMessage("§6[Receiver] Placed. Select a Collector, then interact with this block to link it.");'''
    receiver_new = '''        ev.player?.sendMessage("§6[Receiver] Placed. Use the Collector menu to select and confirm linking.");'''
    ui_anchor = 'const VERSION = "1.4.1";'
    for name, needle in (("link start", first), ("link end", last),
                         ("placement selector", place_old), ("receiver placement", receiver_old),
                         ("version", ui_anchor)):
        require_once(original, needle, name)
    start = original.index(first)
    end = original.index(last, start)
    original = original[:start] + overlay.rstrip() + "\n\n" + original[end:]
    original = original.replace(place_old, place_new, 1)
    original = original.replace(receiver_old, receiver_new, 1)
    original = original.replace(
        ui_anchor,
        'import { ActionFormData, MessageFormData } from "@minecraft/server-ui";\n'
        'const VERSION = "1.5.1-LAB-PG08";',
        1)
    return original


def prepare(target: Path) -> None:
    # Safety for CLI and test usage: never write over existing content.
    target = target.resolve(strict=False)
    if target.exists():
        raise FileExistsError(f"PG08 REFUSED output already exists: {target}")
    count = check_baseline()
    original = (BASE / "behavior_pack/scripts/main.js").read_text(encoding="utf-8")
    overlay = OVERLAY.read_text(encoding="utf-8")
    compiled = compile_main(original, overlay)
    try:
        target.mkdir(parents=True)
        shutil.copytree(BASE / "behavior_pack", target / "behavior_pack")
        shutil.copytree(BASE / "resource_pack", target / "resource_pack")
        (target / "behavior_pack/scripts/main.js").write_text(compiled, encoding="utf-8")
        for kind in ("behavior_pack", "resource_pack"):
            path = target / kind / "manifest.json"
            manifest = json.loads(path.read_text(encoding="utf-8"))
            manifest["header"]["version"] = VERSION
            manifest["header"]["name"] += " | PG08 LAB ONLY"
            manifest["header"]["description"] = "Unreleased PG08 menu candidate; NOT for production."
            for module in manifest.get("modules", []):
                module["version"] = VERSION
            for dep in manifest.get("dependencies", []):
                if dep.get("uuid"):
                    dep["version"] = VERSION
            if kind == "behavior_pack":
                deps = manifest["dependencies"]
                if any(d.get("module_name") == "@minecraft/server-ui" for d in deps):
                    raise ValueError("PG08 REFUSED unexpected existing server-ui dependency")
                deps.append({"module_name": "@minecraft/server-ui", "version": "2.2.0"})
            path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
            "PG08 offline candidate; do not install, publish or apply to LAB/PROD.\n"
            "Base: unchanged Hart Logistics 1.4.1, checked " + str(count) + " SHA256 files.\n"
            "Version 1.5.1 is a candidate-only placeholder, NOT release approval.\n"
            "LAB source/world migration + failed 1.5.0 compatibility must be reviewed first.\n",
            encoding="utf-8")
    except Exception:
        # Clean only the exclusively created output on a failed build.
        shutil.rmtree(target)
        raise


if __name__ == "__main__":
    # Never follow a redirected build/ folder into a server or unrelated path.
    if (ROOT / "build").is_symlink():
        raise ValueError("PG08 REFUSED linked build directory")
    if OUT.resolve(strict=False) != (ROOT / "build/pg08-lab").absolute():
        raise ValueError("PG08 REFUSED redirected candidate output")
    prepare(OUT)
    print("PG08 OFFLINE BUILD PREPARED:", OUT)
    print("No LAB, PROD or world files accessed.")
