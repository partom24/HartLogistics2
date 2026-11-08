/* PG28: one bounded Receiver Q4 -> Transporter -> Sorter ordinary route.
 * This is an alternate egress ONLY when the original output Hopper is absent.
 * No new queue writer, physical journal, persistent key, controller or replay.
 * Ambiguous receipts retain PG25's global HOLD policy.
 */
const PG28_RECEIVER_BATCH = 64;
const PG28_DOWN = {name:"down",x:0,y:-1,z:0};

function pg28ReadReceiverInput(col) {
    if (!pg23TransportMayRun()) return undefined;
    const dim = getDimension(col.d);
    if (!dim) return undefined;
    let root;
    try { root = dim.getBlock(col.source); } catch (_) { return undefined; }
    if (!root || root.typeId !== PG26_PIPE_ID) return undefined;

    const pending = [root], pipes = new Set(), ends = new Set();
    let sourceBlock, receiver;
    try {
        while (pending.length) {
            const pipe = pending.pop();
            const key = pg26PositionKey(pipe.location);
            if (pipes.has(key)) continue;
            if (pipes.size >= PG26_MAX_PIPES || !pg26SameChunk(col, pipe) ||
                pipe.location.y < col.source.y || blockIsRedstonePowered(pipe)) return undefined;
            pipes.add(key);
            for (const face of PG26_FACES) {
                const next = pg26Neighbor(pipe, face);
                if (!next) return undefined; // Unknown frontier is not air.
                const id = next.typeId, p = next.location;
                if (id === PG26_PIPE_ID) {
                    if (!pipes.has(pg26PositionKey(p))) pending.push(next);
                } else if (id === SORTER_ID) {
                    if (!pg26SameChunk(col, next) || face.name !== "down" ||
                        p.x !== col.source.x || p.y !== col.source.y-1 ||
                        p.z !== col.source.z) return undefined;
                    ends.add(pg26PositionKey(p));
                } else if (id === RECEIVER_ID) {
                    if (sourceBlock || !pg26SameChunk(col, next) ||
                        p.y < col.source.y || blockIsRedstonePowered(next)) return undefined;
                    const below = pg26Neighbor(next, PG28_DOWN);
                    // Never compete with the existing Receiver -> Hopper drain.
                    // Unreadable blocks under a Receiver also refuse admission.
                    if (!below || below.typeId === "minecraft:hopper") return undefined;
                    const idKey = logisticsId(next.dimension.id,p.x,p.y,p.z);
                    const known = findReceiverById(idKey);
                    if (!known || known.present === false || !receiverAt(known)) return undefined;
                    sourceBlock = next;
                    receiver = known;
                } else if (id === COLLECTOR_ID ||
                           id === "minecraft:chest" || id === "minecraft:barrel" ||
                           next.getComponent("minecraft:inventory")?.container) {
                    // No competing inventory source, unregistered virtual source
                    // or pipe -> ordinary-container output.
                    return undefined;
                }
            }
        }
        if (!sourceBlock || ends.size !== 1) return undefined;
        return {
            receiver, block:sourceBlock,
            fingerprint:[...pipes].sort().join("|") + ">" +
                receiver.id + ":" + pg26PositionKey(sourceBlock.location)
        };
    } catch (_) { return undefined; }
}

function pg28StillMatches(col, expected) {
    const actual = pg28ReadReceiverInput(col);
    return !!actual && actual.receiver.id === expected.receiver.id &&
        actual.fingerprint === expected.fingerprint;
}

function pg28ProcessReceiverColumn(col, globalRemaining) {
    if (globalRemaining <= 0) return 0;
    const route = pg28ReadReceiverInput(col);
    if (!route) return 0;

    let queue, first, item;
    try {
        queue = loadReceiverQueue(route.receiver);
        if (queue.total <= 0) return 0;
        first = queueHeadEntry(route.receiver, queue);
        if (!first || (Number(first.amount) || 0) <= 0) return 0;
        item = rebuildQueueItem(first.data, 1);
        // This prototype is ordinary-stack Q4 extraction, never an opaque
        // metadata-rich or nonstackable item bank.
        if (!item || item.maxAmount <= 1 || !serializeQueueItem(item)) return 0;
    } catch (_) { return 0; }

    const active = col.sorters.filter(e => {
        const block = sorterAt(e);
        return block && !e.nativeQuarantine &&
            !blockIsRedstonePowered(block) && sorterMode(e) !== "bypass";
    });
    const exact = active.filter(e => sorterMode(e) === "filter" && e.f &&
        matchesFilter(item, e.f));
    const auto = active.filter(e => sorterMode(e) === "auto" &&
        autoSorterMatches(item, e));
    const wildcard = active.filter(e => sorterMode(e) === "wildcard");
    for (const entry of [...exact, ...auto, ...wildcard]) {
        const target = destinationFor(entry);
        if (!target || target.kind !== "storage" || !target.container?.isValid ||
            !pg26SameChunk(col, target.block) ||
            target.block.location.y >= col.source.y) continue;
        // New pipe branch is empty-slot-only, even if Q4's legacy Hopper
        // output can merge into an existing stack. No direct Collector/Q4 loop.
        if (!pg26EmptyDestinationSlot(target.container, item)) continue;
        const revalidate = () => {
            if (!pg28StillMatches(col, route) ||
                blockIsRedstonePowered(sorterAt(entry))) return false;
            const now = destinationFor(entry);
            return !!now && now.kind === "storage" &&
                now.block.typeId === target.block.typeId &&
                pg26PositionKey(now.block.location) ===
                    pg26PositionKey(target.block.location) &&
                now.container?.isValid && pg26SameChunk(col, now.block) &&
                now.block.location.y < col.source.y;
        };
        if (!revalidate()) return 0;
        try {
            // Existing Q4 dequeue journal is the ONLY queue debit / physical
            // credit writer. PG25 recovered receipts always HOLD, never replay.
            return dequeueToReceiver(route.receiver,
                {block:target.block,container:target.container},
                Math.min(PG28_RECEIVER_BATCH, globalRemaining),
                {emptyOnly:true,revalidate});
        } catch (err) {
            log("PG28 Receiver -> Transporter dequeue failed: " + err);
            recoverQueueJournal();
            return 0;
        }
    }
    return 0;
}
