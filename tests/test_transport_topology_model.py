"""Offline-only six-face pipe connectivity hypothesis, NOT Minecraft gameplay code.

Deterministic BFS over loaded, known pipe nodes for prospective Transporters.
Does not select controllers, admit items, assume missing chunks are empty, or
replace the existing Hopper source implementation.
"""
from collections import deque
from itertools import permutations
import unittest

FACES = (
    (-1, 0, 0), (0, -1, 0), (0, 0, -1),
    (0, 0, 1), (0, 1, 0), (1, 0, 0)
)


def adjacent(node, valid):
    x, y, z = node
    return tuple(
        (x + dx, y + dy, z + dz)
        for dx, dy, dz in FACES
        if (x + dx, y + dy, z + dz) in valid
    )


def known_path(pipes, source, target, unavailable=frozenset()):
    """Return only a path fully present in the known, loaded pipe set."""
    known = set(pipes) - set(unavailable)
    if source not in known or target not in known:
        return None
    visited = {source}
    paths = deque([(source,)])
    while paths:
        path = paths.popleft()
        point = path[-1]
        if point == target:
            return path
        for nxt in adjacent(point, known):
            if nxt not in visited:
                visited.add(nxt)
                paths.append(path + (nxt,))
    return None


def known_components(pipes):
    remaining = set(pipes)
    result = []
    while remaining:
        start = min(remaining)
        queue = deque([start])
        remaining.remove(start)
        component = {start}
        while queue:
            for nbr in adjacent(queue.popleft(), remaining):
                remaining.remove(nbr)
                component.add(nbr)
                queue.append(nbr)
        result.append(frozenset(component))
    return tuple(sorted(result, key=lambda c: min(c)))


class CandidatePipeTopology(unittest.TestCase):
    def test_exact_six_faces_not_diagonal(self):
        origin = (0, 0, 0)
        nodes = {origin}
        nodes.update(FACES)
        nodes.update({(1, 1, 0), (1, 1, 1), (2, 0, 0)})
        self.assertEqual(set(adjacent(origin, nodes)), set(FACES))

    def test_linear_pipe_has_shortest_path(self):
        nodes = {(x, 8, 3) for x in range(8)}
        got = known_path(nodes, (0, 8, 3), (7, 8, 3))
        self.assertEqual(len(got), 8)
        self.assertEqual(len(set(got)), len(got))

    def test_loop_terminates_without_repeating_nodes(self):
        ring = {(0, 0, 0), (1, 0, 0), (2, 0, 0), (2, 0, 1),
                (2, 0, 2), (1, 0, 2), (0, 0, 2), (0, 0, 1)}
        for start in ring:
            for goal in ring:
                path = known_path(ring, start, goal)
                self.assertIsNotNone(path)
                self.assertEqual(len(path), len(set(path)))
                self.assertLessEqual(len(path), len(ring))

    def test_unloaded_pipe_blocks_cannot_create_phantom_route(self):
        known = {(0, 0, 0), (1, 0, 0), (2, 0, 0)}
        self.assertIsNone(known_path(known, (0, 0, 0), (3, 0, 0)))
        self.assertIsNone(known_path(known, (0, 0, 0), (2, 0, 0),
                                     unavailable={(1, 0, 0)}))

    def test_split_and_merge_change_components_deterministically(self):
        graph = {(0, 0, 0), (1, 0, 0), (2, 0, 0)}
        self.assertEqual(len(known_components(graph)), 1)
        self.assertEqual(len(known_components(graph - {(1, 0, 0)})), 2)
        self.assertEqual(len(known_components(graph)), 1)

    def test_input_order_cannot_change_route_through_cross(self):
        nodes = [(0, 0, 0), (1, 0, 0), (2, 0, 0), (1, 0, 1),
                 (0, 0, 1), (2, 0, 1)]
        expected = known_path(nodes, (0, 0, 0), (2, 0, 1))
        count = 0
        for order in permutations(nodes):
            self.assertEqual(known_path(order, (0, 0, 0), (2, 0, 1)),
                             expected)
            count += 1
        self.assertEqual(count, 720)

    def test_no_controller_election_claim_from_partial_topology(self):
        # This proof only maps connections, not unload-sensitive controller
        # ownership, chosen controller rank or source/sink permissions.
        self.assertIsNone(known_path({(0, 0, 0)}, (0, 0, 0), (1, 0, 0)))


if __name__ == "__main__":
    unittest.main()
