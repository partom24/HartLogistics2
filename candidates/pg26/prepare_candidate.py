"""PG26 1.5.9 LAB ordinary Transporter input; original 1.4.1 stays immutable."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/"build/pg26-lab"
OVERLAY = ROOT/"candidates/pg26/transporter_input.js"
VERSION = [1,5,9]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pg25 = load(ROOT/"candidates/pg25/prepare_candidate.py", "pg26_pg25_predecessor")
assets = load(ROOT/"candidates/pg26/transporter_assets.py", "pg26_original_pipe_assets")


def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError("PG26 REFUSED uncertain source anchor: "+old[:80])
    return source.replace(old, new, 1)


def compile_patch(source, overlay):
    source = once(source, 'const VERSION = "1.5.8-LAB-PG25";', 'const VERSION = "1.5.9-LAB-PG26";')
    start, end = "function processColumn(", "\nfunction processCollectorIngress("
    if source.count(start) != 1 or source.count(end) != 1:
        raise ValueError("PG26 REFUSED Sorter column bounds")
    a, b = source.index(start), source.index(end)
    column = source[a:b]
    column = once(column, '    if (!sourceBlock || sourceBlock.typeId !== "minecraft:hopper") return 0;',
        '''    if (!sourceBlock) return 0;
    const pg26Transport = sourceBlock.typeId === PG26_PIPE_ID;
    const pg26Input = pg26Transport ? pg26ReadTransportInput(col) : undefined;
    if (pg26Transport) {
        if (!pg26Input) return 0;
        sourceBlock = pg26Input.block;
    } else if (sourceBlock.typeId !== "minecraft:hopper") return 0;''')
    column = once(column, '    if (!pg23CompactSourceHopper(src, sourceBlock)) return 0;',
        '    if (!pg26Transport && !pg23CompactSourceHopper(src, sourceBlock)) return 0;')
    column = once(column, '    if (!pg23CompactSourceHopper(src, sourceBlock)) return movedTotal;',
        '    if (!pg26Transport && !pg23CompactSourceHopper(src, sourceBlock)) return movedTotal;')
    column = once(column, '    let columnBudget = Math.min(PER_COLUMN_BATCH, globalRemaining);',
        '    let columnBudget = Math.min(pg26Transport ? PG26_COLUMN_BATCH : PER_COLUMN_BATCH, globalRemaining);')
    column = once(column, '        if (!stack) continue;',
        '        if (!stack || (pg26Transport && !serializeQueueItem(stack))) continue;')
    column = once(column, '                if (!stack) break;',
        '''                if (!stack) break;
                if (pg26Transport && !serializeQueueItem(stack)) break;''')
    for writer in ("safeMovePartial",):
        column = once(column, "                        moved = "+writer+"(",
            "                        if (pg26Transport && !pg26TransportStillMatches(col, pg26Input)) return movedTotal;\n"
            "                        moved = "+writer+"(")
    column = once(column, '                if (dest.kind === "collector") {',
        '''                if (dest.kind === "collector") {
                    if (pg26Transport) break; // No new virtual Q4 custody path.''')
    column = once(column, '                    const slotInfo = findAcceptSlot(dest.container, stack);',
        '''                    if (pg26Transport && (!pg26SameChunk(col, dest.block) ||
                        dest.block.location.y >= col.source.y)) break;
                    const slotInfo = pg26Transport
                        ? pg26EmptyDestinationSlot(dest.container, stack)
                        : findAcceptSlot(dest.container, stack);''')
    column = once(column,
        '                    const want = Math.min(columnBudget, stack.amount, slotInfo.room);\n                    if (want <= 0) break;',
        '                    const want = Math.min(columnBudget, stack.amount, slotInfo.room);\n                    if (want <= 0 || (pg26Transport && want !== stack.amount)) break;')
    column = once(column, '                            slotInfo, want\n',
        '                            slotInfo, want, pg26Transport\n')
    # A real native source inventory is passed to existing Sorter writers.
    # No pipe inventory, ledger, new transfer implementation or auto retry.
    source = source[:a] + column + source[b:]
    for forbidden in ("setItem(", "moveItem(", "transferItem(", "new ItemStack(",
                      "setDynamicProperty(", "saveJournal(", "saveQueueJournal("):
        if forbidden in overlay:
            raise ValueError("PG26 REFUSED Transporter owns a separate physical writer")
    for marker in ("PG26_MAX_PIPES = 16", "function pg26ReadTransportInput(",
                   "function pg26TransportStillMatches(", 'container.size !== 27',
                   'sources.size !== 1 || ends.size !== 1'):
        if marker not in overlay:
            raise ValueError("PG26 REFUSED missing bounded input admission proof")
    return source + "\n\n" + overlay.rstrip() + "\n"


def prepare(target):
    target = Path(target).resolve(strict=False)
    if target.exists():
        raise FileExistsError("PG26 REFUSED existing output: "+str(target))
    with tempfile.TemporaryDirectory(prefix="pg26-derive-") as temp:
        old = Path(temp)/"pg25"
        pg25.prepare(old)
        main = Path("behavior_pack/scripts/main.js")
        source = compile_patch((old/main).read_text(encoding="utf-8"),OVERLAY.read_text(encoding="utf-8"))
        try:
            target.mkdir(parents=True)
            for kind in ("behavior_pack","resource_pack"):
                shutil.copytree(old/kind,target/kind)
                p = target/kind/"manifest.json"
                m = json.loads(p.read_text(encoding="utf-8"))
                if m["header"]["version"] != [1,5,8]:
                    raise ValueError("PG26 REFUSED predecessor version")
                m["header"]["version"] = VERSION
                m["header"]["name"] = "HartMods - Hart Logistics "+("BP" if kind=="behavior_pack" else "RP")+" | PG26 TRANSPORTER LAB ONLY"
                m["header"]["description"] = "Bounded ordinary single-source/column Transporter input. No Bulk/Q5/MR storage or crash-atomic claim."
                for module in m.get("modules",[]):
                    if module["version"] != [1,5,8]:
                        raise ValueError("PG26 REFUSED module predecessor")
                    module["version"] = VERSION
                for dep in m.get("dependencies",[]):
                    if dep.get("uuid"):
                        if dep["version"] != [1,5,8]:
                            raise ValueError("PG26 REFUSED dependency predecessor")
                        dep["version"] = VERSION
                p.write_text(json.dumps(m,indent=2)+"\n",encoding="utf-8")
            (target/main).write_text(source,encoding="utf-8")
            assets.add_assets(target)
            (target/"NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG26 1.5.9 LAB candidate; no implicit deployment.\n"
                "Ordinary Transporter input only; maximum 16 pipes, one single chest/barrel, one Sorter column.\n"
                "Existing journal writers/recovery; no pipe storage, MR/Q5/Bulk/controller or atomic save claim.\n",encoding="utf-8")
        except Exception:
            shutil.rmtree(target,ignore_errors=True)
            raise


if __name__ == "__main__":
    if (ROOT/"build").is_symlink() or OUT.resolve(strict=False) != OUT.absolute():
        raise ValueError("PG26 REFUSED redirected build tree")
    prepare(OUT)
    print("PG26 SOURCE PASS:",OUT)
    print("No LAB/PROD/world files accessed.")
