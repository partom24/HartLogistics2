"""Permanent, pure-Python Bundle 2 safety models. NOT executable Bedrock migration.

PG-06/07/08 remain NOT RUN in BDS. No gameplay addon/pack writes, migrations,
menu wiring, experiment settings, or server interactions take place here.
"""
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from itertools import product
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "addon/behavior_pack/scripts/main.js").read_text(encoding="utf8")
BP = ROOT / "addon/behavior_pack"


@dataclass
class LegacyReceiver:
    id: str
    queue_key: str
    q4: tuple
    queued: int
    loaded: bool = True
    journal_pending: bool = False
    authority: str = "q4"
    phase: str = "PENDING"
    q5_shadow: tuple | None = None
    q4_frozen: tuple | None = None


@dataclass
class SafeWorldModel:
    receivers: dict
    maintenance_epoch: int = 0
    maintenance_paused: bool = False
    lazy_resume_proven: bool = False
    # Model does NOT stop vanilla Hoppers. A real migration needs custody isolation.
    vanilla_hoppers_isolated: bool = False

    def enter_maintenance(self):
        self.maintenance_epoch += 1
        self.maintenance_paused = True

    def may_route(self, receiver_id):
        receiver = self.receivers[receiver_id]
        return (not self.maintenance_paused and
                receiver.loaded and receiver.authority == "q5" and
                receiver.phase == "VERIFIED")

    def prepare(self, receiver_id, crash=""):
        receiver = self.receivers[receiver_id]
        if not self.maintenance_paused:
            raise ValueError("routing maintenance must be persisted first")
        if receiver.authority == "q5" and receiver.phase == "VERIFIED":
            return "already_verified"
        if not receiver.loaded:
            receiver.phase = "PENDING"
            return "pending_unloaded"
        if receiver.journal_pending:
            receiver.phase = "BLOCKED"
            return "blocked_journal"
        if not self.vanilla_hoppers_isolated:
            receiver.phase = "BLOCKED"
            return "blocked_hopper"
        if receiver.queued != sum(n for _, n in receiver.q4):
            receiver.phase = "BLOCKED"
            return "blocked_count"
        if receiver.queued > 250000 or any(n <= 0 for _, n in receiver.q4):
            receiver.phase = "BLOCKED"
            return "blocked_capacity"
        receiver.phase = "MIGRATING"
        receiver.q4_frozen = deepcopy(receiver.q4)
        if crash == "after_snapshot":
            return "interrupted"
        receiver.q5_shadow = deepcopy(receiver.q4)
        if crash == "after_shadow":
            return "interrupted"
        if receiver.q5_shadow != receiver.q4_frozen:
            receiver.phase = "BLOCKED"
            return "blocked_mismatch"
        # The only modeled cutover marker; no dual authoritative ledgers.
        receiver.authority = "q5"
        if crash == "after_marker":
            return "interrupted"
        receiver.phase = "VERIFIED"
        return "verified"

    def recover(self, receiver_id):
        r = self.receivers[receiver_id]
        if not self.maintenance_paused:
            return "unsafe_world_not_paused"
        if not r.loaded:
            return "pending_unloaded"
        if r.authority == "q4":
            # Any uncommitted Q5 copy is non-authoritative and can be
            # abandoned. Do not remove original q4 or replay its contents.
            r.q5_shadow = None
            r.q4_frozen = None
            if r.journal_pending or not self.vanilla_hoppers_isolated:
                r.phase = "BLOCKED"
                return "blocked"
            r.phase = "PENDING"
            return "retry_q4"
        if r.authority == "q5":
            if (r.q4_frozen is None or r.q5_shadow is None or
                    r.q4_frozen != r.q5_shadow or
                    sum(x[1] for x in r.q5_shadow) != r.queued):
                r.phase = "BLOCKED"
                return "blocked_post_commit"
            r.phase = "VERIFIED"
            return "resume_q5_only"
        raise ValueError("invalid authority")

    def resume(self):
        # This conservative preflight doesn't implement an approved lazy-load
        # protocol, so every known record must be VERIFIED.
        if not self.vanilla_hoppers_isolated:
            return False
        if not self.receivers or any(
            not r.loaded or r.phase != "VERIFIED" or r.authority != "q5"
            for r in self.receivers.values()
        ):
            return False
        if not self.lazy_resume_proven:
            return False
        self.maintenance_paused = False
        return True


