"""Offline *source-level* PG27 maintenance coverage census. No code injection.

Audits the exact generated PG27 LAB candidate, including PG25/Q4 custody and
PG26 native Transporter overlay. This is a blocking inventory for later Q5
maintenance-gate implementation, NOT a claim that the live runtime is gated.

Unlike trusting a hand-maintained checklist, this refuses changed functions,
missing entry points, new unclassified movement/event sites and legacy writer
additions. The caller must explicitly update the audited inventory as code
changes; the review must include those changes. No Bedrock or world access.
"""
from __future__ import annotations
import re
from pathlib import Path

# Covered categories: real Q4/FIFO input, physical native writer, persistent
# state writer, recovery, scheduled callback and human event mutations.
FUNCTION_SITES = {
    "schedulerTick": "sorter_physical",
    "logisticsTick": "collector_q4_ingress",
    "processColumn": "sorter_physical",
    "processCollectorIngress": "collector_q4_ingress",
    "processReceiverDrain": "receiver_q4_output",
    "processEjectedItemEntity": "entity_q4_ingress",
    "enqueueFromEjectedEntity": "entity_q4_ingress",
    "enqueueFromSource": "collector_q4_ingress",
    "dequeueToReceiver": "receiver_q4_output",
    "safeMovePartial": "sorter_physical",
    "recoverJournal": "physical_recovery",
    "recoverQueueJournal": "q4_recovery",
    "saveJournal": "physical_recovery",
    "saveQueueJournal": "q4_recovery",
    "loadReceiverQueue": "q4_recovery",
    "persistQueueMeta": "q4_recovery",
    "persistQueuePage": "q4_recovery",
    "persistQueueEntry": "q4_recovery",
    "clearQueueEntry": "q4_recovery",
    "ensureQueueDefinition": "q4_recovery",
    "migrateReceiverQueueQ3ToV4": "migration",
    "migrateReceiverQueueQ2ToV4": "migration",
    "initializeEmptyReceiverQueue": "migration",
    "migrateLegacyCollectorsIfNeeded": "migration",
    "flushLogistics": "q4_recovery",
    "registerCollector": "migration",
    "registerReceiver": "migration",
    "setFilter": "sorter_physical",
    "setSorterMode": "sorter_physical",
    "selectCollector": "collector_q4_ingress",
    "useReceiver": "receiver_q4_output",
}
# PG26 extends the old Sorter scheduler with a pipe graph scanner; it has no
# independent writer but MUST be checked before source authority is committed.
PIPE_SITES = ("pg26ReadTransportInput", "pg26TransportStillMatches")
# Every subscription/scheduler occurrence that can cause writes or deferred
# mutations in the candidate. This inventory must change when new source
# adds/subtracts event or timer subscriptions: no silently omitted callbacks.
EVENT_COUNTS = {
    "system.runInterval(": 7,
    "system.runTimeout(": 7,
    "system.run(": 6,
    "world.afterEvents.": 6,
    "world.beforeEvents.": 4,
    "system.beforeEvents.startup.subscribe(": 2,
}
# Explicitly track the sensitive JS mutation primitives and direct journal
# writes; these counts are guard-coverage tripwires, not proof of harmlessness.
WRITER_COUNTS = {
    "world.setDynamicProperty(": 1,
    "saveQueueJournal(": 17,
    "saveJournal(": 7,
    "dequeueToReceiver(": 2,
    "enqueueFromSource(": 3,
    "safeMovePartial(": 3,
}
# Known manual/deferred entry callbacks requiring separate gate insertion.
# Count by distinctive full source anchor instead of matching a vague prefix.
DEFERRED_ANCHORS = (
    "world.afterEvents.entitySpawn.subscribe(ev => {",
    "system.runTimeout(() => processEjectedItemEntity(ev.entity, 0, spawnLoc), 1);",
    "system.run(() => {\n        const block = sorterAt(entry);",
    "world.beforeEvents.playerInteractWithBlock.subscribe(ev => {",
    "world.afterEvents.playerPlaceBlock.subscribe(ev => {",
    "world.beforeEvents.playerBreakBlock.subscribe(ev => {",
    "world.afterEvents.entityHitBlock.subscribe(ev=>{",
    "world.afterEvents.playerBreakBlock.subscribe(ev => {",
    "system.runInterval(schedulerTick, 1);",
    "system.runInterval(logisticsTick, 1);",
    "system.runInterval(recoverJournal, 20);",
    "system.runInterval(recoverQueueJournal, 20);",
    "system.runInterval(flushLogistics, 200);",
)
# Source signatures that convey real PG27 code, not a dummy function with the
# right name. A later candidate must update this with a reviewed diff.
CONTRACT_ANCHORS = (
    "function schedulerTick() {",
    "function logisticsTick() {",
    "function processColumn(col, globalRemaining) {",
    "function processCollectorIngress(collector, globalRemaining) {",
    "function processReceiverDrain(receiver, globalRemaining) {",
    "function enqueueFromEjectedEntity(receiver, collector, entity, itemData, amount) {",
    "function dequeueToReceiver(receiver, output, maxMove) {",
    "function safeMovePartial(src, srcBlock, srcSlot, dst, dstBlock, dstSlotInfo, amount) {",
    "function pg26ReadTransportInput(col) {",
    "function pg26TransportStillMatches(col, expected) {",
    "function recoverQueueJournal() {",
    "function recoverJournal() {",
    "if (getQueueJournal()) return;",
    "system.runTimeout(() => processEjectedItemEntity(ev.entity, 0, spawnLoc), 1);",
)

