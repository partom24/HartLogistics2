"""PG33 offline candidate: Receiver Q4 -> pipe -> Sorter using existing Q4 writer.

Builds the exact accepted PG27 predecessor. No LAB deployment pathway is
introduced until source/fault verification and owner test scope are reviewed.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg33-lab"
VERSION = [1, 5, 15]
OVERLAY = ROOT / "candidates/pg33/receiver_q4_input.js"

spec = importlib.util.spec_from_file_location(
    "pg33_pg27_predecessor", ROOT / "candidates/pg27/prepare_candidate.py"
)
pg27 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg27)


def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError("PG33 REFUSED uncertain exact source anchor: " + old[:90])
    return source.replace(old, new, 1)


def compile_patch(source, overlay):
    source = once(
        source, 'const VERSION = "1.5.10-LAB-PG27";',
        'const VERSION = "1.5.15-LAB-PG33";'
    )
    # Keep the PG26 barrel/chest path; only if that admission fails may the
    # independent Receiver-only graph attempt a Q4 head dequeue.
    source = once(
        source,
        "    if (pg26Transport) {\n        if (!pg26Input) return 0;",
        "    if (pg26Transport) {\n"
        "        if (!pg26Input) return pg33ProcessReceiverColumn(col, globalRemaining);"
    )

    # No new queue debit/physical writer. Extend the EXISTING Q4 dequeue
    # strictly for this opt-in path, leaving all legacy Hopper calls unchanged.
    begin = "function dequeueToReceiver(receiver, output, maxMove) {"
    end = "\nfunction recoverQueueJournal("
    if source.count(begin) != 1 or source.count(end) != 1:
        raise ValueError("PG33 REFUSED uncertain Q4 dequeue bounds")
    a, b = source.index(begin), source.index(end)
    body = source[a:b]
    body = once(body, begin,
                "function dequeueToReceiver(receiver, output, maxMove, options=undefined) {")
    body = once(
        body, "    const slotInfo = findAcceptSlot(output.container, item);",
        "    const slotInfo = options?.emptyOnly\n"
        "        ? pg26EmptyDestinationSlot(output.container, item)\n"
        "        : findAcceptSlot(output.container, item);"
    )
    body = once(
        body, "    if (!first) return 0;",
        """    if (!first) return 0;
    if (options?.expectedHead && (
        first.id !== options.expectedHead.id ||
        Number(first.amount) !== options.expectedHead.amount ||
        queueDataSignature(first.data) !== options.expectedHead.sig
    )) return 0;"""
    )
    body = once(
        body, "    saveQueueJournal(tx);",
        """    // The q4 head may have been changed before the final journal cutpoint.
    // Capture a matching head again, and never debit a different FIFO entry.
    if (options?.expectedHead) {
        const current = queueHeadEntry(receiver, q);
        if (!current || current.id !== options.expectedHead.id ||
            Number(current.amount) !== options.expectedHead.amount ||
            queueDataSignature(current.data) !== options.expectedHead.sig)
            return 0;
    }
    if (options?.revalidate && !options.revalidate()) return 0;
    saveQueueJournal(tx);"""
    )
    source = source[:a] + body + source[b:]

    # A pipe may display a connection to a Receiver while graph and journal
    # admission independently decide whether a transfer is permissible.
    source = once(
        source,
        'next.typeId === "minecraft:chest" || next.typeId === "minecraft:barrel");',
        'next.typeId === "minecraft:chest" || next.typeId === "minecraft:barrel" ||\n'
        '                next.typeId === RECEIVER_ID);'
    )
    for forbidden in ("setItem(", "moveItem(", "transferItem(", "new ItemStack(",
                      "saveQueueJournal(", "saveJournal(", "setDynamicProperty("):
        if forbidden in overlay:
            raise ValueError("PG33 REFUSED a second physical/queue writer")
    for required in ("PG33_RECEIVER_BATCH = 64", "pg33ReadReceiverInput(",
                     "pg33CommittedQ4Meta(", "pg33StillMatches(",
                     "pg33ProcessReceiverColumn(", "expectedHead:",
                     "dequeueToReceiver(", "receiverOutputHopper"):
        if required == "receiverOutputHopper":
            # Legacy writer remains the only Hopper output path, not invoked by
            # the alternate graph. Source verifies the actual direct-hop guard.
            if required not in source:
                raise ValueError("PG33 REFUSED missing legacy Hopper guard")
        elif required not in overlay:
            raise ValueError("PG33 REFUSED incomplete receiver source contract")
    return source + "\n\n" + overlay.rstrip() + "\n"


def prepare(target):
    target = Path(target).resolve(strict=False)
    if target.exists():
        raise FileExistsError("PG33 REFUSED existing output: " + str(target))
    with tempfile.TemporaryDirectory(prefix="pg33-derive-") as temp:
        predecessor = Path(temp) / "pg27"
        pg27.prepare(predecessor)
        try:
            target.mkdir(parents=True)
            for kind in ("behavior_pack", "resource_pack"):
                shutil.copytree(predecessor / kind, target / kind)
                path = target / kind / "manifest.json"
                manifest = json.loads(path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 10]:
                    raise ValueError("PG33 REFUSED predecessor manifest version")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = (
                    "HartMods - Hart Logistics " +
                    ("BP" if kind == "behavior_pack" else "RP") +
                    " | PG33 RECEIVER ROUTE OFFLINE CANDIDATE"
                )
                manifest["header"]["description"] = (
                    "Receiver Q4 -> Transporter -> Sorter source-only candidate; "
                    "not approved for LAB deployment."
                )
                for module in manifest["modules"]:
                    if module["version"] != [1, 5, 10]:
                        raise ValueError("PG33 REFUSED predecessor module")
                    module["version"] = VERSION
                for dependency in manifest.get("dependencies", []):
                    if dependency.get("uuid"):
                        if dependency["version"] != [1, 5, 10]:
                            raise ValueError("PG33 REFUSED predecessor dependency")
                        dependency["version"] = VERSION
                path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            path = target / "behavior_pack/scripts/main.js"
            source = path.read_text(encoding="utf-8")
            path.write_text(
                compile_patch(source, OVERLAY.read_text(encoding="utf-8")),
                encoding="utf-8"
            )
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG33 1.5.15 SOURCE/OFFLINE candidate only.\n"
                "No authorized LAB installer; Q4 -> pipe -> Sorter has no BDS acceptance.\n"
                "PG25 raw pending receipts HOLD; original 72-file 1.4.1 immutable.\n",
                encoding="utf-8"
            )
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink() or OUT.resolve(strict=False) != OUT.absolute():
        raise ValueError("PG33 REFUSED redirected build tree")
    prepare(OUT)
    print("PG33 SOURCE PASS:", OUT)
    print("No LAB/PROD/world files accessed.")
