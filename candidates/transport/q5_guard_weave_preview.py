"""Generate an *uninstallable* PG27 Q5 guard-weaving source preview.

This intentionally does NOT create a behavior/resource pack, manifest, test
command, updater, world migration, or usable routing gate. It compiles the
exact PG27 script into a throw-on-entry, fail-closed preview for source tests.

A future approved implementation must replace these unconditional refusals
with an independently proven durable marker/epoch read, recheck at each
deferred callback and physical commit, and preserve legitimate recovery.
"""
from __future__ import annotations
import importlib.util
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "q5_guard_seam_census", ROOT/"candidates/transport/q5_pg27_guard_audit.py"
)
if spec is None or spec.loader is None:
    raise RuntimeError("Q5 source census unavailable")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

# All named entry points in legacy Q4 and PG27 physical writer chains.
# Does NOT imply this list alone guards frame callbacks or async effects.
# A new source path must be explicitly reviewed under the existing census.
BOUNDARY_FUNCTIONS = (
    "schedulerTick", "logisticsTick",
    "processColumn", "processCollectorIngress", "processReceiverDrain",
    "processEjectedItemEntity", "enqueueFromEjectedEntity", "enqueueFromSource",
    "dequeueToReceiver", "safeMovePartial", "recoverJournal",
    "recoverQueueJournal", "saveJournal", "saveQueueJournal",
    "loadReceiverQueue", "persistQueueMeta", "persistQueuePage",
    "persistQueueEntry", "clearQueueEntry", "ensureQueueDefinition",
    "migrateLegacyCollectorsIfNeeded", "migrateReceiverQueueQ3ToV4",
    "migrateReceiverQueueQ2ToV4", "initializeEmptyReceiverQueue",
    "flushLogistics", "registerCollector", "registerReceiver",
    "setFilter", "setSorterMode", "selectCollector", "useReceiver",
    "pg26ReadTransportInput", "pg26TransportStillMatches"
)
# Distinct non-function callbacks remain an explicit gate. Do NOT remove
# these blockers to pretend this source-only guard is ready to install.
UNRESOLVED_CALLBACKS = (
    "deferred_entity_spawn_and_retries",
    "frame_interaction_item_give_drop_and_block_break",
    "manual_filter_and_collector_link_interactions",
    "registry_and_visual_updates_in_callbacks",
    "startup_q4_loader_migration_and_journal_recovery",
    "persistent_maintenance_marker_bootstrap",
    "physical_commit_epoch_revalidation",
    "vanilla_and_foreign_inventory_ingress",
    "unloaded_block_lazy_legacy_admission",
)

class UninstallablePreviewError(ValueError):
    pass

def weave_offline_preview(source: str) -> dict:
    """Return a string for syntax checks only, NEVER a deployable artifact."""
    # The existing precise PG27 census detects unowned direct callback
    # mutations, missing names, stale source and new writer calls.
    audit.source_guard_census(source)
    fn = audit.named_functions(source)
    missing = set(BOUNDARY_FUNCTIONS) - set(fn)
    if missing:
        raise UninstallablePreviewError("missing_boundary:" + ",".join(sorted(missing)))
    # Insert at opening body offsets in REVERSE order to retain positions.
    # This forces refusal *before* the first existing statement/mutation.
    output = source
    for name in sorted(BOUNDARY_FUNCTIONS,key=lambda key:fn[key][0],reverse=True):
        start = fn[name][0]
        guard = "\n    q5SourcePreviewHold('" + name + "'); // OFFLINE TEST ONLY\n"
        output = output[:start] + guard + output[start:]
    sentinel = (
        "\n// Q5 OFFLINE TEST ONLY: unconditional denial, NOT a Bedrock gate.\n"
        "function q5SourcePreviewHold(site) {\n"
        '    throw new Error("Q5_UNINSTALLABLE_GUARD_PREVIEW:" + site);\n'
        "}\n"
    )
    output = sentinel + output
    return {
        "status": "NONDEPLOYABLE_SOURCE_PREVIEW",
        "source": output,
        "guarded_function_count": len(BOUNDARY_FUNCTIONS),
        "guarded_function_names": list(BOUNDARY_FUNCTIONS),
        "unresolved_callbacks": list(UNRESOLVED_CALLBACKS),
        "canInstall": False, "canFreezeWorld": False, "canRoute": False,
        "canWriteWorld": False, "canMigrate": False, "canActivateQ5": False
    }

