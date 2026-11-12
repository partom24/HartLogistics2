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
        if(stack.maxAmount!==64 || stack.nameTag ||
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
    return false;
}
function uceMrServiceTick(){
    const authority=uceAuthoritySnapshot();
    if(!authority){
        uceBridgeLog('authority not ACTIVE; original writers remain frozen');
        return;
    }
    if(!ready)return;
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
                return !!e&&uceLiveHopperOwner(e);
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
        const output=receiverOutputHopper(receiver);
        const outputNative=output && !output.locked ?
          {ownerId:hopperOwner(output.block,'output'),
           container:output.container,blockVerified:true,locked:false}:
          undefined;
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
