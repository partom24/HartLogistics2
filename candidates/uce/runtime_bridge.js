/*
 * UCE integration binding inside the SAME HartLogistics2 Bedrock main module.
 * This is a bridge for the final unified engine, NOT a new scheduler or writer.
 * The existing logisticsTick owns scheduling. All Q4/legacy entrypoint writers
 * are stopped if any UCE authority record is present (including malformed);
 * UCE runs only for a complete ACTIVE authority verified by the native ports.
 *
 * Source ready != BDS acceptance. This bridge adds NO authority marker, no
 * Q4 migration, no Bulk account initialization, no production permission.
 */
let uceMrCursor=0;
let uceMrSequence=0;
let uceMrBootNonce=undefined;
let uceLastWarning='';
const UCE_MAIN_AUTHORITY='hartlogistics:uce_authority_v1';
/**
 * Sorter native-frame filters and mode state are configuration, NOT item
 * custody. Preserve the original two-generation registry commit protocol
 * only after an ACTIVE sealed UCE world has been verified. No queue, journal
 * or Collector/Receiver registry key is whitelisted.
 */
function uceAllowsSorterRegistryWrite(key){
    if(key!==REGISTRY_META_KEY&&
       !(typeof key==='string'&&/^hartsorter:r2_[01]_[0-9]+$/.test(key)))
        return false;
    const authority=uceAuthoritySnapshot();
    if(!authority)return false;
    const cold=inspectUnifiedActiveColdImport({
        world,worldId:authority.worldId,epoch:authority.epoch});
    return cold.ok===true;
}

