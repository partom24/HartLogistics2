/*
 * HartLogistics Fresh LAB addressed physical routing (0.5.2) — source-only.
 * Original block JSON, texture atlas and geometry copied from HartLogistics 1.4.1.
 * Filter data/metadata and indicator hit detection functions below are excerpted
 * verbatim from HartLogistics 1.4.1 (MPL-2.0), without its routing engine.
 * This pack uses bank-indexed destination selection and native Hopper transportation.
 * License: MPL-2.0 (see LICENSE and NOTICE.md).
 */
import { world, system, ItemStack, BlockPermutation, EquipmentSlot,
         EnchantmentTypes, Potions } from '@minecraft/server';

import { discover, HOPPER, PIPE, isTransport, neighbors, step, positionKey } from './topology.js';

const SORTER_ID = 'hartsorter:sorter';
const COLLECTOR_ID = 'hartsorter:collector';
const RECEIVER_ID = 'hartsorter:receiver';
const SORTER_MODE_STATE = 'hartlogistics:mode';
const SORTER_MODES = ['filter','wildcard','auto','bypass'];
const selectedCollector = new Map();
function log(msg) { console.warn(`[HartLogistics Fresh LAB] ${msg}`); }
function keyFor(prefix, d, p) {
    const dim = (d === 'minecraft:overworld' || d === 'overworld') ? 'o'
              : (d === 'minecraft:nether' || d === 'nether') ? 'n' : 'e';
    return `hartlab:${prefix}_${dim}_${p.x}_${p.y}_${p.z}`;
}
function loc(block) { return block.location; }
function getBlock(d,x,y,z) {
    try { return world.getDimension(d).getBlock({x,y,z}); } catch (_) { return undefined; }
}
function sorterAt(e) {
    const b=getBlock(e.d,e.x,e.y,e.z);
    return b?.typeId===SORTER_ID ? b : undefined;
}
function entryForBlock(block, create=false) {
    if (block?.typeId !== SORTER_ID) return undefined;
    const p=loc(block),k=keyFor('s',block.dimension.id,p);
    let e;
    try { const raw=world.getDynamicProperty(k); if(typeof raw==='string')e=JSON.parse(raw); }
    catch(err) { log(`Read failed ${k}: ${err}`); return undefined; }
    if (e && e.d===block.dimension.id && e.x===p.x && e.y===p.y && e.z===p.z) return e;
    if (!create) return undefined;
    e={d:block.dimension.id,x:p.x,y:p.y,z:p.z,m:'wildcard',f:null,i:null};
    if (!saveEntry(e)) return undefined;
    return e;
}
function saveEntry(e) {
    try { world.setDynamicProperty(keyFor('s',e.d,e),JSON.stringify(e));invalidateRouting(e.d,e);return true; }
    catch(err){log(`Write failed at ${e.d} ${e.x},${e.y},${e.z}: ${err}`);return false;}
}
function clearEntry(e) {
    try { world.setDynamicProperty(keyFor('s',e.d,e),undefined);invalidateRouting(e.d,e); } catch(err) {log(`Clear failed: ${err}`);}
}
function sorterMode(e) {return SORTER_MODES.includes(e?.m) ? e.m : 'wildcard';}
function syncSorterModeVisual(e,b=sorterAt(e)) {
    if (!b) return;
    try {
        const mode=sorterMode(e);
        if(b.permutation.getState(SORTER_MODE_STATE)!==mode)
            b.setPermutation(b.permutation.withState(SORTER_MODE_STATE,mode));
    } catch(err) {log(`Mode indicator update failed: ${err}`);}
}
function setSorterMode(player,block) {
    const e=entryForBlock(block,true);
    if(!e)return;
    if(e.nativeQuarantine){player.sendMessage('§c[Sorter] Punch the unverified frame item first.');return;}
    const before=sorterMode(e),after=SORTER_MODES[(SORTER_MODES.indexOf(before)+1)%SORTER_MODES.length];
    e.m=after;
    if(!saveEntry(e))return;
    syncSorterModeVisual(e,block);
    player.sendMessage(`§7[Sorter] Mode: §b${after.toUpperCase()}§7. (routing enabled)`);
}

// ===== VERBATIM 1.4.1 INDICATOR, FILTER AND ORIENTATION HELPERS =====
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
function queueVerifiedList(s, name) {
    const v = s[name]();
    if (!Array.isArray(v)) throw new Error(`Unavailable ${name}`);
    return v;
}

// ===== CLEAN LAB STATE / INTERACTION LAYER =====

