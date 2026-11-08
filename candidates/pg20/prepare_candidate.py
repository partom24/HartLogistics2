"""PG20 1.5.5-LAB candidate from protected baseline + accepted PG08 UI.

The completed PG13/PG14/PG15 diagnostic overlays are deliberately NOT
shipped in this derived candidate. No Bedrock/world/LAB access or execution.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "build/pg20-lab"
OVERLAY = ROOT / "candidates/pg20/native_recovery_overlay.js"
VERSION = [1, 5, 5]


def load_pg08():
    spec = importlib.util.spec_from_file_location(
        "pg20_base_pg08_builder", ROOT / "candidates/pg08/prepare_candidate.py"
    )
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


pg08 = load_pg08()


def once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise ValueError(f"PG20 REFUSED unexpected source anchor for {label}")
    return text.replace(old, new, 1)


def between(text: str, before: str, after: str, replacement: str, label: str) -> str:
    if text.count(before) != 1 or text.count(after) != 1:
        raise ValueError(f"PG20 REFUSED ambiguous source bounds for {label}")
    begin = text.index(before)
    end = text.index(after, begin + len(before))
    if end <= begin:
        raise ValueError(f"PG20 REFUSED reversed source bounds for {label}")
    return text[:begin] + replacement + "\n\n" + text[end:]


def compile_patch(pg08_main: str, overlay: str) -> str:
    expected_version = 'const VERSION = "1.5.1-LAB-PG08";'
    updated = once(pg08_main, expected_version,
                   'const VERSION = "1.5.5-LAB-PG20";', "PG08 predecessor")

    old = '''function recoverJournal() {
    const tx = safeJsonParse(world.getDynamicProperty(JOURNAL_KEY), undefined);
    if (!tx) return;'''
    new = '''function recoverJournal() {
    const raw = world.getDynamicProperty(JOURNAL_KEY);
    if (raw === undefined) return;
    const tx = safeJsonParse(raw, undefined);
    if (!tx || typeof tx !== "object" || Array.isArray(tx) ||
        !tx.src || !tx.dst ||
        ![tx.src.x, tx.src.y, tx.src.z, tx.dst.x, tx.dst.y, tx.dst.z,
          tx.srcSlot, tx.dstSlot].every(Number.isSafeInteger)) {
        pg20ReportHold("invalid legacy/opaque journal; no item operation");
        return;
    }
    if (tx.opaqueTag !== undefined) {
        pg20ReportHold(tx.opaqueTag === PG20_OPAQUE_JOURNAL
            ? "native opaque handoff requires independent physical audit"
            : "unrecognized opaque journal; no automatic recovery");
        return;
    }'''
    updated = once(updated, old, new, "recovery marker validation")

    # Historical direct-only MR transactions may have already left the source.
    # A filtered/partial payload is not an authoritative native item witness.
    updated = between(updated,
        "        if (srcAfter && dstBefore) {",
        "        if (srcAfter && dstAfter) {",
        '''        if (srcAfter && dstBefore) {
            pg20ReportHold("legacy debited source: no lossless serialized native receipt");
            return;
        }''',
        "legacy destination reconstruction")

    # The reverse partial case is equally untrusted: never debit based only
    # on type/name/lore signature, which omits dynamic and Adventure flags.
    updated = between(updated,
        "        if (srcBefore && dstAfter) {",
        '        log("TRANSFER JOURNAL AMBIGUOUS: leaving journal intact and making no changes.");',
        '''        if (srcBefore && dstAfter) {
            pg20ReportHold("legacy credited destination: source debit not authenticated");
            return;
        }''',
        "legacy source-debit recovery")

    updated = once(updated,
        "function safeMovePartial(src, srcBlock, srcSlot, dst, dstBlock, dstSlotInfo, amount) {\n",
        '''function safeMovePartial(src, srcBlock, srcSlot, dst, dstBlock, dstSlotInfo, amount, opaqueDirectOnly = false) {
    // Never overwrite unresolved or malformed previous physical intent.
    if (world.getDynamicProperty(JOURNAL_KEY) !== undefined) {
        pg20ReportHold("unresolved physical journal blocks new source debit");
        return 0;
    }
''', "physical intent admission")
    updated = once(updated,
        "    const sig = exactStackSig(sourceItem);\n    const transportData = serializeTransport(sourceItem);",
        '''    if (opaqueDirectOnly === true) {
        return pg20MoveOpaqueNative(src, srcBlock, srcSlot,
                                    dst, dstBlock, dstSlotInfo, move, sourceItem);
    }
    const sig = exactStackSig(sourceItem);
    const transportData = serializeTransport(sourceItem);''',
        "native-direct-only branch")
    updated = once(updated,
        '''                            slotInfo, want
                        );
                        if (moved > 0) {''',
        '''                            slotInfo, want, true
                        );
                        if (moved > 0) {''',
        "direct-only caller")

    if pg08_main.count("function recoverJournal()") != 1 or \
       updated.count("function recoverJournal()") != 1 or \
       updated.count("function safeMovePartial(") != 1:
        raise ValueError("PG20 REFUSED duplicate recovery/move function")
    if "new ItemStack(" in overlay or "setItem(" in overlay or \
       "transferItem(" in overlay or "world.getAllPlayers(" in overlay or \
       "world.clearDynamicProperties(" in overlay:
        raise ValueError("PG20 REFUSED unsafe native opaque overlay")
    required = [
        'const PG20_OPAQUE_JOURNAL = "pg20-native-opaque-v1"',
        "src.moveItem(srcSlot, dstSlotInfo.slot, dst)",
        "pg20InspectableNativeFingerprint(src.getItem(srcSlot))",
        "if (world.getDynamicProperty(JOURNAL_KEY) !== undefined)",
        "saveJournal(undefined)"
    ]
    if any(marker not in overlay + "\n" + updated for marker in required):
        raise ValueError("PG20 REFUSED missing safety-contract marker")

    # The accepted PG08 UI is retained. Disposable PG13/14/15 command overlays
    # were finished and must not persist into future gameplay builds.
    for forbidden in ("PG13_A", "PG14_RESERVE", "PG15_KEY",
                      "hartlogistics:cutpre", "hartlogistics:custodytransfer",
                      "hartlogistics:shadowbegin", "minecraft:block_entity"):
        if forbidden in updated + overlay:
            raise ValueError("PG20 REFUSED obsolete temporary/experimental code")
    return updated + "\n\n" + overlay.rstrip() + "\n"


def prepare(target: Path) -> None:
    target = target.resolve(strict=False)
    if target.exists():
        raise FileExistsError("PG20 REFUSED existing output: " + str(target))
    if pg08.check_baseline() != 72:
        raise ValueError("PG20 REFUSED unexpected original source count")

    with tempfile.TemporaryDirectory(prefix="pg20-build-") as temp:
        previous = Path(temp) / "pg08"
        pg08.prepare(previous)
        src = (previous / "behavior_pack/scripts/main.js").read_text(encoding="utf-8")
        patched = compile_patch(src, OVERLAY.read_text(encoding="utf-8"))
        try:
            target.mkdir(parents=True)
            for kind in ("behavior_pack", "resource_pack"):
                shutil.copytree(previous / kind, target / kind)
            (target / "behavior_pack/scripts/main.js").write_text(
                patched, encoding="utf-8"
            )
            for kind in ("behavior_pack", "resource_pack"):
                path = target / kind / "manifest.json"
                manifest = json.loads(path.read_text(encoding="utf-8"))
                if manifest["header"]["version"] != [1, 5, 1]:
                    raise ValueError("PG20 REFUSED incompatible PG08 predecessor pack")
                manifest["header"]["version"] = VERSION
                manifest["header"]["name"] = (
                    "HartMods - Hart Logistics " +
                    ("BP" if kind == "behavior_pack" else "RP") +
                    " | PG20 MR RECOVERY LAB ONLY"
                )
                manifest["header"]["description"] = (
                    "LAB candidate for native MR direct-only moves and "
                    "fail-closed physical journal; not production-approved."
                )
                for module in manifest.get("modules", []):
                    if module["version"] != [1, 5, 1]:
                        raise ValueError("PG20 REFUSED unexpected module version")
                    module["version"] = VERSION
                for dep in manifest.get("dependencies", []):
                    if dep.get("uuid"):
                        if dep["version"] != [1, 5, 1]:
                            raise ValueError("PG20 REFUSED mixed BP/RP dependency")
                        dep["version"] = VERSION
                path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            (target / "NOT_APPROVED_FOR_INSTALL.txt").write_text(
                "PG20 derived MR-recovery TEST CANDIDATE ONLY; no world touched.\n"
                "Owner approval required for any actual LAB install/test.\n"
                "Original 1.4.1 baseline preserved; no PG13/14/15 temp commands.\n"
                "No cheats, experiments, automated repair, Q5 or Bulk gameplay.\n",
                encoding="utf-8"
            )
        except Exception:
            shutil.rmtree(target)
            raise


if __name__ == "__main__":
    if (ROOT / "build").is_symlink():
        raise ValueError("PG20 REFUSED linked build directory")
    if OUT.resolve(strict=False) != (ROOT / "build/pg20-lab").absolute():
        raise ValueError("PG20 REFUSED redirected candidate output")
    prepare(OUT)
    print("PG20 SOURCE PASS:", OUT)
    print("No LAB/PROD/world files accessed; no install.")
