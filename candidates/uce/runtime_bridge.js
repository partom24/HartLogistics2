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
// Bounded reason/owner keyed suppression. A second alternating warning must
// not reset suppression for the first (the PG39 failure mode).
const uceWarningCounts=new Map();
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
function uceBridgeLog(reason,ownerId=undefined){
    const owner=typeof ownerId==='string'&&ownerId?
        ownerId:'global';
    const key=owner+'|'+String(reason);
    const count=uceWarningCounts.get(key)||0;
    if(count<Number.MAX_SAFE_INTEGER)
        uceWarningCounts.set(key,count+1);
    // First warning always visible. Exponential summaries bound per-tick
    // noise without erasing the underlying HOLD or the affected owner.
    if(count===0 || count===16 || count===256 ||
       (count>0 && count%8192===0))
        log('[UCE unified service] '+reason+
            (ownerId?' owner='+owner:'')+
            (count?' repeated='+count:''));
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
    for(const source of pipe?.leaderId===receiver.id?
        pipe.inputs:[]){
        for(let slot=0;slot<source.container.size;slot++){
            let item;
            try{item=source.container.getItem(slot);}
            catch(_){return false;}
            if(item&&uceClassifyLiveStack(item)==='MR')return true;
        }
    }
    // Preserve the 1.4.1 Sorter->Collector input path without letting the
    // obsolete Q4 writer run. Only a loaded, winning Sorter destination is
    // eligible to move into the Receiver's existing native carrier.
    for(const source of uceSorterCollectorSources(receiver)){
        for(let slot=0;slot<source.container.size;slot++){
            let item;
            try{item=source.container.getItem(slot);}
            catch(_){return false;}
            if(item&&uceClassifyLiveStack(item)==='MR'&&
               source.eligibleSlot(slot,item))return true;
        }
    }
    return false;
}
function uceMrServiceTick(authority){
    // uceUnifiedServiceTick is the only caller. It has already validated
    // world-wide cold authority and all native/ordinary/legacy journals.
    // Each physical writer still performs its own fresh mutation fence.
    const receivers=logistics.receivers;
    if(!receivers.length)return;
    let considered=0;
    for(let step=0;step<receivers.length;step++){
        const ix=(uceMrCursor+step)%receivers.length;
        const receiver=receivers[ix];
        // A historical/unexpected registry row is not custody authority.
        // MR has no Q4 account bypass: the Receiver must be in the same
        // readback-validated sealed UCE ledger as ordinary item ownership.
        if(receiver.present===false||
           !uceOrdinaryAccountSource(authority,receiver.id))continue;
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
                uceBridgeLog(registered.reason,ownerId);
                continue;
            }
            host=registry.inspectHost({ownerId,anchor});
        }
        if(!host.ok){uceBridgeLog(host.reason,ownerId);continue;}
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
                    ? e.verify(ref):uceLiveHopperOwner(e));
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
        for(const src of pipeNetwork?.leaderId===receiver.id?
            pipeNetwork.inputs:[]){
            const p=src.block.location;
            const id='pipe-input|'+src.block.dimension.id+'|'+
                p.x+','+p.y+','+p.z;
            endpoints.set(id,{verify:()=>
                ucePipeSourceStillConnected(receiver,src)});
            sources.push({container:src.container,ownerId:id,
                locked:false,blockVerified:true});
        }
        // A Sorter column facing a linked Collector uses the SAME native
        // carrier port and receipt. Only the winner for that exact stack may
        // claim the source Hopper; other Sorter destinations retain priority.
        for(const source of uceSorterCollectorSources(receiver)){
            const p=source.block.location;
            const id='sorter-input|'+source.block.dimension.id+
                '|'+p.x+','+p.y+','+p.z;
            const selected=new Map();
            endpoints.set(id,{verify:ref=>{
                const witness=selected.get(ref.slot);
                return !!witness&&
                    uceLiveHopperOwner({d:source.block.dimension.id,
                      x:p.x,y:p.y,z:p.z})&&
                    uceSorterSourceStillValid(
                        source,ref,witness,uceClassifyLiveStack);
            }});
            sources.push({container:source.container,ownerId:id,
                locked:false,blockVerified:true,
                eligibleSlot:(slot,item)=>{
                    const chosen=source.eligibleSlot(slot,item);
                    if(chosen)selected.set(slot,item);
                    return chosen;
                }});
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
                        ucePipeDestinationStillValid(receiver,native,route,
                            route.dest.container.getItem(route.slot)!==undefined)});
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
            uceBridgeLog(result.reason,ownerId);
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
function uceUnifiedJournalHold(){
    try{
        for(const key of [
            'hartsorter:journal_v1',
            'hartsorter:queue_journal_v1',
            'hartlogistics:uce_native_intent_v1',
            'hartlogistics:uce_boundary_intent_v1'
        ]){
            const value=world.getDynamicProperty(key);
            if(value!==undefined&&value!==null&&value!==''){
                uceBridgeLog('global custody HOLD: pending '+key);
                return true;
            }
        }
    }catch(_){
        uceBridgeLog('global custody HOLD: journal unreadable');
        return true;
    }
    return false;
}
function uceUnifiedServiceTick(){
    // One cold authority and one coordinated transfer/recovery gate. No
    // global saved transaction can coexist with a new physical custody move.
    const authority=uceAuthoritySnapshot();
    if(!authority||!ready){
        if(!authority)uceBridgeLog(
            'authority not ACTIVE; original writers remain frozen');
        return;
    }
    const cold=inspectUnifiedActiveColdImport({
        world,worldId:authority.worldId,epoch:authority.epoch});
    if(!cold.ok){
        uceBridgeLog('incomplete cold authority: '+cold.reason);
        return;
    }
    if(uceUnifiedJournalHold())return;
    // The original scheduler is fenced in ACTIVE UCE. Reuse its read-only
    // source-column census in this ONE unified scheduler; no legacy writer.
    try{if(dirty)rebuildTopology();}
    catch(_){uceBridgeLog('Sorter topology reconstruction HOLD');return;}
    uceMrServiceTick(authority);
    // MR may have left an uncertain PREPARED intent in this same tick.
    // The ordinary lane must not even start until its recovery is resolved.
    if(uceUnifiedJournalHold())return;
    uceOrdinaryServiceTick(authority);
    // The same native custody journal also covers original direct Sorter
    // outputs to ordinary vanilla storage: never run them in parallel with
    // an unsettled Receiver boundary.
    if(uceUnifiedJournalHold())return;
    uceSorterDirectServiceTick(authority);
}
/**
 * Read the immutable cold seal, not an additional Receiver registry. Original
 * Q4 owners use sealed keys; new Receiver identity lives inside a presealed
 * empty shard and is rehydrated read-only after every restart.
 */
