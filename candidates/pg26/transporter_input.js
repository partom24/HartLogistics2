/* PG26: bounded ordinary-only, single-source/single-column Transporter input.
 * Pipes own no items or virtual balances. Only the existing Sorter writer can
 * transfer; its physical/Q4 journals and conservative recovery remain in force.
 * No controller election, MR storage, Bulk capacity or crash-atomicity claim.
 */
const PG26_PIPE_ID = "hartlogistics:transporter";
const PG26_MAX_PIPES = 16;
const PG26_COLUMN_BATCH = 64;
const PG26_FACES = Object.freeze([
    {name:"north",x:0,y:0,z:-1}, {name:"south",x:0,y:0,z:1},
    {name:"east",x:1,y:0,z:0}, {name:"west",x:-1,y:0,z:0},
    {name:"up",x:0,y:1,z:0}, {name:"down",x:0,y:-1,z:0}
]);

function pg26PositionKey(p) {
    return `${p.x},${p.y},${p.z}`;
}

function pg26Neighbor(block, face) {
    const p = block.location;
    try { return block.dimension.getBlock({x:p.x+face.x,y:p.y+face.y,z:p.z+face.z}); }
    catch (_) { return undefined; }
}

function pg26RefreshConnections(block) {
    if (!block || block.typeId !== PG26_PIPE_ID) return;
    try {
        let permutation = block.permutation;
        let changed = false;
        for (const face of PG26_FACES) {
            const next = pg26Neighbor(block, face);
            const linked = !!next && (next.typeId === PG26_PIPE_ID ||
                (face.name === "down" && next.typeId === SORTER_ID) ||
                next.typeId === "minecraft:chest" || next.typeId === "minecraft:barrel");
            const state = "hartlogistics:connect_" + face.name;
            if (permutation.getState(state) !== linked) {
                permutation = permutation.withState(state, linked);
                changed = true;
            }
        }
        if (changed) block.setPermutation(permutation);
    } catch (_) {
        // Visual state is not transfer authority. The live graph is always
        // independently re-read by the admission path below.
    }
}

function pg26ReadTransportInput(col) {
    if (!pg23TransportMayRun()) return undefined;
    const dim = getDimension(col.d);
    if (!dim) return undefined;
    let root;
    try { root = dim.getBlock(col.source); } catch (_) { return undefined; }
    if (!root || root.typeId !== PG26_PIPE_ID) return undefined;
    const pending = [root], pipes = new Map(), sources = new Map(), ends = new Set();
    try {
        while (pending.length) {
            const pipe = pending.pop(), key = pg26PositionKey(pipe.location);
            if (pipes.has(key)) continue;
            if (pipes.size >= PG26_MAX_PIPES || pipe.location.y < col.source.y ||
                blockIsRedstonePowered(pipe)) return undefined;
            pipes.set(key, pipe);
            for (const face of PG26_FACES) {
                const next = pg26Neighbor(pipe, face);
                // An unreadable frontier cannot be assumed to be empty air.
                if (!next) return undefined;
                const id = next.typeId, p = next.location;
                if (id === PG26_PIPE_ID) {
                    if (!pipes.has(pg26PositionKey(p))) pending.push(next);
                } else if (id === SORTER_ID) {
                    if (face.name !== "down" || p.x !== col.source.x ||
                        p.y !== col.source.y-1 || p.z !== col.source.z) return undefined;
                    ends.add(pg26PositionKey(p));
                } else if (id === "minecraft:chest" || id === "minecraft:barrel") {
                    if (p.y < col.source.y) return undefined;
                    // Refuse double chests: two block coordinates can alias
                    // one inventory, including an unobserved second half.
                    if (id === "minecraft:chest") {
                        for (const side of PG26_FACES.filter(f => f.y === 0)) {
                            const neighbor = pg26Neighbor(next, side);
                            if (!neighbor || neighbor.typeId === id) return undefined;
                        }
                    }
                    const container = next.getComponent("minecraft:inventory")?.container;
                    if (!container?.isValid || container.size !== 27) return undefined;
                    sources.set(pg26PositionKey(p), {block:next,container});
                    if (sources.size > 1) return undefined;
                } else if (id === COLLECTOR_ID || id === RECEIVER_ID ||
                           next.getComponent("minecraft:inventory")?.container) {
                    // No undeclared virtual endpoints or foreign inventories.
                    return undefined;
                }
            }
        }
        if (sources.size !== 1 || ends.size !== 1) return undefined;
        const input = [...sources.values()][0];
        return {...input, fingerprint:[...pipes.keys()].sort().join("|") +
            ">" + input.block.typeId + ":" + pg26PositionKey(input.block.location)};
    } catch (_) { return undefined; }
}

function pg26TransportStillMatches(col, expected) {
    const current = pg26ReadTransportInput(col);
    return !!current && current.fingerprint === expected.fingerprint &&
        current.block.typeId === expected.block.typeId && expected.container.isValid;
}

function pg26EmptyDestinationSlot(container, stack) {
    if (!container?.isValid || !stack || stack.amount > stack.maxAmount) return undefined;
    for (let slot=0; slot<container.size; slot++) {
        if (container.getItem(slot) === undefined)
            return {slot,before:0,room:stack.maxAmount};
    }
    return undefined;
}

system.beforeEvents.startup.subscribe(event => {
    event.blockComponentRegistry.registerCustomComponent("hartlogistics:transporter_connections", {
        onTick: ev => pg26RefreshConnections(ev.block),
        onPlace: ev => pg26RefreshConnections(ev.block)
    });
});
