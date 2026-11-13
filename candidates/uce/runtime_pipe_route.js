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
                } else if(supportedStorage(next)){
                    // Any approved vanilla inventory touching a pipe is a
                    // deliberate INPUT, at any elevation. A vertical bend
                    // must not reject a lower-bank source simply because
                    // its Receiver happens to sit higher. Final storage is
                    // still reachable only through a facing Sorter.
                    if(!ucePipeSameDimension(root,next))return undefined;
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
        if(!block||!supportedStorage(block)||
           !ucePipeSameDimension(root,block))return undefined;
        // Same original storage whitelist as the Sorter, but source
        // ownership remains deliberately narrower: only single 27-slot
        // inventories. Two aliases of a 54-slot double chest cannot be
        // extracted until cross-component input ownership is certified.
        // Never silently treat an aliased chest as an independent source.
        if(!uceDirectStorageOwnerBlock(block))return undefined;
        const container=blockContainer(block);
        if(!container?.isValid||container.size!==27)return undefined;
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
/*
 * Shared ordinary Bulk guard: a Collector-facing output can forward to a
 * later Filter bank, and an unknown high-priority output may still be usable.
 * Until the distributed route advertisement/writer exists, neither local
 * nor federated Bulk may claim the absence of a better destination.
 * This is READ ONLY: the same verified graph and original Sorter policy.
 */
function ucePipeHasUnresolvedForwarding(receiver,graph,item){
    try{
        if(!receiver||!graph||!Array.isArray(graph.entries)||
           !item?.typeId)return true;
        const root=receiverAt(receiver);
        if(!root)return true;
        for(const entry of graph.entries){
            const mode=sorterMode(entry);
            if(mode==='bypass'||(mode==='filter'&&
               (!entry.f||!matchesFilter(item,entry.f))))continue;
            if(!['filter','auto','wildcard'].includes(mode))continue;
            const b=sorterAt(entry);
            if(!b)return true;
            if(blockIsRedstonePowered(b))continue;
            const face=facingOffset(b),p=b.location;
            if(!face||!p)return true;
            const target=b.dimension.getBlock({
                x:p.x+face.x,y:p.y+face.y,z:p.z+face.z});
            if(!target)return true;
            if(target.typeId===COLLECTOR_ID){
                // Original Auto does not seed a Collector; Filter and
                // Wildcard may relay to a separate Receiver/bank.
                if(mode!=='auto'&&!blockIsRedstonePowered(target))
                    return true;
                continue;
            }
            if(supportedStorage(target)&&
               !uceReadOnlySorterDestination(entry,root))
                return true;
        }
        return false;
    }catch(_){return true;}
}
/*
 * Directed linked-bank discovery for ORDINARY Receiver balances.
 *
 * Each traversal edge is the original physical Sorter -> Collector ->
 * sealed Receiver linkage. It may traverse multiple intermediate banks,
 * but item ownership is atomically *attempted* only between the original
 * and final Receiver shards under the EXISTING globally fenced federated
 * journal. Intermediate banks are READ ONLY; no hidden queue or item copy.
 *
 * A destination MUST prove a physically accepting Filter. Auto/Wildcard
 * storage and local Bulk cannot masquerade as a global Filter. The first
 * eligible Collector per bank obeys the original priority and bottom-up
 * deterministic row ordering. Unknown/unloaded links, split graphs,
 * non-reciprocal native storage and cycles all HOLD without mutation.
 *
 * The upper bound comes from the registered Receiver census, NOT the
 * number of Sorters or a fixed system-wide hop limit. Revalidate the
 * complete chosen chain at BOTH original shard mutation boundaries.
 */
function uceSelectInterbankFilteredRoute(receiver,graph,item,authority){
    try{
        if(!receiver||!graph||!item?.typeId||!authority||
           !Array.isArray(graph.entries)||
           !Array.isArray(logistics.receivers)||
           !graph.receiverIds?.includes(receiver.id)||
           !receiverAt(receiver)||receiverOutputHopper(receiver)||
           blockIsRedstonePowered(receiverAt(receiver)))
            return undefined;
        const visited=new Set([receiver.id]),path=[];
        let current=receiver,network=graph;
        for(let hop=0;hop<logistics.receivers.length;hop++){
            if(!network||!Array.isArray(network.entries)||
               !network.receiverIds?.includes(current.id)||
               !receiverAt(current)||receiverOutputHopper(current)||
               blockIsRedstonePowered(receiverAt(current)))
                return undefined;
            // Matching native Filter takes priority at this bank. At the
            // source, it must be served locally. At any later bank it is
            // an authenticated final owner for the source count balance.
            const local=uceChoosePipeDestination(
                current,item,true,undefined,true);
            if(local?.priority===0){
                if(hop===0)return undefined;
                const first=path[0];
                const segments=path.map(edge=>{
                    const e=edge.entry;
                    return e.d+'|'+e.x+','+e.y+','+e.z+'>'+
                        edge.collector.id+'>'+edge.receiver.id;
                });
                const last=local.entry;
                const witness='IB1|'+receiver.id+'|'+segments.join('~')+
                    '|'+current.id+'|'+last.d+'|'+
                    last.x+','+last.y+','+last.z+'|'+local.ownerId;
                if(witness.length>8192||
                   /[^\x20-\x7e]/.test(witness))return undefined;
                return {...first,receiver:current,remote:local,
                    hops:path.length,witness};
            }
            const candidates=[];
            for(const entry of network.entries){
                const mode=sorterMode(entry);
                const priority=mode==='filter'&&entry.f&&
                    matchesFilter(item,entry.f)?0:
                    mode==='wildcard'?2:-1;
                if(priority<0)continue;
                const sorter=sorterAt(entry);
                if(!sorter)return undefined;
                if(blockIsRedstonePowered(sorter))continue;
                const face=facingOffset(sorter),p=sorter.location;
                if(!face||!p)return undefined;
                const block=sorter.dimension.getBlock({
                    x:p.x+face.x,y:p.y+face.y,z:p.z+face.z});
                if(!block)return undefined;
                // A remote Filter may not bypass an uncertain local Filter
                // that could still be the original priority winner.
                if(priority===0&&supportedStorage(block)&&
                   !uceReadOnlySorterDestination(
                       entry,receiverAt(current)))return undefined;
                if(block.typeId!==COLLECTOR_ID||
                   blockIsRedstonePowered(block))continue;
                const q=block.location;
                const id=logisticsId(
                    block.dimension.id,q.x,q.y,q.z);
                const collector=findCollectorById(id);
                if(!collector||collector.present===false||!collector.link)
                    return undefined;
                const live=collectorAt(collector);
                if(!uceSameLoadedBlock(block,live))return undefined;
                const next=findReceiverById(collector.link);
                if(!next||next.present===false||!receiverAt(next)||
                   !uceOrdinaryAccountSource(authority,next.id))
                    return undefined;
                candidates.push({entry,priority,collector,receiver:next});
            }
            candidates.sort((a,b)=>a.priority-b.priority||
                a.entry.y-b.entry.y||a.entry.x-b.entry.x||
                a.entry.z-b.entry.z);
            if(!candidates.length)return undefined;
            // Choosing any later or less-preferred branch when the first
            // link does not lead to a verified final Filter is unsafe.
            const selected=candidates[0];
            if(visited.has(selected.receiver.id))return undefined;
            visited.add(selected.receiver.id);
            path.push(selected);
            current=selected.receiver;
            network=ucePipeRouteNetwork(current);
        }
        return undefined;
    }catch(_){return undefined;}
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
    const candidates=[],unresolved=[];
    const routeOrder=(a,b)=>a.priority-b.priority ||
        a.entry.y-b.entry.y||a.entry.x-b.entry.x||
        a.entry.z-b.entry.z;
    for(const entry of graph.entries) {
        const mode=sorterMode(entry);
        if(mode==='bypass'||(mode==='filter'&&!entry.f))continue;
        const b=sorterAt(entry);
        if(b&&blockIsRedstonePowered(b))continue;
        const eligiblePriority=mode==='filter'&&
            matchesFilter(item,entry.f)?0:
            mode==='auto'?1:
            mode==='wildcard'&&!onlyPreferred?2:-1;
        if(eligiblePriority<0)continue;
        const dest=uceReadOnlySorterDestination(entry,root);
        if(!dest){
            const face=b&&facingOffset(b),p=b?.location;
            let target;
            try{
                if(face&&p)target=b.dimension.getBlock({
                    x:p.x+face.x,y:p.y+face.y,z:p.z+face.z});
            }catch(_){}
            // A matching Collector Sorter is a LIVE 1.4.1 forwarding
            // destination, but its UCE pipe→linked-Receiver transaction is
            // not implemented yet. Never silently skip it for Wildcard/Bulk
            // or an otherwise lower-priority local storage destination.
            // Unknown/unloaded or unverifiable native storage is equally
            // forbidden as proof that a stronger route is unavailable.
            if(!target||
               (target.typeId===COLLECTOR_ID&&mode!=='auto')||
               (target.typeId!==COLLECTOR_ID&&supportedStorage(target)))
                unresolved.push({entry,priority:eligiblePriority});
            continue;
        }
        if(graph.inputs.some(input=>
            uceSameLoadedBlock(input.block,dest.block))){
            unresolved.push({entry,priority:eligiblePriority});
            continue;
        }
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
    candidates.sort(routeOrder);
    unresolved.sort(routeOrder);
    const selected=candidates[0];
    // A priority-eligible unresolved Collector or unknown target that sorts
    // ahead of the chosen destination must HOLD. A verified local Filter may
    // still serve an item ahead of a lower-priority forwarding wildcard.
    if(unresolved.length&&(!selected||
       routeOrder(unresolved[0],selected)<=0))return undefined;
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