function uceLegacyWriterBlocked(){
    try{
        const raw=world.getDynamicProperty(UCE_MAIN_AUTHORITY);
        return raw!==undefined && raw!==null && raw!=='';
    }catch(_){return true;} // Unreadable authority cannot default to LEGACY.
}
function uceAuthoritySnapshot(){
    let raw;
    try{raw=world.getDynamicProperty(UCE_MAIN_AUTHORITY);}
    catch(_){return undefined;}
    if(typeof raw!=='string'||raw.length>4096)return undefined;
    let value;
    try{value=JSON.parse(raw);}catch(_){return undefined;}
    if(!value || value.schema!=='hart-uce-world-authority-v1' ||
       value.state!=='ACTIVE'||value.writer!=='UCE_EXCLUSIVE'||
       value.q4LegacyWritersFenced!==true||
       value.migrationReconciled!==true||
       typeof value.worldId!=='string'||!value.worldId||
       !Number.isSafeInteger(value.epoch)||value.epoch<1)return undefined;
    return value;
}
function uceBridgeLog(reason){
    if(reason!==uceLastWarning){
        uceLastWarning=reason;
        log('[UCE unified service] '+reason);
    }
}
function uceNativeReceiptId(){
    // This is a bounded per-process uniqueness witness, not a durable
    // generator or proof of exactly-once crash recovery. The global PREPARED
    // native journal blocks any concurrent/adversarial reuse after a crash.
    if(uceMrBootNonce===undefined){
        uceMrBootNonce=(Math.floor(Math.random()*0x7fffffff)).toString(36) +
          '-' + Date.now().toString(36);
    }
    uceMrSequence++;
    if(!Number.isSafeInteger(uceMrSequence))return undefined;
    return 'u'+uceMrBootNonce+'-'+uceMrSequence.toString(36);
}
function uceLiveReceiverOwner(ownerId,anchor){
    try{
        const receiver=findReceiverById(ownerId);
        if(!receiver||receiver.present===false||
           receiver.d!==anchor.dimensionId||
           receiver.x!==anchor.x||receiver.y!==anchor.y||
           receiver.z!==anchor.z)return false;
        const b=receiverAt(receiver);
        return !!b&&b.typeId===RECEIVER_ID;
    }catch(_){return false;}
}
function uceLiveHopperOwner(owner){
    try{
        const block=getBlock(owner.d,owner.x,owner.y,owner.z);
        return !!block&&block.typeId==='minecraft:hopper'&&
            !hopperIsRedstoneLocked(block)&&
            !!block.getComponent('minecraft:inventory')?.container;
    }catch(_){return false;}
}
function uceClassifyLiveStack(stack){
    // False ORDINARY classification must not flatten native opaque data.
    // The native MR lane accepts the conservative complement. This bridge
    // never credits the ordinary ledger or constructs another ItemStack.
    if(!stack||typeof stack.typeId!=='string')return 'UNKNOWN';
    try{
        const dyn=typeof stack.getDynamicPropertyIds==='function'
          ? stack.getDynamicPropertyIds():[];
        const lore=typeof stack.getLore==='function'?stack.getLore():[];
        if(!Array.isArray(dyn)||!Array.isArray(lore))return 'UNKNOWN';
        if(!Number.isSafeInteger(stack.maxAmount)||
           stack.maxAmount<=1 || stack.maxAmount>64 || stack.nameTag ||
           dyn.length || lore.length)return 'MR';
        // Ordinary classification is only a refusal decision for THIS MR
        // service. It never creates/credits a virtual balance. Compare both
        // native directions against a fresh one-item canonical stack; a
        // differing/unknown stack remains native, preserving original bytes.
        const plain=new ItemStack(stack.typeId,1);
        if(plain.maxAmount===stack.maxAmount &&
           stack.isStackableWith(plain)===true &&
           plain.isStackableWith(stack)===true)return 'ORDINARY';
        return 'MR';
    }catch(_){return 'UNKNOWN';}
}
function uceReceiverHasNewMRInput(receiver){
    const linked=logistics.collectors.filter(c=>
      c.link===receiver.id&&c.present!==false);
    for(const col of linked){
        const cb=collectorAt(col);
        if(!cb||blockIsRedstonePowered(cb))continue;
        for(const source of collectorInputSources(col)){
            if(source.kind!=='hopper'||source.locked===true||
               !source.container?.isValid)continue;
            for(let slot=0;slot<source.container.size;slot++){
                let item;
                try{item=source.container.getItem(slot);}
                catch(_){return false;}
                if(item && uceClassifyLiveStack(item)==='MR')return true;
            }
        }
    }
    // The same Receiver may also admit metadata-rich stacks from any
    // verified pipe-attached native source without reconstruction.
    const pipe=ucePipeRouteNetwork(receiver);
    for(const source of pipe?.inputs||[]){
        for(let slot=0;slot<source.container.size;slot++){
            let item;
            try{item=source.container.getItem(slot);}
            catch(_){return false;}
            if(item&&uceClassifyLiveStack(item)==='MR')return true;
        }
    }
    return false;
}
function uceMrServiceTick(){
    const authority=uceAuthoritySnapshot();
    if(!authority){
        uceBridgeLog('authority not ACTIVE; original writers remain frozen');
        return;
    }
    if(!ready)return;
    const cold=inspectUnifiedActiveColdImport({world,
      worldId:authority.worldId,epoch:authority.epoch});
    if(!cold.ok){
        uceBridgeLog('incomplete cold authority: '+cold.reason);
        return;
    }
    // A shared journal means at most one unresolved native ownership transfer
    // can exist across the entire engine. No auto-clear or retry on restart.
    if(world.getDynamicProperty('hartlogistics:uce_native_intent_v1')){
        uceBridgeLog('native ownership intent pending: reconciliation HOLD');
        return;
    }
    const receivers=logistics.receivers;
    if(!receivers.length)return;
    let considered=0;
    for(let step=0;step<receivers.length;step++){
        const ix=(uceMrCursor+step)%receivers.length;
        const receiver=receivers[ix];
        if(receiver.present===false)continue;
        const rb=receiverAt(receiver);
        if(!rb)continue;
        const anchor={dimensionId:receiver.d,x:receiver.x,
                      y:receiver.y,z:receiver.z};
        const ownerId=receiver.id;
        const endpoints=new Map();
        const registry=createUnifiedCarrierRegistry({
            world,worldId:authority.worldId,epoch:authority.epoch,
            externalFence:()=>uceLegacyWriterBlocked()&&
                uceAuthoritySnapshot()!==undefined,
            ownerVerifier:uceLiveReceiverOwner
        });
        if(!registry.ok){uceBridgeLog(registry.reason);continue;}
        let host=registry.inspectHost({ownerId,anchor});
        if(!host.ok && host.reason==='carrier_record_missing'){
            // Do not create idle entities for hundreds of historical Receivers.
            // First prove an actually loaded linked Collector has MR cargo.
            if(!uceReceiverHasNewMRInput(receiver))continue;
            // New empty host ONLY; an already reserved or absent historical
            // host must HOLD. A fresh registration has no ItemStack to clone.
            const registered=registry.registerEmptyHost({ownerId,anchor});
            if(!registered.ok){
                uceBridgeLog(registered.reason);
                continue;
            }
            host=registry.inspectHost({ownerId,anchor});
        }
        if(!host.ok){uceBridgeLog(host.reason);continue;}
        const hopperOwner=(block,prefix)=>{
            const p=block.location;
            const owner={
                id:prefix+'|'+block.dimension.id+'|'+p.x+','+p.y+','+p.z,
                d:block.dimension.id,x:p.x,y:p.y,z:p.z
            };
            endpoints.set(owner.id,owner);
            return owner.id;
        };
        const port=createUnifiedNativePort({
            world,worldId:authority.worldId,epoch:authority.epoch,
            externalFence:()=>uceLegacyWriterBlocked()&&
                uceAuthoritySnapshot()!==undefined,
            verifyEndpointOwner:ref=>{
                if(ref.ownerId===ownerId)
                    return uceLiveReceiverOwner(ownerId,anchor)&&
                        registry.inspectHost({ownerId,anchor}).ok;
                const e=endpoints.get(ref.ownerId);
                return !!e&&(typeof e.verify==='function'
                    ? e.verify():uceLiveHopperOwner(e));
            },
            durableOwnershipWitness:registry.durableOwnershipWitness
        });
        if(!port.ok){uceBridgeLog(port.reason);continue;}
        const linked=logistics.collectors.filter(c=>
            c.link===receiver.id&&c.present!==false);
        const sources=[];
        for(const col of linked){
            const cb=collectorAt(col);
            if(!cb||blockIsRedstonePowered(cb))continue;
            for(const source of collectorInputSources(col)){
                if(source.kind!=='hopper'||!source.block||
                   source.locked===true||!source.container?.isValid)continue;
                sources.push({
                    container:source.container,
                    ownerId:hopperOwner(source.block,'input'),
                    locked:false,blockVerified:true
                });
            }
        }
        // Transporter inputs use this exact same native port and carrier
        // ticket writer as Collector/Hopper ingress.
        const pipeNetwork=ucePipeRouteNetwork(receiver);
        for(const src of pipeNetwork?.inputs||[]){
            const p=src.block.location;
            const id='pipe-input|'+src.block.dimension.id+'|'+
                p.x+','+p.y+','+p.z;
            endpoints.set(id,{verify:()=>
                ucePipeSourceStillConnected(receiver,src)});
            sources.push({container:src.container,ownerId:id,
                locked:false,blockVerified:true});
        }
        const output=receiverOutputHopper(receiver);
        let outputNative=output && !output.locked ?
          {ownerId:hopperOwner(output.block,'output'),
           container:output.container,blockVerified:true,locked:false}:
          undefined;
        // The original output Hopper always wins, even if powered/locked.
        // Without one, a single revalidated Transporter graph may select
        // the Filter -> Auto -> Wildcard native destination.
        if(!output&&!blockIsRedstonePowered(rb)){
            const custody=registry.inspectCustody({ownerId,anchor});
            if(custody.ok&&custody.slots.length){
                const native=host.container.getItem(custody.slots[0]);
                const route=uceChoosePipeDestination(receiver,native);
                if(route){
                    endpoints.set(route.ownerId,{verify:()=>
                        ucePipeDestinationStillValid(receiver,native,route)});
                    outputNative={ownerId:route.ownerId,
                        container:route.dest.container,
                        blockVerified:true,locked:false};
                }
            }
        }
        // MR-first, independent of ordinary admission. A powered Receiver
        // blocks output only; Collector ingress remains eligible.
        const direction=outputNative&&!blockIsRedstonePowered(rb)&&
           registry.inspectCustody({ownerId,anchor}).occupied>0 ?
           'egress':'ingress';
        const op=uceNativeReceiptId();
        if(!op){uceBridgeLog('receipt ID exhausted');return;}
        const result=serviceUnifiedReceiverMR({
            registry,port,ownerId,anchor,direction,
            inputSources:sources,output:outputNative,
            identify:uceClassifyLiveStack,operationId:op,
            receiverPowered:blockIsRedstonePowered(rb),
            collectorPowered:false
        });
        if(!result.ok){
            uceBridgeLog(result.reason);
        }else if(result.moved>0){
            considered++;
        }
    }
    uceMrCursor=(uceMrCursor+1)%receivers.length;
}


