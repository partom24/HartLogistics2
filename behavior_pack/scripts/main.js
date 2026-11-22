/*
 * HartLogistics Fresh LAB addressed physical routing (0.5.13) — source-only.
 * Original block JSON, texture atlas and geometry copied from HartLogistics 1.4.1.
 * Filter data/metadata and indicator hit detection functions below are excerpted
 * verbatim from HartLogistics 1.4.1 (MPL-2.0), without its routing engine.
 * This pack uses bank-indexed destination selection and native Hopper transportation.
 * License: MPL-2.0 (see LICENSE and NOTICE.md).
 */
import { world, system, ItemStack, BlockPermutation, EquipmentSlot,
         EnchantmentTypes, Potions } from '@minecraft/server';

import { q4LabStep, q4Census } from './q4Lab.js';
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
const dimensions = new Map();
function dimensionFor(id) {
    let dimension = dimensions.get(id);
    if (!dimension) {
        dimension = world.getDimension(id);
        dimensions.set(id, dimension);
    }
    return dimension;
}
function getBlock(d,x,y,z) {
    try { return dimensionFor(d).getBlock({x,y,z}); } catch (_) { return undefined; }
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
    if(b?.typeId===COLLECTOR_ID){
        try{
            const entity=collectorBuffer(b);
            if(!entity)return;
            const inv=labBlockInventory(entity);
            if(inv && inv.emptySlotsCount===inv.size)return;
        }catch(_){}
        ev.cancel=true;ev.player?.sendMessage('[Collector] Drain the handoff buffer before removal.');return;
    }
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
        if(support?.typeId!==SORTER_ID || !entryHasFrameImplant(live) || live.f || live.nativeQuarantine)return;
        eraseOwnedFrame(live);
        try{
            if(player?.getGameMode?.()==='Creative')support.setType('minecraft:air');
            else support.dimension.runCommand(`setblock ${p.x} ${p.y} ${p.z} air destroy`);
        }catch(err){log(`Controlled break failed: ${err}`);return;}
        refreshPipeNeighbors(d,p);
        clearEntry(live);
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
system.run(()=>log('0.5.13 ready — original 1.4.1 assets; Hopper and Transporter routing enabled.'));

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
        finishRegistration(bank);
    });
}
// Cold discovery can span several ticks. Complete the same registration
// steps after the last chunk loads as on a warm, immediately readable lane.
function finishRegistration(bank){
    const net=labDiscover(bank);
    bank.registrationPending=true;
    if(!net)return;
    if(bank.indexNeedsCoverage && !coverRoute(bank))return;
    const index=labBuildIndex(bank);
    bank.indexNeedsCoverage=index.missing>0;
    bank.registrationPending=bank.indexNeedsCoverage;
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
const POWERED = 'hartlogistics:powered';
system.beforeEvents.startup.subscribe(({blockComponentRegistry}) => {
    blockComponentRegistry.registerCustomComponent('hartlogistics:flow_control', {
        onBreak({block,brokenBlockPermutation}){
            if(brokenBlockPermutation.type.id!==COLLECTOR_ID)return;
            const buffer=collectorBuffer(block),inv=labBlockInventory(buffer);
            if(buffer && inv && inv.emptySlotsCount===inv.size){
                buffer.remove();
                world.setDynamicProperty(keyFor('buffer',block.dimension.id,block.location),undefined);
            }
        },
        onRedstoneUpdate({block, powerLevel}) {
            const powered = powerLevel > 0;
            if (block.permutation.getState(POWERED) !== powered)
                block.setPermutation(block.permutation.withState(POWERED, powered));
        }
    });
});
function receiverAccepts(b, block=labGet(b.cfg.dimension,b.cfg.receiver)) {
    return block?.typeId === RECEIVER_ID && block.permutation.getState(POWERED) === false;
}
// A direct handoff keeps the original ItemStack in a saved native inventory.
const BUFFER_ENTITY='hartlogistics:collector_buffer';
function collectorBuffer(block,create=false){
    const p=block.location, dimension=block.dimension;
    const key=keyFor('buffer',dimension.id,p);
    const id=world.getDynamicProperty(key);
    if(id===undefined && !create)return undefined;
    const center={x:p.x+0.5,y:p.y+0.5,z:p.z+0.5};
    let entity=id===undefined?undefined:world.getEntity(id);
    if(!entity){
        const matches=dimension.getEntities({type:BUFFER_ENTITY,location:center,maxDistance:0.3});
        if(matches.length>1 || (id!==undefined && matches[0]?.id!==id))
            throw Error('Collector handoff inventory unavailable at '+positionKey(p));
        entity=matches[0];
        if(!entity && create)entity=dimension.spawnEntity(BUFFER_ENTITY,center);
        if(entity)world.setDynamicProperty(key,entity.id);
    }
    return entity;
}
function collectorOutput(block,bankKey){
    if(block?.typeId!==COLLECTOR_ID || block.permutation.getState(POWERED)!==false)return;
    const link=labLinkedReceiver(keyFor('c',block.dimension.id,block.location));
    if(link && link!==bankKey)return labBlockInventory(collectorBuffer(block,true));
}
function pipeExit(b,item){
    for(const {position,tap} of b.net.collectorExits){
        const dest=collectorOutput(labGet(b.cfg.dimension,position),b.cfg.name);
        if(labCanFitEntire(dest,item))
            return {pipeExit:true,p:{...position,d:b.cfg.dimension,tap},destination:position,destinationType:COLLECTOR_ID};
    }
}
function labCollectorSources(key,inspect=false){
    const p=labKeyParse(key);
    if(p?.kind!=='c')return [];
    const collector=labGet(p.d,p);
    if(collector?.typeId!==COLLECTOR_ID || (!inspect && collector.permutation.getState(POWERED)!==false))return [];
    const feeders=[];
    let direct,hasFeeder=false;
    for(const [dx,dy,dz,toward] of collectorFaces){
        const loc={x:p.x+dx,y:p.y+dy,z:p.z+dz};
        const block=labGet(p.d,loc);
        if(!block)return []; // A missing neighbor could be the configured physical feed.
        if(block.typeId===HOPPER){
            if(block.permutation.getState('facing_direction')!==toward)continue;
            hasFeeder=true;
            if(inspect || !block.permutation.getState('toggle_bit')){
                const container=labBlockInventory(block);
                if(container)feeders.push({loc,dimension:p.d,container});
            }
        }else if(!direct && !hasFeeder){
            const container=labBlockInventory(block);
            if(container)direct={loc,dimension:p.d,container};
        }
    }
    const inputs=hasFeeder ? feeders : direct ? [direct] : [];
    const buffer=labBlockInventory(collectorBuffer(collector));
    if(buffer && buffer.emptySlotsCount!==buffer.size)inputs.push({loc:p,dimension:p.d,container:buffer});
    return inputs;
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
        const candidate={p,bankKey:b.cfg.name,lane:b.net.taps,filter:e.f,mode:sorterMode(e)};
        total++;
        if(candidate.mode==='filter'){
            if(!e.f?.match?.typeId)continue;
            const id=e.f.match.typeId;
            if(!filters.has(id))filters.set(id,[]);
            filters.get(id).push(candidate);
        } else if(candidate.mode==='auto')autos.push(candidate);
        else if(candidate.mode==='wildcard')wildcards.push(candidate);
    }
    // Only loaded Hopper taps with exact filters need passive arrival checks.
    const tapFilters=new Map();
    if(b.net.method===HOPPER){
        for(const candidates of filters.values())for(const candidate of candidates){
            const key=positionKey(candidate.p.tap);
            if(!tapFilters.has(key))tapFilters.set(key,[]);
            tapFilters.get(key).push(candidate);
        }
    }
    const passiveTaps=[];
    for(const [i,p] of b.net.lane.entries()){
        const candidates=tapFilters.get(positionKey(p));
        if(candidates)passiveTaps.push({p,direction:b.net.directions[i],candidates});
    }
    const index={filters,autos,wildcards,total,missing,passiveTaps};
    if(!missing){b.cache=index;b.cacheRevision=b.generation;}
    return index;
}
function labAdjacentInventories(candidate,strict=false,nativeOnly=false){
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
        if(nativeOnly && neighbor?.typeId===COLLECTOR_ID){found.push({position:p,relay:true});continue;}
        const inv=neighbor?.typeId===COLLECTOR_ID ? collectorOutput(neighbor,candidate.bankKey) : strict ? neighbor.getComponent('minecraft:inventory')?.container : labBlockInventory(neighbor);
        if(inv && !candidate.lane.has(k))found.push({position:p,container:inv});
    }
    return found;
}
function labDestinationContainer(candidate){
    if(candidate.destinationType===COLLECTOR_ID){
        const block=labGet(candidate.p.d,candidate.destination);
        // An admitted physical Hopper shipment may finish into the buffer while paused.
        if(block?.typeId===COLLECTOR_ID)return labBlockInventory(collectorBuffer(block));
        return undefined;
    }
    if(candidate.destination)return labGet(candidate.p.d,candidate.destination)?.typeId===candidate.destinationType
        ? labContainer(candidate.p.d,candidate.destination) : undefined;
    return labAdjacentInventories(candidate)[0]?.container;
}
function labHasMatchingSeed(inv,item){
    for(let slot=0;slot<inv.size;slot++){
        const stored=inv.getItem(slot);
        if(!stored||stored.typeId!==item.typeId)continue;
        // AUTO membership follows legacy type/enchanted-book/potion policy.
        const probe=serializeFilterItem(stored);
        if(probe && matchesFilter(item,probe))return true;
    }
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
function labMatchingOutputs(index,item){
    const filters=(index.filters.get(item.typeId)||[]).filter(c=>matchesFilter(item,c.filter));
    const autos=index.autos.filter(c=>labAdjacentInventories(c,true).some(({container})=>labHasMatchingSeed(container,item)));
    return filters.concat(autos);
}
function labSelectTarget(b,item){
    const index=labBuildIndex(b);
    const matches=labMatchingOutputs(index,item);
    for(const group of [matches,index.wildcards]){
        let partial=false;
        for(const c of group){
            for(const {position,container} of labAdjacentInventories(c,true)){
                if(c.mode==='auto' && !labHasMatchingSeed(container,item))continue;
                if(!outputPathReady(b,c.p.tap))throw Error('Output path unavailable');
                const room=bulkRoom(container,item);
                if(room===item.amount)return {...c,destination:position,destinationType:labGet(c.p.d,position).typeId};
                if(room>0)partial=true;
            }
        }
        // Whole-stack admission must not bypass a partly available matching chest.
        if(partial)return undefined;
    }
    if(!matches.length)return pipeExit(b,item);
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
        if(!hopper || hopper.emptySlotsCount!==hopper.size)return false;
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
    try{return inFlight.isStackableWith(found);}catch(_){return false;}
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
// Reserve room for both shipments at the original destination. Other items,
// routes and recovery still use a single physical shipment.
function extendHopperShipment(b,key){
    const a=b.active;
    if(b.coveredAt!==labTick || !a || a.extended || a.collector!==key || a.revision!==b.generation ||
        !bulkOrdinary(a.reference) || !receiverAccepts(b))return false;
    const dest=labDestinationContainer(a.target);
    const inlet=labContainer(b.cfg.dimension,a.lane[0]);
    if(!dest || !inlet)return false;
    for(const source of labCollectorSources(key)){
        if(source.dimension===b.cfg.dimension && b.net.taps.has(positionKey(source.loc)))continue;
        for(let slot=0;slot<source.container.size;slot++){
            const item=source.container.getItem(slot);
            if(!item || !bulkOrdinary(item) || world.getDynamicProperty(mrSlotKey(source,slot))!==undefined || !a.reference.isStackableWith(item) || !labCanFitEntire(inlet,item))continue;
            // ItemStack.amount cannot exceed its native stack limit.
            let room=0;
            for(let j=0;j<dest.size;j++){
                const stack=dest.getItem(j);
                if(!stack)room+=item.maxAmount;
                else if(stack.isStackableWith(item))room+=item.maxAmount-stack.amount;
                if(room>=a.sent-a.moved+item.amount)break;
            }
            if(room<a.sent-a.moved+item.amount)return false;
            if(a.target.destinationType===COLLECTOR_ID &&
                labGet(a.target.p.d,a.target.destination)?.permutation.getState(POWERED)!==false)return false;
            a.extended=true;
            a.sent+=item.amount;
            try{
                labPersistActive(b);
                const moved=labSafeTransfer(source.container,slot,inlet,item);
                a.sent+=moved-item.amount;
                a.extended=moved>0;
                b.dispatched+=moved;
                labPersistActive(b);
                return moved>0;
            }catch(err){labStartRecovery(b,'additional Hopper dispatch: '+err);return false;}
        }
    }
    return false;
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
    if(c.moved)b.lastDestination=c.target.destination;
    if(undelivered)b.catches+=undelivered;
    b.active=null;
    b.blocked='';b.cleanTicks=0;
    labPersistActive(b);
    if(undelivered)log(`${b.cfg.name}: ${c.moved}/${c.sent} deposited; ${undelivered} unconfirmed. Inspect the lane and its output.`);
}
function labPipeDispatch(b,source,slot,item,target){
    const d=b.cfg.dimension;
    if(labGet(d,b.cfg.receiver)?.typeId!==RECEIVER_ID || labGet(d,target.p)?.typeId!==(target.pipeExit?COLLECTOR_ID:SORTER_ID))return false;
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
    if(moved){b.blocked='';b.lastDestination=target.destination;}
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
// Some vanilla families carry payloads whose identity is not a Bulk item ID.
const nativePayload=/^minecraft:(?:.*shulker_box|.*bundle|filled_map|written_book|writable_book|enchanted_book|potion|splash_potion|lingering_potion|tipped_arrow|firework_rocket|firework_star|goat_horn|suspicious_stew|lodestone_compass|ominous_bottle|.*banner|bee_nest|beehive)$/;
function bulkOrdinary(item){
    try{return item.typeId.startsWith('minecraft:') && !nativePayload.test(item.typeId) && item.maxAmount>1 && item.isStackable===true &&
        !item.nameTag && !item.keepOnDeath && (!item.lockMode || item.lockMode==='none') &&
        !item.getLore().length && !item.getCanPlaceOn().length && !item.getCanDestroy().length &&
        !item.getDynamicPropertyIds().length &&
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
function bulkTarget(bank,candidates,item,allowed=()=>true){
    for(const c of candidates){
        if(!allowed(c))continue;
        if(labGet(c.p.d,c.p)?.typeId!==SORTER_ID)throw Error('Sorter unavailable');
        const inventories=labAdjacentInventories(c,true);
        for(const {container,position} of inventories){
            if(c.mode==='auto' && !labHasMatchingSeed(container,item))continue;
            if(!outputPathReady(bank,c.p.tap))throw Error('Output path unavailable');
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
    const eligible=labMatchingOutputs(index,item);
    const resident=members.some(a=>a.state.items[item.typeId] && !a.state.provisional[item.typeId]);
    const claimed=!!eligible.length || resident;
    let route=bulkTarget(b,claimed?eligible:index.wildcards,item);
    if(!route && !claimed){
        const exit=pipeExit(b,item);
        if(exit)return labTryDispatch(b,key,source,slot,item,exit);
    }
    const member=members.find(a=>a.total<BULK_LIMIT);
    if(!route && !claimed && b.net.terminal){
        // A native Hopper lane's terminal inventory is a catch, not a Collector account.
        if(labGet(b.cfg.dimension,b.net.terminal)?.typeId===COLLECTOR_ID)return false;
    }
    if(!route && claimed && !member){
        for(const a of members)verifyBulkPath(b,a);
        route=bulkTarget(b,index.wildcards,item);
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
    const d=b.cfg.dimension;
    const hasStock=b.net.bulk.some(p=>{
        const {state}=bulkRead(d,p);
        return state.pending || Object.keys(state.items).length;
    });
    if(!hasStock || !coverRoute(b) || !receiverAccepts(b))return false;
    for(const a of bulkMembers(b)){
        const types=Object.keys(a.state.items);
        for(let i=0;i<types.length;i++){
            const id=types[(i+(b.bulkCursor||0))%types.length];
            const item=new ItemStack(id,1);
            if(!bulkOrdinary(item)){labMarkHold(b,'Unverified legacy Bulk balance: '+id);continue;}
            item.amount=Math.min(item.maxAmount,a.state.items[id]);
            const index=labBuildIndex(b);
            if(index.missing)return false;
            const matches=labMatchingOutputs(index,item);
            const candidates=matches.length?matches:index.wildcards;
            const provisional=a.state.provisional[id];
            const start=b.net.method===HOPPER?a.p.tapIndex:0;
            const route=bulkTarget(b,candidates,item,c=>(provisional || c.mode!=='wildcard') &&
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
        for (const exit of net.collectorExits || []) add(d,exit.position);
        add(d,b.cfg.receiver);
        add(d,net.terminal);
        add(d,net.target?.p,1);
        add(d,net.target?.destination);
        b.coverageNet = net;
        b.coverageChunks = chunks;
    }
    if (!source) return coverChunks(b,b.coverageChunks);
    const chunks = new Map(b.coverageChunks);
    if (source) {
        const p = source.loc, x=Math.floor(p.x/16), z=Math.floor(p.z/16);
        chunks.set(source.dimension+'_'+x+'_'+z,{dimension:source.dimension,x:x*16,y:p.y,z:z*16});
    }
    return coverChunks(b,chunks);
}
function coverChunks(b,chunks) {
    let ready = true;
    let additional = 0;
    for (const key of chunks.keys()) if (!routeChunks.has(key)) additional++;
    if(!additional){
        for(const key of chunks.keys()){
            const entry=routeChunks.get(key);
            entry.last=labTick;
            if(!entry.ready)ready=false;
        }
        return ready;
    }
    const manager=world.tickingAreaManager;
    if(!manager){labMarkHold(b,'Script ticking areas unavailable');return false;}
    if (additional + routeChunks.size > manager.maxChunkCount) {
        labMarkHold(b,'Waiting for ticking chunk capacity'); return false;
    }
    for (const [key,p] of chunks) {
        let entry = routeChunks.get(key);
        if (!entry) {
            const point = {x:p.x,y:p.y,z:p.z};
            const options = {dimension:dimensionFor(p.dimension),from:point,to:point};
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
// Refill polls every 32 ticks. Keep coverage through its next poll.
function releaseIdleChunks() {
    for (const [key,entry] of routeChunks) {
        if (entry.ready && labTick-entry.last >= 48) {
            try {
                world.tickingAreaManager.removeTickingArea(entry.id);
                routeChunks.delete(key);
            } catch(err) { log('Ticking area release: '+err); }
        }
    }
}
// MR follows the discovered physical graph, but stays in the original native
// slot until a final inventory has an empty slot. No intermediate item journal.
function outputPathReady(bank,tap){
    const net=bank.net,d=bank.cfg.dimension;
    if(net.method===PIPE){
        for(let p=tap;p;p=net.parents.get(positionKey(p))){
            if(labGet(d,p)?.typeId!==PIPE)return false;
        }
        return true;
    }
    for(const [i,p] of net.lane.entries()){
        const block=labGet(d,p);
        if(block?.typeId!==HOPPER || block.permutation.getState('toggle_bit') ||
            block.permutation.getState('facing_direction')!==net.directions[i])return false;
        if(positionKey(p)===positionKey(tap))return true;
    }
    return false;
}
function mrSeedMatches(inv,item){
    for(let i=0;i<inv.size;i++){
        const seed=inv.getItem(i);
        if(seed?.typeId!==item.typeId)continue;
        if(POTION_ITEM_IDS.has(item.typeId)){
            const potion=potionIdentity(seed);
            if(!potion)throw Error('Unreadable AUTO potion seed');
            if(!matchesFilter(item,{match:{typeId:item.typeId,potion}}))continue;
        }else if(item.typeId==='minecraft:enchanted_book'){
            const ench=seed.getComponent('minecraft:enchantable')?.getEnchantments();
            if(!ench?.length)throw Error('Unreadable AUTO book seed');
            if(!matchesFilter(item,{match:{typeId:item.typeId,enchIds:ench.map(e=>e.type.id)}}))continue;
        }
        return true;
    }
    return false;
}
function* mrOutputs(bank,item){
    const index=labBuildIndex(bank);
    if(index.missing)throw Error('MR Sorter index incomplete');
    const sameType=index.filters.get(item.typeId)||[];
    if(sameType.length || index.autos.length){
        if(POTION_ITEM_IDS.has(item.typeId) && !potionIdentity(item))throw Error('Unreadable MR potion identity');
        if(item.typeId==='minecraft:enchanted_book' && !item.getComponent('minecraft:enchantable')?.getEnchantments()?.length)
            throw Error('Unreadable MR book enchantments');
    }
    const filters=sameType.filter(c=>matchesFilter(item,c.filter));
    let claimed=filters.length>0;
    for(const list of [filters,index.autos,index.wildcards]){
        for(const c of list){
            const outputs=labAdjacentInventories(c,true,true);
            for(const out of outputs){
                if(c.mode==='auto'){
                    if(!out.container || !mrSeedMatches(out.container,item))continue;
                    claimed=true;
                }
                if(!outputPathReady(bank,c.p.tap))throw Error('MR output path unavailable');
                yield out;
            }
        }
    }
    if(!claimed)for(const exit of bank.net.collectorExits){
        if(outputPathReady(bank,exit.tap))yield {position:exit.position,relay:true};
    }
}
function mrSlotKey(source,slot){
    return keyFor('mr',source.dimension,source.loc)+'_'+slot;
}
function mrMoveToInventory(source,slot,item,out,d){
    const dest=out.container;
    for(let targetSlot=0;targetSlot<dest.size;targetSlot++){
        if(dest.getItem(targetSlot))continue;
        // No yield to Bedrock between reading this source slot, resolving
        // its filter and moving it. Never copy/recreate a disputed stack.
        const fence=mrSlotKey(source,slot);
        world.setDynamicProperty(fence,JSON.stringify({source:source.loc,dimension:source.dimension,
            slot,target:out.position,targetDimension:d,targetSlot,item:item.typeId,amount:item.amount}));
        source.container.moveItem(slot,targetSlot,dest);
        const received=dest.getItem(targetSlot);
        if(source.container.getItem(slot) || received?.typeId!==item.typeId || received.amount!==item.amount)
            throw Error('MR receipt uncertain at '+d+' '+positionKey(out.position)+' slot '+targetSlot);
        world.setDynamicProperty(fence,undefined);
        return true;
    }
    return false;
}
function mrDeliver(bank,source,slot,item){
    const visited=new Set();
    const path=[];
    function enter(next){
        if(!next || visited.has(next.cfg.name) || next.active || next.recovery)return;
        visited.add(next.cfg.name);
        if(labDiscover(next) && coverRoute(next,source) && receiverAccepts(next)){
            path.push({bank:next,outputs:mrOutputs(next,item)});
        }
    }
    enter(bank);
    while(path.length){
        const step=path[path.length-1],result=step.outputs.next();
        if(result.done){path.pop();continue;}
        const out=result.value,d=step.bank.cfg.dimension;
        if(out.relay){
            const block=labGet(d,out.position);
            if(block?.typeId===COLLECTOR_ID && block.permutation.getState(POWERED)===false){
                const link=labLinkedReceiver(keyFor('c',d,out.position));
                if(link)enter(labBankForReceiver(link));
            }
            continue;
        }
        if(d===source.dimension && positionKey(source.loc)===positionKey(out.position))continue;
        // Both halves of a double chest can expose the same native inventory.
        const origin=source.loc,endpoint=out.position;
        if(source.dimension===d && origin.y===endpoint.y &&
            Math.abs(origin.x-endpoint.x)+Math.abs(origin.z-endpoint.z)===1){
            const a=labGet(d,origin)?.typeId,z=labGet(d,endpoint)?.typeId;
            if(a===z && (a==='minecraft:chest' || a==='minecraft:trapped_chest'))continue;
        }
        if(mrMoveToInventory(source,slot,item,out,d)){
            for(const hop of path){
                hop.bank.dispatched+=item.amount;hop.bank.confirmed+=item.amount;
                hop.bank.lastDestination=out.position;hop.bank.blocked='';
            }
            return true;
        }
    }
    return false;
}
function labTryCollector(b,collectorKey){
    try{
        const sources=labCollectorSources(collectorKey);
        const offset=b.sourceCursor?.get(collectorKey) || 0;
        // Two MR admissions earn the next successful ordinary admission.
        // A blocked or empty class immediately lends its turn to the other.
        const credit=b.mrCredit?.get(collectorKey) || 0;
        for(const rich of [credit<2,credit>=2]){
            for(let i=0;i<sources.length;i++){
                const index=(offset+i)%sources.length,source=sources[index],inv=source.container;
                if(inv.emptySlotsCount===inv.size)continue;
                if(!labDiscover(b) || !coverRoute(b,source) || !receiverAccepts(b))return false;
                if(labBuildIndex(b).missing){labMarkHold(b,'Waiting for indexed Sorters');return false;}
                if(source.dimension===b.cfg.dimension && b.net.taps.has(positionKey(source.loc)))continue;
                const sourceKey=source.dimension+' '+positionKey(source.loc);
                const start=b.slotCursor?.get(sourceKey) || 0;
                for(let j=0;j<inv.size;j++){
                    const slot=(start+j)%inv.size,item=inv.getItem(slot);
                    if(!item)continue;
                    const isRich=!bulkOrdinary(item);
                    if(isRich!==rich)continue;
                    if(world.getDynamicProperty(mrSlotKey(source,slot))!==undefined)continue;
                    let moved=false;
                    if(rich){
                        b.mrHold=item.typeId+' '+(item.nameTag||'')+' x'+item.amount+' at '+sourceKey+' slot '+slot;
                        try{moved=mrDeliver(b,source,slot,item);}
                        catch(err){labMarkHold(b,'MR held: '+err);}
                        if(moved)b.mrHold=undefined;
                    }else if(b.net.bulk.length)moved=bulkCollect(b,collectorKey,source,slot,item);
                    else{
                        const target=labSelectTarget(b,item);
                        if(target)moved=labTryDispatch(b,collectorKey,source,slot,item,target);
                    }
                    if(!moved){if(b.active)return true;continue;}
                    (b.sourceCursor ??= new Map()).set(collectorKey,index+1);
                    (b.slotCursor ??= new Map()).set(sourceKey,slot+1);
                    (b.mrCredit ??= new Map()).set(collectorKey,rich?Math.min(2,credit+1):0);
                    return true;
                }
            }
        }
    }catch(err){labMarkHold(b,'collector input: '+err);}
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
        const slots=hopper.emptySlotsCount===hopper.size ? 0 : hopper.size;
        for(let i=0;i<slots;i++){
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
// Chest-fed traffic has no Collector shipment. Watch known feed points and
// one rotating lane position without waking idle chunks. Once cargo appears,
// retain coverage until a covered sweep finds the feed and the lane empty.
function serviceInlineCoverage(b){
    const net=b.net;
    if(startupHold || b.active || b.recovery || net?.method!==HOPPER ||
        b.revision!==b.generation || !net.lane.length)return;
    const tracking=b.inlineCoverage===net;
    if(labTick%(tracking?16:4)!==0)return;
    const d=b.cfg.dimension;
    const receiver=labGet(d,b.cfg.receiver);
    if(receiver && !receiverAccepts(b,receiver)){
        b.inlineCoverage=undefined;
        return;
    }
    if(tracking && !coverRoute(b))return;
    function occupied(p){
        const hopper=labGet(d,p);
        if(hopper?.typeId!==HOPPER || hopper.permutation.getState('toggle_bit'))return false;
        const inv=labBlockInventory(hopper);
        return inv && inv.emptySlotsCount<inv.size;
    }
    const feeding=net.hopperFeeds.some(({position,tap})=>{
        const inv=labContainer(d,position);
        if(!inv || inv.emptySlotsCount===inv.size)return false;
        const hopper=labGet(d,tap);
        return hopper?.typeId===HOPPER && !hopper.permutation.getState('toggle_bit');
    });
    const cursor=(b.inlineCursor||0)%net.lane.length;
    b.inlineCursor=cursor+1;
    const cargo=feeding || (tracking ? net.lane.some(occupied) :
        occupied(net.lane[0]) || (cursor!==0 && occupied(net.lane[cursor])));
    b.inlineCoverage=cargo?net:undefined;
    if(cargo && !tracking)coverRoute(b);
}
// Sample each exact-filter tap once per four ticks. Native Hoppers still
// carry external items along the lane. Only inspect outputs on a local match.
function serviceLaneInputs(b,banks){
    if(startupHold || b.recovery || !b.cache?.passiveTaps.length ||
        b.cacheRevision!==b.generation)return;
    const taps=b.cache.passiveTaps;
    const first=labTick%4;
    if(first>=taps.length || !receiverAccepts(b))return;
    for(let i=first;i<taps.length;i+=4){
        const {p,direction,candidates}=taps[i];
        const hopper=labGet(b.cfg.dimension,p);
        if(hopper?.typeId!==HOPPER || hopper.permutation.getState('toggle_bit') ||
            hopper.permutation.getState('facing_direction')!==direction)continue;
        b.laneTapReads=(b.laneTapReads||0)+1;
        const inv=labBlockInventory(hopper);
        if(!inv || inv.emptySlotsCount===inv.size)continue;
        for(let slot=0;slot<inv.size;slot++){
            const item=inv.getItem(slot);
            if(!item || !candidates.some(c=>c.filter.match.typeId===item.typeId))continue;
            const book=item.typeId==="minecraft:enchanted_book";
            if(!book && !bulkOrdinary(item))continue;
            // Other Receivers can share this physical lane. A recovery owns
            // all its contents; a live shipment owns indistinguishable cargo.
            if(banks.some(other=>other.active && other.cfg.dimension===b.cfg.dimension &&
                (other.recovery || other.active.type===item.typeId) &&
                other.active.lane.some(tap=>positionKey(tap)===positionKey(p))))continue;
            if(world.getDynamicProperty(mrSlotKey({dimension:b.cfg.dimension,loc:p},slot))!==undefined)continue;
            for(const c of candidates){
                if(book && !c.filter.match.enchIds?.length)continue;
                if(!matchesFilter(item,c.filter))continue;
                if(book){
                    const source={dimension:b.cfg.dimension,loc:p,container:inv};
                    const moved=labAdjacentInventories(c,true,true).some(out=>
                        !out.relay && mrMoveToInventory(source,slot,item,out,b.cfg.dimension));
                    if(!moved)continue;
                    b.laneDelivered=(b.laneDelivered||0)+item.amount;
                    break;
                }
                const output=labAdjacentInventories(c,true).find(out=>labCanFitEntire(out.container,item));
                if(!output)continue;
                const moved=labSafeTransfer(inv,slot,output.container,item);
                b.laneDelivered=(b.laneDelivered||0)+moved;
                break;
            }
        }
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
        if(!bank||bank.recovery)continue;
        if(bank.active){
            try{if(extendHopperShipment(bank,key)){supplied=true;break;}}
            catch(err){labMarkHold(bank,'Hopper admission: '+err);}
            continue;
        }
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
        log(`0.5.13 dual transport routing ready; ${labCollectorKeys.length} linked Collector configurations, recovery lanes=${Object.values(labBanks).filter(b=>b.recovery).length}`);
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
        const paused=[];
        if(labGet(b.cfg.dimension,b.cfg.receiver)?.permutation.getState(POWERED))paused.push('Receiver');
        for(const k of labCollectorKeys){
            if(labLinkedReceiver(k)!==key)continue;
            const p=labKeyParse(k);
            if(p && labGet(p.d,p)?.permutation.getState(POWERED))paused.push('Collector '+positionKey(p));
        }
        lines.push(key+' | '+(net?.lane.length || 0)+(net?.method===PIPE?' Transporters, ':' Hoppers, ')+(i?.total || 0)+' readable Sorters / '+(net?.spots.length || 0)+' discovered, Bulk='+ (net?.bulk.length||0)+', dispatched='+b.dispatched+
            ', delivered='+b.confirmed+', passive taps='+(i?.passiveTaps.length||0)+', inline coverage='+!!(b.net && b.inlineCoverage===b.net)+', lane tap reads='+(b.laneTapReads||0)+', lane input delivered='+(b.laneDelivered||0)+', unconfirmed='+b.catches+', active='+!!b.active+', recovery='+!!b.recovery+', discoveries='+b.discoveries+
            ', discovery block reads='+b.reads+(b.lastDestination?' | last delivery chest='+positionKey(b.lastDestination):'')+' | '+(b.blocked || 'ready')+(b.mrHold?' | last MR hold: '+b.mrHold:'')+(paused.length?' | redstone paused: '+paused.join(', '):''));
    }
    if(!receivers.size)lines.push('No linked Receivers found.');
    for(const line of lines){log(line);source?.sendMessage('[Hart LAB] '+line);}
}
function labRoutingEvent(ev){
    if(!ev.id.startsWith('hartlab:'))return;
    const source=ev.sourceEntity, command=ev.id.slice(8);
    system.run(()=>{
        try {
            if(['q4_census','q4_seed','q4_prepare','q4_commit','q4_status'].includes(command)){
                let message;
                if(command==='q4_census')message=q4Census(world,(ev.message||'').trim());
                else{
                    const target=source?.getBlockFromViewDirection()?.block;
                    if(target?.typeId!==RECEIVER_ID)throw Error('Look directly at the terminal test Receiver.');
                    const key=keyFor('r',target.dimension.id,target.location);
                    if(!labCollectorKeys.some(c=>labLinkedReceiver(c)===key))throw Error('Select a linked Receiver.');
                    message=q4LabStep(world,key,command.slice(3));
                }
                log(message);source?.sendMessage('[Hart LAB] '+message);return;
            }
            if(command==='mr_status' || command==='mr_clear'){
                const emit=message=>{log(message);source?.sendMessage(message);};
                const fences=world.getDynamicPropertyIds().filter(id=>id.startsWith('hartlab:mr_'));
                if(command==='mr_status'){
                    for(const id of fences)emit(id+' '+world.getDynamicProperty(id));
                    for(const key of labCollectorKeys){
                        for(const input of labCollectorSources(key,true)){
                            for(let i=0;i<input.container.size;i++){
                                const item=input.container.getItem(i);
                                if(!item || bulkOrdinary(item))continue;
                                emit(key+' '+input.dimension+' '+positionKey(input.loc)+' slot '+i+' '+
                                    item.typeId+' x'+item.amount+' '+(item.nameTag||'')+' '+
                                    JSON.stringify({ench:enchantments(item),lore:item.getLore(),
                                        damage:item.getComponent('minecraft:durability')?.damage,
                                        potion:potionIdentity(item),properties:item.getDynamicPropertyIds()}));
                            }
                        }
                    }
                    emit('MR reconciliation records: '+fences.length);return;
                }
                const id=ev.message.trim();
                if(!fences.includes(id))throw Error('Supply the exact MR reconciliation record from mr_status.');
                const record=JSON.parse(world.getDynamicProperty(id));
                const block=labGet(record.dimension,record.source);
                const inv=block?.typeId===COLLECTOR_ID?labBlockInventory(collectorBuffer(block)):labBlockInventory(block);
                if(!inv || inv.getItem(record.slot))throw Error('Inspect both endpoints and empty the recorded source slot first.');
                world.setDynamicProperty(id,undefined);emit('Cleared '+id);return;
            }
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
    for(const b of Object.values(labBanks))if(b.active){try{if(coverRoute(b)){b.coveredAt=labTick;labTickActive(b);}}catch(err){labMarkHold(b,String(err));}}
    const banks=Object.values(labBanks);
    for(const b of banks){
        try{serviceInlineCoverage(b);serviceLaneInputs(b,banks);}catch(err){labMarkHold(b,'Hopper lane input: '+err);}
    }
    if(labTick%16===0)releaseIdleChunks();
    if(labTick%8===0){
        for(const bank of Object.values(labBanks)){
            if(bank.discoveryChunks || (bank.registrationPending && (bank.net || labTick>=bank.retry))){
                try{finishRegistration(bank);}catch(err){labMarkHold(bank,'Registration: '+err);}
            }
        }
        labProcessInputs();
    }
},1);

