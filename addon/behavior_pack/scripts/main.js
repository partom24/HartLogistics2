/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {
    world,
    system,
    ItemStack,
    BlockPermutation,
    EquipmentSlot,
    EnchantmentTypes,
    Potions,
    CommandPermissionLevel
} from "@minecraft/server";

const VERSION = "1.4.1";
// Per-player acknowledgement is intentionally separate from pack version: patch updates
// do not repeat the native-frame upgrade announcement.
const NATIVE_FRAME_NOTICE_KEY = "hartlogistics:native_frame_notice_v1";
const nativeFrameNoticeSeenThisSession = new Set();

function showNativeFrameUpgradeNotice(player) {
    if (!player) return;
    try {
        if (player.getDynamicProperty(NATIVE_FRAME_NOTICE_KEY) === true) return;
        const lines = [
            "§6[Hart Logistics 1.4] §fSorters now use native Item Frames for filters!",
            "§7Existing Sorters keep working and convert when their filters are removed.",
            "§7Right-click the upper front indicator to change modes; punch the frame to retrieve its filter.",
            "§bNew controls & upgrade guide: §fhttps://www.curseforge.com/minecraft-bedrock/addons/hartlogistics"
        ];
        for (const line of lines) player.sendMessage(line);
        player.setDynamicProperty(NATIVE_FRAME_NOTICE_KEY, true);
    } catch (err) {
        // In case player dynamic properties are unavailable, never flood chat.
        console.warn(`[Hart Logistics ${VERSION}] Upgrade notice acknowledgement unavailable: ${err}`);
    }
}

world.afterEvents.playerSpawn.subscribe(ev => {
    if (!ev.initialSpawn) return;
    const player = ev.player;
    const key = player.id;
    if (nativeFrameNoticeSeenThisSession.has(key)) return;
    nativeFrameNoticeSeenThisSession.add(key);
    system.runTimeout(() => {
        try { showNativeFrameUpgradeNotice(player); } catch (_) {}
    }, 60);
});

const SORTER_MODE_STATE = "hartlogistics:mode";
const SORTER_MODES = ["filter", "wildcard", "auto", "bypass"];
// On older 1.3.2 registry entries no mode is stored; preserve filter/wildcard semantics.
let modeVisualRr = 0;
const modeVisualWarnings = new Set();
const SORTER_ID = "hartsorter:sorter";
const DISPLAY_ID = "hartsorter:filter_display";
const DISPLAY_OWNER_PROP = "hartsorter:owner";
const DISPLAY_TAG = "hartsorter_filter_display";
// v1 stored the entire Sorter registry in one dynamic-property string.
// Bedrock caps one dynamic-property string at 32,767 characters, which large
// storage rooms can exceed. v2 uses generation-switched 24k shards.
const LEGACY_REGISTRY_KEY = "hartsorter:registry_v1";
const REGISTRY_META_KEY = "hartsorter:registry_v2";
const REGISTRY_SHARD_CHARS = 24000;
const JOURNAL_KEY = "hartsorter:journal_v1";
const COLLECTOR_ID = "hartsorter:collector";
const RECEIVER_ID = "hartsorter:receiver";
const LEGACY_LOGISTICS_KEY = "hartsorter:logistics_v1";
const LOGISTICS_KEY = "hartsorter:logistics_v2";
const QUEUE_JOURNAL_KEY = "hartsorter:queue_journal_v1";
const QUEUE_CAPACITY = 250000;
const QUEUE_ENTRY_MAX_CHARS = 30000;
const QUEUE_PAGE_SIZE = 64;
const QUEUE_PAGE_MAX_CHARS = 30000;
const COLLECTOR_BATCH = 16;
const RECEIVER_BATCH = 16;
const LOGISTICS_GLOBAL_BUDGET = 256;

const PER_COLUMN_BATCH = 16;
const GLOBAL_MOVE_BUDGET = 256;

let registry = [];
let columns = [];
let dirty = true;
let rrStart = 0;
let ready = false;
const displaySpawnFailures = new Set();

let logistics = {collectors: [], receivers: [], nextQueue: 1};
const pendingCollectorByPlayer = new Map();
const queueCache = new Map();
let logisticsDirty = false;
const queueIoStats = {pageWrites: 0, definitionWrites: 0, metaWrites: 0, chars: 0, migrations: 0};
let collectorRrStart = 0;
let receiverRrStart = 0;
const queueRejectSeen = new Set();

const HART_REDSTONE_COMPONENT = "hartlogistics:redstone_input";
const hartRedstoneState = new Map();

function log(msg) {
    console.warn(`[Hart Logistics ${VERSION}] ${msg}`);
}

function setWorldDynamic(key, value) {
    world.setDynamicProperty(key, value);
}

function locKey(dim, x, y, z) {
    return `${dim}|${x}|${y}|${z}`;
}

function hartRedstoneKey(block) {
    if (!block) return undefined;
    try {
        const p = block.location;
        return locKey(block.dimension.id, p.x, p.y, p.z);
    } catch (_) {
        return undefined;
    }
}

function updateHartRedstoneState(ev) {
    const block = ev?.block;
    const key = hartRedstoneKey(block);
    if (!key) return;

    const power = Math.max(0, Number(ev.powerLevel) || 0);
    const previous = Math.max(0, Number(ev.previousPowerLevel) || 0);

    hartRedstoneState.set(key, {
        power,
        previous,
        tick: system.currentTick
    });

}

function recentHartRedstoneState(block) {
    const key = hartRedstoneKey(block);
    return key ? hartRedstoneState.get(key) : undefined;
}

function collectorAllowsEjectedPulse(block) {
    if (!block) return false;

    const state = recentHartRedstoneState(block);
    if (!state) return !blockIsRedstonePowered(block);

    if (state.power <= 0) return true;

    // A genuine Dropper/Dispenser firing pulse can momentarily power the
    // adjacent Collector. Allow only a very recent rising edge so a Collector
    // that is deliberately held powered by a torch/lever remains inhibited.
    //
    // The ejected-item path may retry for a few ticks while the item component
    // and source triggered_bit settle, so keep a small grace window.
    const age = Math.max(0, system.currentTick - state.tick);
    return state.previous <= 0 && age <= 6;
}

function safeJsonParse(v, fallback) {
    if (typeof v !== "string" || v.length === 0) return fallback;
    try { return JSON.parse(v); } catch (_) { return fallback; }
}

function registryShardKey(gen, index) {
    return `hartsorter:r2_${gen}_${index}`;
}

function registryMeta() {
    const meta = safeJsonParse(world.getDynamicProperty(REGISTRY_META_KEY), undefined);
    if (!meta || (meta.gen !== 0 && meta.gen !== 1)) return undefined;
    if (!Number.isInteger(meta.shards) || meta.shards < 1) return undefined;
    return meta;
}

function splitRegistryPayload(text) {
    const parts = [];
    let start = 0;

    while (start < text.length) {
        let end = Math.min(start + REGISTRY_SHARD_CHARS, text.length);

        // Do not split a UTF-16 surrogate pair between dynamic properties.
        if (end < text.length) {
            const c = text.charCodeAt(end - 1);
            if (c >= 0xD800 && c <= 0xDBFF) end--;
        }

        parts.push(text.slice(start, end));
        start = end;
    }

    if (!parts.length) parts.push("[]");
    return parts;
}

function saveRegistry() {
    const payload = JSON.stringify(registry);
    const parts = splitRegistryPayload(payload);

    const oldMeta = registryMeta();
    const oldGen = oldMeta?.gen ?? 0;
    const oldShards = oldMeta?.shards ?? 0;
    const newGen = oldMeta ? (oldGen === 0 ? 1 : 0) : 1;

    // Write the inactive generation first. The small metadata property below
    // is the commit point. A crash before it leaves the previous generation
    // authoritative.
    for (let i = 0; i < parts.length; i++) {
        setWorldDynamic(registryShardKey(newGen, i), parts[i]);
    }

    setWorldDynamic(REGISTRY_META_KEY, JSON.stringify({
        version: 2,
        gen: newGen,
        shards: parts.length,
        count: registry.length,
        chars: payload.length
    }));

    // The old generation is stale only after the metadata switch succeeds.
    // Cleanup failure is harmless; it will simply be overwritten next cycle.
    for (let i = 0; i < oldShards; i++) {
        try { setWorldDynamic(registryShardKey(oldGen, i), undefined); } catch (_) {}
    }
}

function loadRegistry() {
    const meta = registryMeta();

    if (meta) {
        try {
            let payload = "";
            for (let i = 0; i < meta.shards; i++) {
                const part = world.getDynamicProperty(registryShardKey(meta.gen, i));
                if (typeof part !== "string") {
                    throw new Error(`missing registry shard ${i}/${meta.shards}`);
                }
                payload += part;
            }

            const parsed = JSON.parse(payload);
            if (!Array.isArray(parsed)) throw new Error("registry payload is not an array");
            return parsed;
        } catch (err) {
            log(`v2 registry load failed; trying legacy v1 backup: ${err}`);
        }
    }

    // One-time migration/fallback from the original single dynamic property.
    const legacy = safeJsonParse(world.getDynamicProperty(LEGACY_REGISTRY_KEY), []);
    if (!Array.isArray(legacy)) return [];

    registry = legacy;
    try {
        saveRegistry();
        const migrated = registryMeta();
        log(
            `migrated sorter registry v1 -> v2; entries=${legacy.length}, ` +
            `shards=${migrated?.shards ?? "?"}`
        );
    } catch (err) {
        // Keep running from the successfully loaded legacy data. The migration
        // will be retried on the next registry write/startup.
        log(`registry v2 migration deferred: ${err}`);
    }

    return legacy;
}

function registryStorageSummary() {
    const meta = registryMeta();
    if (!meta) return "legacy-v1";
    return `v2 ${meta.shards} shard${meta.shards === 1 ? "" : "s"} / ${meta.chars ?? "?"} chars`;
}

function queueStorageSnapshot() {
    let pageProps = 0;
    let definitionProps = 0;
    let metaProps = 0;
    let legacyQ3Props = 0;
    let pageChars = 0;
    let definitionChars = 0;
    let metaChars = 0;
    let legacyQ3Chars = 0;

    try {
        for (const id of world.getDynamicPropertyIds()) {
            const isPage = id.startsWith("hartsorter:q4p_");
            const isDefinition = id.startsWith("hartsorter:q4d_");
            const isMeta = id.startsWith("hartsorter:q4m_");
            const isLegacyQ3 = id.startsWith("hartsorter:q3e_") || id.startsWith("hartsorter:q3m_");
            if (!isPage && !isDefinition && !isMeta && !isLegacyQ3) continue;

            const value = world.getDynamicProperty(id);
            const chars = typeof value === "string" ? value.length : 0;
            if (isPage) {
                pageProps++;
                pageChars += chars;
            } else if (isDefinition) {
                definitionProps++;
                definitionChars += chars;
            } else if (isMeta) {
                metaProps++;
                metaChars += chars;
            } else {
                legacyQ3Props++;
                legacyQ3Chars += chars;
            }
        }
    } catch (_) {}


    return {
        pageProps, definitionProps, metaProps, legacyQ3Props,
        pageChars, definitionChars, metaChars, legacyQ3Chars,
        queueChars: pageChars + definitionChars + metaChars
    };
}

function diagnosticsSnapshot() {
    const meta = registryMeta();
    const queueStorage = queueStorageSnapshot();

    const collectorCount = logistics.collectors.length;
    const receiverCount = logistics.receivers.length;
    const linkedCollectors = logistics.collectors.filter(c => !!c.link && !!findReceiverById(c.link)).length;
    const unlinkedCollectors = collectorCount - linkedCollectors;

    let totalQueued = 0;
    let largestQueued = 0;
    let largestReceiver = undefined;
    let totalReceived = 0;
    let totalDelivered = 0;
    let q4Receivers = 0;

    for (const r of logistics.receivers) {
        if (typeof world.getDynamicProperty(queueMetaKey(r)) === "string") q4Receivers++;
        const queued = Math.max(0, Number(r.queued) || 0);
        totalQueued += queued;
        totalReceived += Math.max(0, Number(r.received) || 0);
        totalDelivered += Math.max(0, Number(r.delivered) || 0);

        if (queued > largestQueued) {
            largestQueued = queued;
            largestReceiver = r;
        }
    }

    return {
        sorters: registry.length,
        registryMode: meta ? "v2" : "legacy-v1",
        registryShards: meta?.shards ?? 0,
        registryChars: meta?.chars ?? JSON.stringify(registry).length,
        collectors: collectorCount,
        linkedCollectors,
        unlinkedCollectors,
        receivers: receiverCount,
        totalQueued,
        largestQueued,
        largestReceiver,
        totalReceived,
        totalDelivered,
        q4Receivers,
        queueCurrentPages: queueStorage.pageProps,
        queueCurrentDefinitions: queueStorage.definitionProps,
        queueCurrentMeta: queueStorage.metaProps,
        queueLegacyQ3Props: queueStorage.legacyQ3Props,
        queueCurrentChars: queueStorage.queueChars,
        queuePageWrites: queueIoStats.pageWrites,
        queueDefinitionWrites: queueIoStats.definitionWrites,
        queueMetaWrites: queueIoStats.metaWrites,
        queueWriteChars: queueIoStats.chars,
        queueMigrations: queueIoStats.migrations,
        sorterJournalPending: !!world.getDynamicProperty(JOURNAL_KEY),
        queueJournalPending: !!world.getDynamicProperty(QUEUE_JOURNAL_KEY)
    };
}

function sendDiagnostics(origin) {
    const s = diagnosticsSnapshot();

    const receiverLabel = s.largestReceiver
        ? `${s.largestReceiver.d} ${s.largestReceiver.x},${s.largestReceiver.y},${s.largestReceiver.z}`
        : "none";

    const lines = [
        `§6[Hart Logistics ${VERSION}] §fStatus`,
        `§7Sorters: §f${s.sorters} §8| §7Registry: §f${s.registryMode} ${s.registryShards} shard${s.registryShards === 1 ? "" : "s"} / ${s.registryChars} chars`,
        `§7Collectors: §f${s.collectors} §8(§a${s.linkedCollectors} linked§8 / §7${s.unlinkedCollectors} unlinked§8) §8| §7Receivers: §f${s.receivers}`,
        `§7Queued: §f${s.totalQueued} §8| §7Largest queue: §f${s.largestQueued}/${QUEUE_CAPACITY} §8@ §7${receiverLabel}`,
        `§7Queue store: §fq4 paged ${s.q4Receivers}/${s.receivers} Receivers §8| §7current: §f${s.queueCurrentPages} pages + ${s.queueCurrentDefinitions} defs + ${s.queueCurrentMeta} meta / ${s.queueCurrentChars} chars` +
            `${s.queueLegacyQ3Props ? ` §8| §6legacy q3 props: §f${s.queueLegacyQ3Props}` : ""}`,
        `§7Queue session: §f${s.queuePageWrites} page writes + ${s.queueDefinitionWrites} definition writes + ${s.queueMetaWrites} meta writes §8| §7migrations: §f${s.queueMigrations}`,
        `§7Lifetime received/delivered: §f${s.totalReceived}/${s.totalDelivered}`,
        `§7Journals: sorter §f${s.sorterJournalPending ? "PENDING" : "clear"}§7 | queue §f${s.queueJournalPending ? "PENDING" : "clear"}`
    ];

    const source = origin?.sourceEntity;
    if (source && typeof source.sendMessage === "function") {
        for (const line of lines) source.sendMessage(line);
        return;
    }

    for (const line of lines) {
        // Strip Minecraft formatting codes for the dedicated-server console.
        log(line.replace(/§./g, ""));
    }
}

function saveLogistics() {
    setWorldDynamic(LOGISTICS_KEY, JSON.stringify(logistics));
    logisticsDirty = false;
}

function markLogisticsDirty() {
    logisticsDirty = true;
}

function flushLogistics() {
    if (logisticsDirty) saveLogistics();
}

function saveQueueJournal(tx) {
    if (tx === undefined) {
        setWorldDynamic(QUEUE_JOURNAL_KEY, undefined);
    } else {
        setWorldDynamic(QUEUE_JOURNAL_KEY, JSON.stringify(tx));
    }
}

function getQueueJournal() {
    return safeJsonParse(world.getDynamicProperty(QUEUE_JOURNAL_KEY), undefined);
}

function saveJournal(tx) {
    if (tx === undefined) {
        setWorldDynamic(JOURNAL_KEY, undefined);
    } else {
        setWorldDynamic(JOURNAL_KEY, JSON.stringify(tx));
    }
}

function getDimension(id) {
    try { return world.getDimension(id); } catch (_) { return undefined; }
}

function getBlock(dimId, x, y, z) {
    const dim = getDimension(dimId);
    if (!dim) return undefined;
    try { return dim.getBlock({x, y, z}); } catch (_) { return undefined; }
}

function sorterAt(e) {
    const b = getBlock(e.d, e.x, e.y, e.z);
    return b && b.typeId === SORTER_ID ? b : undefined;
}

function displayOwnerKey(e) {
    return locKey(e.d, e.x, e.y, e.z);
}

function yawForVector(v) {
    // Bedrock yaw: south 0, west 90, north 180, east -90.
    if (v.x > 0) return -90;
    if (v.x < 0) return 90;
    if (v.z < 0) return 180;
    return 0;
}

function displayPose(e) {
    const b = sorterAt(e);
    if (!b) return undefined;
    const out = facingOffset(b);
    if (!out) return undefined;

    const back = {x:-out.x, y:0, z:-out.z};
    return {
        location: {
            x: e.x + 0.5 + back.x * 0.505,
            y: e.y + 0.50,
            z: e.z + 0.5 + back.z * 0.505
        },
        rotation: {x:0, y:yawForVector(back)}
    };
}

function displayCandidates(e) {
    const dim = getDimension(e.d);
    if (!dim) return [];
    const center = {x:e.x+0.5, y:e.y+0.5, z:e.z+0.5};
    try {
        return dim.getEntities({
            type: DISPLAY_ID,
            location: center,
            maxDistance: 1.75
        }).filter(ent => {
            try { return ent.getDynamicProperty(DISPLAY_OWNER_PROP) === displayOwnerKey(e); }
            catch (_) { return false; }
        });
    } catch (_) {
        return [];
    }
}

function removeDisplay(e) {
    for (const ent of displayCandidates(e)) {
        try { ent.remove(); } catch (_) {
            try { ent.kill(); } catch (_) {}
        }
    }
}