/* One scheduler, two storage representations. The existing logisticsTick
 * invokes this function; neither representation registers its own timer.
 */
let uceOrdinaryCursor=0;
function uceUnifiedServiceTick(){
    uceMrServiceTick();
    uceOrdinaryServiceTick();
}
function uceOrdinaryAccountSource(authority,ownerId){
    let seal;
    try{seal=JSON.parse(world.getDynamicProperty('hartlogistics:uce_cold_seal_v1'));}
    catch(_){return undefined;}
    if(!seal||!Array.isArray(seal.shards))return undefined;
    const match=seal.shards.filter(s=>s.owner==='receiver:'+ownerId);
    return match.length===1?match[0].key:undefined;
}
function ucePlainItemIdentity(stack){
    if(uceClassifyLiveStack(stack)!=='ORDINARY')return undefined;
    const def={typeId:stack.typeId,lore:[],ench:[],
        canDestroy:[],canPlaceOn:[]};
    const key=q5IdentityKey(def);
    return typeof key==='string'?key:undefined;
}
function uceNativeOutputSlot(container){
    if(!container||!Number.isInteger(container.size))return -1;
    try{
        for(let i=0;i<container.size;i++)
            if(container.getItem(i)===undefined)return i;
    }catch(_){return -1;}
    return -1;
}
const ucePendingLinkBlocks=new Map();
function uceSelectCollectorForLink(player,block){
    if(!player||!block||block.typeId!==COLLECTOR_ID)return;
    const authority=uceAuthoritySnapshot();
    const cold=authority&&inspectUnifiedActiveColdImport({
        world,worldId:authority.worldId,epoch:authority.epoch});
    if(!cold?.ok){
        player.sendMessage('§c[Collector] UCE ownership authority is not sealed.');
        return;
    }
    const p=block.location;
    const selected={id:logisticsId(block.dimension.id,p.x,p.y,p.z),
        d:block.dimension.id,x:p.x,y:p.y,z:p.z};
    ucePendingLinkBlocks.set(player.id,selected);
    uceShowCollectorLinkedStatus(player,block);
    player.sendMessage('§b[Collector] Selected for UCE linkage. Interact with a registered Receiver to commit the relationship.');
}
function uceUseReceiverLinkOrStatus(player,block){
    if(!player||!block||block.typeId!==RECEIVER_ID)return;
    const pending=ucePendingLinkBlocks.get(player.id);
    if(!pending){
        uceShowReceiverLinkedStatus(player,block);
        return;
    }
    const p=block.location;
    const receiverId=logisticsId(block.dimension.id,p.x,p.y,p.z);
    const receiver=findReceiverById(receiverId);
    const authority=uceAuthoritySnapshot();
    const cold=authority&&inspectUnifiedActiveColdImport({
        world,worldId:authority.worldId,epoch:authority.epoch});
    const shardKey=authority&&uceOrdinaryAccountSource(authority,receiverId);
    if(!receiver||!cold?.ok||!shardKey||!receiverAt(receiver)){
        player.sendMessage('§c[Receiver] Target not sealed/registered; no Collector link changed.');
        return;
    }
    const candidate=()=>{
        const at=collectorAt(pending);
        return !!at&&at.typeId===COLLECTOR_ID&&
            at.dimension.id===pending.d&&
            at.location.x===pending.x&&
            at.location.y===pending.y&&at.location.z===pending.z;
    };
    const receiverVerified=rid=>{
        if(rid!==receiverId||!receiverAt(receiver))return false;
        const proof=inspectUnifiedActiveColdImport({world,
            worldId:authority.worldId,epoch:authority.epoch});
        if(!proof.ok)return false;
        const shard=createUnifiedShardWriter({world,shardKey,
            worldId:authority.worldId,epoch:authority.epoch,
            externalFence:()=>false});
        if(!shard.ok)return false;
        const view=shard.inspect();
        return view.ok&&view.snapshot.accounts.some(a=>
            a.id==='receiver:'+receiverId);
    };
    const editor=createUnifiedLinkRegistry({world,
        worldId:authority.worldId,epoch:authority.epoch,
        externalFence:()=>uceLegacyWriterBlocked()&&
            !!uceAuthoritySnapshot(),
        verifyCollectorBlock:c=>c.id===pending.id&&candidate(),
        verifySealedReceiver:receiverVerified
    });
    if(!editor.ok){
        player.sendMessage('§c[Collector] Link authority unavailable: '+editor.reason);
        return;
    }
    const old=editor.inspect();
    if(!old.ok){
        player.sendMessage('§c[Collector] Registry HOLD: '+old.reason);
        return;
    }
    const operationId=uceNativeReceiptId();
    const linked=editor.linkCollector({operationId,
        collector:pending,receiverId,expectedRevision:old.revision});
    if(!linked.ok){
        player.sendMessage('§c[Collector] UCE link HOLD: '+linked.reason);
        return;
    }
    try{
        const updated=safeJsonParse(world.getDynamicProperty(LOGISTICS_KEY),undefined);
        if(!updated||!Array.isArray(updated.collectors)||
           !Array.isArray(updated.receivers))
            throw new Error('registry readback not parseable');
        logistics=updated;
    }catch(_){
        player.sendMessage('§c[Collector] Link record committed but live refresh is ambiguous; stop routing and restart for reconciliation.');
        return;
    }
    ucePendingLinkBlocks.delete(player.id);
    player.sendMessage('§a[Collector] UCE linked to sealed Receiver '+receiverId+'.');
    uceShowReceiverLinkedStatus(player,block);
}

