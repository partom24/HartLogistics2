/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * URCE U1-A: source-local, read-only Column Coordinator decision boundary.
 *
 * No Bedrock imports, inventory writes, Collector registration, Q4 queue
 * access, world properties, journal writes or across-tick state.
 *
 * Caller supplies the same live registry entries, source Container and
 * matcher functions that legacy processColumn used. Passing a Container
 * permits synchronous getItem reads ONLY; no persistent inventory snapshot.
 */

export function classifySorterDestinationType(typeId, collectorId) {
    if (typeId === collectorId) return "collector";
    if (typeId === "minecraft:chest" ||
        typeId === "minecraft:trapped_chest" ||
        typeId === "minecraft:barrel" ||
        typeId === "minecraft:shulker_box" ||
        (typeof typeId === "string" && typeId.endsWith("_shulker_box"))) {
        return "storage";
    }
    return undefined;
}

/**
 * U1-B: side-effect-free destination probe. Returns the currently observed
 * physical kind and block only. No Collector registration, Receiver Q4 load,
 * inventory component lookup, persistent property or route authorization.
 *
 * sorterAt and facingOffset are the existing live read-only helpers injected
 * by main.js. Any unknown/unloaded destination returns undefined.
 * No native Block/Container is retained beyond the synchronous caller.
 */
export function observeSorterDestination(entry, sorterAt, facingOffset, collectorId) {
    const sourceSorter = sorterAt(entry);
    if (!sourceSorter) return undefined;
    const off = facingOffset(sourceSorter);
    if (!off) return undefined;

    let dest;
    try {
        dest = sourceSorter.dimension.getBlock({
            x: sourceSorter.location.x + off.x,
            y: sourceSorter.location.y,
            z: sourceSorter.location.z + off.z
        });
    } catch (_) {
        return undefined;
    }
    if (!dest) return undefined;
    const kind = classifySorterDestinationType(dest.typeId, collectorId);
    return kind ? {kind, block: dest} : undefined;
}

/**
 * Only a proven all-Filter/Bypass nonmatch may avoid destination resolution.
 * Source may hold up to five distinct ItemStacks; no slot may be skipped.
 * Preserve the existing no-Filter Bypass-only transit behavior.
 *
 * Unknown modes, a positive Filter match, unreadable slots and matcher errors
 * all fail the shortcut. This does NOT move or compact cargo.
 */
export function proveLocalColumnTransit(sorters, source, modeOf, matches) {
    let hasFilter = false;
    for (const entry of sorters) {
        const mode = modeOf(entry);
        if (mode !== "filter" && mode !== "bypass") return false;
        if (mode === "filter") hasFilter = true;
    }
    if (!hasFilter) return true;

    let observedItem = false;
    try {
        const sourceSize = source.size;
        for (let si = 0; si < sourceSize; si++) {
            const stack = source.getItem(si);
            if (!stack) continue;
            observedItem = true;
            for (const entry of sorters) {
                if (modeOf(entry) === "filter" && entry.f &&
                    matches(stack, entry.f)) return false;
            }
        }
    } catch (_) {
        // Native inventory is unavailable, Filter identity cannot be proven,
        // or the matcher threw: no cached/guessed transit authorization.
        return false;
    }
    return observedItem;
}

/**
 * Equivalent to legacy processColumn candidate ordering:
 * Filter matches first, then deferred live-seeded Auto, then Wildcard;
 * stable bottom-to-top order inside each tier. Native storage admission,
 * Auto seed, Sorter power/availability and destinationFor remain downstream.
 */
export function orderedLocalSorterCandidates(activeSorters, stack, modeOf, matches) {
    const specific = activeSorters.filter(e =>
        modeOf(e) === "filter" && e.f && matches(stack, e.f));
    const auto = activeSorters.filter(e => modeOf(e) === "auto");
    const wildcard = activeSorters.filter(e => modeOf(e) === "wildcard");
    return [...specific, ...auto, ...wildcard];
}