function equipDisplayEntity(ent, filterData) {
    const item = rebuildItem(filterData);
    if (!item) return false;
    item.amount = 1;

    try {
        const eq = ent.getComponent("minecraft:equippable");
        if (eq && eq.setEquipment(EquipmentSlot.Mainhand, item)) return true;
    } catch (_) {}

    try {
        ent.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${filterData.typeId} 1`);
        return true;
    } catch (err) {
        log(`Filter display could not equip ${filterData.typeId}: ${err}`);
        return false;
    }
}

function syncDisplay(e) {
    if (entryHasFrameImplant(e)) { removeDisplay(e); return; }
    const b = sorterAt(e);
    if (!b || !e.f) {
        removeDisplay(e);
        return;
    }

    const pose = displayPose(e);
    if (!pose) return;

    let displays = displayCandidates(e);
    let ent = displays.shift();

    for (const extra of displays) {
        try { extra.remove(); } catch (_) {}
    }

    if (!ent) {
        try {
            ent = b.dimension.spawnEntity(DISPLAY_ID, pose.location);
            ent.addTag(DISPLAY_TAG);
            ent.setDynamicProperty(DISPLAY_OWNER_PROP, displayOwnerKey(e));
        } catch (err) {
            const owner = displayOwnerKey(e);
            if (!displaySpawnFailures.has(owner)) {
                displaySpawnFailures.add(owner);
                log(`Could not spawn filter display at ${owner}: ${err}`);
            }
            return;
        }
        displaySpawnFailures.delete(displayOwnerKey(e));
    }

    try {
        ent.teleport(pose.location, {
            dimension: b.dimension,
            rotation: pose.rotation,
            keepVelocity: false
        });
    } catch (err) {
        log(`Could not position filter display at ${displayOwnerKey(e)}: ${err}`);
    }

    equipDisplayEntity(ent, e.f);
}

function reconcileDisplays() {
    if (!ready) return;

    const validOwners = new Set();
    for (const e of registry) {
        const b = sorterAt(e);
        if (!b) continue;
        if (e.f && !entryHasFrameImplant(e)) {
            validOwners.add(displayOwnerKey(e));
            syncDisplay(e);
        } else {
            removeDisplay(e);
        }
    }

    for (const dimId of ["overworld", "nether", "the_end"]) {
        const dim = getDimension(dimId);
        if (!dim) continue;
        let ents = [];
        try { ents = dim.getEntities({type: DISPLAY_ID}); } catch (_) { continue; }
        for (const ent of ents) {
            let owner;
            try { owner = ent.getDynamicProperty(DISPLAY_OWNER_PROP); } catch (_) {}
            if (typeof owner !== "string" || !validOwners.has(owner)) {
                try { ent.remove(); } catch (_) {}
            }
        }
    }
}

function findEntryByDisplayOwner(owner) {
    if (typeof owner !== "string") return undefined;
    return registry.find(e => displayOwnerKey(e) === owner);
}

// routing state. Absent mode fields are always interpreted from the
// original 1.3.2 filter value; no bulk rewrite of existing registry records.
function sorterMode(e) {
    return SORTER_MODES.includes(e?.m) ? e.m : (e?.f ? "filter" : "wildcard");
}

function syncSorterModeVisual(e, b = sorterAt(e)) {
    if (!b) return;
    const wanted = sorterMode(e);
    try {
        if (b.permutation.getState(SORTER_MODE_STATE) !== wanted) {
            b.setPermutation(b.permutation.withState(SORTER_MODE_STATE, wanted));
        }
        modeVisualWarnings.delete(displayOwnerKey(e));
    } catch (err) {
        const key = displayOwnerKey(e);
        if (!modeVisualWarnings.has(key)) {
            modeVisualWarnings.add(key);
            log(`Mode indicator update deferred at ${key}: ${err}`);
        }
    }
}

function reconcileModeVisuals() {
    if (!ready || !registry.length) return;
    // One small batch per cycle. Existing worlds with hundreds of Sorters are
    // repaired gradually without hammering all block permutations at startup.
    const count = Math.min(32, registry.length);
    for (let i=0; i<count; i++) {
        const idx = (modeVisualRr + i) % registry.length;
        syncSorterModeVisual(registry[idx]);
    }
    modeVisualRr = (modeVisualRr + count) % registry.length;
}

function setSorterMode(player, block) {
    let e = findEntry(block.dimension.id, block.location.x, block.location.y, block.location.z);
    if (!e) {
        if (!addEntry(block)) return;
        e = findEntry(block.dimension.id, block.location.x, block.location.y, block.location.z);
    }
    if (!e) return;
    if (e.nativeQuarantine) {
        player.sendMessage("§c[Hart Logistics] Remove the unverified frame item by punching it before changing modes.");
        return;
    }
    const previous = sorterMode(e);
    const next = SORTER_MODES[(SORTER_MODES.indexOf(previous) + 1) % SORTER_MODES.length];
    const oldStored = e.m;
    e.m = next;
    try {
        saveRegistry();
    } catch (err) {
        if (oldStored === undefined) delete e.m;
        else e.m = oldStored;
        player.sendMessage("§c[Sorter] Mode change could not be saved. No routing change made.");
        log(`Sorter mode save failed at ${displayOwnerKey(e)}: ${err}`);
        return;
    }
    syncSorterModeVisual(e, block);
    dirty = true;
    let detail = "";
    if (next === "filter" && !e.f) detail = " §e(No filter assigned; accepts nothing.)";
    if (next === "auto") {
        const dest = destinationFor(e);
        if (dest?.kind !== "storage") detail = " §e(Requires a directly connected chest/barrel/shulker.)";
    }
    player.sendMessage(`§7[Sorter] Mode: §b${next.toUpperCase()}§7.${detail}`);
}

// The narrow server eye-ray in sometimes misses the LED even
// when Bedrock accepted a click on the correct Sorter service face. The click
// then falls through to the filter-status handler, frustrating the player.
// Detect only the bottom-center indicator with two independent sources:
// (1) moderately forgiving player-view-ray/face-plane intersection; and
// (2) the event's actual faceLocation, supporting both documented block-local
//     coordinates and the bugged absolute/world-coordinates reported on some
//     BDS versions (MCPE-223452). If neither is credible, fail closed.
// Never infer mode click from a side/output/top face or from a filter-area click.
function targetsSorterModeIndicator(player, block, face, faceLocation) {
    const rearFace = sorterRearFace(block);
    if (!rearFace || rearFace !== face) return false;
    const loc = block.location;
    const useX = rearFace === "East" || rearFace === "West";
    const horizontalAxis = useX ? "z" : "x";
    // The lit LED pixels are near u = .38..63, y = .125..19.
    // Include the bezel and a little click tolerance, without reaching the
    // actual filter recess (the indicator is entirely below y=.27).
    const inIndicator = (u, v) => Number.isFinite(u) && Number.isFinite(v) &&
        u >= 0.275 && u <= 0.725 && v >= 0.025 && v <= 0.270;

    // Source A: server-derived eye ray. The prior rectangle stopped at .242
    // high and was not tolerant of small client/server camera discrepancies.
    try {
        const origin = player.getHeadLocation();
        const ray = player.getViewDirection();
        const axis = useX ? "x" : "z";
        const plane = loc[axis] + (rearFace === "South" || rearFace === "East" ? 1 : 0);
        const speed = ray?.[axis];
        if (origin && ray && Number.isFinite(speed) && Math.abs(speed) > 0.00001) {
            const t = (plane - origin[axis]) / speed;
            if (Number.isFinite(t) && t >= 0 && t <= 7) {
                const u = origin[horizontalAxis] + t * ray[horizontalAxis] - loc[horizontalAxis];
                const v = origin.y + t * ray.y - loc.y;
                if (inIndicator(u, v)) return true;
            }
        }
    } catch (_) { /* Try the event-local hit instead. */ }

    // Source B: actual block interaction hit. Per docs faceLocation is local
    // to the north-west-bottom block corner, but an engine bug sometimes
    // supplies absolute coordinates instead; recognize both only when inside
    // the bounded indicator region. Never use modulo wrapping / blind guesses.
    try {
        const rawU = faceLocation?.[horizontalAxis];
        const rawV = faceLocation?.y;
        if (!Number.isFinite(rawU) || !Number.isFinite(rawV)) return false;
        const insideUnit = (n) => n >= -0.001 && n <= 1.001;
        if (insideUnit(rawU) && insideUnit(rawV) && inIndicator(rawU, rawV)) return true;
        const absoluteU = rawU - loc[horizontalAxis];
        const absoluteV = rawV - loc.y;
        if (insideUnit(absoluteU) && insideUnit(absoluteV) && inIndicator(absoluteU, absoluteV)) return true;
    } catch (_) { /* Keep uncertain clicks as ordinary filter interactions. */ }
    return false;
}

// native Item Frames capture the legacy rear indicator. Only on
// frame-implanted Sorters, accept a narrow top-edge click as the mode selector.
// Retain the original rear indicator detection for legacy Sorters.
function targetsNativeTopModeIndicator(block, face, faceLocation) {
    if (face !== "Up") return false;
    const rear = sorterRearFace(block);
    const p=block.location;
    const fromHit=(raw,axis)=> {
        if(!Number.isFinite(raw))return NaN;
        return raw>=-0.001&&raw<=1.001 ? raw : raw-p[axis];
    };
    const x=fromHit(faceLocation?.x,"x"),z=fromHit(faceLocation?.z,"z");
    if(!Number.isFinite(x)||!Number.isFinite(z))return false;
    // Exposed top border only; do not commandeer the arrow or hopper area.
    if(rear==="North")return z<=0.21 && x>=0.30 && x<=0.70;
    if(rear==="South")return z>=0.79 && x>=0.30 && x<=0.70;
    if(rear==="East")return x>=0.79 && z>=0.30 && z<=0.70;
    if(rear==="West")return x<=0.21 && z>=0.30 && z<=0.70;
    return false;
}

// The physical mode indicator on an implanted native Sorter
// occupies the narrow TOP of the rear-facing *vertical* service face.
// This is NOT the old bottom legacy LED, nor the physical block top.
function targetsNativeFrontModeIndicator(player, block, face, faceLocation) {
    const rear=sorterRearFace(block);
    if (!rear || face !== rear) return false;
    const p=block.location;
    const useX=rear==="East" || rear==="West";
    const horizontalAxis=useX ? "z" : "x";
    const onRail=(u,v)=>Number.isFinite(u)&&Number.isFinite(v)&&
        u>=0.28&&u<=0.72&&v>=0.80&&v<=1.005;
    // Prefer the block-local hit, with the historical absolute-hit fallback.
    const u=faceLocation?.[horizontalAxis],v=faceLocation?.y;
    if(onRail(u,v) || onRail(u-p[horizontalAxis],v-p.y))return true;
    // Eye-ray fallback, bounded to the same front vertical plane.
    try {
        const origin=player.getHeadLocation(),ray=player.getViewDirection();
        const axis=useX ? "x" : "z";
        const plane=p[axis]+(rear==="South" || rear==="East" ? 1 : 0);
        const speed=ray?.[axis];
        if(origin&&ray&&Number.isFinite(speed)&&Math.abs(speed)>0.00001){
            const t=(plane-origin[axis])/speed;
            if(Number.isFinite(t)&&t>=0&&t<=7){
                const ru=origin[horizontalAxis]+t*ray[horizontalAxis]-p[horizontalAxis];
                const rv=origin.y+t*ray.y-p.y;
                return onRail(ru,rv);
            }
        }
    } catch (_) { /* Uncertain click: do not cycle. */ }
    return false;
}

// Auto mode checks the current contents of the *directly connected* storage.
// Item type IDs are exact; for enchanted books reuse Filter's enchantment-
// TYPE-set convention. No sampling from Collector queues, or global caching:
// manually adding/removing the last seed item changes eligibility immediately.
function autoSorterMatches(stack, entry) {
    const dest = destinationFor(entry);
    if (dest?.kind !== "storage" || !dest.container?.isValid) return false;
    const c = dest.container;
    const incomingBook = stack.typeId === "minecraft:enchanted_book"
        ? enchantments(stack).map(e => e.id).sort().join("|") : undefined;
    for (let i = 0; i < c.size; i++) {
        const sample = c.getItem(i);
        if (!sample || sample.typeId !== stack.typeId) continue;
        if (incomingBook !== undefined &&
            enchantments(sample).map(e => e.id).sort().join("|") !== incomingBook) continue;
        return true;
    }
    return false;
}

function findEntry(dimId, x, y, z) {
    return registry.find(e => e.d === dimId && e.x === x && e.y === y && e.z === z);
}

function removeEntry(dimId, x, y, z) {
    const idx = registry.findIndex(e => e.d === dimId && e.x === x && e.y === y && e.z === z);
    if (idx < 0) return undefined;
    const old = registry[idx];
    removeDisplay(old);
    registry.splice(idx, 1);
    saveRegistry();
    dirty = true;
    return old;
}

function addEntry(block) {
    const d = block.dimension.id;
    const {x,y,z} = block.location;
    if (!findEntry(d,x,y,z)) {
        const fresh = {d,x,y,z,f:null,m:"wildcard"};
        registry.push(fresh);
        try {
            saveRegistry();
        } catch (err) {
            // Do not claim an entry exists in memory if persistence failed.
            const idx = registry.indexOf(fresh);
            if (idx >= 0) registry.splice(idx, 1);
            log(`Sorter registration failed at ${d} ${x},${y},${z}: ${err}`);
            return false;
        }
    }
    dirty = true;
    return true;
}

function logisticsId(dimId, x, y, z) {
    return locKey(dimId, x, y, z);
}

function entryForBlock(block) {
    return {
        id: logisticsId(block.dimension.id, block.location.x, block.location.y, block.location.z),
        d: block.dimension.id,
        x: block.location.x,
        y: block.location.y,
        z: block.location.z,
        present: true
    };
}

function collectorAt(e) {
    const b = getBlock(e.d, e.x, e.y, e.z);
    return b && b.typeId === COLLECTOR_ID ? b : undefined;
}

function receiverAt(e) {
    const b = getBlock(e.d, e.x, e.y, e.z);
    return b && b.typeId === RECEIVER_ID ? b : undefined;
}

function findCollectorById(id) {
    return logistics.collectors.find(e => e.id === id);
}

function findReceiverById(id) {
    return logistics.receivers.find(e => e.id === id);
}

function registerCollector(block) {
    const fresh = entryForBlock(block);
    let e = findCollectorById(fresh.id);
    if (!e) {
        e = {...fresh, link: null, accepted: 0};
        logistics.collectors.push(e);
    } else {
        Object.assign(e, fresh);
        e.present = true;
        if (typeof e.accepted !== "number") e.accepted = e.forwarded ?? 0;
    }
    saveLogistics();
    return e;
}

function allocateQueueKey() {
    const n = Math.max(1, Number(logistics.nextQueue) || 1);
    logistics.nextQueue = n + 1;
    return `q${n}`;
}

function registerReceiver(block) {
    const fresh = entryForBlock(block);
    let e = findReceiverById(fresh.id);
    if (!e) {
        e = {
            ...fresh,
            queueKey: allocateQueueKey(),
            qVersion: 4,
            qGen: 0,
            qShards: 0,
            queued: 0,
            received: 0,
            delivered: 0
        };
        logistics.receivers.push(e);
    } else {
        Object.assign(e, fresh);
        e.present = true;
        if (!e.queueKey) e.queueKey = allocateQueueKey();
        if (typeof e.qVersion !== "number") e.qVersion = 0;
        if (typeof e.qGen !== "number") e.qGen = 0;
        if (typeof e.qShards !== "number") e.qShards = 0;
        if (typeof e.queued !== "number") e.queued = 0;
        if (typeof e.received !== "number") e.received = 0;
        if (typeof e.delivered !== "number") e.delivered = 0;
    }
    saveLogistics();
    return e;
}

function markLogisticsAbsent(typeId, dimId, x, y, z) {
    const id = logisticsId(dimId, x, y, z);
    const list = typeId === COLLECTOR_ID ? logistics.collectors : logistics.receivers;
    const e = list.find(v => v.id === id);
    if (e) {
        e.present = false;
        saveLogistics();
    }
}

function blockContainer(block) {
    try {
        const c = block?.getComponent("minecraft:inventory")?.container;
        return c && c.isValid ? c : undefined;
    } catch (_) {
        return undefined;
    }
}

function containerItemCount(container) {
    if (!container) return 0;
    let n = 0;
    for (let i=0; i<container.size; i++) {
        n += container.getItem(i)?.amount ?? 0;
    }
    return n;
}

function blockIsRedstonePowered(block) {
    if (!block) return false;

    // Hart custom blocks use minecraft:redstone_consumer +
    // onRedstoneUpdate. This is authoritative when we have received a
    // callback for the block.
    const state = recentHartRedstoneState(block);
    if (state) return state.power > 0;

    // Keep the generic API fallback for vanilla/engine cases where power is
    // directly queryable.
    try {
        const power = block.getRedstonePower();
        return typeof power === "number" && power > 0;
    } catch (_) {
        return false;
    }
}

function sourceIsTriggered(source) {
    if (!source || (source.typeId !== "minecraft:dropper" && source.typeId !== "minecraft:dispenser")) return false;
    try {
        const v = source.permutation.getState("triggered_bit");
        return v === true || v === 1;
    } catch (_) {
        return false;
    }
}

function hopperIsRedstoneLocked(hopper) {
    if (!hopper || hopper.typeId !== "minecraft:hopper") return false;
    try {
        // Vanilla hopper state: toggle_bit = 1/true while the hopper is
        // disabled by redstone. Hart Logistics must honor that state even
        // though Script API container access itself can still mutate the
        // inventory of a powered hopper.
        const v = hopper.permutation.getState("toggle_bit");
        return v === true || v === 1;
    } catch (_) {
        // Fail open rather than freezing logistics on an engine/version that
        // unexpectedly does not expose the vanilla hopper state.
        return false;
    }
}

function hopperOutputOffset(hopper) {
    let dir;
    try { dir = hopper.permutation.getState("facing_direction"); } catch (_) {}
    switch (dir) {
        case 0:
        case 1:
            return {x:0, y:-1, z:0};
        case 2: return {x:0, y:0, z:-1};
        case 3: return {x:0, y:0, z:1};
        case 4: return {x:-1, y:0, z:0};
        case 5: return {x:1, y:0, z:0};
        default: return undefined;
    }
}

function directionalOutputOffset(block) {
    let dir;
    try { dir = block.permutation.getState("facing_direction"); } catch (_) {}
    switch (dir) {
        case 0: return {x:0, y:-1, z:0};
        case 1: return {x:0, y:1, z:0};
        case 2: return {x:0, y:0, z:-1};
        case 3: return {x:0, y:0, z:1};
        case 4: return {x:-1, y:0, z:0};
        case 5: return {x:1, y:0, z:0};
        default: return undefined;
    }
}

function collectorInputSources(e) {
    const c = collectorAt(e);
    if (!c) return [];

    const offsets = [
        {x:0,y:1,z:0}, {x:0,y:-1,z:0},
        {x:1,y:0,z:0}, {x:-1,y:0,z:0},
        {x:0,y:0,z:1}, {x:0,y:0,z:-1}
    ];

    const out = [];
    for (const o of offsets) {
        let source;
        try {
            source = c.dimension.getBlock({x:e.x+o.x, y:e.y+o.y, z:e.z+o.z});
        } catch (_) {
            continue;
        }
        if (!source) continue;

        // Direct inventory polling is intentionally hopper-only. Droppers and
        // dispensers retain their vanilla pulse semantics and are handled only
        // when they actually eject an item entity toward the Collector.
        if (source.typeId !== "minecraft:hopper") continue;

        const f = hopperOutputOffset(source);
        if (!f) continue;

        const sp = source.location;
        if (sp.x + f.x !== e.x || sp.y + f.y !== e.y || sp.z + f.z !== e.z) continue;

        const inv = blockContainer(source);
        if (!inv) continue;

        out.push({
            block: source,
            container: inv,
            kind: "hopper",
            locked: hopperIsRedstoneLocked(source)
        });
    }
    return out;
}

function receiverOutputHopper(e) {
    const r = receiverAt(e);
    if (!r) return undefined;

    let h;
    try {
        h = r.dimension.getBlock({x:e.x, y:e.y-1, z:e.z});
    } catch (_) {
        return undefined;
    }
    if (!h || h.typeId !== "minecraft:hopper") return undefined;

    const inv = blockContainer(h);
    return inv ? {block:h, container:inv, locked:hopperIsRedstoneLocked(h)} : undefined;
}

function collectorInputCount(e) {
    let total = 0;
    for (const src of collectorInputSources(e)) total += containerItemCount(src.container);
    return total;
}

function queueShardKey(receiver, gen, index) {
    // Legacy v2 whole-queue storage. Retained only for one-time migration.
    return `hartsorter:q2_${receiver.queueKey}_${gen}_${index}`;
}

function legacyQ3MetaKey(receiver) {
    return `hartsorter:q3m_${receiver.queueKey}`;
}

function legacyQ3EntryKey(receiver, seq) {
    return `hartsorter:q3e_${receiver.queueKey}_${seq}`;
}

function queueMetaKey(receiver) {
    return `hartsorter:q4m_${receiver.queueKey}`;
}

function queuePageKey(receiver, pageNo) {
    return `hartsorter:q4p_${receiver.queueKey}_${pageNo}`;
}

function queueDefinitionKey(receiver, defId) {
    return `hartsorter:q4d_${receiver.queueKey}_${defId}`;
}

function queueEntryId(receiver, seq) {
    // Keep the q3 logical entry ID format so a pending q3 journal survives an
    // in-place q3 -> q4 upgrade and can be recovered after migration.
    return `${receiver.queueKey}:e${seq}`;
}

function queueSeqFromEntryId(receiver, entryId) {
    if (typeof entryId !== "string") return undefined;
    const prefix = `${receiver.queueKey}:e`;
    if (!entryId.startsWith(prefix)) return undefined;
    const n = Number(entryId.slice(prefix.length));
    return Number.isInteger(n) && n > 0 ? n : undefined;
}

function queuePageNoForSeq(seq) {
    return Math.floor((seq - 1) / QUEUE_PAGE_SIZE);
}

function queueSlotForSeq(seq) {
    return (seq - 1) % QUEUE_PAGE_SIZE;
}

function compactQueueMeta(meta) {
    return {
        v: 4,
        h: meta.head,
        t: meta.tail,
        n: meta.next,
        q: meta.total,
        r: meta.received,
        d: meta.delivered
    };
}

function normalizeQueueMeta(raw, receiver) {
    if (!raw || raw.v !== 4) return undefined;

    let head = Math.max(0, Math.trunc(Number(raw.h) || 0));
    let tail = Math.max(0, Math.trunc(Number(raw.t) || 0));
    let next = Math.max(1, Math.trunc(Number(raw.n) || 1));
    const total = Math.max(0, Math.trunc(Number(raw.q) || 0));
    const rawReceived = Number(raw.r);
    const rawDelivered = Number(raw.d);
    const received = Math.max(0, Math.trunc(Number.isFinite(rawReceived) ? rawReceived : (Number(receiver.received) || 0)));
    const delivered = Math.max(0, Math.trunc(Number.isFinite(rawDelivered) ? rawDelivered : (Number(receiver.delivered) || 0)));

    if (total === 0) {
        head = 0;
        tail = 0;
    } else {
        if (head < 1 || tail < head) return undefined;
        if (next <= tail) next = tail + 1;
    }

    return {version:4, head, tail, next, total, received, delivered};
}

function normalizeLegacyQ3Meta(raw, receiver) {
    if (!raw || raw.v !== 3) return undefined;

    let head = Math.max(0, Math.trunc(Number(raw.h) || 0));
    let tail = Math.max(0, Math.trunc(Number(raw.t) || 0));
    let next = Math.max(1, Math.trunc(Number(raw.n) || 1));
    const total = Math.max(0, Math.trunc(Number(raw.q) || 0));
    const rawReceived = Number(raw.r);
    const rawDelivered = Number(raw.d);
    const received = Math.max(0, Math.trunc(Number.isFinite(rawReceived) ? rawReceived : (Number(receiver.received) || 0)));
    const delivered = Math.max(0, Math.trunc(Number.isFinite(rawDelivered) ? rawDelivered : (Number(receiver.delivered) || 0)));

    if (total === 0) {
        head = 0;
        tail = 0;
    } else {
        if (head < 1 || tail < head) return undefined;
        if (next <= tail) next = tail + 1;
    }

    return {version:3, head, tail, next, total, received, delivered};
}

function queueMetaSnapshot(meta) {
    return {
        head: meta.head,
        tail: meta.tail,
        next: meta.next,
        total: meta.total,
        received: meta.received,
        delivered: meta.delivered
    };
}

function queueMetaMatches(meta, snap) {
    if (!meta || !snap) return false;
    return meta.head === snap.head &&
        meta.tail === snap.tail &&
        meta.next === snap.next &&
        meta.total === snap.total &&
        meta.received === snap.received &&
        meta.delivered === snap.delivered;
}

function syncReceiverFromQueueMeta(receiver, meta) {
    receiver.qVersion = 4;
    receiver.qSeq = meta.next;
    receiver.queued = meta.total;
    receiver.received = meta.received;
    receiver.delivered = meta.delivered;
}

function newQueueState(meta) {
    return {
        meta,
        total: meta?.total ?? 0,
        pages: new Map(),
        defs: new Map(),
        defBySig: new Map()
    };
}

function persistQueueMeta(receiver, q, meta) {
    const normalized = {...meta, version:4};
    const payload = JSON.stringify(compactQueueMeta(normalized));
    setWorldDynamic(queueMetaKey(receiver), payload);
    queueIoStats.metaWrites++;
    queueIoStats.chars += payload.length;

    q.meta = normalized;
    q.total = normalized.total;
    syncReceiverFromQueueMeta(receiver, normalized);
    queueCache.set(receiver.id, q);
    markLogisticsDirty();
}

function queueDefinitionHash(sig) {
    // Compact deterministic 32-bit FNV-1a ID. Collisions are detected against
    // the stored full JSON signature and receive a numeric suffix, so a hash
    // collision cannot alias two different queued item identities.
    let h = 0x811c9dc5;
    for (let i = 0; i < sig.length; i++) {
        const c = sig.charCodeAt(i);
        h ^= c & 0xff;
        h = Math.imul(h, 0x01000193);
        h ^= (c >>> 8) & 0xff;
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

function readQueueDefinition(receiver, q, defId) {
    if (q.defs.has(defId)) return q.defs.get(defId);
    const raw = world.getDynamicProperty(queueDefinitionKey(receiver, defId));
    if (typeof raw !== "string" || !raw.length) return undefined;
    const data = safeJsonParse(raw, undefined);
    if (!data || typeof data !== "object") return undefined;
    q.defs.set(defId, data);
    q.defBySig.set(raw, defId);
    return data;
}

function ensureQueueDefinition(receiver, q, data) {
    const sig = queueDataSignature(data);
    const cached = q.defBySig.get(sig);
    if (cached) return cached;

    const base = queueDefinitionHash(sig);
    for (let collision = 0; collision < 10000; collision++) {
        const defId = collision === 0 ? base : `${base}_${collision}`;
        const key = queueDefinitionKey(receiver, defId);
        const existing = world.getDynamicProperty(key);

        if (existing === undefined) {
            if (sig.length > QUEUE_ENTRY_MAX_CHARS) {
                throw new Error(`queue definition ${defId} exceeds ${QUEUE_ENTRY_MAX_CHARS} characters`);
            }
            setWorldDynamic(key, sig);
            queueIoStats.definitionWrites++;
            queueIoStats.chars += sig.length;
            q.defs.set(defId, data);
            q.defBySig.set(sig, defId);
            return defId;
        }

        if (existing === sig) {
            q.defs.set(defId, data);
            q.defBySig.set(sig, defId);
            return defId;
        }
    }

    throw new Error("queue definition hash collision space exhausted");
}

function normalizeQueuePage(raw, pageNo) {
    // q4 page payload is [startSlot, [[definitionId, amount], ...]]. Sequence
    // numbers are implicit from pageNo + slot, eliminating repeated item JSON
    // and repeated sequence IDs from the persistent queue.
    if (!Array.isArray(raw) || raw.length !== 2) return undefined;
    const start = Math.trunc(Number(raw[0]));
    const packedRows = raw[1];
    if (!Number.isInteger(start) || start < 0 || start >= QUEUE_PAGE_SIZE || !Array.isArray(packedRows)) return undefined;
    if (packedRows.length < 1 || start + packedRows.length > QUEUE_PAGE_SIZE) return undefined;

    const rows = [];
    for (const packed of packedRows) {
        if (!Array.isArray(packed) || packed.length !== 2 || typeof packed[0] !== "string" || !packed[0]) return undefined;
        const amount = Math.max(0, Math.trunc(Number(packed[1]) || 0));
        if (amount <= 0) return undefined;
        rows.push({defId:packed[0], amount});
    }
    return {pageNo, start, rows};
}

function readQueuePage(receiver, q, pageNo, force=false) {
    if (!force && q.pages.has(pageNo)) return q.pages.get(pageNo);
    const raw = safeJsonParse(world.getDynamicProperty(queuePageKey(receiver, pageNo)), undefined);
    const page = normalizeQueuePage(raw, pageNo);
    if (!page) {
        q.pages.delete(pageNo);
        return undefined;
    }
    q.pages.set(pageNo, page);
    return page;
}

function persistQueuePage(receiver, q, page) {
    if (!page || !Array.isArray(page.rows) || page.rows.length === 0) {
        if (page) q.pages.delete(page.pageNo);
        if (page) setWorldDynamic(queuePageKey(receiver, page.pageNo), undefined);
        queueIoStats.pageWrites++;
        return;
    }

    const payload = JSON.stringify([
        page.start,
        page.rows.map(row => [row.defId, Number(row.amount) || 0])
    ]);
    if (payload.length > QUEUE_PAGE_MAX_CHARS) {
        throw new Error(`queue page ${page.pageNo} exceeds ${QUEUE_PAGE_MAX_CHARS} characters`);
    }

    setWorldDynamic(queuePageKey(receiver, page.pageNo), payload);
    queueIoStats.pageWrites++;
    queueIoStats.chars += payload.length;
    q.pages.set(page.pageNo, page);
}

function persistQueueEntry(receiver, q, seq, entry) {
    const defId = ensureQueueDefinition(receiver, q, entry.data);
    const pageNo = queuePageNoForSeq(seq);
    const slot = queueSlotForSeq(seq);
    let page = readQueuePage(receiver, q, pageNo);

    if (!page) {
        page = {pageNo, start:slot, rows:[]};
    }

    const idx = slot - page.start;
    const row = {defId, amount:Math.max(0, Math.trunc(Number(entry.amount) || 0))};
    if (row.amount <= 0) throw new Error(`queue entry ${seq} has invalid amount`);

    if (idx >= 0 && idx < page.rows.length) {
        page.rows[idx] = row;
    } else if (slot === page.start + page.rows.length) {
        page.rows.push(row);
    } else {
        throw new Error(`queue page ${pageNo} would become sparse at seq ${seq}`);
    }

    persistQueuePage(receiver, q, page);
    return {
        id: queueEntryId(receiver, seq),
        seq,
        defId,
        data: entry.data,
        amount: row.amount
    };
}

function clearQueueEntry(receiver, q, seq) {
    const pageNo = queuePageNoForSeq(seq);
    const slot = queueSlotForSeq(seq);
    const page = readQueuePage(receiver, q, pageNo);
    if (!page) return;

    const idx = slot - page.start;
    if (idx < 0 || idx >= page.rows.length) return;

    if (idx === 0) {
        page.rows.shift();
        page.start++;
    } else if (idx === page.rows.length - 1) {
        page.rows.pop();
    } else {
        throw new Error(`cannot remove interior q4 queue entry ${seq}`);
    }

    if (page.rows.length === 0) {
        setWorldDynamic(queuePageKey(receiver, pageNo), undefined);
        queueIoStats.pageWrites++;
        q.pages.delete(pageNo);
    } else {
        persistQueuePage(receiver, q, page);
    }
}

function readQueueEntry(receiver, q, seq, force=false) {
    const pageNo = queuePageNoForSeq(seq);
    const slot = queueSlotForSeq(seq);
    const page = readQueuePage(receiver, q, pageNo, force);
    if (!page) return undefined;

    const idx = slot - page.start;
    if (idx < 0 || idx >= page.rows.length) return undefined;
    const row = page.rows[idx];
    const data = readQueueDefinition(receiver, q, row.defId);
    if (!data) throw new Error(`missing q4 queue definition ${row.defId} for ${receiver.id}`);

    return {
        id: queueEntryId(receiver, seq),
        seq,
        defId: row.defId,
        data,
        amount: row.amount
    };
}

function queueHeadEntry(receiver, q) {
    if (q.meta.total <= 0 || q.meta.head <= 0) return undefined;
    const e = readQueueEntry(receiver, q, q.meta.head);
    if (!e) throw new Error(`missing queue head entry ${q.meta.head} for ${receiver.id}`);
    return e;
}

function queueTailEntry(receiver, q) {
    if (q.meta.total <= 0 || q.meta.tail <= 0) return undefined;
    const e = readQueueEntry(receiver, q, q.meta.tail);
    if (!e) throw new Error(`missing queue tail entry ${q.meta.tail} for ${receiver.id}`);
    return e;
}

function readLegacyQ3Entry(receiver, seq) {
    const raw = safeJsonParse(world.getDynamicProperty(legacyQ3EntryKey(receiver, seq)), undefined);
    if (!raw || typeof raw.d !== "object" || raw.d === null) return undefined;
    const amount = Math.max(0, Math.trunc(Number(raw.a) || 0));
    if (amount <= 0) return undefined;
    return {id:queueEntryId(receiver, seq), seq, data:raw.d, amount};
}

function loadLegacyReceiverQueue(receiver) {
    const entries = [];
    const shards = Math.max(0, Number(receiver.qShards) || 0);
    if (shards <= 0) return {entries, total:0};

    let text = "";
    for (let i=0; i<shards; i++) {
        const v = world.getDynamicProperty(queueShardKey(receiver, receiver.qGen, i));
        if (typeof v !== "string") {
            throw new Error(`missing legacy queue shard ${i}/${shards} for ${receiver.id}`);
        }
        text += v;
    }

    const parsed = safeJsonParse(text, undefined);
    if (!Array.isArray(parsed)) throw new Error(`invalid legacy queue payload for ${receiver.id}`);
    entries.push(...parsed);

    const total = entries.reduce((n,e) => n + (Number(e.amount) || 0), 0);
    return {entries, total};
}

function cleanupLegacyReceiverQueue(receiver, oldGen, oldShards) {
    for (let i=0; i<oldShards; i++) {
        try { setWorldDynamic(queueShardKey(receiver, oldGen, i), undefined); } catch (_) {}
    }
}

function cleanupLegacyQ3Queue(receiver, meta, extraSeq) {
    if (meta && meta.head > 0 && meta.tail >= meta.head) {
        for (let seq = meta.head; seq <= meta.tail; seq++) {
            try { setWorldDynamic(legacyQ3EntryKey(receiver, seq), undefined); } catch (_) {}
        }
    }
    if (extraSeq && (!meta || extraSeq < meta.head || extraSeq > meta.tail)) {
        try { setWorldDynamic(legacyQ3EntryKey(receiver, extraSeq), undefined); } catch (_) {}
    }
    try { setWorldDynamic(legacyQ3MetaKey(receiver), undefined); } catch (_) {}
}

function cleanupUncommittedQ4(receiver) {
    // q4 metadata is the commit point. If it does not exist, any q4 page or
    // definition properties for this Receiver are debris from an interrupted
    // migration and can be safely discarded before retrying from q2/q3.
    if (typeof world.getDynamicProperty(queueMetaKey(receiver)) === "string") return;
    const pagePrefix = `hartsorter:q4p_${receiver.queueKey}_`;
    const defPrefix = `hartsorter:q4d_${receiver.queueKey}_`;
    try {
        for (const id of world.getDynamicPropertyIds()) {
            if (id.startsWith(pagePrefix) || id.startsWith(defPrefix)) {
                try { setWorldDynamic(id, undefined); } catch (_) {}
            }
        }
    } catch (_) {}
}

function populateQ4FromEntries(receiver, entries, meta) {
    const q = newQueueState({...meta, version:4});
    let entryCount = 0;

    // Build every page in memory and persist it once. Definitions are written
    // once per unique exact item identity and shared by every page in this
    // Receiver queue.
    for (const source of entries) {
        const seq = Number(source.seq) || queueSeqFromEntryId(receiver, source.id);
        const amount = Math.max(0, Math.trunc(Number(source.amount) || 0));
        if (!seq || amount <= 0 || !source.data) continue;

        const defId = ensureQueueDefinition(receiver, q, source.data);
        const pageNo = queuePageNoForSeq(seq);
        const slot = queueSlotForSeq(seq);
        let page = q.pages.get(pageNo);
        if (!page) page = {pageNo, start:slot, rows:[]};

        if (slot !== page.start + page.rows.length) {
            throw new Error(`legacy queue is sparse at seq ${seq}`);
        }
        page.rows.push({defId, amount});
        q.pages.set(pageNo, page);
        entryCount++;
    }

    for (const pageNo of [...q.pages.keys()].sort((a,b) => a-b)) {
        persistQueuePage(receiver, q, q.pages.get(pageNo));
    }

    persistQueueMeta(receiver, q, {...meta, version:4});
    return {q, entryCount, pageCount:q.pages.size, definitionCount:q.defs.size};
}

function migrateReceiverQueueQ3ToV4(receiver, q3Meta) {
    cleanupUncommittedQ4(receiver);

    const pending = getQueueJournal();
    const pendingSeq = pending?.receiverId === receiver.id
        ? queueSeqFromEntryId(receiver, pending.entryId)
        : undefined;

    const entries = [];
    if (q3Meta.head > 0 && q3Meta.tail >= q3Meta.head) {
        for (let seq=q3Meta.head; seq<=q3Meta.tail; seq++) {
            const entry = readLegacyQ3Entry(receiver, seq);
            if (!entry) {
                // A q3 full-entry dequeue can crash after deleting the head
                // entry but before advancing q3 metadata. Preserve that exact
                // after-state (amount 0) so journal recovery can advance q4.
                if (seq === pendingSeq && Number(pending?.qAfter) === 0) continue;
                throw new Error(`missing legacy q3 queue entry ${seq} for ${receiver.id}`);
            }
            entries.push(entry);
        }
    }

    // A q3 append can crash after the entry property is committed but before
    // q3 metadata advances tail/next. Preserve that journal-referenced entry so
    // q4 recovery sees the same before/after state and can finish the commit.
    if (pendingSeq && !entries.some(e => e.seq === pendingSeq)) {
        const pendingEntry = readLegacyQ3Entry(receiver, pendingSeq);
        if (pendingEntry) entries.push(pendingEntry);
    }
    entries.sort((a,b) => a.seq-b.seq);

    const built = populateQ4FromEntries(receiver, entries, {
        version:4,
        head:q3Meta.head,
        tail:q3Meta.tail,
        next:q3Meta.next,
        total:q3Meta.total,
        received:q3Meta.received,
        delivered:q3Meta.delivered
    });

    receiver.qGen = 0;
    receiver.qShards = 0;
    receiver.qVersion = 4;
    saveLogistics();

    cleanupLegacyQ3Queue(receiver, q3Meta, pendingSeq);
    queueIoStats.migrations++;
    log(
        `migrated Receiver queue q3 -> q4; receiver=${receiver.id}, ` +
        `entries=${built.entryCount}, pages=${built.pageCount}, defs=${built.definitionCount}, queued=${q3Meta.total}`
    );
    return built.q;
}

function migrateReceiverQueueQ2ToV4(receiver) {
    cleanupUncommittedQ4(receiver);
    const oldGen = Number(receiver.qGen) || 0;
    const oldShards = Math.max(0, Number(receiver.qShards) || 0);
    const legacy = loadLegacyReceiverQueue(receiver);

    let highestSeq = 0;
    const entries = [];
    for (const oldEntry of legacy.entries) {
        const seq = queueSeqFromEntryId(receiver, oldEntry.id);
        if (!seq) throw new Error(`cannot migrate queue entry with invalid id ${oldEntry.id}`);
        if (highestSeq && seq <= highestSeq) throw new Error(`legacy queue entry order is invalid at ${oldEntry.id}`);
        highestSeq = seq;
        const amount = Math.max(0, Math.trunc(Number(oldEntry.amount) || 0));
        if (amount <= 0) continue;
        entries.push({id:oldEntry.id, seq, data:oldEntry.data, amount});
    }

    const oldNext = Math.max(1, Math.trunc(Number(receiver.qSeq) || 1));
    const head = entries.length ? entries[0].seq : 0;
    const tail = entries.length ? entries[entries.length-1].seq : 0;
    const built = populateQ4FromEntries(receiver, entries, {
        version:4,
        head:legacy.total > 0 ? head : 0,
        tail:legacy.total > 0 ? tail : 0,
        next:Math.max(oldNext, highestSeq + 1, 1),
        total:legacy.total,
        received:Math.max(0, Math.trunc(Number(receiver.received) || 0)),
        delivered:Math.max(0, Math.trunc(Number(receiver.delivered) || 0))
    });

    receiver.qGen = 0;
    receiver.qShards = 0;
    receiver.qVersion = 4;
    saveLogistics();
    cleanupLegacyReceiverQueue(receiver, oldGen, oldShards);

    queueIoStats.migrations++;
    log(
        `migrated Receiver queue q2 -> q4; receiver=${receiver.id}, ` +
        `entries=${built.entryCount}, pages=${built.pageCount}, defs=${built.definitionCount}, queued=${legacy.total}`
    );
    return built.q;
}

function initializeEmptyReceiverQueue(receiver) {
    cleanupUncommittedQ4(receiver);
    const meta = {
        version:4,
        head:0,
        tail:0,
        next:Math.max(1, Math.trunc(Number(receiver.qSeq) || 1)),
        total:0,
        received:Math.max(0, Math.trunc(Number(receiver.received) || 0)),
        delivered:Math.max(0, Math.trunc(Number(receiver.delivered) || 0))
    };
    const q = newQueueState(meta);
    persistQueueMeta(receiver, q, meta);
    receiver.qGen = 0;
    receiver.qShards = 0;
    receiver.qVersion = 4;
    saveLogistics();
    return q;
}

function loadReceiverQueue(receiver, force=false) {
    if (!force && queueCache.has(receiver.id)) return queueCache.get(receiver.id);

    const rawMetaValue = world.getDynamicProperty(queueMetaKey(receiver));
    if (typeof rawMetaValue === "string" && rawMetaValue.length) {
        const parsed = safeJsonParse(rawMetaValue, undefined);
        const meta = normalizeQueueMeta(parsed, receiver);
        if (!meta) throw new Error(`invalid q4 queue metadata for ${receiver.id}`);

        const q = newQueueState(meta);
        syncReceiverFromQueueMeta(receiver, meta);
        queueCache.set(receiver.id, q);

        // q4 metadata is authoritative. Any q3/q2 properties left by a crash
        // after the q4 commit point are stale and can be removed safely.
        const q3Raw = safeJsonParse(world.getDynamicProperty(legacyQ3MetaKey(receiver)), undefined);
        const q3Meta = normalizeLegacyQ3Meta(q3Raw, receiver);
        if (q3Meta) {
            const pending = getQueueJournal();
            const pendingSeq = pending?.receiverId === receiver.id
                ? queueSeqFromEntryId(receiver, pending.entryId)
                : undefined;
            cleanupLegacyQ3Queue(receiver, q3Meta, pendingSeq);
        }

        const oldShards = Math.max(0, Number(receiver.qShards) || 0);
        if (oldShards > 0) {
            const oldGen = Number(receiver.qGen) || 0;
            cleanupLegacyReceiverQueue(receiver, oldGen, oldShards);
        }
        if (receiver.qVersion !== 4 || receiver.qShards !== 0 || receiver.qGen !== 0) {
            receiver.qGen = 0;
            receiver.qShards = 0;
            receiver.qVersion = 4;
            saveLogistics();
        }

        return q;
    }

    const q3Raw = safeJsonParse(world.getDynamicProperty(legacyQ3MetaKey(receiver)), undefined);
    const q3Meta = normalizeLegacyQ3Meta(q3Raw, receiver);
    if (q3Meta) return migrateReceiverQueueQ3ToV4(receiver, q3Meta);

    if (Math.max(0, Number(receiver.qShards) || 0) > 0) {
        return migrateReceiverQueueQ2ToV4(receiver);
    }

    return initializeEmptyReceiverQueue(receiver);
}

function recordDirectReceiverTransfer(receiver, amount) {
    if (amount <= 0) return;
    const q = loadReceiverQueue(receiver);
    const metaAfter = {
        ...q.meta,
        received: q.meta.received + amount,
        delivered: q.meta.delivered + amount
    };
    persistQueueMeta(receiver, q, metaAfter);
}

function queueDataSignature(data) {
    return JSON.stringify(data);
}

// Queue only pristine vanilla minecart variants among non-stackable
// items. Bedrock ItemStack.isStackableWith() always returns false for these,
// even when both instances are identical, so they need an explicit safety
// check. All other non-stackable items retain the 1.3.2 direct-only path.
const QUEUE_PLAIN_MINECART_IDS = new Set([
    "minecraft:minecart",
    "minecraft:chest_minecart",
    "minecraft:hopper_minecart",
    "minecraft:tnt_minecart",
    "minecraft:command_block_minecart"
]);

function plainMinecartQueueSafe(stack) {
    if (!stack || !QUEUE_PLAIN_MINECART_IDS.has(stack.typeId) ||
        stack.amount !== 1 || stack.maxAmount !== 1) return false;

    try {
        // Validate against a fresh vanilla item. Reject every exposed mutable
        // item property that our queue's reconstruction cannot safely promise
        // to preserve (including renamed minecarts and item dynamic props).
        const vanilla = new ItemStack(stack.typeId, 1);
        if (vanilla.typeId !== stack.typeId || vanilla.maxAmount !== 1) return false;
        if ((stack.nameTag ?? "") !== (vanilla.nameTag ?? "")) return false;
        if (JSON.stringify(stack.getLore()) !== JSON.stringify(vanilla.getLore())) return false;
        if (JSON.stringify(stack.getCanDestroy()) !== JSON.stringify(vanilla.getCanDestroy())) return false;
        if (JSON.stringify(stack.getCanPlaceOn()) !== JSON.stringify(vanilla.getCanPlaceOn())) return false;
        if (stack.keepOnDeath !== vanilla.keepOnDeath || stack.lockMode !== vanilla.lockMode) return false;
        if (stack.getDynamicPropertyIds().length !== 0) return false;
        if (enchantments(stack).length !== 0) return false;
        // These components are not expected on vanilla minecarts. If a
        // modified item has one, fail closed instead of losing its data.
        for (const component of ["minecraft:durability", "minecraft:dyeable", "minecraft:potion"]) {
            if (stack.getComponent(component)) return false;
        }
        return true;
    } catch (_) {
        // A version/API mismatch must never quietly turn an item into an
        // unsafe serialized queue entry.
        return false;
    }
}

// No priority lane. Eligible *vanilla* non-stackables enter the
// existing q4 FIFO only when their exposed state can be rebuilt identically.
// Unknown/modded items, containers with nested inventories, maps, written
// books, patterned banners and other opaque components remain direct-only.
const QUEUE_SAFE_NONSTACK_IDS = new Set([
    ...QUEUE_PLAIN_MINECART_IDS,
    "minecraft:bow", "minecraft:crossbow", "minecraft:shield",
    "minecraft:elytra", "minecraft:trident", "minecraft:spear",
    "minecraft:flint_and_steel", "minecraft:shears", "minecraft:fishing_rod",
    "minecraft:carrot_on_a_stick", "minecraft:warped_fungus_on_a_stick",
    "minecraft:brush", "minecraft:spyglass", "minecraft:totem_of_undying",
    "minecraft:potion", "minecraft:splash_potion", "minecraft:lingering_potion"
]);
const QUEUE_SAFE_EQUIPMENT_MATERIALS = new Set([
    "wooden", "stone", "iron", "golden", "diamond", "netherite", "copper"
]);
const QUEUE_SAFE_ARMOR_MATERIALS = new Set([
    "leather", "chainmail", "iron", "golden", "diamond", "netherite", "turtle", "copper"
]);
function queueKnownVanillaNonstack(typeId) {
    if (QUEUE_SAFE_NONSTACK_IDS.has(typeId)) return true;
    let m = /^minecraft:([a-z]+)_(sword|pickaxe|axe|shovel|hoe)$/.exec(typeId);
    if (m) return QUEUE_SAFE_EQUIPMENT_MATERIALS.has(m[1]);
    m = /^minecraft:([a-z]+)_(helmet|chestplate|leggings|boots)$/.exec(typeId);
    return !!m && QUEUE_SAFE_ARMOR_MATERIALS.has(m[1]);
}
function queueVerifiedList(s, name) {
    const v = s[name]();
    if (!Array.isArray(v)) throw new Error(`Unavailable ${name}`);
    return v;
}
function queueNonstackFingerprint(stack) {
    if (!stack || stack.maxAmount !== 1 || stack.amount !== 1 ||
        !queueKnownVanillaNonstack(stack.typeId)) return undefined;
    try {
        const ids = stack.getDynamicPropertyIds();
        if (!Array.isArray(ids)) return undefined;
        const dyn = {};
        for (const id of ids.sort()) {
            const v = stack.getDynamicProperty(id);
            if (!["string", "number", "boolean"].includes(typeof v) ||
                (typeof v === "number" && !Number.isFinite(v))) return undefined;
            dyn[id] = v;
        }
        const componentState = {};
        for (const cid of ["minecraft:durability", "minecraft:dyeable", "minecraft:potion"]) {
            const c = stack.getComponent(cid);
            if (cid === "minecraft:durability" && c) componentState.durability = [c.damage, !!c.unbreakable];
            if (cid === "minecraft:dyeable" && c) componentState.dye = c.color ? [c.color.red,c.color.green,c.color.blue] : null;
            if (cid === "minecraft:potion" && c) componentState.potion = [c.potionEffectType?.id, c.potionDeliveryType?.id];
        }
        return JSON.stringify({
            id:stack.typeId, max:stack.maxAmount, amount:stack.amount,
            name:stack.nameTag ?? "", lore:queueVerifiedList(stack,"getLore"),
            destroy:queueVerifiedList(stack,"getCanDestroy"),
            place:queueVerifiedList(stack,"getCanPlaceOn"),
            keep:!!stack.keepOnDeath, lock:stack.lockMode,
            ench:enchantments(stack), dyn, components:componentState
        });
    } catch (_) { return undefined; }
}
function queueSafeNonstackRoundTrip(original, reconstructed) {
    const before = queueNonstackFingerprint(original);
    const after = queueNonstackFingerprint(reconstructed);
    return before !== undefined && before === after;
}

function serializeQueueItem(stack) {
    if (!stack) return undefined;
    const candidateNonstack = stack.maxAmount === 1 && stack.amount === 1 && queueKnownVanillaNonstack(stack.typeId) &&
        (!QUEUE_PLAIN_MINECART_IDS.has(stack.typeId) || plainMinecartQueueSafe(stack));
    if (stack.maxAmount <= 1 && !candidateNonstack) return undefined;

    const data = {
        typeId: stack.typeId,
        nameTag: stack.nameTag,
        lore: [],
        ench: enchantments(stack),
        canDestroy: [],
        canPlaceOn: []
    };

    try { data.lore = stack.getLore(); } catch (_) {}
    try { data.canDestroy = stack.getCanDestroy(); } catch (_) {}
    try { data.canPlaceOn = stack.getCanPlaceOn(); } catch (_) {}

    try {
        const dur = stack.getComponent("minecraft:durability");
        if (dur) data.dur = {damage:dur.damage, unbreakable:!!dur.unbreakable};
    } catch (_) {}

    try {
        const dye = stack.getComponent("minecraft:dyeable");
        if (dye?.color) data.dye = {...dye.color};
    } catch (_) {}

    try {
        const potion = stack.getComponent("minecraft:potion");
        if (potion) {
            data.potion = {
                effect: potion.potionEffectType?.id,
                delivery: potion.potionDeliveryType?.id
            };
        }
    } catch (_) {}

    // Item dynamic properties are only supported by Bedrock on non-stackable
    // items, so stackable queue items normally have none. Preserve simple ones
    // anyway if present.
    data.dyn = dynamicProps(stack);

    const rebuilt = rebuildQueueItem(data, 1);
    if (!rebuilt) return undefined;

    // Bedrock isStackableWith returns false for all non-stackables. They must
    // pass a strict live reconstruction fingerprint instead; same q4 FIFO.
    if (candidateNonstack) {
        if (!queueSafeNonstackRoundTrip(stack, rebuilt)) return undefined;
    } else {
        try {
            if (!stack.isStackableWith(rebuilt)) return undefined;
        } catch (_) {
            return undefined;
        }
    }

    // q4 stores item definitions separately and queue pages reference them. Reject pathological
    // metadata that could exceed Bedrock's per-string dynamic-property limit.
    if (JSON.stringify({d:data, a:1}).length > QUEUE_ENTRY_MAX_CHARS) return undefined;

    return data;
}

function rebuildQueueItem(data, amount=1) {
    try {
        let s;

        if (data.potion?.effect && data.potion?.delivery) {
            const effect = Potions.getEffectType(data.potion.effect);
            const delivery = Potions.getDeliveryType(data.potion.delivery);
            if (!effect || !delivery) return undefined;
            s = Potions.resolve(effect, delivery);
        } else {
            s = new ItemStack(data.typeId, 1);
        }

        if (data.nameTag) s.nameTag = data.nameTag;
        if (Array.isArray(data.lore) && data.lore.length) s.setLore(data.lore);
        if (Array.isArray(data.canDestroy) && data.canDestroy.length) s.setCanDestroy(data.canDestroy);
        if (Array.isArray(data.canPlaceOn) && data.canPlaceOn.length) s.setCanPlaceOn(data.canPlaceOn);

        if (data.dur) {
            const dur = s.getComponent("minecraft:durability");
            if (dur) {
                dur.damage = data.dur.damage ?? 0;
                try { dur.unbreakable = !!data.dur.unbreakable; } catch (_) {}
            }
        }

        if (Array.isArray(data.ench) && data.ench.length) {
            const ec = s.getComponent("minecraft:enchantable");
            if (ec) {
                const vals = [];
                for (const e of data.ench) {
                    const t = EnchantmentTypes.get(e.id);
                    if (t) vals.push({type:t, level:e.level});
                }
                if (vals.length) ec.addEnchantments(vals);
            }
        }

        if (data.dye) {
            const dye = s.getComponent("minecraft:dyeable");
            if (dye) dye.color = data.dye;
        }

        if (data.dyn && typeof data.dyn === "object") {
            for (const [k,v] of Object.entries(data.dyn)) {
                try { s.setDynamicProperty(k, v); } catch (_) {}
            }
        }

        s.amount = Math.min(amount, s.maxAmount);
        return s;
    } catch (err) {
        log(`Could not rebuild queued item ${data?.typeId}: ${err}`);
        return undefined;
    }
}

function queueSlotState(container, slot) {
    const s = container.getItem(slot);
    if (!s) return {sig:"", amount:0};
    const data = serializeQueueItem(s);
    return {
        sig: data ? queueDataSignature(data) : `unsafe:${exactStackSig(s)}`,
        amount: s.amount
    };
}

function queueEntryAmount(receiver, q, entryId) {
    const seq = queueSeqFromEntryId(receiver, entryId);
    if (!seq) return 0;
    const e = readQueueEntry(receiver, q, seq, true);
    return e ? Number(e.amount) || 0 : 0;
}

function collectorStatus(player, e) {
    const linked = e.link ? findReceiverById(e.link) : undefined;
    let queueText = "not linked";
    if (linked) {
        let qn = Number(linked.queued) || 0;
        try { qn = loadReceiverQueue(linked).total; } catch (_) {}
        queueText = `${linked.d} ${linked.x},${linked.y},${linked.z}` +
            `${receiverAt(linked) ? "" : " (receiver offline)"}` +
            ` | queued ${qn}/${QUEUE_CAPACITY}`;
    }

    const inputs = collectorInputSources(e);
    const hopperCount = inputs.filter(x => x.kind === "hopper").length;
    const lockedHopperCount = inputs.filter(x => x.kind === "hopper" && x.locked).length;
    const collectorBlock = collectorAt(e);
    const powered = collectorBlock ? blockIsRedstonePowered(collectorBlock) : false;

    player.sendMessage(
        `§7[Collector] Inputs: §f${inputs.length}§7 (` +
        `§f${hopperCount} hopper${lockedHopperCount ? `, §c${lockedHopperCount} locked§7` : ""}§7; dropper/dispenser = ejection-only)` +
        ` | state: ${powered ? "§cPAUSED (powered)" : "§aactive"}` +
        `§7 | waiting: §f${collectorInputCount(e)}` +
        `§7 | network: §f${queueText}` +
        `§7 | lifetime accepted: §f${e.accepted ?? 0}`
    );
}

function receiverStatus(player, e) {
    const linked = logistics.collectors.filter(x => x.link === e.id);
    const output = receiverOutputHopper(e);
    const receiverBlock = receiverAt(e);
    const powered = receiverBlock ? blockIsRedstonePowered(receiverBlock) : false;
    let waiting = 0;
    let online = 0;

    for (const col of linked) {
        if (collectorAt(col)) {
            online++;
            waiting += collectorInputCount(col);
        }
    }

    let qn = Number(e.queued) || 0;
    try { qn = loadReceiverQueue(e).total; } catch (_) {}

    player.sendMessage(
        `§7[Receiver] Collectors: §f${linked.length}§7 (` +
        `§a${online} online§7 / §8${linked.length-online} offline§7)` +
        ` | queued: §f${qn}/${QUEUE_CAPACITY}` +
        `§7 | waiting at loaded sources: §f${waiting}` +
        `§7 | state: ${powered ? "§cPAUSED (powered)" : "§aactive"}` +
        `§7 | output hopper: §f${output ? containerItemCount(output.container) : "missing"}` +
        `${output?.locked ? " §c(locked)" : ""}` +
        `§7 | lifetime received/delivered: §f${e.received ?? 0}/${e.delivered ?? 0}`
    );
}

function selectCollector(player, block) {
    const e = registerCollector(block);
    pendingCollectorByPlayer.set(player.id, e.id);
    collectorStatus(player, e);
    player.sendMessage("§b[Collector] Selected. Interact with a Hart Receiver to link/relink it.");
}

function useReceiver(player, block) {
    const receiver = registerReceiver(block);
    const pendingId = pendingCollectorByPlayer.get(player.id);

    if (pendingId) {
        const col = findCollectorById(pendingId);
        if (col) {
            col.link = receiver.id;
            saveLogistics();
            pendingCollectorByPlayer.delete(player.id);

            player.sendMessage(
                `§a[Hart Logistics] Collector linked to Receiver at ${receiver.x}, ${receiver.y}, ${receiver.z}.`
            );
            receiverStatus(player, receiver);
            return;
        }

        pendingCollectorByPlayer.delete(player.id);
        player.sendMessage("§c[Hart Logistics] Selected Collector record no longer exists; select it again.");
    }

    receiverStatus(player, receiver);
    player.sendMessage("§7[Receiver] Output goes to the vanilla hopper directly below this block.");
}

function migrateLegacyCollectorsIfNeeded() {
    const existing = world.getDynamicProperty(LOGISTICS_KEY);
    if (typeof existing === "string" && existing.length) return;

    const legacy = safeJsonParse(world.getDynamicProperty(LEGACY_LOGISTICS_KEY), undefined);
    if (!legacy || !Array.isArray(legacy.collectors)) return;

    logistics.collectors = legacy.collectors.map(c => ({
        id: c.id,
        d: c.d,
        x: c.x,
        y: c.y,
        z: c.z,
        present: c.present !== false,
        link: null,
        accepted: c.forwarded ?? c.accepted ?? 0
    }));
    logistics.receivers = [];
    logistics.nextQueue = 1;
    saveLogistics();
    log(`migrated ${logistics.collectors.length} Collector records; old Dispenser links intentionally cleared`);
}

function enqueueFromEjectedEntity(receiver, collector, entity, itemData, amount) {
    if (!entity?.isValid || amount <= 0) return 0;

    const q = loadReceiverQueue(receiver);
    if (q.total >= QUEUE_CAPACITY || amount > QUEUE_CAPACITY - q.total) return 0;

    const sig = queueDataSignature(itemData);
    const last = q.total > 0 ? queueTailEntry(receiver, q) : undefined;
    const metaBefore = queueMetaSnapshot(q.meta);

    let seq;
    let entryId;
    let qBefore = 0;
    let qAfter = amount;
    let mode = "append";
    let entryAfter;

    if (last && queueDataSignature(last.data) === sig) {
        mode = "merge";
        seq = last.seq;
        entryId = last.id;
        qBefore = Number(last.amount) || 0;
        qAfter = qBefore + amount;
        entryAfter = {...last, amount:qAfter};
    } else {
        seq = q.meta.next;
        entryId = queueEntryId(receiver, seq);
        entryAfter = {id:entryId, seq, data:itemData, amount};
    }

    const metaAfter = {
        ...q.meta,
        head: mode === "append" && q.meta.total === 0 ? seq : q.meta.head,
        tail: mode === "append" ? seq : q.meta.tail,
        next: mode === "append" ? seq + 1 : q.meta.next,
        total: q.meta.total + amount,
        received: q.meta.received + amount
    };

    const collectorBlock = collectorAt(collector);
    const tx = {
        kind: "entity_enqueue",
        receiverId: receiver.id,
        collectorId: collector.id,
        entityId: entity.id,
        sourceD: entity.dimension.id,
        source: collectorBlock ? {...collectorBlock.location} : {x:collector.x, y:collector.y, z:collector.z},
        itemSig: sig,
        entityAmount: amount,
        entryId,
        mode,
        qBefore,
        qAfter,
        qMetaBefore: metaBefore,
        qMetaAfter: queueMetaSnapshot(metaAfter),
        move: amount,
        item: itemData
    };

    saveQueueJournal(tx);
    persistQueueEntry(receiver, q, seq, entryAfter);
    persistQueueMeta(receiver, q, metaAfter);

    // The queue is the commit point. Once committed, remove the exact spawned
    // item entity. Entity IDs are stable across world loads, allowing journal
    // recovery to finish this removal after a crash without touching a random
    // nearby item entity.
    entity.remove();

    collector.accepted = (collector.accepted ?? 0) + amount;
    markLogisticsDirty();
    saveQueueJournal(undefined);
    return amount;
}

function itemEntityStack(entity) {
    try {
        return entity?.getComponent("minecraft:item")?.itemStack;
    } catch (_) {
        return undefined;
    }
}

function ejectedItemCollector(entity, spawnLoc=undefined) {
    if (!entity?.isValid || entity.typeId !== "minecraft:item") return undefined;

    let loc;
    let dimId;
    try {
        loc = spawnLoc ?? entity.location;
        dimId = entity.dimension.id;
    } catch (_) {
        return undefined;
    }

    for (const collector of logistics.collectors) {
        if (collector.present === false || collector.d !== dimId || !collector.link) continue;

        const c = collectorAt(collector);
        if (!c) continue;

        // A deliberately powered Collector must reject ALL ingress, including
        // Dropper/Dispenser ejections. The only exception is a short pulse-local
        // grace window when the same source pulse momentarily powers the adjacent
        // Collector while ejecting the item.
        if (!collectorAllowsEjectedPulse(c)) continue;

        // A dropper ejecting into a solid Collector normally spawns the item at
        // the source face, overlapping the Collector during its first tick. A
        // small tolerance avoids making capture dependent on sub-tick motion.
        if (loc.x < collector.x - 0.35 || loc.x > collector.x + 1.35 ||
            loc.y < collector.y - 0.35 || loc.y > collector.y + 1.35 ||
            loc.z < collector.z - 0.35 || loc.z > collector.z + 1.35) continue;

        const offsets = [
            {x:0,y:1,z:0}, {x:0,y:-1,z:0},
            {x:1,y:0,z:0}, {x:-1,y:0,z:0},
            {x:0,y:0,z:1}, {x:0,y:0,z:-1}
        ];

        for (const o of offsets) {
            let source;
            try {
                source = c.dimension.getBlock({x:collector.x+o.x, y:collector.y+o.y, z:collector.z+o.z});
            } catch (_) {
                continue;
            }
            if (!source || (source.typeId !== "minecraft:dropper" && source.typeId !== "minecraft:dispenser")) continue;

            const f = directionalOutputOffset(source);
            if (!f) continue;
            const sp = source.location;
            if (sp.x + f.x !== collector.x || sp.y + f.y !== collector.y || sp.z + f.z !== collector.z) continue;
            if (!sourceIsTriggered(source)) continue;

            return {collector, collectorBlock:c, source};
        }
    }

    return undefined;
}

function processEjectedItemEntity(entity, retries=0, spawnLoc=undefined) {
    if (!ready || !entity?.isValid || entity.typeId !== "minecraft:item") return;

    // Do not overlap the single crash-recovery queue journal. A genuine
    // ejection remains a normal world item if Hart Logistics is temporarily
    // busy with another persistent queue transaction.
    if (getQueueJournal()) {
        if (retries < 4) system.runTimeout(() => processEjectedItemEntity(entity, retries + 1, spawnLoc), 1);
        return;
    }

    // entitySpawn can arrive before vanilla's dropper/dispenser triggered_bit
    // and/or the minecraft:item component are observable to script. Preserve
    // the original spawn location and retry briefly instead of giving up on
    // the first tick.
    const route = ejectedItemCollector(entity, spawnLoc);
    if (!route) {
        if (retries < 4) system.runTimeout(() => processEjectedItemEntity(entity, retries + 1, spawnLoc), 1);
        return;
    }

    const receiver = findReceiverById(route.collector.link);
    if (!receiver) return;

    const stack = itemEntityStack(entity);
    if (!stack || stack.amount <= 0) {
        if (retries < 4) system.runTimeout(() => processEjectedItemEntity(entity, retries + 1, spawnLoc), 1);
        return;
    }

    const itemData = serializeQueueItem(stack);
    if (!itemData) {
        // Metadata/non-stackable items that cannot safely enter the persistent
        // queue remain ordinary vanilla ejected items rather than being lost.
        return;
    }

    try {
        enqueueFromEjectedEntity(receiver, route.collector, entity, itemData, stack.amount);
    } catch (err) {
        log(`Dropper/dispenser ejection ingest failed for ${route.collector.id}: ${err}`);
        recoverQueueJournal();
    }
}

function enqueueFromSource(receiver, collector, source, srcSlot, move, itemData) {
    const src = source.container;
    const stack = src.getItem(srcSlot);
    if (!stack || move <= 0 || move > stack.amount) return 0;

    const q = loadReceiverQueue(receiver);
    if (q.total >= QUEUE_CAPACITY) return 0;

    const actualMove = Math.min(move, stack.amount, QUEUE_CAPACITY - q.total);
    if (actualMove <= 0) return 0;

    const sig = queueDataSignature(itemData);
    const last = q.total > 0 ? queueTailEntry(receiver, q) : undefined;
    const metaBefore = queueMetaSnapshot(q.meta);

    let seq;
    let entryId;
    let qBefore = 0;
    let qAfter = actualMove;
    let mode = "append";
    let entryAfter;

    if (last && queueDataSignature(last.data) === sig) {
        mode = "merge";
        seq = last.seq;
        entryId = last.id;
        qBefore = Number(last.amount) || 0;
        qAfter = qBefore + actualMove;
        entryAfter = {...last, amount:qAfter};
    } else {
        seq = q.meta.next;
        entryId = queueEntryId(receiver, seq);
        entryAfter = {id:entryId, seq, data:itemData, amount:actualMove};
    }

    const metaAfter = {
        ...q.meta,
        head: mode === "append" && q.meta.total === 0 ? seq : q.meta.head,
        tail: mode === "append" ? seq : q.meta.tail,
        next: mode === "append" ? seq + 1 : q.meta.next,
        total: q.meta.total + actualMove,
        received: q.meta.received + actualMove
    };

    const tx = {
        kind: "enqueue",
        receiverId: receiver.id,
        collectorId: collector.id,
        sourceD: source.block.dimension.id,
        source: source.block.location,
        srcSlot,
        srcSig: sig,
        srcBefore: stack.amount,
        srcAfter: stack.amount - actualMove,
        entryId,
        mode,
        qBefore,
        qAfter,
        qMetaBefore: metaBefore,
        qMetaAfter: queueMetaSnapshot(metaAfter),
        move: actualMove,
        item: itemData
    };

    saveQueueJournal(tx);

    // q4 rewrites only the affected compact page, then its tiny metadata pointer.
    // Item definitions are de-duplicated sidecars. The journal repairs the
    // narrow crash window between the page write and metadata commit.
    persistQueueEntry(receiver, q, seq, entryAfter);
    persistQueueMeta(receiver, q, metaAfter);

    if (tx.srcAfter === 0) {
        src.setItem(srcSlot, undefined);
    } else {
        const remain = stack.clone();
        remain.amount = tx.srcAfter;
        src.setItem(srcSlot, remain);
    }

    collector.accepted = (collector.accepted ?? 0) + actualMove;
    markLogisticsDirty();
    saveQueueJournal(undefined);
    return actualMove;
}

function dequeueToReceiver(receiver, output, maxMove) {
    const q = loadReceiverQueue(receiver);
    if (q.total <= 0) return 0;

    const first = queueHeadEntry(receiver, q);
    if (!first) return 0;

    const item = rebuildQueueItem(first.data, 1);
    if (!item) {
        log(`Queued item could not be rebuilt for ${receiver.id}; queue paused on ${first.data?.typeId}`);
        return 0;
    }

    const slotInfo = findAcceptSlot(output.container, item);
    if (!slotInfo) return 0;

    const move = Math.min(maxMove, Number(first.amount) || 0, slotInfo.room, item.maxAmount);
    if (move <= 0) return 0;

    const qBefore = Number(first.amount) || 0;
    const qAfter = Math.max(0, qBefore - move);
    const metaBefore = queueMetaSnapshot(q.meta);
    const totalAfter = Math.max(0, q.meta.total - move);
    const removingEntry = qAfter === 0;

    const metaAfter = {
        ...q.meta,
        head: removingEntry ? (totalAfter > 0 ? q.meta.head + 1 : 0) : q.meta.head,
        tail: totalAfter > 0 ? q.meta.tail : 0,
        total: totalAfter,
        delivered: q.meta.delivered + move
    };

    const dstState = queueSlotState(output.container, slotInfo.slot);
    const itemSig = queueDataSignature(first.data);

    const tx = {
        kind: "dequeue",
        receiverId: receiver.id,
        entryId: first.id,
        qBefore,
        qAfter,
        qMetaBefore: metaBefore,
        qMetaAfter: queueMetaSnapshot(metaAfter),
        dstD: output.block.dimension.id,
        dst: output.block.location,
        dstSlot: slotInfo.slot,
        dstSig: itemSig,
        dstBefore: dstState.amount,
        dstAfter: dstState.amount + move,
        move,
        item: first.data
    };

    saveQueueJournal(tx);

    // Debit only the head segment. q4 rewrites (or deletes) just the compact
    // head page; metadata advances the FIFO head after that page change.
    if (removingEntry) clearQueueEntry(receiver, q, first.seq);
    else persistQueueEntry(receiver, q, first.seq, {...first, amount:qAfter});
    persistQueueMeta(receiver, q, metaAfter);

    if (tx.dstBefore === 0) {
        const moved = rebuildQueueItem(first.data, move);
        if (!moved) throw new Error("could not rebuild queued destination item");
        output.container.setItem(tx.dstSlot, moved);
    } else {
        const cur = output.container.getItem(tx.dstSlot);
        if (!cur) throw new Error("receiver destination changed during dequeue");
        cur.amount = tx.dstAfter;
        output.container.setItem(tx.dstSlot, cur);
    }

    markLogisticsDirty();
    saveQueueJournal(undefined);
    return move;
}

function journalQueueState(receiver, q, tx, qAmt) {
    if (!tx.qMetaBefore || !tx.qMetaAfter) {
        // Legacy 1.3.0 journal. q2/q3 -> q4 migration preserves entry IDs and the
        // exact current queue state, so the original amount-based recovery is
        // still sufficient for an upgrade with a pending transaction.
        if (qAmt === tx.qBefore) return "before";
        if (qAmt === tx.qAfter) return "after";
        return "ambiguous";
    }

    if (qAmt === tx.qBefore) {
        return queueMetaMatches(q.meta, tx.qMetaBefore) ? "before" : "ambiguous";
    }

    if (qAmt === tx.qAfter) {
        if (queueMetaMatches(q.meta, tx.qMetaAfter)) return "after";
        if (queueMetaMatches(q.meta, tx.qMetaBefore)) {
            // The q4 page committed but the tiny metadata commit point did not.
            // Finish that metadata write before touching inventory.
            persistQueueMeta(receiver, q, {...tx.qMetaAfter, version:4});
            return "after";
        }
    }

    return "ambiguous";
}

function recoverQueueJournal() {
    const tx = getQueueJournal();
    if (!tx) return;

    const receiver = findReceiverById(tx.receiverId);
    if (!receiver) {
        log(`QUEUE JOURNAL references missing Receiver ${tx.receiverId}; leaving journal intact`);
        return;
    }

    let q;
    try { q = loadReceiverQueue(receiver, true); }
    catch (err) {
        log(`QUEUE JOURNAL could not load Receiver queue: ${err}`);
        return;
    }

    try {
        if (tx.kind === "enqueue") {
            const qAmt = queueEntryAmount(receiver, q, tx.entryId);

            const qState = journalQueueState(receiver, q, tx, qAmt);

            // Queue was never committed; source cannot have been debited because
            // enqueue order is journal -> queue -> source.
            if (qState === "before") {
                saveQueueJournal(undefined);
                log("Recovered untouched queue enqueue.");
                return;
            }

            if (qState !== "after") {
                log("QUEUE JOURNAL enqueue state is ambiguous; leaving journal intact.");
                return;
            }

            const src = getContainerAt(tx.sourceD, tx.source);
            if (!src) {
                // Rare crash window: queue committed but source chunk currently
                // unavailable. Wait until it is loaded rather than guessing.
                return;
            }

            const s = src.getItem(tx.srcSlot);
            if (!s) {
                if (tx.srcAfter === 0) {
                    saveQueueJournal(undefined);
                    log("Recovered completed queue enqueue.");
                    return;
                }
                log("QUEUE JOURNAL enqueue source slot is unexpectedly empty.");
                return;
            }

            const data = serializeQueueItem(s);
            const sig = data ? queueDataSignature(data) : "";
            if (sig !== tx.srcSig) {
                log("QUEUE JOURNAL enqueue source item changed; leaving journal intact.");
                return;
            }

            if (s.amount === tx.srcBefore) {
                if (tx.srcAfter === 0) src.setItem(tx.srcSlot, undefined);
                else {
                    const remain = s.clone();
                    remain.amount = tx.srcAfter;
                    src.setItem(tx.srcSlot, remain);
                }
                saveQueueJournal(undefined);
                log("Recovered queue enqueue by completing source debit.");
                return;
            }

            if (s.amount === tx.srcAfter) {
                saveQueueJournal(undefined);
                log("Recovered completed queue enqueue.");
                return;
            }

            log("QUEUE JOURNAL enqueue source amount is ambiguous; leaving journal intact.");
            return;
        }

        if (tx.kind === "entity_enqueue") {
            const qAmt = queueEntryAmount(receiver, q, tx.entryId);
            const qState = journalQueueState(receiver, q, tx, qAmt);

            if (qState === "before") {
                // Queue never committed, so Hart Logistics never owned the
                // ejected item entity. Leave vanilla world state untouched.
                saveQueueJournal(undefined);
                log("Recovered untouched dropper/dispenser enqueue.");
                return;
            }

            if (qState !== "after") {
                log("QUEUE JOURNAL ejected enqueue state is ambiguous; leaving journal intact.");
                return;
            }

            let entity;
            try { entity = world.getEntity(tx.entityId); } catch (_) {}

            if (entity?.isValid) {
                if (entity.typeId !== "minecraft:item") {
                    log("QUEUE JOURNAL ejected enqueue entity ID no longer references an item; leaving journal intact.");
                    return;
                }

                const stack = itemEntityStack(entity);
                const data = stack ? serializeQueueItem(stack) : undefined;
                const sig = data ? queueDataSignature(data) : "";
                if (!stack || sig !== tx.itemSig || stack.amount !== tx.entityAmount) {
                    log("QUEUE JOURNAL ejected enqueue item changed; leaving journal intact.");
                    return;
                }

                entity.remove();
                saveQueueJournal(undefined);
                log("Recovered dropper/dispenser enqueue by removing committed item entity.");
                return;
            }

            // If the source chunk is not loaded, world.getEntity may be unable
            // to resolve the persisted actor. Wait for a later recovery pass.
            const sourceBlock = tx.source ? getBlock(tx.sourceD, tx.source.x, tx.source.y, tx.source.z) : undefined;
            if (!sourceBlock) return;

            // Source chunk is loaded and the exact entity ID is absent, which
            // means removal already completed before the interruption.
            saveQueueJournal(undefined);
            log("Recovered completed dropper/dispenser enqueue.");
            return;
        }

        if (tx.kind === "dequeue") {
            const qAmt = queueEntryAmount(receiver, q, tx.entryId);

            const qState = journalQueueState(receiver, q, tx, qAmt);

            // Queue was never debited; destination cannot have been credited.
            if (qState === "before") {
                saveQueueJournal(undefined);
                log("Recovered untouched queue dequeue.");
                return;
            }

            if (qState !== "after") {
                log("QUEUE JOURNAL dequeue state is ambiguous; leaving journal intact.");
                return;
            }

            const dst = getContainerAt(tx.dstD, tx.dst);
            if (!dst) return;

            const state = queueSlotState(dst, tx.dstSlot);
            const beforeMatches = state.amount === tx.dstBefore &&
                (tx.dstBefore === 0 || state.sig === tx.dstSig);
            const afterMatches = state.amount === tx.dstAfter &&
                state.sig === tx.dstSig;

            if (beforeMatches) {
                if (tx.dstBefore === 0) {
                    const moved = rebuildQueueItem(tx.item, tx.move);
                    if (!moved) throw new Error("could not rebuild recovered dequeue item");
                    dst.setItem(tx.dstSlot, moved);
                } else {
                    const cur = dst.getItem(tx.dstSlot);
                    cur.amount = tx.dstAfter;
                    dst.setItem(tx.dstSlot, cur);
                }
                saveQueueJournal(undefined);
                log("Recovered queue dequeue by completing destination credit.");
                return;
            }

            if (afterMatches) {
                saveQueueJournal(undefined);
                log("Recovered completed queue dequeue.");
                return;
            }

            log("QUEUE JOURNAL dequeue destination is ambiguous; leaving journal intact.");
        }
    } catch (err) {
        log(`Queue journal recovery failed: ${err}`);
    }
}

function enchantments(stack) {
    try {
        const c = stack.getComponent("minecraft:enchantable");
        if (!c) return [];
        return c.getEnchantments()
            .map(e => ({id:e.type.id, level:e.level}))
            .sort((a,b) => a.id.localeCompare(b.id));
    } catch (_) {
        return [];
    }
}

function dynamicProps(stack) {
    const out = {};
    try {
        for (const id of stack.getDynamicPropertyIds()) {
            const v = stack.getDynamicProperty(id);
            if (["string","number","boolean"].includes(typeof v)) out[id] = v;
        }
    } catch (_) {}
    return out;
}

// Potions must be identified by effect AND delivery variant.
const POTION_ITEM_IDS = new Set(["minecraft:potion", "minecraft:splash_potion", "minecraft:lingering_potion"]);
function potionIdentity(stack) {
    if (!stack || !POTION_ITEM_IDS.has(stack.typeId)) return undefined;
    try {
        const component = stack.getComponent("minecraft:potion");
        const effect = component?.potionEffectType?.id;
        const delivery = component?.potionDeliveryType?.id;
        if (!effect || !delivery) return undefined;
        return {effect, delivery};
    } catch (_) { return undefined; }
}
function rebuildPotionVariant(data) {
    const info = data?.potion;
    if (!info?.effect || !info?.delivery) return undefined;
    try {
        const effect = Potions.getEffectType(info.effect);
        const delivery = Potions.getDeliveryType(info.delivery);
        if (!effect || !delivery) return undefined;
        const stack = Potions.resolve(effect, delivery);
        const actual = potionIdentity(stack);
        if (stack.typeId !== data.typeId || actual?.effect !== info.effect || actual?.delivery !== info.delivery) return undefined;
        return stack;
    } catch (_) { return undefined; }
}
// The queue fingerprint intentionally rejects potions because
// the Collector's nonstackable whitelist excludes them. Native-frame potion
// filters have their own strict, variant-aware preservation check.
// strict preservation check. Reject until EVERY
// supported source/restored field matches. No Collector behavior changes.
function potionFilterFingerprint(stack, role) {
    const fail = (reason) => { log(`[Filter Validation] ${role} fingerprint unavailable at ${reason}`); return undefined; };
    if (!stack) return fail("missing stack");
    if (!POTION_ITEM_IDS.has(stack.typeId) || stack.amount !== 1) return fail(`type/amount (${stack.typeId}, ${stack.amount})`);
    let potion;
    try { potion = potionIdentity(stack); } catch (e) { return fail(`potionIdentity exception ${e}`); }
    if (!potion) return fail("potionIdentity missing effect/delivery");
    let ids;
    try { ids = stack.getDynamicPropertyIds(); } catch (e) { return fail(`getDynamicPropertyIds exception ${e}`); }
    if (!Array.isArray(ids)) return fail("getDynamicPropertyIds did not return array");
    const dyn = {};
    for (const id of ids.sort()) {
        let v;
        try { v = stack.getDynamicProperty(id); } catch (e) { return fail(`getDynamicProperty(${id}) exception ${e}`); }
        if (!["string", "number", "boolean"].includes(typeof v) ||
            (typeof v === "number" && !Number.isFinite(v))) return fail(`unsupported dynamic property ${id}`);
        dyn[id] = v;
    }
    let lore, destroy, place;
    try { lore = queueVerifiedList(stack, "getLore"); } catch (e) { return fail(`getLore ${e}`); }
    try { destroy = queueVerifiedList(stack, "getCanDestroy"); } catch (e) { return fail(`getCanDestroy ${e}`); }
    try { place = queueVerifiedList(stack, "getCanPlaceOn"); } catch (e) { return fail(`getCanPlaceOn ${e}`); }
    if (destroy.length || place.length || stack.keepOnDeath ||
        (stack.lockMode !== undefined && stack.lockMode !== "none"))
        return fail(`unsupported metadata: destroy=${destroy.length}, place=${place.length}, keep=${!!stack.keepOnDeath}, lock=${stack.lockMode}`);
    let ench;
    try { ench = enchantments(stack); } catch (e) { return fail(`enchantments ${e}`); }
    return JSON.stringify({
        id: stack.typeId, max: stack.maxAmount, amount: stack.amount,
        potion, name: stack.nameTag ?? "", lore, ench, dyn
    });
}
function filterRoundTripSafe(original, data) {
    if (!POTION_ITEM_IDS.has(original.typeId)) return true;
    const restored = rebuildItem(data);
    if (!restored) { log(`[Filter Validation] rebuildItem returned no stack; ${original.typeId}, potion=${JSON.stringify(data.potion)}`); return false; }
    const before = potionFilterFingerprint(original, "original");
    const after = potionFilterFingerprint(restored, "rebuilt");
    const ok = before !== undefined && before === after;
    if (!ok) log(`[Filter Validation] preservation rejected: original=${before !== undefined}, rebuilt=${after !== undefined}, equal=${before !== undefined && before === after}; type=${original.typeId}; potion=${JSON.stringify(data.potion)}`);
    return ok;
}

function serializeFilterItem(stack) {
    const data = {
        typeId: stack.typeId,
        nameTag: stack.nameTag,
        lore: [],
        ench: enchantments(stack),
        dyn: dynamicProps(stack)
    };
    try { data.lore = stack.getLore(); } catch (_) {}
    if (POTION_ITEM_IDS.has(stack.typeId)) {
        const potion = potionIdentity(stack);
        if (!potion) return undefined;
        data.potion = potion;
    }

    try {
        const dur = stack.getComponent("minecraft:durability");
        if (dur) data.dur = {damage:dur.damage, unbreakable:!!dur.unbreakable};
    } catch (_) {}

    data.match = {
        typeId: stack.typeId,
        potion: data.potion,
        enchIds: stack.typeId === "minecraft:enchanted_book"
            ? data.ench.map(e => e.id).sort()
            : []
    };
    return data;
}

function rebuildItem(data) {
    try {
        // Legacy potion filters lack variant information: never invent a generic
        // replacement for a potion whose original state is no longer available.
        const s = POTION_ITEM_IDS.has(data.typeId)
            ? rebuildPotionVariant(data)
            : new ItemStack(data.typeId, 1);
        if (!s) return undefined;
        if (data.nameTag) s.nameTag = data.nameTag;
        if (Array.isArray(data.lore) && data.lore.length) s.setLore(data.lore);

        if (data.dur) {
            const dur = s.getComponent("minecraft:durability");
            if (dur) {
                dur.damage = data.dur.damage ?? 0;
                try { dur.unbreakable = !!data.dur.unbreakable; } catch (_) {}
            }
        }

        if (Array.isArray(data.ench) && data.ench.length) {
            const ec = s.getComponent("minecraft:enchantable");
            if (ec) {
                const vals = [];
                for (const e of data.ench) {
                    const t = EnchantmentTypes.get(e.id);
                    if (t) vals.push({type:t, level:e.level});
                }
                if (vals.length) ec.addEnchantments(vals);
            }
        }

        if (data.dyn && typeof data.dyn === "object") {
            for (const [k,v] of Object.entries(data.dyn)) {
                try { s.setDynamicProperty(k, v); } catch (_) {}
            }
        }
        return s;
    } catch (err) {
        log(`Could not rebuild filter item ${data?.typeId}: ${err}`);
        return undefined;
    }
}

function filterLabel(f) {
    if (!f) return "none";
    if (f.match?.typeId === "minecraft:enchanted_book" && f.match.enchIds?.length) {
        return `enchanted book [${f.match.enchIds.map(x => x.replace("minecraft:","")).join(" + ")}]`;
    }
    return f.match?.typeId ?? f.typeId ?? "unknown";
}

function matchesFilter(stack, f) {
    if (!f || !f.match) return false;
    if (stack.typeId !== f.match.typeId) return false;
    if (POTION_ITEM_IDS.has(stack.typeId)) {
        const incoming = potionIdentity(stack);
        const wanted = f.match.potion;
        return !!(incoming && wanted && incoming.effect === wanted.effect && incoming.delivery === wanted.delivery);
    }

    // Gear/tools/etc. match by base item ID only.
    if (stack.typeId !== "minecraft:enchanted_book") return true;

    // Enchanted books match the exact enchantment TYPE set, ignoring levels.
    const incoming = enchantments(stack).map(e => e.id).sort();
    const wanted = Array.isArray(f.match.enchIds) ? [...f.match.enchIds].sort() : [];
    if (incoming.length !== wanted.length) return false;
    for (let i=0; i<incoming.length; i++) {
        if (incoming[i] !== wanted[i]) return false;
    }
    return true;
}

function giveOrDrop(player, stack) {
    if (!stack) return;
    try {
        const inv = player.getComponent("minecraft:inventory")?.container;
        if (inv) {
            const left = inv.addItem(stack);
            if (!left) return;
            player.dimension.spawnItem(left, player.location);
            return;
        }
    } catch (_) {}
    try { player.dimension.spawnItem(stack, player.location); } catch (_) {}
}

function setFilter(player, block) {
    const d = block.dimension.id;
    const {x,y,z} = block.location;
    let e = findEntry(d,x,y,z);
    if (!e) {
        addEntry(block);
        e = findEntry(d,x,y,z);
    }
    if (!e) return;

    const eq = player.getComponent("minecraft:equippable");
    const hand = eq?.getEquipmentSlot(EquipmentSlot.Mainhand);
    const held = hand?.getItem();

    if (!held) {
        if (player.isSneaking && e.f) {
            const originalFilterData = e.f;
            const old = rebuildItem(e.f);
            if (!old) {
                player.sendMessage("§c[Sorter] Filter data incomplete; cannot refund safely. Filter retained.");
                return;
            }
            const oldMode = sorterMode(e);
            const oldStoredMode = e.m;
            e.f = null;
            if (oldMode === "filter") e.m = "wildcard";
            try { saveRegistry(); }
            catch (err) {
                e.f = originalFilterData;
                if (oldStoredMode === undefined) delete e.m;
                else e.m = oldStoredMode;
                log(`Filter removal save failed: ${err}`);
                player.sendMessage("§c[Sorter] Could not persist filter removal; item retained.");
                return;
            }
            dirty = true;
            removeDisplay(e);
            syncSorterModeVisual(e, block);
            giveOrDrop(player, old);
      // after safely persisting an empty filter and returning the
            // legacy item ONCE, mount the native frame. No filter reconstruction
            // or vanilla frame insertion occurs during migration.
            const migrated = migrateEmptyLegacyOnInteraction(player, d, x, y, z);
            player.sendMessage(`§7[Sorter] Filter removed. Mode: §f${sorterMode(e)}§7.${migrated ? " Native frame ready." : ""}`);
        } else {
            const blockNow = sorterAt(e);
            let facing = "unknown";
            try { facing = blockNow?.permutation.getState("minecraft:cardinal_direction") ?? "unknown"; } catch (_) {}
            const destText = sorterDestinationSummary(e);
            player.sendMessage(
                `§7[Sorter] Filter: §f${filterLabel(e.f)}` +
                `§7 | output: §f${facing}` +
                `§7 | destination: §f${destText}` +
                `§7 | mode: §f${sorterMode(e)}` +
                `§7 | indicator cycles modes; sneak + empty hand removes filter.`
            );
        }
        return;
    }

    const newFilter = serializeFilterItem(held);
    if (!newFilter || !filterRoundTripSafe(held, newFilter)) {
        player.sendMessage("§c[Sorter] Cannot safely preserve this filter item; no item consumed.");
        return;
    }
    const old = e.f ? rebuildItem(e.f) : undefined;
    if (e.f && !old) {
        player.sendMessage("§c[Sorter] Existing filter cannot be reconstructed safely; no changes made.");
        return;
    }

    // Consume exactly one item from main hand.
    if (held.amount <= 1) {
        hand.setItem(undefined);
    } else {
        held.amount -= 1;
        hand.setItem(held);
    }

    e.f = newFilter;
    e.m = "filter"; // Explicit filter assignment enables Filter mode.
    saveRegistry();
    dirty = true;
    syncSorterModeVisual(e, block);
    syncDisplay(e);

    if (old) giveOrDrop(player, old);
    player.sendMessage(`§7[Sorter] Filter set: §f${filterLabel(e.f)}§7.`);
}

function playerTargetsSorterServiceFace(player) {
    try {
        const hit = player.getBlockFromViewDirection({
            maxDistance: 6,
            includeLiquidBlocks: false,
            includePassableBlocks: false
        });
        if (!hit?.block || hit.block.typeId !== SORTER_ID) return false;

        const rearFace = sorterRearFace(hit.block);
        return !!rearFace && hit.face === rearFace;
    } catch (_) {
        return false;
    }
}

function sorterRearFace(block) {
    let dir;
    try { dir = block.permutation.getState("minecraft:cardinal_direction"); } catch (_) {}
    switch (dir) {
        case "north": return "South";
        case "south": return "North";
        case "west":  return "East";
        case "east":  return "West";
        default: return undefined;
    }
}

function facingOffset(block) {
    let dir;
    try { dir = block.permutation.getState("minecraft:cardinal_direction"); } catch (_) {}
    switch (dir) {
        case "north": return {x:0,y:0,z:-1};
        case "south": return {x:0,y:0,z:1};
        case "west":  return {x:-1,y:0,z:0};
        case "east":  return {x:1,y:0,z:0};
        default: return undefined;
    }
}

function supportedStorage(block) {
    if (!block) return false;
    const id = block.typeId;
    if (id === "minecraft:chest" || id === "minecraft:trapped_chest" || id === "minecraft:barrel") return true;
    if (id === "minecraft:shulker_box" || id.endsWith("_shulker_box")) return true;
    return false;
}

function destinationFor(entry) {
    const b = sorterAt(entry);
    if (!b) return undefined;
    const off = facingOffset(b);
    if (!off) return undefined;

    let dest;
    try {
        dest = b.dimension.getBlock({
            x: b.location.x + off.x,
            y: b.location.y,
            z: b.location.z + off.z
        });
    } catch (_) {
        return undefined;
    }
    if (!dest) return undefined;

    // A Hart Collector is now a first-class logical Sorter destination.
    // The Sorter never writes an inventory into the Collector block itself;
    // it commits directly into that Collector's linked Receiver queue.
    if (dest.typeId === COLLECTOR_ID) {
        const id = logisticsId(
            dest.dimension.id,
            dest.location.x,
            dest.location.y,
            dest.location.z
        );

        let collector = findCollectorById(id);
        if (!collector) {
            collector = registerCollector(dest);
        } else if (collector.present === false) {
            collector.present = true;
            saveLogistics();
        }

        return {kind:"collector", block:dest, collector};
    }

    if (!supportedStorage(dest)) return undefined;
    const c = dest.getComponent("minecraft:inventory")?.container;
    if (!c || !c.isValid) return undefined;
    return {kind:"storage", block:dest, container:c};
}

function sorterCollectorRoute(dest, stack) {
    const collector = dest?.collector;
    if (!collector?.link) return undefined;
    if (blockIsRedstonePowered(dest?.block)) return undefined;

    const receiver = findReceiverById(collector.link);
    if (!receiver) return undefined;

    // Sorter -> Collector routing is deliberately persistent-queue only.
    // If we cannot prove a safe metadata round trip, the item stays in the
    // hopper bus and can continue to another Sorter or overflow.
    const itemData = serializeQueueItem(stack);
    if (!itemData) return undefined;

    let queue;
    try {
        queue = loadReceiverQueue(receiver);
    } catch (err) {
        log(`Sorter could not load Collector queue ${receiver.id}: ${err}`);
        return undefined;
    }

    const room = QUEUE_CAPACITY - queue.total;
    if (room <= 0) return undefined;

    return {collector, receiver, itemData, room};
}

function sorterDestinationSummary(entry) {
    const dest = destinationFor(entry);
    if (!dest) return "none";

    if (dest.kind === "storage") return dest.block.typeId;

    const collector = dest.collector;
    if (!collector?.link) return "Hart Collector (unlinked)";

    const receiver = findReceiverById(collector.link);
    if (!receiver) return "Hart Collector (Receiver missing)";

    let queued = Number(receiver.queued) || 0;
    try { queued = loadReceiverQueue(receiver).total; } catch (_) {}

    return `Hart Collector -> Receiver | queued ${queued}/${QUEUE_CAPACITY}`;
}

function exactStackSig(stack) {
    if (!stack) return "";
    let sig = stack.typeId;
    try { sig += "|" + (stack.nameTag ?? ""); } catch (_) {}
    try { sig += "|" + JSON.stringify(stack.getLore()); } catch (_) {}
    try {
        const d = stack.getComponent("minecraft:durability");
        if (d) sig += `|d:${d.damage}:${d.unbreakable ? 1 : 0}`;
    } catch (_) {}
    try {
        sig += "|e:" + enchantments(stack).map(e => `${e.id}@${e.level}`).join(",");
    } catch (_) {}
    return sig;
}

function findAcceptSlot(container, stack) {
    let firstEmpty = -1;
    for (let i=0; i<container.size; i++) {
        const cur = container.getItem(i);
        if (!cur) {
            if (firstEmpty < 0) firstEmpty = i;
            continue;
        }
        try {
            if (cur.isStackableWith(stack) && cur.amount < cur.maxAmount) {
                return {slot:i, before:cur.amount, room:cur.maxAmount-cur.amount, existing:cur};
            }
        } catch (_) {}
    }
    if (firstEmpty >= 0) {
        return {slot:firstEmpty, before:0, room:stack.maxAmount, existing:undefined};
    }
    return undefined;
}

function slotState(container, slot) {
    const s = container.getItem(slot);
    return {
        sig: exactStackSig(s),
        amount: s?.amount ?? 0
    };
}

function getContainerAt(dimId, loc) {
    const b = getBlock(dimId, loc.x, loc.y, loc.z);
    const c = b?.getComponent("minecraft:inventory")?.container;
    return c && c.isValid ? c : undefined;
}

function recoverJournal() {
    const tx = safeJsonParse(world.getDynamicProperty(JOURNAL_KEY), undefined);
    if (!tx) return;

    const srcDim = tx.srcD ?? tx.d;
    const dstDim = tx.dstD ?? tx.d;
    const src = getContainerAt(srcDim, tx.src);
    const dst = getContainerAt(dstDim, tx.dst);
    if (!src || !dst) {
        log("Pending transfer journal could not be recovered yet because a container is unavailable.");
        return;
    }

    try {
        const ss = slotState(src, tx.srcSlot);
        const ds = slotState(dst, tx.dstSlot);

        const srcBefore = ss.sig === tx.sig && ss.amount === tx.srcBefore;
        const srcAfter = (tx.srcAfter === 0 && ss.amount === 0) || (ss.sig === tx.sig && ss.amount === tx.srcAfter);
        const dstBefore = (tx.dstBefore === 0 && ds.amount === 0) || (ds.sig === tx.sig && ds.amount === tx.dstBefore);
        const dstAfter = ds.sig === tx.sig && ds.amount === tx.dstAfter;

        if (srcBefore && dstBefore) {
            // Prepared but not started.
            saveJournal(undefined);
            log("Recovered untouched prepared transfer.");
            return;
        }

        if (srcAfter && dstBefore) {
            // Source was debited; finish the credit from journal copy.
            const item = rebuildTransportItem(tx.item, tx.move);
            if (!item) throw new Error("could not rebuild journal item");
            if (tx.dstBefore === 0) {
                dst.setItem(tx.dstSlot, item);
            } else {
                const cur = dst.getItem(tx.dstSlot);
                cur.amount = tx.dstAfter;
                dst.setItem(tx.dstSlot, cur);
            }
            saveJournal(undefined);
            log("Recovered debited transfer and completed destination credit.");
            return;
        }

        if (srcAfter && dstAfter) {
            saveJournal(undefined);
            log("Recovered completed transfer.");
            return;
        }

        // If destination clearly has the credit but source still shows the pre-transfer amount,
        // complete the debit. This is the only safe remaining deterministic state.
        if (srcBefore && dstAfter) {
            if (tx.srcAfter === 0) {
                src.setItem(tx.srcSlot, undefined);
            } else {
                const cur = src.getItem(tx.srcSlot);
                cur.amount = tx.srcAfter;
                src.setItem(tx.srcSlot, cur);
            }
            saveJournal(undefined);
            log("Recovered credited transfer and completed source debit.");
            return;
        }

        log("TRANSFER JOURNAL AMBIGUOUS: leaving journal intact and making no changes.");
    } catch (err) {
        log(`Journal recovery failed: ${err}`);
    }
}

function serializeTransport(stack) {
    return serializeFilterItem(stack);
}

function rebuildTransportItem(data, amount) {
    const one = rebuildItem(data);
    if (!one) return undefined;
    one.amount = amount;
    return one;
}

function safeMovePartial(src, srcBlock, srcSlot, dst, dstBlock, dstSlotInfo, amount) {
    const sourceItem = src.getItem(srcSlot);
    if (!sourceItem || amount <= 0 || amount > sourceItem.amount) return 0;

    const move = Math.min(amount, dstSlotInfo.room, sourceItem.amount);
    if (move <= 0) return 0;

    const sig = exactStackSig(sourceItem);
    const transportData = serializeTransport(sourceItem);
    if (!transportData || (POTION_ITEM_IDS.has(sourceItem.typeId) && !filterRoundTripSafe(sourceItem, transportData))) return 0;
    const tx = {
        d: srcBlock.dimension.id,
        srcD: srcBlock.dimension.id,
        dstD: dstBlock.dimension.id,
        src: srcBlock.location,
        dst: dstBlock.location,
        srcSlot,
        dstSlot: dstSlotInfo.slot,
        sig,
        srcBefore: sourceItem.amount,
        srcAfter: sourceItem.amount - move,
        dstBefore: dstSlotInfo.before,
        dstAfter: dstSlotInfo.before + move,
        move,
        item: transportData
    };

    saveJournal(tx);

    // Debit source.
    if (tx.srcAfter === 0) {
        src.setItem(srcSlot, undefined);
    } else {
        const remain = sourceItem.clone();
        remain.amount = tx.srcAfter;
        src.setItem(srcSlot, remain);
    }

    // Credit destination.
    if (tx.dstBefore === 0) {
        const moved = sourceItem.clone();
        moved.amount = move;
        dst.setItem(tx.dstSlot, moved);
    } else {
        const cur = dst.getItem(tx.dstSlot);
        if (!cur || exactStackSig(cur) !== sig) {
            throw new Error("destination changed during transfer");
        }
        cur.amount = tx.dstAfter;
        dst.setItem(tx.dstSlot, cur);
    }

    saveJournal(undefined);
    return move;
}

function rebuildTopology() {
    // Keep entries even if chunks are not currently available. Stale entries are
    // discarded only when the block is loaded and is definitely not a sorter.
    const groups = new Map();

    for (const e of registry) {
        const k = `${e.d}|${e.x}|${e.z}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
    }

    const next = [];

    for (const [, entries] of groups) {
        entries.sort((a,b) => a.y-b.y); // bottom -> top

        let run = [];
        const flush = () => {
            if (!run.length) return;
            const top = run[run.length-1];
            next.push({
                d: top.d,
                x: top.x,
                z: top.z,
                source: {x:top.x, y:top.y+1, z:top.z},
                sorters: [...run] // already bottom -> top
            });
            run = [];
        };

        for (const e of entries) {
            if (!run.length || e.y === run[run.length-1].y + 1) {
                run.push(e);
            } else {
                flush();
                run.push(e);
            }
        }
        flush();
    }

    columns = next;
    dirty = false;
    if (rrStart >= columns.length) rrStart = 0;
}