/* Read-only status for already linked 1.4.1 Collector/Receiver entries.
 * No implicit registration or Q4 migration from a player interaction.
 */
function uceShowCollectorLinkedStatus(player,block){
    if(!player||!block)return;
    const p=block.location;
    const id=logisticsId(block.dimension.id,p.x,p.y,p.z);
    const collector=findCollectorById(id);
    if(!collector){
        player.sendMessage('§e[Collector] Not registered with the sealed UCE network. Original Q4 registration is paused.');
        return;
    }
    const receiver=collector.link&&findReceiverById(collector.link);
    const linked=receiver&&receiverAt(receiver);
    player.sendMessage('§7[Collector] §f'+
        (linked?'Linked Receiver: '+receiver.id:
         'Linked Receiver unavailable; custody is on HOLD')+
        '§7 | redstone '+(blockIsRedstonePowered(block)?'paused':'active'));
}
function uceShowReceiverLinkedStatus(player,block){
    if(!player||!block)return;
    const p=block.location;
    const id=logisticsId(block.dimension.id,p.x,p.y,p.z);
    const receiver=findReceiverById(id);
    if(!receiver){
        player.sendMessage('§e[Receiver] Not registered in the sealed UCE world. No queue or new link was created.');
        return;
    }
    const authority=uceAuthoritySnapshot(),shardKey=authority&&
        uceOrdinaryAccountSource(authority,id);
    if(!shardKey){
        player.sendMessage('§c[Receiver] No sealed ordinary account. Q4 evidence held; do not remove this block.');
        return;
    }
    const writer=createUnifiedShardWriter({world,shardKey,
        worldId:authority.worldId,epoch:authority.epoch,
        externalFence:()=>false});
    const inspected=writer.ok&&writer.inspect();
    if(!inspected?.ok){
        player.sendMessage('§c[Receiver] Account unreadable; ownership HOLD.');
        return;
    }
    const own=inspected.snapshot.accounts.find(a=>
        a.id==='receiver:'+id);
    if(!own){
        player.sendMessage('§c[Receiver] Sealed source account missing; HOLD.');
        return;
    }
    const banks=inspected.snapshot.accounts.filter(x=>x.kind==='bulk');
    const bulkTotal=banks.reduce((n,a)=>n+a.total,0);
    const totalCapacity=banks.reduce((n,a)=>n+a.capacity,0);
    const registry=createUnifiedCarrierRegistry({world,
        worldId:authority.worldId,epoch:authority.epoch,
        externalFence:()=>false,ownerVerifier:uceLiveReceiverOwner});
    const claims=registry.ok?registry.inspectCustody({
        ownerId:id,anchor:{dimensionId:receiver.d,
            x:receiver.x,y:receiver.y,z:receiver.z}}):undefined;
    const mrText=claims?.ok?
        claims.occupied+' / '+(claims.occupied+claims.free)+' native slots':
        'native custody '+(claims?.reason||'not registered');
    player.sendMessage('§7[Receiver] §fOrdinary '+
        own.total+'/250000 | Bulk '+bulkTotal+'/'+totalCapacity+
        ' ('+banks.length+' banks) | MR '+mrText+
        ' | Lifetime '+own.lifetime.received+'/'+own.lifetime.delivered+
        ' | output '+(blockIsRedstonePowered(block)?'PAUSED':'active'));
}

function uceBulkOwnerId(block){
    if(!block||block.typeId!=='hartlogistics:bulk_storage')return undefined;
    const p=block.location;
    return block.dimension.id+'|'+p.x+','+p.y+','+p.z;
}
function uceBulkPlacementVerified(receiver,ownerId){
    const route=ucePipeRouteNetwork(receiver);
    if(!route||!Array.isArray(route.banks))return false;
    const matching=route.banks.filter(b=>uceBulkOwnerId(b)===ownerId);
    if(matching.length!==1)return false;
    const registered=logistics.receivers.filter(r=>
        r.id!==receiver.id&&r.present!==false);
    for(const other of registered){
        const competitor=ucePipeRouteNetwork(other);
        if(competitor?.banks?.some(b=>uceBulkOwnerId(b)===ownerId))
            return false;
    }
    return true;
}
function uceBulkGlobalUniqueness(ownerId,shardKey,authority){
    try{
        const seal=JSON.parse(world.getDynamicProperty(
            'hartlogistics:uce_cold_seal_v1'));
        if(!seal||!Array.isArray(seal.shards))return false;
        let matchedRegion=0;
        for(const region of seal.shards){
            if(region.key===shardKey)matchedRegion++;
            const reader=createUnifiedShardWriter({world,shardKey:region.key,
                worldId:authority.worldId,epoch:authority.epoch,
                externalFence:()=>false});
            if(!reader.ok)return false;
            const state=reader.inspect();
            if(!state.ok)return false;
            for(const member of state.snapshot.accounts){
                if(member.kind!=='bulk')continue;
                if(member.ownerId===ownerId)return false;
                if(member.role==='controller'&&region.key!==shardKey)
                    return false;
            }
        }
        return matchedRegion===1;
    }catch(_){return false;}
}
/**
 * Append at most one VERIFIED empty Bulk member to the same Receiver shard.
 * The caller must not continue using an old revision after this write.
 * This is registration ONLY; the first real item transfer uses the same
 * versioned ledger writer on a later scheduler tick.
 */
