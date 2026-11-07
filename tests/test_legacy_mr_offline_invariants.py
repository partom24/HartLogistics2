"""Permanent offline-only baseline constraints and conceptual network routing models.
No Bedrock server access, source gameplay modifications, experiments or test probes.
The Python transfer model ASSUMES atomic native transfers and is not runtime proof.
"""
from dataclasses import dataclass
from itertools import product
from pathlib import Path
import unittest

SOURCE = (Path(__file__).resolve().parents[1] /
          "addon/behavior_pack/scripts/main.js").read_text(encoding="utf-8")


@dataclass(frozen=True)
class OpaqueMR:
    token: int
    metadata_class: str


@dataclass
class NativeState:
    source: OpaqueMR | None
    destination: OpaqueMR | None = None
    metric_receipts: int = 0


@dataclass(frozen=True)
class DirectGates:
    source_loaded: bool = True
    receiver_loaded: bool = True
    fifo_empty: bool = True
    collector_enabled: bool = True
    source_hopper_unlocked: bool = True
    receiver_enabled: bool = True
    dest_hopper_unlocked: bool = True
    dest_has_room: bool = True


def modeled_direct_move(state: NativeState, gates: DirectGates, fault=""):
    """Move the same opaque object; metrics never contain payloads."""
    if (not all(vars(gates).values()) or state.source is None
            or state.destination is not None):
        return False
    if fault == "before_move":
        return False
    state.destination = state.source
    state.source = None
    if fault != "after_move":
        state.metric_receipts += 1
    return True


def choose_ordinary_route(filtered, auto, bulk_banks, wildcard):
    """Proposal only. Current addon has no Bulk Storage or Transporter."""
    for priority in (filtered, auto):
        if priority == "usable":
            return "specific"
        if priority == "unavailable":
            return "hold"
    if not bulk_banks:
        return "hold"  # no known banks is not proof that configured banks are full
    if any(status in ("unknown", "offline", "stale") for status in bulk_banks):
        return "hold"
    if "verified_free" in bulk_banks:
        return "bulk"
    if all(status == "verified_full" for status in bulk_banks):
        return "wildcard" if wildcard else "hold"
    return "hold"


class SourceContract(unittest.TestCase):
    def test_unchanged_original_identifiers_and_fifo_capacity(self):
        for phrase in (
            'const SORTER_ID = "hartsorter:sorter"',
            'const COLLECTOR_ID = "hartsorter:collector"',
            'const RECEIVER_ID = "hartsorter:receiver"',
            "const QUEUE_CAPACITY = 250000",
        ):
            self.assertIn(phrase, SOURCE)

    def test_unserializable_item_uses_nonqueued_direct_branch(self):
        handler = SOURCE[
            SOURCE.index("function processCollectorIngress("):
            SOURCE.index("function processReceiverDrain(")
        ]
        self.assertIn("const itemData = serializeQueueItem(stack)", handler)
        self.assertIn("if (itemData) {", handler)
        split = handler.index("// Non-stackable or metadata we cannot prove")
        self.assertIn("enqueueFromSource(", handler[:split])
        self.assertNotIn("enqueueFromSource(", handler[split:])
        self.assertIn("safeMovePartial(", handler[split:])

    def test_direct_path_checks_fifo_loaded_receiver_hopper_and_redstone(self):
        handler = SOURCE[
            SOURCE.index("function processCollectorIngress("):
            SOURCE.index("function processReceiverDrain(")
        ]
        for phrase in (
            "blockIsRedstonePowered(collectorBlock)",
            'source.kind === "hopper" && source.locked',
            "qTotal === 0 && receiverBlock && !blockIsRedstonePowered(receiverBlock)",
            "receiverOutputHopper(receiver)",
            "if (output && !output.locked)",
            "findAcceptSlot(output.container, stack)",
            "safeMovePartial(",
        ):
            self.assertIn(phrase, handler)

    def test_counters_record_after_physical_move_only(self):
        handler = SOURCE[
            SOURCE.index("function processCollectorIngress("):
            SOURCE.index("function processReceiverDrain(")
        ]
        move = handler.index("const moved = safeMovePartial(")
        counters = handler.index("recordDirectReceiverTransfer(receiver, moved)")
        self.assertLess(move, counters)
        self.assertIn("The physical transfer already completed safely.", handler)

    def test_no_disposable_probe_or_custom_container_in_legacy_source(self):
        self.assertNotIn("hlprobe:mr_container", SOURCE)
        self.assertNotIn('"minecraft:block_entity": {', SOURCE)