function compactSourceHopper(container) {
    // Vanilla hoppers insert into the first available slot. Because the sorter
    // can remove matching stacks from any slot, an unmatched stack in a later
    // slot can otherwise be starved indefinitely by new arrivals repeatedly
    // filling an earlier gap. Keep the source hopper packed left so vanilla
    // pass-through always has a chance to advance the oldest remaining stack.
    let write = 0;
    for (let read = 0; read < container.size; read++) {
        const item = container.getItem(read);
        if (!item) continue;
        if (read !== write) {
            container.setItem(write, item);
            container.setItem(read, undefined);
        }
        write++;
    }
}

function processColumn(col, globalRemaining) {
    if (globalRemaining <= 0) return 0;

    const dim = getDimension(col.d);
    if (!dim) return 0;

    let sourceBlock;
    try { sourceBlock = dim.getBlock(col.source); } catch (_) { return 0; }
    if (!sourceBlock || sourceBlock.typeId !== "minecraft:hopper") return 0;

    // A powered source hopper is a hard pause for the entire Sorter column.
    // Check before compaction so Hart Logistics performs zero inventory
    // mutation while vanilla considers the hopper disabled.
    if (hopperIsRedstoneLocked(sourceBlock)) return 0;

    const activeSorters = col.sorters.filter(e => {
        const b = sorterAt(e);
        return b && !e.nativeQuarantine && !blockIsRedstonePowered(b) && sorterMode(e) !== "bypass";
    });
    if (!activeSorters.length) return 0;

    const src = sourceBlock.getComponent("minecraft:inventory")?.container;
    if (!src || !src.isValid) return 0;

    // Eliminate holes before inspecting the hopper so unmatched items cannot
    // become stranded behind a slot repeatedly refilled by the upstream hopper.
    // This is skipped entirely when every Sorter in the column is powered.
    compactSourceHopper(src);

    let movedTotal = 0;
    let columnBudget = Math.min(PER_COLUMN_BATCH, globalRemaining);

    // Five hopper slots; each slot is offered only to this column.
    for (let si=0; si<src.size && columnBudget>0; si++) {
        let stack = src.getItem(si);
        if (!stack) continue;

        // Priority: exact Filter -> destination-seeded Auto -> Wildcard;
        // within each priority keep original bottom-to-top column order.
        // Bypass never appears in activeSorters. A Filter with no item accepts none.
        const specific = activeSorters.filter(e => sorterMode(e) === "filter" && e.f && matchesFilter(stack, e.f));
        const auto = activeSorters.filter(e => sorterMode(e) === "auto" && autoSorterMatches(stack, e));
        const wildcard = activeSorters.filter(e => sorterMode(e) === "wildcard");
        const targets = [...specific, ...auto, ...wildcard];

        if (!targets.length) continue;

        for (const e of targets) {
            while (columnBudget > 0) {
                stack = src.getItem(si);
                if (!stack) break;

                // Re-evaluate after each transfer; chest seed contents can
                // change and a selected Auto Sorter must not become wildcard.
                const mode = sorterMode(e);
                if (mode === "bypass") break;
                if (mode === "filter" && (!e.f || !matchesFilter(stack, e.f))) break;
                if (mode === "auto" && !autoSorterMatches(stack, e)) break;

                const dest = destinationFor(e);
                if (!dest) break;

                let moved = 0;

                if (dest.kind === "collector") {
                    const route = sorterCollectorRoute(dest, stack);
                    if (!route) break;

                    const want = Math.min(
                        columnBudget,
                        stack.amount,
                        route.room
                    );
                    if (want <= 0) break;

                    try {
                        moved = enqueueFromSource(
                            route.receiver,
                            route.collector,
                            {container:src, block:sourceBlock},
                            si,
                            want,
                            route.itemData
                        );
                    } catch (err) {
                        log(`Sorter -> Collector transfer failed at ${col.d} ${col.x},${col.z}: ${err}`);
                        recoverQueueJournal();
                        return movedTotal;
                    }
                } else {
                    const slotInfo = findAcceptSlot(dest.container, stack);
                    if (!slotInfo) break;

                    const want = Math.min(columnBudget, stack.amount, slotInfo.room);
                    if (want <= 0) break;

                    try {
                        moved = safeMovePartial(
                            src, sourceBlock, si,
                            dest.container, dest.block,
                            slotInfo, want
                        );
                    } catch (err) {
                        log(`Transfer failed at ${col.d} ${col.x},${col.z}: ${err}`);
                        recoverJournal();
                        return movedTotal;
                    }
                }

                if (moved <= 0) break;
                movedTotal += moved;
                columnBudget -= moved;
            }

            if (columnBudget <= 0) break;
            stack = src.getItem(si);
            if (!stack) break;
        }
    }

    // A matching transfer may have opened an earlier slot. Pack the remaining
    // contents left immediately, before vanilla hopper transport gets another
    // chance to refill that gap.
    compactSourceHopper(src);

    return movedTotal;
}

