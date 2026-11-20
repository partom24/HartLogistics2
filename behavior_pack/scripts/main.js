/*
 * HartLogistics Fresh LAB addressed physical routing (0.2.0) — source-only.
 * Original block JSON, texture atlas and geometry copied from HartLogistics 1.4.1.
 * Filter data/metadata and indicator hit detection functions below are excerpted
 * verbatim from HartLogistics 1.4.1 (MPL-2.0), without its routing engine.
 * This pack uses bank-indexed destination selection and native Hopper transportation.
 * License: MPL-2.0 (see LICENSE and NOTICE.md).
 */
import { world, system, ItemStack, BlockPermutation, EquipmentSlot,
         EnchantmentTypes, Potions } from '@minecraft/server';

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
    try { world.setDynamicProperty(keyFor('s',e.d,e),JSON.stringify(e));invalidateRouting();return true; }
    catch(err){log(`Write failed at ${e.d} ${e.x},${e.y},${e.z}: ${err}`);return false;}
}
function clearEntry(e) {
    try { world.setDynamicProperty(keyFor('s',e.d,e),undefined);invalidateRouting(); } catch(err) {log(`Clear failed: ${err}`);}
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
    player.sendMessage('§7[Fresh LAB] Linked Collectors with input inventories now use addressed Hopper delivery.');
}
function useReceiver(player,block){
    const id=keyFor('r',block.dimension.id,block.location);
    const selection=selectedCollector.get(player.id);
    if(selection){
        let info={};try{const raw=world.getDynamicProperty(selection);if(typeof raw==='string')info=JSON.parse(raw);}catch(_){}
        info.receiver=id;
        routingCollectorAdded(selection);
        try{world.setDynamicProperty(selection,JSON.stringify(info));}
        catch(err){log(`Link save failed: ${err}`);player.sendMessage('§c[Collector] Link not saved.');return;}
        selectedCollector.delete(player.id);
        player.sendMessage(`§a[Hart Logistics] Collector linked to Receiver at ${block.location.x}, ${block.location.y}, ${block.location.z}.`);
    }else player.sendMessage('§7[Receiver] Select a Collector first, then click this Receiver to link.');
    player.sendMessage('§7[Fresh LAB] Native Hopper transport is enabled on configured LAB lanes.');
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
    let typeId='';try{typeId=ev.brokenBlockPermutation.type.id;}catch(_){try{typeId=ev.brokenBlockPermutation.typeId;}catch(_){}}
    if(typeId!==SORTER_ID)return;
    const e={d:ev.dimension.id,...ev.block.location};
    const k=keyFor('s',e.d,e);
    let info;try{const raw=world.getDynamicProperty(k);if(typeof raw==='string')info=JSON.parse(raw);}catch(_){}
    if(info?.f && !entryHasFrameImplant(info))giveOrDrop(ev.player,rebuildItem(info.f));
    if(info)clearEntry(info);
});
system.run(()=>log('0.2.0 ready — original 1.4.1 assets; addressed physical Hopper routing enabled.'));

system.afterEvents.scriptEventReceive.subscribe(ev=>{
    if(ev.id!=='hartlab:activate_layout')return;
    system.runTimeout(()=>{
        let mounted=0,found=0;
        for(const x of [-22,-17,-12,-7,-2,3,8,13,18,23]){
            for(const y of [81,82,83,84]){
                const b=getBlock('overworld',x,y,3);
                if(b?.typeId!==SORTER_ID)continue;
                found++;const e=entryForBlock(b,true);
                if(e){syncSorterModeVisual(e,b);if(plantEmptyNativeFrame(e))mounted++;}
            }
        }
        for(const y of [81,82,83,84]){
            const b=getBlock('overworld',-20,y,21);
            if(b?.typeId!==SORTER_ID)continue;
            found++;const e=entryForBlock(b,true);
            if(e){syncSorterModeVisual(e,b);if(plantEmptyNativeFrame(e))mounted++;}
        }
        const msg=`[HartLogistics Fresh LAB] Fixture activated: ${found}/44 Sorters found; ${mounted} new native frames.`;
        log(msg);try{ev.sourceEntity?.sendMessage(msg);}catch(_){}
    },2);
});