function uceMaybeRegisterBulk(receiver,shardKey,authority){
    const network=ucePipeRouteNetwork(receiver);
    if(!network?.banks?.length)return false;
    const bankBlocks=[...network.banks].sort((a,b)=>
        uceBulkOwnerId(a)<uceBulkOwnerId(b)?-1:
        uceBulkOwnerId(a)>uceBulkOwnerId(b)?1:0);
    const writer=createUnifiedShardWriter({world,shardKey,
        worldId:authority.worldId,epoch:authority.epoch,
        externalFence:()=>uceLegacyWriterBlocked()&&
            !!uceAuthoritySnapshot(),
        verifyBulkPlacement:(owner)=>
            uceBulkPlacementVerified(receiver,owner),
        verifyGlobalBulkUniqueness:(owner,region)=>
            uceBulkGlobalUniqueness(owner,region,authority)
    });
    if(!writer.ok){uceBridgeLog('Bulk writer '+writer.reason);return true;}
    const view=writer.inspect();
    if(!view.ok){uceBridgeLog('Bulk shard '+view.reason);return true;}
    for(const block of bankBlocks){
        const ownerId=uceBulkOwnerId(block);
        if(view.snapshot.accounts.some(x=>x.id==='bulk:'+ownerId))
            continue;
        const op=uceNativeReceiptId();
        if(!op){uceBridgeLog('Bulk receipt exhausted');return true;}
        const r=writer.registerBulkMember({ownerId,
            operationId:op,expectedEpoch:authority.epoch,
            expectedRevision:view.snapshot.revision});
        if(!r.ok)uceBridgeLog('Bulk registration '+r.reason);
        return true;
    }
    return false;
}