class UnsafeCoverage(ValueError):
    pass

def census_source(source: str) -> dict:
    if not isinstance(source, str) or not source:
        raise UnsafeCoverage("no_candidate_source")
    # Anchor one definition per named routing and state-mutating entry point.
    missing = []
    for fn in FUNCTION_SITES:
        found = re.findall(r"(?m)^function\s+" + re.escape(fn) + r"\s*\(", source)
        if len(found) != 1:
            missing.append(fn)
    for fn in PIPE_SITES:
        if len(re.findall(r"(?m)^function\s+" + re.escape(fn) + r"\s*\(", source)) != 1:
            missing.append(fn)
    if missing:
        raise UnsafeCoverage("entry_point_changed:" + ",".join(sorted(missing)))
    for label, expected in {**EVENT_COUNTS, **WRITER_COUNTS}.items():
        actual = source.count(label)
        if actual != expected:
            raise UnsafeCoverage(f"uncensused_site:{label}:expected={expected}:actual={actual}")
    for anchor in DEFERRED_ANCHORS + CONTRACT_ANCHORS:
        if source.count(anchor) != 1:
            raise UnsafeCoverage("source_anchor_changed:" + anchor[:90])
    return {
        "status": "SOURCE_CENSUS_ONLY",
        "function_entry_points": len(FUNCTION_SITES) + len(PIPE_SITES),
        "categorized_functions": dict(FUNCTION_SITES),
        "pipe_sites": list(PIPE_SITES),
        "event_counts": dict(EVENT_COUNTS),
        "writer_counts": dict(WRITER_COUNTS),
        "deferred_sites": len(DEFERRED_ANCHORS),
        "guarded": False,
        "runtime_freeze_verified": False,
        "migration_allowed": False,
        "q5_authority_allowed": False,
    }

def census_generated_pg27(repo: Path) -> dict:
    """Derive exact frozen PG27 under an isolated temporary target."""
    import importlib.util
    import tempfile
    spec = importlib.util.spec_from_file_location(
        "q5_exact_pg27_source", repo / "candidates/pg27/prepare_candidate.py")
    if spec is None or spec.loader is None:
        raise UnsafeCoverage("pg27_builder_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory(prefix="q5-source-census-") as td:
        target = Path(td) / "candidate"
        module.prepare(target)
        source = (target / "behavior_pack/scripts/main.js").read_text(encoding="utf-8")
        return census_source(source)