/*
 * HartLogistics Fresh LAB 0.2.0 - addressed physical Hopper transport.
 * Uses original 1.4.1 Sorter configuration and native inventories only.
 * One active addressed shipment per conveyor lane; no item serialization.
 * Each active lane polls only the designated destination Hopper.
 * License MPL-2.0, attribution retained in NOTICE.md.
 */
const LAB_BANKS = Object.freeze({
    main: {name:'main', dimension:'overworld', y:87, z:0, firstX:-26, lastX:26,
        tapZ:3, rows:[81,82,83,84], columns:[-22,-17,-12,-7,-2,3,8,13,18,23],
        catchX:27, receiver:{x:-27,y:87,z:0}, collector:{x:-29,y:87,z:0},
        source:{x:-29,y:88,z:0}, legacy:{x:-26,y:88,z:0}},
    experimental: {name:'experimental',dimension:'overworld',y:87,z:18,firstX:-26,lastX:-12,
        tapZ:21, rows:[81,82,83,84],columns:[-20],
        catchX:-11,receiver:{x:-27,y:87,z:18},collector:{x:-29,y:87,z:18},
        source:{x:-29,y:88,z:18},legacy:{x:-26,y:88,z:18}}
});
const LAB_ROUTE_STATE = 'hartlab:transport_020';
const labBanks = Object.fromEntries(Object.entries(LAB_BANKS).map(([name, cfg]) => [name, {
    cfg, active:null, recovery:false, blocked:'', cache:null, cacheRevision:-1,
    confirmed:0, catches:0, dispatched:0, failed:0, idleCountdown:0,
    lastProgress:0, cleanTicks:0, lastWarning:0
}]));
let labRevision = 1;
let labCollectorKeys = [];
let labRR = 0;
let labTick = 0;
const labWarned = new Set();
function invalidateRouting(){labRevision++;}
function routingCollectorAdded(key){
    if(!labCollectorKeys.includes(key))labCollectorKeys.push(key);
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
    for(const b of Object.values(labBanks)){
        const p=b.cfg.receiver;
        if(parsed.d==='minecraft:overworld'&&parsed.x===p.x&&parsed.y===p.y&&parsed.z===p.z)return b;
    }
    return undefined;
}
function labSourceForCollector(key){
    const p=labKeyParse(key);
    if(!p||p.kind!=='c')return undefined;
    const block=getBlock(p.d,p.x,p.y,p.z);
    if(block?.typeId!==COLLECTOR_ID)return undefined;
    // Keep the 1.4.1 player-facing pattern: native inventory adjacent to Collector.
    const offsets=[{x:0,y:1,z:0},{x:0,y:0,z:-1},{x:0,y:0,z:1},
        {x:-1,y:0,z:0},{x:1,y:0,z:0},{x:0,y:-1,z:0}];
    for(const o of offsets){
        const loc={x:p.x+o.x,y:p.y+o.y,z:p.z+o.z};
        const inv=labContainer(p.d,loc);
        if(inv)return {container:inv,loc,dimension:p.d};
    }
    return undefined;
}
function labSpots(cfg){
    const result=[];
    for(const x of cfg.columns)for(const y of cfg.rows)result.push({x,y,z:cfg.tapZ,d:cfg.dimension,tapX:x});
    return result;
}
function labBuildIndex(b){
    if(b.cache && b.cacheRevision===labRevision)return b.cache;
    const filters=new Map(),autos=[],wildcards=[];
    let total=0,missing=0;
    for(const p of labSpots(b.cfg)){
        const block=labGet(p.d,p);
        if(block?.typeId!==SORTER_ID){missing++;continue;}
        const e=entryForBlock(block,true);
        if(!e)continue;
        const candidate={p,filter:e.f,mode:sorterMode(e)};
        total++;
        if(candidate.mode==='filter'){
            if(!e.f?.match?.typeId)continue;
            const id=e.f.match.typeId;
            if(!filters.has(id))filters.set(id,[]);
            filters.get(id).push(candidate);
        } else if(candidate.mode==='auto')autos.push(candidate);
        else if(candidate.mode==='wildcard')wildcards.push(candidate);
    }
    b.cache={filters,autos,wildcards,total,missing};b.cacheRevision=labRevision;
    return b.cache;
}
function labAdjacentInventories(candidate){
    const block=labGet(candidate.p.d,candidate.p);
    if(block?.typeId!==SORTER_ID)return [];
    const facing=facingOffset(block);
    if(!facing)return [];
    const all=[facing,{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},
        {x:0,y:0,z:-1},{x:0,y:1,z:0},{x:0,y:-1,z:0}];
    const unique=new Set(),found=[];
    for(const offset of all){
        const p={x:candidate.p.x+offset.x,y:candidate.p.y+offset.y,z:candidate.p.z+offset.z};
        const k=`${p.x},${p.y},${p.z}`;
        if(unique.has(k))continue;
        unique.add(k);
        // The native Item Frame is not an inventory. All other adjacent
        // compatible vanilla/custom inventory blocks are valid destinations.
        const inv=labContainer(candidate.p.d,p);
        if(inv)found.push({position:p,container:inv});
    }
    return found;
}
function labDestinationContainer(candidate){
    if(candidate.destination)return labContainer(candidate.p.d,candidate.destination);
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
            if(labCanFitEntire(container,item))return {...c,destination:position};
        }
    }
    return undefined;
}
function labLineEmpty(b){
    const c=b.cfg;
    for(let x=c.firstX;x<=c.lastX;x++){
        const hopper=labContainer(c.dimension,{x,y:c.y,z:c.z});
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
    try {if(inFlight.isStackableWith(found))return true;}catch(_){}
    // When native stacking comparison is unavailable for specialized items,
    // the dedicated conveyor's one-shipment invariant provides identity.
    // All normal deposits are native container-to-container moves; metadata
    // is never serialized or reconstructed.
    return true;
}
function labPersistActive(b){
    try{const v=world.getDynamicProperty(LAB_ROUTE_STATE);
        const state=v?JSON.parse(v):{};
        if(b.active){state[b.cfg.name]={target:b.active.target.p, sent:b.active.sent,
            source:b.active.collector, type:b.active.type, started:labTick};}
        else delete state[b.cfg.name];
        world.setDynamicProperty(LAB_ROUTE_STATE,JSON.stringify(state));
    }catch(err){log(`ROUTING STATE SAVE FAILED ${b.cfg.name}: ${err}`);throw err;}
}
function labMarkHold(b,reason){
    b.blocked=reason;b.failed++;
    if(labTick-b.lastWarning>200){log(`HOLD ${b.cfg.name}: ${reason}`);b.lastWarning=labTick;}
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
    if(undelivered)log(`${b.cfg.name}: ${c.moved}/${c.sent} deposited; up to ${undelivered} bypassed destination and remains in catch barrel / externally handled. Inspect catch.`);
}
function labTryDispatch(b,key,source,slot,item,target){
    const cfg=b.cfg;
    if(!labLineEmpty(b)){b.blocked='hopper line contains existing items; waiting for it to drain';return false;}
    const first=labContainer(cfg.dimension,{x:cfg.firstX,y:cfg.y,z:cfg.z});
    if(!first||!labCanFitEntire(first,item)){
        b.blocked='first hopper unavailable/full';return false;
    }
    const catchInv=labContainer(cfg.dimension,{x:cfg.catchX,y:cfg.y,z:cfg.z});
    if(!catchInv||!labCanFitEntire(catchInv,item)){
        // Catch must have enough capacity for the entire packet as a failsafe.
        b.blocked='catch barrel unavailable/full; source item held';return false;
    }
    const active={target,collector:key,source:source.loc,type:item.typeId,
        reference:item.clone(),sent:item.amount,moved:0,lastMovement:labTick,started:labTick};
    // Write route intent BEFORE touching inventory. Crash recovery sends any
    // in-flight physical items to the catch barrel, never replays the source.
    b.active=active;
    try{labPersistActive(b);}catch(_){b.active=null;return false;}
    let moved=0;
    try{moved=labSafeTransfer(source.container,slot,first,item);}
    catch(err){labMarkHold(b,`dispatch: ${err}`);b.recovery=true;return false;}
    if(moved===0){b.active=null;labPersistActive(b);return false;}
    active.sent=moved;b.dispatched+=moved;b.blocked='';
    try{labPersistActive(b);}catch(err){b.recovery=true;labMarkHold(b,`persist after dispatch: ${err}`);}
    return true;
}
function labTryCollector(b,collectorKey){
    const source=labSourceForCollector(collectorKey);
    if(!source)return false;
    const inv=source.container;
    try{
        for(let slot=0;slot<inv.size;slot++){
            const item=inv.getItem(slot);
            if(!item)continue;
            const target=labSelectTarget(b,item);
            if(!target)continue;
            if(labTryDispatch(b,collectorKey,source,slot,item,target))return true;
            if(b.active)return true;
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
        if(labLineEmpty(b)){
            b.cleanTicks++;
            if(b.cleanTicks>=5){b.active=null;b.recovery=false;b.blocked='';
                labPersistActive(b);log(`Recovery ${c.name} complete: inspect catch barrel before retrying.`);}
        }else b.cleanTicks=0;
        return;
    }
    const hopper=labContainer(c.dimension,{x:a.target.p.tapX,y:c.y,z:c.z});
    const destination=labDestinationContainer(a.target);
    if(!hopper||!destination){labMarkHold(b,'destination unloaded or absent; in-flight items continue to catch');return;}
    try{
        // Only the already-addressed destination Hopper is inspected.
        for(let i=0;i<hopper.size;i++){
            const item=hopper.getItem(i);
            if(!item||!labLiveReferenceMatches(a.reference,item))continue;
            if(!labCanFitEntire(destination,item))continue;
            const moved=labSafeTransfer(hopper,i,destination,item);
            a.moved+=moved;
            if(moved)a.lastMovement=labTick;
        }
    }catch(err){labMarkHold(b,`arrival: ${err}`);}
    if(a.moved>=a.sent){labFinish(b);return;}
    // Check the entire line only after no destination activity, so routine
    // movement does not scan all intermediate Hoppers every tick.
    if(labTick-a.lastMovement>=16 && labTick%8===0){
        if(labLineEmpty(b)){
            b.cleanTicks++;
            if(b.cleanTicks>=2){labFinish(b);return;}
        }else b.cleanTicks=0;
    }
}
function labProcessInputs(){
    if(!labCollectorKeys.length)return;
    // Each linked Collector is considered once per input cycle, round-robin.
    const keys=labCollectorKeys;
    for(let n=0;n<keys.length;n++){
        const key=keys[(n+labRR)%keys.length];
        const receiver=labLinkedReceiver(key);
        const bank=receiver?labBankForReceiver(receiver):undefined;
        if(!bank||bank.active||bank.recovery)continue;
        if(labTryCollector(bank,key))break;
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
                const b=labBanks[name];
                if(!b||!entry)continue;
                b.active={target:entry.target,reference:null,type:entry.type,
                    sent:entry.sent||0,moved:0,collector:entry.source,started:labTick,lastMovement:labTick};
                b.recovery=true;b.blocked='restart recovery: draining physical line to catch barrel';
            }
        }
        log(`0.2.0 addressed Hopper routing ready; ${labCollectorKeys.length} linked Collector configurations, recovery lanes=${Object.values(labBanks).filter(b=>b.recovery).length}`);
    }catch(err){log(`Routing startup state error: ${err}`);}
}
function labStats(source){
    const lines=[];
    for(const b of Object.values(labBanks)){
        const i=labBuildIndex(b);
        const a=b.active;
        lines.push(`${b.cfg.name}: ${i.total} sorters, indexed ${[...i.filters.values()].reduce((sum,v)=>sum+v.length,0)} FILTER + ${i.autos.length} AUTO + ${i.wildcards.length} WILDCARD; dispatched=${b.dispatched}, delivered=${b.confirmed}, catch estimate=${b.catches}, failed=${b.failed}, active=${a?a.type+' -> '+a.target.p.tapX+'/'+a.target.p.y+' ('+a.moved+'/'+a.sent+')':'no'}, recovery=${b.recovery}; ${b.blocked||'ready'}`);
    }
    for(const msg of lines){log(msg);try{source?.sendMessage('§7[Hart LAB] '+msg);}catch(_){}}
}
function labPlaceIfAir(d,p,id){
    const b=labGet(d,p);
    if(!b)return false;
    if(b.typeId===id)return true;
    if(b.typeId!=='minecraft:air')return false;
    try{b.setType(id);return b.typeId===id;}catch(_){return false;}
}
function labSetupIO(source){
    // Never overwrite built structures or source inventories. Setup is additive
    // except for two LEGACY EMPTY barrels that feed the hopper lanes by default.
    for(const b of Object.values(labBanks)){
        const c=b.cfg,d=c.dimension;
        if(labGet(d,{x:c.firstX,y:c.y,z:c.z})?.typeId!=='minecraft:hopper'){
            source?.sendMessage(`§c[Hart LAB] ${c.name}: conveyor is missing; run /function hartlab/build_layout first.`);return;
        }
        const legacy=labGet(d,c.legacy);
        if(legacy?.typeId==='minecraft:barrel'){
            const inv=labBlockInventory(legacy);
            if(!inv){source?.sendMessage('§c[Hart LAB] Cannot inspect old input barrel.');return;}
            for(let i=0;i<inv.size;i++)if(inv.getItem(i)){
                source?.sendMessage(`§c[Hart LAB] Empty the original input barrel at ${c.legacy.x},${c.legacy.y},${c.legacy.z} first; no blocks changed.`);return;
            }
        } else if(legacy?.typeId!=='minecraft:air'){
            source?.sendMessage(`§c[Hart LAB] Old input position obstructed in ${c.name}; no changes.`);return;
        }
        for(const spec of [[c.receiver,RECEIVER_ID],[c.collector,COLLECTOR_ID],[c.source,'minecraft:barrel']]){
            const old=labGet(d,spec[0]);
            if(!old || (old.typeId!=='minecraft:air'&&old.typeId!==spec[1])){
                source?.sendMessage(`§c[Hart LAB] ${c.name}: ${JSON.stringify(spec[0])} occupied. Nothing changed.`);return;
            }
        }
    }
    for(const b of Object.values(labBanks)){
        const c=b.cfg,d=c.dimension;
        if(labGet(d,c.legacy)?.typeId==='minecraft:barrel')labGet(d,c.legacy).setType('minecraft:air');
        if(!labPlaceIfAir(d,c.receiver,RECEIVER_ID)||!labPlaceIfAir(d,c.collector,COLLECTOR_ID)||
            !labPlaceIfAir(d,c.source,'minecraft:barrel')){
            source?.sendMessage('§c[Hart LAB] Partial setup; check content log and rerun after correcting obstruction.');return;
        }
        const ck=keyFor('c',d,c.collector),rk=keyFor('r',d,c.receiver);
        world.setDynamicProperty(ck,JSON.stringify({receiver:rk}));routingCollectorAdded(ck);
        b.blocked='';
    }
    log('Two LAB lanes installed; native source barrels and Collector-Receiver links enabled.');
    source?.sendMessage('§a[Hart LAB] Two routing lanes ready. Fill the NEW input barrels above Collectors; use /scriptevent hartlab:status to inspect.');
}
function labRoutingEvent(ev){
    const source=ev.sourceEntity;
    if(ev.id==='hartlab:setup_io')system.run(()=>{try{labSetupIO(source);}catch(err){log(`I/O setup: ${err}`);source?.sendMessage('§c[Hart LAB] Setup failed; inspect logs.');}});
    else if(ev.id==='hartlab:status')system.run(()=>labStats(source));
    else if(ev.id==='hartlab:refresh')system.run(()=>{invalidateRouting();labStats(source);});
}
system.afterEvents.scriptEventReceive.subscribe(labRoutingEvent);
system.run(labLoadState);
system.runInterval(()=>{
    labTick++;
    for(const b of Object.values(labBanks))if(b.active)labTickActive(b);
    if(labTick%8===0)labProcessInputs();
},1);