@dataclass
class Collector:
    id: str
    link: str | None
    loaded: bool = True
    revision: int = 0


@dataclass(frozen=True)
class LinkTicket:
    player: str
    collector: str
    receiver: str
    old_link: str | None
    revision: int
    expires_at: int


class MenuPolicyModel:
    """New design, intentionally not installed into 1.4.1."""
    def __init__(self, collectors, receivers):
        self.collectors = collectors
        self.receivers = receivers  # id -> loaded bool
        self.pending = {}
        self.tickets = {}
        self.persisted = {id: c.link for id, c in collectors.items()}

    def placed(self, player, collector_id):
        # Registration may occur, but placement must not arm a link.
        self.pending.pop(player, None)

    def interaction(self, sneaking):
        return "vanilla_passthrough" if sneaking else "defer_form"

    def arm(self, player, collector_id, now):
        col = self.collectors.get(collector_id)
        if not col or not col.loaded:
            return False
        self.pending[player] = (collector_id, col.revision, now + 100)
        self.tickets.pop(player, None)
        return True

    def prepare_confirmation(self, player, receiver_id, now):
        intent = self.pending.get(player)
        receiver_loaded = self.receivers.get(receiver_id) is True
        if not intent or not receiver_loaded:
            return None
        id, revision, deadline = intent
        col = self.collectors.get(id)
        if now > deadline or not col or not col.loaded or col.revision != revision:
            self.pending.pop(player, None)
            return None
        ticket = LinkTicket(player, id, receiver_id, col.link, revision, deadline)
        self.tickets[player] = ticket
        return ticket

    def confirm(self, player, ticket, now, accept, storage_fails=False, paused=False):
        if not accept:
            self.tickets.pop(player, None)
            return False
        if self.tickets.get(player) != ticket or now > ticket.expires_at or paused:
            return False
        col = self.collectors.get(ticket.collector)
        if (not col or not col.loaded or not self.receivers.get(ticket.receiver) or
                col.revision != ticket.revision or col.link != ticket.old_link):
            return False
        prior = col.link
        col.link = ticket.receiver
        if storage_fails:
            col.link = prior
            return False
        self.persisted[col.id] = col.link
        col.revision += 1
        self.pending.pop(player, None)
        self.tickets.pop(player, None)
        return True

    def request_unlink(self, player, collector_id, now):
        col = self.collectors[collector_id]
        self.tickets[player] = LinkTicket(player, col.id, "", col.link, col.revision, now + 100)
        return self.tickets[player]

    def confirm_unlink(self, player, ticket, now, accept, storage_fails=False, paused=False):
        if not accept:
            self.tickets.pop(player, None)
            return False
        col = self.collectors.get(ticket.collector)
        if (self.tickets.get(player) != ticket or paused or not col or not col.loaded or
                now > ticket.expires_at or col.revision != ticket.revision or
                col.link != ticket.old_link):
            return False
        old_link = col.link
        col.link = None
        if storage_fails:
            col.link = old_link
            return False
        self.persisted[col.id] = None
        col.revision += 1
        self.tickets.pop(player, None)
        return True


def migration_label(loaded, phase):
    if not loaded:
        return "Unavailable: block not loaded"
    return {
        "PENDING": "Migration pending",
        "MIGRATING": "Migrating — routing paused",
        "VERIFIED": "Migration complete",
        "BLOCKED": "Migration requires attention",
    }[phase]


