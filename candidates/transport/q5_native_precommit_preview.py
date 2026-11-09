"""Non-deployable, native-call-adjacent Q5 precommit refusal preview.

The PG27 source census already audits known Q4 routing/registry callbacks, and
the native-effect census pins each reviewed native mutation method/owner.
This module inserts an unconditional refusal as the FIRST argument evaluated
at every one of those native call sites. It bridges the remaining distance
between a handler-entry preview and a physical-effect cutpoint preview.

This is deliberately NOT a marker reader, Q5 maintenance integration, live
precommit fence, pack builder, updater, runtime gate or migration. Its output
must not be installed: a future live gate must establish durable epoch, correct
event cancellation, legitimate recovery and external/vanilla isolation.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_SPEC = importlib.util.spec_from_file_location(
    "q5_exact_native_census",
    ROOT / "candidates/transport/q5_pg27_native_effect_census.py"
)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError("native effect census is required")
native = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(native)

EXPECTED_EXACT_PG27_EFFECTS = 33
HOLD_FUNCTION = "q5OfflineNativeEffectHold"
SENTINEL = (
    "\n// Q5 NATIVE CUTPOINT PREVIEW ONLY. NEVER INSTALL THIS OUTPUT.\n"
    "function q5OfflineNativeEffectHold(site) {\n"
    '    throw new Error("Q5_NONDEPLOYABLE_NATIVE_EFFECT_REFUSAL:" + site);\n'
    "}\n"
)


class NativePrecommitPreviewRefused(ValueError):
    pass


def weave_native_precommit_refusals(source: str) -> dict:
    """Insert source-only call-adjacent refusal, preserving original bytes.

    At JS call evaluation, argument expressions run before the native method
    is invoked. The injected first argument unconditionally throws. The
    comment/string-masked index is length-preserving, so each inserted guard
    is aligned to the EXACT native-call opening parenthesis. This does NOT
    prove that every effectful Bedrock API/method has been inventoried.
    """
    if not isinstance(source, str) or HOLD_FUNCTION in source:
        raise NativePrecommitPreviewRefused("preview_marker_collision")
    observed = native.audit_native_mutators(source)
    masked = native.audit.mask_js(source)
    matches = list(native.NATIVE_MUTATOR_RE.finditer(masked))
    if len(matches) != EXPECTED_EXACT_PG27_EFFECTS or (
        len(matches) != observed["nativeEffectCount"] or
        len(matches) != len(observed["sites"])
    ):
        raise NativePrecommitPreviewRefused("native_effect_count_changed")

    inserts = []
    for index, (match, site) in enumerate(zip(matches, observed["sites"]), 1):
        method = match.group("method")
        line = masked.count("\n", 0, match.start()) + 1
        if method != site["method"] or line != site["sourceLine"]:
            raise NativePrecommitPreviewRefused("native_site_alignment_changed")
        label = f"native:{index}:{site['owner']}:{method}"
        # Native e.g. entity.remove() is a zero-argument call; adding a
        # trailing comma in that case would be a needless syntax hazard.
        tail = masked[match.end():].lstrip()
        if not tail:
            raise NativePrecommitPreviewRefused("unterminated_native_call")
        original_has_args = not tail.startswith(")")
        inserted = f"{HOLD_FUNCTION}('{label}')" + (
            ", " if original_has_args else ""
        )
        inserts.append({
            "index": index,
            "owner": site["owner"],
            "method": method,
            "sourceLine": line,
            "position": match.end(),
            "inserted": inserted,
            "originalHasArgs": original_has_args,
        })

    # Insert from right to left; all offsets refer to unmodified source.
    output = source
    for site in reversed(inserts):
        at = site["position"]
        output = output[:at] + site["inserted"] + output[at:]

    return {
        "status": "NONDEPLOYABLE_NATIVE_PRECOMMIT_REFUSAL_PREVIEW",
        "source": SENTINEL + output,
        "nativeEffectCount": len(inserts),
        "sites": inserts,
        "hasRealMaintenanceMarker": False,
        "hasPrecommitEpochProof": False,
        "hasVanillaIsolationProof": False,
        "hasCrashAtomicityProof": False,
        "canInstall": False,
        "canFreezeWorld": False,
        "canRoute": False,
        "canMigrate": False,
        "canWriteWorld": False,
        "canActivateQ5": False,
    }


def derive_exact_pg27_native_preview() -> dict:
    """Use the original hash-checked PG27 builder; never write a pack."""
    return weave_native_precommit_refusals(native.audit.read_exact_pg27_source())


if __name__ == "__main__":
    result = derive_exact_pg27_native_preview()
    print(f"Q5 offline native precommit refusal sites: {result['nativeEffectCount']}")
    print("No Bedrock pack built; all install, freeze and Q5 permissions FALSE")