function entryHasFrameImplant(e) {return Array.isArray(e?.i)&&e.i.length===4;}
function rearOffset(face) {
    if(face==='North')return {x:0,z:-1,fd:2};
    if(face==='South')return {x:0,z:1,fd:3};
    if(face==='West')return {x:-1,z:0,fd:4};
    if(face==='East')return {x:1,z:0,fd:5};
}
function frameSpec(block) {
    if(!block)return undefined;
    const side=rearOffset(sorterRearFace(block));
    if(!side)return undefined;
    const p=block.location;
    return [p.x+side.x,p.y,p.z+side.z,side.fd];
}
function frameOwner(frame) {
    if(frame?.typeId!=='minecraft:frame')return undefined;
    const p=frame.location,d=frame.dimension;
    for(const off of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){
        const block=getBlock(d.id,p.x+off.x,p.y,p.z+off.z);
        if(block?.typeId!==SORTER_ID)continue;
        const s=frameSpec(block);
        if(!s||s[0]!==p.x||s[1]!==p.y||s[2]!==p.z)continue;
        const e=entryForBlock(block);
        if(e && entryHasFrameImplant(e) && e.i[0]===p.x && e.i[1]===p.y && e.i[2]===p.z)return e;
    }
    return undefined;
}
function plantEmptyNativeFrame(e) {
    if(e.f || entryHasFrameImplant(e))return false;
    const support=sorterAt(e),spec=frameSpec(support);
    if(!spec)return false;
    const target=getBlock(e.d,spec[0],spec[1],spec[2]);
    if(!target || target.typeId!=='minecraft:air')return false;
    try{
        target.setPermutation(BlockPermutation.resolve('minecraft:frame',{
            facing_direction:spec[3],item_frame_map_bit:false,item_frame_photo_bit:false
        }));
        if(target.typeId!=='minecraft:frame')return false;
        e.i=spec;
        if(!saveEntry(e)){
            e.i=null;target.setType('minecraft:air');return false;
        }
        return true;
    }catch(err){log(`Native frame place failed: ${err}`);return false;}
}
function nativeFrameFresh(d,x,y,z){
    const block=getBlock(d,x,y,z);
    if(block?.typeId!==SORTER_ID)return;
    const e=entryForBlock(block,true);
    if(e && !e.f && !entryHasFrameImplant(e))plantEmptyNativeFrame(e);
}
function eraseOwnedFrame(e){
    if(!entryHasFrameImplant(e))return;
    const f=getBlock(e.d,e.i[0],e.i[1],e.i[2]);
    if(f?.typeId==='minecraft:frame'){
        try{f.setType('minecraft:air');}catch(err){log(`Frame removal failed: ${err}`);}
    }
}
function giveOrDrop(player,stack){
    if(!player||!stack)return;
    try{
        const inv=player.getComponent('minecraft:inventory')?.container;
        if(inv){const rem=inv.addItem(stack);if(!rem)return;
            player.dimension.spawnItem(rem,player.location);return;}
    }catch(_){}
    try{player.dimension.spawnItem(stack,player.location);}catch(_){}
}
function nativeFrameMirror(ev){
    if(!ev.isFirstEvent||ev.block?.typeId!=='minecraft:frame')return;
    const e=frameOwner(ev.block);
    if(!e||e.f||!ev.beforeItemStack)return;
    const data=serializeFilterItem(ev.beforeItemStack);
    if(!data||!filterRoundTripSafe(ev.beforeItemStack,data)){
        e.nativeQuarantine=1;e.m='filter';saveEntry(e);syncSorterModeVisual(e);
        ev.player?.sendMessage('§c[Hart Logistics] Filter not verified. Punch the item out of the frame.');
        return;
    }
    const before=ev.beforeItemStack,after=ev.itemStack;
    const consumed=(!after||after.typeId!==before.typeId||after.amount<before.amount);
    e.f=data;e.fc=consumed?1:0;delete e.nativeQuarantine;e.m='filter';
    if(!saveEntry(e)){
        e.f=null;delete e.fc;return;
    }
    syncSorterModeVisual(e);
    ev.player?.sendMessage(`§7[Hart Logistics] Native filter: §f${filterLabel(e.f)}§7 (FILTER mode).`);
}
function playerTargetsSorterServiceFace(player){
    try{
        const hit=player.getBlockFromViewDirection({maxDistance:6,includeLiquidBlocks:false,includePassableBlocks:false});
        return hit?.block?.typeId===SORTER_ID && hit.face===sorterRearFace(hit.block);
    }catch(_){return false;}
}
function selectCollector(player,block){
    const id=keyFor('c',block.dimension.id,block.location);
    selectedCollector.set(player.id,id);
    const raw=world.getDynamicProperty(id);
    let info;try{info=typeof raw==='string'?JSON.parse(raw):{};}catch(_){info={};}
    player.sendMessage(`§b[Collector] Selected. ${info?.receiver?'Linked to '+info.receiver+'. ':'Not linked. '}Interact with a Receiver to link.`);
    player.sendMessage('§7[Fresh LAB] Linked Collectors with input inventories use the linked Receiver transport lane.');
}
function useReceiver(player,block){
    const id=keyFor('r',block.dimension.id,block.location);
    const selection=selectedCollector.get(player.id);
    if(selection){
        let info={};try{const raw=world.getDynamicProperty(selection);if(typeof raw==='string')info=JSON.parse(raw);}catch(_){}
        info.receiver=id;
        try{world.setDynamicProperty(selection,JSON.stringify(info));}
        catch(err){log(`Link save failed: ${err}`);player.sendMessage('§c[Collector] Link not saved.');return;}
        routingCollectorAdded(selection);
        selectedCollector.delete(player.id);
        player.sendMessage(`§a[Hart Logistics] Collector linked to Receiver at ${block.location.x}, ${block.location.y}, ${block.location.z}.`);
        const bank=labBankForReceiver(id);
        const net=labDiscover(bank);
        player.sendMessage(net
            ? `§a[Receiver] Registered ${net.lane.length} ${net.method===PIPE?'Transporters':'Hoppers'} and ${labBuildIndex(bank).total} Sorters.`
            : '§e[Receiver] '+bank.blocked);
    }else player.sendMessage('§7[Receiver] Select a Collector first, then click this Receiver to link.');
    player.sendMessage('§7[Fresh LAB] The Receiver discovers its connected Hopper or Transporter lane.');
}

