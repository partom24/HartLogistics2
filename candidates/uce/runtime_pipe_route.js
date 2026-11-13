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
/*
 * Source-only cache for the ORIGINAL Sorter registry's position index.
 *
 * A 1,400-Sorter world with dozens of independent bank segments previously
 * rebuilt the ENTIRE registry map on every graph traversal/revalidation,
 * including each link in a multi-bank path. Reuse that immutable coordinate
 * index only within ONE Bedrock server tick and only after the established
 * topology-dirty flag is clear. Entries are referenced (not copied), so
 * live Filter/mode/redstone checks still inspect their current values.
 *
 * No pipe graph, inventory, neighbor, link or native destination is cached:
 * each custody operation revalidates physical topology and item capacity.
 * Unknown tick authority or any pending Sorter topology rebuild disables
 * the optimization completely.
 */
let ucePipeSorterIndexCache;
function ucePipeSorterRegistryIndex(){
    let tick;
    try{tick=system.currentTick;}catch(_){}
    const safeTick=Number.isSafeInteger(tick)&&tick>=0&&
        typeof dirty!=='undefined'&&dirty===false;
    if(safeTick&&ucePipeSorterIndexCache&&
       ucePipeSorterIndexCache.tick===tick&&
       ucePipeSorterIndexCache.owner===registry&&
       ucePipeSorterIndexCache.length===registry.length)
        return ucePipeSorterIndexCache.index;
    const positions=new Map(),duplicates=new Map();
    for(const entry of registry){
        if(!entry||typeof entry.d!=='string')continue;
        let members=positions.get(entry.d);
        if(!members){
            members=new Map();
            positions.set(entry.d,members);
        }
        const key=pg26PositionKey(entry);
        if(members.has(key)){
            let dupe=duplicates.get(entry.d);
            if(!dupe){dupe=new Set();duplicates.set(entry.d,dupe);}
            dupe.add(key);
        }else members.set(key,entry);
    }
    const index={positions,duplicates};
    ucePipeSorterIndexCache=safeTick?{
        tick,owner:registry,length:registry.length,index}:undefined;
    return index;
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
        // One original registry index per server tick, regardless of
        // how many independently verified linked banks need it.
        const sorterIndex=ucePipeSorterRegistryIndex();
        const registeredSorters=sorterIndex.positions.get(receiver.d)||
            new Map();
        const duplicateSorters=sorterIndex.duplicates.get(receiver.d)||
            new Set();
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
                    // Two Bedrock 54-slot double-chest halves are ONE
                    // physical inventory owner. Preserve a single canonical
                    // source and never debit both aliases independently.
                    const prior=inputs.get(source.ownerId);
                    if(prior&&!uceSameLoadedBlock(
                        prior.block,source.block))return undefined;
                    inputs.set(source.ownerId,source);
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
            // Check ALL aliases of a verified 54-slot double chest. Another
            // disconnected pipe touching its far half must not withdraw
            // through a second source identity or bypass the owner leader.
            for(const alias of source.aliases){
                for(const face of PG26_FACES){
                    const neighbor=pg26Neighbor(alias,face);
                    if(!neighbor)return undefined;
                    if(neighbor.typeId===PG26_PIPE_ID&&
                       !seen.has(pg26PositionKey(neighbor.location)))
                        return undefined;
                }
            }
        }
        const sortedPipes=[...seen.keys()].sort();
        const sortedColumns=[...columnRuns.entries()]
            .sort((a,b)=>a[0].localeCompare(b[0]))
            .map(([top,count])=>top+'x'+count);
        const sortedInputs=[...inputs.keys()].sort().map(key=>{
            const source=inputs.get(key);
            // A 27-slot single chest and its 54-slot double counterpart
            // can share the canonical coordinate and owner type, but MUST
            // never share one accepted graph/transaction witness.
            return key+':'+source.typeId+':'+source.container.size+
                'x'+source.aliases.length;
        });
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
        // The already certified output owner proof checks the reciprocal
        // Bedrock double chest and 54-slot view from BOTH live halves.
        // Use that SAME physical identity for input instead of treating
        // the two block faces as independent mutable inventories.
        if(!uceDirectStorageOwnerBlock(block))return undefined;
        const original=blockContainer(block);
        if(!original?.isValid)return undefined;
        const ownerId=ucePipeStorageOwnerId(block);
        if(!ownerId)return undefined;
        let canonical=block,aliases=[block],container=original;
        if(original.size===54){
            if(block.typeId!=='minecraft:chest'&&
               block.typeId!=='minecraft:trapped_chest')
                return undefined;
            const companions=[];
            for(const face of PG26_FACES){
                if(face.y!==0)continue;
                const other=pg26Neighbor(block,face);
                if(!other)return undefined;
                if(other.typeId===block.typeId)
                    companions.push(other);
            }
            if(companions.length!==1)return undefined;
            const mate=companions[0];
            if(ucePipeStorageOwnerId(mate)!==ownerId)return undefined;
            aliases=[block,mate];
            if(pg26PositionKey(mate.location)<
               pg26PositionKey(block.location)){
                canonical=mate;
                container=blockContainer(mate);
            }
            if(!container?.isValid||container.size!==54)
                return undefined;
        }else if(original.size!==27)return undefined;
        return {block:canonical,container,typeId:block.typeId,
            ownerId,aliases};
    }catch(_){return undefined;}
}
function ucePipeSourceStillConnected(receiver,source){
    if(!source||!source.block)return false;
    const graph=ucePipeRouteNetwork(receiver);
    return !!graph&&graph.leaderId===receiver.id&&
        typeof source.typeId==='string'&&
        typeof source.ownerId==='string'&&
        graph.inputs.some(input=>
          input.ownerId===source.ownerId&&
          input.typeId===source.typeId&&
          input.container?.size===source.container?.size&&
          input.aliases?.length===source.aliases?.length&&
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
 * A verified negative routing proof for ORDINARY Bulk placement.
 *
 * An existing directed Collector link is not automatically an accepting
 * Filter. This read-only census follows all reachable, loaded, sealed
 * Receiver banks, with cycle-safe deduplication and the ORIGINAL Sorter
 * filter/seeded-Auto/redstone semantics. Return true ONLY when every
 * reachable preferred native output is provably unavailable (including
 * legitimately FULL verified containers). Missing chunks, unknown links,
 * unreadable inventories and a legacy output Hopper return false/HOLD.
 *
 * This is NOT an authorization for Wildcard: capacity in remote controller
 * regions has not yet been verified globally. It may authorize a later
 * separately fenced Receiver→LOCAL-Bulk transfer only.
 */
function uceVerifiedNoReachablePreferredOutput(receiver,item,authority,
                                            justVerifiedGraph=undefined,
                                            inspectedGraphs=undefined,
                                            filtersOnly=false){
    try{
        if(!receiver||!item?.typeId||!authority||
           !Array.isArray(logistics.receivers))return false;
        const seen=new Set(),pending=[receiver];
        while(pending.length){
            const current=pending.pop();
            if(!current||current.present===false||
               !uceOrdinaryAccountSource(authority,current.id))
                return false;
            if(seen.has(current.id))continue;
            if(seen.size>=logistics.receivers.length)return false;
            seen.add(current.id);
            const root=receiverAt(current);
            if(!root||receiverOutputHopper(current))return false;
            // Only the SAME synchronous decision may reuse topology
            // already inspected for its source Receiver. Mutating writers
            // always start a new verification pass at each shard boundary.
            const graph=justVerifiedGraph&&current.id===receiver.id?
                justVerifiedGraph:ucePipeRouteNetwork(current);
            if(!graph||graph.receiverId!==current.id||
               !graph.receiverIds?.includes(current.id)||
               !Array.isArray(graph.entries))return false;
            if(inspectedGraphs)inspectedGraphs.set(current.id,graph);
            for(const entry of graph.entries){
                const mode=sorterMode(entry);
                if(mode==='bypass'||!['filter','auto','wildcard']
                    .includes(mode))continue;
                // Only a reachable Filter can outrank a VERIFIED seeded
                // local Auto. Do not let an unrelated remote Auto prevent
                // original 1.4.1 local Auto delivery after filter lookahead.
                if(filtersOnly&&mode==='auto')continue;
                const matching=mode==='filter'&&entry.f&&
                    matchesFilter(item,entry.f);
                if(mode==='filter'&&!matching)continue;
                const sorter=sorterAt(entry);
                if(!sorter)return false;
                if(blockIsRedstonePowered(sorter))continue;
                const face=facingOffset(sorter),p=sorter.location;
                if(!face||!p)return false;
                const target=sorter.dimension.getBlock({
                    x:p.x+face.x,y:p.y+face.y,z:p.z+face.z});
                if(!target)return false;
                if(target.typeId===COLLECTOR_ID){
                    if(mode==='auto'||blockIsRedstonePowered(target))
                        continue;
                    const q=target.location,collector=findCollectorById(
                        logisticsId(target.dimension.id,q.x,q.y,q.z));
                    const live=collector&&collectorAt(collector);
                    const next=collector&&findReceiverById(collector.link);
                    if(!collector||collector.present===false||
                       !collector.link||!uceSameLoadedBlock(target,live)||
                       !next||next.present===false||!receiverAt(next)||
                       !uceOrdinaryAccountSource(authority,next.id))
                        return false;
                    if(!seen.has(next.id))pending.push(next);
                    continue;
                }
                if(!supportedStorage(target))continue;
                const dest=uceReadOnlySorterDestination(entry,root);
                if(!dest)return false;
                // Local/remote native preferred output has priority over
                // any ordinary count move into Bulk. A full but VERIFIED
                // container is known to be unavailable, not an unknown.
                if((matching||(!filtersOnly&&mode==='auto'&&
                    ucePipeAutoSeed(item,dest.container)))&&
                   findAcceptSlot(dest.container,item))return false;
            }
        }
        return true;
    }catch(_){return false;}
}
/*
 * Ordinary count custody may reach Bulk on a DIFFERENT physical bank through
 * the original Collector→Receiver links. This discovers only candidate
 * account owners; a later existing federated writer must inspect registered
 * capacity/controller/shard and reverify this witness before each debit and
 * credit. It never claims unregistered, unloaded or uncertain bank space.
 *
 * This is usable ONLY after a separately verified network-wide proof that
 * no accepting Filter/seeded Auto exists. It is NOT a wildcard grant.
 */
function uceLinkedBankBulkRoutes(receiver,item,authority,sourceGraph){
    try{
        if(!receiver||!item?.typeId||!authority||
           !Array.isArray(logistics.receivers))return undefined;
        const rootGraph=sourceGraph||ucePipeRouteNetwork(receiver);
        if(!rootGraph||rootGraph.receiverId!==receiver.id||
           !rootGraph.receiverIds?.includes(receiver.id))
            return undefined;
        // Both traversals are read-only in one synchronous stack. Reusing
        // freshly inspected bank graphs avoids doubling discovery cost for
        // large 1.4.1 multi-bank layouts; the actual transfer writer ALWAYS
        // re-runs this complete proof before each global journal mutation.
        const inspectedGraphs=new Map();
        if(!uceVerifiedNoReachablePreferredOutput(
            receiver,item,authority,rootGraph,inspectedGraphs))
            return undefined;
        const visited=new Set(),pending=[{
            current:receiver,graph:rootGraph,path:[]}],found=[];
        while(pending.length){
            const {current,graph,path}=pending.pop();
            if(!current||!graph||!Array.isArray(graph.entries)||
               !Array.isArray(graph.banks)||
               !graph.receiverIds?.includes(current.id)||
               !uceOrdinaryAccountSource(authority,current.id))
                return undefined;
            if(visited.has(current.id))continue;
            if(visited.size>=logistics.receivers.length)
                return undefined;
            visited.add(current.id);
            if(path.length){
                const chain=path.map(edge=>{
                    const e=edge.entry;
                    return e.d+'|'+e.x+','+e.y+','+e.z+'>'+
                        edge.collector.id+'>'+edge.receiver.id;
                }).join('~');
                for(const bank of graph.banks){
                    const ownerId=uceBulkOwnerId(bank);
                    if(typeof ownerId!=='string'||!ownerId)
                        return undefined;
                    const witness='IBB1|'+receiver.id+'|'+chain+'|'+
                        graph.leaderId+'|'+ownerId;
                    if(witness.length>8192||
                       /[^\x20-\x7e]/.test(witness))
                        return undefined;
                    found.push({receiver:current,
                        leaderId:graph.leaderId,bankOwnerId:ownerId,
                        graph,path,witness});
                }
            }
            const edges=[];
            for(const entry of graph.entries){
                const mode=sorterMode(entry);
                if(mode==='bypass'||mode==='auto')continue;
                if(mode==='filter'&&(!entry.f||
                   !matchesFilter(item,entry.f)))continue;
                if(mode!=='filter'&&mode!=='wildcard')continue;
                const sorter=sorterAt(entry);
                if(!sorter)return undefined;
                if(blockIsRedstonePowered(sorter))continue;
                const face=facingOffset(sorter),p=sorter.location;
                if(!face||!p)return undefined;
                const target=sorter.dimension.getBlock({
                    x:p.x+face.x,y:p.y+face.y,z:p.z+face.z});
                if(!target)return undefined;
                if(target.typeId!==COLLECTOR_ID||
                   blockIsRedstonePowered(target))continue;
                const q=target.location;
                const collector=findCollectorById(logisticsId(
                    target.dimension.id,q.x,q.y,q.z));
                const live=collector&&collectorAt(collector);
                const next=collector&&findReceiverById(collector.link);
                if(!collector||collector.present===false||
                   !collector.link||!uceSameLoadedBlock(target,live)||
                   !next||next.present===false||!receiverAt(next)||
                   !uceOrdinaryAccountSource(authority,next.id))
                    return undefined;
                edges.push({entry,collector,receiver:next,
                    priority:mode==='filter'?0:2});
            }
            edges.sort((a,b)=>a.priority-b.priority||
                a.entry.y-b.entry.y||a.entry.x-b.entry.x||
                a.entry.z-b.entry.z);
            for(let i=edges.length-1;i>=0;i--){
                const edge=edges[i];
                if(visited.has(edge.receiver.id))continue;
                const nextGraph=inspectedGraphs.get(edge.receiver.id)||
                    ucePipeRouteNetwork(edge.receiver);
                if(!nextGraph)return undefined;
                pending.push({current:edge.receiver,graph:nextGraph,
                    path:[...path,edge]});
            }
        }
        return found;
    }catch(_){return undefined;}
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
 * storage and local Bulk cannot masquerade as a global Filter.
 * Verify eligible Collector branches in original priority/bottom-up order.
 * An exhausted or cyclic VERIFIED branch may yield to a later branch, but
 * any unknown/unloaded link, split graph or unverified native storage HOLDS
 * before claiming a weaker alternative. No speculative branch writes.
 *
 * The upper bound comes from the registered Receiver census, NOT the
 * number of Sorters or a fixed system-wide hop limit. Revalidate the
 * complete chosen chain at BOTH original shard mutation boundaries.
 */
function uceSelectInterbankFilteredRoute(receiver,graph,item,authority,
                                        allowPlainMerge=true){
    try{
        if(!receiver||!graph||!item?.typeId||!authority||
           !Array.isArray(graph.entries)||
           !Array.isArray(logistics.receivers)||
           !graph.receiverIds?.includes(receiver.id)||
           !receiverAt(receiver)||receiverOutputHopper(receiver)||
           blockIsRedstonePowered(receiverAt(receiver)))
            return undefined;
        // Explore every independently linked Receiver at most ONCE. A
        // Collector cycle adds no new destination authority, and a later
        // branch cannot re-spend an already visited native Receiver. DFS
        // preserves original Filter then Wildcard and bottom-up ordering.
        // Any unknown eligible branch encountered before a chosen Filter
        // HOLDS; no speculative fallback into local Bulk or Wildcard.
        const expanded=new Set(),todo=[{
            current:receiver,network:graph,path:[]}];
        // The original Sorter order is Filter > seeded Auto > Wildcard.
        // A remote Auto is a fallback only after the entire reachable linked
        // graph proves there is no accepting Filter. Never use it ahead of
        // a usable Auto on the source Receiver's own Sorter column.
        let sourceAutoAvailable=false,deferredRemoteAuto;
        while(todo.length){
            const {current,network,path}=todo.pop();
            if(expanded.has(current.id))continue;
            if(expanded.size>=logistics.receivers.length||
               !network||!Array.isArray(network.entries)||
               !network.receiverIds?.includes(current.id)||
               !receiverAt(current)||receiverOutputHopper(current)||
               blockIsRedstonePowered(receiverAt(current)))
                return undefined;
            expanded.add(current.id);
            // This graph was just proved in this same synchronous stack.
            // Reuse its topology for the local Filter check; every live
            // native destination and item slot is still read independently.
            // The commit-time journal proof runs a NEW full graph discovery.
            // This is a read-only candidate census, not native admission.
            // It may inspect a seeded Auto while the DFS still needs to
            // search for a stronger remote Filter. The actual writer runs
            // the complete current-world Filter proof again.
            const local=uceChoosePipeDestination(
                current,item,true,undefined,allowPlainMerge,network,true);
            if(local?.priority===0){
                // Local Filter still takes priority when it physically
                // wins this original Sorter column, even at the source.
                if(!path.length)return undefined;
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
            if(!path.length){
                // An unresolved Collector can intentionally suppress the
                // ordinary local-output selector. Still recognize any
                // actually seeded, accepting original local Auto so a
                // remote Auto does not improperly jump ahead of it.
                sourceAutoAvailable=local?.priority===1;
                if(!sourceAutoAvailable){
                    for(const entry of network.entries){
                        if(sorterMode(entry)!=='auto')continue;
                        const dest=uceReadOnlySorterDestination(
                            entry,receiverAt(current));
                        if(!dest||network.inputs.some(input=>
                            uceSameLoadedBlock(input.block,dest.block))||
                           !ucePipeAutoSeed(item,dest.container))continue;
                        const accepting=allowPlainMerge?
                            findAcceptSlot(dest.container,item):
                            ucePipeEmptySlot(dest.container);
                        if(allowPlainMerge?!!accepting:accepting>=0){
                            sourceAutoAvailable=true;break;
                        }
                    }
                }
            }else if(local?.priority===1&&!deferredRemoteAuto){
                const first=path[0],last=local.entry;
                const segments=path.map(edge=>{
                    const e=edge.entry;
                    return e.d+'|'+e.x+','+e.y+','+e.z+'>'+
                        edge.collector.id+'>'+edge.receiver.id;
                });
                // The suffix distinguishes a seeded-Auto handoff from a
                // Filter using the same physical destination identity.
                const witness='IB1|'+receiver.id+'|'+segments.join('~')+
                    '|'+current.id+'|'+last.d+'|'+
                    last.x+','+last.y+','+last.z+'|'+local.ownerId+'|A';
                if(witness.length>8192||
                   /[^\x20-\x7e]/.test(witness))return undefined;
                deferredRemoteAuto={...first,receiver:current,
                    remote:local,hops:path.length,witness};
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
                // An unknown matching local Filter is NOT proof that
                // another bank may claim the item. A known full Filter
                // may be bypassed, but never an unverifiable native owner.
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
            // Reverse push means the earlier original Sorter winner is
            // explored FIRST, with alternate verified Collector branches
            // available only if its chain has no accepting remote Filter.
            for(let i=candidates.length-1;i>=0;i--){
                const edge=candidates[i];
                if(expanded.has(edge.receiver.id))continue;
                const nextNetwork=ucePipeRouteNetwork(edge.receiver);
                if(!nextNetwork)return undefined;
                todo.push({current:edge.receiver,network:nextNetwork,
                    path:[...path,edge]});
            }
        }
        // A local Auto retains its original same-column priority over any
        // equally seeded Auto in another bank. All reachable Filters have
        // already been examined, and unverified branches returned HOLD.
        return sourceAutoAvailable?undefined:deferredRemoteAuto;
    }catch(_){return undefined;}
}
function uceChoosePipeDestination(receiver,item,onlyPreferred=false,
                                  settledDestination=undefined,
                                  allowPlainMerge=false,
                                  justVerifiedGraph=undefined,
                                  readOnlyInterbankCensus=false) {
    // The old Receiver output Hopper retains first claim to physical egress.
    // Bulk account discovery on the SAME graph may still occur, because
    // moving virtual balances is not a second physical output writer.
    if(!item||!item.typeId||receiverOutputHopper(receiver)||
       blockIsRedstonePowered(receiverAt(receiver)))
        return undefined;
    // Interbank traversal passes ONLY the graph it just freshly inspected
    // in this synchronous call. Never cache it across ticks, ACK, or writes.
    // Without a supplied graph (all regular ingress/egress paths), discover
    // afresh. Physical destinations and their available slots are always
    // re-read even when the immutable graph was just verified.
    const graph=justVerifiedGraph||ucePipeRouteNetwork(receiver);
    const root=receiverAt(receiver);
    if(!graph||!root||
       (justVerifiedGraph&&(
           graph.receiverId!==receiver.id||
           !graph.receiverIds?.includes(receiver.id))))return undefined;
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
        // A Sorter may face one half of the very same double chest
        // that a pipe reaches through the OTHER half. Block coordinates
        // are not native inventory identities; compare canonical owners
        // or one 54-slot source could also be its own destination.
        const targetOwner=ucePipeStorageOwnerId(dest.block);
        if(!targetOwner||graph.inputs.some(input=>
            input.ownerId===targetOwner)){
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
    // A later-bank matching Filter must outrank this bank's Auto or
    // terminal Wildcard regardless of Y ordering. Even when the physically
    // local wildcard sorts first, do NOT consume an MR native item or
    // ordinary account while a connected Collector route remains
    // unresolved. The separate verified interbank handoff has first claim.
    if(selected.priority>0&&
       ucePipeHasUnresolvedForwarding(receiver,graph,item)){
        if(selected.priority!==1)return undefined;
        // A seeded local Auto must not wait forever behind a Wildcard
        // Collector when every reachable Filter is independently proved
        // unable to accept this item. The interbank selector itself will
        // finish its read-only Filter search before using any Auto; every
        // actual native move/ledger write rechecks the whole live proof.
        if(!readOnlyInterbankCensus&&
           !uceVerifiedNoReachablePreferredOutput(
               receiver,item,uceAuthoritySnapshot(),graph,
               undefined,true))return undefined;
    }
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
                // A loaded Collector may own native waiting custody
                // even while its linked Receiver chunk is UNLOADED. The
                // Receiver's sealed account, not its current block load,
                // is the identity authority for this original Q4 route.
                // A separate Collector-native carrier must claim MR cargo;
                // direct Receiver admission still requires receiverAt().
                if(!receiver||receiver.present===false||!authority||
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
function uceSorterCollectorSources(receiver,requiredCollectorId=undefined){
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
                if(collector?.link===receiver.id&&
                   (!requiredCollectorId||
                    collector.id===requiredCollectorId)){
                    touches=true;break;
                }
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
                           (!requiredCollectorId||
                            selected.collector.id===requiredCollectorId)&&
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
                           (!requiredCollectorId||
                            selected.collector.id===requiredCollectorId)&&
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