function uceSealedRegions(authority){
    try{
        const seal=JSON.parse(world.getDynamicProperty(
            'hartlogistics:uce_cold_seal_v1'));
        if(!seal||seal.worldId!==authority.worldId||
           seal.epoch!==authority.epoch||!Array.isArray(seal.shards))
            return undefined;
        return seal.shards;
    }catch(_){return undefined;}
}
function uceInspectReceiverRegion(authority,shardKey){
    const reader=createUnifiedShardWriter({
        world,shardKey,worldId:authority.worldId,epoch:authority.epoch,
        externalFence:()=>false
    });
    return reader.ok?reader.inspect():reader;
}
function uceOrdinaryAccountSource(authority,ownerId){
    const regions=uceSealedRegions(authority);
    if(!regions)return undefined;
    // Original Q4 Receivers are indexed directly by the immutable seal.
    // The global cold inspector, called before every custody service, already
    // refuses any new account duplicating their historical owner identity.
    // Avoid O(receivers * reserved-shards) JSON reads every tick.
    const source=regions.filter(s=>s.owner==='receiver:'+ownerId);
    if(source.length>1)return undefined;
    if(source.length===1)return source[0].key;
    let found=undefined;
    for(const region of regions){
        if(!region.owner.startsWith('reserve:'))continue;
        const view=uceInspectReceiverRegion(authority,region.key);
        if(!view.ok)return undefined;
        if(view.snapshot.accounts.some(a=>
           a.id==='receiver:'+ownerId&&a.kind==='receiver')){
            if(found!==undefined)return undefined;
            found=region.key;
        }
    }
    return found;
}
/**
 * Hydration is intentionally MEMORY ONLY. New Receiver rows live in their
 * existing immutable-seal ledger property; the legacy logistics_v2 registry
 * never becomes a second source of item ownership or a new Q4 queue.
 */