class LegacySourceContracts(unittest.TestCase):
    def test_old_block_ids_and_packs_are_preserved(self):
        for id in ("sorter", "collector", "receiver"):
            block = json.loads((BP / f"blocks/{id}.json").read_text())
            self.assertEqual(block["minecraft:block"]["description"]["identifier"],
                             f"hartsorter:{id}")
            self.assertIn(f'const {id.upper()}_ID = "hartsorter:{id}"', MAIN)

    def test_re_registration_preserves_existing_link_and_queue_key(self):
        collector = MAIN[MAIN.index("function registerCollector("):
                         MAIN.index("function allocateQueueKey(")]
        receiver = MAIN[MAIN.index("function registerReceiver("):
                        MAIN.index("function markLogisticsAbsent(")]
        self.assertIn("Object.assign(e, fresh)", collector)
        self.assertIn("Object.assign(e, fresh)", receiver)
        self.assertNotIn("e.link = null", collector)
        self.assertIn("if (!e.queueKey) e.queueKey = allocateQueueKey()", receiver)
        self.assertIn("if (typeof e.queued !== \"number\") e.queued = 0", receiver)
        self.assertIn("if (typeof e.received !== \"number\") e.received = 0", receiver)
        self.assertIn("if (typeof e.delivered !== \"number\") e.delivered = 0", receiver)

    def test_q2_q3_q4_identifiers_and_journal_order_are_retained(self):
        for x in ("hartsorter:q2_", "hartsorter:q3m_", "hartsorter:q3e_",
                  "hartsorter:q4m_", "hartsorter:q4p_", "hartsorter:q4d_"):
            self.assertIn(x, MAIN)
        self.assertIn("function recoverQueueJournal()", MAIN)
        self.assertIn("leaving journal intact", MAIN)
        self.assertIn("q4 metadata is authoritative", MAIN)
        self.assertIn("return migrateReceiverQueueQ3ToV4", MAIN)
        self.assertIn("return migrateReceiverQueueQ2ToV4", MAIN)

    def test_current_141_gesture_and_sneak_behavior_are_known(self):
        self.assertIn("pendingCollectorByPlayer.set(player.id, e.id)", MAIN)
        self.assertIn("col.link = receiver.id", MAIN)
        self.assertIn("ev.player.isSneaking", MAIN)
        self.assertIn("system.run(() => {", MAIN)
        self.assertIn("Placed and selected", MAIN)

    def test_original_pack_not_modified_to_require_ui_or_native_mr(self):
        manifest = json.loads((BP / "manifest.json").read_text())
        module_names = [d.get("module_name") for d in manifest["dependencies"]]
        self.assertNotIn("@minecraft/server-ui", module_names)
        self.assertNotIn("hlprobe:mr_container", MAIN)
        self.assertNotIn('"minecraft:block_entity": {', MAIN)


