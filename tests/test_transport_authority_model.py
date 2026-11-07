"""Offline-only candidate authority gate for future Transporter regions.

Not runtime/gameplay code, NOT approved controller election, not item custody.
All results are conservative hypothetical route permits/holds. No access to BDS.
This model reuses the existing deterministic six-face topology test helper.
"""
from dataclasses import dataclass
from itertools import permutations
import unittest

from test_transport_topology_model import known_path


@dataclass(frozen=True)
class Claim:
    network: str
    region: str
    controller: str
    epoch: int


@dataclass(frozen=True)
class Snapshot:
    network: str
    epoch: int
    expected_nodes: frozenset
    loaded_nodes: frozenset
    memberships: tuple  # (position, region-ID) pairs: complete, unambiguous
    claims: tuple
    live_controllers: frozenset
    unknown_boundary: bool = False


def may_route(snapshot, source, destination):
    """Candidate fail-closed permission; never executes a transfer.

    A committed, authoritative region assignment is an external PRECONDITION,
    not something derived from a partial loaded subgraph. Cross-region routing,
    leader election, capacity and item commits remain intentionally unspecified.
    """
    if not snapshot.network or snapshot.epoch < 1:
        return False, "missing_epoch"
    if snapshot.unknown_boundary or snapshot.loaded_nodes != snapshot.expected_nodes:
        return False, "incomplete_topology"
    positions = [position for position, _ in snapshot.memberships]
    if (len(positions) != len(set(positions)) or
            set(positions) != snapshot.loaded_nodes):
        return False, "ambiguous_membership"
    regions = dict(snapshot.memberships)
    if source not in regions or destination not in regions:
        return False, "endpoint_unknown"
    if regions[source] != regions[destination]:
        return False, "cross_region_unproven"
    region = regions[source]
    matching = [claim for claim in snapshot.claims if claim.region == region]
    if len(matching) != 1:
        return False, "owner_missing_or_contested"
    claim = matching[0]
    if (claim.network != snapshot.network or
            claim.epoch != snapshot.epoch or
            claim.controller not in snapshot.live_controllers):
        return False, "owner_stale_or_unavailable"
    path = known_path(snapshot.loaded_nodes, source, destination)
    if path is None or any(regions[node] != region for node in path):
        return False, "no_verified_local_path"
    return True, "verified_local_authority_only"


A, B, C = (0, 0, 0), (1, 0, 0), (2, 0, 0)


def snap(*, nodes=(A, B, C), region_by_node=None, claims=None,
         live=("bulk-1",), epoch=12, loaded=None, unknown_boundary=False):
    nodes = frozenset(nodes)
    if region_by_node is None:
        region_by_node = {p: "region-1" for p in nodes}
    if claims is None:
        claims = (Claim("network-1", "region-1", "bulk-1", epoch),)
    return Snapshot("network-1", epoch, nodes,
                    nodes if loaded is None else frozenset(loaded),
                    tuple(region_by_node.items()), tuple(claims),
                    frozenset(live), unknown_boundary)


class CandidateControllerAuthority(unittest.TestCase):
    def test_single_valid_claim_allows_only_verified_local_path(self):
        self.assertEqual(may_route(snap(), A, C),
                         (True, "verified_local_authority_only"))

    def test_no_claim_does_not_auto_elect_from_coordinate_or_first_placement(self):
        self.assertEqual(may_route(snap(claims=()), A, C)[1],
                         "owner_missing_or_contested")

    def test_two_claimants_cannot_both_admit_items_to_same_region(self):
        claims = (Claim("network-1", "region-1", "bulk-1", 12),
                  Claim("network-1", "region-1", "bulk-2", 12))
        self.assertEqual(may_route(snap(claims=claims, live=("bulk-1", "bulk-2")), A, C)[1],
                         "owner_missing_or_contested")

    def test_unloaded_bridge_is_unknown_not_empty_or_full(self):
        self.assertEqual(may_route(snap(loaded=(A, C)), A, C),
                         (False, "incomplete_topology"))

    def test_unknown_external_boundary_denies_even_complete_visible_graph(self):
        self.assertEqual(may_route(snap(unknown_boundary=True), A, C)[1],
                         "incomplete_topology")

    def test_old_epoch_claim_cannot_authorize_after_repartition(self):
        stale = (Claim("network-1", "region-1", "bulk-1", 11),)
        self.assertEqual(may_route(snap(claims=stale), A, C)[1],
                         "owner_stale_or_unavailable")
        self.assertTrue(may_route(snap(), A, C)[0])

    def test_controller_unloaded_is_not_implicit_failover_permission(self):
        self.assertEqual(may_route(snap(live=()), A, C)[1],
                         "owner_stale_or_unavailable")

    def test_split_does_not_inherit_old_authority(self):
        # B is removed; no path, and the old graph/claim cannot be reused.
        self.assertEqual(may_route(snap(loaded=(A, C)), A, C)[0], False)
        new = snap(nodes=(A, C), claims=(Claim("network-1", "region-1", "bulk-1", 13),),
                   epoch=13)
        self.assertEqual(may_route(new, A, C)[1], "no_verified_local_path")

    def test_two_local_controllers_allowed_but_cross_region_handoff_unproven(self):
        regions = {A: "west", B: "west", C: "east"}
        claims = (Claim("network-1", "west", "bulk-1", 12),
                  Claim("network-1", "east", "bulk-2", 12))
        s = snap(region_by_node=regions, claims=claims, live=("bulk-1", "bulk-2"))
        self.assertTrue(may_route(s, A, B)[0])
        self.assertEqual(may_route(s, B, C)[1], "cross_region_unproven")

    def test_path_cannot_traverse_different_owner_region_then_return(self):
        regions = {A: "west", B: "east", C: "west"}
        claims = (Claim("network-1", "west", "bulk-1", 12),
                  Claim("network-1", "east", "bulk-2", 12))
        s = snap(region_by_node=regions, claims=claims, live=("bulk-1", "bulk-2"))
        self.assertEqual(may_route(s, A, C)[1], "no_verified_local_path")

    def test_missing_or_duplicate_membership_denied(self):
        for regions in ({A: "region-1", B: "region-1"},
                        {A: "region-1", B: "region-1", C: "region-1", (3, 0, 0): "region-1"}):
            self.assertEqual(may_route(snap(region_by_node=regions), A, C)[1],
                             "ambiguous_membership")
        s = snap()
        duplicated = Snapshot(s.network, s.epoch, s.expected_nodes,
                              s.loaded_nodes, s.memberships + ((A, "region-1"),),
                              s.claims, s.live_controllers)
        self.assertEqual(may_route(duplicated, A, C)[1], "ambiguous_membership")

    def test_claim_from_other_network_is_not_authoritative(self):
        wrong = (Claim("network-2", "region-1", "bulk-1", 12),)
        self.assertEqual(may_route(snap(claims=wrong), A, C)[1],
                         "owner_stale_or_unavailable")

    def test_input_order_and_claim_order_do_not_change_results(self):
        regions = {A: "west", B: "west", C: "east"}
        claims = (Claim("network-1", "west", "bulk-1", 12),
                  Claim("network-1", "east", "bulk-2", 12))
        for order in permutations(tuple(regions.items())):
            for claim_order in permutations(claims):
                s = snap(region_by_node=dict(order), claims=claim_order,
                         live=("bulk-1", "bulk-2"))
                self.assertEqual(may_route(s, A, B)[0], True)
                self.assertEqual(may_route(s, A, C)[0], False)


if __name__ == "__main__":
    unittest.main()
