/*
 * PG-20 derived LAB candidate: conservative native MR direct-route patch.
 * Included only in compiled candidate from untouched 1.4.1 + accepted PG08 UI.
 * NO separate world state/commands, runtime debug toggles, custom blocks, or probes.
 */
const PG20_OPAQUE_JOURNAL = "pg20-native-opaque-v1";
let pg20LastHold = "";
let pg20LastHoldTick = -100000;

function pg20ReportHold(reason) {
    // The existing every-20-tick recoverJournal scheduler must not flood BDS.
    const tick = system.currentTick;
    if (reason !== pg20LastHold || tick - pg20LastHoldTick >= 1200) {
        pg20LastHold = reason;
        pg20LastHoldTick = tick;
        log("[PG20] PHYSICAL JOURNAL HOLD: " + reason +
            ". No retry/reconstruction/clear; preserve inventory and report.");
    }
}

function pg20InspectableNativeFingerprint(stack) {
    // Strict comparison of EXPOSED native fields, not proof of opaque component
    // identity or restart/flush atomicity. Container.moveItem itself carries the
    // whole original ItemStack without constructing a replacement stack.
    if (!stack) return undefined;
    try {
        const ids = stack.getDynamicPropertyIds();
        const lore = stack.getLore();
        const destroy = stack.getCanDestroy();
        const place = stack.getCanPlaceOn();
        if (!Array.isArray(ids) || !Array.isArray(lore) ||
            !Array.isArray(destroy) || !Array.isArray(place)) return undefined;
        const dyn = ids.slice().sort().map(id => [id, stack.getDynamicProperty(id)]);
        const dur = stack.getComponent("minecraft:durability");
        const dye = stack.getComponent("minecraft:dyeable");
        const potion = stack.getComponent("minecraft:potion");
        const saved = {
            typeId: stack.typeId, amount: stack.amount,
            nameTag: stack.nameTag ?? "", lore,
            destroy, place,
            keepOnDeath: stack.keepOnDeath === true,
            lockMode: String(stack.lockMode ?? "none"), dyn,
            ench: enchantments(stack),
            durability: dur ? {damage: dur.damage, unbreakable: !!dur.unbreakable} : null,
            dye: dye?.color ?? null,
            potion: potion ? {
                effect: potion.potionEffectType?.id,
                delivery: potion.potionDeliveryType?.id
            } : null
        };
        const encoded = JSON.stringify(saved);
        return typeof encoded === "string" ? encoded : undefined;
    } catch (_) {
        return undefined;
    }
}

function pg20MoveOpaqueNative(src, srcBlock, srcSlot, dst, dstBlock,
                              dstSlotInfo, move, sourceItem) {
    // Only the previously direct-only, non-Q4-safe lane opts into this.
    // Do not partially split, merge or serialize metadata-bearing ItemStacks.
    if (src === dst || srcBlock.dimension.id !== dstBlock.dimension.id ||
        !Number.isSafeInteger(srcSlot) || srcSlot < 0 ||
        !Number.isSafeInteger(dstSlotInfo.slot) || dstSlotInfo.slot < 0 ||
        move !== sourceItem.amount || dstSlotInfo.before !== 0 ||
        !src.isValid || !dst.isValid ||
        dst.getItem(dstSlotInfo.slot) !== undefined) return 0;
    const before = pg20InspectableNativeFingerprint(sourceItem);
    if (before === undefined) return 0; // unknown metadata is never destroyed
    const tx = {
        d: srcBlock.dimension.id,
        srcD: srcBlock.dimension.id, dstD: dstBlock.dimension.id,
        src: srcBlock.location, dst: dstBlock.location,
        srcSlot, dstSlot: dstSlotInfo.slot,
        sig: exactStackSig(sourceItem),
        srcBefore: sourceItem.amount, srcAfter: 0,
        dstBefore: 0, dstAfter: move,
        move, itemType: sourceItem.typeId,
        opaqueTag: PG20_OPAQUE_JOURNAL
    };
    if (world.getDynamicProperty(JOURNAL_KEY) !== undefined) return 0;
    // This property is diagnostic intent, NOT an atomic disk commit receipt.
    const raw = JSON.stringify(tx);
    saveJournal(tx);
    if (world.getDynamicProperty(JOURNAL_KEY) !== raw) {
        throw new Error("PG20 opaque intent write/readback uncertain; HOLD");
    }
    if (pg20InspectableNativeFingerprint(src.getItem(srcSlot)) !== before ||
        dst.getItem(dstSlotInfo.slot) !== undefined) {
        throw new Error("PG20 physical slot changed after intent; HOLD");
    }
    // One native move: no JSON reconstruction and no source-clear/target-set pair.
    // Bedrock does not document a shared crash-atomic commit with the journal.
    src.moveItem(srcSlot, dstSlotInfo.slot, dst);
    const moved = dst.getItem(dstSlotInfo.slot);
    if (src.getItem(srcSlot) !== undefined ||
        pg20InspectableNativeFingerprint(moved) !== before) {
        throw new Error("PG20 native postmove identity or slot readback failed; HOLD");
    }
    // Only synchronous success clears the marker. Restart recovery never does.
    saveJournal(undefined);
    if (world.getDynamicProperty(JOURNAL_KEY) !== undefined) {
        throw new Error("PG20 completed-move marker clear uncertain; HOLD");
    }
    return move;
}