// Keep 1.4.1's item-use suppression: pearls, charges, etc. must not activate
// while the player is interacting with the Sorter's filter/service face.
world.beforeEvents.itemUse.subscribe(ev=>{
    if(ev.itemStack && playerTargetsSorterServiceFace(ev.source))ev.cancel=true;
});
world.afterEvents.playerInteractWithBlock.subscribe(nativeFrameMirror);
world.beforeEvents.playerInteractWithBlock.subscribe(ev=>{
    if(!ev.isFirstEvent)return;
    const id=ev.block.typeId;
    if(id==='hartlogistics:bulk_storage'){
        if(ev.player.isSneaking)return;
        ev.cancel=true;
        const a=bulkRead(ev.block.dimension.id,ev.block.location);
        ev.player.sendMessage('[Bulk] '+a.total+' / '+BULK_LIMIT+' stored'+(a.state.pending?' | pending '+JSON.stringify(a.state.pending):'')+' | '+Object.entries(a.state.items).map(([id,n])=>id+' '+n).join(', '));
        return;
    }
    if(id==='minecraft:frame'){
        const e=frameOwner(ev.block);
        if(!e)return;
        const player=ev.player;
        const held=player.getComponent('minecraft:equippable')?.getEquipmentSlot(EquipmentSlot.Mainhand)?.getItem();
        ev.cancel=true;
        if(e.nativeQuarantine){player.sendMessage('§e[Sorter] Punch the unverified item to recover it.');}
        else if(!held){player.sendMessage(`§7[Sorter] Filter: ${filterLabel(e.f)} | mode ${sorterMode(e)}. Punch frame to remove filter.`);}
        else if(e.f){player.sendMessage('§e[Sorter] Punch out existing filter before replacing it.');}
        else if(POTION_ITEM_IDS.has(held.typeId)){
            if(!potionIdentity(held))player.sendMessage('§c[Sorter] Potion identity unavailable.');
            else ev.cancel=false;
        }else{
            const data=serializeFilterItem(held);
            if(!data||!filterRoundTripSafe(held,data))player.sendMessage('§c[Sorter] Cannot preserve this filter safely.');
            else ev.cancel=false;
        }
        return;
    }
    if(id!==SORTER_ID && id!==COLLECTOR_ID && id!==RECEIVER_ID)return;
    if(id===SORTER_ID){
        const rear=sorterRearFace(ev.block);
        const e=entryForBlock(ev.block,false);
        const topTarget=entryHasFrameImplant(e) && targetsNativeTopModeIndicator(ev.block,ev.blockFace,ev.faceLocation);
        if(!topTarget && (!rear || ev.blockFace!==rear))return;
        const modeClick=entryHasFrameImplant(e)?
            (targetsNativeFrontModeIndicator(ev.player,ev.block,ev.blockFace,ev.faceLocation)||topTarget):
            targetsSorterModeIndicator(ev.player,ev.block,ev.blockFace,ev.faceLocation);
        ev.cancel=true;
        const d=ev.block.dimension.id,p=ev.block.location,player=ev.player;
        system.run(()=>{
            const b=getBlock(d,p.x,p.y,p.z);
            if(b?.typeId!==SORTER_ID)return;
            if(modeClick)setSorterMode(player,b);
            else{
                const entry=entryForBlock(b,true);
                if(entry && !entryHasFrameImplant(entry)){
                    if(plantEmptyNativeFrame(entry))player.sendMessage('§7[Sorter] Native filter frame installed. Click the frame to assign an item.');
                    else player.sendMessage('§e[Sorter] Rear frame space occupied. Clear it and click again.');
                }else player.sendMessage(`§7[Sorter] Filter: §f${filterLabel(entry?.f)} §7| mode: §f${sorterMode(entry)}§7. Use native frame center to set filters.`);
            }
        });
        return;
    }
    if(ev.player.isSneaking)return; // native sneak-placement on collector/receiver.
    ev.cancel=true;
    const d=ev.block.dimension.id,p=ev.block.location,player=ev.player;
    system.run(()=>{
        const b=getBlock(d,p.x,p.y,p.z);
        if(b?.typeId===COLLECTOR_ID)selectCollector(player,b);
        if(b?.typeId===RECEIVER_ID)useReceiver(player,b);
    });
});
world.afterEvents.playerPlaceBlock.subscribe(ev=>{
    invalidateRouting(ev.block.dimension.id,ev.block.location);
    refreshPipeNeighbors(ev.block.dimension.id,ev.block.location);
    const b=ev.block,p=b.location,d=b.dimension.id;
    if(b.typeId===SORTER_ID){
        const e=entryForBlock(b,true);
        if(e){syncSorterModeVisual(e,b);system.runTimeout(()=>nativeFrameFresh(d,p.x,p.y,p.z),1);}
        else ev.player?.sendMessage('§c[Sorter] Could not save configuration.');
    }else if(b.typeId===COLLECTOR_ID){
        selectedCollector.set(ev.player.id,keyFor('c',d,p));
        ev.player?.sendMessage('§b[Collector] Placed and selected. Click a Hart Receiver to link.');
    }else if(b.typeId===RECEIVER_ID){
        ev.player?.sendMessage('§6[Receiver] Placed. Select a Collector and click this Receiver to link.');
    }
});
world.beforeEvents.playerBreakBlock.subscribe(ev=>{
    const b=ev.block;
    if(b?.typeId===BULK_ID){
        try{const a=bulkRead(b.dimension.id,b.location);if(!a.total && !a.state.pending)return;}catch(_){}
        ev.cancel=true;ev.player?.sendMessage('[Bulk] Empty this member before removal.');return;
    }
    if(b?.typeId==='minecraft:frame' && frameOwner(b)){
        ev.cancel=true;
        ev.player?.sendMessage('§e[Sorter] Punch the frame item out; frame belongs to Sorter.');
        return;
    }
    if(b?.typeId!==SORTER_ID)return;
    const e=entryForBlock(b);
    if(!entryHasFrameImplant(e))return;
    ev.cancel=true;
    if(e.nativeQuarantine){
        ev.player?.sendMessage('§c[Sorter] Punch out the unverified frame item first.');return;
    }
    const d=b.dimension.id,p=b.location,player=ev.player;
    system.run(()=>{
        const support=getBlock(d,p.x,p.y,p.z),live=support&&entryForBlock(support);
        if(support?.typeId!==SORTER_ID || !entryHasFrameImplant(live))return;
        eraseOwnedFrame(live);
        try{
            if(player?.getGameMode?.()==='Creative')support.setType('minecraft:air');
            else support.dimension.runCommand(`setblock ${p.x} ${p.y} ${p.z} air destroy`);
        }catch(err){log(`Controlled break failed: ${err}`);return;}
        refreshPipeNeighbors(d,p);
        clearEntry(live);
        if(live.f && live.fc===1)giveOrDrop(player,rebuildItem(live.f));
    });
});
world.afterEvents.entityHitBlock.subscribe(ev=>{
    if(ev.damagingEntity?.typeId!=='minecraft:player')return;
    const e=frameOwner(ev.hitBlock);
    if(!e?.f && !e?.nativeQuarantine)return;
    system.run(()=>{
        const b=sorterAt(e),live=b?entryForBlock(b):undefined;
        if(!live?.f && !live?.nativeQuarantine)return;
        live.f=null;delete live.fc;delete live.nativeQuarantine;
        if(sorterMode(live)==='filter')live.m='wildcard';
        if(saveEntry(live))syncSorterModeVisual(live,b);
    });
});
world.afterEvents.playerBreakBlock.subscribe(ev=>{
    invalidateRouting(ev.dimension.id,ev.block.location);
    refreshPipeNeighbors(ev.dimension.id,ev.block.location);
    let typeId='';try{typeId=ev.brokenBlockPermutation.type.id;}catch(_){try{typeId=ev.brokenBlockPermutation.typeId;}catch(_){}}
    if(typeId!==SORTER_ID)return;
    const e={d:ev.dimension.id,...ev.block.location};
    const k=keyFor('s',e.d,e);
    let info;try{const raw=world.getDynamicProperty(k);if(typeof raw==='string')info=JSON.parse(raw);}catch(_){}
    if(info?.f && !entryHasFrameImplant(info))giveOrDrop(ev.player,rebuildItem(info.f));
    if(info)clearEntry(info);
});
system.run(()=>log('0.5.2 ready — original 1.4.1 assets; Hopper and Transporter routing enabled.'));