class MigrationRecoveryModel(unittest.TestCase):
    def fixture(self, **kw):
        r = LegacyReceiver("R0", "q1", (("minecraft:stone", 36),
                                           ("minecraft:dirt", 64)),
                            100, **kw)
        return SafeWorldModel({"R0": r})

    def test_maintenance_pause_precedes_every_stage(self):
        w = self.fixture()
        with self.assertRaises(ValueError):
            w.prepare("R0")
        self.assertFalse(w.may_route("R0"))
        w.enter_maintenance()
        self.assertFalse(w.may_route("R0"))
        self.assertEqual(w.prepare("R0"), "blocked_hopper")

    def test_crash_recovery_six_checkpoints_preserve_one_authority(self):
        for crash in ("after_snapshot", "after_shadow", "after_marker", ""):
            with self.subTest(crash=crash):
                w = self.fixture()
                w.enter_maintenance()
                w.vanilla_hoppers_isolated = True
                q4 = deepcopy(w.receivers["R0"].q4)
                result = w.prepare("R0", crash)
                self.assertIn(result, ("interrupted", "verified"))
                self.assertEqual(w.receivers["R0"].q4, q4)
                self.assertFalse(w.may_route("R0"))
                resolved = w.recover("R0")
                self.assertEqual(resolved, ("resume_q5_only" if
                    crash in ("after_marker", "") else "retry_q4"))
                if resolved == "retry_q4":
                    self.assertEqual(w.prepare("R0"), "verified")
                self.assertEqual(w.receivers["R0"].authority, "q5")
                self.assertEqual(w.receivers["R0"].q5_shadow, q4)
                self.assertFalse(w.maintenance_paused is False)

    def test_ambiguous_journal_cannot_be_silently_skipped(self):
        w = self.fixture(journal_pending=True)
        w.enter_maintenance()
        w.vanilla_hoppers_isolated = True
        self.assertEqual(w.prepare("R0"), "blocked_journal")
        self.assertIsNone(w.receivers["R0"].q5_shadow)
        self.assertEqual(w.receivers["R0"].authority, "q4")
        self.assertFalse(w.resume())

    def test_missing_chunk_stays_pending_and_blocks_global_resume(self):
        w = self.fixture(loaded=False)
        w.enter_maintenance()
        w.vanilla_hoppers_isolated = True
        self.assertEqual(w.prepare("R0"), "pending_unloaded")
        self.assertFalse(w.resume())
        self.assertEqual(w.receivers["R0"].phase, "PENDING")
        w.receivers["R0"].loaded = True
        self.assertEqual(w.prepare("R0"), "verified")
        self.assertFalse(w.resume())  # no proven lazy resume protocol

    def test_staged_data_corruption_refuses_q5_postcommit_resume(self):
        w = self.fixture()
        w.enter_maintenance()
        w.vanilla_hoppers_isolated = True
        self.assertEqual(w.prepare("R0", "after_marker"), "interrupted")
        w.receivers["R0"].q5_shadow = (("minecraft:stone", 36),)
        self.assertEqual(w.recover("R0"), "blocked_post_commit")
        self.assertEqual(w.receivers["R0"].authority, "q5")
        self.assertFalse(w.resume())

    def test_count_mismatch_and_overflow_are_blocked(self):
        for amount, total in ((250001, 250001), (90, 100), (-1, -1)):
            with self.subTest(amount=amount, total=total):
                w = SafeWorldModel({"R0": LegacyReceiver(
                    "R0", "q1", (("minecraft:dirt", amount),), total
                )})
                w.enter_maintenance()
                w.vanilla_hoppers_isolated = True
                self.assertTrue(w.prepare("R0").startswith("blocked_"))
                self.assertEqual(w.receivers["R0"].authority, "q4")

    def test_global_resume_requires_all_receivers_and_explicit_lazy_gate(self):
        r1 = LegacyReceiver("R1", "q1", (("minecraft:dirt", 4),), 4)
        r2 = LegacyReceiver("R2", "q2", (("minecraft:stone", 5),), 5)
        w = SafeWorldModel({"R1": r1, "R2": r2})
        w.enter_maintenance()
        w.vanilla_hoppers_isolated = True
        w.prepare("R1")
        self.assertFalse(w.resume())
        w.prepare("R2")
        self.assertFalse(w.resume())
        w.lazy_resume_proven = True
        self.assertTrue(w.resume())
        self.assertTrue(w.may_route("R1") and w.may_route("R2"))

    def test_three_record_loading_combinations_block_early_resume(self):
        for states in product((False, True), repeat=3):
            r = {f"R{i}": LegacyReceiver(
                f"R{i}", f"q{i}", (("minecraft:dirt", 1),), 1, loaded=loaded
            ) for i, loaded in enumerate(states)}
            w = SafeWorldModel(r)
            w.enter_maintenance()
            w.vanilla_hoppers_isolated = True
            w.lazy_resume_proven = True
            for key in w.receivers:
                w.prepare(key)
            self.assertEqual(w.resume(), all(states))