function uceHydrateNewReceivers(){
    const authority=uceAuthoritySnapshot();
    if(!authority)return false;
    const active=inspectUnifiedActiveColdImport({
        world,worldId:authority.worldId,epoch:authority.epoch});
    if(!active.ok){uceBridgeLog('receiver hydration HOLD '+active.reason);return false;}
    const regions=uceSealedRegions(authority);
    if(!regions)return false;
    for(const region of regions){
        if(!region.owner.startsWith('reserve:'))continue;
        const view=uceInspectReceiverRegion(authority,region.key);
        if(!view.ok)return false;
        for(const account of view.snapshot.accounts){
            if(account.kind!=='receiver')continue;
            const a=account.uceAnchor;
            if(!a)return false;
            const existing=findReceiverById(account.ownerId);
            if(existing){
                if(existing.d!==a.dimensionId||existing.x!==a.x||
                   existing.y!==a.y||existing.z!==a.z)return false;
                continue;
            }
            logistics.receivers.push({
                id:account.ownerId,d:a.dimensionId,
                x:a.x,y:a.y,z:a.z,present:true,
                queued:account.total,received:account.lifetime.received,
                delivered:account.lifetime.delivered
            });
        }
    }
    return true;
}
function uceNewReceiverIdentityUnclaimed(authority,ownerId){
    if(logistics.receivers.some(r=>r.id===ownerId))return false;
    const regions=uceSealedRegions(authority);
    if(!regions)return false;
    for(const region of regions){
        if(region.owner==='receiver:'+ownerId)return false;
        const view=uceInspectReceiverRegion(authority,region.key);
        if(!view.ok)return false;
        if(view.snapshot.accounts.some(a=>
           a.kind==='receiver'&&a.ownerId===ownerId))return false;
    }
    return true;
}
function uceRegisterNewReceiver(player,block){
    if(!block||block.typeId!==RECEIVER_ID)return;
    const authority=uceAuthoritySnapshot();
    if(!authority){
        player?.sendMessage('§c[Receiver] Authority unverified; registration HOLD.');
        return;
    }
    const proof=inspectUnifiedActiveColdImport({
        world,worldId:authority.worldId,epoch:authority.epoch});
    if(!proof.ok){
        player?.sendMessage('§c[Receiver] Custody HOLD: '+proof.reason);
        return;
    }
    const p=block.location;
    const anchor={dimensionId:block.dimension.id,x:p.x,y:p.y,z:p.z};
    const ownerId=logisticsId(anchor.dimensionId,p.x,p.y,p.z);
    if(findReceiverById(ownerId)){
        uceShowReceiverLinkedStatus(player,block);
        return;
    }
    const regions=uceSealedRegions(authority);
    if(!regions)return;
    const placement=(id,at)=>{
        try{
            if(id!==ownerId||at.dimensionId!==anchor.dimensionId||
               at.x!==anchor.x||at.y!==anchor.y||at.z!==anchor.z)
                return false;
            const b=getBlock(at.dimensionId,at.x,at.y,at.z);
            return !!b&&b.typeId===RECEIVER_ID&&
                b.dimension.id===at.dimensionId&&
                b.location.x===at.x&&b.location.y===at.y&&
                b.location.z===at.z;
        }catch(_){return false;}
    };
    for(const region of regions){
        if(!region.owner.startsWith('reserve:'))continue;
        const writer=createUnifiedShardWriter({
            world,shardKey:region.key,
            worldId:authority.worldId,epoch:authority.epoch,
            externalFence:()=>uceLegacyWriterBlocked()&&
                !!uceAuthoritySnapshot(),
            verifyReceiverReserveShard:key=>{
                const latest=uceSealedRegions(authority);
                return !!latest&&latest.filter(s=>
                    s.key===key&&s.owner===region.owner).length===1;
            },
            verifyReceiverPlacement:placement,
            verifyGlobalReceiverUniqueness:id=>
                uceNewReceiverIdentityUnclaimed(authority,id)
        });
        if(!writer.ok)continue;
        const view=writer.inspect();
        if(!view.ok||view.snapshot.accounts.length!==0)continue;
        const operationId=uceNativeReceiptId();
        if(!operationId)return;
        const saved=writer.registerNewReceiver({ownerId,anchor,
            operationId,expectedEpoch:authority.epoch,
            expectedRevision:view.snapshot.revision});
        if(!saved.ok){
            player?.sendMessage('§c[Receiver] Registration HOLD: '+saved.reason);
            return;
        }
        if(!uceHydrateNewReceivers()){
            player?.sendMessage('§c[Receiver] Registered on disk, but in-memory refresh HOLD; restart for reconciliation.');
            return;
        }
        player?.sendMessage('§a[Receiver] Registered in unified custody; no legacy Q4 queue created.');
        uceShowReceiverLinkedStatus(player,block);
        return;
    }
    player?.sendMessage('§c[Receiver] No sealed empty Receiver slots available; registration HOLD.');
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
/**
 * PG36: only a zero-Q4 cold-activated NEW world may bootstrap the missing
 * original link registry. New Receiver identities already live in sealed
 * reserved shards; the old registry must still have no historical owner.
 * This proof is evaluated before read-only inspect AND immediately before
 * the ONE link commit; it cannot synthesize or overwrite a Q4 registry.
 */
function uceEmptyLinkRegistryBootProof(authority){
    try{
        if(!authority)return false;
        const cold=inspectUnifiedActiveColdImport({world,
            worldId:authority.worldId,epoch:authority.epoch});
        if(!cold.ok||cold.currentLedgerTotal!==0)return false;
        const seal=JSON.parse(world.getDynamicProperty(
            'hartlogistics:uce_cold_seal_v1'));
        if(!seal||seal.worldId!==authority.worldId||
           seal.epoch!==authority.epoch||
           seal.receivers!==0||seal.initialItemCount!==0||
           !Array.isArray(seal.q4Sources)||seal.q4Sources.length!==0||
           !Array.isArray(seal.shards)||seal.shards.length!==32||
           seal.shards.some(s=>!s.owner?.startsWith('reserve:')||
               s.initialCount!==0))
            return false;
        // Undefined means never initialized. An empty string, null or
        // malformed saved registry is an ambiguity and must remain HOLD.
        if(world.getDynamicProperty(LOGISTICS_KEY)!==undefined)return false;
        const keys=world.getDynamicPropertyIds();
        return Array.isArray(keys)&&keys.length<=200000&&
          !keys.some(k=>typeof k!=='string'||
            k==='hartsorter:logistics_v1'||
            k===LOGISTICS_KEY||
            k==='hartsorter:journal_v1'||
            k.startsWith('hartsorter:queue_journal')||
            k.startsWith('hartsorter:q2')||
            k.startsWith('hartsorter:q3')||
            k.startsWith('hartsorter:q4'));
    }catch(_){return false;}
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
        verifySealedReceiver:receiverVerified,
        verifyEmptyNewWorld:()=>uceEmptyLinkRegistryBootProof(authority)
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
        if(!uceHydrateNewReceivers())throw new Error('new Receiver hydration HOLD');
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
    if(!route||route.leaderId!==receiver.id||
       !Array.isArray(route.banks))return false;
    const matching=route.banks.filter(b=>uceBulkOwnerId(b)===ownerId);
    if(matching.length!==1)return false;
    const registered=logistics.receivers.filter(r=>
        r.id!==receiver.id&&r.present!==false);
    for(const other of registered){
        const competitor=ucePipeRouteNetwork(other);
        if(competitor?.banks?.some(b=>uceBulkOwnerId(b)===ownerId)&&
           (competitor.leaderId!==route.leaderId||
            competitor.fingerprint!==route.fingerprint))
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
                // Controllers are per verified network, not global singleton.
                // The same physical bank still cannot join two shards.
                if(member.ownerId===ownerId)return false;
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
    if(!network?.banks?.length||
       network.leaderId!==receiver.id)return false;
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
function uceOrdinaryServiceTick(authority){
    // This lane shares the MR lane's global preflight. Every later ledger
    // credit/debit and native move rechecks its own mutation fence.
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
            for(const input of pipe?.leaderId===receiver.id?
                pipe.inputs:[]){
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
        // Sorter->Collector uses the same one physical escrow/ordinary
        // ledger credit path as a direct Collector Hopper or pipe source.
        // Storage sorters retain priority even when their separate direct
        // native output executor is not yet enabled.
        if(!sourceRecord){
            for(const source of uceSorterCollectorSources(receiver)){
                for(let i=0;i<source.container.size;i++){
                    let item;
                    try{item=source.container.getItem(i);}
                    catch(_){continue;}
                    const key=ucePlainItemIdentity(item);
                    if(!key||!source.eligibleSlot(i,item))continue;
                    sourceRecord=source;
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
        let host;
        const shardWriter=createUnifiedShardWriter({
            world,shardKey,worldId:authority.worldId,epoch:authority.epoch,
            externalFence:()=>uceLegacyWriterBlocked()&&
                !!uceAuthoritySnapshot(),
            verifyInternalRoute:tx=>{
                const graph=ucePipeRouteNetwork(receiver);
                if(!graph||graph.leaderId!==receiver.id||
                   !Array.isArray(graph.banks))return false;
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
        let preferredOutputReady=false;
        if(bankNetwork?.banks?.length&&
           bankNetwork.leaderId===receiver.id){
            const members=[...new Set(bankNetwork.banks
                .map(b=>uceBulkOwnerId(b)))].sort();
            const outputKeys=[],preferredKeys=[];
            if(!blockIsRedstonePowered(receiverAt(receiver))){
                const canDeliver=(key)=>{
                    try{
                        const def=JSON.parse(key);
                        const item=new ItemStack(def.typeId,1);
                        if(uceClassifyLiveStack(item)!=='ORDINARY')
                            return false;
                        return !!outgoing||
                            (!output&&!!uceChoosePipeDestination(
                                receiver,item,true));
                    }catch(_){return false;}
                };
                // Only Filter/seeded Auto (or the preserved native Hopper)
                // outranks governed Bulk. Wildcard is never a Bulk bypass.
                for(const entry of account.buckets)
                    if(canDeliver(entry.key))preferredKeys.push(entry.key);
                if(!sourceRecord&&account.total===0){
                    for(const bank of ledger.snapshot.accounts){
                        if(bank.kind!=='bulk'||
                           !members.includes(bank.ownerId))continue;
                        for(const entry of bank.buckets)
                            if(canDeliver(entry.key))outputKeys.push(entry.key);
                    }
                }
            }
            preferredOutputReady=preferredKeys.length>0;
            const plan=planUnifiedBulkService({
                snapshot:ledger.snapshot,receiverOwnerId:ownerId,
                connectedBankOwnerIds:members,
                sourceWaiting:!!sourceRecord,
                preferredOutputKeys:preferredKeys,
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

        // Initialize an empty native host only for actual eligible work.
        // Mere presence of an output Hopper or pipe is NOT a transfer.
        host=registry.inspectHost({ownerId,anchor});
        if(!host.ok&&host.reason==='carrier_record_missing'){
            let canDeposit=false,canWithdraw=false;
            try{
                const source=sourceRecord?.container?.getItem(sourceSlot);
                canDeposit=!!source&&!preferredOutputReady&&
                    account.total+source.amount<=account.capacity;
                if(account.total>0&&!blockIsRedstonePowered(receiverAt(receiver))){
                    for(const entry of account.buckets){
                        const itemDef=JSON.parse(entry.key);
                        const item=new ItemStack(itemDef.typeId,1);
                        if(uceClassifyLiveStack(item)!=='ORDINARY')continue;
                        if(outgoing){
                            canWithdraw=uceNativeOutputSlot(outgoing.container)>=0;
                        }else if(!output){
                            canWithdraw=!!uceChoosePipeDestination(
                                receiver,item,
                                !!bankNetwork?.banks?.length&&
                                bankNetwork.leaderId===receiver.id);
                        }
                        if(canWithdraw)break;
                    }
                }
            }catch(_){
                // Unknown route/item identity remains unadmitted; do not
                // reserve a native entity for an unprovable transfer.
            }
            if(!canDeposit&&!canWithdraw)continue;
            const created=registry.registerEmptyHost({ownerId,anchor});
            if(!created.ok){
                uceBridgeLog(created.reason,ownerId);
                continue;
            }
            host=registry.inspectHost({ownerId,anchor});
        }
        if(!host.ok){
            uceBridgeLog(host.reason,ownerId);
            continue;
        }
        const custody=registry.inspectCustody({ownerId,anchor});
        if(!custody.ok){
            uceBridgeLog(custody.reason,ownerId);
            continue;
        }
        if(custody.free<1)continue;
        const slot=uceNativeOutputSlot(host.container);
        if(slot<0)continue;
        let direction,physicalSlot,identityKey,amount,routeVerify;
        const origin=sourceRecord?.block;
        if(sourceRecord&&account.total<account.capacity&&
           !preferredOutputReady){
            const stack=sourceRecord.container.getItem(sourceSlot);
            if(!stack)continue;
            // Snapshot for route-proof ACK after native move empties source.
            // The native port separately verifies exact ItemStack identity.
            const sorterWitness=sourceRecord.kind==='sorter-collector'?
                stack:undefined;
            direction='deposit';identityKey=sourceKey;amount=stack.amount;
            const p=origin.location;
            const endpointId='input|'+origin.dimension.id+
                '|'+p.x+','+p.y+','+p.z;
            physicalSlot={ownerId:endpointId,
                container:sourceRecord.container,slot:sourceSlot};
            routeVerify=()=>{
                if(sourceRecord.kind==='pipe')
                    return ucePipeSourceStillConnected(receiver,sourceRecord);
                if(sourceRecord.kind==='sorter-collector')
                    return !!sorterWitness&&
                        uceLiveHopperOwner({d:origin.dimension.id,
                            x:p.x,y:p.y,z:p.z})&&
                        sourceRecord.stillSelected(sorterWitness);
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
                        uceChoosePipeDestination(receiver,item,
                            !!bankNetwork?.banks?.length&&
                            bankNetwork.leaderId===receiver.id);
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
                        receiver,selectedItem,selectedRoute,
                        selectedRoute.dest.container.getItem(
                            selectedRoute.slot)!==undefined);
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
            const receiverOwners=[],seenReceiverOwners=new Set();
            let duplicateReceiverOwners=0,invalidReceiverOwners=0;
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
                            // Read-only ledger census. A count alone cannot
                            // distinguish extra physical placements from
                            // ambiguous duplicate Receiver ownership.
                            const id=account.ownerId,at=account.uceAnchor;
                            if(typeof id!=='string'||!id||
                               typeof account.total!=='number'||
                               !Number.isSafeInteger(account.total)||
                               !at||typeof at.dimensionId!=='string'||
                               !Number.isInteger(at.x)||
                               !Number.isInteger(at.y)||
                               !Number.isInteger(at.z)||
                               id!==at.dimensionId+'|'+at.x+'|'+at.y+'|'+at.z)
                                invalidReceiverOwners++;
                            else{
                                if(seenReceiverOwners.has(id))
                                    duplicateReceiverOwners++;
                                else seenReceiverOwners.add(id);
                                receiverOwners.push({id,total:account.total,
                                    shardKey:region.key,anchor:at});
                            }
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
            // Never guess the two unaccounted PG36 owners. Report their
            // exact sealed IDs, in a deterministic bounded view; read only.
            receiverOwners.sort((a,b)=>a.id.localeCompare(b.id));
            const maxOwners=12;
            lines.push('§7Sealed Receiver owners (read-only): §f'+
                receiverOwners.length+' listed'+
                (receiverOwners.length>maxOwners?
                    ', first '+maxOwners+' shown':''));
            for(const a of receiverOwners.slice(0,maxOwners))
                lines.push('§7R §f'+a.id+' §7stored '+a.total+
                    ' §8['+a.shardKey+']');
            if(invalidReceiverOwners||duplicateReceiverOwners)
                lines.push('§cReceiver owner census HOLD: invalid '+
                    invalidReceiverOwners+' | duplicate '+duplicateReceiverOwners);
            // The global MR journal can be clear while a host is RESERVED.
            // Read live entities and tickets, without initializing anything.
            if(typeof createUnifiedCarrierRegistry==='function'){
                const registry=createUnifiedCarrierRegistry({world,
                    worldId:auth.worldId,epoch:auth.epoch,
                    externalFence:()=>false,ownerVerifier:uceLiveReceiverOwner});
                if(!registry.ok){
                    lines.push('§cNative host census unavailable: '+registry.reason);
                }else{
                    let held=0,reserved=0,missing=0,active=0;
                    const maxHosts=8;
                    for(const a of receiverOwners.slice(0,maxHosts)){
                        const audit=registry.inspectHostEvidence({
                            ownerId:a.id,anchor:a.anchor});
                        if(!audit.ok){
                            held++;
                            lines.push('§cCarrier §f'+a.id+' §cHOLD '+audit.reason);
                            continue;
                        }
                        if(audit.recordState==='RESERVED')reserved++;
                        else if(audit.recordState==='ACTIVE')active++;
                        else missing++;
                        if(audit.custodyState.startsWith('HOLD:'))held++;
                        lines.push('§7Carrier §f'+a.id+' §7state '+
                            audit.recordState+' | saved ID '+
                            (audit.recordEntityId||'none')+
                            ' | physical '+audit.liveEntityCount+
                            ' | others≤16 '+(audit.vicinityCount??'UNKNOWN')+
                            ' | tickets '+(audit.ticketSlotCount??'UNKNOWN')+
                            '@'+(audit.ticketRevision??'UNKNOWN')+
                            ' '+(audit.ticketStatus||'UNVERIFIED')+
                            ' | intent '+audit.nativeIntentPhase+
                            ' | block '+(audit.ownerVerified?'present':'UNVERIFIED')+
                            ' | '+audit.custodyState);
                        for(const observed of audit.entities.slice(0,2))
                            lines.push('§7  Entity §f'+observed.id+
                                ' §7occupied '+observed.occupied+
                                ' | '+observed.inventoryStatus);
                        for(const other of (audit.vicinityEntities||[]).slice(0,2))
                            lines.push('§7  Other loaded carrier (unattributed) §f'+other.id);
                    }
                    lines.push('§7Native hosts (read-only, first '+maxHosts+
                        '): §factive '+active+' | RESERVED '+reserved+
                        ' | missing '+missing+' | HOLD '+held);
                }
            }
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

// Read-only LAB migration census, never a live Q4->UCE writer. Displaying
// an ordinary count does not certify actual ItemStack roundtrip or backup.
function uceSendMigrationPreview(origin){
    const result=previewUnifiedMigrationPreflight({world});
    const lines=['§6[Hart Logistics] §fArchived Q4 migration preflight'];
    if(!result.ok)
        lines.push('§cHOLD: '+result.reason);
    else
        lines.push('§aQ4 source census observed (read only).');
    if(Number.isSafeInteger(result.receiverCount)){
        lines.push('§7Receivers: §f'+result.receiverCount+
            ' | Q4 items: §f'+result.q4ItemCount);
        lines.push('§7Ordinary shape: §f'+
            result.ordinaryShapeCandidateCount+
            ' | Metadata-rich/unknown: §f'+
            result.metadataRichOrUnknownCount);
        if(result.opaqueReasons?.length)
            lines.push('§eOpaque item reasons: '+
                result.opaqueReasons.join(', '));
    }
    lines.push('§7NOT a freeze, backup proof, native item proof, migration, or release.');
    lines.push('§7No items, Q4 properties or authority were changed.');
    const target=origin?.sourceEntity;
    if(target&&typeof target.sendMessage==='function'){
        for(const line of lines)target.sendMessage(line);
    }else for(const line of lines)log(line.replace(/§./g,''));
}

/*
 * Direct Hopper->Sorter->vanilla storage, using UCE's existing native
 * physical movement journal (NOT the old 1.4.1 safeMovePartial writer).
 * Storage is the native inventory owner; no synthetic Receiver queue,
 * separate bank balance or second scheduler is introduced.
 *
 * This deliberately moves WHOLE stacks into EMPTY slots only. It will HOLD
 * when partial merge or chest alias identity is uncertain; the full 1.4.1
 * merge/throughput compatibility gate is still pending Bedrock acceptance.
 * A persisted PREPARED intent is never auto-cleared or replayed on restart.
 */
let uceSorterDirectCursor=0;
function uceDirectStorageOwnerBlock(block){
    try{
        if(!block||!supportedStorage(block))return false;
        if(block.typeId==='minecraft:chest'){
            // Two block aliases can expose the same double-chest inventory.
            // Do not infer whole-stack ownership through an unproven alias.
            for(const face of PG26_FACES){
                if(face.y!==0)continue;
                const neighbor=pg26Neighbor(block,face);
                if(!neighbor||neighbor.typeId==='minecraft:chest')
                    return false;
            }
        }
        return blockContainer(block)?.isValid===true;
    }catch(_){return false;}
}
function uceSorterDirectServiceTick(authority){
    try{
        if(!Array.isArray(columns)||!columns.length)return;
        for(let step=0;step<columns.length;step++){
            const ix=(uceSorterDirectCursor+step)%columns.length;
            const col=columns[ix],dim=getDimension(col.d);
            const source=dim?.getBlock(col.source);
            if(!source||source.typeId!=='minecraft:hopper'||
               hopperIsRedstoneLocked(source))continue;
            const input=blockContainer(source);
            if(!input||!input.isValid)continue;
            for(let slot=0;slot<input.size;slot++){
                const stack=input.getItem(slot);
                if(!stack)continue;
                const selected=uceSorterColumnWinner(col,stack);
                if(!selected||selected.kind!=='storage'||
                   !uceDirectStorageOwnerBlock(selected.block))continue;
                const dest=selected.container;
                if(!dest?.isValid||dest===input)continue;
                // Preserve 1.4.1 ordinary stack merges without ever
                // reconstructing opaque/MR ItemStacks. MR still uses the
                // strict whole-stack native move to an empty slot.
                const ordinaryKey=ucePlainItemIdentity(stack);
                const accepting=ordinaryKey?findAcceptSlot(dest,stack):undefined;
                const partial=!!accepting&&accepting.before>0&&
                    accepting.room>0&&
                    ucePlainItemIdentity(accepting.existing)===ordinaryKey;
                const destSlot=partial?accepting.slot:uceNativeOutputSlot(dest);
                if(destSlot<0)continue;
                const mergeCount=partial?
                    Math.min(stack.amount,accepting.room):0;
                const p=source.location,q=selected.block.location;
                const fromId='sorter-native-in|'+source.dimension.id+
                    '|'+p.x+','+p.y+','+p.z;
                const toId='sorter-native-out|'+selected.block.dimension.id+
                    '|'+q.x+','+q.y+','+q.z;
                // Slot/winner revalidation must not depend on source occupancy
                // AFTER a successful move, because ACK sees that slot empty.
                const routeStillSelected=item=>{
                    const occupied=dest.getItem(destSlot)!==undefined;
                    const current=uceSorterColumnWinner(
                        col,item,occupied?selected:undefined);
                    return !!current&&current.kind==='storage'&&
                        current.entry===selected.entry&&
                        uceSameLoadedBlock(current.source.block,source)&&
                        uceSameLoadedBlock(current.block,selected.block)&&
                        uceDirectStorageOwnerBlock(current.block);
                };
                const endpointValid=ref=>{
                    if(ref.ownerId===fromId){
                        if(ref.container!==input||ref.slot!==slot||
                           !uceLiveHopperOwner({d:source.dimension.id,
                             x:p.x,y:p.y,z:p.z}))return false;
                        const now=input.getItem(slot);
                        return routeStillSelected(now||stack);
                    }
                    if(ref.ownerId===toId){
                        if(ref.container!==dest||ref.slot!==destSlot)
                            return false;
                        const live=getBlock(selected.block.dimension.id,
                            q.x,q.y,q.z);
                        return uceSameLoadedBlock(live,selected.block)&&
                            uceDirectStorageOwnerBlock(live)&&
                            routeStillSelected(stack);
                    }
                    return false;
                };
                const operationId=uceNativeReceiptId();
                if(!operationId){uceBridgeLog('direct sorter receipt exhausted');return;}
                const port=createUnifiedNativePort({
                    world,worldId:authority.worldId,epoch:authority.epoch,
                    externalFence:()=>uceLegacyWriterBlocked()&&
                        !!uceAuthoritySnapshot(),
                    verifyEndpointOwner:endpointValid,
                    // A loaded, stable vanilla inventory is the destination
                    // owner, not a UCE count account. This is independent
                    // native block identity corroborating the saved intent.
                    // It is NOT a hard-crash disk-atomicity proof.
                    durableOwnershipWitness:j=>
                        j.operationId===operationId&&
                        j.from.ownerId===fromId&&j.to.ownerId===toId&&
                        routeStillSelected(stack),
                    certifyOrdinaryEscrow:(item,key,count)=>
                        !!item&&item.amount===count&&
                        ucePlainItemIdentity(item)===key&&
                        uceClassifyLiveStack(item)==='ORDINARY'
                });
                if(!port.ok){uceBridgeLog('direct sorter port '+port.reason);return;}
                const from={ownerId:fromId,container:input,slot};
                const to={ownerId:toId,container:dest,slot:destSlot};
                const moved=partial?
                    port.moveCertifiedPartial({operationId,from,to,
                        key:ordinaryKey,count:mergeCount}):
                    port.moveWhole({operationId,from,to});
                if(!moved.ok){
                    uceBridgeLog('direct sorter move HOLD '+moved.reason);
                    return;
                }
                if(moved.status!=='NATIVE_MOVED_PENDING_OWNERSHIP_ACK'){
                    uceBridgeLog('direct sorter unexpected move receipt');return;
                }
                const ack=partial?
                    port.ackCertifiedPartial({operationId,from,to,
                        key:ordinaryKey,count:mergeCount}):
                    port.ackWhole({operationId,from,to});
                if(!ack.ok){
                    uceBridgeLog('direct sorter ACK HOLD '+ack.reason);
                    return;
                }
                uceSorterDirectCursor=(ix+1)%columns.length;
                return;
            }
        }
        uceSorterDirectCursor=(uceSorterDirectCursor+1)%columns.length;
    }catch(_){uceBridgeLog('direct sorter runtime HOLD');}
}

/*
 * Original Dropper/Dispenser item ejection into an existing Collector,
 * without re-enabling the old Q4 entity_enqueue writer. Uses ONE existing
 * UCE native intent and carrier-ticket writer. Native ItemStack is copied
 * without metadata reconstruction, then the exact source entity is removed
 * only AFTER destination custody is saved/read back.
 *
 * Interrupted duplication ambiguity remains globally HELD for audit.
 */
function uceProcessEjectedItemEntity(entity,retries=0,spawnLoc=undefined){
    if(!ready||!entity?.isValid||entity.typeId!=='minecraft:item')return;
    const authority=uceAuthoritySnapshot();
    if(!authority)return;
    const cold=inspectUnifiedActiveColdImport({
        world,worldId:authority.worldId,epoch:authority.epoch});
    if(!cold.ok){
        uceBridgeLog('ejected-item cold authority HOLD '+cold.reason);
        return;
    }
    if(uceUnifiedJournalHold())return;
    const found=ejectedItemCollector(entity,spawnLoc);
    if(!found){
        // Retry observation only, never retry a custody write. Vanilla can
        // publish a dropped entity before its triggered_bit becomes visible.
        if(retries<4)
            system.runTimeout(()=>
              uceProcessEjectedItemEntity(entity,retries+1,spawnLoc),1);
        return;
    }
    const receiver=findReceiverById(found.collector.link);
    if(!receiver||receiver.present===false||!receiverAt(receiver)||
       !uceOrdinaryAccountSource(authority,receiver.id))return;
    const stack=itemEntityStack(entity);
    if(!stack||stack.amount<1)return;
    const ownerId=receiver.id,anchor={dimensionId:receiver.d,
        x:receiver.x,y:receiver.y,z:receiver.z};
    const registry=createUnifiedCarrierRegistry({
        world,worldId:authority.worldId,epoch:authority.epoch,
        externalFence:()=>uceLegacyWriterBlocked()&&
            !!uceAuthoritySnapshot(),
        ownerVerifier:uceLiveReceiverOwner
    });
    if(!registry.ok){uceBridgeLog('ejected registry '+registry.reason);return;}
    let host=registry.inspectHost({ownerId,anchor});
    if(!host.ok&&host.reason==='carrier_record_missing'){
        const created=registry.registerEmptyHost({ownerId,anchor});
        if(!created.ok){uceBridgeLog('ejected host '+created.reason);return;}
        host=registry.inspectHost({ownerId,anchor});
    }
    if(!host.ok){uceBridgeLog('ejected host '+host.reason);return;}
    const custody=registry.inspectCustody({ownerId,anchor});
    if(!custody.ok){uceBridgeLog('ejected ticket '+custody.reason);return;}
    if(custody.free<=0)return; // Preserve the original vanilla item.
    const slot=uceNativeOutputSlot(host.container);
    if(slot<0)return;
    const sourceOwnerId='ejected-item|'+entity.id;
    const to={ownerId,container:host.container,slot};
    const verifyEndpointOwner=ref=>{
        if(ref.ownerId===ownerId)
            return uceLiveReceiverOwner(ownerId,anchor)&&
                registry.inspectHost({ownerId,anchor}).ok;
        if(ref.ownerId!==sourceOwnerId||ref.entity!==entity||
           !entity.isValid||entity.typeId!=='minecraft:item')
            return false;
        const current=ejectedItemCollector(entity,spawnLoc);
        return !!current&&
            current.collector.id===found.collector.id&&
            uceSameLoadedBlock(current.source,found.source)&&
            current.collector.link===ownerId;
    };
    const op=uceNativeReceiptId();
    if(!op){uceBridgeLog('ejected native receipt exhausted');return;}
    const port=createUnifiedNativePort({
        world,worldId:authority.worldId,epoch:authority.epoch,
        externalFence:()=>uceLegacyWriterBlocked()&&
            !!uceAuthoritySnapshot(),
        verifyEndpointOwner,
        durableOwnershipWitness:registry.durableOwnershipWitness
    });
    if(!port.ok){uceBridgeLog('ejected native port '+port.reason);return;}
    const staged=port.stageEjectedItem({
        operationId:op,entity,sourceOwnerId,to});
    if(!staged.ok){
        uceBridgeLog('ejected item stage HOLD '+staged.reason);
        return;
    }
    const ticket=registry.stageMovedTicket({ownerId,anchor});
    if(!ticket.ok){
        uceBridgeLog('ejected item ticket HOLD '+ticket.reason);
        return;
    }
    const ack=port.ackEjectedItem({
        operationId:op,entity,sourceOwnerId,to});
    if(!ack.ok)uceBridgeLog('ejected item ACK HOLD '+ack.reason);
}

/*
 * Explicit empty-LAB-world bootstrap to enable BDS integration acceptance
 * WITHOUT endangering the archived 1.4.1 baseline. Any Q4 history, legacy
 * Collector/Receiver, journal or preexisting UCE authority refuses before
 * writing. No archived-world migration is performed or approved here.
 */
function uceActivateEmptyLabWorld(origin){
    const entity=origin?.sourceEntity;
    const say=message=>{
        if(entity&&typeof entity.sendMessage==='function')
            entity.sendMessage(message);
        else log(message.replace(/§./g,''));
    };
    if(!ready){
        say('§c[UCE] Startup incomplete; empty-LAB activation HOLD.');
        return;
    }
    const receipt=uceNativeReceiptId();
    if(!receipt){
        say('§c[UCE] No safe world ID available; HOLD.');
        return;
    }
    const worldId='minecraft:overworld:uce-empty-'+receipt;
    const result=activateUnifiedEmptyWorld({
        world,logistics,worldId,epoch:1,
        operatorAuthorized:true,
        actualWorldFence:()=>uceLegacyWriterBlocked()
    });
    if(!result.ok){
        say('§c[UCE] Empty-LAB activation HOLD: '+result.reason);
        return;
    }
    const checked=inspectUnifiedActiveColdImport({
        world,worldId:result.worldId,epoch:result.epoch});
    if(!checked.ok||!uceHydrateNewReceivers()){
        say('§c[UCE] Readback/refresh ambiguous. Preserve LAB world; no automatic retry.');
        return;
    }
    say('§a[UCE] EMPTY LAB world activated with '+result.shardCount+
        ' sealed new-Receiver reservations. No Q4 items were moved.');
    say('§7SOURCE CANDIDATE ONLY: BDS gameplay acceptance and release approval still required.');
}