function uceSameLoadedBlock(a,b){
    if(!a||!b||a.typeId!==b.typeId||
       a.dimension?.id!==b.dimension?.id)return false;
    const x=a.location,y=b.location;
    return !!x&&!!y&&x.x===y.x&&x.y===y.y&&x.z===y.z;
}
function uceOrdinaryServiceTick(){
    const authority=uceAuthoritySnapshot();
    if(!authority||!ready)return;
    // A single missing custody receipt freezes ALL UCE physical/world writes;
    // do not attempt per-Receiver replays on the next tick.
    try{
        if(world.getDynamicProperty('hartlogistics:uce_native_intent_v1')||
           world.getDynamicProperty('hartlogistics:uce_boundary_intent_v1'))
            return;
    }catch(_){uceBridgeLog('ordinary journal unavailable');return;}
    const cold=inspectUnifiedActiveColdImport({
        world,worldId:authority.worldId,epoch:authority.epoch});
    if(!cold.ok){uceBridgeLog('ordinary cold authority '+cold.reason);return;}
    const receivers=logistics.receivers;
    if(!receivers.length)return;
    // At most ONE ordinary Receiver service per scheduler tick. Not a source
    // throughput limit: the same virtual account writer can transfer a bounded
    // count batch internally without staging physical items.
    for(let step=0;step<receivers.length;step++){
        const index=(uceOrdinaryCursor+step)%receivers.length;
        const receiver=receivers[index];
        if(receiver.present===false||!receiverAt(receiver))continue;
        const ownerId=receiver.id;
        const accountId='receiver:'+ownerId;
        const shardKey=uceOrdinaryAccountSource(authority,ownerId);
        if(!shardKey)continue;
        if(uceMaybeRegisterBulk(receiver,shardKey,authority)){
            uceOrdinaryCursor=(index+1)%receivers.length;
            return;
        }
        const anchor={dimensionId:receiver.d,
            x:receiver.x,y:receiver.y,z:receiver.z};
        const linked=logistics.collectors.filter(c=>
            c.link===ownerId&&c.present!==false);
        let sourceSlot=undefined,sourceRecord=undefined,sourceKey;
        for(const collector of linked){
            const cb=collectorAt(collector);
            if(!cb||blockIsRedstonePowered(cb))continue;
            for(const source of collectorInputSources(collector)){
                if(source.kind!=='hopper'||source.locked||
                   !source.container?.isValid)continue;
                for(let i=0;i<source.container.size;i++){
                    let item;
                    try{item=source.container.getItem(i);}
                    catch(_){continue;}
                    const key=ucePlainItemIdentity(item);
                    if(!key)continue;
                    sourceSlot=i;
                    sourceRecord=source;
                    sourceKey=key;
                    break;
                }
                if(sourceRecord)break;
            }
            if(sourceRecord)break;
        }
        // A pipe-attached chest/barrel is a native INPUT (never a final
        // storage output). Collector sources retain admission priority.
        // Every candidate passes through the same escrow->ledger credit
        // coordinator, so no second ordinary Transporter queue is created.
        if(!sourceRecord){
            const pipe=ucePipeRouteNetwork(receiver);
            for(const input of pipe?.inputs||[]){
                for(let i=0;i<input.container.size;i++){
                    let item;
                    try{item=input.container.getItem(i);}
                    catch(_){continue;}
                    const key=ucePlainItemIdentity(item);
                    if(!key)continue;
                    sourceRecord={...input,kind:'pipe',locked:false};
                    sourceSlot=i;
                    sourceKey=key;
                    break;
                }
                if(sourceRecord)break;
            }
        }
        const output=receiverOutputHopper(receiver);
        const outgoing=output&&!output.locked&&
            !blockIsRedstonePowered(receiverAt(receiver))?
            output:undefined;
        const registry=createUnifiedCarrierRegistry({
            world,worldId:authority.worldId,epoch:authority.epoch,
            externalFence:()=>uceLegacyWriterBlocked()&&
                !!uceAuthoritySnapshot(),
            ownerVerifier:uceLiveReceiverOwner
        });
        if(!registry.ok){uceBridgeLog(registry.reason);continue;}
        let host=registry.inspectHost({ownerId,anchor});
        if(!host.ok&&host.reason==='carrier_record_missing'&&
           (sourceRecord||outgoing||
            (!output&&ucePipeRouteNetwork(receiver)))){
            // New, empty host only; physical ownership changes are separately
            // journaled, and a missing PREVIOUS host is never replaced.
            const spawned=registry.registerEmptyHost({ownerId,anchor});
            if(!spawned.ok){uceBridgeLog(spawned.reason);continue;}
            host=registry.inspectHost({ownerId,anchor});
        }
        if(!host.ok){uceBridgeLog(host.reason);continue;}
        const custody=registry.inspectCustody({ownerId,anchor});
        if(!custody.ok){uceBridgeLog(custody.reason);continue;}
        const shardWriter=createUnifiedShardWriter({
            world,shardKey,worldId:authority.worldId,epoch:authority.epoch,
            externalFence:()=>uceLegacyWriterBlocked()&&
                !!uceAuthoritySnapshot(),
            verifyInternalRoute:tx=>{
                const graph=ucePipeRouteNetwork(receiver);
                if(!graph||!Array.isArray(graph.banks))return false;
                const loaded=new Set(graph.banks.map(b=>uceBulkOwnerId(b)));
                const other=tx.from===accountId?tx.to:
                    tx.to===accountId?tx.from:undefined;
                if(!other||!other.startsWith('bulk:')||
                   !loaded.has(other.slice(5)))return false;
                const current=shardWriter.inspect();
                if(!current.ok)return false;
                const bank=current.snapshot.accounts.find(a=>a.id===other);
                if(!bank||bank.kind!=='bulk')return false;
                return loaded.has(bank.controllerOwnerId);
            },
            verifyEscrowCustody:tx=>{
                const current=registry.inspectCustody({ownerId,anchor});
                if(!current.ok)return false;
                for(const slot of current.slots){
                    const s=host.container.getItem(slot);
                    if(!s||ucePlainItemIdentity(s)!==tx.key||
                       s.amount!==tx.count)continue;
                    return true;
                }
                return false;
            }
        });
        if(!shardWriter.ok){uceBridgeLog(shardWriter.reason);continue;}
        const ledger=shardWriter.inspect();
        if(!ledger.ok){uceBridgeLog(ledger.reason);continue;}
        const account=ledger.snapshot.accounts.find(a=>a.id===accountId);
        if(!account){uceBridgeLog('receiver ordinary account absent');continue;}
        const bankNetwork=ucePipeRouteNetwork(receiver);
        if(bankNetwork?.banks?.length){
            const members=[...new Set(bankNetwork.banks
                .map(b=>uceBulkOwnerId(b)))].sort();
            const outputKeys=[];
            if(!sourceRecord && account.total===0 &&
               !blockIsRedstonePowered(receiverAt(receiver))){
                for(const bank of ledger.snapshot.accounts){
                    if(bank.kind!=='bulk'||!members.includes(bank.ownerId))
                        continue;
                    for(const entry of bank.buckets){
                        try{
                            const def=JSON.parse(entry.key);
                            const liveItem=new ItemStack(def.typeId,1);
                            const accepted=uceClassifyLiveStack(liveItem)==='ORDINARY'&&
                                (outgoing ||
                                  (!output&&uceChoosePipeDestination(
                                      receiver,liveItem)));
                            if(accepted)outputKeys.push(entry.key);
                        }catch(_){}
                    }
                }
            }
            const plan=planUnifiedBulkService({
                snapshot:ledger.snapshot,receiverOwnerId:ownerId,
                connectedBankOwnerIds:members,
                sourceWaiting:!!sourceRecord,
                outputEligibleKeys:outputKeys
            });
            if(!plan.ok){
                uceBridgeLog('Bulk planner '+plan.reason);
                uceOrdinaryCursor=(index+1)%receivers.length;
                return;
            }
            if(plan.status==='TRANSFER_DRAFT_ONLY'){
                const op=uceNativeReceiptId();
                if(!op){uceBridgeLog('Bulk receipt exhausted');return;}
                const changed=shardWriter.applyInternalTransfer({
                    operationId:op,from:plan.from,to:plan.to,
                    key:plan.key,count:plan.count,
                    expectedRevision:plan.expectedRevision,
                    expectedEpoch:plan.expectedEpoch
                });
                if(!changed.ok)
                    uceBridgeLog('Bulk transfer '+changed.reason);
                uceOrdinaryCursor=(index+1)%receivers.length;
                return;
            }
        }
        if(custody.free<1)continue;
        const slot=uceNativeOutputSlot(host.container);
        if(slot<0)continue;
        let direction,physicalSlot,identityKey,amount,routeVerify;
        const origin=sourceRecord?.block;
        if(sourceRecord&&account.total<account.capacity){
            const stack=sourceRecord.container.getItem(sourceSlot);
            if(!stack)continue;
            direction='deposit';identityKey=sourceKey;amount=stack.amount;
            const p=origin.location;
            const endpointId='input|'+origin.dimension.id+
                '|'+p.x+','+p.y+','+p.z;
            physicalSlot={ownerId:endpointId,
                container:sourceRecord.container,slot:sourceSlot};
            routeVerify=()=>{
                if(sourceRecord.kind==='pipe')
                    return ucePipeSourceStillConnected(receiver,sourceRecord);
                const cb=linked.some(c=>{
                    const b=collectorAt(c);
                    return b && !blockIsRedstonePowered(b) &&
                      collectorInputSources(c).some(x=>
                        uceSameLoadedBlock(x.block,origin)&&!x.locked);
                });
                return cb&&uceLiveHopperOwner({
                    d:origin.dimension.id,x:p.x,y:p.y,z:p.z
                });
            };
        }else if(account.total>0 && (outgoing ||
                  (!output&&ucePipeRouteNetwork(receiver)))){
            let bucket,selectedRoute,selectedItem;
            // Search all available item buckets; a Filter can accept one type
            // while another bucket must HOLD or wait for Wildcard. Do not
            // discard or reclassify any unselected ledger identity.
            for(const entry of account.buckets){
                try{
                    const def=JSON.parse(entry.key);
                    const item=new ItemStack(def.typeId,1);
                    if(uceClassifyLiveStack(item)!=='ORDINARY')continue;
                    const route=outgoing?undefined:
                        uceChoosePipeDestination(receiver,item);
                    if(!outgoing&&!route)continue;
                    if(outgoing&&uceNativeOutputSlot(outgoing.container)<0)
                        continue;
                    bucket=entry;selectedRoute=route;selectedItem=item;
                    break;
                }catch(_){}
            }
            if(!bucket)continue;
            direction='withdraw';identityKey=bucket.key;
            amount=Math.min(bucket.count,64,selectedItem.maxAmount);
            if(selectedRoute){
                physicalSlot={ownerId:selectedRoute.ownerId,
                    container:selectedRoute.dest.container,
                    slot:selectedRoute.slot};
                routeVerify=()=>!receiverOutputHopper(receiver)&&
                    !blockIsRedstonePowered(receiverAt(receiver))&&
                    ucePipeDestinationStillValid(
                        receiver,selectedItem,selectedRoute);
            }else{
                const outputIndex=uceNativeOutputSlot(outgoing.container);
                if(outputIndex<0)continue;
                const p=outgoing.block.location;
                const endpointId='output|'+outgoing.block.dimension.id+
                    '|'+p.x+','+p.y+','+p.z;
                physicalSlot={ownerId:endpointId,
                    container:outgoing.container,slot:outputIndex};
                routeVerify=()=>uceSameLoadedBlock(
                    receiverOutputHopper(receiver)?.block,outgoing.block)&&
                    !blockIsRedstonePowered(receiverAt(receiver))&&
                    !hopperIsRedstoneLocked(outgoing.block);
            }
        }else continue;
        const operationId=uceNativeReceiptId();
        if(!operationId){uceBridgeLog('ordinary receipt exhausted');return;}
        const carrierSlot={ownerId,container:host.container,slot};
        const scopedRegistry=createUnifiedCarrierRegistry({
            world,worldId:authority.worldId,epoch:authority.epoch,
            externalFence:()=>uceLegacyWriterBlocked()&&
                !!uceAuthoritySnapshot(),
            ownerVerifier:uceLiveReceiverOwner,
            boundaryOperationId:operationId
        });
        const liveOwner=ref=>{
            if(ref.ownerId===ownerId)
                return uceLiveReceiverOwner(ownerId,anchor)&&
                    scopedRegistry.inspectHost({ownerId,anchor}).ok;
            if(ref.ownerId!==physicalSlot.ownerId)return false;
            return routeVerify();
        };
        const receiptProof=meta=>{
            const r=shardWriter.inspect(),raw=world.getDynamicProperty(
                'hartlogistics:uce_boundary_intent_v1');
            let tx;
            try{tx=JSON.parse(raw);}catch(_){return false;}
            const receipt=r?.lastReceipt;
            return !!r?.ok&&tx?.operationId===operationId&&
                tx.phase==='ESCROW_READY'&&
                receipt?.kind==='BOUNDARY'&&
                receipt.operationId===operationId&&
                receipt.accountId===accountId&&
                receipt.direction===meta.direction&&
                receipt.key===identityKey&&
                receipt.count===amount;
        };
        const ordinaryProof=(item,k,n)=>{
            if(!item||item.amount!==n||k!==identityKey||
               uceClassifyLiveStack(item)!=='ORDINARY')return false;
            // Original Q4 may encode empty optional fields differently
            // from newly admitted item definitions. Refuse metadata-bearing
            // saved types but do not invent a different delivered item.
            try{
                const def=JSON.parse(k);
                return inspectQ4OrdinaryDefinitionShape(def).ok===true &&
                    def.typeId===item.typeId;
            }catch(_){return false;}
        };
        const port=createUnifiedNativePort({
            world,worldId:authority.worldId,epoch:authority.epoch,
            boundaryOperationId:operationId,
            externalFence:()=>uceLegacyWriterBlocked()&&
                !!uceAuthoritySnapshot(),
            verifyEndpointOwner:liveOwner,
            durableOwnershipWitness:scopedRegistry.durableOwnershipWitness,
            makeCertifiedOrdinaryItem:(key,count)=>{
                if(key!==identityKey)return undefined;
                try{
                    const def=JSON.parse(key);
                    const item=new ItemStack(def.typeId,count);
                    return ordinaryProof(item,key,count)?item:undefined;
                }catch(_){return undefined;}
            },
            certifyOrdinaryEscrow:ordinaryProof,
            verifyLedgerBoundaryReceipt:receiptProof,
            verifyLedgerWithdrawalReservation:meta=>{
                const r=shardWriter.inspect(),raw=world.getDynamicProperty(
                    'hartlogistics:uce_boundary_intent_v1');
                let tx;
                try{tx=JSON.parse(raw);}catch(_){return false;}
                return !!r?.ok&&tx?.operationId===operationId&&
                    tx.phase==='PREPARED'&&meta.direction==='withdraw'&&
                    meta.operationId===operationId&&
                    meta.accountId===accountId&&meta.key===identityKey&&
                    meta.count===amount&&
                    (r.snapshot.accounts.find(a=>a.id===accountId)
                      ?.buckets.find(b=>b.key===identityKey)?.count||0)>=amount;
            }
        });
        if(!port.ok){uceBridgeLog(port.reason);continue;}
        const args={world,worldId:authority.worldId,epoch:authority.epoch,
            operationId,accountId,key:identityKey,count:amount,
            registry:scopedRegistry,port,writer:shardWriter,ownerId,anchor,
            carrierSlot,physicalSlot,verifyRoute:routeVerify,
            verifyOrdinary:meta=>meta.key===identityKey&&
                meta.count===amount&&meta.accountId===accountId};
        const result=direction==='deposit'?
            executeUnifiedOrdinaryDeposit(args):
            executeUnifiedOrdinaryWithdrawal(args);
        if(!result.ok)uceBridgeLog('ordinary '+result.reason);
        uceOrdinaryCursor=(index+1)%receivers.length;
        // One transaction opportunity per tick, successful or blocked.
        return;
    }
    uceOrdinaryCursor=(uceOrdinaryCursor+1)%receivers.length;
}


