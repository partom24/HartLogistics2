"""PG29 LAB-only Q4 read-only Q5 audit candidate. No migration/transfer writes."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg29-q5-readonly"
VERSION = [1, 5, 11]
TAG = "TEMP_TEST:PG29-Q5-AUDIT"


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg27 = load(ROOT / "candidates/pg27/prepare_candidate.py", "pg29_exact_pg27")

MODULES = (
    "ordinary_network_core",
    "q5_bucket_core",
    "q5_q4_readonly_snapshot",
    "q5_q4_read_adapter",
)


def once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise ValueError("PG29 REFUSED uncertain source anchor: " + old[:100])
    return source.replace(old, new, 1)


def prepare(target):
    target = Path(target).resolve(strict=False)
    if target.exists():
        raise FileExistsError("PG29 REFUSED existing output: " + str(target))
    with tempfile.TemporaryDirectory(prefix="pg29-exact-pg27-") as td:
        old = Path(td) / "pg27"
        pg27.prepare(old)
        try:
            target.mkdir(parents=True)
            for pack in ("behavior_pack", "resource_pack"):
                shutil.copytree(old / pack, target / pack)
                manifest_path = target / pack / "manifest.json"
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 10]:
                    raise ValueError("PG29 REFUSED predecessor version")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = (
                    "HartMods - Hart Logistics " + ("BP" if pack == "behavior_pack" else "RP")
                    + " | PG29 Q5 READ ONLY LAB TEST"
                )
                manifest["header"]["description"] = (
                    "Operator-only Q4 snapshot read; no Q5 storage/migration/physical writes. LAB ONLY."
                )
                for module in manifest.get("modules", []):
                    if module["version"] != [1, 5, 10]:
                        raise ValueError("PG29 REFUSED predecessor module")
                    module["version"] = VERSION
                for dep in manifest.get("dependencies", []):
                    if dep.get("uuid"):
                        if dep["version"] != [1, 5, 10]:
                            raise ValueError("PG29 REFUSED predecessor pack dependency")
                        dep["version"] = VERSION
                manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

            scripts = target / "behavior_pack/scripts"
            for name in MODULES:
                src = ROOT / "candidates/transport" / (name + ".mjs")
                body = src.read_text(encoding="utf-8")
                body = body.replace(".mjs'", ".js'").replace('.mjs"', '.js"')
                if ".mjs'" in body or '.mjs"' in body:
                    raise ValueError("PG29 REFUSED unported module import")
                for forbidden in ("setDynamicProperty(", "setItem(", "moveItem(",
                                  "transferItem(", "new ItemStack(", "clearDynamicProperties("):
                    if forbidden in body:
                        raise ValueError("PG29 REFUSED read-only Q5 module can mutate gameplay: " + name)
                (scripts / (name + ".js")).write_text(body, encoding="utf-8")

            overlay = (ROOT / "candidates/pg29/q5_audit_overlay.js").read_text(encoding="utf-8")
            if TAG not in overlay or overlay.count('name: "hartlogistics:q5audit"') != 1:
                raise ValueError("PG29 REFUSED absent tagged temporary command")
            for forbidden in ("setWorldDynamic(", "setItem(", "moveItem(",
                              "transferItem(", "saveQueueJournal(", "saveJournal("):
                if forbidden in overlay:
                    raise ValueError("PG29 REFUSED audit overlay has a physical or journal writer")
            main = scripts / "main.js"
            base = main.read_text(encoding="utf-8")
            base = once(base, 'const VERSION = "1.5.10-LAB-PG27";',
                        'const VERSION = "1.5.11-LAB-PG29-Q5-READONLY";')
            main.write_text(
                'import { sampleQ4WorldReadOnly } from "./q5_q4_read_adapter.js";\n'
                + base.rstrip() + "\n\n" + overlay.rstrip() + "\n",
                encoding="utf-8"
            )
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG29 1.5.11 Q5 read-only LAB test candidate, NOT installed or approved.\n"
                "One operator-only temporary q5audit command; original Q4 and PG27 routing unchanged.\n"
                "No migrations, new durable keys, item actions, experiments, production or releases.\n"
                "Remove temporary command and registration after LAB evidence/cleanup.\n",
                encoding="utf-8"
            )
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink() or OUT.resolve(strict=False) != OUT.absolute():
        raise ValueError("PG29 REFUSED redirected build output")
    prepare(OUT)
    print("PG29 SOURCE PASS:", OUT)
    print("No LAB/PROD/world files accessed.")
