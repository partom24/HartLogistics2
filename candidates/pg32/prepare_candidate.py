"""PG32 bounded temporary no-throw beforeEvent cancellation LAB diagnostic.

Strict exact-PG27 derivation; no migration, persistent probe key, Q4 debit or
item/custody writer. Never build over an existing output or deploy implicitly.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg32-lab"
VERSION = [1, 5, 14]
TAG = "TEMP_TEST:PG32-NOTHROW-BEFORE-EVENT"
ANCHOR = "world.beforeEvents.playerInteractWithBlock.subscribe(ev => {"
GUARD = "\n    if (pg32CancelBeforeInteract(ev)) return; // PG32 TEMP TEST ONLY\n"

def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ValueError("PG32 REFUSED missing exact PG27 builder")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

pg27 = load(ROOT / "candidates/pg27/prepare_candidate.py", "pg32_exact_pg27")

def once(source, before, after):
    if source.count(before) != 1:
        raise ValueError("PG32 REFUSED changed exact PG27 source anchor: " + before[:85])
    return source.replace(before, after, 1)

def weave(source, overlay):
    if TAG not in overlay or overlay.count("function pg32CancelBeforeInteract(ev)") != 1:
        raise ValueError("PG32 REFUSED missing temporary diagnostic tag/handler")
    if overlay.count("ev.cancel = true;") != 1 or overlay.count(
        'ev.block?.typeId !== "hartsorter:collector"') != 1:
        raise ValueError("PG32 REFUSED event target or cancellation changed")
    if overlay.count("cheatsRequired: false") != 1 or overlay.count(
        "CommandPermissionLevel.GameDirectors") != 1:
        raise ValueError("PG32 REFUSED permission/cheat boundary changed")
    for forbidden in ("setDynamicProperty(", "setItem(", "moveItem(", "transferItem(",
                      "spawnItem(", "saveJournal(", "saveQueueJournal(",
                      "loadReceiverQueue(", "new ItemStack(", "world.sendMessage("):
        if forbidden in overlay:
            raise ValueError("PG32 REFUSED unexpected world or custody effect: " + forbidden)
    changed = once(source, ANCHOR, ANCHOR + GUARD)
    return changed.rstrip() + "\n\n" + overlay.rstrip() + "\n"

def prepare(target):
    target = Path(target).resolve(strict=False)
    if target.exists():
        raise FileExistsError("PG32 REFUSED existing output: " + str(target))
    with tempfile.TemporaryDirectory(prefix="pg32-exact-pg27-") as td:
        old = Path(td) / "pg27"
        pg27.prepare(old)
        try:
            target.mkdir(parents=True)
            for pack in ("behavior_pack", "resource_pack"):
                shutil.copytree(old / pack, target / pack)
                path = target / pack / "manifest.json"
                manifest = json.loads(path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 10]:
                    raise ValueError("PG32 REFUSED predecessor version")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = (
                    "HartMods - Hart Logistics " +
                    ("BP" if pack == "behavior_pack" else "RP") +
                    " | PG32 ONE-SHOT BEFORE EVENT LAB ONLY"
                )
                manifest["header"]["description"] = (
                    "Temporary single-owner Collector beforeEvent cancellation; no Q5 writes. LAB ONLY."
                )
                for mod in manifest["modules"]:
                    if mod["version"] != [1, 5, 10]:
                        raise ValueError("PG32 REFUSED predecessor module version")
                    mod["version"] = VERSION
                for dependency in manifest.get("dependencies", []):
                    if dependency.get("uuid"):
                        if dependency["version"] != [1, 5, 10]:
                            raise ValueError("PG32 REFUSED predecessor pack dependency")
                        dependency["version"] = VERSION
                path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

            path = target / "behavior_pack/scripts/main.js"
            old_js = path.read_text(encoding="utf-8")
            old_js = once(
                old_js, 'const VERSION = "1.5.10-LAB-PG27";',
                'const VERSION = "1.5.14-LAB-PG32-NOTHROW-BEFORE-EVENT";'
            )
            overlay = (ROOT / "candidates/pg32/event_cancel_overlay.js").read_text(encoding="utf-8")
            path.write_text(weave(old_js, overlay), encoding="utf-8")
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG32 one-shot before-event LAB test ONLY. Never install on production.\n"
                "Three temporary operator commands; no Q4, journal, inventory, block or Q5 writer.\n"
                "Original PG27 behavior is unchanged unless operator arms a single Collector click.\n"
                "Rollback to exact PG27 and close this temporary branch after owner evidence.\n",
                encoding="utf-8"
            )
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise

if __name__ == "__main__":
    if (ROOT / "build").is_symlink() or OUT.resolve(strict=False) != OUT.absolute():
        raise ValueError("PG32 REFUSED redirected build output")
    prepare(OUT)
    print("PG32 SOURCE PASS:", OUT)
    print("No LAB/PROD/world files accessed.")
