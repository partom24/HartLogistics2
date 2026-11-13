/*
 * UCE Transporter/Sorter route reader. No custody writer, Q4 debit, dynamic
 * property setter, timer, block registration or native inventory mutation.
 *
 * Reuses PG26 face/neighbor/position API and the original Sorter filter/mode
 * registry. Rejects unloaded frontiers, unregistered Receiver attachments,
 * unsupported inventory sources, redstone-paused pipe segments and
 * double-chest or cross-network input aliases. Every destination is reselected
 * immediately before a native writer changes custody.
 */
// Traversal is allowed across LOADED chunks in one dimension; an
// unloaded frontier remains a graph-wide HOLD. This UCE reader does not
// enlarge PG26's unchanged legacy single-chunk Transporter implementation.
const UCE_MAX_LOADED_PIPES=128;
// A column fits within Bedrock's 384-block build height. Unlike the pipe
// budget, this counts Sorters vertically, never as additional pipes.
const UCE_MAX_SORTER_COLUMN_HEIGHT=384;
function ucePipeSameDimension(root,block) {
    return !!root&&!!block&&
        root.dimension.id===block.dimension.id;
}
function ucePipeRouteNetwork(receiver) {
    try{
        if(!receiver||receiver.present===false)return undefined;
        const root=receiverAt(receiver);
        // Receiver power gates EGRESS, not discovery of connected sources.
        // Collector and pipe-source admission may continue while powered.
        if(!root)return undefined;
        const pending=[],seen=new Map(),endpoints=new Map(),
            columnRuns=new Map(),banks=new Map(),inputs=new Map(),
            receiverIds=new Set([receiver.id]);
        for(const face of PG26_FACES) {
            const b=pg26Neighbor(root,face);
            if(!b)return undefined;
            if(b.typeId===PG26_PIPE_ID)pending.push(b);
        }
        if(!pending.length)return undefined;
        // Index registered Sorters once per discovery. A 128-segment pipe
        // could legitimately serve 1,000+ stacked Sorters; linear registry
        // scans for every row would grow quadratically with the layout.
        const registeredSorters=new Map(),duplicateSorters=new Set();
        for(const entry of registry){
            if(!entry||entry.d!==receiver.d)continue;
            const pos=pg26PositionKey(entry);
            if(registeredSorters.has(pos))duplicateSorters.add(pos);
            else registeredSorters.set(pos,entry);
        }
        const downFace=PG26_FACES.find(face=>face.name==='down');
        if(!downFace)return undefined;
        while(pending.length) {
            const pipe=pending.pop();
            const at=pg26PositionKey(pipe.location);
            if(seen.has(at))continue;
            if(!ucePipeSameDimension(root,pipe)||
               pipe.typeId!==PG26_PIPE_ID||
               blockIsRedstonePowered(pipe) ||
               seen.size>=UCE_MAX_LOADED_PIPES)return undefined;
            seen.set(at,pipe);
            for(const face of PG26_FACES) {
                const next=pg26Neighbor(pipe,face);
                if(!next)return undefined;
                const type=next.typeId,p=next.location;
                if(type===PG26_PIPE_ID){
                    if(!seen.has(pg26PositionKey(p)))pending.push(next);
                } else if(type===RECEIVER_ID){
                    // A shared network has ONE deterministic ingress owner.
                    // Every attached Receiver must be registered, physically
                    // loaded and anchored to this exact block. Unknown or
                    // stale attachment means graph-wide HOLD.
                    const id=logisticsId(next.dimension.id,p.x,p.y,p.z);
                    const other=findReceiverById(id);
                    const authority=uceAuthoritySnapshot();
                    if(!authority||
                       !uceOrdinaryAccountSource(authority,id)||
                       !other||other.present===false||
                       other.d!==next.dimension.id||
                       other.x!==p.x||other.y!==p.y||other.z!==p.z||
                       !receiverAt(other)||!ucePipeSameDimension(root,next))
                        return undefined;
                    receiverIds.add(id);
                } else if(type===SORTER_ID){
                    if(face.name!=='down'||!ucePipeSameDimension(root,next))
                        return undefined;
                    // A Transporter feeds the entire original 1.4.1
                    // vertical Sorter column, not just its top Sorter.
                    // Each row keeps its own Filter/Auto/Wildcard/redstone
                    // policy. Unknown or unregistered lower rows HOLD the
                    // graph; they must not be skipped for a weaker output.
                    let sorter=next,complete=false,rowCount=0;
                    for(let depth=0;depth<UCE_MAX_SORTER_COLUMN_HEIGHT;depth++){
                        const q=sorter.location;
                        const rowKey=pg26PositionKey(q);
                        if(duplicateSorters.has(rowKey))return undefined;
                        const entry=registeredSorters.get(rowKey);
                        const live=entry&&sorterAt(entry);
                        if(!entry||!live||live.typeId!==SORTER_ID||
                           !ucePipeSameDimension(root,live)||
                           !uceSameLoadedBlock(sorter,live)||
                           entry.nativeQuarantine)return undefined;
                        endpoints.set(pg26PositionKey(q),entry);
                        rowCount++;
                        const below=pg26Neighbor(sorter,downFace);
                        if(!below)return undefined;
                        if(below.typeId!==SORTER_ID){complete=true;break;}
                        if(!ucePipeSameDimension(root,below))return undefined;
                        sorter=below;
                    }
                    if(!complete)return undefined;
                    // Contiguous verified columns have no gaps. Their top
                    // coordinate + row count uniquely identifies every row,
                    // avoiding oversized per-Sorter federated route witnesses.
                    columnRuns.set(pg26PositionKey(p),rowCount);
                } else if(type==='hartlogistics:bulk_storage'){
                    if(!ucePipeSameDimension(root,next))return undefined;
                    banks.set(pg26PositionKey(p),next);
                } else if(type==='minecraft:chest'||
                          type==='minecraft:barrel'){
                    // As in PG26, a vanilla container touching the pipe at
                    // or above its input level is a SOURCE, never an output.
                    // Destination containers are exclusively behind Sorters.
                    if(p.y<root.location.y||
                       !ucePipeSameDimension(root,next))return undefined;
                    const source=uceReadOnlyPipeInput(next,root);
                    if(!source)return undefined;
                    inputs.set(pg26PositionKey(p),source);
                } else if(type===COLLECTOR_ID ||
                          next.getComponent('minecraft:inventory')?.container){
                    // No unverified foreign inventory may claim pipe custody.
                    return undefined;
                }
            }
        }
        if(!endpoints.size&&!banks.size&&!inputs.size)return undefined;
        // A Bulk block touching TWO disconnected pipe graphs would create
        // ambiguous bank ownership. Only one connected loaded component
        // can authorize its registration.
        for(const bank of banks.values()){
            for(const face of PG26_FACES){
                const neighbor=pg26Neighbor(bank,face);
                if(!neighbor)return undefined;
                if(neighbor.typeId===PG26_PIPE_ID &&
                   !seen.has(pg26PositionKey(neighbor.location)))
                    return undefined;
            }
        }
        // One physical chest may touch multiple pipes in the SAME graph.
        // A different disconnected pipe component cannot also own it.
        for(const source of inputs.values()){
            for(const face of PG26_FACES){
                const neighbor=pg26Neighbor(source.block,face);
                if(!neighbor)return undefined;
                if(neighbor.typeId===PG26_PIPE_ID&&
                   !seen.has(pg26PositionKey(neighbor.location)))
                    return undefined;
            }
        }
        const sortedPipes=[...seen.keys()].sort();
        const sortedColumns=[...columnRuns.entries()]
            .sort((a,b)=>a[0].localeCompare(b[0]))
            .map(([top,count])=>top+'x'+count);
        const sortedInputs=[...inputs.keys()].sort().map(
            key=>key+':'+inputs.get(key).typeId);
        const sortedBanks=[...banks.keys()].sort();
        const sortedReceivers=[...receiverIds].sort();
        return {receiverId:receiver.id,
            receiverIds:sortedReceivers,leaderId:sortedReceivers[0],
            fingerprint:sortedReceivers.join(';')+'|'+sortedPipes.join(';')+
              '->'+sortedColumns.join(';')+
              '<-'+sortedInputs.join(';')+
              '#'+sortedBanks.join(';'),
            entries:[...endpoints.values()],
            banks:[...banks.values()],
            inputs:[...inputs.values()].sort((a,b)=>
                pg26PositionKey(a.block.location).localeCompare(
                  pg26PositionKey(b.block.location)))};
    }catch(_){return undefined;}
}
function uceReadOnlyPipeInput(block,root){
    try{
        if(!block||!['minecraft:chest','minecraft:barrel']
            .includes(block.typeId)||!ucePipeSameDimension(root,block)||
           block.location.y<root.location.y)return undefined;
        // A double chest may expose the same mutable 54-slot inventory
        // through two block wrappers. Until native alias identity is
        // established, refuse the entire affected graph.
        if(block.typeId==='minecraft:chest'){
            for(const side of PG26_FACES){
                if(side.y!==0)continue;
                const neighbor=pg26Neighbor(block,side);
                if(!neighbor||neighbor.typeId==='minecraft:chest')
                    return undefined;
            }
        }
        const container=block.getComponent('minecraft:inventory')?.container;
        if(!container||!container.isValid||container.size!==27)
            return undefined;
        return {block,container,typeId:block.typeId};
    }catch(_){return undefined;}
}
function ucePipeSourceStillConnected(receiver,source){
    if(!source||!source.block)return false;
    const graph=ucePipeRouteNetwork(receiver);
    return !!graph&&graph.leaderId===receiver.id&&
        typeof source.typeId==='string'&&
        graph.inputs.some(input=>
          input.typeId===source.typeId&&
          uceSameLoadedBlock(input.block,source.block))&&
        source.container?.isValid===true;
}
function uceReadOnlySorterDestination(entry,root) {
    try{
        const b=sorterAt(entry),face=facingOffset(b);
        if(!b||!face||blockIsRedstonePowered(b))return undefined;
        const at=b.location;
        const dest=b.dimension.getBlock({
            x:at.x+face.x,y:at.y+face.y,z:at.z+face.z});
        // Exactly the original 1.4.1 supported-storage set. The existing
        // native owner proof checks both halves of a double chest (54 slots),
        // and the single-chest shape (27 slots), without copying ItemStacks.
        // Reuse it for pipe output rather than creating a second rule set.
        if(!dest||!ucePipeSameDimension(root,dest)||
           !supportedStorage(dest)||!uceDirectStorageOwnerBlock(dest))
            return undefined;
        const c=blockContainer(dest);
        if(!c?.isValid)return undefined;
        if(dest.typeId!=='minecraft:chest'&&
           dest.typeId!=='minecraft:trapped_chest'&&c.size!==27)
            return undefined;
        return {block:dest,container:c};
    }catch(_){return undefined;}
}
// Distinct halves of one verified double chest represent ONE inventory
// owner. Never allocate two independent custody identities for the aliases.
function ucePipeStorageOwnerId(block){
    try{
        if(!block||!uceDirectStorageOwnerBlock(block))return undefined;
        let at=pg26PositionKey(block.location);
        if(block.typeId==='minecraft:chest'||
           block.typeId==='minecraft:trapped_chest'){
            const c=blockContainer(block);
            if(c.size===54){
                const halves=[];
                for(const face of PG26_FACES){
                    if(face.y!==0)continue;
                    const other=pg26Neighbor(block,face);
                    if(!other)return undefined;
                    if(other.typeId===block.typeId)
                        halves.push(other);
                }
                if(halves.length!==1||
                   !uceDirectStorageOwnerBlock(halves[0]))return undefined;
                const mate=pg26PositionKey(halves[0].location);
                if(mate<at)at=mate;
            }
        }
        return block.dimension.id+'|'+block.typeId+'|'+at;
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
function uceChoosePipeDestination(receiver,item,onlyPreferred=false,
                                  settledDestination=undefined,
                                  allowPlainMerge=false) {
    // The old Receiver output Hopper retains first claim to physical egress.
    // Bulk account discovery on the SAME graph may still occur, because
    // moving virtual balances is not a second physical output writer.
    if(!item||!item.typeId||receiverOutputHopper(receiver)||
       blockIsRedstonePowered(receiverAt(receiver)))
        return undefined;
    const graph=ucePipeRouteNetwork(receiver),root=receiverAt(receiver);
    if(!graph||!root)return undefined;
    const candidates=[];
    for(const entry of graph.entries) {
        const mode=sorterMode(entry);
        if(mode==='bypass'||(mode==='filter'&&!entry.f))continue;
        const dest=uceReadOnlySorterDestination(entry,root);
        if(!dest||graph.inputs.some(input=>
            uceSameLoadedBlock(input.block,dest.block)))continue;
        // Ordinary account withdrawals may use a matching partially filled
        // native slot. This is NOT a second writer: the ledger boundary uses
        // the existing journaled certified partial port. Metadata-rich
        // stacks continue to require an empty destination slot.
        let empty=ucePipeEmptySlot(dest.container);
        let partialOutput=false,beforeAmount=0,room=undefined;
        if(allowPlainMerge){
            const accepting=findAcceptSlot(dest.container,item);
            if(accepting&&Number.isSafeInteger(accepting.slot)&&
               accepting.slot>=0&&accepting.slot<dest.container.size){
                if(accepting.before>0&&accepting.room>0){
                    const sample=dest.container.getItem(accepting.slot);
                    let identical=false;
                    try{
                        identical=!!sample&&sample.amount===accepting.before&&
                            sample.isStackableWith(item)===true&&
                            item.isStackableWith(sample)===true&&
                            sample.maxAmount===item.maxAmount;
                    }catch(_){}
                    if(identical){
                        empty=accepting.slot;partialOutput=true;
                        beforeAmount=sample.amount;room=accepting.room;
                    }
                }else if(accepting.before===0){
                    empty=accepting.slot;
                }
            }
        }
        // Native ACK may observe a slot already filled by THIS exact
        // committed move; preserve the selected route for that one ACK.
        if(settledDestination?.entry===entry &&
           uceSameLoadedBlock(dest.block,settledDestination.dest?.block) &&
           Number.isSafeInteger(settledDestination.slot) &&
           settledDestination.slot>=0 &&
           settledDestination.slot<dest.container.size &&
           dest.container.getItem(settledDestination.slot)!==undefined){
            empty=settledDestination.slot;
            partialOutput=settledDestination.partialOutput===true;
            beforeAmount=settledDestination.beforeAmount||0;
            room=settledDestination.room;
        }
        if(empty<0)continue;
        let priority=-1;
        if(mode==='filter'&&matchesFilter(item,entry.f))priority=0;
        if(mode==='auto'&&ucePipeAutoSeed(item,dest.container))
            priority=1;
        if(mode==='wildcard'&&!onlyPreferred)priority=2;
        if(priority<0)continue;
        candidates.push({entry,mode,dest,slot:empty,priority,
            partialOutput,beforeAmount,room,allowPlainMerge});
    }
    candidates.sort((a,b)=>a.priority-b.priority ||
        a.entry.y-b.entry.y||a.entry.x-b.entry.x||
        a.entry.z-b.entry.z);
    const selected=candidates[0];
    if(!selected)return undefined;
    const destId=ucePipeStorageOwnerId(selected.dest.block);
    if(!destId)return undefined;
    const routeId=graph.fingerprint+'#'+selected.entry.d+'|'+
        selected.entry.x+','+selected.entry.y+','+selected.entry.z+
        '#'+selected.mode+'#'+destId;
    return {...selected,routeId,onlyPreferred,
        ownerId:'uce-pipe-output|'+destId};
}
function ucePipeDestinationStillValid(receiver,item,admitted,postMove=false) {
    if(!admitted)return false;
    const current=uceChoosePipeDestination(receiver,item,
        admitted.onlyPreferred===true,postMove===true?admitted:undefined,
        admitted.allowPlainMerge===true);
    return !!current&&current.routeId===admitted.routeId &&
        current.slot===admitted.slot;
}

/*
 * Read-only legacy Hopper->Sorter->Collector route admission for UCE.
 * The original sorter column is the routing authority: exact Filter,
 * destination-seeded Auto, then Wildcard, bottom-to-top within priority.
 * No old Q4 queue writer or auto-registration via destinationFor() is used.
 * A storage Sorter that would win still wins the selection (the UCE storage
 * executor must handle it); an unavailable higher-priority target HOLDS.
 */
function uceSorterColumnWinner(column,item,settledSelection=undefined){
    try{
        if(!column||!item||!Array.isArray(column.sorters))
            return undefined;
        const dim=getDimension(column.d);
        if(!dim)return undefined;
        const source=dim.getBlock(column.source);
        if(!source||source.typeId!=='minecraft:hopper'||
           hopperIsRedstoneLocked(source))return undefined;
        const container=blockContainer(source);
        if(!container||!container.isValid)return undefined;
        const eligible=[];
        for(const entry of column.sorters){
            const b=sorterAt(entry);
            if(!b||entry.nativeQuarantine||blockIsRedstonePowered(b))
                continue;
            const mode=sorterMode(entry);
            if(mode==='bypass'||(mode==='filter'&&
                (!entry.f||!matchesFilter(item,entry.f))))continue;
            const priority=mode==='filter'?0:
                mode==='auto'?1:mode==='wildcard'?2:-1;
            if(priority<0)continue;
            const face=facingOffset(b);
            if(!face)return undefined;
            const p=b.location;
            const target=b.dimension.getBlock({
                x:p.x+face.x,y:p.y+face.y,z:p.z+face.z});
            // Unknown loaded state cannot permit a fallback to skip a
            // possibly higher priority destination.
            if(!target)return undefined;
            if(target.typeId===COLLECTOR_ID){
                if(mode==='auto')continue;
                const q=target.location;
                const id=logisticsId(target.dimension.id,q.x,q.y,q.z);
                const collector=findCollectorById(id);
                if(!collector||collector.present===false||
                   collector.link===null||!collector.link||
                   !collectorAt(collector)||
                   blockIsRedstonePowered(target))continue;
                const receiver=findReceiverById(collector.link);
                const authority=uceAuthoritySnapshot();
                if(!receiver||receiver.present===false||
                   !receiverAt(receiver)||!authority||
                   !uceOrdinaryAccountSource(authority,receiver.id))
                    continue;
                eligible.push({entry,priority,kind:'collector',
                    collector,receiver});
            }else if(supportedStorage(target)){
                const dest=blockContainer(target);
                if(!dest||!dest.isValid)return undefined;
                // autoSorterMatches calls the old destinationFor() ONLY for
                // verified storage, where it never registers a Collector.
                if(mode==='auto'&&!autoSorterMatches(item,entry))
                    continue;
                // ACK retains the exact pre-move selection even when the
                // completed move filled its last free slot.
                if(!findAcceptSlot(dest,item) &&
                   !(settledSelection?.entry===entry &&
                     uceSameLoadedBlock(settledSelection.block,target)))
                    continue;
                eligible.push({entry,priority,kind:'storage',
                    block:target,container:dest});
            }
        }
        eligible.sort((a,b)=>a.priority-b.priority||
            a.entry.y-b.entry.y||a.entry.x-b.entry.x||
            a.entry.z-b.entry.z);
        const winner=eligible[0];
        return winner?{...winner,source:{block:source,container}}:
            undefined;
    }catch(_){return undefined;}
}
function uceSorterCollectorSources(receiver){
    if(!receiver||!Array.isArray(columns))return [];
    const records=[],seen=new Set();
    for(const col of columns){
        let touches=false;
        try{
            for(const entry of col.sorters){
                const sorter=sorterAt(entry),face=facingOffset(sorter);
                if(!sorter||!face)continue;
                const p=sorter.location;
                const target=sorter.dimension.getBlock({
                    x:p.x+face.x,y:p.y+face.y,z:p.z+face.z});
                if(!target||target.typeId!==COLLECTOR_ID)continue;
                const q=target.location;
                const collector=findCollectorById(
                    logisticsId(target.dimension.id,q.x,q.y,q.z));
                if(collector?.link===receiver.id){touches=true;break;}
            }
            if(!touches)continue;
            const dim=getDimension(col.d),source=dim?.getBlock(col.source);
            if(!source||source.typeId!=='minecraft:hopper'||
               hopperIsRedstoneLocked(source))continue;
            const container=blockContainer(source);
            if(!container||!container.isValid)continue;
            const p=source.location;
            const key=source.dimension.id+'|'+p.x+','+p.y+','+p.z;
            if(seen.has(key))continue;
            seen.add(key);
            records.push({kind:'sorter-collector',block:source,container,
                locked:false,
                stillSelected:item=>{
                    try{
                        const selected=uceSorterColumnWinner(col,item);
                        return !!selected&&selected.kind==='collector'&&
                           selected.receiver.id===receiver.id&&
                           uceSameLoadedBlock(selected.source.block,source);
                    }catch(_){return false;}
                },
                eligibleSlot:(slot,item)=>{
                    try{
                        if(!Number.isSafeInteger(slot)||slot<0||
                           slot>=container.size||!item||
                           container.getItem(slot)===undefined)
                            return false;
                        const selected=uceSorterColumnWinner(col,item);
                        return !!selected&&selected.kind==='collector'&&
                           selected.receiver.id===receiver.id&&
                           uceSameLoadedBlock(selected.source.block,source);
                    }catch(_){return false;}
                }});
        }catch(_){continue;}
    }
    return records.sort((a,b)=>{
        const p=a.block.location,q=b.block.location;
        return p.y-q.y||p.x-q.x||p.z-q.z;
    });
}

/**
 * Source-selection check across PREPARED -> MOVED -> ACK. Before the native
 * move, route/filter/metadata classification must apply to the ACTUAL slot
 * being moved, not an earlier cached stack. After the move, the source slot
 * is legitimately empty; the ticketed destination and native journal prove
 * exact movement, while this function still checks stable route ownership.
 */
function uceSorterSourceStillValid(source,ref,witness,identify){
    try{
        if(!source||!ref||ref.container!==source.container||
           !Number.isSafeInteger(ref.slot)||ref.slot<0||
           ref.slot>=source.container.size||
           typeof identify!=='function'||!witness)return false;
        const current=source.container.getItem(ref.slot);
        if(current===undefined)return source.stillSelected(witness)===true;
        return identify(current)==='MR'&&
            source.eligibleSlot(ref.slot,current)===true;
    }catch(_){return false;}
}