class ConceptualCustodyAndRouting(unittest.TestCase):
    def test_all_direct_gate_combinations_preserve_opaque_owner(self):
        names = list(DirectGates.__dataclass_fields__)
        count = 0
        for values in product((False, True), repeat=len(names)):
            gates = DirectGates(**dict(zip(names, values)))
            item = OpaqueMR(1, "enchant+lore+unknown-data")
            state = NativeState(source=item)
            moved = modeled_direct_move(state, gates)
            self.assertEqual(moved, all(values))
            self.assertEqual(sum(x is not None for x in
                                 (state.source, state.destination)), 1)
            self.assertIs(state.source or state.destination, item)
            self.assertEqual(state.metric_receipts, int(moved))
            count += 1
        self.assertEqual(count, 256)

    def test_mocked_interruptions_never_replay_metric_as_item(self):
        for fault in ("before_move", "after_move", ""):
            with self.subTest(fault=fault):
                item = OpaqueMR(34, "opaque metadata")
                state = NativeState(source=item)
                modeled_direct_move(state, DirectGates(), fault)
                self.assertEqual(sum(x is not None for x in
                                     (state.source, state.destination)), 1)
                modeled_direct_move(state, DirectGates())
                self.assertIs(state.destination, item)
                self.assertIsNone(state.source)
                self.assertEqual(state.metric_receipts,
                                 0 if fault == "after_move" else 1)

    def test_existing_destination_cannot_be_overwritten(self):
        src, dst = OpaqueMR(1, "one"), OpaqueMR(2, "two")
        state = NativeState(source=src, destination=dst)
        self.assertFalse(modeled_direct_move(state, DirectGates()))
        self.assertIs(state.source, src)
        self.assertIs(state.destination, dst)

    def test_opaque_metadata_passes_by_identity_not_json(self):
        for i, meta in enumerate(("named", "enchanted", "custom component", "addon item")):
            obj = OpaqueMR(i, meta)
            state = NativeState(source=obj)
            self.assertTrue(modeled_direct_move(state, DirectGates()))
            self.assertIs(state.destination, obj)

    def test_125_bulk_status_combinations_fail_closed(self):
        statuses = ("verified_free", "verified_full", "unknown", "offline", "stale")
        for banks in product(statuses, repeat=3):
            got = choose_ordinary_route(None, None, banks, True)
            if any(s in ("unknown", "offline", "stale") for s in banks):
                self.assertEqual(got, "hold")
            elif "verified_free" in banks:
                self.assertEqual(got, "bulk")
            else:
                self.assertEqual(got, "wildcard")

    def test_filtered_destination_takes_priority_over_bulk(self):
        for status in ("verified_free", "verified_full", "unknown", "offline", "stale"):
            self.assertEqual(choose_ordinary_route("usable", None, [status], True),
                             "specific")
            self.assertEqual(choose_ordinary_route("unavailable", None, [status], True),
                             "hold")

    def test_no_bank_evidence_cannot_trigger_network_wildcard(self):
        self.assertEqual(choose_ordinary_route(None, None, [], True), "hold")
        self.assertEqual(choose_ordinary_route(None, None,
                         ["verified_full"], False), "hold")


if __name__ == "__main__":
    unittest.main()
