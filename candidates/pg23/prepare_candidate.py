"""PG23 1.5.6-LAB candidate derived from exact PG20 plus one safety patch.

Owner-authorized candidate DEVELOPMENT ONLY. Does not run or modify Bedrock,
LAB worlds, production or original 72-file addon/ source. Completed PG13/14/15
diagnostics are still excluded by the original PG20 builder.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg23-lab"
OVERLAY = ROOT / "candidates/pg23/native_compaction_overlay.js"
VERSION = [1, 5, 6]


def load_pg20():
    spec = importlib.util.spec_from_file_location(
        "pg23_exact_pg20_builder", ROOT / "candidates/pg20/prepare_candidate.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg20 = load_pg20()


def once(s: str, old: str, new: str, label: str) -> str:
    if s.count(old) != 1:
        raise ValueError("PG23 REFUSED source anchor " + label)
    return s.replace(old, new, 1)


def compile_patch(source: str, overlay: str) -> str:
    s = once(source, 'const VERSION = "1.5.5-LAB-PG20";',
             'const VERSION = "1.5.6-LAB-PG23";', "PG20 predecessor")

    start = 'function compactSourceHopper(container) {'
    stop = 'function processColumn(col, globalRemaining) {'
    if s.count(start) != 1 or s.count(stop) != 1:
        raise ValueError("PG23 REFUSED uncertain old compaction function")
    a, b = s.index(start), s.index(stop)
    if a >= b:
        raise ValueError("PG23 REFUSED compaction body bounds")
    old_compaction = s[a:b]
    if (old_compaction.count("container.setItem(write, item)") != 1 or
            old_compaction.count("container.setItem(read, undefined)") != 1):
        raise ValueError("PG23 REFUSED unexpected original two-write path")
    s = s[:a] + s[b:]

    s = once(s, '''    compactSourceHopper(src);

    let movedTotal = 0;''',
             '''    if (!pg23CompactSourceHopper(src, sourceBlock)) return 0;

    let movedTotal = 0;''', "pre-sorter compaction gate")
    s = once(s, '''    compactSourceHopper(src);

    return movedTotal;''',
             '''    if (!pg23CompactSourceHopper(src, sourceBlock)) return movedTotal;

    return movedTotal;''', "post-sorter compaction gate")

    for name, args, fail in (
        ("processColumn", "col, globalRemaining", "0"),
        ("processCollectorIngress", "collector, globalRemaining", "0"),
        ("enqueueFromEjectedEntity", "receiver, collector, entity, itemData, amount", "0"),
        ("enqueueFromSource", "receiver, collector, source, srcSlot, move, itemData", "0"),
        ("dequeueToReceiver", "receiver, output, maxMove", "0"),
    ):
        signature = f"function {name}({args}) {{"
        s = once(s, signature, signature +
                 f"\n    if (!pg23TransportMayRun()) return {fail};",
                 "global gate " + name)

    s = once(s,
        "function safeMovePartial(src, srcBlock, srcSlot, dst, dstBlock, dstSlotInfo, amount, opaqueDirectOnly = false) {",
        """function safeMovePartial(src, srcBlock, srcSlot, dst, dstBlock, dstSlotInfo, amount, opaqueDirectOnly = false) {
    if (!pg23TransportMayRun()) return 0;""",
        "physical source admission")

    # Both recovery directions respect the other journal, including the legacy
    # branches capable of physical mutations/marker cleanup. If BOTH markers
    # are present an operator must inspect: neither engine may clear its own
    # marker while the other remains unresolved.
    s = once(s,
        "function recoverJournal() {",
        """function recoverJournal() {
    if (world.getDynamicProperty(QUEUE_JOURNAL_KEY) !== undefined) {
        pg20ReportHold("PG23 physical recovery paused by unresolved Q4 intent");
        return;
    }""", "queue-vs-physical recovery ordering")

    # Queue recovery can mutate Q4 + inventories. A pending physical intent
    # must not be bypassed by an independent recovery writer.
    s = once(s, "function recoverQueueJournal() {",
        """function recoverQueueJournal() {
    if (world.getDynamicProperty(JOURNAL_KEY) !== undefined) {
        pg20ReportHold("PG23 queued recovery paused by unresolved physical intent");
        return;
    }""", "physical-vs-queue recovery ordering")

    s = once(s,
        '''            : "unrecognized opaque journal; no automatic recovery");''',
        '''            : tx.opaqueTag === PG23_COMPACTION_JOURNAL
            ? "native Hopper slot compaction requires independent audit"
            : "unrecognized opaque journal; no automatic recovery");''',
        "PG23 opaque recovery HOLD classification")

    if any(x in overlay for x in (
        "new ItemStack(", "setItem(", "transferItem(",
        "world.clearDynamicProperties(", "world.getAllPlayers("
    )):
        raise ValueError("PG23 REFUSED overlay reconstructs/mutates via unsafe API")
    for marker in (
        'const PG23_COMPACTION_JOURNAL = "pg23-native-hopper-compaction-v1"',
        'container.moveItem(read, write, container);',
        'saveJournal(tx);',
        'saveJournal(undefined);',
        'pg23TransportMayRun()',
        'pg20InspectableNativeFingerprint(container.getItem(write))',
    ):
        if marker not in overlay:
            raise ValueError("PG23 REFUSED missing overlay marker: " + marker)

    if "compactSourceHopper(" in s:
        raise ValueError("PG23 REFUSED leftover unjournaled compaction")
    for marker in (
        "const PG20_OPAQUE_JOURNAL", "function pg20MoveOpaqueNative(",
        "function recoverJournal()", "function recoverQueueJournal()",
        "function pg08CommitLink(", "function processCollectorIngress("
    ):
        if marker not in s:
            raise ValueError("PG23 REFUSED missing preserved PG20 function " + marker)
    for old in ("const PG13_A", "const PG14_RESERVE", "const PG15_KEY",
                "hartlogistics:cutpre", "hartlogistics:shadowbegin",
                "minecraft:block_entity.container"):
        if old in s + overlay:
            raise ValueError("PG23 REFUSED obsolete diagnostic/experimental source")
    return s + "\n\n" + overlay.rstrip() + "\n"


def prepare(target: Path) -> None:
    target = target.resolve(strict=False)
    if target.exists():
        raise FileExistsError("PG23 REFUSED existing output: " + str(target))
    with tempfile.TemporaryDirectory(prefix="pg23-derive-") as temp:
        prev = Path(temp) / "pg20"
        pg20.prepare(prev)
        prev_source = (prev / "behavior_pack/scripts/main.js").read_text(encoding="utf-8")
        compiled = compile_patch(prev_source, OVERLAY.read_text(encoding="utf-8"))
        try:
            target.mkdir(parents=True)
            for kind in ("behavior_pack", "resource_pack"):
                shutil.copytree(prev / kind, target / kind)
            (target / "behavior_pack/scripts/main.js").write_text(compiled, encoding="utf-8")
            for kind in ("behavior_pack", "resource_pack"):
                path = target / kind / "manifest.json"
                manifest = json.loads(path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 5]:
                    raise ValueError("PG23 REFUSED unexpected PG20 predecessor")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = (
                    "HartMods - Hart Logistics " +
                    ("BP" if kind == "behavior_pack" else "RP") +
                    " | PG23 COMPACTION LAB ONLY"
                )
                manifest["header"]["description"] = (
                    "Derived LAB-only native Hopper compaction and global journal HOLD; "
                    "not a cross-save atomic custody claim."
                )
                for module in manifest.get("modules", []):
                    if module["version"] != [1, 5, 5]:
                        raise ValueError("PG23 REFUSED module version mismatch")
                    module["version"] = VERSION
                for dep in manifest.get("dependencies", []):
                    if dep.get("uuid"):
                        if dep["version"] != [1, 5, 5]:
                            raise ValueError("PG23 REFUSED BP/RP dep version")
                        dep["version"] = VERSION
                path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG23 1.5.6-LAB-PG23 derived test candidate only; owner installs deliberately.\n"
                "No experiments/cheats. Stop on any physical/Q4 journal HOLD.\n"
                "No crash-atomicity or exclusive physical custody claim.\n"
                "Frozen original 72 files unchanged. No PG13/14/15 temporary commands.\n",
                encoding="utf-8"
            )
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink():
        raise ValueError("PG23 REFUSED linked build directory")
    if OUT.resolve(strict=False) != (ROOT / "build/pg23-lab").absolute():
        raise ValueError("PG23 REFUSED redirected output")
    prepare(OUT)
    print("PG23 SOURCE PASS:", OUT)
    print("No LAB, PRODUCTION, other mod, or world files accessed.")