class MenuWorkflowModel(unittest.TestCase):
    def setUp(self):
        self.state = MenuPolicyModel(
            {"C1": Collector("C1", "Rold"), "C2": Collector("C2", None)},
            {"Rold": True, "Rnew": True, "Roffline": False}
        )

    def test_placement_never_selects_or_relinks(self):
        s = self.state
        s.placed("P1", "C1")
        self.assertEqual(s.pending, {})
        self.assertEqual(s.persisted["C1"], "Rold")

    def test_sneak_places_normally_without_opening_menu(self):
        self.assertEqual(self.state.interaction(True), "vanilla_passthrough")
        self.assertEqual(self.state.interaction(False), "defer_form")

    def test_relink_cancel_preserves_previous_persisted_link(self):
        s = self.state
        self.assertTrue(s.arm("P1", "C1", 10))
        ticket = s.prepare_confirmation("P1", "Rnew", 11)
        self.assertFalse(s.confirm("P1", ticket, 12, False))
        self.assertEqual(s.persisted["C1"], "Rold")
        self.assertEqual(s.collectors["C1"].link, "Rold")

    def test_relink_confirmation_persists_and_cannot_replay(self):
        s = self.state
        s.arm("P1", "C1", 10)
        ticket = s.prepare_confirmation("P1", "Rnew", 11)
        self.assertTrue(s.confirm("P1", ticket, 12, True))
        self.assertEqual(s.persisted["C1"], "Rnew")
        self.assertFalse(s.confirm("P1", ticket, 13, True))

    def test_failed_write_keeps_old_link(self):
        s = self.state
        s.arm("P1", "C1", 10)
        t = s.prepare_confirmation("P1", "Rnew", 11)
        self.assertFalse(s.confirm("P1", t, 12, True, storage_fails=True))
        self.assertEqual(s.collectors["C1"].link, "Rold")
        self.assertEqual(s.persisted["C1"], "Rold")

    def test_unloaded_receiver_and_stale_collector_block_link(self):
        s = self.state
        s.arm("P1", "C1", 10)
        self.assertIsNone(s.prepare_confirmation("P1", "Roffline", 11))
        t = s.prepare_confirmation("P1", "Rnew", 12)
        s.collectors["C1"].loaded = False
        self.assertFalse(s.confirm("P1", t, 13, True))
        self.assertEqual(s.persisted["C1"], "Rold")

    def test_expired_and_paused_sessions_cannot_relink(self):
        s = self.state
        s.arm("P1", "C1", 10)
        self.assertIsNone(s.prepare_confirmation("P1", "Rnew", 111))
        s.arm("P1", "C1", 12)
        t = s.prepare_confirmation("P1", "Rnew", 13)
        self.assertFalse(s.confirm("P1", t, 14, True, paused=True))
        self.assertEqual(s.persisted["C1"], "Rold")

    def test_unlink_requires_separate_confirmation(self):
        s = self.state
        t = s.request_unlink("P1", "C1", 10)
        self.assertFalse(s.confirm_unlink("P1", t, 11, False))
        self.assertEqual(s.persisted["C1"], "Rold")
        t = s.request_unlink("P1", "C1", 12)
        self.assertTrue(s.confirm_unlink("P1", t, 13, True))
        self.assertIsNone(s.persisted["C1"])

    def test_unlink_failed_write_rolls_back(self):
        s = self.state
        t = s.request_unlink("P1", "C1", 10)
        self.assertFalse(s.confirm_unlink("P1", t, 11, True, storage_fails=True))
        self.assertEqual(s.collectors["C1"].link, "Rold")
        self.assertEqual(s.persisted["C1"], "Rold")

    def test_unlink_during_global_maintenance_pause_keeps_original_link(self):
        # Q5 migration status is read-only; its freeze blocks unlink as well as relink.
        s = self.state
        ticket = s.request_unlink("P1", "C1", 10)
        self.assertFalse(s.confirm_unlink("P1", ticket, 11, True, paused=True))
        self.assertEqual(s.collectors["C1"].link, "Rold")
        self.assertEqual(s.persisted["C1"], "Rold")

    def test_stale_unlink_cannot_erase_concurrently_updated_link(self):
        s = self.state
        ticket = s.request_unlink("P1", "C1", 10)
        # A later confirmed link from another player invalidates the earlier menu.
        s.arm("P2", "C1", 11)
        relink = s.prepare_confirmation("P2", "Rnew", 12)
        self.assertTrue(s.confirm("P2", relink, 13, True))
        self.assertFalse(s.confirm_unlink("P1", ticket, 14, True))
        self.assertEqual(s.collectors["C1"].link, "Rnew")
        self.assertEqual(s.persisted["C1"], "Rnew")

    def test_two_player_pending_sessions_are_isolated(self):
        s = self.state
        s.arm("P1", "C1", 10)
        s.arm("P2", "C2", 11)
        t1 = s.prepare_confirmation("P1", "Rnew", 12)
        t2 = s.prepare_confirmation("P2", "Rold", 13)
        self.assertTrue(s.confirm("P2", t2, 14, True))
        self.assertTrue(s.confirm("P1", t1, 15, True))
        self.assertEqual(s.persisted, {"C1": "Rnew", "C2": "Rold"})

    def test_concurrent_sessions_on_same_collector_cannot_overwrite(self):
        s = self.state
        s.arm("P1", "C1", 10)
        s.arm("P2", "C1", 11)
        t1 = s.prepare_confirmation("P1", "Rnew", 12)
        t2 = s.prepare_confirmation("P2", "Rold", 13)
        self.assertTrue(s.confirm("P1", t1, 14, True))
        self.assertFalse(s.confirm("P2", t2, 15, True))
        self.assertEqual(s.persisted["C1"], "Rnew")

    def test_unloaded_block_can_never_claim_migrated(self):
        for phase in ("PENDING", "MIGRATING", "VERIFIED", "BLOCKED"):
            self.assertEqual(migration_label(False, phase),
                             "Unavailable: block not loaded")
        self.assertEqual(migration_label(True, "VERIFIED"),
                         "Migration complete")


if __name__ == "__main__":
    unittest.main()