const LAB_ROUTE_STATE = 'hartlab:transport_020';
const labBanks = Object.create(null);
let startupHold = '';
const selectedPort = new Map();
let labRevision = 1;
const labCollectorKeys = [];
let labRR = 0;
let labTick = 0;
function invalidateRouting(d,p){
    for(const b of Object.values(labBanks)){
        if(d && (b.cfg.dimension!==d || !b.watched?.has(positionKey(p))))continue;
        b.generation=++labRevision;
        queueRegistration(b);
    }
}
function routingCollectorAdded(key){
    if(!labCollectorKeys.includes(key))labCollectorKeys.push(key);
    const receiver=labLinkedReceiver(key);
    if(receiver){
        const bank=labBankForReceiver(receiver);
        if(bank)queueRegistration(bank);
    }
}
// Coalesce build edits and reuse the same discovery cache for status and dispatch.
function queueRegistration(bank){
    if(bank.registrationQueued)return;
    bank.registrationQueued=true;
    system.run(()=>{
        bank.registrationQueued=false;
        if(!labCollectorKeys.some(key=>labLinkedReceiver(key)===bank.cfg.name))return;
        if(labDiscover(bank))labBuildIndex(bank);
    });
}
// State order corresponds to the six neighbor offsets exported by topology.js.
const armNames=['up','down','north','south','west','east'];
function refreshPipe(block){
    if(block?.typeId!==PIPE)return;
    const d=block.dimension.id,p=block.location;
    let permutation=block.permutation,changed=false;
    for(const [i,offset] of neighbors.entries()){
        const other=labGet(d,step(p,offset));
        if(!other)continue;
        const id=other.typeId;
        const connected=id===PIPE || id===BULK_ID || id===SORTER_ID || id===RECEIVER_ID || id===COLLECTOR_ID || !!labBlockInventory(other);
        const state='hartlogistics:connect_'+armNames[i];
        if(permutation.getState(state)!==connected){
            permutation=permutation.withState(state,connected);
            changed=true;
        }
    }
    if(changed)block.setPermutation(permutation);
}
function refreshPipeNeighbors(d,p){
    refreshPipe(labGet(d,p));
    for(const offset of neighbors)refreshPipe(labGet(d,step(p,offset)));
}
function labGet(d,p){return getBlock(d,p.x,p.y,p.z);}
function labBlockInventory(block){
    if(!block) return undefined;
    try {return block.getComponent('minecraft:inventory')?.container;}catch(_){return undefined;}
}
function labContainer(d,p){return labBlockInventory(labGet(d,p));}
function labKeyParse(key){
    const m=/^hartlab:([scr])_([one])_(-?\d+)_(-?\d+)_(-?\d+)$/.exec(key);
    if(!m)return undefined;
    return {kind:m[1],d:m[2]==='o'?'minecraft:overworld':m[2]==='n'?'minecraft:nether':'minecraft:the_end',
        x:Number(m[3]),y:Number(m[4]),z:Number(m[5])};
}
function labLinkedReceiver(key){
    try {const data=world.getDynamicProperty(key);if(typeof data!=='string')return undefined;
        const info=JSON.parse(data);return typeof info?.receiver==='string'?info.receiver:undefined;
    } catch(_){return undefined;}
}
function labBankForReceiver(key){
    const parsed=labKeyParse(key);
    if(!parsed||parsed.kind!=='r')return undefined;
    return labBanks[key] ??= {cfg:{name:key, dimension:parsed.d, receiver:parsed},
        generation:0,confirmed:0,catches:0,dispatched:0,failed:0,cleanTicks:0,lastWarning:0,discoveries:0,reads:0};
}
function labDiscover(b) {
    if (b.revision===b.generation && (b.net || labTick<b.retry)) return b.net;
    if (b.revision !== b.generation) b.discoveryChunks = undefined;
    b.revision=b.generation;
    b.cache=null;
    const {dimension,receiver,name}=b.cfg;
    let waiting = false;
    try {
        if (b.discoveryChunks && !coverChunks(b,b.discoveryChunks)) {
            b.retry=labTick+8;
            return null;
        }
        b.discoveries++;
        b.watched=new Set([positionKey(receiver)]);
        function read(p) {
            b.watched.add(positionKey(p));
            b.reads++;
            const block=labGet(dimension,p);
            if (block) return block;
            const x=Math.floor(p.x/16), z=Math.floor(p.z/16);
            const key=dimension+'_'+x+'_'+z;
            const chunks=b.discoveryChunks ??= new Map();
            if (chunks.has(key)) throw Error('Block unreadable in ticking chunk at '+positionKey(p));
            chunks.set(key,{dimension,x:x*16,y:p.y,z:z*16});
            waiting=true;
            throw Error('Loading discovery chunk at '+positionKey(p));
        }
        if(read(receiver).typeId!==RECEIVER_ID) throw Error('Receiver missing');
        const reg=JSON.parse(world.getDynamicProperty(name) || '{}');
        b.net=discover(receiver,reg,read,SORTER_ID);
        b.discoveryChunks=undefined;
        if(b.net.method===PIPE)for(const p of b.net.lane)refreshPipe(labGet(dimension,p));
        b.blocked='';
    } catch(err) {
        b.net=null;b.blocked=String(err);b.retry=labTick+(waiting?8:100);
        if (!waiting) b.discoveryChunks=undefined;
    }
    return b.net;
}
// Each offset pairs an adjacent position with the output face pointing back to the Collector.
const collectorFaces = [[0,1,0,0],[0,0,-1,3],[0,0,1,2],[-1,0,0,5],[1,0,0,4],[0,-1,0,null]];
function labCollectorSources(key){
    const p=labKeyParse(key);
    if(p?.kind!=='c' || labGet(p.d,p)?.typeId!==COLLECTOR_ID)return [];
    const feeders=[];
    let direct,hasFeeder=false;
    for(const [dx,dy,dz,toward] of collectorFaces){
        const loc={x:p.x+dx,y:p.y+dy,z:p.z+dz};
        const block=labGet(p.d,loc);
        if(!block)return []; // A missing neighbor could be the configured physical feed.
        if(block.typeId===HOPPER){
            if(block.permutation.getState('facing_direction')!==toward)continue;
            hasFeeder=true;
            if(!block.permutation.getState('toggle_bit')){
                const container=labBlockInventory(block);
                if(container)feeders.push({loc,dimension:p.d,container});
            }
        }else if(!direct && !hasFeeder){
            const container=labBlockInventory(block);
            if(container)direct={loc,dimension:p.d,container};
        }
    }
    return hasFeeder ? feeders : direct ? [direct] : [];
}
function labBuildIndex(b){
    if(b.cache && b.cacheRevision===b.generation)return b.cache;
    const filters=new Map(),autos=[],wildcards=[];
    let total=0,missing=0;
    for(const spot of b.net?.spots || []){
        const p={...spot,d:b.cfg.dimension};
        const block=labGet(p.d,p);
        if(block?.typeId!==SORTER_ID){missing++;continue;}
        const e=entryForBlock(block) || {m:block.permutation.getState(SORTER_MODE_STATE)};
        if(e.m==='filter' && !e.f){total++;continue;}
        const candidate={p,lane:b.net.taps,filter:e.f,mode:sorterMode(e)};
        total++;
        if(candidate.mode==='filter'){
            if(!e.f?.match?.typeId)continue;
            const id=e.f.match.typeId;
            if(!filters.has(id))filters.set(id,[]);
            filters.get(id).push(candidate);
        } else if(candidate.mode==='auto')autos.push(candidate);
        else if(candidate.mode==='wildcard')wildcards.push(candidate);
    }
    b.cache={filters,autos,wildcards,total,missing};b.cacheRevision=b.generation;
    return b.cache;
}
function labAdjacentInventories(candidate,strict=false){
    const block=labGet(candidate.p.d,candidate.p);
    if(block?.typeId!==SORTER_ID){if(strict)throw Error('Sorter unavailable');return [];}
    const facing=facingOffset(block);
    if(!facing)return [];
    const all=[facing,{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},
        {x:0,y:0,z:-1},{x:0,y:1,z:0},{x:0,y:-1,z:0}];
    const unique=new Set(),found=[];
    for(const offset of all){
        const p={x:candidate.p.x+offset.x,y:candidate.p.y+offset.y,z:candidate.p.z+offset.z};
        const k=positionKey(p);
        if(unique.has(k))continue;
        unique.add(k);
        // The native Item Frame is not an inventory. All other adjacent
        // compatible vanilla/custom inventory blocks are valid destinations.
        const neighbor=labGet(candidate.p.d,p);
        if(strict && !neighbor)throw Error('Output neighbor unavailable');
        const inv=labBlockInventory(neighbor);
        if(inv && !candidate.lane.has(k))found.push({position:p,container:inv});
    }
    return found;
}
function labDestinationContainer(candidate){
    if(candidate.destination)return labGet(candidate.p.d,candidate.destination)?.typeId===candidate.destinationType
        ? labContainer(candidate.p.d,candidate.destination) : undefined;
    return labAdjacentInventories(candidate)[0]?.container;
}
function labHasMatchingSeed(inv,item){
    try{for(let slot=0;slot<inv.size;slot++){
        const stored=inv.getItem(slot);
        if(!stored||stored.typeId!==item.typeId)continue;
        // AUTO membership follows legacy type/enchanted-book/potion policy.
        const probe=serializeFilterItem(stored);
        if(probe && matchesFilter(item,probe))return true;
    }}catch(_){}
    return false;
}
function labCanFitEntire(inv,item){
    if(!inv||!item)return false;
    try{
        let room=0;
        for(let i=0;i<inv.size;i++){
            const s=inv.getItem(i);
            if(!s)room+=item.maxAmount;
            else if(s.isStackableWith(item))room+=Math.max(0,s.maxAmount-s.amount);
            if(room>=item.amount)return true;
        }
    }catch(_){return false;}
    return false;
}
function labEligible(b,item){
    const index=labBuildIndex(b);
    const primary=[];
    for(const c of index.filters.get(item.typeId)||[]){
        if(c.filter && matchesFilter(item,c.filter))primary.push(c);
    }
    for(const c of index.autos){
        if(labAdjacentInventories(c).some(({container})=>labHasMatchingSeed(container,item)))primary.push(c);
    }
    // Filter and AUTO rules take precedence over WILDCARD. If they exist but
    // are full, keep the item at source instead of silently misrouting.
    return primary.length?primary:index.wildcards;
}
function labSelectTarget(b,item){
    const candidates=labEligible(b,item);
    for(const c of candidates){
        for(const {position,container} of labAdjacentInventories(c)){
            if(c.mode==='auto' && !labHasMatchingSeed(container,item))continue;
            if(labCanFitEntire(container,item))return {...c,destination:position,destinationType:labGet(c.p.d,position)?.typeId};
        }
    }
    return undefined;
}
function labLineEmpty(b){
    const lane=b.active?.lane || b.net.lane;
    for(const [index,p] of lane.entries()){
        const block=labGet(b.cfg.dimension,p);
        if(block?.typeId!==HOPPER || (!b.active && block.permutation.getState('facing_direction')!==b.net.directions[index])){
            if(!b.active)b.generation=++labRevision;
            return false;
        }
        const hopper=labBlockInventory(block);
        if(!hopper)return false;
        for(let i=0;i<hopper.size;i++)if(hopper.getItem(i))return false;
    }
    return true;
}
function labSafeTransfer(source,slot,dest,expected){
    // The entire source stack must fit before transfer. This avoids
    // ambiguous partial-quantity return semantics and unnecessary item copies.
    if(!labCanFitEntire(dest,expected))return 0;
    const before=source.getItem(slot);
    if(!before || before.amount!==expected.amount||before.typeId!==expected.typeId)return 0;
    const remainder=source.transferItem(slot,dest);
    const after=source.getItem(slot);
    if(remainder){
        // If Minecraft returns a remainder but source slot no longer holds it,
        // return it to native inventory before any additional action.
        if(!after){
            const unreturned=source.addItem(remainder);
            if(unreturned)throw Error('Native partial transfer could not restore its remainder; halt input');
        }
        throw Error('Partial native transfer despite preflight capacity; freeze lane for inspection');
    }
    const left=after&&after.typeId===before.typeId?after.amount:0;
    return Math.max(0,before.amount-left);
}
function labLiveReferenceMatches(inFlight,found){
    if(!inFlight||!found||inFlight.typeId!==found.typeId)return false;
    // Identical hopper-bound stacks, regardless of stackability, retain the
    // same original metadata; no item-stack reconstruction is ever performed.
    try {if(inFlight.isStackable || inFlight.isStackableWith(inFlight))return inFlight.isStackableWith(found);}catch(_){}
    // When native stacking comparison is unavailable for specialized items,
    // the dedicated conveyor's one-shipment invariant provides identity.
    // All normal deposits are native container-to-container moves; metadata
    // is never serialized or reconstructed.
    return inFlight.nameTag===found.nameTag;
}
function labPersistActive(b){
    try{const v=world.getDynamicProperty(LAB_ROUTE_STATE);
        const state=v?JSON.parse(v):{};
        if(b.active){state[b.cfg.name]={lane:b.active.lane, target:b.active.target.p, sent:b.active.sent,
            source:b.active.collector, type:b.active.type, started:labTick};}
        else delete state[b.cfg.name];
        world.setDynamicProperty(LAB_ROUTE_STATE,JSON.stringify(state));
    }catch(err){log(`ROUTING STATE SAVE FAILED ${b.cfg.name}: ${err}`);throw err;}
}
function labMarkHold(b,reason){
    b.blocked=reason;b.failed++;
    if(labTick-b.lastWarning>200){log(`HOLD ${b.cfg.name}: ${reason}`);b.lastWarning=labTick;}
}
function labStartRecovery(b,reason){
    b.recovery=true;
    b.blocked=reason;
    b.cleanTicks=0;
    const a=b.active;
    log(`Recovery ${b.cfg.name} started: ${reason}; item=${a.type}, recorded=${a.moved}/${a.sent}, target=${positionKey(a.target.p)}`);
}
function labFinish(b){
    if(!b.active)return;
    const c=b.active;
    const undelivered=Math.max(0,c.sent-c.moved);
    b.confirmed+=c.moved;
    if(undelivered)b.catches+=undelivered;
    b.active=null;
    b.blocked='';b.cleanTicks=0;
    labPersistActive(b);
    if(undelivered)log(`${b.cfg.name}: ${c.moved}/${c.sent} deposited; ${undelivered} unconfirmed. Inspect the lane and its output.`);
}
function labPipeDispatch(b,source,slot,item,target){
    const d=b.cfg.dimension;
    if(labGet(d,b.cfg.receiver)?.typeId!==RECEIVER_ID || labGet(d,target.p)?.typeId!==SORTER_ID)return false;
    // Recheck the selected physical path at transfer time, including chunk availability.
    for(let p=target.p.tap;p;p=b.net.parents.get(positionKey(p))){
        if(labGet(d,p)?.typeId!==PIPE){
            b.generation=++labRevision;b.blocked='Transporter path changed or unavailable';return false;
        }
    }
    const dest=labDestinationContainer(target);
    if(!dest || (source.dimension===d && positionKey(source.loc)===positionKey(target.destination)))return false;
    const moved=labSafeTransfer(source.container,slot,dest,item);
    b.dispatched+=moved;b.confirmed+=moved;
    if(moved)b.blocked='';
    return moved>0;
}
function labTryDispatch(b,key,source,slot,item,target,start=0){
    const cfg=b.cfg;
    if(b.net.method===PIPE)return labPipeDispatch(b,source,slot,item,target);
    if(!labLineEmpty(b)){b.blocked='hopper line contains existing items; waiting for it to drain';return false;}
    const first=labContainer(cfg.dimension,b.net.lane[start]);
    if(!first||!labCanFitEntire(first,item)){
        b.blocked='first hopper unavailable/full';return false;
    }
    for(const other of Object.values(labBanks)){
        if(other.active && other.cfg.dimension===cfg.dimension &&
            other.active.lane.some(p=>b.net.taps.has(positionKey(p))))return false;
    }
    const catchInv=labContainer(cfg.dimension,b.net.terminal);
    if(catchInv && !labCanFitEntire(catchInv,item)){b.blocked='terminal inventory full';return false;}
    const active={lane:b.net.lane,target,collector:key,source:source.loc,type:item.typeId,
        reference:item.clone(),sent:item.amount,moved:0,lastMovement:labTick,started:labTick,revision:b.generation};
    // Write route intent BEFORE touching inventory. Crash recovery sends any
    // in-flight physical items to the catch barrel, never replays the source.
    b.active=active;
    try{labPersistActive(b);}catch(_){b.active=null;return false;}
    let moved=0;
    try{moved=labSafeTransfer(source.container,slot,first,item);}
    catch(err){labStartRecovery(b,`dispatch: ${err}`);return false;}
    if(moved===0){b.active=null;labPersistActive(b);return false;}
    active.counted=true;active.sent=moved;b.dispatched+=moved;b.blocked='';
    try{labPersistActive(b);}catch(err){labStartRecovery(b,`persist after dispatch: ${err}`);}
    // A destination on the inlet is already reached. Service it before native movement.
    if(!b.recovery && positionKey(target.p.tap)===positionKey(b.net.lane[start]))labTickActive(b);
    return true;
}
// One persistent account per physical member, shared by all banks reaching it.
// pending fences a native/virtual boundary; never replay an ambiguous native edit.
const BULK_ID='hartlogistics:bulk_storage';
const BULK_LIMIT=200000;
function bulkRead(d,p){
    const key=keyFor('bulk',d,p);
    const raw=world.getDynamicProperty(key);
    const state=raw===undefined?{items:{},provisional:{}}:JSON.parse(raw);
    const total=Object.values(state.items).reduce((a,n)=>{
        if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid Bulk balance');
        return a+n;
    },0);
    if(total>BULK_LIMIT)throw Error('Invalid Bulk capacity');
    return {key,state,total};
}
function bulkSave(a){
    world.setDynamicProperty(a.key,JSON.stringify(a.state));
}
function bulkMembers(b){
    return b.net.bulk.map(p=>{
        if(labGet(b.cfg.dimension,p)?.typeId!==BULK_ID)throw Error('Bulk unavailable');
        const a=bulkRead(b.cfg.dimension,p);
        if(a.state.pending?.kind==='receiver credit'){bulkCredit(a);return {...bulkRead(b.cfg.dimension,p),p};}
        if(a.state.pending)throw Error('Bulk transfer requires inspection: '+a.key);
        return {...a,p};
    });
}
function bulkOrdinary(item){
    try{return item.typeId.startsWith('minecraft:') && item.maxAmount>1 &&
        !item.nameTag && !item.getDynamicPropertyIds().length &&
        item.isStackableWith(new ItemStack(item.typeId,1));}catch(_){return false;}
}
function bulkRoom(inv,item){
    let room=0;
    for(let i=0;i<inv.size && room<item.amount;i++){
        const s=inv.getItem(i);
        if(!s)room+=item.maxAmount;
        else if(s.isStackableWith(item))room+=s.maxAmount-s.amount;
    }
    return Math.min(room,item.amount);
}
function bulkTarget(candidates,item,allowed=()=>true){
    for(const c of candidates){
        if(!allowed(c))continue;
        if(labGet(c.p.d,c.p)?.typeId!==SORTER_ID)throw Error('Sorter unavailable');
        const inventories=labAdjacentInventories(c,true);
        for(const {container,position} of inventories){
            if(c.mode==='auto' && !labHasMatchingSeed(container,item))continue;
            const amount=bulkRoom(container,item);
            if(amount)return {amount,target:{...c,destination:position,destinationType:labGet(c.p.d,position).typeId}};
        }
    }
}
// A proven ordinary partial stack may be materialized at the physical boundary.
// Journal before any edit. An exception leaves the account fenced.
function bulkVirtualSource(a,b,item,onDebit,loc){
    let current=item;
    return {dimension:b.cfg.dimension,loc,container:{
        getItem(){return current?.clone();},
        transferItem(slot,dest){
            a.state.pending={kind:'physical release',receiver:b.cfg.name,item:item.typeId,amount:item.amount};
            bulkSave(a);
            const rem=dest.addItem(item);
            if(rem)throw Error('Partial Bulk release; inspect journal');
            onDebit();delete a.state.pending;bulkSave(a);current=undefined;
        }
    }};
}
function verifyBulkPath(b,member){
    const d=b.cfg.dimension,net=b.net;
    if(labGet(d,b.cfg.receiver)?.typeId!==RECEIVER_ID)throw Error('Receiver unavailable');
    const tap=net.lane[member.p.tapIndex];
    if(net.method===HOPPER){
        for(let i=0;i<=member.p.tapIndex;i++){
            const h=labGet(d,net.lane[i]);
            if(h?.typeId!==HOPPER || h.permutation.getState('facing_direction')!==net.directions[i])
                throw Error('Bulk Hopper path changed or unavailable');
        }
    }else{
        for(let p=tap;p;p=net.parents.get(positionKey(p))){
            if(labGet(d,p)?.typeId!==PIPE)throw Error('Bulk Transporter path changed or unavailable');
        }
    }
}
function bulkCollect(b,key,source,slot,item){
    const members=bulkMembers(b), index=labBuildIndex(b);
    const matches=(index.filters.get(item.typeId)||[]).filter(c=>matchesFilter(item,c.filter));
    const autos=index.autos.filter(c=>labAdjacentInventories(c,true).some(x=>labHasMatchingSeed(x.container,item)));
    const eligible=matches.concat(autos);
    const resident=members.some(a=>a.state.items[item.typeId] && !a.state.provisional[item.typeId]);
    const claimed=!!eligible.length || resident;
    let route=bulkTarget(claimed?eligible:index.wildcards,item);
    const member=members.find(a=>a.total<BULK_LIMIT);
    if(!route && !claimed && b.net.terminal){
        // A native Hopper lane's terminal inventory is a catch, not a Collector account.
        if(labGet(b.cfg.dimension,b.net.terminal)?.typeId===COLLECTOR_ID)return false;
    }
    if(!route && claimed && !member){
        for(const a of members)verifyBulkPath(b,a);
        route=bulkTarget(index.wildcards,item);
    }
    if(route){
        if(route.amount===item.amount)return labTryDispatch(b,key,source,slot,item,route.target);
        const part=item.clone();part.amount=route.amount;
        const staged=bulkVirtualSource(members[0],b,part,()=>{
            const remainder=item.clone();remainder.amount=item.amount-part.amount;
            source.container.setItem(slot,remainder);
        },source.loc);
        return labTryDispatch(b,key,staged,slot,part,route.target);
    }
    if(!member)return false;
    verifyBulkPath(b,member);
    const amount=Math.min(item.amount,BULK_LIMIT-member.total);
    const id=item.typeId, state=member.state;
    state.pending={kind:'native intake',receiver:b.cfg.name,source:source.loc,slot,item:id,amount};
    bulkSave(member);
    const left=item.amount-amount;
    const remainder=left?item.clone():undefined;
    if(remainder)remainder.amount=left;
    source.container.setItem(slot,remainder);
    // Durable Receiver-owned intake. The following single write transfers its
    // entire virtual balance to Bulk. Restart can finish this phase exactly once.
    state.pending.kind='receiver credit';
    state.pending.provisional=!claimed;
    bulkSave(member);
    bulkCredit(member);
    return true;
}
function bulkCredit(a){
    const t=a.state.pending;
    a.state.items[t.item]=(a.state.items[t.item]||0)+t.amount;
    if(t.provisional)a.state.provisional[t.item]=true;
    else delete a.state.provisional[t.item];
    delete a.state.pending;bulkSave(a);
}
function bulkRefill(b){
    if(!b.net?.bulk.length || b.generation!==b.revision)return;
    for(const a of bulkMembers(b)){
        const types=Object.keys(a.state.items);
        for(let i=0;i<types.length;i++){
            const id=types[(i+(b.bulkCursor||0))%types.length];
            if(!coverRoute(b))return false;
            const item=new ItemStack(id,1);
            item.amount=Math.min(item.maxAmount,a.state.items[id]);
            const index=labBuildIndex(b);
            const matches=(index.filters.get(id)||[]).filter(c=>matchesFilter(item,c.filter));
            const autos=index.autos.filter(c=>labAdjacentInventories(c,true).some(x=>labHasMatchingSeed(x.container,item)));
            const candidates=matches.length || autos.length?matches.concat(autos):index.wildcards;
            const provisional=a.state.provisional[id];
            const start=b.net.method===HOPPER?a.p.tapIndex:0;
            const route=bulkTarget(candidates,item,c=>(provisional || c.mode!=='wildcard') &&
                (start===0 || b.net.lane.slice(start).some(p=>positionKey(p)===positionKey(c.p.tap))));
            if(!route)continue;
            verifyBulkPath(b,a);
            item.amount=route.amount;
            const source=bulkVirtualSource(a,b,item,()=>{
                a.state.items[id]-=item.amount;
                if(!a.state.items[id]){delete a.state.items[id];delete a.state.provisional[id];}
            },a.p);
            if(labTryDispatch(b,a.key,source,0,item,route.target,start)){
                b.bulkCursor=((b.bulkCursor||0)+i+1)%types.length;
                return true;
            }
        }
    }
}