function processCollectorIngress(collector, globalRemaining) {
    if (globalRemaining <= 0 || !collector.link) return 0;

    const collectorBlock = collectorAt(collector);
    if (!collectorBlock || blockIsRedstonePowered(collectorBlock)) return 0;

    const receiver = findReceiverById(collector.link);
    if (!receiver) return 0;

    const sources = collectorInputSources(collector);
    if (!sources.length) return 0;

    let used = 0;
    let budget = Math.min(COLLECTOR_BATCH, globalRemaining);

    for (const source of sources) {
        // A powered vanilla hopper is a hard logistics gate. Script API can
        // still edit its container directly, so we must explicitly honor the
        // hopper's redstone-disabled state here.
        if (source.kind === "hopper" && source.locked) continue;

        for (let si=0; si<source.container.size && budget>0; si++) {
            let stack = source.container.getItem(si);
            if (!stack) continue;

            const itemData = serializeQueueItem(stack);

            if (itemData) {
                const q = loadReceiverQueue(receiver);
                if (q.total >= QUEUE_CAPACITY) return used;

                const want = Math.min(budget, stack.amount, QUEUE_CAPACITY - q.total);
                if (want <= 0) return used;

                let moved = 0;
                try {
                    moved = enqueueFromSource(receiver, collector, source, si, want, itemData);
                } catch (err) {
                    log(`Collector queue ingest failed for ${collector.id}: ${err}`);
                    recoverQueueJournal();
                    return used;
                }

                if (moved > 0) {
                    used += moved;
                    budget -= moved;
                }
                continue;
            }

            // Non-stackable or metadata we cannot prove round-trips safely:
            // never serialize it. If Receiver is currently loaded AND there is
            // no queued backlog to jump ahead of, use exact direct transfer.
            let qTotal = Number(receiver.queued) || 0;
            try { qTotal = loadReceiverQueue(receiver).total; } catch (_) {}

            const receiverBlock = receiverAt(receiver);
            const output = qTotal === 0 && receiverBlock && !blockIsRedstonePowered(receiverBlock)
                ? receiverOutputHopper(receiver)
                : undefined;
            if (output && !output.locked) {
                const slotInfo = findAcceptSlot(output.container, stack);
                if (slotInfo) {
                    const want = Math.min(budget, stack.amount, slotInfo.room);
                    try {
                        const moved = safeMovePartial(
                            source.container, source.block, si,
                            output.container, output.block,
                            slotInfo, want
                        );
                        if (moved > 0) {
                            used += moved;
                            budget -= moved;
                            collector.accepted = (collector.accepted ?? 0) + moved;
                            try {
                                recordDirectReceiverTransfer(receiver, moved);
                            } catch (counterErr) {
                                // The physical transfer already completed safely. Counter
                                // persistence is diagnostic and must not replay the item.
                                receiver.received = (receiver.received ?? 0) + moved;
                                receiver.delivered = (receiver.delivered ?? 0) + moved;
                                log(`Direct-only Receiver counter persistence deferred for ${receiver.id}: ${counterErr}`);
                            }
                            markLogisticsDirty();
                        }
                    } catch (err) {
                        log(`Direct-only Collector transfer failed for ${collector.id}: ${err}`);
                        recoverJournal();
                        return used;
                    }
                }
            } else if (!queueRejectSeen.has(stack.typeId)) {
                queueRejectSeen.add(stack.typeId);
                log(`Persistent queue left unsupported/non-stackable item at source: ${stack.typeId}`);
            }
        }
    }

    return used;
}

