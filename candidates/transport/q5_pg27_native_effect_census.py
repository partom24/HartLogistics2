"""Exact-PG27 nondeployable audit of native Bedrock side-effect owners.

Previous Q5 audits enumerate routed writers, queue helpers, registrations and
callbacks. This expands the effect inventory to the *native method calls* that
can remove item entities, equip display entities, place/break blocks, spawn
items/entities or modify containers directly. It is NOT a runtime freeze and
does not authorize an inventory move or Q5 cutover.

The approved per-owner counts below are an intentionally brittle snapshot of
the exact PG27 source. Any new/removed/moved native method requires source
review before Q5 migration; a call of a different API name may still be missed
by this regex and therefore requires a full manual/AST Bedrock API review.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "q5_pg27_existing_census",
    ROOT / "candidates/transport/q5_pg27_guard_audit.py"
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Existing PG27 source census unavailable")
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)

class NativeEffectCoverageRefused(ValueError):
    pass

# Native mutation API member calls, beyond the named routing/queue helpers.
# This is an explicit list, not a wildcard claim that every Bedrock effect
# API is known. Inspect new API surfaces and source changes before extending.
NATIVE_MUTATOR_RE = re.compile(
    r"\.\s*(?P<method>setDynamicProperty|setItem|moveItem|transferItem|"
    r"setEquipment|remove|setType|setPermutation|spawnItem|spawnEntity|"
    r"runCommand)\s*\("
)
NATIVE_METHODS = frozenset((
    "setDynamicProperty", "setItem", "moveItem", "transferItem",
    "setEquipment", "remove", "setType", "setPermutation", "spawnItem",
    "spawnEntity", "runCommand"
))

# Reviewed original + PG27-native source owners. Values are exact calls.
# Updated only after inspecting the diff under the source/CI gate.
APPROVED_NATIVE_CALLS = {
    "setDynamicProperty": {
        "showNativeFrameUpgradeNotice":1, "setWorldDynamic":1,
        "syncDisplay":1, "rebuildQueueItem":1, "rebuildItem":1,
    },
    # PG24 verified removal is the sole retained native ejected entity delete.
    # The former recovered-Q4 absent-entity path is no longer allowed.
    "remove": {
        "removeDisplay":1, "syncDisplay":1, "reconcileDisplays":1,
        "pg24VerifyEjectedCommit":1,
    },
    "setEquipment":{"equipDisplayEntity":1},
    "runCommand":{"equipDisplayEntity":1, "<top-level-callback>":1},
    "spawnEntity":{"syncDisplay":1},
    "setPermutation":{
        "syncSorterModeVisual":1,"plantEmptyNativeFrame":1,
        "pg26RefreshConnections":1,
    },
    # PG25/PG24 queue-recovery no longer write physical slots on replay.
    # Native PG20 MR and PG23 compaction have dedicated moveItem sites.
    "setItem":{
        "enqueueFromSource":2,"dequeueToReceiver":2,
        "setFilter":2,"safeMovePartial":4,
    },
    "moveItem":{
        "pg20MoveOpaqueNative":1, "pg23CompactSourceHopper":1,
    },
    "spawnItem":{"giveOrDrop":2},
    "setType":{
        "plantEmptyNativeFrame":1,"eraseOwnedFrame":1,
        "<top-level-callback>":1,
    },
    "transferItem":{}
}


def inventory_native_mutators(source: str) -> dict:
    """Return raw observed ownership and exact source lines; no world effects."""
    # Existing audit refuses changed callback counts, unknown named writers and
    # direct top-level effects. This is deliberately additive, not a substitute.
    audit.source_guard_census(source)
    masked = audit.mask_js(source)
    functions = audit.named_functions(source)
    count_by_method = {method:{} for method in sorted(NATIVE_METHODS)}
    sites = []
    for found in NATIVE_MUTATOR_RE.finditer(masked):
        method = found.group("method")
        pos = found.start()
        enclosing = [
            (end-start, name)
            for name, (start,end) in functions.items()
            if start <= pos < end
        ]
        enclosing.sort()
        owner = enclosing[0][1] if enclosing else "<top-level-callback>"
        bucket = count_by_method[method]
        bucket[owner] = bucket.get(owner,0)+1
        sites.append({
            "method":method, "owner":owner,
            "sourceLine":masked.count("\n",0,pos)+1
        })
    return {
        "status":"OFFLINE_NATIVE_EFFECT_INVENTORY",
        "nativeEffectCount":len(sites),
        "methodCounts":count_by_method,
        "sites":sites,
        "canInstall":False,"canFreezeWorld":False,
        "canMigrate":False,"canWriteWorld":False,"canRoute":False
    }


def audit_native_mutators(source: str) -> dict:
    observed = inventory_native_mutators(source)
    if observed["methodCounts"] != APPROVED_NATIVE_CALLS:
        raise NativeEffectCoverageRefused(
            "native_method_owner_drift:expected=" +
            repr(APPROVED_NATIVE_CALLS) +
            ":observed=" + repr(observed["methodCounts"])
        )
    return {**observed, "status":"EXACT_PG27_NATIVE_EFFECT_CENSUS_ONLY"}


if __name__=="__main__":
    result=audit_native_mutators(audit.read_exact_pg27_source())
    print("PG27 native effects reviewed:",result["nativeEffectCount"])
    print("NO PACK, WORLD WRITER, MAINTENANCE FREEZE OR Q5 AUTHORITY")