/* Bulk Storage block uses its own asset and this read-only menu. No old
 * Collector/Receiver/Sorter interface is replaced. Actual account
 * registration is a separate authenticated one-shard UCE writer operation.
 */
function uceBulkAccountAt(block){
    try{
        const authority=uceAuthoritySnapshot();
        if(!authority)return undefined;
        const cold=inspectUnifiedActiveColdImport({world,
            worldId:authority.worldId,epoch:authority.epoch});
        if(!cold.ok)return undefined;
        const p=block.location;
        const ownerId=block.dimension.id+'|'+p.x+','+p.y+','+p.z;
        const seal=JSON.parse(world.getDynamicProperty(
            'hartlogistics:uce_cold_seal_v1'));
        if(!seal||!Array.isArray(seal.shards))return undefined;
        for(const region of seal.shards){
            const s=createUnifiedShardWriter({world,
                shardKey:region.key,worldId:authority.worldId,
                epoch:authority.epoch,
                externalFence:()=>false});
            if(!s.ok)continue;
            const read=s.inspect();
            if(!read.ok)continue;
            const bank=read.snapshot.accounts.find(x=>
                x.id==='bulk:'+ownerId);
            if(bank)return {bank,ownerId,region:region.key};
        }
        return {ownerId};
    }catch(_){return undefined;}
}
function uceShowBulkStatus(player,block){
    if(!player||!block||block.typeId!=='hartlogistics:bulk_storage')
        return;
    const state=uceBulkAccountAt(block);
    const status=state?.bank ?
       ('Stored '+state.bank.total+' / 200000\\n'+
        'Item kinds: '+state.bank.buckets.length+
        '\\nOwner: '+state.ownerId) :
       ('Not registered. No verified UCE network account is spendable.'+
        '\\nConnect a verified Receiver before service is enabled.');
    // Existing chat/status UI avoids an undeclared server-ui dependency.
    player.sendMessage('§6[Hart Bulk Storage] §7'+status);
}
function uceRegisterBulkComponent(registry){
    registry.registerCustomComponent('hartlogistics:bulk_storage_surface',{
        onPlayerInteract(e){
            if(!e?.player||e.block?.typeId!=='hartlogistics:bulk_storage')
                return;
            const p=e.player,b=e.block;
            system.run(()=>uceShowBulkStatus(p,b));
        }
    });
}