function processReceiverDrain(receiver, globalRemaining) {
    if (globalRemaining <= 0) return 0;

    const receiverBlock = receiverAt(receiver);
    if (!receiverBlock || blockIsRedstonePowered(receiverBlock)) return 0;

    const output = receiverOutputHopper(receiver);
    if (!output || output.locked) return 0;

    let budget = Math.min(RECEIVER_BATCH, globalRemaining);
    let used = 0;

    while (budget > 0) {
        let q;
        try { q = loadReceiverQueue(receiver); }
        catch (err) {
            log(`Receiver queue load failed for ${receiver.id}: ${err}`);
            return used;
        }

        if (q.total <= 0) break;

        let moved = 0;
        try {
            moved = dequeueToReceiver(receiver, output, budget);
        } catch (err) {
            log(`Receiver queue drain failed for ${receiver.id}: ${err}`);
            recoverQueueJournal();
            return used;
        }

        if (moved <= 0) break;
        used += moved;
        budget -= moved;
    }

    return used;
}

function logisticsTick() {
    if (!ready) return;

    recoverQueueJournal();
    if (getQueueJournal()) return;

    let ingestBudget = LOGISTICS_GLOBAL_BUDGET;
    const collectors = logistics.collectors;
    if (collectors.length) {
        for (let k=0; k<collectors.length && ingestBudget>0; k++) {
            const idx = (collectorRrStart + k) % collectors.length;
            const col = collectors[idx];
            if (!collectorAt(col)) continue;

            const used = processCollectorIngress(col, ingestBudget);
            ingestBudget -= used;
        }
        collectorRrStart = (collectorRrStart + 1) % collectors.length;
    }

    // A physical transfer journal is used only for direct-only fallback items.
    // If one is unresolved, do not start another physical Receiver operation.
    if (world.getDynamicProperty(JOURNAL_KEY)) return;

    let drainBudget = LOGISTICS_GLOBAL_BUDGET;
    const receivers = logistics.receivers;
    if (receivers.length) {
        for (let k=0; k<receivers.length && drainBudget>0; k++) {
            const idx = (receiverRrStart + k) % receivers.length;
            const receiver = receivers[idx];
            if (!receiverAt(receiver)) continue;

            const used = processReceiverDrain(receiver, drainBudget);
            drainBudget -= used;
        }
        receiverRrStart = (receiverRrStart + 1) % receivers.length;
    }
}

