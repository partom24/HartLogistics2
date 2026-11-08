"""Derive PG25 1.5.8 LAB Q4 recovery HOLD from exact PG24; never deploy."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg25-lab"
OVERLAY = ROOT / "candidates/pg25/queue_recovery_guard.js"
VERSION = [1, 5, 8]
spec = importlib.util.spec_from_file_location("pg25_predecessor", ROOT / "candidates/pg24/prepare_candidate.py")
pg24 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg24)


def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError("PG25 REFUSED uncertain source anchor: " + old[:70])
    return source.replace(old, new, 1)


def compile_patch(source, overlay):
    source = once(source, 'const VERSION = "1.5.7-LAB-PG24";', 'const VERSION = "1.5.8-LAB-PG25";')
    # Retire the old recovery-only metadata classifier and physical replay
    # branches. Normal enqueue/dequeue implementations remain byte-identical.
    start = "function journalQueueState("
    end = "function enchantments("
    if source.count(start) != 1 or source.count(end) != 1:
        raise ValueError("PG25 REFUSED recovery bounds")
    a, b = source.index(start), source.index(end)
    if a >= b:
        raise ValueError("PG25 REFUSED reversed recovery bounds")
    source = source[:a] + (
        "function recoverQueueJournal() {\n"
        "    pg25PreservePendingQueueJournal();\n}\n\n"
    ) + source[b:]
    # PG24's entity-only recovery gate is superseded by the common raw-Q4 gate.
    a = source.index("function pg24PreservePendingEntityJournal() {")
    b = source.index("function pg24VerifyEjectedCommit(", a)
    source = source[:a] + source[b:]
    source = once(source, "if (pg23LocalHold || pg24EntityHold) return false;",
                  "if (pg23LocalHold || pg24EntityHold || pg25QueueHold) return false;")
    source = once(source, "function recoverJournal() {",
                  "function recoverJournal() {\n    if (pg25QueueHold) return;")
    # Menus and block inspection can also invoke queue loading. Prevent those
    # callers from migrating/cleaning evidence before the scheduler sees HOLD.
    source = once(source, "function loadReceiverQueue(receiver, force=false) {",
                  "function loadReceiverQueue(receiver, force=false) {\n"
                  "    if (pg25PreservePendingQueueJournal())\n"
                  "        throw new Error(\"PG25 Q4 HOLD: queue loading/migration deferred pending audit\");")
    source = once(source, "function schedulerTick() {\n    if (!ready) return;",
                  "function schedulerTick() {\n    if (!ready || !pg23TransportMayRun()) return;")
    source = once(source, "    recoverQueueJournal();\n    if (getQueueJournal()) return;",
                  "    recoverQueueJournal();\n    if (!pg23TransportMayRun()) return;")
    # Do not migrate or clean up old queue properties before preserving a
    # pending receipt on startup. Diagnostics uses registry counts read-only.
    start = "    migrateLegacyCollectorsIfNeeded();\n"
    end = "\n    recoverJournal();\n    recoverQueueJournal();"
    if source.count(start) != 1 or source.count(end) != 1:
        raise ValueError("PG25 REFUSED startup anchors")
    a, b = source.index(start), source.index(end)
    block = source[a:b]
    source = source[:a] + "    if (!pg25PreservePendingQueueJournal()) {\n" + (
        "\n".join("    " + line if line else "" for line in block.splitlines())
    ) + "\n    }\n" + source[b:]
    source = once(source, 'queueJournalPending: !!world.getDynamicProperty(QUEUE_JOURNAL_KEY)',
                  'queueJournalPending: pg25PreservePendingQueueJournal()')
    source = once(source,
                  '${s.queueJournalPending ? "PENDING" : "clear"}',
                  '${s.queueJournalPending ? "HOLD (audit required)" : "clear"}')
    for forbidden in ("setDynamicProperty(", "setItem(", "moveItem(", "new ItemStack(",
                      "saveQueueJournal(", "clearDynamicProperties("):
        if forbidden in overlay:
            raise ValueError("PG25 REFUSED mutating recovery overlay")
    for required in ("let pg25QueueHold = false;", "function pg25PreservePendingQueueJournal()",
                     "=== undefined", "pg25QueueHold = true;", "[PG25] Q4 HOLD:"):
        if required not in overlay:
            raise ValueError("PG25 REFUSED missing guard proof")
    return source + "\n\n" + overlay.rstrip() + "\n"


def prepare(target):
    target = Path(target).resolve(strict=False)
    if target.exists():
        raise FileExistsError("PG25 REFUSED existing output: " + str(target))
    with tempfile.TemporaryDirectory(prefix="pg25-derive-") as temp:
        previous = Path(temp) / "pg24"
        pg24.prepare(previous)
        main = Path("behavior_pack/scripts/main.js")
        source = compile_patch((previous / main).read_text(encoding="utf-8"), OVERLAY.read_text(encoding="utf-8"))
        try:
            target.mkdir(parents=True)
            for kind in ("behavior_pack", "resource_pack"):
                shutil.copytree(previous / kind, target / kind)
                path = target / kind / "manifest.json"
                manifest = json.loads(path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 7]:
                    raise ValueError("PG25 REFUSED predecessor version")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = "HartMods - Hart Logistics " + (
                    "BP" if kind == "behavior_pack" else "RP") + " | PG25 Q4 RECOVERY HOLD LAB ONLY"
                manifest["header"]["description"] = "LAB-only Q4 pending receipt preservation; no automatic recovery or crash-atomic claim."
                for module in manifest.get("modules", []):
                    if module["version"] != [1, 5, 7]:
                        raise ValueError("PG25 REFUSED module predecessor")
                    module["version"] = VERSION
                for dep in manifest.get("dependencies", []):
                    if dep.get("uuid"):
                        if dep["version"] != [1, 5, 7]:
                            raise ValueError("PG25 REFUSED dependency predecessor")
                        dep["version"] = VERSION
                path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            (target / main).write_text(source, encoding="utf-8")
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG25 1.5.8 LAB candidate; no implicit deployment.\n"
                "Any pending Q4 receipt or journal read failure holds all Hart routing.\n"
                "No automatic receipt clear, inventory replay or queue repair.\n"
                "No new keys, experiments, crash-atomic guarantee or production approval.\n", encoding="utf-8")
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink() or OUT.resolve(strict=False) != OUT.absolute():
        raise ValueError("PG25 REFUSED redirected build tree")
    prepare(OUT)
    print("PG25 SOURCE PASS:", OUT)
    print("No LAB/PROD/world files accessed.")