/* Unified administrative diagnostics through the existing
 * hartlogistics:status command. Read-only; no recovery, election,
 * migration, item creation, or Q4 mutation is ever triggered.
 */
function uceSendDiagnostics(origin){
    const lines=['§6[Hart Logistics UCE] §fUnified product status'];
    const auth=uceAuthoritySnapshot();
    if(!auth){
        lines.push('§cUCE authority not ACTIVE: all legacy custody writers frozen.');
    }else{
        const cold=inspectUnifiedActiveColdImport({world,
            worldId:auth.worldId,epoch:auth.epoch});
        if(!cold.ok){
            lines.push('§cCOLD AUTHORITY HOLD: '+cold.reason);
        }else{
            let ordinary=0,receiverCount=0,bankCount=0,bulkTotal=0,
                bankCapacity=0,unreadable=0,controllerCount=0;
            try{
                const seal=JSON.parse(world.getDynamicProperty(
                    'hartlogistics:uce_cold_seal_v1'));
                for(const region of seal.shards){
                    const reader=createUnifiedShardWriter({
                        world,shardKey:region.key,
                        worldId:auth.worldId,epoch:auth.epoch,
                        externalFence:()=>false
                    });
                    const v=reader.ok&&reader.inspect();
                    if(!v?.ok){unreadable++;continue;}
                    for(const account of v.snapshot.accounts){
                        if(account.kind==='receiver'){
                            receiverCount++;ordinary+=account.total;
                        }else if(account.kind==='bulk'){
                            bankCount++;bulkTotal+=account.total;
                            bankCapacity+=account.capacity;
                            if(account.role==='controller')controllerCount++;
                        }
                    }
                }
            }catch(_){unreadable++;}
            lines.push('§7Receivers: §f'+receiverCount+
                ' | Ordinary: §f'+ordinary);
            lines.push('§7Bulk: §f'+bulkTotal+'/'+bankCapacity+
                ' in '+bankCount+' members | controllers '+controllerCount);
            lines.push('§7Shard/authority: §f'+
                (unreadable===0?'verified':'HOLD '+unreadable+' unreadable'));
            lines.push('§7Q4 archive: §fretained unchanged; items migrated only by verified seal');
        }
    }
    try{
        const native=world.getDynamicProperty(
            'hartlogistics:uce_native_intent_v1');
        const boundary=world.getDynamicProperty(
            'hartlogistics:uce_boundary_intent_v1');
        const q4native=world.getDynamicProperty('hartsorter:journal_v1');
        const q4queue=world.getDynamicProperty('hartsorter:queue_journal_v1');
        lines.push('§7Pending custody: §fMR '+(native?'HOLD':'clear')+
            ' | Ordinary '+(boundary?'HOLD':'clear')+
            ' | Q4 '+(q4native||q4queue?'HOLD':'clear'));
    }catch(_){
        lines.push('§cCustody journals unreadable: global HOLD');
    }
    lines.push('§7Build: §fSOURCE ONLY; no BDS acceptance or hard-crash disk proof');
    const target=origin?.sourceEntity;
    if(target&&typeof target.sendMessage==='function'){
        for(const line of lines)target.sendMessage(line);
    }else for(const line of lines)log(line.replace(/§./g,''));
}