def derive_and_weave_pg27() -> dict:
    """Build exact PG27 in OS temp, no writes to checked-out repository."""
    with tempfile.TemporaryDirectory(prefix="q5-guard-weave-") as td:
        target = Path(td)/"pg27"
        spec = importlib.util.spec_from_file_location(
            "q5_guard_exact_pg27", ROOT/"candidates/pg27/prepare_candidate.py")
        if spec is None or spec.loader is None:
            raise UninstallablePreviewError("pg27_builder_missing")
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        builder.prepare(target)
        source = (target/"behavior_pack/scripts/main.js").read_text(encoding="utf-8")
        if 'const VERSION = "1.5.10-LAB-PG27";' not in source:
            raise UninstallablePreviewError("wrong_pg27_source")
        return weave_offline_preview(source)


# These effects are *not* owned by named functions. A later Bedrock gate must
# preserve event cancellation and physical-item semantics while checking epoch
# again inside each deferred closure. This is throw-only offline instrumentation.
CALLBACK_ANCHORS = {
    "entity_spawn": ("world.afterEvents.entitySpawn.subscribe(ev => {", 1),
    "item_use": ("world.beforeEvents.itemUse.subscribe(ev => {", 1),
    "entity_interact": ("world.beforeEvents.playerInteractWithEntity.subscribe(ev => {", 1),
    "block_interact": ("world.beforeEvents.playerInteractWithBlock.subscribe(ev => {", 1),
    "block_place": ("world.afterEvents.playerPlaceBlock.subscribe(ev => {", 1),
    "block_break_before": ("world.beforeEvents.playerBreakBlock.subscribe(ev => {", 1),
    "frame_hit": ("world.afterEvents.entityHitBlock.subscribe(ev=>{", 1),
    "block_break_after": ("world.afterEvents.playerBreakBlock.subscribe(ev => {", 1),
    "deferred_system_run_spaced": ("system.run(() => {", 3),
    "deferred_system_run_tight": ("system.run(()=>{", 2),
}

def weave_offline_callback_preview(source: str) -> dict:
    """Refuse every known anonymous gameplay/event/deferred callback at entry.

    NOT A RUNTIME FREEZE; the guard always throws and does not respect event
    cancellation, callback captured epochs, world tick ordering, or recovery.
    Installed pack capability remains absolutely false.
    """
    from_preview = weave_offline_preview(source)
    current = from_preview["source"]
    guarded = []
    for key, (anchor, expected) in CALLBACK_ANCHORS.items():
        if current.count(anchor) != expected:
            raise UninstallablePreviewError(
                f"callback_anchor_changed:{key}:{current.count(anchor)}!={expected}"
            )
        parts = current.split(anchor)
        merged = [parts[0]]
        for index, remainder in enumerate(parts[1:], 1):
            site = "callback:" + key + ":" + str(index)
            guarded.append(site)
            merged.extend([anchor,
                "\n    q5SourcePreviewHold('" + site + "'); // CALLBACK OFFLINE TEST ONLY\n",
                remainder])
        current = "".join(merged)
    return {
        **from_preview, "source": current,
        "status": "NONDEPLOYABLE_NAMED_AND_CALLBACK_PREVIEW",
        "guarded_callback_count": len(guarded),
        "guarded_callback_names": guarded,
        # Every callback preview is unconditional denial. No Bedrock
        # snapshot, journal writer, vanilla ingress, restart or event semantics.
        "canInstall": False, "canFreezeWorld": False, "canRoute": False,
        "canMigrate": False, "canActivateQ5": False, "canWriteWorld": False,
    }