// Temporary areas belong to this pack. Share overlapping chunks between banks.
const routeChunks = new Map();
function coverRoute(b, source) {
    const net = b.active || b.net;
    if (!net) return false;
    if (b.coverageNet !== net) {
        const chunks = new Map();
        const add = (dimension, p, margin = 0) => {
            if (!p) return;
            for (let x = Math.floor((p.x-margin)/16); x <= Math.floor((p.x+margin)/16); x++)
                for (let z = Math.floor((p.z-margin)/16); z <= Math.floor((p.z+margin)/16); z++)
                    chunks.set(dimension+'_'+x+'_'+z, {dimension,x:x*16,y:p.y,z:z*16});
        };
        const d = b.cfg.dimension;
        for (const p of net.lane) add(d,p);
        for (const p of net.spots || []) add(d,p,1);
        for (const p of net.bulk || []) add(d,p,1);
        add(d,b.cfg.receiver);
        add(d,net.terminal);
        add(d,net.target?.p,1);
        add(d,net.target?.destination);
        b.coverageNet = net;
        b.coverageChunks = chunks;
    }
    const chunks = new Map(b.coverageChunks);
    if (source) {
        const p = source.loc, x=Math.floor(p.x/16), z=Math.floor(p.z/16);
        chunks.set(source.dimension+'_'+x+'_'+z,{dimension:source.dimension,x:x*16,y:p.y,z:z*16});
    }
    return coverChunks(b,chunks);
}
function coverChunks(b,chunks) {
    let ready = true;
    const manager = world.tickingAreaManager;
    if (!manager) { labMarkHold(b,'Script ticking areas unavailable'); return false; }
    let additional = 0;
    for (const key of chunks.keys()) if (!routeChunks.has(key)) additional++;
    if (additional + routeChunks.size > manager.maxChunkCount) {
        labMarkHold(b,'Waiting for ticking chunk capacity'); return false;
    }
    for (const [key,p] of chunks) {
        let entry = routeChunks.get(key);
        if (!entry) {
            const point = {x:p.x,y:p.y,z:p.z};
            const options = {dimension:world.getDimension(p.dimension),from:point,to:point};
            if (!manager.hasCapacity(options)) { labMarkHold(b,'Waiting for ticking chunk capacity'); return false; }
            const id = 'hart_route_'+key.replace(/:/g,'_');
            entry = {id,ready:false,last:labTick};
            routeChunks.set(key,entry);
            try {
                manager.createTickingArea(id,options).then(() => {entry.ready=true;},err => {
                    routeChunks.delete(key); labMarkHold(b,String(err));
                });
            } catch(err) {routeChunks.delete(key); throw err;}
        }
        entry.last = labTick;
        if (!entry.ready) ready=false;
    }
    return ready;
}
function releaseIdleChunks() {
    for (const [key,entry] of routeChunks) {
        if (entry.ready && labTick-entry.last >= 32) {
            try {
                world.tickingAreaManager.removeTickingArea(entry.id);
                routeChunks.delete(key);
            } catch(err) { log('Ticking area release: '+err); }
        }
    }
}
function labTryCollector(b,collectorKey){
    try{
        const sources=labCollectorSources(collectorKey);
        const offset=b.sourceCursor?.get(collectorKey) || 0;
        for(let i=0;i<sources.length;i++){
            const index=(offset+i)%sources.length;
            const source=sources[index],inv=source.container,size=inv.size;
            if(inv.emptySlotsCount===size)continue;
            if(!labDiscover(b) || !coverRoute(b,source))return false;
            if(source.dimension===b.cfg.dimension && b.net.taps.has(positionKey(source.loc)))continue;
            for(let slot=0;slot<size;slot++){
                const item=inv.getItem(slot);
                if(!item)continue;
                if(b.net.bulk.length && bulkOrdinary(item)){
                    if(bulkCollect(b,collectorKey,source,slot,item)){
                        (b.sourceCursor ??= new Map()).set(collectorKey,index+1);return true;
                    }
                    if(b.active)return true;
                    continue;
                }
                const target=labSelectTarget(b,item);
                if(!target)continue;
                if(!labTryDispatch(b,collectorKey,source,slot,item,target))return !!b.active;
                (b.sourceCursor ??= new Map()).set(collectorKey,index+1);
                return true;
            }
        }
    }catch(err){labMarkHold(b,`collector input: ${err}`);}
    return false;
}
function labTickActive(b){
    const a=b.active,c=b.cfg;
    if(!a)return;
    if(b.recovery){
        // Deliberately do not transfer to a destination after a process crash:
        // an arbitrary item's full runtime metadata cannot be reconstructed
        // from an on-disk route header. Native hoppers safely drain to catch.
        if(labTick%16!==0)return;
        if(labLineEmpty(b)){
            b.cleanTicks++;
            if(b.cleanTicks>=5){
                if(a.counted)labFinish(b);
                else{
                    // A restart header or a failed dispatch is an intent, not a verified session transfer.
                    b.active=null;b.blocked='';b.cleanTicks=0;labPersistActive(b);
                }
                b.recovery=false;
                log(`Recovery ${c.name} complete: ${a.type}; ${a.counted ? 'session shipment reconciled' : 'unverified dispatch intent; excluded from session totals'}. Inspect lane output.`);
            }
        }else b.cleanTicks=0;
        return;
    }
    if(a.revision!==b.generation){
        labStartRecovery(b,'Routing configuration invalidated during shipment');return;
    }
    if(labGet(c.dimension,a.target.p)?.typeId!==SORTER_ID){
        labStartRecovery(b,'Addressed Sorter missing or unavailable');return;
    }
    const tap=labGet(c.dimension,a.target.p.tap);
    const hopper=tap?.typeId===HOPPER && labBlockInventory(tap);
    const destination=labDestinationContainer(a.target);
    if(!hopper||!destination){labStartRecovery(b,'Addressed Hopper or destination unavailable');return;}
    try{
        // Only the already-addressed destination Hopper is inspected.
        for(let i=0;i<hopper.size;i++){
            const item=hopper.getItem(i);
            if(!item||!labLiveReferenceMatches(a.reference,item))continue;
            if(item.amount>a.sent-a.moved){labStartRecovery(b,'Unexpected quantity at tap');return;}
            if(!labCanFitEntire(destination,item)){b.blocked='Addressed storage full during transit. Inspect lane output.';continue;}
            const moved=labSafeTransfer(hopper,i,destination,item);
            a.moved+=moved;
            if(moved)a.lastMovement=labTick;
        }
    }catch(err){labStartRecovery(b,`arrival: ${err}`);return;}
    if(a.moved>=a.sent){labFinish(b);return;}
    // Check the entire line only after no destination activity, so routine
    // movement does not scan all intermediate Hoppers every tick.
    if(labTick-a.lastMovement>=Math.max(24,a.lane.length*8) && labTick%32===0){
        if(labLineEmpty(b)){
            b.cleanTicks++;
            if(b.cleanTicks>=2){labFinish(b);return;}
        }else b.cleanTicks=0;
    }
}
function labProcessInputs(){
    if(startupHold || !labCollectorKeys.length)return;
    let supplied=false;
    // Each linked Collector is considered once per input cycle, round-robin.
    const keys=labCollectorKeys;
    for(let n=0;n<keys.length;n++){
        const key=keys[(n+labRR)%keys.length];
        const receiver=labLinkedReceiver(key);
        const bank=receiver?labBankForReceiver(receiver):undefined;
        if(!bank||bank.active||bank.recovery)continue;
        if(labTryCollector(bank,key)){supplied=true;break;}
    }
    if(!supplied && labTick%32===0){
        const seen=new Set();
        for(const key of keys){
            const receiver=labLinkedReceiver(key);
            if(seen.has(receiver))continue;
            seen.add(receiver);
            const bank=labBanks[receiver];
            if(!bank || bank.active || bank.recovery)continue;
            try{if(bulkRefill(bank))break;}catch(err){labMarkHold(bank,String(err));}
        }
    }
    labRR=(labRR+1)%keys.length;
}
function labLoadState(){
    try{
        const ids=world.getDynamicPropertyIds();
        for(const key of ids)if(/^hartlab:c_[one]_/.test(key))routingCollectorAdded(key);
        const raw=world.getDynamicProperty(LAB_ROUTE_STATE);
        if(typeof raw==='string'){
            const saved=JSON.parse(raw);
            for(const [name,entry]of Object.entries(saved)){
                const b=labBankForReceiver(name);
                if(!b || !Array.isArray(entry?.lane) || !entry.lane.length){
                    startupHold='Unresolved pre-upgrade shipment '+name+'. Inspect legacy lane before dispatch.';continue;
                }
                b.active={lane:entry.lane,target:{p:entry.target},reference:null,type:entry.type,
                    sent:entry.sent||0,moved:0,collector:entry.source,started:labTick,lastMovement:labTick};
                b.recovery=true;b.blocked='restart recovery: waiting for the original physical lane to empty';
            }
        }
        log(`0.5.2 dual transport routing ready; ${labCollectorKeys.length} linked Collector configurations, recovery lanes=${Object.values(labBanks).filter(b=>b.recovery).length}`);
    }catch(err){startupHold=String(err);log(`Routing startup state error: ${err}`);}
}
function labStats(source){
    const lines=['Temporary routing chunks: '+routeChunks.size+' / '+(world.tickingAreaManager?.maxChunkCount ?? 'unavailable')];
    if(startupHold)lines.push(startupHold);
    const receivers=new Set(labCollectorKeys.map(labLinkedReceiver).filter(Boolean));
    for(const key of receivers){
        const b=labBankForReceiver(key);
        if(!b)continue;
        const net=labDiscover(b), i=net && labBuildIndex(b);
        lines.push(key+' | '+(net?.lane.length || 0)+(net?.method===PIPE?' Transporters, ':' Hoppers, ')+(i?.total || 0)+' Sorters, Bulk='+ (net?.bulk.length||0)+', dispatched='+b.dispatched+
            ', delivered='+b.confirmed+', unconfirmed='+b.catches+', active='+!!b.active+', recovery='+!!b.recovery+', discoveries='+b.discoveries+
            ', discovery block reads='+b.reads+' | '+(b.blocked || 'ready'));
    }
    if(!receivers.size)lines.push('No linked Receivers found.');
    for(const line of lines){log(line);source?.sendMessage('[Hart LAB] '+line);}
}
function labRoutingEvent(ev){
    if(!ev.id.startsWith('hartlab:'))return;
    const source=ev.sourceEntity, command=ev.id.slice(8);
    system.run(()=>{
        try {
            if(['setup_io','refresh','activate_layout','status'].includes(command)){
                if(command==='refresh' || command==='activate_layout')invalidateRouting();
                labStats(source);return;
            }
            if(!['select_receiver','bind_inlet','select_tap','bind_column','unbind_inlet','unbind_column'].includes(command))return;
            const block=source?.getBlockFromViewDirection()?.block;
            if(!block)throw Error('Look directly at the block.');
            if(command==='select_receiver'){
                if(block.typeId!==RECEIVER_ID)throw Error('Look at the Receiver.');
                selectedPort.set(source.id,{key:keyFor('r',block.dimension.id,block.location)});
            }else{
                const selected=selectedPort.get(source.id);
                if(!selected)throw Error('Use hartlab:select_receiver first.');
                const b=labBankForReceiver(selected.key);
                if(block.dimension.id!==b.cfg.dimension)throw Error('Select blocks in the Receiver dimension.');
                const reg=JSON.parse(world.getDynamicProperty(selected.key)||'{}');
                if(command==='unbind_inlet'){
                    if(block.typeId!==RECEIVER_ID || keyFor('r',block.dimension.id,block.location)!==selected.key)throw Error('Look at the selected Receiver.');
                    delete reg.inlet;
                }else if(command==='unbind_column'){
                    if(reg.columns)delete reg.columns[positionKey(block.location)];
                }else if(command==='bind_inlet'){
                    if(!isTransport(block.typeId))throw Error('Look at the inlet Hopper or Transporter.');
                    reg.inlet=block.location;
                }else if(command==='select_tap'){
                    if(!isTransport(block.typeId) || !labDiscover(b)?.taps.has(positionKey(block.location)))throw Error('Select a block on the discovered transport lane.');
                    selected.tap=positionKey(block.location);
                }else{
                    if(block.typeId!==SORTER_ID || !selected.tap || !labDiscover(b)?.taps.has(selected.tap))throw Error('Select a lane tap, then look at a Sorter in its column.');
                    (reg.columns ??= {})[positionKey(block.location)]={tap:selected.tap,anchor:block.location};
                }
                if(command!=='select_tap'){world.setDynamicProperty(selected.key,JSON.stringify(reg));b.generation=++labRevision;queueRegistration(b);}
            }
            source.sendMessage('[Hart LAB] '+command+' '+positionKey(block.location));
        }catch(err){log(String(err));source?.sendMessage('[Hart LAB] '+err);}
    });
}
system.afterEvents.scriptEventReceive.subscribe(labRoutingEvent);
system.run(labLoadState);
system.runInterval(()=>{
    labTick++;
    for(const b of Object.values(labBanks))if(b.active){try{if(coverRoute(b))labTickActive(b);}catch(err){labMarkHold(b,String(err));}}
    if(labTick%16===0)releaseIdleChunks();
    if(labTick%8===0){
        for(const bank of Object.values(labBanks))if(bank.discoveryChunks)labDiscover(bank);
        labProcessInputs();
    }
},1);