function schedulerTick() {
    if (!ready) return;
    if (world.getDynamicProperty(JOURNAL_KEY)) return;
    if (getQueueJournal()) return;
    if (dirty) rebuildTopology();
    if (!columns.length) return;

    let budget = GLOBAL_MOVE_BUDGET;
    const n = columns.length;

    // Inspect every active column each tick so a vanilla hopper cannot normally
    // carry a matching item past its column before we see it. Rotate the start
    // position so a saturated global budget stays fair.
    for (let k=0; k<n && budget>0; k++) {
        const idx = (rrStart + k) % n;
        const used = processColumn(columns[idx], budget);
        budget -= used;
    }

    rrStart = (rrStart + 1) % n;
}

// Droppers/dispensers retain vanilla pulse semantics. Hart Logistics never
// siphons their inventories directly; only an item entity actually ejected
// into a Collector can be accepted. Dispenser actions that create projectiles,
// place fluids, equip armor, etc. therefore remain entirely vanilla.
world.afterEvents.entitySpawn.subscribe(ev => {
    if (ev.entity?.typeId !== "minecraft:item") return;

    let spawnLoc;
    try {
        const p = ev.entity.location;
        spawnLoc = {x:p.x, y:p.y, z:p.z};
    } catch (_) {}

    // Let vanilla finish the dropper/dispenser activation tick before
    // correlating the spawned item with a Collector-facing source.
    system.runTimeout(() => processEjectedItemEntity(ev.entity, 0, spawnLoc), 1);
});

