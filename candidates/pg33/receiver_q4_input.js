/* PG33: one bounded Receiver Q4 -> Transporter -> Sorter ordinary route.
 * This is an alternate egress ONLY when the original output Hopper is absent.
 * No new queue writer, physical journal, persistent key, controller or replay.
 * Ambiguous receipts retain PG25's global HOLD policy.
 */
/* Exact one-rig allowlist for this LAB-only delivery. A historical Q4
 * Receiver or Sorter elsewhere cannot acquire the new pipe egress simply by
 * having an old adjacent pipe. Delete/replace this LAB scope only after a
 * separately reviewed general-routing authorization.
 */
const PG33_LAB_SCOPE = Object.freeze({
    dimensionId:"minecraft:overworld",
    column:{x:-952,y:70,z:-791},
    receiver:{x:-950,y:70,z:-791}
});
function pg33LabScopeAllows(col, receiver=undefined) {
    if (!col || col.d !== PG33_LAB_SCOPE.dimensionId ||
        !col.source || col.source.x !== PG33_LAB_SCOPE.column.x ||
        col.source.y !== PG33_LAB_SCOPE.column.y ||
        col.source.z !== PG33_LAB_SCOPE.column.z) return false;
    if (receiver === undefined) return true;
    return receiver.d === PG33_LAB_SCOPE.dimensionId &&
        receiver.x === PG33_LAB_SCOPE.receiver.x &&
        receiver.y === PG33_LAB_SCOPE.receiver.y &&
        receiver.z === PG33_LAB_SCOPE.receiver.z;
}

const PG33_RECEIVER_BATCH = 64;
const PG33_DOWN = {name:"down",x:0,y:-1,z:0};

function pg33ReadReceiverInput(col) {
    if (!pg33LabScopeAllows(col) || !pg23TransportMayRun()) return undefined;
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
                    const below = pg26Neighbor(next, PG33_DOWN);
                    // Never compete with the existing Receiver -> Hopper drain.
                    // Unreadable blocks under a Receiver also refuse admission.
                    if (!below || below.typeId === "minecraft:hopper" ||
                        below.getComponent("minecraft:inventory")?.container) return undefined;
                    const idKey = logisticsId(next.dimension.id,p.x,p.y,p.z);
                    const known = findReceiverById(idKey);
                    const live = known && receiverAt(known);
                    if (!known || !pg33LabScopeAllows(col, known) ||
                        known.present === false || known.d !== col.d ||
                        known.x !== p.x || known.y !== p.y || known.z !== p.z ||
                        !live || live.typeId !== RECEIVER_ID ||
                        pg26PositionKey(live.location) !== pg26PositionKey(p) ||
                        live.dimension.id !== col.d) return undefined;
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
        // An apparently single-source graph is not exclusive if this Receiver
        // also touches a disconnected pipe network feeding another Sorter.
        // Reject all such competing physical egress attachments.
        for (const face of PG26_FACES) {
            const neighbor = pg26Neighbor(sourceBlock, face);
            if (!neighbor) return undefined;
            if (neighbor.typeId === PG26_PIPE_ID &&
                !pipes.has(pg26PositionKey(neighbor.location)))
                return undefined;
        }
        return {
            receiver, block:sourceBlock,
            fingerprint:[...pipes].sort().join("|") + ">" +
                receiver.id + ":" + pg26PositionKey(sourceBlock.location)
        };
    } catch (_) { return undefined; }
}


/* Existing q4 must already be committed. The ordinary route may use Q4 as
 * its source but may NOT initialize empty metadata or invoke q2/q3 migration
 * as a side effect of attempting a new pipe route. This gate is read-only.
 */
function pg33CommittedQ4Meta(receiver) {
    try {
        if (!receiver || receiver.qVersion !== 4 ||
            Number(receiver.qShards || 0) !== 0 ||
            Number(receiver.qGen || 0) !== 0 ||
            !Number.isSafeInteger(receiver.queued) || receiver.queued < 0)
            return undefined;
        const raw = world.getDynamicProperty(queueMetaKey(receiver));
        const legacy = world.getDynamicProperty(legacyQ3MetaKey(receiver));
        if (typeof raw !== "string" || !raw.length ||
            (legacy !== undefined && legacy !== null && legacy !== ""))
            return undefined;
        return raw;
    } catch (_) { return undefined; }
}

