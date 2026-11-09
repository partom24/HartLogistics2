"""PG30 exact-PG27-derived, stopped-LAB-only temporary property persistence probe.

No automatic world writes, migration or routing changes. Operator commands can
write ONLY two isolated PG30 test dynamic-property keys and remove them after
verification. This pack must NEVER be merged into permanent gameplay.
"""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg30-q5-property-probe"
VERSION = [1, 5, 12]
TAG = "TEMP_TEST:PG30-Q5-PERSISTENCE"
COMMANDS = ("q5pcheck", "q5pstart", "q5pfinish", "q5pclear")


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ValueError("PG30 REFUSED missing PG27 builder")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg27 = load(ROOT / "candidates/pg27/prepare_candidate.py", "pg30_exact_pg27")


def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError("PG30 REFUSED changed source anchor: " + old[:90])
    return source.replace(old, new, 1)


def audit_overlay(source):
    if TAG not in source:
        raise ValueError("PG30 REFUSED missing temporary test classification")
    for command in COMMANDS:
        if source.count('"hartlogistics:' + command + '"') != 1:
            raise ValueError("PG30 REFUSED changed operator command: " + command)
    for forbidden in ("setItem(", "moveItem(", "transferItem(",
                      "new ItemStack(", "runCommand(", "saveJournal(",
                      "saveQueueJournal(", "setWorldDynamic(", "spawnEntity(",
                      "spawnItem(", "clearDynamicProperties("):
        if forbidden in source:
            raise ValueError("PG30 REFUSED unsafe probe API: " + forbidden)
    if source.count("world.setDynamicProperty(") != 4:
        raise ValueError("PG30 REFUSED unexpected test property writers")
    if source.count("system.beforeEvents.startup.subscribe(") != 1:
        raise ValueError("PG30 REFUSED unexpected registration count")
    if "cheatsRequired: false" not in source or "CommandPermissionLevel.GameDirectors" not in source:
        raise ValueError("PG30 REFUSED permission/cheat policy changed")
    for forbidden in ("hartlogistics:q5_maintenance_marker_v1",
                      "hartlogistics:q5_maintenance_history_v1",
                      "hartsorter:q4", "hartsorter:queue_journal",
                      "hartsorter:journal"):
        if forbidden in source:
            raise ValueError("PG30 REFUSED any real maintenance/Q4 key access")
    for required in ("pg30_test_history_tmp_v1", "pg30_test_marker_tmp_v1",
                     "PG30_HISTORY_RAW", "PG30_MARKER_RAW",
                     "before.marker === PG30_MARKER_RAW",
                     "after.history !== undefined"):
        if required not in source:
            raise ValueError("PG30 REFUSED missing cleanup/readback guard")
    return True


def prepare(target):
    target = Path(target).resolve(strict=False)
    if target.exists():
        raise FileExistsError("PG30 REFUSED existing output: " + str(target))
    with tempfile.TemporaryDirectory(prefix="pg30-derive-pg27-") as td:
        old = Path(td) / "pg27"
        pg27.prepare(old)
        try:
            target.mkdir(parents=True)
            for pack in ("behavior_pack", "resource_pack"):
                shutil.copytree(old / pack, target / pack)
                manifest_path = target / pack / "manifest.json"
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 10]:
                    raise ValueError("PG30 REFUSED predecessor manifest version")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = (
                    "HartMods - Hart Logistics " +
                    ("BP" if pack == "behavior_pack" else "RP") +
                    " | PG30 TEMP Q5 PROPERTY LAB ONLY")
                manifest["header"]["description"] = (
                    "Temporary dual world-property persistence probe; no Q5 "
                    "authority, routing modification or automatic writes.")
                for module in manifest.get("modules", []):
                    if module["version"] != [1, 5, 10]:
                        raise ValueError("PG30 REFUSED module predecessor")
                    module["version"] = VERSION
                for dep in manifest.get("dependencies", []):
                    if dep.get("uuid"):
                        if dep["version"] != [1, 5, 10]:
                            raise ValueError("PG30 REFUSED pack dependency predecessor")
                        dep["version"] = VERSION
                manifest_path.write_text(
                    json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

            main = target / "behavior_pack/scripts/main.js"
            source = main.read_text(encoding="utf-8")
            source = once(source,
                          'const VERSION = "1.5.10-LAB-PG27";',
                          'const VERSION = "1.5.12-LAB-PG30-Q5-PROPERTY-PROBE";')
            overlay = (ROOT / "candidates/pg30/q5_property_probe_overlay.js").read_text(encoding="utf-8")
            audit_overlay(overlay)
            main.write_text(source.rstrip() + "\n\n" + overlay.rstrip() + "\n",
                            encoding="utf-8")
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG30 1.5.12 TEMP_TEST:PG30-Q5-PERSISTENCE LAB ONLY.\n"
                "Original PG27 routing, Q4 custody and resource assets unchanged.\n"
                "ONLY two isolated pg30_test_* dynamic property keys can be written\n"
                "under the four operator commands. Cleanup BEFORE rollback required.\n"
                "No production, experiments, global maintenance or Q5 cutover.\n",
                encoding="utf-8")
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink() or OUT.resolve(strict=False) != OUT.absolute():
        raise ValueError("PG30 REFUSED redirected build")
    prepare(OUT)
    print("PG30 SOURCE PASS:", OUT)
    print("No LAB/PROD/world files accessed.")