// Some vanilla items have their own use action in addition to the block
// interaction. Cancelling playerInteractWithBlock alone can therefore still
// let the item activate (most visibly, Ender Pearls teleporting when used as
// a Sorter filter). Suppress the item's native use whenever the player is
// actually aiming at the Sorter's rear/service face. The normal Sorter block
// interaction handler below still consumes exactly one item as the filter.
world.beforeEvents.itemUse.subscribe(ev => {
    if (!ev.itemStack) return;
    if (!playerTargetsSorterServiceFace(ev.source)) return;
    ev.cancel = true;
});

world.beforeEvents.playerInteractWithEntity.subscribe(ev => {
    if (ev.target.typeId !== DISPLAY_ID) return;

    // The visible filter item is rendered by a tiny armor-stand-runtime helper.
    // Cancel interaction with the helper and redirect it to the owning sorter,
    // so clicking the displayed item is indistinguishable from clicking the block.
    ev.cancel = true;

    let owner;
    try { owner = ev.target.getDynamicProperty(DISPLAY_OWNER_PROP); } catch (_) {}
    const entry = findEntryByDisplayOwner(owner);
    if (!entry) return;

    const player = ev.player;
    system.run(() => {
        const block = sorterAt(entry);
        if (block) setFilter(player, block);
    });
});


