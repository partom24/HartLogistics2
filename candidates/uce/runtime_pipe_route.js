/*
 * UCE Transporter/Sorter route reader. No custody writer, Q4 debit, dynamic
 * property setter, timer, block registration or native inventory mutation.
 *
 * Reuses PG26 face/neighbor/position API and the original Sorter filter/mode
 * registry. Rejects unloaded frontiers, ambiguous Receiver attachments,
 * extra container sources, cross-chunk routes, redstone-paused segments and
 * double-chest inventory aliases. Every physical destination is reselected
 * immediately before a native writer changes custody.
 */
function ucePipeSameChunk(root,block) {
    if(!root||!block||root.dimension.id!==block.dimension.id)
        return false;
    const a=root.location,b=block.location;
    return Math.floor(a.x/16)===Math.floor(b.x/16)&&
        Math.floor(a.z/16)===Math.floor(b.z/16);
}
function ucePipeRouteNetwork(receiver) {
    try{
        if(!receiver||receiver.present===false||
           receiverOutputHopper(receiver))return undefined;
        const root=receiverAt(receiver);
        if(!root||blockIsRedstonePowered(root))return undefined;
        const rootKey=pg26PositionKey(root.location);
        const pending=[],seen=new Map(),endpoints=new Map();
        for(const face of PG26_FACES) {
            const b=pg26Neighbor(root,face);
            if(!b)return undefined;
            if(b.typeId===PG26_PIPE_ID)pending.push(b);
        }
        if(!pending.length)return undefined;
        while(pending.length) {
            const pipe=pending.pop();
            const at=pg26PositionKey(pipe.location);
            if(seen.has(at))continue;
            if(!ucePipeSameChunk(root,pipe)||
               pipe.location.y<root.location.y ||
               pipe.typeId!==PG26_PIPE_ID||
               blockIsRedstonePowered(pipe) ||
               seen.size>=PG26_MAX_PIPES)return undefined;
            seen.set(at,pipe);
            for(const face of PG26_FACES) {
                const next=pg26Neighbor(pipe,face);
                if(!next)return undefined;
                const type=next.typeId,p=next.location;
                if(type===PG26_PIPE_ID){
                    if(!seen.has(pg26PositionKey(p)))pending.push(next);
                } else if(type===RECEIVER_ID){
                    // Exactly the one already-registered Receiver may supply
                    // this graph. An unregistered or second Receiver is HOLD.
                    if(pg26PositionKey(p)!==rootKey||
                       next.dimension.id!==receiver.d)return undefined;
                } else if(type===SORTER_ID){
                    if(face.name!=='down'||!ucePipeSameChunk(root,next)||
                       blockIsRedstonePowered(next))return undefined;
                    const entry=registry.find(e=>e.d===receiver.d&&
                        e.x===p.x&&e.y===p.y&&e.z===p.z);
                    const live=entry&&sorterAt(entry);
                    if(!entry||!live||live.typeId!==SORTER_ID||
                       entry.nativeQuarantine)return undefined;
                    endpoints.set(pg26PositionKey(p),entry);
                } else if(type===COLLECTOR_ID ||
                          type==='hartlogistics:bulk_storage' ||
                          next.getComponent('minecraft:inventory')?.container){
                    // No silent ingress through an unrelated inventory
                    // touching a pipe, including a not-yet-wired Bulk bank.
                    return undefined;
                }
            }
        }
        if(!endpoints.size)return undefined;
        const sortedPipes=[...seen.keys()].sort();
        const sortedOutputs=[...endpoints.keys()].sort();
        return {receiverId:receiver.id,
            fingerprint:receiver.id+'|'+sortedPipes.join(';')+
              '->'+sortedOutputs.join(';'),
            entries:[...endpoints.values()]};
    }catch(_){return undefined;}
}
function uceReadOnlySorterDestination(entry,root) {
    try{
        const b=sorterAt(entry),face=facingOffset(b);
        if(!b||!face||blockIsRedstonePowered(b))return undefined;
        const at=b.location;
        const dest=b.dimension.getBlock({
            x:at.x+face.x,y:at.y+face.y,z:at.z+face.z});
        if(!dest||!ucePipeSameChunk(root,dest) ||
           !['minecraft:chest','minecraft:barrel'].includes(dest.typeId))
            return undefined;
        if(dest.typeId==='minecraft:chest'){
            for(const side of PG26_FACES) {
                if(side.y!==0)continue;
                const near=pg26Neighbor(dest,side);
                if(!near||near.typeId==='minecraft:chest')
                    return undefined;
            }
        }
        const c=dest.getComponent('minecraft:inventory')?.container;
        if(!c||!c.isValid||c.size!==27)return undefined;
        return {block:dest,container:c};
    }catch(_){return undefined;}
}
function ucePipeEmptySlot(container) {
    try{
        for(let i=0;i<container.size;i++)
            if(container.getItem(i)===undefined)return i;
    }catch(_){}
    return -1;
}
function ucePipeAutoSeed(item,container) {
    try{
        const requested=item.typeId==='minecraft:enchanted_book' ?
            enchantments(item).map(e=>e.id).sort().join('|') : undefined;
        for(let i=0;i<container.size;i++) {
            const s=container.getItem(i);
            if(!s||s.typeId!==item.typeId)continue;
            if(requested!==undefined &&
               enchantments(s).map(e=>e.id).sort().join('|')!==requested)
                continue;
            return true;
        }
    }catch(_){}
    return false;
}
function uceChoosePipeDestination(receiver,item) {
    if(!item||!item.typeId)return undefined;
    const graph=ucePipeRouteNetwork(receiver),root=receiverAt(receiver);
    if(!graph||!root)return undefined;
    const candidates=[];
    for(const entry of graph.entries) {
        const mode=sorterMode(entry);
        if(mode==='bypass'||(mode==='filter'&&!entry.f))continue;
        const dest=uceReadOnlySorterDestination(entry,root);
        if(!dest)continue;
        const empty=ucePipeEmptySlot(dest.container);
        if(empty<0)continue;
        let priority=-1;
        if(mode==='filter'&&matchesFilter(item,entry.f))priority=0;
        if(mode==='auto'&&ucePipeAutoSeed(item,dest.container))
            priority=1;
        if(mode==='wildcard')priority=2;
        if(priority<0)continue;
        candidates.push({entry,mode,dest,slot:empty,priority});
    }
    candidates.sort((a,b)=>a.priority-b.priority ||
        a.entry.y-b.entry.y||a.entry.x-b.entry.x||
        a.entry.z-b.entry.z);
    const selected=candidates[0];
    if(!selected)return undefined;
    const destId=selected.dest.block.dimension.id+'|'+
        pg26PositionKey(selected.dest.block.location);
    const routeId=graph.fingerprint+'#'+selected.entry.d+'|'+
        selected.entry.x+','+selected.entry.y+','+selected.entry.z+
        '#'+selected.mode+'#'+destId;
    return {...selected,routeId,
        ownerId:'uce-pipe-output|'+destId};
}
function ucePipeDestinationStillValid(receiver,item,admitted) {
    const current=uceChoosePipeDestination(receiver,item);
    return !!current&&current.routeId===admitted.routeId &&
        current.slot===admitted.slot;
}
