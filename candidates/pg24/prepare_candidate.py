"""PG24 1.5.7-LAB source-only derived ejected-entity receipt hardening.

Builds from exact PG23 1.5.6 and leaves original 72-file 1.4.1 immutable.
Never accesses live LAB, world or production; no gameplay installation here.
"""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg24-lab"
OVERLAY = ROOT / "candidates/pg24/entity_custody_overlay.js"
VERSION = [1, 5, 7]


def load_pg23():
    spec = importlib.util.spec_from_file_location(
        "pg24_pg23_source_builder", ROOT / "candidates/pg23/prepare_candidate.py")
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


pg23 = load_pg23()


def once(s: str, old: str, new: str, label: str) -> str:
    if s.count(old) != 1:
        raise ValueError("PG24 REFUSED uncertain source anchor " + label)
    return s.replace(old, new, 1)


def compile_patch(src: str, overlay: str) -> str:
    s = once(src, 'const VERSION = "1.5.6-LAB-PG23";',
             'const VERSION = "1.5.7-LAB-PG24";', "exact predecessor version")

    start = "function enqueueFromEjectedEntity(receiver, collector, entity, itemData, amount) {"
    stop = "\nfunction itemEntityStack(entity) {"
    if s.count(start) != 1 or s.count(stop) != 1:
        raise ValueError("PG24 REFUSED ambiguous entity ingress bounds")
    a, b = s.index(start), s.index(stop)
    if a >= b:
        raise ValueError("PG24 REFUSED reversed entity ingress bounds")
    body = s[a:b]
    body = once(body,
        """    saveQueueJournal(tx);
    persistQueueEntry(receiver, q, seq, entryAfter);""",
        """    saveQueueJournal(tx);
    if (world.getDynamicProperty(QUEUE_JOURNAL_KEY) !== JSON.stringify(tx)) {
        pg24EntityHold = true;
        pg20ReportHold("PG24 Q4 ejected entity intent readback mismatch: HOLD");
        throw new Error("PG24 Q4 ejected entity intent readback mismatch");
    }
    persistQueueEntry(receiver, q, seq, entryAfter);""",
        "Q4 intent readback before storage mutation")
    body = once(body, """    entity.remove();""",
                """    pg24VerifyEjectedCommit(receiver, q, tx, entity);""",
                "native entity removal with checked receipt")
    body = once(body, """    saveQueueJournal(undefined);
    return amount;""",
                """    pg24ClearVerifiedEntityIntent();
    return amount;""",
                "bounded entity journal completion")
    if "entity.remove();" in body:
        raise ValueError("PG24 REFUSED leftover unchecked entity removal")
    s = s[:a] + body + s[b:]

    # An entity_enqueue recovered from a previous save has no trusted writer
    # witness: the entity may have been picked up/rolled back/destroyed, and
    # Q4 queue metadata may be a different persistence cut. HOLD *before*
    # the old journalQueueState classifier can repair queue meta or remove.
    s = once(s, "function recoverQueueJournal() {",
        """function recoverQueueJournal() {
    if (pg24PreservePendingEntityJournal()) return;""",
        "recovered entity journal HOLD before any physical/meta mutation")

    # Legacy and new script writers must obey the same process-local HOLD.
    s = once(s, """    if (pg23LocalHold) return false;""",
        """    if (pg23LocalHold || pg24EntityHold) return false;""",
        "shared cooperative Hart custody pause")

    forbidden = ("new ItemStack(", "setItem(", "transferItem(",
                 "world.clearDynamicProperties(", "world.getAllPlayers(",
                 "world.spawnEntity(", "entity.kill(")
    if any(x in overlay for x in forbidden):
        raise ValueError("PG24 REFUSED overlay uses unauthorized physical mutation")
    for marker in (
        "function pg24PreservePendingEntityJournal()",
        "function pg24VerifyEjectedCommit(receiver, q, tx, entity)",
        "function pg24ClearVerifiedEntityIntent()",
        "entity.remove();",
        "readQueueEntry(receiver, q, seq, true)",
        "world.getDynamicProperty(queueDefinitionKey(receiver, entry.defId))",
    ):
        if marker not in overlay:
            raise ValueError("PG24 REFUSED missing overlay proof " + marker)
    for marker in (
        "pg23CompactSourceHopper(src, sourceBlock)",
        "function pg20MoveOpaqueNative(",
        "function pg08CommitLink(",
        "function pg23TransportMayRun()",
        "function recoverJournal()",
        "function recoverQueueJournal()",
        "function enqueueFromSource(",
        "function dequeueToReceiver(",
    ):
        if marker not in s:
            raise ValueError("PG24 REFUSED predecessor lost " + marker)
    for old in ("hartlogistics:shadowbegin", "hartlogistics:cutpre",
                "const PG13_A", "const PG14_RESERVE", "const PG15_KEY",
                "minecraft:block_entity.container"):
        if old in s + overlay:
            raise ValueError("PG24 REFUSED obsolete experiment or diagnostic")
    return s + "\n\n" + overlay.rstrip() + "\n"


def prepare(target: Path) -> None:
    target = target.resolve(strict=False)
    if target.exists():
        raise FileExistsError("PG24 REFUSED existing output: " + str(target))
    with tempfile.TemporaryDirectory(prefix="pg24-derive-") as temp:
        previous = Path(temp) / "pg23"
        pg23.prepare(previous)
        prev_main = (previous / "behavior_pack/scripts/main.js").read_text(encoding="utf-8")
        source = compile_patch(prev_main, OVERLAY.read_text(encoding="utf-8"))
        try:
            target.mkdir(parents=True)
            for kind in ("behavior_pack", "resource_pack"):
                shutil.copytree(previous / kind, target / kind)
            (target / "behavior_pack/scripts/main.js").write_text(
                source, encoding="utf-8")
            for kind in ("behavior_pack", "resource_pack"):
                path = target / kind / "manifest.json"
                manifest = json.loads(path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 6]:
                    raise ValueError("PG24 REFUSED unexpected PG23 predecessor")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = (
                    "HartMods - Hart Logistics " +
                    ("BP" if kind == "behavior_pack" else "RP") +
                    " | PG24 ENTITY Q4 CUSTODY LAB ONLY")
                manifest["header"]["description"] = (
                    "Derived LAB-only Q4 ejected-item readback and no automatic "
                    "entity_enqueue recovery; not a crash-atomic custody claim.")
                for module in manifest.get("modules", []):
                    if module["version"] != [1, 5, 6]:
                        raise ValueError("PG24 REFUSED module predecessor version")
                    module["version"] = VERSION
                for dep in manifest.get("dependencies", []):
                    if dep.get("uuid"):
                        if dep["version"] != [1, 5, 6]:
                            raise ValueError("PG24 REFUSED mixed predecessor dependency")
                        dep["version"] = VERSION
                path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG24 1.5.7 LAB test candidate; no implicit deployment.\n"
                "Normal ejection to Q4 uses immediate intent/page/metadata readback.\n"
                "An unresolved recovered entity_enqueue Q4 journal stays HOLD, "
                "no automatic item entity removal or journal clear.\n"
                "No guaranteed save atomicity, foreign writer exclusion, "
                "Q5/Bulk, experiments, cheats or production approval.\n",
                encoding="utf-8")
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink():
        raise ValueError("PG24 REFUSED redirected build tree")
    if OUT.resolve(strict=False) != (ROOT / "build/pg24-lab").absolute():
        raise ValueError("PG24 REFUSED unexpected build path")
    prepare(OUT)
    print("PG24 SOURCE PASS:", OUT)
    print("No LAB, world, other-mod, or production files accessed.")