// Native-frame lifecycle (registry remains authoritative). The registry remains the routing
// authority; the frame supplies the physical fixed item renderer.
function entryHasFrameImplant(e) { return Array.isArray(e?.i) && e.i.length === 4; }
function rearOffset(face) {
    if (face === "North") return {x:0,z:-1,fd:2};
    if (face === "South") return {x:0,z:1,fd:3};
    if (face === "West") return {x:-1,z:0,fd:4};
    if (face === "East") return {x:1,z:0,fd:5};
}
function frameSpec(block) {
    const side = rearOffset(sorterRearFace(block));
    if (!side) return undefined;
    const p = block.location;
    return [p.x+side.x,p.y,p.z+side.z,side.fd];
}
function nativeFrameBlock(e) {
    if (!entryHasFrameImplant(e)) return undefined;
    return getBlock(e.d,e.i[0],e.i[1],e.i[2]);
}
function frameOwner(block) {
    if (block?.typeId !== "minecraft:frame") return undefined;
    const p=block.location;
    return registry.find(e => e.d===block.dimension.id && entryHasFrameImplant(e) &&
        e.i[0]===p.x && e.i[1]===p.y && e.i[2]===p.z);
}
function plantEmptyNativeFrame(e) {
    if (e.f || entryHasFrameImplant(e)) return false;
    const support=sorterAt(e);
    const spec=frameSpec(support);
    if (!spec) return false;
    const target=getBlock(e.d,spec[0],spec[1],spec[2]);
    if (!target || target.typeId!=="minecraft:air") return false;
    try {
        target.setPermutation(BlockPermutation.resolve("minecraft:frame", {
            facing_direction:spec[3],item_frame_map_bit:false,item_frame_photo_bit:false
        }));
        if (target.typeId!=="minecraft:frame") return false;
        e.i=spec;
        try { saveRegistry(); }
        catch(err) {delete e.i;target.setType("minecraft:air");log(`[Frame] save failed: ${err}`);return false;}
        removeDisplay(e);
        return true;
    } catch(err) {log(`[Frame] place failed: ${err}`);return false;}
}
// lazy legacy migration, adapted to 's
// authoritative filter state. Only an EMPTY legacy Sorter may implant.
// Never touch a populated legacy filter, its display, or an occupied rear cell.
function migrateEmptyLegacyOnInteraction(player, dimensionId, x, y, z) {
    const e = findEntry(dimensionId, x, y, z);
    if (!e || e.f || entryHasFrameImplant(e) || e.nativeQuarantine) return false;
    const support = sorterAt(e);
    if (!support || support.typeId !== SORTER_ID) return false;
    if (!plantEmptyNativeFrame(e)) {
        player?.sendMessage("§e[Hart Logistics] Filter cleared; native frame unavailable. Legacy Sorter remains usable.");
        return false;
    }
    dirty = true;
    syncSorterModeVisual(e, support);
    player?.sendMessage("§a[Hart Logistics] Legacy Sorter converted to native frame. Insert the replacement filter normally.");
    return true;
}

function eraseOwnedFrame(e) {
    const f=nativeFrameBlock(e);
    if(f?.typeId==="minecraft:frame") {
        try {f.setType("minecraft:air");}catch(err){log(`[Frame] cleanup failed: ${err}`);}
    }
}
// No background scan of populated legacy Sorters. Freshly placed Sorters only;
// existing empty legacy sorters migrate when the player interacts with them.
function nativeFrameFresh(d,x,y,z) {
    const e=findEntry(d,x,y,z);
    if(e && !e.f && !entryHasFrameImplant(e)) plantEmptyNativeFrame(e);
}
// Native frame owns the physical filter item. Punching the occupied
// frame uses vanilla item ejection; there is deliberately no scripted
// sneak-removal/reconstruction path for implanted native frames.
function nativeFrameMirror(ev) {
    if(!ev.isFirstEvent || ev.block?.typeId!=="minecraft:frame")return;
    const e=frameOwner(ev.block);
    if(!e || e.f || !ev.beforeItemStack)return;
    const data=serializeFilterItem(ev.beforeItemStack);
    if(!data || !filterRoundTripSafe(ev.beforeItemStack,data)){
        e.nativeQuarantine=1;
        // No logical filter, and no matching or wildcard routing while quarantined.
        e.m="filter";
        dirty=true;
        syncSorterModeVisual(e);
        try { saveRegistry(); }
        catch(err) { log(`[Hart Logistics] Could not persist quarantined frame at ${displayOwnerKey(e)}: ${err}`); }
        log(`[Hart Logistics] Item not validated at ${displayOwnerKey(e)}; physical item retained, logical filter inactive.`);
        ev.player?.sendMessage("§c[Hart Logistics] Item not verified. Sorting disabled; PUNCH the frame to retrieve it. Do not break the Sorter.");
        return;
    }
    const before=ev.beforeItemStack,after=ev.itemStack;
    const consumed=(!after || after.typeId!==before.typeId || after.amount<before.amount);
    e.f=data;e.fc=consumed?1:0;
    delete e.nativeQuarantine;
    e.m="filter";
    try{saveRegistry();}
    catch(err){e.f=null;delete e.fc;log(`[Frame] mirror persist failed: ${err}`);return;}
    dirty=true;
    syncSorterModeVisual(e);
    removeDisplay(e);
    ev.player?.sendMessage(`§7[Hart Logistics] Native filter: §f${filterLabel(e.f)}§7 (mode FILTER).`);
}

// Native-frame single-click potion insertion.
// `beforeEvents` is restricted, so only cheap identity checks occur before
// vanilla's physical insertion. Strict metadata validation is performed in the
// unrestricted `afterEvents` handler and must succeed before routing activates.
// If validation fails, the native frame retains the physical item for punch
// retrieval; a persisted quarantine flag blocks routing, replacement and
// Sorter destruction until the player has recovered that item.
world.afterEvents.playerInteractWithBlock.subscribe(nativeFrameMirror);

world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
    if (!ev.isFirstEvent) return;

    const typeId = ev.block.typeId;
    if (typeId === "minecraft:frame") {
        const e=frameOwner(ev.block);
        if(!e)return;
        const player=ev.player;
        const held=player.getComponent("minecraft:equippable")?.getEquipmentSlot(EquipmentSlot.Mainhand)?.getItem();
        ev.cancel=true;
        if(e.nativeQuarantine) {
            player.sendMessage("§e[Hart Logistics] Unverified item is still in this frame. PUNCH to recover it before using the Sorter.");
        } else if(!held) {
            player.sendMessage(`§7[Hart Logistics] Filter: §f${filterLabel(e.f)}§7 | mode ${sorterMode(e)}. Punch the frame to retrieve its item; use the upper front rail to cycle modes.`);
        } else if(e.f) {
            player.sendMessage("§e[Hart Logistics] Punch the frame to retrieve its current filter before inserting another item.");
        } else {
            if(POTION_ITEM_IDS.has(held.typeId)) {
                // Cheap, read-only check works in restricted before-events.
                // Never call getCanDestroy/getCanPlaceOn/strict fingerprints here.
                if (!potionIdentity(held)) {
                    player.sendMessage("§c[Hart Logistics] Potion identity unavailable. No insertion.");
                } else {
                    // The physical ItemStack is now owned by vanilla's frame.
                    // The after-event must validate it BEFORE setting e.f.
                    ev.cancel=false;
                }
            } else {
                const data=serializeFilterItem(held);
                if(!data || !filterRoundTripSafe(held,data)) {
                    player.sendMessage("§c[Hart Logistics] Cannot preserve this item safely. No insertion.");
                } else {
                    ev.cancel=false;
                }
            }
        }
        return;
    }
    if (typeId !== SORTER_ID && typeId !== COLLECTOR_ID && typeId !== RECEIVER_ID) return;

    // Sorter configuration belongs ONLY to the rear/service face. All other
    // sorter faces remain ordinary block faces so sneak-use can place hoppers,
    // chests, blocks, etc. against them without turning the held item into a filter.
    if (typeId === SORTER_ID) {
        const rearFace = sorterRearFace(ev.block);
        const pp=ev.block.location;
        const ee=findEntry(ev.block.dimension.id,pp.x,pp.y,pp.z);
        const implanted=ee && entryHasFrameImplant(ee);
        const topTarget=implanted && targetsNativeTopModeIndicator(ev.block,ev.blockFace,ev.faceLocation);
        if (!topTarget && (!rearFace || ev.blockFace !== rearFace)) return;
    }

  // In only the bottom-center LED changes modes. Other service-face
    // interactions retain the original filter UX. The ray and bounded event
    // hit checks tolerate camera drift and some faceLocation coordinate defects.
    const modeClick = typeId === SORTER_ID && (() => {
        const p=ev.block.location;
        const entry=findEntry(ev.block.dimension.id,p.x,p.y,p.z);
        if(entry && entryHasFrameImplant(entry)) {
            // Native implant: upper front rail only, with existing top-edge
            // fallback. Never recognize the obsolete bottom legacy indicator.
            return targetsNativeFrontModeIndicator(ev.player,ev.block,ev.blockFace,ev.faceLocation) ||
                targetsNativeTopModeIndicator(ev.block,ev.blockFace,ev.faceLocation);
        }
        // Unmigrated legacy Sorters retain their original lower click target.
        return targetsSorterModeIndicator(ev.player,ev.block,ev.blockFace,ev.faceLocation);
    })();

    if (typeId === SORTER_ID && !modeClick) {
        const p=ev.block.location;
        const e=findEntry(ev.block.dimension.id,p.x,p.y,p.z);
        if(e && entryHasFrameImplant(e)) {
            ev.cancel=true;
            ev.player.sendMessage("§7[Hart Logistics] Use the native frame center for filters, or the top service-edge indicator for modes.");
            return;
        }
    }

    // Collector/Receiver use is intentionally NOT intercepted while sneaking.
    // This restores normal Minecraft sneak-place behavior so hoppers/chests/blocks
    // can be placed against any face. Normal standing right-click remains the
    // link/status interaction.
    if ((typeId === COLLECTOR_ID || typeId === RECEIVER_ID) && ev.player.isSneaking) {
        return;
    }

    ev.cancel = true;

    const player = ev.player;
    const d = ev.block.dimension.id;
    const p = ev.block.location;
    system.run(() => {
        const block = getBlock(d, p.x, p.y, p.z);
        if (!block) return;
        if (block.typeId === SORTER_ID) {
            if (modeClick) setSorterMode(player, block);
            else {
                const e=findEntry(d,p.x,p.y,p.z);
                if(e && !e.f && !entryHasFrameImplant(e) && migrateEmptyLegacyOnInteraction(player,d,p.x,p.y,p.z)) {
                    player.sendMessage("§7[Hart Logistics] Native frame mounted. Click its center again to set filter.");
                } else setFilter(player,block);
            }
        }
        else if (block.typeId === COLLECTOR_ID) selectCollector(player, block);
        else if (block.typeId === RECEIVER_ID) useReceiver(player, block);
    });
});

world.afterEvents.playerPlaceBlock.subscribe(ev => {
    if (ev.block.typeId === SORTER_ID) {
        const registered = addEntry(ev.block);
        const p = ev.block.location;
        const e = findEntry(ev.block.dimension.id, p.x, p.y, p.z);
        if (e) {
            removeDisplay(e);
            syncSorterModeVisual(e, ev.block);
        }

        if (registered) {
            const d=ev.block.dimension.id;
            system.runTimeout(()=>nativeFrameFresh(d,p.x,p.y,p.z),1);
        }

        if (!registered) {
            ev.player?.sendMessage(
                "§c[Sorter] Block placed, but registry persistence failed. " +
                "Interact with its rear service face after correcting the error to re-register it."
            );
        } else {
            ev.player?.sendMessage("§7[Sorter] Placed. Face the destination while placing; supports storage or a Hart Collector.");
        }
        return;
    }

    if (ev.block.typeId === COLLECTOR_ID) {
        const e = registerCollector(ev.block);
        if (ev.player) {
            pendingCollectorByPlayer.set(ev.player.id, e.id);
            ev.player.sendMessage("§b[Collector] Placed and selected. Interact with a Hart Receiver to complete the link.");
        }
        return;
    }

    if (ev.block.typeId === RECEIVER_ID) {
        registerReceiver(ev.block);
        ev.player?.sendMessage("§6[Receiver] Placed. Select a Collector, then interact with this block to link it.");
    }
});

world.beforeEvents.playerBreakBlock.subscribe(ev => {
    const block=ev.block;
    if(!block)return;
    if(block.typeId==="minecraft:frame" && frameOwner(block)) {
        ev.cancel=true;
        ev.player?.sendMessage("§e[Hart Logistics] Native frame belongs to a Sorter. Punch its displayed item to retrieve the filter.");
        return;
    }
    if(block.typeId!==SORTER_ID)return;
    const p=block.location,d=block.dimension;
    const e=findEntry(d.id,p.x,p.y,p.z);
    if(!e || !entryHasFrameImplant(e))return;
    if(e.nativeQuarantine) {
        ev.cancel=true;
        ev.player?.sendMessage("§c[Hart Logistics] Retrieve the unverified item by punching its frame BEFORE breaking the Sorter.");
        return;
    }
    ev.cancel=true;
    system.run(()=>{
        const live=findEntry(d.id,p.x,p.y,p.z);
        const support=getBlock(d.id,p.x,p.y,p.z);
        if(!live || !entryHasFrameImplant(live) || support?.typeId!==SORTER_ID)return;
        eraseOwnedFrame(live);
        try {
            if(ev.player?.getGameMode?.()==="Creative")support.setType("minecraft:air");
            else d.runCommand(`setblock ${p.x} ${p.y} ${p.z} air destroy`);
        } catch(err){log(`[Frame] controlled break failed ${err}`);return;}
        const old=removeEntry(d.id,p.x,p.y,p.z);
        if(old?.f && old.fc===1)giveOrDrop(ev.player,rebuildItem(old.f));
    });
});
// Punching the occupied frame returns the physical item via vanilla; never refund it again.
world.afterEvents.entityHitBlock.subscribe(ev=>{
    if(ev.damagingEntity?.typeId!=="minecraft:player")return;
    const e=frameOwner(ev.hitBlock);
    if(!e?.f && !e?.nativeQuarantine)return;
    system.run(()=>{
        const live=findEntry(e.d,e.x,e.y,e.z);
        if(!live?.f && !live?.nativeQuarantine)return;
        live.f=null;delete live.fc;delete live.nativeQuarantine;
        if(sorterMode(live)==="filter")live.m="wildcard";
        saveRegistry();dirty=true;syncSorterModeVisual(live);
    });
});

world.afterEvents.playerBreakBlock.subscribe(ev => {
    let typeId = "";
    try { typeId = ev.brokenBlockPermutation.type.id; } catch (_) {
        try { typeId = ev.brokenBlockPermutation.typeId; } catch (_) {}
    }

    const p = ev.block.location;

    if (typeId === SORTER_ID) {
        const pre=findEntry(ev.dimension.id,p.x,p.y,p.z);
        if(pre && entryHasFrameImplant(pre))eraseOwnedFrame(pre);
        const old = removeEntry(ev.dimension.id, p.x, p.y, p.z);
        if (old?.f && (!entryHasFrameImplant(old) || old.fc === 1)) {
            const item = rebuildItem(old.f);
            giveOrDrop(ev.player, item);
        }
        return;
    }

    if (typeId === COLLECTOR_ID || typeId === RECEIVER_ID) {
        // Preserve the relationship record so replacing the same block at the
        // same coordinates automatically restores the link.
        markLogisticsAbsent(typeId, ev.dimension.id, p.x, p.y, p.z);
    }
});

system.beforeEvents.startup.subscribe((event) => {
    event.blockComponentRegistry.registerCustomComponent(
        HART_REDSTONE_COMPONENT,
        {
            onRedstoneUpdate: (ev) => {
                updateHartRedstoneState(ev);
            }
        }
    );

    event.customCommandRegistry.registerCommand(
        {
            name: "hartlogistics:status",
            description: "Show read-only Hart Logistics diagnostics.",
            permissionLevel: CommandPermissionLevel.GameDirectors,
            cheatsRequired: false
        },
        (origin) => {
            system.run(() => sendDiagnostics(origin));
        }
    );
});


system.run(() => {
    registry = loadRegistry();
    if (!Array.isArray(registry)) registry = [];

    logistics = safeJsonParse(world.getDynamicProperty(LOGISTICS_KEY), {collectors: [], receivers: [], nextQueue: 1});
    if (!logistics || !Array.isArray(logistics.collectors) || !Array.isArray(logistics.receivers)) {
        logistics = {collectors: [], receivers: [], nextQueue: 1};
    }
    if (typeof logistics.nextQueue !== "number") logistics.nextQueue = 1;

    migrateLegacyCollectorsIfNeeded();

    // Load every Receiver queue once at startup. Existing q2/q3 queues are
    // migrated in place to q4 before journal recovery. Logical entry IDs stay
    // stable, so even a transaction interrupted during the upgrade can still
    // be resolved against the q4 page representation.
    for (const receiver of logistics.receivers) {
        if (!receiver.queueKey) receiver.queueKey = allocateQueueKey();
        try { loadReceiverQueue(receiver, true); }
        catch (err) { log(`Receiver queue initialization failed for ${receiver.id}: ${err}`); }
    }

    recoverJournal();
    recoverQueueJournal();

    dirty = true;
    ready = true;
    log(
        `ready; sorters=${registry.length}, collectors=${logistics.collectors.length}, ` +
        `receivers=${logistics.receivers.length}, registry=${registryStorageSummary()}`
    );
    system.runTimeout(reconcileDisplays, 5);
});

system.runInterval(schedulerTick, 1);
system.runInterval(logisticsTick, 1);
system.runInterval(reconcileDisplays, 100);
system.runInterval(reconcileModeVisuals, 5);
system.runInterval(recoverJournal, 20);
system.runInterval(recoverQueueJournal, 20);
system.runInterval(flushLogistics, 200);