function pg33StillMatches(col, expected) {
    const actual = pg33ReadReceiverInput(col);
    return !!actual && actual.receiver.id === expected.receiver.id &&
        actual.fingerprint === expected.fingerprint;
}

/* Only one non-aliased 27-slot native chest/barrel may receive new pipe
 * output. Reject all double chests, unknown neighbors and other inventories.
 */
function pg33NativeOutputAllowed(col, target) {
    try {
        if (!target || target.kind !== "storage" ||
            !target.container?.isValid || target.container.size !== 27 ||
            !target.block || !pg26SameChunk(col, target.block) ||
            target.block.location.y >= col.source.y) return false;
        const id = target.block.typeId;
        if (id !== "minecraft:chest" && id !== "minecraft:barrel")
            return false;
        if (id === "minecraft:chest") {
            for (const face of PG26_FACES) {
                if (face.y !== 0) continue;
                const neighbor = pg26Neighbor(target.block, face);
                if (!neighbor || neighbor.typeId === id) return false;
            }
        }
        return true;
    } catch (_) { return false; }
}

function pg33ProcessReceiverColumn(col, globalRemaining) {
    if (globalRemaining <= 0) return 0;
    const route = pg33ReadReceiverInput(col);
    if (!route) return 0;
    const committedQ4 = pg33CommittedQ4Meta(route.receiver);
    if (committedQ4 === undefined) return 0;

    let queue, first, item;
    try {
        queue = loadReceiverQueue(route.receiver);
        if (queue.total <= 0) return 0;
        first = queueHeadEntry(route.receiver, queue);
        if (!first || (Number(first.amount) || 0) <= 0) return 0;
        item = rebuildQueueItem(first.data, 1);
        // This prototype is ordinary-stack Q4 extraction, never an opaque
        // metadata-rich or nonstackable item bank.
        const rebuiltData = item && item.maxAmount > 1
            ? serializeQueueItem(item) : undefined;
        if (!rebuiltData ||
            queueDataSignature(rebuiltData) !== queueDataSignature(first.data))
            return 0;
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
        if (!pg33NativeOutputAllowed(col, target)) continue;
        // New pipe branch is empty-slot-only, even if Q4's legacy Hopper
        // output can merge into an existing stack. No direct Collector/Q4 loop.
        if (!pg26EmptyDestinationSlot(target.container, item)) continue;
        const admittedMode = sorterMode(entry);
        const revalidate = () => {
            if (!pg23TransportMayRun() ||
                pg33CommittedQ4Meta(route.receiver) !== committedQ4 ||
                !pg33StillMatches(col, route) ||
                blockIsRedstonePowered(sorterAt(entry)) ||
                sorterMode(entry) !== admittedMode) return false;
            if (admittedMode === "filter" &&
                (!entry.f || !matchesFilter(item, entry.f))) return false;
            if (admittedMode === "auto" && !autoSorterMatches(item, entry))
                return false;
            const now = destinationFor(entry);
            return pg33NativeOutputAllowed(col, now) &&
                now.block.typeId === target.block.typeId &&
                pg26PositionKey(now.block.location) ===
                    pg26PositionKey(target.block.location) &&
                now.container.size === target.container.size &&
                !!pg26EmptyDestinationSlot(now.container, item);
        };
        if (!revalidate()) return 0;
        try {
            // Existing Q4 dequeue journal is the ONLY queue debit / physical
            // credit writer. PG25 recovered receipts always HOLD, never replay.
            return dequeueToReceiver(route.receiver,
                {block:target.block,container:target.container},
                Math.min(PG33_RECEIVER_BATCH, globalRemaining),
                {emptyOnly:true,revalidate,
                 expectedHead:{id:first.id,amount:Number(first.amount),
                               sig:queueDataSignature(first.data)}});
        } catch (err) {
            log("PG33 Receiver -> Transporter dequeue failed: " + err);
            recoverQueueJournal();
            return 0;
        }
    }
    return 0;
}
