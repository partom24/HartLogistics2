"""Offline PG27-derived source census for a future Q5 global maintenance gate.

This module NEVER instruments, writes, or runs a game pack. It builds the exact
PG27 candidate only in a temporary directory, inventories named source seams,
known direct mutators and callback registrations, and refuses source drift.
This is a source-level mapping, NOT proof that a Bedrock maintenance flag works.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[2]

# Mapped to the 12 handler categories in q5_shadow_staging.mjs.
# The empty groups are genuine unimplemented Q5/Bulk schedulers, NOT PASS.
HANDLER_SEAMS = {
    "collector_q4_ingress": ("processCollectorIngress", "enqueueFromSource"),
    "entity_q4_ingress": ("processEjectedItemEntity", "enqueueFromEjectedEntity"),
    "native_mr_direct": ("pg20MoveOpaqueNative", "safeMovePartial"),
    "physical_recovery": ("recoverJournal",),
    "q4_recovery": ("recoverQueueJournal", "pg25PreservePendingQueueJournal"),
    "receiver_q4_output": ("processReceiverDrain", "dequeueToReceiver"),
    "sorter_compaction": ("pg23CompactSourceHopper",),
    "sorter_physical": ("schedulerTick", "processColumn", "safeMovePartial"),
    "transporter_input": ("pg26ReadTransportInput", "pg26TransportStillMatches"),
    "q5_scheduler": (),
    "bulk_scheduler": (),
    "migration": (
        "migrateLegacyCollectorsIfNeeded", "loadReceiverQueue",
        "initializeEmptyReceiverQueue", "migrateReceiverQueueQ2ToV4",
        "migrateReceiverQueueQ3ToV4"
    )
}

# Indirect or ancillary effect-capable functions. Not all are transfer writers:
# item rendering, filter UI, registry updates, Q4 metadata and startup are
# separate obligations. Do not treat read-only status as a writer.
NON_TRANSFER_EFFECT_SEAMS = frozenset("""
showNativeFrameUpgradeNotice setWorldDynamic saveRegistry loadRegistry
saveLogistics flushLogistics saveQueueJournal saveJournal removeDisplay
equipDisplayEntity syncDisplay reconcileDisplays setSorterMode removeEntry
addEntry registerCollector registerReceiver markLogisticsAbsent persistQueueMeta
ensureQueueDefinition persistQueuePage persistQueueEntry clearQueueEntry
cleanupLegacyReceiverQueue cleanupLegacyQ3Queue cleanupUncommittedQ4
populateQ4FromEntries recordDirectReceiverTransfer rebuildQueueItem
useReceiver selectCollector journalQueueState rebuildItem giveOrDrop setFilter
destinationFor plantEmptyNativeFrame eraseOwnedFrame nativeFrameMirror
saveRegistry saveLogistics pg26RefreshConnections pg24ClearVerifiedEntityIntent
pg24VerifyEjectedCommit
""".split())

# Detect direct effect call sites, not merely path names or comments.
# Names deliberately include low-level writes and their queue/registry wrappers.
EFFECT_CALLS = re.compile(
    r"(?<![\w$])(?:setItem|moveItem|transferItem|setDynamicProperty|"
    r"setWorldDynamic|saveQueueJournal|saveJournal|persistQueueEntry|"
    r"persistQueuePage|persistQueueMeta|clearQueueEntry|saveRegistry|"
    r"saveLogistics|setType|runCommand|spawnItem|spawnEntity|"
    r"giveOrDrop|setPermutation)\s*\("
)

# Callback registration inventory, not just the two scheduler loops. If a
# future callback is added, the audit must be reviewed and updated explicitly.
CALLBACK_COUNTS = {
    "system.runInterval(": 7,
    "system.runTimeout(": 7,
    "system.run(": 6,
    "world.afterEvents.": 6,
    "world.beforeEvents.": 4,
    "system.beforeEvents.startup.subscribe(": 2,
}

MANDATORY_REGISTRATIONS = (
    "system.runInterval(schedulerTick, 1);",
    "system.runInterval(logisticsTick, 1);",
    "system.runInterval(recoverJournal, 20);",
    "system.runInterval(recoverQueueJournal, 20);",
    "system.runInterval(flushLogistics, 200);",
    "world.afterEvents.entitySpawn.subscribe(",
    "world.beforeEvents.playerInteractWithBlock.subscribe(",
    "world.afterEvents.playerPlaceBlock.subscribe(",
    "world.afterEvents.playerBreakBlock.subscribe(",
    "event.blockComponentRegistry.registerCustomComponent("
)

class Q5CoverageRefused(ValueError):
    pass


def mask_js(text: str) -> str:
    """Retain code punctuation but mask comments and quoted text.

    Template literal expressions are masked wholesale: a deliberately
    conservative restriction; this tool does not constitute a JavaScript AST.
    """
    result = list(text)
    i = 0
    while i < len(text):
        c = text[i]
        next_c = text[i + 1] if i + 1 < len(text) else ""
        if c == "/" and next_c in ("/", "*"):
            start = i
            if next_c == "/":
                i = text.find("\n", i + 2)
                if i < 0:
                    i = len(text)
            else:
                stop = text.find("*/", i + 2)
                if stop < 0:
                    raise Q5CoverageRefused("unterminated_js_comment")
                i = stop + 2
            for k in range(start, i):
                if text[k] != "\n":
                    result[k] = " "
            continue
        if c in ("'", '"', "\x60"):
            quote = c
            start = i
            i += 1
            while i < len(text):
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    i += 1
                    break
                i += 1
            else:
                raise Q5CoverageRefused("unterminated_js_string")
            for k in range(start, min(i, len(text))):
                if text[k] != "\n":
                    result[k] = " "
            continue
        i += 1
    return "".join(result)


def named_functions(source: str) -> dict[str, tuple[int, int]]:
    masked = mask_js(source)
    result = {}
    for match in re.finditer(r"(?m)^function\s+([A-Za-z_$][\w$]*)\s*\(", masked):
        name = match.group(1)
        if name in result:
            raise Q5CoverageRefused("duplicate_function:" + name)
        brace = masked.find("{", match.end())
        if brace < 0:
            raise Q5CoverageRefused("missing_function_body:" + name)
        depth = 0
        end = None
        for i in range(brace, len(masked)):
            if masked[i] == "{":
                depth += 1
            elif masked[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end is None:
            raise Q5CoverageRefused("unbalanced_function:" + name)
        result[name] = (brace + 1, end - 1)
    return result


def source_guard_census(source: str) -> dict:
    """Refuse unexpected direct effect owners, handler seams and callbacks."""
    masked = mask_js(source)
    locations = named_functions(source)
    required = {name for seams in HANDLER_SEAMS.values() for name in seams}
    absent = sorted(required.difference(locations))
    if absent:
        raise Q5CoverageRefused("missing_handler_seams:" + ",".join(absent))

    for marker, expected in CALLBACK_COUNTS.items():
        # String constants aren't counted as callback registrations.
        found = masked.count(marker)
        if found != expected:
            raise Q5CoverageRefused(
                f"callback_surface_changed:{marker}:{found}!={expected}"
            )
    for marker in MANDATORY_REGISTRATIONS:
        if masked.count(marker) != 1:
            raise Q5CoverageRefused("callback_registration_changed:" + marker)
    # Three delayed retries plus the entitySpawn initial callback: all matter.
    retry_marker = "system.runTimeout(() => processEjectedItemEntity("
    if masked.count(retry_marker) != 4:
        raise Q5CoverageRefused("callback_registration_changed:" + retry_marker)

    mapped = required | NON_TRANSFER_EFFECT_SEAMS
    effect_sites = {}
    unassigned = []
    for name, (start, end) in locations.items():
        hits = list(EFFECT_CALLS.finditer(masked[start:end]))
        if hits:
            effect_sites[name] = len(hits)
            if name not in mapped:
                unassigned.append(name)
    if unassigned:
        raise Q5CoverageRefused("uncatalogued_direct_effects:" +
                                ",".join(sorted(unassigned)))

    # Detect raw top-level effects not owned by a named function. Existing
    # event callbacks must be reviewed explicitly; their source locations are
    # reported and never presented as fully protected by a future function gate.
    ranges = list(locations.values())
    top_level_effect_lines = [
        masked.count("\n", 0, m.start()) + 1
        for m in EFFECT_CALLS.finditer(masked)
        if not any(start <= m.start() < end for start, end in ranges)
    ]
    return {
        "status": "SOURCE_CENSUS_ONLY",
        "handler_seams": {k: list(v) for k, v in HANDLER_SEAMS.items()},
        "unimplemented_schedulers": ["q5_scheduler", "bulk_scheduler"],
        "catalogued_direct_effect_functions": effect_sites,
        "top_level_callback_effect_lines": top_level_effect_lines,
        "registrations": dict(CALLBACK_COUNTS),
        "canFreezeWorld": False,
        "canRoute": False,
        "canMigrate": False,
        "canActivateQ5": False,
        "canWriteWorld": False
    }


def read_exact_pg27_source() -> str:
    """Build installed-version candidate in disposable *offline* temp root."""
    spec = importlib.util.spec_from_file_location(
        "q5_pg27_source_census_builder",
        ROOT / "candidates/pg27/prepare_candidate.py"
    )
    if spec is None or spec.loader is None:
        raise Q5CoverageRefused("pg27_builder_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory(prefix="q5-pg27-coverage-offline-") as td:
        output = Path(td) / "pg27"
        module.prepare(output)
        main = output / "behavior_pack/scripts/main.js"
        code = main.read_text(encoding="utf-8")
        if 'const VERSION = "1.5.10-LAB-PG27";' not in code:
            raise Q5CoverageRefused("wrong_pg27_source_version")
        return code


def inspect_handler_contract_matches_shadow_model() -> bool:
    shadow = (ROOT / "candidates/transport/q5_shadow_staging.mjs").read_text(
        encoding="utf-8"
    )
    match = re.search(
        r"export const REQUIRED_FROZEN_HANDLERS\s*=\s*Object\.freeze\(\[(.*?)\]\.sort\(\)\)",
        shadow, re.DOTALL
    )
    if not match:
        raise Q5CoverageRefused("missing_global_shadow_handler_contract")
    covered = set(re.findall(r"'([a-z0-9_]+)'", match.group(1)))
    if covered != set(HANDLER_SEAMS):
        raise Q5CoverageRefused("maintenance_shadow_handler_drift")
    return True


if __name__ == "__main__":
    inspect_handler_contract_matches_shadow_model()
    result = source_guard_census(read_exact_pg27_source())
    print("Q5 PG27 SOURCE CENSUS PASS — read-only source inspection")
    print("Real global freeze/cutover authority: NONE")
    print("Mapped direct effect functions:", len(result["catalogued_direct_effect_functions"]))
    print("Unowned top-level callback effect sites (requires separate guards):",
          result["top_level_callback_effect_lines"])
